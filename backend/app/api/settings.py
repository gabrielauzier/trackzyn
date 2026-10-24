from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.stored_file import FileSettingsRead
from app.services.file_service import allowed_extensions

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/files", response_model=FileSettingsRead)
async def get_file_settings():
    """Return upload limits for this instance, so the UI can validate early."""
    return FileSettingsRead(
        allowed_extensions=allowed_extensions(),
        max_file_size_mb=get_settings().storage_max_file_size_mb,
    )
