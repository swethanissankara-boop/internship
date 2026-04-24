const bcrypt = require('bcrypt');
const { query, queryOne } = require('../config/db');
const { generateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

function createUserShareAfterRegister(userId, username) {
    if (process.platform !== 'win32') return;
    const cleanUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userFolderName = `user_${userId}_${cleanUsername}`;
    const shareName = `VShare_${cleanUsername}`;
    const userStoragePath = path.join(__dirname, '../../storage/node1', userFolderName);
    if (!fs.existsSync(userStoragePath)) {
        fs.mkdirSync(userStoragePath, { recursive: true });
        console.log(`Created folder for new user: ${username} → ${userStoragePath}`);
    }
    const createCmd = `powershell -Command "
        try {
            $share = Get-SmbShare -Name '${shareName}' -ErrorAction SilentlyContinue
            if (!$share) {
                New-SmbShare -Name '${shareName}' -Path '${userStoragePath}' -FullAccess 'Everyone' -Description 'VShare - ${username}' -ErrorAction Stop
                Grant-SmbShareAccess -Name '${shareName}' -AccountName 'VShareGuest' -AccessRight Full -Force -ErrorAction SilentlyContinue
                Write-Host 'Share created: ${shareName}'
            } else {
                Write-Host 'Share already exists: ${shareName}'
            }
        } catch {
            Write-Host 'Share creation failed: ' + $_.Exception.Message
        }
    "`;
    exec(createCmd, (err, stdout, stderr) => {
        if (err) {
            console.warn(`Share creation warning for ${username}:`, err.message);
        } else {
            console.log(`✅ Share auto-created for: ${shareName} → ${userStoragePath}`);
            if (stdout) console.log('PowerShell output:', stdout.trim());
        }
    });
}

async function register(req, res) {
    try {
        const { name, email, password } = req.body;
        console.log('Registration attempt:', { name, email });
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
        const existingUser = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await query(
            `INSERT INTO users (username, email, password, storage_quota, storage_used) VALUES (?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, 10737418240, 0]
        );
        const userId = result.insertId;
        console.log('User created with ID:', userId);
        createUserShareAfterRegister(userId, name);
        const token = generateToken({ id: userId, email });
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
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: error.message
        });
    }
}

async function login(req, res) {
    try {
        const { email, password } = req.body;
        console.log('Login attempt:', email);
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }
        const user = await queryOne('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
        const cleanUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const userFolderName = `user_${user.id}_${cleanUsername}`;
        const shareName = `VShare_${cleanUsername}`;
        const userStoragePath = path.join(__dirname, '../../storage/node1', userFolderName);
        if (!fs.existsSync(userStoragePath)) {
            fs.mkdirSync(userStoragePath, { recursive: true });
            console.log(`Created missing folder for: ${user.username}`);
        }
        if (process.platform === 'win32') {
            const checkCmd = `powershell -Command "Get-SmbShare -Name '${shareName}' -ErrorAction SilentlyContinue"`;
            exec(checkCmd, (err, stdout) => {
                if (!stdout || stdout.trim() === '') {
                    const createCmd = `powershell -Command "
                        try {
                            New-SmbShare -Name '${shareName}' -Path '${userStoragePath}' -FullAccess 'Everyone' -Description 'VShare - ${user.username}' -ErrorAction Stop
                            Grant-SmbShareAccess -Name '${shareName}' -AccountName 'VShareGuest' -AccessRight Full -Force -ErrorAction SilentlyContinue
                            Write-Host 'Share created on login: ${shareName}'
                        } catch {
                            Write-Host 'Share creation failed: ' + $_.Exception.Message
                        }
                    "`;
                    exec(createCmd, (createErr, createOut) => {
                        if (createErr) console.warn(`Login share warning for ${user.username}:`, createErr.message);
                        else console.log(`✅ Share created on login: ${shareName}`);
                        if (createOut) console.log('PowerShell:', createOut.trim());
                    });
                } else {
                    console.log(`✅ Share exists for: ${shareName}`);
                }
            });
        }
        const token = generateToken({ id: user.id, email: user.email });
        const userInfo = {
            id: user.id,
            username: user.username,
            email: user.email,
            storage_quota: user.storage_quota,
            storage_used: user.storage_used,
            created_at: user.created_at,
            network_path: `\\\\${getLocalIP()}\\${shareName}`
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

function getLocalIP() {
    const os = require('os');
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

async function logout(req, res) {
    res.json({ success: true, message: 'Logout successful' });
}

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
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const cleanUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const shareName = `VShare_${cleanUsername}`;
        const localIP = getLocalIP();
        res.json({
            success: true,
            user: {
                ...user,
                network_path: `\\\\${localIP}\\${shareName}`,
                share_name: shareName
            }
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
