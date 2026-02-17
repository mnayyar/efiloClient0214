-- CreateEnum
CREATE TYPE "DeadlineStatus" AS ENUM ('ACTIVE', 'NOTICE_DRAFTED', 'NOTICE_SENT', 'COMPLETED', 'EXPIRED', 'WAIVED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'INFO', 'WARNING', 'CRITICAL', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TriggerEventType" AS ENUM ('CHANGE_ORDER', 'RFI', 'SCHEDULE_DELAY', 'DISCOVERY', 'DIRECTIVE', 'CLAIM', 'DEFECT', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('EMAIL', 'CERTIFIED_MAIL', 'REGISTERED_MAIL', 'HAND_DELIVERY', 'FAX', 'COURIER');

-- AlterTable: ComplianceNotice - add delivery tracking, AI tracking, approval workflow
ALTER TABLE "ComplianceNotice" ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiPromptVersion" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryConfirmation" JSONB,
ADD COLUMN     "deliveryMethods" TEXT[],
ADD COLUMN     "generatedByAI" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onTimeStatus" BOOLEAN,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT;

-- AlterTable: ComplianceScore - add streak, claims value, counts
ALTER TABLE "ComplianceScore" ADD COLUMN     "activeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "atRiskCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "atRiskValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "bestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "missedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onTimeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "protectedClaimsValue" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "streakBrokenAt" TIMESTAMP(3),
ADD COLUMN     "totalCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "upcomingCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: ContractClause - add trigger, cure period, flow-down, review status
ALTER TABLE "ContractClause" ADD COLUMN     "confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedBy" TEXT,
ADD COLUMN     "curePeriodDays" INTEGER,
ADD COLUMN     "curePeriodType" "DeadlineType",
ADD COLUMN     "flowDownProvisions" TEXT,
ADD COLUMN     "parentClauseRef" TEXT,
ADD COLUMN     "requiresReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trigger" TEXT;

-- NOTE: Intentionally NOT dropping DocumentChunk.embedding or its HNSW index.
-- That column is managed via raw SQL (pgvector) and is not in the Prisma schema.

-- CreateTable: ComplianceDeadline
CREATE TABLE "ComplianceDeadline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clauseId" TEXT NOT NULL,
    "triggerEventType" "TriggerEventType" NOT NULL,
    "triggerEventId" TEXT,
    "triggerDescription" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "triggeredBy" TEXT,
    "calculatedDeadline" TIMESTAMP(3) NOT NULL,
    "deadlineTimezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "status" "DeadlineStatus" NOT NULL DEFAULT 'ACTIVE',
    "severity" "Severity" NOT NULL DEFAULT 'LOW',
    "noticeId" TEXT,
    "noticeCreatedAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "waivedBy" TEXT,
    "waiverReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectHoliday
CREATE TABLE "ProjectHoliday" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ComplianceScoreHistory
CREATE TABLE "ComplianceScoreHistory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "compliancePercentage" DECIMAL(5,2),
    "onTimeCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "noticesSentInPeriod" INTEGER NOT NULL DEFAULT 0,
    "protectedClaimsValue" DECIMAL(15,2) NOT NULL,
    "periodType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ComplianceAuditLog
CREATE TABLE "ComplianceAuditLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceDeadline_projectId_idx" ON "ComplianceDeadline"("projectId");
CREATE INDEX "ComplianceDeadline_status_idx" ON "ComplianceDeadline"("status");
CREATE INDEX "ComplianceDeadline_severity_idx" ON "ComplianceDeadline"("severity");
CREATE INDEX "ComplianceDeadline_calculatedDeadline_idx" ON "ComplianceDeadline"("calculatedDeadline");

-- CreateIndex
CREATE INDEX "ProjectHoliday_projectId_idx" ON "ProjectHoliday"("projectId");
CREATE INDEX "ProjectHoliday_date_idx" ON "ProjectHoliday"("date");
CREATE UNIQUE INDEX "ProjectHoliday_projectId_date_key" ON "ProjectHoliday"("projectId", "date");

-- CreateIndex
CREATE INDEX "ComplianceScoreHistory_projectId_idx" ON "ComplianceScoreHistory"("projectId");
CREATE INDEX "ComplianceScoreHistory_snapshotDate_idx" ON "ComplianceScoreHistory"("snapshotDate");
CREATE UNIQUE INDEX "ComplianceScoreHistory_projectId_snapshotDate_periodType_key" ON "ComplianceScoreHistory"("projectId", "snapshotDate", "periodType");

-- CreateIndex
CREATE INDEX "ComplianceAuditLog_projectId_idx" ON "ComplianceAuditLog"("projectId");
CREATE INDEX "ComplianceAuditLog_entityType_entityId_idx" ON "ComplianceAuditLog"("entityType", "entityId");
CREATE INDEX "ComplianceAuditLog_eventType_idx" ON "ComplianceAuditLog"("eventType");
CREATE INDEX "ComplianceAuditLog_createdAt_idx" ON "ComplianceAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ComplianceDeadline" ADD CONSTRAINT "ComplianceDeadline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDeadline" ADD CONSTRAINT "ComplianceDeadline_clauseId_fkey" FOREIGN KEY ("clauseId") REFERENCES "ContractClause"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHoliday" ADD CONSTRAINT "ProjectHoliday_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceScoreHistory" ADD CONSTRAINT "ComplianceScoreHistory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAuditLog" ADD CONSTRAINT "ComplianceAuditLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
