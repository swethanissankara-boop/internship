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
    
    // Authentication already checked in dashboard.html
    // No redirect here to prevent loops
    
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
        // Update user name in topbar
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
    
    // Dynamic API URL
    const apiBase = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : `http://${window.location.hostname}:5000`;
    
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
                 data-name="${folder.name}"
                 onclick="handleItemClick(event, ${folder.id}, 'folder')"
                 ondblclick="openFolder(${folder.id})"
                 oncontextmenu="showContextMenu(event, ${folder.id}, 'folder')">
                <div class="file-icon">📁</div>
                <div class="file-name">${folder.name}</div>
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
                 data-name="${fileName}"
                 onclick="handleItemClick(event, ${file.id}, 'file')"
                 ondblclick="previewFile(${file.id})"
                 oncontextmenu="showContextMenu(event, ${file.id}, 'file')">
                <div class="file-icon">${icon}</div>
                <div class="file-name">${fileName}</div>
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
    
    // Save folder name before loading (folders array will be overwritten)
    const folder = folders.find(f => f.id === folderId);
    const folderName = folder ? folder.name : 'Folder';
    
    // Load files and folders inside this folder
    loadFilesAndFolders(folderId);
    
    // Update breadcrumb
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
    
    // Position the menu
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

function contextAction(action) {
    if (!contextMenuTarget) return;
    
    const { id, type } = contextMenuTarget;
    
    log('Context action:', action, { id, type });
    
    switch (action) {
        case 'open':
            if (type === 'folder') openFolder(id);
            else previewFile(id);
            break;
        case 'preview':
            previewFile(id);
            break;
        case 'download':
            downloadItem(id, type);
            break;
        case 'share':
            openShareModal(id, type);
            break;
        case 'copy':
            copyItem(id, type);
            break;
        case 'move':
            moveItem(id, type);
            break;
        case 'favorite':
            toggleFavorite(id, type);
            break;
        case 'rename':
            renameItem(id, type);
            break;
        case 'delete':
            deleteItem(id, type);
            break;
        case 'properties':
            showProperties(id, type);
            break;
    }
    
    hideContextMenu();
}

// ============================================
// FILE OPERATIONS
// ============================================

function previewFile(fileId) {
    log('Preview file:', fileId);
    const file = files.find(f => f.id === fileId);
    if (file) {
        alert(`Preview: ${file.original_name || file.filename}\n\n(Preview functionality will be implemented with backend)`);
    }
}

function downloadItem(itemId, itemType) {
    log('Download item:', { itemId, itemType });
    
    if (itemType === 'file') {
        const apiBase = window.location.hostname === 'localhost' 
            ? 'http://localhost:5000' 
            : `http://${window.location.hostname}:5000`;
        
        const token = localStorage.getItem('token');
        window.location.href = `${apiBase}/api/files/${itemId}/download?token=${token}`;
    } else {
        alert('Folder download will be implemented soon');
    }
}

function copyItem(itemId, itemType) {
    log('Copy item:', { itemId, itemType });
    alert('Item copied to clipboard');
}

function moveItem(itemId, itemType) {
    log('Move item:', { itemId, itemType });
    alert('Select destination folder\n\n(Move functionality will be implemented)');
}

function toggleFavorite(itemId, itemType) {
    log('Toggle favorite:', { itemId, itemType });
    alert('Added to favorites!');
}

function renameItem(itemId, itemType) {
    log('Rename item:', { itemId, itemType });
    
    let currentName = '';
    if (itemType === 'folder') {
        const folder = folders.find(f => f.id === itemId);
        if (folder) currentName = folder.name;
    } else {
        const file = files.find(f => f.id === itemId);
        if (file) currentName = file.original_name || file.filename;
    }
    
    const newName = prompt('Enter new name:', currentName);
    if (newName && newName !== currentName) {
        alert(`Renamed to: ${newName}\n\n(Rename will be saved to backend)`);
    }
}

// ============================================
// DELETE ITEM (REAL API)
// ============================================

async function deleteItem(itemId, itemType) {
    log('Delete item:', { itemId, itemType });
    
    if (!confirm('Are you sure you want to move this item to trash?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        
        // Dynamic API URL
        const apiBase = window.location.hostname === 'localhost' 
            ? 'http://localhost:5000' 
            : `http://${window.location.hostname}:5000`;
        
        const endpoint = itemType === 'folder' 
            ? `${apiBase}/api/folders/${itemId}`
            : `${apiBase}/api/files/${itemId}`;
        
        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Item moved to trash', 'success');
            loadFilesAndFolders(currentFolderId);
        } else {
            showAlert(data.message || 'Failed to delete item', 'error');
        }
        
    } catch (error) {
        logError('Delete item error', error);
        showAlert('Failed to delete item', 'error');
    }
}

function showProperties(itemId, itemType) {
    log('Show properties:', { itemId, itemType });
    
    let item;
    if (itemType === 'folder') {
        item = folders.find(f => f.id === itemId);
    } else {
        item = files.find(f => f.id === itemId);
    }
    
    if (item) {
        const name = item.name || item.original_name || item.filename;
        const size = item.size || 0;
        alert(`Properties:\n\nName: ${name}\nSize: ${formatFileSize(size)}\nType: ${itemType}`);
    }
}

// ============================================
// CREATE NEW FOLDER (REAL API)
// ============================================

async function createNewFolder() {
    const folderName = prompt('Enter folder name:');
    
    if (!folderName || !folderName.trim()) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        
        // Dynamic API URL
        const apiBase = window.location.hostname === 'localhost' 
            ? 'http://localhost:5000' 
            : `http://${window.location.hostname}:5000`;
        
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
    
    // Update button states
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    
    if (gridBtn && listBtn) {
        gridBtn.classList.toggle('active', view === 'grid');
        listBtn.classList.toggle('active', view === 'list');
    }
    
    // Update file grid class
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
    
    // Sort files
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
    
    // Filter folders
    const filteredFolders = folders.filter(f => 
        f.name.toLowerCase().includes(searchLower)
    );
    
    // Filter files
    const filteredFiles = files.filter(f => 
        (f.original_name || f.filename).toLowerCase().includes(searchLower)
    );
    
    // Temporarily update and render
    const originalFolders = folders;
    const originalFiles = files;
    
    folders = filteredFolders;
    files = filteredFiles;
    
    renderFilesAndFolders();
    
    // Restore original
    folders = originalFolders;
    files = originalFiles;
    
}, 300);

// ============================================
// SIDEBAR TOGGLE
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

// ============================================
// USER MENU
// ============================================

function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
}

// ============================================
// RECENT & FAVORITES
// ============================================

function showRecent(event) {
    if (event) event.preventDefault();
    log('Showing recent files');
    alert('Recent files view\n\n(Will show recently accessed files)');
}

function showFavorites(event) {
    if (event) event.preventDefault();
    log('Showing favorites');
    alert('Favorites view\n\n(Will show starred files)');
}

// ============================================
// BULK OPERATIONS
// ============================================

function downloadSelected() {
    if (selectedItems.length === 0) return;
    log('Downloading selected:', selectedItems);
    alert(`Downloading ${selectedItems.length} items...`);
}

function shareSelected() {
    if (selectedItems.length === 0) return;
    log('Sharing selected:', selectedItems);
    alert(`Sharing ${selectedItems.length} items...`);
}

function deleteSelected() {
    if (selectedItems.length === 0) return;
    
    if (confirm(`Delete ${selectedItems.length} selected items?`)) {
        log('Deleting selected:', selectedItems);
        alert(`${selectedItems.length} items moved to trash`);
        clearSelection();
        loadFilesAndFolders(currentFolderId);
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupDashboardEvents() {
    // Close context menu on click outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest('.context-menu')) {
            hideContextMenu();
        }
        
        // Close user dropdown
        if (!event.target.closest('.user-menu')) {
            const dropdown = document.getElementById('userDropdown');
            if (dropdown) dropdown.style.display = 'none';
        }
        
        // Close sort menu
        if (!event.target.closest('.dropdown-wrapper')) {
            const sortMenu = document.getElementById('sortMenu');
            if (sortMenu) sortMenu.style.display = 'none';
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        // Delete key
        if (event.key === 'Delete' && selectedItems.length > 0) {
            deleteSelected();
        }
        
        // Escape key - clear selection
        if (event.key === 'Escape') {
            clearSelection();
            hideContextMenu();
        }
        
        // Ctrl/Cmd + A - select all
        if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            event.preventDefault();
            const cards = document.querySelectorAll('.file-card');
            cards.forEach(card => card.classList.add('selected'));
            updateSelection();
        }
    });
}

// ============================================
// SHOW ALERT
// ============================================

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
    
    const alert = document.createElement('div');
    alert.style.cssText = `
        padding: 15px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    alert.innerHTML = `
        <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
        <span style="margin-left: 8px;">${message}</span>
    `;
    
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}
