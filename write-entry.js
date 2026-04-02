// Write Entry Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let selectedFeeling = null;
    let selectedTags = new Set();
    
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
    
    // Clear draft on successful save
    const originalSaveFunction = saveEntryBtn.onclick;
    saveEntryBtn.addEventListener('click', function() {
        localStorage.removeItem('diariCoreDraft');
    });
});
