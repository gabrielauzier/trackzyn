"""Workspace-scoped file uploads.

The bytes go to the configured storage provider; the `files` table keeps
the metadata. Validation (size, extension) is driven by the `STORAGE_*`
settings so a deployment can tighten it without code changes.
"""
import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.stored_file import StoredFileRecord
from app.providers import get_storage_provider


def allowed_extensions() -> list[str]:
    raw = get_settings().storage_allowed_extensions
    return sorted({ext.strip().lower() for ext in raw.split(",") if ext.strip()})


def sanitize_filename(filename: str) -> str:
    """Strip special characters from a filename, preserving the extension."""
    if "." in filename:
        name, ext = filename.rsplit(".", 1)
        ext = re.sub(r"[^a-zA-Z0-9]", "", ext).lower()
    else:
        name = filename
        ext = ""
    # Replace non-alphanumeric (except hyphens/underscores) with underscores, collapse runs
    name = re.sub(r"[^a-zA-Z0-9_-]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "file"
    return f"{name}.{ext}" if ext else name


def _validate_file(filename: str, size: int) -> None:
    settings = get_settings()

    max_bytes = settings.storage_max_file_size_mb * 1024 * 1024
    if size > max_bytes:
        raise ValueError(f"File too large. Maximum size is {settings.storage_max_file_size_mb} MB.")

    allowed = allowed_extensions()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in allowed:
        raise ValueError(f"File type '.{ext}' is not allowed. Allowed: {', '.join(allowed)}")


async def upload_file(
    session: AsyncSession,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    filename: str,
    content_type: str,
    data: bytes,
) -> StoredFileRecord:
    filename = sanitize_filename(filename)
    _validate_file(filename, len(data))

    prefix = uuid.uuid4().hex[:12]
    storage_key = f"{workspace_id}/{prefix}_{filename}"

    stored = await get_storage_provider().upload(storage_key, data, content_type)

    record = StoredFileRecord(
        workspace_id=workspace_id,
        uploaded_by_user_id=user_id,
        filename=filename,
        storage_key=stored.storage_key,
        content_type=stored.content_type,
        size=stored.size,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def list_files(session: AsyncSession, workspace_id: uuid.UUID) -> list[StoredFileRecord]:
    result = await session.execute(
        select(StoredFileRecord)
        .where(StoredFileRecord.workspace_id == workspace_id)
        .order_by(StoredFileRecord.created_at.desc())
    )
    return list(result.scalars().all())


async def get_file(
    session: AsyncSession, file_id: uuid.UUID, workspace_id: uuid.UUID
) -> StoredFileRecord:
    result = await session.execute(
        select(StoredFileRecord).where(
            StoredFileRecord.id == file_id,
            StoredFileRecord.workspace_id == workspace_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise LookupError("File not found")
    return record


async def download_file(
    session: AsyncSession, file_id: uuid.UUID, workspace_id: uuid.UUID
) -> tuple[StoredFileRecord, bytes]:
    record = await get_file(session, file_id, workspace_id)
    data = await get_storage_provider().download(record.storage_key)
    return record, data


async def rename_file(
    session: AsyncSession,
    file_id: uuid.UUID,
    workspace_id: uuid.UUID,
    new_filename: str,
) -> StoredFileRecord:
    record = await get_file(session, file_id, workspace_id)
    new_filename = sanitize_filename(new_filename)

    # Preserve the original extension
    original_ext = record.filename.rsplit(".", 1)[-1].lower() if "." in record.filename else ""
    new_ext = new_filename.rsplit(".", 1)[-1].lower() if "." in new_filename else ""
    if original_ext and new_ext != original_ext:
        name_part = new_filename.rsplit(".", 1)[0] if "." in new_filename else new_filename
        new_filename = f"{name_part}.{original_ext}"

    record.filename = new_filename
    await session.commit()
    await session.refresh(record)
    return record


async def delete_file(
    session: AsyncSession, file_id: uuid.UUID, workspace_id: uuid.UUID
) -> None:
    record = await get_file(session, file_id, workspace_id)
    await get_storage_provider().delete(record.storage_key)
    await session.delete(record)
    await session.commit()
