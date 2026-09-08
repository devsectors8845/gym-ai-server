"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.app = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
/**
 * Initializes the Firebase Admin SDK exactly once per server instance.
 *
 * The original Cloud Function (`functions/src/firestore/admin.ts`) calls
 * `initializeApp()` with no args, which works in the Cloud Functions
 * runtime because Google auto-injects a service account. On Vercel (or any
 * other host) we have to provide the service account explicitly. We read
 * its JSON from a single `FIREBASE_SERVICE_ACCOUNT` environment variable
 * (the standard pattern for serverless).
 *
 * Why a JSON string instead of a path? Vercel only injects env vars —
 * there's no filesystem to load a JSON file from at runtime.
 *
 * If the env var is missing, the request will fail at the first Firestore
 * call with a clear "default credentials" error rather than at startup, so
 * misconfigured deploys surface immediately on the first request rather
 * than at cold start.
 */
function readServiceAccount() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
            return null;
        }
        return {
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
    }
    catch {
        return null;
    }
}
function buildApp() {
    const existing = (0, app_1.getApps)()[0];
    if (existing)
        return existing;
    const creds = readServiceAccount();
    if (creds) {
        return (0, app_1.initializeApp)({ credential: (0, app_1.cert)(creds) });
    }
    try {
        return (0, app_1.initializeApp)();
    }
    catch (err) {
        console.error("Failed to initialize Firebase:", err);
        throw err;
    }
}
let app;
let db;
try {
    exports.app = app = buildApp();
    exports.db = db = (0, firestore_1.getFirestore)(app);
}
catch (err) {
    console.error("Firebase initialization failed:", err);
    exports.app = app = null;
    exports.db = db = null;
}
//# sourceMappingURL=firebaseAdmin.js.map