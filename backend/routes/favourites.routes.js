/* ============================================
   FAVORITE ROUTES
   ============================================ */

const express = require('express');
const router = express.Router();
const favoriteController = require('../controllers/favoriteController');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Get all favorites for user
router.get('/', favoriteController.getFavorites);

// Get favorite count/statistics
router.get('/count', favoriteController.getFavoriteCount);

// Check if item is favorited
router.get('/check', favoriteController.checkFavorite);

// Add item to favorites
router.post('/add', favoriteController.addFavorite);

// Remove item from favorites
router.post('/remove', favoriteController.removeFavorite);

// Toggle favorite (smart add/remove)
router.post('/toggle', favoriteController.toggleFavorite);

module.exports = router;
