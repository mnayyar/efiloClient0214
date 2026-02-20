"""User model."""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AuthMethod, UserRole
from app.models.helpers import generate_cuid


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    email: Mapped[str] = mapped_column(sa.Text, nullable=False)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    role: Mapped[UserRole] = mapped_column(
        sa.Enum(UserRole, name="UserRole", create_type=False),
        server_default="VIEWER",
    )
    auth_method: Mapped[AuthMethod] = mapped_column(
        "authMethod",
        sa.Enum(AuthMethod, name="AuthMethod", create_type=False),
        server_default="SSO",
    )
    password_hash: Mapped[str | None] = mapped_column("passwordHash", sa.Text)
    workos_user_id: Mapped[str | None] = mapped_column("workosUserId", sa.Text)
    avatar: Mapped[str | None] = mapped_column(sa.Text)
    phone: Mapped[str | None] = mapped_column(sa.Text)
    last_login_at: Mapped[datetime | None] = mapped_column(
        "lastLoginAt", sa.DateTime(timezone=False)
    )
    organization_id: Mapped[str] = mapped_column(
        "organizationId", sa.Text, sa.ForeignKey("Organization.id", onupdate="CASCADE", ondelete="RESTRICT"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    organization: Mapped["Organization"] = relationship(back_populates="users")  # noqa: F821
    search_queries: Mapped[list["SearchQuery"]] = relationship(back_populates="user")  # noqa: F821
    chat_sessions: Mapped[list["ChatSession"]] = relationship(back_populates="user")  # noqa: F821
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")  # noqa: F821
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user")  # noqa: F821

    __table_args__ = (
        sa.Index("User_email_key", "email", unique=True),
        sa.Index("User_workosUserId_key", "workosUserId", unique=True),
    )
