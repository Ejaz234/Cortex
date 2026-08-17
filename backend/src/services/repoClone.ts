import { simpleGit, SimpleGit } from "simple-git";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuid } from "uuid";
import { rm } from "fs/promises";

/**
 * Clone a GitHub repo to a temp directory with shallow clone (--depth 1).
 * Returns the path to the cloned repo. Caller must call cleanup() to delete it.
 */
export async function cloneRepo(
  githubUrl: string
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const cloneDir = join(tmpdir(), `cortex-clone-${uuid()}`);

  try {
    const git: SimpleGit = simpleGit();

    // Shallow clone with depth 1 — only need current files
    await git.clone(githubUrl, cloneDir, ["--depth", "1"]);

    return {
      path: cloneDir,
      cleanup: async () => {
        try {
          await rm(cloneDir, { recursive: true, force: true });
        } catch (err) {
          console.error(`Failed to cleanup clone at ${cloneDir}:`, err);
        }
      },
    };
  } catch (error) {
    // Clean up on failure
    try {
      await rm(cloneDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * List all files in a cloned repo directory (recursively).
 * Returns array of file paths relative to the repo root.
 */
export async function listRepoFiles(
  repoPath: string,
  excludePatterns: RegExp[] = []
): Promise<string[]> {
  const { readdirSync, statSync } = await import("fs");

  const files: string[] = [];

  function walk(dir: string, prefix: string = "") {
    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relativePath = prefix ? `${prefix}/${entry}` : entry;

        // Check if should be excluded
        if (excludePatterns.some((pattern) => pattern.test(relativePath))) {
          continue;
        }

        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, relativePath);
          } else if (stat.isFile()) {
            files.push(relativePath);
          }
        } catch (err) {
          // Skip files we can't stat
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err);
    }
  }

  walk(repoPath);
  return files;
}

/**
 * Read file content from a cloned repo.
 */
export async function readRepoFile(repoPath: string, filePath: string): Promise<string> {
  const { readFile } = await import("fs/promises");
  const fullPath = join(repoPath, filePath);
  return readFile(fullPath, "utf-8");
}

/**
 * Get file size in bytes.
 */
export async function getFileSize(repoPath: string, filePath: string): Promise<number> {
  const { stat } = await import("fs/promises");
  const fullPath = join(repoPath, filePath);
  const stats = await stat(fullPath);
  return stats.size;
}
