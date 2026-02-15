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

export type { AIModel, AIRequest, AIResponse };
