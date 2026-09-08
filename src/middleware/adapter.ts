import type { Request } from "express";
import { HttpError } from "../../functions/src/utils/errors";
import type { AuthenticatedRequest } from "./auth";
import type { CallableRequest } from "firebase-functions/v2/https";

/**
 * Wraps a Cloud-Functions-style async handler `(CallableRequest) => result`
 * into an Express middleware `(req, res, next) => void`. Any thrown
 * `HttpError` (or any other error) is forwarded to `next()` so the shared
 * error middleware can produce the JSON response.
 *
 * The handler receives a `CallableRequest` whose `data` is the parsed JSON
 * body and whose `auth` has been populated by the `requireFirebaseAuth`
 * middleware. `rawRequest` and `acceptsStreaming` are stubbed — the
 * workout-engine handlers never touch them.
 */
export function adaptHandler<TReq, TRes>(
  handler: (request: CallableRequest<TReq>) => Promise<TRes>
): (req: Request, res: import("express").Response, next: import("express").NextFunction) => void {
  return async (req, res, next) => {
    try {
      const authed = req as AuthenticatedRequest;
      if (!authed.auth?.uid) {
        // The auth middleware should have set this or thrown a 401. Defence
        // in depth: a route that forgets to mount the middleware fails loud
        // rather than treating the request as anonymous.
        throw new HttpError("unauthenticated", "Auth middleware missing on this route.");
      }
      const callableReq: CallableRequest<TReq> = {
        data: (req.body ?? {}) as TReq,
        // The handlers only ever read `request.auth.uid` — the rest of
        // `AuthData` (token, rawToken) is never touched. We supply a
        // minimal stub via `unknown` so the type lines up without lying
        // about which fields are verified.
        auth: authed.auth as unknown as CallableRequest<TReq>["auth"],
        // rawRequest/acceptsStreaming are required fields on CallableRequest
        // but never read by the workout handlers. Stub them.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rawRequest: null as any,
        acceptsStreaming: false,
      };
      const result = await handler(callableReq);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
