import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin import router as admin_router, check_registration_enabled
from app.api.custom_auth import router as custom_auth_router
from app.api.files import router as files_router
from app.api.info import router as info_router
from app.api.oidc_auth import router as oidc_auth_router
from app.api.passkeys import router as passkeys_router
from app.api.settings import router as settings_router
from app.api.setup import router as setup_router
from app.api.timezones import router as timezones_router
from app.api.two_factor import router as two_factor_router
from app.api.user_lookup import router as user_lookup_router
from app.api.workspaces import router as workspaces_router
from app.core.auth import fastapi_users
from app.core.auth_policy import require_local_auth_enabled
from app.core.config import get_settings
from app.core.rate_limit import login_rate_limit, register_rate_limit, password_reset_rate_limit
from app.core.redis import close_redis
from app.schemas.user import UserCreate, UserRead, UserUpdate

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup hooks go here (cache warm-up, dispatching Celery tasks, ...).
    yield
    # Shutdown
    await close_redis()


app = FastAPI(
    title=settings.app_name,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth routes — custom login/logout with 2FA support (mounted first to take precedence)
app.include_router(
    custom_auth_router,
    prefix="/api/auth",
    tags=["auth"],
    dependencies=[Depends(login_rate_limit)],
)
app.include_router(
    two_factor_router,
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(
    passkeys_router,
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(oidc_auth_router)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth"],
    dependencies=[
        Depends(require_local_auth_enabled),
        Depends(check_registration_enabled),
        Depends(register_rate_limit),
    ],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix="/api/auth",
    tags=["auth"],
    dependencies=[Depends(require_local_auth_enabled), Depends(password_reset_rate_limit)],
)
# user_lookup must precede the fastapi-users router below so the
# `/api/users/lookup` path isn't captured by the catch-all `/{id}`
# route fastapi-users mounts.
app.include_router(user_lookup_router)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/api/users",
    tags=["users"],
)

# Platform routes
app.include_router(setup_router)
app.include_router(timezones_router)
app.include_router(settings_router)
app.include_router(workspaces_router)
app.include_router(files_router)
app.include_router(admin_router)
app.include_router(info_router)

# Domain routes — mount your feature routers here.


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
