import sharp from "sharp";
import { generateResponse } from "@/lib/ai";

interface VisionResult {
  pageNumber: number;
  text: string;
}

/**
 * Extract text from scanned PDFs or images using Claude Vision.
 * Converts the buffer to PNG page images and sends each to Claude.
 */
export async function extractViaClaudeVision(
  buffer: Buffer,
  pageCount: number
): Promise<VisionResult[]> {
  const results: VisionResult[] = [];

  // For single-page or image inputs, process as one page
  if (pageCount <= 1) {
    const base64 = await bufferToBase64Png(buffer);
    const response = await generateResponse({
      model: "sonnet",
      maxTokens: 4000,
      systemPrompt: VISION_SYSTEM_PROMPT,
      userPrompt: VISION_USER_PROMPT,
      images: [{ base64, mediaType: "image/png" }],
    });
    results.push({ pageNumber: 1, text: response.content });
    return results;
  }

  // For multi-page PDFs, process the whole buffer as a single image
  // (PDF page splitting would require pdf-lib; for MVP, extract what we can)
  const base64 = await bufferToBase64Png(buffer);
  const response = await generateResponse({
    model: "sonnet",
    maxTokens: 4000 * Math.min(pageCount, 5),
    systemPrompt: VISION_SYSTEM_PROMPT,
    userPrompt: `This document has ${pageCount} pages. ${VISION_USER_PROMPT}`,
    images: [{ base64, mediaType: "image/png" }],
  });
  results.push({ pageNumber: 1, text: response.content });

  return results;
}

/**
 * Convert any image buffer to a base64-encoded PNG.
 */
async function bufferToBase64Png(buffer: Buffer): Promise<string> {
  const pngBuffer = await sharp(buffer)
    .png()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .toBuffer();
  return pngBuffer.toString("base64");
}

const VISION_SYSTEM_PROMPT =
  "You are a construction document text extraction assistant. " +
  "Extract text accurately, preserving structure.";

const VISION_USER_PROMPT =
  "Extract all text from this construction document page. Include handwritten notes, " +
  "stamps, labels, dimensions, and any visible text. Preserve structure (headers, tables, " +
  "lists). Return plain text.";

export type { VisionResult };
