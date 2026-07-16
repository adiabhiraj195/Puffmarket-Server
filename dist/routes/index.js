"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_routes_1 = __importDefault(require("./auth.routes"));
const media_routes_1 = __importDefault(require("./media.routes"));
const nft_routes_1 = __importDefault(require("./nft.routes"));
const user_routes_1 = __importDefault(require("./user.routes"));
const nft_controller_1 = require("../controllers/nft.controller");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.use("/auth", auth_routes_1.default);
router.use("/media", media_routes_1.default);
router.use("/nft", nft_routes_1.default);
router.use("/users", user_routes_1.default);
// Keep the exact same endpoint mapping: POST /api/listings
router.post("/listings", auth_1.authenticateToken, nft_controller_1.createListing);
exports.default = router;
