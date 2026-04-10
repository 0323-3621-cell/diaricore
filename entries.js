// DiariCore Entries Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize components
    initializeFilterDropdown();
    initializeSearch();
    initializeEntryCards();
    initializeLoadMore();
});

// Filter Dropdown Functionality
function initializeFilterDropdown() {
    const filterBtn = document.getElementById('filterBtn');
    const filterMenu = document.getElementById('filterMenu');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const clearFiltersBtn = document.getElementById('clearFilters');

    // Toggle filter menu
    if (filterBtn && filterMenu) {
        filterBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            filterMenu.classList.toggle('show');
        });

        // Close filter menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!filterMenu.contains(e.target) && e.target !== filterBtn) {
                filterMenu.classList.remove('show');
            }
        });

        // Prevent menu close when clicking inside
        filterMenu.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    // Apply filters
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', function() {
            applyFilters();
            filterMenu.classList.remove('show');
            showNotification('Filters applied successfully', 'success');
        });
    }

    // Clear filters
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            clearAllFilters();
            filterMenu.classList.remove('show');
            showNotification('Filters cleared', 'info');
        });
    }
}

// Apply Filters
function applyFilters() {
    const emotionFilters = getCheckedValues('emotion');
    const tagFilters = getCheckedValues('tags');
    
    const entryCards = document.querySelectorAll('.entry-card');
    let visibleCount = 0;

    entryCards.forEach(card => {
        const shouldShow = shouldShowEntry(card, emotionFilters, tagFilters);
        
        if (shouldShow) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    // Update results message
    updateResultsMessage(visibleCount, entryCards.length);
}

// Get checked values from filter checkboxes
function getCheckedValues(filterType) {
    const checkboxes = document.querySelectorAll(`.filter-option input[type="checkbox"]:checked`);
    return Array.from(checkboxes).map(cb => cb.value);
}

// Check if entry should be shown based on filters
function shouldShowEntry(card, emotionFilters, tagFilters) {
    // If no filters are applied, show all entries
    if (emotionFilters.length === 0 && tagFilters.length === 0) {
        return true;
    }

    // Check emotion filter
    const moodLabel = card.querySelector('.mood-label').textContent.toLowerCase();
    const emotionMatch = emotionFilters.length === 0 || emotionFilters.includes(moodLabel);

    // Check tag filter
    const tags = Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase());
    const tagMatch = tagFilters.length === 0 || tagFilters.some(filterTag => tags.includes(filterTag.toLowerCase()));

    return emotionMatch && tagMatch;
}

// Clear All Filters
function clearAllFilters() {
    const checkboxes = document.querySelectorAll('.filter-option input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });

    // Show all entries
    const entryCards = document.querySelectorAll('.entry-card');
    entryCards.forEach(card => {
        card.style.display = 'block';
    });

    // Update results message
    updateResultsMessage(entryCards.length, entryCards.length);
}

// Update results message
function updateResultsMessage(visibleCount, totalCount) {
    // Remove existing message if any
    const existingMessage = document.querySelector('.results-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    // Add new message if needed
    if (visibleCount < totalCount) {
        const message = document.createElement('div');
        message.className = 'results-message';
        message.innerHTML = `
            <p>Showing ${visibleCount} of ${totalCount} entries</p>
        `;
        
        const entriesSection = document.querySelector('.entries-section');
        entriesSection.insertBefore(message, entriesSection.querySelector('.entries-grid'));
    }
}

// Search Functionality
function initializeSearch() {
    const searchInput = document.querySelector('.search-input');
    
    if (searchInput) {
        let searchTimeout;
        
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                performSearch(this.value.trim());
            }, 300);
        });
    }
}

// Perform Search
function performSearch(query) {
    const entryCards = document.querySelectorAll('.entry-card');
    let visibleCount = 0;

    entryCards.forEach(card => {
        const title = card.querySelector('.entry-title').textContent.toLowerCase();
        const excerpt = card.querySelector('.entry-excerpt').textContent.toLowerCase();
        const tags = Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase());
        
        const searchQuery = query.toLowerCase();
        const matchesSearch = query === '' || 
            title.includes(searchQuery) || 
            excerpt.includes(searchQuery) || 
            tags.some(tag => tag.includes(searchQuery));

        if (matchesSearch) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    updateResultsMessage(visibleCount, entryCards.length);
}

// Entry Cards Functionality
function initializeEntryCards() {
    const readMoreButtons = document.querySelectorAll('.btn-read-more');
    
    readMoreButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.entry-card');
            showEntryDetails(card);
        });
    });

    // Add click event to cards
    const entryCards = document.querySelectorAll('.entry-card');
    entryCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // Don't trigger if clicking on buttons or links
            if (!e.target.closest('button')) {
                showEntryDetails(this);
            }
        });
    });
}

// Show Entry Details (Mock Function)
function showEntryDetails(card) {
    const title = card.querySelector('.entry-title').textContent;
    showNotification(`Opening entry: ${title}`, 'info');
    
    // In a real application, this would open a modal or navigate to entry detail page
    console.log('Entry clicked:', title);
}

// Load More Functionality
function initializeLoadMore() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            loadMoreEntries();
        });
    }
}

// Load More Entries (Works on both mobile and desktop)
function loadMoreEntries() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const entriesGrid = document.querySelector('.entries-grid');
    
    // Check if we're on mobile
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        // Mobile: Show 2 more hidden entries or April section
        const hiddenEntries = document.querySelectorAll('.entries-grid > .entry-card:nth-child(n+7)');
        let shownCount = 0;
        
        hiddenEntries.forEach(entry => {
            if (shownCount < 2) {
                // Force display to block to override CSS
                entry.style.setProperty('display', 'block', 'important');
                shownCount++;
            }
        });
        
        // Count remaining hidden entries more accurately
        const allHiddenEntries = document.querySelectorAll('.entries-grid > .entry-card:nth-child(n+7)');
        let remainingCount = 0;
        
        allHiddenEntries.forEach(entry => {
            const computedStyle = window.getComputedStyle(entry);
            if (computedStyle.display === 'none') {
                remainingCount++;
            }
        });
        
        // If no more March entries, show April section
        if (remainingCount === 0) {
            const aprilSection = document.querySelector('.entries-section:nth-of-type(2)');
            if (aprilSection) {
                aprilSection.style.setProperty('display', 'block', 'important');
                
                // Show first 2 April entries
                const aprilEntries = aprilSection.querySelectorAll('.entries-grid > .entry-card:nth-child(n+7)');
                let aprilShownCount = 0;
                
                aprilEntries.forEach(entry => {
                    if (aprilShownCount < 2) {
                        entry.style.setProperty('display', 'block', 'important');
                        aprilShownCount++;
                    }
                });
                
                // Check if there are still more April entries to show
                const remainingAprilEntries = aprilSection.querySelectorAll('.entries-grid > .entry-card:nth-child(n+7)');
                let remainingAprilCount = 0;
                
                remainingAprilEntries.forEach(entry => {
                    const computedStyle = window.getComputedStyle(entry);
                    if (computedStyle.display === 'none') {
                        remainingAprilCount++;
                    }
                });
                
                // Hide button and show message if no more entries at all
                if (remainingAprilCount === 0) {
                    loadMoreBtn.style.display = 'none';
                    
                    // Add "nothing to show" message
                    const nothingToShow = document.createElement('div');
                    nothingToShow.className = 'nothing-to-show-mobile';
                    nothingToShow.innerHTML = `
                        <p style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; margin: 1rem 0; font-style: italic;">
                            Nothing more to show for this month
                        </p>
                    `;
                    
                    // Insert after load more button container
                    const loadMoreContainer = loadMoreBtn.parentElement;
                    loadMoreContainer.parentNode.insertBefore(nothingToShow, loadMoreContainer.nextSibling);
                }
            }
        }
        
        showNotification(`${shownCount} more entries loaded`, 'success');
    } else {
        // Desktop: Show 2 more hidden entries (same as mobile for consistency)
        const hiddenEntries = document.querySelectorAll('.entries-grid > .entry-card:nth-child(n+7)');
        let shownCount = 0;
        
        hiddenEntries.forEach(entry => {
            if (shownCount < 2 && entry.style.display === 'none') {
                entry.style.display = 'block';
                shownCount++;
            }
        });
        
        // Hide button if no more entries to show
        const remainingHidden = document.querySelectorAll('.entries-grid > .entry-card:nth-child(n+7)[style="display: none;"]').length;
        if (remainingHidden === 0) {
            loadMoreBtn.style.display = 'none';
        }
        
        showNotification(`${shownCount} more entries loaded`, 'success');
    }
}

// Generate Mock Entries
function generateMockEntries(count) {
    const mockEntries = [];
    const emotions = [
        { emoji: '😊', label: 'Happy' },
        { emoji: '😔', label: 'Sad' },
        { emoji: '😌', label: 'Calm' },
        { emoji: '😡', label: 'Angry' },
        { emoji: '😰', label: 'Anxious' }
    ];
    
    const titles = [
        'Morning Coffee Thoughts',
        'Weekend Reflections',
        'Project Update',
        'Family Time',
        'Personal Growth',
        'Daily Gratitude'
    ];
    
    const excerpts = [
        'Today was filled with unexpected moments that made me realize the importance of being present...',
        'Sometimes the smallest victories are the ones that matter most in our journey...',
        'Taking time to reflect on where I am and where I want to be has been eye-opening...',
        'The connections we make with others truly shape our experiences in profound ways...',
        'Learning to embrace change has been one of the most challenging yet rewarding lessons...',
        'Gratitude practice has transformed how I view even the simplest moments of each day...'
    ];

    const tags = [
        ['Personal', 'Reflection'],
        ['Work', 'Growth'],
        ['Family', 'Love'],
        ['Health', 'Wellness'],
        ['Goals', 'Future'],
        ['Gratitude', 'Mindfulness']
    ];

    for (let i = 0; i < count; i++) {
        const emotion = emotions[Math.floor(Math.random() * emotions.length)];
        const title = titles[Math.floor(Math.random() * titles.length)];
        const excerpt = excerpts[Math.floor(Math.random() * excerpts.length)];
        const entryTags = tags[Math.floor(Math.random() * tags.length)];
        const date = new Date();
        date.setDate(date.getDate() - (i + 7)); // Go back in time

        const entryCard = createEntryCard({
            day: date.getDate(),
            month: date.toLocaleDateString('en', { month: 'short' }),
            emotion: emotion,
            title: title,
            excerpt: excerpt,
            tags: entryTags
        });

        mockEntries.push(entryCard);
    }

    return mockEntries;
}

// Create Entry Card Element
function createEntryCard(data) {
    const card = document.createElement('article');
    card.className = 'entry-card';
    
    card.innerHTML = `
        <div class="entry-header">
            <div class="entry-date">
                <span class="date-day">${data.day}</span>
                <span class="date-month">${data.month}</span>
            </div>
            <div class="entry-mood">
                <span class="mood-emoji">${data.emotion.emoji}</span>
                <span class="mood-label">${data.emotion.label}</span>
            </div>
        </div>
        <div class="entry-content">
            <h3 class="entry-title">${data.title}</h3>
            <p class="entry-excerpt">${data.excerpt}</p>
            <div class="entry-tags">
                ${data.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
        </div>
        <div class="entry-footer">
            <button class="btn-read-more">Read More</button>
        </div>
    `;
    
    return card;
}

// Show Notification
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existingNotification = document.querySelector('.entries-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification
    const notification = document.createElement('div');
    notification.className = 'entries-notification';
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
        background: ${type === 'success' ? '#7FBF9F' : type === 'error' ? '#E74C3C' : '#7FA7BF'};
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
