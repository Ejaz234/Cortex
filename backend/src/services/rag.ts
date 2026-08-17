import { embedText } from "./embeddings.js";
import { similaritySearch } from "./vectorSearch.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

/**
 * RAG (Retrieval-Augmented Generation) pipeline.
 * Embeds queries, retrieves similar chunks, applies threshold filtering.
 */

export interface RetrievedChunk {
  id: string;
  fileIndexId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  filePath?: string;
}

/**
 * Retrieve relevant chunks for a user query.
 * Returns chunks above the similarity threshold with file paths.
 */
export async function retrieveRelevantChunks(
  projectId: string,
  query: string,
  limit: number = 5
): Promise<RetrievedChunk[]> {
  if (!query || query.trim().length === 0) {
    throw new Error("Query cannot be empty");
  }

  try {
    // Embed the query
    const queryEmbedding = await embedText(query);

    // Search for similar chunks
    const chunks = await similaritySearch(
      projectId,
      queryEmbedding,
      limit,
      env.RAG_SIMILARITY_THRESHOLD
    );

    if (chunks.length === 0) {
      return [];
    }

    // Enrich with file paths
    const fileIndexIds = [...new Set(chunks.map((c) => c.fileIndexId))];
    const files = await prisma.fileIndex.findMany({
      where: { id: { in: fileIndexIds } },
    });

    const filePathMap = new Map(files.map((f) => [f.id, f.path]));

    return chunks.map((chunk) => ({
      ...chunk,
      filePath: filePathMap.get(chunk.fileIndexId) || "unknown",
    }));
  } catch (error) {
    console.error("Error retrieving chunks:", error);
    throw new Error(
      `Failed to retrieve chunks: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if retrieval returned enough context.
 * Returns true if chunks meet minimum relevance threshold.
 */
export function hasEnoughContext(
  chunks: RetrievedChunk[],
  minChunks: number = 1,
  minAvgSimilarity: number = env.RAG_SIMILARITY_THRESHOLD
): boolean {
  if (chunks.length < minChunks) {
    return false;
  }

  const avgSimilarity = chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length;
  return avgSimilarity >= minAvgSimilarity;
}

/**
 * Format retrieved chunks into a context string for the LLM.
 */
export function formatContextForLLM(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "";
  }

  const lines = [
    "## Retrieved Context",
    "",
    chunks
      .map(
        (chunk, idx) =>
          `### Chunk ${idx + 1} (${chunk.filePath}:${chunk.chunkIndex}) - Similarity: ${(chunk.similarity * 100).toFixed(1)}%\n\`\`\`\n${chunk.content}\n\`\`\``
      )
      .join("\n\n"),
  ];

  return lines.join("\n");
}

/**
 * Format sources for the user response.
 */
export function formatSources(chunks: RetrievedChunk[]): Array<{
  path: string;
  chunkIndex: number;
  snippet: string;
}> {
  return chunks.map((chunk) => ({
    path: chunk.filePath || "unknown",
    chunkIndex: chunk.chunkIndex,
    snippet: chunk.content.substring(0, 150) + (chunk.content.length > 150 ? "..." : ""),
  }));
}
