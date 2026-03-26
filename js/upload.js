/* ============================================
   CLOUDSHARE - FILE UPLOAD
   ============================================ */

// ============================================
// UPLOAD STATE
// ============================================

let uploadQueue = [];
let isUploading = false;
let currentUploadXHR = null;

// ============================================
// OPEN FILE/FOLDER DIALOGS
// ============================================

function openFileUpload() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.click();
    }
}

function openFolderUpload() {
    const folderInput = document.getElementById('folderInput');
    if (folderInput) {
        folderInput.click();
    }
}

// ============================================
// HANDLE FILE SELECTION
// ============================================

function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    console.log('Selected files:', files.length);

    // Add files to queue
    for (let i = 0; i < files.length; i++) {
        addToUploadQueue(files[i]);
    }

    // Start upload process
    showUploadModal();
    processUploadQueue();

    // Reset input
    event.target.value = '';
}

function handleFolderSelect(event) {
    const files = event.target.files;
    if (files.length === 0) return;

    console.log('Selected folder with files:', files.length);

    // Group files by their folder structure
    const folderStructure = new Map();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = file.webkitRelativePath || file.name;
        const pathParts = filePath.split('/');
        
        // Get folder name (first part of path)
        const folderName = pathParts[0];
        
        if (!folderStructure.has(folderName)) {
            folderStructure.set(folderName, {
                name: folderName,
                files: []
            });
        }
        
        folderStructure.get(folderName).files.push({
            file: file,
            relativePath: pathParts.slice(1).join('/') // Path inside folder
        });
    }

    // Upload folder structure
    uploadFolderStructure(folderStructure);

    // Reset input
    event.target.value = '';
}
async function uploadFolderStructure(folderStructure) {
    console.log('Uploading folder structure:', folderStructure);
    
    showUploadModal();
    
    // Process each folder
    for (const [folderName, folderData] of folderStructure) {
        console.log('Processing folder:', folderName);
        
        // Step 1: Create folder in database
        const folderId = await createFolderInDatabase(folderName);
        
        if (!folderId) {
            console.error('Failed to create folder:', folderName);
            continue;
        }
        
        // Step 2: Upload all files in this folder
        for (const fileData of folderData.files) {
            const uploadItem = {
                id: generateUploadId(),
                file: fileData.file,
                name: fileData.file.name,
                size: fileData.file.size,
                progress: 0,
                status: 'pending',
                folderId: folderId, // Associate with folder
                xhr: null
            };
            
            uploadQueue.push(uploadItem);
        }
    }
    
    // Start processing queue
    processUploadQueue();
}
async function createFolderInDatabase(folderName) {
    try {
        const token = localStorage.getItem('token');
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
                name: folderName,
                parent_id: typeof currentFolderId !== 'undefined' ? currentFolderId : null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Folder created:', data.folder);
            return data.folder.id;
        } else {
            console.error('Failed to create folder:', data.message);
            return null;
        }
    } catch (error) {
        console.error('Error creating folder:', error);
        return null;
    }
}

// ============================================
// UPLOAD QUEUE MANAGEMENT
// ============================================

function addToUploadQueue(file) {
    const uploadItem = {
        id: generateUploadId(),
        file: file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending', // pending, uploading, completed, failed, paused
        xhr: null
    };

    uploadQueue.push(uploadItem);
    console.log('Added to queue:', file.name);
}

function generateUploadId() {
    return 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================
// PROCESS UPLOAD QUEUE
// ============================================

// ============================================
// PROCESS UPLOAD QUEUE
// ============================================

async function processUploadQueue() {
    if (isUploading) return;

    const pendingUpload = uploadQueue.find(item => item.status === 'pending');
    
    // When there are no more files left to upload
    if (!pendingUpload) {
        console.log('No pending uploads');
        
        // --- ADDED THIS TO FIX THE ISSUE ---
        // Wait 1.5 seconds so the user sees the "100% Completed" state, then close.
        setTimeout(() => {
            closeUploadModal();
        }, 1500);
        // -----------------------------------
        
        return;
    }

    isUploading = true;
    pendingUpload.status = 'uploading';
    updateUploadUI();

    try {
        await uploadFile(pendingUpload);
        pendingUpload.status = 'completed';
        pendingUpload.progress = 100;
    } catch (error) {
        console.error('Upload failed:', error);
        pendingUpload.status = 'failed';
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

        // Open and send
        xhr.open('POST', 'http://localhost:5000/api/files/upload');
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

    // Clear completed uploads
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
        uploadList.innerHTML = '<p>No files in queue</p>';
        return;
    }

    let html = '';

    uploadQueue.forEach(item => {
        const statusIcon = getStatusIcon(item.status);
        const statusClass = item.status;

        html += `
            <div class="upload-item ${statusClass}" data-id="${item.id}">
                <div class="upload-item-info">
                    <span class="upload-icon">${getFileIcon(item.name)}</span>
                    <div class="upload-details">
                        <div class="upload-name">${item.name}</div>
                        <div class="upload-size">${formatFileSize(item.size)}</div>
                    </div>
                </div>
                <div class="upload-progress-wrapper">
                    <div class="upload-progress-bar">
                        <div class="upload-progress-fill" style="width: ${item.progress}%"></div>
                    </div>
                    <span class="upload-percent">${item.progress}%</span>
                </div>
                <div class="upload-status">
                    <span class="status-icon">${statusIcon}</span>
                </div>
                <div class="upload-actions">
                    ${item.status === 'uploading' ? 
                        `<button class="btn-icon" onclick="pauseUpload('${item.id}')" title="Pause">⏸️</button>` : 
                        ''
                    }
                    ${item.status === 'paused' ? 
                        `<button class="btn-icon" onclick="resumeUpload('${item.id}')" title="Resume">▶️</button>` : 
                        ''
                    }
                    ${item.status === 'failed' ? 
                        `<button class="btn-icon" onclick="retryUpload('${item.id}')" title="Retry">🔄</button>` : 
                        ''
                    }
                    <button class="btn-icon" onclick="cancelUpload('${item.id}')" title="Cancel">❌</button>
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
// DRAG & DROP SUPPORT
// ============================================

function setupDragAndDrop() {
    const fileArea = document.querySelector('.file-area');
    if (!fileArea) return;

    fileArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileArea.classList.add('drag-over');
    });

    fileArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileArea.classList.remove('drag-over');
    });

    fileArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileArea.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                addToUploadQueue(files[i]);
            }
            showUploadModal();
            processUploadQueue();
        }
    });
}

// Initialize drag & drop
document.addEventListener('DOMContentLoaded', setupDragAndDrop);