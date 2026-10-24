"""A read-only member cannot write, proved over HTTP.

These assert **behaviour, not plumbing**: "a viewer cannot upload a file"
stays true however the gate is later expressed. The gate ships as a
dependency wrapper (`current_writable_workspace` → `ctx.require_write()`),
so every new mutating route should depend on it and get a row below.
"""
import pytest
from httpx import AsyncClient

UPLOAD = {"file": ("notes.pdf", b"%PDF-1.4 synthetic", "application/pdf")}


async def test_a_viewer_cannot_upload(client: AsyncClient, viewer_auth_headers):
    resp = await client.post("/api/files", headers=viewer_auth_headers, files=UPLOAD)
    assert resp.status_code == 403, resp.text
    assert "read-only" in resp.json()["detail"].lower()


@pytest.mark.parametrize("method", ["PATCH", "DELETE"])
async def test_a_viewer_cannot_change_a_file(
    client: AsyncClient, viewer_auth_headers, test_files, method
):
    kwargs = {"json": {"filename": "renamed.pdf"}} if method == "PATCH" else {}
    resp = await client.request(
        method, f"/api/files/{test_files[0].id}", headers=viewer_auth_headers, **kwargs
    )
    assert resp.status_code == 403, resp.text


async def test_a_viewer_can_still_read(
    client: AsyncClient, viewer_auth_headers, test_files
):
    """The gate must refuse writes without turning into a lockout."""
    resp = await client.get("/api/files", headers=viewer_auth_headers)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == len(test_files)


async def test_the_write_gate_is_about_role_not_identity(
    client: AsyncClient, viewer_auth_headers, auth_headers, tmp_path, monkeypatch
):
    """The same request the viewer was refused succeeds for the owner."""
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "storage_local_path", str(tmp_path))
    refused = await client.post("/api/files", headers=viewer_auth_headers, files=UPLOAD)
    allowed = await client.post("/api/files", headers=auth_headers, files=UPLOAD)
    assert refused.status_code == 403
    assert allowed.status_code == 201, allowed.text
