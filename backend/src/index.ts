import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import { env } from "./config/env.js";
import { clerkOptions, ensureUser } from "./middleware/clerkAuth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import projectsRoutes from "./routes/projects.js";

const app = express();

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());

// Clerk attaches auth context to every request
app.use(clerkMiddleware(clerkOptions));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Protected API routes — require valid Clerk session + synced user record
app.use("/api", requireAuth(), ensureUser, authRoutes);
app.use("/api/projects", requireAuth(), ensureUser, projectsRoutes);

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Cortex backend running on http://localhost:${env.PORT}`);
});
