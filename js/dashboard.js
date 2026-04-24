let currentFolderId = null;
let currentView = 'grid';
let selectedItems = [];
let contextMenuTarget = null;
let files = [];
let folders = [];

function initializeDashboard() {
    log('Initializing dashboard...');
    loadUserInfo();
    loadStorageInfo();
    loadFavoriteCount();
    loadFilesAndFolders();
    setupDashboardEvents();
    log('Dashboard initialized successfully');
}

function loadUserInfo() {
    const user = getCurrentUser();
    if (user) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = user.username || 'User';
        }
    }
}

async function loadStorageInfo() {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
                const used = data.user.storage_used || 0;
                const total = data.user.storage_quota || 107374182400;
                const percentage = Math.min(Math.round((used / total) * 100), 100);
                const savedUser = getCurrentUser();
                if (savedUser) {
                    savedUser.storage_used = used;
                    savedUser.storage_quota = total;
                    localStorage.setItem('user', JSON.stringify(savedUser));
                }
                const storageUsedEl = document.getElementById('storageUsed');
                const storageTotalEl = document.getElementById('storageTotal');
                const storageBarFillEl = document.getElementById('storageBarFill');
                if (storageUsedEl) storageUsedEl.textContent = formatFileSize(used);
                if (storageTotalEl) storageTotalEl.textContent = formatFileSize(total);
                if (storageBarFillEl) storageBarFillEl.style.width = percentage + '%';
                const usedGBEl = document.getElementById('usedGB');
                const totalGBEl = document.getElementById('totalGB');
                const freeGBEl = document.getElementById('freeGB');
                const storageBarLargeEl = document.getElementById('storageBarLarge');
                if (usedGBEl) usedGBEl.textContent = formatFileSize(used);
                if (totalGBEl) totalGBEl.textContent = formatFileSize(total);
                if (freeGBEl) freeGBEl.textContent = formatFileSize(total - used);
                if (storageBarLargeEl) storageBarLargeEl.style.width = percentage + '%';
                log('Storage updated from server:', formatFileSize(used), '/', formatFileSize(total));
            }
        } else {
            loadStorageInfoFromCache();
        }
    } catch (error) {
        logError('Failed to fetch storage info from server:', error);
        loadStorageInfoFromCache();
    }
}

function updateStorageDisplay(used, quota) {
    const total = quota || 107374182400;
    const percentage = Math.min(Math.round((used / total) * 100), 100);
    const savedUser = getCurrentUser();
    if (savedUser) {
        savedUser.storage_used = used;
        savedUser.storage_quota = total;
        localStorage.setItem('user', JSON.stringify(savedUser));
    }
    const storageUsedEl = document.getElementById('storageUsed');
    const storageTotalEl = document.getElementById('storageTotal');
    const storageBarFillEl = document.getElementById('storageBarFill');
    if (storageUsedEl) storageUsedEl.textContent = formatFileSize(used);
    if (storageTotalEl) storageTotalEl.textContent = formatFileSize(total);
    if (storageBarFillEl) storageBarFillEl.style.width = percentage + '%';
    const usedGBEl = document.getElementById('usedGB');
    const totalGBEl = document.getElementById('totalGB');
    const freeGBEl = document.getElementById('freeGB');
    const storageBarLargeEl = document.getElementById('storageBarLarge');
    if (usedGBEl) usedGBEl.textContent = formatFileSize(used);
    if (totalGBEl) totalGBEl.textContent = formatFileSize(total);
    if (freeGBEl) freeGBEl.textContent = formatFileSize(total - used);
    if (storageBarLargeEl) storageBarLargeEl.style.width = percentage + '%';
    log('Storage display updated:', formatFileSize(used), '/', formatFileSize(total));
}

function loadStorageInfoFromCache() {
    const user = getCurrentUser();
    if (user) {
        const used = user.storage_used || 0;
        const total = user.storage_quota || 107374182400;
        const percentage = Math.min(Math.round((used / total) * 100), 100);
        const storageUsedEl = document.getElementById('storageUsed');
        const storageTotalEl = document.getElementById('storageTotal');
        const storageBarFillEl = document.getElementById('storageBarFill');
        if (storageUsedEl) storageUsedEl.textContent = formatFileSize(used);
        if (storageTotalEl) storageTotalEl.textContent = formatFileSize(total);
        if (storageBarFillEl) storageBarFillEl.style.width = percentage + '%';
        const usedGBEl = document.getElementById('usedGB');
        const totalGBEl = document.getElementById('totalGB');
        const freeGBEl = document.getElementById('freeGB');
        const storageBarLargeEl = document.getElementById('storageBarLarge');
        if (usedGBEl) usedGBEl.textContent = formatFileSize(used);
        if (totalGBEl) totalGBEl.textContent = formatFileSize(total);
        if (freeGBEl) freeGBEl.textContent = formatFileSize(total - used);
        if (storageBarLargeEl) storageBarLargeEl.style.width = percentage + '%';
    }
}

async function loadFilesAndFolders(folderId = null) {
    log('Loading files and folders...', { folderId });
    currentFolderId = folderId;
    const apiBase = getApiBase();
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.innerHTML = `
            <div class="loading-state" id="loadingState">
                <div class="spinner"></div>
                <p>Loading files...</p>
            </div>
        `;
    }
    try {
        const token = localStorage.getItem('token');
        const foldersUrl = folderId 
            ? `${apiBase}/api/folders?parent_id=${folderId}`
            : `${apiBase}/api/folders`;
        const foldersResponse = await fetch(foldersUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const foldersData = await foldersResponse.json();
        const filesUrl = folderId 
            ? `${apiBase}/api/files?folder_id=${folderId}`
            : `${apiBase}/api/files`;
        const filesResponse = await fetch(filesUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const filesData = await filesResponse.json();
        folders = foldersData.success ? foldersData.folders : [];
        files = filesData.success ? filesData.files : [];
        log('Loaded folders:', folders.length);
        log('Loaded files:', files.length);
        renderFilesAndFolders();
    } catch (error) {
        logError('Error loading files', error);
        if (fileGrid) {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load files</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="loadFilesAndFolders(${folderId})">Retry</button>
                </div>
            `;
        }
    }
}

async function renderFilesAndFolders() {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    if (folders.length === 0 && files.length === 0) {
        fileGrid.innerHTML = `
            <div class="empty-state" id="emptyState">
                <div class="empty-icon">📁</div>
                <h3>No files yet</h3>
                <p>Upload your first file to get started</p>
                <button class="btn btn-primary" onclick="openFileUpload()">Upload File</button>
            </div>
        `;
        return;
    }
    const token = localStorage.getItem('token');
    const apiBase = getApiBase();
    let favoriteIds = { files: [], folders: [] };
    try {
        const favResponse = await fetch(`${apiBase}/api/favorites`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const favData = await favResponse.json();
        if (favData.success) {
            favoriteIds.files = favData.favorites.filter(f => f.item_type === 'file').map(f => f.item_id);
            favoriteIds.folders = favData.favorites.filter(f => f.item_type === 'folder').map(f => f.item_id);
        }
    } catch (error) {
        log('Could not load favorites for badges');
    }
    let html = '';
    folders.forEach(folder => {
        const itemsCount = (folder.file_count || 0) + (folder.subfolder_count || 0);
        const isFavorite = favoriteIds.folders.includes(folder.id);
        html += `
            <div class="file-card ${isFavorite ? 'is-favorite' : ''}" 
                 data-id="${folder.id}" 
                 data-type="folder" 
                 data-name="${escapeHtml(folder.name)}"
                 style="position: relative;"
                 onclick="handleItemClick(event, ${folder.id}, 'folder')"
                 ondblclick="openFolder(${folder.id})"
                 oncontextmenu="showContextMenu(event, ${folder.id}, 'folder')">
                ${isFavorite ? `<div class="favorite-badge" style="position: absolute;top: 8px;right: 8px;background: #fbbf24;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;box-shadow: 0 2px 4px rgba(0,0,0,0.2);z-index: 10;">⭐</div>` : ''}
                <div class="file-icon">📁</div>
                <div class="file-name">${escapeHtml(folder.name)}</div>
                <div class="file-info">${itemsCount} items</div>
            </div>
        `;
    });
    files.forEach(file => {
        const fileName = file.original_name || file.filename;
        const icon = getFileIcon(fileName);
        const modified = file.updated_at || file.created_at;
        const isFavorite = favoriteIds.files.includes(file.id);
        html += `
            <div class="file-card ${isFavorite ? 'is-favorite' : ''}" 
                 data-id="${file.id}" 
                 data-type="file" 
                 data-name="${escapeHtml(fileName)}"
                 style="position: relative;"
                 onclick="handleItemClick(event, ${file.id}, 'file')"
                 ondblclick="previewFile(${file.id})"
                 oncontextmenu="showContextMenu(event, ${file.id}, 'file')">
                ${isFavorite ? `<div class="favorite-badge" style="position: absolute;top: 8px;right: 8px;background: #fbbf24;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;box-shadow: 0 2px 4px rgba(0,0,0,0.2);z-index: 10;">⭐</div>` : ''}
                <div class="file-icon">${icon}</div>
                <div class="file-name">${escapeHtml(fileName)}</div>
                <div class="file-info">${formatFileSize(file.size)} • ${formatDate(modified)}</div>
            </div>
        `;
    });
    fileGrid.innerHTML = html;
}

function handleItemClick(event, itemId, itemType) {
    event.stopPropagation(); // Prevent bubbling to document
    
    const card = event.currentTarget;
    
    // If Ctrl/Cmd key is pressed, toggle selection
    if (event.ctrlKey || event.metaKey) {
        card.classList.toggle('selected');
        updateSelection();
        return;
    }
    
    // If clicking on already selected item (single selection), deselect it
    if (card.classList.contains('selected') && selectedItems.length === 1) {
        card.classList.remove('selected');
        updateSelection();
        return;
    }
    
    // Otherwise, clear all and select this one
    clearSelection();
    card.classList.add('selected');
    updateSelection();
}

function updateSelection() {
    const selectedCards = document.querySelectorAll('.file-card.selected');
    selectedItems = Array.from(selectedCards).map(card => ({
        id: card.dataset.id,
        type: card.dataset.type,
        name: card.dataset.name
    }));
    
    let selectionBar = document.getElementById('selectionBar');
    
    // Create selection bar if it doesn't exist
    if (!selectionBar) {
        selectionBar = document.createElement('div');
        selectionBar.id = 'selectionBar';
        selectionBar.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #1f2937, #374151);
            color: white;
            padding: 12px 20px;
            border-radius: 16px;
            display: none;
            align-items: center;
            gap: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideUp 0.3s ease;
        `;
        selectionBar.innerHTML = `
            <style>
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(100px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                .selection-btn {
                    background: rgba(255,255,255,0.1);
                    border: none;
                    color: white;
                    padding: 8px 14px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                }
                .selection-btn:hover {
                    background: rgba(255,255,255,0.2);
                    transform: translateY(-2px);
                }
                .selection-btn-danger:hover {
                    background: #ef4444;
                }
            </style>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span id="selectedCount" style="font-size: 18px; font-weight: 700;">0</span>
                <span style="font-size: 13px; opacity: 0.9;">item(s) selected</span>
            </div>
            <div style="width: 1px; height: 24px; background: rgba(255,255,255,0.2);"></div>
            <div style="display: flex; gap: 8px;">
                <button class="selection-btn" onclick="downloadSelectedItems()" title="Download">
                    <span>📥</span> Download
                </button>
                <button class="selection-btn" onclick="shareSelectedItems()" title="Share">
                    <span>🔗</span> Share
                </button>
                <button class="selection-btn" onclick="moveSelectedItems()" title="Move">
                    <span>📁</span> Move
                </button>
                <button class="selection-btn selection-btn-danger" onclick="deleteSelectedItems()" title="Delete">
                    <span>🗑️</span> Delete
                </button>
            </div>
            <div style="width: 1px; height: 24px; background: rgba(255,255,255,0.2);"></div>
            <button onclick="clearSelection()" style="
                background: rgba(255,255,255,0.15);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            " onmouseover="this.style.background='#ef4444'" onmouseout="this.style.background='rgba(255,255,255,0.15)'" title="Clear selection (Esc)">✕</button>
        `;
        document.body.appendChild(selectionBar);
    }
    
    const selectedCountEl = document.getElementById('selectedCount');
    
    if (selectedItems.length > 0) {
        selectionBar.style.display = 'flex';
        if (selectedCountEl) selectedCountEl.textContent = selectedItems.length;
    } else {
        selectionBar.style.display = 'none';
    }
}

function clearSelection() {
    const selectedCards = document.querySelectorAll('.file-card.selected');
    selectedCards.forEach(card => card.classList.remove('selected'));
    selectedItems = [];
    
    const selectionBar = document.getElementById('selectionBar');
    if (selectionBar) {
        selectionBar.style.display = 'none';
    }
}
// Download selected items
async function downloadSelectedItems() {
    if (selectedItems.length === 0) return;
    
    if (selectedItems.length === 1) {
        const item = selectedItems[0];
        downloadItem(item.id, item.type);
    } else {
        showAlert(`Downloading ${selectedItems.length} items...`, 'info');
        for (const item of selectedItems) {
            await downloadItem(item.id, item.type);
        }
    }
    clearSelection();
}

// Share selected items
function shareSelectedItems() {
    if (selectedItems.length === 0) return;
    
    if (selectedItems.length === 1) {
        const item = selectedItems[0];
        shareItemFromContext(item.id, item.type);
    } else {
        showAlert('Please select only one item to share', 'warning');
    }
}

// Move selected items
async function moveSelectedItems() {
    if (selectedItems.length === 0) return;
    
    if (selectedItems.length === 1) {
        const item = selectedItems[0];
        moveItem(item.id, item.type);
    } else {
        showAlert('Please select only one item to move', 'warning');
    }
}

// Delete selected items
async function deleteSelectedItems() {
    if (selectedItems.length === 0) return;
    
    const count = selectedItems.length;
    const message = count === 1 
        ? `Delete "${selectedItems[0].name}"?` 
        : `Delete ${count} selected items?`;
    
    if (!confirm(message)) return;
    
    showAlert(`Deleting ${count} item(s)...`, 'info');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const item of selectedItems) {
        try {
            const token = localStorage.getItem('token');
            const apiBase = getApiBase();
            const endpoint = item.type === 'folder' 
                ? `${apiBase}/api/folders/${item.id}` 
                : `${apiBase}/api/files/${item.id}`;
            
            const response = await fetch(endpoint, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            if (data.success) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
        }
    }
    
    clearSelection();
    
    if (failCount === 0) {
        showAlert(`✅ Deleted ${successCount} item(s)`, 'success');
    } else {
        showAlert(`Deleted ${successCount}, failed ${failCount}`, 'warning');
    }
    
    // Refresh file list
    if (typeof loadFilesAndFolders === 'function') {
        loadFilesAndFolders(typeof currentFolderId !== 'undefined' ? currentFolderId : null);
    }
}

function openFolder(folderId) {
    log('Opening folder:', folderId);    
    const folder = folders.find(f => f.id === folderId);
    const folderName = folder ? folder.name : 'Folder';    
    loadFilesAndFolders(folderId);    
    const currentFolderEl = document.getElementById('currentFolder');
    const separatorEl = document.getElementById('breadcrumbSeparator');    
    if (currentFolderEl) {
        currentFolderEl.textContent = folderName;
    }   
    if (separatorEl) {
        separatorEl.style.display = 'inline';
    }
}

function navigateToRoot() {
    log('Navigating to root');
    currentFolderId = null;
    loadFilesAndFolders(null);  
    const currentFolderEl = document.getElementById('currentFolder');
    const separatorEl = document.getElementById('breadcrumbSeparator'); 
    if (currentFolderEl) {
        currentFolderEl.textContent = 'All Files';
    } 
    if (separatorEl) {
        separatorEl.style.display = 'none';
    }
    updateSidebarActive('myfiles');
}

function showContextMenu(event, itemId, itemType) {
    event.preventDefault();
    event.stopPropagation();  
    contextMenuTarget = { id: itemId, type: itemType }
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return; 
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        contextMenu.style.left = (event.pageX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = (event.pageY - rect.height) + 'px';
    }
}

function hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
    contextMenuTarget = null;
}

function contextAction(action) {
    if (!contextMenuTarget) return;
    const { id, type } = contextMenuTarget;
    const itemId = parseInt(id); 
    log('Context action:', action, { id: itemId, type });
    switch (action) {
        case 'open':
            if (type === 'folder') openFolder(itemId);
            else previewFile(itemId);
            break;
        case 'preview':
            previewFile(itemId);
            break;
        case 'download':
            downloadItem(itemId, type);
            break;
        case 'share':
            shareItemFromContext(itemId, type);
            break;
        case 'copy':
            copyItem(itemId, type);
            break;
        case 'move':
            moveItem(itemId, type);
            break;
        case 'favorite':
            toggleFavorite(itemId, type);
            break;
        case 'rename':
            renameItem(itemId, type);
            break;
        case 'delete':
            deleteItem(itemId, type);
            break;
        case 'properties':
            showProperties(itemId, type);
            break;
    }
    hideContextMenu();
}

function shareItemFromContext(itemId, itemType) {
    log('Share from context:', { itemId, itemType });
    const id = parseInt(itemId);
    let item;
    if (itemType === 'folder') {
        item = folders.find(f => parseInt(f.id) === id);
    } else {
        item = files.find(f => parseInt(f.id) === id);
    }
    if (!item) {
        showAlert('Item not found', 'error');
        return;
    }
    if (typeof openShareModal === 'function') {
        openShareModal(item, itemType);
    } else {
        log('openShareModal not found, using fallback');
        openShareModalFallback(item, itemType);
    }
}

function openShareModalFallback(item, itemType) {
    const itemName = itemType === 'folder' ? item.name : (item.original_name || item.filename);
    const itemSize = item.size || 0;
    const fileCount = itemType === 'folder' ? (item.file_count || 0) : 0;
    const subfolderCount = itemType === 'folder' ? (item.subfolder_count || 0) : 0;
    const icon = itemType === 'folder' ? '📁' : getFileIcon(itemName);
    const shareItemNameEl = document.getElementById('shareItemName');
    const shareIconEl = document.getElementById('shareIcon');
    const shareNameEl = document.getElementById('shareName');
    const shareMetaEl = document.getElementById('shareMeta');  
    if (shareItemNameEl) shareItemNameEl.textContent = itemName;
    if (shareIconEl) shareIconEl.textContent = icon;
    if (shareNameEl) shareNameEl.textContent = itemName;  
    if (shareMetaEl) {
        if (itemType === 'folder') {
            let metaText = `${fileCount} files`;
            if (subfolderCount > 0) {
                metaText += ` • ${subfolderCount} folders`;
            }
            shareMetaEl.textContent = metaText;
        } else {
            shareMetaEl.textContent = formatFileSize(itemSize);
        }
    }
    const downloadLimitGroup = document.getElementById('downloadLimitGroup');
    const viewLimitGroup = document.getElementById('viewLimitGroup');  
    if (itemType === 'file') {
        if (downloadLimitGroup) downloadLimitGroup.style.display = 'block';
        if (viewLimitGroup) viewLimitGroup.style.display = 'none';
    } else if (itemType === 'folder') {
        if (downloadLimitGroup) downloadLimitGroup.style.display = 'none';
        if (viewLimitGroup) viewLimitGroup.style.display = 'block';
    }
    window.currentShareTarget = { id: item.id, type: itemType, name: itemName };
    const requirePassword = document.getElementById('requirePassword');
    const sharePassword = document.getElementById('sharePassword');
    const setExpiry = document.getElementById('setExpiry');
    const expiryDays = document.getElementById('expiryDays');
    const setDownloadLimit = document.getElementById('setDownloadLimit');
    const maxDownloads = document.getElementById('maxDownloads');
    const setViewLimit = document.getElementById('setViewLimit');
    const maxViews = document.getElementById('maxViews'); 
    if (requirePassword) requirePassword.checked = false;
    if (sharePassword) {
        sharePassword.value = '';
        sharePassword.disabled = true;
        sharePassword.style.display = 'none';
    }
    if (setExpiry) setExpiry.checked = false;
    if (expiryDays) {
        expiryDays.value = '';
        expiryDays.disabled = true;
        expiryDays.style.display = 'none';
    }
    if (setDownloadLimit) setDownloadLimit.checked = false;
    if (maxDownloads) {
        maxDownloads.value = '';
        maxDownloads.disabled = true;
        maxDownloads.style.display = 'none';
    }
    if (setViewLimit) setViewLimit.checked = false;
    if (maxViews) {
        maxViews.value = '';
        maxViews.disabled = true;
        maxViews.style.display = 'none';
    }
    const shareLinkContainer = document.getElementById('shareLinkContainer');
    const existingShares = document.getElementById('existingShares');
    if (shareLinkContainer) shareLinkContainer.innerHTML = '';
    if (existingShares) existingShares.innerHTML = '';
    if (typeof loadExistingShares === 'function') {
        loadExistingShares(item.id, itemType);
    }
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        shareModal.style.display = 'flex';
    }
}

function previewFile(fileId) {
    log('Preview file:', fileId);
    const id = parseInt(fileId);
    const file = files.find(f => parseInt(f.id) === id);
    if (!file) {
        showAlert('File not found', 'error');
        return;
    }
    const fileName = file.original_name || file.filename;
    const ext = fileName.split('.').pop().toLowerCase();
    const apiBase = getApiBase();
    const token = localStorage.getItem('token');
    const previewUrl = `${apiBase}/api/files/${id}/preview?token=${token}`;
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'];
    const videoTypes = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];
    const audioTypes = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
    const textTypes = ['txt', 'md', 'markdown', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'sql', 'sh', 'bash', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'csv'];
    let previewHTML = '';
    if (imageTypes.includes(ext)) {
        previewHTML = `
            <div style="text-align:center;max-height:70vh;overflow:auto;">
                <img src="${previewUrl}" style="max-width:100%;max-height:70vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.2);" alt="${escapeHtml(fileName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'padding:40px;text-align:center;\\'>❌ Failed to load image</div>';">
            </div>
            <div style="text-align:center;margin-top:16px;">
                <button onclick="downloadItem(${id},'file');closePreviewModal();" class="btn btn-primary">📥 Download</button>
            </div>
        `;
        showPreviewModal(fileName, previewHTML, file.size);
    } else if (videoTypes.includes(ext)) {
        previewHTML = `
            <div style="text-align:center;">
                <video controls autoplay style="max-width:100%;max-height:70vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.2);">
                    <source src="${previewUrl}" type="video/${ext === 'mov' ? 'quicktime' : (ext === 'mkv' ? 'x-matroska' : ext)}">
                    Your browser does not support video playback.
                </video>
            </div>
            <div style="text-align:center;margin-top:16px;">
                <button onclick="downloadItem(${id},'file');closePreviewModal();" class="btn btn-primary">📥 Download</button>
            </div>
        `;
        showPreviewModal(fileName, previewHTML, file.size);
    } else if (audioTypes.includes(ext)) {
        previewHTML = `
            <div style="text-align:center;padding:40px;">
                <div style="font-size:100px;margin-bottom:20px;">🎵</div>
                <h3 style="font-size:20px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                <p style="color:#6b7280;margin-bottom:24px;">${formatFileSize(file.size)}</p>
                <audio controls autoplay style="width:100%;max-width:500px;">
                    <source src="${previewUrl}" type="audio/${ext === 'm4a' ? 'mp4' : ext}">
                    Your browser does not support audio playback.
                </audio>
                <div style="margin-top:16px;">
                    <button onclick="downloadItem(${id},'file');closePreviewModal();" class="btn btn-primary">📥 Download</button>
                </div>
            </div>
        `;
        showPreviewModal(fileName, previewHTML, file.size);
    } else if (ext === 'pdf') {
        previewHTML = `
            <div style="height:75vh;">
                <iframe src="${previewUrl}" style="width:100%;height:100%;border:none;border-radius:8px;"></iframe>
            </div>
            <div style="text-align:center;margin-top:12px;">
                <button onclick="downloadItem(${id},'file');closePreviewModal();" class="btn btn-primary">📥 Download</button>
            </div>
        `;
        showPreviewModal(fileName, previewHTML, file.size);
    } else if (textTypes.includes(ext)) {
        loadTextFileContent(id, fileName, file.size);
    } else {
        previewHTML = `
            <div style="text-align:center;padding:60px;">
                <div style="font-size:100px;margin-bottom:20px;">${getFileIcon(fileName)}</div>
                <h3 style="font-size:22px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                <p style="color:#6b7280;margin-bottom:8px;">${formatFileSize(file.size)}</p>
                <p style="color:#9ca3af;margin-bottom:24px;">Preview not available for this file type</p>
                <button onclick="downloadItem(${id},'file');closePreviewModal();" class="btn btn-primary" style="padding:12px 32px;font-size:16px;">📥 Download File</button>
            </div>
        `;
        showPreviewModal(fileName, previewHTML, file.size);
    }
}
async function loadTextFileContentFullscreen(fileId, fileName, fileSize) {
    const loadingHTML = `
        <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div class="spinner" style="width:50px;height:50px;border-width:4px;margin-bottom:20px;"></div>
            <p style="color:#6b7280;font-size:16px;">Loading file content...</p>
        </div>
    `;
    showPreviewModal(fileName, loadingHTML, fileSize);
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/files/${fileId}/content?token=${token}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const escapedContent = escapeHtml(data.content);
            const lines = data.content.split('\n');
            const lineNumbers = lines.map((_, i) => `<span style="color:#636d83;user-select:none;">${i + 1}</span>`).join('\n');
            
            const contentHTML = `
                <div style="width:100%;height:calc(100vh - 140px);display:flex;flex-direction:column;border-radius:8px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">
                    <!-- Code Header -->
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#1f2937;border-bottom:1px solid #374151;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="font-size:22px;">${getFileIcon(fileName)}</span>
                            <span style="color:#e5e7eb;font-weight:600;font-size:15px;">${escapeHtml(data.file.name)}</span>
                            <span style="color:#9ca3af;font-size:12px;background:#374151;padding:4px 12px;border-radius:12px;font-weight:500;">${data.file.language}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:16px;">
                            <span style="color:#9ca3af;font-size:13px;">${data.line_count} lines</span>
                            <span style="color:#9ca3af;font-size:13px;">${formatFileSize(data.file.size)}</span>
                            <!-- Edit/View Toggle -->
                            <button id="editToggleBtn" onclick="toggleEditMode(${fileId})" style="
                                background: #374151; border: 1px solid #4b5563; color: #e5e7eb;
                                padding: 6px 14px; border-radius: 8px; cursor: pointer;
                                font-size: 12px; font-weight: 600; transition: all 0.2s;
                            " onmouseover="this.style.background='#4b5563'" onmouseout="this.style.background='#374151'">
                                ✏️ Edit
                            </button>
                        </div>
                    </div>
                    
                    <!-- View Mode (default) -->
                    <div id="viewModeContainer" style="flex:1;overflow:auto;background:#282c34;">
                        <div style="display:flex;font-family:'Fira Code','JetBrains Mono',Monaco,Consolas,monospace;font-size:14px;line-height:1.7;min-height:100%;">
                            <pre style="margin:0;padding:20px 14px;text-align:right;background:#21252b;color:#636d83;border-right:1px solid #3e4451;user-select:none;position:sticky;left:0;">${lineNumbers}</pre>
                            <pre style="margin:0;padding:20px;flex:1;color:#abb2bf;overflow-x:auto;white-space:pre;">${escapedContent}</pre>
                        </div>
                    </div>
                    
                    <!-- Edit Mode (hidden by default) -->
                    <div id="editModeContainer" style="flex:1;display:none;background:#282c34;">
                        <textarea id="fileEditTextarea" spellcheck="false" style="
                            width: 100%;
                            height: 100%;
                            background: #282c34;
                            color: #abb2bf;
                            font-family: 'Fira Code', 'JetBrains Mono', Monaco, Consolas, monospace;
                            font-size: 14px;
                            line-height: 1.7;
                            padding: 20px;
                            border: none;
                            outline: none;
                            resize: none;
                            tab-size: 4;
                            white-space: pre;
                            overflow: auto;
                        ">${escapeHtml(data.content)}</textarea>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div style="display:flex;justify-content:center;gap:12px;padding:16px;background:#1f2937;border-top:1px solid #374151;">
                        <button onclick="copyFileContent()" class="btn btn-secondary" style="padding:10px 24px;font-size:14px;background:#374151;color:#e5e7eb;border:none;border-radius:8px;cursor:pointer;font-weight:600;">📋 Copy</button>
                        
                        <!-- Save Button (hidden by default, shown in edit mode) -->
                        <button id="saveFileBtn" onclick="saveFileContent(${fileId}, '${escapeHtml(fileName).replace(/'/g, "\\'")}')" style="
                            display: none;
                            padding: 10px 24px;
                            font-size: 14px;
                            background: #10b981;
                            color: #fff;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: 600;
                            transition: all 0.2s;
                            animation: fadeIn 0.3s ease;
                        " onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">💾 Save Changes</button>
                        
                        <button onclick="downloadItem(${fileId},'file');closePreviewModal();" class="btn btn-primary" style="padding:10px 24px;font-size:14px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">📥 Download</button>
                    </div>
                </div>
            `;
            
            window.currentFileContent = data.content;
            window.isEditMode = false;
            updatePreviewModalContent(contentHTML);
        } else {
            const errorHTML = `
                <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <div style="font-size:100px;margin-bottom:24px;">⚠️</div>
                    <h3 style="color:#1f2937;margin-bottom:12px;font-size:22px;">${data.message || 'Cannot preview this file'}</h3>
                    <p style="color:#6b7280;margin-bottom:30px;font-size:15px;">This file type cannot be displayed as text</p>
                    <button onclick="downloadItem(${fileId},'file');closePreviewModal();" class="btn btn-primary" style="padding:14px 32px;font-size:16px;">📥 Download Instead</button>
                </div>
            `;
            updatePreviewModalContent(errorHTML);
        }
    } catch (error) {
        console.error('Load file content error:', error);
        const errorHTML = `
            <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <div style="font-size:100px;margin-bottom:24px;">❌</div>
                <h3 style="color:#1f2937;margin-bottom:12px;font-size:22px;">Failed to load file</h3>
                <p style="color:#6b7280;margin-bottom:30px;font-size:15px;">${error.message}</p>
                <button onclick="downloadItem(${fileId},'file');closePreviewModal();" class="btn btn-primary" style="padding:14px 32px;font-size:16px;">📥 Download Instead</button>
            </div>
        `;
        updatePreviewModalContent(errorHTML);
    }
}

// Toggle between view and edit mode
function toggleEditMode(fileId) {
    const viewContainer = document.getElementById('viewModeContainer');
    const editContainer = document.getElementById('editModeContainer');
    const editBtn = document.getElementById('editToggleBtn');
    const saveBtn = document.getElementById('saveFileBtn');
    const textarea = document.getElementById('fileEditTextarea');
    
    if (!viewContainer || !editContainer) return;
    
    window.isEditMode = !window.isEditMode;
    
    if (window.isEditMode) {
        // Switch to EDIT mode
        viewContainer.style.display = 'none';
        editContainer.style.display = 'block';
        saveBtn.style.display = 'inline-flex';
        editBtn.innerHTML = '👁️ View';
        editBtn.style.background = '#10b981';
        editBtn.style.borderColor = '#059669';
        
        // Focus textarea and move cursor to end
        if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
        
        // Handle Tab key in textarea for indentation
        if (textarea) {
            textarea.addEventListener('keydown', handleTabKey);
        }
    } else {
        // Switch to VIEW mode
        viewContainer.style.display = 'block';
        editContainer.style.display = 'none';
        saveBtn.style.display = 'none';
        editBtn.innerHTML = '✏️ Edit';
        editBtn.style.background = '#374151';
        editBtn.style.borderColor = '#4b5563';
    }
}

// Handle Tab key in editor (insert tab instead of changing focus)
function handleTabKey(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.target;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        // Insert 4 spaces for tab
        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
    }
    
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const fileId = document.getElementById('saveFileBtn')?.onclick?.toString().match(/saveFileContent\((\d+)/)?.[1];
        if (fileId) {
            saveFileContent(parseInt(fileId), '');
        }
    }
}

// Save file content back to server
async function saveFileContent(fileId, fileName) {
    const textarea = document.getElementById('fileEditTextarea');
    if (!textarea) {
        showAlert('Editor not found', 'error');
        return;
    }
    
    const content = textarea.value;
    const saveBtn = document.getElementById('saveFileBtn');
    
    // Show saving state
    if (saveBtn) {
        saveBtn.innerHTML = '⏳ Saving...';
        saveBtn.disabled = true;
        saveBtn.style.background = '#6b7280';
    }
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/files/${fileId}/content`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: content })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update stored content
            window.currentFileContent = content;
            
            // Update storage display if changed
            if (data.storage) {
                updateStorageDisplay(data.storage);
            }
            
            // Show success
            if (saveBtn) {
                saveBtn.innerHTML = '✅ Saved!';
                saveBtn.style.background = '#10b981';
                
                setTimeout(() => {
                    saveBtn.innerHTML = '💾 Save Changes';
                    saveBtn.disabled = false;
                    saveBtn.style.background = '#10b981';
                }, 2000);
            }
            
            showAlert(`✅ File saved successfully! ${data.file ? `(${formatFileSize(data.file.new_size)})` : ''}`, 'success');
            
            console.log('File saved:', data);
        } else {
            throw new Error(data.message || 'Failed to save');
        }
    } catch (error) {
        console.error('Save file error:', error);
        
        if (saveBtn) {
            saveBtn.innerHTML = '❌ Save Failed';
            saveBtn.style.background = '#ef4444';
            saveBtn.disabled = false;
            
            setTimeout(() => {
                saveBtn.innerHTML = '💾 Save Changes';
                saveBtn.style.background = '#10b981';
            }, 3000);
        }
        
        showAlert('Failed to save: ' + error.message, 'error');
    }
}
async function loadTextFileContent(fileId, fileName, fileSize) {
    const loadingHTML = `
        <div style="text-align:center;padding:60px;">
            <div class="spinner" style="margin:0 auto 20px;"></div>
            <p style="color:#6b7280;">Loading file content...</p>
        </div>
    `;
    showPreviewModal(fileName, loadingHTML, fileSize);
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/files/${fileId}/content?token=${token}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const escapedContent = escapeHtml(data.content);
            const lines = data.content.split('\n');
            const lineNumbers = lines.map((_, i) => `<span style="color:#9ca3af;user-select:none;">${i + 1}</span>`).join('\n');
            const contentHTML = `
                <div style="display:flex;flex-direction:column;height:70vh;">
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1f2937;border-radius:8px 8px 0 0;">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="font-size:20px;">${getFileIcon(fileName)}</span>
                            <span style="color:#e5e7eb;font-weight:500;">${escapeHtml(data.file.name)}</span>
                            <span style="color:#9ca3af;font-size:12px;background:#374151;padding:2px 8px;border-radius:4px;">${data.file.language}</span>
                        </div>
                        <div style="color:#9ca3af;font-size:12px;">${data.line_count} lines • ${formatFileSize(data.file.size)}</div>
                    </div>
                    <div style="flex:1;overflow:auto;background:#282c34;border-radius:0 0 8px 8px;">
                        <div style="display:flex;font-family:'Fira Code',Monaco,Consolas,monospace;font-size:13px;line-height:1.6;">
                            <pre style="margin:0;padding:16px 12px;text-align:right;background:#21252b;color:#636d83;border-right:1px solid #3e4451;user-select:none;">${lineNumbers}</pre>
                            <pre style="margin:0;padding:16px;flex:1;color:#abb2bf;overflow-x:auto;white-space:pre;">${escapedContent}</pre>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;padding-top:16px;justify-content:center;">
                        <button onclick="copyFileContent()" class="btn btn-secondary" style="padding:10px 20px;">📋 Copy Content</button>
                        <button onclick="downloadItem(${fileId},'file');closePreviewModal();" class="btn btn-primary" style="padding:10px 20px;">📥 Download</button>
                    </div>
                </div>
            `;
            window.currentFileContent = data.content;
            updatePreviewModalContent(contentHTML);
        } else {
            const errorHTML = `
                <div style="text-align:center;padding:60px;">
                    <div style="font-size:80px;margin-bottom:20px;">⚠️</div>
                    <h3 style="color:#1f2937;margin-bottom:8px;">${data.message || 'Cannot preview this file'}</h3>
                    <p style="color:#6b7280;margin-bottom:24px;">This file type cannot be displayed as text</p>
                    <button onclick="downloadItem(${fileId},'file');closePreviewModal();" class="btn btn-primary">📥 Download Instead</button>
                </div>
            `;
            updatePreviewModalContent(errorHTML);
        }
    } catch (error) {
        console.error('Load file content error:', error);
        const errorHTML = `
            <div style="text-align:center;padding:60px;">
                <div style="font-size:80px;margin-bottom:20px;">❌</div>
                <h3 style="color:#1f2937;margin-bottom:8px;">Failed to load file</h3>
                <p style="color:#6b7280;margin-bottom:24px;">${error.message}</p>
                <button onclick="downloadItem(${fileId},'file');closePreviewModal();" class="btn btn-primary">📥 Download Instead</button>
            </div>
        `;
        updatePreviewModalContent(errorHTML);
    }
}

function copyFileContent() {
    if (window.currentFileContent) {
        copyTextToClipboard(window.currentFileContent)
            .then(() => showAlert('📋 Content copied to clipboard!', 'success'))
            .catch(() => showAlert('Failed to copy content', 'error'));
    }
}

function showPreviewModal(title, content, fileSize, isFullscreen = true) {
    let modal = document.getElementById('previewModal');
    if (modal) modal.remove();
    
    modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.className = 'modal';
    modal.style.cssText = `
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.9);
        align-items: center;
        justify-content: center;
    `;
    
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closePreviewModal()" style="position:absolute;top:0;left:0;width:100%;height:100%;"></div>
        <div class="modal-dialog" style="
            position: relative;
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            margin: 0;
            display: flex;
            flex-direction: column;
            background: transparent;
        ">
            <div class="modal-content" style="
                width: 100%;
                height: 100%;
                max-height: 100%;
                display: flex;
                flex-direction: column;
                background: #ffffff;
                border-radius: 0;
                overflow: hidden;
            ">
                <!-- Header -->
                <div class="modal-header" style="
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 20px;
                    background: linear-gradient(135deg, #1f2937, #374151);
                    color: white;
                    border-bottom: 1px solid #4b5563;
                ">
                    <h3 class="modal-title" style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        margin: 0;
                        font-size: 16px;
                        font-weight: 600;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        flex: 1;
                    ">
                        <span style="font-size: 24px;">📄</span>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(title)}</span>
                        ${fileSize ? `<span style="font-size: 12px; color: #9ca3af; font-weight: normal; background: #374151; padding: 4px 10px; border-radius: 12px;">${formatFileSize(fileSize)}</span>` : ''}
                    </h3>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button onclick="togglePreviewFullscreen()" style="
                            background: rgba(255,255,255,0.1);
                            border: none;
                            color: white;
                            width: 36px;
                            height: 36px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: background 0.2s;
                        " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'" title="Toggle Fullscreen">⛶</button>
                        <button class="modal-close" onclick="closePreviewModal()" style="
                            background: #ef4444;
                            border: none;
                            color: white;
                            width: 36px;
                            height: 36px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 20px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            transition: background 0.2s;
                        " onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'" title="Close (Esc)">✕</button>
                    </div>
                </div>
                
                <!-- Body -->
                <div class="modal-body" id="previewModalBody" style="
                    flex: 1;
                    padding: 20px;
                    overflow: auto;
                    background: #f9fafb;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                ">
                    ${content}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden'; // Prevent background scroll
    document.addEventListener('keydown', handlePreviewKeydown);
}

function updatePreviewModalContent(content) {
    const body = document.getElementById('previewModalBody');
    if (body) {
        body.innerHTML = content;
    }
}

function handlePreviewKeydown(e) {
    if (e.key === 'Escape') {
        closePreviewModal();
    } else if (e.key === 'f' || e.key === 'F') {
        togglePreviewFullscreen();
    }
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) modal.remove();
    document.body.style.overflow = ''; // Restore scroll
    document.removeEventListener('keydown', handlePreviewKeydown);
    window.currentFileContent = null;
    
    // Exit fullscreen if active
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

function togglePreviewFullscreen() {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    
    if (!document.fullscreenElement) {
        modal.requestFullscreen().catch(err => {
            console.log('Fullscreen error:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

async function downloadItem(itemId, itemType) {
    log('Download item:', { itemId, itemType });  
    const id = parseInt(itemId);
    const apiBase = getApiBase();
    const token = localStorage.getItem('token'); 
    if (itemType === 'folder') {
        const folder = folders.find(f => parseInt(f.id) === id);
        if (!folder) {
            showAlert('Folder not found', 'error');
            return;
        }     
        const folderName = folder.name;    
        try {
            showAlert(`📦 Preparing ${folderName} for download...`, 'info');
            const response = await fetch(`${apiBase}/api/folders/${id}/download`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                throw new Error('Download failed');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${folderName}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            showAlert(`✅ ${folderName}.zip downloaded!`, 'success');
            log('Folder downloaded successfully');
        } catch (error) {
            logError('Folder download error:', error);
            showAlert('Failed to download folder', 'error');
        }
        return;
    }
    const file = files.find(f => parseInt(f.id) === id);
    if (!file) {
        showAlert('File not found', 'error');
        return;
    } 
    const fileName = file.original_name || file.filename;
    try {
        const response = await fetch(`${apiBase}/api/files/${id}/download`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            throw new Error('Download failed');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showAlert(`📥 ${fileName} downloaded!`, 'success');
        log('File downloaded successfully:', fileName);
    } catch (error) {
        logError('File download error:', error);
        showAlert('Failed to download file', 'error');
    }
}

function copyItem(itemId, itemType) {
    log('Copy item:', { itemId, itemType });
    const id = parseInt(itemId);
    let itemName = '';
    if (itemType === 'folder') {
        const item = folders.find(f => parseInt(f.id) === id);
        itemName = item ? item.name : 'Folder';
    } else {
        const item = files.find(f => parseInt(f.id) === id);
        itemName = item ? (item.original_name || item.filename) : 'File';
    }
    localStorage.setItem('clipboard', JSON.stringify({
        id: id,
        type: itemType,
        name: itemName,
        action: 'copy'
    }));
    showAlert(`Copied: ${itemName}`, 'success');
}

function moveItem(itemId, itemType) {
    console.log('Move item:', { itemId, itemType });
    const id = parseInt(itemId);
    let itemName = '';
    if (itemType === 'folder') {
        const item = folders.find(f => parseInt(f.id) === id);
        itemName = item ? item.name : 'Folder';
    } else {
        const item = files.find(f => parseInt(f.id) === id);
        itemName = item ? (item.original_name || item.filename) : 'File';
    }  
    showMoveModal(id, itemType, itemName);
}

function showMoveModal(itemId, itemType, itemName) {
    let modal = document.getElementById('moveModal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'moveModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeMoveModal()"></div>
        <div class="modal-dialog" style="max-width: 480px;">
            <div class="modal-content" style="border-radius: 16px; overflow: hidden;">
                <div class="modal-header" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 20px 24px;">
                    <h3 class="modal-title" style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 24px;">📦</span>
                        Move "${escapeHtml(itemName)}"
                    </h3>
                    <button class="modal-close" onclick="closeMoveModal()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 8px; cursor: pointer; font-size: 18px;">✕</button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    <p style="color: #6b7280; margin-bottom: 16px; font-size: 14px;">📂 Select destination folder:</p>
                    <div id="folderList" style="max-height: 350px; overflow-y: auto;">
                        <div class="move-folder-option" style="padding: 14px 16px; background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 2px solid #86efac; border-radius: 10px; margin-bottom: 10px; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: all 0.2s;" onmouseover="this.style.transform='translateX(4px)'; this.style.boxShadow='0 4px 12px rgba(34,197,94,0.2)';" onmouseout="this.style.transform='translateX(0)'; this.style.boxShadow='none';" onclick="executeMove(${itemId}, '${itemType}', null)">
                            <span style="font-size: 24px;">🏠</span>
                            <div>
                                <div style="font-weight: 600; color: #166534;">My Files (Root)</div>
                                <div style="font-size: 12px; color: #6b7280;">Move to root directory</div>
                            </div>
                        </div>
                        <div id="moveFolderOptions">
                            <div style="text-align: center; padding: 20px; color: #6b7280;">
                                <div style="width: 30px; height: 30px; border: 3px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 10px;"></div>
                                Loading folders...
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer" style="padding: 16px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                    <button class="btn btn-secondary" onclick="closeMoveModal()" style="padding: 10px 20px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Cancel</button>
                </div>
            </div>
        </div>
    `;
    const style = document.createElement('style');
    style.id = 'moveModalStyle';
    style.textContent = `
        @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);
    loadFoldersForMove(itemId, itemType);
}

async function loadFoldersForMove(itemId, itemType) {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/folders/tree/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        let allFolders = [];
        const data = await response.json();
        if (data.success && data.tree) {
            const flattenTree = (tree, level = 0) => {
                let result = [];
                for (const folder of tree) {
                    result.push({ ...folder, level });
                    if (folder.children && folder.children.length > 0) {
                        result = result.concat(flattenTree(folder.children, level + 1));
                    }
                }
                return result;
            };
            allFolders = flattenTree(data.tree);
        } else {
            const fallbackResponse = await fetch(`${apiBase}/api/folders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const fallbackData = await fallbackResponse.json();
            if (fallbackData.success) {
                allFolders = fallbackData.folders.map(f => ({ ...f, level: 0 }));
            }
        }
        const folderOptionsEl = document.getElementById('moveFolderOptions');
        if (!folderOptionsEl) return;
        if (allFolders.length > 0) {
            let html = '';
            allFolders.forEach(folder => {
                if (itemType === 'folder' && parseInt(folder.id) === parseInt(itemId)) return;
                if (typeof currentFolderId !== 'undefined' && parseInt(folder.id) === parseInt(currentFolderId)) return;
                const indent = folder.level * 20;
                const folderIcon = folder.level === 0 ? '📁' : '📂';
                html += `
                    <div class="move-folder-option" style="padding: 12px 16px; padding-left: ${16 + indent}px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s;" onmouseover="this.style.borderColor='#6366f1'; this.style.background='#eef2ff'; this.style.transform='translateX(4px)';" onmouseout="this.style.borderColor='#e5e7eb'; this.style.background='#f9fafb'; this.style.transform='translateX(0)';" onclick="executeMove(${itemId}, '${itemType}', ${folder.id})">
                        <span style="font-size: 20px;">${folderIcon}</span>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 500; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(folder.name)}</div>
                            ${folder.file_count !== undefined ? `<div style="font-size: 11px; color: #6b7280;">${folder.file_count} files</div>` : ''}
                        </div>
                        <span style="color: #9ca3af; font-size: 14px;">→</span>
                    </div>
                `;
            });
            folderOptionsEl.innerHTML = html || '<p style="color: #6b7280; text-align: center; padding: 20px;">No other folders available</p>';
        } else {
            folderOptionsEl.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No folders available. Create a folder first!</p>';
        }
    } catch (error) {
        console.error('Error loading folders:', error);
        const folderOptionsEl = document.getElementById('moveFolderOptions');
        if (folderOptionsEl) {
            folderOptionsEl.innerHTML = `<div style="text-align: center; padding: 20px; color: #ef4444;"><span style="font-size: 32px;">❌</span><p>Failed to load folders</p></div>`;
        }
    }
}

async function executeMove(itemId, itemType, targetFolderId) {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        let endpoint, bodyData;
        if (itemType === 'folder') {
            endpoint = `${apiBase}/api/folders/${itemId}/move`;
            bodyData = { parent_id: targetFolderId };
        } else {
            endpoint = `${apiBase}/api/files/${itemId}/move`;
            bodyData = { folder_id: targetFolderId };
        }
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });
        const data = await response.json();
        if (data.success) {
            showAlert('✅ Item moved successfully!', 'success');
            closeMoveModal();
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to move item', 'error');
        }
    } catch (error) {
        console.error('Move error:', error);
        showAlert('Failed to move item: ' + error.message, 'error');
    }
}

function closeMoveModal() {
    const modal = document.getElementById('moveModal');
    if (modal) modal.remove();
    const style = document.getElementById('moveModalStyle');
    if (style) style.remove();
}

async function toggleFavorite(itemId, itemType) {
    const id = parseInt(itemId);
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/favorites/toggle`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ item_type: itemType, item_id: id })
        });
        const data = await response.json();
        if (data.success) {
            showAlert(data.message, 'success');
            loadFavoriteCount();
            const card = document.querySelector(`.file-card[data-id="${id}"][data-type="${itemType}"]`);
            if (card) {
                if (data.is_favorite) {
                    card.classList.add('is-favorite');
                    if (!card.querySelector('.favorite-badge')) {
                        const badge = document.createElement('div');
                        badge.className = 'favorite-badge';
                        badge.innerHTML = '⭐';
                        badge.style.cssText = `position: absolute;top: 8px;right: 8px;background: #fbbf24;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;box-shadow: 0 2px 4px rgba(0,0,0,0.2);z-index: 10;`;
                        card.style.position = 'relative';
                        card.appendChild(badge);
                    }
                } else {
                    card.classList.remove('is-favorite');
                    const badge = card.querySelector('.favorite-badge');
                    if (badge) badge.remove();
                }
            }
        } else {
            showAlert(data.message || 'Failed to update favorite', 'error');
        }
    } catch (error) {
        logError('Toggle favorite error', error);
        showAlert('Failed to update favorite', 'error');
    }
}

async function loadFavorites() {
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading favorites...</p></div>`;
    }
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/favorites`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            renderFavorites(data.favorites);
        } else {
            showAlert(data.message || 'Failed to load favorites', 'error');
        }
    } catch (error) {
        logError('Load favorites error', error);
    }
}

function renderFavorites(favorites) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    if (!favorites || favorites.length === 0) {
        fileGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">⭐</div><h3>No favorites yet</h3><p>Star your important files and folders to find them quickly here</p></div>`;
        return;
    }
    let html = '';
    favorites.forEach(item => {
        const itemName = item.name || 'Unknown';
        const itemType = item.item_type;
        const itemId = item.item_id;
        const icon = itemType === 'folder' ? '📁' : getFileIcon(itemName);
        let metaInfo = itemType === 'file' ? `${formatFileSize(item.size)} • ${formatDate(item.created_at)}` : 'Folder';
        html += `
            <div class="file-card is-favorite" data-id="${itemId}" data-type="${itemType}" data-name="${escapeHtml(itemName)}" style="position: relative;" onclick="handleItemClick(event, ${itemId}, '${itemType}')" ondblclick="${itemType === 'folder' ? `openFolder(${itemId})` : `previewFile(${itemId})`}" oncontextmenu="showContextMenu(event, ${itemId}, '${itemType}')">
                <div class="favorite-badge" style="position: absolute;top: 8px;right: 8px;background: #fbbf24;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;">⭐</div>
                <div class="file-icon">${icon}</div>
                <div class="file-name">${escapeHtml(itemName)}</div>
                <div class="file-info">${metaInfo}</div>
            </div>
        `;
    });
    fileGrid.innerHTML = html;
}

async function loadFavoriteCount() {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/favorites/count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const favCountEl = document.getElementById('favoriteCount');
            if (favCountEl) favCountEl.textContent = data.count.total;
        }
    } catch (error) {
        logError('Load favorite count error', error);
    }
}

async function renameItem(itemId, itemType) {
    const id = parseInt(itemId);
    let currentName = '';
    if (itemType === 'folder') {
        const item = folders.find(f => parseInt(f.id) === id);
        currentName = item ? item.name : '';
    } else {
        const item = files.find(f => parseInt(f.id) === id);
        currentName = item ? (item.original_name || item.filename) : '';
    }
    if (!currentName) {
        showAlert('Item not found', 'error');
        return;
    }
    showRenameModal(id, itemType, currentName);
}

function showRenameModal(itemId, itemType, currentName) {
    let modal = document.getElementById('renameModal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'renameModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeRenameModal()"></div>
        <div class="modal-dialog" style="max-width:450px;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">✏️ Rename ${itemType === 'folder' ? 'Folder' : 'File'}</h3>
                    <button class="modal-close" onclick="closeRenameModal()">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="newName">New Name</label>
                        <input type="text" id="newName" class="form-input" value="${escapeHtml(currentName)}" placeholder="Enter new name" autofocus onkeypress="if(event.key==='Enter') executeRename(${itemId},'${itemType}')">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeRenameModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="executeRename(${itemId},'${itemType}')">✏️ Rename</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => {
        const input = document.getElementById('newName');
        if (input) { input.focus(); input.select(); }
    }, 100);
}

async function executeRename(itemId, itemType) {
    const newNameInput = document.getElementById('newName');
    if (!newNameInput) return;
    const newName = newNameInput.value.trim();
    if (!newName) {
        showAlert('Please enter a name', 'error');
        return;
    }
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const endpoint = itemType === 'folder' ? `${apiBase}/api/folders/${itemId}/rename` : `${apiBase}/api/files/${itemId}/rename`;
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_name: newName })
        });
        const data = await response.json();
        if (data.success) {
            showAlert('Renamed successfully!', 'success');
            closeRenameModal();
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to rename', 'error');
        }
    } catch (error) {
        showAlert('Failed to rename item', 'error');
    }
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    if (modal) modal.remove();
}

async function deleteItem(itemId, itemType) {
    const id = parseInt(itemId);
    let item, itemName = '';
    if (itemType === 'folder') {
        item = folders.find(f => parseInt(f.id) === id);
        itemName = item ? item.name : 'this folder';
    } else {
        item = files.find(f => parseInt(f.id) === id);
        itemName = item ? (item.original_name || item.filename) : 'this file';
    }
    const warningMsg = itemType === 'folder' ? `⚠️ Delete folder "${itemName}"?\n\nAll files inside will be moved to trash.` : `Delete "${itemName}"?`;
    if (!confirm(warningMsg)) return;
    if (itemType === 'folder') {
        const fileCount = item ? (item.file_count || 0) : 0;
        if (fileCount > 0 && !confirm(`This folder contains ${fileCount} file(s). Are you sure?`)) return;
    }
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const endpoint = itemType === 'folder' ? `${apiBase}/api/folders/${id}` : `${apiBase}/api/files/${id}`;
        const response = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            showAlert(`✅ "${itemName}" deleted!`, 'success');
            if (data.storage) updateStorageDisplay(data.storage.used, data.storage.quota);
            else await loadStorageInfo();
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to delete item', 'error');
        }
    } catch (error) {
        showAlert('Failed to delete item', 'error');
    }
}

function showProperties(itemId, itemType) {
    const id = parseInt(itemId);
    let item, itemName = '', itemSize = 0, itemCreated = '', itemModified = '', itemMimeType = '';
    if (itemType === 'folder') {
        item = folders.find(f => parseInt(f.id) === id);
        if (item) { itemName = item.name; itemSize = item.size || 0; itemCreated = item.created_at; itemModified = item.updated_at; }
    } else {
        item = files.find(f => parseInt(f.id) === id);
        if (item) { itemName = item.original_name || item.filename; itemSize = item.size || 0; itemCreated = item.created_at; itemModified = item.updated_at; itemMimeType = item.mime_type || 'Unknown'; }
    }
    if (!item) { showAlert('Could not find item properties', 'error'); return; }
    const icon = itemType === 'folder' ? '📁' : getFileIcon(itemName);
    const ext = itemName.split('.').pop().toUpperCase();
    const extension = itemType === 'folder' ? 'Folder' : (ext || 'File');
    const fileCount = itemType === 'folder' ? (item.file_count || 0) : 0;
    const subfolderCount = itemType === 'folder' ? (item.subfolder_count || 0) : 0;
    const propertiesHTML = `
        <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#f3f4f6,#e5e7eb);border-radius:16px;margin-bottom:24px;">
            <div style="font-size:72px;margin-bottom:12px;">${icon}</div>
            <h3 style="font-size:18px;font-weight:700;color:#1f2937;margin-bottom:8px;">${escapeHtml(itemName)}</h3>
            <span style="display:inline-block;padding:6px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:20px;font-size:12px;font-weight:600;">${extension}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;"><span style="color:#6b7280;">📊 Size</span><span style="color:#1f2937;font-weight:600;">${formatFileSize(itemSize)}</span></div>
            <div style="display:flex;justify-content:space-between;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;"><span style="color:#6b7280;">📝 Type</span><span style="color:#1f2937;font-weight:600;">${itemType === 'folder' ? 'Folder' : itemMimeType}</span></div>
            ${itemType === 'folder' ? `<div style="display:flex;justify-content:space-between;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;"><span style="color:#6b7280;">📁 Contains</span><span style="color:#1f2937;font-weight:600;">${fileCount} files, ${subfolderCount} folders</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;"><span style="color:#6b7280;">📅 Created</span><span style="color:#1f2937;font-weight:600;">${formatDateFull(itemCreated)}</span></div>
            <div style="display:flex;justify-content:space-between;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;"><span style="color:#6b7280;">🕐 Modified</span><span style="color:#1f2937;font-weight:600;">${formatDateFull(itemModified)}</span></div>
        </div>
    `;
    let modal = document.getElementById('propertiesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'propertiesModal';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-backdrop" onclick="closePropertiesModal()"></div><div class="modal-dialog" style="max-width:500px;"><div class="modal-content"><div class="modal-header"><h3 class="modal-title">ℹ️ Properties</h3><button class="modal-close" onclick="closePropertiesModal()">✕</button></div><div class="modal-body" id="propertiesContent"></div></div></div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('propertiesContent').innerHTML = propertiesHTML;
    modal.style.display = 'flex';
}

function closePropertiesModal() {
    const modal = document.getElementById('propertiesModal');
    if (modal) modal.style.display = 'none';
}

async function createNewFolder() {
    const folderName = prompt('Enter folder name:');
    if (!folderName || !folderName.trim()) return;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/folders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName.trim(), parent_id: currentFolderId })
        });
        const data = await response.json();
        if (data.success) {
            showAlert('Folder created successfully!', 'success');
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to create folder', 'error');
        }
    } catch (error) {
        showAlert('Failed to create folder', 'error');
    }
}

function setView(view) {
    currentView = view;
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    if (gridBtn && listBtn) {
        gridBtn.classList.toggle('active', view === 'grid');
        listBtn.classList.toggle('active', view === 'list');
    }
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) fileGrid.className = view === 'grid' ? 'file-grid' : 'file-list';
}

function toggleSortMenu() {
    const sortMenu = document.getElementById('sortMenu');
    if (sortMenu) sortMenu.style.display = sortMenu.style.display === 'none' ? 'block' : 'none';
}

function sortBy(sortType) {
    switch (sortType) {
        case 'name':
            files.sort((a, b) => (a.original_name || a.filename).localeCompare(b.original_name || b.filename));
            folders.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'date':
            files.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
            break;
        case 'size':
            files.sort((a, b) => b.size - a.size);
            break;
        case 'type':
            files.sort((a, b) => getFileExtension(a.original_name || a.filename).localeCompare(getFileExtension(b.original_name || b.filename)));
            break;
    }
    renderFilesAndFolders();
    toggleSortMenu();
}

const searchFiles = debounce(function(query) {
    if (!query.trim()) { renderFilesAndFolders(); return; }
    const searchLower = query.toLowerCase();
    const filteredFolders = folders.filter(f => f.name.toLowerCase().includes(searchLower));
    const filteredFiles = files.filter(f => (f.original_name || f.filename).toLowerCase().includes(searchLower));
    const origFolders = folders, origFiles = files;
    folders = filteredFolders; files = filteredFiles;
    renderFilesAndFolders();
    folders = origFolders; files = origFiles;
}, 300);

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('open');
}

function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

async function showRecent(event) {
    if (event) event.preventDefault();
    document.getElementById('currentFolder').textContent = 'Recent';
    document.getElementById('breadcrumbSeparator').style.display = 'inline';
    updateSidebarActive('recent');
    currentFolderId = 'recent';
    await loadRecentFiles();
}

async function showSharedByMe(event) {
    if (event) event.preventDefault();
    document.getElementById('currentFolder').textContent = 'Shared by me';
    document.getElementById('breadcrumbSeparator').style.display = 'inline';
    updateSidebarActive('shared-by-me');
    currentFolderId = 'shared-by-me';
    await loadSharedByMe();
}

async function loadSharedByMe() {
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) fileGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading shared items...</p></div>`;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/share/my-shares`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            renderSharedByMe(data.shares || [], data.links || []);
        } else {
            showAlert(data.message || 'Failed to load', 'error');
        }
    } catch (error) {
        logError('Load shared by me error', error);
    }
}

function renderSharedByMe(shares, links) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    if ((!shares || shares.length === 0) && (!links || links.length === 0)) {
        fileGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔗</div><h3>Nothing shared yet</h3><p>Items you share will appear here</p><button class="btn btn-primary" onclick="navigateToRoot()">Go to My Files</button></div>`;
        return;
    }
    let html = '';
    if (links && links.length > 0) {
        html += `<div style="grid-column: 1 / -1; margin-bottom: 10px;"><h3 style="color: #374151; font-size: 16px;">🌐 Public Links <span style="background: #6366f1; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${links.length}</span></h3></div>`;
        links.forEach(link => {
            const isFolder = link.type === 'folder' || link.share_type === 'folder';
            const itemName = link.name || link.file_name || link.folder_name || 'Unknown';
            const icon = isFolder ? '📁' : getFileIcon(itemName);
            const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
            const isActive = link.is_active !== false;
            let status = '✅ Active', statusColor = '#10b981';
            if (!isActive) { status = '❌ Deactivated'; statusColor = '#ef4444'; }
            else if (isExpired) { status = '⏰ Expired'; statusColor = '#f59e0b'; }
            const stats = isFolder ? `👁️ ${link.view_count || 0} views` : `📥 ${link.download_count || 0} downloads`;
            const shareUrl = link.url || `${window.location.origin}/public-share.html?token=${link.share_token}`;
            html += `
                <div class="file-card shared-card" style="position: relative;">
                    <div style="position: absolute;top: 8px;right: 8px;background: #6366f1;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;">🔗</div>
                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${escapeHtml(itemName)}</div>
                    <div class="file-info" style="color: ${statusColor};">${status}</div>
                    <div class="file-info">${stats}</div>
                    <div style="margin-top: 10px; display: flex; gap: 5px; justify-content: center;">
                        <button onclick="copyShareLinkUrl('${escapeHtml(shareUrl)}')" class="btn btn-sm btn-secondary" style="padding: 4px 8px; font-size: 11px;">📋 Copy</button>
                        <button onclick="deleteShareLinkFromGrid(${link.id})" class="btn btn-sm btn-danger" style="padding: 4px 8px; font-size: 11px;">🗑️</button>
                    </div>
                </div>
            `;
        });
    }
    if (shares && shares.length > 0) {
        html += `<div style="grid-column: 1 / -1; margin-top: 20px;"><h3 style="color: #374151; font-size: 16px;">👥 Shared with Users <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${shares.length}</span></h3></div>`;
        shares.forEach(share => {
            const isFolder = share.type === 'folder' || share.folder_id;
            const itemName = share.name || share.file_name || share.folder_name || 'Unknown';
            const icon = isFolder ? '📁' : getFileIcon(itemName);
            const sharedWith = share.shared_with_name || share.shared_with_email || 'Unknown';
            const permission = share.permission || 'view';
            const permBadges = { 'view': '👁️ View', 'download': '📥 Download', 'edit': '✏️ Edit' };
            html += `
                <div class="file-card shared-card" style="position: relative;">
                    <div style="position: absolute;top: 8px;right: 8px;background: #10b981;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;">👤</div>
                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${escapeHtml(itemName)}</div>
                    <div class="file-info">👤 ${escapeHtml(sharedWith)}</div>
                    <div class="file-info" style="color: #6366f1;">${permBadges[permission] || '👁️ View'}</div>
                    <div style="margin-top: 10px;"><button onclick="revokeUserShare(${share.id})" class="btn btn-sm btn-danger" style="padding: 4px 8px; font-size: 11px;">🗑️ Revoke</button></div>
                </div>
            `;
        });
    }
    fileGrid.innerHTML = html;
}

async function showSharedWithMe(event) {
    if (event) event.preventDefault();
    document.getElementById('currentFolder').textContent = 'Shared with me';
    document.getElementById('breadcrumbSeparator').style.display = 'inline';
    updateSidebarActive('shared-with-me');
    currentFolderId = 'shared-with-me';
    await loadSharedWithMe();
}

async function loadSharedWithMe() {
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) fileGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading shared items...</p></div>`;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/share/shared-with-me`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            renderSharedWithMe(data.shares || []);
        }
    } catch (error) {
        logError('Load shared with me error', error);
    }
}
function renderSharedWithMe(shares) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    if (!shares || shares.length === 0) {
        fileGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><h3>Nothing shared with you</h3><p>Files shared with you will appear here</p><button class="btn btn-primary" onclick="navigateToRoot()">Go to My Files</button></div>`;
        return;
    }
    let html = `<div style="grid-column: 1 / -1; margin-bottom: 10px;"><h3 style="color: #374151; font-size: 16px;">👥 Shared with You <span style="background: #8b5cf6; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${shares.length}</span></h3></div>`;
    shares.forEach(share => {
        const isFolder = share.type === 'folder';
        const itemName = share.name || 'Unknown';
        const icon = isFolder ? '📁' : getFileIcon(itemName);
        const ownerName = share.owner_name || share.owner_email || 'Unknown';
        const sharedAt = share.shared_at ? formatDate(share.shared_at) : 'Unknown';
        const permission = share.permission || 'view';
        const itemId = share.file_id || share.folder_id;
        const permStyles = {
            'view': { text: '👁️ View Only', color: '#6b7280', bg: '#f3f4f6' },
            'download': { text: '📥 Can Download', color: '#10b981', bg: '#ecfdf5' },
            'edit': { text: '✏️ Can Edit', color: '#6366f1', bg: '#eef2ff' }
        };
        const perm = permStyles[permission] || permStyles['view'];
        const sizeInfo = !isFolder && share.size ? formatFileSize(share.size) : '';
        const canDownload = permission === 'download' || permission === 'edit';
        const escapedOwner = escapeHtml(ownerName).replace(/'/g, "\\'");
        html += `
            <div class="file-card" style="position: relative; cursor: pointer;" ondblclick="${isFolder ? `openSharedFolder(${itemId}, '${permission}', '${escapedOwner}')` : `previewSharedFile(${itemId}, '${permission}')`}">
                <div style="position: absolute;top: 8px;right: 8px;background: #8b5cf6;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;">👤</div>
                <div class="file-icon">${icon}</div>
                <div class="file-name">${escapeHtml(itemName)}</div>
                <div class="file-info">👤 From: ${escapeHtml(ownerName)}</div>
                <div class="file-info">${sizeInfo ? sizeInfo + ' • ' : ''}${sharedAt}</div>
                <div style="margin-top: 6px;display: inline-block;padding: 3px 10px;background: ${perm.bg};color: ${perm.color};border-radius: 12px;font-size: 11px;font-weight: 600;">${perm.text}</div>
                <div style="margin-top: 10px; display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                    ${isFolder ? `<button onclick="event.stopPropagation(); openSharedFolder(${itemId}, '${permission}', '${escapedOwner}')" style="padding: 6px 12px; font-size: 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">📂 Open</button>` : `<button onclick="event.stopPropagation(); previewSharedFile(${itemId}, '${permission}')" style="padding: 6px 12px; font-size: 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">👁️ Preview</button>`}
                    ${canDownload && !isFolder ? `<button onclick="event.stopPropagation(); downloadSharedItem(${itemId}, 'file')" style="padding: 6px 12px; font-size: 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">📥 Download</button>` : ''}
                    ${canDownload && isFolder ? `<button onclick="event.stopPropagation(); downloadSharedItem(${itemId}, 'folder')" style="padding: 6px 12px; font-size: 12px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">📦 Download ZIP</button>` : ''}
                    ${!canDownload ? `<button disabled style="padding: 6px 12px; font-size: 12px; background: #e5e7eb; color: #9ca3af; border: none; border-radius: 6px; cursor: not-allowed; font-weight: 600;">🔒 View Only</button>` : ''}
                </div>
            </div>
        `;
    });
    fileGrid.innerHTML = html;
}

let sharedFolderHistory = [];
let currentSharedPermission = 'view';
let currentSharedOwner = '';

async function openSharedFolder(folderId, permission, ownerName) {
    log('Opening shared folder:', folderId, permission);
    currentSharedPermission = permission || 'view';
    currentSharedOwner = ownerName || 'Unknown';
    currentFolderId = 'shared-folder-' + folderId;
    const currentFolderEl = document.getElementById('currentFolder');
    const separatorEl = document.getElementById('breadcrumbSeparator');
    if (currentFolderEl) currentFolderEl.textContent = 'Shared Folder';
    if (separatorEl) separatorEl.style.display = 'inline';
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) fileGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading shared folder...</p></div>`;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/share/shared-folder/${folderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            if (currentFolderEl) currentFolderEl.textContent = data.folder.name;
            sharedFolderHistory.push({ id: folderId, name: data.folder.name, permission: permission, owner: ownerName });
            renderSharedFolderContents(data.folder, data.contents, permission, ownerName);
        } else {
            showAlert(data.message || 'Failed to open folder', 'error');
            if (fileGrid) fileGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Cannot access folder</h3><p>${data.message || 'Access denied'}</p><button class="btn btn-primary" onclick="showSharedWithMe()">← Back</button></div>`;
        }
    } catch (error) {
        logError('Open shared folder error', error);
        showAlert('Failed to open shared folder', 'error');
    }
}

function renderSharedFolderContents(folder, contents, permission, ownerName) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    const canDownload = permission === 'download' || permission === 'edit';
    const permStyles = {
        'view': { text: '👁️ View Only', color: '#6b7280', bg: '#f3f4f6' },
        'download': { text: '📥 Can Download', color: '#10b981', bg: '#ecfdf5' },
        'edit': { text: '✏️ Can Edit', color: '#6366f1', bg: '#eef2ff' }
    };
    const perm = permStyles[permission] || permStyles['view'];
    const escapedOwner = escapeHtml(ownerName).replace(/'/g, "\\'");
    let html = `
        <div style="grid-column: 1 / -1; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <button onclick="navigateSharedBack()" style="padding: 8px 16px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 14px;">← Back</button>
                    <div>
                        <h3 style="color: #374151; font-size: 18px; font-weight: 700;">📁 ${escapeHtml(folder.name)}</h3>
                        <p style="color: #6b7280; font-size: 12px; margin-top: 2px;">👤 Shared by ${escapeHtml(ownerName)} • ${contents.total_files} file(s) • ${contents.total_folders} folder(s)</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="padding: 4px 12px; background: ${perm.bg}; color: ${perm.color}; border-radius: 8px; font-size: 12px; font-weight: 600;">${perm.text}</span>
                    ${canDownload ? `<button onclick="downloadSharedItem(${folder.id}, 'folder')" style="padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">📦 Download All</button>` : ''}
                </div>
            </div>
        </div>
    `;
    if (contents.folders && contents.folders.length > 0) {
        contents.folders.forEach(subfolder => {
            html += `
                <div class="file-card" style="position: relative; cursor: pointer;" ondblclick="openSharedSubfolder(${subfolder.id}, '${permission}', '${escapedOwner}')">
                    <div style="position: absolute;top: 8px;right: 8px;background: #8b5cf6;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;">📂</div>
                    <div class="file-icon">📁</div>
                    <div class="file-name">${escapeHtml(subfolder.name)}</div>
                    <div class="file-info">${subfolder.file_count || 0} files</div>
                    <div style="margin-top: 10px;">
                        <button onclick="event.stopPropagation(); openSharedSubfolder(${subfolder.id}, '${permission}', '${escapedOwner}')" style="padding: 5px 12px; font-size: 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">📂 Open</button>
                    </div>
                </div>
            `;
        });
    }
    if (contents.files && contents.files.length > 0) {
        contents.files.forEach(file => {
            const fileName = file.original_name || file.filename;
            const icon = getFileIcon(fileName);
            html += `
                <div class="file-card" style="position: relative; cursor: pointer;" ondblclick="previewSharedFolderFile(${file.id}, '${permission}', '${escapedOwner}')">
                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${escapeHtml(fileName)}</div>
                    <div class="file-info">${formatFileSize(file.size)}</div>
                    <div style="margin-top: 10px; display: flex; gap: 5px; justify-content: center;">
                        <button onclick="event.stopPropagation(); previewSharedFolderFile(${file.id}, '${permission}', '${escapedOwner}')" style="padding: 5px 10px; font-size: 11px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">👁️ View</button>
                        ${canDownload ? `<button onclick="event.stopPropagation(); downloadSharedItem(${file.id}, 'file')" style="padding: 5px 10px; font-size: 11px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">📥</button>` : ''}
                    </div>
                </div>
            `;
        });
    }
    if ((!contents.files || contents.files.length === 0) && (!contents.folders || contents.folders.length === 0)) {
        html += `<div class="empty-state"><div class="empty-icon">📁</div><h3>Empty folder</h3><p>This shared folder has no files</p></div>`;
    }
    fileGrid.innerHTML = html;
}

async function openSharedSubfolder(folderId, permission, ownerName) {
    log('Opening shared subfolder:', folderId);
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) fileGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading folder...</p></div>`;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/share/shared-folder/${folderId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const currentFolderEl = document.getElementById('currentFolder');
            if (currentFolderEl) currentFolderEl.textContent = data.folder.name;
            currentFolderId = 'shared-folder-' + folderId;
            sharedFolderHistory.push({ id: folderId, name: data.folder.name, permission: permission, owner: ownerName });
            renderSharedFolderContents(data.folder, data.contents, permission, ownerName);
        } else {
            showAlert(data.message || 'Cannot open subfolder', 'error');
        }
    } catch (error) {
        logError('Open shared subfolder error', error);
        showAlert('Failed to open folder', 'error');
    }
}

function navigateSharedBack() {
    if (sharedFolderHistory.length > 1) {
        sharedFolderHistory.pop();
        const prev = sharedFolderHistory[sharedFolderHistory.length - 1];
        sharedFolderHistory.pop();
        openSharedFolder(prev.id, prev.permission, prev.owner);
    } else {
        sharedFolderHistory = [];
        showSharedWithMe();
    }
}
async function previewSharedFolderFile(fileId, permission, ownerName) {
    log('Preview shared folder file:', fileId, 'permission:', permission);
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        // Get file info
        const response = await fetch(`${apiBase}/api/share/shared-file/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            showAlert('Cannot access this file', 'error');
            return;
        }
        
        const data = await response.json();
        if (!data.success || !data.file) {
            showAlert('File not found', 'error');
            return;
        }
        
        const file = data.file;
        const fileName = file.original_name || file.filename;
        const ext = fileName.split('.').pop().toLowerCase();
        const previewUrl = `${apiBase}/api/share/shared-file/${fileId}/preview?token=${token}`;
        const canDownload = permission === 'download' || permission === 'edit';
        
        // File type categories
        const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif', 'heic', 'heif'];
        const videoTypes = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'flv', 'm4v', '3gp'];
        const audioTypes = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
        const pdfTypes = ['pdf'];
        const textTypes = ['txt', 'md', 'markdown', 'json', 'xml', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'scala', 'sql', 'sh', 'bash', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'csv'];
        const officeTypes = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
        const archiveTypes = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'];
        const ebookTypes = ['epub', 'mobi', 'azw', 'azw3'];
        
        // Permission badge HTML
        const permStyles = {
            'view': { text: '👁️ View Only', color: '#6b7280', bg: '#f3f4f6' },
            'download': { text: '📥 Can Download', color: '#10b981', bg: '#ecfdf5' },
            'edit': { text: '✏️ Can Edit', color: '#6366f1', bg: '#eef2ff' }
        };
        const perm = permStyles[permission] || permStyles['view'];
        
        const ownerInfo = `<div style="text-align:center;margin-top:12px;padding:12px;background:#f9fafb;border-radius:8px;">
            <span style="color:#6b7280;">👤 Shared by <strong>${escapeHtml(ownerName)}</strong></span>
            <span style="margin-left:12px;padding:4px 12px;background:${perm.bg};color:${perm.color};border-radius:12px;font-size:12px;font-weight:600;">${perm.text}</span>
        </div>`;
        
        const downloadBtn = canDownload 
            ? `<button onclick="downloadSharedItem(${fileId},'file');closePreviewModal();" class="btn btn-primary" style="padding:10px 20px;">📥 Download</button>`
            : `<button disabled style="padding:10px 20px;background:#e5e7eb;color:#9ca3af;border:none;border-radius:8px;cursor:not-allowed;">🔒 Download Not Allowed</button>`;
        
        let previewHTML = '';
        
        // IMAGE PREVIEW
        if (imageTypes.includes(ext)) {
            previewHTML = `
                <div style="text-align:center;max-height:65vh;overflow:auto;background:#000;border-radius:8px;padding:20px;">
                    <img src="${previewUrl}" style="max-width:100%;max-height:60vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.5);" alt="${escapeHtml(fileName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div style=\\'padding:40px;text-align:center;color:white;\\'>❌ Failed to load image</div>';">
                </div>
                ${ownerInfo}
                <div style="text-align:center;margin-top:12px;">${downloadBtn}</div>
            `;
            showPreviewModal(fileName, previewHTML, file.size);
            return;
        }
        
        // VIDEO PREVIEW
        if (videoTypes.includes(ext)) {
            previewHTML = `
                <div style="text-align:center;background:#000;border-radius:8px;padding:10px;">
                    <video controls autoplay style="max-width:100%;max-height:65vh;border-radius:8px;">
                        <source src="${previewUrl}" type="video/${ext === 'mov' ? 'quicktime' : (ext === 'mkv' ? 'x-matroska' : ext)}">
                        Your browser does not support video playback.
                    </video>
                </div>
                ${ownerInfo}
                <div style="text-align:center;margin-top:12px;">${downloadBtn}</div>
            `;
            showPreviewModal(fileName, previewHTML, file.size);
            return;
        }
        
        // AUDIO PREVIEW
        if (audioTypes.includes(ext)) {
            previewHTML = `
                <div style="text-align:center;padding:40px;">
                    <div style="font-size:80px;margin-bottom:20px;">🎵</div>
                    <h3 style="font-size:18px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                    <p style="color:#6b7280;margin-bottom:20px;">${formatFileSize(file.size)}</p>
                    <audio controls autoplay style="width:100%;max-width:500px;">
                        <source src="${previewUrl}" type="audio/${ext === 'm4a' ? 'mp4' : ext}">
                        Your browser does not support audio playback.
                    </audio>
                </div>
                ${ownerInfo}
                <div style="text-align:center;margin-top:12px;">${downloadBtn}</div>
            `;
            showPreviewModal(fileName, previewHTML, file.size);
            return;
        }
        
        // PDF PREVIEW
        if (pdfTypes.includes(ext)) {
            previewHTML = `
                <div style="height:70vh;">
                    <iframe src="${previewUrl}" style="width:100%;height:100%;border:none;border-radius:8px;"></iframe>
                </div>
                ${ownerInfo}
                <div style="text-align:center;margin-top:12px;">${downloadBtn}</div>
            `;
            showPreviewModal(fileName, previewHTML, file.size);
            return;
        }
        
        // TEXT/CODE PREVIEW
        if (textTypes.includes(ext)) {
            loadSharedTextFileContent(fileId, fileName, file.size, permission, ownerName);
            return;
        }
        
        // OFFICE DOCUMENTS
        if (officeTypes.includes(ext)) {
            const docIcon = ext.includes('doc') ? '📝' : ext.includes('xls') ? '📊' : '📊';
            const docType = ext.includes('doc') ? 'Word Document' : ext.includes('xls') ? 'Excel Spreadsheet' : 'PowerPoint Presentation';
            previewHTML = `
                <div style="text-align:center;padding:50px;">
                    <div style="font-size:80px;margin-bottom:20px;">${docIcon}</div>
                    <h3 style="font-size:20px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                    <p style="color:#6b7280;margin-bottom:8px;">${docType} • ${formatFileSize(file.size)}</p>
                    <p style="color:#9ca3af;margin-bottom:20px;">Preview not available - Download to view</p>
                </div>
                ${ownerInfo}
                <div style="text-align:center;margin-top:16px;">
                    ${downloadBtn}
                </div>
            `;
            showPreviewModal(fileName, previewHTML, file.size);
            return;
        }
        
        // ARCHIVE FILES
        if (archiveTypes.includes(ext)) {
            previewHTML = `
                <div style="text-align:center;padding:50px;">
                    <div style="font-size:80px;margin-bottom:20px;">📦</div>
                    <h3 style="font-size:20px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                    <p style="color:#6b7280;margin-bottom:8px;">Archive (${ext.toUpperCase()}) • ${formatFileSize(file.size)}</p>
                    <p style="color:#9ca3af;margin-bottom:20px;">Download to extract contents</p>
                </div>
                ${ownerInfo}
                <div style="text-align:center;margin-top:16px;">
                    ${downloadBtn}
                </div>
            `;
            showPreviewModal(fileName, previewHTML, file.size);
            return;
        }
        
        // EBOOK FILES
        if (ebookTypes.includes(ext)) {
            previewHTML = `
                <div style="text-align:center;padding:50px;">
                    <div style="font-size:80px;margin-bottom:20px;">📚</div>
                    <h3 style="font-size:20px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                    <p style="color:#6b7280;margin-bottom:8px;">E-Book (${ext.toUpperCase()}) • ${formatFileSize(file.size)}</p>
                    <p style="color:#9ca3af;margin-bottom:20px;">Download to read</p>
                </div>
                ${ownerInfo}
                <div style="text-align:center;margin-top:16px;">
                    ${downloadBtn}
                </div>
            `;
            showPreviewModal(fileName, previewHTML, file.size);
            return;
        }
        
        // DEFAULT - UNKNOWN FILE TYPE
        const icon = getFileIcon(fileName);
        previewHTML = `
            <div style="text-align:center;padding:50px;">
                <div style="font-size:80px;margin-bottom:20px;">${icon}</div>
                <h3 style="font-size:20px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                <p style="color:#6b7280;margin-bottom:8px;">${formatFileSize(file.size)}</p>
                <p style="color:#9ca3af;margin-bottom:20px;">Preview not available for this file type</p>
            </div>
            ${ownerInfo}
            <div style="text-align:center;margin-top:16px;">
                ${downloadBtn}
            </div>
        `;
        showPreviewModal(fileName, previewHTML, file.size);
        
    } catch (error) {
        console.error('Preview shared file error:', error);
        showAlert('Failed to preview file', 'error');
    }
}

async function loadSharedTextFileContent(fileId, fileName, fileSize, permission, ownerName) {
    const loadingHTML = `
        <div style="text-align:center;padding:60px;">
            <div class="spinner" style="margin:0 auto 20px;"></div>
            <p style="color:#6b7280;">Loading file content...</p>
        </div>
    `;
    showPreviewModal(fileName, loadingHTML, fileSize);
    
    const canDownload = permission === 'download' || permission === 'edit';
    const permStyles = {
        'view': { text: '👁️ View Only', color: '#6b7280', bg: '#f3f4f6' },
        'download': { text: '📥 Can Download', color: '#10b981', bg: '#ecfdf5' },
        'edit': { text: '✏️ Can Edit', color: '#6366f1', bg: '#eef2ff' }
    };
    const perm = permStyles[permission] || permStyles['view'];
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        let textContent = null;
        let fileLanguage = 'plaintext';
        let lineCount = 0;
        
        // Try to get content from /content endpoint
        try {
            const contentResponse = await fetch(`${apiBase}/api/share/shared-file/${fileId}/content?token=${token}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (contentResponse.ok) {
                const contentData = await contentResponse.json();
                if (contentData.success) {
                    textContent = contentData.content;
                    fileLanguage = contentData.file?.language || 'plaintext';
                    lineCount = contentData.line_count || textContent.split('\n').length;
                }
            }
        } catch (e) {
            console.log('Content endpoint failed, trying preview endpoint');
        }
        
        // Fallback: Try preview endpoint as plain text
        if (!textContent) {
            const previewUrl = `${apiBase}/api/share/shared-file/${fileId}/preview?token=${token}`;
            const previewResponse = await fetch(previewUrl);
            if (previewResponse.ok) {
                textContent = await previewResponse.text();
                lineCount = textContent.split('\n').length;
                
                // Detect language from extension
                const ext = fileName.split('.').pop().toLowerCase();
                const languageMap = {
                    'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
                    'py': 'python', 'rb': 'ruby', 'java': 'java', 'c': 'c', 'cpp': 'cpp', 'h': 'c',
                    'hpp': 'cpp', 'cs': 'csharp', 'php': 'php', 'go': 'go', 'rs': 'rust',
                    'swift': 'swift', 'kt': 'kotlin', 'scala': 'scala', 'sql': 'sql',
                    'sh': 'bash', 'bash': 'bash', 'zsh': 'bash', 'ps1': 'powershell',
                    'html': 'html', 'htm': 'html', 'css': 'css', 'xml': 'xml', 'svg': 'xml',
                    'json': 'json', 'yaml': 'yaml', 'yml': 'yaml', 'toml': 'toml',
                    'md': 'markdown', 'markdown': 'markdown', 'txt': 'plaintext',
                    'ini': 'ini', 'cfg': 'ini', 'conf': 'ini', 'env': 'plaintext',
                    'log': 'plaintext', 'csv': 'csv'
                };
                fileLanguage = languageMap[ext] || 'plaintext';
            }
        }
        
        if (!textContent) {
            updatePreviewModalContent(`
                <div style="text-align:center;padding:60px;">
                    <div style="font-size:80px;margin-bottom:20px;">⚠️</div>
                    <h3>Cannot preview this file</h3>
                    <p style="color:#6b7280;margin-top:10px;">The file content could not be loaded</p>
                </div>
            `);
            return;
        }
        
        const escapedContent = escapeHtml(textContent);
        const lines = textContent.split('\n');
        const lineNumbers = lines.map((_, i) => `<span style="color:#9ca3af;user-select:none;">${i + 1}</span>`).join('\n');
        
        const contentHTML = `
            <div style="display:flex;flex-direction:column;height:65vh;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1f2937;border-radius:8px 8px 0 0;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:20px;">${getFileIcon(fileName)}</span>
                        <span style="color:#e5e7eb;font-weight:500;">${escapeHtml(fileName)}</span>
                        <span style="color:#9ca3af;font-size:12px;background:#374151;padding:2px 8px;border-radius:4px;">${fileLanguage}</span>
                    </div>
                    <div style="color:#9ca3af;font-size:12px;">${lineCount} lines • ${formatFileSize(fileSize)}</div>
                </div>
                <div style="flex:1;overflow:auto;background:#282c34;border-radius:0 0 8px 8px;">
                    <div style="display:flex;font-family:'Fira Code',Monaco,Consolas,monospace;font-size:13px;line-height:1.6;">
                        <pre style="margin:0;padding:16px 12px;text-align:right;background:#21252b;color:#636d83;border-right:1px solid #3e4451;user-select:none;">${lineNumbers}</pre>
                        <pre style="margin:0;padding:16px;flex:1;color:#abb2bf;overflow-x:auto;white-space:pre;">${escapedContent}</pre>
                    </div>
                </div>
            </div>
            <div style="text-align:center;margin-top:12px;padding:12px;background:#f9fafb;border-radius:8px;">
                <span style="color:#6b7280;">👤 Shared by <strong>${escapeHtml(ownerName)}</strong></span>
                <span style="margin-left:12px;padding:4px 12px;background:${perm.bg};color:${perm.color};border-radius:12px;font-size:12px;font-weight:600;">${perm.text}</span>
            </div>
            <div style="display:flex;gap:10px;padding-top:12px;justify-content:center;">
                <button onclick="copyFileContent()" class="btn btn-secondary" style="padding:10px 20px;">📋 Copy Content</button>
                ${canDownload ? `<button onclick="downloadSharedItem(${fileId},'file');closePreviewModal();" class="btn btn-primary" style="padding:10px 20px;">📥 Download</button>` : ''}
            </div>
        `;
        
        window.currentFileContent = textContent;
        updatePreviewModalContent(contentHTML);
        
    } catch (error) {
        console.error('Load shared text content error:', error);
        updatePreviewModalContent(`
            <div style="text-align:center;padding:60px;">
                <div style="font-size:80px;margin-bottom:20px;">❌</div>
                <h3>Failed to load file</h3>
                <p style="color:#6b7280;margin-top:10px;">${error.message}</p>
            </div>
        `);
    }
}

async function previewSharedFile(fileId, permission) {
    log('Preview shared file:', fileId);
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/share/shared-file/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            showAlert('Cannot access this file', 'error');
            return;
        }
        const data = await response.json();
        if (data.success && data.file) {
            const ownerName = data.file.owner_name || 'Unknown';
            previewSharedFolderFile(fileId, permission, ownerName);
        } else {
            showAlert('File not found', 'error');
        }
    } catch (error) {
        showAlert('Failed to load file', 'error');
    }
}

function showSharedFilePreview(file, permission) {
    // This function is now deprecated - redirects to the enhanced function
    const ownerName = file.owner_name || 'Unknown';
    previewSharedFolderFile(file.id, permission, ownerName);
}
async function downloadSharedItem(fileId, itemType) {
    if (!fileId) { showAlert('Cannot download', 'error'); return; }
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const endpoint = itemType === 'file' ? `${apiBase}/api/share/shared-file/${fileId}/download` : `${apiBase}/api/share/shared-folder/${fileId}/download`;
        showAlert('📥 Preparing download...', 'info');
        const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = itemType === 'file' ? 'download' : 'shared-folder.zip';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) filename = decodeURIComponent(match[1]);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            showAlert('📥 Download started!', 'success');
        } else {
            const data = await response.json();
            showAlert(data.message || 'Download failed', 'error');
        }
    } catch (error) {
        showAlert('Download failed: ' + error.message, 'error');
    }
}
async function previewSharedFile(fileId, permission) {
    log('Preview shared file:', fileId, 'permission:', permission);
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        // Get file info first
        const response = await fetch(`${apiBase}/api/share/shared-file/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            showAlert('Cannot access this file', 'error');
            return;
        }
        
        const data = await response.json();
        if (!data.success || !data.file) {
            showAlert('File not found', 'error');
            return;
        }
        
        const file = data.file;
        const ownerName = file.owner_name || 'Unknown';
        const actualPermission = file.permission || permission || 'view';
        
        // Use the enhanced preview function
        previewSharedFolderFile(fileId, actualPermission, ownerName);
        
    } catch (error) {
        console.error('Preview shared file error:', error);
        showAlert('Failed to load file', 'error');
    }
}
function showSharedFilePreview(file, permission) {
    const fileName = file.original_name || file.filename;
    const icon = getFileIcon(fileName);
    const canDownload = permission === 'download' || permission === 'edit';
    const previewHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 80px; margin-bottom: 20px;">${icon}</div>
            <h3 style="font-size: 20px; color: #1f2937; margin-bottom: 8px;">${escapeHtml(fileName)}</h3>
            <p style="color: #6b7280; margin-bottom: 8px;">${formatFileSize(file.size)}</p>
            <p style="color: #6b7280; margin-bottom: 24px;">Shared by ${escapeHtml(file.owner_name || 'Unknown')}</p>
            ${canDownload ? `<button onclick="downloadSharedItem(${file.id}, 'file'); closePreviewModal();" class="btn btn-primary">📥 Download File</button>` : `<p style="color: #f59e0b;">👁️ View only - Download not permitted</p>`}
        </div>
    `;
    showPreviewModal(fileName, previewHTML);
}

async function downloadSharedItem(fileId, itemType) {
    if (!fileId) { showAlert('Cannot download', 'error'); return; }
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const endpoint = itemType === 'file' ? `${apiBase}/api/share/shared-file/${fileId}/download` : `${apiBase}/api/share/shared-folder/${fileId}/download`;
        const response = await fetch(endpoint, { headers: { 'Authorization': `Bearer ${token}` } });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = itemType === 'file' ? 'download' : 'shared-folder.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            showAlert('📥 Download started!', 'success');
        } else {
            const data = await response.json();
            showAlert(data.message || 'Download failed', 'error');
        }
    } catch (error) {
        showAlert('Download failed', 'error');
    }
}

function copyShareLinkUrl(url) {
    copyTextToClipboard(url).then(() => showAlert('📋 Link copied!', 'success')).catch(() => showAlert('Failed to copy', 'error'));
}

async function deleteShareLinkFromGrid(linkId) {
    if (!confirm('Delete this share link?')) return;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/share/link/${linkId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) { showAlert('✅ Share link deleted', 'success'); loadSharedByMe(); }
        else showAlert(data.message || 'Failed to delete', 'error');
    } catch (error) { showAlert('Failed to delete', 'error'); }
}

async function revokeUserShare(shareId) {
    if (!confirm('Revoke access?')) return;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/share/user/${shareId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) { showAlert('✅ Access revoked', 'success'); loadSharedByMe(); }
        else showAlert(data.message || 'Failed', 'error');
    } catch (error) { showAlert('Failed', 'error'); }
}

async function loadRecentFiles() {
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) fileGrid.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading recent files...</p></div>`;
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/files/recent?limit=30`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) renderRecentFiles(data.items);
    } catch (error) { logError('Load recent error', error); }
}

function renderRecentFiles(items) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    if (!items || items.length === 0) {
        fileGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">🕐</div><h3>No recent activity</h3></div>`;
        return;
    }
    let html = '';
    items.forEach(item => {
        const isFolder = item.item_type === 'folder';
        const itemName = isFolder ? item.name : (item.original_name || item.filename);
        const icon = isFolder ? '📁' : getFileIcon(itemName);
        const modified = item.updated_at || item.created_at;
        const timeAgo = getTimeAgo(modified);
        let metaInfo = isFolder ? `Folder • ${timeAgo}` : `${formatFileSize(item.size)} • ${timeAgo}`;
        html += `
            <div class="file-card" data-id="${item.id}" data-type="${item.item_type}" data-name="${escapeHtml(itemName)}" style="position: relative;" onclick="handleItemClick(event, ${item.id}, '${item.item_type}')" ondblclick="${isFolder ? `openFolder(${item.id})` : `previewFile(${item.id})`}">
                <div style="position: absolute;top: 8px;right: 8px;background: #3b82f6;color: white;width: 24px;height: 24px;border-radius: 50%;display: flex;align-items: center;justify-content: center;font-size: 12px;">🕐</div>
                <div class="file-icon">${icon}</div>
                <div class="file-name">${escapeHtml(itemName)}</div>
                <div class="file-info">${metaInfo}</div>
            </div>
        `;
    });
    fileGrid.innerHTML = html;
}

function getTimeAgo(dateString) {
    if (!dateString) return 'Unknown';
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        return formatDate(dateString);
    } catch (e) { return 'Unknown'; }
}

function updateSidebarActive(section) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const navMap = { 'recent': 'navRecent', 'favorites': 'navFavorites', 'shared-by-me': 'navSharedByMe', 'shared-with-me': 'navSharedWithMe', 'myfiles': 'navMyFiles' };
    const navEl = document.getElementById(navMap[section] || navMap['myfiles']);
    if (navEl) navEl.classList.add('active');
}

function showFavorites(event) {
    if (event) event.preventDefault();
    document.getElementById('currentFolder').textContent = 'Favorites';
    document.getElementById('breadcrumbSeparator').style.display = 'inline';
    currentFolderId = 'favorites';
    loadFavorites();
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function deleteSelected() {
    if (selectedItems.length === 0) { showAlert('No items selected', 'warning'); return; }
    if (!confirm(`Delete ${selectedItems.length} item(s)?`)) return;
    const apiBase = getApiBase();
    const token = localStorage.getItem('token');
    let successCount = 0;
    for (const item of selectedItems) {
        try {
            const endpoint = item.type === 'folder' ? `${apiBase}/api/folders/${item.id}` : `${apiBase}/api/files/${item.id}`;
            const response = await fetch(endpoint, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (data.success) successCount++;
        } catch (error) { }
    }
    showAlert(`✅ Deleted ${successCount} item(s)`, 'success');
    clearSelection();
    loadFilesAndFolders(currentFolderId);
    await loadStorageInfo();
}

async function downloadSelected() {
    if (selectedItems.length === 0) return;
    for (const item of selectedItems) {
        await downloadItem(parseInt(item.id), item.type);
        if (selectedItems.length > 1) await sleep(500);
    }
}

function shareSelected() {
    if (selectedItems.length === 0) return;
    if (selectedItems.length === 1) {
        const item = selectedItems[0];
        shareItemFromContext(parseInt(item.id), item.type);
    } else {
        showAlert('Select one item to share', 'info');
    }
}

function setupDashboardEvents() {
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.context-menu')) hideContextMenu();
        if (!event.target.closest('.user-menu')) { const d = document.getElementById('userDropdown'); if (d) d.style.display = 'none'; }
        if (!event.target.closest('.dropdown-wrapper')) { const s = document.getElementById('sortMenu'); if (s) s.style.display = 'none'; }
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Delete' && selectedItems.length > 0) deleteSelected();
        if (event.key === 'Escape') { clearSelection(); hideContextMenu(); }
        if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            event.preventDefault();
            document.querySelectorAll('.file-card').forEach(card => card.classList.add('selected'));
            updateSelection();
        }
    });
}

function getApiBase() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return port ? `${protocol}//localhost:${port}` : `${protocol}//localhost`;
    }
    return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
}

function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try { return JSON.parse(userStr); } catch (e) { return null; }
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return 'Unknown'; }
}

function formatDateFull(dateString) {
    if (!dateString) return 'Unknown';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return 'Unknown'; }
}

function getFileExtension(filename) {
    if (!filename) return '';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getFileIcon(filename) {
    if (!filename) return '📄';
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = { 'pdf': '📕', 'doc': '📘', 'docx': '📘', 'txt': '📝', 'xls': '📊', 'xlsx': '📊', 'csv': '📊', 'ppt': '📙', 'pptx': '📙', 'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🎞️', 'svg': '🎨', 'webp': '🖼️', 'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'mkv': '🎬', 'webm': '🎬', 'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵', 'zip': '📦', 'rar': '📦', '7z': '📦', 'html': '💻', 'css': '🎨', 'js': '⚡', 'json': '📋', 'py': '🐍', 'java': '☕' };
    return iconMap[ext] || '📄';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function log(...args) { console.log('[Dashboard]', ...args); }
function logError(...args) { console.error('[Dashboard Error]', ...args); }

function showAlert(message, type = 'success') {
    let alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainer';
        alertContainer.style.cssText = `position: fixed;top: 80px;right: 20px;z-index: 10000;`;
        document.body.appendChild(alertContainer);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const alert = document.createElement('div');
    alert.style.cssText = `padding: 15px 20px;margin-bottom: 10px;border-radius: 8px;background: ${colors[type] || colors.success};color: white;box-shadow: 0 4px 12px rgba(0,0,0,0.15);display: flex;align-items: center;gap: 10px;max-width: 400px;animation: slideIn 0.3s ease;`;
    alert.innerHTML = `<span>${icons[type] || icons.success}</span><span>${escapeHtml(message)}</span>`;
    alertContainer.appendChild(alert);
    setTimeout(() => { alert.remove(); }, 3000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(text); return Promise.resolve(); }
        catch (err) { return fallbackCopyTextToClipboard(text); }
    } else { return fallbackCopyTextToClipboard(text); }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.cssText = "position:fixed;top:-9999px;";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try { document.execCommand('copy'); document.body.removeChild(textArea); return Promise.resolve(); }
    catch (err) { document.body.removeChild(textArea); return Promise.reject(err); }
}

window.openFolder = openFolder;
window.navigateToRoot = navigateToRoot;
window.shareItemFromContext = shareItemFromContext;
window.openFileUpload = function() { const fileInput = document.getElementById('fileInput'); if (fileInput) fileInput.click(); };

console.log('Dashboard loaded');
