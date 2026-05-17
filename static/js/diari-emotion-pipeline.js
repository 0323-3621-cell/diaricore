/**
 * DiariCore emotion post-processing — mirrors hf_space/app.py / onnx_nlp.py exactly.
 * Used by browser ONNX offline path only; online still uses Hugging Face Space API.
 */
(function (global) {
    'use strict';

    const ALLOWED_LABELS = ['angry', 'anxious', 'happy', 'neutral', 'sad'];

    const CALIBRATION = {
        angry: 1.4,
        sad: 1.3,
        neutral: 1.35,
        happy: 0.75,
        anxious: 0.7,
    };

    const CONFIDENCE_THRESHOLD = 0.45;
    const MIN_KEYWORD_HITS = 2;

    const KEYWORD_SIGNALS = {
        sad: {
            en: [
                'grief', 'grieving', 'mourning', 'lost someone', 'passed away',
                'lonely', 'alone again', 'no one', 'empty inside', 'hollow',
                'crying', 'sobbing', 'heartbroken', 'broke my heart',
                'i miss you', 'i miss them', 'i miss her', 'i miss him',
                'namimiss kita', 'namimiss ko siya',
            ],
            tl: [
                'malungkot', 'lungkot', 'nalulungkot', 'umiiyak', 'umiyak',
                'nag-iisa', 'mag-isa', 'nawala', 'nawalan', 'nawala na',
                'hindi ko na mababawi', 'hindi na babalik',
            ],
        },
        anxious: {
            en: [
                'what if', 'what will happen', 'scared of', 'afraid of',
                'worried about', 'i keep worrying', 'cant stop worrying',
                "can't stop worrying", 'heart racing', 'cant breathe',
                "can't breathe", 'panic', 'panicking', 'anxious about',
                'overthinking', 'overthought', 'dreading', 'terrified of',
                'nervous about',
            ],
            tl: [
                'nababahala', 'nag-aalala', 'natatakot', 'kabado', 'kinakabahan',
                'hindi makatulog', 'di makatulog', 'di mapakali', 'hindi mapakali',
                'palagi akong nag-iisip', 'hindi ko maiwasang mag-isip',
            ],
        },
    };

    const AMBIGUOUS_WORDS = new Set([
        'miss', 'feel', 'think', 'sad', 'happy', 'angry', 'bad', 'good',
        'okay', 'ok', 'fine', 'lost', 'hard', 'difficult', 'tired', 'pagod',
    ]);

    function deriveSentiment(label) {
        if (label === 'happy') return 'positive';
        if (label === 'angry' || label === 'anxious' || label === 'sad') return 'negative';
        return 'neutral';
    }

    function softmax(logits) {
        const arr = Array.from(logits);
        const max = Math.max(...arr);
        const exp = arr.map((v) => Math.exp(v - max));
        const sum = exp.reduce((a, b) => a + b, 0) || 1;
        return exp.map((v) => v / sum);
    }

    function rawProbsFromLogits(logits) {
        const probs = softmax(logits);
        const raw = {};
        ALLOWED_LABELS.forEach((lbl, i) => {
            raw[lbl] = probs[i];
        });
        return raw;
    }

    function applyCalibration(raw) {
        const cal = {};
        ALLOWED_LABELS.forEach((lbl) => {
            cal[lbl] = (raw[lbl] || 0) * (CALIBRATION[lbl] || 1);
        });
        const total = ALLOWED_LABELS.reduce((s, lbl) => s + cal[lbl], 0) || 1;
        const out = {};
        ALLOWED_LABELS.forEach((lbl) => {
            out[lbl] = Math.round((cal[lbl] / total) * 1e6) / 1e6;
        });
        return out;
    }

    function keywordScore(text) {
        const t = text.toLowerCase();
        const scores = { sad: 0, anxious: 0 };
        Object.keys(KEYWORD_SIGNALS).forEach((emotion) => {
            Object.values(KEYWORD_SIGNALS[emotion]).forEach((kws) => {
                kws.forEach((kw) => {
                    if (AMBIGUOUS_WORDS.has(kw.trim())) return;
                    if (t.includes(kw)) scores[emotion] += 1;
                });
            });
        });
        return scores;
    }

    function applyKeywordLayer(text, primary, prob) {
        if (prob >= CONFIDENCE_THRESHOLD) {
            return { label: primary, prob, overridden: false, reason: null };
        }
        if (primary !== 'sad' && primary !== 'anxious') {
            return { label: primary, prob, overridden: false, reason: null };
        }
        const scores = keywordScore(text);
        const best = scores.sad >= scores.anxious ? (scores.sad > scores.anxious ? 'sad' : 'anxious') : 'anxious';
        const hits = scores[best];
        if (hits < MIN_KEYWORD_HITS || scores.sad === scores.anxious) {
            return { label: primary, prob, overridden: false, reason: null };
        }
        if (best !== primary) {
            return {
                label: best,
                prob,
                overridden: true,
                reason: `keyword override: '${best}' signals=${hits} vs '${primary}' signals=${scores[primary] || 0}`,
            };
        }
        return { label: primary, prob, overridden: false, reason: null };
    }

    function analyzeFromLogits(text, logits) {
        const clean = (text || '').trim();
        if (!clean) {
            return fallback(clean);
        }

        const raw = rawProbsFromLogits(logits);
        const all_probs = applyCalibration(raw);
        const ranked = ALLOWED_LABELS.map((lbl) => [lbl, all_probs[lbl]]).sort((a, b) => b[1] - a[1]);
        const primary_label = ranked[0][0];
        const primary_prob = ranked[0][1];
        const secondary_label = ranked[1][1] >= 0.15 ? ranked[1][0] : null;

        const kw = applyKeywordLayer(clean, primary_label, primary_prob);
        const final_label = kw.label;
        const final_prob = kw.prob;

        return {
            sentimentLabel: deriveSentiment(final_label),
            sentimentScore: Math.round(final_prob * 10000) / 10000,
            emotionLabel: final_label,
            emotionScore: Math.round(final_prob * 10000) / 10000,
            feeling: final_label,
            all_probs,
            secondaryMood: secondary_label,
            keywordOverride: kw.overridden,
            engine: 'onnx-browser',
            moodScoringOffline: false,
        };
    }

    function fallback(text) {
        const t = (text || '').toLowerCase();
        const neg = ['sad', 'galit', 'angry', 'anxious', 'stress', 'pagod', 'tired', 'iyak', 'malungkot', 'natatakot'].some(
            (w) => t.includes(w)
        );
        const pos = ['happy', 'masaya', 'grateful', 'salamat', 'excited', 'calm', 'peace', 'okay'].some((w) =>
            t.includes(w)
        );
        let emo = 'neutral';
        if (pos && !neg) emo = 'happy';
        else if (neg && !pos) emo = 'sad';

        const raw = {};
        ALLOWED_LABELS.forEach((lbl) => {
            raw[lbl] = 0;
        });
        raw[emo] = 0.62;
        const all_probs = applyCalibration(raw);
        const best = ALLOWED_LABELS.reduce((a, b) => (all_probs[a] >= all_probs[b] ? a : b));

        return {
            sentimentLabel: deriveSentiment(best),
            sentimentScore: all_probs[best],
            emotionLabel: best,
            emotionScore: all_probs[best],
            feeling: best,
            all_probs,
            engine: 'fallback',
            moodScoringOffline: true,
        };
    }

    global.DiariEmotionPipeline = {
        ALLOWED_LABELS,
        analyzeFromLogits,
        fallback,
        applyCalibration,
        rawProbsFromLogits,
    };
})(typeof window !== 'undefined' ? window : self);
