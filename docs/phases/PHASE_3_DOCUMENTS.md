# Phase 3: Document Ingestion Pipeline

## Goal
Build the complete document upload → extract → chunk → embed → store pipeline. After this phase, users can upload PDFs/DOCX/XLSX, and the system processes them into searchable vector embeddings in pgvector.

## Prompt for Claude Code

```
Implement the document ingestion pipeline for efilo.ai. Read CLAUDE.md, docs/SCHEMA.md, and docs/AI_SERVICE.md for context. Documents are uploaded to Cloudflare R2, processed via Inngest background jobs, and stored as chunks with embeddings in pgvector.

### Step 1: R2 Client (`lib/r2.ts`)

Implement the Cloudflare R2 client using S3-compatible API:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// Generate presigned URL for direct client upload (bypasses serverless body limits)
export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string>

// Generate presigned URL for download
export async function getPresignedDownloadUrl(key: string): Promise<string>

// Download file buffer (for server-side processing)
export async function downloadFromR2(key: string): Promise<Buffer>
```

R2 key structure: `{projectId}/{documentId}/{filename}`

### Step 2: Document Upload API

**POST /api/projects/[projectId]/documents**

This is a two-step process:
1. Client requests a presigned upload URL
2. Client uploads directly to R2
3. Client confirms upload, triggering processing

```typescript
// POST /api/projects/[projectId]/documents
// Step 1: Request presigned URL
// Body: { name, type (DocumentType), mimeType, fileSize }
// Returns: { documentId, uploadUrl, r2Key }

// POST /api/projects/[projectId]/documents/[docId]/confirm
// Step 2: Confirm upload, trigger processing
// Fires inngest event: "document.uploaded"
```

Create the API route that:
1. Validates input with Zod (name, type, mimeType, fileSize)
2. Creates Document record in Prisma (status: UPLOADING)
3. Generates presigned upload URL
4. Returns { documentId, uploadUrl, r2Key }

Create the confirm route that:
1. Updates Document status to PROCESSING
2. Sends Inngest event: `inngest.send({ name: "document.uploaded", data: { documentId, projectId } })`

### Step 3: Inngest Setup (`lib/inngest.ts`)

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "efilo" });
```

Create the Inngest serve endpoint at `src/app/api/inngest/route.ts`:
```typescript
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { documentIngestion } from "@/inngest/functions/document-ingestion";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [documentIngestion],
});
```

### Step 4: Text Extraction Service (`services/document-processing.ts`)

Implement text extraction for each document type:

```typescript
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export async function extractText(buffer: Buffer, mimeType: string): Promise<{
  text: string;
  pageCount?: number;
  isScanned: boolean;
}> {
  switch (mimeType) {
    case "application/pdf":
      return extractFromPdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractFromDocx(buffer);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractFromXlsx(buffer);
    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

async function extractFromPdf(buffer: Buffer) {
  const result = await pdfParse(buffer);
  const isScanned = !result.text.trim() || result.text.trim().length < 100;
  return { text: result.text, pageCount: result.numpages, isScanned };
}

async function extractFromDocx(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value, isScanned: false };
}

async function extractFromXlsx(buffer: Buffer) {
  const workbook = XLSX.read(buffer);
  let text = "";
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    text += `Sheet: ${sheetName}\n`;
    text += XLSX.utils.sheet_to_txt(sheet);
    text += "\n\n";
  }
  return { text, isScanned: false };
}
```

### Step 5: Claude Vision OCR (`services/vision.ts`)

Implement OCR for scanned PDFs and images per docs/AI_SERVICE.md:

```typescript
import sharp from "sharp";
import { generateResponse } from "@/lib/ai";

export async function extractViaClaudeVision(buffer: Buffer, pageCount: number) {
  // Convert PDF pages to PNG images using sharp
  // For each page, send to Claude Vision
  // Return extracted text per page
}
```

For MVP, use sharp to convert PDF buffer to page images. If the PDF has multiple pages, you may need to use pdf-lib or a similar tool to split pages first, then convert each to PNG.

### Step 6: Semantic Chunking (`services/document-processing.ts`)

Add chunking function:

```typescript
export function semanticChunk(text: string, options: {
  targetTokens?: number;
  overlap?: number;
} = {}): { content: string; chunkIndex: number; pageNumber?: number; sectionRef?: string; metadata: any }[] {
  const targetTokens = options.targetTokens ?? 400;
  const overlap = options.overlap ?? 50;
  
  // Split by paragraphs/sections first (respect page boundaries)
  // Then merge small chunks or split large ones to hit target size
  // Extract metadata: headings, section references, keywords
  // Return array of chunks with metadata
}
```

Use a simple token estimation: ~4 characters per token. Don't install tiktoken for MVP — approximate is fine.

### Step 7: Embedding Service (`lib/embeddings.ts`)

Implement the full embedding service per docs/AI_SERVICE.md. This was stubbed in Phase 1 — now implement it for real.

### Step 8: Document Ingestion Inngest Function

`inngest/functions/document-ingestion.ts`:

```typescript
import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/db";
import { downloadFromR2 } from "@/lib/r2";
import { extractText, semanticChunk } from "@/services/document-processing";
import { extractViaClaudeVision } from "@/services/vision";
import { generateEmbeddings } from "@/lib/embeddings";

export const documentIngestion = inngest.createFunction(
  { id: "document-ingestion", retries: 3, concurrency: { limit: 5 } },
  { event: "document.uploaded" },
  async ({ event, step }) => {
    const { documentId, projectId } = event.data;

    // Step 1: Download from R2
    const doc = await step.run("download", async () => {
      const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
      const buffer = await downloadFromR2(document.r2Key);
      return { buffer: buffer.toString("base64"), mimeType: document.mimeType, type: document.type };
    });

    // Step 2: Extract text
    const extracted = await step.run("extract-text", async () => {
      const buffer = Buffer.from(doc.buffer, "base64");
      const result = await extractText(buffer, doc.mimeType);
      
      // If scanned, use Claude Vision
      if (result.isScanned) {
        const visionResult = await extractViaClaudeVision(buffer, result.pageCount ?? 1);
        return { text: visionResult.map(r => r.text).join("\n"), pageCount: result.pageCount };
      }
      
      return { text: result.text, pageCount: result.pageCount };
    });

    // Step 3: Chunk text
    const chunks = await step.run("chunk-text", async () => {
      return semanticChunk(extracted.text, { targetTokens: 400, overlap: 50 });
    });

    // Step 4: Generate embeddings
    const embeddings = await step.run("generate-embeddings", async () => {
      return generateEmbeddings(chunks.map(c => c.content));
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
        
        // Set embedding via raw SQL
        await prisma.$executeRawUnsafe(
          `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
          embeddingStr,
          chunkRecord.id
        );
      }
    });

    // Step 6: Update status
    await step.run("finalize", async () => {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: "READY", pageCount: extracted.pageCount },
      });
    });

    return { documentId, chunksCreated: chunks.length };
  }
);
```

### Step 9: Document List API

**GET /api/projects/[projectId]/documents** — List documents
**GET /api/projects/[projectId]/documents/[docId]** — Get document metadata
**DELETE /api/projects/[projectId]/documents/[docId]** — Delete document + cascade chunks
**GET /api/projects/[projectId]/documents/[docId]/download** — Presigned download URL

### Step 10: Verify

- Upload a PDF and confirm it appears in the Document table with status UPLOADING
- Trigger the Inngest function (use Inngest dev server: `npx inngest-cli dev`)
- Verify chunks are created in DocumentChunk table
- Verify embeddings are stored (query: `SELECT id, embedding IS NOT NULL FROM "DocumentChunk" LIMIT 5`)
- Test with a DOCX and XLSX file too

For local testing without R2, you can temporarily store files on disk and swap the R2 calls.
```

## Success Criteria
- [ ] Presigned upload URL generated successfully
- [ ] File uploaded to R2 (or local disk for dev)
- [ ] Inngest function processes document end-to-end
- [ ] Text extracted from PDF, DOCX, XLSX
- [ ] Chunks created with correct metadata
- [ ] Embeddings stored in pgvector column
- [ ] Document status updates to READY after processing
- [ ] Delete cascades chunks correctly
