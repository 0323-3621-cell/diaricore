// DiariCore Insights Page JavaScript - New Layout
let INSIGHTS_ENTRIES = [];
let HAS_INSIGHTS_DATA = false;
let WEEKLY_DESKTOP_CHART = null;

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
        <div class="emotion-triggers-stack">
            <article class="emotion-trigger-block emotion-trigger-block--stress" aria-labelledby="stressTriggerTitle">
                <div class="emotion-trigger-block__top">
                    <span class="emotion-trigger-block__emoji" aria-hidden="true">😰</span>
                    <div class="emotion-trigger-block__intro">
                        <p class="emotion-trigger-block__eyebrow" id="stressTriggerTitle">Top stress trigger</p>
                        <p class="emotion-trigger-block__accent">${esc(topStress)}</p>
                    </div>
                </div>
                <p class="emotion-trigger-block__desc">${esc(stressDesc)}</p>
                ${stressJustification ? `
                    <details class="trigger-justification emotion-trigger-block__details">
                        <summary>Why this is the top stress trigger</summary>
                        <p>${esc(stressJustification)}</p>
                    </details>
                ` : ``}
            </article>
            <article class="emotion-trigger-block emotion-trigger-block--happiness" aria-labelledby="happyTriggerTitle">
                <div class="emotion-trigger-block__top">
                    <span class="emotion-trigger-block__emoji" aria-hidden="true">😊</span>
                    <div class="emotion-trigger-block__intro">
                        <p class="emotion-trigger-block__eyebrow" id="happyTriggerTitle">Top happiness trigger</p>
                        <p class="emotion-trigger-block__accent">${esc(topHappy)}</p>
                    </div>
                </div>
                <p class="emotion-trigger-block__desc">${esc(happyDesc)}</p>
                ${happyJustification ? `
                    <details class="trigger-justification emotion-trigger-block__details">
                        <summary>Why this is the top happiness trigger</summary>
                        <p>${esc(happyJustification)}</p>
                    </details>
                ` : ``}
            </article>
        </div>`;
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

    renderInsightsConsistencyStrip();
    initializeInsightsHeroTabs();
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

function resolveDetectedMood(entry) {
    const raw = (entry?.emotionLabel || entry?.feeling || '').toLowerCase();
    const allowed = new Set(['happy', 'sad', 'angry', 'anxious', 'neutral']);
    if (allowed.has(raw)) return raw;
    // fall back to the older heuristic mapping if needed
    const resolved = resolveEntryFeeling(entry);
    if (allowed.has(resolved)) return resolved;
    return 'neutral';
}

function titleCaseWord(value) {
    const s = String(value || '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

/** Monday 00:00 local for the calendar week (Mon–Sun) containing `ref`. Matches dashboard weekly glance. */
function mondayStartOfLocalWeek(ref = new Date()) {
    const t = new Date(ref);
    t.setHours(0, 0, 0, 0);
    const dow = t.getDay();
    const daysFromMonday = dow === 0 ? 6 : dow - 1;
    const monday = new Date(t);
    monday.setDate(t.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

const MS_PER_DAY = 86400000;

/**
 * Mon–Sun calendar week: per-day average mood, dominant emotion, entry counts.
 * Richer than the dashboard sparkline; same week boundaries as the dashboard strip.
 */
function insightsCalendarWeekSeries() {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const monday = mondayStartOfLocalWeek();
    const dayLabelForTooltip = [];
    for (let i = 0; i < 7; i += 1) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dayLabelForTooltip.push(
            d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        );
    }
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const rangeCaption = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const dayBuckets = Array.from({ length: 7 }, () => []);
    if (HAS_INSIGHTS_DATA) {
        INSIGHTS_ENTRIES.forEach((entry) => {
            if (!entry?.date) return;
            const d = new Date(entry.date);
            d.setHours(0, 0, 0, 0);
            const idx = Math.round((d.getTime() - monday.getTime()) / MS_PER_DAY);
            if (idx < 0 || idx > 6) return;
            dayBuckets[idx].push(entry);
        });
    }

    const emotionTags = [];
    const data = dayBuckets.map((dayEntries) => {
        if (!dayEntries.length) {
            emotionTags.push('No entries');
            return null;
        }
        const scores = dayEntries.map((e) => entryMoodScore10(e));
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const emotionCount = {};
        dayEntries.forEach((e) => {
            const mood = resolveDetectedMood(e);
            emotionCount[mood] = (emotionCount[mood] || 0) + 1;
        });
        const topMood =
            Object.keys(emotionCount).sort((a, b) => emotionCount[b] - emotionCount[a] || a.localeCompare(b))[0] ||
            'neutral';
        emotionTags.push(titleCaseWord(topMood));
        return avg;
    });
    const entryCounts = dayBuckets.map((b) => b.length);

    return {
        labels,
        data,
        emotionTags,
        entryCounts,
        dayLabelForTooltip,
        rangeCaption,
        monday,
    };
}

function weeklyHighlightDayIndex(weekly) {
    const { monday, data } = weekly;
    if (!monday || !Array.isArray(data)) return -1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const idx = Math.round((today.getTime() - monday.getTime()) / MS_PER_DAY);
    if (idx >= 0 && idx <= 6 && data[idx] != null) return idx;
    for (let i = 6; i >= 0; i -= 1) {
        if (data[i] != null) return i;
    }
    return -1;
}

function countEntriesInRollingDays(days) {
    const n = Math.max(1, Number(days) || 7);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - (n - 1));
    start.setHours(0, 0, 0, 0);
    let c = 0;
    INSIGHTS_ENTRIES.forEach((e) => {
        if (!e?.date) return;
        const d = new Date(e.date);
        if (d >= start && d <= end) c += 1;
    });
    return c;
}

function computeJournalStreakDays() {
    if (!INSIGHTS_ENTRIES.length) return 0;
    const set = new Set();
    INSIGHTS_ENTRIES.forEach((e) => {
        if (!e?.date) return;
        const d = new Date(e.date);
        d.setHours(0, 0, 0, 0);
        set.add(d.getTime());
    });
    let streak = 0;
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    for (let i = 0; i < 400; i += 1) {
        if (set.has(cur.getTime())) streak += 1;
        else break;
        cur.setDate(cur.getDate() - 1);
    }
    return streak;
}

function renderInsightsConsistencyStrip() {
    const wEl = document.getElementById('insightsConsistencyWeek');
    const mEl = document.getElementById('insightsConsistencyMonth');
    const sEl = document.getElementById('insightsConsistencyStreak');
    if (wEl) wEl.textContent = String(countEntriesInRollingDays(7));
    if (mEl) mEl.textContent = String(countEntriesInRollingDays(30));
    if (sEl) sEl.textContent = String(computeJournalStreakDays());
}

function initializeInsightsHeroTabs() {
    const emotions = document.getElementById('insightsTabEmotions');
    const consistency = document.getElementById('insightsTabConsistency');
    const strip = document.getElementById('insightsConsistencyStrip');
    if (!emotions || !consistency) return;
    const activate = (which) => {
        const isCons = which === 'consistency';
        emotions.classList.toggle('is-active', !isCons);
        emotions.setAttribute('aria-selected', !isCons ? 'true' : 'false');
        consistency.classList.toggle('is-active', isCons);
        consistency.setAttribute('aria-selected', isCons ? 'true' : 'false');
        if (strip) strip.hidden = !isCons;
    };
    emotions.addEventListener('click', () => activate('emotions'));
    consistency.addEventListener('click', () => activate('consistency'));
}

/** Pick 0..len-1 from calendar day + week (Monday) so copy shifts daily and when the week rolls over. */
function snapshotLedeTemplateIndex(len, weekly) {
    if (len <= 1) return 0;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const epochDays = Math.floor(d.getTime() / 86400000);
    const mon = weekly?.monday;
    const weekEpoch =
        mon instanceof Date && !Number.isNaN(mon.getTime()) ? Math.floor(mon.getTime() / 86400000) : 0;
    const mix = epochDays * 31 + weekEpoch * 17 + (Array.isArray(weekly?.labels) ? weekly.labels.length * 3 : 21);
    return ((mix % len) + len) % len;
}

/**
 * Weekly snapshot ledes — same Mon–Sun `weekly` series as the chart; pool + day/week index keeps copy fresh.
 */
const WEEKLY_SNAPSHOT_LEDE_TEMPLATES = [
    (c) =>
        `This week, your average mood is ${c.avg} / 10 with a ${c.trWord} trend between the first and second half of your logged days.`,
    (c) =>
        `From the days you journaled this week, mood averaged ${c.avg} / 10 — a ${c.trWord} arc from earlier entries toward later ones.`,
    (c) =>
        `Your check-ins this week center around ${c.avg} / 10 overall, with a ${c.trWord} shift between the first half of logged days and the second.`,
    (c) =>
        `Across ${c.n} days with entries, daily mood averages ${c.avg} / 10, reading ${c.trWord} through the span you captured.`,
    (c) =>
        `The moods you logged this week sit near ${c.avg} / 10 on average, showing a ${c.trWord} tilt from earlier journal days to the ones that followed.`,
    (c) =>
        `So far this week, when you wrote, scores averaged ${c.avg} / 10 with a ${c.trWord} pattern between the first and second halves of what you recorded.`,
    (c) =>
        `Weekly mood from your entries lands around ${c.avg} / 10, with a ${c.trWord} run across the days you journaled.`,
    (c) =>
        `Plotting the days you saved, the week averages ${c.avg} / 10 and carries a ${c.trWord} feel from earlier check-ins to later ones.`,
    (c) =>
        c.totalEntries > c.n
            ? `You left ${c.totalEntries} entries across ${c.n} calendar days; daily mood averages ${c.avg} / 10 with a ${c.trWord} swing from the first batch of notes to the next.`
            : `Glancing at ${c.n} days with mood data, the week settles near ${c.avg} / 10 and moves in a ${c.trWord} direction from earlier to later logs.`,
    (c) =>
        c.rangeCaption
            ? `Between ${c.rangeCaption}, your logged moods average ${c.avg} / 10 — a ${c.trWord} story from the first half of those days to the second.`
            : `Your logged moods average ${c.avg} / 10 this week — a ${c.trWord} story from the first half of those days to the second.`,
    (c) =>
        c.hasContrast
            ? `The week still centers near ${c.avg} / 10, with a ${c.trWord} pull across your notes — ${c.bestDay} peaked at ${c.bestScore}/10 while ${c.toughDay} landed softer at ${c.toughScore}/10.`
            : `The week centers near ${c.avg} / 10, with a ${c.trWord} pull across the ${c.n} days you chose to log.`,
    (c) =>
        c.hasContrast && parseFloat(c.spread) >= 1.5
            ? `There is about a ${c.spread}-point swing between your highest and lowest logged days, yet the week averages ${c.avg} / 10 overall, trending ${c.trWord} from earlier entries to later ones.`
            : `Mood traces stay clustered enough to average ${c.avg} / 10, while the week still reads ${c.trWord} from first notes toward the last.`,
    (c) =>
        `Your line this week hovers near ${c.avg} / 10; the half-and-half read is ${c.trWord} — a different tone at the start of what you logged than by the time you closed the week.`,
    (c) =>
        c.hasContrast
            ? `${c.bestDay} felt like the emotional high note (${c.bestScore}/10) and ${c.toughDay} the low tide (${c.toughScore}/10); between them the week still averages ${c.avg} / 10 and trends ${c.trWord}.`
            : `Day by day, the thread averages ${c.avg} / 10 and trends ${c.trWord} across what you put on the page.`,
    (c) =>
        `Picture the week as ${c.n} stepping stones: together they average ${c.avg} / 10, and the stride between the first stones and the last feels ${c.trWord}.`,
    (c) =>
        `If we smooth every mood you captured, we land on ${c.avg} / 10 — not flat, but ${c.trWord} as you move from the opening days you logged toward the finale.`,
];

const WEEKLY_SNAPSHOT_LEDE_SINGLE_DAY_TEMPLATES = [
    (c) =>
        `You logged mood on one day this week (${c.avg} / 10). Add a few more dated entries to see how the rest of the week shapes up.`,
    (c) =>
        `Only one mood check-in so far this week — ${c.avg} / 10. A fuller week of notes will make this summary richer.`,
    (c) =>
        `This week's journal shows a single mood snapshot at ${c.avg} / 10; keep logging to trace the arc across more days.`,
    (c) =>
        c.totalEntries > 1
            ? `Several entries landed on the same day, averaging ${c.avg} / 10 — sprinkle moods across more days so this card can stretch its legs.`
            : `One quiet dot on the calendar (${c.avg} / 10) — give the rest of the week a voice when you can.`,
    (c) =>
        c.rangeCaption
            ? `Across ${c.rangeCaption}, only one day carries a mood score so far (${c.avg} / 10); the rest of the ribbon is still waiting for you.`
            : `Only one day carries a mood score so far (${c.avg} / 10); the rest of the ribbon is still waiting for you.`,
];

function updateInsightsSnapshotFromWeekly(weekly) {
    const lede = document.getElementById('insightsMemoryLede');
    const bestVal = document.getElementById('insightHighlightBestValue');
    const toughVal = document.getElementById('insightHighlightToughValue');
    const data = weekly?.data || [];
    const labels = weekly?.labels || [];
    let bestI = -1;
    let toughI = -1;
    const validIdx = [];
    data.forEach((v, i) => {
        if (v !== null && v !== undefined && !Number.isNaN(Number(v))) validIdx.push(i);
    });
    if (validIdx.length) {
        let bestV = -Infinity;
        let toughV = Infinity;
        validIdx.forEach((i) => {
            const v = Number(data[i]);
            if (v > bestV) {
                bestV = v;
                bestI = i;
            }
            if (v < toughV) {
                toughV = v;
                toughI = i;
            }
        });
    }
    if (bestVal) bestVal.textContent = bestI >= 0 ? `${labels[bestI]} (${Number(data[bestI]).toFixed(1)})` : '—';
    if (toughVal) toughVal.textContent = toughI >= 0 ? `${labels[toughI]} (${Number(data[toughI]).toFixed(1)})` : '—';

    const vals = data.filter((v) => v !== null && v !== undefined).map(Number);
    const n = vals.length;
    if (lede) {
        if (!n) {
            lede.textContent = 'Save a few dated entries to see your weekly mood snapshot here.';
        } else {
            const avgStr = (vals.reduce((a, b) => a + b, 0) / n).toFixed(1);
            const half = Math.max(1, Math.floor(n / 2));
            const first = vals.slice(0, half);
            const second = vals.slice(half);
            const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
            const secondAvg = second.length ? second.reduce((a, b) => a + b, 0) / second.length : firstAvg;
            const tr = secondAvg - firstAvg;
            const trWord = tr > 0.08 ? 'lifting' : tr < -0.08 ? 'softening' : 'steady';
            const ec = weekly?.entryCounts;
            const totalEntries = Array.isArray(ec) ? ec.reduce((s, x) => s + (Number(x) || 0), 0) : 0;
            const bestDay = bestI >= 0 ? labels[bestI] : '';
            const toughDay = toughI >= 0 ? labels[toughI] : '';
            const bestScore = bestI >= 0 ? Number(data[bestI]).toFixed(1) : '';
            const toughScore = toughI >= 0 ? Number(data[toughI]).toFixed(1) : '';
            const spreadNum = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
            const spreadStr = spreadNum.toFixed(1);
            const hasContrast = Boolean(bestDay && toughDay && bestI !== toughI);
            const rangeCaption = weekly?.rangeCaption ? String(weekly.rangeCaption).trim() : '';
            const ctx = {
                avg: avgStr,
                trWord,
                n,
                totalEntries,
                bestDay,
                toughDay,
                bestScore,
                toughScore,
                spread: spreadStr,
                hasContrast,
                rangeCaption,
            };

            if (n < 2) {
                const pool = WEEKLY_SNAPSHOT_LEDE_SINGLE_DAY_TEMPLATES;
                const idx = snapshotLedeTemplateIndex(pool.length, weekly);
                lede.textContent = pool[idx](ctx);
            } else {
                const pool = WEEKLY_SNAPSHOT_LEDE_TEMPLATES;
                const idx = snapshotLedeTemplateIndex(pool.length, weekly);
                lede.textContent = pool[idx](ctx);
            }
        }
    }
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
    const moodHeader = document.querySelector('.insights-hero__subtitle');
    if (moodHeader) moodHeader.textContent = 'Insights will appear once you start journaling.';
}

// Initialize Weekly Mood Chart (mobile — same Mon–Sun week + detail as desktop)
function initializeWeeklyMoodChart() {
    const ctx = document.getElementById('weeklyChart');
    if (!ctx) return;

    const chartTheme = getChartTheme();
    const weekly = insightsCalendarWeekSeries();
    const hasData = weekly.data.some((v) => v !== null && v !== undefined);
    const highlightIdx = weeklyHighlightDayIndex(weekly);

    const weeklyData = {
        labels: weekly.labels,
        datasets: [
            {
                label: 'Mood Score',
                data: weekly.data,
                borderColor: chartTheme.primary,
                backgroundColor: chartTheme.primarySoft,
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                spanGaps: false,
                pointBorderColor: chartTheme.primary,
                pointBorderWidth: 2,
                pointBackgroundColor: (context) => {
                    const i = context.dataIndex;
                    if (weekly.data[i] == null) return 'transparent';
                    return i === highlightIdx ? chartTheme.primary : chartTheme.border;
                },
                pointRadius: (context) => (weekly.data[context.dataIndex] != null && hasData ? 6 : 0),
                pointHoverRadius: (context) => (weekly.data[context.dataIndex] != null && hasData ? 8 : 0),
            },
        ],
    };

    const config = {
        type: 'line',
        data: weeklyData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
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
                        title: (context) => {
                            const idx = context?.[0]?.dataIndex ?? 0;
                            return weekly.dayLabelForTooltip[idx] || '';
                        },
                        label: (context) => {
                            const idx = context.dataIndex;
                            const y = context.parsed.y;
                            if (y == null || Number.isNaN(Number(y))) {
                                return 'No entries this day';
                            }
                            const lines = [
                                `Average mood: ${Number(y).toFixed(1)}/10`,
                                `Top emotion: ${weekly.emotionTags[idx] || '—'}`,
                            ];
                            const n = weekly.entryCounts[idx] || 0;
                            if (n) lines.push(`${n} journal ${n === 1 ? 'entry' : 'entries'}`);
                            return lines;
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: chartTheme.tick,
                        font: {
                            size: 12,
                            weight: '500',
                        },
                    },
                },
                y: {
                    beginAtZero: true,
                    max: 10,
                    grid: {
                        color: chartTheme.grid,
                        borderDash: [5, 5],
                    },
                    ticks: {
                        color: chartTheme.tick,
                        font: {
                            size: 12,
                            weight: '500',
                        },
                        stepSize: 1,
                        precision: 0,
                    },
                },
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        },
    };

    new Chart(ctx, config);
}

// Initialize Desktop Weekly Mood Chart (Mon–Sun calendar week; richer than dashboard glance)
function initializeWeeklyMoodChartDesktop() {
    const ctx = document.getElementById('weeklyChartDesktop');
    if (!ctx) return;

    const capEl = document.getElementById('weeklyTrendRangeCaption');
    const chartTheme = getChartTheme();
    const weekly = insightsCalendarWeekSeries();
    if (capEl) {
        capEl.textContent = `This week (Mon–Sun) · ${weekly.rangeCaption}`;
    }

    const hasData = weekly.data.some((v) => v !== null && v !== undefined);
    const highlightIdx = weeklyHighlightDayIndex(weekly);
    const bestIdx = weekly.data.reduce(
        (best, v, i, arr) => (v != null && !Number.isNaN(Number(v)) && (best < 0 || Number(v) > Number(arr[best])) ? i : best),
        -1
    );

    const weeklyData = {
        labels: weekly.labels,
        datasets: [
            {
                label: 'Mood Score',
                data: weekly.data,
                borderColor: '#1D9E75',
                backgroundColor: chartTheme.primarySoft,
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                spanGaps: false,
                pointBorderColor: '#1D9E75',
                pointBorderWidth: 2,
                pointBackgroundColor: (context) => {
                    const i = context.dataIndex;
                    if (weekly.data[i] == null) return 'transparent';
                    return i === highlightIdx ? '#1D9E75' : '#ffffff';
                },
                pointRadius: (context) => (weekly.data[context.dataIndex] != null && hasData ? 5 : 0),
                pointHoverRadius: (context) => (weekly.data[context.dataIndex] != null && hasData ? 7 : 0),
            },
        ],
    };

    const bestPointPlugin = {
        id: 'bestPointLabel',
        afterDatasetsDraw(chart) {
            if (bestIdx < 0) return;
            const point = chart.getDatasetMeta(0)?.data?.[bestIdx];
            const value = weekly.data[bestIdx];
            if (!point || value == null) return;
            const { ctx: c } = chart;
            c.save();
            c.fillStyle = '#f7efd9';
            c.strokeStyle = '#e3cfa6';
            c.lineWidth = 1;
            const label = `Best: ${Number(value).toFixed(1)}`;
            c.font = '600 11px Inter, sans-serif';
            const tw = c.measureText(label).width;
            const x = point.x - tw / 2 - 7;
            const y = point.y - 24;
            const w = tw + 14;
            const h = 18;
            c.beginPath();
            if (typeof c.roundRect === 'function') {
                c.roundRect(x, y, w, h, 6);
            } else {
                c.rect(x, y, w, h);
            }
            c.fill();
            c.stroke();
            c.fillStyle = '#8d6227';
            c.fillText(label, x + 7, y + 12);
            c.restore();
        },
    };

    const config = {
        type: 'line',
        data: weeklyData,
        plugins: [bestPointPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: hasData,
                    backgroundColor: chartTheme.tooltipBg,
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: chartTheme.primary,
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: (context) => {
                            const idx = context?.[0]?.dataIndex ?? 0;
                            return weekly.dayLabelForTooltip[idx] || '';
                        },
                        label: (context) => {
                            const idx = context.dataIndex;
                            const y = context.parsed.y;
                            if (y == null || Number.isNaN(Number(y))) {
                                return 'No entries this day';
                            }
                            const lines = [
                                `Average mood: ${Number(y).toFixed(1)}/10`,
                                `Top emotion: ${weekly.emotionTags[idx] || '—'}`,
                            ];
                            const n = weekly.entryCounts[idx] || 0;
                            if (n) lines.push(`${n} journal ${n === 1 ? 'entry' : 'entries'}`);
                            return lines;
                        },
                    },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 10,
                    grid: {
                        color: 'rgba(130, 150, 140, 0.35)',
                        drawBorder: false,
                        borderDash: [5, 5],
                    },
                    ticks: {
                        color: chartTheme.tick,
                        font: {
                            size: 12,
                        },
                        stepSize: 1,
                        precision: 0,
                    },
                },
                x: {
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: chartTheme.tick,
                        font: {
                            size: 12,
                        },
                    },
                },
            },
            interaction: {
                intersect: false,
                mode: 'index',
            },
        },
    };

    if (WEEKLY_DESKTOP_CHART) WEEKLY_DESKTOP_CHART.destroy();
    WEEKLY_DESKTOP_CHART = new Chart(ctx, config);

    const avgEl = document.getElementById('weeklyStatAvg');
    const trendEl = document.getElementById('weeklyStatTrend');
    const peakEl = document.getElementById('weeklyStatPeak');
    const valid = weekly.data.filter((v) => v !== null && v !== undefined).map(Number);
    const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    const half = Math.max(1, Math.floor(valid.length / 2));
    const firstAvg = valid.length ? valid.slice(0, half).reduce((a, b) => a + b, 0) / half : 0;
    const second = valid.slice(half);
    const secondAvg = second.length ? second.reduce((a, b) => a + b, 0) / second.length : firstAvg;
    const trend = secondAvg - firstAvg;

    if (avgEl) avgEl.textContent = avg == null ? '--' : avg.toFixed(1);
    if (trendEl) {
        trendEl.textContent = valid.length ? `${trend > 0 ? '+' : ''}${trend.toFixed(1)}` : '--';
        trendEl.classList.remove('is-up', 'is-down');
        if (trend > 0.05) trendEl.classList.add('is-up');
        else if (trend < -0.05) trendEl.classList.add('is-down');
    }
    if (peakEl) peakEl.textContent = bestIdx >= 0 ? weekly.labels[bestIdx] : '--';

    updateInsightsSnapshotFromWeekly(weekly);
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
            { key: 'happy', name: 'Happy', color: '#2A9D8F', pct: p.happy },
            { key: 'sad', name: 'Sad', color: '#457B9D', pct: p.sad },
            { key: 'angry', name: 'Angry', color: '#E63946', pct: p.angry },
            { key: 'anxious', name: 'Anxious', color: '#F4A261', pct: p.anxious },
            { key: 'neutral', name: 'Neutral', color: '#9AA5B1', pct: p.neutral },
        ];
        legendEl.innerHTML = items
            .map(
                (it) => `
                <div class="emotion-legend-compact" role="listitem">
                    <span class="emotion-legend-compact__dot" style="background:${it.color}" aria-hidden="true"></span>
                    <span class="emotion-legend-compact__line">
                        <span class="emotion-legend-compact__pct">${it.pct.toFixed(1)}%</span>
                        <span class="emotion-legend-compact__name">${it.name}</span>
                    </span>
                </div>
            `
            )
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
            barThickness: 26,
            maxBarThickness: 32,
            stack: 'moods',
        }))
        : [{
            label: 'No Data',
            data: [0],
            backgroundColor: chartTheme.pieFallback,
            borderColor: chartTheme.pieFallback,
            borderWidth: 1,
            borderRadius: 6,
            barThickness: 26,
            maxBarThickness: 32,
            stack: 'moods',
        }];
    
    const config = {
        type: 'bar',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                // Inset chart + legend from canvas edge so the top legend (Happy…) clears the Y-axis “100%”.
                padding: { top: 6, bottom: 2, left: 28, right: 10 },
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: chartTheme.tick,
                        font: { size: 11, weight: '600' },
                        padding: 12,
                        boxWidth: 12,
                        boxHeight: 12,
                        usePointStyle: true,
                        pointStyle: 'rectRounded',
                        // Chart.js label `padding` is mostly vertical between rows; pad text for horizontal gaps.
                        generateLabels(chart) {
                            const datasets = chart.data.datasets || [];
                            const gap = '\u2002\u2002'; // modest space between mood labels
                            return datasets.map((dataset, i) => ({
                                text: `${dataset.label || ''}${i < datasets.length - 1 ? gap : ''}`,
                                fillStyle: Array.isArray(dataset.backgroundColor)
                                    ? dataset.backgroundColor[0]
                                    : dataset.backgroundColor,
                                strokeStyle: Array.isArray(dataset.borderColor)
                                    ? dataset.borderColor[0]
                                    : dataset.borderColor,
                                lineWidth: 0,
                                hidden: !chart.isDatasetVisible(i),
                                datasetIndex: i,
                                fontColor: chartTheme.tick,
                                pointStyle: 'rectRounded',
                            }));
                        },
                    },
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
                            size: 11,
                            weight: '500'
                        },
                        maxRotation: 40,
                        minRotation: 0,
                        autoSkip: true,
                        callback: function(value) {
                            const label = this.getLabelForValue(value);
                            return String(label || '');
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
