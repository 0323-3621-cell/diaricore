/**
 * PWA-only: offline emotion model download status on Profile (installed app).
 * Hidden in browser tabs (desktop/mobile) — no change to deployed web UX.
 */
(function () {
    'use strict';

    function isPwaStandalone() {
        if (window.DiariPWA && typeof window.DiariPWA.isStandalone === 'function') {
            return window.DiariPWA.isStandalone();
        }
        return (
            document.documentElement.classList.contains('diari-pwa-standalone') ||
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true
        );
    }

    function formatSize(bytes) {
        const n = Math.max(0, Number(bytes) || 0);
        if (n >= 1024 * 1024 * 1024) {
            return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        }
        if (n >= 1024 * 1024) {
            return Math.round(n / (1024 * 1024)) + ' MB';
        }
        if (n >= 1024) {
            return Math.round(n / 1024) + ' KB';
        }
        return n + ' B';
    }

    function bindProfileOfflineModelStatus() {
        if (!isPwaStandalone()) return;

        const root = document.getElementById('pwaOfflineModelStatus');
        if (!root || root.dataset.bound === '1') return;
        root.dataset.bound = '1';
        root.hidden = false;

        const titleEl = root.querySelector('.pwa-offline-model-status__title');
        const barWrap = root.querySelector('.pwa-offline-model-status__bar');
        const barFill = root.querySelector('.pwa-offline-model-status__bar-fill');
        const pctEl = root.querySelector('.pwa-offline-model-status__pct');
        const sizeEl = root.querySelector('.pwa-offline-model-status__size');
        const hintEl = root.querySelector('.pwa-offline-model-status__hint');

        function render(detail) {
            if (!detail) return;

            const phase = detail.phase || 'idle';
            const loaded = Number(detail.loaded) || 0;
            const total = Number(detail.total) || window.DiariEmotionOnnx?.MODEL_BYTES_HINT || 0;
            const pct = Number(detail.percent) || 0;

            root.classList.toggle('is-ready', phase === 'ready');
            root.classList.toggle('is-error', phase === 'error' || phase === 'unavailable');
            root.classList.toggle('is-active', phase === 'downloading' || phase === 'tokenizer' || phase === 'initializing');

            if (titleEl) {
                if (phase === 'ready') {
                    titleEl.textContent = 'Offline emotion model';
                } else if (phase === 'downloading') {
                    titleEl.textContent = 'Downloading offline model';
                } else if (phase === 'tokenizer') {
                    titleEl.textContent = 'Downloading tokenizer';
                } else if (phase === 'initializing') {
                    titleEl.textContent = 'Preparing offline model';
                } else if (phase === 'error') {
                    titleEl.textContent = 'Offline model download failed';
                } else if (phase === 'unavailable') {
                    titleEl.textContent = 'Offline model not downloaded';
                } else {
                    titleEl.textContent = 'Offline emotion model';
                }
            }

            const pctClamped = Math.min(100, Math.max(0, pct));
            if (barFill) {
                barFill.style.width = pctClamped + '%';
            }
            if (barWrap) {
                barWrap.setAttribute('aria-valuenow', String(pctClamped));
            }
            if (pctEl) {
                pctEl.textContent = phase === 'ready' ? '100%' : pct + '%';
            }
            if (sizeEl) {
                if (phase === 'ready') {
                    sizeEl.textContent = formatSize(total) + ' cached';
                } else if (phase === 'downloading' || phase === 'tokenizer') {
                    sizeEl.textContent = formatSize(loaded) + ' / ' + formatSize(total);
                } else if (total > 0) {
                    sizeEl.textContent = 'Up to ' + formatSize(total);
                } else {
                    sizeEl.textContent = '';
                }
            }
            if (hintEl) {
                hintEl.textContent = detail.message || '';
            }
        }

        function refresh() {
            if (window.DiariEmotionOnnx?.getDownloadStatus) {
                render(window.DiariEmotionOnnx.getDownloadStatus());
            }
            if (window.DiariEmotionOnnx?.refreshCachedReadyState) {
                void window.DiariEmotionOnnx.refreshCachedReadyState();
            }
        }

        document.addEventListener('diari-emotion-download', (ev) => {
            render(ev.detail);
        });

        refresh();

        if (window.DiariEmotionOnnx?.prepareInBackground && navigator.onLine !== false) {
            window.DiariEmotionOnnx.prepareInBackground();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindProfileOfflineModelStatus);
    } else {
        bindProfileOfflineModelStatus();
    }
})();
