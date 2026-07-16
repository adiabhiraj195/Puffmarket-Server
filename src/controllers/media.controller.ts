import { Response } from "express";
import db from "../lib/db";
import { AuthenticatedRequest } from "../middleware/auth";
import { generateThumbnail, uploadBufferToPinata, uploadJSONToPinata } from "../lib/media";
import { PUFF_NFT_ADDRESS } from "../lib/indexer";

export async function uploadMedia(req: any, res: Response) {
    try {
        const file = req.file;
        const { name, description, traits, type, externalLink, author } = req.body;

        if (!file) {
            return res.status(400).json({ error: "Media file is required" });
        }
        if (!name || !description) {
            return res.status(400).json({ error: "Name and description are required" });
        }

        console.log(`[Upload] Processing media upload: ${file.originalname} (${file.mimetype})`);

        // 1. Generate thumbnail if it's an image
        let thumbnailBuffer = file.buffer;
        if (file.mimetype.startsWith("image/")) {
            try {
                thumbnailBuffer = await generateThumbnail(file.buffer);
            } catch (err) {
                console.error("[Upload] Sharp thumbnail generation failed, falling back to original:", err);
            }
        }

        // 2. Upload original media to IPFS
        const originalUrl = await uploadBufferToPinata(file.buffer, file.originalname, file.mimetype);
        console.log(`[Upload] Uploaded original media to Pinata: ${originalUrl}`);

        // 3. Upload thumbnail to IPFS (use originalUrl as fallback if not image)
        let thumbnailUrl = originalUrl;
        if (file.mimetype.startsWith("image/")) {
            try {
                thumbnailUrl = await uploadBufferToPinata(thumbnailBuffer, `thumb_${file.originalname}`, file.mimetype);
                console.log(`[Upload] Uploaded thumbnail to Pinata: ${thumbnailUrl}`);
            } catch (err) {
                console.error("[Upload] Thumbnail upload failed:", err);
            }
        }

        // 4. Parse traits array
        let traitsList = [];
        if (traits) {
            try {
                traitsList = typeof traits === "string" ? JSON.parse(traits) : traits;
            } catch (err) {
                console.error("[Upload] Failed to parse traits:", err);
            }
        }

        // 5. Construct metadata JSON
        const metadata = {
            name,
            description,
            image: originalUrl,
            thumbnail: thumbnailUrl,
            traits: traitsList,
            creator: { name: author || "Anonymous" },
            author: author || "Anonymous",
            type: type || "other",
            externalLink: externalLink || ""
        };

        // 6. Upload metadata JSON to IPFS
        const tokenURI = await uploadJSONToPinata(metadata);
        console.log(`[Upload] Uploaded metadata to Pinata (tokenURI): ${tokenURI}`);

        return res.json({
            success: true,
            tokenURI,
            metadata
        });
    } catch (error: any) {
        console.error("[Upload] Error during media upload and IPFS pinning:", error);
        return res.status(500).json({ error: error.message });
    }
}

export async function confirmMint(req: any, res: Response) {
    try {
        const authReq = req as AuthenticatedRequest;
        const userId = authReq.user?.id;
        const userAddress = authReq.user?.address;

        if (!userId || !userAddress) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const { tokenId, metadataURI, metadata } = req.body;
        if (!tokenId || !metadataURI || !metadata) {
            return res.status(400).json({ error: "Missing required fields: tokenId, metadataURI, metadata" });
        }

        console.log(`[Confirm Mint] Confirming mint for user=${userAddress}, tokenId=${tokenId}`);

        const extractCID = (url: string): string => {
            if (!url) return "";
            if (url.startsWith("ipfs://")) return url.replace("ipfs://", "");
            const match = url.match(/\/ipfs\/([^\/?#]+)/);
            return match ? match[1] : url;
        };

        const imageURI = metadata.image || metadata.thumbnail || "";
        const metadataCID = extractCID(metadataURI);
        const mediaCID = extractCID(imageURI);
        const thumbnailCID = extractCID(metadata.thumbnail || imageURI);
        const mediaType = (metadata.type && metadata.type.toLowerCase() === "video") ? "VIDEO" : "IMAGE";
        const contractAddress = PUFF_NFT_ADDRESS.toLowerCase();

        // Idempotent database upsert
        const existingNft = await db.nFT.findUnique({
            where: { tokenId: tokenId.toString() }
        });

        let response;
        if (existingNft) {
            response = await db.nFT.update({
                where: { id: existingNft.id },
                data: {
                    ownerAddress: userAddress.toLowerCase(),
                    tokenURI: metadataURI,
                    metadataCID,
                    mediaCID,
                    thumbnailCID,
                    mediaType,
                    name: metadata.name || existingNft.name,
                    description: metadata.description || existingNft.description,
                    attributes: (metadata.traits || metadata.attributes || []) as any,
                    properties: metadata as any,
                    confirmed: true
                }
            });
            console.log(`[Confirm Mint] Updated existing NFT entry in database: ${response.id}`);
        } else {
            response = await db.nFT.create({
                data: {
                    tokenId: tokenId.toString(),
                    contractAddress,
                    tokenURI: metadataURI,
                    metadataCID,
                    mediaCID,
                    thumbnailCID,
                    mediaType,
                    name: metadata.name || `Puff NFT #${tokenId}`,
                    description: metadata.description || "",
                    attributes: (metadata.traits || metadata.attributes || []) as any,
                    properties: metadata as any,
                    ownerAddress: userAddress.toLowerCase(),
                    creatorAddress: userAddress.toLowerCase(),
                    mintTxHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
                    mintedAt: new Date(),
                    confirmed: true,
                    mintBlockNumber: 0
                }
            });
            console.log(`[Confirm Mint] Created new NFT entry in database: ${response.id}`);
        }

        const PINATA_GATEWAY = "https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/";
        const mappedNft = {
            id: response.id,
            tokenId: response.tokenId,
            contractAddress: response.contractAddress,
            ownerId: userId,
            metadataURI: response.tokenURI,
            imageURI: `${PINATA_GATEWAY}${response.mediaCID}`,
            isListed: false,
            createdAt: response.mintedAt,
            updatedAt: response.mintedAt,
            name: response.name,
            description: response.description,
            attributes: response.attributes,
            creatorAddress: response.creatorAddress
        };

        return res.json({ success: true, nft: mappedNft });
    } catch (error: any) {
        console.error("[Confirm Mint] Error during database NFT confirmation:", error);
        return res.status(500).json({ error: error.message });
    }
}
