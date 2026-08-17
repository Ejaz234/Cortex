import type { Request, Response, NextFunction } from "express";
import { AuthError } from "./clerkAuth.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AuthError) {
    res.status(401).json({ error: err.message });
    return;
  }

  console.error("[error]", err);
  res.status(500).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
}
