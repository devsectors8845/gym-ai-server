"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.app = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
function initializeFirebase() {
    if ((0, app_1.getApps)().some(app => app.name === "[DEFAULT]"))
        return (0, app_1.getApp)();
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        if (process.env.VERCEL)
            throw new Error("FIREBASE_SERVICE_ACCOUNT must be configured on Vercel.");
        return (0, app_1.initializeApp)(); // Application Default Credentials / local emulators.
    }
    let credentials;
    try {
        credentials = JSON.parse(raw);
        if (!credentials.project_id || !credentials.client_email || !credentials.private_key)
            throw new Error();
    }
    catch {
        throw new Error("FIREBASE_SERVICE_ACCOUNT must contain valid service-account JSON.");
    }
    return (0, app_1.initializeApp)({ credential: (0, app_1.cert)({
            projectId: credentials.project_id,
            clientEmail: credentials.client_email,
            privateKey: credentials.private_key.replace(/\\n/g, "\n"),
        }) });
}
exports.app = initializeFirebase();
exports.db = (0, firestore_1.getFirestore)(exports.app);
//# sourceMappingURL=firebaseAdmin.js.map