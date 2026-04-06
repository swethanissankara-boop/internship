/* ============================================
   FOLDER ROUTES - UPDATED WITH TRASH SUPPORT
   ============================================ */

const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// ============================================
// FOLDER CRUD OPERATIONS
// ============================================

// Get all folders (with optional parent filter)
router.get('/', folderController.getFolders);

// Get single folder details
router.get('/:id', folderController.getFolderById);

// Get folder contents (files and subfolders)
router.get('/:id/contents', folderController.getFolderContents);

// Get folder breadcrumb/path
router.get('/:id/breadcrumb', folderController.getFolderBreadcrumb);
// Download folder as ZIP
router.get('/:id/download', folderController.downloadFolder);

// Create new folder
router.post('/', folderController.createFolder);

// Rename folder
router.put('/:id/rename', folderController.renameFolder);

// Move folder to different parent
router.put('/:id/move', folderController.moveFolder);

// Delete folder (move to trash)
router.delete('/:id', folderController.deleteFolder);

// 🗑️ TRASH ROUTES FOR FOLDERS
router.post('/trash/:trashId/restore', folderController.restoreFolder);              // Restore folder from trash
router.delete('/trash/:trashId/permanent', folderController.permanentDeleteFolder);  // Permanent delete

// ============================================
// FOLDER STATISTICS
// ============================================

// Get folder size and file count (recursive)
router.get('/:id/stats', async (req, res) => {
    try {
        const userId = req.user.id;
        const folderId = req.params.id;

        const { query, queryOne } = require('../config/db');
        const { getAllSubfolderIds } = require('../controllers/folderController');

        // Verify folder exists
        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found'
            });
        }

        // Get all subfolder IDs
        const allFolderIds = await getAllSubfolderIds(folderId, userId);
        allFolderIds.push(parseInt(folderId));

        // Get total file count and size
        const placeholders = allFolderIds.map(() => '?').join(',');
        const stats = await queryOne(
            `SELECT 
                COUNT(*) as file_count,
                COALESCE(SUM(size), 0) as total_size
            FROM files 
            WHERE folder_id IN (${placeholders}) AND is_deleted = 0`,
            allFolderIds
        );

        // Get subfolder count
        const folderCount = allFolderIds.length - 1; // Exclude main folder

        res.json({
            success: true,
            stats: {
                folder_name: folder.name,
                total_files: stats.file_count,
                total_subfolders: folderCount,
                total_size: stats.total_size,
                total_size_mb: (stats.total_size / (1024 * 1024)).toFixed(2),
                total_size_gb: (stats.total_size / (1024 * 1024 * 1024)).toFixed(2),
                path: folder.path
            }
        });

    } catch (error) {
        console.error('Get folder stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get folder statistics'
        });
    }
});

// ============================================
// FOLDER TREE OPERATIONS
// ============================================

// Get folder tree structure
router.get('/tree/all', async (req, res) => {
    try {
        const userId = req.user.id;
        const { query } = require('../config/db');

        // Get all folders for user
        const folders = await query(
            `SELECT 
                id, 
                name, 
                parent_id, 
                path,
                color,
                (SELECT COUNT(*) FROM files WHERE folder_id = folders.id AND is_deleted = 0) as file_count,
                (SELECT COUNT(*) FROM folders f WHERE f.parent_id = folders.id AND is_deleted = 0) as subfolder_count
            FROM folders 
            WHERE user_id = ? AND is_deleted = 0
            ORDER BY path ASC`,
            [userId]
        );

        // Build tree structure
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

        const tree = buildTree();

        res.json({
            success: true,
            tree: tree
        });

    } catch (error) {
        console.error('Get folder tree error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get folder tree'
        });
    }
});

// ============================================
// BULK OPERATIONS
// ============================================

// Create multiple folders at once
router.post('/bulk-create', async (req, res) => {
    try {
        const userId = req.user.id;
        const { folders, parent_id } = req.body;

        if (!folders || !Array.isArray(folders) || folders.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Folders array is required'
            });
        }

        const { query, queryOne } = require('../config/db');

        // Get parent path if parent_id provided
        let parentPath = '/';
        if (parent_id) {
            const parent = await queryOne(
                'SELECT path FROM folders WHERE id = ? AND user_id = ?',
                [parent_id, userId]
            );
            if (parent) {
                parentPath = parent.path + '/';
            }
        }

        const results = {
            created: [],
            failed: []
        };

        for (const folderName of folders) {
            try {
                const name = folderName.trim();
                
                if (!name) {
                    results.failed.push({ name: folderName, reason: 'Empty name' });
                    continue;
                }

                // Check if exists
                const existing = await queryOne(
                    'SELECT id FROM folders WHERE name = ? AND parent_id <=> ? AND user_id = ? AND is_deleted = 0',
                    [name, parent_id || null, userId]
                );

                if (existing) {
                    results.failed.push({ name, reason: 'Already exists' });
                    continue;
                }

                // Create folder
                const path = parent_id ? parentPath + name : '/' + name;
                const result = await query(
                    'INSERT INTO folders (name, parent_id, user_id, path, is_deleted) VALUES (?, ?, ?, ?, 0)',
                    [name, parent_id || null, userId, path]
                );

                results.created.push({
                    id: result.insertId,
                    name: name,
                    path: path
                });

                // Log activity
                await query(
                    `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name)
                     VALUES (?, 'create_folder', 'folder', ?, ?)`,
                    [userId, result.insertId, name]
                );

            } catch (error) {
                results.failed.push({ name: folderName, reason: error.message });
            }
        }

        res.json({
            success: true,
            message: `Created ${results.created.length} folders`,
            results
        });

    } catch (error) {
        console.error('Bulk create error:', error);
        res.status(500).json({
            success: false,
            message: 'Bulk folder creation failed'
        });
    }
});

// Delete multiple folders (move to trash)
router.post('/bulk-delete', async (req, res) => {
    try {
        const userId = req.user.id;
        const { folder_ids } = req.body;

        if (!folder_ids || !Array.isArray(folder_ids) || folder_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Folder IDs array is required'
            });
        }

        const { query, queryOne } = require('../config/db');

        // Get user's trash settings
        const settings = await queryOne(
            'SELECT auto_delete_trash_days FROM user_settings WHERE user_id = ?',
            [userId]
        ) || { auto_delete_trash_days: 30 };

        const results = {
            deleted: [],
            failed: []
        };

        for (const folderId of folder_ids) {
            try {
                // Verify ownership
                const folder = await queryOne(
                    'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                    [folderId, userId]
                );

                if (!folder) {
                    results.failed.push({ id: folderId, reason: 'Not found' });
                    continue;
                }

                // Use stored procedure to move to trash
                const [result] = await query(
                    'CALL MoveToTrash(?, ?, ?, ?)',
                    ['folder', folderId, userId, settings.auto_delete_trash_days]
                );

                results.deleted.push({
                    id: folderId,
                    name: folder.name,
                    auto_delete_days: settings.auto_delete_trash_days
                });

            } catch (error) {
                results.failed.push({ id: folderId, reason: error.message });
            }
        }

        res.json({
            success: true,
            message: `Moved ${results.deleted.length} folders to trash`,
            results
        });

    } catch (error) {
        console.error('Bulk delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Bulk folder deletion failed'
        });
    }
});

// ============================================
// SEARCH IN FOLDER
// ============================================

// Search files within a folder (recursive)
router.get('/:id/search', async (req, res) => {
    try {
        const userId = req.user.id;
        const folderId = req.params.id;
        const { q } = req.query; // search query

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        const { query, queryOne } = require('../config/db');
        const { getAllSubfolderIds } = require('../controllers/folderController');

        // Verify folder exists
        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found'
            });
        }

        // Get all subfolder IDs
        const allFolderIds = await getAllSubfolderIds(folderId, userId);
        allFolderIds.push(parseInt(folderId));

        // Search files
        const placeholders = allFolderIds.map(() => '?').join(',');
        const files = await query(
            `SELECT 
                f.*,
                fo.name as folder_name,
                fo.path as folder_path,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
            FROM files f
            LEFT JOIN folders fo ON f.folder_id = fo.id
            WHERE f.folder_id IN (${placeholders}) 
            AND f.is_deleted = 0 
            AND f.original_name LIKE ?
            ORDER BY f.original_name ASC
            LIMIT 100`,
            [userId, ...allFolderIds, `%${q}%`]
        );

        res.json({
            success: true,
            query: q,
            results: files.length,
            folder: {
                id: folder.id,
                name: folder.name,
                path: folder.path
            },
            files: files
        });

    } catch (error) {
        console.error('Search in folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed'
        });
    }
});

module.exports = router;
