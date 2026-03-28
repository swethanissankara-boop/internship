/* ============================================
   STORAGE QUOTA MIDDLEWARE
   ============================================ */

const { query } = require('../config/db');

// Check if user has enough storage space
async function checkStorageQuota(req, res, next) {
    try {
        const userId = req.user.userId;
        
        // Get user's storage info
        const user = await query(
            'SELECT storage_quota, storage_used FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user || user.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const { storage_quota, storage_used } = user[0];
        
        // Get file size (if file is being uploaded)
        const fileSize = req.file ? req.file.size : 0;
        
        // Check if user has enough space
        const availableSpace = storage_quota - storage_used;
        
        if (fileSize > availableSpace) {
            return res.status(400).json({
                success: false,
                message: 'Not enough storage space',
                required: fileSize,
                available: availableSpace,
                quota: storage_quota,
                used: storage_used
            });
        }
        
        // Attach storage info to request
        req.storageInfo = {
            quota: storage_quota,
            used: storage_used,
            available: availableSpace
        };
        
        next();
    } catch (error) {
        console.error('Quota check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking storage quota'
        });
    }
}

module.exports = {
    checkStorageQuota
};
