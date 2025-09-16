# Claude Code Instructions - Birthday Website Project

## Project Overview
Build a professional birthday website with a 3D photo carousel, video integration, interactive timeline, and a complete admin panel for content management. This is a Node.js/Express application with vanilla JavaScript frontend.

## Implementation Priority Order

### PHASE 1: Project Setup & Dependencies
1. **Create package.json** with all required dependencies from implementation.md
2. **Create project folder structure** exactly as specified in implementation.md
3. **Set up .env file** with environment variables
4. **Install all npm dependencies**

### PHASE 2: Core Frontend (Use Existing Code)
1. **Take the existing HTML file** (the birthday website with 3D carousel) and save it as `public/index.html`
2. **Extract CSS** from the HTML file and save as `public/css/main.css`
3. **Extract JavaScript** from the HTML file and save as `public/js/main.js`
4. **Update HTML** to reference external CSS and JS files
5. **Ensure all carousel functionality works** (30 photos, 3D rotation, auto-play, etc.)

### PHASE 3: Backend Server Setup
1. **Create Express server** (`server/server.js`) following the implementation guide
2. **Set up middleware** (cors, express.static, json parsing)
3. **Create route handlers** for API and upload endpoints
4. **Test server startup** and static file serving

### PHASE 4: Admin Panel Frontend
1. **Create admin.html** with the complete interface from implementation.md
2. **Create admin.css** with professional styling for the admin interface
3. **Create admin.js** with full AdminPanel class functionality
4. **Implement all admin features:**
   - Photo upload (drag & drop + click)
   - Video upload
   - Content management
   - Preview functionality
   - Tab switching

### PHASE 5: File Upload API
1. **Create upload routes** (`server/routes/upload.js`) with multer configuration
2. **Implement photo upload endpoint** with Sharp image processing
3. **Implement video upload endpoint**
4. **Create content management API** (`server/routes/api.js`)
5. **Add proper error handling** and validation

### PHASE 6: Integration & Data Flow
1. **Connect admin panel** to upload APIs
2. **Create database/JSON storage** for content metadata
3. **Update main website** to load real uploaded content
4. **Replace carousel placeholders** with dynamic photo loading
5. **Implement video source updating**

## Specific Implementation Requirements

### File Structure Requirements
```
birthday-website/
├── package.json
├── .env
├── server/
│   ├── server.js
│   ├── routes/
│   │   ├── api.js
│   │   └── upload.js
│   └── middleware/
│       └── auth.js
├── public/
│   ├── index.html (main birthday site)
│   ├── admin.html (admin panel)
│   ├── css/
│   │   ├── main.css (extracted from original HTML)
│   │   └── admin.css (admin panel styles)
│   ├── js/
│   │   ├── main.js (carousel + main site functionality)
│   │   └── admin.js (admin panel functionality)
│   └── uploads/
│       ├── photos/
│       └── videos/
└── README.md
```

### Technology Stack to Use
- **Backend:** Node.js, Express.js, Multer, Sharp, SQLite3
- **Frontend:** Vanilla JavaScript (no frameworks)
- **Styling:** Pure CSS with modern features
- **Icons:** Font Awesome CDN
- **Fonts:** Google Fonts (Inter, Playfair Display)

### Key Features to Implement

#### Main Website Features
- [] 3D Photo carousel 
- [x] Auto-play with progress bar
- [x] Mobile swipe support
- [x] Keyboard navigation
- [x] Video integration with play overlay
- [x] Interactive timeline
- [x] Fireworks animation
- [x] Responsive design

#### Admin Panel Features (TO BUILD)
- [ ] Simple authentication (password protection)
- [ ] Photo upload with drag & drop
- [ ] Photo management (captions, dates, reordering)
- [ ] Video upload and preview
- [ ] Timeline event editing
- [ ] Real-time preview functionality
- [ ] Batch operations (delete multiple photos)

#### Backend Features (TO BUILD)
- [ ] Express server with middleware
- [ ] File upload handling with validation
- [ ] Image processing and optimization
- [ ] Content storage (JSON file or SQLite)
- [ ] API endpoints for content management
- [ ] Error handling and logging

### Critical Implementation Notes

1. **Preserve Existing Functionality**: The 3D carousel and all animations must work exactly as they do now
2. **File Upload Limits**: Max 30 photos, 50MB per file
3. **Image Processing**: Auto-resize to 800x600, 85% JPEG quality
4. **Mobile Responsive**: Admin panel must work on tablets/phones
5. **Error Handling**: Comprehensive error handling for uploads and API calls
6. **Security**: Basic password protection for admin, file type validation

### Environment Variables Needed
```env
PORT=3000
NODE_ENV=development
UPLOAD_MAX_SIZE=50000000
ADMIN_PASSWORD=birthday2024
```

### npm Scripts Required
```json
{
  "scripts": {
    "start": "node server/server.js",
    "dev": "nodemon server/server.js",
    "test": "echo 'Tests coming soon'"
  }
}
```

### Dependencies to Install
```json
{
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

## Step-by-Step Execution Plan

### Step 1: Initialize Project
```bash
# Create package.json and install dependencies
npm init -y
# Update package.json with correct dependencies and scripts
npm install
```

### Step 2: Extract and Organize Frontend Code
- Take the provided HTML birthday website
- Split into separate HTML, CSS, and JS files
- Ensure all functionality remains intact
- Test carousel, animations, and responsiveness

### Step 3: Build Express Server
- Create basic server structure
- Add static file serving for public directory
- Create upload directories
- Test server startup

### Step 4: Create Admin Panel
- Build complete admin interface
- Implement file upload UI (drag/drop)
- Add photo management interface
- Style with professional CSS

### Step 5: Implement Upload APIs
- Create multer configuration
- Build photo upload endpoint with Sharp processing
- Build video upload endpoint
- Add content management endpoints

### Step 6: Connect Everything
- Link admin panel to backend APIs
- Update main site to load uploaded content
- Replace placeholders with real data
- Test full workflow

### Step 7: Testing & Polish
- Test all upload scenarios
- Verify mobile responsiveness
- Test error handling
- Final polish and optimization

## Success Criteria

The project is complete when:
1. ✅ Main website loads with working 3D carousel
2. ✅ Admin panel accessible at `/admin`
3. ✅ Photos can be uploaded via drag & drop or click
4. ✅ Uploaded photos appear in main site carousel
5. ✅ Video can be uploaded and plays on main site
6. ✅ All animations and interactions work perfectly
7. ✅ Mobile responsive on all devices
8. ✅ Error handling works for failed uploads
9. ✅ Content persists between server restarts

## Testing Commands

After implementation, these should all work:
```bash
npm install          # Install all dependencies
npm run dev         # Start development server
# Visit http://localhost:3000 (main site)
# Visit http://localhost:3000/admin (admin panel)
# Upload photos and videos
# Verify they appear on main site
```

## Common Issues to Avoid

1. **Don't break existing carousel**: Preserve all 3D effects and animations
2. **File path issues**: Ensure upload paths are correct
3. **CORS errors**: Proper CORS setup for API calls
4. **Image processing**: Sharp must handle various image formats
5. **Mobile upload**: Test file uploads on mobile devices
6. **Memory usage**: Large file uploads need proper handling

## Final Notes

- Follow the implementation.md guide for all technical details
- Use the existing birthday website HTML as the foundation
- Focus on creating a seamless user experience
- Ensure professional code quality and error handling
- Make the admin panel intuitive and user-friendly

**Priority: Get the admin panel working so photos can be uploaded and immediately appear in the beautiful 3D carousel on the main site!**