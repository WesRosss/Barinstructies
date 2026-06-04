const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
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
                    tags: []
                };
                
                if (fs.existsSync(jsonFile)) {
                    try {
                        const jsonData = fs.readFileSync(jsonFile, 'utf8');
                        const jsonMetadata = JSON.parse(jsonData);
                        metadata = { ...metadata, ...jsonMetadata };
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

// API endpoint to get all unique tags
app.get('/api/tags', (req, res) => {
    try {
        const videos = getVideos();
        const tagsSet = new Set();
        
        videos.forEach(video => {
            if (video.tags && Array.isArray(video.tags)) {
                video.tags.forEach(tag => tagsSet.add(tag));
            }
        });
        
        const tags = Array.from(tagsSet).sort();
        res.json(tags);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get tags' });
    }
});

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
