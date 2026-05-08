import express from "express";
import authMiddleware from "../middlewares/auth.middlewares.js";
import {
  shareFile,
  revokeFileShare,
  listFileShares,
  listSharedWithMeFiles,
  changeSharePermission,
  acceptShareInvite,
  declineShareInvite,
} from "../controllers/share.controller.js";

const router = express.Router();

router.post("/create", authMiddleware, shareFile);
router.post("/revoke", authMiddleware, revokeFileShare);
router.get("/file", authMiddleware, listFileShares);
router.get("/shared-with-me", authMiddleware, listSharedWithMeFiles);
router.patch("/permission", authMiddleware, changeSharePermission);
router.post("/accept", authMiddleware, acceptShareInvite);
router.post("/decline", authMiddleware, declineShareInvite);

export default router;
