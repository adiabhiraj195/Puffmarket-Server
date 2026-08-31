import { Request, Response } from "express";
import { sseManager } from "../lib/sse";

/**
 * SSE endpoint handler: GET /api/notifications/events?address=0x...
 * Streams real-time notifications to connected clients for a given wallet address.
 */
export function streamNotifications(req: Request, res: Response) {
    const address = (req.query.address as string) || (req.params.address as string);

    if (!address) {
        return res.status(400).json({ error: "Missing required query parameter: address" });
    }

    const normalizedAddress = address.toLowerCase();

    // Set Server-Sent Events headers
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    });

    // Send initial connected acknowledgement event
    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", address: normalizedAddress, timestamp: Date.now() })}\n\n`);

    // Register client in SSE manager
    const cleanup = sseManager.addClient(normalizedAddress, res);

    // Keepalive ping every 25 seconds to prevent browser/proxy connection drop
    const heartbeatInterval = setInterval(() => {
        try {
            res.write(": keepalive\n\n");
        } catch (err) {
            clearInterval(heartbeatInterval);
        }
    }, 25000);

    // Clean up when client disconnects
    req.on("close", () => {
        clearInterval(heartbeatInterval);
        cleanup();
    });
}
