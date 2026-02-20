"""Compliance engine API routes.

All routes: /api/projects/{project_id}/compliance/...

Endpoints:
  POST   /parse-contract              — Extract clauses from a document
  GET    /clauses                      — List clauses
  GET    /clauses/{clause_id}          — Get single clause
  PATCH  /clauses/{clause_id}/confirm  — Confirm a clause

  GET    /deadlines                    — List deadlines
  POST   /deadlines                    — Create a deadline
  GET    /deadlines/{deadline_id}      — Get single deadline
  POST   /deadlines/{deadline_id}/waive — Waive a deadline

  GET    /notices                      — List notices
  POST   /notices                      — Create a notice (with optional AI draft)
  GET    /notices/{notice_id}          — Get single notice
  PATCH  /notices/{notice_id}          — Update notice
  DELETE /notices/{notice_id}          — Delete notice (DRAFT/PENDING_REVIEW only)
  POST   /notices/{notice_id}/send     — Send notice via email

  GET    /score                        — Get current compliance score
  GET    /score/history                — Get score history

  GET    /holidays                     — List project holidays
  POST   /holidays                     — Add project holiday
  DELETE /holidays/{holiday_id}        — Delete project holiday
"""

import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query


def _strip_tz(dt: datetime | None) -> datetime | None:
    """Strip timezone info — DB columns are TIMESTAMP WITHOUT TIME ZONE."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.compliance import (
    ComplianceDeadline,
    ComplianceNotice,
    ContractClause,
    ProjectHoliday,
)
from app.models.enums import (
    ComplianceNoticeStatus,
    ComplianceNoticeType,
    ContractClauseKind,
    DeadlineStatus,
    Severity,
    TriggerEventType,
)
from app.models.project import Project
from app.models.user import User
from app.schemas.compliance import (
    VALID_PERIODS,
    CreateDeadlineRequest,
    CreateHolidayRequest,
    CreateNoticeRequest,
    ParseContractRequest,
    UpdateNoticeRequest,
    WaiveDeadlineRequest,
)
from app.services.compliance.deadlines import (
    create_deadline,
    get_deadline_by_id,
    get_deadlines,
    recalculate_severities,
    waive_deadline,
)
from app.services.compliance.notices import (
    confirm_delivery,
    create_notice,
    delete_notice,
    generate_notice_draft,
    get_notice_by_id,
    get_notices,
    regenerate_notice_draft,
    send_notice,
    update_notice,
)
from app.services.compliance.parser import (
    confirm_clause,
    extract_clauses_from_document,
    get_clauses_for_project,
)
from app.services.compliance.integrations import (
    get_compliance_health_component,
    search_compliance_data,
    trigger_change_event_compliance,
)
from app.services.compliance.scoring import (
    calculate_score,
    get_score_history,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["compliance"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _verify_project(db: AsyncSession, project_id: str) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _clause_to_dict(c: ContractClause) -> dict:
    return {
        "id": c.id,
        "projectId": c.project_id,
        "kind": c.kind.value,
        "title": c.title,
        "content": c.content,
        "sectionRef": c.section_ref,
        "deadlineDays": c.deadline_days,
        "deadlineType": c.deadline_type.value if c.deadline_type else None,
        "noticeMethod": c.notice_method.value if c.notice_method else None,
        "trigger": c.trigger,
        "curePeriodDays": c.cure_period_days,
        "curePeriodType": c.cure_period_type.value if c.cure_period_type else None,
        "flowDownProvisions": c.flow_down_provisions,
        "parentClauseRef": c.parent_clause_ref,
        "requiresReview": c.requires_review,
        "reviewReason": c.review_reason,
        "confirmed": c.confirmed,
        "confirmedAt": c.confirmed_at.isoformat() if c.confirmed_at else None,
        "confirmedBy": c.confirmed_by,
        "aiExtracted": c.ai_extracted,
        "aiModel": c.ai_model,
        "sourceDocId": c.source_doc_id,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
    }


def _deadline_to_dict(d: ComplianceDeadline) -> dict:
    return {
        "id": d.id,
        "projectId": d.project_id,
        "clauseId": d.clause_id,
        "triggerEventType": d.trigger_event_type.value,
        "triggerEventId": d.trigger_event_id,
        "triggerDescription": d.trigger_description,
        "triggeredAt": d.triggered_at.isoformat() if d.triggered_at else None,
        "triggeredBy": d.triggered_by,
        "calculatedDeadline": d.calculated_deadline.isoformat() if d.calculated_deadline else None,
        "deadlineTimezone": d.deadline_timezone,
        "status": d.status.value,
        "severity": d.severity.value,
        "noticeId": d.notice_id,
        "noticeCreatedAt": d.notice_created_at.isoformat() if d.notice_created_at else None,
        "waivedAt": d.waived_at.isoformat() if d.waived_at else None,
        "waivedBy": d.waived_by,
        "waiverReason": d.waiver_reason,
        "createdAt": d.created_at.isoformat() if d.created_at else None,
        "updatedAt": d.updated_at.isoformat() if d.updated_at else None,
    }


def _notice_to_dict(n: ComplianceNotice) -> dict:
    return {
        "id": n.id,
        "projectId": n.project_id,
        "type": n.type.value,
        "status": n.status.value,
        "title": n.title,
        "content": n.content,
        "recipientName": n.recipient_name,
        "recipientEmail": n.recipient_email,
        "dueDate": n.due_date.isoformat() if n.due_date else None,
        "sentAt": n.sent_at.isoformat() if n.sent_at else None,
        "acknowledgedAt": n.acknowledged_at.isoformat() if n.acknowledged_at else None,
        "clauseId": n.clause_id,
        "deliveryMethods": n.delivery_methods,
        "deliveryConfirmation": n.delivery_confirmation,
        "deliveredAt": n.delivered_at.isoformat() if n.delivered_at else None,
        "onTimeStatus": n.on_time_status,
        "generatedByAI": n.generated_by_ai,
        "aiModel": n.ai_model,
        "reviewedBy": n.reviewed_by,
        "reviewedAt": n.reviewed_at.isoformat() if n.reviewed_at else None,
        "approvedBy": n.approved_by,
        "approvedAt": n.approved_at.isoformat() if n.approved_at else None,
        "createdById": n.created_by_id,
        "createdAt": n.created_at.isoformat() if n.created_at else None,
        "updatedAt": n.updated_at.isoformat() if n.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Parse Contract
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/compliance/parse-contract")
async def parse_contract(
    project_id: str,
    body: ParseContractRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Extract compliance clauses from a contract document using AI."""
    await _verify_project(db, project_id)

    try:
        clauses = await extract_clauses_from_document(
            db, project_id, body.document_id, user.id
        )
        await db.commit()
        return {
            "data": {
                "clausesExtracted": len(clauses),
                "clauses": [_clause_to_dict(c) for c in clauses],
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        await db.rollback()
        logger.exception("Parse contract failed")
        raise HTTPException(status_code=500, detail="Failed to extract clauses")


# ---------------------------------------------------------------------------
# Clauses
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/compliance/clauses")
async def list_clauses(
    project_id: str,
    kind: str | None = Query(default=None),
    confirmed: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List contract clauses for a project."""
    await _verify_project(db, project_id)

    clause_kind = None
    if kind:
        try:
            clause_kind = ContractClauseKind(kind)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid kind: {kind}")

    clauses = await get_clauses_for_project(
        db, project_id, kind=clause_kind, confirmed_only=confirmed or False
    )
    return {"data": [_clause_to_dict(c) for c in clauses]}


@router.get("/projects/{project_id}/compliance/clauses/{clause_id}")
async def get_clause(
    project_id: str,
    clause_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single contract clause."""
    result = await db.execute(
        select(ContractClause).where(
            ContractClause.id == clause_id,
            ContractClause.project_id == project_id,
        )
    )
    clause = result.scalar_one_or_none()
    if not clause:
        raise HTTPException(status_code=404, detail="Clause not found")
    return {"data": _clause_to_dict(clause)}


@router.patch("/projects/{project_id}/compliance/clauses/{clause_id}/confirm")
async def confirm_clause_endpoint(
    project_id: str,
    clause_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Confirm a clause as reviewed and accurate."""
    clause = await confirm_clause(db, clause_id, project_id, user.id)
    if not clause:
        raise HTTPException(status_code=404, detail="Clause not found")
    await db.commit()
    await db.refresh(clause)
    return {"data": _clause_to_dict(clause)}


# ---------------------------------------------------------------------------
# Deadlines
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/compliance/deadlines")
async def list_deadlines(
    project_id: str,
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List compliance deadlines for a project."""
    await _verify_project(db, project_id)

    dl_status = None
    if status:
        try:
            dl_status = DeadlineStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    dl_severity = None
    if severity:
        try:
            dl_severity = Severity(severity)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid severity: {severity}")

    deadlines = await get_deadlines(db, project_id, status=dl_status, severity=dl_severity)

    # Attach clause info
    result_list = []
    for d in deadlines:
        d_dict = _deadline_to_dict(d)
        # Eagerly load clause title
        if d.clause_id:
            clause_result = await db.execute(
                select(ContractClause.title, ContractClause.kind, ContractClause.section_ref)
                .where(ContractClause.id == d.clause_id)
            )
            clause_row = clause_result.one_or_none()
            if clause_row:
                d_dict["clauseTitle"] = clause_row[0]
                d_dict["clauseKind"] = clause_row[1].value if clause_row[1] else None
                d_dict["clauseSectionRef"] = clause_row[2]
        result_list.append(d_dict)

    return {"data": result_list}


@router.post("/projects/{project_id}/compliance/deadlines")
async def create_deadline_endpoint(
    project_id: str,
    body: CreateDeadlineRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new compliance deadline."""
    await _verify_project(db, project_id)

    try:
        trigger_type = TriggerEventType(body.trigger_event_type)
    except ValueError:
        raise HTTPException(
            status_code=400, detail=f"Invalid trigger event type: {body.trigger_event_type}"
        )

    deadline = await create_deadline(
        db,
        project_id=project_id,
        clause_id=body.clause_id,
        trigger_event_type=trigger_type,
        trigger_description=body.trigger_description,
        triggered_at=_strip_tz(body.triggered_at),
        trigger_event_id=body.trigger_event_id,
        triggered_by=user.id,
    )
    if not deadline:
        raise HTTPException(status_code=400, detail="Failed to create deadline — check clause parameters")

    await db.commit()
    await db.refresh(deadline)
    return {"data": _deadline_to_dict(deadline)}


@router.get("/projects/{project_id}/compliance/deadlines/{deadline_id}")
async def get_single_deadline(
    project_id: str,
    deadline_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single compliance deadline."""
    deadline = await get_deadline_by_id(db, deadline_id, project_id)
    if not deadline:
        raise HTTPException(status_code=404, detail="Deadline not found")
    return {"data": _deadline_to_dict(deadline)}


@router.post("/projects/{project_id}/compliance/deadlines/{deadline_id}/waive")
async def waive_deadline_endpoint(
    project_id: str,
    deadline_id: str,
    body: WaiveDeadlineRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Waive a compliance deadline with a reason."""
    deadline = await waive_deadline(
        db, deadline_id, project_id, user.id, body.reason
    )
    if not deadline:
        raise HTTPException(status_code=404, detail="Deadline not found")
    await db.commit()
    await db.refresh(deadline)
    return {"data": _deadline_to_dict(deadline)}


# ---------------------------------------------------------------------------
# Notices
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/compliance/notices")
async def list_notices(
    project_id: str,
    status: str | None = Query(default=None),
    type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List compliance notices for a project."""
    await _verify_project(db, project_id)

    notice_status = None
    if status:
        try:
            notice_status = ComplianceNoticeStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    notice_type = None
    if type:
        try:
            notice_type = ComplianceNoticeType(type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid type: {type}")

    notices = await get_notices(db, project_id, status=notice_status, notice_type=notice_type)
    return {"data": [_notice_to_dict(n) for n in notices]}


@router.post("/projects/{project_id}/compliance/notices")
async def create_notice_endpoint(
    project_id: str,
    body: CreateNoticeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new compliance notice (with optional AI draft)."""
    await _verify_project(db, project_id)

    try:
        notice_type = ComplianceNoticeType(body.type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid notice type: {body.type}")

    # Generate content with AI if requested
    content = ""
    ai_model = None
    if body.generate_with_ai and body.clause_id:
        if not body.trigger_description or not body.trigger_date or not body.deadline_date:
            raise HTTPException(
                status_code=400,
                detail="triggerDescription, triggerDate, and deadlineDate required for AI generation",
            )
        draft = await generate_notice_draft(
            db,
            project_id=project_id,
            clause_id=body.clause_id,
            trigger_description=body.trigger_description,
            trigger_date=_strip_tz(body.trigger_date),
            deadline_date=_strip_tz(body.deadline_date),
            notice_type=notice_type,
            user_id=user.id,
            additional_context=body.additional_context or "",
        )
        content = draft["content"]
        ai_model = draft["model"]
    else:
        content = body.title  # Placeholder — user will edit

    # Get GC contact from project if not provided
    recipient_name = body.recipient_name
    recipient_email = body.recipient_email
    if not recipient_name or not recipient_email:
        project = await _verify_project(db, project_id)
        recipient_name = recipient_name or project.gc_contact_name
        recipient_email = recipient_email or project.gc_contact_email

    notice = await create_notice(
        db,
        project_id=project_id,
        notice_type=notice_type,
        title=body.title,
        content=content,
        user_id=user.id,
        clause_id=body.clause_id,
        due_date=_strip_tz(body.deadline_date),
        recipient_name=recipient_name,
        recipient_email=recipient_email,
        deadline_id=body.deadline_id,
    )

    # Set AI fields if generated
    if ai_model:
        notice.generated_by_ai = True
        notice.ai_model = ai_model
        await db.flush()

    await db.commit()
    await db.refresh(notice)
    return {"data": _notice_to_dict(notice)}


@router.get("/projects/{project_id}/compliance/notices/{notice_id}")
async def get_single_notice(
    project_id: str,
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a single compliance notice."""
    notice = await get_notice_by_id(db, notice_id, project_id)
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    return {"data": _notice_to_dict(notice)}


@router.patch("/projects/{project_id}/compliance/notices/{notice_id}")
async def update_notice_endpoint(
    project_id: str,
    notice_id: str,
    body: UpdateNoticeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a compliance notice (DRAFT/PENDING_REVIEW only for content)."""
    try:
        notice = await update_notice(
            db,
            notice_id=notice_id,
            project_id=project_id,
            user_id=user.id,
            title=body.title,
            content=body.content,
            recipient_name=body.recipient_name,
            recipient_email=body.recipient_email,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")

    # Handle status change separately
    if body.status:
        try:
            new_status = ComplianceNoticeStatus(body.status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {body.status}")

        if new_status == ComplianceNoticeStatus.ACKNOWLEDGED and not notice.acknowledged_at:
            notice.acknowledged_at = datetime.utcnow()
            notice.on_time_status = True
        notice.status = new_status

    await db.commit()
    await db.refresh(notice)
    return {"data": _notice_to_dict(notice)}


@router.delete("/projects/{project_id}/compliance/notices/{notice_id}")
async def delete_notice_endpoint(
    project_id: str,
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a compliance notice (DRAFT/PENDING_REVIEW only)."""
    try:
        deleted = await delete_notice(db, notice_id, project_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not deleted:
        raise HTTPException(status_code=404, detail="Notice not found")

    await db.commit()
    return {"data": {"success": True}}


@router.post("/projects/{project_id}/compliance/notices/{notice_id}/send")
async def send_notice_endpoint(
    project_id: str,
    notice_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a compliance notice via email."""
    try:
        notice = await send_notice(db, notice_id, project_id, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")

    await db.commit()
    await db.refresh(notice)
    return {"data": _notice_to_dict(notice)}


@router.post("/projects/{project_id}/compliance/notices/{notice_id}/confirm-delivery")
async def confirm_delivery_endpoint(
    project_id: str,
    notice_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Confirm delivery of a sent notice with tracking info."""
    method = body.get("method")
    if not method:
        raise HTTPException(status_code=400, detail="method is required")

    valid_methods = ["EMAIL", "CERTIFIED_MAIL", "REGISTERED_MAIL", "HAND_DELIVERY", "FAX", "COURIER"]
    if method not in valid_methods:
        raise HTTPException(status_code=400, detail=f"Invalid method. Use: {', '.join(valid_methods)}")

    delivered_at_raw = body.get("deliveredAt")
    delivered_at = None
    if delivered_at_raw:
        try:
            delivered_at = _strip_tz(datetime.fromisoformat(delivered_at_raw))
        except ValueError:
            pass

    try:
        notice = await confirm_delivery(
            db,
            notice_id=notice_id,
            project_id=project_id,
            user_id=user.id,
            method=method,
            tracking_number=body.get("trackingNumber"),
            carrier=body.get("carrier"),
            delivered_at=delivered_at,
            signed_by=body.get("signedBy"),
            received_by=body.get("receivedBy"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")

    await db.commit()
    await db.refresh(notice)
    return {"data": _notice_to_dict(notice)}


@router.post("/projects/{project_id}/compliance/notices/{notice_id}/regenerate")
async def regenerate_notice_endpoint(
    project_id: str,
    notice_id: str,
    body: dict | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Regenerate notice content using AI."""
    custom_instructions = None
    if body:
        custom_instructions = body.get("customInstructions")

    try:
        result = await regenerate_notice_draft(
            db,
            notice_id=notice_id,
            project_id=project_id,
            user_id=user.id,
            custom_instructions=custom_instructions,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.commit()
    return {"data": result}


# ---------------------------------------------------------------------------
# Score
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/compliance/score")
async def get_score(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get current compliance score for a project."""
    await _verify_project(db, project_id)

    score = await calculate_score(db, project_id)
    await db.commit()
    await db.refresh(score)

    return {
        "data": {
            "id": score.id,
            "projectId": score.project_id,
            "score": score.score,
            "details": score.details,
            "currentStreak": score.current_streak,
            "bestStreak": score.best_streak,
            "streakBrokenAt": score.streak_broken_at.isoformat() if score.streak_broken_at else None,
            "protectedClaimsValue": str(score.protected_claims_value),
            "atRiskValue": str(score.at_risk_value),
            "onTimeCount": score.on_time_count,
            "totalCount": score.total_count,
            "missedCount": score.missed_count,
            "atRiskCount": score.at_risk_count,
            "activeCount": score.active_count,
            "upcomingCount": score.upcoming_count,
            "lastCalculatedAt": score.last_calculated_at.isoformat() if score.last_calculated_at else None,
        }
    }


@router.get("/projects/{project_id}/compliance/score/history")
async def get_score_history_endpoint(
    project_id: str,
    period: str = Query(default="month"),
    limit: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get compliance score history for trending."""
    await _verify_project(db, project_id)

    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period. Use: {', '.join(VALID_PERIODS)}",
        )

    # Map period to period_type used in DB
    period_type_map = {
        "week": "daily",
        "month": "daily",
        "quarter": "weekly",
        "year": "monthly",
    }
    period_type = period_type_map.get(period, "daily")

    history = await get_score_history(db, project_id, period_type=period_type, limit=limit)

    return {
        "data": {
            "history": [
                {
                    "id": h.id,
                    "snapshotDate": h.snapshot_date.isoformat() if h.snapshot_date else None,
                    "compliancePercentage": str(h.compliance_percentage) if h.compliance_percentage else None,
                    "onTimeCount": h.on_time_count,
                    "totalCount": h.total_count,
                    "noticesSentInPeriod": h.notices_sent_in_period,
                    "protectedClaimsValue": str(h.protected_claims_value),
                    "periodType": h.period_type,
                }
                for h in history
            ],
        }
    }


@router.post("/projects/{project_id}/compliance/score/recalculate")
async def recalculate_score_endpoint(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Force recalculation of compliance score."""
    await _verify_project(db, project_id)

    score = await calculate_score(db, project_id)
    await db.commit()
    await db.refresh(score)

    return {
        "data": {
            "id": score.id,
            "projectId": score.project_id,
            "score": score.score,
            "details": score.details,
            "currentStreak": score.current_streak,
            "bestStreak": score.best_streak,
            "onTimeCount": score.on_time_count,
            "totalCount": score.total_count,
            "missedCount": score.missed_count,
            "atRiskCount": score.at_risk_count,
            "activeCount": score.active_count,
            "lastCalculatedAt": score.last_calculated_at.isoformat() if score.last_calculated_at else None,
        }
    }


# ---------------------------------------------------------------------------
# Compliance Search
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/compliance/search")
async def compliance_search(
    project_id: str,
    q: str = Query(..., min_length=1),
    types: str | None = Query(default=None),
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search compliance data (clauses, deadlines, notices) by keyword."""
    await _verify_project(db, project_id)

    valid_types = ["contract_clause", "compliance_deadline", "compliance_notice"]
    type_list = None
    if types:
        type_list = [t.strip() for t in types.split(",") if t.strip() in valid_types]

    results = await search_compliance_data(
        db,
        project_id=project_id,
        query=q.strip(),
        types=type_list if type_list else None,
        status_filter=status,
        severity_filter=severity,
    )

    return {"data": {"results": results, "total": len(results)}}


# ---------------------------------------------------------------------------
# Holidays
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}/compliance/holidays")
async def list_holidays(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List project holidays."""
    await _verify_project(db, project_id)

    result = await db.execute(
        select(ProjectHoliday)
        .where(ProjectHoliday.project_id == project_id)
        .order_by(ProjectHoliday.date.asc())
    )
    holidays = result.scalars().all()

    return {
        "data": [
            {
                "id": h.id,
                "date": h.date.isoformat() if h.date else None,
                "name": h.name,
                "description": h.description,
                "recurring": h.recurring,
                "source": h.source,
            }
            for h in holidays
        ]
    }


@router.post("/projects/{project_id}/compliance/holidays")
async def create_holiday(
    project_id: str,
    body: CreateHolidayRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a project-specific holiday."""
    await _verify_project(db, project_id)

    try:
        holiday_date = date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    holiday = ProjectHoliday(
        project_id=project_id,
        date=holiday_date,
        name=body.name,
        description=body.description,
        recurring=body.recurring,
        source="MANUAL",
    )
    db.add(holiday)

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Holiday already exists for this date")

    await db.refresh(holiday)
    return {
        "data": {
            "id": holiday.id,
            "date": holiday.date.isoformat() if holiday.date else None,
            "name": holiday.name,
            "description": holiday.description,
            "recurring": holiday.recurring,
            "source": holiday.source,
        }
    }


@router.delete("/projects/{project_id}/compliance/holidays/{holiday_id}")
async def delete_holiday(
    project_id: str,
    holiday_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a project holiday."""
    result = await db.execute(
        select(ProjectHoliday).where(
            ProjectHoliday.id == holiday_id,
            ProjectHoliday.project_id == project_id,
        )
    )
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    await db.delete(holiday)
    await db.commit()
    return {"data": {"success": True}}
