/**
 * Continuous ambient motion for dashboard SVG sparklines and Chart.js graphs.
 * Respects prefers-reduced-motion.
 */
(function () {
    'use strict';

    function prefersReducedMotion() {
        return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    const activeLoops = new WeakMap();

    function readPrimaryRgb(chart) {
        const styles = getComputedStyle(document.documentElement);
        const raw = styles.getPropertyValue('--primary-rgb').trim() || '111, 143, 127';
        return raw;
    }

    function primaryColor(chart) {
        const styles = getComputedStyle(document.documentElement);
        return styles.getPropertyValue('--primary-color').trim() || '#6F8F7F';
    }

    function stopChartFlow(chart) {
        const stop = activeLoops.get(chart);
        if (stop) {
            stop();
            activeLoops.delete(chart);
        }
        delete chart._diariFlowPhase;
    }

    function startChartFlow(chart) {
        if (!chart || prefersReducedMotion() || activeLoops.has(chart)) return;
        let phase = 0;
        let raf = 0;
        const tick = () => {
            phase += 0.02;
            chart._diariFlowPhase = phase;
            chart.draw();
            raf = requestAnimationFrame(tick);
        };
        activeLoops.set(chart, () => {
            cancelAnimationFrame(raf);
        });
        raf = requestAnimationFrame(tick);
    }

    function bindChart(chart) {
        if (!chart || prefersReducedMotion()) return;
        registerChartJsPlugins();
        stopChartFlow(chart);
        startChartFlow(chart);
    }

    function getLoadAnimation() {
        if (prefersReducedMotion()) return false;
        return { duration: 880, easing: 'easeOutQuart' };
    }

    const diariLineFlowOverlay = {
        id: 'diariLineFlowOverlay',
        afterDatasetsDraw(chart) {
            if (prefersReducedMotion() || chart.config.type !== 'line') return;
            const phase = chart._diariFlowPhase;
            if (phase == null) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta?.data?.length) return;

            const ctx = chart.ctx;
            const pts = meta.data.filter((pt) => pt && !pt.skip && pt.parsed?.y != null);
            if (pts.length < 1) return;

            ctx.save();
            ctx.beginPath();
            let started = false;
            pts.forEach((pt) => {
                if (!started) {
                    ctx.moveTo(pt.x, pt.y);
                    started = true;
                } else {
                    ctx.lineTo(pt.x, pt.y);
                }
            });
            if (started && pts.length >= 2) {
                ctx.strokeStyle = primaryColor(chart);
                ctx.lineWidth = 2.2;
                ctx.globalAlpha = 0.28 + 0.14 * Math.sin(phase * 1.6);
                ctx.setLineDash([7, 9]);
                ctx.lineDashOffset = -(phase * 14);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();
            }
            ctx.restore();

            const moodColors = chart._diariMoodPointColors;
            pts.forEach((pt, i) => {
                const fill = (moodColors && moodColors[pt.index ?? i]) || primaryColor(chart);
                const glow = 7 + Math.sin(phase + i * 0.85) * 2.2;
                ctx.save();
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, glow, 0, Math.PI * 2);
                ctx.fillStyle = fill;
                ctx.globalAlpha = 0.1 + 0.07 * (0.5 + 0.5 * Math.sin(phase + i * 0.7));
                ctx.fill();
                ctx.restore();
            });
        },
    };

    const diariBarFlowOverlay = {
        id: 'diariBarFlowOverlay',
        afterDatasetsDraw(chart) {
            if (prefersReducedMotion() || chart.config.type !== 'bar') return;
            const phase = chart._diariFlowPhase;
            if (phase == null) return;
            const ctx = chart.ctx;
            chart.data.datasets.forEach((ds, di) => {
                const meta = chart.getDatasetMeta(di);
                if (!meta?.data) return;
                meta.data.forEach((bar, i) => {
                    if (!bar || bar.height < 1) return;
                    const shimmer = 0.05 + 0.12 * (0.5 + 0.5 * Math.sin(phase + i * 0.62 + di * 0.35));
                    ctx.save();
                    ctx.fillStyle = `rgba(255, 255, 255, ${shimmer})`;
                    ctx.fillRect(bar.x - bar.width / 2, bar.y, bar.width, bar.height);
                    ctx.restore();
                });
            });
        },
    };

    const diariPieFlowOverlay = {
        id: 'diariPieFlowOverlay',
        afterDraw(chart) {
            if (prefersReducedMotion()) return;
            const t = chart.config.type;
            if (t !== 'pie' && t !== 'doughnut') return;
            const phase = chart._diariFlowPhase;
            if (phase == null) return;
            const { left, right, top, bottom } = chart.chartArea || {};
            if (right <= left || bottom <= top) return;

            const cx = (left + right) / 2;
            const cy = (top + bottom) / 2;
            const r = (Math.min(right - left, bottom - top) / 2) * 0.92;
            const rgb = readPrimaryRgb(chart);
            const ctx = chart.ctx;
            const pulse = 0.07 + 0.06 * (0.5 + 0.5 * Math.sin(phase * 1.2));

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, r * (0.55 + 0.06 * Math.sin(phase)), 0, Math.PI * 2);
            const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
            g.addColorStop(0, `rgba(${rgb}, ${pulse})`);
            g.addColorStop(1, `rgba(${rgb}, 0)`);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.restore();
        },
    };

    function registerChartJsPlugins() {
        if (typeof Chart === 'undefined' || Chart._diariFlowRegistered) return;
        Chart.register(diariLineFlowOverlay, diariBarFlowOverlay, diariPieFlowOverlay);
        Chart._diariFlowRegistered = true;
    }

    function markSparklineWrap(wrapEl) {
        if (!wrapEl || prefersReducedMotion()) return;
        wrapEl.classList.add('weekly-sparkline-wrap--flow');
    }

    function enhanceSparklineSvg(innerHtml, hasLine) {
        if (prefersReducedMotion() || !hasLine) return innerHtml;
        let html = innerHtml;
        html = html.replace(
            /<path d="([^"]+)" fill="url\(#dashMoodFill\)"><\/path>/,
            '<path class="weekly-sparkline-area weekly-sparkline-area--flow" d="$1" fill="url(#dashMoodFill)"></path>'
        );
        html = html.replace(
            /<path d="([^"]+)" fill="none" stroke="([^"]+)" stroke-width="2\.4"([^>]*)><\/path>/,
            '<path class="weekly-sparkline-line weekly-sparkline-line--flow" d="$1" fill="none" stroke="$2" stroke-width="2.4"$3><animate attributeName="stroke-dashoffset" values="0;-34" dur="2.6s" repeatCount="indefinite"/></path>'
        );
        html = html.replace(
            /<circle cx="([^"]+)" cy="([^"]+)" r="5" fill="([^"]+)" stroke="([^"]+)" stroke-width="1\.4"><\/circle>/g,
            '<circle class="weekly-sparkline-dot weekly-sparkline-dot--flow" cx="$1" cy="$2" r="5" fill="$3" stroke="$4" stroke-width="1.4"><animate attributeName="r" values="5;6.3;5" dur="2.4s" repeatCount="indefinite"/></circle>'
        );
        return html;
    }

    function decorateChartContainers(root) {
        if (prefersReducedMotion()) return;
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('.chart-card .chart-container, .weekly-sparkline-wrap').forEach((el) => {
            el.classList.add('chart-container--flow');
        });
    }

    window.DiariChartFlow = {
        prefersReducedMotion,
        registerChartJsPlugins,
        bindChart,
        stopChartFlow,
        getLoadAnimation,
        markSparklineWrap,
        enhanceSparklineSvg,
        decorateChartContainers,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => decorateChartContainers(document));
    } else {
        decorateChartContainers(document);
    }
})();
