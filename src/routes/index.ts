import express from "express";
import authRoutes from "./auth.routes";
import mediaRoutes from "./media.routes";
import nftRoutes from "./nft.routes";
import userRoutes from "./user.routes";
import collectionRoutes from "./collection.routes";
import notificationRoutes from "./notification.routes";

import { createListing } from "../controllers/nft.controller";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/media", mediaRoutes);
router.use("/nft", nftRoutes);
router.use("/users", userRoutes);
router.use("/collections", collectionRoutes);
router.use("/notifications", notificationRoutes);


// Keep the exact same endpoint mapping: POST /api/listings
router.post("/listings", authenticateToken, createListing);

export default router;
