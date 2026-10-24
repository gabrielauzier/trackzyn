import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class WorkspaceRead(BaseModel):
    id: uuid.UUID
    name: str
    is_archived: bool
    locale: Optional[str] = None
    # The workspace's own calendar, or None to follow the application
    # timezone. See `core.app_clock`.
    timezone: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    created_at: datetime
    created_by_user_id: Optional[uuid.UUID] = None
    managed_by_user_id: Optional[uuid.UUID] = None
    # The current user's role inside this workspace.
    role: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    locale: Optional[str] = Field(default=None, max_length=10)
    icon: Optional[str] = Field(default=None, max_length=50)
    color: Optional[str] = Field(default=None, max_length=7)
    # When True, also add the creator as an `owner` member. When False
    # (default), the creator is only the external manager — useful when
    # the workspace will be handed off to someone else as the day-to-day
    # owner.
    self_membership: bool = False


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    icon: Optional[str] = Field(default=None, max_length=50)
    color: Optional[str] = Field(default=None, max_length=7)
    locale: Optional[str] = Field(default=None, max_length=10)
    # An IANA name to keep this workspace's calendar in, or null to follow
    # the application timezone again. Validated by the route.
    timezone: Optional[str] = Field(default=None, max_length=64)


class MemberRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    role: str
    joined_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemberInvite(BaseModel):
    email: EmailStr
    role: str = "editor"
    # Optional password — only used when inviting a brand-new user. If
    # omitted, the endpoint rejects the invite when the target user
    # doesn't exist.
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)


class MemberRoleUpdate(BaseModel):
    role: str
