// DiariCore Sidebar Component JavaScript

class SidebarComponent {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.sidebarElement = null;
        this.mobileToggle = null;
        this.overlay = null;
        this.init();
    }

    init() {
        this.loadSidebar();
        this.setupMobileToggle();
        this.setupEventListeners();
    }

    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop();
        return filename.replace('.html', '') || 'dashboard';
    }

    async loadSidebar() {
        try {
            const response = await fetch('side-bar.html');
            const html = await response.text();
            
            // Create a temporary div to parse the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            this.sidebarElement = tempDiv.querySelector('.sidebar');
            
            // Insert sidebar into the page
            this.insertSidebar();
            
            // Set active page and setup logout AFTER sidebar is loaded
            this.setActivePage();
            this.setupLogoutButton();
            
        } catch (error) {
            console.error('Failed to load sidebar:', error);
        }
    }

    insertSidebar() {
        if (!this.sidebarElement) return;

        // Find where to insert the sidebar (before main content)
        const mainContent = document.querySelector('.main-content') || 
                           document.querySelector('main') || 
                           document.body;
        
        if (mainContent) {
            mainContent.parentNode.insertBefore(this.sidebarElement, mainContent);
        } else {
            document.body.appendChild(this.sidebarElement);
        }
    }

    setupMobileToggle() {
        // Create mobile toggle button
        this.mobileToggle = document.createElement('button');
        this.mobileToggle.className = 'mobile-menu-toggle';
        this.mobileToggle.innerHTML = '<i class="bi bi-list"></i>';
        this.mobileToggle.setAttribute('aria-label', 'Toggle menu');
        
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'sidebar-overlay';
        
        // Insert at the beginning of body
        document.body.insertBefore(this.mobileToggle, document.body.firstChild);
        document.body.insertBefore(this.overlay, document.body.firstChild);
    }

    setActivePage() {
        if (!this.sidebarElement) return;

        // Remove all active classes
        const navItems = this.sidebarElement.querySelectorAll('.nav-item');
        navItems.forEach(item => item.classList.remove('active'));

        // Set active class for current page
        const activeItem = this.sidebarElement.querySelector(`[data-page="${this.currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    setupEventListeners() {
        // Mobile toggle
        if (this.mobileToggle) {
            this.mobileToggle.addEventListener('click', () => this.toggleMobileMenu());
        }

        // Overlay click
        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.closeMobileMenu());
        }

        // Navigation links
        if (this.sidebarElement) {
            const navLinks = this.sidebarElement.querySelectorAll('.nav-link');
            navLinks.forEach(link => {
                link.addEventListener('click', (e) => this.handleNavClick(e));
            });
        }

        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    // Logout button setup
    setupLogoutButton() {
        if (!this.sidebarElement) return;
        
        const logoutBtn = this.sidebarElement.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                // Clear authentication data
                localStorage.removeItem('diariCoreUser');
                // Redirect to login page
                window.location.href = 'index.html';
            });
        }
    }

    toggleMobileMenu() {
        if (this.sidebarElement) {
            this.sidebarElement.classList.toggle('open');
            this.overlay.classList.toggle('show');
            
            // Prevent body scroll when sidebar is open
            if (this.sidebarElement.classList.contains('open')) {
                document.body.classList.add('sidebar-open');
            } else {
                document.body.classList.remove('sidebar-open');
            }
        }
    }

    closeMobileMenu() {
        if (this.sidebarElement) {
            this.sidebarElement.classList.remove('open');
            this.overlay.classList.remove('show');
            document.body.classList.remove('sidebar-open');
        }
    }

    handleNavClick(e) {
        const link = e.currentTarget;
        const href = link.getAttribute('href');
        
        // Close mobile menu if open
        if (window.innerWidth <= 768) {
            this.closeMobileMenu();
        }

        // Handle external links or non-page links
        if (href === '#' || href.startsWith('http')) {
            e.preventDefault();
            // You can add modal or other functionality here
            this.showNotification('Feature coming soon!', 'info');
        }
    }

    handleResize() {
        if (window.innerWidth > 768) {
            this.closeMobileMenu();
        }
    }

    showNotification(message, type = 'info') {
        // Remove existing notification
        const existingNotification = document.querySelector('.sidebar-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create notification
        const notification = document.createElement('div');
        notification.className = 'sidebar-notification';
        notification.innerHTML = `
            <i class="bi bi-info-circle"></i>
            <span>${message}</span>
        `;

        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            max-width: 400px;
            word-wrap: break-word;
            background: #7FA7BF;
            color: white;
            font-family: 'Inter', sans-serif;
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);

        // Remove after delay
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }

    // Public method to update active page
    updateActivePage(pageName) {
        this.currentPage = pageName;
        this.setActivePage();
    }

    // Public method to get current page
    getCurrentPageName() {
        return this.currentPage;
    }
}

// Initialize sidebar when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.sidebarComponent = new SidebarComponent();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SidebarComponent;
}
