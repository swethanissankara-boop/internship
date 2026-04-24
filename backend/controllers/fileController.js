const { query, queryOne } = require('../config/db');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec } = require('child_process');

function removeZoneIdentifier(filePath) {
    if (process.platform !== 'win32') return;
    const command = `powershell -Command "Unblock-File -Path '${filePath}'"`;
    exec(command, (error) => {
        if (error) console.warn('Could not remove Zone.Identifier:', error.message);
        else console.log('Zone.Identifier removed from:', filePath);
    });
}

async function getUserStoragePath(userId) {
    const user = await queryOne('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!user) return `user_${userId}`;
    const cleanUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `user_${userId}_${cleanUsername}`;
}

async function getFolderPath(folderId) {
    if (!folderId) return '';
    let pathParts = [];
    let currentId = folderId;
    let maxDepth = 20;
    while (currentId && maxDepth > 0) {
        const folder = await queryOne('SELECT id, name, parent_id FROM folders WHERE id = ?', [currentId]);
        if (!folder) break;
        pathParts.unshift(folder.name);
        currentId = folder.parent_id;
        maxDepth--;
    }
    return pathParts.join('/');
}

function ensureDirectoryExists(dirPath) {
    if (!fsSync.existsSync(dirPath)) {
        fsSync.mkdirSync(dirPath, { recursive: true });
        console.log('Created directory:', dirPath);
    }
}

async function getFiles(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.query.folder_id || null;
        let sql = `
            SELECT f.id, f.filename, f.original_name, f.mime_type, f.size,
                f.folder_id, f.created_at, f.updated_at, f.download_count,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
            FROM files f WHERE f.user_id = ? AND f.is_deleted = 0
        `;
        const params = [userId, userId];
        if (folderId) { sql += ' AND f.folder_id = ?'; params.push(folderId); }
        else { sql += ' AND f.folder_id IS NULL'; }
        sql += ' ORDER BY f.created_at DESC';
        const files = await query(sql, params);
        res.json({ success: true, files });
    } catch (error) {
        console.error('Get files error:', error);
        res.status(500).json({ success: false, message: 'Failed to get files' });
    }
}

async function getFileById(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const file = await queryOne(
            `SELECT f.*, EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
             FROM files f WHERE f.id = ? AND f.user_id = ?`,
            [userId, fileId, userId]
        );
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        res.json({ success: true, file });
    } catch (error) {
        console.error('Get file error:', error);
        res.status(500).json({ success: false, message: 'Failed to get file' });
    }
}

async function checkFileExists(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { filename, folder_id } = req.query;
        if (!filename) return res.status(400).json({ success: false, message: 'Filename is required' });
        let sql = `SELECT id, original_name, size, created_at FROM files WHERE user_id = ? AND original_name = ? AND is_deleted = 0`;
        const params = [userId, filename];
        if (folder_id && folder_id !== 'null') { sql += ' AND folder_id = ?'; params.push(folder_id); }
        else { sql += ' AND folder_id IS NULL'; }
        const existingFile = await queryOne(sql, params);
        res.json({ success: true, exists: !!existingFile, existing_file: existingFile || null });
    } catch (error) {
        console.error('Check file exists error:', error);
        res.status(500).json({ success: false, message: 'Failed to check file' });
    }
}

async function checkFilesExist(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const { files, folder_id } = req.body;
        if (!files || !Array.isArray(files)) return res.status(400).json({ success: false, message: 'Files array is required' });
        const results = [];
        for (const filename of files) {
            let sql = `SELECT id, original_name, size, created_at FROM files WHERE user_id = ? AND original_name = ? AND is_deleted = 0`;
            const params = [userId, filename];
            if (folder_id && folder_id !== 'null' && folder_id !== null) { sql += ' AND folder_id = ?'; params.push(folder_id); }
            else { sql += ' AND folder_id IS NULL'; }
            const existingFile = await queryOne(sql, params);
            results.push({ filename, exists: !!existingFile, existing_file: existingFile || null });
        }
        const duplicates = results.filter(r => r.exists);
        res.json({ success: true, total: files.length, duplicates_count: duplicates.length, results, duplicates });
    } catch (error) {
        console.error('Check files exist error:', error);
        res.status(500).json({ success: false, message: 'Failed to check files' });
    }
}

async function uploadFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const folderId = req.body.folder_id || null;
        const duplicateAction = req.body.duplicate_action || 'ask';
        console.log('Upload request from user:', userId);
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const file = req.file;
        const absolutePath = file.path;
        const storageBase = path.join(__dirname, '../../storage/node1');
        const userFolderName = await getUserStoragePath(userId);
        const userStorageBase = path.join(storageBase, userFolderName);
        ensureDirectoryExists(userStorageBase);
        const folderPath = await getFolderPath(folderId);
        const targetDir = folderPath ? path.join(userStorageBase, folderPath) : userStorageBase;
        ensureDirectoryExists(targetDir);
        const targetFilePath = path.join(targetDir, file.originalname);
        const relativeStoragePath = folderPath
            ? `${userFolderName}/${folderPath}/${file.originalname}`
            : `${userFolderName}/${file.originalname}`;
        let checkSql = `SELECT id, original_name, size, storage_path FROM files WHERE user_id = ? AND original_name = ? AND is_deleted = 0`;
        const checkParams = [userId, file.originalname];
        if (folderId && folderId !== 'null') { checkSql += ' AND folder_id = ?'; checkParams.push(folderId); }
        else { checkSql += ' AND folder_id IS NULL'; }
        const existingFile = await queryOne(checkSql, checkParams);
        if (existingFile) {
            console.log('Duplicate file detected:', file.originalname);
            if (duplicateAction === 'skip') {
                if (fsSync.existsSync(absolutePath)) await fs.unlink(absolutePath);
                return res.json({ success: true, skipped: true, message: 'File skipped (already exists)', existing_file: existingFile });
            }
            if (duplicateAction === 'replace') {
                const oldFilePath = path.join(storageBase, existingFile.storage_path);
                if (fsSync.existsSync(oldFilePath)) await fs.unlink(oldFilePath);
                try { await fs.rename(absolutePath, targetFilePath); }
                catch (e) { await fs.copyFile(absolutePath, targetFilePath); await fs.unlink(absolutePath); }
                await query('UPDATE users SET storage_used = GREATEST(0, storage_used - ?) WHERE id = ?', [existingFile.size, userId]);
                await query('UPDATE files SET filename = ?, size = ?, mime_type = ?, storage_path = ?, updated_at = NOW() WHERE id = ?',
                    [file.originalname, file.size, file.mimetype, relativeStoragePath, existingFile.id]);
                await query('UPDATE users SET storage_used = storage_used + ? WHERE id = ?', [file.size, userId]);
                removeZoneIdentifier(targetFilePath);
                const user = await queryOne('SELECT storage_used, storage_quota FROM users WHERE id = ?', [userId]);
                return res.json({
                    success: true, replaced: true, message: 'File replaced successfully',
                    file: { id: existingFile.id, filename: file.originalname, original_name: file.originalname, size: file.size, mime_type: file.mimetype, folder_id: folderId },
                    storage: { used: user.storage_used, quota: user.storage_quota }
                });
            }
            if (duplicateAction === 'keep_both') {
                const ext = path.extname(file.originalname);
                const baseName = path.basename(file.originalname, ext);
                const timestamp = Date.now();
                const newName = `${baseName} (${timestamp})${ext}`;
                const newTargetPath = path.join(targetDir, newName);
                const newRelativePath = folderPath ? `${userFolderName}/${folderPath}/${newName}` : `${userFolderName}/${newName}`;
                try { await fs.rename(absolutePath, newTargetPath); }
                catch (e) { await fs.copyFile(absolutePath, newTargetPath); await fs.unlink(absolutePath); }
                const result = await query(
                    'INSERT INTO files (filename, original_name, mime_type, size, folder_id, user_id, storage_path, storage_node) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [newName, newName, file.mimetype, file.size, folderId, userId, newRelativePath, 'node1']
                );
                await query('UPDATE users SET storage_used = storage_used + ? WHERE id = ?', [file.size, userId]);
                removeZoneIdentifier(newTargetPath);
                const user = await queryOne('SELECT storage_used, storage_quota FROM users WHERE id = ?', [userId]);
                return res.status(201).json({
                    success: true, renamed: true, message: 'File uploaded with new name',
                    file: { id: result.insertId, filename: newName, original_name: newName, size: file.size, mime_type: file.mimetype, folder_id: folderId },
                    storage: { used: user.storage_used, quota: user.storage_quota }
                });
            }
        }
        try { await fs.rename(absolutePath, targetFilePath); }
        catch (e) { await fs.copyFile(absolutePath, targetFilePath); await fs.unlink(absolutePath); }
        const result = await query(
            'INSERT INTO files (filename, original_name, mime_type, size, folder_id, user_id, storage_path, storage_node) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [file.originalname, file.originalname, file.mimetype, file.size, folderId, userId, relativeStoragePath, 'node1']
        );
        await query('UPDATE users SET storage_used = storage_used + ? WHERE id = ?', [file.size, userId]);
        await query(
            'INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, 'upload', 'file', result.insertId, file.originalname, JSON.stringify({ size: file.size, mime_type: file.mimetype }), req.ip]
        );
        removeZoneIdentifier(targetFilePath);
        const user = await queryOne('SELECT storage_used, storage_quota FROM users WHERE id = ?', [userId]);
        console.log('File uploaded successfully:', result.insertId, '→', relativeStoragePath);
        res.status(201).json({
            success: true, message: 'File uploaded successfully',
            file: { id: result.insertId, filename: file.originalname, original_name: file.originalname, size: file.size, mime_type: file.mimetype, folder_id: folderId },
            storage: { used: user.storage_used, quota: user.storage_quota }
        });
    } catch (error) {
        console.error('Upload file error:', error);
        res.status(500).json({ success: false, message: 'File upload failed: ' + error.message });
    }
}

async function downloadFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const file = await queryOne('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0', [fileId, userId]);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, file.storage_path);
        if (!fsSync.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found on disk' });
        await query('UPDATE files SET download_count = download_count + 1 WHERE id = ?', [fileId]);
        await query('INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'download', 'file', fileId, file.original_name, req.ip]);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private');
        res.setHeader('X-Download-Options', 'noopen');
        res.setHeader('Content-Security-Policy', "default-src 'none'");
        const fileStream = fsSync.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download file error:', error);
        if (!res.headersSent) res.status(500).json({ success: false, message: 'File download failed' });
    }
}

async function previewFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const file = await queryOne('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0', [fileId, userId]);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, file.storage_path);
        if (!fsSync.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found on disk' });
        const stat = fsSync.statSync(filePath);
        const mimeType = file.mime_type || 'application/octet-stream';
        const range = req.headers.range;
        if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunkSize = (end - start) + 1;
            const fileStream = fsSync.createReadStream(filePath, { start, end });
            res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunkSize, 'Content-Type': mimeType });
            fileStream.pipe(res);
        } else {
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            const fileStream = fsSync.createReadStream(filePath);
            fileStream.pipe(res);
        }
        await query('UPDATE files SET updated_at = NOW() WHERE id = ?', [fileId]);
    } catch (error) {
        console.error('Preview file error:', error);
        if (!res.headersSent) res.status(500).json({ success: false, message: 'File preview failed' });
    }
}

async function getFileContent(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const file = await queryOne('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0', [fileId, userId]);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, file.storage_path);
        if (!fsSync.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found on disk' });
        const textExtensions = ['txt', 'md', 'markdown', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'csv', 'tsv', 'svg'];
        const ext = path.extname(file.original_name).toLowerCase().replace('.', '');
        const mimeType = file.mime_type || '';
        const isTextFile = textExtensions.includes(ext) || mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml' || mimeType === 'application/javascript';
        if (!isTextFile) return res.status(400).json({ success: false, message: 'File content preview not supported for this file type' });
        if (file.size > 5 * 1024 * 1024) return res.status(400).json({ success: false, message: 'File too large for content preview (max 5MB)' });
        const content = await fs.readFile(filePath, 'utf8');
        const languageMap = { 'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript', 'py': 'python', 'rb': 'ruby', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'h': 'c', 'hpp': 'cpp', 'cs': 'csharp', 'php': 'php', 'go': 'go', 'rs': 'rust', 'swift': 'swift', 'kt': 'kotlin', 'scala': 'scala', 'sql': 'sql', 'sh': 'bash', 'bash': 'bash', 'html': 'html', 'htm': 'html', 'css': 'css', 'xml': 'xml', 'svg': 'xml', 'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'md': 'markdown', 'txt': 'plaintext', 'ini': 'ini', 'cfg': 'ini', 'conf': 'ini', 'env': 'plaintext', 'log': 'plaintext', 'csv': 'csv' };
        await query('UPDATE files SET updated_at = NOW() WHERE id = ?', [fileId]);
        res.json({ success: true, file: { id: file.id, name: file.original_name, size: file.size, mime_type: file.mime_type, extension: ext, language: languageMap[ext] || 'plaintext' }, content, line_count: content.split('\n').length, char_count: content.length });
    } catch (error) {
        console.error('Get file content error:', error);
        if (error.code === 'ERR_INVALID_ARG_VALUE' || error.message?.includes('encoding')) {
            return res.status(400).json({ success: false, message: 'File appears to be binary and cannot be displayed as text' });
        }
        res.status(500).json({ success: false, message: 'Failed to get file content' });
    }
}

async function deleteFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const file = await queryOne('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0', [fileId, userId]);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        const settings = await queryOne('SELECT auto_delete_trash_days FROM user_settings WHERE user_id = ?', [userId]) || { auto_delete_trash_days: 30 };
        const [result] = await query('CALL MoveToTrash(?, ?, ?, ?)', ['file', fileId, userId, settings.auto_delete_trash_days]);
        const user = await queryOne('SELECT storage_used, storage_quota FROM users WHERE id = ?', [userId]);
        res.json({
            success: true, message: `File moved to trash.`,
            auto_delete_days: settings.auto_delete_trash_days, freed_space: file.size,
            storage: { used: user.storage_used, quota: user.storage_quota }
        });
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete file' });
    }
}

async function getTrashItems(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const [trashItems] = await query('CALL GetTrashItems(?)', [userId]);
        res.json({ success: true, count: trashItems.length, items: trashItems });
    } catch (error) {
        console.error('Get trash items error:', error);
        res.status(500).json({ success: false, message: 'Failed to get trash items' });
    }
}

async function restoreFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const trashId = req.params.trashId;
        const [result] = await query('CALL RestoreFromTrash(?, ?)', [trashId, userId]);
        if (result && result[0] && result[0].status === 'Success') {
            const user = await queryOne('SELECT storage_used, storage_quota FROM users WHERE id = ?', [userId]);
            res.json({ success: true, message: 'Item restored', restored_space: result[0].restored_space || 0, storage: { used: user.storage_used, quota: user.storage_quota } });
        } else {
            res.status(404).json({ success: false, message: 'Item not found in trash' });
        }
    } catch (error) {
        console.error('Restore file error:', error);
        res.status(500).json({ success: false, message: 'Failed to restore item' });
    }
}

async function permanentDelete(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const trashId = req.params.trashId;
        const trashItem = await queryOne('SELECT * FROM trash WHERE id = ? AND deleted_by = ?', [trashId, userId]);
        if (!trashItem) return res.status(404).json({ success: false, message: 'Item not found in trash' });
        if (trashItem.item_type === 'file' && trashItem.file_id) {
            const file = await queryOne('SELECT storage_path FROM files WHERE id = ?', [trashItem.file_id]);
            if (file) {
                const filePath = path.join(__dirname, '../../storage/node1', file.storage_path);
                if (fsSync.existsSync(filePath)) await fs.unlink(filePath);
            }
        }
        const [result] = await query('CALL PermanentDelete(?, ?)', [trashId, userId]);
        if (result && result[0] && result[0].status === 'Success') {
            res.json({ success: true, message: 'Item permanently deleted', freed_space: result[0].freed_space });
        } else {
            res.status(404).json({ success: false, message: 'Failed to delete item' });
        }
    } catch (error) {
        console.error('Permanent delete error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete item permanently' });
    }
}

async function emptyTrash(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const trashItems = await query('SELECT * FROM trash WHERE deleted_by = ?', [userId]);
        if (trashItems.length === 0) return res.json({ success: true, message: 'Trash is already empty', deleted_count: 0 });
        let deletedCount = 0, totalFreedSpace = 0;
        for (const item of trashItems) {
            try {
                if (item.item_type === 'file' && item.file_id) {
                    const file = await queryOne('SELECT storage_path FROM files WHERE id = ?', [item.file_id]);
                    if (file) {
                        const filePath = path.join(__dirname, '../../storage/node1', file.storage_path);
                        if (fsSync.existsSync(filePath)) await fs.unlink(filePath);
                    }
                }
                const [result] = await query('CALL PermanentDelete(?, ?)', [item.id, userId]);
                if (result && result[0] && result[0].status === 'Success') { deletedCount++; totalFreedSpace += result[0].freed_space || 0; }
            } catch (err) { console.error('Error deleting item:', item.id, err); }
        }
        res.json({ success: true, message: `${deletedCount} items permanently deleted`, deleted_count: deletedCount, freed_space: totalFreedSpace });
    } catch (error) {
        console.error('Empty trash error:', error);
        res.status(500).json({ success: false, message: 'Failed to empty trash' });
    }
}

async function renameFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const { new_name } = req.body;
        if (!new_name || !new_name.trim()) return res.status(400).json({ success: false, message: 'New name is required' });
        const file = await queryOne('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0', [fileId, userId]);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        const storageBase = path.join(__dirname, '../../storage/node1');
        const oldFilePath = path.join(storageBase, file.storage_path);
        const folderDir = path.dirname(file.storage_path);
        const newStoragePath = folderDir === '.' ? new_name.trim() : `${folderDir}/${new_name.trim()}`;
        const newFilePath = path.join(storageBase, newStoragePath);
        if (fsSync.existsSync(oldFilePath)) {
            try { await fs.rename(oldFilePath, newFilePath); }
            catch (e) { await fs.copyFile(oldFilePath, newFilePath); await fs.unlink(oldFilePath); }
        }
        await query('UPDATE files SET original_name = ?, filename = ?, storage_path = ?, updated_at = NOW() WHERE id = ?', [new_name.trim(), new_name.trim(), newStoragePath, fileId]);
        await query('INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'rename', 'file', fileId, new_name.trim(), JSON.stringify({ old_name: file.original_name })]);
        res.json({ success: true, message: 'File renamed successfully' });
    } catch (error) {
        console.error('Rename file error:', error);
        res.status(500).json({ success: false, message: 'Failed to rename file' });
    }
}

async function moveFile(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const fileId = req.params.id;
        const { folder_id } = req.body;
        const file = await queryOne('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0', [fileId, userId]);
        if (!file) return res.status(404).json({ success: false, message: 'File not found' });
        if (folder_id) {
            const folder = await queryOne('SELECT id FROM folders WHERE id = ? AND user_id = ? AND is_deleted = 0', [folder_id, userId]);
            if (!folder) return res.status(404).json({ success: false, message: 'Target folder not found' });
        }
        const storageBase = path.join(__dirname, '../../storage/node1');
        const oldFilePath = path.join(storageBase, file.storage_path);
        const userFolderName = await getUserStoragePath(userId);
        const newFolderPath = await getFolderPath(folder_id);
        const userStorageBase = path.join(storageBase, userFolderName);
        const newTargetDir = newFolderPath ? path.join(userStorageBase, newFolderPath) : userStorageBase;
        ensureDirectoryExists(newTargetDir);
        const fileName = file.original_name || file.filename;
        const newStoragePath = newFolderPath ? `${userFolderName}/${newFolderPath}/${fileName}` : `${userFolderName}/${fileName}`;
        const newFilePath = path.join(storageBase, newStoragePath);
        if (fsSync.existsSync(oldFilePath) && oldFilePath !== newFilePath) {
            try { await fs.rename(oldFilePath, newFilePath); }
            catch (e) { await fs.copyFile(oldFilePath, newFilePath); await fs.unlink(oldFilePath); }
        }
        await query('UPDATE files SET folder_id = ?, storage_path = ?, updated_at = NOW() WHERE id = ?', [folder_id || null, newStoragePath, fileId]);
        await query('INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'move', 'file', fileId, file.original_name, JSON.stringify({ old_folder: file.folder_id, new_folder: folder_id })]);
        res.json({ success: true, message: 'File moved successfully' });
    } catch (error) {
        console.error('Move file error:', error);
        res.status(500).json({ success: false, message: 'Failed to move file' });
    }
}

async function searchFiles(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const searchQuery = req.params.query;
        if (!searchQuery || searchQuery.trim().length < 2) return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
        const files = await query(
            `SELECT f.*, EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
             FROM files f WHERE f.user_id = ? AND f.is_deleted = 0 AND f.original_name LIKE ? ORDER BY f.created_at DESC LIMIT 50`,
            [userId, userId, `%${searchQuery}%`]
        );
        res.json({ success: true, count: files.length, files });
    } catch (error) {
        console.error('Search files error:', error);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
}

async function getRecentFiles(req, res) {
    try {
        const userId = req.user.id || req.user.userId;
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const files = await query(
            `SELECT f.id, f.filename, f.original_name, f.mime_type, f.size, f.folder_id, f.created_at, f.updated_at,
                fo.name as folder_name, 'file' as item_type,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.file_id = f.id AND fav.user_id = ?) as is_favorite
            FROM files f LEFT JOIN folders fo ON f.folder_id = fo.id
            WHERE f.user_id = ? AND f.is_deleted = 0 ORDER BY f.updated_at DESC LIMIT ${limit}`,
            [userId, userId]
        );
        const folders = await query(
            `SELECT id, name, parent_id, created_at, updated_at, 'folder' as item_type,
                EXISTS(SELECT 1 FROM favorites fav WHERE fav.folder_id = id AND fav.user_id = ?) as is_favorite
            FROM folders WHERE user_id = ? AND is_deleted = 0 ORDER BY updated_at DESC LIMIT ${limit}`,
            [userId, userId]
        );
        const combined = [...files, ...folders].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, limit);
        res.json({ success: true, count: combined.length, items: combined });
    } catch (error) {
        console.error('Get recent files error:', error);
        res.status(500).json({ success: false, message: 'Failed to get recent files' });
    }
}

module.exports = {
    getFiles, getFileById, checkFileExists, checkFilesExist, uploadFile, downloadFile,
    previewFile, getFileContent, deleteFile, getTrashItems, restoreFile, permanentDelete,
    emptyTrash, renameFile, moveFile, searchFiles, getRecentFiles
};
