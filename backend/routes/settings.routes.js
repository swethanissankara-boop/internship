/* ============================================
   SETTINGS ROUTES (SIMPLIFIED)
   Profile, Security, Storage, Activity Only
   ============================================ */

const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// All routes require authentication
router.use(authenticateToken);

// ============================================
// PROFILE PICTURE UPLOAD CONFIGURATION
// ============================================

// Ensure profile pictures directory exists
const profilePicturesDir = path.join(__dirname, '../../storage/profile-pictures');
if (!fs.existsSync(profilePicturesDir)) {
    fs.mkdirSync(profilePicturesDir, { recursive: true });
    console.log('📁 Created profile-pictures directory');
}

// Multer configuration for profile pictures
const profilePictureStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, profilePicturesDir);
    },
    filename: function (req, file, cb) {
        const userId = req.user.id || req.user.userId;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `user-${userId}-${uniqueSuffix}${ext}`);
    }
});

const profilePictureUpload = multer({
    storage: profilePictureStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
        }
    }
});

// ============================================
// MAIN ROUTES
// ============================================

// Get all user settings
router.get('/', settingsController.getUserSettings);

// ============================================
// PROFILE ROUTES
// ============================================

// Update user profile
router.put('/profile', settingsController.updateProfile);

// Upload profile picture
router.post('/profile-picture', profilePictureUpload.single('profile_picture'), settingsController.uploadProfilePicture);

// Delete profile picture
router.delete('/profile-picture', settingsController.deleteProfilePicture);

// ============================================
// SECURITY ROUTES
// ============================================

// Update password
router.put('/password', settingsController.updatePassword);

// ============================================
// STORAGE ROUTES
// ============================================

// Get storage statistics
router.get('/storage/stats', settingsController.getStorageStats);

// Update storage preferences
router.put('/preferences', settingsController.updatePreferences);

// ============================================
// ACTIVITY ROUTES
// ============================================

// Get activity log
router.get('/activity', settingsController.getActivityLog);

// Clear activity log
router.delete('/activity/clear', settingsController.clearActivityLog);

// ============================================
// EXPORT ROUTE
// ============================================

// Export user data
router.get('/export', settingsController.exportSettings);

// ============================================
// ERROR HANDLER FOR MULTER
// ============================================

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 5MB.'
            });
        }
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    
    next();
});

module.exports = router;
