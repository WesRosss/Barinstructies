// ===== Configuration =====
const CDN_BASE_URL = window.CDN_BASE_URL || 'https://cdn.barinstructies.nl';
const USE_CDN = window.USE_CDN !== false && window.USE_CDN !== 'false';

// ===== State =====
let videos = [];
let allTags = [];
let currentView = 'grid';
let currentSearch = '';
let currentFilter = '';

// ===== DOM Elements =====
const videosContainer = document.getElementById('videos-container');
const searchInput = document.getElementById('search');
const searchClearBtn = document.getElementById('search-clear');
const tagFilterSelect = document.getElementById('tag-filter');
const gridViewBtn = document.getElementById('grid-view');
const listViewBtn = document.getElementById('list-view');
const videoCountEl = document.getElementById('video-count');
const noResultsEl = document.getElementById('no-results');
const modal = document.getElementById('video-modal');
const modalVideo = document.getElementById('modal-video');
const modalTitle = document.getElementById('modal-title');
const modalTags = document.getElementById('modal-tags');
const modalClose = document.getElementById('modal-close');
const loadingIndicator = document.getElementById('loading-indicator');
const progressCountEl = document.getElementById('progress-count');
const totalCountEl = document.getElementById('total-count');
const estimatedTimeEl = document.getElementById('estimated-time');

// ===== Loading State =====
let videosWithThumbnails = 0;
let totalVideos = 0;
const THUMBNAIL_GENERATION_TIME_PER_VIDEO = 15;
let checkInterval = null;

// ===== Loading Functions =====
function showLoading(total) {
    totalVideos = total;
    videosWithThumbnails = 0;
    loadingIndicator.classList.remove('hidden');
    totalCountEl.textContent = total;
    progressCountEl.textContent = '0';
    const estimatedMinutes = Math.ceil((total * THUMBNAIL_GENERATION_TIME_PER_VIDEO) / 60);
    estimatedTimeEl.textContent = `${estimatedMinutes} ${estimatedMinutes === 1 ? 'minuut' : 'minuten'}`;
}

function hideLoading() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    loadingIndicator.classList.add('hidden');
}

function updateLoadingProgress() {
    progressCountEl.textContent = videosWithThumbnails;
    if (videosWithThumbnails > 0) {
        const remaining = totalVideos - videosWithThumbnails;
        const estimatedSeconds = remaining * THUMBNAIL_GENERATION_TIME_PER_VIDEO;
        const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
        estimatedTimeEl.textContent = `${estimatedMinutes} ${estimatedMinutes === 1 ? 'minuut' : 'minuten'}`;
    }
}

function startThumbnailCheck() {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/videos');
            const currentVideos = await response.json();
            const currentCount = currentVideos.filter(v => v.hasThumbnail).length;
            if (currentCount > videosWithThumbnails) {
                videosWithThumbnails = currentCount;
                videos = currentVideos;
                updateLoadingProgress();
                renderVideos();
                populateTagFilter();
            }
            if (videosWithThumbnails >= totalVideos) hideLoading();
        } catch (error) {
            console.error('Error checking thumbnail status:', error);
        }
    }, 5000);
}

// ===== Play Icon SVG =====
const playIconSVG = `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z"/>
</svg>`;

// ===== Initialize =====
async function init() {
    try {
        // Fetch videos and tags in parallel
        const [videosResponse, tagsResponse] = await Promise.all([
            fetch('/api/videos'),
            fetch('/api/tags')
        ]);
        
        videos = await videosResponse.json();
        allTags = await tagsResponse.json();
        
        // Update total count for loading indicator
        totalVideos = videos.length;
        totalCountEl.textContent = totalVideos;
        
        // Count how many videos already have thumbnails
        videosWithThumbnails = videos.filter(v => v.hasThumbnail).length;
        updateLoadingProgress();
        
        // If not all videos have thumbnails, show loading and start checking
        if (videosWithThumbnails < totalVideos) {
            showLoading(totalVideos);
            startThumbnailCheck();
        }
        
        // Populate tag filter
        populateTagFilter();
        
        // Render videos
        renderVideos();
        
        // Setup event listeners
        setupEventListeners();
        
        // Update count
        updateVideoCount();
        
    } catch (error) {
        console.error('Error initializing:', error);
        showError('Fout bij laden van video\'s');
    }
}

// ===== Populate Tag Filter =====
function populateTagFilter() {
    tagFilterSelect.innerHTML = '<option value="">Alle tags</option>';
    allTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilterSelect.appendChild(option);
    });
}

// ===== Render Videos =====
function renderVideos() {
    // Filter and search
    const filteredVideos = filterAndSearchVideos();
    
    // Clear container
    videosContainer.innerHTML = '';
    
    if (filteredVideos.length === 0) {
        noResultsEl.classList.remove('hidden');
        return;
    }
    
    noResultsEl.classList.add('hidden');
    
    // Create video cards
    filteredVideos.forEach(video => {
        const card = createVideoCard(video);
        videosContainer.appendChild(card);
    });
    
    updateVideoCount();
}

// ===== Filter and Search Videos =====
function filterAndSearchVideos() {
    return videos.filter(video => {
        // Search filter
        const matchesSearch = currentSearch === '' || 
            video.title.toLowerCase().includes(currentSearch.toLowerCase()) ||
            video.filename.toLowerCase().includes(currentSearch.toLowerCase()) ||
            (video.tags && video.tags.some(tag => 
                tag.toLowerCase().includes(currentSearch.toLowerCase())));
        
        // Tag filter
        const matchesFilter = currentFilter === '' || 
            (video.tags && video.tags.includes(currentFilter));
        
        return matchesSearch && matchesFilter;
    });
}

// ===== Create Video Card =====
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = `video-card ${currentView}-view`;
    card.dataset.filename = video.filename;
    
    // Thumbnail section
    const thumbnail = document.createElement('div');
    thumbnail.className = 'video-thumbnail';
    
    // Use video element as thumbnail (more reliable than poster)
    const videoEl = document.createElement('video');
    videoEl.src = video.path;
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
    
    // Add play icon overlay
    const playIcon = document.createElement('div');
    playIcon.className = 'play-icon';
    playIcon.innerHTML = playIconSVG;
    
    thumbnail.appendChild(videoEl);
    thumbnail.appendChild(playIcon);
    
    // Info section
    const info = document.createElement('div');
    info.className = 'video-info';
    
    const title = document.createElement('h3');
    title.textContent = video.title || video.filename;
    
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tags';
    
    if (video.tags && video.tags.length > 0) {
        video.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.textContent = tag;
            tagsContainer.appendChild(tagEl);
        });
    }
    
    info.appendChild(title);
    info.appendChild(tagsContainer);
    
    // Combine
    card.appendChild(thumbnail);
    card.appendChild(info);
    
    // Click handler
    card.addEventListener('click', () => openModal(video));
    
    return card;
}

// ===== Open Modal =====
function openModal(video) {
    modalVideo.src = video.path;
    modalTitle.textContent = video.title || video.filename;
    
    // Clear previous tags
    modalTags.innerHTML = '';
    
    // Add tags
    if (video.tags && video.tags.length > 0) {
        video.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.textContent = tag;
            modalTags.appendChild(tagEl);
        });
    }
    
    modal.classList.remove('hidden');
    modalVideo.focus();
    
    // Pause all other video thumbnails
    pauseAllThumbnails();
}

// ===== Close Modal =====
function closeModal() {
    modal.classList.add('hidden');
    modalVideo.pause();
    modalVideo.currentTime = 0;
}

// ===== Pause All Thumbnails =====
function pauseAllThumbnails() {
    const videoElements = document.querySelectorAll('.video-thumbnail video');
    videoElements.forEach(videoEl => {
        videoEl.pause();
        videoEl.currentTime = 0;
    });
}

// ===== Toggle View =====
function toggleView(view) {
    currentView = view;
    
    // Update button states
    gridViewBtn.classList.toggle('active', view === 'grid');
    listViewBtn.classList.toggle('active', view === 'list');
    
    // Update container class
    videosContainer.className = `videos-container ${view}-view`;
    
    // Update all cards
    const cards = document.querySelectorAll('.video-card');
    cards.forEach(card => {
        card.className = `video-card ${view}-view`;
    });
    
    // Save preference
    localStorage.setItem('videoView', view);
}

// ===== Update Video Count =====
function updateVideoCount() {
    const filteredCount = filterAndSearchVideos().length;
    const totalCount = videos.length;
    
    if (filteredCount === totalCount) {
        videoCountEl.textContent = `${totalCount} video's`;
    } else {
        videoCountEl.textContent = `${filteredCount} van ${totalCount} video's`;
    }
}

// ===== Setup Event Listeners =====
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        renderVideos();
    });
    
    // Clear search
    searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSearch = '';
        renderVideos();
        searchInput.focus();
    });
    
    // Tag filter
    tagFilterSelect.addEventListener('change', (e) => {
        currentFilter = e.target.value;
        renderVideos();
    });
    
    // View toggle
    gridViewBtn.addEventListener('click', () => toggleView('grid'));
    listViewBtn.addEventListener('click', () => toggleView('list'));
    
    // Modal close
    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
        }
    });
    
    // Load saved view preference
    const savedView = localStorage.getItem('videoView') || 'grid';
    if (savedView !== currentView) {
        toggleView(savedView);
    }
    
    // Handle video thumbnail hover
    setupVideoThumbnailHover();
}

function setupVideoThumbnailHover() {
    // Use Intersection Observer for better performance
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const videoEl = entry.target;
            if (entry.isIntersecting) {
                // Preload metadata when visible
                videoEl.load();
            }
        });
    }, { threshold: 0.1 });
    
    // Observe all thumbnail videos
    const thumbnailVideos = document.querySelectorAll('.video-thumbnail video');
    thumbnailVideos.forEach(videoEl => {
        observer.observe(videoEl);
        
        // Play on hover
        videoEl.parentElement.addEventListener('mouseenter', () => {
            videoEl.currentTime = 0;
            videoEl.play().catch(() => {});
        });
        
        // Pause on mouse leave
        videoEl.parentElement.addEventListener('mouseleave', () => {
            videoEl.pause();
        });
    });
}
// ===== Setup Video Thumbnail Hover =====
function setupVideoThumbnailHover() {
    // Use Intersection Observer for lazy loading images
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const imgEl = entry.target;
            if (entry.isIntersecting) {
                // Set the actual src when the image is in view
                if (imgEl.dataset.src && !imgEl.src) {
                    imgEl.src = imgEl.dataset.src;
                }
            }
        });
    }, { threshold: 0.1 });
    
    // Observe all thumbnail images for lazy loading
    const thumbnailImages = document.querySelectorAll('.video-thumbnail img');
    thumbnailImages.forEach(imgEl => {
        // Store the original src in data-src for lazy loading
        if (imgEl.src && !imgEl.dataset.src) {
            imgEl.dataset.src = imgEl.src;
            imgEl.src = ''; // Clear src to prevent immediate loading
        }
        observer.observe(imgEl);
    });
}
function setupVideoThumbnailHover() {
    // Use Intersection Observer for better performance
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const videoEl = entry.target;
            if (entry.isIntersecting) {
                // Preload metadata when visible
                videoEl.load();
            }
        });
    }, { threshold: 0.1 });
    
    // Observe all thumbnail videos
    const thumbnailVideos = document.querySelectorAll('.video-thumbnail video');
    thumbnailVideos.forEach(videoEl => {
        observer.observe(videoEl);
        
        // Play on hover
        videoEl.parentElement.addEventListener('mouseenter', () => {
            videoEl.currentTime = 0;
            videoEl.play().catch(() => {});
        });
        
        // Pause on mouse leave
        videoEl.parentElement.addEventListener('mouseleave', () => {
            videoEl.pause();
        });
    });
}

// ===== Show Error =====
function showError(message) {
    videosContainer.innerHTML = `
        <div class="error">
            <p>${message}</p>
            <button onclick="location.reload()">Opnieuw proberen</button>
        </div>
    `;
}

// ===== Refresh Videos =====
async function refreshVideos() {
    try {
        const response = await fetch('/api/videos');
        videos = await response.json();
        renderVideos();
        updateVideoCount();
    } catch (error) {
        console.error('Error refreshing videos:', error);
    }
}

// ===== Initialize on DOM Load =====
document.addEventListener('DOMContentLoaded', init);

// ===== Export for debugging =====
window.refreshVideos = refreshVideos;
