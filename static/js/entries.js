// DiariCore Entries Page JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    await syncEntriesFromApi();
    initializeEntriesFromStorage();
    // Initialize components
    initializeFilterDropdown();
    initializeSearch();
    initializeEntryCards();
    initializeLoadMore();
    initializeEntriesResizeEmptyState();
});

async function syncEntriesFromApi() {
    const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    const userId = Number(user?.id || 0);
    if (!userId) return;
    try {
        const response = await fetch(`/api/entries?userId=${encodeURIComponent(String(userId))}`);
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.entries)) return;
        localStorage.setItem('diariCoreEntries', JSON.stringify(result.entries));
    } catch (error) {
        console.error('Failed to sync entries from API:', error);
    }
}

function initializeEntriesFromStorage() {
    const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
    const main = document.querySelector('.entries-content');
    const emptyState = document.getElementById('entriesEmptyState');
    const firstSection = document.querySelector('.entries-section');
    const aprilSection = document.querySelector('.april-section');
    const loadMoreSection = document.querySelector('.load-more-section');
    const firstGrid = firstSection ? firstSection.querySelector('.entries-grid') : null;
    if (!main || !emptyState || !firstSection || !firstGrid) return;

    const normalize = (arr) => Array.isArray(arr) ? arr : [];
    const userEntries = normalize(entries)
        .filter((e) => e && e.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (userEntries.length === 0) {
        firstSection.style.display = 'none';
        if (aprilSection) aprilSection.style.display = 'none';
        if (loadMoreSection) loadMoreSection.style.display = 'none';
        main.classList.add('entries-content--empty-results');

        const desktopTitle = emptyState.querySelector('.entries-empty-state__title--desktop');
        const desktopHint = emptyState.querySelector('.entries-empty-state__hint--desktop');
        const mobileTitle = emptyState.querySelector('.entries-empty-state__title--mobile');
        const mobileHint = emptyState.querySelector('.entries-empty-state__hint--mobile');
        if (desktopTitle) desktopTitle.textContent = 'No entries yet';
        if (desktopHint) desktopHint.textContent = 'Your journal is still empty. Write your first entry to start tracking your journey.';
        if (mobileTitle) mobileTitle.textContent = 'No entries yet';
        if (mobileHint) mobileHint.textContent = 'Write your first entry to get started.';
        return;
    }

    main.classList.remove('entries-content--empty-results');
    firstSection.style.display = '';
    if (aprilSection) aprilSection.style.display = 'none';
    if (loadMoreSection) loadMoreSection.style.display = 'none';

    const groups = {};
    userEntries.forEach((entry) => {
        const d = new Date(entry.date);
        if (Number.isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(entry);
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
        const [aY, aM] = a.split('-').map(Number);
        const [bY, bM] = b.split('-').map(Number);
        return new Date(bY, bM, 1) - new Date(aY, aM, 1);
    });

    firstGrid.innerHTML = '';
    sortedGroupKeys.forEach((key) => {
        const [year, month] = key.split('-').map(Number);
        const monthLabel = new Date(year, month, 1).toLocaleString('en-US', { month: 'long' }).toUpperCase();

        const monthHeader = document.createElement('div');
        monthHeader.className = 'month-header';
        monthHeader.innerHTML = `<i class="bi bi-calendar3"></i><span class="month-text">${monthLabel} ${year}</span>`;
        firstGrid.appendChild(monthHeader);

        groups[key].forEach((entry) => {
            firstGrid.appendChild(createStoredEntryCard(entry));
        });
    });
}

function moodIconClass(feelingRaw) {
    const feeling = (feelingRaw || '').toLowerCase();
    if (feeling === 'happy' || feeling === 'excited') return 'bi bi-emoji-smile';
    if (feeling === 'sad') return 'bi bi-emoji-frown';
    if (feeling === 'angry') return 'bi bi-emoji-angry';
    if (feeling === 'anxious' || feeling === 'stressed') return 'bi bi-lightning';
    if (feeling === 'calm' || feeling === 'peaceful') return 'bi bi-sun';
    return 'bi bi-emoji-neutral';
}

function resolveEntryFeeling(entry) {
    const feeling = (entry?.feeling || '').toLowerCase();
    if (feeling && feeling !== 'unspecified') return feeling;
    const sentiment = (entry?.sentimentLabel || '').toLowerCase();
    if (sentiment === 'positive') return 'happy';
    if (sentiment === 'negative') return 'stressed';
    return 'neutral';
}

function createStoredEntryCard(entry) {
    const article = document.createElement('article');
    article.className = 'entry-card';
    const date = new Date(entry.date);
    const dateText = Number.isNaN(date.getTime())
        ? 'Unknown date'
        : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const title = entry.text ? entry.text.trim().split('\n')[0].slice(0, 40) : 'Journal Entry';
    const excerpt = entry.text || '';
    const tags = Array.isArray(entry.tags) ? entry.tags : [];

    const resolvedFeeling = resolveEntryFeeling(entry);
    article.innerHTML = `
        <div class="entry-content-wrapper">
            <div class="entry-header">
                <div class="entry-meta">
                    <span class="entry-date">${dateText}</span>
                    <h3 class="entry-title">${title || 'Journal Entry'}</h3>
                </div>
                <div class="entry-mood">
                    <i class="${moodIconClass(resolvedFeeling)}"></i>
                    <span class="mood-label" style="display:none;">${resolvedFeeling}</span>
                </div>
            </div>
            <div class="entry-content">
                <p class="entry-excerpt">${excerpt || 'No details provided.'}</p>
                <div class="entry-tags">
                    ${(tags.length ? tags : ['Journal']).map((tag) => `<span class="tag">${tag}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
    return article;
}

let entriesResizeTimer;
function getEntriesSearchQuery() {
    const input = document.querySelector('.search-input');
    const top = document.getElementById('mobileAppTopbarSearchInput');
    const a = input ? input.value.trim() : '';
    const b = top ? top.value.trim() : '';
    return a || b;
}

function initializeEntriesResizeEmptyState() {
    window.addEventListener('resize', function () {
        clearTimeout(entriesResizeTimer);
        entriesResizeTimer = setTimeout(function () {
            performSearch(getEntriesSearchQuery());
        }, 150);
    });
}

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

        // Close filter menu when clicking outside (mobile trigger may load later — resolve each click)
        document.addEventListener('click', function(e) {
            const mb = document.getElementById('mobileTopbarFilterTrigger');
            const inFilterBtn = filterBtn.contains(e.target);
            const inMobileTrigger = mb && mb.contains(e.target);
            if (!filterMenu.contains(e.target) && !inFilterBtn && !inMobileTrigger) {
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

function hasActiveSearchOrFilters() {
    const q = getEntriesSearchQuery();
    if (q.length > 0) return true;
    return document.querySelectorAll('.filter-option input[type="checkbox"]:checked').length > 0;
}

function syncEntriesEmptyResultsLayout(visibleCount) {
    const main = document.querySelector('.entries-content');
    if (!main) return;
    if (visibleCount === 0 && hasActiveSearchOrFilters()) {
        main.classList.add('entries-content--empty-results');
    } else {
        main.classList.remove('entries-content--empty-results');
    }
}

// Update results message
function updateResultsMessage(visibleCount, totalCount) {
    const existingMessage = document.querySelector('.results-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    const searchSection = document.querySelector('.search-filter-section');
    const main = document.querySelector('.entries-content');
    if (!searchSection || !main) return;

    if (visibleCount < totalCount) {
        const message = document.createElement('div');
        message.className = 'results-message';
        message.innerHTML = `<p>Showing ${visibleCount} of ${totalCount} entries</p>`;
        /* After search, before empty-state markup — keeps “Showing X of Y” above the no-match card on all viewports */
        searchSection.insertAdjacentElement('afterend', message);
    }

    syncEntriesEmptyResultsLayout(visibleCount);
}

let entriesSearchDebounceTimer;

function onEntriesSearchInput(source) {
    const searchInput = document.querySelector('.search-input');
    const topbarInput = document.getElementById('mobileAppTopbarSearchInput');
    const v = source.value;
    if (searchInput && source !== searchInput) searchInput.value = v;
    if (topbarInput && source !== topbarInput) topbarInput.value = v;
    clearTimeout(entriesSearchDebounceTimer);
    entriesSearchDebounceTimer = setTimeout(() => {
        performSearch(v.trim());
    }, 300);
}

// Search: desktop field binds on load; navbar field binds when side-bar injects (async)
function initializeSearch() {
    const searchInput = document.querySelector('.search-input');
    if (searchInput && !searchInput.dataset.entriesSearchInit) {
        searchInput.dataset.entriesSearchInit = '1';
        searchInput.addEventListener('input', function() {
            onEntriesSearchInput(this);
        });
    }
    attachMobileTopbarSearchInput();
}

function attachMobileTopbarSearchInput() {
    const topbarInput = document.getElementById('mobileAppTopbarSearchInput');
    if (!topbarInput || topbarInput.dataset.entriesSearchInit) return;
    topbarInput.dataset.entriesSearchInit = '1';
    topbarInput.addEventListener('input', function() {
        onEntriesSearchInput(this);
    });
}

function attachMobileTopbarFilterTrigger() {
    const filterBtn = document.getElementById('filterBtn');
    const mobileTopbarFilterTrigger = document.getElementById('mobileTopbarFilterTrigger');
    if (!filterBtn || !mobileTopbarFilterTrigger || mobileTopbarFilterTrigger.dataset.filterInit) return;
    mobileTopbarFilterTrigger.dataset.filterInit = '1';
    mobileTopbarFilterTrigger.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        filterBtn.click();
    });
}

function openMobileNavbarSearchFromQuery() {
    if (window.innerWidth > 768) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('openSearch') !== '1') return;
    if (typeof window.diariOpenMobileTopbarSearch === 'function') {
        window.diariOpenMobileTopbarSearch();
    }
    params.delete('openSearch');
    const q = params.toString();
    const base = window.location.pathname.split('/').pop() || 'entries.html';
    history.replaceState({}, '', q ? `${base}?${q}` : base);
}

document.addEventListener('diari-mobile-shell-ready', function() {
    attachMobileTopbarSearchInput();
    attachMobileTopbarFilterTrigger();
    requestAnimationFrame(() => {
        requestAnimationFrame(openMobileNavbarSearchFromQuery);
    });
});

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
                // Force display to flex to override CSS
                entry.style.setProperty('display', 'flex', 'important');
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
            const aprilSection = document.querySelector('.april-section');
            if (aprilSection) {
                aprilSection.classList.add('april-section--visible');
                
                // Show first 2 April entries
                const aprilEntries = aprilSection.querySelectorAll('.entries-grid > .entry-card:nth-child(n+7)');
                let aprilShownCount = 0;
                
                aprilEntries.forEach(entry => {
                    if (aprilShownCount < 2) {
                        entry.style.setProperty('display', 'flex', 'important');
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
                <p style="text-align: center; color: var(--text-secondary); font-size: 0.9rem; margin: 2rem 0; font-style: italic;">
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
        // Desktop: reveal April month (hidden until first click); then hide control
        const aprilSection = document.querySelector('.april-section');
        if (aprilSection && !aprilSection.classList.contains('april-section--visible')) {
            aprilSection.classList.add('april-section--visible');
            if (loadMoreBtn) {
                loadMoreBtn.style.display = 'none';
            }
            showNotification('More entries loaded', 'success');
            return;
        }
        
        if (loadMoreBtn) {
            loadMoreBtn.style.display = 'none';
        }
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
