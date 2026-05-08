// DiariCore Insights Page JavaScript - New Layout
let INSIGHTS_ENTRIES = [];
let HAS_INSIGHTS_DATA = false;

function hexToRgba(hex, alpha) {
    const safe = String(hex || '').trim().replace('#', '');
    if (safe.length !== 6) return `rgba(111, 143, 127, ${alpha})`;
    const r = Number.parseInt(safe.slice(0, 2), 16);
    const g = Number.parseInt(safe.slice(2, 4), 16);
    const b = Number.parseInt(safe.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getChartTheme() {
    const styles = window.getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue('--primary-color').trim() || '#6F8F7F';
    const isDarkMode = document.documentElement.classList.contains('theme-dark');
    if (isDarkMode) {
        return {
            primary,
            primarySoft: hexToRgba(primary, 0.22),
            tick: '#b7c7cd',
            grid: 'rgba(66, 84, 92, 0.55)',
            tooltipBg: 'rgba(16, 24, 29, 0.95)',
            border: '#182126',
            pieFallback: '#4e5e64',
        };
    }
    return {
        primary,
        primarySoft: hexToRgba(primary, 0.1),
        tick: '#6B7C74',
        grid: '#E0E6E3',
        tooltipBg: 'rgba(47, 62, 54, 0.9)',
        border: '#ffffff',
        pieFallback: '#B7C2BC',
    };
}

document.addEventListener('DOMContentLoaded', async function() {
    await syncInsightsEntriesFromApi();
    INSIGHTS_ENTRIES = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]').filter((e) => e && e.date);
    HAS_INSIGHTS_DATA = INSIGHTS_ENTRIES.length > 0;
    applyInsightsEmptyState();
    // Initialize Charts
    initializeWeeklyMoodChart();
    initializeWeeklyMoodChartDesktop();
    initializeEmotionPieChart();
    initializeEmotionPieChartMobile();
    initializeActivityImpactChart();
    
    // Load Data
    loadInsightsData();
    
    // Initialize Mobile Trigger Functionality
    initializeMobileTriggers();
});

async function syncInsightsEntriesFromApi() {
    const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    const userId = Number(user?.id || 0);
    if (!userId) return;
    try {
        const response = await fetch(`/api/entries?userId=${encodeURIComponent(String(userId))}`);
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.entries)) return;
        localStorage.setItem('diariCoreEntries', JSON.stringify(result.entries));
    } catch (error) {
        console.error('Failed to sync insights entries:', error);
    }
}

function feelingToScore(feelingRaw) {
    const feeling = (feelingRaw || '').toLowerCase();
    const scoreMap = {
        happy: 9, excited: 8.8, peaceful: 8.5, calm: 8, grateful: 8.6, content: 7.8,
        neutral: 6.2, unspecified: 6, anxious: 4.2, stressed: 3.8, sad: 3.5, angry: 2.8
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

function weeklyScoresFromEntries() {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (!HAS_INSIGHTS_DATA) return { labels, data: [null, null, null, null, null, null, null] };
    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = day === 0 ? 6 : day - 1;
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    const dayScores = new Array(7).fill(null).map(() => []);
    INSIGHTS_ENTRIES.forEach((entry) => {
        const d = new Date(entry.date);
        const idx = Math.floor((d - monday) / (1000 * 60 * 60 * 24));
        if (idx >= 0 && idx <= 6) dayScores[idx].push(feelingToScore(resolveEntryFeeling(entry)));
    });
    return {
        labels,
        data: dayScores.map((scores) => scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : null)
    };
}

function emotionBreakdownData() {
    if (!HAS_INSIGHTS_DATA) {
        return { labels: ['No Data'], values: [1], percentages: { happy: 0, neutral: 0, sad: 0, anxious: 0 } };
    }
    const counts = { happy: 0, neutral: 0, sad: 0, anxious: 0, calm: 0, angry: 0, stressed: 0 };
    INSIGHTS_ENTRIES.forEach((entry) => {
        const f = resolveEntryFeeling(entry);
        if (Object.prototype.hasOwnProperty.call(counts, f)) counts[f] += 1;
        else counts.neutral += 1;
    });
    const total = INSIGHTS_ENTRIES.length || 1;
    const pct = (n) => Math.round((n / total) * 100);
    return {
        labels: ['Happy', 'Neutral', 'Sad', 'Anxious'],
        values: [counts.happy + counts.calm, counts.neutral, counts.sad, counts.anxious + counts.stressed + counts.angry],
        percentages: {
            happy: pct(counts.happy + counts.calm),
            neutral: pct(counts.neutral),
            sad: pct(counts.sad),
            anxious: pct(counts.anxious + counts.stressed + counts.angry)
        }
    };
}

function applyInsightsEmptyState() {
    if (HAS_INSIGHTS_DATA) return;
    document.querySelectorAll('.trigger-name-desktop, .trigger-name-mobile-only').forEach((el) => {
        el.textContent = 'No data yet';
    });
    document.querySelectorAll('.trigger-description').forEach((el) => {
        el.textContent = 'Write a few entries first to unlock personalized emotional trigger insights.';
    });
    const moodHeader = document.querySelector('.header-section .subtitle');
    if (moodHeader) moodHeader.textContent = 'Insights will appear once you start journaling.';
}

// Mobile: Top Stressor / Top Joy flip cards (desktop uses static layout from CSS)
function initializeMobileTriggers() {
    const mq = window.matchMedia('(max-width: 768px)');
    const stressTrigger = document.querySelector('.stress-trigger');
    const happinessTrigger = document.querySelector('.happiness-trigger');
    
    function resetFlips() {
        document.querySelectorAll('.trigger-flip-inner.is-flipped').forEach(function (el) {
            el.classList.remove('is-flipped');
        });
    }
    
    function flipHandler(card, inner, otherInner) {
        return function (ev) {
            if (!mq.matches) return;
            ev.preventDefault();
            inner.classList.toggle('is-flipped');
            if (otherInner && otherInner.classList.contains('is-flipped')) {
                otherInner.classList.remove('is-flipped');
            }
        };
    }
    
    function apply() {
        const stressInner = stressTrigger && stressTrigger.querySelector('.trigger-flip-inner');
        const happyInner = happinessTrigger && happinessTrigger.querySelector('.trigger-flip-inner');
        
        if (stressTrigger && stressTrigger._stressFlipHandler) {
            stressTrigger.removeEventListener('click', stressTrigger._stressFlipHandler);
            stressTrigger._stressFlipHandler = null;
        }
        if (happinessTrigger && happinessTrigger._happyFlipHandler) {
            happinessTrigger.removeEventListener('click', happinessTrigger._happyFlipHandler);
            happinessTrigger._happyFlipHandler = null;
        }
        
        if (!mq.matches) {
            resetFlips();
            return;
        }
        
        if (stressTrigger && stressInner) {
            stressTrigger._stressFlipHandler = flipHandler(stressTrigger, stressInner, happyInner);
            stressTrigger.addEventListener('click', stressTrigger._stressFlipHandler);
        }
        if (happinessTrigger && happyInner) {
            happinessTrigger._happyFlipHandler = flipHandler(happinessTrigger, happyInner, stressInner);
            happinessTrigger.addEventListener('click', happinessTrigger._happyFlipHandler);
        }
    }
    
    apply();
    mq.addEventListener('change', apply);
}

// Initialize Weekly Mood Chart
function initializeWeeklyMoodChart() {
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;
    
    const chartTheme = getChartTheme();
    const weekly = weeklyScoresFromEntries();
    const weeklyData = {
        labels: weekly.labels,
        datasets: [{
            label: 'Mood Score',
            data: weekly.data,
            borderColor: chartTheme.primary,
            backgroundColor: chartTheme.primarySoft,
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: chartTheme.primary,
            pointBorderColor: chartTheme.border,
            pointBorderWidth: 2,
            pointRadius: HAS_INSIGHTS_DATA ? 6 : 0,
            pointHoverRadius: HAS_INSIGHTS_DATA ? 8 : 0
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
                    enabled: HAS_INSIGHTS_DATA,
                    backgroundColor: chartTheme.tooltipBg,
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
    };
    
    new Chart(ctx, config);
}

// Initialize Desktop Weekly Mood Chart
function initializeWeeklyMoodChartDesktop() {
    const ctx = document.getElementById('weeklyChartDesktop');
    if (!ctx) return;
    
    const chartTheme = getChartTheme();
    const weekly = weeklyScoresFromEntries();
    const weeklyData = {
        labels: weekly.labels,
        datasets: [{
            label: 'Mood Score',
            data: weekly.data,
            borderColor: chartTheme.primary,
            backgroundColor: chartTheme.primarySoft,
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: chartTheme.primary,
            pointBorderColor: chartTheme.border,
            pointBorderWidth: 2,
            pointRadius: HAS_INSIGHTS_DATA ? 5 : 0,
            pointHoverRadius: HAS_INSIGHTS_DATA ? 7 : 0
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
                    enabled: HAS_INSIGHTS_DATA,
                    backgroundColor: chartTheme.tooltipBg,
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: chartTheme.primary,
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return 'Mood Score: ' + context.parsed.y;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 10,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: chartTheme.tick,
                        font: {
                            size: 12
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: chartTheme.tick,
                        font: {
                            size: 12
                        }
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
    
    const chartTheme = getChartTheme();
    const emotionData = {
        labels: HAS_INSIGHTS_DATA ? ['Happy', 'Sad', 'Angry', 'Anxious', 'Calm'] : ['No Data'],
        datasets: [{
            data: HAS_INSIGHTS_DATA ? [45, 20, 10, 15, 10] : [1],
            backgroundColor: [
                HAS_INSIGHTS_DATA ? hexToRgba(chartTheme.primary, 0.9) : chartTheme.pieFallback,
                hexToRgba(chartTheme.primary, 0.7),
                hexToRgba(chartTheme.primary, 0.5),
                hexToRgba(chartTheme.primary, 0.6),
                hexToRgba(chartTheme.primary, 0.4)
            ],
            borderColor: chartTheme.border,
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
                        color: chartTheme.tick,
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        padding: 20
                    }
                },
                tooltip: {
                    enabled: HAS_INSIGHTS_DATA,
                    backgroundColor: chartTheme.tooltipBg,
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
    
    const chartTheme = getChartTheme();
    const breakdown = emotionBreakdownData();
    const emotionData = {
        labels: HAS_INSIGHTS_DATA ? ['Happy', 'Neutral', 'Sad', 'Anxious'] : ['No Data'],
        datasets: [{
            data: HAS_INSIGHTS_DATA ? breakdown.values : [1],
            backgroundColor: [
                HAS_INSIGHTS_DATA ? hexToRgba(chartTheme.primary, 0.92) : chartTheme.pieFallback,
                '#F4A261',
                '#7FA7BF',
                '#E76F51'
            ],
            borderColor: chartTheme.border,
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
                    enabled: HAS_INSIGHTS_DATA,
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

    if (HAS_INSIGHTS_DATA) {
        const legendItems = document.querySelectorAll('.emotion-legend-item');
        const p = breakdown.percentages;
        if (legendItems[0]) legendItems[0].querySelector('.emotion-legend-percentage').textContent = `${p.happy}%`;
        if (legendItems[1]) legendItems[1].querySelector('.emotion-legend-percentage').textContent = `${p.neutral}%`;
        if (legendItems[2]) legendItems[2].querySelector('.emotion-legend-percentage').textContent = `${p.sad}%`;
        if (legendItems[3]) legendItems[3].querySelector('.emotion-legend-percentage').textContent = `${p.anxious}%`;
    } else {
        document.querySelectorAll('.emotion-legend-percentage').forEach((el) => {
            el.textContent = '0%';
        });
    }
}

// Initialize Activity Impact Chart
function initializeActivityImpactChart() {
    const ctx = document.getElementById('activityImpactChart');
    if (!ctx) return;
    
    const chartTheme = getChartTheme();
    const activityData = {
        labels: ['Exercise', 'Sleep', 'Work', 'Social', 'Reading', 'Meditation'],
        datasets: [{
            label: 'Mood Impact',
            data: HAS_INSIGHTS_DATA ? [85, 78, 45, 72, 68, 82] : [0, 0, 0, 0, 0, 0],
            backgroundColor: [
                hexToRgba(chartTheme.primary, 0.9),
                hexToRgba(chartTheme.primary, 0.85),
                hexToRgba(chartTheme.primary, 0.5),
                hexToRgba(chartTheme.primary, 0.7),
                hexToRgba(chartTheme.primary, 0.6),
                hexToRgba(chartTheme.primary, 0.8)
            ],
            borderColor: chartTheme.primary,
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
                    enabled: HAS_INSIGHTS_DATA,
                    backgroundColor: chartTheme.tooltipBg,
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
                        color: chartTheme.tick,
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
                        color: chartTheme.grid,
                        borderDash: [5, 5]
                    },
                    ticks: {
                        color: chartTheme.tick,
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
