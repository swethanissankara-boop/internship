/* ============================================
   CLOUDSHARE - MAIN SERVER (FIXED)
   ============================================ */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// SERVE FRONTEND FILES
// ============================================

const frontendPath = path.join(__dirname, '..');
console.log('📂 Frontend path:', frontendPath);

app.use(express.static(frontendPath));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});

// ============================================
// API ROUTES
// ============================================

const authRoutes = require('./routes/auth.routes');
const fileRoutes = require('./routes/file.routes');
const folderRoutes = require('./routes/folder.routes');
const shareRoutes = require('./routes/share.routes');

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/share', shareRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'CloudShare server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ============================================
// PUBLIC SHARE ROUTES
// ============================================

// Serve public share page (path-based)
app.get('/share/:token', (req, res) => {
    console.log('🔗 Serving public share page for token:', req.params.token);
    res.sendFile(path.join(frontendPath, 'public-share.html'));
});

// ============================================
// MAIN APP ROUTES
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(frontendPath, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(frontendPath, 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(frontendPath, 'dashboard.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(frontendPath, 'settings.html'));
});

app.get('/trash', (req, res) => {
    res.sendFile(path.join(frontendPath, 'trash.html'));
});

app.get('/shared-with-me', (req, res) => {
    res.sendFile(path.join(frontendPath, 'shared-with-me.html'));
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
    if (req.url.startsWith('/api/')) {
        console.log('❌ API route not found:', req.url);
        return res.status(404).json({
            success: false,
            message: 'API route not found',
            path: req.url
        });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('💥 Server Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

// ============================================
// GET LOCAL IP ADDRESS
// ============================================

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// ============================================
// INITIALIZE STORAGE DIRECTORIES
// ============================================

function initializeStorageDirectories() {
    const directories = [
        path.join(__dirname, 'uploads'),
        path.join(__dirname, '..', 'storage'),
        path.join(__dirname, '..', 'storage', 'temp'),
        path.join(__dirname, '..', 'storage', 'node1'),
        path.join(__dirname, '..', 'storage', 'node2'),
        path.join(__dirname, '..', 'storage', 'node3'),
        path.join(__dirname, '..', 'storage', 'backup1'),
        path.join(__dirname, '..', 'storage', 'backup2')
    ];

    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }
    });
}

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// Initialize directories
console.log('📁 Initializing storage directories...');
initializeStorageDirectories();
console.log('✅ Storage directories initialized\n');

// Start server
app.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║         CloudShare Server Started! 🚀           ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('🌐 Access URLs:');
    console.log('');
    console.log(`   📱 Local:        http://localhost:${PORT}`);
    console.log(`   🌍 LAN:          http://${localIP}:${PORT}`);
    console.log('');
    console.log('📄 Available Pages:');
    console.log('');
    console.log(`   🏠 Home:         http://${localIP}:${PORT}/`);
    console.log(`   🔐 Login:        http://${localIP}:${PORT}/login.html`);
    console.log(`   📝 Register:     http://${localIP}:${PORT}/register.html`);
    console.log(`   📊 Dashboard:    http://${localIP}:${PORT}/dashboard.html`);
    console.log(`   🔗 Share Test:   http://${localIP}:${PORT}/share/test123`);
    console.log('');
    console.log('🔌 API Endpoints:');
    console.log('');
    console.log(`   ✅ Health:       http://${localIP}:${PORT}/api/health`);
    console.log(`   🔐 Auth:         http://${localIP}:${PORT}/api/auth/*`);
    console.log(`   📁 Files:        http://${localIP}:${PORT}/api/files/*`);
    console.log(`   📂 Folders:      http://${localIP}:${PORT}/api/folders/*`);
    console.log(`   🔗 Share:        http://${localIP}:${PORT}/api/share/*`);
    console.log('');
    console.log('📁 Files served from:', frontendPath);
    console.log('💾 Uploads path:', path.join(__dirname, 'uploads'));
    console.log('');
    console.log('🔥 Server is ready! Press Ctrl+C to stop');
    console.log('');
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGINT', () => {
    console.log('\n');
    console.log('⏹️  Shutting down server...');
    console.log('👋 Goodbye!');
    console.log('');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n');
    console.log('⏹️  Server terminated');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app;
