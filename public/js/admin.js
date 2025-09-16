class AdminPanel {
    constructor() {
        this.currentTab = 'photos';
        this.photos = [];
        this.video = null;
        this.timeline = [];
        this.messages = {};
        this.colors = {};
        
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
        photoInput.addEventListener('change', (e) => this.handlePhotoUpload(e.target.files));
        
        // Photo drag and drop
        photoDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            photoDropZone.classList.add('drag-over');
        });
        
        photoDropZone.addEventListener('dragleave', () => {
            photoDropZone.classList.remove('drag-over');
        });
        
        photoDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            photoDropZone.classList.remove('drag-over');
            this.handlePhotoUpload(e.dataTransfer.files);
        });
        
        // Video upload
        const videoInput = document.getElementById('videoInput');
        const videoDropZone = document.getElementById('videoDropZone');
        
        videoDropZone.addEventListener('click', () => videoInput.click());
        videoInput.addEventListener('change', (e) => this.handleVideoUpload(e.target.files[0]));
        
        // Video drag and drop
        videoDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            videoDropZone.classList.add('drag-over');
        });
        
        videoDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            videoDropZone.classList.remove('drag-over');
            this.handleVideoUpload(e.dataTransfer.files[0]);
        });
        
        // Preview button
        document.getElementById('previewBtn').addEventListener('click', () => {
            window.open('/', '_blank');
        });
        
        // Clear all photos
        document.getElementById('clearAllPhotos').addEventListener('click', () => {
            this.clearAllPhotos();
        });
        
        // Add timeline event
        document.getElementById('addTimelineEvent').addEventListener('click', () => {
            this.addTimelineEvent();
        });
        
        // Messages tab handlers
        document.getElementById('saveMessages').addEventListener('click', () => {
            this.saveMessages();
        });
        
        document.getElementById('previewMessages').addEventListener('click', () => {
            this.previewMessages();
        });
        
        // Auto-save on text input changes
        const textInputs = ['heroTitle', 'heroSubtitle', 'galleryTitle', 'gallerySubtitle', 
                           'timelineTitle', 'timelineSubtitle', 'messageTitle', 'messageText1', 
                           'messageText2', 'messageText3', 'messageHighlight'];
        
        textInputs.forEach(inputId => {
            const element = document.getElementById(inputId);
            if (element) {
                element.addEventListener('input', () => {
                    this.messages[inputId] = element.value;
                });
            }
        });
        
        // Color picker event handlers
        const colorInputs = ['primaryColor', 'secondaryColor', 'accentColor', 'heroTextColor', 
                            'sectionTitleColor', 'messageTextColor', 'timelineDotColor', 
                            'timelineLineColor', 'timelineTextColor'];
        
        colorInputs.forEach(inputId => {
            const element = document.getElementById(inputId);
            if (element) {
                element.addEventListener('change', () => {
                    this.colors[inputId] = element.value;
                    this.updateColorPreview(inputId, element.value);
                });
            }
        });
        
        // Color preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyColorPreset(btn.dataset.preset);
            });
        });
        
        // Save colors button
        document.getElementById('saveColors').addEventListener('click', () => {
            this.saveColors();
        });
        
        // Reset colors button
        document.getElementById('resetColors').addEventListener('click', () => {
            this.resetColors();
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
    
    showLoading(show = true) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = show ? 'flex' : 'none';
    }
    
    async handlePhotoUpload(files) {
        if (!files || files.length === 0) return;
        
        if (this.photos.length + files.length > 30) {
            this.showNotification('Maximum 30 photos allowed', 'error');
            return;
        }
        
        this.showLoading(true);
        const formData = new FormData();
        
        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                formData.append('photos', file);
            }
        });
        
        try {
            const response = await fetch('/upload/photos', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                await this.loadExistingContent();
                this.showNotification(`${result.files.length} photos uploaded successfully!`, 'success');
            } else {
                this.showNotification('Upload failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Upload failed: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    async handleVideoUpload(file) {
        if (!file) return;
        
        if (!file.type.startsWith('video/')) {
            this.showNotification('Please select a valid video file', 'error');
            return;
        }
        
        this.showLoading(true);
        const formData = new FormData();
        formData.append('video', file);
        
        try {
            const response = await fetch('/upload/video', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                await this.loadExistingContent();
                this.showNotification('Video uploaded successfully!', 'success');
            } else {
                this.showNotification('Upload failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Upload failed: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    renderPhotoGrid() {
        const grid = document.getElementById('photoGrid');
        const clearBtn = document.getElementById('clearAllPhotos');
        const photoCount = document.querySelector('.photo-count');
        
        photoCount.textContent = `(${this.photos.length}/30 photos)`;
        clearBtn.style.display = this.photos.length > 0 ? 'block' : 'none';
        
        if (this.photos.length === 0) {
            grid.innerHTML = '<p class="empty-message" style="text-align: center; color: #64748b; padding: 2rem;">No photos uploaded yet. Use the upload area above to add photos.</p>';
            return;
        }
        
        grid.innerHTML = '';
        
        this.photos.forEach((photo, index) => {
            const photoCard = document.createElement('div');
            photoCard.className = 'photo-card';
            photoCard.innerHTML = `
                <img src="/uploads/photos/${photo.optimized}" alt="Photo ${index + 1}" loading="lazy">
                <div class="photo-controls">
                    <input type="text" placeholder="Caption" value="${photo.caption || ''}" 
                           onchange="admin.updatePhotoCaption(${index}, this.value)">
                    <input type="text" placeholder="Date" value="${photo.date || ''}"
                           onchange="admin.updatePhotoDate(${index}, this.value)">
                    <button onclick="admin.deletePhoto(${index})" class="delete-btn">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            grid.appendChild(photoCard);
        });
    }
    
    renderVideoPreview() {
        const preview = document.getElementById('videoPreview');
        
        if (!this.video) {
            preview.innerHTML = '';
            return;
        }
        
        preview.innerHTML = `
            <video controls>
                <source src="/uploads/videos/${this.video}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
            <div style="margin-top: 1rem;">
                <button onclick="admin.deleteVideo()" class="btn-danger">
                    <i class="fas fa-trash"></i> Remove Video
                </button>
            </div>
        `;
    }
    
    renderTimelineEvents() {
        const container = document.getElementById('timelineEvents');
        
        if (this.timeline.length === 0) {
            container.innerHTML = '<p class="empty-message" style="text-align: center; color: #64748b; padding: 2rem;">No timeline events yet. Click "Add New Event" to create one.</p>';
            return;
        }
        
        container.innerHTML = '';
        
        this.timeline.forEach((event, index) => {
            const eventDiv = document.createElement('div');
            eventDiv.className = 'timeline-event';
            eventDiv.innerHTML = `
                <div class="form-group">
                    <label>Event Title</label>
                    <input type="text" placeholder="Enter event title..." value="${event.title || ''}"
                           onchange="admin.updateTimelineEvent(${index}, 'title', this.value)" class="text-input">
                </div>
                
                <div class="form-group">
                    <label>Content Type</label>
                    <select onchange="admin.updateTimelineEvent(${index}, 'type', this.value)" class="text-input">
                        <option value="text" ${(!event.type || event.type === 'text') ? 'selected' : ''}>Text Only</option>
                        <option value="image" ${event.type === 'image' ? 'selected' : ''}>Image Only</option>
                        <option value="video" ${event.type === 'video' ? 'selected' : ''}>Video Only</option>
                        <option value="text_image" ${event.type === 'text_image' ? 'selected' : ''}>Text + Image</option>
                        <option value="text_video" ${event.type === 'text_video' ? 'selected' : ''}>Text + Video</option>
                    </select>
                </div>
                
                ${(!event.type || event.type === 'text' || event.type === 'text_image' || event.type === 'text_video') ? `
                <div class="form-group">
                    <label>Event Description</label>
                    <textarea placeholder="Describe this milestone or memory..." 
                              onchange="admin.updateTimelineEvent(${index}, 'content', this.value)" 
                              class="text-textarea">${event.content || ''}</textarea>
                </div>` : ''}
                
                ${(event.type === 'image' || event.type === 'text_image') ? `
                <div class="form-group">
                    <label>Timeline Image</label>
                    <div class="timeline-media-upload">
                        <input type="file" id="timelineImg_${index}" accept="image/*" 
                               onchange="admin.handleTimelineImageUpload(${index}, this.files[0])" style="display: none;">
                        <button type="button" onclick="document.getElementById('timelineImg_${index}').click()" class="btn-secondary">
                            <i class="fas fa-image"></i> ${event.image ? 'Change Image' : 'Add Image'}
                        </button>
                        ${event.image ? `
                        <div class="timeline-media-preview" style="margin-top: 1rem;">
                            <img src="/uploads/timeline/${event.image}" alt="Timeline image" style="max-width: 200px; height: auto; border-radius: 8px;">
                            <button type="button" onclick="admin.removeTimelineImage(${index})" class="btn-danger" style="margin-left: 1rem;">
                                <i class="fas fa-times"></i> Remove
                            </button>
                        </div>` : ''}
                    </div>
                </div>` : ''}
                
                ${(event.type === 'video' || event.type === 'text_video') ? `
                <div class="form-group">
                    <label>Timeline Video</label>
                    <div class="timeline-media-upload">
                        <input type="file" id="timelineVid_${index}" accept="video/*" 
                               onchange="admin.handleTimelineVideoUpload(${index}, this.files[0])" style="display: none;">
                        <button type="button" onclick="document.getElementById('timelineVid_${index}').click()" class="btn-secondary">
                            <i class="fas fa-video"></i> ${event.video ? 'Change Video' : 'Add Video'}
                        </button>
                        ${event.video ? `
                        <div class="timeline-media-preview" style="margin-top: 1rem;">
                            <video controls style="max-width: 200px; height: auto; border-radius: 8px;">
                                <source src="/uploads/timeline/${event.video}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                            <button type="button" onclick="admin.removeTimelineVideo(${index})" class="btn-danger" style="margin-left: 1rem; margin-top: 0.5rem;">
                                <i class="fas fa-times"></i> Remove
                            </button>
                        </div>` : ''}
                    </div>
                </div>` : ''}
                
                <div class="timeline-event-actions">
                    <button onclick="admin.deleteTimelineEvent(${index})" class="btn-danger">
                        <i class="fas fa-trash"></i> Delete Event
                    </button>
                </div>
            `;
            container.appendChild(eventDiv);
        });
    }
    
    updatePhotoCaption(index, caption) {
        this.photos[index].caption = caption;
        this.saveContent();
    }
    
    updatePhotoDate(index, date) {
        this.photos[index].date = date;
        this.saveContent();
    }
    
    async deletePhoto(index) {
        if (!confirm('Are you sure you want to delete this photo?')) return;
        
        const photo = this.photos[index];
        
        try {
            await fetch(`/api/photos/${photo.optimized}`, { method: 'DELETE' });
            await this.loadExistingContent();
            this.showNotification('Photo deleted successfully', 'success');
        } catch (error) {
            this.showNotification('Failed to delete photo: ' + error.message, 'error');
        }
    }
    
    async deleteVideo() {
        if (!confirm('Are you sure you want to remove the video?')) return;
        
        try {
            const content = { photos: this.photos, video: null, timeline: this.timeline };
            await this.saveContentData(content);
            await this.loadExistingContent();
            this.showNotification('Video removed successfully', 'success');
        } catch (error) {
            this.showNotification('Failed to remove video: ' + error.message, 'error');
        }
    }
    
    async clearAllPhotos() {
        if (!confirm('Are you sure you want to delete all photos? This action cannot be undone.')) return;
        
        this.showLoading(true);
        
        try {
            for (const photo of this.photos) {
                await fetch(`/api/photos/${photo.optimized}`, { method: 'DELETE' });
            }
            await this.loadExistingContent();
            this.showNotification('All photos cleared successfully', 'success');
        } catch (error) {
            this.showNotification('Failed to clear photos: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    addTimelineEvent() {
        this.timeline.push({ title: '', content: '', type: 'text' });
        this.renderTimelineEvents();
        this.saveContent();
    }
    
    updateTimelineEvent(index, field, value) {
        this.timeline[index][field] = value;
        if (field === 'type') {
            // Re-render to show/hide appropriate fields
            this.renderTimelineEvents();
        }
        this.saveContent();
    }
    
    async handleTimelineImageUpload(index, file) {
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select a valid image file', 'error');
            return;
        }
        
        this.showLoading(true);
        const formData = new FormData();
        formData.append('timelineImage', file);
        formData.append('eventIndex', index);
        
        try {
            const response = await fetch('/upload/timeline', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.timeline[index].image = result.filename;
                this.renderTimelineEvents();
                this.saveContent();
                this.showNotification('Timeline image uploaded successfully!', 'success');
            } else {
                this.showNotification('Upload failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Upload failed: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    async handleTimelineVideoUpload(index, file) {
        if (!file) return;
        
        if (!file.type.startsWith('video/')) {
            this.showNotification('Please select a valid video file', 'error');
            return;
        }
        
        this.showLoading(true);
        const formData = new FormData();
        formData.append('timelineVideo', file);
        formData.append('eventIndex', index);
        
        try {
            const response = await fetch('/upload/timeline-video', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.timeline[index].video = result.filename;
                this.renderTimelineEvents();
                this.saveContent();
                this.showNotification('Timeline video uploaded successfully!', 'success');
            } else {
                this.showNotification('Upload failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Upload failed: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }
    
    removeTimelineImage(index) {
        if (!confirm('Are you sure you want to remove this image?')) return;
        
        delete this.timeline[index].image;
        this.renderTimelineEvents();
        this.saveContent();
        this.showNotification('Timeline image removed', 'success');
    }
    
    removeTimelineVideo(index) {
        if (!confirm('Are you sure you want to remove this video?')) return;
        
        delete this.timeline[index].video;
        this.renderTimelineEvents();
        this.saveContent();
        this.showNotification('Timeline video removed', 'success');
    }
    
    deleteTimelineEvent(index) {
        if (!confirm('Are you sure you want to delete this timeline event?')) return;
        
        this.timeline.splice(index, 1);
        this.renderTimelineEvents();
        this.saveContent();
    }
    
    async saveContent() {
        const content = {
            photos: this.photos,
            video: this.video,
            timeline: this.timeline
        };
        
        try {
            await this.saveContentData(content);
        } catch (error) {
            this.showNotification('Save failed: ' + error.message, 'error');
        }
    }
    
    async saveContentData(content) {
        const response = await fetch('/api/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save content');
        }
    }
    
    async loadExistingContent() {
        try {
            const response = await fetch('/api/content');
            if (response.ok) {
                const content = await response.json();
                this.photos = content.photos || [];
                this.video = content.video || null;
                this.timeline = content.timeline || [];
                this.messages = content.messages || {};
                this.colors = content.colors || {};
                
                this.renderPhotoGrid();
                this.renderVideoPreview();
                this.renderTimelineEvents();
                this.renderMessages();
                this.renderColors();
            }
        } catch (error) {
            console.error('Failed to load existing content:', error);
            this.showNotification('Failed to load content', 'error');
        }
    }
    
    renderMessages() {
        const fields = ['heroTitle', 'heroSubtitle', 'galleryTitle', 'gallerySubtitle', 
                       'timelineTitle', 'timelineSubtitle', 'messageTitle', 'messageText1', 
                       'messageText2', 'messageText3', 'messageHighlight'];
        
        fields.forEach(field => {
            const element = document.getElementById(field);
            if (element && this.messages[field]) {
                element.value = this.messages[field];
            }
        });
    }
    
    async saveMessages() {
        try {
            const content = {
                photos: this.photos,
                video: this.video,
                timeline: this.timeline,
                messages: this.messages
            };
            
            await this.saveContentData(content);
            this.showNotification('Messages updated successfully!', 'success');
        } catch (error) {
            this.showNotification('Failed to save messages: ' + error.message, 'error');
        }
    }
    
    previewMessages() {
        window.open('/', '_blank');
        this.showNotification('Opening preview in new tab', 'success');
    }
    
    updateColorPreview(colorId, value) {
        const preview = document.querySelector(`[data-color="${colorId}"]`);
        if (preview) {
            preview.style.backgroundColor = value;
        }
    }
    
    applyColorPreset(presetName) {
        const presets = {
            default: {
                primaryColor: '#6366f1',
                secondaryColor: '#8b5cf6',
                accentColor: '#f59e0b',
                heroTextColor: '#6366f1',
                sectionTitleColor: '#6366f1',
                messageTextColor: '#f59e0b',
                timelineDotColor: '#6366f1',
                timelineLineColor: '#6366f1',
                timelineTextColor: '#f8fafc'
            },
            romantic: {
                primaryColor: '#ec4899',
                secondaryColor: '#f472b6',
                accentColor: '#fb7185',
                heroTextColor: '#ec4899',
                sectionTitleColor: '#ec4899',
                messageTextColor: '#fb7185',
                timelineDotColor: '#ec4899',
                timelineLineColor: '#f472b6',
                timelineTextColor: '#fdf2f8'
            },
            elegant: {
                primaryColor: '#1f2937',
                secondaryColor: '#374151',
                accentColor: '#d4af37',
                heroTextColor: '#1f2937',
                sectionTitleColor: '#1f2937',
                messageTextColor: '#d4af37',
                timelineDotColor: '#1f2937',
                timelineLineColor: '#374151',
                timelineTextColor: '#f9fafb'
            },
            vibrant: {
                primaryColor: '#ef4444',
                secondaryColor: '#f97316',
                accentColor: '#eab308',
                heroTextColor: '#ef4444',
                sectionTitleColor: '#ef4444',
                messageTextColor: '#eab308',
                timelineDotColor: '#ef4444',
                timelineLineColor: '#f97316',
                timelineTextColor: '#fffbeb'
            }
        };
        
        const preset = presets[presetName];
        if (preset) {
            Object.keys(preset).forEach(colorId => {
                const element = document.getElementById(colorId);
                if (element) {
                    element.value = preset[colorId];
                    this.colors[colorId] = preset[colorId];
                    this.updateColorPreview(colorId, preset[colorId]);
                }
            });
            
            this.showNotification(`${presetName.charAt(0).toUpperCase() + presetName.slice(1)} preset applied!`, 'success');
        }
    }
    
    async saveColors() {
        try {
            const content = {
                photos: this.photos,
                video: this.video,
                timeline: this.timeline,
                messages: this.messages,
                colors: this.colors
            };
            
            await this.saveContentData(content);
            this.showNotification('Colors saved successfully!', 'success');
        } catch (error) {
            this.showNotification('Failed to save colors: ' + error.message, 'error');
        }
    }
    
    resetColors() {
        this.applyColorPreset('default');
    }
    
    renderColors() {
        Object.keys(this.colors).forEach(colorId => {
            const element = document.getElementById(colorId);
            if (element && this.colors[colorId]) {
                element.value = this.colors[colorId];
                this.updateColorPreview(colorId, this.colors[colorId]);
            }
        });
    }

    showNotification(message, type = 'success') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
}

// Initialize admin panel when DOM is loaded
let admin;
document.addEventListener('DOMContentLoaded', () => {
    admin = new AdminPanel();
});