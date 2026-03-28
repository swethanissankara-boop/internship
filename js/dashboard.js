/* ============================================
   CLOUDSHARE - DASHBOARD
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

function initializeDashboard() {
    log('Initializing dashboard...');
    
    // Load user info
    loadUserInfo();
    
    // Load storage info
    loadStorageInfo();
    
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

function loadStorageInfo() {
    const user = getCurrentUser();
    
    if (user) {
        const used = user.storage_used || 0;
        const total = user.storage_quota || 107374182400;
        const percentage = Math.round((used / total) * 100);
        
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

function renderFilesAndFolders() {
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
    
    let html = '';
    
    // Render folders first
    folders.forEach(folder => {
        const itemsCount = (folder.file_count || 0) + (folder.subfolder_count || 0);
        html += `
            <div class="file-card" 
                 data-id="${folder.id}" 
                 data-type="folder" 
                 data-name="${escapeHtml(folder.name)}"
                 onclick="handleItemClick(event, ${folder.id}, 'folder')"
                 ondblclick="openFolder(${folder.id})"
                 oncontextmenu="showContextMenu(event, ${folder.id}, 'folder')">
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
        
        html += `
            <div class="file-card" 
                 data-id="${file.id}" 
                 data-type="file" 
                 data-name="${escapeHtml(fileName)}"
                 onclick="handleItemClick(event, ${file.id}, 'file')"
                 ondblclick="previewFile(${file.id})"
                 oncontextmenu="showContextMenu(event, ${file.id}, 'file')">
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
            openShareModal(itemId, type);
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

function downloadItem(itemId, itemType) {
    log('Download item:', { itemId, itemType });
    
    const id = parseInt(itemId);
    
    if (itemType === 'folder') {
        showAlert('Folder download coming soon!', 'warning');
        return;
    }
    
    const file = files.find(f => parseInt(f.id) === id);
    if (!file) {
        showAlert('File not found', 'error');
        return;
    }
    
    const apiBase = getApiBase();
    const token = localStorage.getItem('token');
    const fileName = file.original_name || file.filename;
    
    const link = document.createElement('a');
    link.href = `${apiBase}/api/files/${id}/download?token=${token}`;
    link.download = fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showAlert(`Downloading: ${fileName}`, 'success');
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

function toggleFavorite(itemId, itemType) {
    log('Toggle favorite:', { itemId, itemType });
    
    const id = parseInt(itemId);
    let itemName = '';
    
    if (itemType === 'folder') {
        const item = folders.find(f => parseInt(f.id) === id);
        itemName = item ? item.name : 'Folder';
    } else {
        const item = files.find(f => parseInt(f.id) === id);
        itemName = item ? (item.original_name || item.filename) : 'File';
    }
    
    showAlert(`⭐ "${itemName}" added to favorites!`, 'success');
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
        ? `Are you sure you want to delete "${itemName}"?\n\n⚠️ All files inside will also be deleted!`
        : `Are you sure you want to delete "${itemName}"?`;
    
    if (!confirm(warningMsg)) {
        return;
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
            showAlert(`"${itemName}" deleted successfully!`, 'success');
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
// SHARE MODAL
// ============================================

function openShareModal(itemId, itemType) {
    log('Open share modal:', { itemId, itemType });
    
    const id = parseInt(itemId);
    let item;
    let itemName = '';
    let itemSize = 0;
    
    if (itemType === 'folder') {
        item = folders.find(f => parseInt(f.id) === id);
        itemName = item ? item.name : 'Folder';
        itemSize = item ? (item.size || 0) : 0;
    } else {
        item = files.find(f => parseInt(f.id) === id);
        itemName = item ? (item.original_name || item.filename) : 'File';
        itemSize = item ? item.size : 0;
    }
    
    if (!item) {
        showAlert('Item not found', 'error');
        return;
    }
    
    const shareItemNameEl = document.getElementById('shareItemName');
    const shareIconEl = document.getElementById('shareIcon');
    const shareNameEl = document.getElementById('shareName');
    const shareMetaEl = document.getElementById('shareMeta');
    
    if (shareItemNameEl) shareItemNameEl.textContent = itemName;
    if (shareIconEl) shareIconEl.textContent = itemType === 'folder' ? '📁' : getFileIcon(itemName);
    if (shareNameEl) shareNameEl.textContent = itemName;
    if (shareMetaEl) shareMetaEl.textContent = formatFileSize(itemSize);
    
    window.currentShareTarget = { id: id, type: itemType, name: itemName };
    
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        shareModal.style.display = 'flex';
    }
}

function closeShareModal() {
    const shareModal = document.getElementById('shareModal');
    if (shareModal) {
        shareModal.style.display = 'none';
    }
    window.currentShareTarget = null;
}

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

async function generateShareLink() {
    if (!window.currentShareTarget) {
        showAlert('No item selected for sharing', 'error');
        return;
    }
    
    const { id, type, name } = window.currentShareTarget;
    
    const permission = document.querySelector('input[name="permission"]:checked')?.value || 'view';
    const requirePassword = document.getElementById('requirePassword')?.checked || false;
    const password = requirePassword ? document.getElementById('sharePassword')?.value : null;
    const setExpiry = document.getElementById('setExpiry')?.checked || false;
    const expiryDays = setExpiry ? parseInt(document.getElementById('expiryDays')?.value) : null;
    const setDownloadLimit = document.getElementById('setDownloadLimit')?.checked || false;
    const maxDownloads = setDownloadLimit ? parseInt(document.getElementById('maxDownloads')?.value) : null;
    
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();
        
        const response = await fetch(`${apiBase}/api/share/link`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_id: type === 'file' ? id : null,
                folder_id: type === 'folder' ? id : null,
                permission: permission,
                password: password,
                expires_days: expiryDays,
                max_downloads: maxDownloads
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            const shareUrl = data.share.url;
            await navigator.clipboard.writeText(shareUrl);
            showAlert('🔗 Share link copied to clipboard!', 'success');
            closeShareModal();
        } else {
            showAlert(data.message || 'Failed to create share link', 'error');
        }
    } catch (error) {
        console.error('Share error:', error);
        showAlert('Failed to create share link', 'error');
    }
}

function addUserShare() {
    const emailInput = document.getElementById('shareUserEmail');
    if (!emailInput) return;
    
    const email = emailInput.value.trim();
    if (!email) {
        showAlert('Please enter an email address', 'error');
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showAlert('Please enter a valid email address', 'error');
        return;
    }
    
    const sharedUsersList = document.getElementById('sharedUsersList');
    if (sharedUsersList) {
        const userDiv = document.createElement('div');
        userDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px;background:#f3f4f6;border-radius:8px;margin-bottom:8px;';
        userDiv.innerHTML = `
            <span>👤 ${escapeHtml(email)}</span>
            <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:16px;">❌</button>
        `;
        sharedUsersList.appendChild(userDiv);
    }
    
    emailInput.value = '';
    showAlert(`Added ${email} to share list`, 'success');
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
                <button onclick="closePropertiesModal();setTimeout(() => openShareModal(${id},'file'),100);" class="btn btn-secondary" style="flex:1;">🔗 Share</button>
            </div>
        ` : `
            <div style="margin-top:24px;display:flex;gap:12px;">
                <button onclick="openFolder(${id});closePropertiesModal();" class="btn btn-primary" style="flex:1;">📂 Open Folder</button>
                <button onclick="closePropertiesModal();setTimeout(() => openShareModal(${id},'folder'),100);" class="btn btn-secondary" style="flex:1;">🔗 Share</button>
            </div>
        `}
    `;
    
    const propertiesContent = document.getElementById('propertiesContent');
    if (propertiesContent) {
        propertiesContent.innerHTML = propertiesHTML;
    }
    
    const propertiesModal = document.getElementById('propertiesModal');
    if (propertiesModal) {
        propertiesModal.style.display = 'flex';
    }
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

function showRecent(event) {
    if (event) event.preventDefault();
    log('Showing recent files');
    showAlert('Recent files view coming soon!', 'info');
}

function showFavorites(event) {
    if (event) event.preventDefault();
    log('Showing favorites');
    showAlert('Favorites view coming soon!', 'info');
}

// ============================================
// BULK OPERATIONS
// ============================================

function downloadSelected() {
    if (selectedItems.length === 0) return;
    log('Downloading selected:', selectedItems);
    showAlert(`Downloading ${selectedItems.length} items...`, 'success');
}

function shareSelected() {
    if (selectedItems.length === 0) return;
    log('Sharing selected:', selectedItems);
    showAlert(`Sharing ${selectedItems.length} items...`, 'success');
}

function deleteSelected() {
    if (selectedItems.length === 0) return;
    
    if (confirm(`Delete ${selectedItems.length} selected items?`)) {
        log('Deleting selected:', selectedItems);
        showAlert(`${selectedItems.length} items moved to trash`, 'success');
        clearSelection();
        loadFilesAndFolders(currentFolderId);
    }
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
    `;
    alert.innerHTML = `
        <span>${icons[type] || icons.success}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

// ============================================
// INITIALIZE ON LOAD
// ============================================

document.addEventListener('DOMContentLoaded', initializeDashboard);
