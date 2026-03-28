/* ============================================
   VSHARE - FILE UPLOAD
   ============================================ */

// ============================================
// UPLOAD STATE
// ============================================

let uploadQueue = [];
let isUploading = false;
let currentUploadXHR = null;

// ============================================
// API BASE URL
// ============================================

function getApiBase() {
    return window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : `http://${window.location.hostname}:5000`;
}

// ============================================
// OPEN FILE/FOLDER DIALOGS
// ============================================

function openFileUpload() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = ''; // Reset input
        fileInput.click();
    }
}

function openFolderUpload() {
    const folderInput = document.getElementById('folderInput');
    if (folderInput) {
        folderInput.value = ''; // Reset input
        folderInput.click();
    }
}

// ============================================
// HANDLE FILE SELECTION
// ============================================

function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) {
        console.log('No files selected');
        return;
    }

    console.log('Selected files:', files.length);

    // Add files to queue
    for (let i = 0; i < files.length; i++) {
        addToUploadQueue(files[i], null);
    }

    // Start upload process
    if (uploadQueue.length > 0) {
        showUploadModal();
        processUploadQueue();
    }

    // Reset input
    event.target.value = '';
}

// ============================================
// HANDLE FOLDER SELECTION
// ============================================

async function handleFolderSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) {
        console.log('No folder selected');
        return;
    }

    console.log('Selected folder with files:', files.length);

    // Get folder name from the first file's path
    const firstFilePath = files[0].webkitRelativePath || files[0].name;
    const pathParts = firstFilePath.split('/');
    const mainFolderName = pathParts[0];

    console.log('Main folder name:', mainFolderName);

    // Show upload modal first
    showUploadModal();
    updateUploadUI();

    try {
        // Create the main folder first
        const folderId = await createFolderForUpload(mainFolderName);

        if (!folderId) {
            showAlert('Failed to create folder', 'error');
            return;
        }

        console.log('Created folder with ID:', folderId);

        // Add all files to queue with the folder ID
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            addToUploadQueue(file, folderId);
        }

        console.log('Added files to queue:', uploadQueue.length);

        // Update UI and start processing
        updateUploadUI();
        processUploadQueue();

    } catch (error) {
        console.error('Error handling folder upload:', error);
        showAlert('Failed to upload folder: ' + error.message, 'error');
    }

    // Reset input
    event.target.value = '';
}

// ============================================
// CREATE FOLDER FOR UPLOAD
// ============================================

async function createFolderForUpload(folderName) {
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
                name: folderName,
                parent_id: typeof currentFolderId !== 'undefined' ? currentFolderId : null
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log('Folder created:', data.folder);
            return data.folder.id;
        } else {
            // If folder already exists, try to find it
            if (data.message && data.message.includes('already exists')) {
                console.log('Folder already exists, finding it...');
                return await findExistingFolder(folderName);
            }
            console.error('Failed to create folder:', data.message);
            return null;
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        return null;
    }
}

// ============================================
// FIND EXISTING FOLDER
// ============================================

async function findExistingFolder(folderName) {
    try {
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();

        const parentId = typeof currentFolderId !== 'undefined' ? currentFolderId : null;
        const url = parentId 
            ? `${apiBase}/api/folders?parent_id=${parentId}`
            : `${apiBase}/api/folders`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success && data.folders) {
            const folder = data.folders.find(f => f.name === folderName);
            if (folder) {
                console.log('Found existing folder:', folder.id);
                return folder.id;
            }
        }

        return null;
    } catch (error) {
        console.error('Error finding folder:', error);
        return null;
    }
}

// ============================================
// UPLOAD QUEUE MANAGEMENT
// ============================================

function addToUploadQueue(file, folderId) {
    const uploadItem = {
        id: generateUploadId(),
        file: file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending', // pending, uploading, completed, failed, paused
        folderId: folderId,
        xhr: null,
        error: null
    };

    uploadQueue.push(uploadItem);
    console.log('Added to queue:', file.name, 'Folder ID:', folderId);
}

function generateUploadId() {
    return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// PROCESS UPLOAD QUEUE
// ============================================

async function processUploadQueue() {
    if (isUploading) {
        console.log('Already uploading, waiting...');
        return;
    }

    const pendingUpload = uploadQueue.find(item => item.status === 'pending');
    if (!pendingUpload) {
        console.log('No pending uploads');
        
        // Check if all uploads completed
        const allCompleted = uploadQueue.every(item => 
            item.status === 'completed' || item.status === 'failed'
        );
        
        if (allCompleted && uploadQueue.length > 0) {
            console.log('All uploads finished!');
            // Refresh file list after all uploads
            setTimeout(() => {
                if (typeof loadFilesAndFolders === 'function') {
                    loadFilesAndFolders(typeof currentFolderId !== 'undefined' ? currentFolderId : null);
                }
            }, 500);
        }
        return;
    }

    isUploading = true;
    pendingUpload.status = 'uploading';
    updateUploadUI();

    try {
        await uploadFile(pendingUpload);
        pendingUpload.status = 'completed';
        pendingUpload.progress = 100;
        console.log('Upload completed:', pendingUpload.name);
    } catch (error) {
        console.error('Upload failed:', pendingUpload.name, error);
        pendingUpload.status = 'failed';
        pendingUpload.error = error.message;
    }

    isUploading = false;
    updateUploadUI();

    // Process next file
    processUploadQueue();
}

// ============================================
// UPLOAD SINGLE FILE
// ============================================

function uploadFile(uploadItem) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', uploadItem.file);

        // Add folder_id if this file belongs to a folder
        if (uploadItem.folderId) {
            formData.append('folder_id', uploadItem.folderId);
        } else if (typeof currentFolderId !== 'undefined' && currentFolderId) {
            formData.append('folder_id', currentFolderId);
        }

        const xhr = new XMLHttpRequest();
        uploadItem.xhr = xhr;
        currentUploadXHR = xhr;

        // Progress event
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                uploadItem.progress = percent;
                updateUploadUI();
            }
        });

        // Load event (success)
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        console.log('Upload success:', uploadItem.name);
                        
                        // Update storage info
                        if (response.storage) {
                            updateStorageDisplay(response.storage);
                        }
                        
                        resolve(response);
                    } else {
                        reject(new Error(response.message || 'Upload failed'));
                    }
                } catch (e) {
                    reject(new Error('Invalid server response'));
                }
            } else {
                reject(new Error(`HTTP Error: ${xhr.status}`));
            }
        });

        // Error event
        xhr.addEventListener('error', () => {
            reject(new Error('Network error'));
        });

        // Abort event
        xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
        });

        // Get auth token
        const token = localStorage.getItem('token');
        const apiBase = getApiBase();

        // Open and send
        xhr.open('POST', `${apiBase}/api/files/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
    });
}

// ============================================
// UPDATE STORAGE DISPLAY
// ============================================

function updateStorageDisplay(storage) {
    if (!storage) return;

    const used = storage.used || 0;
    const quota = storage.quota || 107374182400;
    const percentage = Math.round((used / quota) * 100);

    // Update sidebar
    const storageUsedEl = document.getElementById('storageUsed');
    const storageTotalEl = document.getElementById('storageTotal');
    const storageBarFillEl = document.getElementById('storageBarFill');

    if (storageUsedEl) storageUsedEl.textContent = formatFileSize(used);
    if (storageTotalEl) storageTotalEl.textContent = formatFileSize(quota);
    if (storageBarFillEl) storageBarFillEl.style.width = percentage + '%';

    // Update main area
    const usedGBEl = document.getElementById('usedGB');
    const totalGBEl = document.getElementById('totalGB');
    const freeGBEl = document.getElementById('freeGB');
    const storageBarLargeEl = document.getElementById('storageBarLarge');

    if (usedGBEl) usedGBEl.textContent = formatFileSize(used);
    if (totalGBEl) totalGBEl.textContent = formatFileSize(quota);
    if (freeGBEl) freeGBEl.textContent = formatFileSize(quota - used);
    if (storageBarLargeEl) storageBarLargeEl.style.width = percentage + '%';

    // Update localStorage user
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        user.storage_used = used;
        localStorage.setItem('user', JSON.stringify(user));
    }
}

// ============================================
// UPLOAD MODAL UI
// ============================================

function showUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.style.display = 'flex';
        updateUploadUI();
    }
}

function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Clear completed/failed uploads
    uploadQueue = uploadQueue.filter(item => 
        item.status !== 'completed' && item.status !== 'failed'
    );

    // Refresh file list
    if (typeof loadFilesAndFolders === 'function') {
        loadFilesAndFolders(typeof currentFolderId !== 'undefined' ? currentFolderId : null);
    }
}

function updateUploadUI() {
    const uploadList = document.getElementById('uploadList');
    if (!uploadList) return;

    if (uploadQueue.length === 0) {
        uploadList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
                <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
                <p>No files in upload queue</p>
            </div>
        `;
        return;
    }

    let html = '';

    // Show summary
    const pending = uploadQueue.filter(i => i.status === 'pending').length;
    const uploading = uploadQueue.filter(i => i.status === 'uploading').length;
    const completed = uploadQueue.filter(i => i.status === 'completed').length;
    const failed = uploadQueue.filter(i => i.status === 'failed').length;

    html += `
        <div style="display: flex; gap: 16px; margin-bottom: 20px; padding: 12px; background: #f3f4f6; border-radius: 10px; font-size: 13px;">
            <span>📁 Total: <strong>${uploadQueue.length}</strong></span>
            <span>⏳ Pending: <strong>${pending}</strong></span>
            <span>📤 Uploading: <strong>${uploading}</strong></span>
            <span>✅ Done: <strong>${completed}</strong></span>
            ${failed > 0 ? `<span style="color: #ef4444;">❌ Failed: <strong>${failed}</strong></span>` : ''}
        </div>
    `;

    uploadQueue.forEach(item => {
        const statusIcon = getStatusIcon(item.status);
        const statusColor = getStatusColor(item.status);
        const progressColor = item.status === 'completed' ? '#10b981' : 
                             item.status === 'failed' ? '#ef4444' : '#6366f1';

        html += `
            <div class="upload-item" style="display: flex; align-items: center; gap: 12px; padding: 14px; background: #f9fafb; border-radius: 12px; margin-bottom: 10px; border: 1px solid #e5e7eb;">
                <div style="font-size: 28px;">${getFileIcon(item.name)}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 14px; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                    <div style="font-size: 12px; color: #6b7280;">${formatFileSize(item.size)}</div>
                </div>
                <div style="width: 120px;">
                    <div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-bottom: 4px;">
                        <div style="height: 100%; width: ${item.progress}%; background: ${progressColor}; border-radius: 3px; transition: width 0.3s ease;"></div>
                    </div>
                    <div style="font-size: 11px; color: #6b7280; text-align: center;">${item.progress}%</div>
                </div>
                <div style="font-size: 24px; min-width: 40px; text-align: center;" title="${item.status}">${statusIcon}</div>
                <div style="min-width: 70px;">
                    ${item.status === 'uploading' ? 
                        `<button onclick="pauseUpload('${item.id}')" style="padding: 6px 10px; border: none; background: #fef3c7; color: #92400e; border-radius: 6px; cursor: pointer; font-size: 12px;">⏸️ Pause</button>` : 
                        ''
                    }
                    ${item.status === 'paused' ? 
                        `<button onclick="resumeUpload('${item.id}')" style="padding: 6px 10px; border: none; background: #dbeafe; color: #1e40af; border-radius: 6px; cursor: pointer; font-size: 12px;">▶️ Resume</button>` : 
                        ''
                    }
                    ${item.status === 'failed' ? 
                        `<button onclick="retryUpload('${item.id}')" style="padding: 6px 10px; border: none; background: #fee2e2; color: #991b1b; border-radius: 6px; cursor: pointer; font-size: 12px;">🔄 Retry</button>` : 
                        ''
                    }
                    ${item.status === 'pending' ? 
                        `<button onclick="cancelUpload('${item.id}')" style="padding: 6px 10px; border: none; background: #f3f4f6; color: #4b5563; border-radius: 6px; cursor: pointer; font-size: 12px;">❌</button>` : 
                        ''
                    }
                </div>
            </div>
        `;
    });

    uploadList.innerHTML = html;
}

function getStatusIcon(status) {
    switch (status) {
        case 'pending': return '⏳';
        case 'uploading': return '📤';
        case 'completed': return '✅';
        case 'failed': return '❌';
        case 'paused': return '⏸️';
        default: return '❓';
    }
}

function getStatusColor(status) {
    switch (status) {
        case 'pending': return '#f59e0b';
        case 'uploading': return '#6366f1';
        case 'completed': return '#10b981';
        case 'failed': return '#ef4444';
        case 'paused': return '#6b7280';
        default: return '#6b7280';
    }
}

// ============================================
// UPLOAD CONTROLS
// ============================================

function pauseUpload(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (item && item.xhr) {
        item.xhr.abort();
        item.status = 'paused';
        isUploading = false;
        updateUploadUI();
    }
}

function resumeUpload(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (item) {
        item.status = 'pending';
        item.progress = 0;
        updateUploadUI();
        processUploadQueue();
    }
}

function retryUpload(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (item) {
        item.status = 'pending';
        item.progress = 0;
        item.error = null;
        updateUploadUI();
        processUploadQueue();
    }
}

function cancelUpload(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (item) {
        if (item.xhr) {
            item.xhr.abort();
        }
        uploadQueue = uploadQueue.filter(i => i.id !== uploadId);
        isUploading = false;
        updateUploadUI();
        processUploadQueue();
    }
}

function pauseAllUploads() {
    uploadQueue.forEach(item => {
        if (item.status === 'uploading' && item.xhr) {
            item.xhr.abort();
            item.status = 'paused';
        }
        if (item.status === 'pending') {
            item.status = 'paused';
        }
    });
    isUploading = false;
    updateUploadUI();
}

function cancelAllUploads() {
    uploadQueue.forEach(item => {
        if (item.xhr) {
            item.xhr.abort();
        }
    });
    uploadQueue = [];
    isUploading = false;
    updateUploadUI();
    closeUploadModal();
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getFileIcon(filename) {
    if (!filename) return '📄';
    
    const ext = filename.split('.').pop().toLowerCase();
    
    const iconMap = {
        // Documents
        'pdf': '📕',
        'doc': '📘',
        'docx': '📘',
        'txt': '📝',
        'rtf': '📝',
        
        // Spreadsheets
        'xls': '📊',
        'xlsx': '📊',
        'csv': '📊',
        
        // Presentations
        'ppt': '📙',
        'pptx': '📙',
        
        // Images
        'jpg': '🖼️',
        'jpeg': '🖼️',
        'png': '🖼️',
        'gif': '🎞️',
        'bmp': '🖼️',
        'svg': '🎨',
        'webp': '🖼️',
        'ico': '🖼️',
        
        // Videos
        'mp4': '🎬',
        'avi': '🎬',
        'mov': '🎬',
        'wmv': '🎬',
        'mkv': '🎬',
        'webm': '🎬',
        'flv': '🎬',
        
        // Audio
        'mp3': '🎵',
        'wav': '🎵',
        'ogg': '🎵',
        'flac': '🎵',
        'aac': '🎵',
        
        // Archives
        'zip': '📦',
        'rar': '📦',
        '7z': '📦',
        'tar': '📦',
        'gz': '📦',
        
        // Code
        'html': '💻',
        'css': '🎨',
        'js': '⚡',
        'json': '📋',
        'xml': '📋',
        'php': '🐘',
        'py': '🐍',
        'java': '☕',
        'c': '💻',
        'cpp': '💻',
        'h': '💻',
        
        // Others
        'exe': '⚙️',
        'dll': '⚙️',
        'apk': '📱',
        'iso': '💿'
    };
    
    return iconMap[ext] || '📄';
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================
// DRAG & DROP SUPPORT
// ============================================

function setupDragAndDrop() {
    const fileArea = document.querySelector('.file-area');
    if (!fileArea) return;

    // Create drop overlay
    let dropOverlay = document.getElementById('dropOverlay');
    if (!dropOverlay) {
        dropOverlay = document.createElement('div');
        dropOverlay.id = 'dropOverlay';
        dropOverlay.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 80px; margin-bottom: 20px;">📂</div>
                <h2 style="font-size: 24px; color: #1f2937; margin-bottom: 8px;">Drop files here</h2>
                <p style="color: #6b7280;">Release to upload your files</p>
            </div>
        `;
        dropOverlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(99, 102, 241, 0.95);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            color: white;
        `;
        document.body.appendChild(dropOverlay);
    }

    let dragCounter = 0;

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        dropOverlay.style.display = 'flex';
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            dropOverlay.style.display = 'none';
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropOverlay.style.display = 'none';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                addToUploadQueue(files[i], null);
            }
            showUploadModal();
            processUploadQueue();
        }
    });
}

// Initialize drag & drop
document.addEventListener('DOMContentLoaded', setupDragAndDrop);

// ============================================
// SHOW ALERT (if not defined elsewhere)
// ============================================

if (typeof showAlert !== 'function') {
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
            border-radius: 10px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b'};
            color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease;
        `;
        alert.innerHTML = `
            <span style="font-size: 20px;">${type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}</span>
            <span>${message}</span>
        `;
        
        alertContainer.appendChild(alert);
        
        setTimeout(() => {
            alert.remove();
        }, 4000);
    }
}
