const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const shareController = require('../controllers/shareController');
const { authenticateToken } = require('../middleware/auth');
const { query, queryOne } = require('../config/db');

async function getAllParentFolderIds(folderId) {
    const parents = [];
    let currentId = folderId;
    let maxDepth = 20;
    while (currentId && maxDepth > 0) {
        const folder = await queryOne('SELECT id, parent_id FROM folders WHERE id = ? AND is_deleted = 0', [currentId]);
        if (!folder || !folder.parent_id) break;
        parents.push(folder.parent_id);
        currentId = folder.parent_id;
        maxDepth--;
    }
    return parents;
}

async function checkFileShareAccess(fileId, userId) {
    const directShare = await queryOne(
        `SELECT s.permission, f.*, u.username as owner_name, u.email as owner_email
         FROM shares s
         JOIN files f ON s.file_id = f.id
         JOIN users u ON f.user_id = u.id
         WHERE s.file_id = ? AND s.shared_with = ? AND f.is_deleted = 0`,
        [fileId, userId]
    );
    if (directShare) return directShare;
    const file = await queryOne('SELECT * FROM files WHERE id = ? AND is_deleted = 0', [fileId]);
    if (!file || !file.folder_id) return null;
    const folderShare = await queryOne(
        'SELECT s.permission FROM shares s WHERE s.folder_id = ? AND s.shared_with = ?',
        [file.folder_id, userId]
    );
    if (folderShare) {
        const owner = await queryOne('SELECT username, email FROM users WHERE id = ?', [file.user_id]);
        return { ...file, permission: folderShare.permission, owner_name: owner?.username || 'Unknown', owner_email: owner?.email || '' };
    }
    const parentIds = await getAllParentFolderIds(file.folder_id);
    for (const pid of parentIds) {
        const parentShare = await queryOne(
            'SELECT s.permission FROM shares s WHERE s.folder_id = ? AND s.shared_with = ?',
            [pid, userId]
        );
        if (parentShare) {
            const owner = await queryOne('SELECT username, email FROM users WHERE id = ?', [file.user_id]);
            return { ...file, permission: parentShare.permission, owner_name: owner?.username || 'Unknown', owner_email: owner?.email || '' };
        }
    }
    return null;
}

router.get('/public/:token', shareController.getShareInfo);
router.get('/public/:token/download', shareController.downloadSharedFile);

router.post('/public/:token/verify-password', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;
        const bcrypt = require('bcrypt');
        const share = await queryOne('SELECT password FROM shared_links WHERE share_token = ? AND is_active = 1', [token]);
        if (!share || !share.password) {
            return res.status(404).json({ success: false, message: 'Share not found' });
        }
        const validPassword = await bcrypt.compare(password, share.password);
        res.json({ success: validPassword, message: validPassword ? 'Password correct' : 'Invalid password' });
    } catch (error) {
        console.error('Verify password error:', error);
        res.status(500).json({ success: false, message: 'Verification failed' });
    }
});

router.post('/link', authenticateToken, shareController.createShareLink);
router.post('/user', authenticateToken, shareController.shareWithUser);
router.get('/my-shares', authenticateToken, shareController.getMyShares);
router.get('/shared-with-me', authenticateToken, shareController.getSharedWithMe);
router.get('/users', authenticateToken, shareController.getAllUsers);
router.get('/users/search', authenticateToken, shareController.searchUsers);
router.get('/existing', authenticateToken, shareController.getExistingShares);

router.get('/shared-file/:fileId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;
        const share = await checkFileShareAccess(fileId, userId);
        if (!share) {
            return res.status(404).json({ success: false, message: 'File not found or not shared with you' });
        }
        res.json({
            success: true,
            file: {
                id: share.id,
                filename: share.filename,
                original_name: share.original_name,
                mime_type: share.mime_type,
                size: share.size,
                created_at: share.created_at,
                owner_name: share.owner_name,
                owner_email: share.owner_email,
                permission: share.permission
            }
        });
    } catch (error) {
        console.error('Get shared file error:', error);
        res.status(500).json({ success: false, message: 'Failed to get file info' });
    }
});

router.get('/shared-file/:fileId/preview', async (req, res) => {
    try {
        let userId = null;
        const token = req.headers.authorization?.split(' ')[1] || req.query.token;
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id || decoded.userId;
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        const fileId = req.params.fileId;
        const share = await checkFileShareAccess(fileId, userId);
        if (!share) {
            return res.status(404).json({ success: false, message: 'File not found or not shared with you' });
        }
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, share.storage_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on disk' });
        }
        const stat = fs.statSync(filePath);
        const mimeType = share.mime_type || 'application/octet-stream';
        const range = req.headers.range;
        if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunkSize = (end - start) + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': mimeType,
            });
            fileStream.pipe(res);
        } else {
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(share.original_name)}"`);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        }
    } catch (error) {
        console.error('Preview shared file error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Preview failed' });
        }
    }
});

router.get('/shared-file/:fileId/content', async (req, res) => {
    try {
        let userId = null;
        const token = req.headers.authorization?.split(' ')[1] || req.query.token;
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id || decoded.userId;
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        const fileId = req.params.fileId;
        const share = await checkFileShareAccess(fileId, userId);
        if (!share) {
            return res.status(404).json({ success: false, message: 'File not found or not shared with you' });
        }
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, share.storage_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on disk' });
        }
        const fileName = share.original_name || share.filename;
        const ext = path.extname(fileName).toLowerCase().replace('.', '');
        const textExtensions = ['txt', 'md', 'markdown', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'sql', 'sh', 'bash', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'csv', 'tsv', 'svg'];
        const mimeType = share.mime_type || '';
        const isTextFile = textExtensions.includes(ext) || mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml' || mimeType === 'application/javascript';
        if (!isTextFile) {
            return res.status(400).json({ success: false, message: 'Not a text file', file_type: ext });
        }
        if (share.size > 5 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: 'File too large for text preview' });
        }
        const fsPromises = require('fs').promises;
        const content = await fsPromises.readFile(filePath, 'utf8');
        const languageMap = { 'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'py': 'python', 'rb': 'ruby', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'cs': 'csharp', 'php': 'php', 'go': 'go', 'rs': 'rust', 'swift': 'swift', 'kt': 'kotlin', 'sql': 'sql', 'sh': 'bash', 'html': 'html', 'css': 'css', 'xml': 'xml', 'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'md': 'markdown', 'txt': 'plaintext', 'log': 'plaintext', 'csv': 'csv', 'ini': 'ini', 'env': 'plaintext' };
        res.json({
            success: true,
            file: { id: share.id, name: fileName, size: share.size, mime_type: share.mime_type, extension: ext, language: languageMap[ext] || 'plaintext' },
            content: content,
            line_count: content.split('\n').length,
            char_count: content.length
        });
    } catch (error) {
        console.error('Get shared file content error:', error);
        res.status(500).json({ success: false, message: 'Failed to get file content' });
    }
});

router.get('/shared-file/:fileId/download', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;
        const share = await checkFileShareAccess(fileId, userId);
        if (!share) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        if (share.permission === 'view') {
            return res.status(403).json({ success: false, message: 'You only have view permission. Download not allowed.' });
        }
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, share.storage_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.original_name)}"`);
        res.setHeader('Content-Type', share.mime_type || 'application/octet-stream');
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download shared file error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Download failed' });
        }
    }
});

router.put('/shared-file/:fileId/rename', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.fileId;
        const { new_name } = req.body;
        if (!new_name || !new_name.trim()) {
            return res.status(400).json({ success: false, message: 'New name is required' });
        }
        const share = await checkFileShareAccess(fileId, userId);
        if (!share) {
            return res.status(404).json({ success: false, message: 'File not found or access denied' });
        }
        if (share.permission !== 'edit') {
            return res.status(403).json({ success: false, message: 'You need edit permission to rename' });
        }
        await query('UPDATE files SET original_name = ?, updated_at = NOW() WHERE id = ?', [new_name.trim(), fileId]);
        res.json({ success: true, message: 'File renamed successfully' });
    } catch (error) {
        console.error('Rename shared file error:', error);
        res.status(500).json({ success: false, message: 'Failed to rename' });
    }
});

router.get('/shared-folder/:folderId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.folderId;
        let share = await queryOne(
            `SELECT s.permission, fo.*, u.username as owner_name, u.email as owner_email
             FROM shares s
             JOIN folders fo ON s.folder_id = fo.id
             JOIN users u ON fo.user_id = u.id
             WHERE s.folder_id = ? AND s.shared_with = ? AND fo.is_deleted = 0`,
            [folderId, userId]
        );
        if (!share) {
            const folderData = await queryOne(
                `SELECT fo.*, u.username as owner_name, u.email as owner_email
                 FROM folders fo
                 JOIN users u ON fo.user_id = u.id
                 WHERE fo.id = ? AND fo.is_deleted = 0`,
                [folderId]
            );
            if (folderData) {
                const parentIds = await getAllParentFolderIds(folderId);
                parentIds.push(parseInt(folderId));
                for (const pid of parentIds) {
                    const parentShare = await queryOne('SELECT permission FROM shares WHERE folder_id = ? AND shared_with = ?', [pid, userId]);
                    if (parentShare) {
                        share = { ...folderData, permission: parentShare.permission };
                        break;
                    }
                }
            }
        }
        if (!share) {
            return res.status(404).json({ success: false, message: 'Folder not found or not shared with you' });
        }
        const files = await query('SELECT id, original_name, filename, mime_type, size, created_at FROM files WHERE folder_id = ? AND is_deleted = 0 ORDER BY original_name ASC', [folderId]);
        const subfolders = await query(
            `SELECT id, name, created_at, (SELECT COUNT(*) FROM files WHERE folder_id = folders.id AND is_deleted = 0) as file_count FROM folders WHERE parent_id = ? AND is_deleted = 0 ORDER BY name ASC`,
            [folderId]
        );
        res.json({
            success: true,
            folder: { id: parseInt(folderId), name: share.name, owner_name: share.owner_name, owner_email: share.owner_email, permission: share.permission },
            contents: { files: files, folders: subfolders, total_files: files.length, total_folders: subfolders.length }
        });
    } catch (error) {
        console.error('Get shared folder error:', error);
        res.status(500).json({ success: false, message: 'Failed to get folder contents' });
    }
});

router.get('/shared-folder/:folderId/download', authenticateToken, shareController.downloadSharedUserFolder);
router.put('/shared-folder/:folderId/rename', authenticateToken, shareController.renameSharedFolder);
router.delete('/user/:id', authenticateToken, shareController.revokeShare);
router.delete('/link/:id', authenticateToken, shareController.revokeShareLink);
router.patch('/user/:id/permission', authenticateToken, shareController.updateSharePermission);

router.get('/link/:id/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const linkId = req.params.id;
        const link = await queryOne(
            `SELECT sl.*, f.original_name as file_name, fo.name as folder_name FROM shared_links sl LEFT JOIN files f ON sl.file_id = f.id LEFT JOIN folders fo ON sl.folder_id = fo.id WHERE sl.id = ? AND sl.created_by = ?`,
            [linkId, userId]
        );
        if (!link) return res.status(404).json({ success: false, message: 'Share link not found' });
        res.json({ success: true, stats: { id: link.id, type: link.share_type, name: link.file_name || link.folder_name, token: link.share_token, download_count: link.download_count, max_downloads: link.max_downloads, view_count: link.view_count, max_views: link.max_views, is_active: link.is_active, expires_at: link.expires_at, last_accessed_at: link.last_accessed_at, created_at: link.created_at } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get statistics' });
    }
});

router.get('/links', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const links = await query(
            `SELECT sl.id, sl.share_token, sl.share_type, sl.download_count, sl.max_downloads, sl.view_count, sl.max_views, sl.expires_at, sl.is_active, sl.created_at, sl.last_accessed_at, f.original_name as file_name, f.size as file_size, fo.name as folder_name FROM shared_links sl LEFT JOIN files f ON sl.file_id = f.id LEFT JOIN folders fo ON sl.folder_id = fo.id WHERE sl.created_by = ? AND sl.is_active = 1 ORDER BY sl.created_at DESC`,
            [userId]
        );
        res.json({ success: true, links: links.map(link => ({ ...link, name: link.file_name || link.folder_name, url: `${req.protocol}://${req.get('host')}/public-share.html?token=${link.share_token}`, is_expired: link.expires_at ? new Date(link.expires_at) < new Date() : false })) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get share links' });
    }
});

router.get('/access/:type/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { type, id } = req.params;
        if (!['file', 'folder'].includes(type)) return res.status(400).json({ success: false, message: 'Invalid type' });
        const columnName = type === 'file' ? 'file_id' : 'folder_id';
        const shares = await query(`SELECT s.id, s.permission, s.created_at, u.id as user_id, u.username, u.email FROM shares s JOIN users u ON s.shared_with = u.id WHERE s.${columnName} = ? AND s.shared_by = ? ORDER BY s.created_at DESC`, [id, userId]);
        res.json({ success: true, access_list: shares });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get access list' });
    }
});

router.post('/bulk-share', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { file_id, folder_id, emails, permission } = req.body;
        if (!file_id && !folder_id) return res.status(400).json({ success: false, message: 'file_id or folder_id required' });
        if (!emails || !Array.isArray(emails) || emails.length === 0) return res.status(400).json({ success: false, message: 'Emails required' });
        const results = { success: [], failed: [] };
        for (const email of emails) {
            try {
                const targetUser = await queryOne('SELECT id, username, email FROM users WHERE email = ?', [email]);
                if (!targetUser) { results.failed.push({ email, reason: 'User not found' }); continue; }
                if (targetUser.id === userId) { results.failed.push({ email, reason: 'Cannot share with yourself' }); continue; }
                const existing = await queryOne('SELECT id FROM shares WHERE file_id <=> ? AND folder_id <=> ? AND shared_by = ? AND shared_with = ?', [file_id || null, folder_id || null, userId, targetUser.id]);
                if (existing) { results.failed.push({ email, reason: 'Already shared' }); continue; }
                await query('INSERT INTO shares (file_id, folder_id, shared_by, shared_with, permission) VALUES (?, ?, ?, ?, ?)', [file_id || null, folder_id || null, userId, targetUser.id, permission || 'view']);
                results.success.push({ email: targetUser.email, username: targetUser.username });
            } catch (error) { results.failed.push({ email, reason: error.message }); }
        }
        res.json({ success: true, message: `Shared with ${results.success.length} users`, results });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Bulk share failed' });
    }
});

module.exports = router;
