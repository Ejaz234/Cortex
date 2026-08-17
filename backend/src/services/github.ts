import { Octokit } from "@octokit/rest";
import { env } from "../config/env.js";

const octokit = new Octokit({
  auth: env.GITHUB_TOKEN,
});

/**
 * Parse GitHub URL to extract owner and repo.
 * Accepts: https://github.com/owner/repo, https://github.com/owner/repo.git
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(\.git)?$/i);
  if (!match) {
    throw new Error("Invalid GitHub URL format");
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Validate that the GitHub repo exists and is public.
 * Also check repo size and file count against limits.
 * Limits: ~50MB repo size, ~500 files.
 */
export async function validateGitHubRepo(
  owner: string,
  repo: string
): Promise<{
  exists: boolean;
  isPublic: boolean;
  size: number;
  fileCount?: number;
  error?: string;
}> {
  try {
    const { data: repoData } = await octokit.repos.get({
      owner,
      repo,
    });

    // Check if public
    if (repoData.private) {
      return {
        exists: true,
        isPublic: false,
        size: repoData.size,
        error: "Repository is private. Only public repositories are supported.",
      };
    }

    // Check repo size (in KB from GitHub API)
    const sizeInMB = repoData.size / 1024;
    const MAX_REPO_SIZE_MB = 50;

    if (sizeInMB > MAX_REPO_SIZE_MB) {
      return {
        exists: true,
        isPublic: true,
        size: repoData.size,
        error: `Repository is too large (${sizeInMB.toFixed(1)}MB > ${MAX_REPO_SIZE_MB}MB).`,
      };
    }

    // Estimate file count by fetching the tree
    // This is approximate but good enough for validation
    try {
      const { data: treeData } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: repoData.default_branch || "main",
        recursive: "true" as any,
      });

      const MAX_FILES = 500;
      if (treeData.tree.length > MAX_FILES) {
        return {
          exists: true,
          isPublic: true,
          size: repoData.size,
          fileCount: treeData.tree.length,
          error: `Repository has too many files (${treeData.tree.length} > ${MAX_FILES}).`,
        };
      }

      return {
        exists: true,
        isPublic: true,
        size: repoData.size,
        fileCount: treeData.tree.length,
      };
    } catch (treeError) {
      // If we can't fetch the tree (maybe too large for recursive fetch),
      // assume it's too big
      return {
        exists: true,
        isPublic: true,
        size: repoData.size,
        error: "Repository is too large to enumerate files.",
      };
    }
  } catch (error) {
    const httpError = error as any;
    if (httpError.status === 404) {
      return {
        exists: false,
        isPublic: false,
        size: 0,
        error: "Repository not found.",
      };
    }

    return {
      exists: false,
      isPublic: false,
      size: 0,
      error: `GitHub API error: ${httpError.message}`,
    };
  }
}

/**
 * Get the default branch of a repo (fallback to "main" if not found).
 */
export async function getDefaultBranch(
  owner: string,
  repo: string
): Promise<string> {
  try {
    const { data: repoData } = await octokit.repos.get({
      owner,
      repo,
    });
    return repoData.default_branch || "main";
  } catch {
    return "main";
  }
}
