import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function initializeFirebase() {
  if (getApps().some(app => app.name === "[DEFAULT]")) return getApp();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    if (process.env.VERCEL) throw new Error("FIREBASE_SERVICE_ACCOUNT must be configured on Vercel.");
    return initializeApp(); // Application Default Credentials / local emulators.
  }
  let credentials;
  try {
    credentials = JSON.parse(raw);
    if (!credentials.project_id || !credentials.client_email || !credentials.private_key) throw new Error();
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON.");
  }
  return initializeApp({ credential: cert({
    projectId: credentials.project_id,
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key.replace(/\\n/g, "\n"),
  }) });
}

export const app = initializeFirebase();
export const db = getFirestore(app);
