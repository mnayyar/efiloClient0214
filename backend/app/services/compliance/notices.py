"""Notice management service.

Handles the full lifecycle of compliance notices: create, edit, send,
regenerate, confirm delivery, and delete.
"""

import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.compliance import (
    ComplianceAuditLog,
    ComplianceDeadline,
    ComplianceNotice,
    ContractClause,
)
from app.models.enums import ComplianceNoticeStatus, ComplianceNoticeType, DeadlineStatus
from app.models.project import Project
from app.models.user import User
from app.services.ai import generate_response
from app.services.email import send_rfi_email

from .prompts import NOTICE_GENERATION_SYSTEM, NOTICE_GENERATION_USER

logger = logging.getLogger(__name__)


async def create_notice(
    db: AsyncSession,
    project_id: str,
    notice_type: ComplianceNoticeType,
    title: str,
    content: str,
    user_id: str,
    clause_id: str | None = None,
    due_date: datetime | None = None,
    recipient_name: str | None = None,
    recipient_email: str | None = None,
    deadline_id: str | None = None,
) -> ComplianceNotice:
    """Create a new compliance notice (draft)."""
    notice = ComplianceNotice(
        project_id=project_id,
        type=notice_type,
        status=ComplianceNoticeStatus.DRAFT,
        title=title,
        content=content,
        clause_id=clause_id,
        due_date=due_date,
        recipient_name=recipient_name,
        recipient_email=recipient_email,
        created_by_id=user_id,
    )
    db.add(notice)
    await db.flush()
    await db.refresh(notice)

    # If linked to a deadline, update deadline status
    if deadline_id:
        result = await db.execute(
            select(ComplianceDeadline).where(
                ComplianceDeadline.id == deadline_id,
                ComplianceDeadline.project_id == project_id,
            )
        )
        deadline = result.scalar_one_or_none()
        if deadline:
            deadline.status = DeadlineStatus.NOTICE_DRAFTED
            deadline.notice_id = notice.id
            deadline.notice_created_at = datetime.utcnow()

    # Audit log
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="NOTICE_CREATED",
        entity_type="ComplianceNotice",
        entity_id=notice.id,
        user_id=user_id,
        actor_type="USER",
        action="create_notice",
        details={
            "type": notice_type.value,
            "title": title,
            "deadlineId": deadline_id,
        },
    )
    db.add(audit)
    await db.flush()

    return notice


async def generate_notice_draft(
    db: AsyncSession,
    project_id: str,
    clause_id: str,
    trigger_description: str,
    trigger_date: datetime,
    deadline_date: datetime,
    notice_type: ComplianceNoticeType,
    user_id: str,
    additional_context: str = "",
) -> dict:
    """Generate a notice draft using Claude AI.

    Returns dict with content, model, tokensUsed.
    """
    # Load clause
    result = await db.execute(
        select(ContractClause).where(ContractClause.id == clause_id)
    )
    clause = result.scalar_one_or_none()
    if not clause:
        raise ValueError(f"Clause {clause_id} not found")

    # Load project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise ValueError(f"Project {project_id} not found")

    # Load user
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    # Get GC contact from project
    gc_name = project.gc_contact_name or "General Contractor"
    gc_company = project.gc_company_name or ""
    gc_email = project.gc_contact_email or ""

    # Format notice type for display
    notice_type_display = notice_type.value.replace("_", " ").title()

    user_prompt = NOTICE_GENERATION_USER.format(
        notice_type=notice_type_display,
        project_name=project.name,
        clause_title=clause.title,
        clause_section_ref=clause.section_ref or "N/A",
        clause_content=clause.content,
        trigger_description=trigger_description,
        trigger_date=trigger_date.strftime("%B %d, %Y"),
        deadline_date=deadline_date.strftime("%B %d, %Y"),
        notice_method=clause.notice_method.value if clause.notice_method else "WRITTEN_NOTICE",
        from_name=user.name if user else "Project Manager",
        from_company=project.name,  # Organization name not directly on project
        to_name=gc_name,
        to_company=gc_company,
        to_email=gc_email,
        additional_context=additional_context or "None",
    )

    ai_response = generate_response(
        system_prompt=NOTICE_GENERATION_SYSTEM,
        user_prompt=user_prompt,
        model="sonnet",
        max_tokens=4000,
        temperature=0.2,
    )

    return {
        "content": ai_response.content,
        "model": ai_response.model,
        "tokensUsed": ai_response.tokens_used,
    }


async def update_notice(
    db: AsyncSession,
    notice_id: str,
    project_id: str,
    user_id: str,
    title: str | None = None,
    content: str | None = None,
    recipient_name: str | None = None,
    recipient_email: str | None = None,
    due_date: datetime | None = None,
) -> ComplianceNotice | None:
    """Update a notice (only DRAFT and PENDING_REVIEW can be edited)."""
    result = await db.execute(
        select(ComplianceNotice).where(
            ComplianceNotice.id == notice_id,
            ComplianceNotice.project_id == project_id,
        )
    )
    notice = result.scalar_one_or_none()
    if not notice:
        return None

    if notice.status not in (ComplianceNoticeStatus.DRAFT, ComplianceNoticeStatus.PENDING_REVIEW):
        raise ValueError(f"Cannot edit notice in {notice.status.value} status")

    if title is not None:
        notice.title = title
    if content is not None:
        notice.content = content
    if recipient_name is not None:
        notice.recipient_name = recipient_name
    if recipient_email is not None:
        notice.recipient_email = recipient_email
    if due_date is not None:
        notice.due_date = due_date

    await db.flush()
    return notice


async def send_notice(
    db: AsyncSession,
    notice_id: str,
    project_id: str,
    user_id: str,
) -> ComplianceNotice | None:
    """Send a compliance notice via email.

    Updates status to SENT and records delivery info.
    """
    result = await db.execute(
        select(ComplianceNotice).where(
            ComplianceNotice.id == notice_id,
            ComplianceNotice.project_id == project_id,
        )
    )
    notice = result.scalar_one_or_none()
    if not notice:
        return None

    if notice.status not in (ComplianceNoticeStatus.DRAFT, ComplianceNoticeStatus.PENDING_REVIEW):
        raise ValueError(f"Cannot send notice in {notice.status.value} status")

    if not notice.recipient_email:
        raise ValueError("Notice has no recipient email")

    # Load project and user for email context
    project_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = project_result.scalar_one_or_none()

    user_result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()

    # Send email
    from_name = user.name if user else "efilo.ai"
    from_email = f"noreply@efilo.ai"
    reply_to = user.email if user else from_email
    project_name = project.name if project else "Project"

    sent = send_rfi_email(
        from_name=from_name,
        from_email=from_email,
        reply_to=reply_to,
        to=notice.recipient_email,
        to_name=notice.recipient_name,
        cc=user.email if user else None,
        rfi_number=f"NOTICE-{notice.id[:8]}",
        subject=notice.title,
        question=notice.content,
        project_name=project_name,
    )

    now = datetime.utcnow()
    notice.status = ComplianceNoticeStatus.SENT
    notice.sent_at = now
    notice.delivered_at = now if sent else None
    notice.delivery_methods = ["EMAIL"]
    notice.on_time_status = notice.due_date is None or now <= notice.due_date

    # Update linked deadline
    if notice.clause_id:
        deadline_result = await db.execute(
            select(ComplianceDeadline).where(
                ComplianceDeadline.notice_id == notice.id,
                ComplianceDeadline.project_id == project_id,
            )
        )
        deadline = deadline_result.scalar_one_or_none()
        if deadline:
            deadline.status = DeadlineStatus.NOTICE_SENT

    # Audit log
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="NOTICE_SENT",
        entity_type="ComplianceNotice",
        entity_id=notice_id,
        user_id=user_id,
        actor_type="USER",
        action="send_notice",
        details={
            "recipientEmail": notice.recipient_email,
            "emailSent": sent,
            "onTime": notice.on_time_status,
        },
    )
    db.add(audit)
    await db.flush()

    return notice


async def delete_notice(
    db: AsyncSession,
    notice_id: str,
    project_id: str,
    user_id: str,
) -> bool:
    """Delete a notice (only DRAFT and PENDING_REVIEW)."""
    result = await db.execute(
        select(ComplianceNotice).where(
            ComplianceNotice.id == notice_id,
            ComplianceNotice.project_id == project_id,
        )
    )
    notice = result.scalar_one_or_none()
    if not notice:
        return False

    if notice.status not in (ComplianceNoticeStatus.DRAFT, ComplianceNoticeStatus.PENDING_REVIEW):
        raise ValueError(f"Cannot delete notice in {notice.status.value} status")

    # Unlink from deadline if linked
    deadline_result = await db.execute(
        select(ComplianceDeadline).where(
            ComplianceDeadline.notice_id == notice_id,
            ComplianceDeadline.project_id == project_id,
        )
    )
    deadline = deadline_result.scalar_one_or_none()
    if deadline:
        deadline.notice_id = None
        deadline.notice_created_at = None
        deadline.status = DeadlineStatus.ACTIVE

    # Audit before delete
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="NOTICE_DELETED",
        entity_type="ComplianceNotice",
        entity_id=notice_id,
        user_id=user_id,
        actor_type="USER",
        action="delete_notice",
        details={"title": notice.title, "type": notice.type.value},
    )
    db.add(audit)

    await db.delete(notice)
    await db.flush()
    return True


async def get_notices(
    db: AsyncSession,
    project_id: str,
    status: ComplianceNoticeStatus | None = None,
    notice_type: ComplianceNoticeType | None = None,
) -> list[ComplianceNotice]:
    """List notices for a project."""
    query = (
        select(ComplianceNotice)
        .where(ComplianceNotice.project_id == project_id)
        .order_by(ComplianceNotice.created_at.desc())
    )

    if status:
        query = query.where(ComplianceNotice.status == status)
    if notice_type:
        query = query.where(ComplianceNotice.type == notice_type)

    result = await db.execute(query)
    return list(result.scalars().all())


async def confirm_delivery(
    db: AsyncSession,
    notice_id: str,
    project_id: str,
    user_id: str,
    method: str,
    tracking_number: str | None = None,
    carrier: str | None = None,
    delivered_at: datetime | None = None,
    signed_by: str | None = None,
    received_by: str | None = None,
) -> ComplianceNotice | None:
    """Confirm delivery of a sent notice with tracking info."""
    result = await db.execute(
        select(ComplianceNotice).where(
            ComplianceNotice.id == notice_id,
            ComplianceNotice.project_id == project_id,
        )
    )
    notice = result.scalar_one_or_none()
    if not notice:
        return None

    if notice.status != ComplianceNoticeStatus.SENT:
        raise ValueError(f"Cannot confirm delivery for notice in {notice.status.value} status")

    now = datetime.utcnow()
    existing = notice.delivery_confirmation or {}

    method_lower = method.lower().replace("_", "")
    confirmation_entry = {
        "status": "delivered",
        "deliveredAt": (delivered_at or now).isoformat(),
    }
    if tracking_number:
        confirmation_entry["trackingNumber"] = tracking_number
    if carrier:
        confirmation_entry["carrier"] = carrier
    if signed_by:
        confirmation_entry["signedBy"] = signed_by
    if received_by:
        confirmation_entry["receivedBy"] = received_by

    method_key_map = {
        "email": "email",
        "certifiedmail": "certifiedMail",
        "registeredmail": "registeredMail",
        "handdelivery": "handDelivery",
        "fax": "fax",
        "courier": "courier",
    }
    key = method_key_map.get(method_lower, method_lower)
    existing[key] = confirmation_entry

    notice.delivery_confirmation = existing
    notice.delivered_at = delivered_at or now
    notice.status = ComplianceNoticeStatus.ACKNOWLEDGED

    # Add delivery method if not already present
    methods = list(notice.delivery_methods or [])
    if method not in methods:
        methods.append(method)
        notice.delivery_methods = methods

    # Audit
    audit = ComplianceAuditLog(
        project_id=project_id,
        event_type="DELIVERY_CONFIRMED",
        entity_type="ComplianceNotice",
        entity_id=notice_id,
        user_id=user_id,
        actor_type="USER",
        action="confirm_delivery",
        details={"method": method, "trackingNumber": tracking_number},
    )
    db.add(audit)
    await db.flush()

    return notice


async def regenerate_notice_draft(
    db: AsyncSession,
    notice_id: str,
    project_id: str,
    user_id: str,
    custom_instructions: str | None = None,
) -> dict:
    """Regenerate a notice's content using AI.

    Only DRAFT and PENDING_REVIEW notices can be regenerated.
    Returns the new content.
    """
    result = await db.execute(
        select(ComplianceNotice).where(
            ComplianceNotice.id == notice_id,
            ComplianceNotice.project_id == project_id,
        )
    )
    notice = result.scalar_one_or_none()
    if not notice:
        raise ValueError("Notice not found")

    if notice.status not in (ComplianceNoticeStatus.DRAFT, ComplianceNoticeStatus.PENDING_REVIEW):
        raise ValueError(f"Cannot regenerate notice in {notice.status.value} status")

    if not notice.clause_id:
        raise ValueError("Notice has no linked clause")

    # Load clause
    clause_result = await db.execute(
        select(ContractClause).where(ContractClause.id == notice.clause_id)
    )
    clause = clause_result.scalar_one_or_none()
    if not clause:
        raise ValueError("Linked clause not found")

    # Find linked deadline
    deadline_result = await db.execute(
        select(ComplianceDeadline).where(ComplianceDeadline.notice_id == notice_id)
    )
    deadline = deadline_result.scalar_one_or_none()

    # Load project
    project_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = project_result.scalar_one_or_none()

    # Load user
    user_result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = user_result.scalar_one_or_none()

    gc_name = project.gc_contact_name or "General Contractor" if project else "General Contractor"
    gc_company = project.gc_company_name or "" if project else ""
    gc_email = project.gc_contact_email or "" if project else ""

    trigger_date = deadline.triggered_at if deadline else datetime.utcnow()
    deadline_date = deadline.calculated_deadline if deadline else notice.due_date or datetime.utcnow()

    additional = custom_instructions or "None"
    notice_type_display = notice.type.value.replace("_", " ").title()

    user_prompt = NOTICE_GENERATION_USER.format(
        notice_type=notice_type_display,
        project_name=project.name if project else "Project",
        clause_title=clause.title,
        clause_section_ref=clause.section_ref or "N/A",
        clause_content=clause.content,
        trigger_description=deadline.trigger_description if deadline else "Manual notice",
        trigger_date=trigger_date.strftime("%B %d, %Y"),
        deadline_date=deadline_date.strftime("%B %d, %Y"),
        notice_method=clause.notice_method.value if clause.notice_method else "WRITTEN_NOTICE",
        from_name=user.name if user else "Project Manager",
        from_company=project.name if project else "",
        to_name=gc_name,
        to_company=gc_company,
        to_email=gc_email,
        additional_context=additional,
    )

    ai_response = generate_response(
        system_prompt=NOTICE_GENERATION_SYSTEM,
        user_prompt=user_prompt,
        model="sonnet",
        max_tokens=4000,
        temperature=0.2,
    )

    # Update notice with new content
    notice.content = ai_response.content
    notice.generated_by_ai = True
    notice.ai_model = ai_response.model
    await db.flush()

    return {"content": ai_response.content}


async def get_notice_by_id(
    db: AsyncSession,
    notice_id: str,
    project_id: str,
) -> ComplianceNotice | None:
    """Get a single notice."""
    result = await db.execute(
        select(ComplianceNotice).where(
            ComplianceNotice.id == notice_id,
            ComplianceNotice.project_id == project_id,
        )
    )
    return result.scalar_one_or_none()
