// DiariCore Profile Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initializeProfileFromStorage();
    // Initialize profile components
    initializeProfileInteractions();
    initializePreferenceToggles();
    initializeStorageActions();
    initializeDangerZoneActions();
});

function initializeProfileFromStorage() {
    const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
    const safeEntries = Array.isArray(entries) ? entries.filter((e) => e && e.date) : [];

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
}

function calculateEntryStreak(entries) {
    if (!entries.length) return 0;
    const uniqueDays = Array.from(new Set(entries.map((e) => {
        const d = new Date(e.date);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }))).sort((a, b) => new Date(b) - new Date(a));

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    for (let i = 0; i < uniqueDays.length; i += 1) {
        const expected = new Date(cursor);
        expected.setDate(cursor.getDate() - i);
        const dayKey = `${expected.getFullYear()}-${expected.getMonth()}-${expected.getDate()}`;
        if (uniqueDays[i] === dayKey) streak += 1;
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

// Initialize Profile Interactions
function initializeProfileInteractions() {
    const mobileLogoutBtn = document.getElementById('profileMobileLogoutBtn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', function() {
            localStorage.removeItem('diariCoreUser');
            window.location.href = 'login.html';
        });
    }

    // Avatar edit button
    const avatarEditBtn = document.querySelector('.avatar-edit-btn');
    if (avatarEditBtn) {
        avatarEditBtn.addEventListener('click', function() {
            showNotification('Opening avatar upload...', 'info');
            // In a real app, this would open file picker
            console.log('Avatar edit clicked');
        });
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
    
    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', function() {
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

// Initialize Danger Zone Actions
function initializeDangerZoneActions() {
    // Deactivate button
    const deactivateBtn = document.querySelector('.btn-deactivate');
    if (deactivateBtn) {
        deactivateBtn.addEventListener('click', function() {
            const confirmed = confirm('Are you sure you want to deactivate your account? You can reactivate it later by logging back in.');
            
            if (confirmed) {
                showNotification('Deactivating account...', 'warning');
                
                setTimeout(() => {
                    deactivateAccount();
                }, 1500);
            }
        });
    }

    // Delete account button
    const deleteAccountBtn = document.querySelector('.btn-delete-account');
    if (deleteAccountBtn) {
        deleteAccountBtn.addEventListener('click', function() {
            const confirmed = confirm('Are you absolutely sure you want to delete your account permanently? This action cannot be undone and all your data will be lost.');
            
            if (confirmed) {
                const doubleConfirmed = confirm('This is your last chance. Type "DELETE" to confirm permanent account deletion.');
                
                if (doubleConfirmed) {
                    showNotification('Deleting account permanently...', 'error');
                    
                    setTimeout(() => {
                        deleteAccountPermanently();
                    }, 2000);
                }
            }
        });
    }
}

// Deactivate Account (Mock Function)
function deactivateAccount() {
    // In a real app, this would deactivate the account
    console.log('Deactivating account...');
    
    setTimeout(() => {
        showNotification('Account deactivated. You can reactivate by logging back in.', 'success');
        console.log('Account deactivated');
        
        // In a real app, this would redirect to login page
        // window.location.href = 'login.html';
    }, 1500);
}

// Delete Account Permanently (Mock Function)
function deleteAccountPermanently() {
    // In a real app, this would permanently delete the account
    console.log('Deleting account permanently...');
    
    setTimeout(() => {
        showNotification('Account deleted permanently. Redirecting to home...', 'error');
        console.log('Account deleted permanently');
        
        // In a real app, this would redirect to home page
        // window.location.href = 'index.html';
    }, 2000);
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
