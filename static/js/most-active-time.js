/**
 * Shared “most active save hour” logic for Usage Insights (Consistency) and Profile reminder defaults.
 * Bucketing uses Asia/Manila wall time; same field precedence as insights: createdAt, else created_at, else date.
 */
(function (global) {
    const INSIGHTS_ACTIVITY_TIME_ZONE = 'Asia/Manila';

    function getHourInTimeZone(isoDate, timeZone) {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            hour: 'numeric',
            hourCycle: 'h23',
        }).formatToParts(isoDate);
        const h = parts.find((p) => p.type === 'hour')?.value;
        if (h == null) return NaN;
        return Number.parseInt(h, 10);
    }

    /** Format a Manila wall hour 0–23 as a 12-hour clock string in Asia/Manila. */
    function formatHourClockInManila(hour24) {
        if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return '—';
        const d = new Date(`2020-01-01T${String(hour24).padStart(2, '0')}:00:00+08:00`);
        return new Intl.DateTimeFormat('en-PH', {
            timeZone: INSIGHTS_ACTIVITY_TIME_ZONE,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(d);
    }

    /**
     * @param {unknown[]} entries Same shape as INSIGHTS_ENTRIES (callers typically pass entries with `date`).
     * @returns {number|null} Mode hour 0–23 in Manila, or null if no usable saves.
     */
    function computeMostActiveHour24FromEntries(entries) {
        if (!Array.isArray(entries) || !entries.length) return null;
        const hourBuckets = Array.from({ length: 24 }, () => 0);
        entries.forEach((e) => {
            const raw = e.createdAt || e.created_at || e.date;
            if (!raw) return;
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) return;
            const h = getHourInTimeZone(d, INSIGHTS_ACTIVITY_TIME_ZONE);
            if (Number.isNaN(h) || h < 0 || h > 23) return;
            hourBuckets[h] += 1;
        });
        const totalH = hourBuckets.reduce((a, b) => a + b, 0);
        let peakHour = 0;
        let peakVal = -1;
        hourBuckets.forEach((c, h) => {
            if (c > peakVal) {
                peakVal = c;
                peakHour = h;
            }
        });
        if (totalH > 0 && peakVal > 0) return peakHour;
        return null;
    }

    /** Value for `<input type="time">` (24h HH:mm). */
    function hour24ToTimeInputValue(hour24) {
        if (hour24 == null || !Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return null;
        return `${String(hour24).padStart(2, '0')}:00`;
    }

    global.DiariMostActiveTime = {
        INSIGHTS_ACTIVITY_TIME_ZONE,
        getHourInTimeZone,
        formatHourClockInManila,
        computeMostActiveHour24FromEntries,
        hour24ToTimeInputValue,
    };
})(typeof window !== 'undefined' ? window : globalThis);
