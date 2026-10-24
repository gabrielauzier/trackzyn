"""Public capability/feature-flag endpoint.

Tells the frontend which optional features are enabled so it can hide
nav items, routes, etc. Lightweight — no auth required.
"""
from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/api", tags=["info"])


@router.get("/info")
async def get_app_info():
    settings = get_settings()
    return {
        "app_name": settings.app_name,
        # Add `feature_flag("MY_FEATURE")` entries here to gate optional
        # modules from the environment (see app.core.feature_flags).
        "features": {},
        "update_check_repo": settings.update_check_repo or None,
    }
