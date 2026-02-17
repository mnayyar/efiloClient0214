# PHASE2_PARSING.md - Contract Clause Extraction with AI

## Objective
Build the AI-powered contract parsing pipeline that extracts notice provisions from uploaded contracts and populates the EXISTING `ContractClause` model.

## Duration: 4-5 days

## Prerequisites
- Phase 1 schema enhancements complete
- Existing document ingestion pipeline works
- Claude API access configured

## IMPORTANT: Use Existing Models

You are working with the EXISTING `ContractClause` model. Check `prisma/schema.prisma` for its current structure before writing any code.

---

## Step 1: Review Existing ContractClause Model

The existing model likely has:
- `id`, `projectId`, `project`
- `kind` (ContractClauseKind enum)
- `title`, `content`, `sectionRef`
- `deadlineDays`, `deadlineType`, `noticeMethod`
- `aiExtracted`, `aiModel`, `sourceDocId`

Phase 1 should have added:
- `trigger`, `curePeriodDays`, `curePeriodType`
- `flowDownProvisions`, `parentClauseRef`
- `requiresReview`, `confirmed`, `confirmedAt`, `confirmedBy`

---

## Step 2: Create Contract Type Detection

Create `src/compliance/parsing/contractTypes.ts`:

```typescript
export const CONTRACT_TYPES = {
  AIA_A401_2017: {
    name: 'AIA A401-2017',
    patterns: [
      'AIA Document A401',
      'A401-2017',
      'Standard Form of Agreement Between Contractor and Subcontractor',
    ],
  },
  CONSENSUSDOCS_750: {
    name: 'ConsensusDocs 750',
    patterns: [
      'ConsensusDocs 750',
      'CONSENSUSDOCS',
      'Cost of the Work Plus a Fee',
    ],
  },
  CUSTOM: {
    name: 'Custom Contract',
    patterns: [],
  },
} as const;

export type ContractType = keyof typeof CONTRACT_TYPES;

export function detectContractType(contractText: string): ContractType {
  const lower = contractText.toLowerCase();

  for (const pattern of CONTRACT_TYPES.AIA_A401_2017.patterns) {
    if (lower.includes(pattern.toLowerCase())) return 'AIA_A401_2017';
  }

  for (const pattern of CONTRACT_TYPES.CONSENSUSDOCS_750.patterns) {
    if (lower.includes(pattern.toLowerCase())) return 'CONSENSUSDOCS_750';
  }

  return 'CUSTOM';
}
```

---

## Step 3: Create Claude Prompts

Create `src/compliance/parsing/prompts.ts`:

```typescript
export const CLAUSE_EXTRACTION_SYSTEM_PROMPT = `You are a construction contract specialist analyzing notice and claim provisions.

Extract ALL notice/claim requirements from contracts, including:
- Notice of claims (general)
- Notice of delays
- Notice of differing/concealed conditions
- Notice of change order disputes
- Notice of defects
- Any other formal notice requirements

For EACH notice provision found, extract:
1. Clause reference (e.g., "§4.3.1", "Article 8.1.2")
2. Notice type (claim notice, delay notice, concealed condition, etc.)
3. Deadline days and type (calendar or business days)
4. Method of notice (certified mail, email, written, etc.)
5. What triggers the deadline
6. Cure period if any
7. Ambiguities (mark for human review)

CRITICAL RULES:
- ONLY extract actual contract language, don't infer
- If deadline is "prompt" or "immediately", set deadlineDays to 2
- If ambiguous, mark requiresReview: true`;

export function generateExtractionPrompt(contractText: string, contractType: string): string {
  return `CONTRACT TYPE: ${contractType}

CONTRACT TEXT:
${contractText}

Return JSON only (no markdown):
{
  "clauses": [
    {
      "sectionRef": "§4.3.1",
      "title": "Claim Notice",
      "kind": "CLAIMS_PROCEDURE",
      "deadlineDays": 21,
      "deadlineType": "CALENDAR_DAYS",
      "noticeMethod": "CERTIFIED_MAIL",
      "trigger": "Upon discovery of event giving rise to claim",
      "curePeriodDays": null,
      "flowDownProvisions": null,
      "requiresReview": false,
      "notes": "Standard AIA language"
    }
  ],
  "ambiguities": []
}

Valid "kind" values: NOTICE_REQUIREMENTS, CLAIMS_PROCEDURE, CHANGE_ORDER_PROCESS, DISPUTE_RESOLUTION, TERMINATION, WARRANTY, INDEMNIFICATION
Valid "deadlineType" values: CALENDAR_DAYS, BUSINESS_DAYS, HOURS
Valid "noticeMethod" values: WRITTEN_NOTICE, CERTIFIED_MAIL, EMAIL, HAND_DELIVERY, REGISTERED_MAIL`;
}
```

---

## Step 4: Create Parser Service

Create `src/compliance/parsing/parser.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { CLAUSE_EXTRACTION_SYSTEM_PROMPT, generateExtractionPrompt } from './prompts';
import { detectContractType } from './contractTypes';

const prisma = new PrismaClient();
const anthropic = new Anthropic();

interface ParseContractParams {
  projectId: string;
  documentId: string;
  contractText: string;
  contractType?: string;
}

export async function parseContract(params: ParseContractParams) {
  const { projectId, documentId, contractText, contractType } = params;

  // Detect contract type
  const detectedType = contractType || detectContractType(contractText);

  // Call Claude API
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: CLAUSE_EXTRACTION_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: generateExtractionPrompt(contractText.slice(0, 100000), detectedType),
    }],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in response');
  }

  const result = JSON.parse(textContent.text);

  // Create ContractClause records using EXISTING model
  const createdClauses = [];
  
  for (const parsed of result.clauses) {
    const clause = await prisma.contractClause.create({
      data: {
        projectId,
        kind: parsed.kind,
        title: parsed.title,
        content: parsed.notes || '',
        sectionRef: parsed.sectionRef,
        deadlineDays: parsed.deadlineDays,
        deadlineType: parsed.deadlineType,
        noticeMethod: parsed.noticeMethod,
        trigger: parsed.trigger,
        curePeriodDays: parsed.curePeriodDays,
        flowDownProvisions: parsed.flowDownProvisions,
        requiresReview: parsed.requiresReview || false,
        confirmed: !parsed.requiresReview,
        confirmedAt: !parsed.requiresReview ? new Date() : null,
        aiExtracted: true,
        aiModel: 'claude-sonnet-4-20250514',
        sourceDocId: documentId,
      },
    });
    createdClauses.push(clause);
  }

  // Log to audit
  await prisma.complianceAuditLog.create({
    data: {
      projectId,
      eventType: 'CONTRACT_PARSED',
      entityType: 'Document',
      entityId: documentId,
      actorType: 'AI',
      action: 'parsed',
      details: {
        contractType: detectedType,
        clausesFound: createdClauses.length,
        ambiguousCount: result.ambiguities?.length || 0,
      },
    },
  });

  return {
    clauses: createdClauses,
    requiresReviewCount: createdClauses.filter((c) => c.requiresReview).length,
    contractType: detectedType,
  };
}

export async function confirmClause(clauseId: string, userId: string, updates?: any) {
  return prisma.contractClause.update({
    where: { id: clauseId },
    data: {
      ...updates,
      requiresReview: false,
      confirmed: true,
      confirmedAt: new Date(),
      confirmedBy: userId,
    },
  });
}

export async function getProjectClauses(projectId: string, filters?: any) {
  return prisma.contractClause.findMany({
    where: {
      projectId,
      ...(filters?.kind && { kind: filters.kind }),
      ...(filters?.requiresReview !== undefined && { requiresReview: filters.requiresReview }),
    },
    orderBy: { createdAt: 'desc' },
  });
}
```

---

## Step 5: Create API Endpoints

Create `src/compliance/api/clauses.ts`:

```typescript
import { Router } from 'express';
import { parseContract, confirmClause, getProjectClauses } from '../parsing/parser';

const router = Router();

// POST /api/projects/:projectId/compliance/parse-contract
router.post('/projects/:projectId/compliance/parse-contract', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { documentId, contractText, contractType } = req.body;

    const result = await parseContract({
      projectId,
      documentId,
      contractText,
      contractType,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: 'Failed to parse contract' });
  }
});

// GET /api/projects/:projectId/compliance/clauses
router.get('/projects/:projectId/compliance/clauses', async (req, res) => {
  try {
    const { projectId } = req.params;
    const clauses = await getProjectClauses(projectId, req.query);
    res.json({ success: true, data: { clauses } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch clauses' });
  }
});

// PATCH /api/projects/:projectId/compliance/clauses/:clauseId/confirm
router.patch('/projects/:projectId/compliance/clauses/:clauseId/confirm', async (req, res) => {
  try {
    const { clauseId } = req.params;
    const userId = req.user?.id;
    await confirmClause(clauseId, userId, req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm clause' });
  }
});

export default router;
```

---

## Verification Checklist

- [ ] Uses EXISTING `ContractClause` model structure
- [ ] Contract type detection works
- [ ] Claude API parses clauses correctly
- [ ] Clauses saved with correct enum values (match existing enums)
- [ ] Audit log entries created
- [ ] API endpoints work
- [ ] Existing clause data not affected

---

## Next Phase

Proceed to **PHASE3_DEADLINES.md** for deadline calculation engine.
