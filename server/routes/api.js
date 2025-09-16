const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const CONTENT_FILE = path.join(__dirname, '../content.json');

// Initialize content file if it doesn't exist
function initContentFile() {
    if (!fs.existsSync(CONTENT_FILE)) {
        const initialContent = {
            photos: [],
            video: null,
            timeline: [
                {
                    title: "The Beginning",
                    content: "That special moment when everything started. A beautiful beginning to an incredible story filled with laughter, joy, and endless possibilities."
                },
                {
                    title: "First Adventure",
                    content: "Our first big adventure together - exploring new places, creating memories, and discovering what makes life truly special."
                },
                {
                    title: "Milestone Moment",
                    content: "Celebrating achievements and supporting each other through every step. These moments remind us of the strength we find together."
                },
                {
                    title: "Today & Beyond",
                    content: "Here's to your birthday and all the amazing moments yet to come. The best chapters of our story are still being written."
                }
            ],
            messages: {
                heroTitle: "Happy Birthday Bryan!",
                heroSubtitle: "Celebrating another amazing year of your incredible journey",
                galleryTitle: "Our Beautiful Memories",
                gallerySubtitle: "A collection of moments that make life special",
                timelineTitle: "Our Journey Together",
                timelineSubtitle: "Milestones and memories that shaped our story",
                messageTitle: "Happy Birthday, Bryan! 🎂",
                messageText1: "You light up every room with your incredible energy and infectious smile.",
                messageText2: "Your kindness, humor, and zest for life inspire everyone around you.",
                messageText3: "May this new year bring you endless joy, exciting adventures, and all the success you deserve.",
                messageHighlight: "Here's to you, Bryan! May your special day be as amazing as you are! 🎉❤️"
            },
            colors: {
                primaryColor: "#6366f1",
                secondaryColor: "#8b5cf6",
                accentColor: "#f59e0b",
                heroTextColor: "#6366f1",
                sectionTitleColor: "#6366f1",
                messageTextColor: "#f59e0b",
                timelineDotColor: "#6366f1",
                timelineLineColor: "#6366f1",
                timelineTextColor: "#f8fafc"
            }
        };
        fs.writeFileSync(CONTENT_FILE, JSON.stringify(initialContent, null, 2));
    }
}

// Get all content
router.get('/content', (req, res) => {
    try {
        initContentFile();
        const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
        res.json(content);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save content
router.post('/content', (req, res) => {
    try {
        const content = req.body;
        fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete photo
router.delete('/photos/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const photoPath = path.join(__dirname, '../../public/uploads/photos', filename);
        
        if (fs.existsSync(photoPath)) {
            fs.unlinkSync(photoPath);
        }
        
        // Remove from content file
        initContentFile();
        const content = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
        content.photos = content.photos.filter(photo => 
            photo.original !== filename && photo.optimized !== filename
        );
        fs.writeFileSync(CONTENT_FILE, JSON.stringify(content, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;