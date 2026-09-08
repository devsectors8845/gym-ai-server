import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let db: Firestore;

try {
  if (getApps().length === 0) {
    initializeApp();
  }
  db = getFirestore();
} catch (err) {
  console.error("Failed to initialize Firebase:", err);
  db = null as unknown as Firestore;
}

export { db };
