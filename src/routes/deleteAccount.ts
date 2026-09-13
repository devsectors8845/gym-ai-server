import { Router, type Response, type NextFunction } from "express";
import { getAuth } from "firebase-admin/auth";
import { db } from "../firebaseAdmin";
import { requireFirebaseAuth, type AuthenticatedRequest } from "../middleware/auth";
import { HttpError } from "../../functions/src/utils/errors";

export async function deleteAccountHandler(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const uid = req.auth?.uid;
    const authTime = req.auth?.authTime;
    if (!uid) throw new HttpError("unauthenticated", "Please sign in.");
    const age = Math.floor(Date.now()/1000) - (authTime || 0);
    if (!authTime || age < -60 || age > 300) throw new HttpError("failed-precondition", "Please confirm your password again before deleting your account.");
    // Admin recursive deletion includes known and future user subcollections.
    // Every path derives from the verified UID; the request body is never trusted.
    for (const collection of ["users", "custom_workouts", "workouts", "Users"]) {
      await db.recursiveDelete(db.collection(collection).doc(uid));
    }
    await db.collection("generationLocks").doc(`${uid}_generateNextWeekPlan`).delete();
    await getAuth().deleteUser(uid);
    res.status(200).json({data:{deleted:true}});
  } catch(error) { next(error); }
}
export const deleteAccountRouter = Router();
deleteAccountRouter.post("/",requireFirebaseAuth,deleteAccountHandler);
