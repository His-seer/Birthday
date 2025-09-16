const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const CONTENT_FILE = path.join(__dirname, '../content.json');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadDir;
        if (file.fieldname === 'timelineImage' || file.fieldname === 'timelineVideo') {
            uploadDir = 'public/uploads/timeline';
        } else if (file.mimetype.startsWith('image/')) {
            uploadDir = 'public/uploads/photos';
        } else {
            uploadDir = 'public/uploads/videos';
        }
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage,
    limits: {
        fileSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 100 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed'));
        }
    }
});

// Upload photos endpoint
router.post('/photos', upload.array('photos', 30), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No files uploaded' });
        }

        const processedFiles = [];
        
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            const optimizedFilename = 'opt-' + file.filename;
            const optimizedPath = path.join('public/uploads/photos', optimizedFilename);
            
            // Optimize images with Sharp
            await sharp(file.path)
                .resize(800, 600, { fit: 'cover', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toFile(optimizedPath);
            
            processedFiles.push({
                original: file.filename,
                optimized: optimizedFilename,
                caption: req.body.captions?.[i] || '',
                date: req.body.dates?.[i] || new Date().toLocaleDateString()
            });
        }
        
        // Save to content file
        let content;
        try {
            content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
        } catch (error) {
            content = { photos: [], video: null, timeline: [] };
        }
        
        content.photos = [...(content.photos || []), ...processedFiles];
        fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));
        
        res.json({ success: true, files: processedFiles });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload video endpoint
router.post('/video', upload.single('video'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No video file provided' });
        }
        
        // Save to content file
        let content;
        try {
            content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
        } catch (error) {
            content = { photos: [], video: null, timeline: [] };
        }
        
        content.video = req.file.filename;
        fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));
        
        res.json({ success: true, filename: req.file.filename });
    } catch (error) {
        console.error('Video upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload timeline image endpoint
router.post('/timeline', upload.single('timelineImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No timeline image provided' });
        }
        
        const optimizedFilename = 'timeline-' + req.file.filename;
        const optimizedPath = path.join('public/uploads/timeline', optimizedFilename);
        
        // Optimize timeline images with Sharp
        await sharp(req.file.path)
            .resize(400, 300, { fit: 'cover', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toFile(optimizedPath);
        
        // Remove original file
        fs.unlinkSync(req.file.path);
        
        res.json({ success: true, filename: optimizedFilename });
    } catch (error) {
        console.error('Timeline image upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Upload timeline video endpoint
router.post('/timeline-video', upload.single('timelineVideo'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No timeline video provided' });
        }
        
        // Move video to timeline folder
        const timelineVideoPath = path.join('public/uploads/timeline', req.file.filename);
        fs.renameSync(req.file.path, timelineVideoPath);
        
        res.json({ success: true, filename: req.file.filename });
    } catch (error) {
        console.error('Timeline video upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;