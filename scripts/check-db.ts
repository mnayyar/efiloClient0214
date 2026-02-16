import { config } from "dotenv";
config({ path: ".env.local" });
import pg from "pg";
import OpenAI from "openai";

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const openai = new OpenAI();
  try {
    const query = "Maria Santos, Pacific Mechanical Systems";
    console.log(`Query: "${query}"`);

    const embResponse = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: query,
      dimensions: 1536,
    });
    const embStr = `[${embResponse.data[0].embedding.join(",")}]`;
    console.log(`Embedding generated (${embResponse.data[0].embedding.length} dims)`);

    // Raw search without threshold
    const raw = await pool.query(`
      SELECT dc.id, LEFT(dc.content, 120) as snippet,
             d.name as doc, d.status, d."projectId",
             1 - (dc.embedding <=> $1::vector) as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      ORDER BY dc.embedding <=> $1::vector
      LIMIT 5
    `, [embStr]);

    console.log("\nTop 5 results (no threshold, no project filter):");
    for (const r of raw.rows) {
      console.log(`  sim=${Number(r.similarity).toFixed(4)} | status=${r.status} | ${r.doc} | ${r.snippet}...`);
    }

    // With project filter
    const projectId = "cmloge1v50000ytppaa0l4egv";
    const filtered = await pool.query(`
      SELECT dc.id, LEFT(dc.content, 120) as snippet,
             d.name as doc,
             1 - (dc.embedding <=> $1::vector) as similarity
      FROM "DocumentChunk" dc
      JOIN "Document" d ON dc."documentId" = d.id
      WHERE d."projectId" = $2 AND d.status = 'READY'
        AND 1 - (dc.embedding <=> $1::vector) > 0.35
      ORDER BY dc.embedding <=> $1::vector
      LIMIT 5
    `, [embStr, projectId]);

    console.log(`\nWith threshold 0.35 + project filter: ${filtered.rows.length} results`);
    for (const r of filtered.rows) {
      console.log(`  sim=${Number(r.similarity).toFixed(4)} | ${r.doc} | ${r.snippet}...`);
    }
  } finally {
    await pool.end();
  }
}
main().catch(console.error);
