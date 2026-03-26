/* ============================================
   CLOUDSHARE - SHARING
   ============================================ */

// ============================================
// SHARE STATE
// ============================================

let currentShareItem = null;
let sharedUsers = [];

// ============================================
// OPEN SHARE MODAL
// ============================================

function openShareModal(itemId = null, itemType = null) {
    // If no item specified, use context menu target
    if (!itemId && contextMenuTarget) {
        itemId = contextMenuTarget.id;
        itemType = contextMenuTarget.type;
    }
    
    if (!itemId || !itemType) {
        log('No item to share');
        return;
    }
    
    // Get item details
    let item;
    if (itemType === 'folder') {
        item = folders.find(f => f.id === itemId);
    } else {
        item = files.find(f => f.id === itemId);
    }
    
    if (!item) {
        log('Item not found');
        return;
    }
    
    currentShareItem = {
        id: itemId,
        type: itemType,
        name: item.name,
        size: item.size
    };
    
    log('Opening share modal:', currentShareItem);
    
    // Update modal content
    const shareItemName = document.getElementById('shareItemName');
    const shareIcon = document.getElementById('shareIcon');
    const shareName = document.getElementById('shareName');
    const shareMeta = document.getElementById('shareMeta');
    
    if (shareItemName) shareItemName.textContent = item.name;
    if (shareIcon) shareIcon.textContent = itemType === 'folder' ? '📁' : getFileIcon(item.name);
    if (shareName) shareName.textContent = item.name;
    if (shareMeta) {
        if (itemType === 'folder') {
            shareMeta.textContent = `${item.items_count || 0} files • ${formatFileSize(item.size)}`;
        } else {
            shareMeta.textContent = formatFileSize(item.size);
        }
    }
    
    // Reset form
    resetShareForm();
    
    // Clear shared users
    sharedUsers = [];
    updateSharedUsersList();
    
    // Show modal
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.style.display = 'none';
    }
    currentShareItem = null;
}

// ============================================
// RESET FORM
// ============================================

function resetShareForm() {
    // Reset permission radio
    const downloadFolderRadio = document.querySelector('input[name="permission"][value="download_folder"]');
    if (downloadFolderRadio) downloadFolderRadio.checked = true;
    
    // Reset password
    const requirePassword = document.getElementById('requirePassword');
    const sharePassword = document.getElementById('sharePassword');
    if (requirePassword) requirePassword.checked = false;
    if (sharePassword) {
        sharePassword.value = '';
        sharePassword.disabled = true;
    }
    
    // Reset expiry
    const setExpiry = document.getElementById('setExpiry');
    const expiryDays = document.getElementById('expiryDays');
    if (setExpiry) setExpiry.checked = true;
    if (expiryDays) expiryDays.value = '7';
    
    // Reset download limit
    const setDownloadLimit = document.getElementById('setDownloadLimit');
    const maxDownloads = document.getElementById('maxDownloads');
    if (setDownloadLimit) setDownloadLimit.checked = false;
    if (maxDownloads) {
        maxDownloads.value = '50';
        maxDownloads.disabled = true;
    }
    
    // Clear email input
    const shareUserEmail = document.getElementById('shareUserEmail');
    if (shareUserEmail) shareUserEmail.value = '';
}

// ============================================
// TOGGLE INPUTS
// ============================================

function togglePasswordInput() {
    const checkbox = document.getElementById('requirePassword');
    const input = document.getElementById('sharePassword');
    
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        if (checkbox.checked) {
            input.focus();
        }
    }
}

function toggleExpiryInput() {
    const checkbox = document.getElementById('setExpiry');
    const select = document.getElementById('expiryDays');
    
    if (checkbox && select) {
        select.disabled = !checkbox.checked;
    }
}

function toggleDownloadLimit() {
    const checkbox = document.getElementById('setDownloadLimit');
    const input = document.getElementById('maxDownloads');
    
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        if (checkbox.checked) {
            input.focus();
        }
    }
}

// ============================================
// USER SHARING
// ============================================

function addUserShare() {
    const emailInput = document.getElementById('shareUserEmail');
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    
    if (!email) {
        alert('Please enter an email address');
        return;
    }
    
    if (!isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    // Check if already added
    if (sharedUsers.some(u => u.email === email)) {
        alert('This user has already been added');
        return;
    }
    
    // Add user
    sharedUsers.push({
        email: email,
        permission: 'download' // Default permission
    });
    
    log('Added user to share:', email);
    
    // Update UI
    updateSharedUsersList();
    
    // Clear input
    emailInput.value = '';
}

function removeUserShare(index) {
    sharedUsers.splice(index, 1);
    updateSharedUsersList();
}

function updateSharedUsersList() {
    const list = document.getElementById('sharedUsersList');
    if (!list) return;
    
    if (sharedUsers.length === 0) {
        list.innerHTML = '<p class="text-muted">No users added yet</p>';
        return;
    }
    
    let html = '';
    sharedUsers.forEach((user, index) => {
        html += `
            <div class="shared-user-item">
                <span>• ${user.email}</span>
                <span class="user-permission">${user.permission === 'view' ? 'View only' : 'Can download'}</span>
                <button class="btn-remove" onclick="removeUserShare(${index})">✕</button>
            </div>
        `;
    });
    
    list.innerHTML = html;
}

// ============================================
// GENERATE SHARE LINK
// ============================================

async function generateShareLink() {
    if (!currentShareItem) {
        alert('No item selected');
        return;
    }
    
    log('Generating share link...');
    
    // Get form values
    const permissionEl = document.querySelector('input[name="permission"]:checked');
    const permission = permissionEl ? permissionEl.value : 'download';
    
    const requirePassword = document.getElementById('requirePassword')?.checked || false;
    const password = document.getElementById('sharePassword')?.value || '';
    
    const setExpiry = document.getElementById('setExpiry')?.checked || false;
    const expiryDays = document.getElementById('expiryDays')?.value || '7';
    
    const setDownloadLimit = document.getElementById('setDownloadLimit')?.checked || false;
    const maxDownloads = document.getElementById('maxDownloads')?.value || '50';
    
    // Validation
    if (requirePassword && !password) {
        alert('Please enter a password');
        return;
    }
    
    // Build share data
    const shareData = {
        item_id: currentShareItem.id,
        item_type: currentShareItem.type,
        permission: permission,
        password: requirePassword ? password : null,
        expires_in_days: setExpiry ? parseInt(expiryDays) : null,
        max_downloads: setDownloadLimit ? parseInt(maxDownloads) : null,
        shared_users: sharedUsers
    };
    
    log('Share data:', shareData);
    
    try {
        // In real app, call API
        // const response = await apiPost('/share/create', shareData);
        
        // Demo: Generate fake share link
        const shareToken = generateRandomString(16);
        const shareLink = `${window.location.origin}/pages/public-share.html?token=${shareToken}`;
        
        // Show success modal
        showShareSuccess(shareLink, shareData);
        
    } catch (error) {
        logError('Error generating share link:', error);
        alert('Failed to generate share link. Please try again.');
    }
}

// ============================================
// SHARE SUCCESS
// ============================================

function showShareSuccess(shareLink, shareData) {
    // Close share modal
    closeShareModal();
    
    // Show success dialog
    const successHtml = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h3>Share Link Created!</h3>
            <p>Your ${currentShareItem?.type || 'item'} "${currentShareItem?.name || ''}" is now shared</p>
            
            <div style="margin: 20px 0; padding: 12px; background: #f3f4f6; border-radius: 8px;">
                <input type="text" value="${shareLink}" id="shareLinkInput" readonly 
                    style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; margin-bottom: 8px;">
                <button onclick="copyShareLink()" class="btn btn-primary btn-block">
                    📋 Copy Link
                </button>
            </div>
            
            <div style="text-align: left; padding: 12px; background: #f9fafb; border-radius: 8px; font-size: 14px;">
                <p><strong>📊 Link Settings:</strong></p>
                <p>• Permission: ${shareData.permission}</p>
                <p>• Password: ${shareData.password ? 'Protected' : 'None'}</p>
                <p>• Expires: ${shareData.expires_in_days ? shareData.expires_in_days + ' days' : 'Never'}</p>
                <p>• Max Downloads: ${shareData.max_downloads || 'Unlimited'}</p>
            </div>
            
            <button onclick="closeSuccessDialog()" class="btn btn-block" style="margin-top: 16px;">
                Done
            </button>
        </div>
    `;
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.id = 'shareSuccessDialog';
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        max-height: 90vh;
        overflow: auto;
    `;
    content.innerHTML = successHtml;
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
}

function copyShareLink() {
    const input = document.getElementById('shareLinkInput');
    if (input) {
        input.select();
        copyToClipboard(input.value);
        alert('Link copied to clipboard!');
    }
}

function closeSuccessDialog() {
    const dialog = document.getElementById('shareSuccessDialog');
    if (dialog) {
        dialog.remove();
    }
}