# PHASE1_DATABASE.md - Enhance Schema & Add Missing Models

## Objective
Enhance the existing Prisma schema with new fields and add missing models for the Compliance Engine. **Do NOT recreate existing models.**

## Duration: 2-3 days

## Prerequisites
- Read existing `prisma/schema.prisma` first
- Understand existing `ContractClause`, `ComplianceNotice`, `ComplianceScore` models
- Identify existing enums

---

## Step 1: Analyze Existing Schema

Before making ANY changes, read `prisma/schema.prisma` and confirm:

**Existing Models (DO NOT RECREATE):**
- [ ] `ContractClause` exists at ~line 467
- [ ] `ComplianceNotice` exists at ~line 523
- [ ] `ComplianceScore` exists at ~line 547
- [ ] `ChangeEvent` exists at ~line 611
- [ ] `RFI` exists at ~line 488
- [ ] `Project` exists at ~line 302

**Existing Enums (DO NOT RECREATE):**
- [ ] `ContractClauseKind` exists
- [ ] `ContractClauseMethod` exists
- [ ] `ComplianceNoticeType` exists
- [ ] `ComplianceNoticeStatus` exists
- [ ] `DeadlineType` exists

---

## Step 2: Add Missing Enums

Add these NEW enums (they don't exist yet):

```prisma
enum DeadlineStatus {
  ACTIVE          // Deadline is active, awaiting notice
  NOTICE_DRAFTED  // Notice has been drafted but not sent
  NOTICE_SENT     // Notice sent, awaiting delivery confirmation
  COMPLETED       // Notice delivered on time
  EXPIRED         // Deadline passed without notice
  WAIVED          // Deadline waived (not counted in score)
}

enum Severity {
  LOW       // > 14 days remaining
  INFO      // 7-14 days remaining
  WARNING   // 3-7 days remaining
  CRITICAL  // <= 3 days remaining
  EXPIRED   // Past deadline
}

enum TriggerEventType {
  CHANGE_ORDER      // Change order issued
  RFI               // RFI response received
  SCHEDULE_DELAY    // Schedule delay identified
  DISCOVERY         // Discovery of condition/issue
  DIRECTIVE         // Owner/GC directive
  CLAIM             // Claim filed
  DEFECT            // Defect discovered
  OTHER             // Other trigger
}

enum DeliveryMethod {
  EMAIL           // Electronic mail
  CERTIFIED_MAIL  // USPS certified mail
  REGISTERED_MAIL // USPS registered mail
  HAND_DELIVERY   // In-person delivery
  FAX             // Facsimile
  COURIER         // Express courier
}
```

---

## Step 3: Add ComplianceDeadline Model (NEW - Critical)

This is the **most important missing model** - the ticking clock feature:

```prisma
model ComplianceDeadline {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // Link to existing ContractClause
  clauseId String
  // Note: Add relation after checking ContractClause model structure

  // Trigger event details
  triggerEventType   TriggerEventType
  triggerEventId     String?  // Reference to ChangeEvent.id or RFI.id
  triggerDescription String
  triggeredAt        DateTime
  triggeredBy        String?  // userId

  // Calculated deadline
  calculatedDeadline DateTime
  deadlineTimezone   String   @default("America/Los_Angeles")

  // Status tracking
  status   DeadlineStatus @default(ACTIVE)
  severity Severity       @default(LOW)

  // Notice reference
  noticeId        String?
  noticeCreatedAt DateTime?

  // Waiver
  waivedAt     DateTime?
  waivedBy     String?
  waiverReason String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
  @@index([status])
  @@index([severity])
  @@index([calculatedDeadline])
}
```

---

## Step 4: Add ProjectHoliday Model (NEW)

For business day calculations:

```prisma
model ProjectHoliday {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  date        DateTime @db.Date
  name        String
  description String?
  recurring   Boolean  @default(false)
  source      String   @default("MANUAL")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
  @@index([date])
  @@unique([projectId, date])
}
```

---

## Step 5: Add ComplianceScoreHistory Model (NEW)

For trending charts:

```prisma
model ComplianceScoreHistory {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  snapshotDate         DateTime
  compliancePercentage Decimal? @db.Decimal(5, 2)
  onTimeCount          Int
  totalCount           Int
  noticesSentInPeriod  Int      @default(0)
  protectedClaimsValue Decimal  @db.Decimal(15, 2)
  periodType           String   // "daily", "weekly", "monthly"

  createdAt DateTime @default(now())

  @@index([projectId])
  @@index([snapshotDate])
  @@unique([projectId, snapshotDate, periodType])
}
```

---

## Step 6: Add ComplianceAuditLog Model (NEW)

For audit trail:

```prisma
model ComplianceAuditLog {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  eventType  String  // CLAUSE_PARSED, DEADLINE_CREATED, NOTICE_SENT, etc.
  entityType String  // ComplianceDeadline, ComplianceNotice, etc.
  entityId   String

  userId    String?
  userEmail String?
  actorType String  @default("USER") // USER, SYSTEM, AI

  action  String
  details Json?

  ipAddress String?
  userAgent String?

  createdAt DateTime @default(now())

  @@index([projectId])
  @@index([entityType, entityId])
  @@index([eventType])
  @@index([createdAt])
}
```

---

## Step 7: Enhance Existing ComplianceScore Model

Add new fields to the EXISTING `ComplianceScore` model. Find it in your schema and add these fields:

```prisma
// ADD these fields to existing ComplianceScore model:

  // Streak tracking
  currentStreak  Int       @default(0)
  bestStreak     Int       @default(0)
  streakBrokenAt DateTime?

  // Claims value
  protectedClaimsValue Decimal @default(0) @db.Decimal(15, 2)
  atRiskValue          Decimal @default(0) @db.Decimal(15, 2)

  // Counts
  onTimeCount   Int @default(0)
  totalCount    Int @default(0)
  missedCount   Int @default(0)
  atRiskCount   Int @default(0)
  activeCount   Int @default(0)
  upcomingCount Int @default(0)

  // Timestamp
  lastCalculatedAt DateTime @default(now())
```

---

## Step 8: Enhance Existing ComplianceNotice Model

Add delivery tracking fields to the EXISTING `ComplianceNotice` model:

```prisma
// ADD these fields to existing ComplianceNotice model:

  // Delivery tracking
  deliveryMethods      String[]  // Array of DeliveryMethod values
  deliveryConfirmation Json?     // Per-method confirmation details
  deliveredAt          DateTime?
  onTimeStatus         Boolean?  // true = on time, false = late

  // AI tracking
  generatedByAI   Boolean @default(false)
  aiModel         String?
  aiPromptVersion String?

  // Approval workflow
  reviewedBy   String?
  reviewedAt   DateTime?
  approvedBy   String?
  approvedAt   DateTime?
```

---

## Step 9: Enhance Existing ContractClause Model

Add fields for better clause tracking:

```prisma
// ADD these fields to existing ContractClause model:

  // Trigger definition
  trigger String?  // e.g., "Upon discovery of claim basis"

  // Cure period
  curePeriodDays Int?
  curePeriodType DeadlineType?

  // Flow-down
  flowDownProvisions String?
  parentClauseRef    String?

  // Review status
  requiresReview Boolean  @default(false)
  confirmed      Boolean  @default(false)
  confirmedAt    DateTime?
  confirmedBy    String?
```

---

## Step 10: Add Relations to Project Model

Find the existing `Project` model and add these relations:

```prisma
// ADD to existing Project model (in the relations section):

  complianceDeadlines    ComplianceDeadline[]
  complianceScoreHistory ComplianceScoreHistory[]
  complianceAuditLogs    ComplianceAuditLog[]
  projectHolidays        ProjectHoliday[]
```

---

## Step 11: Run Migration

```bash
npx prisma migrate dev --name add_compliance_deadline_and_enhancements
npx prisma generate
```

---

## Verification Checklist

- [ ] Existing models still intact (ContractClause, ComplianceNotice, ComplianceScore)
- [ ] New enums added (DeadlineStatus, Severity, TriggerEventType, DeliveryMethod)
- [ ] ComplianceDeadline model created
- [ ] ProjectHoliday model created
- [ ] ComplianceScoreHistory model created
- [ ] ComplianceAuditLog model created
- [ ] ComplianceScore enhanced with new fields
- [ ] ComplianceNotice enhanced with delivery tracking
- [ ] ContractClause enhanced with trigger/review fields
- [ ] Project relations added
- [ ] Migration runs without errors
- [ ] Existing app functionality still works

---

## Rollback Plan

If something breaks:
```bash
npx prisma migrate reset
# This will reset to last working state
# Then re-apply migrations carefully
```

---

## Next Phase

Once schema is updated, proceed to **PHASE2_PARSING.md** for contract clause extraction.
