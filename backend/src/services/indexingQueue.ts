import { prisma } from "../lib/prisma.js";
import {
  cloneRepo,
  listRepoFiles,
  readRepoFile,
  getFileSize,
} from "./repoClone.js";
import {
  shouldIndexFile,
  getExcludePatterns,
} from "../config/file-filter.js";
import { chunkFileContent } from "./chunking.js";
import { embedTexts } from "./embeddings.js";
import { storeEmbedding } from "./vectorSearch.js";
import { fetchCommits } from "./commits.js";
import { summarizeCommits } from "./commitSummary.js";
import { createHash } from "crypto";

/**
 * Main indexing job.
 *
 * Flow:
 * cloning -> parsing -> chunking -> embedding -> commits -> done
 */
export async function startIndexingJob(
  projectId: string,
  githubUrl: string
): Promise<void> {
  let jobId: string | null = null;

  try {
    console.log(
      `Starting indexing job for project: ${projectId}`
    );

    // Find the latest IndexJob for this project
    const job = await prisma.indexJob.findFirst({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!job) {
      throw new Error(
        `IndexJob not found for project ${projectId}`
      );
    }

    jobId = job.id;

    // Mark project as indexing
    await prisma.project.update({
      where: {
        id: projectId,
      },
      data: {
        status: "indexing",
      },
    });

    // =====================================
    // PHASE 1: CLONING
    // =====================================

    await updateIndexJob(
      jobId,
      "cloning",
      0,
      "Cloning repository"
    );

    console.log(`Cloning repository: ${githubUrl}`);

    const { path: repoPath, cleanup } =
      await cloneRepo(githubUrl);

    try {
      // =====================================
      // PHASE 2: PARSING
      // =====================================

      await updateIndexJob(
        jobId,
        "parsing",
        0,
        "Finding repository files"
      );

      const excludePatterns =
        getExcludePatterns();

      const allFiles =
        await listRepoFiles(
          repoPath,
          excludePatterns
        );

      const filesList: Array<{
        path: string;
        size: number;
      }> = [];

      for (const file of allFiles) {
        try {
          const size =
            await getFileSize(
              repoPath,
              file
            );

          if (
            shouldIndexFile(
              file,
              size
            )
          ) {
            filesList.push({
              path: file,
              size,
            });
          }
        } catch (error) {
          console.warn(
            `Skipping unreadable file: ${file}`
          );
        }
      }

      const totalFiles = filesList.length;

      console.log(
        `Found ${totalFiles} files to index`
      );

      // =====================================
      // PHASE 3: CHUNKING
      // =====================================

      await updateIndexJob(
        jobId,
        "chunking",
        0,
        "Preparing code chunks"
      );

      const chunkMetadata: Array<{
        fileIndexId: string;
        chunkIndex: number;
        content: string;
      }> = [];

      for (
        let i = 0;
        i < filesList.length;
        i++
      ) {
        const { path } = filesList[i];

        try {
          const content =
            await readRepoFile(
              repoPath,
              path
            );

          const sha =
            createHash("sha256")
              .update(content)
              .digest("hex");

          const fileIndex =
            await prisma.fileIndex.upsert({
              where: {
                projectId_path: {
                  projectId,
                  path,
                },
              },

              create: {
                projectId,
                path,
                sha,
                summary: null,
              },

              update: {
                sha,
              },
            });

          const chunks =
            await chunkFileContent(
              path,
              content
            );

          for (const chunk of chunks) {
            chunkMetadata.push({
              fileIndexId:
                fileIndex.id,
              chunkIndex:
                chunk.chunkIndex,
              content:
                chunk.content,
            });
          }

          const progress =
            totalFiles === 0
              ? 100
              : Math.round(
                  ((i + 1) /
                    totalFiles) *
                    100
                );

          await updateIndexJob(
            jobId,
            "chunking",
            progress,
            `Processing file ${i + 1}/${totalFiles}`
          );
        } catch (error) {
          console.error(
            `Error processing file ${path}:`,
            error
          );
        }
      }

      console.log(
        `Created ${chunkMetadata.length} chunks`
      );

      // =====================================
      // PHASE 4: EMBEDDING
      // =====================================

      await updateIndexJob(
        jobId,
        "embedding",
        0,
        "Generating embeddings"
      );

      const totalChunks =
        chunkMetadata.length;

      if (totalChunks === 0) {
        await updateIndexJob(
          jobId,
          "embedding",
          100,
          "No chunks to embed"
        );
      } else {
        for (
          let i = 0;
          i < totalChunks;
          i += 5
        ) {
          const batch =
            chunkMetadata.slice(
              i,
              Math.min(
                i + 5,
                totalChunks
              )
            );

          try {
             console.log(
    `Embedding batch ${i}-${i + batch.length - 1}`,
    batch.map((item) => ({
      fileIndexId: item.fileIndexId,
      chunkIndex: item.chunkIndex,
      contentLength: item.content.length,
      preview: item.content.substring(0, 100),
    }))
  );
            const embeddings =
              await embedTexts(
                batch.map(
                  (item) =>
                    item.content
                )
              );

            for (
              let j = 0;
              j < batch.length;
              j++
            ) {
              const {
                fileIndexId,
                chunkIndex,
                content,
              } = batch[j];

              const embedding =
                embeddings[j];

              if (!embedding) {
                console.warn(
                  `Missing embedding for chunk ${chunkIndex}`
                );
                continue;
              }

              await storeEmbedding(
                projectId,
                fileIndexId,
                chunkIndex,
                content,
                embedding
              );
            }

            const progress =
              Math.round(
                ((i + batch.length) /
                  totalChunks) *
                  100
              );

            await updateIndexJob(
              jobId,
              "embedding",
              progress,
              `Embedding ${i + batch.length}/${totalChunks} chunks`
            );
          } catch (error) {
            console.error(
              `Error embedding batch ${i}:`,
              error
            );
          }
        }
      }

      // =====================================
      // PHASE 5: COMMITS
      // =====================================

      await updateIndexJob(
        jobId,
        "commits",
        0,
        "Syncing GitHub commits"
      );

      await syncProjectCommits(
        projectId
      );

      await updateIndexJob(
        jobId,
        "commits",
        100,
        "Commits synced"
      );

      // =====================================
      // PHASE 6: DONE
      // =====================================

      await updateIndexJob(
        jobId,
        "done",
        100,
        "Indexing completed"
      );

      await prisma.project.update({
        where: {
          id: projectId,
        },
        data: {
          status: "ready",
        },
      });

      console.log(
        `Indexing completed successfully for project ${projectId}`
      );
    } finally {
      // Always delete temporary cloned repository
      await cleanup();
    }
  } catch (error) {
    console.error(
      `Indexing job failed for project ${projectId}:`,
      error
    );

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error during indexing";

    try {
      // Update IndexJob as failed
      if (jobId) {
        await prisma.indexJob.update({
          where: {
            id: jobId,
          },
          data: {
            phase: "failed",
            status: "failed",
            error: errorMessage,
            completedAt: new Date(),
          },
        });
      } else {
        const job =
          await prisma.indexJob.findFirst({
            where: {
              projectId,
            },
            orderBy: {
              createdAt: "desc",
            },
          });

        if (job) {
          await prisma.indexJob.update({
            where: {
              id: job.id,
            },
            data: {
              phase: "failed",
              status: "failed",
              error: errorMessage,
              completedAt: new Date(),
            },
          });
        }
      }

      // Mark project as failed
      await prisma.project.update({
        where: {
          id: projectId,
        },
        data: {
          status: "failed",
        },
      });
    } catch (dbError) {
      console.error(
        "Failed to update indexing failure status:",
        dbError
      );
    }
  }
}

/**
 * Fetch the latest 50 commits and store them.
 */
async function syncProjectCommits(
  projectId: string
): Promise<void> {
  try {
    const project =
      await prisma.project.findUnique({
        where: {
          id: projectId,
        },
      });

    if (!project) {
      console.warn(
        `Project ${projectId} not found for commit sync`
      );
      return;
    }

    console.log(
      `Syncing commits for ${project.githubOwner}/${project.githubRepo}`
    );

    const commits =
      await fetchCommits(
        project.githubOwner,
        project.githubRepo,
        50
      );

    if (commits.length === 0) {
      console.log(
        "No commits found"
      );
      return;
    }

    const summaries =
      await summarizeCommits(
        commits
      );

    for (
      let i = 0;
      i < commits.length;
      i++
    ) {
      const commit = commits[i];

      const summary =
        summaries[i] ??
        "Unable to generate summary";

      try {
        await prisma.commitSummary.upsert({
          where: {
            projectId_sha: {
              projectId,
              sha: commit.sha,
            },
          },

          create: {
            projectId,
            sha: commit.sha,
            message:
              commit.message.substring(
                0,
                500
              ),
            author:
              commit.author,
            committedAt:
              commit.committedAt,
            summary,
            summarizedAt:
              new Date(),
          },

          update: {
            message:
              commit.message.substring(
                0,
                500
              ),
            author:
              commit.author,
            committedAt:
              commit.committedAt,
            summary,
            summarizedAt:
              new Date(),
          },
        });
      } catch (error) {
        console.error(
          `Failed to store commit ${commit.sha}:`,
          error
        );
      }
    }

    console.log(
      `Successfully synced ${commits.length} commits`
    );
  } catch (error) {
    // Commit errors should not fail the entire indexing job
    console.error(
      "Error syncing commits:",
      error
    );
  }
}

/**
 * Update indexing progress.
 */
async function updateIndexJob(
  jobId: string,
  phase:
    | "cloning"
    | "parsing"
    | "chunking"
    | "embedding"
    | "commits"
    | "done",
  progress: number,
  currentStep?: string | null
): Promise<void> {
  await prisma.indexJob.update({
    where: {
      id: jobId,
    },

    data: {
      phase,
      progress,
      currentStep:
        currentStep ?? phase,

      status:
        phase === "done"
          ? "completed"
          : "running",

      startedAt:
        phase === "cloning"
          ? new Date()
          : undefined,

      completedAt:
        phase === "done"
          ? new Date()
          : undefined,
    },
  });
}