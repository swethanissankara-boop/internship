/* ============================================
   FILE CONTROLLER
   ============================================ */

const { query, queryOne } = require('../config/db');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// Get all files for user
async function getFiles(req, res) {
    try {
        const userId = req.user.userId;
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
                f.updated_at
            FROM files f
            WHERE f.user_id = ? 
            AND f.is_deleted = 0
        `;

        const params = [userId];

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
        const userId = req.user.userId;
        const fileId = req.params.id;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
            [fileId, userId]
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

// Upload file
async function uploadFile(req, res) {
    try {
        const userId = req.user.userId;
        const folderId = req.body.folder_id || null;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const file = req.file;
        const storagePath = file.path;

        // Insert into database
        const result = await query(
            `INSERT INTO files 
            (filename, original_name, mime_type, size, folder_id, user_id, storage_path) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                file.filename,
                file.originalname,
                file.mimetype,
                file.size,
                folderId,
                userId,
                storagePath
            ]
        );

        // Update user storage
        await query(
            'UPDATE users SET storage_used = storage_used + ? WHERE id = ?',
            [file.size, userId]
        );

        // Get updated user info
        const user = await queryOne(
            'SELECT storage_used, storage_quota FROM users WHERE id = ?',
            [userId]
        );

        res.status(201).json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: result.insertId,
                filename: file.filename,
                original_name: file.originalname,
                size: file.size,
                mime_type: file.mimetype
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
            message: 'File upload failed'
        });
    }
}

// Download file
async function downloadFile(req, res) {
    try {
        const userId = req.user.userId;
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

        const filePath = file.storage_path;

        // Check if file exists
        if (!fsSync.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on disk'
            });
        }

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.mime_type);

        // Stream file
        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Download file error:', error);
        res.status(500).json({
            success: false,
            message: 'File download failed'
        });
    }
}

// Delete file (move to trash)
async function deleteFile(req, res) {
    try {
        const userId = req.user.userId;
        const fileId = req.params.id;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Move to trash
        await query(
            `UPDATE files 
            SET is_deleted = 1, deleted_at = NOW() 
            WHERE id = ?`,
            [fileId]
        );

        // Add to trash table
        await query(
            `INSERT INTO trash (file_id, original_folder_id, deleted_by, auto_delete_at)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
            [fileId, file.folder_id, userId]
        );

        res.json({
            success: true,
            message: 'File moved to trash'
        });

    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file'
        });
    }
}

// Restore file from trash
async function restoreFile(req, res) {
    try {
        const userId = req.user.userId;
        const fileId = req.params.id;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 1',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found in trash'
            });
        }

        // Restore file
        await query(
            'UPDATE files SET is_deleted = 0, deleted_at = NULL WHERE id = ?',
            [fileId]
        );

        // Remove from trash table
        await query(
            'DELETE FROM trash WHERE file_id = ?',
            [fileId]
        );

        res.json({
            success: true,
            message: 'File restored successfully'
        });

    } catch (error) {
        console.error('Restore file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore file'
        });
    }
}

// Permanently delete file
async function permanentDelete(req, res) {
    try {
        const userId = req.user.userId;
        const fileId = req.params.id;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Delete physical file
        if (fsSync.existsSync(file.storage_path)) {
            await fs.unlink(file.storage_path);
        }

        // Delete from database
        await query('DELETE FROM files WHERE id = ?', [fileId]);

        // Update user storage
        await query(
            'UPDATE users SET storage_used = storage_used - ? WHERE id = ?',
            [file.size, userId]
        );

        // Remove from trash
        await query('DELETE FROM trash WHERE file_id = ?', [fileId]);

        res.json({
            success: true,
            message: 'File permanently deleted'
        });

    } catch (error) {
        console.error('Permanent delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file'
        });
    }
}

// Rename file
async function renameFile(req, res) {
    try {
        const userId = req.user.userId;
        const fileId = req.params.id;
        const { new_name } = req.body;

        if (!new_name) {
            return res.status(400).json({
                success: false,
                message: 'New name is required'
            });
        }

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
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
            [new_name, fileId]
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
        const userId = req.user.userId;
        const fileId = req.params.id;
        const { folder_id } = req.body;

        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
            [fileId, userId]
        );

        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        await query(
            'UPDATE files SET folder_id = ?, updated_at = NOW() WHERE id = ?',
            [folder_id || null, fileId]
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
        const userId = req.user.userId;
        const searchQuery = req.params.query;

        const files = await query(
            `SELECT * FROM files 
            WHERE user_id = ? 
            AND is_deleted = 0 
            AND original_name LIKE ? 
            ORDER BY created_at DESC 
            LIMIT 50`,
            [userId, `%${searchQuery}%`]
        );

        res.json({
            success: true,
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

module.exports = {
    getFiles,
    getFileById,
    uploadFile,
    downloadFile,
    deleteFile,
    restoreFile,
    permanentDelete,
    renameFile,
    moveFile,
    searchFiles
};