function getApiBaseUrl() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    if (port) {
        return `${protocol}//${hostname}:${port}/api`;
    }
    return `${protocol}//${hostname}/api`;
}

const API_BASE_URL = getApiBaseUrl();
console.log('[CloudShare] API URL:', API_BASE_URL);

function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Error saving to storage:', error);
        return false;
    }
}

function getFromStorage(key) {
    const item = localStorage.getItem(key);
    if (!item) return null;
    try {
        return JSON.parse(item);
    } catch (error) {
        return item;
    }
}

function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Error removing from storage:', error);
        return false;
    }
}

function clearStorage() {
    try {
        localStorage.clear();
        return true;
    } catch (error) {
        console.error('Error clearing storage:', error);
        return false;
    }
}

function getAuthToken() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    let cleanToken = token;
    if (cleanToken.startsWith('"') && cleanToken.endsWith('"')) {
        cleanToken = cleanToken.slice(1, -1);
    }
    return cleanToken;
}

function getCurrentUser() {
    return getFromStorage('user');
}

function isLoggedIn() {
    const token = getAuthToken();
    const user = getCurrentUser();
    return token && user;
}

function saveAuthData(token, user) {
    console.log('[Auth] Saving auth data...');
    if (typeof token === 'string') {
        localStorage.setItem('token', token);
    } else {
        localStorage.setItem('token', JSON.stringify(token));
    }
    if (typeof user === 'string') {
        localStorage.setItem('user', user);
    } else {
        localStorage.setItem('user', JSON.stringify(user));
    }
    console.log('[Auth] Auth data saved successfully');
}

function clearAuthData() {
    removeFromStorage('token');
    removeFromStorage('user');
}

function checkAuthentication() {
    const token = getAuthToken();
    const user = getCurrentUser();
    console.log('[Auth] Checking authentication...');
    console.log('[Auth] Token exists:', !!token);
    console.log('[Auth] User exists:', !!user);
    if (!token || !user) {
        console.log('[Auth] Not authenticated, redirecting to login...');
        const currentPage = window.location.pathname;
        const publicPages = ['/login.html', '/register.html', '/index.html', '/', '/public-share.html'];
        if (!publicPages.some(page => currentPage.endsWith(page))) {
            window.location.href = 'login.html';
        }
        return false;
    }
    if (typeof token === 'string' && token.split('.').length === 3) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                console.log('[Auth] Token expired, clearing and redirecting...');
                clearAuthData();
                window.location.href = 'login.html';
                return false;
            }
            console.log('[Auth] Token valid, expires:', new Date(payload.exp * 1000).toLocaleString());
        } catch (e) {
            console.warn('[Auth] Could not decode token:', e.message);
        }
    }
    return true;
}

function checkAuth() {
    const token = getAuthToken();
    const user = getCurrentUser();
    if (!token || !user) {
        console.log('Not authenticated, redirecting to login...');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

function logout() {
    clearAuthData();
    window.location.href = 'login.html';
}

async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();
    const defaultHeaders = { 'Content-Type': 'application/json' };
    if (token) defaultHeaders['Authorization'] = `Bearer ${token}`;
    const config = { ...options, headers: { ...defaultHeaders, ...options.headers } };
    if (options.body instanceof FormData) delete config.headers['Content-Type'];
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log('[API]', config.method || 'GET', url);
        const response = await fetch(url, config);
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            return { success: true };
        }
        const data = await response.json();
        if (response.status === 401) {
            console.warn('[API] Token invalid or missing, redirecting to login');
            clearAuthData();
            if (!window.location.pathname.includes('login')) window.location.href = 'login.html';
            return null;
        }
        if (response.status === 403) {
            console.warn('[API] 403 Forbidden:', data.message);
            if (data.message && data.message.includes('token')) {
                console.warn('[API] Token expired or invalid, redirecting to login');
                clearAuthData();
                if (!window.location.pathname.includes('login')) window.location.href = 'login.html';
                return null;
            }
            throw new Error(data.message || 'Access denied');
        }
        if (!response.ok) throw new Error(data.message || 'Request failed');
        return data;
    } catch (error) {
        console.error('[API] Request Error:', error);
        throw error;
    }
}

async function apiGet(endpoint) { return apiRequest(endpoint, { method: 'GET' }); }
async function apiPost(endpoint, body) {
    return apiRequest(endpoint, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) });
}
async function apiPut(endpoint, body) {
    return apiRequest(endpoint, { method: 'PUT', body: JSON.stringify(body) });
}
async function apiDelete(endpoint, body) {
    const options = { method: 'DELETE' };
    if (body) options.body = JSON.stringify(body);
    return apiRequest(endpoint, options);
}
async function apiPostFormData(endpoint, formData) {
    const token = getAuthToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
        const url = `${API_BASE_URL}${endpoint}`;
        console.log('[API] POST FormData', url);
        const response = await fetch(url, { method: 'POST', headers: headers, body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Request failed');
        return data;
    } catch (error) {
        console.error('[API] FormData Request Error:', error);
        throw error;
    }
}

function getApiBase() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    if (port) return `${protocol}//${hostname}:${port}`;
    return `${protocol}//${hostname}`;
}

function formatFileSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateFull(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getFileExtension(filename) {
    if (!filename) return '';
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
}

function getFileIcon(filename, isFolder = false) {
    if (isFolder) return '📁';
    if (!filename) return '📄';
    const ext = getFileExtension(filename);
    const iconMap = {
        'pdf': '📄', 'doc': '📝', 'docx': '📝', 'txt': '📝', 'rtf': '📝',
        'xls': '📊', 'xlsx': '📊', 'csv': '📊', 'ppt': '📊', 'pptx': '📊',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'bmp': '🖼️', 'svg': '🖼️', 'webp': '🖼️',
        'mp4': '📹', 'avi': '📹', 'mov': '📹', 'wmv': '📹', 'mkv': '📹', 'webm': '📹',
        'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
        'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
        'html': '💻', 'css': '💻', 'js': '💻', 'json': '💻', 'xml': '💻',
        'php': '💻', 'py': '💻', 'java': '💻', 'c': '💻', 'cpp': '💻'
    };
    return iconMap[ext] || '📄';
}

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
        if (extensions.includes(ext)) return category;
    }
    return 'other';
}

function isPreviewable(filename) {
    const ext = getFileExtension(filename);
    const previewable = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'pdf', 'txt', 'mp4', 'webm'];
    return previewable.includes(ext);
}

function showAlert(message, type = 'success', containerId = 'alertMessage') {
    const alertContainer = document.getElementById(containerId);
    if (!alertContainer) return;
    alertContainer.textContent = message;
    alertContainer.className = `alert alert-${type}`;
    alertContainer.style.display = 'block';
    setTimeout(() => { alertContainer.style.display = 'none'; }, 5000);
}

function showSuccess(message, containerId) { showAlert(message, 'success', containerId); }
function showError(message, containerId) { showAlert(message, 'error', containerId); }
function showWarning(message, containerId) { showAlert(message, 'warning', containerId); }

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

function toggleElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.style.display = element.style.display === 'none' ? 'block' : 'none';
}

function showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.style.display = 'block';
}

function hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.style.display = 'none';
}

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

function loadUserInfo() {
    const user = getCurrentUser();
    if (user) {
        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        if (userNameEl) userNameEl.textContent = user.username || user.name || 'User';
        if (userEmailEl) userEmailEl.textContent = user.email || '';
    }
}

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isValidPassword(password) { return password.length >= 8; }

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

function generateUniqueId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function generateRandomString(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

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

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (error) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        try { document.execCommand('copy'); return true; }
        catch (err) { console.error('Failed to copy:', err); return false; }
        finally { document.body.removeChild(textArea); }
    }
}

function confirmAction(message) { return confirm(message); }

function log(message, data = null) {
    if (data) console.log(`[CloudShare] ${message}:`, data);
    else console.log(`[CloudShare] ${message}`);
}

function logError(message, error = null) {
    if (error) console.error(`[CloudShare Error] ${message}:`, error);
    else console.error(`[CloudShare Error] ${message}`);
}

function showNotification(message, type = 'info', duration = 4000) {
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    const icons = { 'success': '✅', 'error': '❌', 'warning': '⚠️', 'info': 'ℹ️' };
    notification.innerHTML = `
        <span class="notification-icon">${icons[type] || icons.info}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(notification);
    if (duration > 0) {
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.add('notification-fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, duration);
    }
    return notification;
}

(function injectNotificationStyles() {
    if (document.getElementById('notification-styles')) return;
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        .notification-container { position: fixed; top: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; max-width: 400px; }
        .notification { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); animation: notification-slide-in 0.3s ease-out; background: white; border-left: 4px solid #007bff; }
        .notification-success { border-left-color: #28a745; background: #d4edda; }
        .notification-error { border-left-color: #dc3545; background: #f8d7da; }
        .notification-warning { border-left-color: #ffc107; background: #fff3cd; }
        .notification-info { border-left-color: #007bff; background: #d1ecf1; }
        .notification-icon { font-size: 1.25rem; flex-shrink: 0; }
        .notification-message { flex: 1; font-size: 0.95rem; color: #333; }
        .notification-close { background: none; border: none; font-size: 1.5rem; color: #666; cursor: pointer; padding: 0; line-height: 1; opacity: 0.6; }
        .notification-close:hover { opacity: 1; }
        .notification-fade-out { animation: notification-fade-out 0.3s ease-out forwards; }
        @keyframes notification-slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes notification-fade-out { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
})();
