// Dynamic color system for real-time theme updates
class ColorManager {
    constructor() {
        this.colors = {};
        this.loadColors();
    }
    
    async loadColors() {
        try {
            const response = await fetch('/api/content');
            if (response.ok) {
                const content = await response.json();
                this.colors = content.colors || {};
                this.applyColors();
            }
        } catch (error) {
            console.error('Failed to load colors:', error);
        }
    }
    
    applyColors() {
        const root = document.documentElement;
        
        // Map admin color IDs to CSS custom properties
        const colorMap = {
            primaryColor: '--primary',
            secondaryColor: '--secondary', 
            accentColor: '--accent',
            heroTextColor: '--hero-text-color',
            sectionTitleColor: '--section-title-color',
            messageTextColor: '--message-text-color',
            timelineDotColor: '--timeline-dot-color',
            timelineLineColor: '--timeline-line-color',
            timelineTextColor: '--timeline-text-color'
        };
        
        Object.keys(colorMap).forEach(colorId => {
            if (this.colors[colorId]) {
                root.style.setProperty(colorMap[colorId], this.colors[colorId]);
            }
        });
        
        // Update gradient properties based on primary/secondary colors
        if (this.colors.primaryColor && this.colors.secondaryColor) {
            root.style.setProperty(
                '--gradient-primary', 
                `linear-gradient(135deg, ${this.colors.primaryColor}, ${this.colors.secondaryColor})`
            );
        }
        
        if (this.colors.accentColor) {
            root.style.setProperty(
                '--gradient-accent', 
                `linear-gradient(135deg, ${this.colors.accentColor}, #f97316)`
            );
        }
    }
}

// Initialize color manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ColorManager();
});