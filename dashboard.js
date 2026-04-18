// DiariCore Dashboard JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    await syncEntriesFromApi();
    initializeDashboardFromUserData();
    initializeGreetingClock();
    
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

function calculateEntryStreak(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    const uniqueDays = Array.from(new Set(entries
        .filter((entry) => entry?.date)
        .map((entry) => {
            const d = new Date(entry.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        })))
        .sort((a, b) => b - a);

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < uniqueDays.length; i += 1) {
        const expected = new Date(today);
        expected.setDate(today.getDate() - i);
        if (uniqueDays[i] === expected.getTime()) streak += 1;
        else break;
    }
    return streak;
}

function initializeGreetingClock() {
    const hourHand = document.getElementById('greetingClockHour');
    const minuteHand = document.getElementById('greetingClockMinute');
    const secondHand = document.getElementById('greetingClockSecond');
    const timeLabel = document.getElementById('greetingClockTime');
    const dateLabel = document.getElementById('greetingClockDate');
    if (!hourHand || !minuteHand || !secondHand || !timeLabel || !dateLabel) return;

    function tick() {
        const now = new Date();
        const seconds = now.getSeconds();
        const minutes = now.getMinutes();
        const hours = now.getHours();

        const secondAngle = seconds * 6;
        const minuteAngle = (minutes + seconds / 60) * 6;
        const hourAngle = ((hours % 12) + minutes / 60) * 30;

        hourHand.style.transform = `rotate(${hourAngle}deg)`;
        minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
        secondHand.style.transform = `rotate(${secondAngle}deg)`;
        timeLabel.textContent = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        dateLabel.textContent = now.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    tick();
    setInterval(tick, 1000);
}

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
        console.error('Failed to sync dashboard entries:', error);
    }
}

function initializeDashboardFromUserData() {
    const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');

    updateGreeting(user);
    updateDashboardCards(entries);
    updateSmartInsightSection(entries);
    renderWeeklyChart(entries);
}

function updateGreeting(user) {
    const titleEl = document.querySelector('.main-title');
    if (!titleEl) return;
    const displayName = (user?.firstName || user?.nickname || 'there').trim();
    const firstName = displayName.split(' ')[0];
    titleEl.textContent = `Good Morning, ${firstName}`;
}

function feelingToScore(feelingRaw) {
    const feeling = (feelingRaw || '').toLowerCase();
    const scoreMap = {
        happy: 9,
        peaceful: 8.5,
        calm: 8,
        grateful: 8.6,
        excited: 8.8,
        content: 7.8,
        neutral: 6.2,
        unspecified: 6,
        anxious: 4.2,
        stressed: 3.8,
        sad: 3.5,
        angry: 2.8
    };
    return scoreMap[feeling] ?? 6;
}

function resolveEntryFeeling(entry) {
    const feeling = (entry?.feeling || '').toLowerCase();
    if (feeling && feeling !== 'unspecified') return feeling;
    const sentiment = (entry?.sentimentLabel || '').toLowerCase();
    if (sentiment === 'positive') return 'happy';
    if (sentiment === 'negative') return 'stressed';
    return 'neutral';
}

function feelingToEmoji(feelingRaw) {
    const feeling = (feelingRaw || '').toLowerCase();
    const emojiMap = {
        happy: '😊',
        peaceful: '😌',
        calm: '😌',
        grateful: '🙏',
        excited: '🤩',
        content: '🙂',
        neutral: '😐',
        unspecified: '🙂',
        anxious: '😰',
        stressed: '😟',
        sad: '😔',
        angry: '😠'
    };
    return emojiMap[feeling] ?? '🙂';
}

function titleCase(value) {
    const v = (value || '').trim();
    if (!v) return '';
    return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

function isWithinLast7Days(dateObj) {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    return dateObj >= sevenDaysAgo && dateObj <= now;
}

function getLatestEntry(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    return [...entries]
        .filter((e) => e?.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

function updateDashboardCards(entries) {
    const moodEmoji = document.querySelector('.stat-card-mood .mood-emoji');
    const moodValue = document.querySelector('.stat-card-mood .stat-value');
    const moodDescription = document.querySelector('.stat-card-mood .stat-description');
    const avgValue = document.querySelector('.stat-card-average .stat-value');
    const avgDescription = document.querySelector('.stat-card-average .stat-description');
    const insightValue = document.querySelector('.stat-card-insight .insight-text');
    const insightDescription = document.querySelector('.stat-card-insight .stat-description');
    const streakValue = document.getElementById('streakBookValue');

    const latest = getLatestEntry(entries);
    const weeklyEntries = (entries || []).filter((e) => e?.date && isWithinLast7Days(new Date(e.date)));
    const weeklyScores = weeklyEntries.map((e) => feelingToScore(resolveEntryFeeling(e)));
    const streak = calculateEntryStreak(entries || []);
    if (streakValue) streakValue.textContent = String(streak);

    if (!latest) {
        if (moodEmoji) moodEmoji.textContent = '🙂';
        if (moodValue) moodValue.textContent = 'No mood data yet';
        if (moodDescription) moodDescription.textContent = 'Write your first entry to track your mood.';
        if (avgValue) avgValue.textContent = '--/10';
        if (avgDescription) avgDescription.textContent = 'No weekly entries yet.';
        if (insightValue) insightValue.textContent = 'No insights yet. Start journaling to discover patterns.';
        if (insightDescription) insightDescription.textContent = 'Based on your recent entries';
        return;
    }

    const latestFeeling = resolveEntryFeeling(latest);
    if (moodEmoji) moodEmoji.textContent = feelingToEmoji(latestFeeling);
    if (moodValue) moodValue.textContent = titleCase(latestFeeling) || 'Recorded';
    if (moodDescription) moodDescription.textContent = 'Based on your most recent entry.';

    if (weeklyScores.length === 0) {
        if (avgValue) avgValue.textContent = '--/10';
        if (avgDescription) avgDescription.textContent = 'No weekly entries yet.';
    } else {
        const avg = weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length;
        if (avgValue) avgValue.textContent = `${avg.toFixed(1)}/10`;
        if (avgDescription) avgDescription.textContent = `${weeklyScores.length} mood entr${weeklyScores.length === 1 ? 'y' : 'ies'} this week`;
    }

    if (insightValue) {
        const score = feelingToScore(latestFeeling);
        insightValue.textContent = score >= 7
            ? 'You are showing a positive emotional trend. Keep it up.'
            : 'Your recent mood looks lower than usual. Try a short reflective entry.';
    }
    if (insightDescription) insightDescription.textContent = 'Based on your recent entries';
}

function updateSmartInsightSection(entries) {
    const hasEntries = Array.isArray(entries) && entries.length > 0;
    const desktopInsightMessages = document.querySelectorAll('.smart-insights .insight-message');
    const mobileInsightDescription = document.querySelector('.mobile-smart-insights .insight-description');

    if (hasEntries) return;

    desktopInsightMessages.forEach((el) => {
        el.textContent = 'Not enough journal data yet. Write entries to unlock personalized insights.';
    });
    if (mobileInsightDescription) {
        mobileInsightDescription.textContent = 'No insights yet. Write your first entry to begin tracking your patterns.';
    }
}

function hexToRgba(hex, alpha) {
    const safe = String(hex || '').trim().replace('#', '');
    if (safe.length !== 6) return `rgba(111, 143, 127, ${alpha})`;
    const r = Number.parseInt(safe.slice(0, 2), 16);
    const g = Number.parseInt(safe.slice(2, 4), 16);
    const b = Number.parseInt(safe.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildChartThemeFromCss() {
    const styles = window.getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue('--primary-color').trim() || '#6F8F7F';
    const isDarkMode = document.documentElement.classList.contains('theme-dark');
    return {
        line: primary,
        fillTop: hexToRgba(primary, isDarkMode ? 0.35 : 0.3),
        fillBottom: hexToRgba(primary, isDarkMode ? 0.03 : 0.01),
        pointBorder: isDarkMode ? '#141c20' : '#ffffff',
        tooltipBg: isDarkMode ? 'rgba(16, 24, 29, 0.95)' : 'rgba(44, 62, 80, 0.9)',
        tick: isDarkMode ? '#b7c7cd' : '#6B7C74',
        grid: isDarkMode ? 'rgba(64, 82, 90, 0.6)' : 'rgba(224, 230, 227, 0.3)',
    };
}

function renderWeeklyChart(entries) {
    const weeklyCanvas = document.getElementById('weeklyChart');
    if (!weeklyCanvas || !weeklyCanvas.getContext) return;

    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    const monday = new Date(today);
    const day = monday.getDay();
    const diff = day === 0 ? 6 : day - 1;
    monday.setDate(today.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    const dayScores = new Array(7).fill(null).map(() => []);
    (entries || []).forEach((entry) => {
        if (!entry?.date) return;
        const d = new Date(entry.date);
        if (d < monday) return;
        const idx = Math.floor((d - monday) / (1000 * 60 * 60 * 24));
        if (idx < 0 || idx > 6) return;
        dayScores[idx].push(feelingToScore(resolveEntryFeeling(entry)));
    });

    const chartData = dayScores.map((scores) => {
        if (scores.length === 0) return null;
        return scores.reduce((sum, s) => sum + s, 0) / scores.length;
    });
    const hasData = chartData.some((v) => v !== null);

    const chartTheme = buildChartThemeFromCss();

    const ctx = weeklyCanvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, chartTheme.fillTop);
    gradient.addColorStop(1, chartTheme.fillBottom);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Mood Score',
                data: hasData ? chartData : [null, null, null, null, null, null, null],
                borderColor: chartTheme.line,
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: chartTheme.line,
                pointBorderColor: chartTheme.pointBorder,
                pointBorderWidth: 2,
                pointRadius: hasData ? 6 : 0,
                pointHoverRadius: hasData ? 8 : 0,
                pointHoverBackgroundColor: chartTheme.line,
                pointHoverBorderColor: chartTheme.pointBorder,
                pointHoverBorderWidth: 2,
                spanGaps: false
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
                    enabled: hasData,
                    backgroundColor: chartTheme.tooltipBg,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `Mood Score: ${context.parsed.y.toFixed(1)}/10`;
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
                        color: chartTheme.tick,
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
                        color: chartTheme.grid,
                        borderDash: [5, 5]
                    },
                    ticks: {
                        color: chartTheme.tick,
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
    });
}

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
