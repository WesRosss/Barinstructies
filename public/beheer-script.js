// ===== Configuration =====
const config = window.BEHEER_CONFIG || {
    apiBase: '/beheer/api',
    cdnBaseUrl: 'https://cdn.barinstructies.nl',
    useCdn: true
};

// ===== State =====
let state = {
    isAuthenticated: false,
    user: null,
    currentSection: 'upload',
    videos: [],
    allTags: [],
    users: [],
    selectedFile: null,
    uploadProgress: 0,
    isUploading: false
};

// ===== DOM Elements =====
const elements = {
    // Login
    loginSection: document.getElementById('login-section'),
    beheerSection: document.getElementById('beheer-section'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    
    // Header
    userInfo: document.getElementById('user-info'),
    logoutBtn: document.getElementById('logout-btn'),
    menuToggle: document.getElementById('menu-toggle'),
    
    // Sidebar
    sidebar: document.getElementById('sidebar'),
    
    // Sections
    uploadSection: document.getElementById('upload-section'),
    manageSection: document.getElementById('manage-section'),
    settingsSection: document.getElementById('settings-section'),
    
    // Upload Form
    uploadForm: document.getElementById('upload-form'),
    dropZone: document.getElementById('drop-zone'),
    videoFileInput: document.getElementById('video-file'),
    selectFileBtn: document.getElementById('select-file-btn'),
    filePreview: document.getElementById('file-preview'),
    previewFilename: document.getElementById('preview-filename'),
    previewSize: document.getElementById('preview-size'),
    previewVideo: document.getElementById('preview-video'),
    removeFileBtn: document.getElementById('remove-file-btn'),
    videoTitle: document.getElementById('video-title'),
    videoDescription: document.getElementById('video-description'),
    videoTags: document.getElementById('video-tags'),
    tagsContainer: document.getElementById('tags-container'),
    tagsSuggestions: document.getElementById('tags-suggestions'),
    uploadBtn: document.getElementById('upload-btn'),
    uploadBtnText: document.getElementById('upload-btn-text'),
    uploadSpinner: document.getElementById('upload-spinner'),
    cancelUploadBtn: document.getElementById('cancel-upload-btn'),
    uploadProgress: document.getElementById('upload-progress'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    progressPercentage: document.getElementById('progress-percentage'),
    uploadStatus: document.getElementById('upload-status'),
    
    // Manage
    manageSearch: document.getElementById('manage-search'),
    manageTagFilter: document.getElementById('manage-tag-filter'),
    refreshVideosBtn: document.getElementById('refresh-videos-btn'),
    videosList: document.getElementById('videos-list'),
    
    // Settings
    addUserBtn: document.getElementById('add-user-btn'),
    usersList: document.getElementById('users-list'),
    cdnStatus: document.getElementById('cdn-status'),
    thumbnailStatus: document.getElementById('thumbnail-status'),
    compressionStatus: document.getElementById('compression-status'),
    
    // Modals
    videoModal: document.getElementById('video-modal'),
    videoModalBody: document.getElementById('modal-body'),
    userModal: document.getElementById('user-modal'),
    userModalTitle: document.getElementById('user-modal-title'),
    userForm: document.getElementById('user-form'),
    userId: document.getElementById('user-id'),
    userUsername: document.getElementById('user-username'),
    userPassword: document.getElementById('user-password'),
    userRole: document.getElementById('user-role'),
    
    // Toast
    toastContainer: document.getElementById('toast-container')
};

// ===== Utility Functions =====
function showToast(message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = document.createElement('svg');
    icon.className = 'toast-icon';
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    
    let path;
    switch (type) {
        case 'success':
            path = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
            break;
        case 'error':
            path = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
            break;
        default:
            path = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
    }
    icon.innerHTML = path;
    
    const messageEl = document.createElement('span');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener('click', () => toast.remove());
    
    toast.appendChild(icon);
    toast.appendChild(messageEl);
    toast.appendChild(closeBtn);
    
    elements.toastContainer.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
    
    return toast;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function generateId() {
    return 'id-' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Authentication =====
async function login(username, password) {
    try {
        const response = await fetch(`${config.apiBase}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            state.isAuthenticated = true;
            state.user = data.user;
            localStorage.setItem('beheerToken', data.token);
            localStorage.setItem('beheerUser', JSON.stringify(data.user));
            return true;
        } else {
            throw new Error(data.message || 'Aanmelden mislukt');
        }
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

async function logout() {
    try {
        await fetch(`${config.apiBase}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('beheerToken')}`
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        state.isAuthenticated = false;
        state.user = null;
        localStorage.removeItem('beheerToken');
        localStorage.removeItem('beheerUser');
        updateUI();
    }
}

async function checkAuth() {
    const token = localStorage.getItem('beheerToken');
    if (!token) {
        state.isAuthenticated = false;
        return false;
    }
    
    try {
        const response = await fetch(`${config.apiBase}/check-auth`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.authenticated) {
            state.isAuthenticated = true;
            state.user = data.user;
            localStorage.setItem('beheerUser', JSON.stringify(data.user));
            return true;
        } else {
            logout();
            return false;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        logout();
        return false;
    }
}

function getAuthHeaders() {
    const token = localStorage.getItem('beheerToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// ===== UI Updates =====
function updateUI() {
    // Login/Beheer toggle
    if (state.isAuthenticated) {
        elements.loginSection.classList.add('hidden');
        elements.beheerSection.classList.remove('hidden');
        
        // Update user info
        if (state.user) {
            elements.userInfo.textContent = `${state.user.username} (${state.user.role})`;
        }
        
        // Load initial data
        loadVideos();
        loadTags();
        loadUsers();
        loadSettings();
    } else {
        elements.loginSection.classList.remove('hidden');
        elements.beheerSection.classList.add('hidden');
        elements.loginError.classList.add('hidden');
        elements.loginForm.reset();
    }
}

function switchSection(section) {
    state.currentSection = section;
    
    // Hide all sections
    elements.uploadSection.classList.remove('active');
    elements.manageSection.classList.remove('active');
    elements.settingsSection.classList.remove('active');
    
    // Show selected section
    switch (section) {
        case 'upload':
            elements.uploadSection.classList.add('active');
            break;
        case 'manage':
            elements.manageSection.classList.add('active');
            loadVideos();
            break;
        case 'users':
            // Show settings section but focus on users tab
            elements.settingsSection.classList.add('active');
            loadUsers();
            break;
        case 'settings':
            elements.settingsSection.classList.add('active');
            loadUsers();
            loadSettings();
            break;
    }
    
    // Update sidebar
    const sidebarLinks = elements.sidebar.querySelectorAll('a');
    sidebarLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${section}`) {
            link.classList.add('active');
        }
    });
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
        elements.sidebar.classList.add('hidden');
    }
}

// ===== File Upload =====
function handleFileSelect(file) {
    state.selectedFile = file;
    
    // Update preview
    elements.filePreview.classList.remove('hidden');
    elements.dropZone.classList.add('hidden');
    elements.previewFilename.textContent = file.name;
    elements.previewSize.textContent = formatFileSize(file.size);
    
    // Show video preview if possible
    if (file.type.startsWith('video/')) {
        const videoUrl = URL.createObjectURL(file);
        elements.previewVideo.src = videoUrl;
        elements.previewVideo.classList.remove('hidden');
        elements.previewVideo.load();
    }
    
    // Enable upload button
    elements.uploadBtn.disabled = false;
    
    // Validate file size (500MB max)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
        showToast(`Bestand is te groot. Maximaal ${formatFileSize(maxSize)} toegestaan.`, 'error');
        elements.uploadBtn.disabled = true;
    }
}

function clearFileSelection() {
    state.selectedFile = null;
    state.uploadProgress = 0;
    
    elements.filePreview.classList.add('hidden');
    elements.dropZone.classList.remove('hidden');
    elements.previewVideo.classList.add('hidden');
    elements.previewVideo.src = '';
    elements.videoFileInput.value = '';
    elements.uploadBtn.disabled = true;
    elements.uploadProgress.classList.add('hidden');
    elements.uploadStatus.innerHTML = '';
}

async function uploadVideo() {
    if (!state.selectedFile || state.isUploading) return;
    
    const title = elements.videoTitle.value.trim();
    const description = elements.videoDescription.value.trim();
    const tagsInput = elements.videoTags.value.trim();
    
    if (!title) {
        showToast('Vul een titel in', 'error');
        return;
    }
    
    if (!tagsInput) {
        showToast('Voeg minimaal 1 tag toe', 'error');
        return;
    }
    
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    if (tags.length === 0) {
        showToast('Voeg minimaal 1 tag toe', 'error');
        return;
    }
    
    state.isUploading = true;
    elements.uploadBtn.disabled = true;
    elements.uploadProgress.classList.remove('hidden');
    elements.uploadBtnText.textContent = 'Uploaden...';
    elements.uploadSpinner.classList.remove('hidden');
    
    const formData = new FormData();
    formData.append('video', state.selectedFile);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('tags', JSON.stringify(tags));
    
    try {
        const response = await fetch(`${config.apiBase}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('beheerToken')}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Upload mislukt');
        }
        
        const data = await response.json();
        
        // Update progress
        elements.progressText.textContent = 'Video wordt verwerkt...';
        elements.progressPercentage.textContent = '100%';
        elements.progressBar.style.width = '100%';
        
        // Show status
        const statusItems = [
            { text: 'Video geüpload', status: 'success' },
            { text: 'Video gecomprimeerd', status: 'success' },
            { text: 'Thumbnail gegenereerd', status: 'success' },
            { text: 'Bestanden naar CDN gekopieerd', status: 'success' },
            { text: 'Metadata opgeslagen', status: 'success' }
        ];
        
        statusItems.forEach(item => {
            const statusItem = document.createElement('div');
            statusItem.className = 'status-item';
            statusItem.innerHTML = `
                <span class="status-icon ${item.status}">✓</span>
                <span>${item.text}</span>
            `;
            elements.uploadStatus.appendChild(statusItem);
        });
        
        showToast('Video succesvol geüpload en verwerkt!', 'success');
        
        // Clear form
        clearFileSelection();
        elements.uploadForm.reset();
        elements.tagsContainer.innerHTML = '';
        
        // Refresh videos list
        if (state.currentSection === 'manage') {
            loadVideos();
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showToast(error.message || 'Upload mislukt', 'error');
        
        // Show error status
        const statusItem = document.createElement('div');
        statusItem.className = 'status-item';
        statusItem.innerHTML = `
            <span class="status-icon error">✗</span>
            <span>Fout: ${error.message}</span>
        `;
        elements.uploadStatus.appendChild(statusItem);
    } finally {
        state.isUploading = false;
        elements.uploadBtn.disabled = false;
        elements.uploadBtnText.textContent = 'Uploaden';
        elements.uploadSpinner.classList.add('hidden');
    }
}

// ===== Tags Management =====
function updateTagsDisplay() {
    const tagsInput = elements.videoTags.value.trim();
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    elements.tagsContainer.innerHTML = '';
    
    tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.innerHTML = `
            ${escapeHtml(tag)}
            <span class="tag-remove" data-tag="${escapeHtml(tag)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </span>
        `;
        elements.tagsContainer.appendChild(tagEl);
    });
    
    // Add click handlers for remove buttons
    elements.tagsContainer.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tagToRemove = btn.dataset.tag;
            const currentTags = elements.videoTags.value.split(',').map(t => t.trim());
            const newTags = currentTags.filter(tag => tag !== tagToRemove);
            elements.videoTags.value = newTags.join(', ');
            updateTagsDisplay();
        });
    });
}

function showTagSuggestions() {
    const input = elements.videoTags.value.trim().toLowerCase();
    const lastTag = input.split(',').pop().trim();
    
    if (lastTag.length < 2) {
        elements.tagsSuggestions.classList.add('hidden');
        return;
    }
    
    const matchingTags = state.allTags.filter(tag => 
        tag.toLowerCase().includes(lastTag) && 
        !elements.videoTags.value.split(',').map(t => t.trim().toLowerCase()).includes(tag.toLowerCase())
    );
    
    if (matchingTags.length === 0) {
        elements.tagsSuggestions.classList.add('hidden');
        return;
    }
    
    elements.tagsSuggestions.innerHTML = '';
    matchingTags.forEach(tag => {
        const suggestion = document.createElement('div');
        suggestion.className = 'suggestion-item';
        suggestion.textContent = tag;
        suggestion.addEventListener('click', () => {
            const currentValue = elements.videoTags.value;
            const parts = currentValue.split(',').map(t => t.trim());
            parts[parts.length - 1] = tag;
            elements.videoTags.value = parts.join(', ');
            updateTagsDisplay();
            elements.tagsSuggestions.classList.add('hidden');
            elements.videoTags.focus();
        });
        elements.tagsSuggestions.appendChild(suggestion);
    });
    
    elements.tagsSuggestions.classList.remove('hidden');
}

// ===== Video Management =====
async function loadVideos() {
    try {
        const response = await fetch('/api/videos', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('beheerToken')}`
            }
        });
        
        const videos = await response.json();
        state.videos = videos;
        renderVideosList();
    } catch (error) {
        console.error('Error loading videos:', error);
        showToast('Fout bij laden van video\'s', 'error');
    }
}

async function loadTags() {
    try {
        const response = await fetch('/api/tags');
        const tags = await response.json();
        state.allTags = tags;
        
        // Update tag filter in manage section
        updateTagFilter();
    } catch (error) {
        console.error('Error loading tags:', error);
    }
}

function updateTagFilter() {
    elements.manageTagFilter.innerHTML = '<option value="">Alle tags</option>';
    state.allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        elements.manageTagFilter.appendChild(option);
    });
}

function renderVideosList() {
    const searchTerm = elements.manageSearch.value.toLowerCase();
    const selectedTag = elements.manageTagFilter.value;
    
    let filteredVideos = state.videos;
    
    // Filter by search
    if (searchTerm) {
        filteredVideos = filteredVideos.filter(video => 
            video.title.toLowerCase().includes(searchTerm) ||
            video.filename.toLowerCase().includes(searchTerm) ||
            (video.tags && video.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );
    }
    
    // Filter by tag
    if (selectedTag) {
        filteredVideos = filteredVideos.filter(video => 
            video.tags && video.tags.includes(selectedTag)
        );
    }
    
    if (filteredVideos.length === 0) {
        elements.videosList.innerHTML = '<p class="no-results">Geen video\'s gevonden</p>';
        return;
    }
    
    elements.videosList.innerHTML = '';
    
    filteredVideos.forEach(video => {
        const videoItem = document.createElement('div');
        videoItem.className = 'video-item';
        videoItem.dataset.filename = video.filename;
        
        const thumbnailHtml = video.hasThumbnail ? 
            `<img src="${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy">` :
            `<video src="${video.path}" muted playsinline preload="metadata"></video>`;
        
        const tagsHtml = video.tags && video.tags.length > 0 ?
            video.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('') :
            '<span class="tag">Geen tags</span>';
        
        videoItem.innerHTML = `
            <div class="video-item-thumbnail">
                ${thumbnailHtml}
            </div>
            <div class="video-item-info">
                <h3>${escapeHtml(video.title || video.filename)}</h3>
                <p>${escapeHtml(video.description || '')}</p>
                <div class="video-item-tags">${tagsHtml}</div>
            </div>
            <div class="video-item-actions">
                <button class="btn-icon view-btn" title="Bekijken">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.752 11.168l-3.197-2.132A1 1 0 0 0 10 9.87v4.263a1 1 0 0 0 1.555.832l3.197-2.132a1 1 0 0 0 0-1.664z"/>
                        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
                    </svg>
                </button>
                <button class="btn-icon edit-btn" title="Bewerken">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon delete-btn" title="Verwijderen">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        
        // Add event listeners
        videoItem.querySelector('.view-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            viewVideo(video);
        });
        
        videoItem.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            editVideo(video);
        });
        
        videoItem.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteVideo(video);
        });
        
        videoItem.addEventListener('click', () => {
            viewVideo(video);
        });
        
        elements.videosList.appendChild(videoItem);
    });
}

function viewVideo(video) {
    elements.videoModalBody.innerHTML = `
        <h2>${escapeHtml(video.title || video.filename)}</h2>
        <video src="${video.path}" controls style="width: 100%; max-height: 400px; margin-bottom: 1rem;"></video>
        <p>${escapeHtml(video.description || 'Geen beschrijving')}</p>
        <div class="video-item-tags" style="margin-top: 1rem;">
            ${video.tags && video.tags.length > 0 ?
                video.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('') :
                '<span class="tag">Geen tags</span>'}
        </div>
        <div style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-light);">
            <p>Bestandsnaam: ${escapeHtml(video.filename)}</p>
            <p>Grootte: ${formatFileSize(video.size)}</p>
            <p>Laatst gewijzigd: ${new Date(video.modified).toLocaleDateString('nl-NL')}</p>
        </div>
    `;
    elements.videoModal.classList.remove('hidden');
}

function editVideo(video) {
    // For now, just show the video details
    // In a full implementation, this would open an edit form
    showToast('Bewerken functie komt binnenkort', 'info');
}

async function deleteVideo(video) {
    if (!confirm(`Weet je zeker dat je "${video.title || video.filename}" wilt verwijderen?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${config.apiBase}/videos/${encodeURIComponent(video.filename)}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showToast('Video succesvol verwijderd', 'success');
            loadVideos();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Verwijderen mislukt');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast(error.message || 'Verwijderen mislukt', 'error');
    }
}

// ===== User Management =====
async function loadUsers() {
    try {
        const response = await fetch(`${config.apiBase}/users`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        if (response.ok) {
            state.users = data.users;
            renderUsersList();
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUsersList() {
    elements.usersList.innerHTML = '';
    
    state.users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.innerHTML = `
            <div class="user-info">
                <span>${escapeHtml(user.username)}</span>
                <span>${escapeHtml(user.role)}</span>
            </div>
            <div class="user-actions">
                <button class="btn-icon edit-user-btn" title="Bewerken">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon delete-user-btn" title="Verwijderen">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `;
        
        userItem.querySelector('.edit-user-btn').addEventListener('click', () => {
            editUser(user);
        });
        
        userItem.querySelector('.delete-user-btn').addEventListener('click', () => {
            deleteUser(user);
        });
        
        elements.usersList.appendChild(userItem);
    });
}

function editUser(user) {
    elements.userModalTitle.textContent = 'Gebruiker Bewerken';
    elements.userId.value = user.id;
    elements.userUsername.value = user.username;
    elements.userPassword.value = '';
    elements.userRole.value = user.role;
    elements.userModal.classList.remove('hidden');
}

function addUser() {
    elements.userModalTitle.textContent = 'Nieuwe Gebruiker';
    elements.userId.value = '';
    elements.userUsername.value = '';
    elements.userPassword.value = '';
    elements.userRole.value = 'user';
    elements.userModal.classList.remove('hidden');
}

async function saveUser() {
    const id = elements.userId.value;
    const username = elements.userUsername.value.trim();
    const password = elements.userPassword.value;
    const role = elements.userRole.value;
    
    if (!username) {
        showToast('Vul een gebruikersnaam in', 'error');
        return;
    }
    
    if (!password && !id) {
        showToast('Vul een wachtwoord in voor nieuwe gebruikers', 'error');
        return;
    }
    
    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${config.apiBase}/users/${id}` : `${config.apiBase}/users`;
        
        const body = { username, role };
        if (password) {
            body.password = password;
        }
        
        const response = await fetch(url, {
            method,
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast(id ? 'Gebruiker succesvol bijgewerkt' : 'Gebruiker succesvol toegevoegd', 'success');
            elements.userModal.classList.add('hidden');
            elements.userForm.reset();
            loadUsers();
        } else {
            throw new Error(data.message || 'Opslaan mislukt');
        }
    } catch (error) {
        console.error('Save user error:', error);
        showToast(error.message || 'Opslaan mislukt', 'error');
    }
}

async function deleteUser(user) {
    if (!confirm(`Weet je zeker dat je gebruiker "${user.username}" wilt verwijderen?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${config.apiBase}/users/${user.id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        
        if (response.ok) {
            showToast('Gebruiker succesvol verwijderd', 'success');
            loadUsers();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Verwijderen mislukt');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showToast(error.message || 'Verwijderen mislukt', 'error');
    }
}

// ===== Settings =====
async function loadSettings() {
    try {
        const response = await fetch(`${config.apiBase}/settings`, {
            headers: getAuthHeaders()
        });
        
        const data = await response.json();
        
        // Update status indicators
        updateStatusIndicator(elements.cdnStatus, data.cdnEnabled, 'CDN is actief', 'CDN is niet actief');
        updateStatusIndicator(elements.thumbnailStatus, data.thumbnailGeneration, 'Thumbnail generatie is actief', 'Thumbnail generatie is niet actief');
        updateStatusIndicator(elements.compressionStatus, data.videoCompression, 'Video compressie is actief', 'Video compressie is niet actief');
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function updateStatusIndicator(element, isActive, activeText, inactiveText) {
    element.className = `status-indicator ${isActive ? 'active' : 'inactive'}`;
    element.innerHTML = `
        <span class="status-dot"></span>
        <span>${isActive ? activeText : inactiveText}</span>
    `;
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Login
    elements.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            await login(username, password);
            updateUI();
        } catch (error) {
            elements.loginError.textContent = error.message;
            elements.loginError.classList.remove('hidden');
        }
    });
    
    // Logout
    elements.logoutBtn.addEventListener('click', logout);
    
    // Menu toggle
    elements.menuToggle.addEventListener('click', () => {
        elements.sidebar.classList.toggle('hidden');
    });
    
    // Sidebar navigation
    elements.sidebar.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('href').substring(1);
            switchSection(section);
        });
    });
    
    // File upload
    elements.videoFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
    
    elements.selectFileBtn.addEventListener('click', () => {
        elements.videoFileInput.click();
    });
    
    elements.removeFileBtn.addEventListener('click', clearFileSelection);
    
    // Drop zone
    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('drag-over');
    });
    
    elements.dropZone.addEventListener('dragleave', () => {
        elements.dropZone.classList.remove('drag-over');
    });
    
    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
    
    // Tags
    elements.videoTags.addEventListener('input', () => {
        updateTagsDisplay();
        showTagSuggestions();
    });
    
    elements.videoTags.addEventListener('blur', () => {
        setTimeout(() => {
            elements.tagsSuggestions.classList.add('hidden');
        }, 200);
    });
    
    // Upload form
    elements.uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        uploadVideo();
    });
    
    elements.cancelUploadBtn.addEventListener('click', clearFileSelection);
    
    // Manage section
    elements.manageSearch.addEventListener('input', renderVideosList);
    elements.manageTagFilter.addEventListener('change', renderVideosList);
    elements.refreshVideosBtn.addEventListener('click', loadVideos);
    
    // Settings section
    elements.addUserBtn.addEventListener('click', addUser);
    
    // User form
    elements.userForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveUser();
    });
    
    elements.userModal.querySelector('.modal-cancel').addEventListener('click', () => {
        elements.userModal.classList.add('hidden');
        elements.userForm.reset();
    });
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                modal.classList.add('hidden');
                // Clear video preview
                const videoEl = modal.querySelector('video');
                if (videoEl) {
                    videoEl.pause();
                    videoEl.src = '';
                }
            }
        });
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                modal.classList.add('hidden');
            });
        }
    });
    
    // Window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            elements.sidebar.classList.remove('hidden');
        }
    });
}

// ===== Initialization =====
async function init() {
    setupEventListeners();
    
    // Check authentication
    const isAuthenticated = await checkAuth();
    updateUI();
    
    // If authenticated, switch to upload section
    if (isAuthenticated) {
        switchSection('upload');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
