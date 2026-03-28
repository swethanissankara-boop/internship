/* ============================================
   AUTH ROUTES
   ============================================ */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// Register new user
router.post('/register', authController.register);

// Login user
router.post('/login', authController.login);

// Logout user
router.post('/logout', authController.logout);

// Get current user info (protected route)
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;
