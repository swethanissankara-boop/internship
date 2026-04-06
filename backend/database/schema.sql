-- ============================================
-- CLOUDSHARE DATABASE SCHEMA - COMPLETE FIX
-- STORAGE UPDATES FOR FILES AND FOLDERS
-- ============================================

CREATE DATABASE IF NOT EXISTS cloudshare;
USE cloudshare;

-- Disable foreign key checks
SET FOREIGN_KEY_CHECKS = 0;

-- Drop all existing tables
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS favorites;
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
-- 0. USERS TABLE
-- ============================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(500) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    bio TEXT DEFAULT NULL,
    storage_quota BIGINT DEFAULT 107374182400,
    storage_used BIGINT DEFAULT 0,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY (email),
    UNIQUE KEY (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 0.1 USER SETTINGS TABLE
-- ============================================
CREATE TABLE user_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    
    -- Notification Settings
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    notify_on_share BOOLEAN DEFAULT TRUE,
    notify_on_upload BOOLEAN DEFAULT TRUE,
    notify_on_download BOOLEAN DEFAULT FALSE,
    
    -- Privacy Settings
    profile_visibility ENUM('public', 'private', 'friends') DEFAULT 'private',
    show_email BOOLEAN DEFAULT FALSE,
    allow_public_shares BOOLEAN DEFAULT TRUE,
    
    -- Display Settings
    theme ENUM('light', 'dark', 'auto') DEFAULT 'light',
    language VARCHAR(10) DEFAULT 'en',
    items_per_page INT DEFAULT 20,
    default_view ENUM('grid', 'list') DEFAULT 'grid',
    
    -- Storage Settings
    auto_delete_trash_days INT DEFAULT 30,
    auto_backup BOOLEAN DEFAULT TRUE,
    compress_uploads BOOLEAN DEFAULT FALSE,
    
    -- Security Settings
    session_timeout INT DEFAULT 30,
    require_password_change BOOLEAN DEFAULT FALSE,
    password_changed_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_settings (user_id)
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
    color VARCHAR(20) DEFAULT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    deleted_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_folder (user_id, parent_id),
    INDEX idx_deleted (is_deleted, deleted_at)
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
    thumbnail_path VARCHAR(500) DEFAULT NULL,
    download_count INT DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    deleted_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user_files (user_id),
    INDEX idx_folder (folder_id),
    INDEX idx_deleted (is_deleted, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 3. FAVORITES TABLE
-- ============================================
CREATE TABLE favorites (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    item_type ENUM('file', 'folder') NOT NULL,
    file_id INT DEFAULT NULL,
    folder_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    UNIQUE KEY unique_favorite (user_id, item_type, file_id, folder_id),
    INDEX idx_user_favorites (user_id, item_type),
    INDEX idx_file (file_id),
    INDEX idx_folder (folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 4. SHARES TABLE (User-to-User Sharing)
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
    INDEX idx_shared_by (shared_by),
    INDEX idx_file (file_id),
    INDEX idx_folder (folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 5. SHARED LINKS TABLE (Public Sharing)
-- ============================================
CREATE TABLE shared_links (
    id INT PRIMARY KEY AUTO_INCREMENT,
    file_id INT DEFAULT NULL,
    folder_id INT DEFAULT NULL,
    share_token VARCHAR(100) UNIQUE NOT NULL,
    share_type ENUM('file', 'folder') NOT NULL,
    password VARCHAR(255) DEFAULT NULL,
    max_downloads INT DEFAULT NULL,
    download_count INT DEFAULT 0,
    max_views INT DEFAULT NULL,
    view_count INT DEFAULT 0,
    expires_at TIMESTAMP NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at DATETIME DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_share_token (share_token),
    INDEX idx_created_by (created_by),
    INDEX idx_file (file_id),
    INDEX idx_folder (folder_id),
    INDEX idx_type (share_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 6. TRASH TABLE
-- ============================================
CREATE TABLE trash (
    id INT PRIMARY KEY AUTO_INCREMENT,
    item_type ENUM('file', 'folder') NOT NULL,
    file_id INT DEFAULT NULL,
    folder_id INT DEFAULT NULL,
    original_folder_id INT DEFAULT NULL,
    original_name VARCHAR(255),
    original_path VARCHAR(1000),
    size BIGINT DEFAULT 0,
    deleted_by INT NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    auto_delete_at TIMESTAMP NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_deleted_by (deleted_by),
    INDEX idx_item_type (item_type),
    INDEX idx_file (file_id),
    INDEX idx_folder (folder_id),
    INDEX idx_auto_delete (auto_delete_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 7. ACTIVITY LOG TABLE
-- ============================================
CREATE TABLE activity_log (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    action_type ENUM('upload', 'download', 'delete', 'share', 'rename', 'move', 'restore', 'create_folder', 'delete_folder', 'add_favorite', 'remove_favorite', 'permanent_delete', 'settings_update', 'profile_update') NOT NULL,
    target_type ENUM('file', 'folder', 'user', 'settings') NOT NULL,
    target_id INT NOT NULL,
    target_name VARCHAR(255),
    details TEXT,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_activity (user_id, created_at),
    INDEX idx_action (action_type),
    INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- 8. INSERT DEFAULT ADMIN USER
-- ============================================
INSERT INTO users (username, email, password, storage_quota, storage_used) 
VALUES (
    'admin', 
    'admin@cloudshare.com', 
    '$2b$10$rQZpFnMpQxXx1yVNKvzOxeZPXvNzPJz5Q5y5zq5z5z5z5z5z5z5z5', 
    107374182400, 
    0
);

INSERT INTO user_settings (user_id) VALUES (1);

-- ============================================
-- 9. DROP ALL EXISTING PROCEDURES
-- ============================================
DROP PROCEDURE IF EXISTS GetFolderFiles;
DROP PROCEDURE IF EXISTS MoveToTrash;
DROP PROCEDURE IF EXISTS RestoreFromTrash;
DROP PROCEDURE IF EXISTS PermanentDelete;
DROP PROCEDURE IF EXISTS AutoDeleteOldTrash;
DROP PROCEDURE IF EXISTS GetUserFavorites;
DROP PROCEDURE IF EXISTS GetTrashItems;
DROP PROCEDURE IF EXISTS CalculateFolderSize;

DELIMITER //

-- ============================================
-- HELPER: Calculate total size of a folder (all files + subfolders)
-- ============================================
CREATE PROCEDURE CalculateFolderSize(
    IN p_folder_id INT,
    IN p_user_id INT,
    OUT p_total_size BIGINT
)
BEGIN
    -- Get total size of all files in folder and all subfolders recursively
    WITH RECURSIVE folder_tree AS (
        -- Start with the given folder
        SELECT id FROM folders WHERE id = p_folder_id AND user_id = p_user_id
        UNION ALL
        -- Add all subfolders recursively
        SELECT f.id FROM folders f
        INNER JOIN folder_tree ft ON f.parent_id = ft.id
        WHERE f.user_id = p_user_id
    )
    SELECT COALESCE(SUM(files.size), 0) INTO p_total_size
    FROM files
    WHERE files.folder_id IN (SELECT id FROM folder_tree) 
    AND files.is_deleted = FALSE
    AND files.user_id = p_user_id;
END //

-- ============================================
-- MOVE TO TRASH - FILES AND FOLDERS
-- ✅ Updates storage IMMEDIATELY
-- ============================================
CREATE PROCEDURE MoveToTrash(
    IN p_item_type ENUM('file', 'folder'),
    IN p_item_id INT,
    IN p_user_id INT,
    IN p_auto_delete_days INT
)
BEGIN
    DECLARE v_name VARCHAR(255);
    DECLARE v_path VARCHAR(1000);
    DECLARE v_folder_id INT;
    DECLARE v_size BIGINT DEFAULT 0;
    DECLARE v_auto_delete_at TIMESTAMP;
    DECLARE v_file_count INT DEFAULT 0;
    
    -- Error handling
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT 'Error' as status, 0 as freed_space;
    END;
    
    START TRANSACTION;
    
    -- Calculate auto delete date
    SET v_auto_delete_at = DATE_ADD(NOW(), INTERVAL p_auto_delete_days DAY);
    
    -- ============================================
    -- HANDLE FILE DELETION
    -- ============================================
    IF p_item_type = 'file' THEN
        -- Get file details
        SELECT original_name, folder_id, size 
        INTO v_name, v_folder_id, v_size
        FROM files 
        WHERE id = p_item_id AND user_id = p_user_id AND is_deleted = FALSE;
        
        -- Check if file exists
        IF v_name IS NULL THEN
            ROLLBACK;
            SELECT 'Error: File not found' as status, 0 as freed_space;
        ELSE
            -- Mark file as deleted
            UPDATE files 
            SET is_deleted = TRUE, 
                deleted_at = NOW(), 
                deleted_by = p_user_id
            WHERE id = p_item_id AND user_id = p_user_id;
            
            -- ✅ UPDATE USER STORAGE IMMEDIATELY
            UPDATE users 
            SET storage_used = GREATEST(0, storage_used - v_size) 
            WHERE id = p_user_id;
            
            -- Insert into trash table
            INSERT INTO trash (
                item_type, 
                file_id, 
                original_folder_id, 
                original_name, 
                size, 
                deleted_by, 
                auto_delete_at
            ) VALUES (
                'file', 
                p_item_id, 
                v_folder_id, 
                v_name, 
                v_size, 
                p_user_id, 
                v_auto_delete_at
            );
            
            -- Log activity
            INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
            VALUES (p_user_id, 'delete', 'file', p_item_id, v_name, 
                    JSON_OBJECT('size', v_size, 'freed_space', v_size));
            
            COMMIT;
            SELECT 'Success' as status, v_size as freed_space;
        END IF;
        
    -- ============================================
    -- HANDLE FOLDER DELETION
    -- ============================================
    ELSE
        -- Get folder details
        SELECT name, path, parent_id 
        INTO v_name, v_path, v_folder_id
        FROM folders 
        WHERE id = p_item_id AND user_id = p_user_id AND is_deleted = FALSE;
        
        -- Check if folder exists
        IF v_name IS NULL THEN
            ROLLBACK;
            SELECT 'Error: Folder not found' as status, 0 as freed_space;
        ELSE
            -- ✅ Calculate TOTAL size of ALL files in folder AND subfolders
            WITH RECURSIVE folder_tree AS (
                SELECT id FROM folders WHERE id = p_item_id AND user_id = p_user_id
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
                WHERE f.user_id = p_user_id
            )
            SELECT COALESCE(SUM(size), 0), COUNT(*) 
            INTO v_size, v_file_count
            FROM files
            WHERE folder_id IN (SELECT id FROM folder_tree) 
            AND is_deleted = FALSE
            AND user_id = p_user_id;
            
            -- Mark folder and ALL subfolders as deleted
            WITH RECURSIVE folder_tree AS (
                SELECT id FROM folders WHERE id = p_item_id AND user_id = p_user_id
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
                WHERE f.user_id = p_user_id
            )
            UPDATE folders 
            SET is_deleted = TRUE, 
                deleted_at = NOW(), 
                deleted_by = p_user_id
            WHERE id IN (SELECT id FROM folder_tree);
            
            -- Mark ALL files in folder and subfolders as deleted
            WITH RECURSIVE folder_tree AS (
                SELECT id FROM folders WHERE id = p_item_id AND user_id = p_user_id
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
                WHERE f.user_id = p_user_id
            )
            UPDATE files 
            SET is_deleted = TRUE, 
                deleted_at = NOW(), 
                deleted_by = p_user_id
            WHERE folder_id IN (SELECT id FROM folder_tree) AND user_id = p_user_id;
            
            -- ✅ UPDATE USER STORAGE IMMEDIATELY (total size of all files in folder)
            UPDATE users 
            SET storage_used = GREATEST(0, storage_used - v_size) 
            WHERE id = p_user_id;
            
            -- Insert folder into trash table
            INSERT INTO trash (
                item_type, 
                folder_id, 
                original_folder_id, 
                original_name, 
                original_path, 
                size, 
                deleted_by, 
                auto_delete_at
            ) VALUES (
                'folder', 
                p_item_id, 
                v_folder_id, 
                v_name, 
                v_path, 
                v_size, 
                p_user_id, 
                v_auto_delete_at
            );
            
            -- Log activity
            INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
            VALUES (p_user_id, 'delete', 'folder', p_item_id, v_name, 
                    JSON_OBJECT('size', v_size, 'file_count', v_file_count, 'freed_space', v_size));
            
            COMMIT;
            SELECT 'Success' as status, v_size as freed_space, v_file_count as files_deleted;
        END IF;
    END IF;
END //

-- ============================================
-- RESTORE FROM TRASH - FILES AND FOLDERS
-- ✅ Adds storage back when restoring
-- ============================================
CREATE PROCEDURE RestoreFromTrash(
    IN p_trash_id INT,
    IN p_user_id INT
)
BEGIN
    DECLARE v_item_type ENUM('file', 'folder');
    DECLARE v_file_id INT;
    DECLARE v_folder_id INT;
    DECLARE v_original_name VARCHAR(255);
    DECLARE v_size BIGINT DEFAULT 0;
    
    -- Error handling
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT 'Error' as status;
    END;
    
    START TRANSACTION;
    
    -- Get trash item details
    SELECT item_type, file_id, folder_id, original_name, size
    INTO v_item_type, v_file_id, v_folder_id, v_original_name, v_size
    FROM trash 
    WHERE id = p_trash_id AND deleted_by = p_user_id;
    
    -- Check if item exists
    IF v_original_name IS NULL THEN
        ROLLBACK;
        SELECT 'Error: Item not found in trash' as status;
    ELSE
        -- ============================================
        -- RESTORE FILE
        -- ============================================
        IF v_item_type = 'file' THEN
            -- Restore file
            UPDATE files 
            SET is_deleted = FALSE, 
                deleted_at = NULL, 
                deleted_by = NULL
            WHERE id = v_file_id AND user_id = p_user_id;
            
        -- ============================================
        -- RESTORE FOLDER (and all contents)
        -- ============================================
        ELSE
            -- Restore folder and ALL subfolders
            WITH RECURSIVE folder_tree AS (
                SELECT id FROM folders WHERE id = v_folder_id AND user_id = p_user_id
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
                WHERE f.user_id = p_user_id
            )
            UPDATE folders 
            SET is_deleted = FALSE, 
                deleted_at = NULL, 
                deleted_by = NULL
            WHERE id IN (SELECT id FROM folder_tree);
            
            -- Restore ALL files in folder and subfolders
            WITH RECURSIVE folder_tree AS (
                SELECT id FROM folders WHERE id = v_folder_id AND user_id = p_user_id
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
                WHERE f.user_id = p_user_id
            )
            UPDATE files 
            SET is_deleted = FALSE, 
                deleted_at = NULL, 
                deleted_by = NULL
            WHERE folder_id IN (SELECT id FROM folder_tree) AND user_id = p_user_id;
        END IF;
        
        -- ✅ ADD STORAGE BACK (for both files and folders)
        UPDATE users 
        SET storage_used = storage_used + v_size 
        WHERE id = p_user_id;
        
        -- Remove from trash
        DELETE FROM trash WHERE id = p_trash_id;
        
        -- Log activity
        INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
        VALUES (p_user_id, 'restore', v_item_type, COALESCE(v_file_id, v_folder_id), v_original_name,
                JSON_OBJECT('size', v_size, 'restored_space', v_size));
        
        COMMIT;
        SELECT 'Success' as status, v_size as restored_space;
    END IF;
END //

-- ============================================
-- PERMANENT DELETE FROM TRASH
-- ❌ No storage update (already freed when moved to trash)
-- ============================================
CREATE PROCEDURE PermanentDelete(
    IN p_trash_id INT,
    IN p_user_id INT
)
BEGIN
    DECLARE v_item_type ENUM('file', 'folder');
    DECLARE v_file_id INT;
    DECLARE v_folder_id INT;
    DECLARE v_size BIGINT DEFAULT 0;
    DECLARE v_original_name VARCHAR(255);
    
    -- Error handling
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT 'Error' as status, 0 as freed_space;
    END;
    
    START TRANSACTION;
    
    -- Get trash item details
    SELECT item_type, file_id, folder_id, size, original_name
    INTO v_item_type, v_file_id, v_folder_id, v_size, v_original_name
    FROM trash 
    WHERE id = p_trash_id AND deleted_by = p_user_id;
    
    -- Check if item exists
    IF v_original_name IS NULL THEN
        ROLLBACK;
        SELECT 'Error: Item not found in trash' as status, 0 as freed_space;
    ELSE
        -- ============================================
        -- PERMANENTLY DELETE FILE
        -- ============================================
        IF v_item_type = 'file' THEN
            DELETE FROM files WHERE id = v_file_id;
            
        -- ============================================
        -- PERMANENTLY DELETE FOLDER (and all contents)
        -- ============================================
        ELSE
            -- Delete all files in folder and subfolders
            WITH RECURSIVE folder_tree AS (
                SELECT id FROM folders WHERE id = v_folder_id
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
            )
            DELETE FROM files WHERE folder_id IN (SELECT id FROM folder_tree);
            
            -- Delete all subfolders and the folder itself
            WITH RECURSIVE folder_tree AS (
                SELECT id FROM folders WHERE id = v_folder_id
                UNION ALL
                SELECT f.id FROM folders f
                INNER JOIN folder_tree ft ON f.parent_id = ft.id
            )
            DELETE FROM folders WHERE id IN (SELECT id FROM folder_tree);
        END IF;
        
        -- Remove from trash
        DELETE FROM trash WHERE id = p_trash_id;
        
        -- ❌ DON'T UPDATE STORAGE (already freed when moved to trash)
        
        -- Log activity
        INSERT INTO activity_log (user_id, action_type, target_type, target_id, target_name, details)
        VALUES (p_user_id, 'permanent_delete', v_item_type, COALESCE(v_file_id, v_folder_id), v_original_name,
                JSON_OBJECT('size', v_size));
        
        COMMIT;
        SELECT 'Success' as status, v_size as freed_space;
    END IF;
END //

-- ============================================
-- AUTO DELETE OLD TRASH ITEMS
-- ❌ No storage update (already freed when moved to trash)
-- ============================================
CREATE PROCEDURE AutoDeleteOldTrash()
BEGIN
    DECLARE deleted_count INT DEFAULT 0;
    DECLARE total_size BIGINT DEFAULT 0;
    
    -- Error handling
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SELECT 0 as items_deleted, 0 as total_size;
    END;
    
    START TRANSACTION;
    
    -- Create temp table with items to delete
    CREATE TEMPORARY TABLE IF NOT EXISTS items_to_delete AS
    SELECT id, item_type, file_id, folder_id, size, deleted_by
    FROM trash 
    WHERE auto_delete_at IS NOT NULL AND auto_delete_at <= NOW();
    
    -- Get counts
    SELECT COUNT(*), COALESCE(SUM(size), 0) 
    INTO deleted_count, total_size 
    FROM items_to_delete;
    
    -- Delete files from items_to_delete
    DELETE f FROM files f
    INNER JOIN items_to_delete itd ON f.id = itd.file_id
    WHERE itd.item_type = 'file';
    
    -- Delete folders from items_to_delete (including all subfolders)
    DELETE fld FROM folders fld
    INNER JOIN items_to_delete itd ON fld.id = itd.folder_id
    WHERE itd.item_type = 'folder';
    
    -- Delete from trash table
    DELETE FROM trash WHERE id IN (SELECT id FROM items_to_delete);
    
    -- ❌ DON'T UPDATE STORAGE (already freed when moved to trash)
    
    DROP TEMPORARY TABLE IF EXISTS items_to_delete;
    
    COMMIT;
    
    SELECT deleted_count as items_deleted, total_size as total_size;
END //

-- ============================================
-- GET FOLDER FILES (RECURSIVE)
-- ============================================
CREATE PROCEDURE GetFolderFiles(IN folder_id INT)
BEGIN
    WITH RECURSIVE folder_tree AS (
        SELECT id FROM folders WHERE id = folder_id
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN folder_tree ft ON f.parent_id = ft.id
    )
    SELECT files.* FROM files
    INNER JOIN folder_tree ON files.folder_id = folder_tree.id
    WHERE files.is_deleted = FALSE;
END //

-- ============================================
-- GET USER FAVORITES
-- ============================================
CREATE PROCEDURE GetUserFavorites(IN p_user_id INT)
BEGIN
    SELECT 
        f.id,
        f.item_type,
        f.created_at as favorited_at,
        CASE 
            WHEN f.item_type = 'file' THEN files.id
            WHEN f.item_type = 'folder' THEN folders.id
        END as item_id,
        CASE 
            WHEN f.item_type = 'file' THEN files.original_name
            WHEN f.item_type = 'folder' THEN folders.name
        END as name,
        CASE 
            WHEN f.item_type = 'file' THEN files.size
            ELSE NULL
        END as size,
        CASE 
            WHEN f.item_type = 'file' THEN files.mime_type
            ELSE NULL
        END as mime_type,
        CASE 
            WHEN f.item_type = 'file' THEN files.created_at
            WHEN f.item_type = 'folder' THEN folders.created_at
        END as created_at
    FROM favorites f
    LEFT JOIN files ON f.file_id = files.id AND f.item_type = 'file'
    LEFT JOIN folders ON f.folder_id = folders.id AND f.item_type = 'folder'
    WHERE f.user_id = p_user_id
    AND (
        (f.item_type = 'file' AND files.is_deleted = FALSE) OR
        (f.item_type = 'folder' AND folders.is_deleted = FALSE)
    )
    ORDER BY f.created_at DESC;
END //

-- ============================================
-- GET TRASH ITEMS
-- ============================================
CREATE PROCEDURE GetTrashItems(IN p_user_id INT)
BEGIN
    SELECT 
        t.id as trash_id,
        t.item_type,
        t.original_name,
        t.original_path,
        t.size,
        t.deleted_at,
        t.auto_delete_at,
        CASE 
            WHEN t.item_type = 'file' THEN t.file_id
            WHEN t.item_type = 'folder' THEN t.folder_id
        END as item_id,
        CASE 
            WHEN t.item_type = 'file' THEN files.mime_type
            ELSE NULL
        END as mime_type,
        CASE 
            WHEN t.item_type = 'file' THEN files.storage_path
            WHEN t.item_type = 'folder' THEN folders.path
        END as path,
        DATEDIFF(t.auto_delete_at, NOW()) as days_until_deletion
    FROM trash t
    LEFT JOIN files ON t.file_id = files.id AND t.item_type = 'file'
    LEFT JOIN folders ON t.folder_id = folders.id AND t.item_type = 'folder'
    WHERE t.deleted_by = p_user_id
    ORDER BY t.deleted_at DESC;
END //

DELIMITER ;

-- ============================================
-- 10. TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS after_user_insert;

DELIMITER //

CREATE TRIGGER after_user_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    INSERT INTO user_settings (user_id) VALUES (NEW.id);
END //

DELIMITER ;

-- ============================================
-- 11. EVENTS FOR AUTO-CLEANUP
-- ============================================

SET GLOBAL event_scheduler = ON;

DROP EVENT IF EXISTS auto_cleanup_trash;

DELIMITER //

CREATE EVENT IF NOT EXISTS auto_cleanup_trash
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO
BEGIN
    CALL AutoDeleteOldTrash();
END //

DELIMITER ;

-- ============================================
-- 12. VERIFY INSTALLATION
-- ============================================

SELECT '========================================' as '';
SELECT '✅ CLOUDSHARE DATABASE SCHEMA INSTALLED' as Status;
SELECT '========================================' as '';

SELECT '' as '';
SELECT '📋 TABLES CREATED:' as Info;
SHOW TABLES;

SELECT '' as '';
SELECT '📊 STORAGE UPDATE LOGIC:' as Info;
SELECT '┌─────────────────────────────────────────────────────────────┐' as '';
SELECT '│ ACTION                    │ STORAGE UPDATE                 │' as '';
SELECT '├─────────────────────────────────────────────────────────────┤' as '';
SELECT '│ Delete FILE → Trash       │ ✅ Freed IMMEDIATELY           │' as '';
SELECT '│ Delete FOLDER → Trash     │ ✅ All file sizes freed        │' as '';
SELECT '│ Restore FILE from Trash   │ ✅ Storage added back          │' as '';
SELECT '│ Restore FOLDER from Trash │ ✅ All file sizes added back   │' as '';
SELECT '│ Permanent Delete          │ ❌ No change (already freed)   │' as '';
SELECT '│ Auto-Delete (30 days)     │ ❌ No change (already freed)   │' as '';
SELECT '└─────────────────────────────────────────────────────────────┘' as '';

SELECT '' as '';
SELECT '👤 DEFAULT USER:' as Info;
SELECT id, username, email, storage_quota, storage_used FROM users;

SELECT '' as '';
SELECT '✅ ALL DONE! Storage updates work for both FILES and FOLDERS.' as Status;
