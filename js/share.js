/* ============================================
   SHARE FUNCTIONALITY - WITH FOLDER SUPPORT
   ============================================ */

// Copy to clipboard with fallback for HTTP
function copyTextToClipboard(text) {
    return new Promise((resolve, reject) => {
        // Try modern clipboard API first (only works on HTTPS)
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => resolve(true))
                .catch(err => {
                    console.warn('Clipboard API failed, using fallback:', err);
                    fallbackCopyText(text) ? resolve(true) : reject(err);
                });
        } else {
            // Fallback for HTTP
            fallbackCopyText(text) ? resolve(true) : reject(new Error('Copy failed'));
        }
    });
}
// ============================================
// SHARE TAB SWITCHING
// ============================================

function switchShareTab(tab) {
    const publicTab = document.getElementById('publicLinkTab');
    const userTab = document.getElementById('shareUserTab');
    const publicBtn = document.getElementById('tabPublicLink');
    const userBtn = document.getElementById('tabShareUser');
    
    if (tab === 'public') {
        publicTab.style.display = 'block';
        userTab.style.display = 'none';
        publicBtn.style.background = '#6366f1';
        publicBtn.style.color = 'white';
        userBtn.style.background = '#f3f4f6';
        userBtn.style.color = '#374151';
    } else {
        publicTab.style.display = 'none';
        userTab.style.display = 'block';
        publicBtn.style.background = '#f3f4f6';
        publicBtn.style.color = '#374151';
        userBtn.style.background = '#6366f1';
        userBtn.style.color = 'white';
        
        // Load existing shared users
        loadSharedUsers();
    }
}

// ============================================
// SHARE WITH SPECIFIC USER
// ============================================

async function shareWithUser() {
    const email = document.getElementById('shareUserEmail')?.value?.trim();
    const permission = document.getElementById('shareUserPermission')?.value || 'view';
    
    if (!email) {
        showAlert('Please enter an email address', 'error');
        return;
    }
    
    if (!window.currentShareTarget) {
        showAlert('No item selected', 'error');
        return;
    }
    
    const { id, type } = window.currentShareTarget;
    
    console.log('👤 Sharing with user:', email, 'permission:', permission);
    
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        
        const requestBody = {
            email: email,
            permission: permission
        };
        
        if (type === 'file') {
            requestBody.file_id = parseInt(id);
        } else {
            requestBody.folder_id = parseInt(id);
        }
        
        const response = await fetch(`${apiBase}/api/share/user`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert(`✅ Shared with ${data.shared_with.username || email}!`, 'success');
            document.getElementById('shareUserEmail').value = '';
            loadSharedUsers();
        } else {
            showAlert(data.message || 'Failed to share', 'error');
        }
        
    } catch (error) {
        console.error('Share with user error:', error);
        showAlert('Failed to share: ' + error.message, 'error');
    }
}

// ============================================
// LOAD SHARED USERS LIST
// ============================================

async function loadSharedUsers() {
    if (!window.currentShareTarget) return;
    
    const { id, type } = window.currentShareTarget;
    const container = document.getElementById('sharedUsersList');
    if (!container) return;
    
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        
        const response = await fetch(`${apiBase}/api/share/access/${type}/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.access_list && data.access_list.length > 0) {
            let html = `
                <div style="margin-top: 20px;">
                    <h4 style="color: #374151; font-size: 14px; margin-bottom: 12px;">
                        👥 People with access (${data.access_list.length})
                    </h4>
            `;
            
            data.access_list.forEach(user => {
                const permBadge = {
                    'view': '👁️ View',
                    'download': '📥 Download',
                    'edit': '✏️ Edit'
                }[user.permission] || '👁️ View';
                
                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 36px; height: 36px; background: #6366f1; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">
                                ${user.username ? user.username[0].toUpperCase() : '?'}
                            </div>
                            <div>
                                <div style="font-weight: 600; color: #1f2937;">${user.username || 'Unknown'}</div>
                                <div style="font-size: 12px; color: #6b7280;">${user.email}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 12px; color: #6366f1;">${permBadge}</span>
                            <button onclick="removeUserAccess(${user.id})" 
                                    style="padding: 4px 8px; background: #fee2e2; color: #dc2626; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                ✕
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #6b7280;">
                    <p>No users have access yet</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Load shared users error:', error);
        container.innerHTML = '';
    }
}

// ============================================
// REMOVE USER ACCESS
// ============================================

async function removeUserAccess(shareId) {
    if (!confirm('Remove access for this user?')) return;
    
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        
        const response = await fetch(`${apiBase}/api/share/user/${shareId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('✅ Access removed', 'success');
            loadSharedUsers();
        } else {
            showAlert(data.message || 'Failed to remove', 'error');
        }
        
    } catch (error) {
        console.error('Remove access error:', error);
        showAlert('Failed to remove access', 'error');
    }
}
// Fallback copy method using textarea
function fallbackCopyText(text) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        
        // Avoid scrolling to bottom
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        return successful;
    } catch (err) {
        console.error('Fallback copy failed:', err);
        return false;
    }
}

// Generate share link (supports both files and folders)
// Generate share link (supports both files and folders)
async function generateShareLink() {
    console.log('🔗 Generate share link called');
    
    if (!window.currentShareTarget) {
        console.error('❌ No currentShareTarget');
        showAlert('No item selected', 'error');
        return;
    }

    const { id, type } = window.currentShareTarget;
    console.log('📋 Share target:', { id, type });

    // Get form values
    const requirePasswordEl = document.getElementById('requirePassword');
    const sharePasswordEl = document.getElementById('sharePassword');
    const setExpiryEl = document.getElementById('setExpiry');
    const expiryDaysEl = document.getElementById('expiryDays');
    const setDownloadLimitEl = document.getElementById('setDownloadLimit');
    const maxDownloadsEl = document.getElementById('maxDownloads');
    const setViewLimitEl = document.getElementById('setViewLimit');
    const maxViewsEl = document.getElementById('maxViews');

    const requirePassword = requirePasswordEl?.checked || false;
    const password = requirePassword && sharePasswordEl?.value ? sharePasswordEl.value.trim() : null;
    const setExpiry = setExpiryEl?.checked || false;
    const expiryDays = setExpiry && expiryDaysEl?.value ? parseInt(expiryDaysEl.value) : null;
    const setDownloadLimit = setDownloadLimitEl?.checked || false;
    const maxDownloads = setDownloadLimit && maxDownloadsEl?.value ? parseInt(maxDownloadsEl.value) : null;
    const setViewLimit = setViewLimitEl?.checked || false;
    const maxViews = setViewLimit && maxViewsEl?.value ? parseInt(maxViewsEl.value) : null;

    console.log('📝 Share options:', {
        type,
        requirePassword,
        hasPassword: !!password,
        setExpiry,
        expiryDays,
        setDownloadLimit,
        maxDownloads,
        setViewLimit,
        maxViews
    });

    // Validate password
    if (requirePassword && !password) {
        showAlert('Please enter a password', 'error');
        return;
    }

    // Validate expiry days
    if (setExpiry && (!expiryDays || expiryDays <= 0)) {
        showAlert('Please enter valid expiry days (greater than 0)', 'error');
        return;
    }

    // Validate download limit
    if (setDownloadLimit && (!maxDownloads || maxDownloads <= 0)) {
        showAlert('Please enter valid download limit (greater than 0)', 'error');
        return;
    }

    // Validate view limit
    if (setViewLimit && (!maxViews || maxViews <= 0)) {
        showAlert('Please enter valid view limit (greater than 0)', 'error');
        return;
    }

    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');

        if (!token) {
            showAlert('Not authenticated. Please login again.', 'error');
            return;
        }

        console.log('🌐 API Request:', `${apiBase}/api/share/link`);

        // Build request body - ONLY include fields with values
        const requestBody = {};

        // Add file_id or folder_id based on type
        if (type === 'file') {
            requestBody.file_id = parseInt(id);
        } else if (type === 'folder') {
            requestBody.folder_id = parseInt(id);
        } else {
            showAlert('Invalid share type', 'error');
            return;
        }

        // ONLY add optional fields if they have actual values
        if (password) {
            requestBody.password = password;
        }

        if (expiryDays && expiryDays > 0) {
            requestBody.expires_days = expiryDays;
        }

        if (type === 'file' && maxDownloads && maxDownloads > 0) {
            requestBody.max_downloads = maxDownloads;
        }

        if (type === 'folder' && maxViews && maxViews > 0) {
            requestBody.max_views = maxViews;
        }

        console.log('📤 Request body (cleaned):', requestBody);

        const response = await fetch(`${apiBase}/api/share/link`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('📥 Response status:', response.status);

        const data = await response.json();
        console.log('📥 Response data:', data);

        if (data.success) {
            // Copy to clipboard using fallback method
            try {
                await copyTextToClipboard(data.share.url);
                showAlert(`🔗 ${type === 'folder' ? 'Folder' : 'File'} share link created and copied!`, 'success');
            } catch (clipboardError) {
                console.warn('Clipboard copy failed:', clipboardError);
                showAlert('✅ Share link created! Click copy button below.', 'success');
            }
            
            // Display the link
            displayGeneratedLink(data.share, type);
            
            // Load existing shares
            loadExistingShares(id, type);
            
        } else {
            console.error('❌ API Error:', data.message);
            showAlert(data.message || 'Failed to create share link', 'error');
        }

    } catch (error) {
        console.error('❌ Generate share link error:', error);
        showAlert(`Failed to create share link: ${error.message}`, 'error');
    }
}

// Display generated link (supports files and folders)
function displayGeneratedLink(share, type) {
    console.log('📋 Displaying generated link:', share);
    
    const container = document.getElementById('shareLinkContainer');
    if (!container) {
        console.error('❌ shareLinkContainer not found in DOM');
        return;
    }

    // Escape single quotes for onclick handlers
    const escapedUrl = share.url.replace(/'/g, "\\'");

    const icon = type === 'folder' ? '📁' : '📄';
    const itemName = share.name || (type === 'folder' ? 'Folder' : 'File');

    container.innerHTML = `
        <div style="background: #f0fdf4; padding: 16px; border-radius: 10px; border: 2px solid #86efac; margin-top: 20px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <span style="font-size: 20px;">✅</span>
                <strong style="color: #16a34a;">${icon} ${type === 'folder' ? 'Folder' : 'File'} Share Link Created!</strong>
            </div>
            
            <div style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">
                <strong>${itemName}</strong>
            </div>
            
            <!-- Copy-friendly input -->
            <div style="position: relative; margin-bottom: 10px;">
                <input type="text" 
                       id="shareUrlInput" 
                       value="${share.url}" 
                       readonly 
                       style="width: 100%; padding: 12px; padding-right: 50px; border: 1px solid #d1d5db; border-radius: 8px; font-family: monospace; font-size: 13px; background: white;">
                <button onclick="copyShareUrl()" 
                        style="position: absolute; right: 5px; top: 50%; transform: translateY(-50%); padding: 6px 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
                    📋
                </button>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button onclick="copyShareUrl()" class="btn btn-primary" style="flex: 1; padding: 10px; font-size: 14px;">
                    📋 Copy Link
                </button>
                <button onclick="window.open('${escapedUrl}', '_blank')" class="btn btn-secondary" style="flex: 1; padding: 10px; font-size: 14px;">
                    🔗 Open Link
                </button>
            </div>
            
            <div style="margin-top: 10px; font-size: 12px; color: #6b7280;">
                ${share.has_password ? '<p style="margin: 5px 0;">🔒 Password protected</p>' : ''}
                ${share.expires_at ? `<p style="margin: 5px 0;">⏰ Expires: ${formatDateFull(share.expires_at)}</p>` : ''}
                ${type === 'file' && share.max_downloads ? `<p style="margin: 5px 0;">📥 Max downloads: ${share.max_downloads}</p>` : ''}
                ${type === 'folder' && share.max_views ? `<p style="margin: 5px 0;">👁️ Max views: ${share.max_views}</p>` : ''}
            </div>
        </div>
    `;
}

// Copy share URL from input
function copyShareUrl() {
    const input = document.getElementById('shareUrlInput');
    if (!input) return;
    
    const url = input.value;
    
    // Try to copy
    copyTextToClipboard(url)
        .then(() => {
            showAlert('📋 Link copied to clipboard!', 'success');
            
            // Visual feedback
            input.select();
            input.style.background = '#d1fae5';
            setTimeout(() => {
                input.style.background = 'white';
            }, 500);
        })
        .catch(err => {
            console.error('Copy failed:', err);
            // Select text so user can manually copy
            input.select();
            showAlert('Please press Ctrl+C to copy', 'info');
        });
}

// General copy to clipboard function
async function copyToClipboard(text) {
    try {
        await copyTextToClipboard(text);
        showAlert('📋 Copied to clipboard!', 'success');
    } catch (error) {
        console.error('Copy failed:', error);
        showAlert('Failed to copy. Please copy manually.', 'error');
    }
}

// Load existing shares (supports files and folders)
async function loadExistingShares(itemId, itemType) {
    console.log('🔍 Loading existing shares for:', itemType, itemId);
    
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');

        const response = await fetch(`${apiBase}/api/share/my-shares`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        console.log('📥 My shares response:', data);

        if (data.success && data.links) {
            const relevantLinks = data.links.filter(link => {
                if (itemType === 'file') {
                    return parseInt(link.file_id) === parseInt(itemId);
                } else if (itemType === 'folder') {
                    return parseInt(link.folder_id) === parseInt(itemId);
                }
                return false;
            });
            
            console.log('📋 Relevant links:', relevantLinks);

            if (relevantLinks.length > 0) {
                displayExistingShares(relevantLinks, itemType);
            }
        }

    } catch (error) {
        console.error('❌ Load existing shares error:', error);
    }
}

// Display existing shares (supports files and folders)
function displayExistingShares(links, itemType) {
    const container = document.getElementById('existingShares');
    if (!container) {
        console.error('❌ existingShares container not found');
        return;
    }

    const icon = itemType === 'folder' ? '📁' : '📄';
    let html = `<h4 style="margin: 20px 0 10px 0; color: #374151; font-size: 16px;">${icon} Existing Share Links</h4>`;
    
    links.forEach(link => {
        const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
        
        let limitReached = false;
        let limitText = '';
        
        if (link.share_type === 'file') {
            limitReached = link.max_downloads && link.download_count >= link.max_downloads;
            limitText = link.download_count > 0 ? `📥 ${link.download_count} downloads` : '';
        } else if (link.share_type === 'folder') {
            limitReached = link.max_views && link.view_count >= link.max_views;
            limitText = link.view_count > 0 ? `👁️ ${link.view_count} views` : '';
        }
        
        const shareUrl = link.url || `${window.location.origin}/public-share.html?token=${link.share_token}`;
        const escapedUrl = shareUrl.replace(/'/g, "\\'");
        
        html += `
            <div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
                            ${link.share_type === 'folder' ? '📁' : '📄'} ${link.name || 'Shared Item'}
                        </div>
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 5px;">
                            📅 ${formatDate(link.created_at)}
                        </div>
                        ${limitText ? `<div style="font-size: 12px; color: #6b7280;">${limitText}</div>` : ''}
                        ${isExpired ? '<span style="color: #ef4444; font-size: 12px;">⏰ Expired</span>' : ''}
                        ${limitReached ? '<span style="color: #f59e0b; font-size: 12px;">🚫 Limit reached</span>' : ''}
                        ${!link.is_active ? '<span style="color: #ef4444; font-size: 12px;">❌ Deactivated</span>' : ''}
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="viewShareStats(${link.id})" 
                                class="btn btn-info" 
                                style="padding: 6px 12px; font-size: 12px;"
                                title="View Statistics">
                            📊
                        </button>
                        <button onclick="copyToClipboard('${escapedUrl}')" 
                                class="btn btn-secondary" 
                                style="padding: 6px 12px; font-size: 12px;">
                            📋
                        </button>
                        <button onclick="deleteShareLink(${link.id})" 
                                class="btn btn-danger" 
                                style="padding: 6px 12px; font-size: 12px;">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// View share link statistics
async function viewShareStats(linkId) {
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');

        const response = await fetch(`${apiBase}/api/share/link/${linkId}/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            const stats = data.stats;
            const icon = stats.type === 'folder' ? '📁' : '📄';
            
            let statsHtml = `
                <div style="padding: 20px;">
                    <h3 style="margin-bottom: 20px;">${icon} ${stats.name}</h3>
                    
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <div style="margin-bottom: 10px;">
                            <strong>Share Token:</strong><br>
                            <code style="background: #e5e7eb; padding: 5px 10px; border-radius: 4px; font-size: 12px;">
                                ${stats.token}
                            </code>
                        </div>
                        
                        ${stats.type === 'file' ? `
                            <div style="margin-bottom: 10px;">
                                <strong>Downloads:</strong> ${stats.download_count}${stats.max_downloads ? ` / ${stats.max_downloads}` : ''}
                            </div>
                        ` : ''}
                        
                        ${stats.type === 'folder' ? `
                            <div style="margin-bottom: 10px;">
                                <strong>Views:</strong> ${stats.view_count}${stats.max_views ? ` / ${stats.max_views}` : ''}
                            </div>
                        ` : ''}
                        
                        <div style="margin-bottom: 10px;">
                            <strong>Status:</strong> 
                            ${stats.is_active ? '<span style="color: #10b981;">✅ Active</span>' : '<span style="color: #ef4444;">❌ Inactive</span>'}
                        </div>
                        
                        ${stats.expires_at ? `
                            <div style="margin-bottom: 10px;">
                                <strong>Expires:</strong> ${formatDateFull(stats.expires_at)}
                            </div>
                        ` : ''}
                        
                        ${stats.last_accessed_at ? `
                            <div style="margin-bottom: 10px;">
                                <strong>Last Accessed:</strong> ${formatDateFull(stats.last_accessed_at)}
                            </div>
                        ` : ''}
                        
                        <div style="margin-bottom: 10px;">
                            <strong>Created:</strong> ${formatDateFull(stats.created_at)}
                        </div>
                    </div>
                    
                    <button onclick="closeModal('shareStatsModal')" class="btn btn-secondary" style="width: 100%;">
                        Close
                    </button>
                </div>
            `;
            
            // Show in modal or alert
            if (typeof showModal === 'function') {
                showModal('Share Statistics', statsHtml);
            } else {
                alert(JSON.stringify(stats, null, 2));
            }
        }
        
    } catch (error) {
        console.error('View stats error:', error);
        showAlert('Failed to load statistics', 'error');
    }
}

// Delete share link
async function deleteShareLink(linkId) {
    if (!confirm('Delete this share link? This will deactivate the link permanently.')) return;

    console.log('🗑️ Deleting share link:', linkId);

    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');

        const response = await fetch(`${apiBase}/api/share/link/${linkId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        console.log('📥 Delete response:', data);

        if (data.success) {
            showAlert('✅ Share link deactivated', 'success');
            if (window.currentShareTarget) {
                loadExistingShares(window.currentShareTarget.id, window.currentShareTarget.type);
            }
            
            // Clear the generated link container
            const container = document.getElementById('shareLinkContainer');
            if (container) container.innerHTML = '';
            
        } else {
            showAlert(data.message || 'Failed to delete', 'error');
        }

    } catch (error) {
        console.error('❌ Delete share link error:', error);
        showAlert('Failed to delete share link', 'error');
    }
}

// Toggle functions for modal
function togglePasswordInput() {
    const checkbox = document.getElementById('requirePassword');
    const input = document.getElementById('sharePassword');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) {
            input.focus();
        } else {
            input.value = '';
        }
    }
}

// Toggle expiry date input
function toggleExpiryDate() {
    const checkbox = document.getElementById('setExpiry');
    const input = document.getElementById('expiryDays');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) {
            input.focus();
        } else {
            input.value = '';
        }
    }
}

// Toggle download limit input
function toggleDownloadLimit() {
    const checkbox = document.getElementById('setDownloadLimit');
    const input = document.getElementById('maxDownloads');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) {
            input.focus();
        } else {
            input.value = '';
        }
    }
}

// Toggle view limit input (for folders)
function toggleViewLimit() {
    const checkbox = document.getElementById('setViewLimit');
    const input = document.getElementById('maxViews');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) {
            input.focus();
        } else {
            input.value = '';
        }
    }
}

// Format date helper (if not in utils.js)
function formatDateFull(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateString;
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

console.log('✅ Share functions loaded with folder support');
// ============================================
// USER LIST FUNCTIONS (NEW)
// ============================================

// Load all users for sharing
async function loadAllUsersForSharing() {
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');

        const response = await fetch(`${apiBase}/api/share/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            return data.users || [];
        } else {
            console.error('Failed to load users:', data.message);
            return [];
        }

    } catch (error) {
        console.error('Load users error:', error);
        return [];
    }
}

// Show user selection modal for sharing
async function showUserSelectionModal(itemId, itemType) {
    const users = await loadAllUsersForSharing();
    
    if (users.length === 0) {
        showAlert('No other users available to share with', 'info');
        return;
    }

    let usersHtml = '';
    users.forEach(user => {
        const initial = user.username ? user.username[0].toUpperCase() : '?';
        usersHtml += `
            <div class="user-item" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #e5e7eb; cursor: pointer;" onclick="selectUserToShare('${user.email}', '${user.username}', ${itemId}, '${itemType}')">
                <div style="width: 40px; height: 40px; background: #6366f1; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; margin-right: 12px;">
                    ${initial}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1f2937;">${user.username}</div>
                    <div style="font-size: 12px; color: #6b7280;">${user.email}</div>
                </div>
            </div>
        `;
    });

    const modalHtml = `
        <div style="max-height: 400px; overflow-y: auto;">
            <input type="text" id="userSearchBox" placeholder="🔍 Search users..." onkeyup="filterUsersList()" style="width: 100%; padding: 10px; margin-bottom: 10px; border: 1px solid #d1d5db; border-radius: 6px;">
            <div id="usersList">${usersHtml}</div>
        </div>
    `;

    if (typeof showModal === 'function') {
        showModal('Select User to Share With', modalHtml);
    } else {
        alert('Modal function not available');
    }
}

// Filter users list in modal
function filterUsersList() {
    const searchTerm = document.getElementById('userSearchBox').value.toLowerCase();
    const userItems = document.querySelectorAll('#usersList .user-item');
    
    userItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

// Select user to share with
function selectUserToShare(email, username, itemId, itemType) {
    // Set the email in the share form
    const emailInput = document.getElementById('shareUserEmail');
    if (emailInput) {
        emailInput.value = email;
        
        // Close modal
        const modals = document.querySelectorAll('.modal');
        modals.forEach(m => m.style.display = 'none');
        
        // Show success message
        showAlert(`Selected: ${username}`, 'success');
        
        // Optionally auto-share
        // shareWithUser();
    }
}

console.log('✅ User list functions loaded');
