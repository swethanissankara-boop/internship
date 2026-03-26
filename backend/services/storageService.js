/* ============================================
   STORAGE SERVICE
   Handles distributed storage logic
   ============================================ */

const fs = require('fs').promises;
const path = require('path');
const { selectStorageNode, getUserStoragePath } = require('../config/storage');

// Select best storage node for user
function selectBestNode(userId) {
    // For now, use simple round-robin
    // In advanced version, check which node has most free space
    return selectStorageNode(userId);
}

// Get user's total storage usage
async function getUserStorageUsage(userId) {
    const { query } = require('../config/db');
    
    const result = await query(
        'SELECT storage_used FROM users WHERE id = ?',
        [userId]
    );
    
    return result[0] ? result[0].storage_used : 0;
}

// Update user's storage usage
async function updateUserStorageUsage(userId, sizeChange) {
    const { query } = require('../config/db');
    
    await query(
        'UPDATE users SET storage_used = storage_used + ? WHERE id = ?',
        [sizeChange, userId]
    );
}

// Check if user has enough space
async function hasEnoughSpace(userId, requiredSize) {
    const { query } = require('../config/db');
    
    const user = await query(
        'SELECT storage_quota, storage_used FROM users WHERE id = ?',
        [userId]
    );
    
    if (!user || user.length === 0) {
        return false;
    }
    
    const { storage_quota, storage_used } = user[0];
    const availableSpace = storage_quota - storage_used;
    
    return requiredSize <= availableSpace;
}

module.exports = {
    selectBestNode,
    getUserStorageUsage,
    updateUserStorageUsage,
    hasEnoughSpace
};