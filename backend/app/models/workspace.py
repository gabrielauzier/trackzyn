import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


# Roles a member can hold inside a workspace. `owner` is the
# member-management + workspace-config role; `editor` can read/write
# workspace data; `viewer` is read-only.
WORKSPACE_ROLES = ("owner", "editor", "viewer")

# Virtual role surfaced when a user accesses a workspace via
# `managed_by_user_id` rather than via a `workspace_members` row. They
# get effective owner rights but aren't part of the member roster.
MANAGER_VIRTUAL_ROLE = "manager"


class Workspace(Base):
    """The tenant boundary. Every piece of domain data belongs to one."""

    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    # The human who originally created the workspace. Distinct from
    # `owner` role membership — ownership can transfer via the members
    # table, but this field records the creator for audit.
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Soft-delete: archived workspaces stay in the DB until an admin purge.
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Optional external administrator. When set, this user has effective
    # owner rights in the workspace without being a member. Use case:
    # one user provisions and operates a workspace on behalf of another.
    managed_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    locale: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # The calendar this workspace runs on, as an IANA name. Null means
    # "follow the application timezone". See `core.app_clock`.
    timezone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    members: Mapped[list["WorkspaceMember"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(20), default="owner", server_default="owner")
    # The user who last invited or modified this membership.
    invited_by_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    workspace: Mapped["Workspace"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])
