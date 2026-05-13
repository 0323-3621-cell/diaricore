document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('brevoApiKey');
    const senderEmailInput = document.getElementById('senderEmail');
    const senderNameInput = document.getElementById('senderName');
    const enableEmailInput = document.getElementById('enableEmailNotifications');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const apiKeyHint = document.getElementById('apiKeyHint');

    function notify(message) {
        window.alert(message);
    }

    function loadSettings() {
        return fetch('/api/admin/settings')
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) {
                    notify('Unauthorized. Please sign in as admin.');
                    window.location.href = 'login.html';
                    return;
                }
                const s = data.settings;
                senderEmailInput.value = s.senderEmail || '';
                senderNameInput.value = s.senderName || '';
                enableEmailInput.checked = !!s.enableEmailNotifications;
                apiKeyHint.textContent = s.hasApiKey ? `Current key: ${s.maskedApiKey}` : 'No API key configured.';
            })
            .catch(() => {
                notify('Could not load settings.');
            });
    }

    saveBtn.addEventListener('click', () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: apiKeyInput.value.trim(),
                senderEmail: senderEmailInput.value.trim(),
                senderName: senderNameInput.value.trim(),
                enableEmailNotifications: enableEmailInput.checked
            })
        })
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) {
                    notify(data.error || 'Failed to save settings.');
                    return;
                }
                apiKeyInput.value = '';
                notify(data.message || 'Settings saved successfully.');
                loadSettings();
            })
            .catch(() => notify('Could not save settings.'))
            .finally(() => {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="bi bi-floppy"></i> Save Settings';
            });
    });

    logoutBtn.addEventListener('click', () => {
        fetch('/api/admin/logout', { method: 'POST' })
            .finally(() => {
                localStorage.removeItem('diariCoreUser');
                window.location.href = 'login.html';
            });
    });

    loadSettings().finally(() => {
        if (window.DiariShell && typeof window.DiariShell.release === 'function') {
            window.DiariShell.release();
        }
    });
});
