// DiariCore Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Weekly Chart
    const weeklyCanvas = document.getElementById('weeklyChart');
    if (weeklyCanvas && weeklyCanvas.getContext) {
    const ctx = weeklyCanvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(111, 143, 127, 0.3)');
    gradient.addColorStop(1, 'rgba(111, 143, 127, 0.01)');
    
    const weeklyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Mood Score',
                data: [6.5, 7.2, 8.1, 7.8, 6.9, 7.4, 7.8],
                borderColor: '#6F8F7F',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#6F8F7F',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#6F8F7F',
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(44, 62, 80, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return 'Mood Score: ' + context.parsed.y + '/10';
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
                        color: 'rgba(224, 230, 227, 0.3)',
                        borderDash: [5, 5]
                    },
                    ticks: {
                        color: '#6B7C74',
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        stepSize: 2,
                        callback: function(value) {
                            return value + '';
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
    }
    
    // Add smooth scrolling for navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Only prevent default for hash links (same page navigation)
            if (href.startsWith('#')) {
                e.preventDefault();
            }
            
            // Remove active class from all nav items
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Add active class to clicked nav item
            this.parentElement.classList.add('active');
        });
    });
    
    // Add click handlers for action buttons
    document.querySelectorAll('.action-btn').forEach(button => {
        button.addEventListener('click', function() {
            const buttonTitle = this.querySelector('.btn-title').textContent;
            console.log('Clicked:', buttonTitle);
            
            if (buttonTitle === 'Write Entry') {
                // Navigate to write entry page
                window.location.href = 'write-entry.html';
            } else if (buttonTitle === 'Voice Entry') {
                // Placeholder for voice entry functionality
                console.log('Voice entry functionality to be implemented');
                alert('Voice entry feature coming soon!');
            }
            
            // Add ripple effect
            const ripple = document.createElement('span');
            ripple.classList.add('ripple');
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
    
    // Add hover effects for stat cards
    document.querySelectorAll('.stat-card').forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
    });
});

// Mobile menu toggle (for responsive design)
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('show');
}

// Add ripple effect CSS
const style = document.createElement('style');
style.textContent = `
    .action-btn {
        position: relative;
        overflow: hidden;
    }
    
    .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        transform: scale(0);
        animation: ripple-animation 0.6s ease-out;
        pointer-events: none;
    }
    
    @keyframes ripple-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
