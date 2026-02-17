# PHASE6_INTEGRATION.md - Integration with Existing Capabilities

## Objective
Connect the Compliance Engine with existing efilo capabilities: Universal Search, RFI Management, Change Events, and Project Health Dashboard.

## Duration: 3-4 days

## Prerequisites
- Phase 1-5 complete
- Existing Universal Search with pgvector working
- RFI Management module exists
- Project Health Dashboard exists

## IMPORTANT: Use Existing Models

Your schema already has these models - use them for integration:
- `RFI` - Link RFI creation to compliance deadlines
- `ChangeEvent` - Link change events to compliance deadlines
- `HealthScore` - Already has `complianceScore` field
- `SearchQuery` / `DocumentChunk` - For universal search integration
- `Notification` - For alerts

---

## Task 1: Integrate with Universal Search

Update your existing search service to include compliance data.

### Add Compliance to Search Index

Create `src/compliance/search/indexing.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ComplianceSearchDocument {
  id: string;
  type: 'contract_clause' | 'compliance_deadline' | 'compliance_notice';
  projectId: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

/**
 * Index a contract clause for search
 */
export async function indexContractClause(clauseId: string): Promise<ComplianceSearchDocument> {
  const clause = await prisma.contractClause.findUnique({
    where: { id: clauseId },
    include: { contract: true, project: true },
  });

  if (!clause) throw new Error('Clause not found');

  const document: ComplianceSearchDocument = {
    id: clause.id,
    type: 'contract_clause',
    projectId: clause.projectId,
    title: `${clause.clauseRef} - ${clause.clauseTitle}`,
    content: `Contract clause ${clause.clauseRef} (${clause.clauseTitle}) from ${clause.contract?.name || 'contract'}. 
    Type: ${clause.kind}. 
    Deadline: ${clause.deadlineDays} ${clause.deadlineType} days. 
    Trigger: ${clause.trigger}. 
    Method: ${clause.deadlineMethod}.
    ${clause.notes || ''}`,
    metadata: {
      clauseRef: clause.clauseRef,
      clauseTitle: clause.clauseTitle,
      kind: clause.kind,
      deadlineDays: clause.deadlineDays,
      deadlineType: clause.deadlineType,
      contractId: clause.contractId,
      contractName: clause.contract?.name,
    },
  };

  // Generate embedding using your existing embedding service
  // document.embedding = await generateEmbedding(document.content);

  return document;
}

/**
 * Index a compliance deadline for search
 */
export async function indexComplianceDeadline(deadlineId: string): Promise<ComplianceSearchDocument> {
  const deadline = await prisma.complianceDeadline.findUnique({
    where: { id: deadlineId },
    include: { clause: true, project: true },
  });

  if (!deadline) throw new Error('Deadline not found');

  const document: ComplianceSearchDocument = {
    id: deadline.id,
    type: 'compliance_deadline',
    projectId: deadline.projectId,
    title: `Deadline: ${deadline.clause.clauseTitle} (${deadline.clause.clauseRef})`,
    content: `Compliance deadline for ${deadline.clause.clauseTitle}. 
    ${deadline.triggerDescription}. 
    Due: ${deadline.calculatedDeadline.toISOString()}. 
    Status: ${deadline.status}. 
    Severity: ${deadline.severity}.`,
    metadata: {
      clauseId: deadline.clauseId,
      clauseRef: deadline.clause.clauseRef,
      calculatedDeadline: deadline.calculatedDeadline,
      status: deadline.status,
      severity: deadline.severity,
      triggerDescription: deadline.triggerDescription,
    },
  };

  return document;
}

/**
 * Index a compliance notice for search
 */
export async function indexComplianceNotice(noticeId: string): Promise<ComplianceSearchDocument> {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
    include: { clause: true, project: true },
  });

  if (!notice) throw new Error('Notice not found');

  const document: ComplianceSearchDocument = {
    id: notice.id,
    type: 'compliance_notice',
    projectId: notice.projectId,
    title: `Notice: ${notice.clause.clauseTitle} to ${notice.recipientName}`,
    content: `Compliance notice for ${notice.clause.clauseTitle} (${notice.clause.clauseRef}). 
    Recipient: ${notice.recipientName} at ${notice.recipientOrg || ''}. 
    Status: ${notice.status}. 
    Sent: ${notice.sentDate?.toISOString() || 'Not sent'}.
    ${notice.letterContent.substring(0, 500)}...`,
    metadata: {
      clauseId: notice.clauseId,
      clauseRef: notice.clause.clauseRef,
      recipientName: notice.recipientName,
      status: notice.status,
      sentDate: notice.sentDate,
      onTimeStatus: notice.onTimeStatus,
    },
  };

  return document;
}

/**
 * Reindex all compliance documents for a project
 */
export async function reindexProjectCompliance(projectId: string): Promise<{
  clauses: number;
  deadlines: number;
  notices: number;
}> {
  const clauses = await prisma.contractClause.findMany({ where: { projectId } });
  const deadlines = await prisma.complianceDeadline.findMany({ where: { projectId } });
  const notices = await prisma.complianceNotice.findMany({ where: { projectId } });

  // Index each document
  for (const clause of clauses) {
    await indexContractClause(clause.id);
  }
  for (const deadline of deadlines) {
    await indexComplianceDeadline(deadline.id);
  }
  for (const notice of notices) {
    await indexComplianceNotice(notice.id);
  }

  return {
    clauses: clauses.length,
    deadlines: deadlines.length,
    notices: notices.length,
  };
}
```

### Update Search Query Handler

Add to your existing search service:

```typescript
/**
 * Search compliance data
 */
export async function searchCompliance(
  projectId: string,
  query: string,
  filters?: {
    types?: ('contract_clause' | 'compliance_deadline' | 'compliance_notice')[];
    status?: string;
    severity?: string;
  }
): Promise<ComplianceSearchResult[]> {
  // Use your existing pgvector search
  // Filter by type and project
  
  const results = await prisma.$queryRaw`
    SELECT 
      id, type, title, content, metadata,
      1 - (embedding <=> ${queryEmbedding}::vector) as similarity
    FROM compliance_search_index
    WHERE project_id = ${projectId}
      AND (${filters?.types} IS NULL OR type = ANY(${filters.types}))
    ORDER BY similarity DESC
    LIMIT 20
  `;

  return results;
}
```

---

## Task 2: Integrate with RFI Management

When an RFI is created or has cost impact, automatically check if compliance deadlines are needed.

Create `src/compliance/integration/rfi.ts`:

```typescript
import { PrismaClient, TriggerEventType } from '@prisma/client';
import { createDeadline } from '../deadlines/service';

const prisma = new PrismaClient();

interface RFI {
  id: string;
  projectId: string;
  number: string;
  subject: string;
  description: string;
  costImpact: boolean;
  estimatedCost?: number;
  scheduleImpact: boolean;
  estimatedDelayDays?: number;
  createdAt: Date;
}

/**
 * Check if RFI triggers compliance deadlines
 */
export async function checkRFICompliance(rfi: RFI): Promise<{
  deadlinesCreated: number;
  deadlineIds: string[];
}> {
  const deadlineIds: string[] = [];

  // Get applicable clauses for the project
  const clauses = await prisma.contractClause.findMany({
    where: {
      projectId: rfi.projectId,
      confirmed: true,
    },
  });

  // Check for cost-related notices
  if (rfi.costImpact && rfi.estimatedCost && rfi.estimatedCost > 0) {
    // Find CLAIM_NOTICE or CHANGE_DISPUTE clauses
    const claimClauses = clauses.filter((c) =>
      ['CLAIM_NOTICE', 'CHANGE_DISPUTE'].includes(c.kind)
    );

    for (const clause of claimClauses) {
      const deadline = await createDeadline({
        projectId: rfi.projectId,
        clauseId: clause.id,
        triggerEventType: 'RFI',
        triggerEventId: rfi.id,
        triggerDescription: `RFI #${rfi.number}: ${rfi.subject} (Est. cost impact: $${rfi.estimatedCost.toLocaleString()})`,
        triggeredAt: rfi.createdAt,
      });
      deadlineIds.push(deadline.id);
    }
  }

  // Check for schedule-related notices
  if (rfi.scheduleImpact && rfi.estimatedDelayDays && rfi.estimatedDelayDays > 0) {
    // Find DELAY_NOTICE clauses
    const delayClauses = clauses.filter((c) => c.kind === 'DELAY_NOTICE');

    for (const clause of delayClauses) {
      const deadline = await createDeadline({
        projectId: rfi.projectId,
        clauseId: clause.id,
        triggerEventType: 'RFI',
        triggerEventId: rfi.id,
        triggerDescription: `RFI #${rfi.number}: ${rfi.subject} (Est. delay: ${rfi.estimatedDelayDays} days)`,
        triggeredAt: rfi.createdAt,
      });
      deadlineIds.push(deadline.id);
    }
  }

  return {
    deadlinesCreated: deadlineIds.length,
    deadlineIds,
  };
}

/**
 * Hook to call when RFI is created or updated
 */
export async function onRFICreated(rfiId: string): Promise<void> {
  // Get RFI from your existing RFI table
  const rfi = await prisma.rfi.findUnique({ where: { id: rfiId } });
  
  if (!rfi) return;

  const result = await checkRFICompliance(rfi as any);
  
  if (result.deadlinesCreated > 0) {
    console.log(`Created ${result.deadlinesCreated} compliance deadlines from RFI ${rfi.number}`);
  }
}

/**
 * Hook to call when RFI cost/schedule impact changes
 */
export async function onRFIUpdated(rfiId: string): Promise<void> {
  const rfi = await prisma.rfi.findUnique({ where: { id: rfiId } });
  
  if (!rfi) return;

  // Check if new deadlines needed
  // Avoid creating duplicates by checking existing deadlines
  const existingDeadlines = await prisma.complianceDeadline.findMany({
    where: {
      triggerEventId: rfiId,
      triggerEventType: 'RFI',
    },
  });

  if (existingDeadlines.length === 0) {
    await checkRFICompliance(rfi as any);
  }
}
```

---

## Task 3: Integrate with Change Events

Create `src/compliance/integration/changeEvents.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { createDeadline } from '../deadlines/service';

const prisma = new PrismaClient();

interface ChangeEvent {
  id: string;
  projectId: string;
  number: string;
  description: string;
  type: 'SCOPE_CHANGE' | 'DIRECTED_CHANGE' | 'CLAIM' | 'DIFFERING_CONDITION';
  value: number;
  status: string;
  createdAt: Date;
}

/**
 * Check if change event triggers compliance deadlines
 */
export async function checkChangeEventCompliance(change: ChangeEvent): Promise<{
  deadlinesCreated: number;
  deadlineIds: string[];
}> {
  const deadlineIds: string[] = [];

  // Get applicable clauses
  const clauses = await prisma.contractClause.findMany({
    where: { projectId: change.projectId, confirmed: true },
  });

  // Map change type to clause kind
  const clauseKindMap: Record<string, string[]> = {
    SCOPE_CHANGE: ['CLAIM_NOTICE', 'CHANGE_DISPUTE'],
    DIRECTED_CHANGE: ['CHANGE_DISPUTE', 'CLAIM_NOTICE'],
    CLAIM: ['CLAIM_NOTICE'],
    DIFFERING_CONDITION: ['CONCEALED_CONDITION'],
  };

  const targetKinds = clauseKindMap[change.type] || ['CLAIM_NOTICE'];
  const matchingClauses = clauses.filter((c) => targetKinds.includes(c.kind));

  for (const clause of matchingClauses) {
    // Check for existing deadline
    const existing = await prisma.complianceDeadline.findFirst({
      where: {
        triggerEventId: change.id,
        triggerEventType: 'CHANGE_ORDER',
        clauseId: clause.id,
      },
    });

    if (existing) continue;

    const deadline = await createDeadline({
      projectId: change.projectId,
      clauseId: clause.id,
      triggerEventType: 'CHANGE_ORDER',
      triggerEventId: change.id,
      triggerDescription: `Change #${change.number}: ${change.description} ($${change.value.toLocaleString()})`,
      triggeredAt: change.createdAt,
    });
    deadlineIds.push(deadline.id);
  }

  return {
    deadlinesCreated: deadlineIds.length,
    deadlineIds,
  };
}

/**
 * Hook for change event creation
 */
export async function onChangeEventCreated(changeId: string): Promise<void> {
  const change = await prisma.changeEvent?.findUnique({ where: { id: changeId } });
  if (!change) return;

  const result = await checkChangeEventCompliance(change as any);
  
  if (result.deadlinesCreated > 0) {
    console.log(`Created ${result.deadlinesCreated} compliance deadlines from Change Event ${change.number}`);
  }
}
```

---

## Task 4: Integrate with Project Health Dashboard

Add compliance score as a weighted component of overall project health.

Create `src/compliance/integration/projectHealth.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { getComplianceScore } from '../scoring/calculator';

const prisma = new PrismaClient();

interface ProjectHealthMetrics {
  overall: number; // 0-100
  components: {
    name: string;
    score: number;
    weight: number;
    status: 'good' | 'warning' | 'critical';
  }[];
}

/**
 * Get compliance component for project health
 */
export async function getComplianceHealthComponent(projectId: string): Promise<{
  name: string;
  score: number;
  weight: number;
  status: 'good' | 'warning' | 'critical';
  details: Record<string, any>;
}> {
  const score = await getComplianceScore(projectId);

  // Compliance is 20% of overall project health
  const weight = 0.20;

  // Calculate component score (0-100)
  let componentScore = 100;

  if (score.compliancePercentage !== null) {
    componentScore = score.compliancePercentage;
  }

  // Penalize for at-risk deadlines
  if (score.atRiskCount > 0) {
    componentScore = Math.max(0, componentScore - score.atRiskCount * 5);
  }

  // Determine status
  let status: 'good' | 'warning' | 'critical' = 'good';
  if (componentScore < 80 || score.atRiskCount > 2) {
    status = 'warning';
  }
  if (componentScore < 60 || score.atRiskCount > 5) {
    status = 'critical';
  }

  return {
    name: 'Contract Compliance',
    score: componentScore,
    weight,
    status,
    details: {
      compliancePercentage: score.compliancePercentage,
      onTimeCount: score.onTimeCount,
      totalCount: score.totalCount,
      currentStreak: score.currentStreak,
      protectedClaimsValue: score.protectedClaimsValue,
      atRiskCount: score.atRiskCount,
    },
  };
}

/**
 * Add compliance to overall project health calculation
 */
export async function calculateProjectHealthWithCompliance(
  projectId: string,
  existingComponents: Array<{ name: string; score: number; weight: number }>
): Promise<ProjectHealthMetrics> {
  // Get compliance component
  const complianceComponent = await getComplianceHealthComponent(projectId);

  // Add to existing components
  const allComponents = [
    ...existingComponents,
    complianceComponent,
  ];

  // Normalize weights
  const totalWeight = allComponents.reduce((sum, c) => sum + c.weight, 0);
  
  // Calculate weighted average
  const overall = allComponents.reduce(
    (sum, c) => sum + (c.score * c.weight) / totalWeight,
    0
  );

  return {
    overall: Math.round(overall),
    components: allComponents.map((c) => ({
      name: c.name,
      score: Math.round(c.score),
      weight: c.weight,
      status: c.score >= 80 ? 'good' : c.score >= 60 ? 'warning' : 'critical',
    })),
  };
}
```

---

## Task 5: Create Event Hooks

Create `src/compliance/integration/hooks.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { onRFICreated, onRFIUpdated } from './rfi';
import { onChangeEventCreated } from './changeEvents';
import { indexContractClause, indexComplianceDeadline, indexComplianceNotice } from '../search/indexing';

const prisma = new PrismaClient();

/**
 * Register event hooks for compliance integration
 */
export function registerComplianceHooks(): void {
  // These would integrate with your event system (e.g., database triggers, message queue)
  
  console.log('Compliance hooks registered');
}

/**
 * Event handler for various entity events
 */
export async function handleComplianceEvent(
  eventType: string,
  entityType: string,
  entityId: string
): Promise<void> {
  switch (`${eventType}:${entityType}`) {
    // RFI events
    case 'created:RFI':
      await onRFICreated(entityId);
      break;
    case 'updated:RFI':
      await onRFIUpdated(entityId);
      break;

    // Change event events
    case 'created:ChangeEvent':
      await onChangeEventCreated(entityId);
      break;

    // Contract clause events - update search index
    case 'created:ContractClause':
    case 'updated:ContractClause':
      await indexContractClause(entityId);
      break;

    // Deadline events - update search index
    case 'created:ComplianceDeadline':
    case 'updated:ComplianceDeadline':
      await indexComplianceDeadline(entityId);
      break;

    // Notice events - update search index
    case 'created:ComplianceNotice':
    case 'updated:ComplianceNotice':
      await indexComplianceNotice(entityId);
      break;

    default:
      // Unknown event type
      break;
  }
}

/**
 * Middleware to trigger compliance checks on entity updates
 */
export function complianceMiddleware() {
  // Add Prisma middleware to automatically check compliance
  prisma.$use(async (params, next) => {
    const result = await next(params);

    // After create/update, check if compliance action needed
    if (params.action === 'create' && params.model === 'RFI') {
      await handleComplianceEvent('created', 'RFI', result.id);
    }

    if (params.action === 'create' && params.model === 'ChangeEvent') {
      await handleComplianceEvent('created', 'ChangeEvent', result.id);
    }

    return result;
  });
}
```

---

## Task 6: API Integration Routes

Create `src/compliance/api/integration.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { searchCompliance, reindexProjectCompliance } from '../search/indexing';
import { getComplianceHealthComponent } from '../integration/projectHealth';
import { checkRFICompliance } from '../integration/rfi';
import { checkChangeEventCompliance } from '../integration/changeEvents';

const router = Router();

// GET /api/projects/:projectId/compliance/search
router.get('/projects/:projectId/compliance/search', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { q, types, status, severity } = req.query;

    const results = await searchCompliance(projectId, q as string, {
      types: types ? (types as string).split(',') as any : undefined,
      status: status as string,
      severity: severity as string,
    });

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// POST /api/projects/:projectId/compliance/reindex
router.post('/projects/:projectId/compliance/reindex', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const result = await reindexProjectCompliance(projectId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Reindex failed' });
  }
});

// GET /api/projects/:projectId/health/compliance
router.get('/projects/:projectId/health/compliance', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const component = await getComplianceHealthComponent(projectId);
    res.json({ success: true, data: component });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get compliance health' });
  }
});

// POST /api/projects/:projectId/rfi/:rfiId/check-compliance
router.post('/projects/:projectId/rfi/:rfiId/check-compliance', async (req: Request, res: Response) => {
  try {
    const { projectId, rfiId } = req.params;
    const rfi = await prisma.rfi.findUnique({ where: { id: rfiId } });
    if (!rfi) return res.status(404).json({ error: 'RFI not found' });

    const result = await checkRFICompliance(rfi as any);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Compliance check failed' });
  }
});

export default router;
```

---

## Task 7: Update Main Router

Add compliance routes to your main Express router:

```typescript
import clausesRouter from './compliance/api/clauses';
import deadlinesRouter from './compliance/api/deadlines';
import noticesRouter from './compliance/api/notices';
import scoresRouter from './compliance/api/scores';
import integrationRouter from './compliance/api/integration';

// Mount compliance routes
app.use('/api', clausesRouter);
app.use('/api', deadlinesRouter);
app.use('/api', noticesRouter);
app.use('/api', scoresRouter);
app.use('/api', integrationRouter);
```

---

## Verification Checklist

- [ ] Compliance data searchable via Universal Search
- [ ] Contract clauses indexed with embeddings
- [ ] RFI creation triggers compliance deadline check
- [ ] Change events trigger compliance deadline check
- [ ] Compliance contributes 20% to project health score
- [ ] Event hooks registered for entity updates
- [ ] Integration API endpoints working
- [ ] Search results include compliance documents
- [ ] Project health dashboard shows compliance component

---

## Final Integration Testing

Run these integration tests to verify everything works together:

1. **RFI → Compliance Flow**
   - Create RFI with cost impact
   - Verify compliance deadline created automatically
   - Verify searchable in Universal Search

2. **Change Event → Compliance Flow**
   - Create Change Event
   - Verify appropriate notice deadlines created
   - Verify protected claims value updates

3. **Project Health Score**
   - Check project health dashboard
   - Verify compliance component shows correctly
   - Verify weight is 20% of total

4. **End-to-End Notice Flow**
   - Contract uploaded → clauses parsed
   - RFI created → deadline triggered
   - Notice drafted → sent → delivered
   - Score updated → appears in project health

---

## Production Readiness Checklist

- [ ] All database migrations applied
- [ ] Cron jobs scheduled (hourly severity, daily snapshot, weekly summary)
- [ ] Email service configured for notifications
- [ ] Search index populated
- [ ] API authentication/authorization in place
- [ ] Error handling and logging
- [ ] Performance monitoring
- [ ] Backup and recovery tested
