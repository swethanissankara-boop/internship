/* ============================================
   CLOUDSHARE - TRASH OPERATIONS
   ============================================ */

// ============================================
// TRASH STATE
// ============================================

let trashItems = [];
let selectedTrashItems = [];
let deleteTargetId = null;

// ============================================
// LOAD TRASH ITEMS
// ============================================

async function loadTrashItems() {
    log('Loading trash items...');
    
    try {
        // In real app, call API
        // const response = await apiGet('/trash');
        
        // Demo data
        trashItems = [
            {
                id: 1,
                type: 'folder',
                name: 'Old Projects',
                size: 134217728,
                items_count: 25,
                deleted_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                auto_delete_in: 25
            },
            {
                id: 2,
                type: 'file',
                name: 'old_report.pdf',
                size: 2415919,
                deleted_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
                auto_delete_in: 15
            },
            {
                id: 3,
                type: 'file',
                name: 'vacation.jpg',
                size: 1572864,
                deleted_at: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
                auto_delete_in: 2
            }
        ];
        
        renderTrashItems();
        
    } catch (error) {
        logError('Error loading trash:', error);
    }
}

// ============================================
// RENDER TRASH ITEMS
// ============================================

function renderTrashItems() {
    const container = document.getElementById('trashContainer');
    if (!container) return;
    
    if (trashItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state" id="emptyState">
                <div class="empty-icon">🗑️</div>
                <h3>Trash is empty</h3>
                <p>Items you delete will appear here for 30 days</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    trashItems.forEach(item => {
        const isExpiringSoon = item.auto_delete_in <= 3;
        const icon = item.type === 'folder' ? '📁' : getFileIcon(item.name);
        const deletedDate = formatDate(item.deleted_at);
        
        html += `
            <div class="trash-card ${isExpiringSoon ? 'expiring-soon' : ''}" data-id="${item.id}">
                <div class="trash-checkbox">
                    <input type="checkbox" onchange="updateTrashSelection()">
                </div>
                <div class="trash-icon">${icon}</div>
                <div class="trash-content">
                    <h4 class="trash-name">${item.name}</h4>
                    <p class="trash-meta">
                        Deleted: ${deletedDate} • 
                        ${item.type === 'folder' ? item.items_count + ' items • ' : ''}
                        ${formatFileSize(item.size)}
                    </p>
                    <p class="trash-expiry ${isExpiringSoon ? 'warning' : ''}">
                        ${isExpiringSoon ? '⚠️ ' : ''}Auto-delete in: 
                        <span class="expiry-days">${item.auto_delete_in} days</span>
                    </p>
                </div>
                <div class="trash-actions">
                    <button class="btn btn-sm" onclick="restoreItem(${item.id})">
                        ↩️ Restore
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteForever(${item.id})">
                        🗑️ Delete Forever
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Update trash size
    updateTrashSize();
}

// ============================================
// UPDATE TRASH SIZE
// ============================================

function updateTrashSize() {
    const totalSize = trashItems.reduce((sum, item) => sum + item.size, 0);
    const trashSizeEl = document.getElementById('trashSize');
    if (trashSizeEl) {
        trashSizeEl.textContent = formatFileSize(totalSize);
    }
}

// ============================================
// SELECTION
// ============================================

function updateTrashSelection() {
    const checkboxes = document.querySelectorAll('.trash-card input[type="checkbox"]:checked');
    selectedTrashItems = Array.from(checkboxes).map(cb => {
        return parseInt(cb.closest('.trash-card').dataset.id);
    });
    
    // Update buttons
    const restoreBtn = document.getElementById('restoreSelectedBtn');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    
    if (restoreBtn) restoreBtn.disabled = selectedTrashItems.length === 0;
    if (deleteBtn) deleteBtn.disabled = selectedTrashItems.length === 0;
}

// ============================================
// RESTORE OPERATIONS
// ============================================

async function restoreItem(itemId) {
    log('Restoring item:', itemId);
    
    try {
        // In real app, call API
        // await apiPost(`/trash/${itemId}/restore`);
        
        // Demo: Remove from trash
        trashItems = trashItems.filter(item => item.id !== itemId);
        renderTrashItems();
        
        alert('Item restored successfully!');
        
    } catch (error) {
        logError('Error restoring item:', error);
        alert('Failed to restore item');
    }
}

async function restoreSelected() {
    if (selectedTrashItems.length === 0) return;
    
    log('Restoring selected items:', selectedTrashItems);
    
    try {
        // In real app, call API for each
        // for (const id of selectedTrashItems) {
        //     await apiPost(`/trash/${id}/restore`);
        // }
        
        // Demo: Remove from trash
        trashItems = trashItems.filter(item => !selectedTrashItems.includes(item.id));
        selectedTrashItems = [];
        renderTrashItems();
        
        alert('Selected items restored successfully!');
        
    } catch (error) {
        logError('Error restoring items:', error);
        alert('Failed to restore items');
    }
}

// ============================================
// DELETE OPERATIONS
// ============================================

function deleteForever(itemId) {
    deleteTargetId = itemId;
    
    const item = trashItems.find(i => i.id === itemId);
    const message = `Are you sure you want to permanently delete "${item?.name || 'this item'}"? This action cannot be undone.`;
    
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmDeleteModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmDeleteModal').style.display = 'none';
    deleteTargetId = null;
}

async function confirmDelete() {
    if (!deleteTargetId) return;
    
    log('Permanently deleting:', deleteTargetId);
    
    try {
        // In real app, call API
        // await apiDelete(`/trash/${deleteTargetId}`);
        
        // Demo: Remove from trash
        trashItems = trashItems.filter(item => item.id !== deleteTargetId);
        renderTrashItems();
        
        closeConfirmModal();
        alert('Item permanently deleted!');
        
    } catch (error) {
        logError('Error deleting item:', error);
        alert('Failed to delete item');
    }
}

async function deleteSelectedPermanently() {
    if (selectedTrashItems.length === 0) return;
    
    if (!confirm(`Permanently delete ${selectedTrashItems.length} items? This cannot be undone.`)) {
        return;
    }
    
    log('Permanently deleting selected:', selectedTrashItems);
    
    try {
        // In real app, call API for each
        // for (const id of selectedTrashItems) {
        //     await apiDelete(`/trash/${id}`);
        // }
        
        // Demo: Remove from trash
        trashItems = trashItems.filter(item => !selectedTrashItems.includes(item.id));
        selectedTrashItems = [];
        renderTrashItems();
        
        alert('Selected items permanently deleted!');
        
    } catch (error) {
        logError('Error deleting items:', error);
        alert('Failed to delete items');
    }
}

async function emptyTrash() {
    if (trashItems.length === 0) {
        alert('Trash is already empty');
        return;
    }
    
    if (!confirm('Permanently delete all items in trash? This cannot be undone.')) {
        return;
    }
    
    log('Emptying trash...');
    
    try {
        // In real app, call API
        // await apiDelete('/trash/empty');
        
        // Demo: Clear all
        trashItems = [];
        selectedTrashItems = [];
        renderTrashItems();
        
        alert('Trash emptied successfully!');
        
    } catch (error) {
        logError('Error emptying trash:', error);
        alert('Failed to empty trash');
    }
}