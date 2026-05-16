/**
 * Voice language: English, Filipino/Taglish, or auto-detect (browser + PH timezone).
 */
(function (global) {
    'use strict';

    const STORAGE_KEY = 'diariVoiceLang';

    function normalizeChoice(value) {
        const s = String(value || '')
            .trim()
            .toLowerCase();
        if (s === 'en' || s === 'english') return 'en';
        if (s === 'tl' || s === 'fil' || s === 'tagalog' || s === 'filipino' || s === 'taglish') {
            return 'tl';
        }
        return 'auto';
    }

    function isPhilippinesTimezone() {
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            return /manila/i.test(tz);
        } catch (_) {
            return false;
        }
    }

    function inferFromBrowser() {
        const list = []
            .concat(global.navigator && global.navigator.languages ? global.navigator.languages : [])
            .concat(global.navigator && global.navigator.language ? [global.navigator.language] : []);
        for (let i = 0; i < list.length; i += 1) {
            const l = String(list[i] || '').toLowerCase();
            if (l.startsWith('fil') || l.startsWith('tl')) return 'tl';
        }
        if (isPhilippinesTimezone()) return 'tl';
        for (let j = 0; j < list.length; j += 1) {
            const l2 = String(list[j] || '').toLowerCase();
            if (l2.startsWith('en')) return 'en';
        }
        return 'en';
    }

    function getStoredChoice() {
        try {
            return normalizeChoice(global.localStorage.getItem(STORAGE_KEY));
        } catch (_) {
            return 'auto';
        }
    }

    /** Resolved language for this session: `en` or `tl`. */
    function getVoiceLang() {
        const choice = getStoredChoice();
        if (choice === 'en' || choice === 'tl') return choice;
        return inferFromBrowser();
    }

    function setVoiceLang(choice) {
        try {
            global.localStorage.setItem(STORAGE_KEY, normalizeChoice(choice));
        } catch (_) {}
    }

    function speechRecognitionLang(voiceLang) {
        if (voiceLang === 'tl') {
            return 'fil-PH';
        }
        try {
            const raw = (global.navigator.language || global.navigator.userLanguage || 'en-US')
                .trim()
                .replace(/_/g, '-');
            if (!raw) return 'en-US';
            return raw.length > 40 ? raw.slice(0, 40) : raw;
        } catch (_) {
            return 'en-US';
        }
    }

    /** OpenAI Whisper language token (see whisper tokenizer). */
    function whisperLanguage(voiceLang) {
        return voiceLang === 'tl' ? 'tagalog' : 'english';
    }

    function whisperModelId() {
        return 'Xenova/whisper-tiny';
    }

    function labelFor(voiceLang) {
        return voiceLang === 'tl' ? 'Filipino / Taglish' : 'English';
    }

    global.DiariVoiceLocale = {
        STORAGE_KEY,
        normalizeChoice,
        getStoredChoice,
        getVoiceLang,
        setVoiceLang,
        speechRecognitionLang,
        whisperLanguage,
        whisperModelId,
        labelFor,
    };
})(typeof window !== 'undefined' ? window : globalThis);
