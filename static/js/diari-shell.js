/**
 * Toast colors from theme.css (soft sage success). Used by entries, login, profile, etc.
 */
(function (w) {
    function readToastColors() {
        try {
            var s = getComputedStyle(document.documentElement);
            return {
                successBg: (s.getPropertyValue('--diari-success-sage-solid').trim() || '#8da399'),
                successFg: (s.getPropertyValue('--diari-success-on-solid').trim() || '#ffffff'),
                errorBg: (s.getPropertyValue('--diari-error-toast-bg').trim() || '#e74c3c'),
                errorFg: '#ffffff',
                warningBg: (s.getPropertyValue('--diari-warning-toast-bg').trim() || '#d9822b'),
                warningFg: '#ffffff',
                infoBg: (s.getPropertyValue('--diari-info-toast-bg').trim() || '#7fa7bf'),
                infoFg: '#ffffff',
            };
        } catch (e) {
            return {
                successBg: '#8da399',
                successFg: '#ffffff',
                errorBg: '#e74c3c',
                errorFg: '#ffffff',
                warningBg: '#d9822b',
                warningFg: '#ffffff',
                infoBg: '#7fa7bf',
                infoFg: '#ffffff',
            };
        }
    }
    function toastBg(type) {
        var c = readToastColors();
        if (type === 'success') return c.successBg;
        if (type === 'error') return c.errorBg;
        if (type === 'warning') return c.warningBg;
        return c.infoBg;
    }
    function toastFg(type) {
        var c = readToastColors();
        if (type === 'success') return c.successFg;
        if (type === 'error') return c.errorFg;
        if (type === 'warning') return c.warningFg;
        return c.infoFg;
    }
    w.DiariToastColors = { get: readToastColors, bg: toastBg, fg: toastFg };
})(typeof window !== 'undefined' ? window : this);

/**
 * Global first-paint shell: pages set <html class="diari-shell-pending"> and mark the
 * primary column with .diari-shell-main, then call DiariShell.release() after localStorage / API hydration.
 * Pages without .diari-shell-main auto-release on DOMContentLoaded (auth-only layouts).
 */
(function () {
    var PENDING = 'diari-shell-pending';
    var READY = 'diari-shell-ready';

    function release() {
        if (!document.documentElement.classList.contains(PENDING)) return;
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                document.documentElement.classList.remove(PENDING);
                if (document.body) document.body.classList.add(READY);
            });
        });
    }

    window.DiariShell = { release: release };

    document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('.diari-shell-main')) {
            release();
        }
    });
})();
