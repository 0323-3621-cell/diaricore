// DiariCore Profile Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initializeProfileInteractions();
    initializePreferenceToggles();
    initializeStorageActions();
    initializeProfileSectionNavigation();
});

function initializeProfileFromStorage() {
    try {
        const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
        const safeEntries = Array.isArray(entries) ? entries.filter((e) => e && (e.date || e.createdAt)) : [];

        const nameEl = document.querySelector('.profile-name');
        const emailEl = document.querySelector('.profile-email');
        const memberSinceEl = document.querySelector('.profile-member-since');
        const statEls = document.querySelectorAll('.profile-stats .stat-number');

        if (nameEl) {
            const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
            nameEl.textContent = fullName || user?.nickname || 'New User';
        }
        if (emailEl) emailEl.textContent = user?.email || 'No email available';
        if (memberSinceEl) {
            const parsed = user?.createdAt ? new Date(user.createdAt) : null;
            const createdAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
            const monthYear = createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            memberSinceEl.textContent = `Member since ${monthYear}`;
        }

        const entryCount = safeEntries.length;
        const streak = calculateEntryStreak(safeEntries);
        const consistency = calculateMonthlyConsistency(safeEntries);
        if (statEls[0]) statEls[0].textContent = String(entryCount);
        if (statEls[1]) statEls[1].textContent = String(streak);
        if (statEls[2]) statEls[2].textContent = `${consistency}%`;

        const avatarEl = document.querySelector('.profile-overview-section .avatar-image');
        if (avatarEl && user && typeof user.avatarDataUrl === 'string' && user.avatarDataUrl.length > 0) {
            avatarEl.src = user.avatarDataUrl;
        }
    } finally {
        document.documentElement.classList.remove('profile-await-storage');
    }
}

const PROFILE_MS_PER_DAY = 86400000;

function profileJournalDayStartMs(raw) {
    if (raw == null) return null;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    const local = new Date(dt);
    local.setHours(0, 0, 0, 0);
    return local.getTime();
}

function calculateEntryStreak(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    const daySet = new Set();
    entries.forEach((e) => {
        if (!e) return;
        const raw = e.date || e.createdAt;
        if (!raw) return;
        const ms = profileJournalDayStartMs(raw);
        if (ms != null) daySet.add(ms);
    });
    if (daySet.size === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    let anchorMs = null;
    daySet.forEach((t) => {
        if (t > todayMs) return;
        if (anchorMs == null || t > anchorMs) anchorMs = t;
    });
    if (anchorMs == null) return 0;

    const gapDays = Math.floor((todayMs - anchorMs) / PROFILE_MS_PER_DAY);
    if (gapDays > 1) return 0;

    let streak = 0;
    for (let i = 0; i < 400; i += 1) {
        const d = anchorMs - i * PROFILE_MS_PER_DAY;
        if (daySet.has(d)) streak += 1;
        else break;
    }
    return streak;
}

function calculateMonthlyConsistency(entries) {
    if (!entries.length) return 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const uniqueRecentDays = new Set(entries.map((e) => {
        const d = new Date(e.date);
        if (d < thirtyDaysAgo || d > now) return null;
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }).filter(Boolean));
    return Math.round((uniqueRecentDays.size / 30) * 100);
}

function processAvatarFileToDataUrl(file, done) {
    const reader = new FileReader();
    reader.onload = function () {
        const result = reader.result;
        if (typeof result !== 'string') {
            done(null);
            return;
        }
        const image = new Image();
        image.onload = function () {
            try {
                const maxEdge = 360;
                let w = image.naturalWidth || image.width;
                let h = image.naturalHeight || image.height;
                if (!w || !h) {
                    done(null);
                    return;
                }
                if (w > maxEdge || h > maxEdge) {
                    const scale = Math.min(maxEdge / w, maxEdge / h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    done(result);
                    return;
                }
                ctx.drawImage(image, 0, 0, w, h);
                done(canvas.toDataURL('image/jpeg', 0.86));
            } catch (_) {
                done(null);
            }
        };
        image.onerror = function () {
            done(null);
        };
        image.src = result;
    };
    reader.onerror = function () {
        done(null);
    };
    reader.readAsDataURL(file);
}

function ensureProfileAvatarFileInput() {
    let el = document.getElementById('profileAvatarFileInput');
    if (!el) {
        el = document.createElement('input');
        el.type = 'file';
        el.id = 'profileAvatarFileInput';
        el.accept = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';
        el.setAttribute('aria-hidden', 'true');
        el.tabIndex = -1;
        el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-100px;top:0;';
        document.body.appendChild(el);
    }
    return el;
}

// Initialize Profile Interactions
function initializeProfileInteractions() {
    const mobileLogoutBtn = document.getElementById('profileMobileLogoutBtn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', function() {
            localStorage.removeItem('diariCoreUser');
            window.location.href = 'login.html';
        });
    }

    const pageLogoutBtn = document.getElementById('profilePageLogoutBtn');
    if (pageLogoutBtn) {
        pageLogoutBtn.addEventListener('click', function() {
            localStorage.removeItem('diariCoreUser');
            window.location.href = 'login.html';
        });
    }

    // Avatar: open file picker, resize, save to diariCoreUser.avatarDataUrl, sync sidebar
    const avatarEditBtn = document.querySelector('.avatar-edit-btn');
    const avatarMainImg = document.querySelector('.profile-overview-section .avatar-image');
    if (avatarEditBtn && avatarMainImg) {
        const input = ensureProfileAvatarFileInput();
        if (input.dataset.avatarBound !== '1') {
            input.dataset.avatarBound = '1';
            avatarEditBtn.addEventListener('click', function (e) {
                e.preventDefault();
                input.click();
            });
            input.addEventListener('change', function () {
                const file = input.files && input.files[0];
                input.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    showNotification('Please choose an image file.', 'warning');
                    return;
                }
                if (file.size > 4 * 1024 * 1024) {
                    showNotification('Image is too large (max 4 MB).', 'warning');
                    return;
                }
                processAvatarFileToDataUrl(file, function (dataUrl) {
                    if (!dataUrl) {
                        showNotification('Could not read that image. Try JPG or PNG.', 'error');
                        return;
                    }
                    if (dataUrl.length > 900000) {
                        showNotification('Processed image is still too large. Try a smaller photo.', 'error');
                        return;
                    }
                    let user = null;
                    try {
                        user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
                    } catch (_) {
                        user = null;
                    }
                    if (!user || typeof user !== 'object') {
                        showNotification('Sign in to save a profile photo.', 'warning');
                        return;
                    }
                    user.avatarDataUrl = dataUrl;
                    localStorage.setItem('diariCoreUser', JSON.stringify(user));
                    avatarMainImg.src = dataUrl;
                    document.dispatchEvent(new CustomEvent('diari-user-updated', { bubbles: true }));
                    showNotification('Profile photo updated.', 'success');
                });
            });
        }
    }

    // Setting edit buttons
    const editButtons = document.querySelectorAll('.btn-edit');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const settingTitle = this.closest('.setting-card').querySelector('.setting-title').textContent;
            showNotification(`Opening ${settingTitle} settings...`, 'info');
            console.log('Edit setting:', settingTitle);
        });
    });
}

// Initialize Preference Toggles
function initializePreferenceToggles() {
    const toggleSwitches = document.querySelectorAll(
        '.toggle-switch input[type="checkbox"], .switch input[type="checkbox"]'
    );

    const darkModeToggle = document.getElementById('toggleDarkMode');
    if (darkModeToggle && window.DiariTheme && typeof window.DiariTheme.getTheme === 'function') {
        darkModeToggle.checked = window.DiariTheme.getTheme() === 'dark';
    }
    
    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', function() {
            if (this.id === 'toggleDarkMode' && window.DiariTheme && typeof window.DiariTheme.setTheme === 'function') {
                window.DiariTheme.setTheme(this.checked ? 'dark' : 'light');
            }

            const row = this.closest('.appearance-item, .notifications-item, .preference-item');
            const titleEl = row && row.querySelector(
                '.appearance-subtitle, .notifications-subtitle, .preference-title'
            );
            const preferenceTitle = titleEl ? titleEl.textContent.trim() : 'Preference';
            const isChecked = this.checked;
            
            showNotification(`${preferenceTitle} ${isChecked ? 'enabled' : 'disabled'}`, 'success');
            console.log('Preference changed:', preferenceTitle, isChecked);
            
            // In a real app, this would save to backend
            savePreference(preferenceTitle, isChecked);
        });
    });
}

// Save Preference (Mock Function)
function savePreference(title, value) {
    // In a real app, this would make an API call
    console.log('Saving preference:', title, value);
    
    // Simulate API call
    setTimeout(() => {
        console.log('Preference saved successfully');
    }, 500);
}

// Initialize Storage Actions
function initializeStorageActions() {
    // Export button
    const exportBtn = document.querySelector('.btn-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            showNotification('Preparing data export...', 'info');
            
            // Simulate export process
            setTimeout(() => {
                exportData();
            }, 1500);
        });
    }

    document.querySelectorAll('.btn-privacy').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showNotification('Privacy policy is coming soon.', 'info');
        });
    });

    // Backup button
    const backupBtn = document.querySelector('.btn-backup');
    if (backupBtn) {
        backupBtn.addEventListener('click', function() {
            showNotification('Creating backup...', 'info');
            
            // Simulate backup process
            setTimeout(() => {
                createBackup();
            }, 1500);
        });
    }

    // Clear data button
    const deleteBtn = document.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            const confirmed = confirm('Are you sure you want to clear all data? This action cannot be undone.');
            
            if (confirmed) {
                showNotification('Clearing data...', 'warning');
                
                // Simulate data clearing
                setTimeout(() => {
                    clearData();
                }, 1500);
            }
        });
    }
}

// Export Data (Mock Function)
function exportData() {
    // In a real app, this would generate and download a file
    const mockData = {
        entries: [],
        preferences: {},
        exportDate: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(mockData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `diari-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    showNotification('Data exported successfully!', 'success');
}

// Create Backup (Mock Function)
function createBackup() {
    // In a real app, this would create a cloud backup
    console.log('Creating backup...');
    
    setTimeout(() => {
        showNotification('Backup created successfully!', 'success');
        console.log('Backup completed');
    }, 1000);
}

// Clear Data (Mock Function)
function clearData() {
    // In a real app, this would clear user data
    console.log('Clearing data...');
    
    setTimeout(() => {
        showNotification('All data cleared successfully', 'success');
        console.log('Data cleared');
        
        // Update storage display
        updateStorageDisplay(0, 0, 0);
    }, 1000);
}

// Update Storage Display
function updateStorageDisplay(textSize, attachmentSize, backupSize) {
    const totalSize = textSize + attachmentSize + backupSize;
    const percentage = (totalSize / 5 * 100).toFixed(0); // 5GB total
    
    // Update storage amount
    const storageAmount = document.querySelector('.storage-amount');
    if (storageAmount) {
        storageAmount.textContent = `${(totalSize / 1024).toFixed(1)} GB of 5 GB used`;
    }
    
    // Update storage bar
    const storageFill = document.querySelector('.storage-fill');
    if (storageFill) {
        storageFill.style.width = `${percentage}%`;
    }
    
    // Update storage breakdown
    const storageItems = document.querySelectorAll('.storage-item');
    if (storageItems[0]) storageItems[0].querySelector('.storage-size').textContent = `${(textSize / 1024).toFixed(1)} GB`;
    if (storageItems[1]) storageItems[1].querySelector('.storage-size').textContent = `${(attachmentSize / 1024).toFixed(1)} GB`;
    if (storageItems[2]) storageItems[2].querySelector('.storage-size').textContent = `${(backupSize / 1024).toFixed(1)} GB`;
}

const PROFILE_SECTION_PANELS = {
    preferences: 'profileSectionPreferences',
    privacy: 'profileSectionPrivacy',
    security: 'profileSectionSecurity',
};

const PROFILE_SECTION_COPY = {
    preferences: {
        title: 'Preferences',
        subtitle: 'Customize your DiariCore experience.',
    },
    privacy: {
        title: 'Privacy',
        subtitle: 'Data usage and sharing.',
    },
    security: {
        title: 'Security',
        subtitle: 'Password and account security.',
    },
};

function profileSectionFromHash() {
    const h = (location.hash || '').replace(/^#/, '').toLowerCase();
    return PROFILE_SECTION_PANELS[h] ? h : '';
}

function setProfileUrlHash(sectionKey) {
    try {
        const base = `${location.pathname}${location.search}`;
        if (sectionKey) {
            history.replaceState({}, '', `${base}#${sectionKey}`);
        } else {
            history.replaceState({}, '', base);
        }
    } catch (_) {}
}

function openProfileSection(sectionKey) {
    if (!PROFILE_SECTION_PANELS[sectionKey]) return;
    const overview = document.getElementById('profileOverviewShell');
    const shell = document.getElementById('profileSectionShell');
    if (!overview || !shell) return;

    overview.hidden = true;
    shell.hidden = false;
    document.body.classList.add('page-profile-section-open');

    Object.keys(PROFILE_SECTION_PANELS).forEach(function (k) {
        const el = document.getElementById(PROFILE_SECTION_PANELS[k]);
        if (el) el.hidden = k !== sectionKey;
    });

    const copy = PROFILE_SECTION_COPY[sectionKey];
    const titleEl = document.getElementById('profileSectionTitle');
    const subEl = document.getElementById('profileSectionSubtitle');
    if (titleEl && copy) titleEl.textContent = copy.title;
    if (subEl && copy) subEl.textContent = copy.subtitle;

    setProfileUrlHash(sectionKey);
    window.scrollTo(0, 0);
}

function closeProfileSection() {
    const overview = document.getElementById('profileOverviewShell');
    const shell = document.getElementById('profileSectionShell');
    if (!overview || !shell || shell.hidden) return;

    shell.hidden = true;
    overview.hidden = false;
    document.body.classList.remove('page-profile-section-open');

    Object.keys(PROFILE_SECTION_PANELS).forEach(function (k) {
        const el = document.getElementById(PROFILE_SECTION_PANELS[k]);
        if (el) el.hidden = true;
    });

    setProfileUrlHash(null);
    window.scrollTo(0, 0);
}

function initializeProfileSectionNavigation() {
    const backBtn = document.getElementById('profileSectionBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function () {
            closeProfileSection();
        });
    }

    document.querySelectorAll('[data-profile-section]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const key = btn.getAttribute('data-profile-section');
            if (key) openProfileSection(key);
        });
    });

    const mobileBackBtn = document.getElementById('profileMobileBackBtn');
    if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', function () {
            if (document.body.classList.contains('page-profile-section-open')) {
                closeProfileSection();
            } else {
                window.location.href = 'dashboard.html';
            }
        });
    }

    const editIdentityBtn = document.getElementById('profileEditIdentityBtn');
    if (editIdentityBtn) {
        editIdentityBtn.addEventListener('click', function () {
            openProfileSection('security');
        });
    }

    window.addEventListener('hashchange', function () {
        const key = profileSectionFromHash();
        if (key) openProfileSection(key);
        else closeProfileSection();
    });

    const initial = profileSectionFromHash();
    if (initial) {
        openProfileSection(initial);
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existingNotification = document.querySelector('.profile-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification
    const notification = document.createElement('div');
    notification.className = 'profile-notification';
    notification.innerHTML = `
        <i class="bi bi-${getNotificationIcon(type)}"></i>
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
        background: ${getNotificationColor(type)};
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

// Get Notification Icon
function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'x-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Get Notification Color
function getNotificationColor(type) {
    const colors = {
        'success': '#7FBF9F',
        'error': '#E74C3C',
        'warning': '#F4A261',
        'info': '#7FA7BF'
    };
    return colors[type] || '#7FA7BF';
}

if (document.body && document.body.classList.contains('page-profile')) {
    initializeProfileFromStorage();
} else {
    document.documentElement.classList.remove('profile-await-storage');
}
