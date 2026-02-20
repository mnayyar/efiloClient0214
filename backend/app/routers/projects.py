"""Projects API routes.

Endpoints:
  GET    /api/projects              — List all projects
  POST   /api/projects              — Create project
  GET    /api/projects/{projectId}  — Get single project
  PATCH  /api/projects/{projectId}  — Update project
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies import get_current_user
from app.models.document import Document
from app.models.enums import ContractType, ProjectType
from app.models.project import Project
from app.models.rfi import RFI
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _project_to_dict(project: Project, doc_count: int = 0, rfi_count: int = 0) -> dict:
    """Serialize a Project model to the camelCase response dict."""
    return {
        "id": project.id,
        "projectCode": project.project_code,
        "name": project.name,
        "type": project.type.value if project.type else None,
        "contractType": project.contract_type.value if project.contract_type else None,
        "contractValue": float(project.contract_value) if project.contract_value else None,
        "status": project.status,
        "organizationId": project.organization_id,
        "gcCompanyName": project.gc_company_name,
        "gcContactName": project.gc_contact_name,
        "gcContactEmail": project.gc_contact_email,
        "gcContactPhone": project.gc_contact_phone,
        "architectName": project.architect_name,
        "architectEmail": project.architect_email,
        "architectPhone": project.architect_phone,
        "engineerName": project.engineer_name,
        "engineerEmail": project.engineer_email,
        "engineerPhone": project.engineer_phone,
        "ownerName": project.owner_name,
        "ownerEmail": project.owner_email,
        "ownerPhone": project.owner_phone,
        "_count": {"documents": doc_count, "rfis": rfi_count},
        "createdAt": project.created_at.isoformat() if project.created_at else None,
        "updatedAt": project.updated_at.isoformat() if project.updated_at else None,
    }


async def _get_project_with_counts(
    db: AsyncSession, project_id: str
) -> tuple[Project | None, int, int]:
    """Fetch a project with its document and RFI counts."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        return None, 0, 0

    doc_result = await db.execute(
        select(func.count()).select_from(Document).where(Document.project_id == project_id)
    )
    rfi_result = await db.execute(
        select(func.count()).select_from(RFI).where(RFI.project_id == project_id)
    )
    return project, doc_result.scalar() or 0, rfi_result.scalar() or 0


# ---------------------------------------------------------------------------
# GET /api/projects
# ---------------------------------------------------------------------------

@router.get("")
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all projects ordered by updatedAt desc, with doc/RFI counts."""
    result = await db.execute(
        select(Project).order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    # Batch-count documents and RFIs per project
    project_ids = [p.id for p in projects]

    doc_counts: dict[str, int] = {}
    rfi_counts: dict[str, int] = {}

    if project_ids:
        doc_result = await db.execute(
            select(Document.project_id, func.count())
            .where(Document.project_id.in_(project_ids))
            .group_by(Document.project_id)
        )
        for pid, cnt in doc_result.all():
            doc_counts[pid] = cnt

        rfi_result = await db.execute(
            select(RFI.project_id, func.count())
            .where(RFI.project_id.in_(project_ids))
            .group_by(RFI.project_id)
        )
        for pid, cnt in rfi_result.all():
            rfi_counts[pid] = cnt

    return {
        "data": [
            _project_to_dict(p, doc_counts.get(p.id, 0), rfi_counts.get(p.id, 0))
            for p in projects
        ]
    }


# ---------------------------------------------------------------------------
# POST /api/projects
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new project."""
    project = Project(
        project_code=body.project_code.upper(),
        name=body.name,
        type=ProjectType(body.type),
        contract_type=ContractType(body.contract_type) if body.contract_type else None,
        contract_value=body.contract_value,
        organization_id=user.organization_id,
        gc_company_name=body.gc_company_name,
        gc_contact_name=body.gc_contact_name,
        gc_contact_email=body.gc_contact_email,
        gc_contact_phone=body.gc_contact_phone,
        architect_name=body.architect_name,
        architect_email=body.architect_email,
        architect_phone=body.architect_phone,
        engineer_name=body.engineer_name,
        engineer_email=body.engineer_email,
        engineer_phone=body.engineer_phone,
        owner_name=body.owner_name,
        owner_email=body.owner_email,
        owner_phone=body.owner_phone,
    )
    db.add(project)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Project code already exists")

    return {"data": _project_to_dict(project, 0, 0)}


# ---------------------------------------------------------------------------
# GET /api/projects/{projectId}
# ---------------------------------------------------------------------------

@router.get("/{project_id}")
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fetch a single project by ID."""
    project, doc_count, rfi_count = await _get_project_with_counts(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"data": _project_to_dict(project, doc_count, rfi_count)}


# ---------------------------------------------------------------------------
# PATCH /api/projects/{projectId}
# ---------------------------------------------------------------------------

@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Partially update a project."""
    project, doc_count, rfi_count = await _get_project_with_counts(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Apply only provided fields
    update_data = body.model_dump(exclude_unset=True, by_alias=False)
    if not update_data:
        return {"data": _project_to_dict(project, doc_count, rfi_count)}

    for field, value in update_data.items():
        if field == "project_code" and value:
            value = value.upper()
        if field == "type" and value:
            value = ProjectType(value)
        if field == "contract_type" and value:
            value = ContractType(value)
        setattr(project, field, value)

    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Project code already exists")

    await db.refresh(project)
    return {"data": _project_to_dict(project, doc_count, rfi_count)}
