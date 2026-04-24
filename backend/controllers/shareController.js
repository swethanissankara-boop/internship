const { query, queryOne } = require('../config/db');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

function generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

async function createShareLink(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { file_id, folder_id, password, expires_days, max_downloads, max_views } = req.body;
        console.log('Create share link request:', { file_id, folder_id, password: password ? '***' : null, expires_days, max_downloads, max_views });
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
        const shareToken = generateToken(16);
        let hashedPassword = null;
        if (password && password.trim() !== '') {
            try {
                hashedPassword = await bcrypt.hash(password.trim(), 10);
                console.log('Password hashed successfully');
            } catch (hashError) {
                console.error('Password hash error:', hashError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process password'
                });
            }
        }
        let expiresAt = null;
        if (expires_days && parseInt(expires_days) > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + parseInt(expires_days));
            console.log('Expiry set to:', expiresAt);
        }
        const parsedMaxDownloads = max_downloads && parseInt(max_downloads) > 0 ? parseInt(max_downloads) : null;
        const parsedMaxViews = max_views && parseInt(max_views) > 0 ? parseInt(max_views) : null;
        console.log('Parsed values:', {
            hashedPassword: hashedPassword ? 'SET' : 'NULL',
            expiresAt,
            parsedMaxDownloads,
            parsedMaxViews
        });
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
        console.log('Share link created with ID:', result.insertId);
        const shareUrl = `${req.protocol}://${req.get('host')}/public-share.html?token=${shareToken}`;
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
        console.error('Create share link error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create share link: ' + error.message
        });
    }
}

async function getShareInfo(req, res) {
    try {
        const { token } = req.params;
        console.log('Getting share info for token:', token);
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
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({
                success: false,
                message: 'This share link has expired'
            });
        }
        if (share.share_type === 'file' && share.max_downloads && share.download_count >= share.max_downloads) {
            return res.status(410).json({
                success: false,
                message: 'Download limit reached'
            });
        }
        if (share.share_type === 'folder' && share.max_views && share.view_count >= share.max_views) {
            return res.status(410).json({
                success: false,
                message: 'View limit reached'
            });
        }
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
        console.error('Get share info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get share info'
        });
    }
}

async function downloadSharedFile(req, res) {
    try {
        const { token } = req.params;
        const password = req.query.password || req.body?.password;
        console.log('Download request for token:', token);
        console.log('Password provided:', password ? 'YES' : 'NO');
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
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
            return res.status(410).json({
                success: false,
                message: 'This share link has expired'
            });
        }
        if (share.max_downloads && share.download_count >= share.max_downloads) {
            return res.status(410).json({
                success: false,
                message: 'Download limit reached'
            });
        }
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
                console.log('Password verified');
            } catch (bcryptError) {
                console.error('Password comparison error:', bcryptError);
                return res.status(500).json({
                    success: false,
                    message: 'Password verification failed'
                });
            }
        }
        if (share.share_type === 'file') {
            const storageBase = path.join(__dirname, '../../storage/node1');
            const filePath = path.join(storageBase, share.storage_path);
            console.log('File download path:', filePath);
            console.log('File exists:', fs.existsSync(filePath));
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found on server'
                });
            }
            await query(
                'UPDATE shared_links SET download_count = download_count + 1, last_accessed_at = NOW() WHERE id = ?',
                [share.id]
            );
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.original_name)}"`);
            res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            console.log('File download started');
        } else if (share.share_type === 'folder') {
            console.log('Folder download:', share.folder_id, share.folder_name);
            await downloadFolderAsZip(share.folder_id, share.folder_name, share.id, share.folder_user_id, res);
        }
    } catch (error) {
        console.error('Download shared file error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Download failed: ' + error.message
            });
        }
    }
}

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

async function downloadFolderAsZip(folderId, folderName, shareLinkId, userId, res) {
    try {
        const archiver = require('archiver');
        const storageBase = path.join(__dirname, '../../storage/node1');
        console.log('Starting ZIP download for folder:', folderId, folderName);
        const allFolderIds = await getAllSubfolderIdsForShare(folderId);
        allFolderIds.push(parseInt(folderId));
        console.log('All folder IDs to include:', allFolderIds);
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
        console.log('Files found:', files.length);
        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No files found in folder'
            });
        }
        const archive = archiver('zip', {
            zlib: { level: 5 }
        });
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create ZIP archive'
                });
            }
        });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(folderName)}.zip"`);
        archive.pipe(res);
        let filesAdded = 0;
        for (const file of files) {
            const filePath = path.join(storageBase, file.storage_path);
            console.log(`Adding: ${file.original_name}`);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file.original_name });
                filesAdded++;
            } else {
                console.warn(`File not found: ${filePath}`);
            }
        }
        console.log(`Total files added to ZIP: ${filesAdded}/${files.length}`);
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
        await archive.finalize();
        console.log('ZIP archive finalized');
        await query(
            'UPDATE shared_links SET download_count = download_count + 1, last_accessed_at = NOW() WHERE id = ?',
            [shareLinkId]
        );
    } catch (error) {
        console.error('Download folder error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Download failed: ' + error.message
            });
        }
    }
}

async function shareWithUser(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { file_id, folder_id, email, permission } = req.body;
        
        console.log('Share request body:', req.body);
        console.log('User ID:', userId);
        
        if (!file_id && !folder_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Either file_id or folder_id is required' 
            });
        }
        
        if (!email || !email.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        const validPermissions = ['view', 'download', 'edit'];
        const sharePermission = validPermissions.includes(permission) ? permission : 'view';
        
        console.log('Validated permission:', sharePermission);
        
        const targetUser = await queryOne(
            'SELECT id, username, email FROM users WHERE email = ?',
            [email.trim()]
        );
        
        console.log('Target user found:', targetUser);
        
        if (!targetUser) {
            return res.status(404).json({ 
                success: false, 
                message: `User with email "${email}" not found` 
            });
        }
        
        if (parseInt(targetUser.id) === parseInt(userId)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot share with yourself' 
            });
        }
        
        let item, itemType, itemName;
        
        if (file_id) {
            item = await queryOne(
                'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [file_id, userId]
            );
            
            if (!item) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'File not found or access denied' 
                });
            }
            
            itemType = 'file';
            itemName = item.original_name || item.filename;
        } else {
            item = await queryOne(
                'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [folder_id, userId]
            );
            
            if (!item) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Folder not found or access denied' 
                });
            }
            
            itemType = 'folder';
            itemName = item.name;
        }
        
        console.log('Item to share:', { itemType, itemName });
        
        const fileIdValue = file_id ? parseInt(file_id) : null;
        const folderIdValue = folder_id ? parseInt(folder_id) : null;
        const sharedById = parseInt(userId);
        const sharedWithId = parseInt(targetUser.id);
        
        console.log('SQL values:', { 
            fileIdValue, 
            folderIdValue, 
            sharedById, 
            sharedWithId, 
            sharePermission 
        });
        
        const existingShare = await queryOne(
            `SELECT id, permission 
             FROM shares 
             WHERE (file_id = ? OR (file_id IS NULL AND ? IS NULL))
             AND (folder_id = ? OR (folder_id IS NULL AND ? IS NULL))
             AND shared_by = ? 
             AND shared_with = ?`,
            [fileIdValue, fileIdValue, folderIdValue, folderIdValue, sharedById, sharedWithId]
        );
        
        if (existingShare) {
            console.log('Existing share found, updating permission');
            
            await query(
                'UPDATE shares SET permission = ? WHERE id = ?',
                [sharePermission, existingShare.id]
            );
            
            return res.json({
                success: true,
                message: `Updated permission to "${sharePermission}" for ${targetUser.username}`,
                updated: true,
                share: {
                    id: existingShare.id,
                    permission: sharePermission,
                    shared_with: {
                        id: targetUser.id,
                        username: targetUser.username,
                        email: targetUser.email
                    }
                }
            });
        }
        
        console.log('Creating new share...');
        
        const result = await query(
            `INSERT INTO shares (file_id, folder_id, shared_by, shared_with, permission) 
             VALUES (?, ?, ?, ?, ?)`,
            [fileIdValue, folderIdValue, sharedById, sharedWithId, sharePermission]
        );
        
        console.log('Share created with ID:', result.insertId);
        
        try {
            await query(
                `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    userId, 
                    'share', 
                    itemType, 
                    file_id || folder_id, 
                    itemName, 
                    JSON.stringify({ 
                        shared_with: targetUser.email, 
                        permission: sharePermission 
                    })
                ]
            );
        } catch (logError) {
            console.warn('Activity log error (non-critical):', logError.message);
        }
        
        res.status(201).json({
            success: true,
            message: `Shared "${itemName}" with ${targetUser.username} (${sharePermission} permission)`,
            share: {
                id: result.insertId,
                permission: sharePermission,
                shared_with: {
                    id: targetUser.id,
                    username: targetUser.username,
                    email: targetUser.email
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Share with user error:', error);
        console.error('Error stack:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to share: ' + error.message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
async function updateSharePermission(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const shareId = req.params.id;
        const { permission } = req.body;
        
        console.log('Update permission request:', { shareId, permission, userId });
        
        const validPermissions = ['view', 'download', 'edit'];
        if (!validPermissions.includes(permission)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid permission. Must be: view, download, or edit'
            });
        }
        
        const share = await queryOne(
            'SELECT * FROM shares WHERE id = ? AND shared_by = ?',
            [shareId, userId]
        );
        
        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Share not found or access denied'
            });
        }
        
        await query(
            'UPDATE shares SET permission = ? WHERE id = ?',
            [permission, shareId]
        );
        
        console.log('Permission updated successfully');
        
        res.json({
            success: true,
            message: `Permission updated to "${permission}"`,
            share: {
                id: shareId,
                permission: permission
            }
        });
        
    } catch (error) {
        console.error('❌ Update share permission error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update permission: ' + error.message
        });
    }
}
async function getSharedFileInfo(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;
        const share = await queryOne(
            `SELECT s.*, f.*, u.username as owner_name, u.email as owner_email
             FROM shares s
             JOIN files f ON s.file_id = f.id
             JOIN users u ON s.shared_by = u.id
             WHERE s.file_id = ? AND s.shared_with = ? AND f.is_deleted = 0`,
            [fileId, userId]
        );
        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Shared file not found or access denied'
            });
        }
        res.json({
            success: true,
            file: {
                id: share.file_id,
                original_name: share.original_name,
                filename: share.filename,
                size: share.size,
                mime_type: share.mime_type,
                created_at: share.created_at,
                owner_name: share.owner_name,
                owner_email: share.owner_email,
                permission: share.permission
            }
        });
    } catch (error) {
        console.error('Get shared file info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get file info'
        });
    }
}

async function previewSharedFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;
        const share = await queryOne(
            `SELECT s.*, f.*
             FROM shares s
             JOIN files f ON s.file_id = f.id
             WHERE s.file_id = ? AND s.shared_with = ? AND f.is_deleted = 0`,
            [fileId, userId]
        );
        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Shared file not found or access denied'
            });
        }
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, share.storage_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on disk'
            });
        }
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const mimeType = share.mime_type || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', fileSize);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(share.original_name)}"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Preview shared file error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Preview failed'
            });
        }
    }
}

async function downloadSharedUserFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;
        const share = await queryOne(
            `SELECT s.*, f.*
             FROM shares s
             JOIN files f ON s.file_id = f.id
             WHERE s.file_id = ? AND s.shared_with = ? AND f.is_deleted = 0`,
            [fileId, userId]
        );
        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Shared file not found or access denied'
            });
        }
        if (share.permission === 'view') {
            return res.status(403).json({
                success: false,
                message: 'You only have view permission. Download not allowed.'
            });
        }
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, share.storage_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on disk'
            });
        }
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.original_name)}"`);
        res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download shared file error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Download failed'
            });
        }
    }
}

async function downloadSharedUserFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.folderId;
        const share = await queryOne(
            `SELECT s.*, fo.*
             FROM shares s
             JOIN folders fo ON s.folder_id = fo.id
             WHERE s.folder_id = ? AND s.shared_with = ? AND fo.is_deleted = 0`,
            [folderId, userId]
        );
        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Shared folder not found or access denied'
            });
        }
        if (share.permission === 'view') {
            return res.status(403).json({
                success: false,
                message: 'You only have view permission. Download not allowed.'
            });
        }
        const archiver = require('archiver');
        const storageBase = path.join(__dirname, '../../storage/node1');
        const allFolderIds = await getAllSubfolderIdsForShare(folderId);
        allFolderIds.push(parseInt(folderId));
        let files = [];
        if (allFolderIds.length > 0) {
            const placeholders = allFolderIds.map(() => '?').join(',');
            files = await query(
                `SELECT f.*, fo.name as folder_name 
                 FROM files f
                 LEFT JOIN folders fo ON f.folder_id = fo.id
                 WHERE f.folder_id IN (${placeholders}) AND f.is_deleted = 0`,
                [...allFolderIds]
            );
        }
        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No files found in folder'
            });
        }
        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create ZIP'
                });
            }
        });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.name)}.zip"`);
        archive.pipe(res);
        for (const file of files) {
            const filePath = path.join(storageBase, file.storage_path);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: file.original_name });
            }
        }
        await archive.finalize();
    } catch (error) {
        console.error('Download shared folder error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Download failed'
            });
        }
    }
}

async function renameSharedFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;
        const { new_name } = req.body;
        if (!new_name || !new_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'New name is required'
            });
        }
        const share = await queryOne(
            `SELECT s.*, f.*
             FROM shares s
             JOIN files f ON s.file_id = f.id
             WHERE s.file_id = ? AND s.shared_with = ? AND f.is_deleted = 0`,
            [fileId, userId]
        );
        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Shared file not found or access denied'
            });
        }
        if (share.permission !== 'edit') {
            return res.status(403).json({
                success: false,
                message: 'You need edit permission to rename this file'
            });
        }
        await query(
            'UPDATE files SET original_name = ?, updated_at = NOW() WHERE id = ?',
            [new_name.trim(), fileId]
        );
        res.json({
            success: true,
            message: 'File renamed successfully'
        });
    } catch (error) {
        console.error('Rename shared file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to rename file'
        });
    }
}

async function renameSharedFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.folderId;
        const { new_name } = req.body;
        if (!new_name || !new_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'New name is required'
            });
        }
        const share = await queryOne(
            `SELECT s.*, fo.*
             FROM shares s
             JOIN folders fo ON s.folder_id = fo.id
             WHERE s.folder_id = ? AND s.shared_with = ? AND fo.is_deleted = 0`,
            [folderId, userId]
        );
        if (!share) {
            return res.status(404).json({
                success: false,
                message: 'Shared folder not found or access denied'
            });
        }
        if (share.permission !== 'edit') {
            return res.status(403).json({
                success: false,
                message: 'You need edit permission to rename this folder'
            });
        }
        await query(
            'UPDATE folders SET name = ?, updated_at = NOW() WHERE id = ?',
            [new_name.trim(), folderId]
        );
        res.json({
            success: true,
            message: 'Folder renamed successfully'
        });
    } catch (error) {
        console.error('Rename shared folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to rename folder'
        });
    }
}

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
            LEFT JOIN files f ON s.file_id = f.id AND f.is_deleted = 0
            LEFT JOIN folders fo ON s.folder_id = fo.id AND fo.is_deleted = 0
            JOIN users u ON s.shared_by = u.id
            WHERE s.shared_with = ?
            AND (f.id IS NOT NULL OR fo.id IS NOT NULL)
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

async function getAllUsers(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
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

async function getExistingShares(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { item_type, item_id } = req.query;
        if (!item_type || !item_id) {
            return res.status(400).json({
                success: false,
                message: 'item_type and item_id are required'
            });
        }
        let userShares = [];
        if (item_type === 'file') {
            userShares = await query(
                `SELECT s.*, u.username, u.email 
                 FROM shares s
                 JOIN users u ON s.shared_with = u.id
                 WHERE s.file_id = ? AND s.shared_by = ?`,
                [item_id, userId]
            );
        } else {
            userShares = await query(
                `SELECT s.*, u.username, u.email 
                 FROM shares s
                 JOIN users u ON s.shared_with = u.id
                 WHERE s.folder_id = ? AND s.shared_by = ?`,
                [item_id, userId]
            );
        }
        let publicLinks = [];
        if (item_type === 'file') {
            publicLinks = await query(
                `SELECT * FROM shared_links 
                 WHERE file_id = ? AND created_by = ? AND is_active = 1`,
                [item_id, userId]
            );
        } else {
            publicLinks = await query(
                `SELECT * FROM shared_links 
                 WHERE folder_id = ? AND created_by = ? AND is_active = 1`,
                [item_id, userId]
            );
        }
        res.json({
            success: true,
            user_shares: userShares.map(s => ({
                id: s.id,
                user_id: s.shared_with,
                username: s.username,
                email: s.email,
                permission: s.permission,
                created_at: s.created_at
            })),
            public_links: publicLinks.map(l => ({
                id: l.id,
                token: l.share_token,
                url: `${req.protocol}://${req.get('host')}/public-share.html?token=${l.share_token}`,
                has_password: !!l.password,
                expires_at: l.expires_at,
                max_downloads: l.max_downloads,
                download_count: l.download_count,
                max_views: l.max_views,
                view_count: l.view_count,
                created_at: l.created_at
            }))
        });
    } catch (error) {
        console.error('Get existing shares error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get shares'
        });
    }
}

module.exports = {
    createShareLink,
    getShareInfo,
    downloadSharedFile,
    shareWithUser,
    updateSharePermission,
    getSharedFileInfo,
    previewSharedFile,
    downloadSharedUserFile,
    downloadSharedUserFolder,
    renameSharedFile,
    renameSharedFolder,
    getSharedWithMe,
    getMyShares,
    revokeShare,
    revokeShareLink,
    getAllUsers,
    searchUsers,
    getExistingShares
};
