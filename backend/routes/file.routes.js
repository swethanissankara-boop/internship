const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const fileController = require('../controllers/fileController');
const { authenticateToken } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { queryOne } = require('../config/db');

router.get('/:id/preview', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.query.token;
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        let userId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.id || decoded.userId;
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        const fileId = req.params.id;
        const file = await queryOne(
            'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0',
            [fileId, userId]
        );
        if (!file) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        const storageBase = path.join(__dirname, '../../storage/node1');
        const filePath = path.join(storageBase, file.storage_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on disk' });
        }
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const mimeType = file.mime_type || 'application/octet-stream';
        const range = req.headers.range;
        if (range && (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': mimeType,
            });
            fileStream.pipe(res);
        } else {
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Length', fileSize);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.original_name)}"`);
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        }
    } catch (error) {
        console.error('Preview file error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Preview failed' });
        }
    }
});

router.use(authenticateToken);

router.get('/check-exists', fileController.checkFileExists);
router.post('/check-exists-batch', fileController.checkFilesExist);
router.get('/recent', fileController.getRecentFiles);
router.get('/search/:query', fileController.searchFiles);
router.get('/trash/items', fileController.getTrashItems);
router.post('/trash/empty', fileController.emptyTrash);
router.post('/trash/:trashId/restore', fileController.restoreFile);
router.delete('/trash/:trashId/permanent', fileController.permanentDelete);
router.post('/upload', upload.single('file'), fileController.uploadFile);
router.get('/:id/download', fileController.downloadFile);
router.get('/:id/content', fileController.getFileContent);
router.get('/', fileController.getFiles);
router.get('/:id', fileController.getFileById);
router.delete('/:id', fileController.deleteFile);
router.put('/:id/rename', fileController.renameFile);
router.put('/:id/move', fileController.moveFile);

module.exports = router;
