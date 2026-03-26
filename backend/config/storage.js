/* ============================================
   STORAGE CONFIGURATION
   ============================================ */

const path = require('path');
const fs = require('fs');

// Storage paths
const STORAGE_PATHS = {
    base: path.join(__dirname, '../../storage'),
    node1: path.join(__dirname, '../../storage/node1'),
    node2: path.join(__dirname, '../../storage/node2'),
    node3: path.join(__dirname, '../../storage/node3'),
    backup1: path.join(__dirname, '../../storage/backup1'),
    backup2: path.join(__dirname, '../../storage/backup2'),
    temp: path.join(__dirname, '../../storage/temp')
};

// Ensure storage directories exist
function initializeStorage() {
    console.log('📁 Initializing storage directories...');
    
    Object.entries(STORAGE_PATHS).forEach(([name, dirPath]) => {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`   ✓ Created: ${name}`);
        }
    });
    
    console.log('✅ Storage directories initialized\n');
}

// Initialize on module load
initializeStorage();

// Storage configuration
const storageConfig = {
    paths: STORAGE_PATHS,
    nodes: ['node1', 'node2', 'node3'],
    backups: ['backup1', 'backup2'],
    defaultQuota: parseInt(process.env.DEFAULT_USER_QUOTA) || 107374182400, // 100 GB
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5368709120 // 5 GB
};

// Select storage node (round-robin based on user ID)
function selectStorageNode(userId) {
    const nodeIndex = userId % storageConfig.nodes.length;
    return storageConfig.nodes[nodeIndex];
}

// Get user storage path
function getUserStoragePath(userId, node) {
    const nodePath = STORAGE_PATHS[node];
    const userPath = path.join(nodePath, `user_${userId}`);
    
    // Create if doesn't exist
    if (!fs.existsSync(userPath)) {
        fs.mkdirSync(userPath, { recursive: true });
    }
    
    return userPath;
}

// Get backup paths for user
function getUserBackupPaths(userId) {
    return storageConfig.backups.map(backup => {
        const backupPath = STORAGE_PATHS[backup];
        const userBackupPath = path.join(backupPath, `user_${userId}`);
        
        // Create if doesn't exist
        if (!fs.existsSync(userBackupPath)) {
            fs.mkdirSync(userBackupPath, { recursive: true });
        }
        
        return userBackupPath;
    });
}

module.exports = {
    storageConfig,
    STORAGE_PATHS,
    selectStorageNode,
    getUserStoragePath,
    getUserBackupPaths
};