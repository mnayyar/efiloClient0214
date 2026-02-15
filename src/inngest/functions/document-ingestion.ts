import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/db";
import { downloadFromR2 } from "@/lib/r2";
import { extractText, semanticChunk } from "@/services/document-processing";
import { extractViaClaudeVision } from "@/services/vision";
import { generateEmbeddings } from "@/lib/embeddings";

export const documentIngestion = inngest.createFunction(
  {
    id: "document-ingestion",
    retries: 3,
    concurrency: { limit: 5 },
  },
  { event: "document.uploaded" },
  async ({ event, step }) => {
    const { documentId } = event.data as {
      documentId: string;
      projectId: string;
    };

    // Step 1: Download from R2
    const doc = await step.run("download", async () => {
      const document = await prisma.document.findUniqueOrThrow({
        where: { id: documentId },
      });
      const buffer = await downloadFromR2(document.r2Key);
      return {
        buffer: buffer.toString("base64"),
        mimeType: document.mimeType,
      };
    });

    // Step 2: Extract text
    const extracted = await step.run("extract-text", async () => {
      const buffer = Buffer.from(doc.buffer, "base64");
      const result = await extractText(buffer, doc.mimeType);

      // If scanned, use Claude Vision OCR
      if (result.isScanned) {
        const visionResults = await extractViaClaudeVision(
          buffer,
          result.pageCount ?? 1
        );
        return {
          text: visionResults.map((r) => r.text).join("\n\n"),
          pageCount: result.pageCount,
        };
      }

      return { text: result.text, pageCount: result.pageCount };
    });

    // Step 3: Chunk text
    const chunks = await step.run("chunk-text", async () => {
      return semanticChunk(extracted.text, {
        targetTokens: 400,
        overlap: 50,
      });
    });

    if (chunks.length === 0) {
      // No text extracted — mark as error
      await step.run("mark-empty", async () => {
        await prisma.document.update({
          where: { id: documentId },
          data: { status: "ERROR" },
        });
      });
      return { documentId, chunksCreated: 0, error: "No text extracted" };
    }

    // Step 4: Generate embeddings (batch)
    const embeddings = await step.run("generate-embeddings", async () => {
      return generateEmbeddings(chunks.map((c) => c.content));
    });

    // Step 5: Store chunks + embeddings in pgvector
    await step.run("store-vectors", async () => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];
        const embeddingStr = `[${embedding.join(",")}]`;

        // Create DocumentChunk record
        const chunkRecord = await prisma.documentChunk.create({
          data: {
            documentId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            pageNumber: chunk.pageNumber,
            sectionRef: chunk.sectionRef,
            metadata: chunk.metadata,
          },
        });

        // Set embedding via raw SQL (pgvector column)
        await prisma.$executeRawUnsafe(
          `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
          embeddingStr,
          chunkRecord.id
        );
      }
    });

    // Step 6: Update document status to READY
    await step.run("finalize", async () => {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "READY", pageCount: extracted.pageCount },
      });
    });

    return { documentId, chunksCreated: chunks.length };
  }
);
