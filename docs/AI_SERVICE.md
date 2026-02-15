# AI Service Patterns — efilo.ai

## Vendor Strategy

| Vendor | Purpose | Models |
|--------|---------|--------|
| Anthropic | ALL reasoning, analysis, vision/OCR | Sonnet 4.5, Opus 4.5 |
| OpenAI | Embeddings ONLY | text-embedding-3-large (1536d) |

## Claude AI Service (`lib/ai.ts`)

All Claude API calls go through a single shared service that handles model selection, token tracking, and Axiom logging.

```typescript
// lib/ai.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // Uses ANTHROPIC_API_KEY env var

type AIModel = "sonnet" | "opus";

const MODEL_MAP: Record<AIModel, string> = {
  sonnet: "claude-sonnet-4-5-20250929",
  opus: "claude-opus-4-5-20250620",
};

interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  model: AIModel;
  maxTokens?: number;
  temperature?: number;
  images?: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" }[];
}

interface AIResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
  latencyMs: number;
}

export async function generateResponse(request: AIRequest): Promise<AIResponse> {
  const start = Date.now();
  
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: request.images
      ? [
          ...request.images.map(img => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
          })),
          { type: "text" as const, text: request.userPrompt },
        ]
      : request.userPrompt,
  }];

  const response = await anthropic.messages.create({
    model: MODEL_MAP[request.model],
    max_tokens: request.maxTokens ?? 2000,
    temperature: request.temperature ?? 0.3,
    system: request.systemPrompt,
    messages,
  });

  const latencyMs = Date.now() - start;
  const content = response.content[0].type === "text" ? response.content[0].text : "";

  // Log to Axiom (implement axiomLog utility)
  // axiomLog({ model: MODEL_MAP[request.model], tokensUsed: response.usage, latencyMs, ... });

  return {
    content,
    tokensUsed: { input: response.usage.input_tokens, output: response.usage.output_tokens },
    model: MODEL_MAP[request.model],
    latencyMs,
  };
}
```

## OpenAI Embedding Service (`lib/embeddings.ts`)

```typescript
// lib/embeddings.ts
import OpenAI from "openai";

const openai = new OpenAI(); // Uses OPENAI_API_KEY env var

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Batch up to 2048 texts per request
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += 2048) {
    batches.push(texts.slice(i, i + 2048));
  }

  const results: number[][] = [];
  for (const batch of batches) {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    results.push(...response.data.map(d => d.embedding));
  }
  return results;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
```

## Token Budgets by Function

| Function | Model | Max Input | Max Output | Est. Cost |
|----------|-------|-----------|------------|-----------|
| Query classification | Sonnet | ~2K | 500 | $0.01 |
| Search answer generation | Sonnet | ~6K | 1,500 | $0.02-$0.04 |
| RFI draft generation | Sonnet | ~8K | 2,000 | $0.03-$0.05 |
| RFI response analysis | Sonnet | ~8K | 2,000 | $0.03-$0.05 |
| CO potential detection | Sonnet | ~6K | 2,000 | $0.03-$0.04 |
| Contract clause extraction | Opus | ~50K (chunked) | 8,000 | $0.80-$2.50 |
| Vision OCR (per page) | Sonnet | ~1 image | 4,000 | $0.01-$0.03 |
| Health score calculation | Sonnet | ~4K | 1,500 | $0.02-$0.03 |
| Meeting prep generation | Sonnet | ~10K | 3,000 | $0.04-$0.06 |
| Version comparison | Sonnet | ~8K | 2,000 | $0.03-$0.05 |
| Suggested prompts | Sonnet | ~3K | 1,000 | $0.01-$0.02 |
| Portfolio narrative | Opus | ~15K | 3,000 | $0.30-$0.50 |

## Vision / OCR Service (`services/vision.ts`)

```typescript
// services/vision.ts
import { generateResponse } from "@/lib/ai";

export async function extractViaClaudeVision(pageImages: { base64: string; pageNumber: number }[]) {
  const results = [];

  for (const page of pageImages) {
    const response = await generateResponse({
      model: "sonnet",
      maxTokens: 4000,
      systemPrompt: "You are a construction document text extraction assistant.",
      userPrompt:
        "Extract all text from this construction document page. Include handwritten notes, " +
        "stamps, labels, dimensions, and any visible text. Preserve structure (headers, tables, " +
        "lists). Return plain text.",
      images: [{ base64: page.base64, mediaType: "image/png" }],
    });

    results.push({ pageNumber: page.pageNumber, text: response.content });
  }

  return results;
}
```
