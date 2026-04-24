/* ============================================
   FOLDER ROUTES - FIXED & CLEANED
   ============================================ */

const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// ============================================
// SPECIFIC ROUTES FIRST (before /:id)
// ============================================

// Check if folder exists - MUST BE BEFORE /:id
router.get('/check-exists', folderController.checkFolderExists);

// Get folder tree structure
router.get('/tree/all', async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { query } = require('../config/db');

        const folders = await query(
            `SELECT 
                id, name, parent_id, path, color,
                (SELECT COUNT(*) FROM files WHERE folder_id = folders.id AND is_deleted = 0) as file_count,
                (SELECT COUNT(*) FROM folders f WHERE f.parent_id = folders.id AND is_deleted = 0) as subfolder_count
            FROM folders 
            WHERE user_id = ? AND is_deleted = 0
            ORDER BY path ASC`,
            [userId]
        );

        const buildTree = (parentId = null) => {
            return folders
                .filter(f => f.parent_id === parentId)
                .map(folder => ({
                    id: folder.id,
                    name: folder.name,
                    path: folder.path,
                    color: folder.color,
                    file_count: folder.file_count,
                    subfolder_count: folder.subfolder_count,
                    children: buildTree(folder.id)
                }));
        };

        res.json({ success: true, tree: buildTree() });
    } catch (error) {
        console.error('Get folder tree error:', error);
        res.status(500).json({ success: false, message: 'Failed to get folder tree' });
    }
});

// ============================================
// TRASH ROUTES - BEFORE /:id
// ============================================

router.post('/trash/:trashId/restore', folderController.restoreFolder);
router.delete('/trash/:trashId/permanent', folderController.permanentDeleteFolder);

// ============================================
// BULK OPERATIONS - BEFORE /:id
// ============================================

router.post('/bulk-create', async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { folders, parent_id } = req.body;

        if (!folders || !Array.isArray(folders) || folders.length === 0) {
            return res.status(400).json({ success: false, message: 'Folders array is required' });
        }

        const { query, queryOne } = require('../config/db');

        let parentPath = '/';
        if (parent_id) {
            const parent = await queryOne('SELECT path FROM folders WHERE id = ? AND user_id = ?', [parent_id, userId]);
            if (parent) parentPath = parent.path + '/';
        }

        const results = { created: [], failed: [] };

        for (const folderName of folders) {
            try {
                const name = folderName.trim();
                if (!name) { results.failed.push({ name: folderName, reason: 'Empty name' }); continue; }

                const existing = await queryOne(
                    'SELECT id FROM folders WHERE name = ? AND parent_id <=> ? AND user_id = ? AND is_deleted = 0',
                    [name, parent_id || null, userId]
                );

                if (existing) { results.failed.push({ name, reason: 'Already exists' }); continue; }

                const path = parent_id ? parentPath + name : '/' + name;
                const result = await query(
                    'INSERT INTO folders (name, parent_id, user_id, path, is_deleted) VALUES (?, ?, ?, ?, 0)',
                    [name, parent_id || null, userId, path]
                );

                results.created.push({ id: result.insertId, name, path });
            } catch (error) {
                results.failed.push({ name: folderName, reason: error.message });
            }
        }

        res.json({ success: true, message: `Created ${results.created.length} folders`, results });
    } catch (error) {
        console.error('Bulk create error:', error);
        res.status(500).json({ success: false, message: 'Bulk folder creation failed' });
    }
});

router.post('/bulk-delete', async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const { folder_ids } = req.body;

        if (!folder_ids || !Array.isArray(folder_ids) || folder_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Folder IDs array is required' });
        }

        const { query, queryOne } = require('../config/db');

        const settings = await queryOne('SELECT auto_delete_trash_days FROM user_settings WHERE user_id = ?', [userId]) 
            || { auto_delete_trash_days: 30 };

        const results = { deleted: [], failed: [] };

        for (const folderId of folder_ids) {
            try {
                const folder = await queryOne(
                    'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                    [folderId, userId]
                );

                if (!folder) { results.failed.push({ id: folderId, reason: 'Not found' }); continue; }

                await query('CALL MoveToTrash(?, ?, ?, ?)', ['folder', folderId, userId, settings.auto_delete_trash_days]);
                results.deleted.push({ id: folderId, name: folder.name });
            } catch (error) {
                results.failed.push({ id: folderId, reason: error.message });
            }
        }

        res.json({ success: true, message: `Moved ${results.deleted.length} folders to trash`, results });
    } catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({ success: false, message: 'Bulk folder deletion failed' });
    }
});

// ============================================
// MAIN CRUD ROUTES
// ============================================

// Get all folders
router.get('/', folderController.getFolders);

// Create folder
router.post('/', folderController.createFolder);

// ============================================
// ROUTES WITH :id PARAMETER (LAST)
// ============================================

// Get folder contents
router.get('/:id/contents', folderController.getFolderContents);

// Get folder breadcrumb
router.get('/:id/breadcrumb', folderController.getFolderBreadcrumb);

// Download folder as ZIP
router.get('/:id/download', folderController.downloadFolder);

// Get folder stats
router.get('/:id/stats', async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;

        const { query, queryOne } = require('../config/db');
        const { getAllSubfolderIds } = require('../controllers/folderController');

        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({ success: false, message: 'Folder not found' });
        }

        const allFolderIds = await getAllSubfolderIds(folderId, userId);
        allFolderIds.push(parseInt(folderId));

        const placeholders = allFolderIds.map(() => '?').join(',');
        const stats = await queryOne(
            `SELECT COUNT(*) as file_count, COALESCE(SUM(size), 0) as total_size
             FROM files WHERE folder_id IN (${placeholders}) AND is_deleted = 0`,
            allFolderIds
        );

        res.json({
            success: true,
            stats: {
                folder_name: folder.name,
                total_files: stats.file_count,
                total_subfolders: allFolderIds.length - 1,
                total_size: stats.total_size,
                path: folder.path
            }
        });
    } catch (error) {
        console.error('Get folder stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to get folder statistics' });
    }
});

// Search in folder
router.get('/:id/search', async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        }

        const { query, queryOne } = require('../config/db');
        const { getAllSubfolderIds } = require('../controllers/folderController');

        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({ success: false, message: 'Folder not found' });
        }

        const allFolderIds = await getAllSubfolderIds(folderId, userId);
        allFolderIds.push(parseInt(folderId));

        const placeholders = allFolderIds.map(() => '?').join(',');
        const files = await query(
            `SELECT f.*, fo.name as folder_name, fo.path as folder_path
             FROM files f LEFT JOIN folders fo ON f.folder_id = fo.id
             WHERE f.folder_id IN (${placeholders}) AND f.is_deleted = 0 AND f.original_name LIKE ?
             ORDER BY f.original_name LIMIT 100`,
            [...allFolderIds, `%${q}%`]
        );

        res.json({ success: true, query: q, results: files.length, folder: { id: folder.id, name: folder.name }, files });
    } catch (error) {
        console.error('Search in folder error:', error);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
});

// Delete folder completely (for replace) - BEFORE generic delete
router.delete('/:id/complete', folderController.deleteFolderCompletely);

// Get single folder (MUST BE AFTER specific /:id/xxx routes)
router.get('/:id', folderController.getFolderById);

// Delete folder (move to trash)
router.delete('/:id', folderController.deleteFolder);

// Rename folder
router.put('/:id/rename', folderController.renameFolder);

// Move folder
router.put('/:id/move', folderController.moveFolder);

module.exports = router;
