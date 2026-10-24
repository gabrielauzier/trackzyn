import uuid
from typing import TYPE_CHECKING, Optional

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import JSON, Boolean, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.passkey import UserPasskey


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("oidc_issuer", "oidc_subject", name="uq_users_oidc_identity"),
    )

    if TYPE_CHECKING:
        # fastapi-users declares its inherited columns as plain types (e.g.
        # `email: str`) under its own TYPE_CHECKING branch, so `ty` can't see
        # them as SQLAlchemy `Mapped` attributes (`.ilike()`, `.in_()`, ...).
        # Re-annotate them here so type checkers treat them as real mapped
        # columns everywhere.
        id: Mapped[uuid.UUID]
        email: Mapped[str]
        hashed_password: Mapped[str]
        is_active: Mapped[bool]
        is_superuser: Mapped[bool]
        is_verified: Mapped[bool]

    preferences: Mapped[Optional[dict]] = mapped_column(
        JSON,
        default=lambda: {
            "language": "en",
            "date_format": "MM/DD/YYYY",
        },
    )

    totp_secret: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, default=None)
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    oidc_issuer: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    oidc_subject: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)

    passkeys: Mapped[list["UserPasskey"]] = relationship(back_populates="user", cascade="all, delete-orphan")

