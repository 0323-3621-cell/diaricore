// DiariCore Insights Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Chart
    initializeMoodChart();
    
    // Event Listeners
    initializeEventListeners();
    
    // Load Data
    loadInsightsData();
});

// Initialize Mood Chart
function initializeMoodChart() {
    const ctx = document.getElementById('moodChart');
    if (!ctx) return;
    
    const moodData = {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [{
            label: 'Mood Score',
            data: [7, 8, 6, 9, 8, 9, 8],
            borderColor: '#6F8F7F',
            backgroundColor: 'rgba(111, 143, 127, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: '#6F8F7F',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
        }]
    };
    
    const config = {
        type: 'line',
        data: moodData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(47, 62, 54, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Mood Score: ${context.parsed.y}/10`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#6B7C74',
                        font: {
                            size: 12,
                            weight: 500
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 10,
                    grid: {
                        color: '#E0E6E3',
                        borderDash: [5, 5]
                    },
                    ticks: {
                        color: '#6B7C74',
                        font: {
                            size: 12,
                            weight: 500
                        },
                        stepSize: 2
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    };
    
    new Chart(ctx, config);
}

// Initialize Event Listeners
function initializeEventListeners() {
    // Back button
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.history.back();
        });
    }
    
    // Filter button
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        filterBtn.addEventListener('click', function() {
            showFilterModal();
        });
    }
    
    // View All buttons
    const viewAllBtns = document.querySelectorAll('.view-all-btn');
    viewAllBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            showNotification('View all feature coming soon!', 'info');
        });
    });
    
    // Insight action buttons
    const actionBtns = document.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const card = this.closest('.insight-card');
            const title = card.querySelector('.insight-title').textContent;
            
            if (this.classList.contains('secondary')) {
                dismissInsight(card);
            } else {
                showNotification(`Learn more about: ${title}`, 'info');
            }
        });
    });
    
    // Topic cards
    const topicCards = document.querySelectorAll('.topic-card');
    topicCards.forEach(card => {
        card.addEventListener('click', function() {
            const topicName = this.querySelector('.topic-name').textContent;
            showNotification(`Viewing entries for: ${topicName}`, 'info');
        });
    });
    
    // Stat cards
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.addEventListener('click', function() {
            const statLabel = this.querySelector('.stat-label').textContent;
            showNotification(`Viewing details for: ${statLabel}`, 'info');
        });
    });
}

// Load Insights Data
function loadInsightsData() {
    // Simulate loading data
    setTimeout(() => {
        animateStats();
        animateTopicProgress();
    }, 500);
}

// Animate Stats
function animateStats() {
    const statNumbers = document.querySelectorAll('.stat-number');
    
    statNumbers.forEach(stat => {
        const target = parseInt(stat.textContent);
        const suffix = stat.textContent.replace(/[0-9]/g, '');
        let current = 0;
        const increment = target / 50;
        
        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            
            if (suffix === '%') {
                stat.textContent = Math.round(current) + '%';
            } else {
                stat.textContent = Math.round(current);
            }
        }, 30);
    });
}

// Animate Topic Progress
function animateTopicProgress() {
    const progressBars = document.querySelectorAll('.topic-progress');
    
    progressBars.forEach((bar, index) => {
        const targetWidth = bar.style.width;
        bar.style.width = '0%';
        
        setTimeout(() => {
            bar.style.width = targetWidth;
        }, 100 * index);
    });
}

// Dismiss Insight
function dismissInsight(card) {
    card.style.transform = 'translateX(100%)';
    card.style.opacity = '0';
    
    setTimeout(() => {
        card.remove();
        showNotification('Insight dismissed', 'success');
        
        // Check if all insights are dismissed
        const remainingInsights = document.querySelectorAll('.insight-card');
        if (remainingInsights.length === 0) {
            showEmptyInsightsState();
        }
    }, 300);
}

// Show Empty Insights State
function showEmptyInsightsState() {
    const insightsSection = document.querySelector('.insights-grid');
    if (!insightsSection) return;
    
    insightsSection.innerHTML = `
        <div class="empty-insights">
            <div class="empty-icon">
                <i class="bi bi-lightbulb"></i>
            </div>
            <h3>No insights yet</h3>
            <p>Keep journaling to unlock personalized insights about your patterns and habits.</p>
            <button class="primary-btn" onclick="window.location.href='dashboard.html'">
                Start Journaling
            </button>
        </div>
    `;
}

// Show Filter Modal
function showFilterModal() {
    const modal = document.createElement('div');
    modal.className = 'filter-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeFilterModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>Filter Insights</h3>
                <button class="close-btn" onclick="closeFilterModal()">
                    <i class="bi bi-x"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="filter-group">
                    <label>Date Range</label>
                    <select class="filter-select">
                        <option>Last 7 days</option>
                        <option>Last 30 days</option>
                        <option>Last 3 months</option>
                        <option>All time</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Category</label>
                    <select class="filter-select">
                        <option>All categories</option>
                        <option>Mood</option>
                        <option>Habits</option>
                        <option>Productivity</option>
                        <option>Relationships</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label>Insight Type</label>
                    <div class="checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" checked>
                            <span>Trends</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" checked>
                            <span>Patterns</span>
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" checked>
                            <span>Recommendations</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="secondary-btn" onclick="closeFilterModal()">Cancel</button>
                <button class="primary-btn" onclick="applyFilters()">Apply Filters</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add modal styles
    if (!document.querySelector('#filter-modal-styles')) {
        const styles = document.createElement('style');
        styles.id = 'filter-modal-styles';
        styles.textContent = `
            .filter-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .modal-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
            }
            
            .modal-content {
                background: white;
                border-radius: 16px;
                padding: 0;
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                overflow-y: auto;
                position: relative;
                z-index: 1;
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1.5rem;
                border-bottom: 1px solid #E0E6E3;
            }
            
            .modal-header h3 {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 700;
                color: #2F3E36;
            }
            
            .close-btn {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: #6B7C74;
                cursor: pointer;
                padding: 0.25rem;
                border-radius: 4px;
                transition: all 0.3s ease;
            }
            
            .close-btn:hover {
                background: #F5F7F6;
            }
            
            .modal-body {
                padding: 1.5rem;
            }
            
            .filter-group {
                margin-bottom: 1.5rem;
            }
            
            .filter-group label {
                display: block;
                margin-bottom: 0.5rem;
                font-weight: 600;
                color: #2F3E36;
            }
            
            .filter-select {
                width: 100%;
                padding: 0.75rem;
                border: 2px solid #E0E6E3;
                border-radius: 8px;
                font-size: 1rem;
                color: #2F3E36;
                background: white;
            }
            
            .checkbox-group {
                display: flex;
                flex-direction: column;
                gap: 0.75rem;
            }
            
            .checkbox-label {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                cursor: pointer;
                font-weight: 500;
                color: #2F3E36;
            }
            
            .checkbox-label input[type="checkbox"] {
                width: 18px;
                height: 18px;
                accent-color: #6F8F7F;
            }
            
            .modal-footer {
                display: flex;
                justify-content: flex-end;
                gap: 1rem;
                padding: 1.5rem;
                border-top: 1px solid #E0E6E3;
            }
            
            .primary-btn, .secondary-btn {
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .primary-btn {
                background: #6F8F7F;
                color: white;
            }
            
            .primary-btn:hover {
                background: #5F7F6F;
            }
            
            .secondary-btn {
                background: #F5F7F6;
                color: #6B7C74;
            }
            
            .secondary-btn:hover {
                background: #E0E6E3;
            }
            
            .empty-insights {
                text-align: center;
                padding: 3rem;
                color: #6B7C74;
            }
            
            .empty-icon {
                font-size: 3rem;
                color: #9AA9A1;
                margin-bottom: 1rem;
            }
            
            .empty-insights h3 {
                margin-bottom: 0.5rem;
                color: #2F3E36;
            }
            
            .empty-insights p {
                margin-bottom: 2rem;
                line-height: 1.6;
            }
        `;
        document.head.appendChild(styles);
    }
}

// Close Filter Modal
function closeFilterModal() {
    const modal = document.querySelector('.filter-modal');
    if (modal) {
        modal.remove();
    }
}

// Apply Filters
function applyFilters() {
    showNotification('Filters applied successfully!', 'success');
    closeFilterModal();
}

// Show Notification
function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    
    notification.innerHTML = `
        <i class="bi bi-${icon}"></i>
        <span>${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 10px;
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
    `;
    
    if (type === 'success') {
        notification.style.backgroundColor = '#7FBF9F';
        notification.style.color = 'white';
    } else if (type === 'error') {
        notification.style.backgroundColor = '#E74C3C';
        notification.style.color = 'white';
    } else {
        notification.style.backgroundColor = '#7FA7BF';
        notification.style.color = 'white';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);
    
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}
