-- ============================================
-- CLOUDSHARE DATABASE SCHEMA
-- ============================================

CREATE DATABASE IF NOT EXISTS cloudshare;
USE cloudshare;

-- Disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Drop all existing tables
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS shared_with_users;
DROP TABLE IF EXISTS shared_links;
DROP TABLE IF EXISTS trash;
DROP TABLE IF EXISTS shares;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS folders;
DROP TABLE IF EXISTS users;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- 0. USERS TABLE (Updated to match controller)
-- ============================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    storage_quota BIGINT DEFAULT 10737418240,
    storage_used BIGINT DEFAULT 0,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (email),
    UNIQUE KEY (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 1. FOLDERS TABLE
-- ============================================
CREATE TABLE folders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    parent_id INT DEFAULT NULL,
    user_id INT NOT NULL,
    path VARCHAR(1000),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
    INDEX idx_user_folder (user_id, parent_id),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 2. FILES TABLE
-- ============================================
CREATE TABLE files (
    id INT PRIMARY KEY AUTO_INCREMENT,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100),
    size BIGINT NOT NULL DEFAULT 0,
    folder_id INT DEFAULT NULL,
    user_id INT NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    storage_node VARCHAR(50) DEFAULT 'node1',
    backup_path_1 VARCHAR(500),
    backup_path_2 VARCHAR(500),
    is_favorite BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
    INDEX idx_user_files (user_id),
    INDEX idx_folder (folder_id),
    INDEX idx_deleted (is_deleted, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 3. SHARES TABLE
-- ============================================
CREATE TABLE shares (
    id INT PRIMARY KEY AUTO_INCREMENT,
    file_id INT DEFAULT NULL,
    folder_id INT DEFAULT NULL,
    shared_by INT NOT NULL,
    shared_with INT NOT NULL,
    permission ENUM('view', 'edit', 'download') DEFAULT 'view',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_with) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_shared_with (shared_with),
    INDEX idx_shared_by (shared_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 4. SHARED LINKS TABLE
-- ============================================
CREATE TABLE shared_links (
    id INT PRIMARY KEY AUTO_INCREMENT,
    file_id INT NOT NULL,
    share_token VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) DEFAULT NULL,
    max_downloads INT DEFAULT NULL,
    download_count INT DEFAULT 0,
    expires_at TIMESTAMP NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_share_token (share_token),
    INDEX idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 5. TRASH TABLE
-- ============================================
CREATE TABLE trash (
    id INT PRIMARY KEY AUTO_INCREMENT,
    file_id INT NOT NULL,
    original_folder_id INT DEFAULT NULL,
    deleted_by INT NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    auto_delete_at TIMESTAMP NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 6. ACTIVITY LOG TABLE
-- ============================================
CREATE TABLE activity_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    action_type ENUM('upload', 'download', 'delete', 'share', 'rename', 'move', 'restore') NOT NULL,
    target_type ENUM('file', 'folder') NOT NULL,
    target_id INT NOT NULL,
    target_name VARCHAR(255),
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_activity (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 7. INSERT DEFAULT ADMIN USER
-- Password: admin123 (you'll need to hash this properly)
-- ============================================
INSERT INTO users (username, email, password, storage_quota, storage_used) 
VALUES (
    'admin', 
    'admin@cloudshare.com', 
    '$2b$10$rQZpFnMpQxXx1yVNKvzOxeZPXvNzPJz5Q5y5zq5z5z5z5z5z5z5z5', 
    107374182400, 
    0
);

-- ============================================
-- VERIFY
-- ============================================
SELECT 'Schema created successfully!' as Status;
SHOW TABLES;
DESCRIBE users;
DESCRIBE folders;
DESCRIBE files;
DESCRIBE shares;
DESCRIBE shared_links;
DESCRIBE trash;
DESCRIBE activity_log;
select * from users;
