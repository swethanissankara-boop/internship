/* ============================================
   TRASH SERVICE
   ============================================ */

const { query, queryOne } = require('../config/db');

/**
 * Move file to trash (soft delete)
 */
async function moveFileToTrash(fileId, userId) {
    try {
        // Get file details
        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ?',
            [fileId, userId]
        );

        if (!file) {
            throw new Error('File not found');
        }

        // Mark as deleted in files table
        await query(
            'UPDATE files SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ? WHERE id = ?',
            [userId, fileId]
        );

        // Create trash record
        await query(
            `INSERT INTO trash_items (file_id, user_id, item_type, original_name, original_folder_id, size, deleted_at)
            VALUES (?, ?, 'file', ?, ?, ?, NOW())`,
            [fileId, userId, file.original_name, file.folder_id, file.size]
        );

        console.log(`🗑️ Moved to trash: ${file.original_name}`);

        return {
            success: true,
            file: file
        };

    } catch (error) {
        console.error('Move to trash error:', error);
        throw error;
    }
}

/**
 * Move folder to trash (soft delete)
 */
async function moveFolderToTrash(folderId, userId) {
    try {
        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );

        if (!folder) {
            throw new Error('Folder not found');
        }

        // Mark folder as deleted
        await query(
            'UPDATE folders SET is_deleted = TRUE, deleted_at = NOW() WHERE id = ?',
            [folderId]
        );

        // Mark all files in folder as deleted
        await query(
            'UPDATE files SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = ? WHERE folder_id = ? AND user_id = ?',
            [userId, folderId, userId]
        );

        // Create trash record
        await query(
            `INSERT INTO trash_items (folder_id, user_id, item_type, original_name, original_folder_id, deleted_at)
            VALUES (?, ?, 'folder', ?, ?, NOW())`,
            [folderId, userId, folder.name, folder.parent_id]
        );

        console.log(`🗑️ Moved folder to trash: ${folder.name}`);

        return {
            success: true,
            folder: folder
        };

    } catch (error) {
        console.error('Move folder to trash error:', error);
        throw error;
    }
}

/**
 * Restore file from trash
 */
async function restoreFile(fileId, userId) {
    try {
        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = TRUE',
            [fileId, userId]
        );

        if (!file) {
            throw new Error('File not found in trash');
        }

        // Restore file
        await query(
            'UPDATE files SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL WHERE id = ?',
            [fileId]
        );

        // Remove from trash_items
        await query(
            'DELETE FROM trash_items WHERE file_id = ? AND user_id = ?',
            [fileId, userId]
        );

        console.log(`♻️ Restored file: ${file.original_name}`);

        return {
            success: true,
            file: file
        };

    } catch (error) {
        console.error('Restore file error:', error);
        throw error;
    }
}

/**
 * Restore folder from trash
 */
async function restoreFolder(folderId, userId) {
    try {
        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = TRUE',
            [folderId, userId]
        );

        if (!folder) {
            throw new Error('Folder not found in trash');
        }

        // Restore folder
        await query(
            'UPDATE folders SET is_deleted = FALSE, deleted_at = NULL WHERE id = ?',
            [folderId]
        );

        // Restore all files in folder
        await query(
            'UPDATE files SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL WHERE folder_id = ? AND user_id = ?',
            [folderId, userId]
        );

        // Remove from trash_items
        await query(
            'DELETE FROM trash_items WHERE folder_id = ? AND user_id = ?',
            [folderId, userId]
        );

        console.log(`♻️ Restored folder: ${folder.name}`);

        return {
            success: true,
            folder: folder
        };

    } catch (error) {
        console.error('Restore folder error:', error);
        throw error;
    }
}

/**
 * Permanently delete file
 */
async function permanentlyDeleteFile(fileId, userId) {
    const fs = require('fs').promises;

    try {
        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = TRUE',
            [fileId, userId]
        );

        if (!file) {
            throw new Error('File not found in trash');
        }

        // Delete physical file
        try {
            await fs.unlink(file.storage_path);
            console.log('✅ Physical file deleted');
        } catch (err) {
            console.warn('⚠️ Physical file already deleted');
        }

        // Delete from database
        await query('DELETE FROM files WHERE id = ?', [fileId]);

        // Delete from trash_items
        await query('DELETE FROM trash_items WHERE file_id = ? AND user_id = ?', [fileId, userId]);

        // Update user storage
        await query(
            'UPDATE users SET storage_used = GREATEST(storage_used - ?, 0) WHERE id = ?',
            [file.size, userId]
        );

        console.log(`🔥 Permanently deleted: ${file.original_name}`);

        return {
            success: true,
            file: file,
            freed_space: file.size
        };

    } catch (error) {
        console.error('Permanent delete error:', error);
        throw error;
    }
}

/**
 * Permanently delete folder
 */
async function permanentlyDeleteFolder(folderId, userId) {
    const fs = require('fs').promises;

    try {
        const folder = await queryOne(
            'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = TRUE',
            [folderId, userId]
        );

        if (!folder) {
            throw new Error('Folder not found in trash');
        }

        // Get all files in folder
        const files = await query(
            'SELECT * FROM files WHERE folder_id = ? AND user_id = ?',
            [folderId, userId]
        );

        let freedSpace = 0;

        // Delete physical files
        for (const file of files) {
            try {
                await fs.unlink(file.storage_path);
                freedSpace += file.size;
            } catch (err) {
                console.warn(`⚠️ Could not delete: ${file.storage_path}`);
            }
        }

        // Delete files from database
        await query('DELETE FROM files WHERE folder_id = ?', [folderId]);

        // Delete folder
        await query('DELETE FROM folders WHERE id = ?', [folderId]);

        // Delete from trash_items
        await query('DELETE FROM trash_items WHERE folder_id = ? AND user_id = ?', [folderId, userId]);

        // Update user storage
        if (freedSpace > 0) {
            await query(
                'UPDATE users SET storage_used = GREATEST(storage_used - ?, 0) WHERE id = ?',
                [freedSpace, userId]
            );
        }

        console.log(`🔥 Permanently deleted folder: ${folder.name}`);

        return {
            success: true,
            folder: folder,
            freed_space: freedSpace
        };

    } catch (error) {
        console.error('Permanent folder delete error:', error);
        throw error;
    }
}

/**
 * Get trash items for user
 */
async function getTrashItems(userId) {
    try {
        const items = await query(
            `SELECT 
                ti.*,
                CASE 
                    WHEN ti.item_type = 'file' THEN f.mime_type
                    ELSE NULL
                END as mime_type,
                CASE 
                    WHEN ti.item_type = 'file' THEN f.storage_path
                    ELSE NULL
                END as storage_path
            FROM trash_items ti
            LEFT JOIN files f ON ti.file_id = f.id AND ti.item_type = 'file'
            WHERE ti.user_id = ?
            ORDER BY ti.deleted_at DESC`,
            [userId]
        );

        return items;

    } catch (error) {
        console.error('Get trash items error:', error);
        throw error;
    }
}

/**
 * Empty trash (delete all)
 */
async function emptyTrash(userId) {
    try {
        const items = await getTrashItems(userId);

        let deletedCount = 0;
        let freedSpace = 0;

        for (const item of items) {
            if (item.item_type === 'file') {
                const result = await permanentlyDeleteFile(item.file_id, userId);
                freedSpace += result.freed_space;
                deletedCount++;
            } else if (item.item_type === 'folder') {
                const result = await permanentlyDeleteFolder(item.folder_id, userId);
                freedSpace += result.freed_space;
                deletedCount++;
            }
        }

        console.log(`🧹 Emptied trash: ${deletedCount} items, freed ${freedSpace} bytes`);

        return {
            success: true,
            deleted_count: deletedCount,
            freed_space: freedSpace
        };

    } catch (error) {
        console.error('Empty trash error:', error);
        throw error;
    }
}

module.exports = {
    moveFileToTrash,
    moveFolderToTrash,
    restoreFile,
    restoreFolder,
    permanentlyDeleteFile,
    permanentlyDeleteFolder,
    getTrashItems,
    emptyTrash
};
