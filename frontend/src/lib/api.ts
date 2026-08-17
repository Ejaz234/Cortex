/**
 * All API calls go through our backend — never to third-party APIs directly.
 * Auth token is the Clerk session JWT, sent as Bearer token.
 */

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers ?? {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] =
      `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({
      error: res.statusText,
    }));

    throw new ApiError(
      body.error ?? body.message ?? "Request failed",
      res.status
    );
  }
   if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;

  // Matches your Prisma schema
  githubUrl: string;
  githubOwner: string;
  githubRepo: string;
  defaultBranch: string;

  status: "pending" | "indexing" | "ready" | "failed";

  createdAt: string;
  updatedAt: string;
}

// Matches the actual shape returned by GET /api/projects/:id/status
export interface IndexingStatus {
  projectStatus: "pending" | "indexing" | "ready" | "failed";
  indexJob: {
    id: string;
    phase:
      | "cloning"
      | "parsing"
      | "chunking"
      | "embedding"
      | "commits"
      | "done"
      | "failed";
    progress: number;
    status: "queued" | "running" | "completed" | "failed";
    currentStep: string | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
}

export interface Citation {
  path: string;
  chunkIndex: number;
  snippet: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

// Matches the actual shape returned by POST /api/projects/:id/chat
export interface ChatResponse {
  id: string;
  answer: string;
  sources: string[];
  hadContext: boolean;
}

export interface Commit {
  id: string;
  projectId: string;
  sha: string;
  message: string;
  author: string;
  committedAt: string;
  summary: string | null;
  summarizedAt: string | null;
}

export interface CommitsResponse {
  commits: Commit[];

  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export const api = {
  // User
  getMe: (token: string) =>
    request<MeResponse>("/api/me", {
      token,
    }),

  // Projects
  projects: {
    list: (token: string) =>
      request<Project[]>("/api/projects", {
        token,
      }),

    create: (
      token: string,
      data: {
        name: string;
        githubUrl: string;
      }
    ) =>
      request<Project>("/api/projects", {
        token,
        method: "POST",
        body: JSON.stringify(data),
      }),

    delete: (token: string, id: string) =>
      request<void>(`/api/projects/${id}`, {
        token,
        method: "DELETE",
      }),

    getStatus: (token: string, id: string) =>
      request<IndexingStatus>(
        `/api/projects/${id}/status`,
        {
          token,
        }
      ),
  },

  // Chat
  chat: {
    query: (
      token: string,
      projectId: string,
      message: string,
      history: Message[] = []
    ) =>
      request<ChatResponse>(
        `/api/projects/${projectId}/chat`,
        {
          token,
          method: "POST",
          body: JSON.stringify({
            question: message,
            conversationHistory: history,
          }),
        }
      ),
  },

  // Commits
  commits: {
    list: (
      token: string,
      projectId: string,
      page = 1,
      limit = 20
    ) =>
      request<CommitsResponse>(
        `/api/projects/${projectId}/commits?page=${page}&limit=${limit}`,
        {
          token,
        }
      ),
  },
};