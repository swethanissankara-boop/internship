/* ============================================
   CLOUDSHARE - SETTINGS
   ============================================ */

// ============================================
// INITIALIZE SETTINGS
// ============================================

function initializeSettings() {
    log('Initializing settings...');
    
    // Check authentication
    if (!checkAuthentication()) {
        return;
    }
    
    // Load user info
    loadUserInfo();
    loadStorageInfo();
    loadProfileData();
}

// ============================================
// LOAD PROFILE DATA
// ============================================

function loadProfileData() {
    const user = getCurrentUser();
    
    if (user) {
        // Update profile form
        const profileName = document.getElementById('profileName');
        const profileEmail = document.getElementById('profileEmail');
        const memberSince = document.getElementById('memberSince');
        
        if (profileName) profileName.value = user.name || '';
        if (profileEmail) profileEmail.value = user.email || '';
        if (memberSince) memberSince.textContent = formatDateFull(user.created_at || new Date().toISOString());
        
        // Update storage stats
        updateStorageStats();
    }
}

// ============================================
// UPDATE STORAGE STATS
// ============================================

function updateStorageStats() {
    const user = getCurrentUser();
    
    if (user) {
        const used = user.storage_used || 0;
        const total = user.storage_quota || 107374182400;
        const available = total - used;
        const percentage = Math.round((used / total) * 100);
        
        // Update storage section
        const totalStat = document.getElementById('totalStorageStat');
        const usedStat = document.getElementById('usedStorageStat');
        const availableStat = document.getElementById('availableStorageStat');
        const storageBar = document.getElementById('storageBarSettings');
        
        if (totalStat) totalStat.textContent = formatFileSize(total);
        if (usedStat) usedStat.textContent = `${formatFileSize(used)} (${percentage}%)`;
        if (availableStat) availableStat.textContent = formatFileSize(available);
        if (storageBar) storageBar.style.width = percentage + '%';
    }
}

// ============================================
// SHOW SETTINGS SECTIONS
// ============================================

function showSettingsSection(sectionName) {
    log('Showing section:', sectionName);
    
    // Hide all sections
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    // Remove active from all tabs
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected section
    const selectedSection = document.getElementById(sectionName + 'Section');
    if (selectedSection) {
        selectedSection.style.display = 'block';
    }
    
    // Activate tab
    event.target.classList.add('active');
}

// ============================================
// UPDATE PROFILE
// ============================================

async function updateProfile(event) {
    event.preventDefault();
    
    const name = document.getElementById('profileName').value.trim();
    
    if (!name) {
        showError('Please enter your name', 'settingsAlert');
        return;
    }
    
    log('Updating profile:', { name });
    
    try {
        // In real app, call API
        // const response = await apiPut('/user/profile', { name });
        
        // Demo: Update local storage
        const user = getCurrentUser();
        user.name = name;
        saveToStorage('user', user);
        
        // Update UI
        loadUserInfo();
        
        showSuccess('Profile updated successfully!', 'settingsAlert');
        
    } catch (error) {
        logError('Error updating profile:', error);
        showError('Failed to update profile', 'settingsAlert');
    }
}

// ============================================
// CHANGE PASSWORD
// ============================================

async function changePassword(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showError('Please fill in all password fields', 'settingsAlert');
        return;
    }
    
    if (!isValidPassword(newPassword)) {
        showError('New password must be at least 8 characters', 'settingsAlert');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showError('New passwords do not match', 'settingsAlert');
        return;
    }
    
    log('Changing password...');
    
    try {
        // In real app, call API
        // const response = await apiPut('/user/password', {
        //     current_password: currentPassword,
        //     new_password: newPassword
        // });
        
        // Demo: Just show success
        showSuccess('Password changed successfully!', 'settingsAlert');
        
        // Clear form
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        
    } catch (error) {
        logError('Error changing password:', error);
        showError('Failed to change password. Please check your current password.', 'settingsAlert');
    }
}

// ============================================
// PROFILE PHOTO
// ============================================

function changeProfilePhoto() {
    alert('Select profile photo\n\n(Photo upload functionality will be implemented)');
}

// ============================================
// STORAGE MANAGEMENT
// ============================================

function analyzeStorage() {
    log('Analyzing storage...');
    alert('Storage Analysis\n\n📄 Documents: 45 GB\n🖼️ Photos: 25 GB\n📹 Videos: 8 GB\n📦 Other: 0 GB\n\nTotal: 78 GB');
}

function cleanupStorage() {
    log('Cleaning up storage...');
    alert('Cleanup Options:\n\n• Empty Trash (5.2 GB)\n• Delete duplicate files\n• Remove old versions\n\n(Cleanup functionality will be implemented)');
}

// ============================================
// SHARING SETTINGS
// ============================================

function saveSharingSettings() {
    log('Saving sharing settings...');
    
    const defaultExpiry = document.getElementById('defaultExpiry')?.value || '7';
    
    // In real app, save to backend
    // saveToStorage('sharingSettings', { defaultExpiry });
    
    alert('Sharing settings saved!');
}

// ============================================
// ACTIVITY LOG
// ============================================

function loadMoreActivity() {
    log('Loading more activity...');
    alert('Loading more activity...\n\n(Will load older activity items)');
}

// ============================================
// PASSWORD VISIBILITY
// ============================================

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}
