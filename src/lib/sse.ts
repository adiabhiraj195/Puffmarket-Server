import { Response } from "express";

export interface SSEClient {
    id: string;
    address: string;
    res: Response;
}

export class SSEManager {
    // Map of normalized wallet address (lowercase) -> Set of SSE client connections
    private clients: Map<string, Set<SSEClient>> = new Map();

    /**
     * Add a new SSE client connection for a specific wallet address.
     * Returns a cleanup function to remove the client upon disconnection.
     */
    public addClient(address: string, res: Response): () => void {
        const normalizedAddress = address.toLowerCase();
        const clientId = `${normalizedAddress}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const client: SSEClient = {
            id: clientId,
            address: normalizedAddress,
            res
        };

        if (!this.clients.has(normalizedAddress)) {
            this.clients.set(normalizedAddress, new Set());
        }

        const clientSet = this.clients.get(normalizedAddress)!;
        clientSet.add(client);
        console.log(`[SSE] Client connected: ${clientId} for wallet: ${normalizedAddress} (Active connections for wallet: ${clientSet.size})`);

        return () => {
            this.removeClient(normalizedAddress, client);
        };
    }

    /**
     * Remove an SSE client connection.
     */
    public removeClient(address: string, client: SSEClient) {
        const normalizedAddress = address.toLowerCase();
        const clientSet = this.clients.get(normalizedAddress);
        if (clientSet) {
            clientSet.delete(client);
            console.log(`[SSE] Client disconnected: ${client.id} for wallet: ${normalizedAddress} (Remaining connections: ${clientSet.size})`);
            if (clientSet.size === 0) {
                this.clients.delete(normalizedAddress);
            }
        }
    }

    /**
     * Send an SSE event with payload to all connected clients for a given wallet address.
     */
    public sendToWallet(address: string, event: string, data: any) {
        const normalizedAddress = address.toLowerCase();
        const clientSet = this.clients.get(normalizedAddress);
        if (!clientSet || clientSet.size === 0) {
            console.log(`[SSE] No active clients connected for wallet: ${normalizedAddress}`);
            return;
        }

        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        console.log(`[SSE] Dispatching event "${event}" to ${clientSet.size} client(s) for wallet: ${normalizedAddress}`);

        for (const client of clientSet) {
            try {
                client.res.write(message);
            } catch (err) {
                console.error(`[SSE] Error writing to client ${client.id}:`, err);
            }
        }
    }

    /**
     * Broadcast an SSE event to all connected clients across all wallet addresses.
     */
    public broadcast(event: string, data: any) {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const [, clientSet] of this.clients.entries()) {
            for (const client of clientSet) {
                try {
                    client.res.write(message);
                } catch (err) {
                    console.error(`[SSE] Error broadcasting to client ${client.id}:`, err);
                }
            }
        }
    }

    /**
     * Get count of active connected clients for an address.
     */
    public getClientCount(address?: string): number {
        if (address) {
            return this.clients.get(address.toLowerCase())?.size || 0;
        }
        let total = 0;
        for (const clientSet of this.clients.values()) {
            total += clientSet.size;
        }
        return total;
    }
}

export const sseManager = new SSEManager();
