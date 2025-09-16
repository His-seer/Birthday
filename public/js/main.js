        // Load content from API
        async function loadContent() {
            try {
                const response = await fetch('/api/content');
                if (response.ok) {
                    const content = await response.json();
                    updateGallery(content.photos || []);
                    updateVideo(content.video);
                    updateTimeline(content.timeline || []);
                    updateMessages(content.messages || {});
                }
            } catch (error) {
                console.error('Failed to load content:', error);
            }
        }

        // 3D Carousel functionality
        class Carousel3D {
            constructor() {
                this.container = document.getElementById('carousel3d');
                this.prevBtn = document.getElementById('carouselPrev');
                this.nextBtn = document.getElementById('carouselNext');
                this.progressBar = document.getElementById('carouselProgressBar');
                this.counter = document.getElementById('carouselCounter');
                
                this.items = [];
                this.currentIndex = 0;
                this.autoplayInterval = null;
                this.autoplayDelay = 4000;
                
                this.initEventListeners();
            }
            
            initEventListeners() {
                if (this.prevBtn) {
                    this.prevBtn.addEventListener('click', () => this.prev());
                }
                if (this.nextBtn) {
                    this.nextBtn.addEventListener('click', () => this.next());
                }
                
                // Keyboard navigation
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'ArrowLeft') this.prev();
                    if (e.key === 'ArrowRight') this.next();
                });
                
                // Touch/swipe support
                let startX = 0;
                let startY = 0;
                
                if (this.container) {
                    this.container.addEventListener('touchstart', (e) => {
                        startX = e.touches[0].clientX;
                        startY = e.touches[0].clientY;
                    });
                    
                    this.container.addEventListener('touchend', (e) => {
                        const endX = e.changedTouches[0].clientX;
                        const endY = e.changedTouches[0].clientY;
                        const diffX = startX - endX;
                        const diffY = startY - endY;
                        
                        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                            if (diffX > 0) {
                                this.next();
                            } else {
                                this.prev();
                            }
                        }
                    });
                }
            }
            
            loadPhotos(photos) {
                if (!this.container) return;
                
                this.container.innerHTML = '';
                this.items = [];
                
                if (photos.length === 0) {
                    // Show placeholder
                    this.showPlaceholder();
                    return;
                }
                
                photos.forEach((photo, index) => {
                    const item = document.createElement('div');
                    item.className = 'carousel-item';
                    
                    const captionHtml = photo.caption ? 
                        `<div class="carousel-item-overlay">
                            <div class="carousel-item-caption">${photo.caption}</div>
                        </div>` : '';
                    
                    item.innerHTML = `
                        <img src="/uploads/photos/${photo.optimized}" alt="Memory photo" loading="lazy">
                        ${captionHtml}
                    `;
                    
                    this.container.appendChild(item);
                    this.items.push(item);
                });
                
                this.currentIndex = 0;
                this.updateCarousel();
                this.updateCounter();
                this.startAutoplay();
            }
            
            showPlaceholder() {
                const carouselContainer = document.querySelector('.carousel-container');
                const galleryGrid = document.getElementById('galleryGrid');
                
                if (carouselContainer) carouselContainer.style.display = 'none';
                if (galleryGrid) {
                    galleryGrid.style.display = 'grid';
                    galleryGrid.innerHTML = '';
                    
                    // Show 6 placeholder items
                    for (let i = 0; i < 6; i++) {
                        const placeholder = document.createElement('div');
                        placeholder.className = 'gallery-item reveal';
                        placeholder.innerHTML = `
                            <div class="gallery-placeholder">
                                <div>
                                    <i class="fas fa-image" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                                    Photo ${i + 1}
                                </div>
                            </div>
                            <div class="gallery-overlay">
                                <div class="gallery-caption">Upload photos via admin panel</div>
                            </div>
                        `;
                        galleryGrid.appendChild(placeholder);
                    }
                }
            }
            
            updateCarousel() {
                this.items.forEach((item, index) => {
                    item.className = 'carousel-item';
                    
                    if (index === this.currentIndex) {
                        item.classList.add('active');
                    } else if (index === this.getPrevIndex()) {
                        item.classList.add('prev');
                    } else if (index === this.getNextIndex()) {
                        item.classList.add('next');
                    } else {
                        item.classList.add('hidden');
                    }
                });
                
                this.updateProgress();
            }
            
            updateProgress() {
                if (this.progressBar && this.items.length > 0) {
                    const progress = ((this.currentIndex + 1) / this.items.length) * 100;
                    this.progressBar.style.width = `${progress}%`;
                }
            }
            
            updateCounter() {
                if (this.counter) {
                    this.counter.textContent = `${this.currentIndex + 1} / ${this.items.length}`;
                }
            }
            
            getPrevIndex() {
                return this.currentIndex === 0 ? this.items.length - 1 : this.currentIndex - 1;
            }
            
            getNextIndex() {
                return this.currentIndex === this.items.length - 1 ? 0 : this.currentIndex + 1;
            }
            
            prev() {
                if (this.items.length === 0) return;
                this.currentIndex = this.getPrevIndex();
                this.updateCarousel();
                this.updateCounter();
                this.resetAutoplay();
            }
            
            next() {
                if (this.items.length === 0) return;
                this.currentIndex = this.getNextIndex();
                this.updateCarousel();
                this.updateCounter();
                this.resetAutoplay();
            }
            
            startAutoplay() {
                if (this.items.length <= 1) return;
                this.stopAutoplay();
                this.autoplayInterval = setInterval(() => {
                    this.next();
                }, this.autoplayDelay);
            }
            
            stopAutoplay() {
                if (this.autoplayInterval) {
                    clearInterval(this.autoplayInterval);
                    this.autoplayInterval = null;
                }
            }
            
            resetAutoplay() {
                this.stopAutoplay();
                this.startAutoplay();
            }
        }

        // Initialize carousel
        let carousel3d = null;
        
        // Update gallery with uploaded photos
        function updateGallery(photos) {
            if (!carousel3d) {
                carousel3d = new Carousel3D();
            }
            carousel3d.loadPhotos(photos);
        }

        // Update video source
        function updateVideo(videoFilename) {
            const video = document.getElementById('birthdayVideo');
            const overlay = document.getElementById('playOverlay');
            const placeholder = document.querySelector('.video-placeholder');
            
            if (videoFilename) {
                video.src = `/uploads/videos/${videoFilename}`;
                checkVideoSource();
            }
        }

        // Update timeline with content from admin
        function updateTimeline(timelineEvents) {
            const timeline = document.querySelector('.timeline');
            if (!timeline) return;

            const existingItems = timeline.querySelectorAll('.timeline-item');
            existingItems.forEach(item => item.remove());

            if (timelineEvents.length === 0) {
                // Default timeline events
                const defaultEvents = [
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
                ];
                timelineEvents = defaultEvents;
            }

            timelineEvents.forEach((event, index) => {
                const item = document.createElement('div');
                item.className = 'timeline-item reveal';
                
                let contentHTML = '';
                
                // Handle different content types
                if (event.type === 'image' && event.image) {
                    contentHTML = `
                        <div class="timeline-content">
                            <h3>${event.title || `Event ${index + 1}`}</h3>
                            <div class="timeline-media">
                                <img src="/uploads/timeline/${event.image}" alt="${event.title}" loading="lazy">
                            </div>
                        </div>
                    `;
                } else if (event.type === 'video' && event.video) {
                    contentHTML = `
                        <div class="timeline-content">
                            <h3>${event.title || `Event ${index + 1}`}</h3>
                            <div class="timeline-media">
                                <video controls>
                                    <source src="/uploads/timeline/${event.video}" type="video/mp4">
                                    Your browser does not support the video tag.
                                </video>
                            </div>
                        </div>
                    `;
                } else if (event.type === 'text_image' && event.image) {
                    contentHTML = `
                        <div class="timeline-content">
                            <h3>${event.title || `Event ${index + 1}`}</h3>
                            <div class="timeline-media">
                                <img src="/uploads/timeline/${event.image}" alt="${event.title}" loading="lazy">
                            </div>
                            ${event.content ? `<p>${event.content}</p>` : ''}
                        </div>
                    `;
                } else if (event.type === 'text_video' && event.video) {
                    contentHTML = `
                        <div class="timeline-content">
                            <h3>${event.title || `Event ${index + 1}`}</h3>
                            <div class="timeline-media">
                                <video controls>
                                    <source src="/uploads/timeline/${event.video}" type="video/mp4">
                                    Your browser does not support the video tag.
                                </video>
                            </div>
                            ${event.content ? `<p>${event.content}</p>` : ''}
                        </div>
                    `;
                } else {
                    // Text only or fallback
                    contentHTML = `
                        <div class="timeline-content">
                            <h3>${event.title || `Event ${index + 1}`}</h3>
                            <p>${event.content || 'No description available.'}</p>
                        </div>
                    `;
                }
                
                item.innerHTML = `
                    <div class="timeline-dot"></div>
                    ${contentHTML}
                `;
                timeline.appendChild(item);
            });
        }

        // Update messages/text content with admin edits
        function updateMessages(messages) {
            // Hero section
            const heroTitle = document.querySelector('.hero-title');
            const heroSubtitle = document.querySelector('.hero-subtitle');
            
            if (heroTitle && messages.heroTitle) {
                heroTitle.textContent = messages.heroTitle;
            }
            if (heroSubtitle && messages.heroSubtitle) {
                heroSubtitle.textContent = messages.heroSubtitle;
            }
            
            // Gallery section
            const galleryTitle = document.querySelector('#gallery .section-title');
            const gallerySubtitle = document.querySelector('#gallery .section-subtitle');
            
            if (galleryTitle && messages.galleryTitle) {
                galleryTitle.textContent = messages.galleryTitle;
            }
            if (gallerySubtitle && messages.gallerySubtitle) {
                gallerySubtitle.textContent = messages.gallerySubtitle;
            }
            
            // Timeline section
            const timelineTitle = document.querySelector('#timeline .section-title');
            const timelineSubtitle = document.querySelector('#timeline .section-subtitle');
            
            if (timelineTitle && messages.timelineTitle) {
                timelineTitle.textContent = messages.timelineTitle;
            }
            if (timelineSubtitle && messages.timelineSubtitle) {
                timelineSubtitle.textContent = messages.timelineSubtitle;
            }
            
            // Message section
            const messageTitle = document.querySelector('.message-title');
            const messageTexts = document.querySelectorAll('.message-text');
            const messageHighlight = document.querySelector('.message-highlight');
            
            if (messageTitle && messages.messageTitle) {
                messageTitle.textContent = messages.messageTitle;
            }
            
            if (messageTexts.length >= 3) {
                if (messages.messageText1) messageTexts[0].textContent = messages.messageText1;
                if (messages.messageText2) messageTexts[1].textContent = messages.messageText2;
                if (messages.messageText3) messageTexts[2].textContent = messages.messageText3;
            }
            
            if (messageHighlight && messages.messageHighlight) {
                messageHighlight.textContent = messages.messageHighlight;
            }
        }

        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Video functionality
        const video = document.getElementById('birthdayVideo');
        const overlay = document.getElementById('playOverlay');
        const placeholder = document.querySelector('.video-placeholder');

        // Check if video has a valid source
        function checkVideoSource() {
            if (video && video.src && video.src !== window.location.href + '#') {
                video.style.display = 'block';
                if (overlay) overlay.style.display = 'flex';
                if (placeholder) placeholder.style.display = 'none';
            }
        }

        if (overlay && video) {
            overlay.addEventListener('click', () => {
                overlay.classList.add('hidden');
                video.play();
                launchConfetti();
            });

            video.addEventListener('pause', () => {
                overlay.classList.remove('hidden');
            });

            video.addEventListener('ended', () => {
                overlay.classList.remove('hidden');
            });

            // Error handling for video
            video.addEventListener('error', (e) => {
                console.log('Video error:', e);
                video.style.display = 'none';
                if (overlay) overlay.style.display = 'none';
                if (placeholder) placeholder.style.display = 'flex';
            });
        }

        // Confetti celebration
        function launchConfetti() {
            if (typeof confetti === 'undefined') {
                console.log('Confetti library not loaded');
                return;
            }
            
            // Create multiple confetti bursts
            const duration = 3000;
            const animationEnd = Date.now() + duration;

            const randomInRange = (min, max) => Math.random() * (max - min) + min;

            const interval = setInterval(() => {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    clearInterval(interval);
                    return;
                }

                // Create confetti from different positions
                confetti({
                    particleCount: 50,
                    spread: 60,
                    origin: { x: randomInRange(0.1, 0.9), y: Math.random() - 0.2 }
                });
            }, 250);
        }

        function launchCelebration() {
            launchConfetti();
            // Start fireworks animation
            startFireworks();
        }

        // Fireworks Canvas Animation
        const canvas = document.getElementById('fireworks');
        const ctx = canvas ? canvas.getContext('2d') : null;
        let animationId;
        let fireworksActive = false;

        function resizeCanvas() {
            if (canvas) {
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
            }
        }

        if (canvas) {
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
        }

        const fireworks = [];
        const particles = [];

        class Firework {
            constructor() {
                this.x = canvas.width / 2;
                this.y = canvas.height;
                this.targetX = Math.random() * canvas.width;
                this.targetY = Math.random() * canvas.height / 2;
                this.speed = 2;
                this.angle = Math.atan2(this.targetY - this.y, this.targetX - this.x);
                this.color = `hsl(${Math.random() * 360}, 100%, 60%)`;
                this.brightness = Math.random() * 50 + 50;
            }

            update() {
                this.x += Math.cos(this.angle) * this.speed;
                this.y += Math.sin(this.angle) * this.speed;
                this.speed *= 1.01;

                if (Math.hypot(this.targetX - this.x, this.targetY - this.y) < 5) {
                    // Create explosion
                    for (let i = 0; i < 30; i++) {
                        particles.push(new Particle(this.targetX, this.targetY, this.color));
                    }
                    fireworks.splice(fireworks.indexOf(this), 1);
                }
            }

            draw() {
                if (!ctx) return;
                ctx.save();
                ctx.fillStyle = this.color;
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        class Particle {
            constructor(x, y, color) {
                this.x = x;
                this.y = y;
                this.color = color;
                this.angle = Math.random() * Math.PI * 2;
                this.speed = Math.random() * 6 + 1;
                this.friction = 0.95;
                this.gravity = 0.1;
                this.alpha = 1;
                this.decay = Math.random() * 0.02 + 0.01;
            }

            update() {
                this.speed *= this.friction;
                this.x += Math.cos(this.angle) * this.speed;
                this.y += Math.sin(this.angle) * this.speed + this.gravity;
                this.alpha -= this.decay;
            }

            draw() {
                if (!ctx) return;
                ctx.save();
                ctx.globalAlpha = this.alpha;
                ctx.fillStyle = this.color;
                ctx.shadowBlur = 5;
                ctx.shadowColor = this.color;
                ctx.beginPath();
                ctx.arc(this.x, this.y, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        function animateFireworks() {
            if (!ctx) return;
            
            ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (fireworksActive && Math.random() < 0.05) {
                fireworks.push(new Firework());
            }

            fireworks.forEach(firework => {
                firework.update();
                firework.draw();
            });

            particles.forEach((particle, index) => {
                if (particle.alpha > 0) {
                    particle.update();
                    particle.draw();
                } else {
                    particles.splice(index, 1);
                }
            });

            animationId = requestAnimationFrame(animateFireworks);
        }

        function startFireworks() {
            if (!canvas || !ctx) return;
            
            if (!fireworksActive) {
                fireworksActive = true;
                animateFireworks();
                
                // Stop fireworks after 5 seconds
                setTimeout(() => {
                    fireworksActive = false;
                    setTimeout(() => {
                        if (animationId) {
                            cancelAnimationFrame(animationId);
                        }
                        // Clear canvas
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }, 3000);
                }, 5000);
            }
        }

        // Scroll reveal animation
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, observerOptions);

        // Observe all elements with reveal class
        function observeRevealElements() {
            document.querySelectorAll('.reveal').forEach(element => {
                observer.observe(element);
            });
        }

        // Navbar scroll effect
        let lastScrollY = window.scrollY;
        const navbar = document.querySelector('.navbar');

        window.addEventListener('scroll', () => {
            const currentScrollY = window.scrollY;
            
            if (navbar) {
                if (currentScrollY > 100) {
                    navbar.style.background = 'rgba(15, 23, 42, 0.95)';
                    navbar.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
                } else {
                    navbar.style.background = 'rgba(15, 23, 42, 0.9)';
                    navbar.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
                }
            }
            
            lastScrollY = currentScrollY;
        });

        // Mobile menu functionality
        const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu');

        if (mobileMenuToggle && navMenu) {
            mobileMenuToggle.addEventListener('click', () => {
                navMenu.classList.toggle('active');
            });
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && video && !video.paused) {
                video.pause();
                if (overlay) overlay.classList.remove('hidden');
            }
            if (e.key === ' ' && e.target === document.body) {
                e.preventDefault();
                launchCelebration();
            }
        });

        // Add some birthday magic
        setInterval(() => {
            if (Math.random() > 0.95) {
                const colors = ['#6366f1', '#8b5cf6', '#f59e0b', '#10b981'];
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                document.documentElement.style.setProperty('--primary', randomColor);
            }
        }, 10000);

        // Performance optimization
        let ticking = false;
        function updateScrollEffects() {
            if (!ticking) {
                requestAnimationFrame(() => {
                    ticking = false;
                });
                ticking = true;
            }
        }

        window.addEventListener('scroll', updateScrollEffects);

        // Add touch support for mobile
        let touchStartY = 0;
        document.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        });

        document.addEventListener('touchmove', (e) => {
            const touchY = e.touches[0].clientY;
            const touchDiff = touchStartY - touchY;
        });

        // Preload images for better performance
        function preloadImages(imageUrls) {
            imageUrls.forEach(url => {
                const img = new Image();
                img.src = url;
            });
        }

        // Initialize everything when DOM is ready
        function initializeWebsite() {
            console.log('Birthday website initialized! 🎉');
            
            // Load content from API
            loadContent();
            
            // Initialize any video sources if available
            checkVideoSource();
            
            // Observe reveal elements
            observeRevealElements();
            
            // Add gallery click handlers
            document.addEventListener('click', (e) => {
                if (e.target.closest('.gallery-item')) {
                    console.log('Gallery item clicked - modal functionality can be added here');
                }
            });
            
            // Start subtle background animation
            setTimeout(() => {
                if (Math.random() > 0.7) {
                    launchConfetti();
                }
            }, 2000);
            
            // Reveal animations
            setTimeout(() => {
                document.querySelectorAll('.reveal').forEach((element, index) => {
                    setTimeout(() => {
                        element.classList.add('active');
                    }, index * 200);
                });
            }, 500);
        }

        // Loading animation
        document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.add('loading');
            initializeWebsite();
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeWebsite);
        } else {
            initializeWebsite();
        }