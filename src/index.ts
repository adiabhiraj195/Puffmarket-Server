import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { startIndexer } from "./lib/indexer";
import rootRouter from "./routes";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "10000", 10);

const server = http.createServer(app);
const io = new Server(server, {
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

app.use(cors({
    origin: ["http://localhost:3000", "https://puff-market.vercel.app/"],
    credentials: true
}));
app.use(express.json());

// API Request Logger Middleware
app.use((req, res, next) => {
    const start = Date.now()
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
app.use("/api", rootRouter);

// server.listen(PORT, "0.0.0.0", () => {
//     console.log(`Server is running on port ${PORT}`);
//     startIndexer(io);
// });
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully listening on 0.0.0.0:${PORT}`);

    // 3. Run the indexer asynchronously without blocking the startup flow
    Promise.resolve()
        .then(() => {
            console.log("Starting background indexer...");
            return startIndexer(io);
        })
        .catch((err) => {
            console.error("CRITICAL: Indexer failed to start, but server is staying alive:", err);
        });
});

