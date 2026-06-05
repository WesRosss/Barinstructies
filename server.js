const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3210;
const VIDEOS_DIR = path.join(__dirname, 'videos');

// Ensure videos directory exists
if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

// Middleware for JSON parsing
app.use(express.json());
app.use(express.static('public'));

// Scan videos directory and return video list with metadata
function getVideos() {
    try {
        const files = fs.readdirSync(VIDEOS_DIR);
        const videos = [];
        
        files.forEach(file => {
            const ext = path.extname(file).toLowerCase();
            const baseName = path.basename(file, ext);
            
            // Check for .mp4 files
            if (ext === '.mp4') {
                const jsonFile = path.join(VIDEOS_DIR, baseName + '.json');
                const videoPath = path.join(VIDEOS_DIR, file);
                
                // Get video stats
                const stats = fs.statSync(videoPath);
                
                // Try to read metadata
                let metadata = {
                    title: baseName.replace(/-/g, ' ').replace(/_/g, ' '),
                    tags: [],
                    onderwerpen: []
                };
                
                if (fs.existsSync(jsonFile)) {
                    try {
                        const jsonData = fs.readFileSync(jsonFile, 'utf8');
                        const jsonMetadata = JSON.parse(jsonData);
                        metadata = { ...metadata, ...jsonMetadata };
                        
                        // Backward compatibility: if onderwerpen is empty but tags exists, copy tags to onderwerpen
                        if ((!metadata.onderwerpen || metadata.onderwerpen.length === 0) && 
                            metadata.tags && metadata.tags.length > 0) {
                            metadata.onderwerpen = [...metadata.tags];
                        }
                    } catch (e) {
                        console.error(`Error reading metadata for ${file}:`, e.message);
                    }
                }
                
                videos.push({
                    filename: file,
                    basename: baseName,
                    path: `/videos/${file}`,
                    thumbnail: `/videos/${baseName}.jpg`, // Optional thumbnail
                    size: stats.size,
                    modified: stats.mtime,
                    ...metadata
                });
            }
        });
        
        // Sort by filename
        videos.sort((a, b) => a.filename.localeCompare(b.filename));
        
        return videos;
    } catch (error) {
        console.error('Error scanning videos directory:', error);
        return [];
    }
}

// API endpoint to get all videos with metadata
app.get('/api/videos', (req, res) => {
    try {
        const videos = getVideos();
        res.json(videos);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get videos' });
    }
});

// API endpoint to get all unique onderwerpen
app.get('/api/onderwerpen', (req, res) => {
    try {
        const videos = getVideos();
        const onderwerpenSet = new Set();
        
        videos.forEach(video => {
            if (video.onderwerpen && Array.isArray(video.onderwerpen)) {
                video.onderwerpen.forEach(onderwerp => onderwerpenSet.add(onderwerp));
            }
            // Backward compatibility: also check tags
            if (video.tags && Array.isArray(video.tags)) {
                video.tags.forEach(tag => onderwerpenSet.add(tag));
            }
        });
        
        const onderwerpen = Array.from(onderwerpenSet).sort();
        res.json(onderwerpen);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get onderwerpen' });
    }
});

// API endpoint to get all unique tags (backward compatibility)
app.get('/api/tags', (req, res) => {
    res.redirect('/api/onderwerpen');
});

// API endpoint to get all unique hoofdcategorieën
app.get('/api/hoofdcategorieen', (req, res) => {
    try {
        const videos = getVideos();
        const categorieenSet = new Set();
        
        videos.forEach(video => {
            // Check onderwerp_structuur
            if (video.onderwerp_structuur && video.onderwerp_structuur.hoofdcategorie) {
                categorieenSet.add(video.onderwerp_structuur.hoofdcategorie);
            }
            // Check context
            if (video.context && video.context.locatie) {
                categorieenSet.add(video.context.locatie);
            }
            // Fallback: first onderwerp as category
            if (video.onderwerpen && video.onderwerpen.length > 0) {
                categorieenSet.add(video.onderwerpen[0]);
            }
        });
        
        const categorieen = Array.from(categorieenSet).sort();
        res.json(categorieen);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get hoofdcategorieen' });
    }
});

// API endpoint to get suggestions for a specific video
app.get('/api/suggesties/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const videos = getVideos();
        
        // Find the current video
        const currentVideo = videos.find(v => v.filename === filename);
        if (!currentVideo) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        // Get suggestions based on multiple criteria
        const suggestions = getVideoSuggestions(currentVideo, videos);
        
        res.json(suggestions);
    } catch (error) {
        console.error('Error getting suggestions:', error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});

// Helper function to get video suggestions
function getVideoSuggestions(currentVideo, allVideos) {
    const suggestions = [];
    const maxSuggestions = 6;
    const currentFilename = currentVideo.filename;
    
    // Filter out the current video
    const otherVideos = allVideos.filter(v => v.filename !== currentFilename);
    
    // 1. Same hoofdonderwerp, different subonderwerp (highest priority)
    if (currentVideo.onderwerp_structuur) {
        const { hoofdcategorie, hoofdonderwerp, subonderwerp } = currentVideo.onderwerp_structuur;
        
        if (hoofdcategorie && hoofdonderwerp) {
            const sameHoofonderwerp = otherVideos.filter(v => 
                v.onderwerp_structuur && 
                v.onderwerp_structuur.hoofdcategorie === hoofdcategorie &&
                v.onderwerp_structuur.hoofonderwerp === hoofdonderwerp &&
                v.onderwerp_structuur.subonderwerp !== subonderwerp
            );
            
            sameHoofonderwerp.forEach(v => {
                if (suggestions.length < maxSuggestions) {
                    suggestions.push({ ...v, reason: 'zelfde hoofdonderwerp' });
                }
            });
        }
    }
    
    // 2. Related onderwerpen from metadata
    if (currentVideo.onderwerp_structuur && 
        currentVideo.onderwerp_structuur.gerelateerde_onderwerpen) {
        
        currentVideo.onderwerp_structuur.gerelateerde_onderwerpen.forEach(related => {
            const matchingVideos = otherVideos.filter(v => 
                v.onderwerp_structuur &&
                v.onderwerp_structuur.hoofdcategorie === related.hoofdcategorie &&
                v.onderwerp_structuur.hoofonderwerp === related.hoofonderwerp &&
                v.onderwerp_structuur.subonderwerp === related.subonderwerp
            );
            
            matchingVideos.forEach(v => {
                if (suggestions.length < maxSuggestions && 
                    !suggestions.some(s => s.filename === v.filename)) {
                    suggestions.push({ ...v, reason: 'gerelateerd onderwerp' });
                }
            });
        });
    }
    
    // 3. Same hoofdcategorie
    if (currentVideo.onderwerp_structuur && currentVideo.onderwerp_structuur.hoofdcategorie) {
        const sameCategorie = otherVideos.filter(v => 
            v.onderwerp_structuur && 
            v.onderwerp_structuur.hoofdcategorie === currentVideo.onderwerp_structuur.hoofdcategorie &&
            !(v.onderwerp_structuur.hoofonderwerp === currentVideo.onderwerp_structuur.hoofonderwerp)
        );
        
        sameCategorie.forEach(v => {
            if (suggestions.length < maxSuggestions && 
                !suggestions.some(s => s.filename === v.filename)) {
                suggestions.push({ ...v, reason: 'zelfde hoofdcategorie' });
            }
        });
    }
    
    // 4. Same context type
    if (currentVideo.context && currentVideo.context.type) {
        const sameContext = otherVideos.filter(v => 
            v.context && v.context.type === currentVideo.context.type
        );
        
        sameContext.forEach(v => {
            if (suggestions.length < maxSuggestions && 
                !suggestions.some(s => s.filename === v.filename)) {
                suggestions.push({ ...v, reason: 'zelfde context' });
            }
        });
    }
    
    // 5. Fallback: videos with overlapping onderwerpen
    if (currentVideo.onderwerpen && currentVideo.onderwerpen.length > 0) {
        currentVideo.onderwerpen.forEach(onderwerp => {
            const matching = otherVideos.filter(v => 
                v.onderwerpen && v.onderwerpen.includes(onderwerp) &&
                v.filename !== currentFilename
            );
            
            matching.forEach(v => {
                if (suggestions.length < maxSuggestions && 
                    !suggestions.some(s => s.filename === v.filename)) {
                    suggestions.push({ ...v, reason: 'overlappend onderwerp' });
                }
            });
        });
    }
    
    // Remove duplicates and limit
    const uniqueSuggestions = [];
    const seenFilenames = new Set();
    
    suggestions.forEach(s => {
        if (!seenFilenames.has(s.filename)) {
            seenFilenames.add(s.filename);
            uniqueSuggestions.push(s);
        }
    });
    
    return uniqueSuggestions.slice(0, maxSuggestions);
}

// Serve videos directory
app.use('/videos', express.static(VIDEOS_DIR));

// Serve the main page for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Barinstructies server running on port ${PORT}`);
    console.log(`Videos directory: ${VIDEOS_DIR}`);
    
    // Log available videos at startup
    const videos = getVideos();
    console.log(`Found ${videos.length} videos`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});
