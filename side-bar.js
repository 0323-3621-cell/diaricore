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
            this.mobileTopNav = tempDiv.querySelector('.mobile-top-nav');
            this.mobileBottomNav = tempDiv.querySelector('.mobile-bottom-nav');
            
            // Insert sidebar and mobile nav into the page
            this.insertSidebar();
            
            // Set active page and setup logout AFTER sidebar is loaded
            this.setActivePage();
            this.setupLogoutButton();
            this.initMobileWriteFab();
            
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
        
        /* Fixed app header (mobile only — hidden via CSS on desktop) */
        if (this.mobileTopNav) {
            document.body.prepend(this.mobileTopNav);
            document.body.classList.add('has-mobile-top-nav');
        }
        
        // Also insert mobile bottom navigation if it exists
        if (this.mobileBottomNav) {
            document.body.appendChild(this.mobileBottomNav);
        }
    }

    /**
     * Mobile: center + opens radial Write/Voice icon circles (no dim overlay).
     */
    initMobileWriteFab() {
        const fab = document.querySelector('.mobile-write-fab');
        if (!fab || fab.dataset.writeFabBound === '1') return;
        fab.dataset.writeFabBound = '1';

        const trigger = fab.querySelector('.mobile-bottom-nav-link--write-fab');
        const radial = fab.querySelector('.mobile-write-fab__radial');
        const iconPlus = fab.querySelector('.mobile-write-fab__icon-plus');
        const iconClose = fab.querySelector('.mobile-write-fab__icon-close');
        if (!trigger || !radial) return;

        const setIconsClosed = () => {
            if (iconPlus) iconPlus.classList.remove('is-hidden');
            if (iconClose) iconClose.classList.add('is-hidden');
        };

        const setIconsOpen = () => {
            if (iconPlus) iconPlus.classList.add('is-hidden');
            if (iconClose) iconClose.classList.remove('is-hidden');
        };

        const closeRadial = () => {
            radial.classList.remove('mobile-write-fab__radial--open');
            radial.setAttribute('aria-hidden', 'true');
            trigger.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
            setIconsClosed();
            document.removeEventListener('click', docClose, true);
        };

        const docClose = (e) => {
            if (!fab.contains(e.target)) {
                closeRadial();
            }
        };

        const openRadial = () => {
            if (window.innerWidth > 768) return;
            radial.setAttribute('aria-hidden', 'false');
            trigger.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
            setIconsOpen();
            /* One frame at closed styles so opacity/transform transitions run (not display:none). */
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    radial.classList.add('mobile-write-fab__radial--open');
                });
            });
            setTimeout(() => document.addEventListener('click', docClose, true), 0);
        };

        trigger.addEventListener('click', (e) => {
            if (window.innerWidth > 768) return;
            e.preventDefault();
            if (!radial.classList.contains('mobile-write-fab__radial--open')) {
                openRadial();
            } else {
                closeRadial();
            }
        });

        fab.querySelectorAll('.mobile-write-fab__sat').forEach((link) => {
            link.addEventListener('click', () => closeRadial());
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                closeRadial();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && radial.classList.contains('mobile-write-fab__radial--open')) {
                closeRadial();
            }
        });
    }

    setupMobileToggle() {
        // Temporarily disabled hamburger menu
        // if (window.innerWidth <= 768) {
        //     // Create mobile toggle button
        //     this.mobileToggle = document.createElement('button');
        //     this.mobileToggle.className = 'mobile-menu-toggle';
        //     this.mobileToggle.innerHTML = '<i class="bi bi-list"></i>';
        //     this.mobileToggle.setAttribute('aria-label', 'Toggle menu');
        //     
        //     // Create overlay
        //     this.overlay = document.createElement('div');
        //     this.overlay.className = 'sidebar-overlay';
        //     
        //     // Insert at the beginning of body
        //     document.body.insertBefore(this.mobileToggle, document.body.firstChild);
        //     document.body.insertBefore(this.overlay, document.body.firstChild);
        // }
    }

    setActivePage() {
        if (!this.sidebarElement) return;

        // Remove all active classes from desktop sidebar
        const navItems = this.sidebarElement.querySelectorAll('.nav-item');
        navItems.forEach(item => item.classList.remove('active'));

        // Set active class for current page in desktop sidebar
        const activeItem = this.sidebarElement.querySelector(`[data-page="${this.currentPage}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }

        // Handle mobile bottom navigation
        const mobileNavLinks = document.querySelectorAll('.mobile-bottom-nav-link');
        mobileNavLinks.forEach(link => link.classList.remove('active'));

        const activeMobileLink = document.querySelector(`.mobile-bottom-nav-link[data-page="${this.currentPage}"]`);
        if (activeMobileLink) {
            activeMobileLink.classList.add('active');
        } else if (this.currentPage === 'voice-entry') {
            const writeTrigger = document.querySelector('.mobile-bottom-nav-link--write-fab');
            if (writeTrigger) {
                writeTrigger.classList.add('active');
            }
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
        }
        if (this.overlay) {
            this.overlay.classList.remove('show');
        }
        document.body.classList.remove('sidebar-open');
    }

    handleNavClick(e) {
        const link = e.currentTarget;
        const href = link.getAttribute('href');
        
        // Close mobile menu if open (only if hamburger menu exists)
        if (window.innerWidth <= 768 && this.overlay) {
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
