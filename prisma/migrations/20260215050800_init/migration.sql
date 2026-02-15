-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'FIELD_ENGINEER', 'ESTIMATOR', 'EXECUTIVE', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('COMMERCIAL', 'INDUSTRIAL', 'INSTITUTIONAL', 'RESIDENTIAL', 'INFRASTRUCTURE');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('LUMP_SUM', 'GMP', 'COST_PLUS', 'UNIT_PRICE', 'TIME_AND_MATERIAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('SPEC', 'DRAWING', 'ADDENDUM', 'RFI', 'CONTRACT', 'CHANGE', 'COMPLIANCE', 'MEETING', 'FINANCIAL', 'SCHEDULE', 'CLOSEOUT', 'PORTFOLIO');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "RFIStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_GC', 'OPEN', 'ANSWERED', 'CLOSED', 'VOID');

-- CreateEnum
CREATE TYPE "RFIPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplianceNoticeType" AS ENUM ('NOTICE_TO_PROCEED', 'CHANGE_ORDER_NOTICE', 'DELAY_NOTICE', 'CLAIM_NOTICE', 'CURE_NOTICE', 'TERMINATION_NOTICE', 'LIEN_NOTICE', 'WARRANTY_NOTICE');

-- CreateEnum
CREATE TYPE "ComplianceNoticeStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'SENT', 'ACKNOWLEDGED', 'EXPIRED', 'VOID');

-- CreateEnum
CREATE TYPE "HealthScorePosture" AS ENUM ('GREEN', 'MONITOR', 'ESCALATE', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ChangeEventStatus" AS ENUM ('IDENTIFIED', 'EVALUATING', 'PCO_SUBMITTED', 'COR_APPROVED', 'CO_EXECUTED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "ChangeEventType" AS ENUM ('SCOPE_CHANGE', 'DESIGN_ERROR', 'UNFORESEEN_CONDITION', 'OWNER_DIRECTIVE', 'SCHEDULE_IMPACT', 'REGULATORY');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('OAC', 'FOREMAN', 'SAFETY', 'COORDINATION', 'PRECONSTRUCTION', 'CLOSEOUT');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'PREP_READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TalkingPointPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CloseoutCategory" AS ENUM ('DOCUMENTATION', 'FINANCIAL', 'WARRANTY', 'PUNCHLIST', 'TRAINING', 'SPARE_PARTS', 'REGULATORY');

-- CreateEnum
CREATE TYPE "CloseoutItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RetentionConditionStatus" AS ENUM ('PENDING', 'MET', 'WAIVED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('COMPLIANCE_DEADLINE', 'RFI_RESPONSE_DUE', 'RFI_OVERDUE', 'ACTION_ITEM_DUE', 'HEALTH_SCORE_ALERT', 'CO_POTENTIAL_DETECTED', 'DOCUMENT_PROCESSED', 'MEETING_PREP_READY', 'VERSION_MISMATCH', 'CONFLICT_DETECTED');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SLACK');

-- CreateEnum
CREATE TYPE "SearchScope" AS ENUM ('PROJECT', 'CROSS_PROJECT');

-- CreateEnum
CREATE TYPE "ContractClauseKind" AS ENUM ('PAYMENT_TERMS', 'CHANGE_ORDER_PROCESS', 'CLAIMS_PROCEDURE', 'DISPUTE_RESOLUTION', 'NOTICE_REQUIREMENTS', 'RETENTION', 'WARRANTY', 'INSURANCE', 'INDEMNIFICATION', 'TERMINATION', 'FORCE_MAJEURE', 'LIQUIDATED_DAMAGES', 'SCHEDULE', 'SAFETY', 'GENERAL_CONDITIONS', 'SUPPLEMENTARY_CONDITIONS');

-- CreateEnum
CREATE TYPE "ContractClauseMethod" AS ENUM ('WRITTEN_NOTICE', 'CERTIFIED_MAIL', 'EMAIL', 'HAND_DELIVERY', 'REGISTERED_MAIL');

-- CreateEnum
CREATE TYPE "DeadlineType" AS ENUM ('CALENDAR_DAYS', 'BUSINESS_DAYS', 'HOURS');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#C67F17',
    "billingEmail" TEXT NOT NULL,
    "maxProjects" INTEGER NOT NULL DEFAULT 100,
    "maxUsers" INTEGER NOT NULL DEFAULT 50,
    "workosOrgId" TEXT,
    "ssoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ssoProvider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "workosUserId" TEXT,
    "avatar" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "contractType" "ContractType",
    "contractValue" DECIMAL(65,30),
    "status" TEXT NOT NULL DEFAULT 'active',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADING',
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL,
    "pageCount" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "sectionRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "revisionDate" TIMESTAMP(3) NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "changeLog" TEXT,
    "diffJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "query" TEXT NOT NULL,
    "scope" "SearchScope" NOT NULL DEFAULT 'PROJECT',
    "documentTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "response" TEXT,
    "sources" JSONB,
    "responseTime" INTEGER,
    "tokenCount" INTEGER,
    "embeddingTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT,
    "messages" JSONB NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchAnalytics" (
    "id" TEXT NOT NULL,
    "queryId" TEXT,
    "userId" TEXT NOT NULL,
    "searchTerm" TEXT NOT NULL,
    "scope" "SearchScope" NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "clickedResult" TEXT,
    "userFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractClause" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ContractClauseKind" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sectionRef" TEXT,
    "deadlineDays" INTEGER,
    "deadlineType" "DeadlineType",
    "noticeMethod" "ContractClauseMethod",
    "aiExtracted" BOOLEAN NOT NULL DEFAULT true,
    "aiModel" TEXT,
    "sourceDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractClause_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFI" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rfiNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "RFIStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "RFIPriority" NOT NULL DEFAULT 'MEDIUM',
    "assignedTo" TEXT,
    "dueDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "response" TEXT,
    "aiDraftQuestion" TEXT,
    "aiDraftModel" TEXT,
    "aiResponseAnalysis" TEXT,
    "coFlag" BOOLEAN NOT NULL DEFAULT false,
    "coEstimate" DECIMAL(65,30),
    "isOverdue" BOOLEAN NOT NULL DEFAULT false,
    "sourceDocIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceChunkIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RFI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceNotice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ComplianceNoticeType" NOT NULL,
    "status" "ComplianceNoticeStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "dueDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "clauseId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceScore" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthScore" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "posture" "HealthScorePosture" NOT NULL,
    "costScore" INTEGER NOT NULL,
    "scheduleScore" INTEGER NOT NULL,
    "complianceScore" INTEGER NOT NULL,
    "changeExposureScore" INTEGER NOT NULL,
    "coordinationScore" INTEGER NOT NULL,
    "narrative" TEXT,
    "aiModel" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WIPReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "contractValue" DECIMAL(65,30) NOT NULL,
    "billedToDate" DECIMAL(65,30) NOT NULL,
    "costToDate" DECIMAL(65,30) NOT NULL,
    "percentComplete" DECIMAL(65,30) NOT NULL,
    "projectedCost" DECIMAL(65,30),
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WIPReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EarnedValueMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "plannedValue" DECIMAL(65,30) NOT NULL,
    "earnedValue" DECIMAL(65,30) NOT NULL,
    "actualCost" DECIMAL(65,30) NOT NULL,
    "cpi" DECIMAL(65,30),
    "spi" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarnedValueMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ChangeEventType" NOT NULL,
    "status" "ChangeEventStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedValue" DECIMAL(65,30),
    "approvedValue" DECIMAL(65,30),
    "scheduleDays" INTEGER,
    "sourceRfiId" TEXT,
    "sourceDocIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "MeetingType" NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agenda" TEXT,
    "minutes" TEXT,
    "aiPrepNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalkingPoint" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "priority" "TalkingPointPriority" NOT NULL,
    "topic" TEXT NOT NULL,
    "context" TEXT,
    "sourceDocIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalkingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "meetingId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseoutChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" "CloseoutCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloseoutChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseoutItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CloseoutItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "assignedTo" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloseoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionTracker" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "retentionAmount" DECIMAL(65,30) NOT NULL,
    "releasedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionCondition" (
    "id" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RetentionConditionStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "totalProjects" INTEGER NOT NULL,
    "activeProjects" INTEGER NOT NULL,
    "totalContractValue" DECIMAL(65,30) NOT NULL,
    "totalExposure" DECIMAL(65,30) NOT NULL,
    "avgHealthScore" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryBenchmark" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndustryBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "projectId" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "projectId" TEXT,
    "details" JSONB,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiModel" TEXT,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_workosOrgId_key" ON "Organization"("workosOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_workosUserId_key" ON "User"("workosUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

-- CreateIndex
CREATE INDEX "Document_projectId_type_idx" ON "Document"("projectId", "type");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_chunkIndex_idx" ON "DocumentChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "DocumentChunk_pageNumber_idx" ON "DocumentChunk"("pageNumber");

-- CreateIndex
CREATE INDEX "DocumentRevision_documentId_revisionDate_idx" ON "DocumentRevision"("documentId", "revisionDate");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRevision_documentId_revisionNumber_key" ON "DocumentRevision"("documentId", "revisionNumber");

-- CreateIndex
CREATE INDEX "SearchQuery_userId_createdAt_idx" ON "SearchQuery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchQuery_projectId_createdAt_idx" ON "SearchQuery"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_userId_updatedAt_idx" ON "ChatSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatSession_projectId_updatedAt_idx" ON "ChatSession"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "SearchAnalytics_userId_createdAt_idx" ON "SearchAnalytics"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContractClause_projectId_kind_idx" ON "ContractClause"("projectId", "kind");

-- CreateIndex
CREATE INDEX "RFI_projectId_status_idx" ON "RFI"("projectId", "status");

-- CreateIndex
CREATE INDEX "RFI_isOverdue_idx" ON "RFI"("isOverdue");

-- CreateIndex
CREATE UNIQUE INDEX "RFI_projectId_rfiNumber_key" ON "RFI"("projectId", "rfiNumber");

-- CreateIndex
CREATE INDEX "ComplianceNotice_projectId_type_idx" ON "ComplianceNotice"("projectId", "type");

-- CreateIndex
CREATE INDEX "ComplianceNotice_dueDate_idx" ON "ComplianceNotice"("dueDate");

-- CreateIndex
CREATE INDEX "ComplianceScore_projectId_calculatedAt_idx" ON "ComplianceScore"("projectId", "calculatedAt");

-- CreateIndex
CREATE INDEX "HealthScore_projectId_calculatedAt_idx" ON "HealthScore"("projectId", "calculatedAt");

-- CreateIndex
CREATE INDEX "WIPReport_projectId_reportDate_idx" ON "WIPReport"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "EarnedValueMetric_projectId_reportDate_idx" ON "EarnedValueMetric"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "ChangeEvent_projectId_status_idx" ON "ChangeEvent"("projectId", "status");

-- CreateIndex
CREATE INDEX "ChangeEvent_type_idx" ON "ChangeEvent"("type");

-- CreateIndex
CREATE INDEX "Meeting_projectId_scheduledAt_idx" ON "Meeting"("projectId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ActionItem_projectId_status_idx" ON "ActionItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "ActionItem_dueDate_idx" ON "ActionItem"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CloseoutChecklist_projectId_category_key" ON "CloseoutChecklist"("projectId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionTracker_projectId_key" ON "RetentionTracker"("projectId");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_snapshotDate_idx" ON "PortfolioSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_projectId_idx" ON "Notification"("projectId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_projectId_createdAt_idx" ON "AuditLog"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractClause" ADD CONSTRAINT "ContractClause_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RFI" ADD CONSTRAINT "RFI_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceNotice" ADD CONSTRAINT "ComplianceNotice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceScore" ADD CONSTRAINT "ComplianceScore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthScore" ADD CONSTRAINT "HealthScore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WIPReport" ADD CONSTRAINT "WIPReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarnedValueMetric" ADD CONSTRAINT "EarnedValueMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeEvent" ADD CONSTRAINT "ChangeEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalkingPoint" ADD CONSTRAINT "TalkingPoint_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseoutChecklist" ADD CONSTRAINT "CloseoutChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloseoutItem" ADD CONSTRAINT "CloseoutItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "CloseoutChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionTracker" ADD CONSTRAINT "RetentionTracker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionCondition" ADD CONSTRAINT "RetentionCondition_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "RetentionTracker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunk_embedding
  ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
