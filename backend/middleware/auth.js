/* ============================================
   AUTHENTICATION MIDDLEWARE - FIXED v2
   ============================================ */

const jwt = require('jsonwebtoken');

// Verify JWT token
function authenticateToken(req, res, next) {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    console.log('🔐 Auth check for:', req.method, req.url);
    console.log('🔑 Token present:', !!token);
    
    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }
    
    try {
        // Check JWT_SECRET exists
        if (!process.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET not set in environment!');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error'
            });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        console.log('📦 Decoded token:', {
            userId: decoded.userId || decoded.id,
            email: decoded.email,
            iat: decoded.iat,
            exp: decoded.exp,
            expiresIn: decoded.exp ? `${Math.round((decoded.exp * 1000 - Date.now()) / 1000 / 60)} minutes` : 'unknown'
        });
        
        // FIXED: Normalize the user object
        req.user = {
            id: decoded.userId || decoded.id,
            userId: decoded.userId || decoded.id,
            email: decoded.email
        };
        
        console.log('✅ Authenticated user:', req.user.id, req.user.email);
        
        next();
    } catch (error) {
        console.error('❌ Token verification failed:', error.message);
        
        // Give specific error messages
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired. Please login again.'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token. Please login again.'
            });
        }
        
        if (error.name === 'NotBeforeError') {
            return res.status(401).json({
                success: false,
                message: 'Token not yet active.'
            });
        }
        
        return res.status(401).json({
            success: false,
            message: 'Authentication failed: ' + error.message
        });
    }
}

// Generate JWT token
function generateToken(user) {
    const payload = {
        userId: user.id,
        id: user.id,
        email: user.email
    };
    
    console.log('🔑 Generating token for user:', user.id, user.email);
    console.log('🔑 Using JWT_SECRET:', process.env.JWT_SECRET ? 'SET (' + process.env.JWT_SECRET.length + ' chars)' : 'NOT SET!');
    
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
}

module.exports = {
    authenticateToken,
    generateToken
};
