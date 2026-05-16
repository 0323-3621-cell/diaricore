/**
 * Shared XSS-safe HTML escaping for user-generated content at render time.
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

    global.DiariSecurity = { escapeHtml };
})(typeof window !== 'undefined' ? window : globalThis);
