/* ============================================
   SHARE CONTROLLER
   ============================================ */

const { query, queryOne } = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// Generate random token
function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

// Create share link
async function createShareLink(req, res) {
    try {
        const userId = req.user.userId;
        const { file_id, password, expires_days, max_downloads, permission } = req.body;

        if (!file_id) {
            return res.status(400).json({
                success: false,
                message: 'File ID is required'
            });
        }

        // Check if file exists and belongs to user
        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
            [file_id, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Generate unique token
        const shareToken = generateToken(16);

        // Hash password if provided
        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        // Calculate expiry date
        let expiresAt = null;
        if (expires_days) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + parseInt(expires_days));
        }

        // Insert share link
        const result = await query(
            `INSERT INTO shared_links 
            (file_id, share_token, password, expires_at, max_downloads, created_by) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [file_id, shareToken, hashedPassword, expiresAt, max_downloads || null, userId]
        );

        // Generate full share URL
        const shareUrl = `${req.protocol}://${req.get('host')}/public-share.html?token=${shareToken}`;

        res.status(201).json({
            success: true,
            message: 'Share link created successfully',
            share: {
                id: result.insertId,
                token: shareToken,
                url: shareUrl,
                expires_at: expiresAt,
                has_password: !!password
            }
        });

    } catch (error) {
        console.error('Create share link error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create share link'
        });
    }
}

// Get share info by token
async function getShareInfo(req, res) {
    try {
        const { token } = req.params;

        const share = await queryOne(
            `SELECT 
                sl.*,
                f.original_name,
                f.size,
                f.mime_type,
                u.username as owner_name
            FROM shared_links sl
            JOIN files f ON sl.file_id = f.id
            JOIN users u ON sl.created_by = u.id
            WHERE sl.share_token = ?`,
            [token]
        );

        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Share link not found or expired'
            });
        }

        // Check if expired
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({
                success: false,
                message: 'This share link has expired'
            });
        }

        // Check download limit
        if (share.max_downloads && share.download_count >= share.max_downloads) {
            return res.status(410).json({
                success: false,
                message: 'Download limit reached'
            });
        }

        res.json({
            success: true,
            share: {
                file_name: share.original_name,
                file_size: share.size,
                mime_type: share.mime_type,
                owner: share.owner_name,
                requires_password: !!share.password,
                expires_at: share.expires_at,
                download_count: share.download_count,
                max_downloads: share.max_downloads
            }
        });

    } catch (error) {
        console.error('Get share info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get share info'
        });
    }
}

// Download shared file
async function downloadSharedFile(req, res) {
    try {
        const { token } = req.params;
        const { password } = req.query;

        const share = await queryOne(
            `SELECT sl.*, f.* 
            FROM shared_links sl
            JOIN files f ON sl.file_id = f.id
            WHERE sl.share_token = ?`,
            [token]
        );

        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Share link not found'
            });
        }

        // Check if expired
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({
                success: false,
                message: 'This share link has expired'
            });
        }

        // Check download limit
        if (share.max_downloads && share.download_count >= share.max_downloads) {
            return res.status(410).json({
                success: false,
                message: 'Download limit reached'
            });
        }

        // Check password
        if (share.password) {
            if (!password) {
                return res.status(401).json({
                    success: false,
                    message: 'Password required'
                });
            }

            const validPassword = await bcrypt.compare(password, share.password);
            if (!validPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid password'
                });
            }
        }

        // Check if file exists
        if (!fs.existsSync(share.storage_path)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        // Increment download count
        await query(
            'UPDATE shared_links SET download_count = download_count + 1 WHERE id = ?',
            [share.id]
        );

        // Send file
        res.setHeader('Content-Disposition', `attachment; filename="${share.original_name}"`);
        res.setHeader('Content-Type', share.mime_type);

        const fileStream = fs.createReadStream(share.storage_path);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Download shared file error:', error);
        res.status(500).json({
            success: false,
            message: 'Download failed'
        });
    }
}

// Share with specific user
async function shareWithUser(req, res) {
    try {
        const userId = req.user.userId;
        const { file_id, folder_id, email, permission } = req.body;

        if (!file_id && !folder_id) {
            return res.status(400).json({
                success: false,
                message: 'File ID or Folder ID is required'
            });
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Find user by email
        const targetUser = await queryOne(
            'SELECT id, username, email FROM users WHERE email = ?',
            [email]
        );

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (targetUser.id === userId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot share with yourself'
            });
        }

        // Create share
        await query(
            `INSERT INTO shares (file_id, folder_id, shared_by, shared_with, permission)
            VALUES (?, ?, ?, ?, ?)`,
            [file_id || null, folder_id || null, userId, targetUser.id, permission || 'view']
        );

        res.status(201).json({
            success: true,
            message: `Shared with ${targetUser.username}`,
            shared_with: {
                id: targetUser.id,
                username: targetUser.username,
                email: targetUser.email
            }
        });

    } catch (error) {
        console.error('Share with user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to share'
        });
    }
}

// Get files shared with me
async function getSharedWithMe(req, res) {
    try {
        const userId = req.user.userId;

        const shares = await query(
            `SELECT 
                s.*,
                f.original_name as file_name,
                f.size as file_size,
                f.mime_type,
                u.username as owner_name,
                fo.name as folder_name
            FROM shares s
            LEFT JOIN files f ON s.file_id = f.id
            LEFT JOIN folders fo ON s.folder_id = fo.id
            JOIN users u ON s.shared_by = u.id
            WHERE s.shared_with = ?
            ORDER BY s.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            shares
        });

    } catch (error) {
        console.error('Get shared with me error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shares'
        });
    }
}

// Get files I shared
async function getMyShares(req, res) {
    try {
        const userId = req.user.userId;

        const shares = await query(
            `SELECT 
                s.*,
                f.original_name as file_name,
                f.size as file_size,
                u.username as shared_with_name,
                u.email as shared_with_email
            FROM shares s
            LEFT JOIN files f ON s.file_id = f.id
            JOIN users u ON s.shared_with = u.id
            WHERE s.shared_by = ?
            ORDER BY s.created_at DESC`,
            [userId]
        );

        // Also get shared links
        const links = await query(
            `SELECT 
                sl.*,
                f.original_name as file_name,
                f.size as file_size
            FROM shared_links sl
            JOIN files f ON sl.file_id = f.id
            WHERE sl.created_by = ?
            ORDER BY sl.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            shares,
            links
        });

    } catch (error) {
        console.error('Get my shares error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shares'
        });
    }
}

// Revoke share
async function revokeShare(req, res) {
    try {
        const userId = req.user.userId;
        const shareId = req.params.id;

        const share = await queryOne(
            'SELECT * FROM shares WHERE id = ? AND shared_by = ?',
            [shareId, userId]
        );

        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Share not found'
            });
        }

        await query('DELETE FROM shares WHERE id = ?', [shareId]);

        res.json({
            success: true,
            message: 'Share revoked successfully'
        });

    } catch (error) {
        console.error('Revoke share error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to revoke share'
        });
    }
}

module.exports = {
    createShareLink,
    getShareInfo,
    downloadSharedFile,
    shareWithUser,
    getSharedWithMe,
    getMyShares,
    revokeShare
};
