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

function renderTagBasedSummaryCard(summary) {
    const esc = (t) =>
        String(t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    const topStress = summary.topStressTrigger || 'Not enough data yet';
    const topHappy = summary.topHappinessTrigger || 'Not enough data yet';
    const stressDesc = summary.stressDescription || 'Add more tagged stress-related entries to unlock your stress trigger insight.';
    const happyDesc = summary.happinessDescription || 'Add more tagged happy entries to unlock your positive trigger insight.';
    const stressJustification = summary.stressJustification || '';
    const happyJustification = summary.happinessJustification || '';
    return `
        <article class="emotion-trigger-card" data-emotion="summary">
            <div class="emotion-trigger-card__head">
                <span class="emotion-trigger-card__emoji" aria-hidden="true">😰</span>
                <h3 class="emotion-trigger-card__title"><span class="emotion-trigger-card__label">Top stress trigger:</span> <span class="emotion-trigger-card__keywords">${esc(topStress)}</span></h3>
            </div>
            <p class="emotion-trigger-card__insight">${esc(stressDesc)}</p>
            ${stressJustification ? `
                <details class="trigger-justification">
                    <summary>Why this is the top stress trigger</summary>
                    <p>${esc(stressJustification)}</p>
                </details>
            ` : ``}
            <div class="emotion-trigger-card__head">
                <span class="emotion-trigger-card__emoji" aria-hidden="true">😊</span>
                <h3 class="emotion-trigger-card__title"><span class="emotion-trigger-card__label">Top happiness trigger:</span> <span class="emotion-trigger-card__keywords">${esc(topHappy)}</span></h3>
            </div>
            <p class="emotion-trigger-card__insight">${esc(happyDesc)}</p>
            ${happyJustification ? `
                <details class="trigger-justification">
                    <summary>Why this is the top happiness trigger</summary>
                    <p>${esc(happyJustification)}</p>
                </details>
            ` : ``}
        </article>`;
}

async function loadEmotionTriggersDashboard() {
    const el = document.getElementById('emotionTriggersDashboard');
    if (!el) return;

    const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    const userId = Number(user?.id || 0);
    if (!userId) {
        el.innerHTML =
            '<p class="emotion-triggers-empty">Log in and save entries with tags to see your trigger summary here.</p>';
        return;
    }

    el.innerHTML =
        '<p class="emotion-triggers-loading" role="status">Loading trigger patterns…</p>';

    try {
        const summaryRes = await fetch(`/api/triggers/summary?userId=${encodeURIComponent(String(userId))}`);
        const summaryJson = await summaryRes.json();
        if (!summaryRes.ok || !summaryJson.success) {
            throw new Error(summaryJson.error || 'Could not load tag trigger summary.');
        }

        const hasAnySignal = Boolean(summaryJson.topStressTrigger || summaryJson.topHappinessTrigger);
        if (!hasAnySignal) {
            el.innerHTML =
                '<p class="emotion-triggers-empty">No strong trigger pattern yet. Add tags when writing entries, then save at least 3 stress-related and 3 happy entries.</p>';
            return;
        }
        el.innerHTML = `<div class="emotion-triggers-list">${renderTagBasedSummaryCard(summaryJson)}</div>`;
    } catch (err) {
        console.error('emotion triggers dashboard:', err);
        el.innerHTML =
            '<p class="emotion-triggers-empty">Could not load trigger patterns. Please refresh or try again later.</p>';
    }
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
    initializeMoodByTagChart();
    
    // Load Data
    loadInsightsData();

    await loadEmotionTriggersDashboard();
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

function resolveDetectedMood(entry) {
    const raw = (entry?.emotionLabel || entry?.feeling || '').toLowerCase();
    const allowed = new Set(['happy', 'sad', 'angry', 'anxious', 'neutral']);
    if (allowed.has(raw)) return raw;
    // fall back to the older heuristic mapping if needed
    const resolved = resolveEntryFeeling(entry);
    if (allowed.has(resolved)) return resolved;
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
        return { labels: ['No Data'], values: [1], percentages: { happy: 0, neutral: 0, sad: 0, anxious: 0, angry: 0 } };
    }
    const counts = { happy: 0, neutral: 0, sad: 0, anxious: 0, angry: 0 };
    INSIGHTS_ENTRIES.forEach((entry) => {
        const f = resolveDetectedMood(entry);
        if (Object.prototype.hasOwnProperty.call(counts, f)) counts[f] += 1;
        else counts.neutral += 1;
    });
    const total = INSIGHTS_ENTRIES.length || 1;
    const pct = (n) => (n / total) * 100;
    const oneDecimal = (v) => Math.round(v * 10) / 10;
    const ensureSumsTo100 = (arr) => {
        // Round to 0.1 and distribute remainder so labels sum to exactly 100.0
        const rounded = arr.map(oneDecimal);
        let sum = oneDecimal(rounded.reduce((a, b) => a + b, 0));
        let diff = oneDecimal(100 - sum);
        // Apply diff in 0.1 steps to the largest slices first
        const order = arr
            .map((v, idx) => ({ idx, v }))
            .sort((a, b) => b.v - a.v)
            .map((x) => x.idx);
        let guard = 0;
        while (Math.abs(diff) >= 0.1 && guard < 2000) {
            const step = diff > 0 ? 0.1 : -0.1;
            const idx = order[guard % order.length];
            rounded[idx] = oneDecimal(rounded[idx] + step);
            diff = oneDecimal(diff - step);
            guard += 1;
        }
        return rounded;
    };
    const rawPercents = [
        pct(counts.happy),
        pct(counts.sad),
        pct(counts.angry),
        pct(counts.anxious),
        pct(counts.neutral),
    ];
    const percents = ensureSumsTo100(rawPercents);
    return {
        labels: ['Happy', 'Sad', 'Angry', 'Anxious', 'Neutral'],
        values: [counts.happy, counts.sad, counts.angry, counts.anxious, counts.neutral],
        percentages: {
            happy: percents[0],
            sad: percents[1],
            angry: percents[2],
            anxious: percents[3],
            neutral: percents[4],
        }
    };
}

function applyInsightsEmptyState() {
    if (HAS_INSIGHTS_DATA) return;
    const moodHeader = document.querySelector('.header-section .subtitle');
    if (moodHeader) moodHeader.textContent = 'Insights will appear once you start journaling.';
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
    const breakdown = emotionBreakdownData();
    const emotionData = {
        labels: HAS_INSIGHTS_DATA
            ? ['Happy (uplifted)', 'Sad (low)', 'Angry (frustrated)', 'Anxious (stressed)', 'Neutral (steady)']
            : ['No Data'],
        datasets: [{
            data: HAS_INSIGHTS_DATA ? breakdown.values : [1],
            backgroundColor: [
                HAS_INSIGHTS_DATA ? '#2A9D8F' : chartTheme.pieFallback, // happy
                '#457B9D', // sad
                '#E63946', // angry
                '#F4A261', // anxious
                '#9AA5B1', // neutral
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
                    backgroundColor: chartTheme.tooltipBg,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const idx = context.dataIndex;
                            const name = String(context.label || '').trim();
                            const pMap = breakdown.percentages;
                            const order = ['happy', 'sad', 'angry', 'anxious', 'neutral'];
                            const key = order[idx] || 'neutral';
                            const pctValue = Number(pMap[key] ?? 0);
                            return `${name}: ${pctValue.toFixed(1)}%`;
                        }
                    }
                }
            }
        }
    };
    
    new Chart(ctx, config);

    // Custom desktop legend (clearer than default legend + avoids icons inside chart)
    const legendEl = document.getElementById('emotionLegendDesktop');
    if (legendEl && HAS_INSIGHTS_DATA) {
        const p = breakdown.percentages;
        const items = [
            { key: 'happy', name: 'Happy', meta: 'uplifted', color: '#2A9D8F', pct: p.happy },
            { key: 'sad', name: 'Sad', meta: 'low', color: '#457B9D', pct: p.sad },
            { key: 'angry', name: 'Angry', meta: 'frustrated', color: '#E63946', pct: p.angry },
            { key: 'anxious', name: 'Anxious', meta: 'stressed', color: '#F4A261', pct: p.anxious },
            { key: 'neutral', name: 'Neutral', meta: 'steady', color: '#9AA5B1', pct: p.neutral },
        ];
        legendEl.innerHTML = items
            .map((it) => `
                <div class="legend-card" role="listitem">
                    <div class="legend-left">
                        <span class="legend-dot" style="background:${it.color}" aria-hidden="true"></span>
                        <div class="legend-text">
                            <div class="legend-name">${it.name}</div>
                            <div class="legend-meta">${it.meta}</div>
                        </div>
                    </div>
                    <div class="legend-pct">${it.pct.toFixed(1)}%</div>
                </div>
            `)
            .join('');
    } else if (legendEl) {
        legendEl.innerHTML = '';
    }
}

// Initialize Mobile Emotion Pie Chart
function initializeEmotionPieChartMobile() {
    const ctx = document.getElementById('emotionPieChartMobile');
    if (!ctx) return;
    
    const chartTheme = getChartTheme();
    const breakdown = emotionBreakdownData();
    const emotionData = {
        labels: HAS_INSIGHTS_DATA ? ['Happy', 'Sad', 'Angry', 'Anxious', 'Neutral'] : ['No Data'],
        datasets: [{
            data: HAS_INSIGHTS_DATA ? breakdown.values : [1],
            backgroundColor: [
                HAS_INSIGHTS_DATA ? '#2A9D8F' : chartTheme.pieFallback, // happy
                '#457B9D', // sad
                '#E63946', // angry
                '#F4A261', // anxious
                '#9AA5B1', // neutral
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
                            const name = String(context.label || '').trim();
                            const idx = context.dataIndex;
                            const pMap = breakdown.percentages;
                            const order = ['happy', 'sad', 'angry', 'anxious', 'neutral'];
                            const key = order[idx] || 'neutral';
                            const pctValue = Number(pMap[key] ?? 0);
                            return `${name}: ${pctValue.toFixed(1)}%`;
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
        if (legendItems[0]) legendItems[0].querySelector('.emotion-legend-percentage').textContent = `${Number(p.happy ?? 0).toFixed(1)}%`;
        if (legendItems[1]) legendItems[1].querySelector('.emotion-legend-percentage').textContent = `${Number(p.sad ?? 0).toFixed(1)}%`;
        if (legendItems[2]) legendItems[2].querySelector('.emotion-legend-percentage').textContent = `${Number(p.angry ?? 0).toFixed(1)}%`;
        if (legendItems[3]) legendItems[3].querySelector('.emotion-legend-percentage').textContent = `${Number(p.anxious ?? 0).toFixed(1)}%`;
        if (legendItems[4]) legendItems[4].querySelector('.emotion-legend-percentage').textContent = `${Number(p.neutral ?? 0).toFixed(1)}%`;
    } else {
        document.querySelectorAll('.emotion-legend-percentage').forEach((el) => {
            el.textContent = '0.0%';
        });
    }
}

function normalizeTagValue(tag) {
    return String(tag || '').trim().replace(/\s+/g, ' ');
}

function buildTagMoodBreakdown() {
    const countsByTag = {};
    const totalsByTag = {};
    const moods = ['happy', 'sad', 'angry', 'anxious', 'neutral'];

    INSIGHTS_ENTRIES.forEach((entry) => {
        const tags = Array.isArray(entry?.tags) ? entry.tags : [];
        if (!tags.length) return;
        const mood = resolveDetectedMood(entry);

        tags.forEach((raw) => {
            const normalized = normalizeTagValue(raw);
            if (!normalized) return;
            const key = normalized.toLowerCase();

            if (!countsByTag[key]) {
                countsByTag[key] = { display: normalized, happy: 0, sad: 0, angry: 0, anxious: 0, neutral: 0 };
                totalsByTag[key] = 0;
            }

            countsByTag[key][mood] = (countsByTag[key][mood] || 0) + 1;
            totalsByTag[key] += 1;
        });
    });

    const rankedTagKeys = Object.keys(totalsByTag)
        .sort((a, b) => (totalsByTag[b] - totalsByTag[a]) || a.localeCompare(b))
        .slice(0, 7);

    const labels = rankedTagKeys.map((k) => countsByTag[k].display);
    const totals = rankedTagKeys.map((k) => totalsByTag[k] || 0);

    const pct = (tagKey, moodKey) => {
        const total = totalsByTag[tagKey] || 1;
        return Math.round(((countsByTag[tagKey][moodKey] || 0) / total) * 1000) / 10; // 0.1%
    };

    const datasets = moods.map((m) => ({
        mood: m,
        data: rankedTagKeys.map((k) => pct(k, m)),
    }));

    return { labels, rankedTagKeys, totals, countsByTag, datasets };
}

// Initialize Activity Impact Chart
function initializeMoodByTagChart() {
    const ctx = document.getElementById('activityImpactChart');
    if (!ctx) return;
    
    const chartTheme = getChartTheme();

    const moodColors = {
        happy: '#2A9D8F',
        sad: '#457B9D',
        angry: '#E63946',
        anxious: '#F4A261',
        neutral: '#9AA5B1',
    };

    const breakdown = HAS_INSIGHTS_DATA ? buildTagMoodBreakdown() : null;
    const labels = breakdown && breakdown.labels.length ? breakdown.labels : ['No Data'];

    const datasets = breakdown
        ? breakdown.datasets.map((d) => ({
            label: d.mood.charAt(0).toUpperCase() + d.mood.slice(1),
            data: d.data,
            backgroundColor: moodColors[d.mood],
            borderColor: moodColors[d.mood],
            borderWidth: 1,
            borderRadius: 6,
            barThickness: 34,
            stack: 'moods',
        }))
        : [{
            label: 'No Data',
            data: [0],
            backgroundColor: chartTheme.pieFallback,
            borderColor: chartTheme.pieFallback,
            borderWidth: 1,
            borderRadius: 6,
            barThickness: 34,
            stack: 'moods',
        }];
    
    const config = {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: chartTheme.tick,
                        font: { size: 12, weight: '600' },
                        padding: 14,
                    }
                },
                tooltip: {
                    enabled: HAS_INSIGHTS_DATA,
                    backgroundColor: chartTheme.tooltipBg,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const mood = String(context.dataset.label || '');
                            const pctValue = Number(context.parsed.y || 0);
                            return `${mood}: ${pctValue.toFixed(1)}%`;
                        },
                        afterBody: function(context) {
                            if (!breakdown) return '';
                            const idx = context?.[0]?.dataIndex ?? -1;
                            const tagKey = breakdown.rankedTagKeys?.[idx];
                            if (!tagKey) return '';
                            const total = breakdown.totals?.[idx] ?? 0;
                            return `Based on ${total} tagged entries`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: chartTheme.tick,
                        font: {
                            size: 12,
                            weight: '500'
                        },
                        maxRotation: 0,
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            const s = String(label || '');
                            return s.length > 10 ? s.slice(0, 10) + '…' : s;
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 100,
                    stacked: true,
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
            },
            interaction: {
                intersect: false,
                mode: 'index'
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
