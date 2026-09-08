import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Idempotent Admin SDK init — safe to import this module from multiple
 * functions without double-initializing.
 */
if (getApps().length === 0) {
  initializeApp();
}

export const db = getFirestore();
