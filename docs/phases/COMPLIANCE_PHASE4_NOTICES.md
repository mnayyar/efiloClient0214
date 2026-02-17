# PHASE4_NOTICES.md - Notice Generation and Delivery

## Objective
Build the AI-powered notice letter generation, multi-method delivery tracking, and delivery confirmation workflow using the EXISTING `ComplianceNotice` model.

## Duration: 5-6 days

## Prerequisites
- Phase 1-3 complete
- ComplianceDeadline records exist
- Email service configured
- Claude API access for letter generation

## IMPORTANT: Use Existing Model

The `ComplianceNotice` model already exists in your schema. Phase 1 added new fields for delivery tracking. Review `prisma/schema.prisma` before implementing.

Existing fields: `id`, `projectId`, `type`, `status`, `title`, `content`, `recipientName`, `recipientEmail`, `dueDate`, `sentAt`, `acknowledgedAt`, `clauseId`, `createdById`

New fields from Phase 1: `deliveryMethods`, `deliveryConfirmation`, `deliveredAt`, `onTimeStatus`, `generatedByAI`, `aiModel`

---

## Task 1: Create Notice Generator Service

Create `src/compliance/notices/generator.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient, ClauseKind, NoticeStatus, DeliveryMethod } from '@prisma/client';
import {
  NOTICE_LETTER_SYSTEM_PROMPT,
  generateNoticeLetterPrompt,
} from '../parsing/prompts';

const prisma = new PrismaClient();
const anthropic = new Anthropic();

interface CreateNoticeParams {
  projectId: string;
  deadlineId: string;
  clauseId: string;
  triggerEventType: string;
  triggerDescription: string;
  recipientName: string;
  recipientTitle?: string;
  recipientOrg?: string;
  recipientEmail?: string;
  recipientFax?: string;
  recipientAddress?: string;
  attachments?: string[];
  generateWithAI?: boolean;
}

/**
 * Create a new compliance notice with AI-generated letter
 */
export async function createNotice(params: CreateNoticeParams) {
  const {
    projectId,
    deadlineId,
    clauseId,
    generateWithAI = true,
    ...noticeData
  } = params;

  // Get clause and deadline details
  const clause = await prisma.contractClause.findUnique({
    where: { id: clauseId },
    include: { contract: true, project: { include: { organization: true } } },
  });

  const deadline = await prisma.complianceDeadline.findUnique({
    where: { id: deadlineId },
  });

  if (!clause || !deadline) {
    throw new Error('Clause or deadline not found');
  }

  // Generate letter content with AI
  let letterContent = '';
  let aiModel: string | undefined;

  if (generateWithAI) {
    const result = await generateNoticeLetter(clause, deadline, noticeData);
    letterContent = result.letterContent;
    aiModel = result.aiModel;
  }

  // Get required delivery methods from clause
  const deliveryMethods = parseDeliveryMethods(clause.deadlineMethod);

  // Create notice record
  const notice = await prisma.complianceNotice.create({
    data: {
      projectId,
      clauseId,
      deadlineId,
      type: clause.kind,
      letterContent,
      attachments: noticeData.attachments || [],
      recipientName: noticeData.recipientName,
      recipientTitle: noticeData.recipientTitle,
      recipientOrg: noticeData.recipientOrg,
      recipientEmail: noticeData.recipientEmail,
      recipientFax: noticeData.recipientFax,
      recipientAddress: noticeData.recipientAddress,
      deliveryMethods,
      status: 'DRAFT',
      dueDate: deadline.calculatedDeadline,
      generatedByAI: generateWithAI,
      aiModel,
    },
  });

  // Update deadline
  await prisma.complianceDeadline.update({
    where: { id: deadlineId },
    data: { status: 'NOTICE_DRAFTED', noticeId: notice.id, noticeCreatedAt: new Date() },
  });

  // Audit log
  await prisma.complianceAuditLog.create({
    data: {
      projectId,
      eventType: 'NOTICE_DRAFTED',
      entityType: 'ComplianceNotice',
      entityId: notice.id,
      actorType: generateWithAI ? 'AI' : 'USER',
      action: 'created',
      details: { clauseRef: clause.clauseRef, generatedByAI: generateWithAI },
    },
  });

  return {
    id: notice.id,
    type: clause.kind,
    status: notice.status,
    dueDate: deadline.calculatedDeadline,
    letterContent,
    deliveryMethods,
    generatedByAI: generateWithAI,
  };
}

/**
 * Generate notice letter using Claude
 */
async function generateNoticeLetter(clause: any, deadline: any, noticeData: any) {
  const project = clause.project;
  const org = project?.organization;

  const prompt = generateNoticeLetterPrompt({
    clauseRef: clause.clauseRef,
    clauseKind: clause.kind,
    deadlineDays: clause.deadlineDays,
    deadlineType: clause.deadlineType,
    trigger: clause.trigger,
    method: clause.deadlineMethod,
    contractType: clause.contract?.type || 'Custom',
    triggerEventType: deadline.triggerEventType,
    triggerDescription: deadline.triggerDescription,
    eventDate: deadline.triggeredAt.toISOString().split('T')[0],
    triggeredBy: deadline.triggeredBy || 'Project Manager',
    attachments: noticeData.attachments || [],
    projectName: project?.name || '[PROJECT NAME]',
    projectAddress: project?.address || '[PROJECT ADDRESS]',
    contractNumber: clause.contract?.number || '[CONTRACT NUMBER]',
    contractDate: clause.contract?.date?.toISOString().split('T')[0] || '[CONTRACT DATE]',
    ourOrgName: org?.name || '[YOUR ORGANIZATION]',
    ourRepName: '[YOUR NAME]',
    ourRepTitle: '[YOUR TITLE]',
    ourPhone: org?.phone || '[PHONE]',
    ourEmail: org?.email || '[EMAIL]',
    recipientName: noticeData.recipientName,
    recipientTitle: noticeData.recipientTitle || '',
    recipientOrg: noticeData.recipientOrg || '',
    recipientAddress: noticeData.recipientAddress || '',
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: NOTICE_LETTER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text content in Claude response');
  }

  return { letterContent: textContent.text, aiModel: 'claude-sonnet-4-20250514' };
}

/**
 * Parse delivery method string to enum array
 */
function parseDeliveryMethods(methodString: string): DeliveryMethod[] {
  const methods: DeliveryMethod[] = [];
  const lower = methodString.toLowerCase();

  if (lower.includes('email') || lower.includes('electronic')) methods.push('EMAIL');
  if (lower.includes('certified')) methods.push('CERTIFIED_MAIL');
  if (lower.includes('registered')) methods.push('REGISTERED_MAIL');
  if (lower.includes('hand') || lower.includes('personal')) methods.push('HAND_DELIVERY');
  if (lower.includes('fax')) methods.push('FAX');
  if (lower.includes('courier') || lower.includes('fedex') || lower.includes('ups')) methods.push('COURIER');

  // Default to email + certified mail
  if (methods.length === 0) {
    methods.push('EMAIL', 'CERTIFIED_MAIL');
  }

  return methods;
}

/**
 * Regenerate notice letter with AI
 */
export async function regenerateNoticeLetter(noticeId: string, customInstructions?: string) {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
    include: {
      clause: { include: { contract: true, project: { include: { organization: true } } } },
      deadline: true,
    },
  });

  if (!notice) throw new Error('Notice not found');

  // Regenerate with Claude
  const result = await generateNoticeLetter(notice.clause, notice.deadline, {
    recipientName: notice.recipientName,
    recipientTitle: notice.recipientTitle,
    recipientOrg: notice.recipientOrg,
    recipientAddress: notice.recipientAddress,
    attachments: notice.attachments,
  });

  await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: { letterContent: result.letterContent, generatedByAI: true, aiModel: result.aiModel },
  });

  return { letterContent: result.letterContent };
}

/**
 * Update notice content manually
 */
export async function updateNoticeContent(noticeId: string, letterContent: string, userId: string) {
  const notice = await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: { letterContent, reviewedBy: userId, reviewedAt: new Date() },
  });

  await prisma.complianceAuditLog.create({
    data: {
      projectId: notice.projectId,
      eventType: 'NOTICE_EDITED',
      entityType: 'ComplianceNotice',
      entityId: noticeId,
      userId,
      actorType: 'USER',
      action: 'updated',
      details: { field: 'letterContent' },
    },
  });
}
```

---

## Task 2: Create Delivery Service

Create `src/compliance/notices/delivery.ts`:

```typescript
import { PrismaClient, NoticeStatus, DeliveryMethod } from '@prisma/client';
import { sendEmail } from '../../email/service';

const prisma = new PrismaClient();

interface DeliveryConfirmation {
  email?: { sentAt: string; messageId: string; provider: string; status: string; deliveredAt?: string };
  certifiedMail?: { sentAt: string; trackingNumber: string; carrier: string; status: string; deliveredAt?: string; signedBy?: string };
  handDelivery?: { deliveredAt: string; receivedBy: string };
  fax?: { sentAt: string; confirmationNumber: string; status: string };
  courier?: { sentAt: string; trackingNumber: string; carrier: string; status: string; deliveredAt?: string };
}

/**
 * Send notice via specified delivery methods
 */
export async function sendNotice(noticeId: string, methods: DeliveryMethod[], userId: string) {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
    include: { deadline: true, clause: true },
  });

  if (!notice) throw new Error('Notice not found');

  const sentMethods: DeliveryMethod[] = [];
  const failedMethods: DeliveryMethod[] = [];
  const deliveryConfirmation: DeliveryConfirmation = {};

  for (const method of methods) {
    try {
      switch (method) {
        case 'EMAIL':
          if (notice.recipientEmail) {
            const emailResult = await sendEmail({
              to: notice.recipientEmail,
              subject: `NOTICE: ${notice.clause.clauseTitle}`,
              body: notice.letterContent,
              requestReadReceipt: true,
            });
            deliveryConfirmation.email = {
              sentAt: new Date().toISOString(),
              messageId: emailResult.messageId,
              provider: emailResult.provider,
              status: 'pending',
            };
            sentMethods.push(method);
          }
          break;

        case 'CERTIFIED_MAIL':
          deliveryConfirmation.certifiedMail = {
            sentAt: new Date().toISOString(),
            trackingNumber: 'PENDING_USER_INPUT',
            carrier: 'USPS',
            status: 'pending',
          };
          sentMethods.push(method);
          break;

        case 'HAND_DELIVERY':
          deliveryConfirmation.handDelivery = {
            deliveredAt: 'PENDING_CONFIRMATION',
            receivedBy: 'PENDING_CONFIRMATION',
          };
          sentMethods.push(method);
          break;

        default:
          sentMethods.push(method);
      }
    } catch (error) {
      console.error(`Failed to send via ${method}:`, error);
      failedMethods.push(method);
    }
  }

  const newStatus = sentMethods.length > 0 ? 'SENT' : 'DRAFT';

  await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: {
      status: newStatus,
      sentDate: sentMethods.length > 0 ? new Date() : null,
      deliveryConfirmation: deliveryConfirmation as any,
      deliveryMethods: sentMethods,
    },
  });

  if (sentMethods.length > 0) {
    await prisma.complianceDeadline.update({
      where: { id: notice.deadlineId },
      data: { status: 'NOTICE_SENT' },
    });
  }

  await prisma.complianceAuditLog.create({
    data: {
      projectId: notice.projectId,
      eventType: 'NOTICE_SENT',
      entityType: 'ComplianceNotice',
      entityId: noticeId,
      userId,
      actorType: 'USER',
      action: 'sent',
      details: { sentMethods, failedMethods },
    },
  });

  return { success: sentMethods.length > 0, sentMethods, failedMethods };
}

/**
 * Confirm delivery for a specific method
 */
export async function confirmDelivery(
  noticeId: string,
  method: DeliveryMethod,
  confirmation: {
    trackingNumber?: string;
    carrier?: string;
    deliveredAt?: string;
    signedBy?: string;
    receivedBy?: string;
  },
  userId: string
) {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
    include: { deadline: true },
  });

  if (!notice) throw new Error('Notice not found');

  const existing = (notice.deliveryConfirmation as DeliveryConfirmation) || {};

  // Update specific method
  switch (method) {
    case 'EMAIL':
      existing.email = { ...existing.email!, status: 'delivered', deliveredAt: confirmation.deliveredAt || new Date().toISOString() };
      break;
    case 'CERTIFIED_MAIL':
      existing.certifiedMail = {
        ...existing.certifiedMail!,
        trackingNumber: confirmation.trackingNumber || '',
        carrier: confirmation.carrier || 'USPS',
        status: 'delivered',
        deliveredAt: confirmation.deliveredAt || new Date().toISOString(),
        signedBy: confirmation.signedBy,
      };
      break;
    case 'HAND_DELIVERY':
      existing.handDelivery = {
        deliveredAt: confirmation.deliveredAt || new Date().toISOString(),
        receivedBy: confirmation.receivedBy || '',
      };
      break;
  }

  // Check if all methods delivered
  const allDelivered = notice.deliveryMethods.every((m) => {
    switch (m) {
      case 'EMAIL': return existing.email?.status === 'delivered';
      case 'CERTIFIED_MAIL': return existing.certifiedMail?.status === 'delivered';
      case 'HAND_DELIVERY': return !!existing.handDelivery?.receivedBy && existing.handDelivery.receivedBy !== 'PENDING_CONFIRMATION';
      default: return true;
    }
  });

  const onTimeStatus = notice.sentDate! <= notice.dueDate;

  await prisma.complianceNotice.update({
    where: { id: noticeId },
    data: {
      deliveryConfirmation: existing as any,
      status: allDelivered ? 'DELIVERED' : 'SENT',
      deliveredAt: allDelivered ? new Date() : null,
      onTimeStatus: allDelivered ? onTimeStatus : null,
    },
  });

  if (allDelivered) {
    await prisma.complianceDeadline.update({
      where: { id: notice.deadlineId },
      data: { status: 'COMPLETED' },
    });

    // Update compliance score (Phase 5)
    await updateComplianceScore(notice.projectId, onTimeStatus);
  }

  await prisma.complianceAuditLog.create({
    data: {
      projectId: notice.projectId,
      eventType: 'DELIVERY_CONFIRMED',
      entityType: 'ComplianceNotice',
      entityId: noticeId,
      userId,
      actorType: 'USER',
      action: 'delivery_confirmed',
      details: { method, allDelivered, onTimeStatus: allDelivered ? onTimeStatus : undefined },
    },
  });
}

async function updateComplianceScore(projectId: string, onTime: boolean) {
  // Placeholder - implemented in Phase 5
  console.log(`Updating compliance score for ${projectId}, on-time: ${onTime}`);
}

/**
 * Get notice with delivery status
 */
export async function getNoticeWithDeliveryStatus(noticeId: string) {
  const notice = await prisma.complianceNotice.findUnique({
    where: { id: noticeId },
    include: { clause: true, deadline: true },
  });

  if (!notice) return null;

  const confirmation = notice.deliveryConfirmation as DeliveryConfirmation;

  return {
    ...notice,
    deliveryStatus: notice.deliveryMethods.map((method) => ({
      method,
      status: getMethodStatus(method, confirmation),
      details: confirmation[method.toLowerCase() as keyof DeliveryConfirmation],
    })),
  };
}

function getMethodStatus(method: DeliveryMethod, conf: DeliveryConfirmation): string {
  switch (method) {
    case 'EMAIL': return conf.email?.status || 'pending';
    case 'CERTIFIED_MAIL': return conf.certifiedMail?.status || 'pending';
    case 'HAND_DELIVERY': return conf.handDelivery?.receivedBy ? 'delivered' : 'pending';
    default: return 'pending';
  }
}
```

---

## Task 3: Create API Endpoints

Create `src/compliance/api/notices.ts`:

```typescript
import { Router, Request, Response } from 'express';
import { createNotice, regenerateNoticeLetter, updateNoticeContent } from '../notices/generator';
import { sendNotice, confirmDelivery, getNoticeWithDeliveryStatus } from '../notices/delivery';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/projects/:projectId/compliance/notices - Create notice
router.post('/projects/:projectId/compliance/notices', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const result = await createNotice({ projectId, ...req.body });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating notice:', error);
    res.status(500).json({ error: 'Failed to create notice' });
  }
});

// GET /api/projects/:projectId/compliance/notices - List notices
router.get('/projects/:projectId/compliance/notices', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { type, status, limit, offset } = req.query;

    const notices = await prisma.complianceNotice.findMany({
      where: { projectId, ...(type && { type: type as any }), ...(status && { status: status as any }) },
      include: { clause: { select: { clauseRef: true, clauseTitle: true } } },
      orderBy: { createdAt: 'desc' },
      take: Number(limit) || 50,
      skip: Number(offset) || 0,
    });

    res.json({ success: true, data: { notices, totalCount: notices.length } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notices' });
  }
});

// POST /api/projects/:projectId/compliance/notices/:noticeId/send - Send notice
router.post('/projects/:projectId/compliance/notices/:noticeId/send', async (req: Request, res: Response) => {
  try {
    const { noticeId } = req.params;
    const userId = req.user?.id;
    const { methods } = req.body;
    const result = await sendNotice(noticeId, methods, userId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send notice' });
  }
});

// POST /api/projects/:projectId/compliance/notices/:noticeId/confirm-delivery
router.post('/projects/:projectId/compliance/notices/:noticeId/confirm-delivery', async (req: Request, res: Response) => {
  try {
    const { noticeId } = req.params;
    const userId = req.user?.id;
    const { method, ...confirmation } = req.body;
    await confirmDelivery(noticeId, method, confirmation, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to confirm delivery' });
  }
});

// POST /api/projects/:projectId/compliance/notices/:noticeId/generate-letter
router.post('/projects/:projectId/compliance/notices/:noticeId/generate-letter', async (req: Request, res: Response) => {
  try {
    const { noticeId } = req.params;
    const result = await regenerateNoticeLetter(noticeId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to regenerate letter' });
  }
});

export default router;
```

---

## Task 4: Create Email Service Placeholder

Create `src/email/service.ts`:

```typescript
interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{ filename: string; content?: Buffer }>;
  requestReadReceipt?: boolean;
}

/**
 * Send email - integrate with your email provider
 */
export async function sendEmail(params: SendEmailParams) {
  // TODO: Replace with your actual email provider
  console.log(`Sending email to ${params.to}: ${params.subject}`);
  
  return {
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    provider: 'your-email-provider',
    status: 'sent',
  };
}
```

---

## Verification Checklist

- [ ] Notice creation with AI letter generation works
- [ ] Letter uses correct contract clause references
- [ ] Delivery method parsing extracts correct methods
- [ ] Send notice via email works
- [ ] Certified mail tracking number entry works
- [ ] Delivery confirmation updates notice status
- [ ] On-time status calculated correctly
- [ ] Deadline status updated when notice delivered
- [ ] API endpoints return proper responses
- [ ] Audit logs created for all notice actions

---

## Next Phase

Proceed to **PHASE5_DASHBOARD.md** for compliance scoring and dashboard.
