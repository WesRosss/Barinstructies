const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// ===== Configuration =====
const STATIC_DIR = path.join(__dirname, 'public');
const VIDEOS_DIR = path.join(__dirname, 'videos');

// BunnyCDN Configuration
const BUNNYCDN_ACCESS_KEY = process.env.BUNNYCDN_ACCESS_KEY;
const BUNNYCDN_PASSWORD = process.env.BUNNYCDN_PASSWORD;
const BUNNYCDN_STORAGE_ZONE = process.env.BUNNYCDN_STORAGE_ZONE || 'instructievideos';
const BUNNYCDN_REGION_ENDPOINT = process.env.BUNNYCDN_REGION_ENDPOINT || 'https://storage.bunnycdn.com';
const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.barinstructies.nl';

// Only run if BunnyCDN credentials are configured
if (!BUNNYCDN_ACCESS_KEY || !BUNNYCDN_PASSWORD) {
    console.log('BunnyCDN credentials not configured. Skipping static files upload.');
    console.log('Set BUNNYCDN_ACCESS_KEY and BUNNYCDN_PASSWORD environment variables to enable.');
    process.exit(0);
}

// ===== File Types to Upload =====
const STATIC_FILE_TYPES = [
    '.css',
    '.js',
    '.html',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.svg',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.ico',
    '.json'
];

const VIDEO_FILE_TYPES = [
    '.mp4',
    '.webm',
    '.mov',
    '.avi'
];

// ===== Upload Functions =====
function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            getAllFiles(filePath, fileList);
        } else {
            fileList.push(filePath);
        }
    });
    
    return fileList;
}

function filterFilesByExtension(files, extensions) {
    return files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return extensions.includes(ext);
    });
}

function getRelativePath(filePath, baseDir) {
    return path.relative(baseDir, filePath);
}

function getCDNPath(filePath, baseDir) {
    const relativePath = getRelativePath(filePath, baseDir);
    // Replace backslashes with forward slashes for CDN
    return relativePath.replace(/\\/g, '/');
}

async function uploadToBunnyCDN(filePath, destinationPath) {
    return new Promise((resolve) => {
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return resolve(false);
        }
        
        const fileContent = fs.readFileSync(filePath);
        const fileSize = fs.statSync(filePath).size;
        
        const uploadUrl = `${BUNNYCDN_REGION_ENDPOINT}/${BUNNYCDN_STORAGE_ZONE}/${destinationPath}`;
        
        const options = {
            hostname: new URL(uploadUrl).hostname,
            path: new URL(uploadUrl).pathname,
            method: 'PUT',
            headers: {
                'AccessKey': BUNNYCDN_ACCESS_KEY,
                'Content-Type': getContentType(filePath),
                'Content-Length': fileSize
            },
            auth: `${BUNNYCDN_ACCESS_KEY}:${BUNNYCDN_PASSWORD}`
        };
        
        console.log(`Uploading ${destinationPath} to BunnyCDN...`);
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✓ Successfully uploaded ${destinationPath}`);
                    resolve(true);
                } else {
                    console.error(`✗ Failed to upload ${destinationPath}. Status: ${res.statusCode}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`✗ Error uploading ${destinationPath}:`, error.message);
            resolve(false);
        });
        
        req.write(fileContent);
        req.end();
    });
}

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.ico': 'image/x-icon',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
}

// ===== Main Upload Function =====
async function uploadStaticFiles() {
    console.log('Starting static files upload to BunnyCDN...');
    console.log(`Storage Zone: ${BUNNYCDN_STORAGE_ZONE}`);
    console.log(`CDN Base URL: ${CDN_BASE_URL}`);
    
    const staticFiles = getAllFiles(STATIC_DIR);
    const staticFilesToUpload = filterFilesByExtension(staticFiles, STATIC_FILE_TYPES);
    
    console.log(`\nFound ${staticFilesToUpload.length} static files to upload.`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const filePath of staticFilesToUpload) {
        const cdnPath = getCDNPath(filePath, STATIC_DIR);
        const uploaded = await uploadToBunnyCDN(filePath, cdnPath);
        
        if (uploaded) {
            successCount++;
        } else {
            failCount++;
        }
    }
    
    // Upload videos if configured
    if (fs.existsSync(VIDEOS_DIR)) {
        const videoFiles = getAllFiles(VIDEOS_DIR);
        const videoFilesToUpload = filterFilesByExtension(videoFiles, VIDEO_FILE_TYPES);
        
        console.log(`\nFound ${videoFilesToUpload.length} video files to upload.`);
        
        for (const filePath of videoFilesToUpload) {
            const cdnPath = getCDNPath(filePath, VIDEOS_DIR);
            const uploaded = await uploadToBunnyCDN(filePath, cdnPath);
            
            if (uploaded) {
                successCount++;
            } else {
                failCount++;
            }
        }
    }
    
    console.log(`\nUpload complete:`);
    console.log(`✓ Successful: ${successCount}`);
    console.log(`✗ Failed: ${failCount}`);
    
    return { success: successCount, failed: failCount };
}

// ===== File Replacement Function =====
function replaceLocalReferences() {
    console.log('\nReplacing local references with CDN URLs...');
    
    const filesToUpdate = [
        path.join(STATIC_DIR, 'index.html'),
        path.join(STATIC_DIR, 'beheer.html'),
        ...getAllFiles(STATIC_DIR).filter(f => 
            f.endsWith('.html') || f.endsWith('.css') || f.endsWith('.js')
        )
    ];
    
    let replacementsMade = 0;
    
    filesToUpdate.forEach(filePath => {
        if (!fs.existsSync(filePath)) return;
        
        try {
            let content = fs.readFileSync(filePath, 'utf8');
            let originalContent = content;
            
            // Replace CSS references
            content = content.replace(
                /href="(beheer-style\.css|style\.css)"/g,
                `href="${CDN_BASE_URL}/$1"`
            );
            
            // Replace JS references
            content = content.replace(
                /src="(beheer-script\.js|script\.js)"/g,
                `src="${CDN_BASE_URL}/$1"`
            );
            
            // Replace image references
            content = content.replace(
                /(src|href)="(images\/|[^"\/]+\.(png|jpg|jpeg|gif|svg|ico))/g,
                `$1="${CDN_BASE_URL}/$2`
            );
            
            // Replace video references
            content = content.replace(
                /(src|poster)="(videos\/|[^"\/]+\.mp4|[^"\/]+\.webm)/g,
                `$1="${CDN_BASE_URL}/$2`
            );
            
            // Replace logo reference
            content = content.replace(
                'https://storage.knltb.club/logos/425815f0-b74b-47a4-85b2-44a53ffbfb07.jpg',
                `${CDN_BASE_URL}/logo.jpg`
            );
            
            if (content !== originalContent) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`✓ Updated references in ${path.relative(STATIC_DIR, filePath)}`);
                replacementsMade++;
            }
        } catch (error) {
            console.error(`✗ Error updating ${filePath}:`, error.message);
        }
    });
    
    console.log(`Replaced local references in ${replacementsMade} files.`);
    return replacementsMade;
}

// ===== Main Execution =====
(async () => {
    try {
        console.log('=== BunnyCDN Static Files Upload ===\n');
        
        // Step 1: Upload all static files to CDN
        const uploadResult = await uploadStaticFiles();
        
        // Step 2: Replace local references with CDN URLs
        if (uploadResult.success > 0) {
            const replaceResult = replaceLocalReferences();
            console.log(`\n=== Process Complete ===`);
            console.log(`Files uploaded: ${uploadResult.success}`);
            console.log(`References updated: ${replaceResult}`);
        } else {
            console.log('\nNo files were uploaded. Check your configuration.');
        }
        
        console.log('\nNote: After uploading, you may need to:');
        console.log('1. Purge the BunnyCDN cache if files were previously cached');
        console.log('2. Restart your server to apply the updated HTML/CSS/JS files');
        console.log('3. Set USE_CDN=true in your environment variables');
        
    } catch (error) {
        console.error('Error during CDN upload:', error);
        process.exit(1);
    }
})();
