import express from "express";
import { isAuthenticated } from "../middlewares/auth.middlewares.js";
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

router.post("/create", isAuthenticated, shareFile);
router.post("/revoke", isAuthenticated, revokeFileShare);
router.get("/file", isAuthenticated, listFileShares);
router.get("/shared-with-me", isAuthenticated, listSharedWithMeFiles);
router.patch("/permission", isAuthenticated, changeSharePermission);
router.post("/accept", isAuthenticated, acceptShareInvite);
router.post("/decline", isAuthenticated, declineShareInvite);

export default router;
