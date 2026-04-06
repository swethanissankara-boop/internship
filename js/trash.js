/* ============================================
   CLOUDSHARE - TRASH OPERATIONS (FIXED)
   ============================================ */

// ============================================
// TRASH STATE
// ============================================

let trashItems = [];
let selectedTrashItems = [];
let deleteTargetId = null;
let deleteTargetType = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Trash] Page loaded');
    
    // Check authentication
    if (!checkAuth()) {
        return;
    }
    
    // Load user info in navbar
    loadUserInfo();
    
    // Load trash items
    await loadTrashItems();
    
    // Setup event listeners
    setupTrashEventListeners();
});

function setupTrashEventListeners() {
    // Select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.trash-item-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateTrashSelection();
        });
    }
    
    // Close modal on click outside
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeConfirmModal();
            }
        });
    }
}

// ============================================
// LOAD TRASH ITEMS
// ============================================

async function loadTrashItems() {
    console.log('[Trash] Loading trash items...');
    
    const loadingEl = document.getElementById('loadingSpinner');
    const containerEl = document.getElementById('trashContainer');
    const emptyEl = document.getElementById('emptyState');
    
    try {
        // Show loading
        if (loadingEl) loadingEl.style.display = 'flex';
        if (containerEl) containerEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        
        // Get trash items from API
        const response = await apiGet('/files/trash/items');
        
        console.log('[Trash] API Response:', response);
        
        if (response.success) {
            // Handle both direct array and nested array from stored procedure
            if (Array.isArray(response.items)) {
                trashItems = response.items;
            } else if (Array.isArray(response.items?.[0])) {
                trashItems = response.items[0];
            } else {
                trashItems = [];
            }
            
            console.log('[Trash] Loaded items:', trashItems.length);
            renderTrashItems();
        } else {
            throw new Error(response.message || 'Failed to load trash items');
        }
        
    } catch (error) {
        console.error('[Trash] Error loading:', error);
        showNotification('Failed to load trash items: ' + error.message, 'error');
        
        // Show error state
        if (containerEl) {
            containerEl.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Error Loading Trash</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="loadTrashItems()">Try Again</button>
                </div>
            `;
            containerEl.style.display = 'block';
        }
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// ============================================
// RENDER TRASH ITEMS
// ============================================

function renderTrashItems() {
    const containerEl = document.getElementById('trashContainer');
    const emptyEl = document.getElementById('emptyState');
    const bulkActionsEl = document.getElementById('bulkActionsBar');
    const emptyTrashBtn = document.getElementById('emptyTrashBtn');
    
    // Handle empty state
    if (!trashItems || trashItems.length === 0) {
        if (containerEl) containerEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (bulkActionsEl) bulkActionsEl.style.display = 'none';
        if (emptyTrashBtn) emptyTrashBtn.disabled = true;
        updateTrashStats();
        return;
    }
    
    // Show container, hide empty state
    if (containerEl) containerEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (bulkActionsEl) bulkActionsEl.style.display = 'flex';
    if (emptyTrashBtn) emptyTrashBtn.disabled = false;
    
    // Render items
    let html = '';
    
    trashItems.forEach(item => {
        const daysLeft = item.days_until_deletion || 30;
        const isExpiringSoon = daysLeft <= 3;
        const icon = item.item_type === 'folder' ? '📁' : getFileIcon(item.original_name || 'file');
        const deletedDate = formatDate(item.deleted_at);
        const size = item.size ? formatFileSize(item.size) : '0 B';
        const itemName = item.original_name || 'Unknown';
        
        html += `
            <div class="trash-item ${isExpiringSoon ? 'expiring-soon' : ''}" data-trash-id="${item.trash_id}" data-item-type="${item.item_type}">
                <div class="trash-item-select">
                    <input type="checkbox" class="trash-item-checkbox" onchange="updateTrashSelection()">
                </div>
                
                <div class="trash-item-icon">${icon}</div>
                
                <div class="trash-item-info">
                    <div class="trash-item-name" title="${escapeHtml(itemName)}">${escapeHtml(itemName)}</div>
                    <div class="trash-item-meta">
                        <span class="meta-type">${item.item_type === 'folder' ? '📂 Folder' : '📄 File'}</span>
                        <span class="meta-separator">•</span>
                        <span class="meta-size">${size}</span>
                        <span class="meta-separator">•</span>
                        <span class="meta-date">Deleted ${deletedDate}</span>
                    </div>
                    <div class="trash-item-expiry ${isExpiringSoon ? 'expiry-warning' : ''}">
                        ${isExpiringSoon ? '⚠️' : '⏰'} 
                        Auto-delete in <strong>${daysLeft}</strong> day${daysLeft !== 1 ? 's' : ''}
                    </div>
                </div>
                
                <div class="trash-item-actions">
                    <button class="btn btn-success btn-sm" onclick="restoreItem(${item.trash_id}, '${item.item_type}')" title="Restore">
                        <span class="btn-icon">↩️</span>
                        <span class="btn-label">Restore</span>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="confirmDeleteItem(${item.trash_id}, '${item.item_type}', '${escapeHtml(itemName)}')" title="Delete Forever">
                        <span class="btn-icon">🗑️</span>
                        <span class="btn-label">Delete</span>
                    </button>
                </div>
            </div>
        `;
    });
    
    containerEl.innerHTML = html;
    
    // Update statistics
    updateTrashStats();
}

// ============================================
// UPDATE TRASH STATISTICS
// ============================================

function updateTrashStats() {
    const totalItems = trashItems.length;
    const totalSize = trashItems.reduce((sum, item) => sum + (parseInt(item.size) || 0), 0);
    const totalFiles = trashItems.filter(item => item.item_type === 'file').length;
    const totalFolders = trashItems.filter(item => item.item_type === 'folder').length;
    const expiringSoon = trashItems.filter(item => (item.days_until_deletion || 30) <= 3).length;
    
    // Update elements
    const trashSizeEl = document.getElementById('trashSize');
    const itemCountEl = document.getElementById('trashItemCount');
    const expiringWarningEl = document.getElementById('expiringWarning');
    
    if (trashSizeEl) {
        trashSizeEl.textContent = formatFileSize(totalSize);
    }
    
    if (itemCountEl) {
        let countText = [];
        if (totalFiles > 0) countText.push(`${totalFiles} file${totalFiles > 1 ? 's' : ''}`);
        if (totalFolders > 0) countText.push(`${totalFolders} folder${totalFolders > 1 ? 's' : ''}`);
        itemCountEl.textContent = countText.length > 0 ? countText.join(', ') : 'No items';
    }
    
    if (expiringWarningEl) {
        if (expiringSoon > 0) {
            expiringWarningEl.innerHTML = `⚠️ <strong>${expiringSoon}</strong> item${expiringSoon > 1 ? 's' : ''} will be permanently deleted within 3 days`;
            expiringWarningEl.style.display = 'flex';
        } else {
            expiringWarningEl.style.display = 'none';
        }
    }
}

// ============================================
// SELECTION HANDLING
// ============================================

function updateTrashSelection() {
    const checkboxes = document.querySelectorAll('.trash-item-checkbox:checked');
    selectedTrashItems = Array.from(checkboxes).map(cb => {
        const card = cb.closest('.trash-item');
        return {
            trash_id: parseInt(card.dataset.trashId),
            item_type: card.dataset.itemType
        };
    });
    
    const hasSelection = selectedTrashItems.length > 0;
    const totalItems = document.querySelectorAll('.trash-item-checkbox').length;
    
    // Update buttons
    const restoreBtn = document.getElementById('restoreSelectedBtn');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    
    if (restoreBtn) {
        restoreBtn.disabled = !hasSelection;
        restoreBtn.innerHTML = hasSelection 
            ? `↩️ Restore (${selectedTrashItems.length})`
            : '↩️ Restore Selected';
    }
    
    if (deleteBtn) {
        deleteBtn.disabled = !hasSelection;
        deleteBtn.innerHTML = hasSelection 
            ? `🗑️ Delete (${selectedTrashItems.length})`
            : '🗑️ Delete Selected';
    }
    
    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = totalItems > 0 && checkboxes.length === totalItems;
        selectAllCheckbox.indeterminate = checkboxes.length > 0 && checkboxes.length < totalItems;
    }
}

// ============================================
// RESTORE OPERATIONS
// ============================================

async function restoreItem(trashId, itemType) {
    console.log('[Trash] Restoring item:', trashId, itemType);
    
    try {
        showNotification('Restoring item...', 'info');
        
        const response = await apiPost(`/files/trash/${trashId}/restore`);
        
        if (response.success) {
            // Remove from local array
            trashItems = trashItems.filter(item => item.trash_id !== trashId);
            renderTrashItems();
            showNotification('Item restored successfully!', 'success');
        } else {
            throw new Error(response.message || 'Failed to restore item');
        }
        
    } catch (error) {
        console.error('[Trash] Restore error:', error);
        showNotification('Failed to restore: ' + error.message, 'error');
    }
}

async function restoreSelected() {
    if (selectedTrashItems.length === 0) {
        showNotification('No items selected', 'warning');
        return;
    }
    
    console.log('[Trash] Restoring selected items:', selectedTrashItems.length);
    
    try {
        showNotification(`Restoring ${selectedTrashItems.length} items...`, 'info');
        
        let restored = 0;
        let failed = 0;
        
        for (const item of selectedTrashItems) {
            try {
                const response = await apiPost(`/files/trash/${item.trash_id}/restore`);
                if (response.success) {
                    restored++;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error('[Trash] Error restoring item:', error);
                failed++;
            }
        }
        
        // Reload trash
        selectedTrashItems = [];
        await loadTrashItems();
        
        if (failed === 0) {
            showNotification(`Successfully restored ${restored} items!`, 'success');
        } else {
            showNotification(`Restored ${restored}, failed ${failed}`, 'warning');
        }
        
    } catch (error) {
        console.error('[Trash] Restore selected error:', error);
        showNotification('Failed to restore items', 'error');
    }
}

// ============================================
// DELETE OPERATIONS
// ============================================

function confirmDeleteItem(trashId, itemType, itemName) {
    deleteTargetId = trashId;
    deleteTargetType = itemType;
    
    const messageEl = document.getElementById('confirmMessage');
    if (messageEl) {
        messageEl.innerHTML = `
            Are you sure you want to <strong>permanently delete</strong> 
            "<strong>${itemName}</strong>"?<br><br>
            <span style="color: #dc3545;">⚠️ This action cannot be undone!</span>
        `;
    }
    
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) {
        modal.style.display = 'none';
    }
    deleteTargetId = null;
    deleteTargetType = null;
}

async function confirmPermanentDelete() {
    if (!deleteTargetId) return;
    
    console.log('[Trash] Permanently deleting:', deleteTargetId);
    
    try {
        showNotification('Deleting permanently...', 'info');
        
        const response = await apiDelete(`/files/trash/${deleteTargetId}/permanent`);
        
        if (response.success) {
            trashItems = trashItems.filter(item => item.trash_id !== deleteTargetId);
            renderTrashItems();
            closeConfirmModal();
            
            const freedMsg = response.freed_space ? ` (freed ${formatFileSize(response.freed_space)})` : '';
            showNotification('Item permanently deleted!' + freedMsg, 'success');
        } else {
            throw new Error(response.message || 'Failed to delete item');
        }
        
    } catch (error) {
        console.error('[Trash] Delete error:', error);
        showNotification('Failed to delete: ' + error.message, 'error');
    }
}

async function deleteSelectedPermanently() {
    if (selectedTrashItems.length === 0) {
        showNotification('No items selected', 'warning');
        return;
    }
    
    const count = selectedTrashItems.length;
    if (!confirm(`Permanently delete ${count} item${count > 1 ? 's' : ''}?\n\nThis cannot be undone!`)) {
        return;
    }
    
    console.log('[Trash] Deleting selected items:', count);
    
    try {
        showNotification(`Deleting ${count} items...`, 'info');
        
        let deleted = 0;
        let failed = 0;
        let totalFreed = 0;
        
        for (const item of selectedTrashItems) {
            try {
                const response = await apiDelete(`/files/trash/${item.trash_id}/permanent`);
                if (response.success) {
                    deleted++;
                    totalFreed += response.freed_space || 0;
                } else {
                    failed++;
                }
            } catch (error) {
                console.error('[Trash] Error deleting item:', error);
                failed++;
            }
        }
        
        // Reload trash
        selectedTrashItems = [];
        await loadTrashItems();
        
        const freedMsg = totalFreed > 0 ? ` (freed ${formatFileSize(totalFreed)})` : '';
        if (failed === 0) {
            showNotification(`Deleted ${deleted} items!${freedMsg}`, 'success');
        } else {
            showNotification(`Deleted ${deleted}, failed ${failed}${freedMsg}`, 'warning');
        }
        
    } catch (error) {
        console.error('[Trash] Delete selected error:', error);
        showNotification('Failed to delete items', 'error');
    }
}

async function emptyTrash() {
    if (trashItems.length === 0) {
        showNotification('Trash is already empty', 'info');
        return;
    }
    
    const count = trashItems.length;
    const totalSize = trashItems.reduce((sum, item) => sum + (parseInt(item.size) || 0), 0);
    
    if (!confirm(`Permanently delete ALL ${count} items in trash?\n\nTotal size: ${formatFileSize(totalSize)}\n\nThis cannot be undone!`)) {
        return;
    }
    
    console.log('[Trash] Emptying trash...');
    
    try {
        showNotification('Emptying trash...', 'info');
        
        const response = await apiPost('/files/trash/empty');
        
        if (response.success) {
            trashItems = [];
            selectedTrashItems = [];
            renderTrashItems();
            
            const freedMsg = response.freed_space ? ` (freed ${formatFileSize(response.freed_space)})` : '';
            showNotification(`Trash emptied! Deleted ${response.deleted_count || count} items${freedMsg}`, 'success');
        } else {
            throw new Error(response.message || 'Failed to empty trash');
        }
        
    } catch (error) {
        console.error('[Trash] Empty trash error:', error);
        showNotification('Failed to empty trash: ' + error.message, 'error');
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
