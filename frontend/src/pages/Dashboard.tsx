import { useEffect, useState } from "react";
import { useAuth, UserButton } from "@clerk/clerk-react";
import {
  Brain,
  Plus,
  FolderGit2,
  Loader2,
  Trash2,
  AlertCircle,
  Github,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { api, ApiError, type Project } from "@/lib/api";

export function Dashboard() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  // Project selected for deletion
  const [projectToDelete, setProjectToDelete] =
    useState<Project | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    githubUrl: "",
  });

  const loadProjects = async (token: string) => {
    try {
      const response = await api.projects.list(token);

      console.log("Projects API response:", response);

      const projectList = Array.isArray(response)
        ? response
        : (response as unknown as { projects?: Project[] }).projects ?? [];

      setProjects(projectList);
      setError(null);
    } catch (err) {
      const errorMsg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load projects.";

      console.error("Failed to load projects:", err);
      setError(errorMsg);
      setProjects([]);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    const fetchProjects = async () => {
      try {
        setLoading(true);

        const token = await getToken();

        if (!token) {
          throw new Error("No session token available.");
        }

        await loadProjects(token);
      } catch (err) {
        const errorMsg =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load projects.";

        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [isLoaded, isSignedIn, getToken]);

  const handleCreateProject = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.githubUrl.trim()) {
      setError("Project name and GitHub repository URL are required.");
      return;
    }

    try {
      setCreatingProject(true);
      setError(null);

      const token = await getToken();

      if (!token) {
        throw new Error("No session token available.");
      }

      await api.projects.create(token, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        githubUrl: formData.githubUrl.trim(),
      });

      await loadProjects(token);

      setFormData({
        name: "",
        description: "",
        githubUrl: "",
      });

      setShowCreateForm(false);
    } catch (err) {
      const errorMsg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create project.";

      setError(errorMsg);
    } finally {
      setCreatingProject(false);
    }
  };

  // Delete project
  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    const projectId = projectToDelete.id;

    try {
      setDeleting((previous) => {
        const next = new Set(previous);
        next.add(projectId);
        return next;
      });

      setError(null);

      const token = await getToken();

      if (!token) {
        throw new Error("No session token available.");
      }

      await api.projects.delete(token, projectId);

      setProjects((previous) =>
        previous.filter((project) => project.id !== projectId)
      );

      setProjectToDelete(null);
    } catch (err) {
      const errorMsg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to delete project.";

      setError(errorMsg);
    } finally {
      setDeleting((previous) => {
        const next = new Set(previous);
        next.delete(projectId);
        return next;
      });
    }
  };

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-cortex-400" />

          <p className="text-sm text-zinc-400">
            Loading your workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-zinc-300">
        <Brain className="h-10 w-10 text-cortex-400" />

        <div className="text-center">
          <h1 className="text-xl font-semibold text-white">
            Sign in required
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Sign in to access your projects.
          </p>
        </div>

        <Link to="/">
          <Button variant="outline">Back to home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-zinc-100">
      {/* Header */}
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            to="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <Brain className="h-7 w-7 text-cortex-400" />

            <span className="text-xl font-semibold tracking-tight">
              Cortex
            </span>
          </Link>

          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Page heading */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Your projects
            </h1>

            <p className="mt-2 text-zinc-400">
              Connect GitHub repositories and explore them with AI.
            </p>
          </div>

          <Button
            onClick={() => {
              setShowCreateForm((previous) => !previous);
              setError(null);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />

            {showCreateForm ? "Cancel" : "New project"}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <div className="flex-1">
              <p>{error}</p>
            </div>

            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-300 transition hover:text-white"
            >
              ×
            </button>
          </div>
        )}

        {/* Create project form */}
        {showCreateForm && (
          <Card className="mb-8 border-surface-border bg-surface-secondary">
            <CardHeader>
              <CardTitle>Create new project</CardTitle>

              <CardDescription>
                Connect a public GitHub repository to start exploring it with AI.
              </CardDescription>
            </CardHeader>

            <form
              onSubmit={handleCreateProject}
              className="space-y-5 px-6 pb-6"
            >
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-200">
                  Project name
                </label>

                <input
                  type="text"
                  placeholder="My awesome project"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((previous) => ({
                      ...previous,
                      name: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-white outline-none transition placeholder:text-zinc-500 focus:border-cortex-400"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-200">
                  Description
                  <span className="ml-1 text-zinc-500">(optional)</span>
                </label>

                <input
                  type="text"
                  placeholder="What does this project do?"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((previous) => ({
                      ...previous,
                      description: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-white outline-none transition placeholder:text-zinc-500 focus:border-cortex-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-200">
                  GitHub repository URL
                </label>

                <input
                  type="url"
                  placeholder="https://github.com/owner/repository"
                  value={formData.githubUrl}
                  onChange={(e) =>
                    setFormData((previous) => ({
                      ...previous,
                      githubUrl: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-white outline-none transition placeholder:text-zinc-500 focus:border-cortex-400"
                  required
                />

                <p className="mt-2 text-xs text-zinc-500">
                  Currently supports public GitHub repositories.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={creatingProject}>
                  {creatingProject ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create project
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  disabled={creatingProject}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Empty state */}
        {projects.length === 0 && !showCreateForm && (
          <Card className="flex min-h-[300px] flex-col items-center justify-center border-surface-border bg-surface-secondary px-6 text-center">
            <FolderGit2 className="mb-5 h-14 w-14 text-zinc-600" />

            <CardTitle className="text-xl">
              No projects yet
            </CardTitle>

            <CardDescription className="mt-3 max-w-md">
              Connect a public GitHub repository and start exploring your
              codebase with AI-powered search and insights.
            </CardDescription>

            <Button
              className="mt-6"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create your first project
            </Button>
          </Card>
        )}

        {/* Projects grid */}
        {projects.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/project/${project.id}`}
                className="group"
              >
                <Card className="flex h-full flex-col border-surface-border bg-surface-secondary transition-all duration-200 hover:-translate-y-1 hover:border-cortex-400/60">
                  <CardHeader>
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="rounded-lg bg-cortex-950/50 p-2">
                        <Github className="h-5 w-5 text-cortex-400" />
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        aria-label={`Delete ${project.name}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setProjectToDelete(project);
                        }}
                        disabled={deleting.has(project.id)}
                        className="rounded-md p-2 text-zinc-500 transition hover:bg-red-950/30 hover:text-red-400 disabled:cursor-not-allowed"
                      >
                        {deleting.has(project.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    <CardTitle className="line-clamp-1 transition-colors group-hover:text-cortex-300">
                      {project.name}
                    </CardTitle>

                    <CardDescription className="mt-2 line-clamp-2">
                      {project.description ||
                        "Explore this repository with AI-powered insights."}
                    </CardDescription>
                  </CardHeader>

                  <div className="mt-auto border-t border-surface-border px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Github className="h-3.5 w-3.5" />

                      <span className="truncate">
                        {project.githubOwner}/{project.githubRepo}
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-surface-border bg-surface-secondary p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-red-950/40 p-3">
                <Trash2 className="h-6 w-6 text-red-400" />
              </div>

              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">
                  Delete project?
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-zinc-200">
                    {projectToDelete.name}
                  </span>
                  ? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setProjectToDelete(null)}
                disabled={deleting.has(projectToDelete.id)}
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={handleDeleteProject}
                disabled={deleting.has(projectToDelete.id)}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting.has(projectToDelete.id) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete project
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}