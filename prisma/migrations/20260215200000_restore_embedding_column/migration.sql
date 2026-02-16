-- Restore the embedding column that was accidentally dropped by the add_auth_method migration.
-- Prisma saw the raw-SQL-managed column and removed it. Re-add it here.

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Re-add the embedding column
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Re-create HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunk_embedding
  ON "DocumentChunk" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
