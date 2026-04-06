/* ============================================
   SHARE CONTROLLER - FIXED PASSWORD & LIMITS
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

// Create share link (for both files and folders)
async function createShareLink(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { file_id, folder_id, password, expires_days, max_downloads, max_views } = req.body;

        console.log('📤 Create share link request:', { file_id, folder_id, password: password ? '***' : null, expires_days, max_downloads, max_views });

        if (!file_id && !folder_id) {
            return res.status(400).json({
                success: false,
                message: 'Either file_id or folder_id is required'
            });
        }

        if (file_id && folder_id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot share both file and folder at once'
            });
        }

        let itemType, itemName, item;

        if (file_id) {
            item = await queryOne(
                'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [file_id, userId]
            );

            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            }

            itemType = 'file';
            itemName = item.original_name;
        }

        if (folder_id) {
            item = await queryOne(
                'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [folder_id, userId]
            );

            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Folder not found'
                });
            }

            itemType = 'folder';
            itemName = item.name;
        }

        // Generate unique token
        const shareToken = generateToken(16);

        // Hash password if provided
        let hashedPassword = null;
        if (password && password.trim() !== '') {
            try {
                hashedPassword = await bcrypt.hash(password.trim(), 10);
                console.log('🔒 Password hashed successfully');
            } catch (hashError) {
                console.error('Password hash error:', hashError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process password'
                });
            }
        }

        // Calculate expiry date
        let expiresAt = null;
        if (expires_days && parseInt(expires_days) > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + parseInt(expires_days));
            console.log('⏰ Expiry set to:', expiresAt);
        }

        // Parse limits
        const parsedMaxDownloads = max_downloads && parseInt(max_downloads) > 0 ? parseInt(max_downloads) : null;
        const parsedMaxViews = max_views && parseInt(max_views) > 0 ? parseInt(max_views) : null;

        console.log('📊 Parsed values:', {
            hashedPassword: hashedPassword ? 'SET' : 'NULL',
            expiresAt,
            parsedMaxDownloads,
            parsedMaxViews
        });

        // Insert into database
        const result = await query(
            `INSERT INTO shared_links 
            (file_id, folder_id, share_token, share_type, password, expires_at, max_downloads, max_views, created_by, is_active, download_count, view_count) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0)`,
            [
                file_id || null, 
                folder_id || null, 
                shareToken, 
                itemType,
                hashedPassword, 
                expiresAt, 
                parsedMaxDownloads,
                parsedMaxViews,
                userId
            ]
        );

        console.log('✅ Share link created with ID:', result.insertId);

        // Build share URL
        const shareUrl = `${req.protocol}://${req.get('host')}/public-share.html?token=${shareToken}`;

        // Log activity
        try {
            await query(
                'INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, 'share', itemType, file_id || folder_id, itemName, `Created public share link`]
            );
        } catch (logError) {
            console.warn('Activity log error (non-critical):', logError.message);
        }

        res.status(201).json({
            success: true,
            message: `${itemType === 'file' ? 'File' : 'Folder'} share link created successfully`,
            share: {
                id: result.insertId,
                token: shareToken,
                url: shareUrl,
                type: itemType,
                name: itemName,
                expires_at: expiresAt,
                has_password: !!hashedPassword,
                max_downloads: parsedMaxDownloads,
                max_views: parsedMaxViews
            }
        });

    } catch (error) {
        console.error('❌ Create share link error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create share link: ' + error.message
        });
    }
}

// Get share info by token
async function getShareInfo(req, res) {
    try {
        const { token } = req.params;

        console.log('🔍 Getting share info for token:', token);

        const share = await queryOne(
            `SELECT 
                sl.*,
                f.original_name as file_name,
                f.size as file_size,
                f.mime_type,
                fo.name as folder_name,
                u.username as owner_name
            FROM shared_links sl
            LEFT JOIN files f ON sl.file_id = f.id
            LEFT JOIN folders fo ON sl.folder_id = fo.id
            JOIN users u ON sl.created_by = u.id
            WHERE sl.share_token = ? AND sl.is_active = 1`,
            [token]
        );

        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Share link not found or has been deactivated'
            });
        }

        // Check expiry
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({
                success: false,
                message: 'This share link has expired'
            });
        }

        // Check download limit for files
        if (share.share_type === 'file' && share.max_downloads && share.download_count >= share.max_downloads) {
            return res.status(410).json({
                success: false,
                message: 'Download limit reached'
            });
        }

        // Check view limit for folders
        if (share.share_type === 'folder' && share.max_views && share.view_count >= share.max_views) {
            return res.status(410).json({
                success: false,
                message: 'View limit reached'
            });
        }

        // Get folder contents if folder
        let folderContents = null;
        if (share.share_type === 'folder') {
            const files = await query(
                `SELECT id, original_name, size, mime_type, created_at 
                FROM files 
                WHERE folder_id = ? AND is_deleted = 0
                ORDER BY original_name ASC`,
                [share.folder_id]
            );

            const subfolders = await query(
                `SELECT id, name, created_at,
                (SELECT COUNT(*) FROM files WHERE folder_id = folders.id AND is_deleted = 0) as file_count
                FROM folders 
                WHERE parent_id = ? AND is_deleted = 0
                ORDER BY name ASC`,
                [share.folder_id]
            );

            folderContents = {
                files: files,
                folders: subfolders,
                total_files: files.length,
                total_folders: subfolders.length
            };

            // Increment view count for folders
            await query(
                'UPDATE shared_links SET view_count = view_count + 1, last_accessed_at = NOW() WHERE id = ?',
                [share.id]
            );
        }

        res.json({
            success: true,
            share: {
                type: share.share_type,
                file_name: share.file_name,
                folder_name: share.folder_name,
                file_size: share.file_size,
                mime_type: share.mime_type,
                owner: share.owner_name,
                requires_password: !!share.password,
                expires_at: share.expires_at,
                download_count: share.download_count,
                max_downloads: share.max_downloads,
                view_count: share.view_count,
                max_views: share.max_views,
                folder_contents: folderContents
            }
        });

    } catch (error) {
        console.error('❌ Get share info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get share info'
        });
    }
}

// Download shared file or folder
async function downloadSharedFile(req, res) {
    try {
        const { token } = req.params;
        const password = req.query.password || req.body?.password;

        console.log('📥 Download request for token:', token);
        console.log('🔑 Password provided:', password ? 'YES' : 'NO');

        const share = await queryOne(
            `SELECT sl.*, f.*, fo.name as folder_name, fo.id as folder_id, fo.user_id as folder_user_id
            FROM shared_links sl
            LEFT JOIN files f ON sl.file_id = f.id
            LEFT JOIN folders fo ON sl.folder_id = fo.id
            WHERE sl.share_token = ? AND sl.is_active = 1`,
            [token]
        );

        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Share link not found'
            });
        }

        // Check expiry
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

        // Verify password if required
        if (share.password) {
            if (!password) {
                return res.status(401).json({
                    success: false,
                    message: 'Password required',
                    requires_password: true
                });
            }

            try {
                const validPassword = await bcrypt.compare(password, share.password);
                if (!validPassword) {
                    return res.status(401).json({
                        success: false,
                        message: 'Invalid password'
                    });
                }
                console.log('✅ Password verified');
            } catch (bcryptError) {
                console.error('Password comparison error:', bcryptError);
                return res.status(500).json({
                    success: false,
                    message: 'Password verification failed'
                });
            }
        }

        // Handle file download
        if (share.share_type === 'file') {
            const storageBase = path.join(__dirname, '../../storage/node1');
            const filePath = path.join(storageBase, share.storage_path);

            console.log('📄 File download path:', filePath);
            console.log('📄 File exists:', fs.existsSync(filePath));

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found on server'
                });
            }

            // Increment download count
            await query(
                'UPDATE shared_links SET download_count = download_count + 1, last_accessed_at = NOW() WHERE id = ?',
                [share.id]
            );

            // Set headers and stream file
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.original_name)}"`);
            res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');

            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);

            console.log('✅ File download started');
        }
        // Handle folder download (as ZIP)
        else if (share.share_type === 'folder') {
            console.log('📁 Folder download:', share.folder_id, share.folder_name);
            await downloadFolderAsZip(share.folder_id, share.folder_name, share.id, share.folder_user_id, res);
        }

    } catch (error) {
        console.error('❌ Download shared file error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Download failed: ' + error.message
            });
        }
    }
}

// Helper: Get all subfolder IDs recursively
async function getAllSubfolderIdsForShare(folderId) {
    const subfolders = await query(
        'SELECT id FROM folders WHERE parent_id = ? AND is_deleted = 0',
        [folderId]
    );

    let allIds = [];

    for (const subfolder of subfolders) {
        allIds.push(subfolder.id);
        const childIds = await getAllSubfolderIdsForShare(subfolder.id);
        allIds = allIds.concat(childIds);
    }

    return allIds;
}

// Helper: Download folder as ZIP
async function downloadFolderAsZip(folderId, folderName, shareLinkId, userId, res) {
    try {
        const archiver = require('archiver');
        const storageBase = path.join(__dirname, '../../storage/node1');
        
        console.log('📦 Starting ZIP download for folder:', folderId, folderName);
        
        // Get all subfolder IDs recursively
        const allFolderIds = await getAllSubfolderIdsForShare(folderId);
        allFolderIds.push(parseInt(folderId));
        
        console.log('📁 All folder IDs to include:', allFolderIds);
        
        // Get all files from all folders
        let files = [];
        
        if (allFolderIds.length > 0) {
            const placeholders = allFolderIds.map(() => '?').join(',');
            files = await query(
                `SELECT f.*, fo.path as folder_path, fo.name as folder_name 
                 FROM files f
                 LEFT JOIN folders fo ON f.folder_id = fo.id
                 WHERE f.folder_id IN (${placeholders}) AND f.is_deleted = 0`,
                [...allFolderIds]
            );
        }

        console.log('📄 Files found:', files.length);

        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No files found in folder'
            });
        }

        // Create ZIP archive
        const archive = archiver('zip', {
            zlib: { level: 5 }
        });

        archive.on('error', (err) => {
            console.error('❌ Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create ZIP archive'
                });
            }
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folderName)}.zip"`);

        // Pipe archive to response
        archive.pipe(res);

        // Add files to archive
        let filesAdded = 0;
        for (const file of files) {
            const filePath = path.join(storageBase, file.storage_path);
            
            console.log(`📄 Adding: ${file.original_name}`);
            
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file.original_name });
                filesAdded++;
            } else {
                console.warn(`   ❌ File not found: ${filePath}`);
            }
        }

        console.log(`✅ Total files added to ZIP: ${filesAdded}/${files.length}`);

        if (filesAdded === 0) {
            archive.abort();
            if (!res.headersSent) {
                return res.status(404).json({
                    success: false,
                    message: 'No files found on disk'
                });
            }
            return;
        }

        // Finalize archive
        await archive.finalize();

        console.log('✅ ZIP archive finalized');

        // Increment download count
        await query(
            'UPDATE shared_links SET download_count = download_count + 1, last_accessed_at = NOW() WHERE id = ?',
            [shareLinkId]
        );

    } catch (error) {
        console.error('❌ Download folder error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Download failed: ' + error.message
            });
        }
    }
}

// Share with specific user
async function shareWithUser(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
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

        const existingShare = await queryOne(
            'SELECT id FROM shares WHERE file_id <=> ? AND folder_id <=> ? AND shared_by = ? AND shared_with = ?',
            [file_id || null, folder_id || null, userId, targetUser.id]
        );

        if (existingShare) {
            return res.status(400).json({
                success: false,
                message: 'Already shared with this user'
            });
        }

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

// Get files/folders shared with me
async function getSharedWithMe(req, res) {
    try {
        const userId = req.user.id || req.user.userId;

        const shares = await query(
            `SELECT 
                s.*,
                f.id as file_id,
                f.original_name as file_name,
                f.size as file_size,
                f.mime_type,
                fo.id as folder_id,
                fo.name as folder_name,
                u.username as owner_name,
                u.email as owner_email
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
            shares: shares.map(share => ({
                id: share.id,
                type: share.file_id ? 'file' : 'folder',
                file_id: share.file_id,
                folder_id: share.folder_id,
                name: share.file_name || share.folder_name,
                size: share.file_size,
                mime_type: share.mime_type,
                permission: share.permission,
                owner_name: share.owner_name,
                owner_email: share.owner_email,
                shared_at: share.created_at
            }))
        });

    } catch (error) {
        console.error('Get shared with me error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shares'
        });
    }
}

// Get files/folders I shared
async function getMyShares(req, res) {
    try {
        const userId = req.user.id || req.user.userId;

        const shares = await query(
            `SELECT 
                s.*,
                f.original_name as file_name,
                f.size as file_size,
                fo.name as folder_name,
                u.username as shared_with_name,
                u.email as shared_with_email
            FROM shares s
            LEFT JOIN files f ON s.file_id = f.id
            LEFT JOIN folders fo ON s.folder_id = fo.id
            JOIN users u ON s.shared_with = u.id
            WHERE s.shared_by = ?
            ORDER BY s.created_at DESC`,
            [userId]
        );

        const links = await query(
            `SELECT 
                sl.*,
                f.original_name as file_name,
                f.size as file_size,
                fo.name as folder_name
            FROM shared_links sl
            LEFT JOIN files f ON sl.file_id = f.id
            LEFT JOIN folders fo ON sl.folder_id = fo.id
            WHERE sl.created_by = ?
            ORDER BY sl.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            shares: shares.map(s => ({
                ...s,
                type: s.file_id ? 'file' : 'folder',
                name: s.file_name || s.folder_name
            })),
            links: links.map(l => ({
                ...l,
                type: l.share_type,
                name: l.file_name || l.folder_name,
                url: `${req.protocol}://${req.get('host')}/public-share.html?token=${l.share_token}`
            }))
        });

    } catch (error) {
        console.error('Get my shares error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shares'
        });
    }
}

// Revoke user share
async function revokeShare(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
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

// Revoke public share link
async function revokeShareLink(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const linkId = req.params.id;

        const link = await queryOne(
            'SELECT * FROM shared_links WHERE id = ? AND created_by = ?',
            [linkId, userId]
        );

        if (!link) {
            return res.status(404).json({
                success: false,
                message: 'Share link not found'
            });
        }

        await query('UPDATE shared_links SET is_active = 0 WHERE id = ?', [linkId]);

        res.json({
            success: true,
            message: 'Share link deactivated successfully'
        });

    } catch (error) {
        console.error('Revoke share link error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to revoke share link'
        });
    }
}
// Get all registered users (for sharing)
async function getAllUsers(req, res) {
    try {
        const userId = req.user.id || req.user.userId;

        // Get all users except current user
        const users = await query(
            `SELECT id, username, email, profile_picture, created_at 
             FROM users 
             WHERE id != ? AND is_active = 1
             ORDER BY username ASC`,
            [userId]
        );

        res.json({
            success: true,
            users: users.map(user => ({
                id: user.id,
                username: user.username,
                email: user.email,
                profile_picture: user.profile_picture,
                created_at: user.created_at
            }))
        });

    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get users'
        });
    }
}

// Search users by email or username
async function searchUsers(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { query: searchQuery } = req.query;

        if (!searchQuery || searchQuery.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        const users = await query(
            `SELECT id, username, email, profile_picture 
             FROM users 
             WHERE id != ? 
             AND is_active = 1
             AND (username LIKE ? OR email LIKE ?)
             ORDER BY username ASC
             LIMIT 20`,
            [userId, `%${searchQuery}%`, `%${searchQuery}%`]
        );

        res.json({
            success: true,
            users: users
        });

    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed'
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
    revokeShare,
    revokeShareLink,
    getAllUsers,        // ← ADD THIS
    searchUsers         // ← ADD THIS
};
