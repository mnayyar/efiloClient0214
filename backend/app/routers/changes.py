"""Change event API routes.

POST /api/projects/{project_id}/changes/{change_id}/check-compliance
    — Check if a change event triggers compliance deadlines
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.change import ChangeEvent
from app.models.user import User
from app.services.compliance.integrations import trigger_change_event_compliance

logger = logging.getLogger(__name__)

router = APIRouter(tags=["changes"])


@router.post("/projects/{project_id}/changes/{change_id}/check-compliance")
async def check_change_compliance(
    project_id: str,
    change_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check if a change event triggers compliance deadlines."""
    # Verify change event belongs to this project
    result = await db.execute(
        select(ChangeEvent).where(
            ChangeEvent.id == change_id,
            ChangeEvent.project_id == project_id,
        )
    )
    change = result.scalar_one_or_none()
    if not change:
        raise HTTPException(status_code=404, detail="Change event not found in this project")

    deadlines = await trigger_change_event_compliance(
        db,
        project_id=project_id,
        change_event_id=change_id,
        change_description=f"{change.type.value.replace('_', ' ')}: {change.title}",
        user_id=user.id,
    )

    await db.commit()

    return {
        "data": {
            "deadlinesCreated": len(deadlines),
            "deadlineIds": [d.id for d in deadlines],
        }
    }
