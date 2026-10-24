import os
import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

# Tests use synthetic credentials, never local deployment secrets. Explicit
# Settings(_secrets_dir=...) tests still exercise secret-file loading.
os.environ["SECRET_KEY"] = "synthetic-test-signing-key-not-for-production"
os.environ["CREDENTIALS_DIRECTORY"] = ""

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.dialects.postgresql import UUID  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker  # noqa: E402

from app.core.database import Base, get_async_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.passkey import UserPasskey  # noqa: E402,F401
from app.models.app_settings import AppSetting  # noqa: E402,F401
from app.models.stored_file import StoredFileRecord  # noqa: E402
from app.models.workspace import Workspace, WorkspaceMember  # noqa: E402,F401

# In-memory SQLite keeps tests independent of external databases and other
# workers. StaticPool shares the connection across fixtures and tests on the
# session-scoped event loop so they see the same schema state.
from sqlalchemy.pool import StaticPool  # noqa: E402

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# SQLite gives the PostgreSQL UUID type numeric affinity, corrupting UUID hex
# that looks like a number. Keep its normal bind/result handling but store text;
# the dialect-specific hook leaves PostgreSQL's native UUID DDL unchanged.
@compiles(UUID, "sqlite")
def _compile_sqlite_uuid(type_, compiler, **kw):
    return "CHAR(32)"


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def setup_database():
    """Create all tables once for the test session."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional test session that rolls back after each test."""
    async with TestSessionLocal() as session:
        yield session
        # Roll back any uncommitted changes
        await session.rollback()


@pytest_asyncio.fixture
async def postgres_sessions():
    """Give each PostgreSQL test its own schema, including under xdist."""
    url = os.environ.get("POSTGRES_TEST_URL")
    if not url:
        if os.environ.get("CI"):
            pytest.fail("CI must supply POSTGRES_TEST_URL for PostgreSQL tests")
        pytest.skip("isolated PostgreSQL not configured")
    schema = f"postgres_test_{uuid.uuid4().hex}"
    pg_engine = create_async_engine(url)
    scoped = pg_engine.execution_options(schema_translate_map={None: schema})
    try:
        async with pg_engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        async with scoped.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield async_sessionmaker(scoped, expire_on_commit=False)
    finally:
        try:
            async with pg_engine.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        finally:
            await pg_engine.dispose()


@pytest_asyncio.fixture
async def clean_db(session: AsyncSession):
    """Clean all data between tests."""
    import aiosqlite

    assert not (session.new or session.dirty or session.deleted), (
        "clean_db requires a fresh session without pending ORM changes"
    )
    # Batch the same deletes into one driver round trip. An explicit BEGIN keeps
    # cleanup atomic: executescript otherwise runs each delete in autocommit.
    statements = ";\n".join(
        str(table.delete().compile(dialect=engine.dialect))
        for table in reversed(Base.metadata.sorted_tables)
    )
    connection = await session.connection()
    raw = await connection.get_raw_connection()
    driver = raw.driver_connection
    assert isinstance(driver, aiosqlite.Connection)
    # executescript implicitly commits an existing SQLite transaction. Fail
    # before touching data if a caller violates this fixture's fresh-session contract.
    assert not driver.in_transaction, "clean_db requires a fresh session without a transaction"
    async with driver.executescript("BEGIN;\n" + statements):
        pass
    await session.commit()


@pytest.fixture(scope="session", autouse=True)
def _fast_password_hashes():
    """Exercise real password hashing, verification and upgrades at test-only costs."""
    import bcrypt
    from pwdlib.hashers.argon2 import Argon2Hasher

    gensalt = bcrypt.gensalt

    def _test_gensalt(*args, **kwargs):
        if args or kwargs:
            return gensalt(*args, **kwargs)
        return gensalt(rounds=4)

    def _test_argon2_hasher(*args, **kwargs):
        # Explicit constructor calls retain all production parameter defaults.
        if args or kwargs:
            return Argon2Hasher(*args, **kwargs)
        return Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1)

    with patch("bcrypt.gensalt", _test_gensalt), \
         patch("fastapi_users.password.Argon2Hasher", _test_argon2_hasher):
        yield


async def override_get_async_session() -> AsyncGenerator[AsyncSession, None]:
    from app.core.app_clock import use_timezone

    async with TestSessionLocal() as session:
        async with use_timezone(session):
            yield session


# Override the dependency
app.dependency_overrides[get_async_session] = override_get_async_session


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Provide an async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def oidc_only_settings():
    """Enable a complete OIDC-only policy and restore only changed keys."""
    from app.core.config import get_settings

    settings = get_settings()
    previous = {
        "oidc_enabled": settings.oidc_enabled,
        "oidc_discovery_url": settings.oidc_discovery_url,
        "oidc_client_id": settings.oidc_client_id,
        "local_auth_enabled": settings.local_auth_enabled,
    }
    settings.oidc_enabled = True
    settings.oidc_discovery_url = "https://id.example.com/.well-known/openid-configuration"
    settings.oidc_client_id = "launchkit"
    settings.local_auth_enabled = False
    yield settings
    for key, value in previous.items():
        setattr(settings, key, value)


@pytest_asyncio.fixture
async def test_user(session: AsyncSession, clean_db) -> User:
    """Create a test user with an auto-created Personal workspace."""
    import bcrypt as _bcrypt

    hashed = _bcrypt.hashpw(b"testpass123", _bcrypt.gensalt()).decode()
    user = User(
        id=uuid.uuid4(),
        email="test@example.com",
        hashed_password=hashed,
        is_active=True,
        is_superuser=False,
        is_verified=True,
        preferences={
            "language": "pt-BR",
            "date_format": "DD/MM/YYYY",
            "timezone": "America/Sao_Paulo",
        },
    )
    session.add(user)
    await session.flush()

    workspace = Workspace(
        id=uuid.uuid4(),
        name="Pessoal",
        created_by_user_id=user.id,
        locale="pt-BR",
    )
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(
            id=uuid.uuid4(),
            workspace_id=workspace.id,
            user_id=user.id,
            role="owner",
        )
    )
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_workspace(session: AsyncSession, test_user: User) -> Workspace:
    """Return the test user's default workspace (created by `test_user`)."""
    from sqlalchemy import select as _select
    result = await session.execute(
        _select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == test_user.id)
        .limit(1)
    )
    ws = result.scalar_one()
    return ws


@pytest_asyncio.fixture
async def test_files(
    session: AsyncSession, test_user: User, test_workspace: Workspace
) -> list[StoredFileRecord]:
    """A few file metadata rows in the test workspace (no bytes in storage)."""
    files = [
        StoredFileRecord(
            id=uuid.uuid4(),
            workspace_id=test_workspace.id,
            uploaded_by_user_id=test_user.id,
            filename=f"file-{i}.pdf",
            storage_key=f"{test_workspace.id}/fixture_{i}.pdf",
            content_type="application/pdf",
            size=1024 * (i + 1),
        )
        for i in range(3)
    ]
    session.add_all(files)
    await session.commit()
    return files


@pytest_asyncio.fixture
async def auth_token(client: AsyncClient, test_user: User) -> str:
    """Get an auth token for the test user."""
    response = await client.post(
        "/api/auth/login",
        data={"username": "test@example.com", "password": "testpass123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def auth_headers(auth_token: str) -> dict:
    """Auth headers for authenticated requests."""
    return {"Authorization": f"Bearer {auth_token}"}


@pytest_asyncio.fixture
async def test_superuser(session: AsyncSession, clean_db) -> User:
    """Create a test superuser (admin)."""
    import bcrypt as _bcrypt

    hashed = _bcrypt.hashpw(b"adminpass123", _bcrypt.gensalt()).decode()
    user = User(
        id=uuid.uuid4(),
        email="admin@example.com",
        hashed_password=hashed,
        is_active=True,
        is_superuser=True,
        is_verified=True,
        preferences={
            "language": "en",
            "date_format": "MM/DD/YYYY",
            "timezone": "UTC",
        },
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_auth_token(client: AsyncClient, test_superuser: User) -> str:
    """Get an auth token for the superuser."""
    response = await client.post(
        "/api/auth/login",
        data={"username": "admin@example.com", "password": "adminpass123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def admin_auth_headers(admin_auth_token: str) -> dict:
    """Auth headers for admin requests."""
    return {"Authorization": f"Bearer {admin_auth_token}"}


@pytest_asyncio.fixture
async def viewer_auth_headers(
    session: AsyncSession, client: AsyncClient, test_workspace: Workspace
) -> dict:
    """A second user who is a `viewer` member of the test workspace.

    Read-only by role. Exists so the write gate can be exercised over HTTP:
    the enforcement is a dependency wrapper, so asserting it at the service
    layer alone leaves the wiring between route and role untested — which is
    exactly the gap that let an audit conclude the gate was missing when it
    was not.
    """
    import bcrypt as _bcrypt

    user = User(
        id=uuid.uuid4(),
        email="viewer-role@example.com",
        hashed_password=_bcrypt.hashpw(b"viewerpass123", _bcrypt.gensalt()).decode(),
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    session.add(user)
    await session.flush()
    session.add(
        WorkspaceMember(
            id=uuid.uuid4(),
            workspace_id=test_workspace.id,
            user_id=user.id,
            role="viewer",
        )
    )
    await session.commit()

    response = await client.post(
        "/api/auth/login",
        data={"username": "viewer-role@example.com", "password": "viewerpass123"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200, f"Viewer login failed: {response.text}"
    return {
        "Authorization": f"Bearer {response.json()['access_token']}",
        # Explicit, because the viewer's *default* workspace resolution would
        # otherwise decide which workspace this request lands in.
        "X-Workspace-Id": str(test_workspace.id),
    }


@pytest_asyncio.fixture
async def test_user_with_2fa(session: AsyncSession, clean_db) -> User:
    """Create a test user with 2FA enabled."""
    import bcrypt as _bcrypt
    import pyotp

    hashed = _bcrypt.hashpw(b"testpass123", _bcrypt.gensalt()).decode()
    totp_secret = pyotp.random_base32()
    user = User(
        id=uuid.uuid4(),
        email="2fa@example.com",
        hashed_password=hashed,
        is_active=True,
        is_superuser=False,
        is_verified=True,
        totp_secret=totp_secret,
        is_2fa_enabled=True,
        preferences={
            "language": "en",
            "date_format": "MM/DD/YYYY",
            "timezone": "UTC",
        },
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@pytest.fixture(autouse=True)
def _fresh_timezone_cache():
    """One test's saved timezone must never leak into the next through the cache."""
    from app.core.app_clock import invalidate_timezone_cache

    invalidate_timezone_cache()
    yield
    invalidate_timezone_cache()


@pytest.fixture(autouse=True)
def _mock_redis():
    """Provide a no-op Redis mock so rate limiting never blocks tests."""
    mock = AsyncMock()
    # Pipeline commands are synchronous/chained on redis-py's pipeline; only
    # execute() is awaited. Match that contract so requests create no unawaited
    # mock coroutines, while still reporting zero prior requests.
    pipe_mock = MagicMock()
    pipe_mock.zremrangebyscore = MagicMock(return_value=pipe_mock)
    pipe_mock.zcard = MagicMock(return_value=pipe_mock)
    pipe_mock.zadd = MagicMock(return_value=pipe_mock)
    pipe_mock.expire = MagicMock(return_value=pipe_mock)
    pipe_mock.execute = AsyncMock(return_value=[0, 0, True, True])
    mock.pipeline = lambda: pipe_mock
    # Key-value ops for 2FA temp tokens
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock()
    mock.delete = AsyncMock()

    async def _fake_get_redis():
        return mock

    # Reset the cached singleton so no real Redis connection leaks into tests
    import app.core.redis as redis_mod
    original = redis_mod._redis
    redis_mod._redis = None

    with patch("app.core.redis.get_redis", _fake_get_redis), \
         patch("app.core.rate_limit.get_redis", _fake_get_redis), \
         patch("app.api.custom_auth.get_redis", _fake_get_redis), \
         patch("app.api.two_factor.get_redis", _fake_get_redis):
        yield mock

    redis_mod._redis = original
