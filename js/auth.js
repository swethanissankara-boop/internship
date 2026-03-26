/* ============================================
   CLOUDSHARE - AUTHENTICATION
   ============================================ */

// ============================================
// API CONFIGURATION (Dynamic URL)
// ============================================
const getAPIUrl = () => {
    const hostname = window.location.hostname;
    const port = 5000;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `http://localhost:${port}/api`;
    } else {
        return `http://${hostname}:${port}/api`;
    }
};

const API_URL = getAPIUrl();
console.log('[CloudShare Auth] API URL:', API_URL);

// ============================================
// INITIALIZE PAGES
// ============================================

// Initialize Register Page
function initializeRegisterPage() {
    log('Initializing register page');

    if (isLoggedIn()) {
        window.location.href = '/dashboard.html';
        return;
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    setupPasswordToggles();
}

// Initialize Login Page
function initializeLoginPage() {
    log('Initializing login page');

    if (isLoggedIn()) {
        window.location.href = '/dashboard.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    setupPasswordToggles();
}

// Setup password toggle buttons
function setupPasswordToggles() {
    const toggleButtons = document.querySelectorAll('.toggle-password');
    toggleButtons.forEach(button => {
        button.addEventListener('click', function () {
            const input = this.previousElementSibling;
            const iconSpan = this.querySelector('span');
            if (!input || !iconSpan) return;

            if (input.type === 'password') {
                input.type = 'text';
                iconSpan.textContent = '🙈';
            } else {
                input.type = 'password';
                iconSpan.textContent = '👁️';
            }
        });
    });
}

// ============================================
// REGISTRATION
// ============================================

async function handleRegister(event) {
    event.preventDefault();
    log('Handling registration...');

    const name = document.getElementById('name')?.value.trim() || document.getElementById('username')?.value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms')?.checked || false;

    if (!name) return showError('Please enter your name', 'alertMessage');
    if (!isValidEmail(email)) return showError('Please enter a valid email', 'alertMessage');
    if (!isValidPassword(password)) return showError('Password must be at least 8 characters', 'alertMessage');
    if (password !== confirmPassword) return showError('Passwords do not match', 'alertMessage');
    if (!terms) return showError('Please accept the Terms & Conditions', 'alertMessage');

    setButtonLoading('registerBtn', true, 'Creating Account...');

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: name, email, password })
        });

        const data = await response.json();
        log('Registration response:', data);

        if (data.success) {
            saveAuthData(data.token, data.user);
            showSuccess('Account created successfully! Redirecting...', 'alertMessage');
            setTimeout(() => window.location.href = '/dashboard.html', 1500);
        } else {
            showError(data.message || 'Registration failed', 'alertMessage');
        }
    } catch (error) {
        logError('Registration error', error);
        showError(error.message || 'Registration failed. Try again.', 'alertMessage');
    } finally {
        setButtonLoading('registerBtn', false, 'Create Account');
    }
}

// ============================================
// LOGIN
// ============================================

async function handleLogin(event) {
    event.preventDefault();
    log('Handling login...');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember')?.checked || false;

    if (!isValidEmail(email)) return showError('Please enter a valid email', 'alertMessage');
    if (!password) return showError('Please enter your password', 'alertMessage');

    setButtonLoading('loginBtn', true, 'Logging in...');

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        log('Login response:', data);

        if (data.success) {
            saveAuthData(data.token, data.user);
            showSuccess('Login successful! Redirecting...', 'alertMessage');
            setTimeout(() => window.location.href = '/dashboard.html', 1000);
        } else {
            showError(data.message || 'Invalid email or password', 'alertMessage');
        }
    } catch (error) {
        logError('Login error', error);
        showError('Cannot reach server. Please try again later.', 'alertMessage');
    } finally {
        setButtonLoading('loginBtn', false, 'Login');
    }
}

// ============================================
// LOGOUT
// ============================================

function logout() {
    log('Logging out...');
    clearAuthData();
    window.location.href = '/login.html';
}

// ============================================
// PASSWORD VISIBILITY TOGGLE
// ============================================

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

// ============================================
// VALIDATION HELPERS
// ============================================

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function isValidPassword(password) {
    return password && password.length >= 8;
}

// ============================================
// AUTH DATA MANAGEMENT
// ============================================

function saveAuthData(token, user) {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    log('Auth data saved');
}

function clearAuthData() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    log('Auth data cleared');
}

function isLoggedIn() {
    return !!localStorage.getItem('token');
}

function getAuthToken() {
    return localStorage.getItem('token');
}

function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
}

// ============================================
// UI HELPERS
// ============================================

function showError(message, elementId = 'alertMessage') {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        alert(message);
        return;
    }
    alertDiv.innerHTML = `
        <div class="alert alert-error">
            <span class="alert-icon">⚠️</span>
            <span class="alert-message">${message}</span>
        </div>
    `;
    alertDiv.style.display = 'block';
    setTimeout(() => alertDiv.style.display = 'none', 5000);
}

function showSuccess(message, elementId = 'alertMessage') {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) {
        alert(message);
        return;
    }
    alertDiv.innerHTML = `
        <div class="alert alert-success">
            <span class="alert-icon">✓</span>
            <span class="alert-message">${message}</span>
        </div>
    `;
    alertDiv.style.display = 'block';
    setTimeout(() => alertDiv.style.display = 'none', 5000);
}

function setButtonLoading(buttonId, isLoading, text) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    button.disabled = isLoading;
    if (isLoading) {
        button.innerHTML = `<span class="spinner"></span> ${text}`;
    } else {
        button.textContent = text;
    }
}

// ============================================
// LOGGING
// ============================================

function log(...args) {
    console.log('[CloudShare Auth]', ...args);
}

function logError(...args) {
    console.error('[CloudShare Auth Error]', ...args);
}

// ============================================
// INITIALIZE ON PAGE LOAD
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    const path = window.location.pathname;
    
    if (path.includes('register.html')) {
        initializeRegisterPage();
    } else if (path.includes('login.html')) {
        initializeLoginPage();
    }
});