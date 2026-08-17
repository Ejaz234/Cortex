import { useEffect } from "react";
import { Brain, Github, MessageSquare, GitCommit } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  useUser,
} from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";

export function Landing() {
  const { isSignedIn } = useUser();
  const navigate = useNavigate();

  // Signed-in visitors land on the dashboard instead of the marketing page
  useEffect(() => {
    if (isSignedIn) {
      navigate("/dashboard", { replace: true });
    }
  }, [isSignedIn, navigate]);

  return (
    <div className="min-h-screen bg-surface text-zinc-100">
      {/* Navigation */}
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Brain className="h-7 w-7 text-cortex-400" />
            <span className="text-xl font-semibold tracking-tight">
              Cortex
            </span>
          </div>

          {/* Authentication buttons */}
          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <Link to="/dashboard">
                <Button>Go to dashboard</Button>
              </Link>
            ) : (
              <>
                <SignInButton mode="modal">
                  <Button variant="ghost">Sign in</Button>
                </SignInButton>

                <SignUpButton mode="modal">
                  <Button>Get started</Button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cortex-800 bg-cortex-950/50 px-4 py-1.5 text-sm text-cortex-300">
            <Brain className="h-4 w-4" />
            AI-powered codebase intelligence
          </div>

          {/* Heading */}
          <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight text-white md:text-6xl">
            Understand any GitHub repo{" "}
            <span className="bg-gradient-to-r from-cortex-400 to-cortex-600 bg-clip-text text-transparent">
              in seconds
            </span>
          </h1>

          {/* Description */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            Connect a public repository, get AI summaries of every commit, ask
            natural-language questions grounded in your source code, and invite
            your team to a shared workspace.
          </p>

          {/* Hero buttons */}
          <div className="mt-10 flex items-center justify-center gap-4">
            {isSignedIn ? (
              <Link to="/dashboard">
                <Button size="lg">Go to dashboard</Button>
              </Link>
            ) : (
              <>
                <SignUpButton mode="modal">
                  <Button size="lg">Start for free</Button>
                </SignUpButton>

                <SignInButton mode="modal">
                  <Button variant="outline" size="lg">
                    Sign in
                  </Button>
                </SignInButton>
              </>
            )}
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-surface-border bg-surface-raised/50 py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 md:grid-cols-3">
            <FeatureCard
              icon={<MessageSquare className="h-6 w-6 text-cortex-400" />}
              title="Ask the codebase"
              description="RAG-powered Q&A that cites actual source files — not hallucinated answers."
            />

            <FeatureCard
              icon={<GitCommit className="h-6 w-6 text-cortex-400" />}
              title="Commit summaries"
              description="AI-generated summaries for every push, displayed in a searchable timeline."
            />

            <FeatureCard
              icon={<Github className="h-6 w-6 text-cortex-400" />}
              title="Team workspaces"
              description="Invite teammates with a secure link. Everyone shares the same indexed context."
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-surface-border py-8 text-center text-sm text-zinc-500">
        Cortex — portfolio project. All AI and GitHub calls happen server-side.
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-6">
      <div className="mb-4">{icon}</div>

      <h3 className="mb-2 text-lg font-semibold text-white">
        {title}
      </h3>

      <p className="text-sm leading-relaxed text-zinc-400">
        {description}
      </p>
    </div>
  );
}