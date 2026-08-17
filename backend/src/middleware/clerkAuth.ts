import { clerkMiddleware, getAuth, requireAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";

/**
 * Clerk middleware — attaches auth context to every request.
 * Must be registered before any protected routes.
 */
export { clerkMiddleware, requireAuth };

/**
 * Returns the authenticated Clerk user ID from the verified session token.
 * Never trust a userId from the request body — always derive it here.
 */
export function getAuthenticatedUserId(req: Request): string {
  const { userId } = getAuth(req);
  if (!userId) {
    throw new AuthError("Not authenticated");
  }
  return userId;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Ensures the user record exists in our DB (upserted from Clerk on first request).
 * Identity always comes from the verified Clerk token, never from client input.
 */
export async function ensureUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId, sessionClaims } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const email =
      (sessionClaims?.email as string | undefined) ??
      (sessionClaims?.primary_email_address as string | undefined) ??
      `${userId}@clerk.local`;

    const name =
      (sessionClaims?.name as string | undefined) ??
      (sessionClaims?.full_name as string | undefined) ??
      null;

    const { prisma } = await import("../lib/prisma.js");
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email, name },
      update: { email, name },
    });

    next();
  } catch (err) {
    next(err);
  }
}

export const clerkOptions = {
  secretKey: env.CLERK_SECRET_KEY,
  publishableKey: env.CLERK_PUBLISHABLE_KEY,
};
