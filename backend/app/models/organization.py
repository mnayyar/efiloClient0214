"""Organization model."""

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.helpers import generate_cuid


class Organization(Base):
    __tablename__ = "Organization"

    id: Mapped[str] = mapped_column(sa.Text, primary_key=True, default=generate_cuid)
    name: Mapped[str] = mapped_column(sa.Text, nullable=False)
    slug: Mapped[str] = mapped_column(sa.Text, nullable=False)
    logo: Mapped[str | None] = mapped_column(sa.Text)
    primary_color: Mapped[str] = mapped_column(
        "primaryColor", sa.Text, server_default="'#C67F17'"
    )
    billing_email: Mapped[str] = mapped_column("billingEmail", sa.Text, nullable=False)
    street: Mapped[str | None] = mapped_column(sa.Text)
    street2: Mapped[str | None] = mapped_column(sa.Text)
    city: Mapped[str | None] = mapped_column(sa.Text)
    state: Mapped[str | None] = mapped_column(sa.Text)
    zip_code: Mapped[str | None] = mapped_column("zipCode", sa.Text)
    country: Mapped[str] = mapped_column(sa.Text, server_default="'US'")
    reply_to_domain: Mapped[str | None] = mapped_column("replyToDomain", sa.Text)
    max_projects: Mapped[int] = mapped_column("maxProjects", sa.Integer, server_default="100")
    max_users: Mapped[int] = mapped_column("maxUsers", sa.Integer, server_default="50")
    workos_org_id: Mapped[str | None] = mapped_column("workosOrgId", sa.Text)
    sso_enabled: Mapped[bool] = mapped_column("ssoEnabled", sa.Boolean, server_default="false")
    sso_provider: Mapped[str | None] = mapped_column("ssoProvider", sa.Text)

    created_at: Mapped[datetime] = mapped_column(
        "createdAt", sa.DateTime(timezone=False), server_default=sa.func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "updatedAt", sa.DateTime(timezone=False), default=sa.func.now(), onupdate=sa.func.now()
    )

    # Relationships
    users: Mapped[list["User"]] = relationship(back_populates="organization")  # noqa: F821
    projects: Mapped[list["Project"]] = relationship(back_populates="organization")  # noqa: F821

    __table_args__ = (
        sa.Index("Organization_slug_key", "slug", unique=True),
        sa.Index("Organization_workosOrgId_key", "workosOrgId", unique=True),
    )
