// pdf-parse v1 tries to load a test file on import — this dynamic import avoids that
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse") as (dataBuffer: Buffer) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// ~4 characters per token (rough estimate, avoids tiktoken dependency)
const CHARS_PER_TOKEN = 4;

interface ExtractionResult {
  text: string;
  pageCount?: number;
  isScanned: boolean;
}

interface Chunk {
  content: string;
  chunkIndex: number;
  pageNumber?: number;
  sectionRef?: string;
  metadata: { headings: string[]; keywords: string[] };
}

/**
 * Extract text from a document buffer based on MIME type.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  switch (mimeType) {
    case "application/pdf":
      return extractFromPdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractFromDocx(buffer);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return extractFromXlsx(buffer);
    case "image/png":
    case "image/jpeg":
      // Images are always "scanned" — need Claude Vision
      return { text: "", isScanned: true };
    default:
      throw new Error(`Unsupported MIME type: ${mimeType}`);
  }
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  const result = await pdfParse(buffer);
  const text = result.text;
  const pageCount = result.numpages ?? 1;
  // If extracted text is very short relative to page count, it's likely scanned
  const isScanned = !text.trim() || text.trim().length < 100;
  return { text, pageCount, isScanned };
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value, isScanned: false };
}

async function extractFromXlsx(buffer: Buffer): Promise<ExtractionResult> {
  const workbook = XLSX.read(buffer);
  let text = "";
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    text += `Sheet: ${sheetName}\n`;
    text += XLSX.utils.sheet_to_csv(sheet);
    text += "\n\n";
  }
  return { text, isScanned: false };
}

/**
 * Split text into semantically-aware chunks with metadata.
 *
 * Strategy:
 * 1. Split by page markers (if present) or double newlines (paragraphs)
 * 2. Merge small segments until reaching target token size
 * 3. Apply overlap between chunks
 * 4. Extract section refs and headings from each chunk
 */
export function semanticChunk(
  text: string,
  options: { targetTokens?: number; overlap?: number } = {}
): Chunk[] {
  const targetTokens = options.targetTokens ?? 400;
  const overlap = options.overlap ?? 50;
  const targetChars = targetTokens * CHARS_PER_TOKEN;
  const overlapChars = overlap * CHARS_PER_TOKEN;

  if (!text.trim()) return [];

  // Split by page markers or double newlines
  const pagePattern = /\f|(?:---\s*Page\s+\d+\s*---)/gi;
  const hasPages = pagePattern.test(text);
  pagePattern.lastIndex = 0;

  let segments: { text: string; pageNumber?: number }[];

  if (hasPages) {
    const pages = text.split(pagePattern).filter((p) => p.trim());
    segments = pages.map((p, i) => ({ text: p.trim(), pageNumber: i + 1 }));
  } else {
    // Split by double newlines (paragraphs)
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
    segments = paragraphs.map((p) => ({ text: p.trim() }));
  }

  // Merge small segments and split large ones
  const chunks: Chunk[] = [];
  let currentText = "";
  let currentPage: number | undefined;
  let chunkIndex = 0;

  for (const segment of segments) {
    const combinedLength = currentText.length + segment.text.length;

    if (combinedLength > targetChars && currentText.length > 0) {
      // Emit current chunk
      chunks.push(
        buildChunk(currentText, chunkIndex, currentPage)
      );
      chunkIndex++;

      // Carry overlap from end of current chunk
      if (overlapChars > 0 && currentText.length > overlapChars) {
        currentText = currentText.slice(-overlapChars) + "\n\n" + segment.text;
      } else {
        currentText = segment.text;
      }
      currentPage = segment.pageNumber ?? currentPage;
    } else {
      if (currentText) {
        currentText += "\n\n" + segment.text;
      } else {
        currentText = segment.text;
      }
      currentPage = currentPage ?? segment.pageNumber;
    }

    // If a single segment is very large, split it
    while (currentText.length > targetChars * 1.5) {
      const splitPoint = findSplitPoint(currentText, targetChars);
      chunks.push(
        buildChunk(currentText.slice(0, splitPoint), chunkIndex, currentPage)
      );
      chunkIndex++;

      const overlapStart = Math.max(0, splitPoint - overlapChars);
      currentText = currentText.slice(overlapStart);
    }
  }

  // Emit remaining text
  if (currentText.trim()) {
    chunks.push(buildChunk(currentText, chunkIndex, currentPage));
  }

  return chunks;
}

function buildChunk(
  text: string,
  chunkIndex: number,
  pageNumber?: number
): Chunk {
  const sectionRef = extractSectionRef(text);
  const headings = extractHeadings(text);
  const keywords = extractKeywords(text);

  return {
    content: text.trim(),
    chunkIndex,
    pageNumber,
    sectionRef,
    metadata: { headings, keywords },
  };
}

/**
 * Find a good split point near the target length (prefer sentence/paragraph boundaries).
 */
function findSplitPoint(text: string, target: number): number {
  // Look for paragraph break near target
  const searchStart = Math.max(0, target - 200);
  const searchEnd = Math.min(text.length, target + 200);
  const searchRegion = text.slice(searchStart, searchEnd);

  const paraBreak = searchRegion.lastIndexOf("\n\n");
  if (paraBreak !== -1) return searchStart + paraBreak;

  // Fall back to sentence break
  const sentenceBreak = searchRegion.lastIndexOf(". ");
  if (sentenceBreak !== -1) return searchStart + sentenceBreak + 1;

  // Fall back to any newline
  const newlineBreak = searchRegion.lastIndexOf("\n");
  if (newlineBreak !== -1) return searchStart + newlineBreak;

  return target;
}

/**
 * Extract section reference (e.g., "Section 01 33 00", "Division 23").
 */
function extractSectionRef(text: string): string | undefined {
  const sectionMatch = text.match(
    /(?:Section|Division|Part)\s+[\d]+(?:[.\- ]\d+)*/i
  );
  return sectionMatch?.[0];
}

/**
 * Extract headings-like lines from text.
 */
function extractHeadings(text: string): string[] {
  const lines = text.split("\n").slice(0, 10);
  return lines
    .filter(
      (l) =>
        l.trim().length > 0 &&
        l.trim().length < 100 &&
        (l === l.toUpperCase() || /^#{1,3}\s/.test(l) || /^\d+\.\d+/.test(l))
    )
    .slice(0, 3);
}

/**
 * Extract potential keywords (capitalized terms, spec numbers).
 */
function extractKeywords(text: string): string[] {
  const specNumbers = text.match(/\d{2}\s?\d{2}\s?\d{2}/g) || [];
  const capitalTerms =
    text.match(/\b[A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){0,3}\b/g) || [];
  const unique = [...new Set([...specNumbers, ...capitalTerms])];
  return unique.slice(0, 10);
}

export type { ExtractionResult, Chunk };
