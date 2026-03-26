/* ============================================
   SHARE ROUTES
   ============================================ */

const express = require('express');
const router = express.Router();
const shareController = require('../controllers/shareController');
const { authenticateToken } = require('../middleware/auth');

// Create share link (requires auth)
router.post('/link', authenticateToken, shareController.createShareLink);

// Get share info by token (public - no auth)
router.get('/link/:token', shareController.getShareInfo);

// Download shared file (public)
router.get('/link/:token/download', shareController.downloadSharedFile);

// Share with user (requires auth)
router.post('/user', authenticateToken, shareController.shareWithUser);

// Get files shared with me
router.get('/shared-with-me', authenticateToken, shareController.getSharedWithMe);

// Get files I shared
router.get('/my-shares', authenticateToken, shareController.getMyShares);

// Revoke share
router.delete('/:id', authenticateToken, shareController.revokeShare);

module.exports = router;