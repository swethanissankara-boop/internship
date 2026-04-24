let uploadQueue = [];
let isUploading = false;
let currentUploadXHR = null;
let folderStructure = {};
let isUploadPanelMinimized = false;
let pendingFolderUpload = null;

function getApiBase() {
    const hostname = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return port ? `${protocol}//localhost:${port}` : `${protocol}//localhost`;
    }
    return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
}

function openFileUpload() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.value = '';
        fileInput.click();
    }
}

function openFolderUpload() {
    const folderInput = document.getElementById('folderInput');
    if (folderInput) {
        folderInput.value = '';
        folderInput.click();
    }
}

async function checkFileDuplicates(filenames, folderId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBase()}/api/files/check-exists-batch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: filenames, folder_id: folderId })
        });
        if (response.ok) {
            const data = await response.json();
            return data.duplicates || [];
        }
        return [];
    } catch (error) {
        console.error('Error checking file duplicates:', error);
        return [];
    }
}

async function checkFolderExists(folderName, parentId) {
    try {
        const token = localStorage.getItem('token');
        let url = `${getApiBase()}/api/folders/check-exists?name=${encodeURIComponent(folderName)}`;
        if (parentId) url += `&parent_id=${parentId}`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
            return await response.json();
        }
        return { exists: false };
    } catch (error) {
        console.error('Error checking folder:', error);
        return { exists: false };
    }
}

async function handleFileSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    console.log('Selected files:', filesArray.length);
    event.target.value = '';
    showUploadPanel();
    showCheckingStatus();
    const currentFolder = typeof currentFolderId !== 'undefined' ? currentFolderId : null;
    const filenames = filesArray.map(f => f.name);
    const duplicates = await checkFileDuplicates(filenames, currentFolder);
    for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        const isDuplicate = duplicates.some(d => d.filename === file.name);
        const existingFile = duplicates.find(d => d.filename === file.name);
        addToUploadQueue(file, currentFolder, file.name, 'file', isDuplicate, existingFile);
    }
    updateUploadUI();
    processUploadQueue();
}

async function handleFolderSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const filesArray = Array.from(files);
    console.log('Selected folder with', filesArray.length, 'files');
    event.target.value = '';
    const firstFilePath = filesArray[0].webkitRelativePath;
    const rootFolderName = firstFilePath.split('/')[0];
    const currentParentId = typeof currentFolderId !== 'undefined' ? currentFolderId : null;
    console.log('Root folder:', rootFolderName);
    const folderCheck = await checkFolderExists(rootFolderName, currentParentId);
    if (folderCheck.exists) {
        pendingFolderUpload = {
            filesArray: filesArray,
            rootFolderName: rootFolderName,
            currentParentId: currentParentId,
            existingFolder: folderCheck.existing_folder
        };
        showFolderDuplicateDialog(rootFolderName, folderCheck.existing_folder);
    } else {
        await processFolderUpload(filesArray, rootFolderName, currentParentId, null);
    }
}

function showFolderDuplicateDialog(folderName, existingFolder) {
    const existingDialog = document.getElementById('folderDuplicateModal');
    if (existingDialog) existingDialog.remove();
    const modal = document.createElement('div');
    modal.id = 'folderDuplicateModal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10001; backdrop-filter: blur(5px);`;
    modal.innerHTML = `
        <style>
            @keyframes modalIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
            .folder-dup-btn { transition: all 0.2s; cursor: pointer; }
            .folder-dup-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.2); }
        </style>
        <div style="background: white; border-radius: 20px; max-width: 450px; width: 95%; box-shadow: 0 25px 60px rgba(0,0,0,0.4); overflow: hidden; animation: modalIn 0.25s ease;">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 20px 24px; color: white;">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">📁</div>
                    <div>
                        <h3 style="margin: 0; font-size: 18px; font-weight: 700;">Folder Already Exists</h3>
                        <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">What would you like to do?</p>
                    </div>
                </div>
            </div>
            <div style="padding: 24px;">
                <div style="background: #fffbeb; border: 2px solid #fcd34d; border-radius: 12px; padding: 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 36px;">📁</span>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; font-size: 16px; color: #1f2937;">${folderName}</div>
                        <div style="font-size: 12px; color: #6b7280;">This folder already exists in the current location</div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px;">
                    <button class="folder-dup-btn" onclick="handleFolderDuplicateChoice('replace')" style="flex: 1; padding: 14px 16px; background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-size: 18px;">🔄</span> Replace
                    </button>
                    <button class="folder-dup-btn" onclick="handleFolderDuplicateChoice('keep_both')" style="flex: 1; padding: 14px 16px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span style="font-size: 18px;">📁</span> Keep Both
                    </button>
                </div>
                <button onclick="cancelFolderUpload()" style="width: 100%; margin-top: 12px; padding: 12px; background: #f3f4f6; color: #4b5563; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;">Cancel</button>
                <div style="margin-top: 16px; padding: 12px; background: #f3f4f6; border-radius: 8px; font-size: 12px; color: #6b7280;">
                    <strong>Replace:</strong> Delete existing folder and upload new one<br>
                    <strong>Keep Both:</strong> Create new folder with different name
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function cancelFolderUpload() {
    const modal = document.getElementById('folderDuplicateModal');
    if (modal) modal.remove();
    pendingFolderUpload = null;
    showNotification('Upload cancelled', 'info');
}

async function handleFolderDuplicateChoice(choice) {
    const modal = document.getElementById('folderDuplicateModal');
    if (modal) modal.remove();
    if (!pendingFolderUpload) {
        console.error('No pending folder upload!');
        showNotification('Error: No pending upload', 'error');
        return;
    }
    const { filesArray, rootFolderName, currentParentId, existingFolder } = pendingFolderUpload;
    console.log('Processing choice:', choice);
    showUploadPanel();
    if (choice === 'replace') {
        if (existingFolder && existingFolder.id) {
            showProcessingStatus('Deleting existing folder...');
            try {
                const token = localStorage.getItem('token');
                const response = await fetch(`${getApiBase()}/api/folders/${existingFolder.id}/complete`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const result = await response.json();
                console.log('Delete result:', result);
                if (!result.success) {
                    showNotification('Failed to delete existing folder', 'error');
                    pendingFolderUpload = null;
                    return;
                }
            } catch (error) {
                console.error('Error deleting existing folder:', error);
                showNotification('Error deleting folder: ' + error.message, 'error');
                pendingFolderUpload = null;
                return;
            }
        }
        await processFolderUpload(filesArray, rootFolderName, currentParentId, null);
    } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const newFolderName = `${rootFolderName} (${timestamp})`;
        console.log('Creating with new name:', newFolderName);
        await processFolderUpload(filesArray, rootFolderName, currentParentId, newFolderName);
    }
    pendingFolderUpload = null;
}

async function processFolderUpload(filesArray, originalRootName, currentParentId, newRootName) {
    console.log('Processing folder upload...');
    showUploadPanel();
    showProcessingStatus('Creating folder structure...');
    try {
        const folderTree = buildFolderTree(filesArray, originalRootName, newRootName);
        console.log('Folder tree:', Object.keys(folderTree));
        folderStructure = {};
        await createFolderStructure(folderTree, currentParentId);
        console.log('Created folders:', folderStructure);
        uploadQueue = [];
        for (let i = 0; i < filesArray.length; i++) {
            const file = filesArray[i];
            let filePath = file.webkitRelativePath;
            if (newRootName) {
                const parts = filePath.split('/');
                parts[0] = newRootName;
                filePath = parts.join('/');
            }
            const pathParts = filePath.split('/');
            pathParts.pop();
            const folderPath = pathParts.join('/');
            const folderId = folderStructure[folderPath] || currentParentId;
            addToUploadQueue(file, folderId, filePath, 'file', false, null);
        }
        console.log('Upload queue:', uploadQueue.length, 'files');
        updateUploadUI();
        processUploadQueue();
    } catch (error) {
        console.error('Folder upload error:', error);
        showNotification('Failed to upload folder: ' + error.message, 'error');
        closeUploadPanel();
    }
}

function showCheckingStatus() {
    const uploadList = document.getElementById('uploadList');
    if (uploadList) {
        uploadList.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #6b7280;">
                <div style="width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #667eea; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 15px;"></div>
                <p style="font-weight: 500;">Checking for duplicates...</p>
            </div>
        `;
    }
}

function showProcessingStatus(message) {
    const uploadList = document.getElementById('uploadList');
    if (uploadList) {
        uploadList.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #6b7280;">
                <div style="width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #667eea; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 15px;"></div>
                <p style="font-weight: 500;">${message}</p>
            </div>
        `;
    }
}

function buildFolderTree(filesArray, originalRootName, newRootName) {
    const tree = {};
    for (let i = 0; i < filesArray.length; i++) {
        let filePath = filesArray[i].webkitRelativePath;
        if (!filePath) continue;
        if (newRootName) {
            const parts = filePath.split('/');
            parts[0] = newRootName;
            filePath = parts.join('/');
        }
        const pathParts = filePath.split('/');
        pathParts.pop();
        let currentPath = '';
        pathParts.forEach((folderName, index) => {
            if (!folderName) return;
            const parentPath = currentPath;
            currentPath = currentPath ? currentPath + '/' + folderName : folderName;
            if (!tree[currentPath]) {
                tree[currentPath] = { name: folderName, path: currentPath, parentPath: parentPath || null, level: index };
            }
        });
    }
    return tree;
}

async function createFolderStructure(folderTree, rootParentId) {
    const sortedFolders = Object.values(folderTree).sort((a, b) => a.level - b.level);
    console.log('Creating', sortedFolders.length, 'folders...');
    for (const folder of sortedFolders) {
        try {
            let parentId = rootParentId;
            if (folder.parentPath && folderStructure[folder.parentPath]) {
                parentId = folderStructure[folder.parentPath];
            }
            const folderId = await createFolderOnServer(folder.name, parentId);
            if (folderId) {
                folderStructure[folder.path] = folderId;
                console.log(`Created: ${folder.path} → ID: ${folderId}`);
            }
        } catch (error) {
            console.error('Error creating folder:', folder.name, error);
        }
    }
}

async function createFolderOnServer(folderName, parentId = null) {
    try {
        if (!folderName || !folderName.trim()) return null;
        const token = localStorage.getItem('token');
        const response = await fetch(`${getApiBase()}/api/folders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName.trim(), parent_id: parentId })
        });
        const data = await response.json();
        if (data.success && data.folder) return data.folder.id;
        console.error('Server error:', data.message);
        return null;
    } catch (error) {
        console.error('Create folder error:', error);
        return null;
    }
}

function addToUploadQueue(file, folderId, displayPath, itemType, isDuplicate, existingFile) {
    uploadQueue.push({
        id: 'upload_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        file: file,
        name: file ? file.name : displayPath,
        displayPath: displayPath,
        size: file ? file.size : 0,
        progress: 0,
        status: 'pending',
        folderId: folderId,
        xhr: null,
        itemType: itemType,
        isDuplicate: isDuplicate,
        existingFile: existingFile,
        duplicateAction: null,
        startTime: null,
        bytesUploaded: 0,
        totalBytes: file ? file.size : 0,
        uploadSpeed: 0,
        timeRemaining: 0,
        timeElapsed: 0,
        speedHistory: []
    });
}

function removeFromQueue(uploadId) {
    const item = uploadQueue.find(i => i.id === uploadId);
    if (!item) return;
    if (item.status === 'uploading' && item.xhr) {
        item.xhr.abort();
        isUploading = false;
    }
    uploadQueue = uploadQueue.filter(i => i.id !== uploadId);
    console.log('Removed from queue:', item.name, 'Remaining:', uploadQueue.length);
    if (uploadQueue.length === 0) {
        closeUploadPanel();
        showNotification('All files removed from queue', 'info');
        return;
    }
    updateUploadUI();
    if (!isUploading) {
        processUploadQueue();
    }
}

async function processUploadQueue() {
    if (isUploading) return;
    const pendingUpload = uploadQueue.find(item => item.status === 'pending' && item.itemType === 'file');
    if (!pendingUpload) {
        checkAllCompleted();
        return;
    }
    if (pendingUpload.isDuplicate && !pendingUpload.duplicateAction) {
        showFileDuplicateDialog(pendingUpload);
        return;
    }
    isUploading = true;
    pendingUpload.status = 'uploading';
    pendingUpload.startTime = Date.now();
    updateUploadUI();
    try {
        await uploadFileToServer(pendingUpload, pendingUpload.duplicateAction || 'upload');
        pendingUpload.status = 'completed';
        pendingUpload.progress = 100;
        pendingUpload.timeElapsed = (Date.now() - pendingUpload.startTime) / 1000;
        console.log('Uploaded:', pendingUpload.name);
    } catch (error) {
        if (error.message === 'Cancelled') {
            pendingUpload.status = 'cancelled';
        } else {
            pendingUpload.status = 'failed';
            pendingUpload.error = error.message;
        }
        console.error('Failed:', pendingUpload.name, error);
    }
    isUploading = false;
    updateUploadUI();
    processUploadQueue();
}

function checkAllCompleted() {
    const allDone = uploadQueue.every(item => item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled');
    if (allDone && uploadQueue.length > 0) {
        const completed = uploadQueue.filter(i => i.status === 'completed').length;
        const failed = uploadQueue.filter(i => i.status === 'failed').length;
        const cancelled = uploadQueue.filter(i => i.status === 'cancelled').length;
        console.log(`Upload complete: ${completed} success, ${failed} failed, ${cancelled} cancelled`);
        setTimeout(() => {
            closeUploadPanel();
            if (failed === 0 && cancelled === 0) {
                showNotification(`✅ Uploaded ${completed} file${completed !== 1 ? 's' : ''} successfully!`, 'success');
            } else if (completed > 0) {
                showNotification(`Uploaded ${completed}, ${failed} failed, ${cancelled} cancelled`, 'warning');
            } else {
                showNotification('Upload cancelled', 'info');
            }
            if (typeof loadFilesAndFolders === 'function') {
                loadFilesAndFolders(typeof currentFolderId !== 'undefined' ? currentFolderId : null);
            }
        }, 1500);
    }
}

function showFileDuplicateDialog(uploadItem) {
    const existingDialog = document.getElementById('fileDuplicateModal');
    if (existingDialog) existingDialog.remove();
    const modal = document.createElement('div');
    modal.id = 'fileDuplicateModal';
    modal.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10001;`;
    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; max-width: 420px; width: 95%; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 18px 22px; color: white;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">⚠️</span>
                    <div><h3 style="margin: 0; font-size: 16px;">File Already Exists</h3></div>
                </div>
            </div>
            <div style="padding: 20px;">
                <div style="background: #f3f4f6; border-radius: 10px; padding: 12px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 28px;">${getFileIcon(uploadItem.name)}</span>
                    <div>
                        <div style="font-weight: 600; font-size: 14px;">${uploadItem.name}</div>
                        <div style="font-size: 11px; color: #6b7280;">${formatFileSize(uploadItem.size)}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="handleFileDuplicateChoice('replace')" style="flex: 1; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">🔄 Replace</button>
                    <button onclick="handleFileDuplicateChoice('keep_both')" style="flex: 1; padding: 12px; background: #10b981; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">📄 Keep Both</button>
                </div>
                <button onclick="handleFileDuplicateChoice('skip')" style="width: 100%; margin-top: 10px; padding: 10px; background: #f3f4f6; color: #4b5563; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">⏭️ Skip</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    window._currentFileDuplicateItem = uploadItem;
}

function handleFileDuplicateChoice(choice) {
    const modal = document.getElementById('fileDuplicateModal');
    if (modal) modal.remove();
    const uploadItem = window._currentFileDuplicateItem;
    if (uploadItem) {
        if (choice === 'skip') {
            uploadItem.status = 'cancelled';
            uploadItem.error = 'Skipped';
        } else {
            uploadItem.duplicateAction = choice;
        }
    }
    processUploadQueue();
}

function uploadFileToServer(uploadItem, action) {
    return new Promise((resolve, reject) => {
        if (!uploadItem.file) { resolve({ success: true }); return; }
        const formData = new FormData();
        formData.append('file', uploadItem.file);
        if (uploadItem.folderId) {
            formData.append('folder_id', uploadItem.folderId);
        } else if (typeof currentFolderId !== 'undefined' && currentFolderId) {
            formData.append('folder_id', currentFolderId);
        }
        if (uploadItem.isDuplicate && action) {
            formData.append('duplicate_action', action);
        }
        const xhr = new XMLHttpRequest();
        uploadItem.xhr = xhr;
        const startTime = Date.now();
        uploadItem.startTime = startTime;
        uploadItem.speedHistory = [];
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const currentTime = Date.now();
                const elapsedSeconds = (currentTime - startTime) / 1000;
                uploadItem.progress = Math.round((e.loaded / e.total) * 100);
                uploadItem.bytesUploaded = e.loaded;
                uploadItem.totalBytes = e.total;
                uploadItem.timeElapsed = elapsedSeconds;
                if (elapsedSeconds > 0) {
                    const currentSpeed = e.loaded / elapsedSeconds;
                    uploadItem.speedHistory.push(currentSpeed);
                    if (uploadItem.speedHistory.length > 5) uploadItem.speedHistory.shift();
                    const avgSpeed = uploadItem.speedHistory.reduce((a, b) => a + b, 0) / uploadItem.speedHistory.length;
                    uploadItem.uploadSpeed = avgSpeed;
                    const bytesRemaining = e.total - e.loaded;
                    if (avgSpeed > 0) uploadItem.timeRemaining = bytesRemaining / avgSpeed;
                }
                updateUploadUI();
            }
        });
        xhr.addEventListener('load', () => {
            uploadItem.timeElapsed = (Date.now() - startTime) / 1000;
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        if (response.storage) updateStorageDisplay(response.storage);
                        resolve(response);
                    } else {
                        reject(new Error(response.message || 'Upload failed'));
                    }
                } catch (e) {
                    reject(new Error('Invalid response'));
                }
            } else {
                reject(new Error(`HTTP ${xhr.status}`));
            }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Cancelled')));
        const token = localStorage.getItem('token');
        xhr.open('POST', `${getApiBase()}/api/files/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
    });
}

function showUploadPanel() {
    let panel = document.getElementById('uploadPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'uploadPanel';
        panel.style.cssText = `position: fixed; bottom: 20px; right: 20px; width: 420px; max-height: 520px; background: white; border-radius: 16px; box-shadow: 0 10px 50px rgba(0,0,0,0.25); z-index: 9999; display: flex; flex-direction: column; overflow: hidden;`;
        panel.innerHTML = `
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            <div id="uploadPanelHeader" onclick="toggleUploadPanel()" style="padding: 14px 18px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-radius: 16px 16px 0 0;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px;">📤</span>
                    <div>
                        <div style="font-weight: 700; font-size: 14px;">Uploading</div>
                        <div id="uploadSummary" style="font-size: 11px; opacity: 0.9;"></div>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button onclick="event.stopPropagation(); toggleUploadPanel()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 28px; height: 28px; border-radius: 6px; cursor: pointer;"><span id="minimizeIcon">−</span></button>
                    <button onclick="event.stopPropagation(); closeUploadPanel()" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 28px; height: 28px; border-radius: 6px; cursor: pointer;">✕</button>
                </div>
            </div>
            <div id="uploadPanelBody" style="padding: 12px; overflow-y: auto; max-height: 380px;">
                <div id="uploadList"></div>
            </div>
            <div id="uploadPanelFooter" style="padding: 12px 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; background: #f9fafb; border-radius: 0 0 16px 16px;">
                <div style="flex: 1; margin-right: 12px;">
                    <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden;">
                        <div id="overallProgressBar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width 0.3s;"></div>
                    </div>
                    <div id="overallStats" style="font-size: 10px; color: #6b7280; margin-top: 4px;"></div>
                </div>
                <button onclick="cancelAllUploads()" style="padding: 8px 14px; background: #fee2e2; color: #991b1b; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">Cancel All</button>
            </div>
        `;
        document.body.appendChild(panel);
    }
    panel.style.display = 'flex';
    isUploadPanelMinimized = false;
    updateUploadUI();
}

function toggleUploadPanel() {
    const body = document.getElementById('uploadPanelBody');
    const footer = document.getElementById('uploadPanelFooter');
    const icon = document.getElementById('minimizeIcon');
    isUploadPanelMinimized = !isUploadPanelMinimized;
    body.style.display = isUploadPanelMinimized ? 'none' : 'block';
    footer.style.display = isUploadPanelMinimized ? 'none' : 'flex';
    icon.textContent = isUploadPanelMinimized ? '□' : '−';
}

function closeUploadPanel() {
    const panel = document.getElementById('uploadPanel');
    if (panel) panel.style.display = 'none';
    uploadQueue = [];
    folderStructure = {};
    if (typeof loadFilesAndFolders === 'function') {
        loadFilesAndFolders(typeof currentFolderId !== 'undefined' ? currentFolderId : null);
    }
}

function updateUploadUI() {
    const uploadList = document.getElementById('uploadList');
    const uploadSummary = document.getElementById('uploadSummary');
    const overallProgressBar = document.getElementById('overallProgressBar');
    const overallStats = document.getElementById('overallStats');
    if (!uploadList) return;
    if (uploadQueue.length === 0) {
        uploadList.innerHTML = '<div style="text-align: center; padding: 25px; color: #6b7280;">📂 No files in queue</div>';
        if (uploadSummary) uploadSummary.textContent = '';
        if (overallProgressBar) overallProgressBar.style.width = '0%';
        if (overallStats) overallStats.textContent = '';
        return;
    }
    const completed = uploadQueue.filter(i => i.status === 'completed').length;
    const failed = uploadQueue.filter(i => i.status === 'failed').length;
    const cancelled = uploadQueue.filter(i => i.status === 'cancelled').length;
    const total = uploadQueue.length;
    const activeItems = uploadQueue.filter(i => i.status !== 'cancelled');
    const totalBytes = activeItems.reduce((sum, item) => sum + (item.totalBytes || item.size || 0), 0);
    const uploadedBytes = activeItems.reduce((sum, item) => {
        if (item.status === 'completed') return sum + (item.totalBytes || item.size || 0);
        if (item.status === 'uploading') return sum + (item.bytesUploaded || 0);
        return sum;
    }, 0);
    const uploadingItems = uploadQueue.filter(i => i.status === 'uploading');
    let currentSpeed = 0;
    let maxTimeRemaining = 0;
    uploadingItems.forEach(item => {
        if (item.uploadSpeed > 0) currentSpeed = item.uploadSpeed;
        if (item.timeRemaining > maxTimeRemaining) maxTimeRemaining = item.timeRemaining;
    });
    const pendingItems = uploadQueue.filter(i => i.status === 'pending');
    if (currentSpeed > 0 && pendingItems.length > 0) {
        const pendingBytes = pendingItems.reduce((sum, item) => sum + (item.size || 0), 0);
        maxTimeRemaining += pendingBytes / currentSpeed;
    }
    if (uploadSummary) {
        let summaryParts = [`${completed}/${total - cancelled} files`];
        if (currentSpeed > 0) summaryParts.push(formatSpeed(currentSpeed));
        if (maxTimeRemaining > 0 && maxTimeRemaining < 86400) summaryParts.push(`${formatTime(maxTimeRemaining)} left`);
        uploadSummary.textContent = summaryParts.join(' • ');
    }
    if (overallProgressBar) {
        const overallProgress = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;
        overallProgressBar.style.width = overallProgress + '%';
    }
    if (overallStats) {
        overallStats.textContent = `${formatFileSize(uploadedBytes)} / ${formatFileSize(totalBytes)}`;
    }
    uploadList.innerHTML = uploadQueue.map(item => {
        const statusColors = { pending: '#f9fafb', uploading: '#eff6ff', completed: '#f0fdf4', failed: '#fef2f2', cancelled: '#f9fafb' };
        const borderColors = { pending: '#d1d5db', uploading: '#3b82f6', completed: '#10b981', failed: '#ef4444', cancelled: '#9ca3af' };
        const statusIcons = { pending: '⏳', uploading: '📤', completed: '✅', failed: '❌', cancelled: '⏭️' };
        let statusText = '';
        if (item.status === 'uploading') {
            const parts = [];
            if (item.bytesUploaded && item.totalBytes) parts.push(`${formatFileSize(item.bytesUploaded)} / ${formatFileSize(item.totalBytes)}`);
            if (item.uploadSpeed > 0) parts.push(formatSpeed(item.uploadSpeed));
            if (item.timeRemaining > 0 && item.timeRemaining < 86400) parts.push(`⏱️ ${formatTime(item.timeRemaining)}`);
            statusText = parts.join(' • ') || 'Starting...';
        } else if (item.status === 'completed') {
            statusText = item.timeElapsed > 0 ? `✅ Done in ${formatTime(item.timeElapsed)}` : '✅ Completed';
        } else if (item.status === 'pending') {
            statusText = 'Waiting in queue...';
        } else if (item.status === 'failed') {
            statusText = `❌ ${item.error || 'Failed'}`;
        } else if (item.status === 'cancelled') {
            statusText = '⏭️ Skipped';
        }
        const canRemove = item.status === 'pending' || item.status === 'uploading';
        const showRemove = item.status !== 'completed';
        return `
            <div style="background: ${statusColors[item.status]}; border: 1px solid ${borderColors[item.status]}; border-left: 4px solid ${borderColors[item.status]}; border-radius: 10px; padding: 12px; margin-bottom: 10px; ${item.status === 'cancelled' ? 'opacity: 0.6;' : ''}">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <span style="font-size: 26px;">${getFileIcon(item.name)}</span>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</div>
                        <div style="font-size: 11px; color: #6b7280;">${formatFileSize(item.size)}</div>
                    </div>
                    <span style="font-size: 18px;">${statusIcons[item.status]}</span>
                    ${showRemove ? `
                        <button onclick="event.stopPropagation(); removeFromQueue('${item.id}')" title="${canRemove ? 'Remove from queue' : 'Dismiss'}" style="
                            width: 28px; height: 28px; border-radius: 6px; border: none; cursor: pointer;
                            display: flex; align-items: center; justify-content: center; font-size: 14px;
                            background: ${canRemove ? '#fee2e2' : '#f3f4f6'}; color: ${canRemove ? '#dc2626' : '#9ca3af'};
                            transition: all 0.2s;
                        " onmouseover="this.style.background='${canRemove ? '#fecaca' : '#e5e7eb'}'; this.style.transform='scale(1.1)'" onmouseout="this.style.background='${canRemove ? '#fee2e2' : '#f3f4f6'}'; this.style.transform='scale(1)'">✕</button>
                    ` : ''}
                </div>
                ${item.status !== 'cancelled' ? `
                    <div style="height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
                        <div style="height: 100%; width: ${item.progress}%; background: linear-gradient(90deg, ${borderColors[item.status]}, ${item.status === 'uploading' ? '#60a5fa' : borderColors[item.status]}); transition: width 0.3s ease; ${item.status === 'uploading' ? 'animation: progressPulse 1.5s ease-in-out infinite;' : ''}"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
                        <span style="color: #6b7280;">${statusText}</span>
                        <span style="font-weight: 700; color: ${borderColors[item.status]};">${item.progress}%</span>
                    </div>
                ` : `
                    <div style="font-size: 11px; color: #9ca3af;">${statusText}</div>
                `}
            </div>
        `;
    }).join('');
    if (!document.getElementById('uploadAnimStyle')) {
        const style = document.createElement('style');
        style.id = 'uploadAnimStyle';
        style.textContent = `@keyframes progressPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }`;
        document.head.appendChild(style);
    }
}

function cancelAllUploads() {
    if (uploadQueue.some(i => i.status === 'uploading')) {
        if (!confirm('Cancel all uploads?')) return;
    }
    uploadQueue.forEach(item => { if (item.xhr) item.xhr.abort(); });
    uploadQueue = [];
    folderStructure = {};
    isUploading = false;
    closeUploadPanel();
}

function updateStorageDisplay(storage) {
    if (!storage) return;
    const used = storage.used || 0;
    const quota = storage.quota || 107374182400;
    const pct = Math.round((used / quota) * 100);
    const el = id => document.getElementById(id);
    if (el('storageUsed')) el('storageUsed').textContent = formatFileSize(used);
    if (el('storageTotal')) el('storageTotal').textContent = formatFileSize(quota);
    if (el('storageBarFill')) el('storageBarFill').style.width = pct + '%';
    if (el('usedGB')) el('usedGB').textContent = formatFileSize(used);
    if (el('totalGB')) el('totalGB').textContent = formatFileSize(quota);
    if (el('freeGB')) el('freeGB').textContent = formatFileSize(quota - used);
    if (el('storageBarLarge')) el('storageBarLarge').style.width = pct + '%';
}

function getFileIcon(name) {
    if (!name) return '📄';
    const ext = name.split('.').pop().toLowerCase();
    const icons = { pdf: '📕', doc: '📘', docx: '📘', txt: '📝', xls: '📊', xlsx: '📊', csv: '📊', ppt: '📙', pptx: '📙', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🎞️', svg: '🎨', webp: '🖼️', mp4: '🎬', avi: '🎬', mov: '🎬', mkv: '🎬', webm: '🎬', mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵', zip: '📦', rar: '📦', '7z': '📦', tar: '📦', js: '⚡', html: '🌐', css: '🎨', json: '📋', py: '🐍', java: '☕', php: '🐘', rb: '💎', go: '🔵', rs: '🦀' };
    return icons[ext] || '📄';
}

function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime(seconds) {
    if (!seconds || seconds <= 0) return '0s';
    if (!isFinite(seconds)) return 'calculating...';
    seconds = Math.round(seconds);
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function showNotification(message, type = 'success') {
    document.querySelectorAll('.upload-notification').forEach(n => n.remove());
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const notification = document.createElement('div');
    notification.className = 'upload-notification';
    notification.style.cssText = `position: fixed; top: 80px; right: 20px; background: white; padding: 14px 18px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 12px; min-width: 300px; max-width: 400px; z-index: 10000; border-left: 4px solid ${colors[type]}; animation: slideIn 0.3s ease;`;
    notification.innerHTML = `
        <span style="font-size: 22px;">${icons[type]}</span>
        <span style="flex: 1; font-weight: 500; color: #1f2937;">${message}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #9ca3af;">✕</button>
    `;
    if (!document.getElementById('slideInStyle')) {
        const style = document.createElement('style');
        style.id = 'slideInStyle';
        style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
        document.head.appendChild(style);
    }
    document.body.appendChild(notification);
    setTimeout(() => { if (notification.parentElement) notification.remove(); }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    let dropOverlay = document.getElementById('dropOverlay');
    if (!dropOverlay) {
        dropOverlay = document.createElement('div');
        dropOverlay.id = 'dropOverlay';
        dropOverlay.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 70px; margin-bottom: 16px;">📂</div>
                <h2 style="color: white; font-size: 22px;">Drop files here</h2>
                <p style="color: rgba(255,255,255,0.8);">Release to upload</p>
            </div>
        `;
        dropOverlay.style.cssText = `position: fixed; inset: 0; background: rgba(102,126,234,0.95); display: none; align-items: center; justify-content: center; z-index: 9998;`;
        document.body.appendChild(dropOverlay);
    }
    let dragCounter = 0;
    document.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; dropOverlay.style.display = 'flex'; });
    document.addEventListener('dragleave', e => { e.preventDefault(); dragCounter--; if (dragCounter === 0) dropOverlay.style.display = 'none'; });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', async e => {
        e.preventDefault();
        dragCounter = 0;
        dropOverlay.style.display = 'none';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const filesArray = Array.from(files);
            showUploadPanel();
            const currentFolder = typeof currentFolderId !== 'undefined' ? currentFolderId : null;
            const filenames = filesArray.map(f => f.name);
            const duplicates = await checkFileDuplicates(filenames, currentFolder);
            for (const file of filesArray) {
                const isDuplicate = duplicates.some(d => d.filename === file.name);
                const existingFile = duplicates.find(d => d.filename === file.name);
                addToUploadQueue(file, currentFolder, file.name, 'file', isDuplicate, existingFile);
            }
            updateUploadUI();
            processUploadQueue();
        }
    });
});

console.log('Upload module loaded with remove button support!');
