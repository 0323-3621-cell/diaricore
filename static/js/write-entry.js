// Write Entry Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let selectedFeeling = null;
    let selectedTags = new Set();
    let manualDateTime = null;

    function normalizeTag(tag) {
        return String(tag || '').trim().replace(/\s+/g, ' ');
    }

    const DEFAULT_TAGS = [
        { name: 'School', icon: 'bi bi-book' },
        { name: 'Home', icon: 'bi bi-house' },
        { name: 'Friends', icon: 'bi bi-people' },
        { name: 'Work', icon: 'bi bi-briefcase' },
        { name: 'Family', icon: 'bi bi-heart' },
        { name: 'Health', icon: 'bi bi-heart-pulse' },
        { name: 'Money', icon: 'bi bi-currency-dollar' },
    ];

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function iconClassForTag(tagName) {
        const t = normalizeTag(tagName).toLowerCase();
        const match = DEFAULT_TAGS.find((x) => x.name.toLowerCase() === t);
        return match ? match.icon : 'bi bi-hash';
    }

    async function syncUserTagsIntoUI() {
        const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        const userId = Number(user?.id || 0);
        const container = document.querySelector('.tags-container');
        if (!container) return;

        // Start from defaults
        let tags = DEFAULT_TAGS.map((x) => x.name);

        if (userId) {
            try {
                const res = await fetch(`/api/tags?userId=${encodeURIComponent(String(userId))}`);
                const json = await res.json();
                if (res.ok && json.success && Array.isArray(json.tags)) {
                    tags = tags.concat(json.tags);
                }
            } catch (e) {
                console.error('Failed to load user tags:', e);
            }
        }

        // Dedup, normalize, keep order (defaults first)
        const seen = new Set();
        const merged = [];
        tags.forEach((t) => {
            const n = normalizeTag(t);
            const key = n.toLowerCase();
            if (!n || seen.has(key)) return;
            seen.add(key);
            merged.push(n);
        });

        // Preserve the existing "Add Tag" button
        const addBtn = container.querySelector('.tag-btn.add-tag');
        container.querySelectorAll('.tag-btn:not(.add-tag)').forEach((el) => el.remove());

        merged.forEach((name) => {
            const btn = document.createElement('button');
            btn.className = 'tag-btn';
            btn.dataset.tag = name;
            btn.innerHTML = `<i class="${escapeHtml(iconClassForTag(name))}"></i><span>${escapeHtml(name)}</span>`;
            btn.addEventListener('click', function() {
                const tag = normalizeTag(this.dataset.tag);
                if (!tag) return;
                if (selectedTags.has(tag)) {
                    selectedTags.delete(tag);
                    this.classList.remove('selected');
                } else {
                    selectedTags.add(tag);
                    this.classList.add('selected');
                }
            });
            if (addBtn) container.insertBefore(btn, addBtn);
            else container.appendChild(btn);
        });

        // Re-run your existing visibility logic now that buttons changed
        updateTagVisibility();
    }

    function updateJournalDateTime() {
        const dateTimeEl = document.getElementById('journalDateTime');
        if (!dateTimeEl) return;
        const sourceDate = manualDateTime || new Date();
        const datePart = sourceDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
        const timePart = sourceDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
        dateTimeEl.textContent = `${datePart} | ${timePart}`;
    }
    
    // Reset selected states on page load
    function resetSelections() {
        // Reset feelings selection
        selectedFeeling = null;
        const feelingCards = document.querySelectorAll('.feeling-card');
        feelingCards.forEach(card => {
            card.classList.remove('selected');
        });
        
        // Reset tags selection
        selectedTags.clear();
        const tagButtons = document.querySelectorAll('.tag-btn:not(.add-tag)');
        tagButtons.forEach(button => {
            button.classList.remove('selected');
        });
        
        console.log('Selections reset on page load');
    }
    
    // Call reset function immediately
    resetSelections();
    
    // Category switching functionality
    const categoryButtons = document.querySelectorAll('.category-btn');
    const categoryGrids = document.querySelectorAll('.category-grid');
    
    categoryButtons.forEach(button => {
        button.addEventListener('click', function() {
            const category = this.dataset.category;
            
            // Remove active class from all buttons and grids
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            categoryGrids.forEach(grid => grid.classList.remove('active'));
            
            // Add active class to clicked button and corresponding grid
            this.classList.add('active');
            const targetGrid = document.querySelector(`.category-grid[data-category="${category}"]`);
            if (targetGrid) {
                targetGrid.classList.add('active');
            }
        });
    });
    
    // Feeling selection functionality
    const feelingCards = document.querySelectorAll('.feeling-card');
    feelingCards.forEach(card => {
        card.addEventListener('click', function() {
            // Remove selected class from all cards
            feelingCards.forEach(c => c.classList.remove('selected'));
            
            // Add selected class to clicked card
            this.classList.add('selected');
            selectedFeeling = this.dataset.feeling;
            
            console.log('Selected feeling:', selectedFeeling);
        });
    });
    
    // Desktop more button functionality - show/hide second row
    function setupDesktopMoreButton() {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) return;
        
        const moreBtn = document.getElementById('moreTagsBtn');
        let expanded = false;
        
        // Function to update second row tags
        function updateSecondRowTags() {
            const allTags = document.querySelectorAll('.tags-container .tag-btn');
            const allTagsArray = Array.from(allTags); // Convert NodeList to array
            const firstRowTags = allTagsArray.slice(0, 7); // First 7 tags
            const secondRowTags = allTagsArray.slice(7); // All tags after 7
            
            console.log('Desktop - Total tags:', allTagsArray.length, 'First row:', firstRowTags.length, 'Second row:', secondRowTags.length, 'Expanded:', expanded);
            
            // Remove existing second-row classes
            allTagsArray.forEach(tag => tag.classList.remove('second-row'));
            
            // Add second-row class to tags beyond 7th
            secondRowTags.forEach(tag => {
                tag.classList.add('second-row');
                console.log('Adding second-row class to:', tag.dataset.tag || 'Add Tag');
            });
            
            // Show more button if there are second row tags
            if (secondRowTags.length > 0) {
                moreBtn.style.display = 'flex';
                console.log('Showing more button');
            } else {
                moreBtn.style.display = 'none';
                console.log('Hiding more button');
            }
            
            // Set initial visibility based on expanded state
            secondRowTags.forEach(tag => {
                if (expanded) {
                    tag.style.display = 'flex';
                    console.log('Showing second row tag:', tag.dataset.tag || 'Add Tag');
                } else {
                    tag.style.display = 'none';
                    console.log('Hiding second row tag:', tag.dataset.tag || 'Add Tag');
                }
            });
            
            return secondRowTags;
        }
        
        // Initial setup
        const secondRowTags = updateSecondRowTags();
        
        // Remove all existing event listeners by cloning and replacing
        const newMoreBtn = moreBtn.cloneNode(true);
        moreBtn.parentNode.replaceChild(newMoreBtn, moreBtn);
        
        // Add desktop-specific event listener with higher priority
        newMoreBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            console.log('Desktop more button clicked');
            expanded = !expanded;
            const currentSecondRowTags = updateSecondRowTags();
            
            // Update button state
            if (expanded) {
                newMoreBtn.classList.add('expanded');
                newMoreBtn.querySelector('span').textContent = 'less';
                console.log('Button state: less');
            } else {
                newMoreBtn.classList.remove('expanded');
                newMoreBtn.querySelector('span').textContent = 'more';
                console.log('Button state: more');
            }
        }, true); // Use capture phase for higher priority
        
        // Store update function for external use
        window.updateDesktopTags = updateSecondRowTags;
    }
    
    // Mobile more tags functionality (show first row of 4, hide rest)
    function setupMobileMoreButton() {
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) return;
        
        const moreBtn = document.getElementById('moreTagsBtn');
        let mobileExpanded = false; // Start with collapsed state
        
        // Function to update mobile tag rows
        function updateMobileTagRows() {
            const allTags = document.querySelectorAll('.tags-container .tag-btn');
            const allTagsArray = Array.from(allTags); // Convert NodeList to array
            const firstRowTags = allTagsArray.slice(0, 4); // First 4 tags
            const otherRowsTags = allTagsArray.slice(4); // All tags after 4
            
            console.log('Mobile - Total tags:', allTagsArray.length, 'First row:', firstRowTags.length, 'Other rows:', otherRowsTags.length, 'Expanded:', mobileExpanded);
            
            // Show more button if there are tags beyond first 4
            if (otherRowsTags.length > 0) {
                moreBtn.style.display = 'flex';
            } else {
                moreBtn.style.display = 'none';
            }
            
            // Always show first row
            firstRowTags.forEach(tag => {
                tag.style.display = 'flex';
                console.log('Showing first row tag:', tag.dataset.tag || 'Add Tag');
            });
            
            // Hide/show other rows based on expanded state
            otherRowsTags.forEach(tag => {
                if (mobileExpanded) {
                    tag.style.display = 'flex';
                    console.log('Showing other row tag:', tag.dataset.tag || 'Add Tag');
                } else {
                    tag.style.display = 'none';
                    console.log('Hiding other row tag:', tag.dataset.tag || 'Add Tag');
                }
            });
        }
        
        // Initial setup - force collapsed state
        mobileExpanded = false;
        updateMobileTagRows();
        
        // Remove any existing event listeners and set mobile onclick
        moreBtn.onclick = function() {
            mobileExpanded = !mobileExpanded;
            updateMobileTagRows();
            
            // Update button state
            if (mobileExpanded) {
                moreBtn.classList.add('expanded');
                moreBtn.querySelector('span').textContent = 'less';
            } else {
                moreBtn.classList.remove('expanded');
                moreBtn.querySelector('span').textContent = 'more';
            }
        };
    }
    
    // Update tag visibility based on platform
    function updateTagVisibility() {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            // Mobile: Clear any desktop interference first
            const moreBtn = document.getElementById('moreTagsBtn');
            if (moreBtn) {
                moreBtn.removeEventListener('click', arguments.callee);
            }
            setupMobileMoreButton();
        } else {
            // Desktop: Run after a small delay to ensure mobile doesn't override
            setTimeout(() => {
                setupDesktopMoreButton();
            }, 10);
        }
    }
    
    // Initialize tags (defaults + user tags) then apply visibility rules
    syncUserTagsIntoUI();
    
    // Update on window resize
    window.addEventListener('resize', updateTagVisibility);
    
    // Tag selection functionality
    const tagButtons = document.querySelectorAll('.tag-btn:not(.add-tag)');
    tagButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tag = normalizeTag(this.dataset.tag);
            if (!tag) return;
            
            if (selectedTags.has(tag)) {
                // Remove tag if already selected
                selectedTags.delete(tag);
                this.classList.remove('selected');
            } else {
                // Add tag if not selected
                selectedTags.add(tag);
                this.classList.add('selected');
            }
            
            console.log('Selected tags:', Array.from(selectedTags));
        });
    });
    
    // Add tag functionality
    const addTagBtn = document.querySelector('.tag-btn.add-tag');
    addTagBtn.addEventListener('click', function() {
            const tagName = normalizeTag(prompt('Enter new tag name:'));
        if (tagName) {
            createNewTag(tagName);
        }
    });
    
    function createNewTag(tagName) {
        const tagsContainer = document.querySelector('.tags-container');
        const addTagBtn = document.querySelector('.tag-btn.add-tag');
        
        const normalizedName = normalizeTag(tagName);
        if (!normalizedName) return;
        const existingTags = Array.from(document.querySelectorAll('.tag-btn:not(.add-tag)'))
            .map((btn) => normalizeTag(btn.dataset.tag).toLowerCase());
        if (existingTags.includes(normalizedName.toLowerCase())) return;

        const newTagBtn = document.createElement('button');
        newTagBtn.className = 'tag-btn';
        newTagBtn.dataset.tag = normalizedName;
        newTagBtn.innerHTML = `
            <i class="${iconClassForTag(normalizedName)}"></i>
            <span>${normalizedName}</span>
        `;

        // Persist to user account (best-effort)
        (async () => {
            const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
            const userId = Number(user?.id || 0);
            if (!userId) return;
            try {
                await fetch('/api/tags', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, tag: normalizedName })
                });
            } catch (e) {
                console.error('Failed to save tag:', e);
            }
        })();
        
        // Add click event to new tag
        newTagBtn.addEventListener('click', function() {
            const tag = normalizeTag(this.dataset.tag);
            if (!tag) return;
            
            if (selectedTags.has(tag)) {
                selectedTags.delete(tag);
                this.classList.remove('selected');
            } else {
                selectedTags.add(tag);
                this.classList.add('selected');
            }
            
            console.log('Selected tags:', Array.from(selectedTags));
        });
        
        // Insert new tag before add button
        tagsContainer.insertBefore(newTagBtn, addTagBtn);
        
        // Update tag layout based on platform
        if (window.innerWidth > 768 && window.updateDesktopTags) {
            window.updateDesktopTags();
        } else if (window.innerWidth <= 768) {
            // Trigger mobile update
            setupMobileMoreButton();
        }
        
        // Animate new tag
        newTagBtn.style.opacity = '0';
        newTagBtn.style.transform = 'scale(0.8)';
        setTimeout(() => {
            newTagBtn.style.transition = 'all 0.3s ease';
            newTagBtn.style.opacity = '1';
            newTagBtn.style.transform = 'scale(1)';
        }, 10);
    }
    
    const journalText = document.getElementById('journalText');
    const charCount = document.getElementById('charCount');
    const journalDateTimeBtn = document.getElementById('journalDateTimeBtn');
    const journalDateTimeInput = document.getElementById('journalDateTimeInput');
    updateJournalDateTime();
    setInterval(() => {
        if (!manualDateTime) updateJournalDateTime();
    }, 30000);

    if (journalDateTimeBtn && journalDateTimeInput) {
        const toLocalInputValue = (dateObj) => {
            const d = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
            return d.toISOString().slice(0, 16);
        };

        journalDateTimeBtn.addEventListener('click', () => {
            const baseDate = manualDateTime || new Date();
            journalDateTimeInput.value = toLocalInputValue(baseDate);
            journalDateTimeInput.style.display = 'inline-block';
            journalDateTimeInput.focus();
        });

        journalDateTimeInput.addEventListener('change', () => {
            if (!journalDateTimeInput.value) return;
            manualDateTime = new Date(journalDateTimeInput.value);
            updateJournalDateTime();
        });

        const hideDateInput = () => {
            journalDateTimeInput.style.display = 'none';
        };
        journalDateTimeInput.addEventListener('blur', hideDateInput);
        journalDateTimeInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' || event.key === 'Enter') hideDateInput();
        });
    }

    journalText.addEventListener('input', function() {
        const count = this.value.length;
        if (charCount) {
            charCount.textContent = count;
            if (count > 4500) {
                charCount.style.color = 'var(--warning-color)';
            } else if (count > 4000) {
                charCount.style.color = 'var(--info-color)';
            } else {
                charCount.style.color = 'var(--text-muted)';
            }
        }
    });
    
    // Voice input button functionality
    const voiceInputBtn = document.getElementById('voiceInputBtn');
    
    if (voiceInputBtn) {
        voiceInputBtn.addEventListener('click', function() {
            // Both mobile and desktop now redirect to voice-entry.html
            window.location.href = 'voice-entry.html';
        });
    }
    
    async function handleSaveEntry() {
        const entryText = journalText.value.trim();
        if (!entryText) {
            alert('Please write something in your journal entry.');
            return;
        }

        const currentUser = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        const userId = Number(currentUser?.id || 0);

        setSavingState(true);
        const analysisOverlay = ensureAnalysisOverlay();
        showAnalysisLoading(analysisOverlay);

        try {
            const response = await fetch('/api/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    text: entryText,
                    tags: Array.from(selectedTags).map(normalizeTag).filter(Boolean)
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success || !result.entry) {
                throw new Error(result.error || 'Failed to save entry.');
            }
            const analysisEngine = (result.analysisEngine || '').toString().toLowerCase();

            const savedEntry = {
                ...result.entry,
                characterCount: entryText.length
            };
            const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
            entries.push(savedEntry);
            localStorage.setItem('diariCoreEntries', JSON.stringify(entries));
            console.log('Entry saved:', savedEntry);

            showAnalysisResult(analysisOverlay, savedEntry, analysisEngine === 'fallback');
            localStorage.removeItem('diariCoreDraft');
        } catch (error) {
            console.error('Failed to save entry via API:', error);
            const fallbackEntry = {
                feeling: 'unspecified',
                tags: Array.from(selectedTags),
                text: entryText,
                date: new Date().toISOString(),
                characterCount: entryText.length
            };
            const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
            entries.push(fallbackEntry);
            localStorage.setItem('diariCoreEntries', JSON.stringify(entries));
            showAnalysisResult(analysisOverlay, fallbackEntry, true);
            localStorage.removeItem('diariCoreDraft');
        } finally {
            setSavingState(false);
        }
    }

    // Save entry functionality (desktop + mobile save buttons)
    const saveEntryButtons = document.querySelectorAll('#saveEntryBtn, .btn-save-entry');
    saveEntryButtons.forEach((btn) => {
        btn.addEventListener('click', handleSaveEntry);
    });
    
    // Cancel functionality
    const cancelBtn = document.getElementById('cancelBtn');
    cancelBtn.addEventListener('click', function() {
        if (journalText.value.trim() || selectedTags.size > 0) {
            if (confirm('Are you sure you want to cancel? Your unsaved changes will be lost.')) {
                window.location.href = 'dashboard.html';
            }
        } else {
            window.location.href = 'dashboard.html';
        }
    });
    
    function ensureAnalysisOverlay() {
        let overlay = document.getElementById('moodAnalysisOverlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'moodAnalysisOverlay';
        overlay.className = 'mood-analysis-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="mood-analysis-card">
                <div class="mood-analysis-card__header">
                    <h3 class="mood-analysis-card__title">Mood Analysis</h3>
                </div>
                <div class="mood-analysis-card__body" id="moodAnalysisBody"></div>
                <div class="mood-analysis-card__footer">
                    <button type="button" class="mood-analysis-btn" id="moodAnalysisContinueBtn">Continue</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    function showAnalysisLoading(overlay) {
        const body = overlay.querySelector('#moodAnalysisBody');
        const footer = overlay.querySelector('.mood-analysis-card__footer');
        body.innerHTML = `
            <div class="mood-analysis-loading">
                <span class="mood-analysis-spinner" aria-hidden="true"></span>
                <span>Analyzing mood...</span>
            </div>
        `;
        footer.style.display = 'none';
        overlay.hidden = false;
    }

    function computeEnergy(score) {
        if (score >= 0.65) return 'High';
        if (score >= 0.45) return 'Moderate';
        return 'Low';
    }

    function computeInterpretation(score) {
        if (score >= 0.65) return 'Clear dominant mood';
        if (score >= 0.45) return 'Mixed emotional signals';
        return 'Highly mixed / ambiguous';
    }

    function formatPct(value) {
        const n = Number(value ?? 0);
        return `${(Math.max(0, Math.min(1, n)) * 100).toFixed(1)}%`;
    }

    function toTitleCase(text) {
        return (text || '')
            .toString()
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function buildSignalPairs(entry, primaryEmotion, primaryScore) {
        const allowed = ['sad', 'anxious', 'angry', 'happy', 'neutral'];
        const allProbs = entry && typeof entry.all_probs === 'object' ? entry.all_probs : null;

        if (allProbs) {
            const merged = {};
            allowed.forEach((label) => {
                merged[label] = Number(allProbs[label] || 0);
            });
            if (primaryEmotion && primaryEmotion in merged) {
                merged[primaryEmotion] = Number(primaryScore || merged[primaryEmotion] || 0);
            }
            return Object.entries(merged).sort((a, b) => b[1] - a[1]);
        }

        const fallback = {};
        allowed.forEach((label) => {
            fallback[label] = label === primaryEmotion ? Number(primaryScore || 0.5) : 0;
        });
        return Object.entries(fallback).sort((a, b) => b[1] - a[1]);
    }

    function showAnalysisResult(overlay, entry, isFallback = false) {
        const body = overlay.querySelector('#moodAnalysisBody');
        const footer = overlay.querySelector('.mood-analysis-card__footer');
        const continueBtn = overlay.querySelector('#moodAnalysisContinueBtn');
        const emotion = (entry.emotionLabel || entry.feeling || 'neutral').toString().toLowerCase();
        const score = Number(entry.emotionScore || entry.sentimentScore || 0.5);
        const sentiment = (entry.sentimentLabel || 'neutral').toString().toLowerCase();
        const valence = sentiment === 'positive' ? 'Positive' : sentiment === 'negative' ? 'Negative' : 'Balanced';
        const pairs = buildSignalPairs(entry, emotion, score);
        const secondary = pairs[1] && Number(pairs[1][1]) >= 0.15 ? pairs[1] : null;
        const signalsHtml = pairs
            .map(([label, prob]) => `<div class="mood-analysis-signal-row"><span>${label}</span><span>${formatPct(prob)}</span></div>`)
            .join('');

        body.innerHTML = `
            <div class="mood-analysis-result">
                <div class="mood-analysis-group">
                    <div class="mood-analysis-row"><span class="mood-analysis-label">Primary Mood</span><span class="mood-analysis-value">${toTitleCase(emotion)} (${formatPct(score)})</span></div>
                    <div class="mood-analysis-row"><span class="mood-analysis-label">Secondary Mood</span><span class="mood-analysis-value">${secondary ? `${toTitleCase(secondary[0])} (${formatPct(secondary[1])})` : 'None (no strong secondary signal)'}</span></div>
                </div>
                <div class="mood-analysis-group">
                    <div class="mood-analysis-row mood-analysis-row--stack">
                        <span class="mood-analysis-label">Emotional Signals</span>
                        <div class="mood-analysis-signals">${signalsHtml}</div>
                    </div>
                </div>
                <div class="mood-analysis-group">
                    <div class="mood-analysis-row"><span class="mood-analysis-label">Valence</span><span class="mood-analysis-value">${valence}</span></div>
                    <div class="mood-analysis-row"><span class="mood-analysis-label">Energy</span><span class="mood-analysis-value">${computeEnergy(score)}</span></div>
                    <div class="mood-analysis-row"><span class="mood-analysis-label">Interpretation</span><span class="mood-analysis-value">${computeInterpretation(score)}</span></div>
                </div>
                ${isFallback ? '<div class="mood-analysis-note">Saved with fallback analysis</div>' : ''}
            </div>
        `;
        footer.style.display = 'flex';
        continueBtn.onclick = () => {
            overlay.hidden = true;
            window.location.href = 'dashboard.html';
        };
    }

    function setSavingState(isSaving) {
        const buttons = document.querySelectorAll('#saveEntryBtn, .btn-save-entry');
        buttons.forEach((btn) => {
            btn.disabled = isSaving;
            btn.style.opacity = isSaving ? '0.75' : '1';
            btn.style.cursor = isSaving ? 'not-allowed' : 'pointer';
        });
    }
    
    // Auto-save functionality (optional)
    let autoSaveTimer;
    journalText.addEventListener('input', function() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            // Save draft to localStorage
            const draft = {
                feeling: selectedFeeling,
                tags: Array.from(selectedTags),
                text: this.value,
                date: new Date().toISOString()
            };
            localStorage.setItem('diariCoreDraft', JSON.stringify(draft));
            console.log('Draft saved');
        }, 2000);
    });
    
    // Load draft on page load - DISABLED to prevent default selections
    function loadDraft() {
        // Disabled - do not load drafts to prevent automatic selections
        console.log('Draft loading disabled - no default selections');
        return;
        
        // Original code commented out:
        /*
        const draft = JSON.parse(localStorage.getItem('diariCoreDraft') || 'null');
        if (draft) {
            // Restore feeling
            if (draft.feeling) {
                const feelingCard = document.querySelector(`[data-feeling="${draft.feeling}"]`);
                if (feelingCard) {
                    feelingCard.click();
                }
            }
            
            // Restore tags
            if (draft.tags && draft.tags.length > 0) {
                draft.tags.forEach(tag => {
                    const tagButton = document.querySelector(`[data-tag="${tag}"]`);
                    if (tagButton) {
                        tagButton.click();
                    }
                });
            }
            
            // Restore text
            if (draft.text) {
                journalText.value = draft.text;
                journalText.dispatchEvent(new Event('input'));
            }
        }
        */
    }
    
    // Load draft on page load
    loadDraft();
    
});
