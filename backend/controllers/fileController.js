/* ============================================
   FILE CONTROLLER - UPDATED WITH STORAGE FIX
   ============================================ */

const { query, queryOne } = require('../config/db');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Get all files for user
async function getFiles(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.query.folder_id || null;

        let sql = `
            SELECT 
                f.id,
                f.filename,
                f.original_name,
                f.mime_type,
                f.size,
                f.folder_id,
                f.created_at,
                f.updated_at,
                f.download_count,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
            FROM files f
            WHERE f.user_id = ? 
            AND f.is_deleted = 0
        `;

        const params = [userId, userId];

        if (folderId) {
            sql += ' AND f.folder_id = ?';
            params.push(folderId);
        } else {
            sql += ' AND f.folder_id IS NULL';
        }

        sql += ' ORDER BY f.created_at DESC';

        const files = await query(sql, params);

        res.json({
            success: true,
            files
        });

    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get files'
        });
    }
}

// Get single file
async function getFileById(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;

        const file = await queryOne(
            `SELECT f.*,
                    EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
             FROM files f
             WHERE f.id = ? AND f.user_id = ?`,
            [userId, fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.json({
            success: true,
            file
        });

    } catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get file'
        });
    }
}

// Upload file - ✅ STORAGE UPDATED
async function uploadFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.body.folder_id || null;

        console.log('📤 Upload request from user:', userId);
        console.log('📁 Folder ID:', folderId);

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const file = req.file;
        
        // Get the absolute path from multer
        const absolutePath = file.path;
        
        // Get storage base path
        const storageBase = path.join(__dirname, '../../storage/node1');
        
        // Calculate relative path from storage node1
        let relativePath = path.relative(storageBase, absolutePath);
        
        // Normalize path separators for cross-platform compatibility
        relativePath = relativePath.replace(/\\/g, '/');

        console.log('💾 Absolute path:', absolutePath);
        console.log('📂 Storage base:', storageBase);
        console.log('📂 Relative path:', relativePath);
        console.log('✅ File exists:', fsSync.existsSync(absolutePath));

        // Insert into database with RELATIVE path
        const result = await query(
            `INSERT INTO files 
            (filename, original_name, mime_type, size, folder_id, user_id, storage_path, storage_node) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                file.filename,
                file.originalname,
                file.mimetype,
                file.size,
                folderId,
                userId,
                relativePath,
                'node1'
            ]
        );

        // ✅ UPDATE USER STORAGE (ADD)
        await query(
            'UPDATE users SET storage_used = storage_used + ? WHERE id = ?',
            [file.size, userId]
        );

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details, ip_address)
             VALUES (?, 'upload', 'file', ?, ?, ?, ?)`,
            [userId, result.insertId, file.originalname, JSON.stringify({ size: file.size, mime_type: file.mimetype }), req.ip]
        );

        // Get updated user info
        const user = await queryOne(
            'SELECT storage_used, storage_quota FROM users WHERE id = ?',
            [userId]
        );

        console.log('✅ File uploaded successfully:', result.insertId);
        console.log('💾 Storage updated:', user.storage_used);

        res.status(201).json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: result.insertId,
                filename: file.filename,
                original_name: file.originalname,
                size: file.size,
                mime_type: file.mimetype,
                folder_id: folderId
            },
            storage: {
                used: user.storage_used,
                quota: user.storage_quota
            }
        });

    } catch (error) {
        console.error('Upload file error:', error);
        res.status(500).json({
            success: false,
            message: 'File upload failed: ' + error.message
        });
    }
}

// Download file
async function downloadFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Construct full path from relative path
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, file.storage_path);

        console.log('📥 Download request for:', file.original_name);
        console.log('📂 Full path:', filePath);
        console.log('✅ Exists:', fsSync.existsSync(filePath));

        // Check if file exists
        if (!fsSync.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on disk'
            });
        }

        // Update download count
        await query(
            'UPDATE files SET download_count = download_count + 1 WHERE id = ?',
            [fileId]
        );

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, ip_address)
             VALUES (?, 'download', 'file', ?, ?, ?)`,
            [userId, fileId, file.original_name, req.ip]
        );

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');

        // Stream file
        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Download file error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'File download failed'
            });
        }
    }
}

// Delete file (move to trash) - ✅ STORAGE UPDATED BY STORED PROCEDURE
async function deleteFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Get user's trash settings
        const settings = await queryOne(
            'SELECT auto_delete_trash_days FROM user_settings WHERE user_id = ?',
            [userId]
        ) || { auto_delete_trash_days: 30 };

        // ✅ Use stored procedure (handles storage update automatically)
        const [result] = await query(
            'CALL MoveToTrash(?, ?, ?, ?)',
            ['file', fileId, userId, settings.auto_delete_trash_days]
        );

        // Get updated storage info
        const user = await queryOne(
            'SELECT storage_used, storage_quota FROM users WHERE id = ?',
            [userId]
        );

        console.log(`🗑️ File "${file.original_name}" moved to trash`);
        console.log(`💾 Storage freed: ${file.size} bytes`);
        console.log(`💾 Current storage: ${user.storage_used} bytes`);

        res.json({
            success: true,
            message: `File moved to trash. Will be permanently deleted in ${settings.auto_delete_trash_days} days.`,
            auto_delete_days: settings.auto_delete_trash_days,
            freed_space: file.size,
            storage: {
                used: user.storage_used,
                quota: user.storage_quota
            }
        });

    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file'
        });
    }
}

// Get trash items
async function getTrashItems(req, res) {
    try {
        const userId = req.user.id || req.user.userId;

        console.log('🗑️ Getting trash items for user:', userId);

        // Use stored procedure
        const [trashItems] = await query('CALL GetTrashItems(?)', [userId]);

        res.json({
            success: true,
            count: trashItems.length,
            items: trashItems
        });

    } catch (error) {
        console.error('Get trash items error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get trash items'
        });
    }
}

// Restore file from trash - ✅ STORAGE UPDATED BY STORED PROCEDURE
async function restoreFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const trashId = req.params.trashId;

        console.log('♻️ Restoring trash item:', trashId, 'for user:', userId);

        // ✅ Use stored procedure (handles storage update automatically)
        const [result] = await query('CALL RestoreFromTrash(?, ?)', [trashId, userId]);

        if (result && result[0] && result[0].status === 'Success') {
            // Get updated storage info
            const user = await queryOne(
                'SELECT storage_used, storage_quota FROM users WHERE id = ?',
                [userId]
            );

            console.log(`♻️ Item restored, storage added back: ${result[0].restored_space || 0} bytes`);
            console.log(`💾 Current storage: ${user.storage_used} bytes`);

            res.json({
                success: true,
                message: 'Item restored successfully',
                restored_space: result[0].restored_space || 0,
                storage: {
                    used: user.storage_used,
                    quota: user.storage_quota
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Item not found in trash'
            });
        }

    } catch (error) {
        console.error('Restore file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore item'
        });
    }
}

// Permanently delete file - ✅ NO STORAGE UPDATE (already freed)
async function permanentDelete(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const trashId = req.params.trashId;

        console.log('🔥 Permanently deleting trash item:', trashId);

        // Get trash item details first
        const trashItem = await queryOne(
            'SELECT * FROM trash WHERE id = ? AND deleted_by = ?',
            [trashId, userId]
        );

        if (!trashItem) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in trash'
            });
        }

        // Get file details if it's a file
        if (trashItem.item_type === 'file' && trashItem.file_id) {
            const file = await queryOne(
                'SELECT storage_path FROM files WHERE id = ?',
                [trashItem.file_id]
            );

            if (file) {
                // Delete physical file
                const storageBase = path.join(__dirname, '../../storage/node1');
                const filePath = path.join(storageBase, file.storage_path);
                
                if (fsSync.existsSync(filePath)) {
                    await fs.unlink(filePath);
                    console.log('🗑️ Physical file deleted:', filePath);
                }
            }
        }

        // ✅ Use stored procedure (NO storage update - already freed when moved to trash)
        const [result] = await query('CALL PermanentDelete(?, ?)', [trashId, userId]);

        if (result && result[0] && result[0].status === 'Success') {
            console.log('🔥 Item permanently deleted (storage already freed)');

            res.json({
                success: true,
                message: 'Item permanently deleted',
                freed_space: result[0].freed_space
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Failed to delete item'
            });
        }

    } catch (error) {
        console.error('Permanent delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete item permanently'
        });
    }
}

// Empty trash (delete all items in trash)
async function emptyTrash(req, res) {
    try {
        const userId = req.user.id || req.user.userId;

        console.log('🗑️💥 Emptying entire trash for user:', userId);

        // Get all trash items
        const trashItems = await query(
            'SELECT * FROM trash WHERE deleted_by = ?',
            [userId]
        );

        if (trashItems.length === 0) {
            return res.json({
                success: true,
                message: 'Trash is already empty',
                deleted_count: 0
            });
        }

        let deletedCount = 0;
        let totalFreedSpace = 0;

        // Delete each item
        for (const item of trashItems) {
            try {
                // Delete physical files
                if (item.item_type === 'file' && item.file_id) {
                    const file = await queryOne(
                        'SELECT storage_path FROM files WHERE id = ?',
                        [item.file_id]
                    );

                    if (file) {
                        const storageBase = path.join(__dirname, '../../storage/node1');
                        const filePath = path.join(storageBase, file.storage_path);
                        
                        if (fsSync.existsSync(filePath)) {
                            await fs.unlink(filePath);
                        }
                    }
                }

                // Use stored procedure
                const [result] = await query('CALL PermanentDelete(?, ?)', [item.id, userId]);
                
                if (result && result[0] && result[0].status === 'Success') {
                    deletedCount++;
                    totalFreedSpace += result[0].freed_space || 0;
                }
            } catch (err) {
                console.error('Error deleting item:', item.id, err);
            }
        }

        console.log(`🗑️ Emptied trash: ${deletedCount} items (storage already freed)`);

        res.json({
            success: true,
            message: `${deletedCount} items permanently deleted`,
            deleted_count: deletedCount,
            freed_space: totalFreedSpace
        });

    } catch (error) {
        console.error('Empty trash error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to empty trash'
        });
    }
}

// Rename file
async function renameFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const { new_name } = req.body;

        if (!new_name || !new_name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'New name is required'
            });
        }

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        await query(
            'UPDATE files SET original_name = ?, updated_at = NOW() WHERE id = ?',
            [new_name.trim(), fileId]
        );

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
             VALUES (?, 'rename', 'file', ?, ?, ?)`,
            [userId, fileId, new_name.trim(), JSON.stringify({ old_name: file.original_name })]
        );

        res.json({
            success: true,
            message: 'File renamed successfully'
        });

    } catch (error) {
        console.error('Rename file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to rename file'
        });
    }
}

// Move file
async function moveFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const { folder_id } = req.body;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Verify folder exists if folder_id provided
        if (folder_id) {
            const folder = await queryOne(
                'SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [folder_id, userId]
            );

            if (!folder) {
                return res.status(404).json({
                    success: false,
                    message: 'Target folder not found'
                });
            }
        }

        await query(
            'UPDATE files SET folder_id = ?, updated_at = NOW() WHERE id = ?',
            [folder_id || null, fileId]
        );

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
             VALUES (?, 'move', 'file', ?, ?, ?)`,
            [userId, fileId, file.original_name, JSON.stringify({ old_folder: file.folder_id, new_folder: folder_id })]
        );

        res.json({
            success: true,
            message: 'File moved successfully'
        });

    } catch (error) {
        console.error('Move file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to move file'
        });
    }
}

// Search files
async function searchFiles(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const searchQuery = req.params.query;

        if (!searchQuery || searchQuery.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        const files = await query(
            `SELECT f.*,
                    EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
             FROM files f
             WHERE f.user_id = ? 
             AND f.is_deleted = 0 
             AND f.original_name LIKE ? 
             ORDER BY f.created_at DESC 
             LIMIT 50`,
            [userId, userId, `%${searchQuery}%`]
        );

        res.json({
            success: true,
            count: files.length,
            files
        });

    } catch (error) {
        console.error('Search files error:', error);
        res.status(500).json({
            success: false,
            message: 'Search failed'
        });
    }
}

// Get recent files for user
async function getRecentFiles(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50); // Max 50

        console.log('📅 Getting recent files for user:', userId, 'limit:', limit);

        // Get recent files
        const files = await query(
            `SELECT 
                f.id,
                f.filename,
                f.original_name,
                f.mime_type,
                f.size,
                f.folder_id,
                f.created_at,
                f.updated_at,
                fo.name as folder_name,
                'file' as item_type,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
            FROM files f
            LEFT JOIN folders fo ON f.folder_id = fo.id
            WHERE f.user_id = ? 
            AND f.is_deleted = 0
            ORDER BY f.updated_at DESC
            LIMIT ${limit}`,
            [userId, userId]
        );

        // Get recent folders
        const folders = await query(
            `SELECT 
                id,
                name,
                parent_id,
                created_at,
                updated_at,
                'folder' as item_type,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.folder_id = id AND fav.user_id = ?) as is_favorite
            FROM folders
            WHERE user_id = ? 
            AND is_deleted = 0
            ORDER BY updated_at DESC
            LIMIT ${limit}`,
            [userId, userId]
        );

        // Combine and sort by updated_at
        const combined = [...files, ...folders].sort((a, b) => {
            return new Date(b.updated_at) - new Date(a.updated_at);
        }).slice(0, limit);

        console.log('📅 Recent items found:', combined.length);

        res.json({
            success: true,
            count: combined.length,
            items: combined
        });

    } catch (error) {
        console.error('Get recent files error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get recent files'
        });
    }
}

module.exports = {
    getFiles,
    getFileById,
    uploadFile,
    downloadFile,
    deleteFile,
    getTrashItems,
    restoreFile,
    permanentDelete,
    emptyTrash,
    renameFile,
    moveFile,
    searchFiles,
    getRecentFiles
};
