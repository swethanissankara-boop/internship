/* ============================================
   CLOUDSHARE - SETTINGS (SIMPLIFIED)
   ============================================ */

// ============================================
// STATE
// ============================================

let currentUser = null;
let currentSettings = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Settings] Page loaded');
    
    // Check authentication
    if (!checkAuth()) {
        return;
    }
    
    // Load user info in navbar
    loadUserInfo();
    
    // Load all settings
    await loadAllSettings();
    
    // Setup event listeners
    setupSettingsEventListeners();
    
    // Show first section
    showSection('profile');
});

function setupSettingsEventListeners() {
    // Profile form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSubmit);
    }
    
    // Password form
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordSubmit);
    }
    
    // Storage settings form
    const storageForm = document.getElementById('storageForm');
    if (storageForm) {
        storageForm.addEventListener('submit', handleStorageSubmit);
    }
}

// ============================================
// LOAD ALL SETTINGS
// ============================================

async function loadAllSettings() {
    console.log('[Settings] Loading all settings...');
    
    const loadingEl = document.getElementById('loadingSpinner');
    const contentEl = document.getElementById('settingsContent');
    
    try {
        if (loadingEl) loadingEl.style.display = 'flex';
        if (contentEl) contentEl.style.display = 'none';
        
        const response = await apiGet('/settings');
        
        console.log('[Settings] API Response:', response);
        
        if (response.success) {
            currentUser = response.user;
            currentSettings = response.settings;
            
            // Populate all forms
            populateProfileForm();
            populateStorageForm();
            updateStorageDisplay();
            
            if (contentEl) contentEl.style.display = 'flex';
        } else {
            throw new Error(response.message || 'Failed to load settings');
        }
        
    } catch (error) {
        console.error('[Settings] Error loading:', error);
        showNotification('Failed to load settings: ' + error.message, 'error');
        
        // Show error state
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Error Loading Settings</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="loadAllSettings()">Try Again</button>
                </div>
            `;
            contentEl.style.display = 'flex';
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// ============================================
// POPULATE PROFILE FORM
// ============================================

function populateProfileForm() {
    if (!currentUser) return;
    
    console.log('[Settings] Populating profile form:', currentUser);
    
    // Profile fields
    setInputValue('profileUsername', currentUser.username || '');
    setInputValue('profileEmail', currentUser.email || '');
    setInputValue('profilePhone', currentUser.phone || '');
    setInputValue('profileBio', currentUser.bio || '');
    
    // Member since
    const memberSinceEl = document.getElementById('memberSince');
    if (memberSinceEl && currentUser.created_at) {
        memberSinceEl.textContent = formatDateFull(currentUser.created_at);
    }
    
    // Profile picture
    const profilePicEl = document.getElementById('profilePicture');
    if (profilePicEl) {
        if (currentUser.profile_picture) {
            profilePicEl.src = `/storage/${currentUser.profile_picture}`;
        } else {
            profilePicEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23667eea"/><text x="50" y="65" text-anchor="middle" font-size="45" fill="white">' + (currentUser.username ? currentUser.username.charAt(0).toUpperCase() : '👤') + '</text></svg>';
        }
    }
    
    // Update navbar
    const navUserName = document.getElementById('userName');
    const navUserEmail = document.getElementById('userEmail');
    if (navUserName) navUserName.textContent = currentUser.username || 'User';
    if (navUserEmail) navUserEmail.textContent = currentUser.email || '';
}

// ============================================
// POPULATE STORAGE FORM
// ============================================

function populateStorageForm() {
    if (!currentSettings) return;
    
    console.log('[Settings] Populating storage form:', currentSettings);
    
    setSelectValue('autoDeleteTrashDays', currentSettings.auto_delete_trash_days || 30);
    setCheckboxValue('autoBackup', currentSettings.auto_backup);
    setCheckboxValue('compressUploads', currentSettings.compress_uploads);
}

// ============================================
// UPDATE STORAGE DISPLAY
// ============================================

function updateStorageDisplay() {
    if (!currentUser) return;
    
    const used = parseInt(currentUser.storage_used) || 0;
    const quota = parseInt(currentUser.storage_quota) || 10737418240; // 10GB default
    const percentage = quota > 0 ? ((used / quota) * 100).toFixed(1) : 0;
    const available = quota - used;
    
    // Update elements
    const usedEl = document.getElementById('storageUsed');
    const quotaEl = document.getElementById('storageQuota');
    const availableEl = document.getElementById('storageAvailable');
    const percentageEl = document.getElementById('storagePercentage');
    const progressEl = document.getElementById('storageProgress');
    
    if (usedEl) usedEl.textContent = formatFileSize(used);
    if (quotaEl) quotaEl.textContent = formatFileSize(quota);
    if (availableEl) availableEl.textContent = formatFileSize(available);
    if (percentageEl) percentageEl.textContent = percentage + '%';
    
    if (progressEl) {
        progressEl.style.width = Math.min(percentage, 100) + '%';
        progressEl.className = 'progress-fill';
        if (percentage > 90) {
            progressEl.classList.add('danger');
        } else if (percentage > 75) {
            progressEl.classList.add('warning');
        }
    }
}

// ============================================
// SHOW SECTION
// ============================================

function showSection(sectionName) {
    console.log('[Settings] Showing section:', sectionName);
    
    // Hide all sections
    const sections = document.querySelectorAll('.settings-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Remove active from all tabs
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected section
    const selectedSection = document.getElementById(sectionName + 'Section');
    if (selectedSection) {
        selectedSection.classList.add('active');
    }
    
    // Activate tab
    const selectedTab = document.querySelector(`.settings-tab[data-section="${sectionName}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Load section-specific data
    if (sectionName === 'activity') {
        loadActivityLog();
    } else if (sectionName === 'storage') {
        loadStorageBreakdown();
    }
}

// ============================================
// HANDLE PROFILE SUBMIT
// ============================================

async function handleProfileSubmit(event) {
    event.preventDefault();
    
    const username = document.getElementById('profileUsername')?.value.trim();
    const email = document.getElementById('profileEmail')?.value.trim();
    const phone = document.getElementById('profilePhone')?.value.trim();
    const bio = document.getElementById('profileBio')?.value.trim();
    
    console.log('[Settings] Updating profile:', { username, email, phone, bio });
    
    // Validation
    if (!username || username.length < 3) {
        showNotification('Username must be at least 3 characters', 'error');
        return;
    }
    
    if (!email || !isValidEmail(email)) {
        showNotification('Please enter a valid email', 'error');
        return;
    }
    
    try {
        showNotification('Updating profile...', 'info');
        
        const response = await apiPut('/settings/profile', {
            username,
            email,
            phone: phone || null,
            bio: bio || null
        });
        
        if (response.success) {
            currentUser = { ...currentUser, ...response.user };
            populateProfileForm();
            showNotification('Profile updated successfully!', 'success');
        } else {
            throw new Error(response.message || 'Failed to update profile');
        }
        
    } catch (error) {
        console.error('[Settings] Profile update error:', error);
        showNotification(error.message || 'Failed to update profile', 'error');
    }
}

// ============================================
// HANDLE PASSWORD SUBMIT
// ============================================

async function handlePasswordSubmit(event) {
    event.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    
    console.log('[Settings] Changing password...');
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showNotification('Please fill in all password fields', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showNotification('New password must be at least 6 characters', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showNotification('New passwords do not match', 'error');
        return;
    }
    
    try {
        showNotification('Changing password...', 'info');
        
        const response = await apiPut('/settings/password', {
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
        });
        
        if (response.success) {
            // Clear form
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            
            showNotification('Password changed successfully!', 'success');
        } else {
            throw new Error(response.message || 'Failed to change password');
        }
        
    } catch (error) {
        console.error('[Settings] Password change error:', error);
        showNotification(error.message || 'Failed to change password', 'error');
    }
}

// ============================================
// HANDLE STORAGE SUBMIT
// ============================================

async function handleStorageSubmit(event) {
    event.preventDefault();
    
    const settings = {
        auto_delete_trash_days: parseInt(getSelectValue('autoDeleteTrashDays')) || 30,
        auto_backup: getCheckboxValue('autoBackup'),
        compress_uploads: getCheckboxValue('compressUploads')
    };
    
    console.log('[Settings] Saving storage settings:', settings);
    
    try {
        showNotification('Saving settings...', 'info');
        
        const response = await apiPut('/settings/preferences', settings);
        
        if (response.success) {
            currentSettings = { ...currentSettings, ...settings };
            showNotification('Storage settings saved!', 'success');
        } else {
            throw new Error(response.message || 'Failed to save settings');
        }
        
    } catch (error) {
        console.error('[Settings] Save settings error:', error);
        showNotification(error.message || 'Failed to save settings', 'error');
    }
}

// ============================================
// PROFILE PICTURE
// ============================================

function uploadProfilePicture() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        console.log('[Settings] Uploading profile picture:', file.name);
        
        // Validate
        if (file.size > 5 * 1024 * 1024) {
            showNotification('File too large. Maximum size is 5MB', 'error');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'error');
            return;
        }
        
        try {
            showNotification('Uploading picture...', 'info');
            
            const formData = new FormData();
            formData.append('profile_picture', file);
            
            const response = await apiPostFormData('/settings/profile-picture', formData);
            
            if (response.success) {
                currentUser.profile_picture = response.profile_picture;
                
                const profilePicEl = document.getElementById('profilePicture');
                if (profilePicEl) {
                    profilePicEl.src = `/storage/${response.profile_picture}?t=${Date.now()}`;
                }
                
                showNotification('Profile picture updated!', 'success');
            } else {
                throw new Error(response.message || 'Failed to upload');
            }
            
        } catch (error) {
            console.error('[Settings] Upload picture error:', error);
            showNotification(error.message || 'Failed to upload picture', 'error');
        }
    };
    
    input.click();
}

async function deleteProfilePicture() {
    if (!currentUser.profile_picture) {
        showNotification('No profile picture to delete', 'info');
        return;
    }
    
    if (!confirm('Are you sure you want to delete your profile picture?')) {
        return;
    }
    
    console.log('[Settings] Deleting profile picture...');
    
    try {
        showNotification('Deleting picture...', 'info');
        
        const response = await apiDelete('/settings/profile-picture');
        
        if (response.success) {
            currentUser.profile_picture = null;
            populateProfileForm();
            showNotification('Profile picture deleted!', 'success');
        } else {
            throw new Error(response.message || 'Failed to delete');
        }
        
    } catch (error) {
        console.error('[Settings] Delete picture error:', error);
        showNotification(error.message || 'Failed to delete picture', 'error');
    }
}

// ============================================
// STORAGE BREAKDOWN
// ============================================

async function loadStorageBreakdown() {
    console.log('[Settings] Loading storage breakdown...');
    
    const container = document.getElementById('storageBreakdownContainer');
    if (!container) return;
    
    container.innerHTML = '<p class="loading-text">Loading storage breakdown...</p>';
    
    try {
        const response = await apiGet('/settings/storage/stats');
        
        if (response.success) {
            renderStorageBreakdown(response.breakdown);
            
            // Update trash info
            if (response.storage) {
                const trashSizeEl = document.getElementById('trashSize');
                const trashCountEl = document.getElementById('trashCount');
                if (trashSizeEl) trashSizeEl.textContent = formatFileSize(response.storage.trash_size || 0);
                if (trashCountEl) trashCountEl.textContent = response.storage.trash_items || 0;
            }
        } else {
            container.innerHTML = '<p class="empty-text">No storage data available</p>';
        }
        
    } catch (error) {
        console.error('[Settings] Load storage error:', error);
        container.innerHTML = '<p class="error-text">Failed to load storage data</p>';
    }
}

function renderStorageBreakdown(breakdown) {
    const container = document.getElementById('storageBreakdownContainer');
    if (!container) return;
    
    if (!breakdown || breakdown.length === 0) {
        container.innerHTML = '<p class="empty-text">No files stored yet</p>';
        return;
    }
    
    const icons = {
        'Images': '🖼️',
        'Videos': '🎥',
        'Audio': '🎵',
        'PDFs': '📕',
        'Documents': '📝',
        'Spreadsheets': '📊',
        'Archives': '🗜️',
        'Other': '📄'
    };
    
    const colors = {
        'Images': '#4CAF50',
        'Videos': '#2196F3',
        'Audio': '#9C27B0',
        'PDFs': '#F44336',
        'Documents': '#FF9800',
        'Spreadsheets': '#00BCD4',
        'Archives': '#795548',
        'Other': '#607D8B'
    };
    
    let html = '';
    breakdown.forEach(item => {
        const icon = icons[item.file_type] || '📄';
        const color = colors[item.file_type] || '#607D8B';
        const size = formatFileSize(item.total_size || 0);
        const percentage = currentUser.storage_used > 0 
            ? ((item.total_size / currentUser.storage_used) * 100).toFixed(1) 
            : 0;
        
        html += `
            <div class="breakdown-item">
                <div class="breakdown-icon" style="background: ${color}20; color: ${color};">${icon}</div>
                <div class="breakdown-info">
                    <div class="breakdown-header">
                        <span class="breakdown-type">${item.file_type}</span>
                        <span class="breakdown-size">${size}</span>
                    </div>
                    <div class="breakdown-meta">${item.count} file${item.count !== 1 ? 's' : ''} • ${percentage}%</div>
                    <div class="breakdown-bar">
                        <div class="breakdown-bar-fill" style="width: ${percentage}%; background: ${color};"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// ACTIVITY LOG
// ============================================

async function loadActivityLog() {
    console.log('[Settings] Loading activity log...');
    
    const container = document.getElementById('activityLogContainer');
    if (!container) return;
    
    container.innerHTML = '<p class="loading-text">Loading activity...</p>';
    
    try {
        const response = await apiGet('/settings/activity?limit=50');
        
        if (response.success && response.activities) {
            renderActivityLog(response.activities);
        } else {
            container.innerHTML = '<p class="empty-text">No activity found</p>';
        }
        
    } catch (error) {
        console.error('[Settings] Load activity error:', error);
        container.innerHTML = '<p class="error-text">Failed to load activity</p>';
    }
}

function renderActivityLog(activities) {
    const container = document.getElementById('activityLogContainer');
    if (!container) return;
    
    if (!activities || activities.length === 0) {
        container.innerHTML = '<p class="empty-text">No activity yet</p>';
        return;
    }
    
    const icons = {
        'upload': '⬆️',
        'download': '⬇️',
        'delete': '🗑️',
        'share': '🔗',
        'rename': '✏️',
        'move': '📦',
        'restore': '♻️',
        'create_folder': '📁',
        'add_favorite': '⭐',
        'remove_favorite': '☆',
        'settings_update': '⚙️',
        'profile_update': '👤',
        'permanent_delete': '🔥'
    };
    
    const labels = {
        'upload': 'Uploaded',
        'download': 'Downloaded',
        'delete': 'Deleted',
        'share': 'Shared',
        'rename': 'Renamed',
        'move': 'Moved',
        'restore': 'Restored',
        'create_folder': 'Created folder',
        'add_favorite': 'Added to favorites',
        'remove_favorite': 'Removed from favorites',
        'settings_update': 'Updated settings',
        'profile_update': 'Updated profile',
        'permanent_delete': 'Permanently deleted'
    };
    
    let html = '';
    activities.forEach(activity => {
        const icon = icons[activity.action_type] || '📌';
        const label = labels[activity.action_type] || activity.action_type;
        const time = formatDate(activity.created_at);
        const name = activity.target_name || '';
        
        html += `
            <div class="activity-item">
                <div class="activity-icon">${icon}</div>
                <div class="activity-content">
                    <div class="activity-text">
                        <strong>${label}</strong>
                        ${name ? `<span class="activity-target">${escapeHtml(name)}</span>` : ''}
                    </div>
                    <div class="activity-time">${time}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function clearActivityLog() {
    if (!confirm('Clear all activity history?\n\nThis cannot be undone.')) {
        return;
    }
    
    try {
        showNotification('Clearing activity log...', 'info');
        
        const response = await apiDelete('/settings/activity/clear');
        
        if (response.success) {
            loadActivityLog();
            showNotification('Activity log cleared!', 'success');
        } else {
            throw new Error(response.message || 'Failed to clear');
        }
    } catch (error) {
        console.error('[Settings] Clear activity error:', error);
        showNotification('Failed to clear activity log', 'error');
    }
}

async function exportSettings() {
    try {
        showNotification('Preparing export...', 'info');
        
        const token = getAuthToken();
        window.open(API_BASE_URL + '/settings/export?token=' + token, '_blank');
        
    } catch (error) {
        showNotification('Failed to export settings', 'error');
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function setCheckboxValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(value);
}

function setSelectValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function getCheckboxValue(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

function getSelectValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatDateFull(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
