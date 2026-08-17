import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { env } from "../config/env.js";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSION = 3072;

let documentEmbeddingsClient: GoogleGenerativeAIEmbeddings | null = null;
let queryEmbeddingsClient: GoogleGenerativeAIEmbeddings | null = null;

function getDocumentEmbeddingsClient(): GoogleGenerativeAIEmbeddings {
  if (!documentEmbeddingsClient) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    documentEmbeddingsClient = new GoogleGenerativeAIEmbeddings({
      apiKey: env.GEMINI_API_KEY,
      modelName: EMBEDDING_MODEL,
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    });
  }

  return documentEmbeddingsClient;
}

function getQueryEmbeddingsClient(): GoogleGenerativeAIEmbeddings {
  if (!queryEmbeddingsClient) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    queryEmbeddingsClient = new GoogleGenerativeAIEmbeddings({
      apiKey: env.GEMINI_API_KEY,
      modelName: EMBEDDING_MODEL,
      taskType: TaskType.RETRIEVAL_QUERY,
    });
  }

  return queryEmbeddingsClient;
}

/**
 * Embed a single query (e.g. a chat question). Uses RETRIEVAL_QUERY task type.
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text?.trim()) {
    throw new Error("Cannot embed empty text");
  }

  const client = getQueryEmbeddingsClient();

  const embedding = await client.embedQuery(text);

  console.log(`Query embedding dimension: ${embedding?.length ?? 0}`);

  if (!embedding || embedding.length === 0) {
    throw new Error("Embedding API returned an empty vector");
  }

  if (embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Expected ${EMBEDDING_DIMENSION} dimensions, got ${embedding.length}`
    );
  }

  return embedding;
}

/**
 * Embed multiple documents (e.g. code chunks for indexing). Uses RETRIEVAL_DOCUMENT task type.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  for (let i = 0; i < texts.length; i++) {
    if (!texts[i]?.trim()) {
      throw new Error(`Cannot embed empty text at index ${i}`);
    }
  }

  const client = getDocumentEmbeddingsClient();

  const embeddings = await client.embedDocuments(texts);

  console.log(
    "Embedding dimensions:",
    embeddings.map((embedding) => embedding?.length ?? 0)
  );

  if (embeddings.length !== texts.length) {
    throw new Error(
      `Expected ${texts.length} embeddings, got ${embeddings.length}`
    );
  }

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];

    if (!embedding || embedding.length === 0) {
      throw new Error(`Empty embedding returned at index ${i}`);
    }

    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Invalid embedding at index ${i}: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`
      );
    }
  }

  return embeddings;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSION };