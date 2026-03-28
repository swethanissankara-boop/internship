/* ============================================
   STORAGE CONFIGURATION
   ============================================ */

const path = require('path');
const fs = require('fs');

// Storage paths
const STORAGE_BASE = path.join(__dirname, '..', '..', 'storage');
const UPLOADS_PATH = path.join(__dirname, '..', 'uploads');

const STORAGE_PATHS = {
    base: STORAGE_BASE,
    uploads: UPLOADS_PATH,
    temp: path.join(STORAGE_BASE, 'temp'),
    node1: path.join(STORAGE_BASE, 'node1'),
    node2: path.join(STORAGE_BASE, 'node2'),
    node3: path.join(STORAGE_BASE, 'node3'),
    backup1: path.join(STORAGE_BASE, 'backup1'),
    backup2: path.join(STORAGE_BASE, 'backup2')
};

// Initialize storage directories
function initializeStorage() {
    return new Promise((resolve, reject) => {
        try {
            Object.values(STORAGE_PATHS).forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    console.log(`📁 Created: ${dir}`);
                }
            });
            resolve(true);
        } catch (error) {
            reject(error);
        }
    });
}

// Get storage path by type
function getStoragePath(type = 'uploads') {
    return STORAGE_PATHS[type] || STORAGE_PATHS.uploads;
}

// Check disk space (basic implementation)
function checkDiskSpace() {
    // This would need a proper implementation for production
    return {
        total: 100 * 1024 * 1024 * 1024, // 100 GB
        free: 50 * 1024 * 1024 * 1024,   // 50 GB
        used: 50 * 1024 * 1024 * 1024    // 50 GB
    };
}

module.exports = {
    STORAGE_PATHS,
    initializeStorage,
    getStoragePath,
    checkDiskSpace
};
