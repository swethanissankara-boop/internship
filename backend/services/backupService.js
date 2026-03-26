/* ============================================
   BACKUP SERVICE
   Handles file backup creation
   ============================================ */

const fs = require('fs').promises;
const path = require('path');
const { getUserBackupPaths } = require('../config/storage');

// Create backup copies of file
async function createBackup(sourceFilePath, userId, filename) {
    const backupPaths = getUserBackupPaths(userId);
    const createdBackups = [];
    
    for (const backupPath of backupPaths) {
        try {
            const backupFilePath = path.join(backupPath, filename);
            
            // Copy file to backup location
            await fs.copyFile(sourceFilePath, backupFilePath);
            
            createdBackups.push(backupFilePath);
            console.log(`✓ Backup created: ${backupFilePath}`);
            
        } catch (error) {
            console.error(`✗ Backup failed for ${backupPath}:`, error.message);
        }
    }
    
    return createdBackups;
}

// Delete backup copies
async function deleteBackup(backupPaths) {
    if (!backupPaths || backupPaths.length === 0) return;
    
    for (const backupPath of backupPaths) {
        try {
            await fs.unlink(backupPath);
            console.log(`✓ Backup deleted: ${backupPath}`);
        } catch (error) {
            console.error(`✗ Failed to delete backup ${backupPath}:`, error.message);
        }
    }
}

// Verify backup integrity
async function verifyBackup(originalPath, backupPath) {
    try {
        const originalStats = await fs.stat(originalPath);
        const backupStats = await fs.stat(backupPath);
        
        // Check if file sizes match
        return originalStats.size === backupStats.size;
        
    } catch (error) {
        console.error('Backup verification error:', error);
        return false;
    }
}

module.exports = {
    createBackup,
    deleteBackup,
    verifyBackup
};