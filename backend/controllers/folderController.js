/* ============================================
   FOLDER CONTROLLER - WITH DUPLICATE HANDLING
   ============================================ */

const archiver = require('archiver');
const { query, queryOne } = require('../config/db');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// ✅ NEW: Check if folder exists
async function checkFolderExists(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { name, parent_id } = req.query;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Folder name is required'
            });
        }

        let sql = 'SELECT id, name, created_at FROM folders WHERE name = ? AND user_id = ? AND is_deleted = 0';
        const params = [name, userId];

        if (parent_id && parent_id !== 'null' && parent_id !== 'undefined') {
            sql += ' AND parent_id = ?';
            params.push(parent_id);
        } else {
            sql += ' AND parent_id IS NULL';
        }

        const existingFolder = await queryOne(sql, params);

        res.json({
            success: true,
            exists: !!existingFolder,
            existing_folder: existingFolder || null
        });

    } catch (error) {
        console.error('Check folder exists error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check folder'
        });
    }
}

// ✅ NEW: Delete folder completely (for replace)
async function deleteFolderCompletely(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;

        console.log('🗑️ Deleting folder completely:', folderId);

        // Get folder
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

        // Get all files in folder and subfolders
        const allFolderIds = await getAllSubfolderIds(folderId, userId);
        allFolderIds.push(folderId);

        // Calculate total size
        const sizeResult = await queryOne(
            `SELECT COALESCE(SUM(size), 0) as total_size FROM files 
             WHERE folder_id IN (${allFolderIds.map(() => '?').join(',')}) AND is_deleted = 0`,
            allFolderIds
        );
        const totalSize = sizeResult ? sizeResult.total_size : 0;

        // Delete physical files
        const files = await query(
            `SELECT storage_path FROM files WHERE folder_id IN (${allFolderIds.map(() => '?').join(',')})`,
            allFolderIds
        );

        const storageBase = path.join(__dirname, '../../storage/node1');
        for (const file of files) {
            try {
                const filePath = path.join(storageBase, file.storage_path);
                if (fsSync.existsSync(filePath)) {
                    await fs.unlink(filePath);
                }
            } catch (err) {
                console.error('Error deleting file:', err);
            }
        }

        // Delete files from database
        if (allFolderIds.length > 0) {
            await query(
                `DELETE FROM files WHERE folder_id IN (${allFolderIds.map(() => '?').join(',')})`,
                allFolderIds
            );
        }

        // Delete folders from database
        await query(
            `DELETE FROM folders WHERE id IN (${allFolderIds.map(() => '?').join(',')})`,
            allFolderIds
        );

        // Update user storage
        await query(
            'UPDATE users SET storage_used = GREATEST(0, storage_used - ?) WHERE id = ?',
            [totalSize, userId]
        );

        console.log('✅ Folder deleted completely:', folder.name);

        res.json({
            success: true,
            message: 'Folder deleted completely',
            freed_space: totalSize
        });

    } catch (error) {
        console.error('Delete folder completely error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete folder'
        });
    }
}

// Get all folders for user
async function getFolders(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        const parentId = req.query.parent_id || null;

        let sql = `
            SELECT 
                f.id,
                f.name,
                f.parent_id,
                f.path,
                f.color,
                f.created_at,
                f.updated_at,
                (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND is_deleted = 0) as file_count,
                (SELECT COUNT(*) FROM folders sub WHERE sub.parent_id = f.id AND is_deleted = 0) as subfolder_count,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.folder_id = f.id AND fav.user_id = ?) as is_favorite
            FROM folders f
            WHERE f.user_id = ? AND f.is_deleted = 0
        `;

        const params = [userId, userId];

        if (parentId) {
            sql += ' AND f.parent_id = ?';
            params.push(parentId);
        } else {
            sql += ' AND f.parent_id IS NULL';
        }

        sql += ' ORDER BY f.name ASC';

        const folders = await query(sql, params);

        res.json({
            success: true,
            folders
        });

    } catch (error) {
        console.error('Get folders error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get folders'
        });
    }
}

// Get single folder
async function getFolderById(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;

        const folder = await queryOne(
            `SELECT f.*,
                    EXISTS(SELECT 1 FROM favorites fav WHERE fav.folder_id = f.id AND fav.user_id = ?) as is_favorite
             FROM folders f
             WHERE f.id = ? AND f.user_id = ? AND f.is_deleted = 0`,
            [userId, folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found'
            });
        }

        res.json({
            success: true,
            folder
        });

    } catch (error) {
        console.error('Get folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get folder'
        });
    }
}

// Create folder - UPDATED
async function createFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        const { name, parent_id, color } = req.body;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Folder name is required'
            });
        }

        const folderName = name.trim();
        const parentIdValue = (parent_id && parent_id !== 'null' && parent_id !== null) ? parent_id : null;

        // Check if folder exists
        let checkSql = 'SELECT id, name FROM folders WHERE name = ? AND user_id = ? AND is_deleted = 0';
        let checkParams = [folderName, userId];

        if (parentIdValue) {
            checkSql += ' AND parent_id = ?';
            checkParams.push(parentIdValue);
        } else {
            checkSql += ' AND parent_id IS NULL';
        }

        const existing = await queryOne(checkSql, checkParams);

        if (existing) {
            // Return existing folder info
            return res.json({
                success: true,
                message: 'Folder already exists',
                folder: existing,
                existing: true
            });
        }

        // Build folder path
        let folderPath = '/';
        if (parentIdValue) {
            const parentFolder = await queryOne(
                'SELECT path FROM folders WHERE id = ? AND user_id = ?',
                [parentIdValue, userId]
            );
            if (parentFolder) {
                folderPath = parentFolder.path + '/' + folderName;
            } else {
                folderPath = '/' + folderName;
            }
        } else {
            folderPath = '/' + folderName;
        }

        const result = await query(
            'INSERT INTO folders (name, parent_id, user_id, path, color, is_deleted) VALUES (?, ?, ?, ?, ?, 0)',
            [folderName, parentIdValue, userId, folderPath, color || null]
        );

        console.log('✅ Folder created:', { id: result.insertId, name: folderName });

        res.status(201).json({
            success: true,
            message: 'Folder created successfully',
            folder: {
                id: result.insertId,
                name: folderName,
                parent_id: parentIdValue,
                path: folderPath
            }
        });

    } catch (error) {
        console.error('Create folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create folder: ' + error.message
        });
    }
}

// Rename folder
async function renameFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;
        const { new_name } = req.body;

        if (!new_name || !new_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'New name is required'
            });
        }

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

        const existing = await queryOne(
            'SELECT id FROM folders WHERE name = ? AND parent_id <=> ? AND user_id = ? AND id != ? AND is_deleted = 0',
            [new_name.trim(), folder.parent_id, userId, folderId]
        );

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Folder with this name already exists'
            });
        }

        const oldPath = folder.path;
        const newPath = oldPath.replace(new RegExp(folder.name + '$'), new_name.trim());

        await query(
            'UPDATE folders SET name = ?, path = ?, updated_at = NOW() WHERE id = ?',
            [new_name.trim(), newPath, folderId]
        );

        await query(
            'UPDATE folders SET path = REPLACE(path, ?, ?) WHERE path LIKE ? AND user_id = ?',
            [oldPath, newPath, oldPath + '/%', userId]
        );

        res.json({
            success: true,
            message: 'Folder renamed successfully'
        });

    } catch (error) {
        console.error('Rename folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to rename folder'
        });
    }
}

// Delete folder (move to trash)
async function deleteFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;

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

        const settings = await queryOne(
            'SELECT auto_delete_trash_days FROM user_settings WHERE user_id = ?',
            [userId]
        ) || { auto_delete_trash_days: 30 };

        const [result] = await query(
            'CALL MoveToTrash(?, ?, ?, ?)',
            ['folder', folderId, userId, settings.auto_delete_trash_days]
        );

        const user = await queryOne(
            'SELECT storage_used, storage_quota FROM users WHERE id = ?',
            [userId]
        );

        res.json({
            success: true,
            message: `Folder moved to trash`,
            storage: {
                used: user.storage_used,
                quota: user.storage_quota
            }
        });

    } catch (error) {
        console.error('Delete folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete folder'
        });
    }
}

// Restore folder from trash
async function restoreFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const trashId = req.params.trashId;

        const [result] = await query('CALL RestoreFromTrash(?, ?)', [trashId, userId]);

        if (result && result[0] && result[0].status === 'Success') {
            const user = await queryOne(
                'SELECT storage_used, storage_quota FROM users WHERE id = ?',
                [userId]
            );

            res.json({
                success: true,
                message: 'Folder restored successfully',
                storage: {
                    used: user.storage_used,
                    quota: user.storage_quota
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Folder not found in trash'
            });
        }

    } catch (error) {
        console.error('Restore folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore folder'
        });
    }
}

// Permanently delete folder
async function permanentDeleteFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const trashId = req.params.trashId;

        const trashItem = await queryOne(
            'SELECT * FROM trash WHERE id = ? AND deleted_by = ? AND item_type = "folder"',
            [trashId, userId]
        );

        if (!trashItem) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found in trash'
            });
        }

        const [result] = await query('CALL PermanentDelete(?, ?)', [trashId, userId]);

        if (result && result[0] && result[0].status === 'Success') {
            res.json({
                success: true,
                message: 'Folder permanently deleted'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Failed to delete folder'
            });
        }

    } catch (error) {
        console.error('Permanent delete folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete folder permanently'
        });
    }
}

// Helper: Get all subfolder IDs
async function getAllSubfolderIds(folderId, userId) {
    const subfolders = await query(
        'SELECT id FROM folders WHERE parent_id = ? AND user_id = ?',
        [folderId, userId]
    );

    let allIds = [];
    for (const subfolder of subfolders) {
        allIds.push(subfolder.id);
        const childIds = await getAllSubfolderIds(subfolder.id, userId);
        allIds = allIds.concat(childIds);
    }

    return allIds;
}

// Move folder
async function moveFolder(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;
        const { parent_id } = req.body;

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

        if (parent_id) {
            const allSubfolderIds = await getAllSubfolderIds(folderId, userId);
            if (allSubfolderIds.includes(parseInt(parent_id)) || parseInt(parent_id) === folderId) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot move folder into itself'
                });
            }
        }

        let newPath;
        if (parent_id) {
            const parentFolder = await queryOne('SELECT path FROM folders WHERE id = ?', [parent_id]);
            newPath = parentFolder.path + '/' + folder.name;
        } else {
            newPath = '/' + folder.name;
        }

        const oldPath = folder.path;

        await query(
            'UPDATE folders SET parent_id = ?, path = ?, updated_at = NOW() WHERE id = ?',
            [parent_id || null, newPath, folderId]
        );

        await query(
            'UPDATE folders SET path = REPLACE(path, ?, ?) WHERE path LIKE ? AND user_id = ?',
            [oldPath, newPath, oldPath + '/%', userId]
        );

        res.json({
            success: true,
            message: 'Folder moved successfully'
        });

    } catch (error) {
        console.error('Move folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to move folder'
        });
    }
}

// Get folder contents
async function getFolderContents(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;

        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({ success: false, message: 'Folder not found' });
        }

        const subfolders = await query(
            `SELECT f.*, (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND is_deleted = 0) as file_count
             FROM folders f WHERE f.parent_id = ? AND f.user_id = ? AND f.is_deleted = 0 ORDER BY f.name`,
            [folderId, userId]
        );

        const files = await query(
            'SELECT * FROM files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0 ORDER BY original_name',
            [folderId, userId]
        );

        res.json({ success: true, folder, folders: subfolders, files });

    } catch (error) {
        console.error('Get folder contents error:', error);
        res.status(500).json({ success: false, message: 'Failed to get folder contents' });
    }
}

// Get folder breadcrumb
async function getFolderBreadcrumb(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.params.id;

        if (!folderId || folderId === 'null' || folderId === 'root') {
            return res.json({
                success: true,
                breadcrumb: [{ id: null, name: 'My Files', path: '/' }]
            });
        }

        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({ success: false, message: 'Folder not found' });
        }

        const breadcrumb = [{ id: null, name: 'My Files', path: '/' }];
        
        if (folder.path && folder.path !== '/') {
            const pathParts = folder.path.split('/').filter(p => p);
            let currentPath = '';
            
            for (const part of pathParts) {
                currentPath += '/' + part;
                const pathFolder = await queryOne(
                    'SELECT id, name FROM folders WHERE path = ? AND user_id = ?',
                    [currentPath, userId]
                );
                if (pathFolder) {
                    breadcrumb.push({ id: pathFolder.id, name: pathFolder.name, path: currentPath });
                }
            }
        }

        res.json({ success: true, breadcrumb });

    } catch (error) {
        console.error('Get breadcrumb error:', error);
        res.status(500).json({ success: false, message: 'Failed to get breadcrumb' });
    }
}

// Download folder as ZIP
async function downloadFolder(req, res) {
    // ... keep existing code
    const folderId = req.params.id;
    const userId = req.user.id || req.user.userId;

    try {
        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({ success: false, message: 'Folder not found' });
        }

        const folderName = folder.name.replace(/[^a-z0-9_-]/gi, '_');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);
        await addFolderToArchive(archive, folderId, userId, '');
        await archive.finalize();

    } catch (error) {
        console.error('Download folder error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Download failed' });
        }
    }
}

async function addFolderToArchive(archive, folderId, userId, basePath) {
    const storageBase = path.join(__dirname, '../../storage/node1');
    
    const files = await query(
        'SELECT * FROM files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0',
        [folderId, userId]
    );

    for (const file of files) {
        const filePath = path.join(storageBase, file.storage_path);
        if (fsSync.existsSync(filePath)) {
            const archivePath = basePath ? path.join(basePath, file.original_name) : file.original_name;
            archive.file(filePath, { name: archivePath });
        }
    }

    const subfolders = await query(
        'SELECT * FROM folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0',
        [folderId, userId]
    );

    for (const subfolder of subfolders) {
        const subPath = basePath ? path.join(basePath, subfolder.name) : subfolder.name;
        await addFolderToArchive(archive, subfolder.id, userId, subPath);
    }
}

module.exports = {
    getFolders,
    getFolderById,
    createFolder,
    renameFolder,
    deleteFolder,
    restoreFolder,
    permanentDeleteFolder,
    moveFolder,
    getFolderContents,
    getFolderBreadcrumb,
    getAllSubfolderIds,
    downloadFolder,
    checkFolderExists,          // ✅ NEW
    deleteFolderCompletely      // ✅ NEW
};
