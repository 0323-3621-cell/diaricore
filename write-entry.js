// Write Entry Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let selectedFeeling = null;
    let selectedTags = new Set();
    
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
    
    // Mobile more tags functionality (show first 4, hide rest)
    function setupMobileMoreButton() {
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) return;
        
        const allTags = document.querySelectorAll('.tags-container .tag-btn');
        const moreBtn = document.getElementById('moreTagsBtn');
        let mobileTagsExpanded = false;
        
        // Show first 4 tags, hide rest on mobile
        allTags.forEach((tag, index) => {
            if (index < 4) {
                tag.style.display = 'flex';
            } else {
                tag.style.display = 'none';
            }
        });
        
        // Always show more button on mobile (if there are more than 4 tags)
        if (allTags.length > 4) {
            moreBtn.style.display = 'flex';
        }
        
        // Mobile more button click handler
        moreBtn.onclick = function() {
            mobileTagsExpanded = !mobileTagsExpanded;
            
            allTags.forEach((tag, index) => {
                if (index >= 4) {
                    if (mobileTagsExpanded) {
                        tag.style.display = 'flex';
                    } else {
                        tag.style.display = 'none';
                    }
                }
            });
            
            // Update button state
            if (mobileTagsExpanded) {
                moreBtn.classList.add('expanded');
                moreBtn.querySelector('span').textContent = 'less';
            } else {
                moreBtn.classList.remove('expanded');
                moreBtn.querySelector('span').textContent = 'more';
            }
        };
    }
    
    // Dynamic tag hiding functionality (desktop only)
    function updateTagVisibility() {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            setupMobileMoreButton();
            return;
        }
        
        const allTags = document.querySelectorAll('.tags-container .tag-btn');
        const moreBtn = document.getElementById('moreTagsBtn');
        const totalTags = allTags.length;
        
        // Show first 7 tags, hide rest
        allTags.forEach((tag, index) => {
            if (index < 7) {
                tag.style.display = 'flex';
            } else {
                tag.style.display = 'none';
            }
        });
        
        // Show/hide more button based on tag count
        if (totalTags > 7) {
            moreBtn.style.display = 'flex';
        } else {
            moreBtn.style.display = 'none';
        }
        
        // Reset desktop more button handler
        let tagsExpanded = false;
        moreBtn.onclick = function() {
            tagsExpanded = !tagsExpanded;
            
            allTags.forEach((tag, index) => {
                if (index >= 7) {
                    if (tagsExpanded) {
                        tag.style.display = 'flex';
                    } else {
                        tag.style.display = 'none';
                    }
                }
            });
            
            // Update button state
            if (tagsExpanded) {
                moreBtn.classList.add('expanded');
                moreBtn.querySelector('span').textContent = 'less';
            } else {
                moreBtn.classList.remove('expanded');
                moreBtn.querySelector('span').textContent = 'more';
            }
        };
    }
    
    // Initialize tag visibility on load
    updateTagVisibility();
    
    // Update on window resize
    window.addEventListener('resize', updateTagVisibility);
    
    // Tag selection functionality
    const tagButtons = document.querySelectorAll('.tag-btn:not(.add-tag)');
    tagButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tag = this.dataset.tag;
            
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
        const tagName = prompt('Enter new tag name:');
        if (tagName && tagName.trim()) {
            createNewTag(tagName.trim());
        }
    });
    
    function createNewTag(tagName) {
        const tagsContainer = document.querySelector('.tags-container');
        const addTagBtn = document.querySelector('.tag-btn.add-tag');
        
        const newTagBtn = document.createElement('button');
        newTagBtn.className = 'tag-btn';
        newTagBtn.dataset.tag = tagName;
        newTagBtn.innerHTML = `
            <i class="bi bi-hash"></i>
            <span>${tagName}</span>
        `;
        
        // Add click event to new tag
        newTagBtn.addEventListener('click', function() {
            const tag = this.dataset.tag;
            
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
        
        // Animate new tag
        newTagBtn.style.opacity = '0';
        newTagBtn.style.transform = 'scale(0.8)';
        setTimeout(() => {
            newTagBtn.style.transition = 'all 0.3s ease';
            newTagBtn.style.opacity = '1';
            newTagBtn.style.transform = 'scale(1)';
        }, 10);
    }
    
    // Character counter
    const journalText = document.getElementById('journalText');
    const charCount = document.getElementById('charCount');
    
    journalText.addEventListener('input', function() {
        const count = this.value.length;
        charCount.textContent = count;
        
        // Change color based on character count
        if (count > 4500) {
            charCount.style.color = 'var(--warning-color)';
        } else if (count > 4000) {
            charCount.style.color = 'var(--info-color)';
        } else {
            charCount.style.color = 'var(--text-muted)';
        }
    });
    
    // Voice input functionality (placeholder)
    const voiceInputBtn = document.getElementById('voiceInputBtn');
    let isRecording = false;
    
    voiceInputBtn.addEventListener('click', function() {
        if (!isRecording) {
            // Start recording
            this.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Recording';
            this.style.backgroundColor = 'var(--warning-color)';
            isRecording = true;
            
            // Simulate voice recording
            console.log('Voice recording started...');
            
            // Simulate recording for 3 seconds
            setTimeout(() => {
                if (isRecording) {
                    stopRecording();
                }
            }, 3000);
        } else {
            stopRecording();
        }
    });
    
    function stopRecording() {
        voiceInputBtn.innerHTML = '<i class="bi bi-mic"></i> Voice Input';
        voiceInputBtn.style.backgroundColor = 'var(--info-color)';
        isRecording = false;
        
        console.log('Voice recording stopped');
        
        // Simulate voice-to-text result
        const simulatedText = "Today was a good day. I felt productive and accomplished many tasks.";
        journalText.value = simulatedText;
        journalText.dispatchEvent(new Event('input'));
    }
    
    // Save entry functionality
    const saveEntryBtn = document.getElementById('saveEntryBtn');
    saveEntryBtn.addEventListener('click', function() {
        const entryText = journalText.value.trim();
        
        if (!selectedFeeling) {
            alert('Please select how you are feeling.');
            return;
        }
        
        if (!entryText) {
            alert('Please write something in your journal entry.');
            return;
        }
        
        // Create entry object
        const entry = {
            feeling: selectedFeeling,
            tags: Array.from(selectedTags),
            text: entryText,
            date: new Date().toISOString(),
            characterCount: entryText.length
        };
        
        // Save to localStorage (placeholder)
        let entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
        entries.push(entry);
        localStorage.setItem('diariCoreEntries', JSON.stringify(entries));
        
        console.log('Entry saved:', entry);
        
        // Show success message
        showSuccessMessage();
        
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 2000);
    });
    
    // Cancel functionality
    const cancelBtn = document.getElementById('cancelBtn');
    cancelBtn.addEventListener('click', function() {
        if (journalText.value.trim() || selectedFeeling || selectedTags.size > 0) {
            if (confirm('Are you sure you want to cancel? Your unsaved changes will be lost.')) {
                window.location.href = 'dashboard.html';
            }
        } else {
            window.location.href = 'dashboard.html';
        }
    });
    
    // Success message
    function showSuccessMessage() {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.innerHTML = `
            <i class="bi bi-check-circle"></i>
            <span>Entry saved successfully!</span>
        `;
        
        // Style the success message
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background-color: var(--success-color);
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 10px;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-weight: 500;
            z-index: 1000;
            box-shadow: var(--box-shadow-hover);
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        document.body.appendChild(successDiv);
        
        // Animate in
        setTimeout(() => {
            successDiv.style.transform = 'translateX(0)';
        }, 10);
        
        // Remove after 2 seconds
        setTimeout(() => {
            successDiv.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(successDiv);
            }, 300);
        }, 2000);
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
    
    // Load draft on page load
    function loadDraft() {
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
                    const tagBtn = document.querySelector(`[data-tag="${tag}"]`);
                    if (tagBtn) {
                        tagBtn.click();
                    }
                });
            }
            
            // Restore text
            if (draft.text) {
                journalText.value = draft.text;
                journalText.dispatchEvent(new Event('input'));
            }
            
            console.log('Draft loaded');
        }
    }
    
    // Load draft on page load
    loadDraft();
    
    // Clear draft on successful save
    const originalSaveFunction = saveEntryBtn.onclick;
    saveEntryBtn.addEventListener('click', function() {
        localStorage.removeItem('diariCoreDraft');
    });
});
