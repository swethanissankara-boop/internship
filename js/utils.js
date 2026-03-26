/* ============================================
   CLOUDSHARE - UTILITY FUNCTIONS
   ============================================ */

// API Base URL - Change this to your server IP
const API_BASE_URL = 'http://localhost:5000/api';

// ============================================
// LOCAL STORAGE HELPERS
// ============================================

// Save data to localStorage
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Error saving to storage:', error);
        return false;
    }
}

// Get data from localStorage
function getFromStorage(key) {
    const item = localStorage.getItem(key);
    
    // If nothing is found, return null
    if (!item) return null;

    try {
        // Try to parse it as a JSON object (for user data)
        return JSON.parse(item);
    } catch (error) {
        // If parsing fails (which it will for the raw JWT token), 
        // just return the raw string instead of throwing an error!
        return item;
    }
}
// Remove data from localStorage
function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Error removing from storage:', error);
        return false;
    }
}

// Clear all localStorage
function clearStorage() {
    try {
        localStorage.clear();
        return true;
    } catch (error) {
        console.error('Error clearing storage:', error);
        return false;
    }
}

// ============================================
// AUTHENTICATION HELPERS
// ============================================

// Get auth token
function getAuthToken() {
    return getFromStorage('token');
}

// Get current user
function getCurrentUser() {
    return getFromStorage('user');
}

// Check if user is logged in
function isLoggedIn() {
    const token = getAuthToken();
    const user = getCurrentUser();
    return token && user;
}

// Save auth data
function saveAuthData(token, user) {
    saveToStorage('token', token);
    saveToStorage('user', user);
}

// Clear auth data (logout)
function clearAuthData() {
    removeFromStorage('token');
    removeFromStorage('user');
}

// Check authentication and redirect if not logged in
function checkAuthentication() {
    const token = getAuthToken();
    const user = getCurrentUser();
    return !!(token && user);
}

// ============================================
// API REQUEST HELPERS
// ============================================

// Make API request with authentication
async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    
    const defaultHeaders = {
        'Content-Type': 'application/json'
    };
    
    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }
    
    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };
    
    // Don't set Content-Type for FormData (file uploads)
    if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

// GET request
async function apiGet(endpoint) {
    return apiRequest(endpoint, { method: 'GET' });
}

// POST request
async function apiPost(endpoint, body) {
    return apiRequest(endpoint, {
        method: 'POST',
        body: body instanceof FormData ? body : JSON.stringify(body)
    });
}

// PUT request
async function apiPut(endpoint, body) {
    return apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

// DELETE request
async function apiDelete(endpoint) {
    return apiRequest(endpoint, { method: 'DELETE' });
}

// ============================================
// FORMAT HELPERS
// ============================================

// Format file size (bytes to human readable)
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    
    if (diffMinutes < 1) {
        return 'Just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// Format date for display
function formatDateFull(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// ============================================
// FILE TYPE HELPERS
// ============================================

// Get file extension
function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
}

// Get file icon based on type
function getFileIcon(filename, isFolder = false) {
    if (isFolder) return '📁';
    
    const ext = getFileExtension(filename);
    
    const iconMap = {
        // Documents
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'txt': '📝',
        'rtf': '📝',
        
        // Spreadsheets
        'xls': '📊',
        'xlsx': '📊',
        'csv': '📊',
        
        // Presentations
        'ppt': '📊',
        'pptx': '📊',
        
        // Images
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🖼️',
        'bmp': '🖼️',
        'svg': '🖼️',
        'webp': '🖼️',
        
        // Videos
        'mp4': '📹',
        'avi': '📹',
        'mov': '📹',
        'wmv': '📹',
        'mkv': '📹',
        'webm': '📹',
        
        // Audio
        'mp3': '🎵',
        'wav': '🎵',
        'ogg': '🎵',
        'flac': '🎵',
        
        // Archives
        'zip': '📦',
        'rar': '📦',
        '7z': '📦',
        'tar': '📦',
        'gz': '📦',
        
        // Code
        'html': '💻',
        'css': '💻',
        'js': '💻',
        'json': '💻',
        'xml': '💻',
        'php': '💻',
        'py': '💻',
        'java': '💻',
        'c': '💻',
        'cpp': '💻',
        
        // Default
        'default': '📄'
    };
    
    return iconMap[ext] || iconMap['default'];
}

// Get file type category
function getFileCategory(filename) {
    const ext = getFileExtension(filename);
    
    const categories = {
        documents: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
        spreadsheets: ['xls', 'xlsx', 'csv', 'ods'],
        presentations: ['ppt', 'pptx', 'odp'],
        images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'],
        videos: ['mp4', 'avi', 'mov', 'wmv', 'mkv', 'webm', 'flv'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma'],
        archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
        code: ['html', 'css', 'js', 'json', 'xml', 'php', 'py', 'java', 'c', 'cpp', 'h']
    };
    
    for (const [category, extensions] of Object.entries(categories)) {
        if (extensions.includes(ext)) {
            return category;
        }
    }
    
    return 'other';
}

// Check if file is previewable
function isPreviewable(filename) {
    const ext = getFileExtension(filename);
    const previewable = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'pdf', 'txt', 'mp4', 'webm'];
    return previewable.includes(ext);
}

// ============================================
// UI HELPERS
// ============================================

// Show alert message
function showAlert(message, type = 'success', containerId = 'alertMessage') {
    const alertContainer = document.getElementById(containerId);
    if (!alertContainer) return;
    
    alertContainer.textContent = message;
    alertContainer.className = `alert alert-${type}`;
    alertContainer.style.display = 'block';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        alertContainer.style.display = 'none';
    }, 5000);
}

// Show success alert
function showSuccess(message, containerId) {
    showAlert(message, 'success', containerId);
}

// Show error alert
function showError(message, containerId) {
    showAlert(message, 'error', containerId);
}

// Show warning alert
function showWarning(message, containerId) {
    showAlert(message, 'warning', containerId);
}

// Toggle password visibility
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(inputId + '-icon');
    
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.textContent = '🙈';
    } else {
        input.type = 'password';
        if (icon) icon.textContent = '👁️';
    }
}

// Toggle element visibility
function toggleElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = element.style.display === 'none' ? 'block' : 'none';
    }
}

// Show element
function showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'block';
    }
}

// Hide element
function hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
    }
}

// Set button loading state
function setButtonLoading(buttonId, isLoading, loadingText = 'Loading...') {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
    } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Submit';
    }
}

// ============================================
// VALIDATION HELPERS
// ============================================

// Validate email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Validate password (min 8 chars)
function isValidPassword(password) {
    return password.length >= 8;
}

// Validate password strength
function getPasswordStrength(password) {
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength <= 2) return 'weak';
    if (strength <= 4) return 'medium';
    return 'strong';
}

// ============================================
// GENERATE HELPERS
// ============================================

// Generate unique ID
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Generate random string
function generateRandomString(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ============================================
// DEBOUNCE / THROTTLE
// ============================================

// Debounce function (delay execution)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function (limit execution rate)
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ============================================
// COPY TO CLIPBOARD
// ============================================

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        } finally {
            document.body.removeChild(textArea);
        }
    }
}

// ============================================
// CONFIRMATION DIALOG
// ============================================

function confirmAction(message) {
    return confirm(message);
}

// ============================================
// CONSOLE LOG FOR DEBUGGING
// ============================================

function log(message, data = null) {
    if (data) {
        console.log(`[CloudShare] ${message}:`, data);
    } else {
        console.log(`[CloudShare] ${message}`);
    }
}

function logError(message, error = null) {
    if (error) {
        console.error(`[CloudShare Error] ${message}:`, error);
    } else {
        console.error(`[CloudShare Error] ${message}`);
    }
}