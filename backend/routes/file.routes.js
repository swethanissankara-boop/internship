/* ============================================
   FILE ROUTES
   ============================================ */

const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const { authenticateToken } = require('../middleware/auth');
const { uploadMiddleware } = require('../middleware/upload');

// All routes require authentication
router.use(authenticateToken);

// Get all files (with optional folder filter)
router.get('/', fileController.getFiles);

// Get single file info
router.get('/:id', fileController.getFileById);

// Upload file
router.post('/upload', uploadMiddleware, fileController.uploadFile);

// Download file
router.get('/:id/download', fileController.downloadFile);

// Delete file (move to trash)
router.delete('/:id', fileController.deleteFile);

// Restore file from trash
router.post('/:id/restore', fileController.restoreFile);

// Permanently delete file
router.delete('/:id/permanent', fileController.permanentDelete);

// Rename file
router.put('/:id/rename', fileController.renameFile);

// Move file
router.put('/:id/move', fileController.moveFile);

// Search files
router.get('/search/:query', fileController.searchFiles);

module.exports = router;