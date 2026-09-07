import type { Request, Response, NextFunction } from "express";
import { getAuth } from "firebase-admin/auth";
import { HttpError } from "../../../functions/src/utils/errors";

/**
 * Express middleware: extracts the Firebase ID token from the
 * `Authorization: Bearer <token>` header, verifies it via the Admin SDK,
 * and attaches the resulting `decodedToken.uid` to `req` for downstream
 * route handlers.
 *
 * On verification failure, throws `HttpError("unauthenticated", ...)` so the
 * shared error middleware emits a clean 401 with no stack / secret leakage.
 *
 * This replaces the `request.auth` that `firebase-functions/v2/https`
 * `onCall` provided. The shape stays identical (`request.auth.uid`) so the
 * underlying workout-engine handlers can be reused without modification.
 */
export interface AuthenticatedRequest extends Request {
  auth?: { uid: string };
}

export async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.header("authorization") || req.header("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return next(
      new HttpError("unauthenticated", "Missing or malformed Authorization header.")
    );
  }

  const idToken = authHeader.slice("bearer ".length).trim();
  if (!idToken) {
    return next(new HttpError("unauthenticated", "Empty bearer token."));
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    req.auth = { uid: decoded.uid };
    return next();
  } catch (err) {
    // Don't forward the underlying verifier error message — it can leak
    // details (e.g. "Token used too early", clock skew, etc.) to the
    // client. A single generic message is the right level of disclosure.
    return next(new HttpError("unauthenticated", "Invalid or expired auth token."));
  }
}
