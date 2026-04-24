const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    console.log('🔐 Auth check for:', req.method, req.url);
    console.log('🔑 Token present:', !!token);
    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }
    try {
        if (!process.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET not set in environment!');
            return res.status(500).json({ success: false, message: 'Server configuration error' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('📦 Decoded token:', {
            userId: decoded.userId || decoded.id,
            email: decoded.email,
            iat: decoded.iat,
            exp: decoded.exp,
            expiresIn: decoded.exp ? `${Math.round((decoded.exp * 1000 - Date.now()) / 1000 / 60)} minutes` : 'unknown'
        });
        req.user = {
            id: decoded.userId || decoded.id,
            userId: decoded.userId || decoded.id,
            email: decoded.email
        };
        console.log('✅ Authenticated user:', req.user.id, req.user.email);
        next();
    } catch (error) {
        console.error('❌ Token verification failed:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token. Please login again.' });
        }
        if (error.name === 'NotBeforeError') {
            return res.status(401).json({ success: false, message: 'Token not yet active.' });
        }
        return res.status(401).json({ success: false, message: 'Authentication failed: ' + error.message });
    }
}

function authenticateWebDAV(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="VShare Network Access"');
        return res.status(401).json({ success: false, message: 'Network authentication required' });
    }
    try {
        const base64 = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64, 'base64').toString('utf8');
        const colonIndex = credentials.indexOf(':');
        const username = credentials.substring(0, colonIndex);
        const password = credentials.substring(colonIndex + 1);
        const jwt_token = password;
        try {
            const decoded = jwt.verify(jwt_token, process.env.JWT_SECRET);
            const userId = decoded.userId || decoded.id;
            const userEmail = decoded.email;
            const cleanUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
            req.user = { id: userId, userId: userId, email: userEmail, username: username, cleanUsername: cleanUsername };
            console.log('✅ WebDAV authenticated:', username, userEmail);
            next();
        } catch (tokenError) {
            console.warn('WebDAV token auth failed, trying password auth:', tokenError.message);
            req.webdavUsername = username;
            req.webdavPassword = password;
            next();
        }
    } catch (error) {
        console.error('WebDAV auth error:', error.message);
        res.setHeader('WWW-Authenticate', 'Basic realm="VShare Network Access"');
        return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
}

function generateToken(user) {
    const payload = { userId: user.id, id: user.id, email: user.email };
    console.log('🔑 Generating token for user:', user.id, user.email);
    console.log('🔑 Using JWT_SECRET:', process.env.JWT_SECRET ? 'SET (' + process.env.JWT_SECRET.length + ' chars)' : 'NOT SET!');
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
}

module.exports = { authenticateToken, authenticateWebDAV, generateToken };
