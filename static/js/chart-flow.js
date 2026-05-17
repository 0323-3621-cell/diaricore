/**
 * Chart element animations (line, pie, bar) + container shimmer.
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
        return styles.getPropertyValue('--primary-rgb').trim() || '111, 143, 127';
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
            phase += 0.022;
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

    /** Build a canvas path through visible line points. */
    function traceLinePath(ctx, pts) {
        if (!pts.length) return false;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
        }
        return true;
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

            const rgb = readPrimaryRgb(chart);
            const accent = primaryColor(chart);
            const moodColors = chart._diariMoodPointColors;

            ctx.save();
            traceLinePath(ctx, pts);

            if (pts.length >= 2) {
                const breathe = 0.92 + 0.08 * (0.5 + 0.5 * Math.sin(phase * 1.1));
                ctx.strokeStyle = `rgba(${rgb}, ${0.12 * breathe})`;
                ctx.lineWidth = 7;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.setLineDash([]);
                ctx.stroke();

                const travel = (phase * 42) % 120;
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 + 0.1 * Math.sin(phase * 2)})`;
                ctx.lineWidth = 3.2;
                ctx.setLineDash([14, 106]);
                ctx.lineDashOffset = -travel;
                ctx.stroke();

                ctx.strokeStyle = accent;
                ctx.globalAlpha = 0.35 + 0.2 * (0.5 + 0.5 * Math.sin(phase * 1.8));
                ctx.lineWidth = 2.6;
                ctx.setLineDash([10, 110]);
                ctx.lineDashOffset = -travel - 18;
                ctx.stroke();
            }
            ctx.restore();

            pts.forEach((pt, i) => {
                const fill = (moodColors && moodColors[pt.index ?? i]) || accent;
                const pulse = 0.5 + 0.5 * Math.sin(phase * 1.4 + i * 0.75);
                const haloR = 9 + pulse * 3.5;
                const ringR = 5.8 + pulse * 1.2;

                ctx.save();
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, haloR, 0, Math.PI * 2);
                ctx.fillStyle = fill;
                ctx.globalAlpha = 0.08 + 0.1 * pulse;
                ctx.fill();
                ctx.restore();

                ctx.save();
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, ringR, 0, Math.PI * 2);
                ctx.strokeStyle = fill;
                ctx.globalAlpha = 0.35 + 0.35 * pulse;
                ctx.lineWidth = 1.6;
                ctx.stroke();
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
                const baseColor = Array.isArray(ds.backgroundColor)
                    ? ds.backgroundColor[0]
                    : ds.backgroundColor;

                meta.data.forEach((bar, i) => {
                    if (!bar || bar.height < 2) return;

                    const x = bar.x;
                    const y = bar.y;
                    const w = bar.width;
                    const h = bar.height;
                    const wave = 0.5 + 0.5 * Math.sin(phase * 1.35 + i * 0.55 + di * 0.4);
                    const sweepY = y + h * ((phase * 0.35 + i * 0.12 + di * 0.08) % 1);

                    ctx.save();
                    const grad = ctx.createLinearGradient(x, y, x, y + h);
                    grad.addColorStop(0, `rgba(255, 255, 255, ${0.02 + wave * 0.14})`);
                    grad.addColorStop(Math.max(0, (sweepY - y) / h - 0.12), 'rgba(255, 255, 255, 0)');
                    grad.addColorStop(Math.min(1, (sweepY - y) / h), `rgba(255, 255, 255, ${0.18 + wave * 0.2})`);
                    grad.addColorStop(Math.min(1, (sweepY - y) / h + 0.08), 'rgba(255, 255, 255, 0)');
                    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(x - w / 2, y, w, h);
                    ctx.restore();

                    const capH = Math.min(5, h * 0.22);
                    ctx.save();
                    ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + wave * 0.22})`;
                    ctx.beginPath();
                    const r = Math.min(4, w / 4);
                    const left = x - w / 2;
                    const right = x + w / 2;
                    const top = y;
                    ctx.moveTo(left + r, top);
                    ctx.lineTo(right - r, top);
                    ctx.quadraticCurveTo(right, top, right, top + r);
                    ctx.lineTo(right, top + capH);
                    ctx.lineTo(left, top + capH);
                    ctx.lineTo(left, top + r);
                    ctx.quadraticCurveTo(left, top, left + r, top);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();

                    if (baseColor && h > 8) {
                        ctx.save();
                        ctx.strokeStyle = baseColor;
                        ctx.globalAlpha = 0.2 + 0.15 * wave;
                        ctx.lineWidth = 1.2;
                        ctx.strokeRect(x - w / 2 + 0.5, y + 0.5, w - 1, h - 1);
                        ctx.restore();
                    }
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

            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            if (!meta?.data?.length) return;

            meta.data.forEach((arc, i) => {
                if (!arc || arc.circumference <= 0) return;

                const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc;
                const ds = chart.data.datasets[0];
                const colors = ds?.backgroundColor;
                const sliceColor = Array.isArray(colors) ? colors[i] : colors;
                if (!sliceColor) return;

                const pulse = 0.5 + 0.5 * Math.sin(phase * 1.25 + i * 0.95);
                const expand = 1 + 0.035 * pulse;
                const mid = (startAngle + endAngle) / 2;

                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, outerRadius * expand, startAngle, endAngle);
                ctx.arc(x, y, innerRadius, endAngle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = sliceColor;
                ctx.globalAlpha = 0.07 + 0.09 * pulse;
                ctx.fill();
                ctx.restore();

                const edgeR = outerRadius * (1 + 0.02 * pulse);
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, edgeR, startAngle + 0.02, endAngle - 0.02);
                ctx.strokeStyle = sliceColor;
                ctx.lineWidth = 2.2;
                ctx.globalAlpha = 0.25 + 0.35 * pulse;
                ctx.lineCap = 'round';
                ctx.stroke();
                ctx.restore();

                const hx = x + Math.cos(mid) * outerRadius * 0.62;
                const hy = y + Math.sin(mid) * outerRadius * 0.62;
                ctx.save();
                ctx.beginPath();
                ctx.arc(hx, hy, 3 + pulse * 2, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = 0.08 + 0.12 * pulse;
                ctx.fill();
                ctx.restore();
            });
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

    function enhanceSparklineSvg(innerHtml, hasLine, lineColor, chartTheme) {
        if (prefersReducedMotion() || !hasLine) return innerHtml;

        const stroke = lineColor || '#6F8F7F';
        const border = chartTheme?.pointBorder || '#ffffff';
        let html = innerHtml;

        html = html.replace(
            /<path d="([^"]+)" fill="url\(#dashMoodFill\)"><\/path>/,
            '<path class="weekly-sparkline-area weekly-sparkline-area--flow" d="$1" fill="url(#dashMoodFill)"></path>'
        );

        html = html.replace(
            /<path d="([^"]+)" fill="none" stroke="([^"]+)" stroke-width="2\.4" stroke-linecap="round" stroke-linejoin="round"><\/path>/,
            [
                '<path class="weekly-sparkline-line" d="$1" fill="none" stroke="$2" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>',
                `<path class="weekly-sparkline-line-glow" d="$1" fill="none" stroke="$2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.35" pathLength="100" stroke-dasharray="12 88"><animate attributeName="stroke-dashoffset" values="0;-100" dur="2.9s" repeatCount="indefinite"/></path>`,
                `<path class="weekly-sparkline-line-shine" d="$1" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="6 94"><animate attributeName="stroke-dashoffset" values="-20;-120" dur="2.9s" repeatCount="indefinite"/></path>`,
            ].join('')
        );

        html = html.replace(
            /<circle cx="([^"]+)" cy="([^"]+)" r="5" fill="([^"]+)" stroke="([^"]+)" stroke-width="1\.4"><\/circle>/g,
            [
                '<g class="weekly-sparkline-dot">',
                '<circle class="weekly-sparkline-dot-halo" cx="$1" cy="$2" r="9" fill="$3" opacity="0.2">',
                '<animate attributeName="r" values="8;11;8" dur="2.4s" repeatCount="indefinite"/>',
                '<animate attributeName="opacity" values="0.12;0.32;0.12" dur="2.4s" repeatCount="indefinite"/>',
                '</circle>',
                '<circle class="weekly-sparkline-dot-ring" cx="$1" cy="$2" r="6.5" fill="none" stroke="$3" stroke-width="1.5" opacity="0.5">',
                '<animate attributeName="r" values="6;7.5;6" dur="2.4s" repeatCount="indefinite"/>',
                '</circle>',
                `<circle class="weekly-sparkline-dot-core" cx="$1" cy="$2" r="5" fill="$3" stroke="${border}" stroke-width="1.4"></circle>`,
                '</g>',
            ].join('')
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
