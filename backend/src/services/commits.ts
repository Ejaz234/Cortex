import { Octokit } from "@octokit/rest";
import { env } from "../config/env.js";

/**
 * Commits service — fetches commit history from GitHub via Octokit.
 */

const octokit = new Octokit({
  auth: env.GITHUB_TOKEN,
});

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  committedAt: Date;
  diff?: string; // Diff summary for AI summarization
}

/**
 * Fetch the last N commits from a GitHub repository.
 * Includes commit message, author, date, and diff for each commit.
 */
export async function fetchCommits(
  owner: string,
  repo: string,
  limit: number = 50
): Promise<CommitInfo[]> {
  try {
    // Fetch commit list
    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      per_page: Math.min(limit, 100),
    });

    if (!commits || commits.length === 0) {
      return [];
    }

    // Enrich with diffs
    const commitInfos: CommitInfo[] = [];

    for (const commit of commits) {
      try {
        const sha = commit.sha;
        const message = commit.commit.message;
        const author = commit.commit.author?.name || "Unknown";
        const committedAt = commit.commit.author?.date
          ? new Date(commit.commit.author.date)
          : new Date();

        // Fetch diff for this commit
        let diff = "";
        try {
          const { data: commitDetail } = await octokit.repos.getCommit({
            owner,
            repo,
            ref: sha,
          });

          // Truncate diff to first 2KB to keep it manageable for LLM
          const diffText = (commitDetail as any).files
            ?.map((file: any) => {
              const lines = [
                `--- ${file.filename}`,
                `+++ ${file.filename}`,
                file.patch || "",
              ];
              return lines.join("\n");
            })
            .join("\n") || "";

          diff = diffText.substring(0, 2000);
        } catch (diffErr) {
          // If we can't get the diff, continue without it
          diff = "";
        }

        commitInfos.push({
          sha,
          message,
          author,
          committedAt,
          diff,
        });
      } catch (err) {
        console.warn(`Failed to fetch details for commit ${commit.sha}:`, err);
        // Continue with next commit
      }
    }

    return commitInfos;
  } catch (error) {
    console.error("Error fetching commits:", error);
    throw new Error(
      `Failed to fetch commits: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fetch a single commit with full diff.
 */
export async function fetchCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<CommitInfo | null> {
  try {
    const { data: commit } = await octokit.repos.getCommit({
      owner,
      repo,
      ref: sha,
    });

    if (!commit) {
      return null;
    }

    const message = commit.commit.message;
    const author = commit.commit.author?.name || "Unknown";
    const committedAt = commit.commit.author?.date
      ? new Date(commit.commit.author.date)
      : new Date();

    // Get full diff
    const diffText = (commit as any).files
      ?.map((file: any) => {
        const lines = [
          `--- ${file.filename}`,
          `+++ ${file.filename}`,
          file.patch || "",
        ];
        return lines.join("\n");
      })
      .join("\n") || "";

    return {
      sha,
      message,
      author,
      committedAt,
      diff: diffText.substring(0, 5000), // More generous for single commit
    };
  } catch (error) {
    console.error(`Error fetching commit ${sha}:`, error);
    return null;
  }
}

/**
 * Count total commits in a repo.
 */
export async function countCommits(owner: string, repo: string): Promise<number> {
  try {
    const { data: result } = await octokit.repos.get({
      owner,
      repo,
    });
    return result.commits_url ? 1 : 0; // Rough estimate
  } catch {
    return 0;
  }
}
