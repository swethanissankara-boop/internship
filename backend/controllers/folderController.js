/* ============================================
   FOLDER CONTROLLER - UPDATED WITH STORAGE FIX
   ============================================ */

const archiver = require('archiver');
const { query, queryOne } = require('../config/db');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// Get all folders for user
async function getFolders(req, res) {
    try {
        console.log('🔍 req.user:', req.user);
        
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required - user not found'
            });
        }
        
        const userId = req.user.id;
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
        const userId = req.user.id;
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

// Create folder
async function createFolder(req, res) {
    try {
        console.log('🔍 Create folder - req.user:', req.user);
        
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        const userId = req.user.id;
        const { name, parent_id, color } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Folder name is required'
            });
        }

        // Check if folder with same name exists in same parent
        const existing = await queryOne(
            'SELECT id FROM folders WHERE name = ? AND parent_id <=> ? AND user_id = ? AND is_deleted = 0',
            [name.trim(), parent_id || null, userId]
        );

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Folder with this name already exists'
            });
        }

        // Build folder path
        let folderPath = '/';
        if (parent_id) {
            const parentFolder = await queryOne(
                'SELECT path FROM folders WHERE id = ? AND user_id = ?',
                [parent_id, userId]
            );
            if (parentFolder) {
                folderPath = parentFolder.path + '/' + name.trim();
            }
        } else {
            folderPath = '/' + name.trim();
        }

        const result = await query(
            'INSERT INTO folders (name, parent_id, user_id, path, color, is_deleted) VALUES (?, ?, ?, ?, ?, 0)',
            [name.trim(), parent_id || null, userId, folderPath, color || null]
        );

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, ip_address)
             VALUES (?, 'create_folder', 'folder', ?, ?, ?)`,
            [userId, result.insertId, name.trim(), req.ip]
        );

        res.status(201).json({
            success: true,
            message: 'Folder created successfully',
            folder: {
                id: result.insertId,
                name: name.trim(),
                parent_id: parent_id || null,
                path: folderPath,
                color: color || null
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
        const userId = req.user.id;
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

        // Check for duplicate name in same location
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

        // Update folder path
        const oldPath = folder.path;
        const newPath = oldPath.replace(new RegExp(folder.name + '$'), new_name.trim());

        await query(
            'UPDATE folders SET name = ?, path = ?, updated_at = NOW() WHERE id = ?',
            [new_name.trim(), newPath, folderId]
        );

        // Update paths of all subfolders
        await query(
            'UPDATE folders SET path = REPLACE(path, ?, ?) WHERE path LIKE ? AND user_id = ?',
            [oldPath, newPath, oldPath + '/%', userId]
        );

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
             VALUES (?, 'rename', 'folder', ?, ?, ?)`,
            [userId, folderId, new_name.trim(), JSON.stringify({ old_name: folder.name })]
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

// Delete folder (move to trash) - ✅ STORAGE UPDATED BY STORED PROCEDURE
async function deleteFolder(req, res) {
    try {
        const userId = req.user.id;
        const folderId = req.params.id;

        console.log('🗑️ Moving folder to trash:', folderId);

        // Check if folder exists
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

        // Get user's trash settings
        const settings = await queryOne(
            'SELECT auto_delete_trash_days FROM user_settings WHERE user_id = ?',
            [userId]
        ) || { auto_delete_trash_days: 30 };

        // ✅ Use stored procedure (handles storage update automatically)
        const [result] = await query(
            'CALL MoveToTrash(?, ?, ?, ?)',
            ['folder', folderId, userId, settings.auto_delete_trash_days]
        );

        // Get updated storage info
        const user = await queryOne(
            'SELECT storage_used, storage_quota FROM users WHERE id = ?',
            [userId]
        );

        const freedSpace = result && result[0] ? result[0].freed_space : 0;
        const filesDeleted = result && result[0] ? result[0].files_deleted : 0;

        console.log(`🗑️ Folder "${folder.name}" moved to trash`);
        console.log(`💾 Storage freed: ${freedSpace} bytes (${filesDeleted} files)`);
        console.log(`💾 Current storage: ${user.storage_used} bytes`);

        res.json({
            success: true,
            message: `Folder moved to trash. Will be permanently deleted in ${settings.auto_delete_trash_days} days.`,
            auto_delete_days: settings.auto_delete_trash_days,
            freed_space: freedSpace,
            files_deleted: filesDeleted,
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

// Restore folder from trash - ✅ STORAGE UPDATED BY STORED PROCEDURE
async function restoreFolder(req, res) {
    try {
        const userId = req.user.id;
        const trashId = req.params.trashId;

        console.log('♻️ Restoring folder from trash:', trashId);

        // ✅ Use stored procedure (handles storage update automatically)
        const [result] = await query('CALL RestoreFromTrash(?, ?)', [trashId, userId]);

        if (result && result[0] && result[0].status === 'Success') {
            // Get updated storage info
            const user = await queryOne(
                'SELECT storage_used, storage_quota FROM users WHERE id = ?',
                [userId]
            );

            console.log(`♻️ Folder restored, storage added back: ${result[0].restored_space || 0} bytes`);
            console.log(`💾 Current storage: ${user.storage_used} bytes`);

            res.json({
                success: true,
                message: 'Folder restored successfully',
                restored_space: result[0].restored_space || 0,
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

// Permanently delete folder - ✅ NO STORAGE UPDATE (already freed)
async function permanentDeleteFolder(req, res) {
    try {
        const userId = req.user.id;
        const trashId = req.params.trashId;

        console.log('🔥 Permanently deleting folder from trash:', trashId);

        // Get trash item details first
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

        // Get all files in folder and subfolders
        const allFolderIds = await getAllSubfolderIds(trashItem.folder_id, userId);
        allFolderIds.push(trashItem.folder_id);

        const filesInFolders = await query(
            `SELECT storage_path FROM files WHERE folder_id IN (${allFolderIds.map(() => '?').join(',')})`,
            allFolderIds
        );

        // Delete physical files
        const { STORAGE_PATHS } = require('../config/storage');
        for (const file of filesInFolders) {
            try {
                const fullPath = path.join(STORAGE_PATHS.node1, file.storage_path);
                if (fsSync.existsSync(fullPath)) {
                    await fs.unlink(fullPath);
                    console.log('🗑️ Physical file deleted:', fullPath);
                }
            } catch (fileError) {
                console.error('Error deleting physical file:', fileError);
            }
        }

        // ✅ Use stored procedure (NO storage update - already freed when moved to trash)
        const [result] = await query('CALL PermanentDelete(?, ?)', [trashId, userId]);

        if (result && result[0] && result[0].status === 'Success') {
            console.log('🔥 Folder permanently deleted (storage already freed)');

            res.json({
                success: true,
                message: 'Folder permanently deleted',
                freed_space: result[0].freed_space,
                deleted_files: filesInFolders.length
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

// Helper: Get all subfolder IDs recursively
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
        const userId = req.user.id;
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

        // Prevent moving folder into itself or its subfolder
        if (parent_id) {
            const allSubfolderIds = await getAllSubfolderIds(folderId, userId);
            if (allSubfolderIds.includes(parseInt(parent_id)) || parseInt(parent_id) === folderId) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot move folder into itself or its subfolder'
                });
            }

            // Check if target parent exists
            const parentFolder = await queryOne(
                'SELECT * FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0',
                [parent_id, userId]
            );

            if (!parentFolder) {
                return res.status(404).json({
                    success: false,
                    message: 'Target folder not found'
                });
            }
        }

        // Update folder path
        let newPath;
        if (parent_id) {
            const parentFolder = await queryOne(
                'SELECT path FROM folders WHERE id = ?',
                [parent_id]
            );
            newPath = parentFolder.path + '/' + folder.name;
        } else {
            newPath = '/' + folder.name;
        }

        const oldPath = folder.path;

        await query(
            'UPDATE folders SET parent_id = ?, path = ?, updated_at = NOW() WHERE id = ?',
            [parent_id || null, newPath, folderId]
        );

        // Update paths of all subfolders
        await query(
            'UPDATE folders SET path = REPLACE(path, ?, ?) WHERE path LIKE ? AND user_id = ?',
            [oldPath, newPath, oldPath + '/%', userId]
        );

        // Log activity
        await query(
            `INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
             VALUES (?, 'move', 'folder', ?, ?, ?)`,
            [userId, folderId, folder.name, JSON.stringify({ old_parent: folder.parent_id, new_parent: parent_id })]
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
        const userId = req.user.id;
        const folderId = req.params.id;

        // Verify folder exists and belongs to user
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

        // Get subfolders
        const subfolders = await query(
            `SELECT 
                f.id, f.name, f.parent_id, f.path, f.color, f.created_at, f.updated_at,
                (SELECT COUNT(*) FROM files WHERE folder_id = f.id AND is_deleted = 0) as file_count,
                (SELECT COUNT(*) FROM folders sub WHERE sub.parent_id = f.id AND is_deleted = 0) as subfolder_count,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.folder_id = f.id AND fav.user_id = ?) as is_favorite
            FROM folders f
            WHERE f.parent_id = ? AND f.user_id = ? AND f.is_deleted = 0
            ORDER BY f.name ASC`,
            [userId, folderId, userId]
        );

        // Get files
        const files = await query(
            `SELECT 
                f.id, f.filename, f.original_name, f.mime_type, f.size, 
                f.created_at, f.updated_at, f.download_count,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
            FROM files f
            WHERE f.folder_id = ? AND f.user_id = ? AND f.is_deleted = 0
            ORDER BY f.original_name ASC`,
            [userId, folderId, userId]
        );

        res.json({
            success: true,
            folder: folder,
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

// Get folder breadcrumb (path navigation)
async function getFolderBreadcrumb(req, res) {
    try {
        const userId = req.user.id;
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
            return res.status(404).json({
                success: false,
                message: 'Folder not found'
            });
        }

        const breadcrumb = [{ id: null, name: 'My Files', path: '/' }];
        
        // Parse path to build breadcrumb
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
                    breadcrumb.push({
                        id: pathFolder.id,
                        name: pathFolder.name,
                        path: currentPath
                    });
                }
            }
        }

        res.json({
            success: true,
            breadcrumb: breadcrumb
        });

    } catch (error) {
        console.error('Get breadcrumb error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get folder breadcrumb'
        });
    }
}

// Download folder as ZIP
async function downloadFolder(req, res) {
    const folderId = req.params.id;
    const userId = req.user.id;

    try {
        console.log(`📦 Downloading folder ${folderId} as ZIP for user ${userId}`);

        // Verify folder exists and belongs to user
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

        const folderName = folder.name.replace(/[^a-z0-9_-]/gi, '_');

        // Set response headers
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

        // Create ZIP archive
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // Handle archive errors
        archive.on('error', (err) => {
            console.error('❌ Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ 
                    success: false, 
                    message: 'Failed to create ZIP file',
                    error: err.message 
                });
            }
        });

        // Track progress
        archive.on('progress', (progress) => {
            console.log(`📦 Archiving: ${progress.entries.processed} files processed`);
        });

        // Pipe archive data to response
        archive.pipe(res);

        // Add folder contents to archive recursively
        const filesAdded = await addFolderToArchive(archive, folderId, userId, '');

        // Finalize the archive
        await archive.finalize();

        console.log(`✅ Folder "${folderName}" downloaded as ZIP (${filesAdded} files)`);

    } catch (error) {
        console.error('❌ Download folder error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                success: false, 
                message: 'Server error during folder download',
                error: error.message 
            });
        }
    }
}

// Helper: Add folder to archive recursively
async function addFolderToArchive(archive, folderId, userId, basePath) {
    let filesAdded = 0;
    const { STORAGE_PATHS } = require('../config/storage');

    try {
        // Get all files in this folder
        const files = await query(
            'SELECT * FROM files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        // Add each file to archive
        for (const file of files) {
            try {
                // Try all storage nodes
                const storagePaths = [
                    STORAGE_PATHS.node1,
                    STORAGE_PATHS.node2,
                    STORAGE_PATHS.node3
                ];

                let fileFound = false;
                let filePath = null;

                for (const storagePath of storagePaths) {
                    filePath = path.join(storagePath, file.storage_path);
                    
                    if (fsSync.existsSync(filePath)) {
                        fileFound = true;
                        break;
                    }
                }

                if (fileFound && filePath) {
                    const fileName = file.original_name || file.filename;
                    const archivePath = basePath ? path.join(basePath, fileName) : fileName;
                    
                    // Add file to archive
                    archive.file(filePath, { name: archivePath });
                    filesAdded++;
                    
                    console.log(`📄 Added to ZIP: ${archivePath}`);
                } else {
                    console.warn(`⚠️ File not found in storage: ${file.original_name}`);
                }

            } catch (fileError) {
                console.error(`❌ Error adding file ${file.original_name}:`, fileError);
            }
        }

        // Get all subfolders
        const subfolders = await query(
            'SELECT * FROM folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0',
            [folderId, userId]
        );

        // Recursively add subfolders
        for (const subfolder of subfolders) {
            const subfolderPath = basePath 
                ? path.join(basePath, subfolder.name) 
                : subfolder.name;
            
            console.log(`📁 Processing subfolder: ${subfolderPath}`);
            
            const subFilesAdded = await addFolderToArchive(
                archive, 
                subfolder.id, 
                userId, 
                subfolderPath
            );
            
            filesAdded += subFilesAdded;
        }

        return filesAdded;

    } catch (error) {
        console.error('❌ Error in addFolderToArchive:', error);
        throw error;
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
    downloadFolder
};
