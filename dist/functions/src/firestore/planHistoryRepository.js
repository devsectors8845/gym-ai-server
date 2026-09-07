"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePlanVersion = savePlanVersion;
exports.getPlanVersion = getPlanVersion;
exports.getCurrentPlanVersion = getCurrentPlanVersion;
exports.getPlanVersionsForWeek = getPlanVersionsForWeek;
exports.listPlanVersions = listPlanVersions;
exports.archivePlanVersion = archivePlanVersion;
exports.markPlanCompleted = markPlanCompleted;
exports.saveWeekAnalysis = saveWeekAnalysis;
exports.getWeekAnalysis = getWeekAnalysis;
exports.getLatestWeekAnalysis = getLatestWeekAnalysis;
const admin_1 = require("./admin");
const collections_1 = require("./collections");
const PLAN_HISTORY_SUBCOLLECTION = "planHistory";
const WEEK_ANALYSIS_SUBCOLLECTION = "weekAnalysis";
async function savePlanVersion(uid, planVersion) {
    const ref = admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(PLAN_HISTORY_SUBCOLLECTION)
        .doc(planVersion.planId);
    await ref.set({
        ...planVersion,
        createdAt: planVersion.createdAt || new Date().toISOString(),
    });
}
async function getPlanVersion(uid, planId) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(PLAN_HISTORY_SUBCOLLECTION)
        .doc(planId)
        .get();
    if (!snap.exists)
        return null;
    return snap.data();
}
async function getCurrentPlanVersion(uid) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(PLAN_HISTORY_SUBCOLLECTION)
        .where("status", "==", "active")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    if (snap.empty)
        return null;
    return snap.docs[0].data();
}
async function getPlanVersionsForWeek(uid, weekNumber) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(PLAN_HISTORY_SUBCOLLECTION)
        .where("weekNumber", "==", weekNumber)
        .get();
    return snap.docs.map((d) => d.data());
}
async function listPlanVersions(uid, limit = 20) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(PLAN_HISTORY_SUBCOLLECTION)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
    return snap.docs.map((d) => d.data());
}
async function archivePlanVersion(uid, planId) {
    const ref = admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(PLAN_HISTORY_SUBCOLLECTION)
        .doc(planId);
    await ref.update({
        status: "archived",
    });
}
async function markPlanCompleted(uid, planId) {
    const ref = admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(PLAN_HISTORY_SUBCOLLECTION)
        .doc(planId);
    await ref.update({
        status: "completed",
        completedAt: new Date().toISOString(),
    });
}
async function saveWeekAnalysis(uid, analysis) {
    const ref = admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(WEEK_ANALYSIS_SUBCOLLECTION)
        .doc(`${analysis.planId}_week${analysis.weekNumber}`);
    await ref.set({
        ...analysis,
        analyzedAt: analysis.analyzedAt || new Date().toISOString(),
    });
}
async function getWeekAnalysis(uid, planId, weekNumber) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(WEEK_ANALYSIS_SUBCOLLECTION)
        .doc(`${planId}_week${weekNumber}`)
        .get();
    if (!snap.exists)
        return null;
    return snap.data();
}
async function getLatestWeekAnalysis(uid) {
    const snap = await admin_1.db
        .collection(collections_1.USER_HISTORY_ROOT_COLLECTION)
        .doc(uid)
        .collection(WEEK_ANALYSIS_SUBCOLLECTION)
        .orderBy("analyzedAt", "desc")
        .limit(1)
        .get();
    if (snap.empty)
        return null;
    return snap.docs[0].data();
}
//# sourceMappingURL=planHistoryRepository.js.map