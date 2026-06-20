const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3210;
const VIDEOS_DIR = path.join(__dirname, 'videos');

// CDN Configuration
const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.barinstructies.nl';
const USE_CDN = process.env.USE_CDN === 'false' ? false : true;

// Thumbnail Configuration
const GENERATE_THUMBNAILS = process.env.GENERATE_THUMBNAILS !== 'false';
const THUMBNAIL_WIDTH = process.env.THUMBNAIL_WIDTH || 320;
const THUMBNAIL_HEIGHT = process.env.THUMBNAIL_HEIGHT || 180;

// Ensure videos directory exists
if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

// Middleware for JSON parsing
app.use(express.json());
app.use(express.static('public'));

// Function to generate thumbnail from video
function generateThumbnail(videoPath, thumbnailPath) {
    if (!GENERATE_THUMBNAILS) return false;
    
    try {
        // Check if ffmpeg is available
        execSync('ffmpeg -version', { stdio: 'ignore' });
        
        // Check if thumbnail already exists
        if (fs.existsSync(thumbnailPath)) {
            return true;
        }
        
        // Generate thumbnail at 1 second into the video
        execSync(`ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -q:v 2 -y -s ${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT} "${thumbnailPath}"`, {
            stdio: 'inherit'
        });
        
        return fs.existsSync(thumbnailPath);
    } catch (error) {
        console.error(`Error generating thumbnail for ${videoPath}:`, error.message);
        return false;
    }
}

// Scan videos directory and return video list with metadata
function getVideos() {
    try {
        const files = fs.readdirSync(VIDEOS_DIR);
        const videos = [];
        const processedFiles = new Set(); // To avoid duplicates
        
        files.forEach(file => {
            const ext = path.extname(file).toLowerCase();
            const baseName = path.basename(file, ext);
            
            // Check for .json files (metadata) - primary method when using CDN
            if (ext === '.json') {
                const videoFileName = baseName + '.mp4';
                
                // Skip if we've already processed this video
                if (processedFiles.has(videoFileName)) {
                    return;
                }
                processedFiles.add(videoFileName);
                
                // Try to read metadata from JSON file
                let metadata = {
                    title: baseName.replace(/-/g, ' ').replace(/_/g, ' '),
                    tags: []
                };
                
                try {
                    const jsonData = fs.readFileSync(path.join(VIDEOS_DIR, file), 'utf8');
                    const jsonMetadata = JSON.parse(jsonData);
                    metadata = { ...metadata, ...jsonMetadata };
                } catch (e) {
                    console.error(`Error reading metadata for ${file}:`, e.message);
                }
                
                // Local paths
                const localVideoPath = path.join(VIDEOS_DIR, videoFileName);
                const localThumbnailPath = path.join(VIDEOS_DIR, baseName + '.jpg');
                
                // Try to generate thumbnail if local video exists and thumbnail doesn't
                if (fs.existsSync(localVideoPath) && !fs.existsSync(localThumbnailPath)) {
                    generateThumbnail(localVideoPath, localThumbnailPath);
                }
                
                // Use CDN URL for videos if enabled, but always use local path for thumbnails
                const publicVideoPath = USE_CDN ? `${CDN_BASE_URL}/${videoFileName}` : `/videos/${videoFileName}`;
                const publicThumbnailPath = `/videos/${baseName}.jpg`;
                
                // Try to get file stats if local file exists
                let size = 0;
                let modified = new Date();
                if (fs.existsSync(localVideoPath)) {
                    const stats = fs.statSync(localVideoPath);
                    size = stats.size;
                    modified = stats.mtime;
                }
                
                videos.push({
                    filename: videoFileName,
                    basename: baseName,
                    path: publicVideoPath,
                    thumbnail: publicThumbnailPath,
                    size: size,
                    modified: modified,
                    ...metadata
                });
            }
            // Also check for .mp4 files (for backward compatibility)
            else if (ext === '.mp4') {
                const jsonFile = path.join(VIDEOS_DIR, baseName + '.json');
                const localVideoPath = path.join(VIDEOS_DIR, file);
                const localThumbnailPath = path.join(VIDEOS_DIR, baseName + '.jpg');
                
                // Skip if we've already processed this video from its JSON file
                if (processedFiles.has(file)) {
                    return;
                }
                processedFiles.add(file);
                
                // Try to generate thumbnail if it doesn't exist
                if (!fs.existsSync(localThumbnailPath)) {
                    generateThumbnail(localVideoPath, localThumbnailPath);
                }
                
                // Get video stats
                const stats = fs.statSync(localVideoPath);
                
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
                
                // Use CDN URL for videos if enabled, but always use local path for thumbnails
                const publicVideoPath = USE_CDN ? `${CDN_BASE_URL}/${file}` : `/videos/${file}`;
                const publicThumbnailPath = `/videos/${baseName}.jpg`;
                
                videos.push({
                    filename: file,
                    basename: baseName,
                    path: publicVideoPath,
                    thumbnail: publicThumbnailPath,
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

// Serve videos directory only if CDN is disabled
if (!USE_CDN) {
    app.use('/videos', express.static(VIDEOS_DIR));
}

// Inject CDN configuration into index.html
app.get('*', (req, res) => {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error loading index.html');
        }
        
        // Replace CDN configuration placeholders
        const html = data
            .replace('window.CDN_BASE_URL = \'https://cdn.barinstructies.nl\';', 
                     `window.CDN_BASE_URL = '${CDN_BASE_URL}';`)
            .replace('window.USE_CDN = true;', 
                     `window.USE_CDN = ${USE_CDN};`);
        
        res.send(html);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Barinstructies server running on port ${PORT}`);
    console.log(`Videos directory: ${VIDEOS_DIR}`);
    console.log(`CDN enabled: ${USE_CDN}, Base URL: ${CDN_BASE_URL}`);
    
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
