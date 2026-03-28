/* ============================================
   FOLDER CONTROLLER
   ============================================ */

const { query, queryOne } = require('../config/db');
const fs = require('fs').promises;
const fsSync = require('fs');

// Get all folders for user
async function getFolders(req, res) {
    try {
        const userId = req.user.userId;
        const parentId = req.query.parent_id || null;

        let sql = `
            SELECT 
                id,
                name,
                parent_id,
                created_at,
                updated_at,
                (SELECT COUNT(*) FROM files WHERE folder_id = folders.id AND is_deleted = 0) as file_count,
                (SELECT COUNT(*) FROM folders f WHERE f.parent_id = folders.id) as subfolder_count
            FROM folders
            WHERE user_id = ?
        `;

        const params = [userId];

        if (parentId) {
            sql += ' AND parent_id = ?';
            params.push(parentId);
        } else {
            sql += ' AND parent_id IS NULL';
        }

        sql += ' ORDER BY name ASC';

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
        const userId = req.user.userId;
        const folderId = req.params.id;

        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
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

// Create folder
async function createFolder(req, res) {
    try {
        const userId = req.user.userId;
        const { name, parent_id } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Folder name is required'
            });
        }

        // Check if folder with same name exists
        const existing = await queryOne(
            'SELECT id FROM folders WHERE name = ? AND parent_id <=> ? AND user_id = ?',
            [name, parent_id || null, userId]
        );

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Folder with this name already exists'
            });
        }

        const result = await query(
            'INSERT INTO folders (name, parent_id, user_id) VALUES (?, ?, ?)',
            [name, parent_id || null, userId]
        );

        res.status(201).json({
            success: true,
            message: 'Folder created successfully',
            folder: {
                id: result.insertId,
                name,
                parent_id: parent_id || null
            }
        });

    } catch (error) {
        console.error('Create folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create folder'
        });
    }
}

// Rename folder
async function renameFolder(req, res) {
    try {
        const userId = req.user.userId;
        const folderId = req.params.id;
        const { new_name } = req.body;

        if (!new_name || !new_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'New name is required'
            });
        }

        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found'
            });
        }

        await query(
            'UPDATE folders SET name = ?, updated_at = NOW() WHERE id = ?',
            [new_name, folderId]
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

// Delete folder and all contents
async function deleteFolder(req, res) {
    try {
        const userId = req.user.userId;
        const folderId = req.params.id;

        // Check if folder exists
        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found'
            });
        }

        // Get all files in this folder and subfolders
        const allFolderIds = await getAllSubfolderIds(folderId, userId);
        allFolderIds.push(folderId); // Include the main folder

        console.log('Deleting folders:', allFolderIds);

        // Get all files in these folders
        const filesInFolders = await query(
            `SELECT * FROM files WHERE folder_id IN (?) AND user_id = ?`,
            [allFolderIds, userId]
        );

        console.log('Files to delete:', filesInFolders.length);

        let totalSizeFreed = 0;

        // Delete physical files
        for (const file of filesInFolders) {
            try {
                // Delete main file
                if (file.storage_path && fsSync.existsSync(file.storage_path)) {
                    await fs.unlink(file.storage_path);
                    console.log('Deleted file:', file.storage_path);
                }

                // Delete backup files
                if (file.backup_path_1 && fsSync.existsSync(file.backup_path_1)) {
                    await fs.unlink(file.backup_path_1);
                }
                if (file.backup_path_2 && fsSync.existsSync(file.backup_path_2)) {
                    await fs.unlink(file.backup_path_2);
                }

                totalSizeFreed += file.size || 0;

            } catch (fileError) {
                console.error('Error deleting physical file:', fileError);
            }
        }

        // Delete files from database
        if (filesInFolders.length > 0) {
            await query(
                'DELETE FROM files WHERE folder_id IN (?) AND user_id = ?',
                [allFolderIds, userId]
            );
        }

        // Delete subfolders first (child folders)
        for (const subFolderId of allFolderIds.reverse()) {
            await query('DELETE FROM folders WHERE id = ? AND user_id = ?', [subFolderId, userId]);
        }

        // Update user storage
        if (totalSizeFreed > 0) {
            await query(
                'UPDATE users SET storage_used = GREATEST(0, storage_used - ?) WHERE id = ?',
                [totalSizeFreed, userId]
            );
        }

        res.json({
            success: true,
            message: 'Folder and all contents deleted successfully',
            deletedFiles: filesInFolders.length,
            freedSpace: totalSizeFreed
        });

    } catch (error) {
        console.error('Delete folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete folder'
        });
    }
}

// Helper: Get all subfolder IDs recursively
async function getAllSubfolderIds(folderId, userId) {
    const subfolders = await query(
        'SELECT id FROM folders WHERE parent_id = ? AND user_id = ?',
        [folderId, userId]
    );

    let allIds = [];

    for (const subfolder of subfolders) {
        allIds.push(subfolder.id);
        // Recursively get subfolders
        const childIds = await getAllSubfolderIds(subfolder.id, userId);
        allIds = allIds.concat(childIds);
    }

    return allIds;
}

// Move folder
async function moveFolder(req, res) {
    try {
        const userId = req.user.userId;
        const folderId = req.params.id;
        const { parent_id } = req.body;

        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );

        if (!folder) {
            return res.status(404).json({
                success: false,
                message: 'Folder not found'
            });
        }

        // Prevent moving folder into itself or its subfolder
        if (parent_id) {
            const allSubfolderIds = await getAllSubfolderIds(folderId, userId);
            if (allSubfolderIds.includes(parseInt(parent_id)) || parseInt(parent_id) === folderId) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot move folder into itself or its subfolder'
                });
            }
        }

        await query(
            'UPDATE folders SET parent_id = ?, updated_at = NOW() WHERE id = ?',
            [parent_id || null, folderId]
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

// Get folder contents (files and subfolders)
async function getFolderContents(req, res) {
    try {
        const userId = req.user.userId;
        const folderId = req.params.id;

        // Get subfolders
        const subfolders = await query(
            `SELECT 
                id, name, parent_id, created_at, updated_at,
                (SELECT COUNT(*) FROM files WHERE folder_id = folders.id AND is_deleted = 0) as file_count
            FROM folders 
            WHERE parent_id = ? AND user_id = ?
            ORDER BY name ASC`,
            [folderId, userId]
        );

        // Get files
        const files = await query(
            `SELECT * FROM files 
            WHERE folder_id = ? AND user_id = ? AND is_deleted = 0
            ORDER BY original_name ASC`,
            [folderId, userId]
        );

        res.json({
            success: true,
            folders: subfolders,
            files: files
        });

    } catch (error) {
        console.error('Get folder contents error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get folder contents'
        });
    }
}

module.exports = {
    getFolders,
    getFolderById,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    getFolderContents
};
