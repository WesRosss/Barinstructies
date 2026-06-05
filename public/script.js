// ===== State =====
let videos = [];
let allOnderwerpen = [];
let allHoofdcategorieen = [];
let currentSearch = '';
let currentOnderwerpFilter = '';
let currentHoofdcategorieFilter = '';
let currentVideo = null;

// ===== DOM Elements =====
const videosContainer = document.getElementById('videos-container');
const searchInput = document.getElementById('search');
const searchClearBtn = document.getElementById('search-clear');
const hoofdcategorieFilterSelect = document.getElementById('hoofdcategorie-filter');
const onderwerpFilterSelect = document.getElementById('onderwerp-filter');
const videoCountEl = document.getElementById('video-count');
const noResultsEl = document.getElementById('no-results');
const modal = document.getElementById('video-modal');
const modalVideo = document.getElementById('modal-video');
const modalTitle = document.getElementById('modal-title');
const modalOnderwerpen = document.getElementById('modal-onderwerpen');
const modalClose = document.getElementById('modal-close');
const modalSuggestions = document.getElementById('modal-suggestions');
const suggestionsContainer = document.getElementById('suggestions-container');

// ===== Play Icon SVG =====
const playIconSVG = `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z"/>
</svg>`;

// ===== Initialize =====
async function init() {
    try {
        // Fetch videos, onderwerpen, and hoofdcategorieen in parallel
        const [videosResponse, onderwerpenResponse, categorieenResponse] = await Promise.all([
            fetch('/api/videos'),
            fetch('/api/onderwerpen'),
            fetch('/api/hoofdcategorieen')
        ]);
        
        videos = await videosResponse.json();
        allOnderwerpen = await onderwerpenResponse.json();
        allHoofdcategorieen = await categorieenResponse.json();
        
        // Populate filters
        populateHoofdcategorieFilter();
        populateOnderwerpFilter();
        
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

// ===== Populate Hoofdcategorie Filter =====
function populateHoofdcategorieFilter() {
    hoofdcategorieFilterSelect.innerHTML = '<option value="">Alle categorieën</option>';
    allHoofdcategorieen.forEach(categorie => {
        const option = document.createElement('option');
        option.value = categorie;
        option.textContent = categorie;
        hoofdcategorieFilterSelect.appendChild(option);
    });
}

// ===== Populate Onderwerp Filter =====
function populateOnderwerpFilter() {
    onderwerpFilterSelect.innerHTML = '<option value="">Alle onderwerpen</option>';
    allOnderwerpen.forEach(onderwerp => {
        const option = document.createElement('option');
        option.value = onderwerp;
        option.textContent = onderwerp;
        onderwerpFilterSelect.appendChild(option);
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
            (video.onderwerpen && video.onderwerpen.some(onderwerp => 
                onderwerp.toLowerCase().includes(currentSearch.toLowerCase())));
        
        // Hoofdcategorie filter
        const matchesHoofdcategorie = currentHoofdcategorieFilter === '' || 
            (video.onderwerp_structuur && 
             video.onderwerp_structuur.hoofdcategorie === currentHoofdcategorieFilter) ||
            (video.context && video.context.locatie === currentHoofdcategorieFilter) ||
            (video.onderwerpen && video.onderwerpen.length > 0 && 
             video.onderwerpen[0] === currentHoofdcategorieFilter);
        
        // Onderwerp filter
        const matchesOnderwerp = currentOnderwerpFilter === '' || 
            (video.onderwerpen && video.onderwerpen.includes(currentOnderwerpFilter));
        
        return matchesSearch && matchesHoofdcategorie && matchesOnderwerp;
    });
}

// ===== Create Video Card =====
function createVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'video-card';
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
    
    const onderwerpenContainer = document.createElement('div');
    onderwerpenContainer.className = 'onderwerpen';
    
    if (video.onderwerpen && video.onderwerpen.length > 0) {
        video.onderwerpen.forEach(onderwerp => {
            const onderwerpEl = document.createElement('span');
            onderwerpEl.className = 'onderwerp';
            onderwerpEl.textContent = onderwerp;
            onderwerpenContainer.appendChild(onderwerpEl);
        });
    }
    
    info.appendChild(title);
    info.appendChild(onderwerpenContainer);
    
    // Combine
    card.appendChild(thumbnail);
    card.appendChild(info);
    
    // Click handler
    card.addEventListener('click', () => openModal(video));
    
    return card;
}

// ===== Open Modal =====
async function openModal(video) {
    currentVideo = video;
    modalVideo.src = video.path;
    modalTitle.textContent = video.title || video.filename;
    
    // Clear previous onderwerpen
    modalOnderwerpen.innerHTML = '';
    
    // Add onderwerpen
    if (video.onderwerpen && video.onderwerpen.length > 0) {
        video.onderwerpen.forEach(onderwerp => {
            const onderwerpEl = document.createElement('span');
            onderwerpEl.className = 'onderwerp';
            onderwerpEl.textContent = onderwerp;
            modalOnderwerpen.appendChild(onderwerpEl);
        });
    }
    
    // Show suggestions
    await showSuggestions(video);
    
    modal.classList.remove('hidden');
    modalVideo.focus();
    
    // Pause all other video thumbnails
    pauseAllThumbnails();
    
    // Setup video end handler for auto-play next
    setupVideoEndHandler();
}

// ===== Show Suggestions =====
async function showSuggestions(video) {
    try {
        const response = await fetch(`/api/suggesties/${encodeURIComponent(video.filename)}`);
        const suggestions = await response.json();
        
        if (suggestions.length > 0) {
            // Clear previous suggestions
            suggestionsContainer.innerHTML = '';
            
            // Create suggestion cards
            suggestions.forEach(suggestion => {
                const suggestionCard = createSuggestionCard(suggestion);
                suggestionsContainer.appendChild(suggestionCard);
            });
            
            modalSuggestions.classList.remove('hidden');
        } else {
            modalSuggestions.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading suggestions:', error);
        modalSuggestions.classList.add('hidden');
    }
}

// ===== Create Suggestion Card =====
function createSuggestionCard(video) {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.dataset.filename = video.filename;
    
    // Thumbnail section
    const thumbnail = document.createElement('div');
    thumbnail.className = 'suggestion-thumbnail';
    
    const videoEl = document.createElement('video');
    videoEl.src = video.path;
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
    
    const playIcon = document.createElement('div');
    playIcon.className = 'play-icon';
    playIcon.innerHTML = playIconSVG;
    
    thumbnail.appendChild(videoEl);
    thumbnail.appendChild(playIcon);
    
    // Info section
    const info = document.createElement('div');
    info.className = 'suggestion-info';
    
    const title = document.createElement('h4');
    title.textContent = video.title || video.filename;
    
    // Show reason if available
    if (video.reason) {
        const reason = document.createElement('span');
        reason.className = 'suggestion-reason';
        reason.textContent = video.reason;
        info.appendChild(reason);
    }
    
    info.appendChild(title);
    
    // Combine
    card.appendChild(thumbnail);
    card.appendChild(info);
    
    // Click handler
    card.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(video);
    });
    
    return card;
}

// ===== Setup Video End Handler =====
function setupVideoEndHandler() {
    // Remove previous handler if exists
    modalVideo.onended = null;
    
    modalVideo.onended = async () => {
        // Show suggestions more prominently when video ends
        if (modalSuggestions && !modalSuggestions.classList.contains('hidden')) {
            modalSuggestions.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };
}

// ===== Close Modal =====
function closeModal() {
    modal.classList.add('hidden');
    modalVideo.pause();
    modalVideo.currentTime = 0;
    modalVideo.onended = null;
    
    // Hide suggestions when modal closes
    modalSuggestions.classList.add('hidden');
}

// ===== Pause All Thumbnails =====
function pauseAllThumbnails() {
    const videoElements = document.querySelectorAll('.video-thumbnail video, .suggestion-thumbnail video');
    videoElements.forEach(videoEl => {
        videoEl.pause();
        videoEl.currentTime = 0;
    });
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
    
    // Hoofdcategorie filter
    hoofdcategorieFilterSelect.addEventListener('change', (e) => {
        currentHoofdcategorieFilter = e.target.value;
        renderVideos();
        
        // Update onderwerp filter based on selected category
        updateOnderwerpFilterByCategory();
    });
    
    // Onderwerp filter
    onderwerpFilterSelect.addEventListener('change', (e) => {
        currentOnderwerpFilter = e.target.value;
        renderVideos();
    });
    
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
    
    // Handle video thumbnail hover
    setupVideoThumbnailHover();
}

// ===== Update Onderwerp Filter By Category =====
function updateOnderwerpFilterByCategory() {
    if (currentHoofdcategorieFilter === '') {
        // Show all onderwerpen
        populateOnderwerpFilter();
        return;
    }
    
    // Filter onderwerpen based on selected category
    const filteredOnderwerpen = allOnderwerpen.filter(onderwerp => {
        // Find videos that have this onderwerp and match the category
        const matchingVideos = videos.filter(v => 
            v.onderwerpen && v.onderwerpen.includes(onderwerp) &&
            ((v.onderwerp_structuur && v.onderwerp_structuur.hoofdcategorie === currentHoofdcategorieFilter) ||
             (v.context && v.context.locatie === currentHoofdcategorieFilter) ||
             (v.onderwerpen && v.onderwerpen[0] === currentHoofdcategorieFilter))
        );
        return matchingVideos.length > 0;
    });
    
    onderwerpFilterSelect.innerHTML = '<option value="">Alle onderwerpen</option>';
    filteredOnderwerpen.forEach(onderwerp => {
        const option = document.createElement('option');
        option.value = onderwerp;
        option.textContent = onderwerp;
        onderwerpFilterSelect.appendChild(option);
    });
    
    // Reset onderwerp filter
    currentOnderwerpFilter = '';
}

// ===== Setup Video Thumbnail Hover =====
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
    const thumbnailVideos = document.querySelectorAll('.video-thumbnail video, .suggestion-thumbnail video');
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
