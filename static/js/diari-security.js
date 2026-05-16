/**
 * Shared XSS-safe helpers for user-generated content at render time.
 * Does not modify text before save or mood analysis.
 */
(function (global) {
    'use strict';

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Safe fallback when DiariToast is unavailable — message via textContent, not HTML. */
    function setToastMessage(notificationEl, message) {
        if (!notificationEl) return;
        const span = notificationEl.querySelector('span');
        if (span) span.textContent = String(message ?? '');
    }

    global.DiariSecurity = { escapeHtml, setToastMessage };
})(typeof window !== 'undefined' ? window : globalThis);
