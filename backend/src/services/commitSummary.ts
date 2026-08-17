import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env.js";
import type { CommitInfo } from "./commits.js";

/**
 * Commit summarization service — uses Gemini to create AI summaries of commits.
 * Diffs are diff-aware for accurate summaries.
 */

// Using gemini-pro as it's widely available
// Note: If using a different region/project, you may need to update this
const MODEL_NAME = "gemini-3.1-flash-lite";

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
 * Summarize a commit message + diff into a concise summary.
 * Aims for 1-2 sentences explaining the change.
 */
export async function summarizeCommit(commit: CommitInfo): Promise<string> {
  const { message, diff, author } = commit;

  if (!message || message.trim().length === 0) {
    return "Empty commit";
  }

  const prompt = `Summarize this GitHub commit concisely (1-2 sentences). Focus on WHAT changed and WHY.

Commit message:
${message}

${
  diff
    ? `Diff (truncated):
${diff}

`
    : ""
}

Provide only the summary, no extra commentary. Be technical but concise. If the diff shows minor changes (typos, formatting), mention that explicitly.`;

  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: MODEL_NAME });

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const summary = response.response.text();

    if (!summary || summary.trim().length === 0) {
      return "Unable to generate summary";
    }

    return summary.trim().substring(0, 500); // Cap at 500 chars
  } catch (error) {
    console.error("Error summarizing commit:", error);
    throw new Error(
      `Failed to summarize commit: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Summarize multiple commits in batch.
 * Returns array of summaries in the same order as input.
 */
export async function summarizeCommits(commits: CommitInfo[]): Promise<string[]> {
  if (!commits || commits.length === 0) {
    return [];
  }

  const summaries: string[] = [];

  // Process sequentially to avoid rate limits (could parallelize later)
  for (const commit of commits) {
    try {
      const summary = await summarizeCommit(commit);
      summaries.push(summary);

      // Small delay between requests to be kind to API
      await new Promise((resolve) => setTimeout(resolve, 4500));
    } catch (err) {
      console.error(`Failed to summarize commit ${commit.sha}:`, err);
      summaries.push("Error generating summary");
    }
  }

  return summaries;
}

export { MODEL_NAME };
