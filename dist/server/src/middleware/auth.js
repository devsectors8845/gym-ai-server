"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFirebaseAuth = requireFirebaseAuth;
const auth_1 = require("firebase-admin/auth");
const errors_1 = require("../../../functions/src/utils/errors");
async function requireFirebaseAuth(req, _res, next) {
    const authHeader = req.header("authorization") || req.header("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
        return next(new errors_1.HttpError("unauthenticated", "Missing or malformed Authorization header."));
    }
    const idToken = authHeader.slice("bearer ".length).trim();
    if (!idToken) {
        return next(new errors_1.HttpError("unauthenticated", "Empty bearer token."));
    }
    try {
        const decoded = await (0, auth_1.getAuth)().verifyIdToken(idToken);
        req.auth = { uid: decoded.uid };
        return next();
    }
    catch (err) {
        // Don't forward the underlying verifier error message — it can leak
        // details (e.g. "Token used too early", clock skew, etc.) to the
        // client. A single generic message is the right level of disclosure.
        return next(new errors_1.HttpError("unauthenticated", "Invalid or expired auth token."));
    }
}
//# sourceMappingURL=auth.js.map