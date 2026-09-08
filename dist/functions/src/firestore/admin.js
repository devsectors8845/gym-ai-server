"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
let db;
try {
    if ((0, app_1.getApps)().length === 0) {
        (0, app_1.initializeApp)();
    }
    exports.db = db = (0, firestore_1.getFirestore)();
}
catch (err) {
    console.error("Failed to initialize Firebase:", err);
    exports.db = db = null;
}
//# sourceMappingURL=admin.js.map