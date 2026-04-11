// DiariCore Insights Page JavaScript - New Layout

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Charts
    initializeWeeklyMoodChart();
    initializeEmotionPieChart();
    initializeEmotionPieChartMobile();
    initializeActivityImpactChart();
    
    // Load Data
    loadInsightsData();
    
    // Initialize Mobile Trigger Functionality
    initializeMobileTriggers();
});

// Initialize Mobile Trigger Click Functionality
function initializeMobileTriggers() {
    // Only apply on mobile devices
    if (window.innerWidth <= 768) {
        const stressTrigger = document.querySelector('.stress-trigger');
        const happinessTrigger = document.querySelector('.happiness-trigger');
        
        if (stressTrigger) {
            stressTrigger.addEventListener('click', function() {
                this.classList.toggle('expanded');
                
                // Close the other trigger if it's open
                if (happinessTrigger && happinessTrigger.classList.contains('expanded')) {
                    happinessTrigger.classList.remove('expanded');
                }
            });
        }
        
        if (happinessTrigger) {
            happinessTrigger.addEventListener('click', function() {
                this.classList.toggle('expanded');
                
                // Close the other trigger if it's open
                if (stressTrigger && stressTrigger.classList.contains('expanded')) {
                    stressTrigger.classList.remove('expanded');
                }
            });
        }
    }
}

// Initialize Weekly Mood Chart
function initializeWeeklyMoodChart() {
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;
    
    const weeklyData = {
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
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
        }]
    };
    
    const config = {
        type: 'line',
        data: weeklyData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(47, 62, 54, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
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
                            weight: '500'
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
                            weight: '500'
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

// Initialize Emotion Pie Chart
function initializeEmotionPieChart() {
    const ctx = document.getElementById('emotionPieChart');
    if (!ctx) return;
    
    const emotionData = {
        labels: ['Happy', 'Sad', 'Angry', 'Anxious', 'Calm'],
        datasets: [{
            data: [45, 20, 10, 15, 10],
            backgroundColor: [
                'rgba(111, 143, 127, 0.9)',
                'rgba(111, 143, 127, 0.7)',
                'rgba(111, 143, 127, 0.5)',
                'rgba(111, 143, 127, 0.6)',
                'rgba(111, 143, 127, 0.4)'
            ],
            borderColor: '#ffffff',
            borderWidth: 2
        }]
    };
    
    const config = {
        type: 'pie',
        data: emotionData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#6B7C74',
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(47, 62, 54, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed}%`;
                        }
                    }
                }
            }
        }
    };
    
    new Chart(ctx, config);
}

// Initialize Mobile Emotion Pie Chart
function initializeEmotionPieChartMobile() {
    const ctx = document.getElementById('emotionPieChartMobile');
    if (!ctx) return;
    
    const emotionData = {
        labels: ['Happy', 'Neutral', 'Sad', 'Anxious'],
        datasets: [{
            data: [40, 30, 20, 10],
            backgroundColor: [
                '#7FBF9F',
                '#F4A261',
                '#7FA7BF',
                '#E76F51'
            ],
            borderColor: '#ffffff',
            borderWidth: 2
        }]
    };
    
    const config = {
        type: 'pie',
        data: emotionData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed + '%';
                        }
                    }
                }
            }
        }
    };
    
    new Chart(ctx, config);
}

// Initialize Activity Impact Chart
function initializeActivityImpactChart() {
    const ctx = document.getElementById('activityImpactChart');
    if (!ctx) return;
    
    const activityData = {
        labels: ['Exercise', 'Sleep', 'Work', 'Social', 'Reading', 'Meditation'],
        datasets: [{
            label: 'Mood Impact',
            data: [85, 78, 45, 72, 68, 82],
            backgroundColor: [
                'rgba(111, 143, 127, 0.9)',
                'rgba(111, 143, 127, 0.85)',
                'rgba(111, 143, 127, 0.5)',
                'rgba(111, 143, 127, 0.7)',
                'rgba(111, 143, 127, 0.6)',
                'rgba(111, 143, 127, 0.8)'
            ],
            borderColor: '#6F8F7F',
            borderWidth: 2,
            borderRadius: 6,
            barThickness: 40
        }]
    };
    
    const config = {
        type: 'bar',
        data: activityData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(47, 62, 54, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Impact: ${context.parsed.y}%`;
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
                            weight: '500'
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: '#E0E6E3',
                        borderDash: [5, 5]
                    },
                    ticks: {
                        color: '#6B7C74',
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    };
    
    new Chart(ctx, config);
}

// Load Insights Data
function loadInsightsData() {
    // Simulate loading data
    setTimeout(() => {
        // Charts are already animated by Chart.js
    }, 500);
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
