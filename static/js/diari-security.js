/**
 * Shared XSS-safe helpers and same-origin API fetch (session cookie + CSRF).
 * Does not modify text before save or mood analysis.
 */
(function (global) {
    'use strict';

    const CSRF_STORAGE_KEY = 'diariCoreCsrf';

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setToastMessage(notificationEl, message) {
        if (!notificationEl) return;
        const span = notificationEl.querySelector('span');
        if (span) span.textContent = String(message ?? '');
    }

    function getCsrfToken() {
        try {
            return sessionStorage.getItem(CSRF_STORAGE_KEY) || '';
        } catch (_) {
            return '';
        }
    }

    function setCsrfToken(token) {
        try {
            if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, String(token));
            else sessionStorage.removeItem(CSRF_STORAGE_KEY);
        } catch (_) {}
    }

    function clearCsrfToken() {
        setCsrfToken('');
    }

    /** Drop journal cache so a new login/signup never shows another account's data. */
    function clearUserScopedLocalData() {
        try {
            [
                'diariCoreEntries',
                'diariCoreEntriesOwnerId',
                'diariCoreDraft',
                'diariCoreFocusEntryId',
            ].forEach((key) => localStorage.removeItem(key));
        } catch (_) {
            /* ignore */
        }
    }

    function isApiMutation(url, method) {
        const m = String(method || 'GET').toUpperCase();
        if (m === 'GET' || m === 'HEAD') return false;
        const u = typeof url === 'string' ? url : url && url.url ? url.url : '';
        return typeof u === 'string' && u.indexOf('/api/') === 0;
    }

    const nativeFetch = global.fetch ? global.fetch.bind(global) : null;

    function apiFetch(input, init) {
        if (!nativeFetch) {
            return Promise.reject(new Error('fetch is not available'));
        }
        const opts = init ? Object.assign({}, init) : {};
        if (!opts.credentials) opts.credentials = 'same-origin';
        const method = opts.method || 'GET';
        if (isApiMutation(input, method)) {
            const headers = new Headers(opts.headers || {});
            const csrf = getCsrfToken();
            if (csrf) headers.set('X-CSRF-Token', csrf);
            opts.headers = headers;
        }
        return nativeFetch(input, opts);
    }

    if (nativeFetch && !global.__diariFetchPatched) {
        global.__diariFetchPatched = true;
        global.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : input && input.url;
            if (typeof url === 'string' && url.indexOf('/api/') === 0) {
                return apiFetch(input, init);
            }
            return nativeFetch(input, init);
        };
    }

    function apiGet(url) {
        return apiFetch(url, { method: 'GET', credentials: 'same-origin' });
    }

    global.DiariSecurity = {
        escapeHtml,
        setToastMessage,
        getCsrfToken,
        setCsrfToken,
        clearCsrfToken,
        clearUserScopedLocalData,
        apiFetch,
        apiGet,
    };
})(typeof window !== 'undefined' ? window : globalThis);
