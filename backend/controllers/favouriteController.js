/* ============================================
   FAVORITE CONTROLLER
   Handles favorites for both files and folders
   ============================================ */

const { query, queryOne } = require('../config/db');

// Get all favorites for user
async function getFavorites(req, res) {
    try {
        const userId = req.user.id || req.user.userId;

        const favorites = await query(
            `SELECT 
                f.id as favorite_id,
                f.item_type,
                f.created_at as favorited_at,
                CASE 
                    WHEN f.item_type = 'file' THEN files.id
                    WHEN f.item_type = 'folder' THEN folders.id
                END as item_id,
                CASE 
                    WHEN f.item_type = 'file' THEN files.original_name
                    WHEN f.item_type = 'folder' THEN folders.name
                END as name,
                CASE 
                    WHEN f.item_type = 'file' THEN files.size
                    ELSE NULL
                END as size,
                CASE 
                    WHEN f.item_type = 'file' THEN files.mime_type
                    ELSE NULL
                END as mime_type,
                CASE 
                    WHEN f.item_type = 'file' THEN files.folder_id
                    WHEN f.item_type = 'folder' THEN folders.parent_id
                END as parent_id,
                CASE 
                    WHEN f.item_type = 'file' THEN files.created_at
                    WHEN f.item_type = 'folder' THEN folders.created_at
                END as created_at,
                CASE 
                    WHEN f.item_type = 'file' THEN files.updated_at
                    WHEN f.item_type = 'folder' THEN folders.updated_at
                END as updated_at
            FROM favorites f
            LEFT JOIN files ON f.file_id = files.id AND f.item_type = 'file'
            LEFT JOIN folders ON f.folder_id = folders.id AND f.item_type = 'folder'
            WHERE f.user_id = ?
            AND (
                (f.item_type = 'file' AND files.is_deleted = FALSE) OR
                (f.item_type = 'folder' AND folders.is_deleted = FALSE)
            )
            ORDER BY f.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            count: favorites.length,
            favorites
        });

    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get favorites'
        });
    }
}

// Add item to favorites
async function addFavorite(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { item_type, item_id } = req.body;

        // Validate input
        if (!item_type || !item_id) {
            return res.status(400).json({
                success: false,
                message: 'Item type and ID are required'
            });
        }

        if (!['file', 'folder'].includes(item_type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid item type. Must be "file" or "folder"'
            });
        }

        // Verify item exists and belongs to user
        if (item_type === 'file') {
            const file = await queryOne(
                'SELECT id FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [item_id, userId]
            );

            if (!file) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found'
                });
            }

            // Check if already favorited
            const existing = await queryOne(
                'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND file_id = ?',
                [userId, 'file', item_id]
            );

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'File is already in favorites'
                });
            }

            // Add to favorites
            await query(
                'INSERT INTO favorites (user_id, item_type, file_id) VALUES (?, ?, ?)',
                [userId, 'file', item_id]
            );

        } else if (item_type === 'folder') {
            const folder = await queryOne(
                'SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [item_id, userId]
            );

            if (!folder) {
                return res.status(404).json({
                    success: false,
                    message: 'Folder not found'
                });
            }

            // Check if already favorited
            const existing = await queryOne(
                'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND folder_id = ?',
                [userId, 'folder', item_id]
            );

            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: 'Folder is already in favorites'
                });
            }

            // Add to favorites
            await query(
                'INSERT INTO favorites (user_id, item_type, folder_id) VALUES (?, ?, ?)',
                [userId, 'folder', item_id]
            );
        }

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id) 
            VALUES (?, 'add_favorite', ?, ?)`,
            [userId, item_type, item_id]
        );

        res.status(201).json({
            success: true,
            message: `${item_type === 'file' ? 'File' : 'Folder'} added to favorites`
        });

    } catch (error) {
        console.error('Add favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add to favorites'
        });
    }
}

// Remove item from favorites
async function removeFavorite(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { item_type, item_id } = req.body;

        // Validate input
        if (!item_type || !item_id) {
            return res.status(400).json({
                success: false,
                message: 'Item type and ID are required'
            });
        }

        if (!['file', 'folder'].includes(item_type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid item type. Must be "file" or "folder"'
            });
        }

        let result;
        if (item_type === 'file') {
            result = await query(
                'DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND file_id = ?',
                [userId, 'file', item_id]
            );
        } else {
            result = await query(
                'DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND folder_id = ?',
                [userId, 'folder', item_id]
            );
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Favorite not found'
            });
        }

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id) 
            VALUES (?, 'remove_favorite', ?, ?)`,
            [userId, item_type, item_id]
        );

        res.json({
            success: true,
            message: `${item_type === 'file' ? 'File' : 'Folder'} removed from favorites`
        });

    } catch (error) {
        console.error('Remove favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove from favorites'
        });
    }
}

// Toggle favorite (add if not exists, remove if exists)
async function toggleFavorite(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { item_type, item_id } = req.body;

        // Validate input
        if (!item_type || !item_id) {
            return res.status(400).json({
                success: false,
                message: 'Item type and ID are required'
            });
        }

        if (!['file', 'folder'].includes(item_type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid item type. Must be "file" or "folder"'
            });
        }

        // Check if already favorited
        let existing;
        if (item_type === 'file') {
            existing = await queryOne(
                'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND file_id = ?',
                [userId, 'file', item_id]
            );
        } else {
            existing = await queryOne(
                'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND folder_id = ?',
                [userId, 'folder', item_id]
            );
        }

        if (existing) {
            // Remove from favorites
            if (item_type === 'file') {
                await query(
                    'DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND file_id = ?',
                    [userId, 'file', item_id]
                );
            } else {
                await query(
                    'DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND folder_id = ?',
                    [userId, 'folder', item_id]
                );
            }

            // Log activity
            await query(
                `INSERT INTO activity_log (user_id, action_type, target_type, target_id) 
                VALUES (?, 'remove_favorite', ?, ?)`,
                [userId, item_type, item_id]
            );

            return res.json({
                success: true,
                is_favorite: false,
                message: `${item_type === 'file' ? 'File' : 'Folder'} removed from favorites`
            });
        } else {
            // Verify item exists
            if (item_type === 'file') {
                const file = await queryOne(
                    'SELECT id FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
                    [item_id, userId]
                );

                if (!file) {
                    return res.status(404).json({
                        success: false,
                        message: 'File not found'
                    });
                }

                await query(
                    'INSERT INTO favorites (user_id, item_type, file_id) VALUES (?, ?, ?)',
                    [userId, 'file', item_id]
                );
            } else {
                const folder = await queryOne(
                    'SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                    [item_id, userId]
                );

                if (!folder) {
                    return res.status(404).json({
                        success: false,
                        message: 'Folder not found'
                    });
                }

                await query(
                    'INSERT INTO favorites (user_id, item_type, folder_id) VALUES (?, ?, ?)',
                    [userId, 'folder', item_id]
                );
            }

            // Log activity
            await query(
                `INSERT INTO activity_log (user_id, action_type, target_type, target_id) 
                VALUES (?, 'add_favorite', ?, ?)`,
                [userId, item_type, item_id]
            );

            return res.status(201).json({
                success: true,
                is_favorite: true,
                message: `${item_type === 'file' ? 'File' : 'Folder'} added to favorites`
            });
        }

    } catch (error) {
        console.error('Toggle favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle favorite'
        });
    }
}

// Check if item is favorited
async function checkFavorite(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { item_type, item_id } = req.query;

        if (!item_type || !item_id) {
            return res.status(400).json({
                success: false,
                message: 'Item type and ID are required'
            });
        }

        let favorite;
        if (item_type === 'file') {
            favorite = await queryOne(
                'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND file_id = ?',
                [userId, 'file', item_id]
            );
        } else if (item_type === 'folder') {
            favorite = await queryOne(
                'SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND folder_id = ?',
                [userId, 'folder', item_id]
            );
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid item type'
            });
        }

        res.json({
            success: true,
            is_favorite: !!favorite
        });

    } catch (error) {
        console.error('Check favorite error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check favorite status'
        });
    }
}

// Get favorite count
async function getFavoriteCount(req, res) {
    try {
        const userId = req.user.id || req.user.userId;

        const result = await queryOne(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN item_type = 'file' THEN 1 ELSE 0 END) as files,
                SUM(CASE WHEN item_type = 'folder' THEN 1 ELSE 0 END) as folders
            FROM favorites
            WHERE user_id = ?`,
            [userId]
        );

        res.json({
            success: true,
            count: {
                total: result.total,
                files: result.files || 0,
                folders: result.folders || 0
            }
        });

    } catch (error) {
        console.error('Get favorite count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get favorite count'
        });
    }
}

module.exports = {
    getFavorites,
    addFavorite,
    removeFavorite,
    toggleFavorite,
    checkFavorite,
    getFavoriteCount
};
