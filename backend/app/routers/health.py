"""Health check endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.project import Project
from app.models.user import User
from app.services.compliance.integrations import get_compliance_health_component

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(db: AsyncSession = Depends(get_db)) -> dict:
    """Health check — verifies DB connectivity."""
    result = await db.execute(text("SELECT 1"))
    row = result.scalar()
    return {
        "status": "healthy",
        "database": "connected" if row == 1 else "error",
        "service": "efilo-api",
        "version": "0.1.0",
    }


@router.get("/projects/{project_id}/health/compliance")
async def compliance_health(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get compliance health component for the project health dashboard."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    component = await get_compliance_health_component(db, project_id)
    await db.commit()
    return {"data": component}
