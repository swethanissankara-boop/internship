/* ============================================
   SHARE ROUTES
   ============================================ */

const express = require('express');
const router = express.Router();
const shareController = require('../controllers/shareController');
const { authenticateToken } = require('../middleware/auth');

// ============================================
// PUBLIC ROUTES (No authentication)
// ============================================

// Get share info by token (public)
router.get('/public/:token', shareController.getShareInfo);

// Download shared file (public)
router.get('/public/:token/download', shareController.downloadSharedFile);

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// Create public share link
router.post('/link', authenticateToken, shareController.createShareLink);

// Share with specific user
router.post('/user', authenticateToken, shareController.shareWithUser);

// Get my shares (files I shared)
router.get('/my-shares', authenticateToken, shareController.getMyShares);

// Get files shared with me
router.get('/shared-with-me', authenticateToken, shareController.getSharedWithMe);

// Revoke share
router.delete('/:id', authenticateToken, shareController.revokeShare);

module.exports = router;
