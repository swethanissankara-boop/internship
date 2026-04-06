/* ============================================
   SHARE ROUTES - COMPLETE WITH ALL FEATURES
   ============================================ */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const shareController = require('../controllers/shareController');
const { authenticateToken } = require('../middleware/auth');
const { query, queryOne } = require('../config/db');

// ============================================
// PUBLIC ROUTES (No authentication)
// ============================================

// Get share info by token (public) - supports both files and folders
router.get('/public/:token', shareController.getShareInfo);

// Download shared file or folder (public)
router.get('/public/:token/download', shareController.downloadSharedFile);

// Verify share password (public)
router.post('/public/:token/verify-password', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const bcrypt = require('bcrypt');

        const share = await queryOne(
            'SELECT password FROM shared_links WHERE share_token = ? AND is_active = 1',
            [token]
        );

        if (!share || !share.password) {
            return res.status(404).json({
                success: false,
                message: 'Share not found'
            });
        }

        const validPassword = await bcrypt.compare(password, share.password);

        res.json({
            success: validPassword,
            message: validPassword ? 'Password correct' : 'Invalid password'
        });

    } catch (error) {
        console.error('Verify password error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed'
        });
    }
});

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// Create public share link (for files or folders)
router.post('/link', authenticateToken, shareController.createShareLink);

// Share with specific user (files or folders)
router.post('/user', authenticateToken, shareController.shareWithUser);

// Get my shares (items I shared)
router.get('/my-shares', authenticateToken, shareController.getMyShares);

// Get files/folders shared with me
router.get('/shared-with-me', authenticateToken, shareController.getSharedWithMe);
// ============================================
// USER MANAGEMENT ROUTES (NEW)
// ============================================

// Get all registered users for sharing
router.get('/users', authenticateToken, shareController.getAllUsers);

// Search users by email or username
router.get('/users/search', authenticateToken, shareController.searchUsers);

// ============================================
// SHARED FILE ACCESS ROUTES (NEW)
// ============================================

// Get shared file info
router.get('/shared-file/:fileId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;

        console.log('📄 Getting shared file info:', fileId, 'for user:', userId);

        // Check if file is shared with this user
        const share = await queryOne(
            `SELECT s.permission, f.*, u.username as owner_name, u.email as owner_email
             FROM shares s 
             JOIN files f ON s.file_id = f.id 
             JOIN users u ON f.user_id = u.id
             WHERE s.file_id = ? AND s.shared_with = ? AND f.is_deleted = 0`,
            [fileId, userId]
        );

        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'File not found or not shared with you'
            });
        }

        res.json({
            success: true,
            file: {
                id: share.id,
                filename: share.filename,
                original_name: share.original_name,
                mime_type: share.mime_type,
                size: share.size,
                owner_name: share.owner_name,
                owner_email: share.owner_email,
                permission: share.permission,
                created_at: share.created_at
            }
        });

    } catch (error) {
        console.error('Get shared file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get file info'
        });
    }
});

// Download file shared with me
router.get('/shared-file/:fileId/download', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;

        console.log('📥 Download shared file:', fileId, 'for user:', userId);

        // Check if file is shared with this user with download permission
        const share = await queryOne(
            `SELECT s.*, f.* 
             FROM shares s 
             JOIN files f ON s.file_id = f.id 
             WHERE s.file_id = ? AND s.shared_with = ? AND s.permission IN ('download', 'edit') AND f.is_deleted = 0`,
            [fileId, userId]
        );

        if (!share) {
            return res.status(403).json({
                success: false,
                message: 'Access denied or download not permitted'
            });
        }

        // Get file path
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, share.storage_path);

        console.log('📂 File path:', filePath);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        // Set headers
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.original_name)}"`);
        res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');

        // Stream file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        console.log('✅ Streaming shared file to user');

    } catch (error) {
        console.error('Download shared file error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Download failed'
            });
        }
    }
});

// Get shared folder contents
router.get('/shared-folder/:folderId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.folderId;

        console.log('📁 Getting shared folder contents:', folderId, 'for user:', userId);

        // Check if folder is shared with this user
        const share = await queryOne(
            `SELECT s.permission, fo.*, u.username as owner_name, u.email as owner_email
             FROM shares s 
             JOIN folders fo ON s.folder_id = fo.id 
             JOIN users u ON fo.user_id = u.id
             WHERE s.folder_id = ? AND s.shared_with = ? AND fo.is_deleted = 0`,
            [folderId, userId]
        );

        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found or not shared with you'
            });
        }

        // Get folder contents
        const files = await query(
            `SELECT id, original_name, filename, mime_type, size, created_at
             FROM files 
             WHERE folder_id = ? AND is_deleted = 0
             ORDER BY original_name ASC`,
            [folderId]
        );

        const subfolders = await query(
            `SELECT id, name, created_at
             FROM folders 
             WHERE parent_id = ? AND is_deleted = 0
             ORDER BY name ASC`,
            [folderId]
        );

        res.json({
            success: true,
            folder: {
                id: share.id,
                name: share.name,
                owner_name: share.owner_name,
                owner_email: share.owner_email,
                permission: share.permission
            },
            contents: {
                files: files,
                folders: subfolders,
                total_files: files.length,
                total_folders: subfolders.length
            }
        });

    } catch (error) {
        console.error('Get shared folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get folder contents'
        });
    }
});

// Download file from shared folder
// Download shared folder as ZIP
router.get('/shared-folder/:folderId/download', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.folderId;

        console.log('📦 Download shared folder:', folderId, 'for user:', userId);

        // Check if folder is shared with this user with download permission
        const share = await queryOne(
            `SELECT s.permission, fo.name, fo.user_id
             FROM shares s 
             JOIN folders fo ON s.folder_id = fo.id 
             WHERE s.folder_id = ? AND s.shared_with = ? AND s.permission IN ('download', 'edit') AND fo.is_deleted = 0`,
            [folderId, userId]
        );

        if (!share) {
            return res.status(403).json({
                success: false,
                message: 'Access denied or download not permitted'
            });
        }

        // Get all files in folder
        const files = await query(
            `SELECT * FROM files WHERE folder_id = ? AND is_deleted = 0`,
            [folderId]
        );

        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No files found in folder'
            });
        }

        // Create ZIP
        const archiver = require('archiver');
        const storageBase = path.join(__dirname, '../../storage/node1');

        const archive = archiver('zip', { zlib: { level: 5 } });

        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'ZIP creation failed' });
            }
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.name)}.zip"`);

        archive.pipe(res);

        let filesAdded = 0;
        for (const file of files) {
            const filePath = path.join(storageBase, file.storage_path);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file.original_name });
                filesAdded++;
            }
        }

        if (filesAdded === 0) {
            archive.abort();
            if (!res.headersSent) {
                return res.status(404).json({ success: false, message: 'No files found on disk' });
            }
            return;
        }

        await archive.finalize();
        console.log('✅ Shared folder ZIP sent:', filesAdded, 'files');

    } catch (error) {
        console.error('Download shared folder error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Download failed' });
        }
    }
});

// ============================================
// SHARE MANAGEMENT ROUTES
// ============================================

// Revoke user-to-user share
router.delete('/user/:id', authenticateToken, shareController.revokeShare);

// Revoke/deactivate public share link
router.delete('/link/:id', authenticateToken, shareController.revokeShareLink);

// Update share permissions
router.patch('/user/:id/permission', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const shareId = req.params.id;
        const { permission } = req.body;

        if (!permission || !['view', 'download', 'edit'].includes(permission)) {
            return res.status(400).json({
                success: false,
                message: 'Valid permission required (view, download, or edit)'
            });
        }

        // Verify ownership
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

        // Update permission
        await query(
            'UPDATE shares SET permission = ? WHERE id = ?',
            [permission, shareId]
        );

        res.json({
            success: true,
            message: 'Permission updated successfully'
        });

    } catch (error) {
        console.error('Update permission error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update permission'
        });
    }
});

// ============================================
// SHARE LINK STATISTICS
// ============================================

// Get share link statistics
router.get('/link/:id/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const linkId = req.params.id;

        const link = await queryOne(
            `SELECT 
                sl.*,
                f.original_name as file_name,
                fo.name as folder_name
            FROM shared_links sl
            LEFT JOIN files f ON sl.file_id = f.id
            LEFT JOIN folders fo ON sl.folder_id = fo.id
            WHERE sl.id = ? AND sl.created_by = ?`,
            [linkId, userId]
        );

        if (!link) {
            return res.status(404).json({
                success: false,
                message: 'Share link not found'
            });
        }

        res.json({
            success: true,
            stats: {
                id: link.id,
                type: link.share_type,
                name: link.file_name || link.folder_name,
                token: link.share_token,
                download_count: link.download_count,
                max_downloads: link.max_downloads,
                view_count: link.view_count,
                max_views: link.max_views,
                is_active: link.is_active,
                expires_at: link.expires_at,
                last_accessed_at: link.last_accessed_at,
                created_at: link.created_at
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get statistics'
        });
    }
});

// List all active share links
router.get('/links', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;

        const links = await query(
            `SELECT 
                sl.id,
                sl.share_token,
                sl.share_type,
                sl.download_count,
                sl.max_downloads,
                sl.view_count,
                sl.max_views,
                sl.expires_at,
                sl.is_active,
                sl.created_at,
                sl.last_accessed_at,
                f.original_name as file_name,
                f.size as file_size,
                fo.name as folder_name
            FROM shared_links sl
            LEFT JOIN files f ON sl.file_id = f.id
            LEFT JOIN folders fo ON sl.folder_id = fo.id
            WHERE sl.created_by = ? AND sl.is_active = 1
            ORDER BY sl.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            links: links.map(link => ({
                ...link,
                name: link.file_name || link.folder_name,
                url: `${req.protocol}://${req.get('host')}/public-share.html?token=${link.share_token}`,
                is_expired: link.expires_at ? new Date(link.expires_at) < new Date() : false,
                limit_reached: link.share_type === 'file' 
                    ? (link.max_downloads && link.download_count >= link.max_downloads)
                    : (link.max_views && link.view_count >= link.max_views)
            }))
        });

    } catch (error) {
        console.error('Get links error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get share links'
        });
    }
});

// ============================================
// ACCESS MANAGEMENT
// ============================================

// Get users who have access to a file/folder
router.get('/access/:type/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { type, id } = req.params;

        if (!['file', 'folder'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type must be "file" or "folder"'
            });
        }

        const columnName = type === 'file' ? 'file_id' : 'folder_id';

        // Get all users with access
        const shares = await query(
            `SELECT 
                s.id,
                s.permission,
                s.created_at,
                u.id as user_id,
                u.username,
                u.email
            FROM shares s
            JOIN users u ON s.shared_with = u.id
            WHERE s.${columnName} = ? AND s.shared_by = ?
            ORDER BY s.created_at DESC`,
            [id, userId]
        );

        res.json({
            success: true,
            access_list: shares
        });

    } catch (error) {
        console.error('Get access list error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get access list'
        });
    }
});

// ============================================
// BULK OPERATIONS
// ============================================

// Bulk share with multiple users
router.post('/bulk-share', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { file_id, folder_id, emails, permission } = req.body;

        if (!file_id && !folder_id) {
            return res.status(400).json({
                success: false,
                message: 'Either file_id or folder_id is required'
            });
        }

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Emails array is required'
            });
        }

        const results = {
            success: [],
            failed: []
        };

        for (const email of emails) {
            try {
                // Find user
                const targetUser = await queryOne(
                    'SELECT id, username, email FROM users WHERE email = ?',
                    [email]
                );

                if (!targetUser) {
                    results.failed.push({ email, reason: 'User not found' });
                    continue;
                }

                if (targetUser.id === userId) {
                    results.failed.push({ email, reason: 'Cannot share with yourself' });
                    continue;
                }

                // Check if already shared
                const existing = await queryOne(
                    'SELECT id FROM shares WHERE file_id <=> ? AND folder_id <=> ? AND shared_by = ? AND shared_with = ?',
                    [file_id || null, folder_id || null, userId, targetUser.id]
                );

                if (existing) {
                    results.failed.push({ email, reason: 'Already shared' });
                    continue;
                }

                // Create share
                await query(
                    'INSERT INTO shares (file_id, folder_id, shared_by, shared_with, permission) VALUES (?, ?, ?, ?, ?)',
                    [file_id || null, folder_id || null, userId, targetUser.id, permission || 'view']
                );

                results.success.push({
                    email: targetUser.email,
                    username: targetUser.username
                });

            } catch (error) {
                results.failed.push({ email, reason: error.message });
            }
        }

        res.json({
            success: true,
            message: `Shared with ${results.success.length} users`,
            results
        });

    } catch (error) {
        console.error('Bulk share error:', error);
        res.status(500).json({
            success: false,
            message: 'Bulk share failed'
        });
    }
});

module.exports = router;
