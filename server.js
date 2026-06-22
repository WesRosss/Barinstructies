const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

const app = express();

// Auto-upload static files to CDN on startup (if configured)
if (process.env.AUTO_UPLOAD_TO_CDN === 'true' && 
    process.env.BUNNYCDN_ACCESS_KEY && 
    process.env.BUNNYCDN_PASSWORD) {
    console.log('Auto-upload to CDN enabled. Running cdn-upload script...');
    try {
        // Run the CDN upload script in a separate process
        const cdnUploadProcess = execSync('node cdn-upload.js', { 
            stdio: 'inherit',
            env: process.env
        });
        console.log('CDN upload completed.');
    } catch (error) {
        console.error('Error during CDN upload:', error.message);
    }
}
const PORT = process.env.PORT || 3210;
const VIDEOS_DIR = path.join(__dirname, 'videos');
const TEMP_DIR = path.join(__dirname, 'temp');

// CDN Configuration
const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.barinstructies.nl';
const USE_CDN = process.env.USE_CDN === 'false' ? false : true;

// Thumbnail Configuration
const GENERATE_THUMBNAILS = process.env.GENERATE_THUMBNAILS !== 'false';
const THUMBNAIL_WIDTH = process.env.THUMBNAIL_WIDTH || 320;
const THUMBNAIL_HEIGHT = process.env.THUMBNAIL_HEIGHT || 180;

// BunnyCDN Configuration for thumbnail uploads
const BUNNYCDN_ACCESS_KEY = process.env.BUNNYCDN_ACCESS_KEY;
const BUNNYCDN_PASSWORD = process.env.BUNNYCDN_PASSWORD;
const BUNNYCDN_STORAGE_ZONE = process.env.BUNNYCDN_STORAGE_ZONE || 'instructievideos';
const BUNNYCDN_REGION_ENDPOINT = process.env.BUNNYCDN_REGION_ENDPOINT || 'https://storage.bunnycdn.com';
const UPLOAD_THUMBNAILS_TO_CDN = BUNNYCDN_ACCESS_KEY && BUNNYCDN_PASSWORD && USE_CDN;

// Ensure directories exist
if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Middleware for JSON parsing
app.use(express.json());
app.use(express.static('public'));

// Security middleware
app.use((req, res, next) => {
    // Set general security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Initialize beheer routes
const { router: beheerRouter, initializeUsersFile } = require('./beheer-routes');

// Initialize users file
initializeUsersFile();

// Mount beheer routes
app.use('/beheer/api', beheerRouter);

// Serve beheer HTML page
app.get('/beheer', (req, res) => {
    fs.readFile(path.join(__dirname, 'public', 'beheer.html'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).send('Error loading beheer page');
        }
        
        // Inject configuration
        const html = data
            .replace('window.CDN_BASE_URL = \'https://cdn.barinstructies.nl\';', 
                     `window.CDN_BASE_URL = '${CDN_BASE_URL}';`)
            .replace('window.USE_CDN = true;', 
                     `window.USE_CDN = ${USE_CDN};`);
        
        res.send(html);
    });
});

// Serve beheer static files
app.use('/beheer', express.static('public'));
// Also serve beheer-specific files from root path for direct access
app.use('/beheer-style.css', express.static('public/beheer-style.css'));
app.use('/beheer-script.js', express.static('public/beheer-script.js'));

// Security: Block access to beheer from bots and scrapers
app.use('/beheer*', (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const isBot = /bot|spider|crawl|scraper|curl|wget|python-requests|java|go-http-client/i.test(userAgent);
    
    if (isBot) {
        // Return 404 for bots
        return res.status(404).send('Not Found');
    }
    
    next();
});

// robots.txt to block beheer
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Disallow: /beheer
Disallow: /beheer/
`);
});

// Function to download file from URL
function downloadFile(url, destinationPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        console.log(`Downloading ${url} to ${destinationPath}...`);
        
        const req = protocol.get(url, (res) => {
            if (res.statusCode !== 200) {
                console.error(`Failed to download ${url}. Status: ${res.statusCode}`);
                return resolve(false);
            }
            
            const fileStream = fs.createWriteStream(destinationPath);
            res.pipe(fileStream);
            
            fileStream.on('finish', () => {
                fileStream.close();
                console.log(`Downloaded ${url} to ${destinationPath}`);
                resolve(true);
            });
            
            fileStream.on('error', (error) => {
                fs.unlink(destinationPath, () => {});
                console.error(`Error downloading ${url}:`, error.message);
                resolve(false);
            });
        });
        
        req.on('error', (error) => {
            console.error(`Request error downloading ${url}:`, error.message);
            resolve(false);
        });
        
        req.setTimeout(30000, () => {
            req.destroy();
            console.error(`Timeout downloading ${url}`);
            resolve(false);
        });
    });
}

// Function to upload file to BunnyCDN
function uploadToBunnyCDN(filePath, destinationFilename) {
    if (!UPLOAD_THUMBNAILS_TO_CDN) {
        console.log('BunnyCDN upload skipped: no credentials configured');
        return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
        if (!fs.existsSync(filePath)) {
            console.error(`File not found for upload: ${filePath}`);
            return resolve(false);
        }
        
        const fileContent = fs.readFileSync(filePath);
        const fileSize = fs.statSync(filePath).size;
        
        const uploadUrl = `${BUNNYCDN_REGION_ENDPOINT}/${BUNNYCDN_STORAGE_ZONE}/${destinationFilename}`;
        
        const options = {
            hostname: new URL(uploadUrl).hostname,
            path: new URL(uploadUrl).pathname,
            method: 'PUT',
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY,
                'Content-Type': 'application/octet-stream',
                'Content-Length': fileSize
            },
            auth: `${BUNNYCDN_ACCESS_KEY}:${BUNNYCDN_PASSWORD}`
        };
        
        console.log(`Uploading ${destinationFilename} to BunnyCDN...`);
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`Successfully uploaded ${destinationFilename} to BunnyCDN`);
                    resolve(true);
                } else {
                    console.error(`Failed to upload ${destinationFilename} to BunnyCDN. Status: ${res.statusCode}, Response: ${data}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`Error uploading ${destinationFilename} to BunnyCDN:`, error.message);
            resolve(false);
        });
        
        req.write(fileContent);
        req.end();
    });
}

// Function to check if thumbnail exists on CDN
function checkThumbnailOnCDN(thumbnailFilename) {
    if (!UPLOAD_THUMBNAILS_TO_CDN) {
        return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
        const checkUrl = `${CDN_BASE_URL}/${thumbnailFilename}`;
        
        const req = https.get(checkUrl, (res) => {
            if (res.statusCode === 200) {
                console.log(`Thumbnail already exists on CDN: ${thumbnailFilename}`);
                resolve(true);
            } else {
                resolve(false);
            }
        });
        
        req.on('error', () => {
            resolve(false);
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// Function to compress a video file with FFmpeg
function compressVideo(inputPath, outputPath, maxWidth = 640, maxHeight = 480, bitrate = '500k') {
    return new Promise((resolve) => {
        try {
            // Check if ffmpeg is available
            execSync('ffmpeg -version', { stdio: 'ignore' });

            console.log(`Compressing ${inputPath} to ${outputPath}...`);

            // FFmpeg command for mobile-optimized compression
            const command = `ffmpeg -i "${inputPath}" ` +
                `-vf "scale=${maxWidth}:${maxHeight}:force_original_aspect_ratio=decrease" ` +
                `-b:v ${bitrate} ` +
                `-c:v libx264 ` +
                `-crf 28 ` +
                `-preset fast ` +
                `-c:a aac ` +
                `-b:a 96k ` +
                `-movflags +faststart ` +
                `-y "${outputPath}"`;

            execSync(command, { stdio: 'inherit' });

            if (fs.existsSync(outputPath)) {
                console.log(`Successfully compressed ${inputPath} to ${outputPath}`);
                resolve(true);
            } else {
                console.error(`Compression failed for ${inputPath}`);
                resolve(false);
            }
        } catch (error) {
            console.error(`Error compressing ${inputPath}:`, error.message);
            resolve(false);
        }
    });
}

// Function to generate, compress (if needed), and upload thumbnail for a video
async function ensureThumbnailOnCDN(videoFilename, baseName) {
    if (!GENERATE_THUMBNAILS || !UPLOAD_THUMBNAILS_TO_CDN) {
        console.log(`Thumbnail generation/upload skipped: GENERATE_THUMBNAILS=${GENERATE_THUMBNAILS}, UPLOAD_THUMBNAILS_TO_CDN=${UPLOAD_THUMBNAILS_TO_CDN}`);
        return false;
    }

    const thumbnailFilename = baseName + '.jpg';
    const cdnVideoUrl = `${CDN_BASE_URL}/${videoFilename}`;
    const tempVideoPath = path.join(TEMP_DIR, videoFilename);
    const tempThumbnailPath = path.join(TEMP_DIR, thumbnailFilename);
    const tempCompressedPath = path.join(TEMP_DIR, `compressed_${videoFilename}`);

    try {
        // Check if thumbnail already exists on CDN
        const thumbnailExists = await checkThumbnailOnCDN(thumbnailFilename);
        if (thumbnailExists) {
            return true;
        }

        console.log(`Thumbnail ${thumbnailFilename} not found on CDN, generating...`);

        // Download video from CDN to temp directory
        const downloaded = await downloadFile(cdnVideoUrl, tempVideoPath);
        if (!downloaded) {
            console.error(`Failed to download video ${videoFilename} from CDN`);
            return false;
        }

        // Check file size (compress if >5MB)
        const fileStats = fs.statSync(tempVideoPath);
        const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
        let videoToUseForThumbnail = tempVideoPath;

        if (fileStats.size > MAX_SIZE_BYTES) {
            console.log(`Video ${videoFilename} is too large (${fileStats.size} bytes), compressing...`);

            // Compress the video
            const compressed = await compressVideo(
                tempVideoPath,
                tempCompressedPath,
                640,  // maxWidth
                480,  // maxHeight
                '500k' // bitrate
            );

            if (compressed) {
                // Upload compressed video to CDN (overwrite original)
                const compressedUploaded = await uploadToBunnyCDN(
                    tempCompressedPath,
                    videoFilename
                );

                if (compressedUploaded) {
                    console.log(`Compressed video uploaded to CDN as ${videoFilename}`);

                    // Rename original on CDN to *_origineel.mp4
                    const originalFilename = baseName + '_origineel.mp4';
                    const originalUploaded = await uploadToBunnyCDN(
                        tempVideoPath,
                        originalFilename
                    );

                    if (originalUploaded) {
                        console.log(`Original video renamed to ${originalFilename} on CDN`);
                    } else {
                        console.error(`Failed to upload original video as ${originalFilename} to CDN`);
                    }

                    // Use compressed video for thumbnail generation
                    videoToUseForThumbnail = tempCompressedPath;
                } else {
                    console.error(`Failed to upload compressed video to CDN`);
                }
            } else {
                console.error(`Failed to compress video ${videoFilename}`);
            }
        }

        // Check if ffmpeg is available
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' });
        } catch (error) {
            console.error('ffmpeg not available for thumbnail generation');
            return false;
        }

        // Generate thumbnail from the (possibly compressed) video
        console.log(`Generating thumbnail for ${videoFilename}...`);
        execSync(`ffmpeg -i "${videoToUseForThumbnail}" -ss 00:00:01 -vframes 1 -q:v 2 -y -s ${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT} "${tempThumbnailPath}"`, {
            stdio: 'inherit'
        });

        if (!fs.existsSync(tempThumbnailPath)) {
            console.error(`Thumbnail generation failed for ${videoFilename}`);
            return false;
        }

        console.log(`Thumbnail generated: ${tempThumbnailPath}`);

        // Upload thumbnail to CDN
        const uploaded = await uploadToBunnyCDN(tempThumbnailPath, thumbnailFilename);

        // Clean up temp files
        fs.unlink(tempVideoPath, () => {});
        fs.unlink(tempCompressedPath, () => {});
        fs.unlink(tempThumbnailPath, () => {});

        if (uploaded) {
            console.log(`Thumbnail ${thumbnailFilename} successfully uploaded to CDN`);
            return true;
        } else {
            console.error(`Failed to upload thumbnail ${thumbnailFilename} to CDN`);
            return false;
        }
    } catch (error) {
        console.error(`Error in ensureThumbnailOnCDN for ${videoFilename}:`, error.message);
        // Clean up temp files if they exist
        fs.unlink(tempVideoPath, () => {});
        fs.unlink(tempCompressedPath, () => {});
        fs.unlink(tempThumbnailPath, () => {});
        return false;
    }
}

// Scan videos directory and return video list with metadata
async function getVideos() {
    try {
        const files = fs.readdirSync(VIDEOS_DIR);
        const videos = [];
        const processedFiles = new Set(); // To avoid duplicates
        
        // Process files sequentially to handle async thumbnail generation
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            const baseName = path.basename(file, ext);
            
            // Sla _origineel.mp4 bestanden over
            if (ext === '.mp4' && file.endsWith('_origineel.mp4')) {
                continue;
            }
            
            // Check for .json files (metadata) - primary method when using CDN
            if (ext === '.json') {
                const videoFileName = baseName + '.mp4';
                
                // Skip if we've already processed this video
                if (processedFiles.has(videoFileName)) {
                    continue;
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
                
                // Check if thumbnail exists on CDN
                let hasThumbnail = false;
                if (USE_CDN) {
                    hasThumbnail = await checkThumbnailOnCDN(baseName + '.jpg');
                    
                    // If thumbnail doesn't exist, try to generate and upload it
                    if (!hasThumbnail && GENERATE_THUMBNAILS && UPLOAD_THUMBNAILS_TO_CDN) {
                        await ensureThumbnailOnCDN(videoFileName, baseName);
                        // Check again after generation
                        hasThumbnail = await checkThumbnailOnCDN(baseName + '.jpg');
                    }
                } else {
                    // For local mode, check if thumbnail file exists
                    const localThumbnailPath = path.join(VIDEOS_DIR, baseName + '.jpg');
                    hasThumbnail = fs.existsSync(localThumbnailPath);
                }
                
                // Use CDN URL for videos and thumbnails
                const publicVideoPath = USE_CDN ? `${CDN_BASE_URL}/${videoFileName}` : `/videos/${videoFileName}`;
                const publicThumbnailPath = USE_CDN ? `${CDN_BASE_URL}/${baseName}.jpg` : `/videos/${baseName}.jpg`;
                
                // Try to get file stats from CDN (not available for CDN files)
                let size = 0;
                let modified = new Date();
                
                // If local file exists (for test environments), use its stats
                const localVideoPath = path.join(VIDEOS_DIR, videoFileName);
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
                    hasThumbnail: hasThumbnail,
                    size: size,
                    modified: modified,
                    ...metadata
                });
            }
            // Also check for .mp4 files (for backward compatibility)
            else if (ext === '.mp4') {
                // Sla _origineel.mp4 bestanden over
                if (file.endsWith('_origineel.mp4')) {
                    continue;
                }
                
                const jsonFile = path.join(VIDEOS_DIR, baseName + '.json');
                const localVideoPath = path.join(VIDEOS_DIR, file);
                
                // Skip if we've already processed this video from its JSON file
                if (processedFiles.has(file)) {
                    continue;
                }
                processedFiles.add(file);
                
                // Check if thumbnail exists on CDN
                let hasThumbnail = false;
                if (USE_CDN) {
                    hasThumbnail = await checkThumbnailOnCDN(baseName + '.jpg');
                    
                    // If thumbnail doesn't exist, try to generate and upload it
                    if (!hasThumbnail && GENERATE_THUMBNAILS && UPLOAD_THUMBNAILS_TO_CDN) {
                        await ensureThumbnailOnCDN(file, baseName);
                        // Check again after generation
                        hasThumbnail = await checkThumbnailOnCDN(baseName + '.jpg');
                    }
                } else {
                    // For local mode, check if thumbnail file exists
                    const localThumbnailPath = path.join(VIDEOS_DIR, baseName + '.jpg');
                    hasThumbnail = fs.existsSync(localThumbnailPath);
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
                
                // Use CDN URL for videos and thumbnails
                const publicVideoPath = USE_CDN ? `${CDN_BASE_URL}/${file}` : `/videos/${file}`;
                const publicThumbnailPath = USE_CDN ? `${CDN_BASE_URL}/${baseName}.jpg` : `/videos/${baseName}.jpg`;
                
                videos.push({
                    filename: file,
                    basename: baseName,
                    path: publicVideoPath,
                    thumbnail: publicThumbnailPath,
                    hasThumbnail: hasThumbnail,
                    size: stats.size,
                    modified: stats.mtime,
                    ...metadata
                });
            }
        }
        
        // Sort by filename
        videos.sort((a, b) => a.filename.localeCompare(b.filename));
        
        return videos;
    } catch (error) {
        console.error('Error scanning videos directory:', error);
        return [];
    }
}

// API endpoint to get all videos with metadata
app.get('/api/videos', async (req, res) => {
    try {
        const videos = await getVideos();
        res.json(videos);
    } catch (error) {
        console.error('Error in /api/videos:', error);
        res.status(500).json({ error: 'Failed to get videos' });
    }
});

// API endpoint to get all unique tags
app.get('/api/tags', async (req, res) => {
    try {
        const videos = await getVideos();
        const tagsSet = new Set();
        
        videos.forEach(video => {
            if (video.tags && Array.isArray(video.tags)) {
                video.tags.forEach(tag => tagsSet.add(tag));
            }
        });
        
        const tags = Array.from(tagsSet).sort();
        res.json(tags);
    } catch (error) {
        console.error('Error in /api/tags:', error);
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
app.listen(PORT, async () => {
    console.log(`Barinstructies server running on port ${PORT}`);
    console.log(`Videos directory: ${VIDEOS_DIR}`);
    console.log(`CDN enabled: ${USE_CDN}, Base URL: ${CDN_BASE_URL}`);
    console.log(`Thumbnail generation: ${GENERATE_THUMBNAILS}, Upload to CDN: ${UPLOAD_THUMBNAILS_TO_CDN}`);
    
    // Log available videos at startup
    const videos = await getVideos();
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
