from datetime import datetime, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from fastapi import Depends

from app.models.app_settings import AppSetting


class FixedDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 5, 19, 1, 0, tzinfo=timezone.utc).astimezone(tz)


@pytest.mark.asyncio
async def test_saved_timezone_takes_effect_for_new_operations(session, clean_db):
    from app.core.app_clock import app_today, invalidate_timezone_cache, use_timezone

    setting = AppSetting(key="timezone", value="America/Sao_Paulo")
    session.add(setting)
    await session.commit()

    with patch("app.core.app_clock.datetime", FixedDatetime):
        async with use_timezone(session):
            assert app_today().isoformat() == "2026-05-18"

            setting.value = "Asia/Tokyo"
            await session.commit()
            # Writing straight to the table bypasses the admin endpoint, which
            # is what drops the cache; do it by hand like a second process
            # would see it after the cache expires.
            invalidate_timezone_cache()
            assert app_today().isoformat() == "2026-05-18"

        async with use_timezone(session):
            assert app_today().isoformat() == "2026-05-19"


@pytest.mark.asyncio
async def test_saved_timezone_is_cached_between_reads(session, clean_db):
    from app.core.app_clock import get_timezone, invalidate_timezone_cache

    setting = AppSetting(key="timezone", value="America/Sao_Paulo")
    session.add(setting)
    await session.commit()
    assert str(await get_timezone(session)) == "America/Sao_Paulo"

    setting.value = "Asia/Tokyo"
    await session.commit()
    assert str(await get_timezone(session)) == "America/Sao_Paulo"

    invalidate_timezone_cache()
    assert str(await get_timezone(session)) == "Asia/Tokyo"


@pytest.mark.asyncio
async def test_tz_environment_falls_back_to_system_timezone(session, clean_db, monkeypatch):
    from app.core.app_clock import app_today, use_timezone

    monkeypatch.setenv("TZ", "Unavailable/Zone")
    with (
        patch("tzlocal.get_localzone", return_value=ZoneInfo("America/Bahia")),
        patch("app.core.app_clock.datetime", FixedDatetime),
    ):
        async with use_timezone(session):
            assert app_today().isoformat() == "2026-05-18"


@pytest.mark.asyncio
async def test_invalid_saved_timezone_keeps_repair_endpoint_available(
    client, admin_auth_headers, session, monkeypatch, caplog
):
    from app.core.app_clock import invalidate_timezone_cache

    monkeypatch.setenv("TZ", "America/Sao_Paulo")
    session.add(AppSetting(key="timezone", value="Unavailable/Zone"))
    await session.commit()
    invalidate_timezone_cache()

    response = await client.get("/api/setup/status")
    assert response.status_code == 200

    response = await client.get("/api/admin/timezone", headers=admin_auth_headers)
    assert response.status_code == 200
    body = response.json()
    # The endpoint tells the administrator what is saved and what is in use,
    # so a broken value is visible in the UI and not only in the logs.
    assert body["timezone"] == "America/Sao_Paulo"
    assert body["saved"] == "Unavailable/Zone"
    assert body["fallback"] == "America/Sao_Paulo"
    assert "Saved application timezone is unavailable" in caplog.text

    response = await client.patch(
        "/api/admin/settings/timezone",
        headers=admin_auth_headers,
        json={"value": "UTC"},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_admin_can_forget_the_saved_timezone(client, admin_auth_headers, monkeypatch):
    monkeypatch.setenv("TZ", "America/Sao_Paulo")
    response = await client.patch(
        "/api/admin/settings/timezone",
        headers=admin_auth_headers,
        json={"value": "Asia/Tokyo"},
    )
    assert response.status_code == 200
    response = await client.get("/api/admin/timezone", headers=admin_auth_headers)
    assert response.json()["saved"] == "Asia/Tokyo"
    assert response.json()["timezone"] == "Asia/Tokyo"

    response = await client.delete("/api/admin/settings/timezone", headers=admin_auth_headers)
    assert response.status_code == 204
    response = await client.get("/api/admin/timezone", headers=admin_auth_headers)
    assert response.json()["saved"] is None
    assert response.json()["timezone"] == "America/Sao_Paulo"

    # Only configurable keys can be forgotten, and only by an administrator.
    response = await client.delete("/api/admin/settings/secret_key", headers=admin_auth_headers)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_names_that_are_files_but_not_timezones_are_rejected(client, admin_auth_headers):
    # `ZoneInfo("localtime")` loads on many hosts, but it is not a timezone
    # anyone should pick, and it would never round-trip through the picker.
    for value in ("localtime", "posixrules", "Factory"):
        response = await client.patch(
            "/api/admin/settings/timezone",
            headers=admin_auth_headers,
            json={"value": value},
        )
        assert response.status_code == 400, value


@pytest.mark.asyncio
async def test_signed_in_members_can_list_timezones(client, auth_headers, monkeypatch):
    monkeypatch.setenv("TZ", "America/Sao_Paulo")
    response = await client.get("/api/timezones", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["default"] == "America/Sao_Paulo"
    assert "Europe/London" in body["available"]
    assert "localtime" not in body["available"]

    response = await client.get("/api/timezones")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_workspace_keeps_its_own_calendar(
    client, auth_headers, session, test_workspace, monkeypatch
):
    """A workspace can pin its own IANA timezone, and requests resolved
    through `current_workspace` then run on that calendar."""
    from app.core.app_clock import app_timezone
    from app.core.workspace_context import current_workspace
    from app.main import app

    monkeypatch.setenv("TZ", "America/Sao_Paulo")
    seen: list[str] = []

    async def _probe(ctx=Depends(current_workspace)):
        seen.append(str(app_timezone()))
        return {}

    app.add_api_route("/api/__probe_tz", _probe, methods=["GET"])
    try:
        headers = {**auth_headers, "X-Workspace-Id": str(test_workspace.id)}
        await client.get("/api/__probe_tz", headers=headers)

        response = await client.patch(
            f"/api/workspaces/{test_workspace.id}",
            headers=auth_headers,
            json={"timezone": "Asia/Tokyo"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["timezone"] == "Asia/Tokyo"
        await client.get("/api/__probe_tz", headers=headers)

        # Null puts the workspace back on the application timezone.
        response = await client.patch(
            f"/api/workspaces/{test_workspace.id}",
            headers=auth_headers,
            json={"timezone": None},
        )
        assert response.status_code == 200, response.text
        assert response.json()["timezone"] is None
        await client.get("/api/__probe_tz", headers=headers)
    finally:
        app.router.routes = [
            r for r in app.router.routes if getattr(r, "path", None) != "/api/__probe_tz"
        ]

    assert seen == ["America/Sao_Paulo", "Asia/Tokyo", "America/Sao_Paulo"]

    response = await client.patch(
        f"/api/workspaces/{test_workspace.id}",
        headers=auth_headers,
        json={"timezone": "Mars/Olympus_Mons"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_admin_can_set_timezone_and_invalid_names_are_rejected(
    client, admin_auth_headers
):
    response = await client.patch(
        "/api/admin/settings/timezone",
        headers=admin_auth_headers,
        json={"value": "America/Sao_Paulo"},
    )
    assert response.status_code == 200

    response = await client.get("/api/admin/timezone", headers=admin_auth_headers)
    assert response.status_code == 200
    assert response.json()["timezone"] == "America/Sao_Paulo"
    assert "Europe/London" in response.json()["available"]

    for value in ("Invalid/Timezone", "../UTC", ""):
        response = await client.patch(
            "/api/admin/settings/timezone",
            headers=admin_auth_headers,
            json={"value": value},
        )
        assert response.status_code == 400
