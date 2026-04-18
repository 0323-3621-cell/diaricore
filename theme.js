(function () {
    const STORAGE_KEY = 'diariCoreTheme';
    const DARK_CLASS = 'theme-dark';

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
        window.dispatchEvent(new CustomEvent('diari-theme-changed', { detail: { theme: nextTheme } }));
    }

    function syncToggleState() {
        const toggle = document.getElementById('toggleDarkMode');
        if (!toggle) return;
        toggle.checked = document.documentElement.classList.contains(DARK_CLASS);
    }

    // Apply immediately to reduce theme flicker.
    applyTheme(getSavedTheme());

    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(getSavedTheme());
        syncToggleState();
    });

    window.addEventListener('storage', function (event) {
        if (event.key !== STORAGE_KEY) return;
        applyTheme(getSavedTheme());
        syncToggleState();
    });

    window.DiariTheme = {
        getTheme: getSavedTheme,
        setTheme,
        applyTheme,
        syncToggleState,
    };
})();
