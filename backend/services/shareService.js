/* ============================================
   SHARE SERVICE
   Handles share link generation and management
   ============================================ */

const crypto = require('crypto');

// Generate unique share token
function generateShareToken(length = 16) {
    return crypto.randomBytes(length).toString('hex');
}

// Generate short share code (for QR codes)
function generateShortCode(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return result;
}

// Check if share link is valid
function isShareLinkValid(share) {
    // Check if expired
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return { valid: false, reason: 'expired' };
    }
    
    // Check if download limit reached
    if (share.max_downloads && share.download_count >= share.max_downloads) {
        return { valid: false, reason: 'limit_reached' };
    }
    
    // Check if active
    if (!share.is_active) {
        return { valid: false, reason: 'deactivated' };
    }
    
    return { valid: true };
}

module.exports = {
    generateShareToken,
    generateShortCode,
    isShareLinkValid
};