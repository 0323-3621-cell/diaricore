// DiariCore Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Weekly Chart
    const ctx = document.getElementById('weeklyChart').getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(74, 157, 122, 0.3)');
    gradient.addColorStop(1, 'rgba(74, 157, 122, 0.01)');
    
    const weeklyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Mood Score',
                data: [6.5, 7.2, 8.1, 7.8, 6.9, 7.4, 7.8],
                borderColor: '#4a9d7a',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#4a9d7a',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: '#4a9d7a',
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
                        color: '#6c757d',
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
                        color: 'rgba(0, 0, 0, 0.05)',
                        borderDash: [5, 5]
                    },
                    ticks: {
                        color: '#6c757d',
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
    
    // Add smooth scrolling for navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
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
