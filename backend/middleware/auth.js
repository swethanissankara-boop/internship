/* ============================================
   AUTHENTICATION MIDDLEWARE
   ============================================ */

const jwt = require('jsonwebtoken');

// Verify JWT token
function authenticateToken(req, res, next) {
    // Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }
    
    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Attach user info to request
        req.user = decoded;
        
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
}

// Generate JWT token
function generateToken(user) {
    const payload = {
        userId: user.id,
        email: user.email
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
}

module.exports = {
    authenticateToken,
    generateToken
};