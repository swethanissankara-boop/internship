/* ============================================
   AUTHENTICATION CONTROLLER
   ============================================ */

const bcrypt = require('bcrypt');
const { query, queryOne } = require('../config/db');
const { generateToken } = require('../middleware/auth');

// Register new user
async function register(req, res) {
    try {
        const { name, email, password } = req.body;
        
        console.log('Registration attempt:', { name, email }); // Debug log
        
        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and password'
            });
        }
        
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters'
            });
        }
        
        // Check if email already exists
        const existingUser = await queryOne(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const result = await query(
            `INSERT INTO users (username, email, password, storage_quota, storage_used) 
             VALUES (?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, 10737418240, 0]
        );
        
        const userId = result.insertId;
        
        console.log('User created with ID:', userId); // Debug log
        
        // Generate token (Payload uses 'id')
        const token = generateToken({ id: userId, email });
        
        // Return user info
        const user = {
            id: userId,
            username: name,
            email,
            storage_quota: 10737418240,
            storage_used: 0,
            created_at: new Date()
        };

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user
        });
        
    } catch (error) {
        console.error('Register error:', error);
        console.error('Error stack:', error.stack); // More detailed error
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message // Send error details in development
        });
    }
}

// Login user
async function login(req, res) {
    try {
        const { email, password } = req.body;
        
        console.log('Login attempt:', email); // Debug log
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }
        
        // Find user
        const user = await queryOne(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Update last login
        await query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );
        
        // Generate token (Payload uses 'id')
        const token = generateToken({ id: user.id, email: user.email });
        
        // Return user info (without password)
        const userInfo = {
            id: user.id,
            username: user.username,
            email: user.email,
            storage_quota: user.storage_quota,
            storage_used: user.storage_used,
            created_at: user.created_at
        };
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: userInfo
        });
        
    } catch (error) {
        console.error('Login error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: error.message
        });
    }
}

// Logout (optional - mainly handled on frontend)
async function logout(req, res) {
    res.json({
        success: true,
        message: 'Logout successful'
    });
}

// Get current user info
async function getCurrentUser(req, res) {
    try {
        const userId = req.user.id; 
        
        if (!userId) {
             return res.status(401).json({
                 success: false,
                 message: 'Unauthorized: User ID missing from token'
             });
        }

        const user = await queryOne(
            'SELECT id, username, email, storage_quota, storage_used, created_at FROM users WHERE id = ?',
            [userId]
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to get user info',
            error: error.message
        });
    }
}

module.exports = {
    register,
    login,
    logout,
    getCurrentUser
};
