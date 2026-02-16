import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // Uses ANTHROPIC_API_KEY env var

type AIModel = "haiku" | "sonnet" | "opus";

const MODEL_MAP: Record<AIModel, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-5-20250929",
  opus: "claude-opus-4-5-20250620",
};

interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  model: AIModel;
  maxTokens?: number;
  temperature?: number;
  images?: {
    base64: string;
    mediaType: "image/png" | "image/jpeg" | "image/webp";
  }[];
}

interface AIResponse {
  content: string;
  tokensUsed: { input: number; output: number };
  model: string;
  latencyMs: number;
}

export async function generateResponse(
  request: AIRequest
): Promise<AIResponse> {
  const start = Date.now();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: request.images
        ? [
            ...request.images.map(
              (img) =>
                ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: img.mediaType,
                    data: img.base64,
                  },
                }) satisfies Anthropic.ImageBlockParam
            ),
            { type: "text" as const, text: request.userPrompt },
          ]
        : request.userPrompt,
    },
  ];

  const response = await anthropic.messages.create({
    model: MODEL_MAP[request.model],
    max_tokens: request.maxTokens ?? 2000,
    temperature: request.temperature ?? 0.3,
    system: request.systemPrompt,
    messages,
  });

  const latencyMs = Date.now() - start;
  const content =
    response.content[0].type === "text" ? response.content[0].text : "";

  // TODO: Log to Axiom — { model, tokensUsed, latencyMs, entityType, entityId, projectId }

  return {
    content,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
    model: MODEL_MAP[request.model],
    latencyMs,
  };
}

// ── Web Search (beta) ────────────────────────────────────────────────────

export interface WebCitation {
  url: string;
  title: string;
}

export interface WebSearchResponse {
  content: string;
  citations: WebCitation[];
  tokensUsed: { input: number; output: number };
  model: string;
  latencyMs: number;
}

export async function generateWebSearchResponse(
  query: string,
  conversationHistory?: { role: "user" | "assistant"; content: string }[]
): Promise<WebSearchResponse> {
  const start = Date.now();

  const messages: Anthropic.MessageParam[] = [
    ...(conversationHistory ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: query },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (anthropic as any).beta.messages.create({
    model: MODEL_MAP.sonnet,
    max_tokens: 4096,
    temperature: 0.3,
    system:
      "You are a knowledgeable assistant for construction professionals (MEP contractors). " +
      "Answer questions using current web information. Be concise and practical. " +
      "Always cite the web sources you used in your answer.",
    messages,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  });

  const latencyMs = Date.now() - start;

  let content = "";
  const citations: WebCitation[] = [];
  const seenUrls = new Set<string>();

  for (const block of response.content) {
    if (block.type === "text") {
      content += block.text;
    } else if (block.type === "web_search_tool_result") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const result of (block as any).content ?? []) {
        if (
          result.type === "web_search_result" &&
          result.url &&
          !seenUrls.has(result.url)
        ) {
          seenUrls.add(result.url);
          citations.push({ url: result.url, title: result.title ?? result.url });
        }
      }
    }
  }

  return {
    content,
    citations,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
    model: MODEL_MAP.sonnet,
    latencyMs,
  };
}

export type { AIModel, AIRequest, AIResponse };
