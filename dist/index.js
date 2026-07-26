"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const indexer_1 = require("./lib/indexer");
const routes_1 = __importDefault(require("./routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "3000", 10);
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: ["http://localhost:3000"],
        credentials: true
    }
});
io.on("connection", (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    socket.on("join:wallet", ({ address }) => {
        if (address) {
            const room = address.toLowerCase();
            socket.join(room);
            console.log(`[Socket] Socket ${socket.id} joined wallet room: ${room}`);
        }
    });
    socket.on("disconnect", () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});
app.use((0, cors_1.default)({
    origin: ["http://localhost:3000"],
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
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
    (0, indexer_1.startIndexer)(io);
});
