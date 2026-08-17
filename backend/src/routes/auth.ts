import { Router } from "express";
import { getAuth } from "@clerk/express";
import { getAuthenticatedUserId } from "../middleware/clerkAuth.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

/**
 * GET /api/me
 * Returns the current user derived from the verified Clerk session token.
 * Demonstrates the auth pattern: identity from token, never from request body.
 */
router.get("/me", (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { sessionClaims } = getAuth(req);

    prisma.user
      .findUnique({ where: { id: userId } })
      .then((user) => {
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }

        res.json({
          id: user.id,
          email: user.email,
          name: user.name,
          clerkSession: {
            userId,
            sessionId: getAuth(req).sessionId,
          },
        });
      })
      .catch(next);
  } catch (err) {
    next(err);
  }
});

export default router;
