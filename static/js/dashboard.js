// DiariCore Dashboard JavaScript
const FORCE_DASHBOARD_PREVIEW_TREND = false;

document.addEventListener('DOMContentLoaded', async function() {
    await syncEntriesFromApi();
    initializeDashboardFromUserData();
    initializeGreetingClock();
    initializeStreakBook();
    
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

function initializeStreakBook() {
    const toggleBtn = document.getElementById('floatingStreakToggle');
    const panel = document.getElementById('floatingStreakPanel');
    const icon = toggleBtn ? toggleBtn.querySelector('i') : null;
    if (!toggleBtn || !panel || !icon || toggleBtn.dataset.bound === '1') return;
    toggleBtn.dataset.bound = '1';

    const setOpen = (open) => {
        panel.hidden = !open;
        toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label', open ? 'Close streak book' : 'Open streak book');
        icon.classList.toggle('bi-book', !open);
        icon.classList.toggle('bi-book-half', open);
    };

    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = toggleBtn.getAttribute('aria-expanded') === 'true';
        setOpen(!isOpen);
    });

    document.addEventListener('click', (event) => {
        if (panel.hidden) return;
        if (panel.contains(event.target) || toggleBtn.contains(event.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setOpen(false);
    });
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
    const streakCount = document.querySelector('.floating-streak-panel .streak-count');

    const latest = getLatestEntry(entries);
    const weeklyEntries = (entries || []).filter((e) => e?.date && isWithinLast7Days(new Date(e.date)));
    const weeklyScores = weeklyEntries.map((e) => feelingToScore(resolveEntryFeeling(e)));
    const streak = calculateEntryStreak(entries || []);
    if (streakCount) streakCount.textContent = `${streak} day${streak === 1 ? '' : 's'}`;

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
    const sparklineEl = document.getElementById('dashboardWeeklySparkline');
    if (!sparklineEl) return;
    const avgEl = document.getElementById('dashboardWeeklyAvg');
    const bestDayEl = document.getElementById('dashboardWeeklyBestDay');
    const trendEl = document.getElementById('dashboardWeeklyTrend');
    const trendBadge = document.getElementById('dashboardTrendBadge');

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
    const firstKnown = chartData.find((v) => v !== null) ?? 5;
    let series = chartData.map((v) => (v === null ? firstKnown : v));
    const hasData = chartData.some((v) => v !== null);

    // Preview mode intentionally disabled (data-driven sparkline only).

    const valid = series.filter((v) => Number.isFinite(v));
    const avg = valid.length ? (valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
    const maxVal = valid.length ? Math.max(...valid) : 0;
    const maxIndex = series.findIndex((v) => v === maxVal);
    const bestDay = maxIndex >= 0 ? labels[maxIndex] : '--';
    const firstAvg = (series[0] + series[1] + series[2]) / 3;
    const secondAvg = (series[4] + series[5] + series[6]) / 3;
    const delta = secondAvg - firstAvg;
    if (avgEl) avgEl.textContent = hasData ? `${avg.toFixed(1)}/10` : '--';
    if (bestDayEl) bestDayEl.textContent = hasData ? bestDay : '--';
    if (trendEl) trendEl.textContent = hasData ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}` : '--';
    if (trendBadge) {
        const icon = delta > 0.15 ? 'bi-arrow-up-right' : (delta < -0.15 ? 'bi-arrow-down-right' : 'bi-arrow-left-right');
        trendBadge.classList.toggle('is-up', delta > 0.15);
        trendBadge.innerHTML = `<i class="bi ${icon}"></i>${delta > 0.15 ? 'Improving' : (delta < -0.15 ? 'Declining' : 'Steady')}`;
    }

    const w = 640;
    const h = 120;
    const padX = 12;
    const padY = 12;
    const step = (w - padX * 2) / 6;
    const yMin = 0;
    const yMax = 10;
    const toY = (v) => h - padY - ((v - yMin) / (yMax - yMin)) * (h - padY * 2);
    const points = series.map((v, i) => ({ x: padX + i * step, y: toY(v) }));
    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    const areaD = `${lineD} L ${(padX + 6 * step).toFixed(2)} ${(h - padY).toFixed(2)} L ${padX.toFixed(2)} ${(h - padY).toFixed(2)} Z`;

    sparklineEl.innerHTML = `
        <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Weekly mood sparkline">
            <defs>
                <linearGradient id="dashMoodFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#1D9E75" stop-opacity="0.15"></stop>
                    <stop offset="100%" stop-color="#1D9E75" stop-opacity="0"></stop>
                </linearGradient>
            </defs>
            <path d="${areaD}" fill="url(#dashMoodFill)"></path>
            <path d="${lineD}" fill="none" stroke="#1D9E75" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
            <circle cx="${points[6].x.toFixed(2)}" cy="${points[6].y.toFixed(2)}" r="3.8" fill="#1D9E75"></circle>
        </svg>`;
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
