/* ============================================
   FOLDER CONTROLLER
   ============================================ */

const { query, queryOne } = require('../config/db');

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

// Delete folder
async function deleteFolder(req, res) {
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

        // Delete folder (CASCADE will handle files)
        await query('DELETE FROM folders WHERE id = ?', [folderId]);

        res.json({
            success: true,
            message: 'Folder deleted successfully'
        });

    } catch (error) {
        console.error('Delete folder error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete folder'
        });
    }
}

module.exports = {
    getFolders,
    getFolderById,
    createFolder,
    renameFolder,
    deleteFolder
};