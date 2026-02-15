/*
  Warnings:

  - You are about to drop the column `embedding` on the `DocumentChunk` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('SSO', 'EMAIL_PASSWORD');

-- DropIndex
DROP INDEX "idx_document_chunk_embedding";

-- AlterTable
ALTER TABLE "DocumentChunk" DROP COLUMN "embedding";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authMethod" "AuthMethod" NOT NULL DEFAULT 'SSO',
ADD COLUMN     "passwordHash" TEXT;
