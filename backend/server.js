/* ============================================
   CLOUDSHARE - MAIN SERVER (FIXED)
   ============================================ */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

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
// IMPORTANT: SERVE FRONTEND FILES FIRST!
// This must come BEFORE API routes
// ============================================

// Serve all frontend files from parent directory (D:\Cloudshare\)
const frontendPath = path.join(__dirname, '..');
console.log('📂 Frontend path:', frontendPath);

app.use(express.static(frontendPath));

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
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler - serve index.html for unknown routes
app.use((req, res) => {
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'API route not found'
        });
    }
    // For all other routes, serve index.html
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
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
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    const localIP = getLocalIP();
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║         CloudShare Server Started! 🚀           ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log('🌐 Open your browser and go to:');
    console.log('');
    console.log(`   👉 http://localhost:${PORT}`);
    console.log(`   👉 http://${localIP}:${PORT}  (LAN access)`);
    console.log('');
    console.log('📁 Files served from:', frontendPath);
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');
});

process.on('SIGINT', () => {
    console.log('\n⏹️  Server stopped.');
    process.exit(0);
});

module.exports = app;