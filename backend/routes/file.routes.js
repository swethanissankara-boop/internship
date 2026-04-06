/* ============================================
   FILE ROUTES - UPDATED WITH TRASH SUPPORT
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

// Get recent files
router.get('/recent', fileController.getRecentFiles);

// Search files
router.get('/search/:query', fileController.searchFiles);

// 🗑️ TRASH ROUTES
router.get('/trash/items', fileController.getTrashItems);           // Get all trash items
router.post('/trash/empty', fileController.emptyTrash);             // Empty entire trash
router.post('/trash/:trashId/restore', fileController.restoreFile); // Restore from trash
router.delete('/trash/:trashId/permanent', fileController.permanentDelete); // Permanent delete

// Get single file info
router.get('/:id', fileController.getFileById);

// Upload file
router.post('/upload', uploadMiddleware, fileController.uploadFile);

// Download file
router.get('/:id/download', fileController.downloadFile);

// Delete file (move to trash)
router.delete('/:id', fileController.deleteFile);

// Rename file
router.put('/:id/rename', fileController.renameFile);

// Move file
router.put('/:id/move', fileController.moveFile);

module.exports = router;
