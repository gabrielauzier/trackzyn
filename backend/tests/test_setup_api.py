"""Tests for setup API endpoints.

Tests: GET /api/setup/status, POST /api/setup/create-admin.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_setup_status_has_users(client: AsyncClient, test_user):
    """Setup status returns has_users=True when users exist."""
    response = await client.get("/api/setup/status")
    assert response.status_code == 200
    assert response.json()["has_users"] is True


@pytest.mark.asyncio
async def test_setup_status_no_users(client: AsyncClient, clean_db):
    """Setup status returns has_users=False when no users exist."""
    response = await client.get("/api/setup/status")
    assert response.status_code == 200
    assert response.json()["has_users"] is False


@pytest.mark.asyncio
async def test_create_admin_success(client: AsyncClient, clean_db):
    """Create admin succeeds when no users exist."""
    response = await client.post(
        "/api/setup/create-admin",
        json={
            "email": "admin@test.com",
            "password": "StrongPass123!",
            "name": "Admin",
            "language": "pt-BR",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_create_admin_forbidden_when_local_auth_disabled(
    client: AsyncClient,
    clean_db,
    oidc_only_settings,
):
    response = await client.post(
        "/api/setup/create-admin",
        json={"email": "admin@test.com", "password": "StrongPass123!"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "LOCAL_AUTH_DISABLED"
    status_response = await client.get("/api/setup/status")
    assert status_response.json()["has_users"] is False


@pytest.mark.asyncio
async def test_create_admin_already_exists(client: AsyncClient, test_user):
    """Create admin fails when users already exist."""
    response = await client.post(
        "/api/setup/create-admin",
        json={
            "email": "another@test.com",
            "password": "Pass123!",
        },
    )
    assert response.status_code == 403
    assert "already completed" in response.json()["detail"].lower()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "language,expected", [("en", "Personal"), ("pt-BR", "Pessoal")], ids=["en", "pt-BR"]
)
async def test_create_admin_bootstraps_localized_workspace(
    client: AsyncClient, clean_db, language, expected
):
    """The admin lands as superuser and owner of a localized Personal workspace."""
    response = await client.post(
        "/api/setup/create-admin",
        json={
            "email": f"{language}-admin@test.com",
            "password": "StrongPass123!",
            "language": language,
        },
    )
    assert response.status_code == 200
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}

    me = await client.get("/api/users/me", headers=headers)
    assert me.json()["is_superuser"] is True

    workspaces = await client.get("/api/workspaces", headers=headers)
    assert workspaces.status_code == 200
    assert [(w["name"], w["role"]) for w in workspaces.json()] == [(expected, "owner")]
