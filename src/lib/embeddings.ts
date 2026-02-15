import OpenAI from "openai";

const openai = new OpenAI(); // Uses OPENAI_API_KEY env var

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
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
      dimensions: EMBEDDING_DIMENSIONS,
    });
    results.push(...response.data.map((d) => d.embedding));
  }
  return results;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
