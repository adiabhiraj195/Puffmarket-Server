import sharp from "sharp";

const PINATA_GATEWAY = "https://sapphire-keen-aardvark-438.mypinata.cloud/ipfs/";

/**
 * Upload a binary buffer to Pinata IPFS.
 */
export async function uploadBufferToPinata(
    buffer: Buffer,
    filename: string,
    contentType: string
): Promise<string> {
    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
        throw new Error("PINATA_JWT is not configured in backend environment variables.");
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
    formData.append("file", blob, filename);

    // Optional: Add group or metadata to pinata
    const metadata = JSON.stringify({
        name: filename,
    });
    formData.append("pinataMetadata", metadata);

    const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${pinataJwt}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata file upload failed: ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as { IpfsHash: string };
    return `${PINATA_GATEWAY}${data.IpfsHash}`;
}

/**
 * Upload JSON metadata to Pinata IPFS.
 */
export async function uploadJSONToPinata(metadata: Record<string, any>): Promise<string> {
    const pinataJwt = process.env.PINATA_JWT;
    if (!pinataJwt) {
        throw new Error("PINATA_JWT is not configured in backend environment variables.");
    }

    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${pinataJwt}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            pinataContent: metadata,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata JSON upload failed: ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as { IpfsHash: string };
    return `${PINATA_GATEWAY}${data.IpfsHash}`;
}

/**
 * Generate a thumbnail buffer from an image buffer using Sharp.
 */
export async function generateThumbnail(imageBuffer: Buffer): Promise<Buffer> {
    try {
        return await sharp(imageBuffer)
            .resize(300, 300, {
                fit: "cover",
                withoutEnlargement: true,
            })
            .toBuffer();
    } catch (error) {
        console.error("Failed to generate thumbnail via sharp:", error);
        // Fallback: return original buffer if sharp fails or file is not a standard image
        return imageBuffer;
    }
}
