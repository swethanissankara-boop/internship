/* ============================================
   CLOUDSHARE - DASHBOARD WITH FOLDER SHARING
   ============================================ */

// ============================================
// STATE VARIABLES
// ============================================

let currentFolderId = null; // null = root folder
let currentView = 'grid'; // 'grid' or 'list'
let selectedItems = []; // Array of selected item IDs
let contextMenuTarget = null; // Current right-clicked item
let files = []; // Current folder files
let folders = []; // Current folder subfolders

// ============================================
// INITIALIZE DASHBOARD
// ============================================

// ============================================
// INITIALIZE DASHBOARD (UPDATED)
// ============================================

function initializeDashboard() {
    log('Initializing dashboard...');
    
    // Load user info
    loadUserInfo();
    
    // Load storage info
    loadStorageInfo();
    
    // Load favorite count for sidebar
    loadFavoriteCount();
    
    // Load files and folders
    loadFilesAndFolders();
    
    // Setup event listeners
    setupDashboardEvents();
    
    log('Dashboard initialized successfully');
}
// ============================================
// LOAD USER INFO
// ============================================

function loadUserInfo() {
    const user = getCurrentUser();
    
    if (user) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = user.username || 'User';
        }
    }
}

// ============================================
// LOAD STORAGE INFO
// ============================================

// ============================================
// LOAD STORAGE INFO (FIXED - FETCHES FROM SERVER)
// ============================================

async function loadStorageInfo() {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();

        // ✅ Fetch FRESH storage data from server
        const response = await fetch(`${apiBase}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();

            if (data.success && data.user) {
                const used = data.user.storage_used || 0;
                const total = data.user.storage_quota || 107374182400;
                const percentage = Math.min(Math.round((used / total) * 100), 100);

                // ✅ Update localStorage with fresh data
                const savedUser = getCurrentUser();
                if (savedUser) {
                    savedUser.storage_used = used;
                    savedUser.storage_quota = total;
                    localStorage.setItem('user', JSON.stringify(savedUser));
                }

                // Update sidebar storage widget
                const storageUsedEl = document.getElementById('storageUsed');
                const storageTotalEl = document.getElementById('storageTotal');
                const storageBarFillEl = document.getElementById('storageBarFill');

                if (storageUsedEl) storageUsedEl.textContent = formatFileSize(used);
                if (storageTotalEl) storageTotalEl.textContent = formatFileSize(total);
                if (storageBarFillEl) storageBarFillEl.style.width = percentage + '%';

                // Update storage breakdown section
                const usedGBEl = document.getElementById('usedGB');
                const totalGBEl = document.getElementById('totalGB');
                const freeGBEl = document.getElementById('freeGB');
                const storageBarLargeEl = document.getElementById('storageBarLarge');

                if (usedGBEl) usedGBEl.textContent = formatFileSize(used);
                if (totalGBEl) totalGBEl.textContent = formatFileSize(total);
                if (freeGBEl) freeGBEl.textContent = formatFileSize(total - used);
                if (storageBarLargeEl) storageBarLargeEl.style.width = percentage + '%';

                log('💾 Storage updated from server:', formatFileSize(used), '/', formatFileSize(total));
            }
        } else {
            // Fallback to localStorage if API fails
            loadStorageInfoFromCache();
        }
    } catch (error) {
        logError('Failed to fetch storage info from server:', error);
        // Fallback to localStorage
        loadStorageInfoFromCache();
    }
}
// ============================================
// UPDATE STORAGE DISPLAY (HELPER)
// ============================================

function updateStorageDisplay(used, quota) {
    const total = quota || 107374182400;
    const percentage = Math.min(Math.round((used / total) * 100), 100);

    // Update localStorage
    const savedUser = getCurrentUser();
    if (savedUser) {
        savedUser.storage_used = used;
        savedUser.storage_quota = total;
        localStorage.setItem('user', JSON.stringify(savedUser));
    }

    // Update sidebar
    const storageUsedEl = document.getElementById('storageUsed');
    const storageTotalEl = document.getElementById('storageTotal');
    const storageBarFillEl = document.getElementById('storageBarFill');

    if (storageUsedEl) storageUsedEl.textContent = formatFileSize(used);
    if (storageTotalEl) storageTotalEl.textContent = formatFileSize(total);
    if (storageBarFillEl) storageBarFillEl.style.width = percentage + '%';

    // Update storage breakdown
    const usedGBEl = document.getElementById('usedGB');
    const totalGBEl = document.getElementById('totalGB');
    const freeGBEl = document.getElementById('freeGB');
    const storageBarLargeEl = document.getElementById('storageBarLarge');

    if (usedGBEl) usedGBEl.textContent = formatFileSize(used);
    if (totalGBEl) totalGBEl.textContent = formatFileSize(total);
    if (freeGBEl) freeGBEl.textContent = formatFileSize(total - used);
    if (storageBarLargeEl) storageBarLargeEl.style.width = percentage + '%';

    log('💾 Storage display updated:', formatFileSize(used), '/', formatFileSize(total));
}
// Fallback: Load from localStorage (cached data)
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

// ============================================
// LOAD FILES AND FOLDERS (REAL API)
// ============================================

async function loadFilesAndFolders(folderId = null) {
    log('Loading files and folders...', { folderId });
    
    currentFolderId = folderId;
    
    const apiBase = getApiBase();
    
    // Show loading state
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
        
        // Fetch folders
        const foldersUrl = folderId 
            ? `${apiBase}/api/folders?parent_id=${folderId}`
            : `${apiBase}/api/folders`;
            
        const foldersResponse = await fetch(foldersUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const foldersData = await foldersResponse.json();
        
        // Fetch files
        const filesUrl = folderId 
            ? `${apiBase}/api/files?folder_id=${folderId}`
            : `${apiBase}/api/files`;
            
        const filesResponse = await fetch(filesUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const filesData = await filesResponse.json();
        
        // Update state
        folders = foldersData.success ? foldersData.folders : [];
        files = filesData.success ? filesData.files : [];
        
        log('Loaded folders:', folders.length);
        log('Loaded files:', files.length);
        
        // Render files and folders
        renderFilesAndFolders();
        
    } catch (error) {
        logError('Error loading files', error);
        
        // Show error state
        if (fileGrid) {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load files</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="loadFilesAndFolders(${folderId})">
                        Retry
                    </button>
                </div>
            `;
        }
    }
}

// ============================================
// RENDER FILES AND FOLDERS
// ============================================

// ============================================
// RENDER FILES AND FOLDERS (UPDATED WITH FAVORITES)
// ============================================

async function renderFilesAndFolders() {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    
    // Check if empty
    if (folders.length === 0 && files.length === 0) {
        fileGrid.innerHTML = `
            <div class="empty-state" id="emptyState">
                <div class="empty-icon">📁</div>
                <h3>No files yet</h3>
                <p>Upload your first file to get started</p>
                <button class="btn btn-primary" onclick="openFileUpload()">
                    Upload File
                </button>
            </div>
        `;
        return;
    }
    
    const token = localStorage.getItem('token');
    const apiBase = getApiBase();
    
    // Get all favorites to show badges
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
    
    // Render folders first
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
                ${isFavorite ? `<div class="favorite-badge" style="
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: #fbbf24;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    z-index: 10;
                ">⭐</div>` : ''}
                <div class="file-icon">📁</div>
                <div class="file-name">${escapeHtml(folder.name)}</div>
                <div class="file-info">${itemsCount} items</div>
            </div>
        `;
    });
    
    // Render files
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
                ${isFavorite ? `<div class="favorite-badge" style="
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: #fbbf24;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    z-index: 10;
                ">⭐</div>` : ''}
                <div class="file-icon">${icon}</div>
                <div class="file-name">${escapeHtml(fileName)}</div>
                <div class="file-info">${formatFileSize(file.size)} • ${formatDate(modified)}</div>
            </div>
        `;
    });
    
    fileGrid.innerHTML = html;
}

// ============================================
// ITEM CLICK HANDLING
// ============================================

function handleItemClick(event, itemId, itemType) {
    const card = event.currentTarget;
    
    // If holding Ctrl/Cmd, toggle selection
    if (event.ctrlKey || event.metaKey) {
        card.classList.toggle('selected');
        updateSelection();
        return;
    }
    
    // Otherwise, clear selection and select this item
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
    
    // Update selection bar
    const selectionBar = document.getElementById('selectionBar');
    const selectedCountEl = document.getElementById('selectedCount');
    
    if (selectedItems.length > 0) {
        if (selectionBar) selectionBar.style.display = 'flex';
        if (selectedCountEl) selectedCountEl.textContent = selectedItems.length;
    } else {
        if (selectionBar) selectionBar.style.display = 'none';
    }
}

function clearSelection() {
    const selectedCards = document.querySelectorAll('.file-card.selected');
    selectedCards.forEach(card => card.classList.remove('selected'));
    selectedItems = [];
    updateSelection();
}

// ============================================
// FOLDER NAVIGATION
// ============================================

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
    
    // Update sidebar active state
    updateSidebarActive('myfiles');
}

// ============================================
// CONTEXT MENU
// ============================================

function showContextMenu(event, itemId, itemType) {
    event.preventDefault();
    event.stopPropagation();
    
    contextMenuTarget = { id: itemId, type: itemType };
    
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;
    
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    
    // Ensure menu doesn't go off screen
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

// ============================================
// CONTEXT MENU ACTIONS
// ============================================

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

// ============================================
// SHARE ITEM (Enhanced for folders)
// ============================================

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
    
    // Call the global openShareModal function from the HTML script
    if (typeof openShareModal === 'function') {
        openShareModal(item, itemType);
    } else {
        log('openShareModal not found, using fallback');
        openShareModalFallback(item, itemType);
    }
}

// Fallback if global function not available
function openShareModalFallback(item, itemType) {
    const itemName = itemType === 'folder' ? item.name : (item.original_name || item.filename);
    const itemSize = item.size || 0;
    const fileCount = itemType === 'folder' ? (item.file_count || 0) : 0;
    const subfolderCount = itemType === 'folder' ? (item.subfolder_count || 0) : 0;
    const icon = itemType === 'folder' ? '📁' : getFileIcon(itemName);
    
    // Update modal elements
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
    
    // Show/hide limit options based on type
    const downloadLimitGroup = document.getElementById('downloadLimitGroup');
    const viewLimitGroup = document.getElementById('viewLimitGroup');
    
    if (itemType === 'file') {
        if (downloadLimitGroup) downloadLimitGroup.style.display = 'block';
        if (viewLimitGroup) viewLimitGroup.style.display = 'none';
    } else if (itemType === 'folder') {
        if (downloadLimitGroup) downloadLimitGroup.style.display = 'none';
        if (viewLimitGroup) viewLimitGroup.style.display = 'block';
    }
    
    // Set global share target
    window.currentShareTarget = { id: item.id, type: itemType, name: itemName };
    
    // Reset form
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
    
    // Clear previous results
    const shareLinkContainer = document.getElementById('shareLinkContainer');
    const existingShares = document.getElementById('existingShares');
    if (shareLinkContainer) shareLinkContainer.innerHTML = '';
    if (existingShares) existingShares.innerHTML = '';
    
    // Load existing shares (from share.js)
    if (typeof loadExistingShares === 'function') {
        loadExistingShares(item.id, itemType);
    }
    
    // Show modal
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        shareModal.style.display = 'flex';
    }
}

// ============================================
// PREVIEW FILE
// ============================================

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
    const fileUrl = `${apiBase}/api/files/${id}/download?token=${token}`;
    
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoTypes = ['mp4', 'webm', 'ogg'];
    const audioTypes = ['mp3', 'wav', 'ogg', 'flac'];
    
    let previewHTML = '';
    
    if (imageTypes.includes(ext)) {
        previewHTML = `
            <div style="text-align:center;">
                <img src="${fileUrl}" style="max-width:100%;max-height:70vh;border-radius:8px;" alt="${escapeHtml(fileName)}">
            </div>
        `;
    } else if (videoTypes.includes(ext)) {
        previewHTML = `
            <div style="text-align:center;">
                <video controls style="max-width:100%;max-height:70vh;border-radius:8px;">
                    <source src="${fileUrl}" type="video/${ext}">
                </video>
            </div>
        `;
    } else if (audioTypes.includes(ext)) {
        previewHTML = `
            <div style="text-align:center;padding:40px;">
                <div style="font-size:80px;margin-bottom:20px;">🎵</div>
                <h3 style="margin-bottom:20px;">${escapeHtml(fileName)}</h3>
                <audio controls style="width:100%;">
                    <source src="${fileUrl}">
                </audio>
            </div>
        `;
    } else if (ext === 'pdf') {
        previewHTML = `
            <iframe src="${fileUrl}" style="width:100%;height:70vh;border:none;border-radius:8px;"></iframe>
        `;
    } else {
        previewHTML = `
            <div style="text-align:center;padding:60px;">
                <div style="font-size:80px;margin-bottom:20px;">${getFileIcon(fileName)}</div>
                <h3 style="font-size:20px;color:#1f2937;margin-bottom:8px;">${escapeHtml(fileName)}</h3>
                <p style="color:#6b7280;margin-bottom:24px;">Preview not available for this file type</p>
                <button onclick="downloadItem(${id},'file');closePreviewModal();" class="btn btn-primary">
                    📥 Download File
                </button>
            </div>
        `;
    }
    
    showPreviewModal(fileName, previewHTML);
}

function showPreviewModal(title, content) {
    let modal = document.getElementById('previewModal');
    if (modal) modal.remove();
    
    modal = document.createElement('div');
    modal.id = 'previewModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closePreviewModal()"></div>
        <div class="modal-dialog" style="max-width:900px;width:95%;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">👁️ ${escapeHtml(title)}</h3>
                    <button class="modal-close" onclick="closePreviewModal()">✕</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    ${content}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    if (modal) modal.remove();
}

// ============================================
// DOWNLOAD ITEM
// ============================================

// ============================================
// DOWNLOAD ITEM (FIXED - SUPPORTS FOLDERS)
// ============================================

async function downloadItem(itemId, itemType) {
    log('Download item:', { itemId, itemType });
    
    const id = parseInt(itemId);
    const apiBase = getApiBase();
    const token = localStorage.getItem('token');
    
    if (itemType === 'folder') {
        // Download folder as ZIP
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
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Download failed');
            }
            
            // Get the blob
            const blob = await response.blob();
            
            // Create download link
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
    
    // File download
    const file = files.find(f => parseInt(f.id) === id);
    if (!file) {
        showAlert('File not found', 'error');
        return;
    }
    
    const fileName = file.original_name || file.filename;
    
    try {
        const response = await fetch(`${apiBase}/api/files/${id}/download`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
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
// ============================================
// COPY ITEM
// ============================================

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

// ============================================
// MOVE ITEM
// ============================================

function moveItem(itemId, itemType) {
    log('Move item:', { itemId, itemType });
    
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
        <div class="modal-dialog" style="max-width:450px;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">✂️ Move "${escapeHtml(itemName)}"</h3>
                    <button class="modal-close" onclick="closeMoveModal()">✕</button>
                </div>
                <div class="modal-body">
                    <p style="color:#6b7280;margin-bottom:16px;">Select destination folder:</p>
                    <div id="folderList" style="max-height:300px;overflow-y:auto;">
                        <div style="padding:12px;background:#f3f4f6;border-radius:8px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:10px;" 
                             onclick="executeMove(${itemId},'${itemType}',null)">
                            <span>🏠</span> <span>My Files (Root)</span>
                        </div>
                        <div id="moveFolderOptions">Loading folders...</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeMoveModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    loadFoldersForMove(itemId, itemType);
}

async function loadFoldersForMove(itemId, itemType) {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/folders`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        const folderOptionsEl = document.getElementById('moveFolderOptions');
        if (!folderOptionsEl) return;
        
        if (data.success && data.folders.length > 0) {
            let html = '';
            data.folders.forEach(folder => {
                // Don't show current folder in move list if it's a folder being moved
                if (itemType === 'folder' && parseInt(folder.id) === parseInt(itemId)) {
                    return;
                }
                html += `
                    <div style="padding:12px;background:#f9fafb;border-radius:8px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:10px;border:1px solid #e5e7eb;transition:all 0.2s;" 
                         onmouseover="this.style.borderColor='#6366f1';this.style.background='#eef2ff';"
                         onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#f9fafb';"
                         onclick="executeMove(${itemId},'${itemType}',${folder.id})">
                        <span>📁</span> <span>${escapeHtml(folder.name)}</span>
                    </div>
                `;
            });
            folderOptionsEl.innerHTML = html || '<p style="color:#6b7280;">No folders available</p>';
        } else {
            folderOptionsEl.innerHTML = '<p style="color:#6b7280;">No folders available</p>';
        }
    } catch (error) {
        console.error('Error loading folders:', error);
        const folderOptionsEl = document.getElementById('moveFolderOptions');
        if (folderOptionsEl) {
            folderOptionsEl.innerHTML = '<p style="color:#ef4444;">Failed to load folders</p>';
        }
    }
}

async function executeMove(itemId, itemType, targetFolderId) {
    log('Execute move:', { itemId, itemType, targetFolderId });
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const endpoint = itemType === 'folder' 
            ? `${apiBase}/api/folders/${itemId}/move`
            : `${apiBase}/api/files/${itemId}/move`;
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ folder_id: targetFolderId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Item moved successfully!', 'success');
            closeMoveModal();
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to move item', 'error');
        }
    } catch (error) {
        console.error('Move error:', error);
        showAlert('Failed to move item', 'error');
    }
}

function closeMoveModal() {
    const modal = document.getElementById('moveModal');
    if (modal) modal.remove();
}

// ============================================
// TOGGLE FAVORITE
// ============================================

// ============================================
// TOGGLE FAVORITE (UPDATED - REAL API)
// ============================================

// ============================================
// TOGGLE FAVORITE (UPDATED - REAL API)
// ============================================

async function toggleFavorite(itemId, itemType) {
    log('Toggle favorite:', { itemId, itemType });
    
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
            body: JSON.stringify({
                item_type: itemType,
                item_id: id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert(data.message, 'success');
            // Auto-update favorite count
loadFavoriteCount();
            
            // Update the UI - add/remove star indicator
            const card = document.querySelector(`.file-card[data-id="${id}"][data-type="${itemType}"]`);
            if (card) {
                if (data.is_favorite) {
                    card.classList.add('is-favorite');
                    // Add star badge
                    if (!card.querySelector('.favorite-badge')) {
                        const badge = document.createElement('div');
                        badge.className = 'favorite-badge';
                        badge.innerHTML = '⭐';
                        badge.style.cssText = `
                            position: absolute;
                            top: 8px;
                            right: 8px;
                            background: #fbbf24;
                            color: white;
                            width: 24px;
                            height: 24px;
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 12px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                            z-index: 10;
                        `;
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

// ============================================
// LOAD FAVORITES (NEW)
// ============================================

async function loadFavorites() {
    log('Loading favorites...');
    
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.innerHTML = `
            <div class="loading-state" id="loadingState">
                <div class="spinner"></div>
                <p>Loading favorites...</p>
            </div>
        `;
    }
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/favorites`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            log('Loaded favorites:', data.count);
            renderFavorites(data.favorites);
        } else {
            showAlert(data.message || 'Failed to load favorites', 'error');
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load favorites</h3>
                    <p>${data.message || 'Unknown error'}</p>
                </div>
            `;
        }
    } catch (error) {
        logError('Load favorites error', error);
        if (fileGrid) {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load favorites</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// ============================================
// RENDER FAVORITES (NEW)
// ============================================

function renderFavorites(favorites) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    
    if (!favorites || favorites.length === 0) {
        fileGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⭐</div>
                <h3>No favorites yet</h3>
                <p>Star your important files and folders to find them quickly here</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    favorites.forEach(item => {
        const itemName = item.name || 'Unknown';
        const itemType = item.item_type;
        const itemId = item.item_id;
        const icon = itemType === 'folder' ? '📁' : getFileIcon(itemName);
        
        let metaInfo = '';
        if (itemType === 'file') {
            metaInfo = `${formatFileSize(item.size)} • ${formatDate(item.created_at)}`;
        } else {
            metaInfo = 'Folder';
        }
        
        html += `
            <div class="file-card is-favorite" 
                 data-id="${itemId}" 
                 data-type="${itemType}" 
                 data-name="${escapeHtml(itemName)}"
                 style="position: relative;"
                 onclick="handleItemClick(event, ${itemId}, '${itemType}')"
                 ondblclick="${itemType === 'folder' ? `openFolder(${itemId})` : `previewFile(${itemId})`}"
                 oncontextmenu="showContextMenu(event, ${itemId}, '${itemType}')">
                <div class="favorite-badge" style="
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: #fbbf24;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                    z-index: 10;
                ">⭐</div>
                <div class="file-icon">${icon}</div>
                <div class="file-name">${escapeHtml(itemName)}</div>
                <div class="file-info">${metaInfo}</div>
            </div>
        `;
    });
    
    fileGrid.innerHTML = html;
}

// ============================================
// CHECK FAVORITE STATUS (NEW)
// ============================================

async function checkFavoriteStatus(itemId, itemType) {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/favorites/check?item_type=${itemType}&item_id=${itemId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.is_favorite;
        }
        return false;
    } catch (error) {
        logError('Check favorite status error', error);
        return false;
    }
}

// ============================================
// LOAD FAVORITE COUNT (NEW)
// ============================================

async function loadFavoriteCount() {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/favorites/count`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update sidebar count if element exists
            const favCountEl = document.getElementById('favoriteCount');
            if (favCountEl) {
                favCountEl.textContent = data.count.total;
            }
            return data.count;
        }
        return { total: 0, files: 0, folders: 0 };
    } catch (error) {
        logError('Load favorite count error', error);
        return { total: 0, files: 0, folders: 0 };
    }
}


// ============================================
// RENAME ITEM
// ============================================

async function renameItem(itemId, itemType) {
    log('Rename item:', { itemId, itemType });
    
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
                        <input type="text" id="newName" class="form-input" value="${escapeHtml(currentName)}" 
                               placeholder="Enter new name" autofocus
                               onkeypress="if(event.key==='Enter') executeRename(${itemId},'${itemType}')">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeRenameModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="executeRename(${itemId},'${itemType}')">
                        ✏️ Rename
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        const input = document.getElementById('newName');
        if (input) {
            input.focus();
            input.select();
        }
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
    
    log('Execute rename:', { itemId, itemType, newName });
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const endpoint = itemType === 'folder' 
            ? `${apiBase}/api/folders/${itemId}/rename`
            : `${apiBase}/api/files/${itemId}/rename`;
        
        const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
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
        console.error('Rename error:', error);
        showAlert('Failed to rename item', 'error');
    }
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    if (modal) modal.remove();
}

// ============================================
// DELETE ITEM
// ============================================

// ============================================
// DELETE ITEM (FIXED - UPDATES STORAGE IMMEDIATELY)
// ============================================

async function deleteItem(itemId, itemType) {
    log('Delete item:', { itemId, itemType });

    const id = parseInt(itemId);
    let item;
    let itemName = '';

    if (itemType === 'folder') {
        item = folders.find(f => parseInt(f.id) === id);
        itemName = item ? item.name : 'this folder';
    } else {
        item = files.find(f => parseInt(f.id) === id);
        itemName = item ? (item.original_name || item.filename) : 'this file';
    }

    const warningMsg = itemType === 'folder'
        ? `⚠️ WARNING: Delete folder "${itemName}"?\n\nAll files and subfolders inside will be moved to trash.\n\nContinue?`
        : `Are you sure you want to delete "${itemName}"?`;

    if (!confirm(warningMsg)) {
        return;
    }

    // Second confirmation for folders with files
    if (itemType === 'folder') {
        const fileCount = item ? (item.file_count || 0) : 0;
        if (fileCount > 0) {
            const secondConfirm = confirm(`This folder contains ${fileCount} file(s).\n\nAre you ABSOLUTELY sure you want to delete everything?`);
            if (!secondConfirm) {
                return;
            }
        }
    }

    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();

        const endpoint = itemType === 'folder'
            ? `${apiBase}/api/folders/${id}`
            : `${apiBase}/api/files/${id}`;

        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            // Show success message with freed space
            if (data.freed_space && data.freed_space > 0) {
                showAlert(`✅ "${itemName}" deleted! ${formatFileSize(data.freed_space)} freed.`, 'success');
            } else {
                showAlert(`✅ "${itemName}" deleted successfully!`, 'success');
            }

            // ✅ UPDATE STORAGE DISPLAY IMMEDIATELY
            if (data.storage) {
                updateStorageDisplay(data.storage.used, data.storage.quota);
            } else {
                // Fetch fresh storage from server
                await loadStorageInfo();
            }

            // Reload files list
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to delete item', 'error');
        }

    } catch (error) {
        logError('Delete item error', error);
        showAlert('Failed to delete item', 'error');
    }
}
// ============================================
// PROPERTIES MODAL
// ============================================

function showProperties(itemId, itemType) {
    log('Show properties:', { itemId, itemType });
    
    const id = parseInt(itemId);
    let item;
    let itemName = '';
    let itemSize = 0;
    let itemCreated = '';
    let itemModified = '';
    let itemMimeType = '';
    
    if (itemType === 'folder') {
        item = folders.find(f => parseInt(f.id) === id);
        if (item) {
            itemName = item.name || 'Unknown Folder';
            itemSize = item.size || 0;
            itemCreated = item.created_at || '';
            itemModified = item.updated_at || '';
        }
    } else {
        item = files.find(f => parseInt(f.id) === id);
        if (item) {
            itemName = item.original_name || item.filename || 'Unknown File';
            itemSize = item.size || 0;
            itemCreated = item.created_at || '';
            itemModified = item.updated_at || '';
            itemMimeType = item.mime_type || 'Unknown';
        }
    }
    
    if (!item) {
        showAlert('Could not find item properties', 'error');
        return;
    }
    
    const icon = itemType === 'folder' ? '📁' : getFileIcon(itemName);
    const ext = itemName.split('.').pop().toUpperCase();
    const extension = itemType === 'folder' ? 'Folder' : (ext || 'File');
    const createdDate = itemCreated ? formatDateFull(itemCreated) : 'Unknown';
    const modifiedDate = itemModified ? formatDateFull(itemModified) : 'Unknown';
    const fileCount = itemType === 'folder' ? (item.file_count || 0) : 0;
    const subfolderCount = itemType === 'folder' ? (item.subfolder_count || 0) : 0;
    
    const propertiesHTML = `
        <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#f3f4f6,#e5e7eb);border-radius:16px;margin-bottom:24px;">
            <div style="font-size:72px;margin-bottom:12px;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.1));">${icon}</div>
            <h3 style="font-size:18px;font-weight:700;color:#1f2937;margin-bottom:8px;word-break:break-word;">${escapeHtml(itemName)}</h3>
            <span style="display:inline-block;padding:6px 16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:20px;font-size:12px;font-weight:600;">${extension}</span>
        </div>
        
        <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                <span style="color:#6b7280;font-weight:500;"><span style="font-size:18px;">📊</span> Size</span>
                <span style="color:#1f2937;font-weight:600;">${formatFileSize(itemSize)}</span>
            </div>
            
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                <span style="color:#6b7280;font-weight:500;"><span style="font-size:18px;">📝</span> Type</span>
                <span style="color:#1f2937;font-weight:600;">${itemType === 'folder' ? 'Folder' : (itemMimeType || extension + ' File')}</span>
            </div>
            
            ${itemType === 'folder' ? `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-weight:500;"><span style="font-size:18px;">📁</span> Contains</span>
                    <span style="color:#1f2937;font-weight:600;">${fileCount} files, ${subfolderCount} folders</span>
                </div>
            ` : ''}
            
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                <span style="color:#6b7280;font-weight:500;"><span style="font-size:18px;">📅</span> Created</span>
                <span style="color:#1f2937;font-weight:600;font-size:13px;">${createdDate}</span>
            </div>
            
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                <span style="color:#6b7280;font-weight:500;"><span style="font-size:18px;">🕐</span> Modified</span>
                <span style="color:#1f2937;font-weight:600;font-size:13px;">${modifiedDate}</span>
            </div>
            
            <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
                <span style="color:#6b7280;font-weight:500;"><span style="font-size:18px;">📍</span> Location</span>
                <span style="color:#1f2937;font-weight:600;">${currentFolderId ? 'In Folder' : 'My Files (Root)'}</span>
            </div>
        </div>
        
        ${itemType === 'file' ? `
            <div style="margin-top:24px;display:flex;gap:12px;">
                <button onclick="downloadItem(${id},'file');closePropertiesModal();" class="btn btn-primary" style="flex:1;">📥 Download</button>
                <button onclick="closePropertiesModal();setTimeout(() => shareItemFromContext(${id},'file'),100);" class="btn btn-secondary" style="flex:1;">🔗 Share</button>
            </div>
        ` : `
            <div style="margin-top:24px;display:flex;gap:12px;">
                <button onclick="openFolder(${id});closePropertiesModal();" class="btn btn-primary" style="flex:1;">📂 Open Folder</button>
                <button onclick="closePropertiesModal();setTimeout(() => shareItemFromContext(${id},'folder'),100);" class="btn btn-secondary" style="flex:1;">🔗 Share</button>
            </div>
        `}
    `;
    
    let modal = document.getElementById('propertiesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'propertiesModal';
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="closePropertiesModal()"></div>
            <div class="modal-dialog" style="max-width:500px;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">ℹ️ Properties</h3>
                        <button class="modal-close" onclick="closePropertiesModal()">✕</button>
                    </div>
                    <div class="modal-body" id="propertiesContent"></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const propertiesContent = document.getElementById('propertiesContent');
    if (propertiesContent) {
        propertiesContent.innerHTML = propertiesHTML;
    }
    
    modal.style.display = 'flex';
}

function closePropertiesModal() {
    const propertiesModal = document.getElementById('propertiesModal');
    if (propertiesModal) {
        propertiesModal.style.display = 'none';
    }
}

// ============================================
// CREATE NEW FOLDER
// ============================================

async function createNewFolder() {
    const folderName = prompt('Enter folder name:');
    
    if (!folderName || !folderName.trim()) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/folders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName.trim(),
                parent_id: currentFolderId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            log('Folder created:', data.folder);
            showAlert('Folder created successfully!', 'success');
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to create folder', 'error');
        }
        
    } catch (error) {
        logError('Create folder error', error);
        showAlert('Failed to create folder', 'error');
    }
}

// ============================================
// VIEW TOGGLE
// ============================================

function setView(view) {
    currentView = view;
    
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    
    if (gridBtn && listBtn) {
        gridBtn.classList.toggle('active', view === 'grid');
        listBtn.classList.toggle('active', view === 'list');
    }
    
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.className = view === 'grid' ? 'file-grid' : 'file-list';
    }
    
    log('View changed to:', view);
}

// ============================================
// SORT MENU
// ============================================

function toggleSortMenu() {
    const sortMenu = document.getElementById('sortMenu');
    if (sortMenu) {
        sortMenu.style.display = sortMenu.style.display === 'none' ? 'block' : 'none';
    }
}

function sortBy(sortType) {
    log('Sorting by:', sortType);
    
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

// ============================================
// SEARCH
// ============================================

const searchFiles = debounce(function(query) {
    log('Searching:', query);
    
    if (!query.trim()) {
        renderFilesAndFolders();
        return;
    }
    
    const searchLower = query.toLowerCase();
    
    const filteredFolders = folders.filter(f => 
        f.name.toLowerCase().includes(searchLower)
    );
    
    const filteredFiles = files.filter(f => 
        (f.original_name || f.filename).toLowerCase().includes(searchLower)
    );
    
    const originalFolders = folders;
    const originalFiles = files;
    
    folders = filteredFolders;
    files = filteredFiles;
    
    renderFilesAndFolders();
    
    folders = originalFolders;
    files = originalFiles;
    
}, 300);

// ============================================
// SIDEBAR & MENUS
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

// ============================================
// NAVIGATION
// ============================================


// ============================================
// NAVIGATION (UPDATED)
// ============================================

// ============================================
// SHOW RECENT (UPDATED)
// ============================================

async function showRecent(event) {
    if (event) event.preventDefault();
    log('Showing recent files');
    
    // Update breadcrumb
    const currentFolderEl = document.getElementById('currentFolder');
    const separatorEl = document.getElementById('breadcrumbSeparator');
    
    if (currentFolderEl) {
        currentFolderEl.textContent = 'Recent';
    }
    
    if (separatorEl) {
        separatorEl.style.display = 'inline';
    }
    
    // Update sidebar active state
    updateSidebarActive('recent');
    
    // Set current view to recent
    currentFolderId = 'recent';
    
    // Load recent files
    await loadRecentFiles();
}
// ============================================
// SHOW SHARED BY ME (NEW)
// ============================================

async function showSharedByMe(event) {
    if (event) event.preventDefault();
    log('Showing shared by me');
    
    // Update breadcrumb
    const currentFolderEl = document.getElementById('currentFolder');
    const separatorEl = document.getElementById('breadcrumbSeparator');
    
    if (currentFolderEl) {
        currentFolderEl.textContent = 'Shared by me';
    }
    
    if (separatorEl) {
        separatorEl.style.display = 'inline';
    }
    
    // Update sidebar active state
    updateSidebarActive('shared-by-me');
    
    // Set current view
    currentFolderId = 'shared-by-me';
    
    // Load shared items
    await loadSharedByMe();
}

// Load items shared by me
async function loadSharedByMe() {
    log('Loading shared by me...');
    
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.innerHTML = `
            <div class="loading-state" id="loadingState">
                <div class="spinner"></div>
                <p>Loading shared items...</p>
            </div>
        `;
    }
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/share/my-shares`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            log('Loaded shared items:', {
                shares: data.shares?.length || 0,
                links: data.links?.length || 0
            });
            renderSharedByMe(data.shares || [], data.links || []);
        } else {
            showAlert(data.message || 'Failed to load shared items', 'error');
            if (fileGrid) {
                fileGrid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⚠️</div>
                        <h3>Failed to load shared items</h3>
                        <p>${data.message || 'Unknown error'}</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        logError('Load shared by me error', error);
        if (fileGrid) {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load shared items</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// Render shared by me items
function renderSharedByMe(shares, links) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    
    // Check if empty
    if ((!shares || shares.length === 0) && (!links || links.length === 0)) {
        fileGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔗</div>
                <h3>Nothing shared yet</h3>
                <p>Items you share with others will appear here</p>
                <button class="btn btn-primary" onclick="navigateToRoot()">
                    Go to My Files
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // Section: Public Links
    if (links && links.length > 0) {
        html += `
            <div style="grid-column: 1 / -1; margin-bottom: 10px;">
                <h3 style="color: #374151; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    🌐 Public Links <span style="background: #6366f1; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${links.length}</span>
                </h3>
            </div>
        `;
        
        links.forEach(link => {
            const isFolder = link.type === 'folder' || link.share_type === 'folder';
            const itemName = link.name || link.file_name || link.folder_name || 'Unknown';
            const icon = isFolder ? '📁' : getFileIcon(itemName);
            const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
            const isActive = link.is_active !== false;
            
            let status = '';
            let statusColor = '#10b981'; // green
            
            if (!isActive) {
                status = '❌ Deactivated';
                statusColor = '#ef4444';
            } else if (isExpired) {
                status = '⏰ Expired';
                statusColor = '#f59e0b';
            } else if (link.max_downloads && link.download_count >= link.max_downloads) {
                status = '🚫 Limit reached';
                statusColor = '#f59e0b';
            } else if (link.max_views && link.view_count >= link.max_views) {
                status = '🚫 Limit reached';
                statusColor = '#f59e0b';
            } else {
                status = '✅ Active';
            }
            
            // Stats
            let stats = '';
            if (isFolder) {
                stats = `👁️ ${link.view_count || 0} views`;
            } else {
                stats = `📥 ${link.download_count || 0} downloads`;
            }
            
            const shareUrl = link.url || `${window.location.origin}/public-share.html?token=${link.share_token}`;
            
            html += `
                <div class="file-card shared-card" 
                     data-id="${link.id}" 
                     data-type="share-link"
                     style="position: relative;">
                    <div class="share-badge" style="
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        background: #6366f1;
                        color: white;
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
                        z-index: 10;
                    ">🔗</div>
                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${escapeHtml(itemName)}</div>
                    <div class="file-info" style="color: ${statusColor};">${status}</div>
                    <div class="file-info">${stats}</div>
                    <div style="margin-top: 10px; display: flex; gap: 5px; justify-content: center;">
                        <button onclick="copyShareLinkUrl('${escapeHtml(shareUrl)}')" 
                                class="btn btn-sm btn-secondary" 
                                style="padding: 4px 8px; font-size: 11px;">
                            📋 Copy
                        </button>
                        <button onclick="openShareLink('${escapeHtml(shareUrl)}')" 
                                class="btn btn-sm btn-secondary" 
                                style="padding: 4px 8px; font-size: 11px;">
                            🔗 Open
                        </button>
                        <button onclick="deleteShareLinkFromGrid(${link.id})" 
                                class="btn btn-sm btn-danger" 
                                style="padding: 4px 8px; font-size: 11px;">
                            🗑️
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    // Section: Shared with Users
    if (shares && shares.length > 0) {
        html += `
            <div style="grid-column: 1 / -1; margin-top: 20px; margin-bottom: 10px;">
                <h3 style="color: #374151; font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    👥 Shared with Users <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${shares.length}</span>
                </h3>
            </div>
        `;
        
        shares.forEach(share => {
            const isFolder = share.type === 'folder' || share.folder_id;
            const itemName = share.name || share.file_name || share.folder_name || 'Unknown';
            const icon = isFolder ? '📁' : getFileIcon(itemName);
            const sharedWith = share.shared_with_name || share.shared_with_email || 'Unknown user';
            const permission = share.permission || 'view';
            
            let permissionBadge = '';
            switch (permission) {
                case 'view':
                    permissionBadge = '👁️ View';
                    break;
                case 'download':
                    permissionBadge = '📥 Download';
                    break;
                case 'edit':
                    permissionBadge = '✏️ Edit';
                    break;
                default:
                    permissionBadge = '👁️ View';
            }
            
            html += `
                <div class="file-card shared-card" 
                     data-id="${share.id}" 
                     data-type="user-share"
                     style="position: relative;">
                    <div class="share-badge" style="
                        position: absolute;
                        top: 8px;
                        right: 8px;
                        background: #10b981;
                        color: white;
                        width: 24px;
                        height: 24px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
                        z-index: 10;
                    ">👤</div>
                    <div class="file-icon">${icon}</div>
                    <div class="file-name">${escapeHtml(itemName)}</div>
                    <div class="file-info">👤 ${escapeHtml(sharedWith)}</div>
                    <div class="file-info" style="color: #6366f1;">${permissionBadge}</div>
                    <div style="margin-top: 10px; display: flex; gap: 5px; justify-content: center;">
                        <button onclick="revokeUserShare(${share.id})" 
                                class="btn btn-sm btn-danger" 
                                style="padding: 4px 8px; font-size: 11px;">
                            🗑️ Revoke
                        </button>
                    </div>
                </div>
            `;
        });
    }
    
    fileGrid.innerHTML = html;
}
// ============================================
// SHOW SHARED WITH ME
// ============================================

async function showSharedWithMe(event) {
    if (event) event.preventDefault();
    log('Showing shared with me');
    
    const currentFolderEl = document.getElementById('currentFolder');
    const separatorEl = document.getElementById('breadcrumbSeparator');
    
    if (currentFolderEl) currentFolderEl.textContent = 'Shared with me';
    if (separatorEl) separatorEl.style.display = 'inline';
    
    updateSidebarActive('shared-with-me');
    currentFolderId = 'shared-with-me';
    
    await loadSharedWithMe();
}

async function loadSharedWithMe() {
    log('Loading shared with me...');
    
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <p>Loading shared items...</p>
            </div>
        `;
    }
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/share/shared-with-me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            log('Loaded shared with me:', data.shares?.length || 0);
            renderSharedWithMe(data.shares || []);
        } else {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load</h3>
                    <p>${data.message || 'Unknown error'}</p>
                </div>
            `;
        }
    } catch (error) {
        logError('Load shared with me error', error);
        fileGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Failed to load</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderSharedWithMe(shares) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    
    if (!shares || shares.length === 0) {
        fileGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <h3>Nothing shared with you</h3>
                <p>Files and folders shared with you will appear here</p>
                <button class="btn btn-primary" onclick="navigateToRoot()">Go to My Files</button>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="grid-column: 1 / -1; margin-bottom: 10px;">
            <h3 style="color: #374151; font-size: 16px; font-weight: 600;">
                👥 Shared with You 
                <span style="background: #8b5cf6; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${shares.length}</span>
            </h3>
        </div>
    `;
    
    shares.forEach(share => {
        const isFolder = share.type === 'folder';
        const itemName = share.name || 'Unknown';
        const icon = isFolder ? '📁' : getFileIcon(itemName);
        const ownerName = share.owner_name || share.owner_email || 'Unknown';
        const sharedAt = share.shared_at ? formatDate(share.shared_at) : 'Unknown';
        const permission = share.permission || 'view';
        const itemId = share.file_id || share.folder_id;
        
        // Permission badge
        const permStyles = {
            'view': { text: '👁️ View Only', color: '#6b7280', bg: '#f3f4f6' },
            'download': { text: '📥 Can Download', color: '#10b981', bg: '#ecfdf5' },
            'edit': { text: '✏️ Can Edit', color: '#6366f1', bg: '#eef2ff' }
        };
        const perm = permStyles[permission] || permStyles['view'];
        
        // Size info
        const sizeInfo = !isFolder && share.size ? formatFileSize(share.size) : '';
        
        // Can download?
        const canDownload = permission === 'download' || permission === 'edit';
        
        html += `
            <div class="file-card" style="position: relative;">
                <!-- Share badge -->
                <div style="
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: #8b5cf6;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                ">👤</div>
                
                <!-- File icon -->
                <div class="file-icon">${icon}</div>
                
                <!-- File name -->
                <div class="file-name">${escapeHtml(itemName)}</div>
                
                <!-- Owner info -->
                <div class="file-info">👤 From: ${escapeHtml(ownerName)}</div>
                
                <!-- Size and date -->
                <div class="file-info">${sizeInfo ? sizeInfo + ' • ' : ''}${sharedAt}</div>
                
                <!-- Permission badge -->
                <div style="
                    margin-top: 6px;
                    display: inline-block;
                    padding: 3px 10px;
                    background: ${perm.bg};
                    color: ${perm.color};
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                ">${perm.text}</div>
                
                <!-- Action buttons -->
                <div style="margin-top: 10px; display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                    ${canDownload ? `
                        <button onclick="event.stopPropagation(); downloadSharedItem(${itemId}, '${share.type}')" 
                                style="padding: 6px 12px; font-size: 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            📥 Download
                        </button>
                    ` : ''}
                    
                    ${!isFolder ? `
                        <button onclick="event.stopPropagation(); previewSharedFile(${itemId}, '${permission}')" 
                                style="padding: 6px 12px; font-size: 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            👁️ Preview
                        </button>
                    ` : ''}
                    
                    ${isFolder && canDownload ? `
                        <button onclick="event.stopPropagation(); downloadSharedItem(${itemId}, 'folder')" 
                                style="padding: 6px 12px; font-size: 12px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            📦 Download ZIP
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });
    
    fileGrid.innerHTML = html;
}

// Handle click on shared item
function handleSharedItemClick(event, shareId, itemType, fileId, folderId, permission) {
    event.preventDefault();
    
    if (itemType === 'folder' && folderId) {
        // Open shared folder
        openSharedFolder(folderId, shareId);
    } else if (itemType === 'file' && fileId) {
        // Preview shared file
        previewSharedFile(fileId, permission);
    }
}

// Preview shared file
async function previewSharedFile(fileId, permission) {
    log('Previewing shared file:', fileId);
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        // Get file info
        const response = await fetch(`${apiBase}/api/share/shared-file/${fileId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.file) {
                // Show preview modal
                showSharedFilePreview(data.file, permission);
            } else {
                showAlert('File not found', 'error');
            }
        } else {
            showAlert('Cannot access this file', 'error');
        }
    } catch (error) {
        logError('Preview shared file error', error);
        showAlert('Failed to load file', 'error');
    }
}

// Show shared file preview
function showSharedFilePreview(file, permission) {
    const fileName = file.original_name || file.filename;
    const ext = fileName.split('.').pop().toLowerCase();
    const icon = getFileIcon(fileName);
    
    const previewHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 80px; margin-bottom: 20px;">${icon}</div>
            <h3 style="font-size: 20px; color: #1f2937; margin-bottom: 8px;">${escapeHtml(fileName)}</h3>
            <p style="color: #6b7280; margin-bottom: 8px;">${formatFileSize(file.size)}</p>
            <p style="color: #6b7280; margin-bottom: 24px;">Shared by ${escapeHtml(file.owner_name || 'Unknown')}</p>
            ${permission === 'download' || permission === 'edit' ? `
                <button onclick="downloadSharedItem(${file.id}, 'file'); closePreviewModal();" class="btn btn-primary">
                    📥 Download File
                </button>
            ` : `
                <p style="color: #f59e0b;">👁️ View only - Download not permitted</p>
            `}
        </div>
    `;
    
    showPreviewModal(fileName, previewHTML);
}

// Open shared folder
async function openSharedFolder(folderId, shareId) {
    log('Opening shared folder:', folderId);
    showAlert('Opening shared folder...', 'info');
    
    // TODO: Implement shared folder browsing
    // This would require additional backend support to list folder contents
    // For now, show a message
    showAlert('Shared folder browsing coming soon!', 'info');
}

// Download shared item
// ============================================
// DOWNLOAD SHARED ITEM (FIXED)
// ============================================

async function downloadSharedItem(fileId, itemType) {
    if (!fileId) {
        showAlert('Cannot download this item', 'error');
        return;
    }
    
    log('Downloading shared file:', fileId);
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        if (itemType === 'file') {
            // Download shared file
            const response = await fetch(`${apiBase}/api/share/shared-file/${fileId}/download`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                // Get filename from header
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'download';
                
                if (contentDisposition) {
                    const match = contentDisposition.match(/filename="?([^"]+)"?/);
                    if (match) filename = decodeURIComponent(match[1]);
                }
                
                // Convert to blob and download
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
        } else if (itemType === 'folder') {
            // Download shared folder as ZIP
            const response = await fetch(`${apiBase}/api/share/shared-folder/${fileId}/download`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'shared-folder.zip';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
                
                showAlert('📥 Folder download started!', 'success');
            } else {
                const data = await response.json();
                showAlert(data.message || 'Download failed', 'error');
            }
        }
    } catch (error) {
        logError('Download shared item error', error);
        showAlert('Download failed', 'error');
    }
}
// Show context menu for shared items
function showSharedItemContextMenu(event, shareId, itemType, fileId, folderId, permission) {
    event.preventDefault();
    event.stopPropagation();
    
    // Hide default context menu
    hideContextMenu();
    
    // Create custom context menu for shared items
    let existingMenu = document.getElementById('sharedContextMenu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.id = 'sharedContextMenu';
    menu.className = 'context-menu';
    menu.style.display = 'block';
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    
    let menuHTML = '';
    
    if (itemType === 'file') {
        menuHTML += `<div class="context-item" onclick="previewSharedFile(${fileId}, '${permission}'); hideSharedContextMenu();">
            <span class="context-icon">👁️</span><span>Preview</span>
        </div>`;
        
        if (permission === 'download' || permission === 'edit') {
            menuHTML += `<div class="context-item" onclick="downloadSharedItem(${fileId}, 'file'); hideSharedContextMenu();">
                <span class="context-icon">📥</span><span>Download</span>
            </div>`;
        }
    } else if (itemType === 'folder') {
        menuHTML += `<div class="context-item" onclick="openSharedFolder(${folderId}, ${shareId}); hideSharedContextMenu();">
            <span class="context-icon">📂</span><span>Open Folder</span>
        </div>`;
    }
    
    menuHTML += `<div class="context-separator"></div>`;
    menuHTML += `<div class="context-item" onclick="showSharedItemInfo(${shareId}); hideSharedContextMenu();">
        <span class="context-icon">ℹ️</span><span>Info</span>
    </div>`;
    
    menu.innerHTML = menuHTML;
    document.body.appendChild(menu);
    
    // Close menu on click outside
    setTimeout(() => {
        document.addEventListener('click', hideSharedContextMenu, { once: true });
    }, 10);
}

function hideSharedContextMenu() {
    const menu = document.getElementById('sharedContextMenu');
    if (menu) menu.remove();
}

function showSharedItemInfo(shareId) {
    showAlert('Item info coming soon!', 'info');
}
// Copy share link URL
function copyShareLinkUrl(url) {
    if (typeof copyTextToClipboard === 'function') {
        copyTextToClipboard(url)
            .then(() => showAlert('📋 Link copied!', 'success'))
            .catch(() => {
                // Fallback
                const input = document.createElement('input');
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showAlert('📋 Link copied!', 'success');
            });
    } else {
        // Fallback
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showAlert('📋 Link copied!', 'success');
    }
}

// Open share link in new tab
function openShareLink(url) {
    window.open(url, '_blank');
}

// Delete share link from grid
async function deleteShareLinkFromGrid(linkId) {
    if (!confirm('Delete this share link? The link will stop working.')) return;
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/share/link/${linkId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('✅ Share link deleted', 'success');
            loadSharedByMe(); // Refresh the list
        } else {
            showAlert(data.message || 'Failed to delete', 'error');
        }
    } catch (error) {
        console.error('Delete share link error:', error);
        showAlert('Failed to delete share link', 'error');
    }
}

// Revoke user share
async function revokeUserShare(shareId) {
    if (!confirm('Revoke access for this user?')) return;
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/share/user/${shareId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('✅ Access revoked', 'success');
            loadSharedByMe(); // Refresh the list
        } else {
            showAlert(data.message || 'Failed to revoke', 'error');
        }
    } catch (error) {
        console.error('Revoke share error:', error);
        showAlert('Failed to revoke access', 'error');
    }
}
// Load recent files from API
async function loadRecentFiles() {
    log('Loading recent files...');
    
    const fileGrid = document.getElementById('fileGrid');
    if (fileGrid) {
        fileGrid.innerHTML = `
            <div class="loading-state" id="loadingState">
                <div class="spinner"></div>
                <p>Loading recent files...</p>
            </div>
        `;
    }
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/files/recent?limit=30`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            log('Loaded recent items:', data.count);
            renderRecentFiles(data.items);
        } else {
            showAlert(data.message || 'Failed to load recent files', 'error');
            if (fileGrid) {
                fileGrid.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⚠️</div>
                        <h3>Failed to load recent files</h3>
                        <p>${data.message || 'Unknown error'}</p>
                    </div>
                `;
            }
        }
    } catch (error) {
        logError('Load recent files error', error);
        if (fileGrid) {
            fileGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Failed to load recent files</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
}

// Render recent files
function renderRecentFiles(items) {
    const fileGrid = document.getElementById('fileGrid');
    if (!fileGrid) return;
    
    if (!items || items.length === 0) {
        fileGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🕐</div>
                <h3>No recent activity</h3>
                <p>Your recently accessed files and folders will appear here</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    items.forEach(item => {
        const isFolder = item.item_type === 'folder';
        const itemName = isFolder ? item.name : (item.original_name || item.filename);
        const icon = isFolder ? '📁' : getFileIcon(itemName);
        const itemId = item.id;
        const modified = item.updated_at || item.created_at;
        
        // Calculate time ago
        const timeAgo = getTimeAgo(modified);
        
        let metaInfo = '';
        if (isFolder) {
            metaInfo = `Folder • ${timeAgo}`;
        } else {
            metaInfo = `${formatFileSize(item.size)} • ${timeAgo}`;
        }
        
        // Add folder location if file is in a folder
        if (!isFolder && item.folder_name) {
            metaInfo += ` • 📁 ${item.folder_name}`;
        }
        
        html += `
            <div class="file-card" 
                 data-id="${itemId}" 
                 data-type="${item.item_type}" 
                 data-name="${escapeHtml(itemName)}"
                 style="position: relative;"
                 onclick="handleItemClick(event, ${itemId}, '${item.item_type}')"
                 ondblclick="${isFolder ? `openFolder(${itemId})` : `previewFile(${itemId})`}"
                 oncontextmenu="showContextMenu(event, ${itemId}, '${item.item_type}')">
                <div class="recent-badge" style="
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: #3b82f6;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
                    z-index: 10;
                ">🕐</div>
                <div class="file-icon">${icon}</div>
                <div class="file-name">${escapeHtml(itemName)}</div>
                <div class="file-info">${metaInfo}</div>
            </div>
        `;
    });
    
    fileGrid.innerHTML = html;
}

// Get time ago string
function getTimeAgo(dateString) {
    if (!dateString) return 'Unknown';
    
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        
        if (diffSecs < 60) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffWeeks < 4) {
            return `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`;
        } else if (diffMonths < 12) {
            return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
        } else {
            return formatDate(dateString);
        }
    } catch (e) {
        return 'Unknown';
    }
}

// Update sidebar active state
// Update sidebar active state
function updateSidebarActive(section) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    switch (section) {
        case 'recent':
            const recentNav = document.getElementById('navRecent');
            if (recentNav) recentNav.classList.add('active');
            break;
        case 'favorites':
            const favNav = document.getElementById('navFavorites');
            if (favNav) favNav.classList.add('active');
            break;
        case 'shared-by-me':
            const sharedByMeNav = document.getElementById('navSharedByMe');
            if (sharedByMeNav) sharedByMeNav.classList.add('active');
            break;
        case 'shared-with-me':  // ⭐ ADD THIS
            const sharedWithMeNav = document.getElementById('navSharedWithMe');
            if (sharedWithMeNav) sharedWithMeNav.classList.add('active');
            break;
        case 'myfiles':
        default:
            const myFilesNav = document.getElementById('navMyFiles');
            if (myFilesNav) myFilesNav.classList.add('active');
            break;
    }
}

function showFavorites(event) {
    if (event) event.preventDefault();
    log('Showing favorites');
    
    // Update breadcrumb
    const currentFolderEl = document.getElementById('currentFolder');
    const separatorEl = document.getElementById('breadcrumbSeparator');
    
    if (currentFolderEl) {
        currentFolderEl.textContent = 'Favorites';
    }
    
    if (separatorEl) {
        separatorEl.style.display = 'inline';
    }
    
    // Set current view to favorites
    currentFolderId = 'favorites';
    
    // Load favorites
    loadFavorites();
}

// ============================================
// BULK OPERATIONS
// ============================================

// ============================================
// BULK OPERATIONS (FIXED - REAL FUNCTIONALITY)
// ============================================

// ============================================
// BULK OPERATIONS - DOWNLOAD (FIXED WITH FOLDERS)
// ============================================

async function downloadSelected() {
    if (selectedItems.length === 0) {
        showAlert('No items selected', 'warning');
        return;
    }
    
    log('Downloading selected:', selectedItems);
    
    const fileCount = selectedItems.filter(i => i.type === 'file').length;
    const folderCount = selectedItems.filter(i => i.type === 'folder').length;
    
    // Show download progress modal
    showDownloadProgressModal(fileCount, folderCount);
    
    let downloadedFiles = 0;
    let downloadedFolders = 0;
    let errorCount = 0;
    
    try {
        for (const item of selectedItems) {
            const itemId = parseInt(item.id);
            
            try {
                if (item.type === 'file') {
                    await downloadItem(itemId, 'file');
                    downloadedFiles++;
                } else if (item.type === 'folder') {
                    await downloadItem(itemId, 'folder');
                    downloadedFolders++;
                }
                
                updateDownloadProgress(downloadedFiles + downloadedFolders, selectedItems.length);
                
                // Small delay between downloads
                await sleep(item.type === 'folder' ? 800 : 300);
                
            } catch (error) {
                errorCount++;
                logError(`Failed to download ${item.name}:`, error);
            }
        }
        
        // Show success
        setTimeout(() => {
            closeDownloadProgressModal();
            
            if (downloadedFiles + downloadedFolders > 0) {
                let msg = '✅ Downloaded: ';
                if (downloadedFiles > 0) msg += `${downloadedFiles} file(s)`;
                if (downloadedFolders > 0) {
                    if (downloadedFiles > 0) msg += ' and ';
                    msg += `${downloadedFolders} folder(s)`;
                }
                showAlert(msg, 'success');
            }
            
            if (errorCount > 0) {
                showAlert(`⚠️ ${errorCount} item(s) failed to download`, 'warning');
            }
            
            clearSelection();
        }, 500);
        
    } catch (error) {
        logError('Download error:', error);
        closeDownloadProgressModal();
        showAlert('Some downloads failed', 'error');
    }
}

// Helper: Sleep function
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function shareSelected() {
    if (selectedItems.length === 0) {
        showAlert('No items selected', 'warning');
        return;
    }
    
    log('Sharing selected:', selectedItems);
    
    // If only one item selected, open share modal directly
    if (selectedItems.length === 1) {
        const item = selectedItems[0];
        const itemId = parseInt(item.id);
        const itemType = item.type;
        
        // Find the actual item object
        let itemObj;
        if (itemType === 'folder') {
            itemObj = folders.find(f => parseInt(f.id) === itemId);
        } else {
            itemObj = files.find(f => parseInt(f.id) === itemId);
        }
        
        if (itemObj) {
            shareItemFromContext(itemId, itemType);
            clearSelection();
        } else {
            showAlert('Item not found', 'error');
        }
        return;
    }
    
    // Multiple items selected - show bulk share modal
    showBulkShareModal(selectedItems);
}

// ============================================
// DELETE SELECTED (FIXED - UPDATES STORAGE IMMEDIATELY)
// ============================================

async function deleteSelected() {
    if (selectedItems.length === 0) {
        showAlert('No items selected', 'warning');
        return;
    }

    const itemCount = selectedItems.length;
    const fileCount = selectedItems.filter(i => i.type === 'file').length;
    const folderCount = selectedItems.filter(i => i.type === 'folder').length;

    let confirmMsg = `Delete ${itemCount} selected item(s)?\n\n`;
    if (fileCount > 0) confirmMsg += `• ${fileCount} file(s)\n`;
    if (folderCount > 0) confirmMsg += `• ${folderCount} folder(s) (with all contents)\n`;
    confirmMsg += `\nItems will be moved to trash.`;

    if (!confirm(confirmMsg)) return;

    if (folderCount > 0) {
        if (!confirm(`⚠️ WARNING: You are about to delete ${folderCount} folder(s).\n\nAll files inside will be deleted!\n\nAre you absolutely sure?`)) {
            return;
        }
    }

    log('Deleting selected:', selectedItems);

    const apiBase = getApiBase();
    const token = localStorage.getItem('token');

    let successCount = 0;
    let errorCount = 0;
    let totalFreedSpace = 0;

    showAlert('Deleting items...', 'info');

    try {
        for (const item of selectedItems) {
            const itemId = parseInt(item.id);
            const itemType = item.type;

            try {
                const endpoint = itemType === 'folder'
                    ? `${apiBase}/api/folders/${itemId}`
                    : `${apiBase}/api/files/${itemId}`;

                const response = await fetch(endpoint, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = await response.json();

                if (data.success) {
                    successCount++;
                    if (data.freed_space) {
                        totalFreedSpace += data.freed_space;
                    }
                } else {
                    errorCount++;
                    logError(`Failed to delete ${item.name}:`, data.message);
                }
            } catch (error) {
                errorCount++;
                logError(`Error deleting ${item.name}:`, error);
            }
        }

        // Show results
        if (successCount > 0) {
            let message = `✅ Deleted ${successCount} item(s)`;
            if (totalFreedSpace > 0) {
                message += ` • ${formatFileSize(totalFreedSpace)} freed`;
            }
            showAlert(message, 'success');
        }

        if (errorCount > 0) {
            showAlert(`⚠️ Failed to delete ${errorCount} item(s)`, 'warning');
        }

        // Clear selection and reload
        clearSelection();
        loadFilesAndFolders(currentFolderId);

        // ✅ UPDATE STORAGE IMMEDIATELY FROM SERVER
        await loadStorageInfo();

    } catch (error) {
        logError('Bulk delete error:', error);
        showAlert('Failed to delete items', 'error');
    }
}

// ============================================
// BULK SHARE MODAL (NEW)
// ============================================

function showBulkShareModal(items) {
    const itemCount = items.length;
    const fileCount = items.filter(i => i.type === 'file').length;
    const folderCount = items.filter(i => i.type === 'folder').length;
    
    let itemsList = '<div style="max-height:200px;overflow-y:auto;background:#f9fafb;border-radius:8px;padding:10px;margin:10px 0;">';
    
    items.forEach(item => {
        const icon = item.type === 'folder' ? '📁' : getFileIcon(item.name);
        itemsList += `
            <div style="padding:8px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">${icon}</span>
                <span style="flex:1;color:#1f2937;font-size:14px;">${escapeHtml(item.name)}</span>
            </div>
        `;
    });
    
    itemsList += '</div>';
    
    let modal = document.getElementById('bulkShareModal');
    if (modal) modal.remove();
    
    modal = document.createElement('div');
    modal.id = 'bulkShareModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="closeBulkShareModal()"></div>
        <div class="modal-dialog" style="max-width:500px;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">🔗 Share ${itemCount} Items</h3>
                    <button class="modal-close" onclick="closeBulkShareModal()">✕</button>
                </div>
                <div class="modal-body">
                    <p style="color:#6b7280;margin-bottom:10px;">
                        You are sharing <strong>${fileCount} file(s)</strong>${folderCount > 0 ? ` and <strong>${folderCount} folder(s)</strong>` : ''}
                    </p>
                    
                    ${itemsList}
                    
                    <div class="alert alert-info" style="margin-top:15px;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e40af;">
                        ℹ️ <strong>Note:</strong> Each item will be shared individually with the same settings.
                    </div>
                    
                    <div style="margin-top:20px;">
                        <h4 style="font-size:14px;font-weight:600;margin-bottom:10px;">Share Options:</h4>
                        
                        <button onclick="bulkShareAsPublicLink()" class="btn btn-primary" style="width:100%;margin-bottom:10px;">
                            🌐 Create Public Links
                        </button>
                        
                        <button onclick="bulkShareWithUsers()" class="btn btn-secondary" style="width:100%;">
                            👥 Share with Specific Users
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="closeBulkShareModal()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closeBulkShareModal() {
    const modal = document.getElementById('bulkShareModal');
    if (modal) modal.remove();
}

async function bulkShareAsPublicLink() {
    closeBulkShareModal();
    
    showAlert('Creating public links...', 'info');
    
    const apiBase = getApiBase();
    const token = localStorage.getItem('token');
    
    let successCount = 0;
    let links = [];
    
    for (const item of selectedItems) {
        try {
            const response = await fetch(`${apiBase}/api/share/create-link`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    item_type: item.type,
                    item_id: parseInt(item.id),
                    is_active: true
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.link) {
                successCount++;
                const shareUrl = data.link.url || `${window.location.origin}/public-share.html?token=${data.link.share_token}`;
                links.push({
                    name: item.name,
                    url: shareUrl
                });
            }
        } catch (error) {
            logError('Bulk share error:', error);
        }
    }
    
    if (successCount > 0) {
        showBulkShareResults(links);
        clearSelection();
    } else {
        showAlert('Failed to create share links', 'error');
    }
}

function showBulkShareResults(links) {
    let linksList = '';
    links.forEach(link => {
        linksList += `
            <div style="margin-bottom:10px;padding:10px;background:#f9fafb;border-radius:8px;">
                <div style="font-weight:600;margin-bottom:5px;">${escapeHtml(link.name)}</div>
                <div style="display:flex;gap:5px;">
                    <input type="text" value="${link.url}" readonly 
                           style="flex:1;padding:6px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;"
                           onclick="this.select()">
                    <button onclick="copyTextToClipboard('${link.url}').then(() => showAlert('📋 Copied!','success'))" 
                            class="btn btn-sm btn-secondary">
                        📋
                    </button>
                </div>
            </div>
        `;
    });
    
    let modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop" onclick="this.parentElement.remove()"></div>
        <div class="modal-dialog" style="max-width:600px;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">✅ Share Links Created</h3>
                    <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
                </div>
                <div class="modal-body">
                    <p style="color:#10b981;margin-bottom:15px;">
                        ✅ Created ${links.length} share link(s)
                    </p>
                    <div style="max-height:400px;overflow-y:auto;">
                        ${linksList}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="this.closest('.modal').remove()">Done</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function bulkShareWithUsers() {
    closeBulkShareModal();
    showAlert('Bulk user sharing coming soon!', 'info');
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupDashboardEvents() {
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.context-menu')) {
            hideContextMenu();
        }
        
        if (!event.target.closest('.user-menu')) {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
        
        if (!event.target.closest('.dropdown-wrapper')) {
            const sortMenu = document.getElementById('sortMenu');
            if (sortMenu) sortMenu.style.display = 'none';
        }
    });
    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Delete' && selectedItems.length > 0) {
            deleteSelected();
        }
        
        if (event.key === 'Escape') {
            clearSelection();
            hideContextMenu();
        }
        
        if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            event.preventDefault();
            const cards = document.querySelectorAll('.file-card');
            cards.forEach(card => card.classList.add('selected'));
            updateSelection();
        }
    });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getApiBase() {
    return window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : `http://${window.location.hostname}:5000`;
}

function getCurrentUser() {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch (e) {
        return null;
    }
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
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        return 'Unknown';
    }
}

function formatDateFull(dateString) {
    if (!dateString) return 'Unknown';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'Unknown';
    }
}

function getFileExtension(filename) {
    if (!filename) return '';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getFileIcon(filename) {
    if (!filename) return '📄';
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
        'pdf': '📕', 'doc': '📘', 'docx': '📘', 'txt': '📝', 'rtf': '📝',
        'xls': '📊', 'xlsx': '📊', 'csv': '📊', 'ppt': '📙', 'pptx': '📙',
        'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🎞️', 'bmp': '🖼️', 'svg': '🎨', 'webp': '🖼️',
        'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'wmv': '🎬', 'mkv': '🎬', 'webm': '🎬',
        'mp3': '🎵', 'wav': '🎵', 'ogg': '🎵', 'flac': '🎵',
        'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦',
        'html': '💻', 'css': '🎨', 'js': '⚡', 'json': '📋', 'py': '🐍', 'java': '☕'
    };
    return iconMap[ext] || '📄';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function log(...args) {
    console.log('[Dashboard]', ...args);
}

function logError(...args) {
    console.error('[Dashboard Error]', ...args);
}

function showAlert(message, type = 'success') {
    let alertContainer = document.getElementById('alertContainer');
    
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainer';
        alertContainer.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            z-index: 10000;
        `;
        document.body.appendChild(alertContainer);
    }
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    const alert = document.createElement('div');
    alert.style.cssText = `
        padding: 15px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        background: ${colors[type] || colors.success};
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        max-width: 400px;
    `;
    alert.innerHTML = `
        <span>${icons[type] || icons.success}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);
}

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

// Export functions that might be needed globally
window.openFolder = openFolder;
window.navigateToRoot = navigateToRoot;
window.shareItemFromContext = shareItemFromContext;
window.openFileUpload = function() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.click();
};
// ============================================
// DOWNLOAD PROGRESS MODAL
// ============================================

function showDownloadProgressModal(fileCount, folderCount) {
    let modal = document.getElementById('downloadProgressModal');
    if (modal) modal.remove();
    
    const totalItems = fileCount + folderCount;
    
    modal = document.createElement('div');
    modal.id = 'downloadProgressModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-dialog" style="max-width:400px;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">📥 Downloading Files</h3>
                </div>
                <div class="modal-body" style="padding:30px 20px;">
                    <div style="text-align:center;margin-bottom:20px;">
                        <div style="font-size:48px;margin-bottom:10px;">📦</div>
                        <p style="color:#6b7280;font-size:14px;">
                            ${fileCount} file(s)${folderCount > 0 ? ` + ${folderCount} folder(s)` : ''}
                        </p>
                    </div>
                    
                    <div style="background:#f3f4f6;border-radius:12px;height:8px;overflow:hidden;margin-bottom:10px;">
                        <div id="downloadProgressBar" style="
                            background:linear-gradient(90deg,#6366f1,#8b5cf6);
                            height:100%;
                            width:0%;
                            transition:width 0.3s ease;
                        "></div>
                    </div>
                    
                    <p style="text-align:center;color:#6b7280;font-size:13px;" id="downloadProgressText">
                        0 / ${totalItems} items
                    </p>
                    
                    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:10px;">
                        ℹ️ Please don't close this page
                    </p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function updateDownloadProgress(current, total) {
    const progressBar = document.getElementById('downloadProgressBar');
    const progressText = document.getElementById('downloadProgressText');
    
    if (progressBar && progressText) {
        const percentage = Math.round((current / total) * 100);
        progressBar.style.width = percentage + '%';
        progressText.textContent = `${current} / ${total} items`;
    }
}

function closeDownloadProgressModal() {
    const modal = document.getElementById('downloadProgressModal');
    if (modal) modal.remove();
}

// Copy text to clipboard helper
async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return Promise.resolve();
        } catch (err) {
            return fallbackCopyTextToClipboard(text);
        }
    } else {
        return fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return Promise.resolve();
    } catch (err) {
        document.body.removeChild(textArea);
        return Promise.reject(err);
    }
}
// ============================================
// BULK OPERATIONS (FIXED)
// ============================================

async function downloadSelected() {
    if (selectedItems.length === 0) return;
    log('Downloading selected:', selectedItems);
    
    for (const item of selectedItems) {
        if (item.type === 'file') {
            downloadItem(parseInt(item.id), 'file');
        } else {
            showAlert('Folder download coming soon!', 'warning');
        }
    }
}

function shareSelected() {
    if (selectedItems.length === 0) return;
    
    // Share first selected item
    const item = selectedItems[0];
    shareItemFromContext(parseInt(item.id), item.type);
}

async function deleteSelected() {
    if (selectedItems.length === 0) return;
    
    const count = selectedItems.length;
    if (!confirm(`Delete ${count} selected item${count > 1 ? 's' : ''}?\n\nItems will be moved to trash.`)) {
        return;
    }
    
    log('Deleting selected:', selectedItems);
    
    let deleted = 0;
    let failed = 0;
    
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
                deleted++;
            } else {
                failed++;
                console.error('Delete failed:', item.name, data.message);
            }
        } catch (error) {
            failed++;
            console.error('Delete error:', item.name, error);
        }
    }
    
    // Show result
    if (failed === 0) {
        showAlert(`${deleted} item${deleted > 1 ? 's' : ''} moved to trash!`, 'success');
    } else {
        showAlert(`Deleted ${deleted}, failed ${failed}`, 'warning');
    }
    
    clearSelection();
    loadFilesAndFolders(currentFolderId);
}

console.log('✅ Dashboard with folder sharing loaded');
