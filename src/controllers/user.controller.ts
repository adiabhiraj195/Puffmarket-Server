import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import db from "../lib/db";

/**
 * Retrieve the current authenticated user's profile details.
 */
export async function getUserProfile(req: AuthenticatedRequest, res: Response) {
    try {
        const walletAddress = req.user?.address;
        if (!walletAddress) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const addressLower = walletAddress.toLowerCase();

        let user = await db.user.findUnique({
            where: { walletAddress: addressLower }
        });

        // Fallback: if user is logged in via JWT but user record is somehow missing, create it
        if (!user) {
            user = await db.user.create({
                data: { walletAddress: addressLower }
            });
        }

        return res.json({
            success: true,
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                username: user.username,
                bio: user.bio,
                dob: user.dob,
                avatarUrl: user.avatarUrl,
                profileComplete: user.profileComplete,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error: any) {
        console.error("Error fetching user profile:", error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * Update the current authenticated user's profile details.
 */
export async function updateUserProfile(req: AuthenticatedRequest, res: Response) {
    try {
        const walletAddress = req.user?.address;
        if (!walletAddress) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const addressLower = walletAddress.toLowerCase();
        const { username, bio, dob, avatarUrl } = req.body;

        // Validation for Username uniqueness
        if (username) {
            const cleanUsername = username.trim();
            if (cleanUsername.length < 3) {
                return res.status(400).json({ error: "Username must be at least 3 characters long" });
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
                return res.status(400).json({ error: "Username can only contain alphanumeric characters, underscores, and hyphens" });
            }

            const existingUser = await db.user.findUnique({
                where: { username: cleanUsername }
            });

            if (existingUser && existingUser.walletAddress.toLowerCase() !== addressLower) {
                return res.status(400).json({ error: "Username is already taken" });
            }
        }

        const updatedUser = await db.user.update({
            where: { walletAddress: addressLower },
            data: {
                username: username ? username.trim() : null,
                bio: bio ? bio.trim() : null,
                dob: dob ? dob.trim() : null,
                avatarUrl: avatarUrl ? avatarUrl.trim() : null,
                profileComplete: true // Completed profile setup
            }
        });

        return res.json({
            success: true,
            user: {
                id: updatedUser.id,
                walletAddress: updatedUser.walletAddress,
                username: updatedUser.username,
                bio: updatedUser.bio,
                dob: updatedUser.dob,
                avatarUrl: updatedUser.avatarUrl,
                profileComplete: updatedUser.profileComplete,
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt
            }
        });
    } catch (error: any) {
        console.error("Error updating user profile:", error);
        return res.status(500).json({ error: error.message });
    }
}
