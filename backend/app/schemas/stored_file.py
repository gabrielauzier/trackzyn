import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StoredFileRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    uploaded_by_user_id: uuid.UUID | None = None
    filename: str
    content_type: str
    size: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StoredFileRename(BaseModel):
    filename: str = Field(min_length=1, max_length=255)


class FileSettingsRead(BaseModel):
    allowed_extensions: list[str]
    max_file_size_mb: int
