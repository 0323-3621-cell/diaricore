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
