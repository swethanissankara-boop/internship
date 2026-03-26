/* ============================================
   FOLDER ROUTES
   ============================================ */

const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folderController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Get all folders
router.get('/', folderController.getFolders);

// Get single folder
router.get('/:id', folderController.getFolderById);

// Create folder
router.post('/', folderController.createFolder);

// Rename folder
router.put('/:id/rename', folderController.renameFolder);

// Delete folder
router.delete('/:id', folderController.deleteFolder);

module.exports = router;