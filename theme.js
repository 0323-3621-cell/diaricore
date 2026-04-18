(function () {
    const STORAGE_KEY = 'diariCoreTheme';
    const PALETTE_KEY = 'diariCorePalette';
    const DARK_CLASS = 'theme-dark';
    const FAB_ID = 'diariThemeToggleFab';
    const PALETTES = [
        { id: 'theme-1', name: 'Soft Sage Green', primary: '#6F8F7F' },
        { id: 'theme-2', name: 'Lavender Purple', primary: '#8E7CB5' },
        { id: 'theme-3', name: 'Sky Blue', primary: '#6F9BB8' },
        { id: 'theme-4', name: 'Warm Peach', primary: '#D89A82' },
        { id: 'theme-5', name: 'Aqua Teal', primary: '#4FAFB0' },
        { id: 'theme-6', name: 'Sand Beige', primary: '#B5957E' },
        { id: 'theme-7', name: 'Rose Quartz', primary: '#BC7E97' },
        { id: 'theme-8', name: 'Mint Green', primary: '#6FAF9B' },
        { id: 'theme-9', name: 'Mauve Pink', primary: '#A97B95' },
        { id: 'theme-10', name: 'Sage Gray', primary: '#7F9393' },
    ];

    function getSavedTheme() {
        const raw = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
        return raw === 'dark' ? 'dark' : 'light';
    }

    function getPaletteById(id) {
        return PALETTES.find((p) => p.id === id) || PALETTES[0];
    }

    function getSavedPaletteId() {
        const raw = (localStorage.getItem(PALETTE_KEY) || '').toLowerCase();
        return getPaletteById(raw).id;
    }

    function hexToRgb(hex) {
        const safe = (hex || '').replace('#', '').trim();
        if (safe.length !== 6) return { r: 140, g: 185, b: 184 };
        return {
            r: Number.parseInt(safe.slice(0, 2), 16),
            g: Number.parseInt(safe.slice(2, 4), 16),
            b: Number.parseInt(safe.slice(4, 6), 16),
        };
    }

    function shade(hex, percent) {
        const { r, g, b } = hexToRgb(hex);
        const factor = Math.max(-1, Math.min(1, percent));
        const apply = (v) => {
            const next = factor >= 0 ? v + (255 - v) * factor : v * (1 + factor);
            return Math.max(0, Math.min(255, Math.round(next)));
        };
        const rr = apply(r).toString(16).padStart(2, '0');
        const gg = apply(g).toString(16).padStart(2, '0');
        const bb = apply(b).toString(16).padStart(2, '0');
        return `#${rr}${gg}${bb}`;
    }

    function applyPaletteById(paletteId) {
        const palette = getPaletteById(paletteId);
        const root = document.documentElement;
        const primary = palette.primary;
        const primaryHover = shade(primary, -0.12);
        const primaryLight = shade(primary, 0.12);
        const accent = shade(primary, 0.22);
        const darkPrimary = shade(primary, 0.08);
        const darkPrimaryHover = shade(primary, -0.05);
        const darkPrimaryLight = shade(primary, 0.22);

        root.style.setProperty('--primary-color', primary);
        root.style.setProperty('--primary-hover', primaryHover);
        root.style.setProperty('--primary-light', primaryLight);
        root.style.setProperty('--accent-green', accent);
        root.style.setProperty('--theme-dark-primary', darkPrimary);
        root.style.setProperty('--theme-dark-primary-hover', darkPrimaryHover);
        root.style.setProperty('--theme-dark-primary-light', darkPrimaryLight);

        const currentName = document.querySelector('[data-theme-palette-name]');
        if (currentName) currentName.textContent = palette.name;

        const currentSwatch = document.querySelector('[data-theme-palette-swatch]');
        if (currentSwatch) currentSwatch.style.background = palette.primary;

        document.querySelectorAll('[data-theme-palette]').forEach((btn) => {
            const isActive = btn.getAttribute('data-theme-palette') === palette.id;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        window.dispatchEvent(
            new CustomEvent('diari-palette-changed', {
                detail: {
                    paletteId: palette.id,
                    paletteName: palette.name,
                    primaryColor: palette.primary,
                },
            })
        );
    }

    function applyTheme(theme) {
        const isDark = theme === 'dark';
        document.documentElement.classList.toggle(DARK_CLASS, isDark);
        if (document.body) {
            document.body.classList.toggle(DARK_CLASS, isDark);
        }
    }

    function setTheme(theme) {
        const nextTheme = theme === 'dark' ? 'dark' : 'light';
        localStorage.setItem(STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        syncFabState(nextTheme);
        syncToggleState();
        window.dispatchEvent(new CustomEvent('diari-theme-changed', { detail: { theme: nextTheme } }));
    }

    function setPalette(paletteId) {
        const nextPalette = getPaletteById(paletteId);
        localStorage.setItem(PALETTE_KEY, nextPalette.id);
        applyPaletteById(nextPalette.id);
    }

    function syncToggleState() {
        const toggle = document.getElementById('toggleDarkMode');
        if (!toggle) return;
        toggle.checked = document.documentElement.classList.contains(DARK_CLASS);
    }

    function syncFabState(theme) {
        const fab = document.getElementById(FAB_ID);
        if (!fab) return;
        const isDark = theme === 'dark';
        fab.setAttribute('data-theme', isDark ? 'dark' : 'light');
        fab.setAttribute(
            'aria-label',
            isDark ? 'Switch to light mode' : 'Switch to dark mode'
        );
        fab.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    function createThemeToggleFab() {
        if (!document.body || document.getElementById(FAB_ID)) return;

        const fab = document.createElement('button');
        fab.type = 'button';
        fab.id = FAB_ID;
        fab.className = 'theme-toggle-fab';
        fab.innerHTML = `
            <span class="theme-toggle-fab__icon theme-toggle-fab__icon--sun" aria-hidden="true">☀</span>
            <span class="theme-toggle-fab__icon theme-toggle-fab__icon--moon" aria-hidden="true">🌙</span>
        `;

        fab.addEventListener('click', function () {
            const current = document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light';
            setTheme(current === 'dark' ? 'light' : 'dark');
        });

        document.body.appendChild(fab);
        syncFabState(getSavedTheme());
    }

    function bindPaletteButtons() {
        const paletteButtons = document.querySelectorAll('[data-theme-palette]');
        if (!paletteButtons.length) return;

        paletteButtons.forEach((btn) => {
            if (btn.dataset.paletteBound === '1') return;
            btn.dataset.paletteBound = '1';
            btn.addEventListener('click', function () {
                const paletteId = this.getAttribute('data-theme-palette');
                if (!paletteId) return;
                setPalette(paletteId);
                const panel = document.getElementById('themePalettePanel');
                const toggleBtn = document.getElementById('themePaletteToggle');
                if (panel && toggleBtn) {
                    panel.hidden = true;
                    toggleBtn.setAttribute('aria-expanded', 'false');
                }
            });
        });
    }

    function bindPalettePanelToggle() {
        const toggleBtn = document.getElementById('themePaletteToggle');
        const panel = document.getElementById('themePalettePanel');
        if (!toggleBtn || !panel || toggleBtn.dataset.bound === '1') return;
        toggleBtn.dataset.bound = '1';

        toggleBtn.addEventListener('click', function () {
            const nextOpen = panel.hidden;
            panel.hidden = !nextOpen;
            toggleBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        });

        document.addEventListener('click', function (event) {
            if (panel.hidden) return;
            if (panel.contains(event.target) || toggleBtn.contains(event.target)) return;
            panel.hidden = true;
            toggleBtn.setAttribute('aria-expanded', 'false');
        });
    }

    // Apply immediately to reduce theme flicker.
    applyTheme(getSavedTheme());
    applyPaletteById(getSavedPaletteId());

    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(getSavedTheme());
        applyPaletteById(getSavedPaletteId());
        createThemeToggleFab();
        bindPaletteButtons();
        bindPalettePanelToggle();
        syncToggleState();
    });

    window.addEventListener('storage', function (event) {
        if (event.key === STORAGE_KEY) {
            const nextTheme = getSavedTheme();
            applyTheme(nextTheme);
            syncFabState(nextTheme);
            syncToggleState();
            return;
        }
        if (event.key === PALETTE_KEY) {
            applyPaletteById(getSavedPaletteId());
        }
    });

    window.DiariTheme = {
        getTheme: getSavedTheme,
        getPalette: getSavedPaletteId,
        getPalettes: function () {
            return PALETTES.slice();
        },
        setTheme,
        setPalette,
        applyTheme,
        applyPaletteById,
        syncToggleState,
    };
})();
