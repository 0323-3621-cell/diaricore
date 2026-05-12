/**
 * Shared mood → numeric scale for charts and summaries.
 *
 * Path A (distribution): weighted average of anchors using model `all_probs` softmax
 * when the browser is online and the entry is not marked as offline-only scoring.
 *
 * Path B (label fallback): `feelingToScore(resolveEntryFeeling(entry))` when offline,
 * when `all_probs` is missing/empty, or when the entry was saved without server analysis.
 *
 * `emotionScore` alone is class confidence, not valence — not used as a 0–10 mood line.
 */
(function () {
    'use strict';

    /** Browser reports no network — use label-only scoring even if stale `all_probs` exists. */
    function isBrowserOffline() {
        return typeof navigator !== 'undefined' && navigator.onLine === false;
    }

    /** Client-only / failed-save rows: never use distribution. */
    function isEntryOfflineScoring(entry) {
        return Boolean(entry?.moodScoringOffline);
    }

    function feelingToScore(feelingRaw) {
        const feeling = String(feelingRaw || '').toLowerCase();
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
            angry: 2.8,
        };
        return scoreMap[feeling] ?? 6;
    }

    function resolveEntryFeeling(entry) {
        const feeling = String(entry?.feeling || entry?.emotionLabel || '').toLowerCase();
        if (feeling && feeling !== 'unspecified') return feeling;
        const sentiment = String(entry?.sentimentLabel || '').toLowerCase();
        if (sentiment === 'positive') return 'happy';
        if (sentiment === 'negative') return 'stressed';
        return 'neutral';
    }

    function clamp01(x) {
        const n = Number(x);
        if (!Number.isFinite(n)) return null;
        return Math.min(1, Math.max(0, n));
    }

    /**
     * Expected valence on ~0–10 from model class probabilities (softmax).
     * Each class is weighted by the same table used for label-only scores.
     */
    function expectedMoodScoreFromAllProbs(allProbs) {
        if (!allProbs || typeof allProbs !== 'object') return null;
        let num = 0;
        let den = 0;
        Object.keys(allProbs).forEach((k) => {
            const p = clamp01(allProbs[k]);
            if (p == null || p <= 0) return;
            const w = feelingToScore(String(k).toLowerCase());
            den += p;
            num += p * w;
        });
        if (den <= 0) return null;
        const v = num / den;
        return Math.min(10, Math.max(0, v));
    }

    /**
     * Single 0–10 mood score for an entry for aggregation / sparklines.
     * Path A vs B is chosen automatically from connectivity + entry metadata.
     */
    function entryMoodScore10(entry) {
        if (isBrowserOffline() || isEntryOfflineScoring(entry)) {
            return feelingToScore(resolveEntryFeeling(entry));
        }
        const fromProbs = expectedMoodScoreFromAllProbs(entry?.all_probs);
        if (fromProbs != null) return fromProbs;
        return feelingToScore(resolveEntryFeeling(entry));
    }

    window.feelingToScore = feelingToScore;
    window.resolveEntryFeeling = resolveEntryFeeling;
    window.entryMoodScore10 = entryMoodScore10;
})();
