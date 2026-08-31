"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const indexer_1 = require("./lib/indexer");
const routes_1 = __importDefault(require("./routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "10000", 10);
app.use((0, cors_1.default)({
    origin: ["http://localhost:3000", "https://puff-market.vercel.app"],
    credentials: true
}));
app.use(express_1.default.json());
// API Request Logger Middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[API] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
        if (req.method !== "GET" && req.body && Object.keys(req.body).length > 0) {
            console.log(`[API Body]`, JSON.stringify(req.body));
        }
    });
    next();
});
// Mount MVC API routes under /api
app.use("/api", routes_1.default);
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully listening on 0.0.0.0:${PORT}`);
    // Run the indexer asynchronously without blocking the startup flow
    Promise.resolve()
        .then(() => {
        console.log("Starting background indexer...");
        return (0, indexer_1.startIndexer)();
    })
        .catch((err) => {
        console.error("CRITICAL: Indexer failed to start, but server is staying alive:", err);
    });
});
