require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Depth', 'Overwrite', 'Destination', 'Lock-Token', 'Timeout']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const frontendPath = path.join(__dirname, '..');
console.log('📂 Frontend path:', frontendPath);

app.use(express.static(frontendPath));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/storage', (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache');
    next();
}, express.static(path.join(__dirname, '../storage')));

app.use((req, res, next) => {
    if (!req.url.startsWith('/network')) {
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    }
    next();
});

const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');
const folderRoutes = require('./routes/folder.routes');
const shareRoutes = require('./routes/share.routes');
const favoriteRoutes = require('./routes/favorite.routes');
const settingsRoutes = require('./routes/settings.routes');
const { authenticateToken, authenticateWebDAV } = require('./middleware/auth');
const { queryOne, query } = require('./config/db');

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok', message: 'CloudShare server is running',
        timestamp: new Date().toISOString(), uptime: process.uptime(),
        memory: { used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB', total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB' }
    });
});

app.get('/api/my-network-path', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const user = await queryOne('SELECT id, username FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const cleanUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const userFolderName = `user_${user.id}_${cleanUsername}`;
        const localIP = getLocalIP();
        const userStoragePath = path.join(__dirname, '../storage/node1', userFolderName);
        if (!fs.existsSync(userStoragePath)) {
            fs.mkdirSync(userStoragePath, { recursive: true });
        }
        const shareName = `VShare_${cleanUsername}`;
        if (os.platform() === 'win32') {
            const checkShare = `powershell -Command "Get-SmbShare -Name '${shareName}' -ErrorAction SilentlyContinue"`;
            exec(checkShare, (err, stdout) => {
                if (!stdout || stdout.trim() === '') {
                    console.log(`💡 Run create-shares.ps1 as Admin to create SMB share for: ${user.username}`);
                }
            });
        }
        res.json({
            success: true,
            network_path: `\\\\${localIP}\\${shareName}`,
            http_path: `http://${localIP}:5000/network/${cleanUsername}`,
            web_url: `http://${localIP}:5000`,
            username: user.username,
            clean_username: cleanUsername,
            user_folder: userFolderName,
            share_name: shareName
        });
    } catch (error) {
        console.error('My network path error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/network-token', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id || req.user.userId;
        const user = await queryOne('SELECT id, username FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        const cleanUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const localIP = getLocalIP();
        const token = req.headers.authorization?.split(' ')[1];
        res.json({
            success: true,
            instructions: {
                step1: 'Open File Explorer',
                step2: 'Click address bar at top',
                step3: `Type: \\\\${localIP}@5000\\DavWWWRoot\\network\\${cleanUsername}`,
                step4: `Username: ${user.username}`,
                step5: `Password: (paste your token below)`,
            },
            network_path: `\\\\${localIP}@5000\\DavWWWRoot\\network\\${cleanUsername}`,
            http_path: `http://${localIP}:5000/network/${cleanUsername}`,
            username: user.username,
            token: token,
            localIP: localIP
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

function setupNetworkFileAccess() {
    const storageBase = path.join(__dirname, '../storage/node1');
    app.use('/network', (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            res.setHeader('WWW-Authenticate', 'Basic realm="VShare - Enter your VShare username and password"');
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head><title>VShare Network Access</title></head>
                <body style="font-family:Arial;padding:40px;text-align:center;background:#f5f5f5;">
                    <div style="max-width:500px;margin:0 auto;background:white;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
                        <h1 style="color:#6366f1;">🔷 VShare Network Access</h1>
                        <p style="color:#666;">Please authenticate to access your files</p>
                        <p style="color:#666;">Use your VShare username and password</p>
                        <a href="/login.html" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;border-radius:8px;text-decoration:none;margin-top:20px;">Login to VShare</a>
                    </div>
                </body>
                </html>
            `);
        }
        try {
            const base64 = authHeader.split(' ')[1];
            const credentials = Buffer.from(base64, 'base64').toString('utf8');
            const colonIndex = credentials.indexOf(':');
            const username = credentials.substring(0, colonIndex);
            const password = credentials.substring(colonIndex + 1);
            req.networkUsername = username;
            req.networkPassword = password;
            next();
        } catch (error) {
            res.setHeader('WWW-Authenticate', 'Basic realm="VShare Network Access"');
            return res.status(401).send('Authentication failed');
        }
    });

    app.use('/network/:username', async (req, res, next) => {
        try {
            const requestedUsername = req.params.username;
            const { networkUsername, networkPassword } = req;
            const user = await queryOne('SELECT * FROM users WHERE username = ?', [networkUsername]);
            if (!user) {
                res.setHeader('WWW-Authenticate', 'Basic realm="VShare - Invalid username"');
                return res.status(401).send('Invalid username');
            }
            const bcrypt = require('bcrypt');
            const validPassword = await bcrypt.compare(networkPassword, user.password);
            if (!validPassword) {
                res.setHeader('WWW-Authenticate', 'Basic realm="VShare - Invalid password"');
                return res.status(401).send('Invalid password');
            }
            const cleanUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
            if (requestedUsername !== cleanUsername) {
                return res.status(403).send(`
                    <!DOCTYPE html>
                    <html>
                    <body style="font-family:Arial;padding:40px;text-align:center;">
                        <h2 style="color:#ef4444;">❌ Access Denied</h2>
                        <p>You can only access your own files.</p>
                        <p>Your folder: <strong>/network/${cleanUsername}</strong></p>
                        <a href="/network/${cleanUsername}">Go to your files →</a>
                    </body>
                    </html>
                `);
            }
            const userFolderName = `user_${user.id}_${cleanUsername}`;
            const userStoragePath = path.join(storageBase, userFolderName);
            if (!fs.existsSync(userStoragePath)) {
                fs.mkdirSync(userStoragePath, { recursive: true });
            }
            req.userStoragePath = userStoragePath;
            req.cleanUsername = cleanUsername;
            req.authenticatedUser = user;
            next();
        } catch (error) {
            console.error('Network auth error:', error);
            res.setHeader('WWW-Authenticate', 'Basic realm="VShare Network Access"');
            return res.status(401).send('Authentication error: ' + error.message);
        }
    });

    app.get('/network/:username', (req, res) => {
        serveDirectory(req, res, req.userStoragePath, '/', req.cleanUsername);
    });

    app.get('/network/:username/*', (req, res) => {
        const subPath = req.params[0] || '';
        const fullPath = path.join(req.userStoragePath, subPath);
        if (!fullPath.startsWith(req.userStoragePath)) {
            return res.status(403).send('Access denied');
        }
        if (!fs.existsSync(fullPath)) {
            return res.status(404).send('Not found');
        }
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            serveDirectory(req, res, fullPath, '/' + subPath, req.cleanUsername);
        } else {
            const fileName = path.basename(fullPath);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            res.setHeader('Content-Type', getMimeType(fileName));
            fs.createReadStream(fullPath).pipe(res);
        }
    });
}

function serveDirectory(req, res, dirPath, currentPath, cleanUsername) {
    const items = fs.readdirSync(dirPath).map(item => {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        return {
            name: item,
            isDir: stat.isDirectory(),
            size: stat.isDirectory() ? '' : formatBytes(stat.size),
            modified: stat.mtime.toLocaleDateString(),
            icon: stat.isDirectory() ? '📁' : getFileIconByExt(path.extname(item).toLowerCase())
        };
    });
    const dirs = items.filter(i => i.isDir).sort((a, b) => a.name.localeCompare(b.name));
    const files = items.filter(i => !i.isDir).sort((a, b) => a.name.localeCompare(b.name));
    const sortedItems = [...dirs, ...files];
    const localIP = getLocalIP();
    const pathParts = currentPath.split('/').filter(Boolean);
    let breadcrumb = `<a href="/network/${cleanUsername}" style="color:#6366f1;text-decoration:none;">🏠 Home</a>`;
    let builtPath = '';
    pathParts.forEach(part => {
        builtPath += '/' + part;
        breadcrumb += ` <span style="color:#9ca3af;">›</span> <a href="/network/${cleanUsername}${builtPath}" style="color:#6366f1;text-decoration:none;">${part}</a>`;
    });
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>VShare - ${cleanUsername}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f7fa; min-height: 100vh; }
                .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 20px 30px; color: white; display: flex; align-items: center; justify-content: space-between; }
                .header h1 { font-size: 22px; display: flex; align-items: center; gap: 10px; }
                .header .user-info { font-size: 13px; opacity: 0.9; }
                .breadcrumb { padding: 14px 30px; background: white; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
                .container { padding: 24px 30px; max-width: 1200px; margin: 0 auto; }
                .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
                .stat-card { background: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
                .stat-card .number { font-size: 28px; font-weight: 700; color: #6366f1; }
                .stat-card .label { font-size: 13px; color: #6b7280; margin-top: 4px; }
                .file-table { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
                .table-header { display: grid; grid-template-columns: 40px 1fr 120px 150px 100px; gap: 0; padding: 14px 20px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 13px; font-weight: 600; color: #6b7280; }
                .file-row { display: grid; grid-template-columns: 40px 1fr 120px 150px 100px; gap: 0; padding: 12px 20px; border-bottom: 1px solid #f3f4f6; align-items: center; transition: background 0.15s; }
                .file-row:hover { background: #f9fafb; }
                .file-row:last-child { border-bottom: none; }
                .file-icon { font-size: 22px; }
                .file-name a { color: #1f2937; text-decoration: none; font-weight: 500; font-size: 14px; display: flex; align-items: center; gap: 8px; }
                .file-name a:hover { color: #6366f1; }
                .file-size { font-size: 13px; color: #6b7280; }
                .file-date { font-size: 13px; color: #6b7280; }
                .file-actions a { padding: 6px 12px; background: #eff6ff; color: #3b82f6; border-radius: 6px; text-decoration: none; font-size: 12px; font-weight: 600; }
                .file-actions a:hover { background: #3b82f6; color: white; }
                .empty { text-align: center; padding: 60px 20px; color: #6b7280; }
                .empty .icon { font-size: 60px; margin-bottom: 16px; }
                .back-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: #f3f4f6; color: #374151; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; margin-bottom: 16px; }
                .back-btn:hover { background: #e5e7eb; }
                @media (max-width: 600px) { .table-header, .file-row { grid-template-columns: 40px 1fr 80px; } .file-date, .file-actions { display: none; } }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🔷 VShare Network Access</h1>
                <div class="user-info">👤 ${req.authenticatedUser.username} | <a href="/login.html" style="color:rgba(255,255,255,0.8);font-size:12px;">Switch User</a></div>
            </div>
            <div class="breadcrumb">${breadcrumb}</div>
            <div class="container">
    `;
    if (currentPath === '/') {
        const totalFiles = files.length;
        const totalFolders = dirs.length;
        const totalSize = files.reduce((sum, f) => sum + (f.rawSize || 0), 0);
        html += `
            <div class="stats">
                <div class="stat-card"><div class="number">${totalFiles}</div><div class="label">Files</div></div>
                <div class="stat-card"><div class="number">${totalFolders}</div><div class="label">Folders</div></div>
                <div class="stat-card"><div class="number">${sortedItems.length}</div><div class="label">Total Items</div></div>
            </div>
        `;
    }
    if (currentPath !== '/') {
        const parentPath = pathParts.slice(0, -1).join('/');
        html += `<a class="back-btn" href="/network/${cleanUsername}${parentPath ? '/' + parentPath : ''}">← Back</a>`;
    }
    html += `<div class="file-table">`;
    if (sortedItems.length === 0) {
        html += `
            <div class="empty">
                <div class="icon">📂</div>
                <h3>No files yet</h3>
                <p>Upload files from <a href="/dashboard.html" style="color:#6366f1;">VShare Dashboard</a></p>
            </div>
        `;
    } else {
        html += `
            <div class="table-header">
                <div></div>
                <div>Name</div>
                <div>Size</div>
                <div>Modified</div>
                <div>Action</div>
            </div>
        `;
        sortedItems.forEach(item => {
            const itemUrl = `/network/${cleanUsername}${currentPath === '/' ? '' : currentPath}/${item.name}${item.isDir ? '' : ''}`;
            const downloadUrl = item.isDir ? itemUrl : itemUrl;
            html += `
                <div class="file-row">
                    <div class="file-icon">${item.icon}</div>
                    <div class="file-name">
                        <a href="${itemUrl}">
                            ${item.name}
                        </a>
                    </div>
                    <div class="file-size">${item.size}</div>
                    <div class="file-date">${item.modified}</div>
                    <div class="file-actions">
                        ${!item.isDir ? `<a href="${downloadUrl}" download="${item.name}">📥 Download</a>` : `<a href="${itemUrl}">📂 Open</a>`}
                    </div>
                </div>
            `;
        });
    }
    html += `
            </div>
            <div style="margin-top:20px;padding:16px;background:white;border-radius:12px;font-size:13px;color:#6b7280;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <strong>📡 Network Access Info:</strong><br>
                Web URL: <a href="http://${localIP}:5000/network/${cleanUsername}" style="color:#6366f1;">http://${localIP}:5000/network/${cleanUsername}</a><br>
                Server IP: ${localIP} | User: ${req.authenticatedUser.username}
            </div>
        </div>
        </body>
        </html>
    `;
    res.send(html);
}

function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimes = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.txt': 'text/plain', '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.zip': 'application/zip', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    return mimes[ext] || 'application/octet-stream';
}

function getFileIconByExt(ext) {
    const icons = { '.pdf': '📕', '.doc': '📘', '.docx': '📘', '.txt': '📝', '.xls': '📊', '.xlsx': '📊', '.ppt': '📙', '.pptx': '📙', '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🎞️', '.mp4': '🎬', '.avi': '🎬', '.mov': '🎬', '.mp3': '🎵', '.wav': '🎵', '.zip': '📦', '.rar': '📦', '.7z': '📦', '.js': '⚡', '.html': '🌐', '.css': '🎨', '.json': '📋', '.py': '🐍', '.java': '☕' };
    return icons[ext] || '📄';
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.post('/api/open-explorer', (req, res) => {
    if (os.platform() !== 'win32') return res.json({ success: false, message: 'Only works on Windows' });
    const { ip, username } = req.body;
    if (!ip) return res.status(400).json({ success: false, message: 'IP address is required' });
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$|^localhost$/;
    if (!ipRegex.test(ip)) return res.status(400).json({ success: false, message: 'Invalid IP address' });
    const cleanUsername = username ? username.replace(/[^a-zA-Z0-9_-]/g, '_') : null;
    const networkPath = cleanUsername ? `\\\\${ip}\\VShare_${cleanUsername}` : `\\\\${ip}\\VShare`;
    exec(`explorer "${networkPath}"`, { timeout: 5000 }, (error) => {
        if (error) return res.json({ success: false, message: error.message });
        res.json({ success: true, message: `Opened ${networkPath}`, network_path: networkPath });
    });
});

app.post('/api/unblock-files', (req, res) => {
    if (os.platform() !== 'win32') return res.json({ success: false, message: 'Only works on Windows' });
    const storagePath = path.join(__dirname, '../storage/node1');
    exec(`powershell -Command "Get-ChildItem -Path '${storagePath}' -Recurse | Unblock-File"`, { timeout: 30000 }, (error) => {
        if (error) return res.json({ success: false, message: error.message });
        res.json({ success: true, message: 'Zone.Identifier removed from all files!' });
    });
});

app.get('/share/:token', (req, res) => { res.sendFile(path.join(frontendPath, 'public-share.html')); });
app.get('/', (req, res) => { res.sendFile(path.join(frontendPath, 'index.html')); });
app.get('/login', (req, res) => { res.sendFile(path.join(frontendPath, 'login.html')); });
app.get('/register', (req, res) => { res.sendFile(path.join(frontendPath, 'register.html')); });
app.get('/dashboard', (req, res) => { res.sendFile(path.join(frontendPath, 'dashboard.html')); });
app.get('/settings', (req, res) => { res.sendFile(path.join(frontendPath, 'settings.html')); });
app.get('/trash', (req, res) => { res.sendFile(path.join(frontendPath, 'trash.html')); });
app.get('/shared-with-me', (req, res) => { res.sendFile(path.join(frontendPath, 'shared-with-me.html')); });
app.get('/favorites', (req, res) => { res.sendFile(path.join(frontendPath, 'favorites.html')); });

app.use((req, res) => {
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: 'API route not found', path: req.url });
    }
    if (req.url.startsWith('/network/')) return;
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

function initializeStorageDirectories() {
    const directories = [
        path.join(__dirname, 'uploads'),
        path.join(__dirname, '..', 'storage'),
        path.join(__dirname, '..', 'storage', 'temp'),
        path.join(__dirname, '..', 'storage', 'node1'),
        path.join(__dirname, '..', 'storage', 'node2'),
        path.join(__dirname, '..', 'storage', 'node3'),
        path.join(__dirname, '..', 'storage', 'backup1'),
        path.join(__dirname, '..', 'storage', 'backup2'),
        path.join(__dirname, '..', 'storage', 'profile-pictures')
    ];
    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Created directory: ${dir}`);
        }
    });
}

function scheduleAutoCleanup() {
    const { query } = require('./config/db');
    setInterval(async () => {
        try {
            await query('CALL AutoDeleteOldTrash()');
            console.log('Automatic trash cleanup completed');
        } catch (error) {
            console.error('Automatic trash cleanup failed:', error);
        }
    }, 24 * 60 * 60 * 1000);
    setTimeout(async () => {
        try {
            await query('CALL AutoDeleteOldTrash()');
            console.log('Initial trash cleanup completed');
        } catch (error) {
            console.error('Initial trash cleanup failed:', error);
        }
    }, 60 * 1000);
}

function unblockStorageFiles() {
    if (os.platform() !== 'win32') return;
    const storagePath = path.join(__dirname, '../storage/node1');
    exec(`powershell -Command "Get-ChildItem -Path '${storagePath}' -Recurse | Unblock-File"`, { timeout: 30000 }, (error) => {
        if (error) console.warn('Could not remove Zone.Identifier:', error.message);
        else console.log('Zone.Identifier removed from all storage files');
    });
}

function createUserSMBShares() {
    if (os.platform() !== 'win32') return;
    const storageBase = path.join(__dirname, '../storage/node1');
    if (!fs.existsSync(storageBase)) return;
    const userFolders = fs.readdirSync(storageBase).filter(f => f.startsWith('user_') && fs.statSync(path.join(storageBase, f)).isDirectory());
    userFolders.forEach(userFolder => {
        const parts = userFolder.split('_');
        if (parts.length < 3) return;
        const username = parts.slice(2).join('_');
        const shareName = `VShare_${username}`;
        const folderPath = path.join(storageBase, userFolder);
        const checkCmd = `powershell -Command "Get-SmbShare -Name '${shareName}' -ErrorAction SilentlyContinue"`;
        exec(checkCmd, (err, stdout) => {
            if (!stdout || stdout.trim() === '') {
                const createCmd = `powershell -Command "New-SmbShare -Name '${shareName}' -Path '${folderPath}' -FullAccess 'Everyone'"`;
                exec(createCmd, (createErr) => {
                    if (createErr) console.warn(`Share ${shareName} warning:`, createErr.message);
                    else console.log(`✅ Created SMB share: ${shareName}`);
                });
            } else {
                console.log(`SMB share already exists: ${shareName}`);
            }
        });
    });
}

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('📁 Initializing storage directories...');
initializeStorageDirectories();
console.log('✅ Storage directories initialized\n');

setupNetworkFileAccess();

app.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║         CloudShare Server Started! 🚀           ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('🌐 Access URLs:');
    console.log(`   📱 Local:        http://localhost:${PORT}`);
    console.log(`   🌍 LAN:          http://${localIP}:${PORT}`);
    console.log('');
    console.log('📄 Available Pages:');
    console.log(`   🏠 Home:         http://${localIP}:${PORT}/`);
    console.log(`   🔐 Login:        http://${localIP}:${PORT}/login.html`);
    console.log(`   📝 Register:     http://${localIP}:${PORT}/register.html`);
    console.log(`   📊 Dashboard:    http://${localIP}:${PORT}/dashboard.html`);
    console.log(`   ⭐ Favorites:    http://${localIP}:${PORT}/favorites.html`);
    console.log(`   🗑️  Trash:        http://${localIP}:${PORT}/trash.html`);
    console.log(`   ⚙️  Settings:     http://${localIP}:${PORT}/settings.html`);
    console.log('');
    console.log('🔌 API Endpoints:');
    console.log(`   ✅ Health:       http://${localIP}:${PORT}/api/health`);
    console.log(`   🔐 Auth:         http://${localIP}:${PORT}/api/auth/*`);
    console.log(`   📁 Files:        http://${localIP}:${PORT}/api/files/*`);
    console.log(`   📂 Folders:      http://${localIP}:${PORT}/api/folders/*`);
    console.log(`   🔗 Share:        http://${localIP}:${PORT}/api/share/*`);
    console.log(`   ⭐ Favorites:    http://${localIP}:${PORT}/api/favorites/*`);
    console.log(`   ⚙️  Settings:     http://${localIP}:${PORT}/api/settings/*`);
    console.log(`   📂 Explorer:     http://${localIP}:${PORT}/api/open-explorer`);
    console.log(`   🔓 Unblock:      http://${localIP}:${PORT}/api/unblock-files`);
    console.log(`   🌐 My Path:      http://${localIP}:${PORT}/api/my-network-path`);
    console.log('');
    console.log('📡 Network File Access (Works on ANY WiFi!):');
    console.log(`   🌐 Base URL:     http://${localIP}:${PORT}/network/<username>`);
    console.log(`   🔐 Login:        Use your VShare username & password`);
    console.log(`   📂 Example:      http://${localIP}:${PORT}/network/Jahnavi_Veeramallu`);
    console.log('');
    console.log('📂 SMB Network Share:');
    console.log(`   🖥️  Base SMB:     \\\\${localIP}\\VShare_<username>`);
    console.log(`   👤 Credentials:  VShareGuest / VShare@2026`);
    console.log('');
    console.log('🔥 Server is ready! Press Ctrl+C to stop');
    console.log('');
    scheduleAutoCleanup();
    unblockStorageFiles();
    setTimeout(() => { createUserSMBShares(); }, 5000);
});

process.on('SIGINT', () => { console.log('\n⏹️  Shutting down...'); console.log('👋 Goodbye!'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n⏹️  Server terminated'); process.exit(0); });
process.on('uncaughtException', (error) => { console.error('Uncaught Exception:', error); process.exit(1); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

module.exports = app;
