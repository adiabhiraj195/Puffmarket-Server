import express from "express";
import { streamNotifications } from "../controllers/notification.controller";

const router = express.Router();

// SSE streams for real-time notifications
router.get("/events", streamNotifications);
router.get("/stream", streamNotifications);
router.get("/stream/:address", streamNotifications);

export default router;

