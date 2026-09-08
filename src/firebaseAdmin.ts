import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

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
function readServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return null;
    }
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function buildApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const creds = readServiceAccount();
  if (creds) {
    return initializeApp({ credential: cert(creds) });
  }
  try {
    return initializeApp();
  } catch (err) {
    console.error("Failed to initialize Firebase:", err);
    throw err;
  }
}

let app: App;
let db: Firestore;

try {
  app = buildApp();
  db = getFirestore(app);
} catch (err) {
  console.error("Firebase initialization failed:", err);
  app = null as unknown as App;
  db = null as unknown as Firestore;
}

export { app, db };
