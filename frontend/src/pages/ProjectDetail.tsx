import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import ReactMarkdown from "react-markdown";

import {
  Brain,
  ArrowLeft,
  Loader2,
  AlertCircle,
  MessageSquare,
  GitCommit,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  api,
  ApiError,
  type IndexingStatus,
  type Message,
  type Commit,
} from "@/lib/api";

type Citation = {
  path: string;
  chunkIndex?: number;
  snippet?: string;
};

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();

  const [status, setStatus] = useState<IndexingStatus | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "commits">("chat");

  // Chat state
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Commits state
  const [commitsPage, setCommitsPage] = useState(1);
  const [totalCommits, setTotalCommits] = useState(0);
  const [loadingCommits, setLoadingCommits] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const loadData = async () => {
      try {
        const token = await getToken();

        if (!token) {
          throw new Error("No session token");
        }

        // Load indexing status
        const indexStatus = await api.projects.getStatus(
          token,
          projectId
        );

        setStatus(indexStatus);

        // Load commits
        const commitsData = await api.commits.list(
          token,
          projectId,
          1,
          10
        );

        setCommits(commitsData.commits);
        setTotalCommits(commitsData.pagination.total);

        setError(null);
      } catch (err) {
        const errorMsg =
          err instanceof ApiError ? err.message : String(err);

        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Poll indexing status every 5 seconds
    const interval = setInterval(async () => {
      try {
        const token = await getToken();

        if (!token) return;

        const indexStatus = await api.projects.getStatus(
          token,
          projectId
        );

        setStatus(indexStatus);
      } catch {
        // Ignore polling errors
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [projectId, getToken]);

  const handleSendMessage = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      !chatInput.trim() ||
      !projectId ||
      chatLoading
    ) {
      return;
    }

    const question = chatInput;

    const userMessage: Message = {
      role: "user",
      content: question,
    };

    setChatMessages((prev) => [
      ...prev,
      userMessage,
    ]);

    setChatInput("");
    setChatLoading(true);

    try {
      const token = await getToken();

      if (!token) {
        throw new Error("No session token");
      }

      const response = await api.chat.query(
        token,
        projectId,
        question,
        chatMessages
      );

      const assistantMessage: Message = {
        role: "assistant",
        content: response.answer,
        citations: response.sources,
      };

      setChatMessages((prev) => [
        ...prev,
        assistantMessage,
      ]);
    } catch (err) {
      const errorMsg =
        err instanceof ApiError
          ? err.message
          : String(err);

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${errorMsg}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadMoreCommits = async () => {
    if (!projectId) return;

    setLoadingCommits(true);

    try {
      const token = await getToken();

      if (!token) {
        throw new Error("No session token");
      }

      const nextPage = commitsPage + 1;

      const commitsData = await api.commits.list(
        token,
        projectId,
        nextPage,
        10
      );

      setCommits((prev) => [
        ...prev,
        ...commitsData.commits,
      ]);

      setCommitsPage(nextPage);
    } catch (err) {
      const errorMsg =
        err instanceof ApiError
          ? err.message
          : String(err);

      setError(errorMsg);
    } finally {
      setLoadingCommits(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loader2 className="h-8 w-8 animate-spin text-cortex-400" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />

          <p className="text-red-300">
            Project not found
          </p>

          <Button
            onClick={() => navigate("/dashboard")}
            className="mt-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  const phase = status.indexJob?.phase ?? "cloning";
  const progress = status.indexJob?.progress ?? 0;
  const isIndexing = phase !== "done";

  return (
    <div className="min-h-screen bg-surface text-zinc-100">

      {/* Header */}
      <header className="border-b border-surface-border sticky top-0 bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center gap-4">

            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 hover:bg-surface-secondary rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Brain className="h-5 w-5 text-cortex-400" />
                Cortex
              </h1>
            </div>

          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />

            <div>{error}</div>
          </div>
        )}

        {/* Status Card */}
        <Card className="mb-8 border-surface-border bg-surface-secondary">

          <CardHeader>

            <div className="flex items-start justify-between">

              <div>
                <CardTitle>
                  Indexing Status
                </CardTitle>

                <CardDescription>
                  {isIndexing
                    ? "Repository is being indexed..."
                    : "Repository is ready for queries"}
                </CardDescription>
              </div>

              {isIndexing && (
                <Loader2 className="h-5 w-5 animate-spin text-cortex-400" />
              )}

            </div>

            <div className="mt-6 space-y-4">

              {/* Progress Bar */}
              <div>

                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize">
                    {phase}
                  </span>

                  <span className="text-sm text-zinc-400">
                    {progress}%
                  </span>
                </div>

                <div className="w-full bg-surface rounded-full h-2 overflow-hidden">

                  <div
                    className="bg-gradient-to-r from-cortex-400 to-cortex-500 h-full transition-all"
                    style={{
                      width: `${progress}%`,
                    }}
                  />

                </div>

              </div>

              {/* Steps */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">

                {[
                  "cloning",
                  "parsing",
                  "chunking",
                  "embedding",
                  "commits",
                  "done",
                ].map((step) => {
                  const steps = [
                    "cloning",
                    "parsing",
                    "chunking",
                    "embedding",
                    "commits",
                    "done",
                  ];

                  const currentIndex =
                    steps.indexOf(phase);

                  const stepIndex =
                    steps.indexOf(step);

                  const isDone =
                    stepIndex < currentIndex ||
                    phase === "done";

                  const isCurrent =
                    step === phase;

                  return (
                    <div
                      key={step}
                      className={`text-xs py-2 px-3 rounded-lg text-center font-medium transition-colors ${
                        isCurrent
                          ? "bg-cortex-400/20 border border-cortex-400 text-cortex-300"
                          : isDone
                          ? "bg-emerald-400/20 border border-emerald-400 text-emerald-300"
                          : "bg-surface border border-surface-border text-zinc-400"
                      }`}
                    >
                      {step}
                    </div>
                  );
                })}

              </div>

              {status.indexJob?.error && (
                <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
                  {status.indexJob.error}
                </div>
              )}

            </div>

          </CardHeader>

        </Card>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-surface-border">

          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-3 font-medium transition-colors ${
              activeTab === "chat"
                ? "text-cortex-400 border-b-2 border-cortex-400"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <MessageSquare className="h-4 w-4 inline mr-2" />
            Chat
          </button>

          <button
            onClick={() => setActiveTab("commits")}
            className={`px-4 py-3 font-medium transition-colors ${
              activeTab === "commits"
                ? "text-cortex-400 border-b-2 border-cortex-400"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <GitCommit className="h-4 w-4 inline mr-2" />
            Commits ({totalCommits})
          </button>

        </div>

        {/* CHAT TAB */}
        {activeTab === "chat" && (
          <div className="space-y-6">

            <Card className="border-surface-border bg-surface-secondary flex flex-col h-[500px]">

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">

                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400">

                    <MessageSquare className="h-12 w-12 text-zinc-600 mb-3" />

                    <p>
                      Ask questions about your repository
                    </p>

                    <p className="text-xs mt-2">
                      RAG-powered search across your codebase
                    </p>

                  </div>
                ) : (

                  chatMessages.map((msg, idx) => {

                    // Safely convert citations into objects
                    const citations =
                      (msg.citations || []) as unknown as Array<
                        Citation | string
                      >;

                    return (
                      <div
                        key={idx}
                        className={`flex ${
                          msg.role === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >

                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                            msg.role === "user"
                              ? "bg-cortex-400/20 text-cortex-100"
                              : "bg-surface border border-surface-border text-zinc-300"
                          }`}
                        >

                          {/* Markdown Answer */}
                          <div className="text-sm prose prose-invert max-w-none break-words">

                            <ReactMarkdown>
                              {msg.content}
                            </ReactMarkdown>

                          </div>

                          {/* Sources */}
                          {citations.length > 0 && (

                            <div className="mt-4 text-xs text-zinc-500 space-y-2">

                              <p className="font-medium text-zinc-400">
                                Sources:
                              </p>

                              {citations.map(
                                (citation, cidx) => {

                                  // Handle old string citations
                                  if (
                                    typeof citation ===
                                    "string"
                                  ) {
                                    return (
                                      <div
                                        key={cidx}
                                        className="rounded border border-surface-border bg-surface p-2 text-cortex-400"
                                      >
                                        📍 {citation}
                                      </div>
                                    );
                                  }

                                  // Handle citation objects
                                  return (
                                    <div
                                      key={cidx}
                                      className="rounded border border-surface-border bg-surface p-3"
                                    >

                                      <div className="flex items-center gap-2 text-cortex-400 font-medium">

                                        <span>📍</span>

                                        <span className="break-all">
                                          {citation.path}
                                        </span>

                                      </div>

                                      {citation.snippet && (
                                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-500 font-mono">
                                          {citation.snippet}
                                        </pre>
                                      )}

                                    </div>
                                  );
                                }
                              )}

                            </div>
                          )}

                        </div>

                      </div>
                    );
                  })
                )}

                {chatLoading && (

                  <div className="flex justify-start">

                    <div className="bg-surface border border-surface-border px-4 py-2 rounded-lg flex items-center gap-2">

                      <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />

                      <span className="text-sm text-zinc-400">
                        Thinking...
                      </span>

                    </div>

                  </div>
                )}

              </div>

              {/* Input */}
              <form
                onSubmit={handleSendMessage}
                className="border-t border-surface-border p-4"
              >

                <div className="flex gap-2">

                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) =>
                      setChatInput(e.target.value)
                    }
                    placeholder="Ask about your code..."
                    className="flex-1 px-4 py-2 bg-surface border border-surface-border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-cortex-400"
                    disabled={
                      chatLoading || isIndexing
                    }
                  />

                  <button
                    type="submit"
                    disabled={
                      chatLoading ||
                      isIndexing ||
                      !chatInput.trim()
                    }
                    className="p-2 bg-cortex-400 hover:bg-cortex-500 disabled:bg-zinc-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    <Send className="h-5 w-5" />
                  </button>

                </div>

                {isIndexing && (
                  <p className="text-xs text-zinc-400 mt-2">
                    Chat is available once indexing completes
                  </p>
                )}

              </form>

            </Card>

          </div>
        )}

        {/* COMMITS TAB */}
        {activeTab === "commits" && (
          <div className="space-y-4">

            {commits.length === 0 ? (

              <Card className="border-surface-border bg-surface-secondary text-center py-12">

                <GitCommit className="h-12 w-12 text-zinc-500 mx-auto mb-4" />

                <p className="text-zinc-300">
                  No commits indexed yet
                </p>

                <p className="text-sm text-zinc-400">
                  Commits will appear here once indexing completes
                </p>

              </Card>

            ) : (

              <>
                {commits.map((commit) => (

                  <Card
                    key={commit.sha}
                    className="border-surface-border bg-surface-secondary"
                  >

                    <div className="p-6">

                      <div className="flex items-start justify-between gap-4">

                        <div className="flex-1 min-w-0">

                          <div className="flex items-center gap-3 mb-2">

                            <code className="text-xs font-mono text-cortex-400 bg-surface px-2 py-1 rounded flex-shrink-0">
                              {commit.sha.substring(0, 7)}
                            </code>

                            <p className="text-sm text-zinc-400 flex-shrink-0">
                              {commit.author}
                            </p>

                          </div>

                          <p className="text-sm font-medium mb-2 line-clamp-2">
                            {commit.message}
                          </p>

                          {commit.summary && (

                            <div className="bg-surface p-3 rounded-lg mb-3">

                              <p className="text-xs text-zinc-400 mb-1">
                                AI Summary
                              </p>

                              <p className="text-sm text-zinc-300">
                                {commit.summary}
                              </p>

                            </div>
                          )}

                          <p className="text-xs text-zinc-500">

                            {new Date(
                              commit.committedAt
                            ).toLocaleDateString()}

                            {" at "}

                            {new Date(
                              commit.committedAt
                            ).toLocaleTimeString()}

                          </p>

                        </div>

                      </div>

                    </div>

                  </Card>
                ))}

                {commits.length < totalCommits && (

                  <div className="flex justify-center pt-4">

                    <Button
                      onClick={loadMoreCommits}
                      disabled={loadingCommits}
                      variant="outline"
                    >

                      {loadingCommits && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}

                      Load more commits

                    </Button>

                  </div>
                )}

              </>
            )}

          </div>
        )}

      </main>

    </div>
  );
}