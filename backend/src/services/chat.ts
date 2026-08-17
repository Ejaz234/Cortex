import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import { retrieveRelevantChunks, hasEnoughContext, formatContextForLLM, formatSources } from "./rag.js";

/**
 * Chat service — LLM-powered Q&A over indexed code.
 * Uses Gemini 1.5 Flash with RAG context.
 */

const MODEL_NAME = "gemini-3.6-flash";

let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not set");
    }
    geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return geminiClient;
}

/**
 * Chat completion using RAG context.
 * Returns answer + sources if context is sufficient, otherwise "not enough context" message.
 */
export async function answerQuestion(
  projectId: string,
  question: string,
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<{
  answer: string;
  sources: Array<{ path: string; chunkIndex: number; snippet: string }> | null;
  hadContext: boolean;
}> {
  if (!question || question.trim().length === 0) {
    throw new Error("Question cannot be empty");
  }

  try {
    // Retrieve relevant chunks
    const chunks = await retrieveRelevantChunks(projectId, question);
    const hasContext = hasEnoughContext(chunks);

    if (!hasContext || chunks.length === 0) {
      return {
        answer:
          "I don't have enough context from the indexed codebase to answer this question reliably. " +
          "Try asking about specific files, functions, or features that are likely documented in the code.",
        sources: null,
        hadContext: false,
      };
    }

    // Build the RAG prompt
    const contextStr = formatContextForLLM(chunks);
    const systemPrompt = `You are a helpful code assistant analyzing a GitHub repository. 
You have access to relevant code chunks from the repository.
Answer questions about the code based only on the provided context.
Be concise and accurate. Mention specific files and functions when relevant.
If the context doesn't contain enough information, say so clearly.`;

    const userPrompt = `Context from the repository:

${contextStr}

---

User question: ${question}`;

    // Call Gemini
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: MODEL_NAME });

    const chat = model.startChat({
      history: (conversationHistory || []).map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
    });

    const response = await chat.sendMessage(userPrompt);
    const answerText = response.response.text();

    return {
      answer: answerText,
      sources: formatSources(chunks),
      hadContext: true,
    };
  } catch (error) {
    console.error("Error answering question:", error);
    throw new Error(
      `Failed to generate answer: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Stream chat response (for WebSocket or Server-Sent Events).
 * Yields chunks of the response as they arrive.
 */
export async function* streamAnswerQuestion(
  projectId: string,
  question: string
): AsyncGenerator<string> {
  if (!question || question.trim().length === 0) {
    throw new Error("Question cannot be empty");
  }

  try {
    // Retrieve relevant chunks
    const chunks = await retrieveRelevantChunks(projectId, question);
    const hasContext = hasEnoughContext(chunks);

    if (!hasContext || chunks.length === 0) {
      yield "I don't have enough context from the indexed codebase to answer this question reliably. Try asking about specific files, functions, or features that are likely documented in the code.";
      return;
    }

    // Build the RAG prompt
    const contextStr = formatContextForLLM(chunks);
    const systemPrompt = `You are a helpful code assistant analyzing a GitHub repository. 
You have access to relevant code chunks from the repository.
Answer questions about the code based only on the provided context.
Be concise and accurate.`;

    const userPrompt = `Context from the repository:

${contextStr}

---

User question: ${question}`;

    // Stream from Gemini
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: MODEL_NAME });

    const stream = await model.generateContentStream(userPrompt);

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    console.error("Error streaming answer:", error);
    throw new Error(
      `Failed to generate answer: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export { MODEL_NAME };
