-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "street" TEXT,
ADD COLUMN "street2" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "zipCode" TEXT,
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'US',
ADD COLUMN "replyToDomain" TEXT;
