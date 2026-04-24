function copyTextToClipboard(text) {
    return new Promise((resolve, reject) => {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => resolve(true))
                .catch(err => {
                    console.warn('Clipboard API failed, using fallback:', err);
                    fallbackCopyText(text) ? resolve(true) : reject(err);
                });
        } else {
            fallbackCopyText(text) ? resolve(true) : reject(new Error('Copy failed'));
        }
    });
}

function fallbackCopyText(text) {
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
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
        loadSharedUsers();
    }
}

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
    console.log('Sharing with user:', email, 'permission:', permission);
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        const requestBody = { email: email, permission: permission };
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
            const permLabel = getPermissionLabel(permission);
            showAlert(`✅ Shared with ${data.shared_with?.username || email} (${permLabel})`, 'success');
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

function getPermissionLabel(permission) {
    const labels = {
        'view': '👁️ View Only',
        'download': '📥 Can Download',
        'edit': '✏️ Can Edit'
    };
    return labels[permission] || labels['view'];
}

function getPermissionColor(permission) {
    const colors = {
        'view': '#6b7280',
        'download': '#10b981',
        'edit': '#6366f1'
    };
    return colors[permission] || colors['view'];
}

function getPermissionBgColor(permission) {
    const colors = {
        'view': '#f3f4f6',
        'download': '#ecfdf5',
        'edit': '#eef2ff'
    };
    return colors[permission] || colors['view'];
}

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
            let html = `<div style="margin-top: 20px;"><h4 style="color: #374151; font-size: 14px; margin-bottom: 12px;">👥 People with access (${data.access_list.length})</h4>`;
            data.access_list.forEach(user => {
                const permLabel = getPermissionLabel(user.permission);
                const permColor = getPermissionColor(user.permission);
                const permBg = getPermissionBgColor(user.permission);
                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px; border: 1px solid #e5e7eb;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 16px;">
                                ${user.username ? user.username[0].toUpperCase() : '?'}
                            </div>
                            <div>
                                <div style="font-weight: 600; color: #1f2937;">${user.username || 'Unknown'}</div>
                                <div style="font-size: 12px; color: #6b7280;">${user.email}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <select onchange="updateUserPermission(${user.id}, this.value)" style="padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; background: ${permBg}; color: ${permColor}; font-weight: 600; cursor: pointer;">
                                <option value="view" ${user.permission === 'view' ? 'selected' : ''}>👁️ View</option>
                                <option value="download" ${user.permission === 'download' ? 'selected' : ''}>📥 Download</option>
                                <option value="edit" ${user.permission === 'edit' ? 'selected' : ''}>✏️ Edit</option>
                            </select>
                            <button onclick="removeUserAccess(${user.id})" style="padding: 6px 10px; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;" title="Remove access">✕</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = `<div style="text-align: center; padding: 30px; color: #6b7280; background: #f9fafb; border-radius: 8px; margin-top: 20px;"><div style="font-size: 40px; margin-bottom: 10px;">👤</div><p>No users have access yet</p><p style="font-size: 12px;">Share with someone using the form above</p></div>`;
        }
    } catch (error) {
        console.error('Load shared users error:', error);
        container.innerHTML = '';
    }
}

async function updateUserPermission(shareId, newPermission) {
    console.log('Updating permission:', shareId, newPermission);
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}/api/share/user/${shareId}/permission`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ permission: newPermission })
        });
        const data = await response.json();
        if (data.success) {
            const permLabel = getPermissionLabel(newPermission);
            showAlert(`✅ Permission updated to ${permLabel}`, 'success');
            loadSharedUsers();
        } else {
            showAlert(data.message || 'Failed to update permission', 'error');
            loadSharedUsers();
        }
    } catch (error) {
        console.error('Update permission error:', error);
        showAlert('Failed to update permission', 'error');
        loadSharedUsers();
    }
}

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

async function generateShareLink() {
    console.log('Generate share link called');
    if (!window.currentShareTarget) {
        console.error('No currentShareTarget');
        showAlert('No item selected', 'error');
        return;
    }
    const { id, type } = window.currentShareTarget;
    console.log('Share target:', { id, type });
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
    if (requirePassword && !password) {
        showAlert('Please enter a password', 'error');
        return;
    }
    if (setExpiry && (!expiryDays || expiryDays <= 0)) {
        showAlert('Please enter valid expiry days (greater than 0)', 'error');
        return;
    }
    if (setDownloadLimit && (!maxDownloads || maxDownloads <= 0)) {
        showAlert('Please enter valid download limit (greater than 0)', 'error');
        return;
    }
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
        const requestBody = {};
        if (type === 'file') {
            requestBody.file_id = parseInt(id);
        } else if (type === 'folder') {
            requestBody.folder_id = parseInt(id);
        } else {
            showAlert('Invalid share type', 'error');
            return;
        }
        if (password) requestBody.password = password;
        if (expiryDays && expiryDays > 0) requestBody.expires_days = expiryDays;
        if (type === 'file' && maxDownloads && maxDownloads > 0) requestBody.max_downloads = maxDownloads;
        if (type === 'folder' && maxViews && maxViews > 0) requestBody.max_views = maxViews;
        console.log('Request body:', requestBody);
        const response = await fetch(`${apiBase}/api/share/link`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        const data = await response.json();
        console.log('Response:', data);
        if (data.success) {
            try {
                await copyTextToClipboard(data.share.url);
                showAlert(`🔗 ${type === 'folder' ? 'Folder' : 'File'} share link created and copied!`, 'success');
            } catch (clipboardError) {
                console.warn('Clipboard copy failed:', clipboardError);
                showAlert('✅ Share link created! Click copy button below.', 'success');
            }
            displayGeneratedLink(data.share, type);
            loadExistingShares(id, type);
        } else {
            console.error('API Error:', data.message);
            showAlert(data.message || 'Failed to create share link', 'error');
        }
    } catch (error) {
        console.error('Generate share link error:', error);
        showAlert(`Failed to create share link: ${error.message}`, 'error');
    }
}

function displayGeneratedLink(share, type) {
    console.log('Displaying generated link:', share);
    const container = document.getElementById('shareLinkContainer');
    if (!container) {
        console.error('shareLinkContainer not found in DOM');
        return;
    }
    const escapedUrl = share.url.replace(/'/g, "\\'");
    const icon = type === 'folder' ? '📁' : '📄';
    const itemName = share.name || (type === 'folder' ? 'Folder' : 'File');
    container.innerHTML = `
        <div style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); padding: 20px; border-radius: 12px; border: 2px solid #86efac; margin-top: 20px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <span style="font-size: 24px;">✅</span>
                <strong style="color: #16a34a; font-size: 16px;">${icon} Share Link Created!</strong>
            </div>
            <div style="font-size: 14px; color: #374151; margin-bottom: 12px; font-weight: 500;">${itemName}</div>
            <div style="position: relative; margin-bottom: 12px;">
                <input type="text" id="shareUrlInput" value="${share.url}" readonly style="width: 100%; padding: 12px; padding-right: 50px; border: 2px solid #86efac; border-radius: 8px; font-family: monospace; font-size: 12px; background: white;">
                <button onclick="copyShareUrl()" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); padding: 8px 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">📋</button>
            </div>
            <div style="display: flex; gap: 10px;">
                <button onclick="copyShareUrl()" class="btn btn-primary" style="flex: 1; padding: 12px; font-size: 14px;">📋 Copy Link</button>
                <button onclick="window.open('${escapedUrl}', '_blank')" class="btn btn-secondary" style="flex: 1; padding: 12px; font-size: 14px;">🔗 Open Link</button>
            </div>
            <div style="margin-top: 12px; font-size: 12px; color: #374151; background: rgba(255,255,255,0.7); padding: 10px; border-radius: 6px;">
                ${share.has_password ? '<div style="margin: 4px 0;">🔒 Password protected</div>' : ''}
                ${share.expires_at ? `<div style="margin: 4px 0;">⏰ Expires: ${formatDateFull(share.expires_at)}</div>` : ''}
                ${type === 'file' && share.max_downloads ? `<div style="margin: 4px 0;">📥 Max downloads: ${share.max_downloads}</div>` : ''}
                ${type === 'folder' && share.max_views ? `<div style="margin: 4px 0;">👁️ Max views: ${share.max_views}</div>` : ''}
            </div>
        </div>
    `;
}

function copyShareUrl() {
    const input = document.getElementById('shareUrlInput');
    if (!input) return;
    const url = input.value;
    copyTextToClipboard(url)
        .then(() => {
            showAlert('📋 Link copied to clipboard!', 'success');
            input.select();
            input.style.background = '#d1fae5';
            setTimeout(() => { input.style.background = 'white'; }, 500);
        })
        .catch(err => {
            console.error('Copy failed:', err);
            input.select();
            showAlert('Please press Ctrl+C to copy', 'info');
        });
}

async function copyToClipboard(text) {
    try {
        await copyTextToClipboard(text);
        showAlert('📋 Copied to clipboard!', 'success');
    } catch (error) {
        console.error('Copy failed:', error);
        showAlert('Failed to copy. Please copy manually.', 'error');
    }
}

async function loadExistingShares(itemId, itemType) {
    console.log('Loading existing shares for:', itemType, itemId);
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}/api/share/my-shares`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && data.links) {
            const relevantLinks = data.links.filter(link => {
                if (itemType === 'file') return parseInt(link.file_id) === parseInt(itemId);
                else if (itemType === 'folder') return parseInt(link.folder_id) === parseInt(itemId);
                return false;
            });
            if (relevantLinks.length > 0) {
                displayExistingShares(relevantLinks, itemType);
            }
        }
    } catch (error) {
        console.error('Load existing shares error:', error);
    }
}

function displayExistingShares(links, itemType) {
    const container = document.getElementById('existingShares');
    if (!container) {
        console.error('existingShares container not found');
        return;
    }
    const icon = itemType === 'folder' ? '📁' : '📄';
    let html = `<h4 style="margin: 20px 0 12px 0; color: #374151; font-size: 14px; font-weight: 600;">${icon} Existing Share Links (${links.length})</h4>`;
    links.forEach(link => {
        const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
        let limitReached = false;
        let limitText = '';
        if (link.share_type === 'file') {
            limitReached = link.max_downloads && link.download_count >= link.max_downloads;
            limitText = `📥 ${link.download_count || 0}${link.max_downloads ? '/' + link.max_downloads : ''} downloads`;
        } else if (link.share_type === 'folder') {
            limitReached = link.max_views && link.view_count >= link.max_views;
            limitText = `👁️ ${link.view_count || 0}${link.max_views ? '/' + link.max_views : ''} views`;
        }
        const shareUrl = link.url || `${window.location.origin}/public-share.html?token=${link.share_token}`;
        const escapedUrl = shareUrl.replace(/'/g, "\\'");
        let statusBadge = '<span style="color: #10b981; font-size: 11px; font-weight: 600;">✅ Active</span>';
        if (!link.is_active) statusBadge = '<span style="color: #ef4444; font-size: 11px;">❌ Deactivated</span>';
        else if (isExpired) statusBadge = '<span style="color: #f59e0b; font-size: 11px;">⏰ Expired</span>';
        else if (limitReached) statusBadge = '<span style="color: #f59e0b; font-size: 11px;">🚫 Limit reached</span>';
        html += `
            <div style="background: #f9fafb; padding: 14px; border-radius: 10px; margin-bottom: 10px; border: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 10px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            ${statusBadge}
                            ${link.password ? '<span style="font-size: 11px; color: #6b7280;">🔒</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">${limitText}</div>
                        <div style="font-size: 11px; color: #9ca3af;">📅 ${formatDate(link.created_at)}</div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button onclick="copyToClipboard('${escapedUrl}')" class="btn btn-secondary" style="padding: 8px 12px; font-size: 12px;" title="Copy link">📋</button>
                        <button onclick="viewShareStats(${link.id})" class="btn btn-info" style="padding: 8px 12px; font-size: 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;" title="View stats">📊</button>
                        <button onclick="deleteShareLink(${link.id})" class="btn btn-danger" style="padding: 8px 12px; font-size: 12px;" title="Delete">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

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
            let modalContent = `
                <div style="padding: 20px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="font-size: 48px; margin-bottom: 10px;">${icon}</div>
                        <h3 style="color: #1f2937; margin: 0;">${stats.name}</h3>
                    </div>
                    <div style="background: #f9fafb; padding: 16px; border-radius: 10px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            ${stats.type === 'file' ? `
                                <div style="background: white; padding: 12px; border-radius: 8px; text-align: center;">
                                    <div style="font-size: 24px; font-weight: 700; color: #6366f1;">${stats.download_count}</div>
                                    <div style="font-size: 12px; color: #6b7280;">Downloads${stats.max_downloads ? ' / ' + stats.max_downloads : ''}</div>
                                </div>
                            ` : `
                                <div style="background: white; padding: 12px; border-radius: 8px; text-align: center;">
                                    <div style="font-size: 24px; font-weight: 700; color: #6366f1;">${stats.view_count}</div>
                                    <div style="font-size: 12px; color: #6b7280;">Views${stats.max_views ? ' / ' + stats.max_views : ''}</div>
                                </div>
                            `}
                            <div style="background: white; padding: 12px; border-radius: 8px; text-align: center;">
                                <div style="font-size: 24px; font-weight: 700; color: ${stats.is_active ? '#10b981' : '#ef4444'};">${stats.is_active ? '✅' : '❌'}</div>
                                <div style="font-size: 12px; color: #6b7280;">${stats.is_active ? 'Active' : 'Inactive'}</div>
                            </div>
                        </div>
                        <div style="margin-top: 16px; font-size: 13px; color: #374151;">
                            ${stats.expires_at ? `<div style="margin: 8px 0;"><strong>⏰ Expires:</strong> ${formatDateFull(stats.expires_at)}</div>` : ''}
                            ${stats.last_accessed_at ? `<div style="margin: 8px 0;"><strong>👁️ Last accessed:</strong> ${formatDateFull(stats.last_accessed_at)}</div>` : ''}
                            <div style="margin: 8px 0;"><strong>📅 Created:</strong> ${formatDateFull(stats.created_at)}</div>
                        </div>
                    </div>
                    <button onclick="this.closest('.modal').remove()" class="btn btn-secondary" style="width: 100%; margin-top: 16px; padding: 12px;">Close</button>
                </div>
            `;
            showStatsModal(modalContent);
        }
    } catch (error) {
        console.error('View stats error:', error);
        showAlert('Failed to load statistics', 'error');
    }
}

function showStatsModal(content) {
    let modal = document.getElementById('shareStatsModal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'shareStatsModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
        <div class="modal-dialog" style="max-width: 400px;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">📊 Share Statistics</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
                </div>
                <div class="modal-body" style="padding: 0;">${content}</div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function deleteShareLink(linkId) {
    if (!confirm('Delete this share link? This will deactivate the link permanently.')) return;
    console.log('Deleting share link:', linkId);
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}/api/share/link/${linkId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            showAlert('✅ Share link deactivated', 'success');
            if (window.currentShareTarget) {
                loadExistingShares(window.currentShareTarget.id, window.currentShareTarget.type);
            }
            const container = document.getElementById('shareLinkContainer');
            if (container) container.innerHTML = '';
        } else {
            showAlert(data.message || 'Failed to delete', 'error');
        }
    } catch (error) {
        console.error('Delete share link error:', error);
        showAlert('Failed to delete share link', 'error');
    }
}

function togglePasswordInput() {
    const checkbox = document.getElementById('requirePassword');
    const input = document.getElementById('sharePassword');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) input.focus();
        else input.value = '';
    }
}

function toggleExpiryDate() {
    const checkbox = document.getElementById('setExpiry');
    const input = document.getElementById('expiryDays');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) input.focus();
        else input.value = '';
    }
}

function toggleDownloadLimit() {
    const checkbox = document.getElementById('setDownloadLimit');
    const input = document.getElementById('maxDownloads');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) input.focus();
        else input.value = '';
    }
}

function toggleViewLimit() {
    const checkbox = document.getElementById('setViewLimit');
    const input = document.getElementById('maxViews');
    if (checkbox && input) {
        input.disabled = !checkbox.checked;
        input.style.display = checkbox.checked ? 'block' : 'none';
        if (checkbox.checked) input.focus();
        else input.value = '';
    }
}

function formatDateFull(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return dateString;
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return dateString;
    }
}

async function loadAllUsersForSharing() {
    try {
        const apiBase = getApiBase();
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}/api/share/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) return data.users || [];
        else {
            console.error('Failed to load users:', data.message);
            return [];
        }
    } catch (error) {
        console.error('Load users error:', error);
        return [];
    }
}

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
            <div class="user-item" style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #e5e7eb; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='white'" onclick="selectUserToShare('${user.email}', '${user.username}')">
                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; margin-right: 12px;">${initial}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: #1f2937;">${user.username}</div>
                    <div style="font-size: 12px; color: #6b7280;">${user.email}</div>
                </div>
            </div>
        `;
    });
    let modal = document.getElementById('userSelectModal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'userSelectModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
        <div class="modal-dialog" style="max-width: 400px;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">👥 Select User</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
                </div>
                <div class="modal-body" style="padding: 0;">
                    <div style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                        <input type="text" id="userSearchBox" placeholder="🔍 Search users..." onkeyup="filterUsersList()" style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px;">
                    </div>
                    <div id="usersList" style="max-height: 350px; overflow-y: auto;">${usersHtml}</div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function filterUsersList() {
    const searchTerm = document.getElementById('userSearchBox').value.toLowerCase();
    const userItems = document.querySelectorAll('#usersList .user-item');
    userItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

function selectUserToShare(email, username) {
    const emailInput = document.getElementById('shareUserEmail');
    if (emailInput) {
        emailInput.value = email;
        const modal = document.getElementById('userSelectModal');
        if (modal) modal.remove();
        showAlert(`Selected: ${username}`, 'success');
    }
}

console.log('Share functions loaded with permission support');
