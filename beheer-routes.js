const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const https = require('https');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const router = express.Router();

// Middleware for JSON and URL-encoded body parsing
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// ===== Configuration ==========
const VIDEOS_DIR = path.join(__dirname, 'videos');
const TEMP_DIR = path.join(__dirname, 'temp');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// CDN Configuration
const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.barinstructies.nl';
const USE_CDN = process.env.USE_CDN === 'false' ? false : true;
const GENERATE_THUMBNAILS = process.env.GENERATE_THUMBNAILS !== 'false';
const THUMBNAIL_WIDTH = process.env.THUMBNAIL_WIDTH || 320;
const THUMBNAIL_HEIGHT = process.env.THUMBNAIL_HEIGHT || 180;

// BunnyCDN Configuration
const BUNNYCDN_ACCESS_KEY = process.env.BUNNYCDN_ACCESS_KEY;
const BUNNYCDN_PASSWORD = process.env.BUNNYCDN_PASSWORD;
const BUNNYCDN_STORAGE_ZONE = process.env.BUNNYCDN_STORAGE_ZONE || 'instructievideos';
const BUNNYCDN_REGION_ENDPOINT = process.env.BUNNYCDN_REGION_ENDPOINT || 'https://storage.bunnycdn.com';
const UPLOAD_TO_CDN = BUNNYCDN_ACCESS_KEY && BUNNYCDN_PASSWORD && USE_CDN;

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Upload Configuration
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

// ===== Ensure Directories =====
if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ===== Initialize Users File =====
function initializeUsersFile() {
    if (!fs.existsSync(USERS_FILE)) {
        const defaultUsers = [
            {
                id: 'admin-1',
                username: 'admin',
                password: crypto.createHash('sha256').update('admin123').digest('hex'),
                role: 'admin',
                createdAt: new Date().toISOString()
            }
        ];
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        console.log('Default admin user created. Username: admin, Password: admin123');
    }
}

// ===== Authentication Middleware =====
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Geen autorisatietoken gevonden' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('JWT verification error:', error);
        return res.status(403).json({ 
            success: false, 
            message: 'Ongeldig of verlopen token' 
        });
    }
}

function authorize(roles = []) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Niet geauthenticeerd' 
            });
        }
        
        if (roles.length > 0 && !roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Onvoldoende rechten' 
            });
        }
        
        next();
    };
}

// ===== Rate Limiting =====
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login requests per windowMs
    message: { 
        success: false, 
        message: 'Te veel aanmeldpogingen. Probeer het over 15 minuten opnieuw.' 
    }
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each IP to 10 uploads per windowMs
    message: { 
        success: false, 
        message: 'Te veel uploads. Probeer het later opnieuw.' 
    }
});

// ===== Security Headers =====
router.use(helmet());
router.use((req, res, next) => {
    // Set security headers for beheer routes
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ===== Multer Configuration =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, TEMP_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Alleen videobestanden zijn toegestaan (MP4, WebM, QuickTime)'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE
    }
});

// ===== User Management Functions =====
function getUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users file:', error);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving users file:', error);
        return false;
    }
}

function findUserByUsername(username) {
    const users = getUsers();
    return users.find(user => user.username === username);
}

function findUserById(id) {
    const users = getUsers();
    return users.find(user => user.id === id);
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ===== Video Processing Functions =====
async function compressVideo(inputPath, outputPath) {
    return new Promise((resolve) => {
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' });
            
            console.log(`Compressing ${inputPath} to ${outputPath}...`);
            
            const command = `ffmpeg -i "${inputPath}" ` +
                `-vf "scale=640:480:force_original_aspect_ratio=decrease" ` +
                `-b:v 500k ` +
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

async function generateThumbnail(videoPath, outputPath) {
    return new Promise((resolve) => {
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' });
            
            console.log(`Generating thumbnail for ${videoPath}...`);
            
            const command = `ffmpeg -i "${videoPath}" ` +
                `-ss 00:00:01 ` +
                `-vframes 1 ` +
                `-q:v 2 ` +
                `-y -s ${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT} "${outputPath}"`;
            
            execSync(command, { stdio: 'inherit' });
            
            if (fs.existsSync(outputPath)) {
                console.log(`Thumbnail generated: ${outputPath}`);
                resolve(true);
            } else {
                console.error(`Thumbnail generation failed for ${videoPath}`);
                resolve(false);
            }
        } catch (error) {
            console.error(`Error generating thumbnail for ${videoPath}:`, error.message);
            resolve(false);
        }
    });
}

// ===== BunnyCDN Upload Functions =====
async function uploadToBunnyCDN(filePath, destinationFilename) {
    if (!UPLOAD_TO_CDN) {
        console.log('BunnyCDN upload skipped: no credentials configured');
        return true;
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

// ===== Routes =====

// Initialize users file on first request
router.use((req, res, next) => {
    initializeUsersFile();
    next();
});

// Login
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Gebruikersnaam en wachtwoord zijn verplicht' 
            });
        }
        
        const user = findUserByUsername(username);
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Ongeldige gebruikersnaam of wachtwoord' 
            });
        }
        
        const hashedPassword = hashPassword(password);
        
        if (user.password !== hashedPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Ongeldige gebruikersnaam of wachtwoord' 
            });
        }
        
        // Create JWT token
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        // Return user info without password
        const userToReturn = { ...user };
        delete userToReturn.password;
        
        res.json({ 
            success: true, 
            token, 
            user: userToReturn 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Serverfout bij aanmelden' 
        });
    }
});

// Logout
router.post('/logout', authenticate, (req, res) => {
    // JWT tokens are stateless, so logout is just a client-side action
    res.json({ success: true, message: 'Succesvol uitgelogd' });
});

// Check Authentication
router.get('/check-auth', authenticate, (req, res) => {
    const user = { ...req.user };
    // Add user details from database
    const fullUser = findUserByUsername(req.user.username);
    if (fullUser) {
        user.role = fullUser.role;
        user.id = fullUser.id;
    }
    
    res.json({ 
        authenticated: true, 
        user: {
            id: user.id,
            username: user.username,
            role: user.role
        } 
    });
});

// Get Users (Admin only)
router.get('/users', authenticate, authorize(['admin']), (req, res) => {
    try {
        const users = getUsers();
        // Remove passwords from response
        const usersToReturn = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        
        res.json({ 
            success: true, 
            users: usersToReturn 
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Serverfout bij ophalen van gebruikers' 
        });
    }
});

// Create User (Admin only)
router.post('/users', authenticate, authorize(['admin']), (req, res) => {
    try {
        const { username, password, role = 'user' } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Gebruikersnaam en wachtwoord zijn verplicht' 
            });
        }
        
        if (findUserByUsername(username)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Gebruikersnaam bestaat al' 
            });
        }
        
        const users = getUsers();
        const newUser = {
            id: `user-${Date.now()}`,
            username,
            password: hashPassword(password),
            role,
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        
        if (saveUsers(users)) {
            const { password, ...userToReturn } = newUser;
            res.status(201).json({ 
                success: true, 
                user: userToReturn 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Fout bij opslaan van gebruiker' 
            });
        }
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Serverfout bij aanmaken van gebruiker' 
        });
    }
});

// Update User (Admin only)
router.put('/users/:id', authenticate, authorize(['admin']), (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role } = req.body;
        
        const users = getUsers();
        const userIndex = users.findIndex(user => user.id === id);
        
        if (userIndex === -1) {
            return res.status(404).json({ 
                success: false, 
                message: 'Gebruiker niet gevonden' 
            });
        }
        
        const existingUser = users[userIndex];
        
        // Check if username is being changed to an existing username
        if (username && username !== existingUser.username && findUserByUsername(username)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Gebruikersnaam bestaat al' 
            });
        }
        
        // Update user
        const updatedUser = { ...existingUser };
        if (username) updatedUser.username = username;
        if (password) updatedUser.password = hashPassword(password);
        if (role) updatedUser.role = role;
        
        users[userIndex] = updatedUser;
        
        if (saveUsers(users)) {
            const { password, ...userToReturn } = updatedUser;
            res.json({ 
                success: true, 
                user: userToReturn 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Fout bij bijwerken van gebruiker' 
            });
        }
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Serverfout bij bijwerken van gebruiker' 
        });
    }
});

// Delete User (Admin only)
router.delete('/users/:id', authenticate, authorize(['admin']), (req, res) => {
    try {
        const { id } = req.params;
        
        // Prevent deleting the last admin
        const users = getUsers();
        const userToDelete = findUserById(id);
        
        if (!userToDelete) {
            return res.status(404).json({ 
                success: false, 
                message: 'Gebruiker niet gevonden' 
            });
        }
        
        const adminCount = users.filter(user => user.role === 'admin').length;
        
        if (userToDelete.role === 'admin' && adminCount <= 1) {
            return res.status(400).json({ 
                success: false, 
                message: 'Je kunt de laatste administrator niet verwijderen' 
            });
        }
        
        const filteredUsers = users.filter(user => user.id !== id);
        
        if (saveUsers(filteredUsers)) {
            res.json({ 
                success: true, 
                message: 'Gebruiker succesvol verwijderd' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                message: 'Fout bij verwijderen van gebruiker' 
            });
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Serverfout bij verwijderen van gebruiker' 
        });
    }
});

// Get Tags
router.get('/tags', authenticate, async (req, res) => {
    try {
        const files = fs.readdirSync(VIDEOS_DIR);
        const tags = new Set();
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const jsonData = fs.readFileSync(path.join(VIDEOS_DIR, file), 'utf8');
                    const metadata = JSON.parse(jsonData);
                    if (metadata.tags && Array.isArray(metadata.tags)) {
                        metadata.tags.forEach(tag => tags.add(tag));
                    }
                } catch (e) {
                    console.error(`Error reading metadata for ${file}:`, e.message);
                }
            }
        }
        
        res.json(Array.from(tags).sort());
    } catch (error) {
        console.error('Error getting tags:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Fout bij ophalen van tags' 
        });
    }
});

// Get Settings
router.get('/settings', authenticate, (req, res) => {
    res.json({
        success: true,
        cdnEnabled: USE_CDN,
        thumbnailGeneration: GENERATE_THUMBNAILS,
        videoCompression: true,
        maxFileSize: MAX_FILE_SIZE,
        allowedTypes: ALLOWED_VIDEO_TYPES
    });
});

// Upload Video
router.post('/upload', authenticate, uploadLimiter, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'Geen videobestand geüpload' 
            });
        }
        
        const { title, description = '', tags = '[]' } = req.body;
        
        if (!title) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                success: false, 
                message: 'Titel is verplicht' 
            });
        }
        
        let parsedTags;
        try {
            parsedTags = JSON.parse(tags);
            if (!Array.isArray(parsedTags)) {
                parsedTags = [];
            }
        } catch (e) {
            parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        }
        
        if (parsedTags.length === 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                success: false, 
                message: 'Minimaal 1 tag is verplicht' 
            });
        }
        
        const tempVideoPath = req.file.path;
        const originalFilename = req.file.originalname;
        const ext = path.extname(originalFilename).toLowerCase();
        const baseName = path.basename(originalFilename, ext);
        const safeBaseName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
        const finalFilename = `${safeBaseName}_${Date.now()}${ext}`;
        const finalVideoPath = path.join(VIDEOS_DIR, finalFilename);
        const thumbnailFilename = `${safeBaseName}_${Date.now()}.jpg`;
        const thumbnailPath = path.join(VIDEOS_DIR, thumbnailFilename);
        const metadataPath = path.join(VIDEOS_DIR, `${safeBaseName}_${Date.now()}.json`);
        
        // Step 1: Compress video
        const compressedFilename = `compressed_${finalFilename}`;
        const compressedPath = path.join(TEMP_DIR, compressedFilename);
        
        let compressedSuccess = true;
        if (GENERATE_THUMBNAILS) {
            compressedSuccess = await compressVideo(tempVideoPath, compressedPath);
        }
        
        // Step 2: Generate thumbnail
        let thumbnailSuccess = true;
        if (GENERATE_THUMBNAILS) {
            const thumbnailSource = compressedSuccess ? compressedPath : tempVideoPath;
            thumbnailSuccess = await generateThumbnail(thumbnailSource, thumbnailPath);
        }
        
        // Step 3: Save metadata
        const metadata = {
            title,
            description,
            tags: parsedTags,
            filename: finalFilename,
            basename: safeBaseName,
            originalFilename,
            uploadedAt: new Date().toISOString(),
            uploadedBy: req.user.username
        };
        
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        
        // Step 4: Move or copy files to final destination
        let finalVideoToUse = compressedSuccess ? compressedPath : tempVideoPath;
        
        // Copy to videos directory
        fs.copyFileSync(finalVideoToUse, finalVideoPath);
        
        // Step 5: Upload to CDN if enabled
        let cdnUploadSuccess = true;
        let cdnThumbnailSuccess = true;
        
        if (UPLOAD_TO_CDN) {
            // Upload compressed video to CDN
            cdnUploadSuccess = await uploadToBunnyCDN(
                finalVideoToUse, 
                finalFilename
            );
            
            // Upload thumbnail to CDN
            if (thumbnailSuccess) {
                cdnThumbnailSuccess = await uploadToBunnyCDN(
                    thumbnailPath, 
                    thumbnailFilename
                );
            }
        }
        
        // Step 6: Clean up temp files
        fs.unlinkSync(tempVideoPath);
        if (compressedSuccess) {
            fs.unlinkSync(compressedPath);
        }
        
        // Prepare response
        const result = {
            success: true,
            message: 'Video succesvol geüpload en verwerkt',
            video: {
                filename: finalFilename,
                title,
                description,
                tags: parsedTags,
                path: USE_CDN ? `${CDN_BASE_URL}/${finalFilename}` : `/videos/${finalFilename}`,
                thumbnail: USE_CDN ? `${CDN_BASE_URL}/${thumbnailFilename}` : `/videos/${thumbnailFilename}`,
                hasThumbnail: thumbnailSuccess && (USE_CDN ? cdnThumbnailSuccess : true),
                size: fs.statSync(finalVideoPath).size,
                uploadedAt: new Date().toISOString()
            },
            processing: {
                compressed: compressedSuccess,
                thumbnailGenerated: thumbnailSuccess,
                cdnUpload: cdnUploadSuccess,
                cdnThumbnailUpload: cdnThumbnailSuccess
            }
        };
        
        res.json(result);
        
    } catch (error) {
        console.error('Upload error:', error);
        
        // Clean up any uploaded files
        if (req.file && req.file.path) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Fout bij uploaden van video' 
        });
    }
});

// Delete Video
router.delete('/videos/:filename', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { filename } = req.params;
        const videoPath = path.join(VIDEOS_DIR, filename);
        const baseName = path.basename(filename, path.extname(filename));
        const thumbnailPath = path.join(VIDEOS_DIR, baseName + '.jpg');
        const metadataPath = path.join(VIDEOS_DIR, baseName + '.json');
        
        // Check if file exists
        if (!fs.existsSync(videoPath)) {
            return res.status(404).json({ 
                success: false, 
                message: 'Video niet gevonden' 
            });
        }
        
        // Delete files
        fs.unlinkSync(videoPath);
        
        if (fs.existsSync(thumbnailPath)) {
            fs.unlinkSync(thumbnailPath);
        }
        
        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }
        
        // Delete from CDN if enabled
        if (UPLOAD_TO_CDN) {
            // Note: BunnyCDN doesn't have a delete API through storage endpoint
            // This would need to be done through the BunnyCDN dashboard or API
            console.log(`Note: Video ${filename} should be deleted from CDN manually`);
        }
        
        res.json({ 
            success: true, 
            message: 'Video succesvol verwijderd' 
        });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Fout bij verwijderen van video' 
        });
    }
});

// Get Video List (for beheer)
router.get('/videos', authenticate, async (req, res) => {
    try {
        const files = fs.readdirSync(VIDEOS_DIR);
        const videos = [];
        const processedFiles = new Set();
        
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            const baseName = path.basename(file, ext);
            
            // Skip _origineel.mp4 files
            if (ext === '.mp4' && file.endsWith('_origineel.mp4')) {
                continue;
            }
            
            // Check for .json files (metadata)
            if (ext === '.json') {
                const videoFileName = baseName + '.mp4';
                
                if (processedFiles.has(videoFileName)) {
                    continue;
                }
                processedFiles.add(videoFileName);
                
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
                
                const localVideoPath = path.join(VIDEOS_DIR, videoFileName);
                const hasThumbnail = fs.existsSync(path.join(VIDEOS_DIR, baseName + '.jpg'));
                
                const stats = fs.existsSync(localVideoPath) ? fs.statSync(localVideoPath) : { size: 0, mtime: new Date() };
                
                const publicVideoPath = USE_CDN ? `${CDN_BASE_URL}/${videoFileName}` : `/videos/${videoFileName}`;
                const publicThumbnailPath = USE_CDN ? `${CDN_BASE_URL}/${baseName}.jpg` : `/videos/${baseName}.jpg`;
                
                videos.push({
                    filename: videoFileName,
                    basename: baseName,
                    path: publicVideoPath,
                    thumbnail: publicThumbnailPath,
                    hasThumbnail: hasThumbnail,
                    size: stats.size,
                    modified: stats.mtime,
                    ...metadata
                });
            }
            // Also check for .mp4 files (for backward compatibility)
            else if (ext === '.mp4') {
                if (file.endsWith('_origineel.mp4')) {
                    continue;
                }
                
                const jsonFile = path.join(VIDEOS_DIR, baseName + '.json');
                const localVideoPath = path.join(VIDEOS_DIR, file);
                
                if (processedFiles.has(file)) {
                    continue;
                }
                processedFiles.add(file);
                
                const hasThumbnail = fs.existsSync(path.join(VIDEOS_DIR, baseName + '.jpg'));
                const stats = fs.statSync(localVideoPath);
                
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
        
        videos.sort((a, b) => a.filename.localeCompare(b.filename));
        
        res.json(videos);
    } catch (error) {
        console.error('Error getting videos:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Fout bij ophalen van video\'s' 
        });
    }
});

// ===== Export Router =====
module.exports = {
    router,
    authenticate,
    authorize,
    JWT_SECRET,
    initializeUsersFile
};
