"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const collection_controller_1 = require("../controllers/collection.controller");
const router = express_1.default.Router();
router.post("/", auth_1.authenticateToken, collection_controller_1.createCollection);
router.get("/user", auth_1.authenticateToken, collection_controller_1.getUserCollections);
router.get("/all", collection_controller_1.getAllCollections);
router.get("/:contractAddress", collection_controller_1.getCollectionDetails);
exports.default = router;
