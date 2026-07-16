"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const media_controller_1 = require("../controllers/media.controller");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.post("/upload", auth_1.authenticateToken, upload.single("file"), media_controller_1.uploadMedia);
router.post("/confirm-mint", auth_1.authenticateToken, media_controller_1.confirmMint);
exports.default = router;
