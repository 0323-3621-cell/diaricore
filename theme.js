(function () {
    const STORAGE_KEY = 'diariCoreTheme';
    const DARK_CLASS = 'theme-dark';
    const FAB_ID = 'diariThemeToggleFab';

    function getSavedTheme() {
        const raw = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
        return raw === 'dark' ? 'dark' : 'light';
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
        window.dispatchEvent(new CustomEvent('diari-theme-changed', { detail: { theme: nextTheme } }));
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

    // Apply immediately to reduce theme flicker.
    applyTheme(getSavedTheme());

    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(getSavedTheme());
        createThemeToggleFab();
        syncToggleState();
    });

    window.addEventListener('storage', function (event) {
        if (event.key !== STORAGE_KEY) return;
        const nextTheme = getSavedTheme();
        applyTheme(nextTheme);
        syncFabState(nextTheme);
        syncToggleState();
    });

    window.DiariTheme = {
        getTheme: getSavedTheme,
        setTheme,
        applyTheme,
        syncToggleState,
    };
})();
