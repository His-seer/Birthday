# Birthday Website Implementation Guide

## Overview
Professional birthday celebration website with 3D photo carousel, video integration, timeline, and admin panel for content management.

## Project Structure
```
birthday-website/
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── css/
│   │   ├── main.css
│   │   └── admin.css
│   ├── js/
│   │   ├── main.js
│   │   ├── carousel.js
│   │   └── admin.js
│   ├── uploads/
│   │   ├── photos/
│   │   └── videos/
│   └── assets/
│       └── icons/
├── server/
│   ├── server.js
│   ├── routes/
│   │   ├── api.js
│   │   └── upload.js
│   ├── middleware/
│   │   └── auth.js
│   └── models/
│       └── content.js
├── package.json
├── .env
└── README.md
```

## Technology Stack

### Frontend
- **HTML5/CSS3**: Modern responsive design
- **Vanilla JavaScript**: For interactivity and animations
- **Font Awesome**: Icons and visual elements
- **Google Fonts**: Typography (Inter, Playfair Display)

### Backend (for Admin Panel)
- **Node.js**: Server runtime
- **Express.js**: Web framework
- **Multer**: File upload handling
- **Sharp**: Image processing and optimization
- **SQLite/MongoDB**: Content management database

### Features to Implement

## Phase 1: Core Frontend
- [x] Responsive layout with navigation
- [x] Hero section with video placeholder
- [] 3D Photo carousel (30 photos placeholders)
- [x] Interactive timeline
- [x] Birthday message section
- [x] Fireworks and confetti animations

## Phase 2: Admin Panel
- [ ] Authentication system (simple login)
- [ ] Photo upload interface
- [ ] Video upload functionality
- [ ] Content management (captions, dates)
- [ ] Preview functionality
- [ ] Batch operations

## Phase 3: Backend Integration
- [ ] REST API for content management
- [ ] File storage and optimization
- [ ] Database integration
- [ ] Content validation
- [ ] Error handling

## Implementation Steps

### Step 1: Setup Development Environment
```bash
# Create project directory
mkdir birthday-website && cd birthday-website

# Initialize npm project
npm init -y

# Install dependencies
npm install express multer sharp sqlite3 dotenv cors
npm install --save-dev nodemon concurrently
```

### Step 2: Basic Server Setup
Create `server/server.js`:
```javascript
const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api', require('./routes/api'));
app.use('/upload', require('./routes/upload'));

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

### Step 3: Admin Panel Interface
Create `public/admin.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Birthday Website Admin</title>
    <link rel="stylesheet" href="css/admin.css">
</head>
<body>
    <div class="admin-container">
        <header class="admin-header">
            <h1>Birthday Website Admin</h1>
            <button id="previewBtn">Preview Site</button>
        </header>
        
        <div class="admin-tabs">
            <button class="tab-btn active" data-tab="photos">Photos</button>
            <button class="tab-btn" data-tab="video">Video</button>
            <button class="tab-btn" data-tab="timeline">Timeline</button>
        </div>
        
        <!-- Photo Management Tab -->
        <div class="tab-content active" id="photos-tab">
            <div class="upload-section">
                <h2>Photo Gallery (30 photos max)</h2>
                <div class="drop-zone" id="photoDropZone">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Drag & drop photos here or click to browse</p>
                    <input type="file" id="photoInput" multiple accept="image/*">
                </div>
                <div class="photo-grid" id="photoGrid">
                    <!-- Photos will be dynamically loaded here -->
                </div>
            </div>
        </div>
        
        <!-- Video Management Tab -->
        <div class="tab-content" id="video-tab">
            <div class="upload-section">
                <h2>Birthday Video</h2>
                <div class="drop-zone" id="videoDropZone">
                    <i class="fas fa-video"></i>
                    <p>Upload birthday message video</p>
                    <input type="file" id="videoInput" accept="video/*">
                </div>
                <div id="videoPreview"></div>
            </div>
        </div>
        
        <!-- Timeline Management Tab -->
        <div class="tab-content" id="timeline-tab">
            <div class="timeline-editor">
                <h2>Timeline Events</h2>
                <button id="addTimelineEvent">Add New Event</button>
                <div id="timelineEvents">
                    <!-- Timeline events editor -->
                </div>
            </div>
        </div>
    </div>
    
    <script src="js/admin.js"></script>
</body>
</html>
```

### Step 4: File Upload API
Create `server/routes/upload.js`:
```javascript
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = file.mimetype.startsWith('image/') 
            ? 'public/uploads/photos' 
            : 'public/uploads/videos';
        
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
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Upload photos endpoint
router.post('/photos', upload.array('photos', 30), async (req, res) => {
    try {
        const processedFiles = [];
        
        for (const file of req.files) {
            // Optimize images with Sharp
            const optimizedPath = path.join(
                'public/uploads/photos',
                'opt-' + file.filename
            );
            
            await sharp(file.path)
                .resize(800, 600, { fit: 'cover' })
                .jpeg({ quality: 85 })
                .toFile(optimizedPath);
            
            processedFiles.push({
                original: file.filename,
                optimized: 'opt-' + file.filename,
                caption: req.body.captions?.[processedFiles.length] || '',
                date: req.body.dates?.[processedFiles.length] || ''
            });
        }
        
        // Save to database or JSON file
        // TODO: Implement database storage
        
        res.json({ 
            success: true, 
            files: processedFiles 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Upload video endpoint
router.post('/video', upload.single('video'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'No video file provided' 
            });
        }
        
        // TODO: Process video if needed
        
        res.json({ 
            success: true, 
            filename: req.file.filename 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;
```

### Step 5: Admin Panel JavaScript
Create `public/js/admin.js`:
```javascript
class AdminPanel {
    constructor() {
        this.currentTab = 'photos';
        this.photos = [];
        this.video = null;
        
        this.initializeEventListeners();
        this.loadExistingContent();
    }
    
    initializeEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Photo upload
        const photoInput = document.getElementById('photoInput');
        const photoDropZone = document.getElementById('photoDropZone');
        
        photoDropZone.addEventListener('click', () => photoInput.click());
        photoInput.addEventListener('change', (e) => this.handlePhotoUpload(e.files));
        
        // Drag and drop
        photoDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            photoDropZone.classList.add('drag-over');
        });
        
        photoDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            photoDropZone.classList.remove('drag-over');
            this.handlePhotoUpload(e.dataTransfer.files);
        });
        
        // Video upload
        const videoInput = document.getElementById('videoInput');
        videoInput.addEventListener('change', (e) => this.handleVideoUpload(e.files[0]));
        
        // Preview button
        document.getElementById('previewBtn').addEventListener('click', () => {
            window.open('/', '_blank');
        });
    }
    
    switchTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
        
        this.currentTab = tabName;
    }
    
    async handlePhotoUpload(files) {
        if (files.length === 0) return;
        
        const formData = new FormData();
        for (const file of files) {
            formData.append('photos', file);
        }
        
        try {
            const response = await fetch('/upload/photos', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.photos = [...this.photos, ...result.files];
                this.renderPhotoGrid();
                this.showNotification('Photos uploaded successfully!', 'success');
            } else {
                this.showNotification('Upload failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Upload failed: ' + error.message, 'error');
        }
    }
    
    async handleVideoUpload(file) {
        if (!file) return;
        
        const formData = new FormData();
        formData.append('video', file);
        
        try {
            const response = await fetch('/upload/video', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.video = result.filename;
                this.renderVideoPreview();
                this.showNotification('Video uploaded successfully!', 'success');
            } else {
                this.showNotification('Upload failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Upload failed: ' + error.message, 'error');
        }
    }
    
    renderPhotoGrid() {
        const grid = document.getElementById('photoGrid');
        grid.innerHTML = '';
        
        this.photos.forEach((photo, index) => {
            const photoCard = document.createElement('div');
            photoCard.className = 'photo-card';
            photoCard.innerHTML = `
                <img src="/uploads/photos/${photo.optimized}" alt="Photo ${index + 1}">
                <div class="photo-controls">
                    <input type="text" placeholder="Caption" value="${photo.caption}" 
                           onchange="admin.updatePhotoCaption(${index}, this.value)">
                    <input type="text" placeholder="Date" value="${photo.date}"
                           onchange="admin.updatePhotoDate(${index}, this.value)">
                    <button onclick="admin.deletePhoto(${index})" class="delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            grid.appendChild(photoCard);
        });
    }
    
    renderVideoPreview() {
        const preview = document.getElementById('videoPreview');
        preview.innerHTML = `
            <video controls style="width: 100%; max-width: 500px;">
                <source src="/uploads/videos/${this.video}" type="video/mp4">
            </video>
            <button onclick="admin.deleteVideo()" class="delete-btn">Remove Video</button>
        `;
    }
    
    updatePhotoCaption(index, caption) {
        this.photos[index].caption = caption;
        this.saveContent();
    }
    
    updatePhotoDate(index, date) {
        this.photos[index].date = date;
        this.saveContent();
    }
    
    deletePhoto(index) {
        if (confirm('Are you sure you want to delete this photo?')) {
            this.photos.splice(index, 1);
            this.renderPhotoGrid();
            this.saveContent();
        }
    }
    
    deleteVideo() {
        if (confirm('Are you sure you want to remove the video?')) {
            this.video = null;
            document.getElementById('videoPreview').innerHTML = '';
            this.saveContent();
        }
    }
    
    async saveContent() {
        try {
            const response = await fetch('/api/content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    photos: this.photos,
                    video: this.video
                })
            });
            
            if (response.ok) {
                this.showNotification('Content saved!', 'success');
            }
        } catch (error) {
            this.showNotification('Save failed: ' + error.message, 'error');
        }
    }
    
    async loadExistingContent() {
        try {
            const response = await fetch('/api/content');
            if (response.ok) {
                const content = await response.json();
                this.photos = content.photos || [];
                this.video = content.video || null;
                
                this.renderPhotoGrid();
                if (this.video) this.renderVideoPreview();
            }
        } catch (error) {
            console.error('Failed to load existing content:', error);
        }
    }
    
    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize admin panel when DOM is loaded
const admin = new AdminPanel();
```

### Step 6: Package.json Scripts
```json
{
  "name": "birthday-website",
  "version": "1.0.0",
  "scripts": {
    "start": "node server/server.js",
    "dev": "nodemon server/server.js",
    "build": "echo 'No build step needed for vanilla JS'",
    "test": "echo 'Tests coming soon'"
  },
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.32.6",
    "sqlite3": "^5.1.6",
    "dotenv": "^16.3.1",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

### Step 7: Environment Configuration
Create `.env`:
```env
PORT=3000
NODE_ENV=development
UPLOAD_MAX_SIZE=50000000
ADMIN_PASSWORD=your-secure-password-here
```

## Deployment Instructions

### Development
```bash
npm install
npm run dev
# Visit http://localhost:3000 for main site
# Visit http://localhost:3000/admin for admin panel
```

### Production
```bash
# Build for production
npm start

# Or use PM2 for process management
npm install -g pm2
pm2 start server/server.js --name birthday-website
```

## Security Considerations
- Add authentication middleware for admin routes
- Implement file type validation
- Add rate limiting for uploads
- Use HTTPS in production
- Sanitize user inputs
- Regular backup of uploaded content

## Future Enhancements
- User authentication system
- Image compression and thumbnails
- Video processing and optimization
- Content backup and restore
- Analytics and visitor tracking
- Social media sharing integration

## Troubleshooting
- Check file permissions for upload directories
- Verify Sharp installation for image processing
- Monitor server logs for upload errors
- Test with different file types and sizes