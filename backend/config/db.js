/* ============================================
   DATABASE CONNECTION
   ============================================ */

const mysql = require('mysql2/promise');

// Create database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cloudshare',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test connection
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

// Call test on module load
testConnection();

// Query helper function
async function query(sql, params = []) {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

// Get single row
async function queryOne(sql, params = []) {
    const results = await query(sql, params);
    return results[0] || null;
}

module.exports = {
    pool,
    query,
    queryOne,
    testConnection
};