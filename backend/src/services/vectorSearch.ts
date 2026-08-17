import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

/**
 * pgvector similarity search service.
 * Uses raw SQL for vector operations since Prisma has no native support.
 */

const RAG_THRESHOLD = env.RAG_SIMILARITY_THRESHOLD || 0.35;

/**
 * Store a document chunk with its embedding vector in pgvector.
 * Returns the DocumentChunk record with embedding.
 */
export async function storeEmbedding(
  projectId: string,
  fileIndexId: string,
  chunkIndex: number,
  content: string,
  embedding: number[]
): Promise<void> {
  if (!embedding || embedding.length === 0) {
    throw new Error("Embedding vector is empty");
  }

  if (embedding.length !== 3072) {
  throw new Error(`Expected 3072-dimensional embedding, got ${embedding.length}`);
}

  // Convert embedding to pgvector format: "[val1, val2, ...]"
  const vectorString = `[${embedding.join(",")}]`;

  try {
    // Use raw SQL to insert/update with pgvector column
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "DocumentChunk" (id, "projectId", "fileIndexId", content, "chunkIndex", embedding)
      VALUES ($1, $2, $3, $4, $5, $6::vector)
      ON CONFLICT (id) DO UPDATE SET embedding = $6::vector
      `,
      `${projectId}-${fileIndexId}-${chunkIndex}`,
      projectId,
      fileIndexId,
      content,
      chunkIndex,
      vectorString
    );
  } catch (error) {
    console.error("Error storing embedding:", error);
    throw new Error(
      `Failed to store embedding: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Read an embedding back from the database to verify it was stored correctly.
 * Used for E2E testing.
 */
export async function readEmbedding(
  projectId: string,
  fileIndexId: string,
  chunkIndex: number
): Promise<{ content: string; embedding: number[] | null } | null> {
  try {
    const result = await prisma.$queryRawUnsafe<
      Array<{ content: string; embedding: string | null }>
    >(
      `
      SELECT content, embedding::text as embedding
      FROM "DocumentChunk"
      WHERE "projectId" = $1 AND "fileIndexId" = $2 AND "chunkIndex" = $3
      `,
      projectId,
      fileIndexId,
      chunkIndex
    );

    if (!result || result.length === 0) {
      return null;
    }

    const row = result[0];
    let embedding: number[] | null = null;

    if (row.embedding) {
      try {
        // Parse pgvector format: "[val1, val2, ...]"
        const parsed = JSON.parse(row.embedding.replace(/^\[/, "[").replace(/\]$/, "]"));
        embedding = Array.isArray(parsed) ? parsed : null;
      } catch (parseErr) {
        console.warn("Could not parse embedding:", row.embedding);
      }
    }

    return {
      content: row.content,
      embedding,
    };
  } catch (error) {
    console.error("Error reading embedding:", error);
    throw new Error(
      `Failed to read embedding: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Search for similar chunks using cosine similarity.
 * Returns chunks ordered by similarity score (highest first).
 */
export async function similaritySearch(
  projectId: string,
  queryEmbedding: number[],
  limit: number = 5,
  threshold: number = RAG_THRESHOLD
): Promise<
  Array<{
    id: string;
    fileIndexId: string;
    chunkIndex: number;
    content: string;
    similarity: number;
  }>
> {
  if (!queryEmbedding || queryEmbedding.length !== 3072) {
  throw new Error(`Expected 3072-dimensional query embedding, got ${queryEmbedding?.length || 0}`);
}

  const vectorString = `[${queryEmbedding.join(",")}]`;

  try {
    const results = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        fileIndexId: string;
        chunkIndex: number;
        content: string;
        similarity: number;
      }>
    >(
      `
      SELECT 
        id,
        "fileIndexId",
        "chunkIndex",
        content,
        (1 - (embedding <=> $2::vector)) as similarity
      FROM "DocumentChunk"
      WHERE "projectId" = $1 AND (1 - (embedding <=> $2::vector)) > $3
      ORDER BY embedding <=> $2::vector
      LIMIT $4
      `,
      projectId,
      vectorString,
      threshold,
      limit
    );

    return results;
  } catch (error) {
    console.error("Error searching embeddings:", error);
    throw new Error(
      `Failed to search embeddings: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate that pgvector extension is available (run once on startup).
 */
export async function validatePgvectorExtension(): Promise<boolean> {
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ extname: string }>>(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`
    );

    return result && result.length > 0;
  } catch (error) {
    console.warn("pgvector validation failed:", error);
    return false;
  }
}

export { RAG_THRESHOLD };
