const getAPIUrl = () => {
    const hostname = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return port ? `${protocol}//localhost:${port}/api` : `${protocol}//localhost/api`;
    }
    return port ? `${protocol}//${hostname}:${port}/api` : `${protocol}//${hostname}/api`;
};

const API_URL = getAPIUrl();
console.log('[CloudShare Auth] API URL:', API_URL);
/* ============================================
   CLOUDSHARE - AUTHENTICATION
   Uses functions from utils.js
   ============================================ */

// ============================================
// INITIALIZE PAGES
// ============================================

function initializeRegisterPage() {
    console.log('[Auth] Initializing register page');

    if (isLoggedIn()) {
        window.location.href = 'dashboard.html';
        return;
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegister);

    setupPasswordToggles();
}

function initializeLoginPage() {
    console.log('[Auth] Initializing login page');

    if (isLoggedIn()) {
        window.location.href = 'dashboard.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    setupPasswordToggles();
}

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
    console.log('[Auth] Handling registration...');

    const name = document.getElementById('name')?.value.trim() || document.getElementById('username')?.value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms')?.checked || false;

    // Validation
    if (!name) return showAuthError('Please enter your name');
    if (!email || !isValidEmail(email)) return showAuthError('Please enter a valid email');
    if (!password || password.length < 8) return showAuthError('Password must be at least 8 characters');
    if (password !== confirmPassword) return showAuthError('Passwords do not match');
    if (!terms) return showAuthError('Please accept the Terms & Conditions');

    setAuthButtonLoading('registerBtn', true, 'Creating Account...');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();
        console.log('[Auth] Registration response:', data);

        if (data.success) {
            saveAuthData(data.token, data.user);
            showAuthSuccess('Account created successfully! Redirecting...');
            setTimeout(() => window.location.href = 'dashboard.html', 1500);
        } else {
            showAuthError(data.message || 'Registration failed');
        }
    } catch (error) {
        console.error('[Auth] Registration error:', error);
        showAuthError('Cannot reach server. Please try again later.');
    } finally {
        setAuthButtonLoading('registerBtn', false, 'Create Account');
    }
}

// ============================================
// LOGIN
// ============================================

async function handleLogin(event) {
    event.preventDefault();
    console.log('[Auth] Handling login...');

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Validation
    if (!email || !isValidEmail(email)) return showAuthError('Please enter a valid email');
    if (!password) return showAuthError('Please enter your password');

    setAuthButtonLoading('loginBtn', true, 'Logging in...');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        console.log('[Auth] Login response:', data);

        if (data.success) {
            saveAuthData(data.token, data.user);
            showAuthSuccess('Login successful! Redirecting...');
            setTimeout(() => window.location.href = 'dashboard.html', 1000);
        } else {
            showAuthError(data.message || 'Invalid email or password');
        }
    } catch (error) {
        console.error('[Auth] Login error:', error);
        showAuthError('Cannot reach server. Please try again later.');
    } finally {
        setAuthButtonLoading('loginBtn', false, 'Login');
    }
}

// ============================================
// PASSWORD VISIBILITY TOGGLE
// ============================================

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
}

// ============================================
// AUTH-SPECIFIC UI HELPERS
// (Named differently to avoid conflict with utils.js)
// ============================================

function showAuthError(message) {
    const alertDiv = document.getElementById('alertMessage');
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

function showAuthSuccess(message) {
    const alertDiv = document.getElementById('alertMessage');
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

function setAuthButtonLoading(buttonId, isLoading, text) {
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

console.log('[Auth] Auth module loaded. API URL:', API_BASE_URL);
