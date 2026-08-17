import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { getAuthenticatedUserId } from "../middleware/clerkAuth.js";
import { prisma } from "../lib/prisma.js";
import { parseGitHubUrl, validateGitHubRepo, getDefaultBranch } from "../services/github.js";
import { startIndexingJob } from "../services/indexingQueue.js";
import { answerQuestion } from "../services/chat.js";
import { v4 as uuid } from "uuid";

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  githubUrl: z.string().url(),
});

const chatSchema = z.object({
  question: z.string().min(1).max(2000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Async route wrapper — catches errors and passes to error handler.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/projects
 * Create a new project from a GitHub repo URL.
 * Validates the repo exists and is public, then kicks off async indexing.
 * Returns 202 Accepted with the project and initial IndexJob.
 */
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);

    // Validate input
    const input = createProjectSchema.parse(req.body);
    const { name, githubUrl } = input;

    // Parse GitHub URL
    let parsed;
    try {
      parsed = parseGitHubUrl(githubUrl);
    } catch (err) {
      res.status(400).json({
        error: "Invalid GitHub URL format. Expected: https://github.com/owner/repo",
      });
      return;
    }

    const { owner, repo } = parsed;

    // Validate the repo exists and is public
    const validation = await validateGitHubRepo(owner, repo);

    if (!validation.exists) {
      res.status(404).json({
        error: validation.error || "Repository not found",
      });
      return;
    }

    if (!validation.isPublic) {
      res.status(403).json({
        error: validation.error || "Repository is private",
      });
      return;
    }

    if (validation.error) {
      res.status(400).json({
        error: validation.error,
      });
      return;
    }

    // Get default branch
    const defaultBranch = await getDefaultBranch(owner, repo);

    // Create Project record
    const project = await prisma.project.create({
      data: {
        id: uuid(),
        name,
        githubUrl,
        githubOwner: owner,
        githubRepo: repo,
        defaultBranch,
        status: "indexing",
        ownerId: userId,
      },
    });

    // Create IndexJob record
    const indexJob = await prisma.indexJob.create({
      data: {
        id: uuid(),
        projectId: project.id,
        phase: "cloning" as any,
        progress: 0,
        status: "running",
      },
    });

    // Kick off async indexing (fire-and-forget)
    setImmediate(() => {
      startIndexingJob(project.id, githubUrl).catch((err) => {
        console.error(`Unhandled error in indexing job for project ${project.id}:`, err);
      });
    });

    // Return 202 Accepted
    res.status(202).json({
      project: {
        id: project.id,
        name: project.name,
        githubUrl: project.githubUrl,
        status: project.status,
        createdAt: project.createdAt,
      },
      indexJob: {
        id: indexJob.id,
        phase: (indexJob as any).phase || "cloning",
        progress: indexJob.progress,
        status: indexJob.status,
      },
    });
  })
);

/**
 * GET /api/projects
 * List all projects owned by the current user.
 */
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);

    const projects = await prisma.project.findMany({
      where: { ownerId: userId },
      include: {
        indexJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        githubUrl: p.githubUrl,
        status: p.status,
        createdAt: p.createdAt,
        latestIndexJob: p.indexJobs[0] || null,
      })),
    });
  })
);

/**
 * GET /api/projects/:id
 * Get project details by ID.
 */
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        indexJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Verify ownership
    if (project.ownerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    res.json({
      id: project.id,
      name: project.name,
      githubUrl: project.githubUrl,
      githubOwner: project.githubOwner,
      githubRepo: project.githubRepo,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      latestIndexJob: project.indexJobs[0] || null,
    });
  })
);

/**
 * GET /api/projects/:id/status
 * Get the current indexing status and progress.
 */
router.get(
  "/:id/status",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (project.ownerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Get latest IndexJob
    const indexJob = await prisma.indexJob.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
    });

    if (!indexJob) {
      res.json({
        projectStatus: project.status,
        indexJob: null,
      });
      return;
    }

    res.json({
      projectStatus: project.status,
      indexJob: {
        id: indexJob.id,
        phase: (indexJob as any).phase || "cloning",
        progress: indexJob.progress,
        status: indexJob.status,
        currentStep: indexJob.currentStep,
        error: indexJob.error,
        startedAt: indexJob.startedAt,
        completedAt: indexJob.completedAt,
      },
    });
  })
);

/**
 * GET /api/projects/:id/files
 * List all indexed files for a project.
 */
router.get(
  "/:id/files",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (project.ownerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Get all FileIndex records
    const files = await prisma.fileIndex.findMany({
      where: { projectId: id },
      orderBy: { indexedAt: "desc" },
    });

    res.json({
      total: files.length,
      files: files.map((f) => ({
        id: f.id,
        path: f.path,
        sha: f.sha,
        summary: f.summary,
        indexedAt: f.indexedAt,
      })),
    });
  })
);

/**
 * POST /api/projects/:id/chat
 * Ask a question about the indexed project code.
 * Returns answer + source citations from relevant code chunks.
 */
router.post(
  "/:id/chat",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (project.ownerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Check project is indexed
    if (project.status !== "ready") {
      res.status(400).json({
        error: `Project is not ready for chat. Status: ${project.status}`,
      });
      return;
    }

    // Validate input
    const input = chatSchema.parse(req.body);
    const { question, conversationHistory } = input;

    try {
      // Get answer from RAG pipeline
      const result = await answerQuestion(id, question, conversationHistory);

      // Store message in database
      const message = await prisma.chatMessage.create({
        data: {
          id: uuid(),
          projectId: id,
          userId,
          role: "assistant",
          content: result.answer,
          sources: result.sources as any,
        },
      });

      res.json({
        id: message.id,
        answer: result.answer,
        sources: result.sources,
        hadContext: result.hadContext,
      });
    } catch (error) {
      console.error("Error answering question:", error);
      res.status(500).json({
        error: "Failed to answer question",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  })
);

/**
 * GET /api/projects/:id/commits
 * List commits for a project with their AI summaries.
 * Returns paginated results sorted by date descending (newest first).
 */
router.get(
  "/:id/commits",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100); // Cap at 100
    const skip = (page - 1) * limit;

    // Verify project ownership
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (project.ownerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Fetch commits with pagination
    const [commits, total] = await Promise.all([
      prisma.commitSummary.findMany({
        where: { projectId: id },
        orderBy: { committedAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          sha: true,
          message: true,
          author: true,
          committedAt: true,
          summary: true,
          summarizedAt: true,
        },
      }),
      prisma.commitSummary.count({
        where: { projectId: id },
      }),
    ]);

    res.json({
      commits,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * DELETE /api/projects/:id
 * Delete a project and all its associated data (cascades via Prisma schema).
 */
router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    if (project.ownerId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await prisma.project.delete({
      where: { id },
    });

    res.status(204).send();
  })
);

export default router;
