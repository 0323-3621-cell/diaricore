// DiariCore Profile Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initializeProfileInteractions();
    initializePreferenceToggles();
    initializeStorageActions();
    initializeProfileSectionNavigation();
    initializeAccountDetailPanels();
});

function initializeProfileFromStorage() {
    try {
        const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
        const safeEntries = Array.isArray(entries) ? entries.filter((e) => e && (e.date || e.createdAt)) : [];

        const nameEl = document.querySelector('.profile-name');
        const emailEl = document.querySelector('.profile-email');
        const memberSinceEl = document.querySelector('.profile-member-since');
        const statEls = document.querySelectorAll('.profile-stats .stat-number');

        if (nameEl) {
            const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
            nameEl.textContent = fullName || user?.nickname || 'New User';
        }
        if (emailEl) emailEl.textContent = user?.email || 'No email available';
        if (memberSinceEl) {
            const parsed = user?.createdAt ? new Date(user.createdAt) : null;
            const createdAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
            const monthYear = createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            memberSinceEl.textContent = `Member since ${monthYear}`;
        }

        const entryCount = safeEntries.length;
        const streak = calculateEntryStreak(safeEntries);
        const consistency = calculateMonthlyConsistency(safeEntries);
        if (statEls[0]) statEls[0].textContent = String(entryCount);
        if (statEls[1]) statEls[1].textContent = String(streak);
        if (statEls[2]) statEls[2].textContent = `${consistency}%`;

        const avatarEl = document.querySelector('.profile-overview-section .avatar-image');
        if (avatarEl && user && typeof user.avatarDataUrl === 'string' && user.avatarDataUrl.length > 0) {
            avatarEl.src = user.avatarDataUrl;
        }
    } finally {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                if (window.DiariShell && typeof window.DiariShell.release === 'function') {
                    window.DiariShell.release();
                } else {
                    document.documentElement.classList.remove('diari-shell-pending');
                }
            });
        });
    }
}

const PROFILE_MS_PER_DAY = 86400000;

function profileJournalDayStartMs(raw) {
    if (raw == null) return null;
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return null;
    const local = new Date(dt);
    local.setHours(0, 0, 0, 0);
    return local.getTime();
}

function calculateEntryStreak(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    const daySet = new Set();
    entries.forEach((e) => {
        if (!e) return;
        const raw = e.date || e.createdAt;
        if (!raw) return;
        const ms = profileJournalDayStartMs(raw);
        if (ms != null) daySet.add(ms);
    });
    if (daySet.size === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    let anchorMs = null;
    daySet.forEach((t) => {
        if (t > todayMs) return;
        if (anchorMs == null || t > anchorMs) anchorMs = t;
    });
    if (anchorMs == null) return 0;

    const gapDays = Math.floor((todayMs - anchorMs) / PROFILE_MS_PER_DAY);
    if (gapDays > 1) return 0;

    let streak = 0;
    for (let i = 0; i < 400; i += 1) {
        const d = anchorMs - i * PROFILE_MS_PER_DAY;
        if (daySet.has(d)) streak += 1;
        else break;
    }
    return streak;
}

function calculateMonthlyConsistency(entries) {
    if (!entries.length) return 0;
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    const uniqueRecentDays = new Set(entries.map((e) => {
        const d = new Date(e.date);
        if (d < thirtyDaysAgo || d > now) return null;
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }).filter(Boolean));
    return Math.round((uniqueRecentDays.size / 30) * 100);
}

function toDateInputValue(raw) {
    if (raw == null || raw === '') return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function normalizeGenderForSelect(g) {
    const s = String(g || '').trim().toLowerCase();
    if (s === 'male' || s === 'm') return 'male';
    if (s === 'female' || s === 'f') return 'female';
    if (s === 'other' || s === 'non-binary' || s === 'nonbinary') return 'other';
    return '';
}

function hydratePersonalInfoPanel() {
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    } catch (_) {
        user = null;
    }
    const img = document.getElementById('profilePersonalSummaryAvatar');
    const initialsEl = document.getElementById('profilePersonalSummaryInitials');
    const nameEl = document.getElementById('profilePersonalSummaryName');
    const memberEl = document.getElementById('profilePersonalSummaryMember');
    const firstEl = document.getElementById('profileFieldFirstName');
    const lastEl = document.getElementById('profileFieldLastName');
    const nickEl = document.getElementById('profileFieldNickname');
    const emailEl = document.getElementById('profileFieldEmail');
    const genderEl = document.getElementById('profileFieldGender');
    const bdayEl = document.getElementById('profileFieldBirthday');

    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    const displayName = fullName || user?.nickname || 'New User';
    if (nameEl) nameEl.textContent = displayName;
    if (memberEl) {
        const parsed = user?.createdAt ? new Date(user.createdAt) : null;
        const createdAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
        const monthYear = createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        memberEl.textContent = `Member since ${monthYear}`;
    }

    const dataUrl = user && typeof user.avatarDataUrl === 'string' ? user.avatarDataUrl.trim() : '';
    if (img && initialsEl) {
        if (dataUrl) {
            img.src = dataUrl;
            img.hidden = false;
            initialsEl.style.display = 'none';
        } else {
            img.removeAttribute('src');
            img.hidden = true;
            initialsEl.style.display = 'flex';
            const parts = displayName.split(/\s+/).filter(Boolean);
            const ini = (parts[0]?.[0] || '?') + (parts[1]?.[0] || '');
            initialsEl.textContent = ini.toUpperCase();
        }
    }

    if (firstEl) firstEl.value = user?.firstName != null ? String(user.firstName) : '';
    if (lastEl) lastEl.value = user?.lastName != null ? String(user.lastName) : '';
    if (nickEl) nickEl.value = user?.nickname != null ? String(user.nickname) : '';
    if (emailEl) emailEl.value = user?.email != null ? String(user.email) : '';
    if (genderEl) genderEl.value = normalizeGenderForSelect(user?.gender);
    if (bdayEl) bdayEl.value = toDateInputValue(user?.birthday);
}

function updatePasswordStrengthMeter(password) {
    const bars = document.querySelectorAll('.profile-password-meter__bar');
    const label = document.getElementById('profilePasswordStrengthLabel');
    const pw = String(password || '');
    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw) || /[A-Z]/.test(pw)) score++;
    score = Math.min(4, score);
    bars.forEach((b, i) => {
        b.classList.toggle('is-active', i < score);
    });
    if (label) {
        const texts = ['', 'Weak', 'Fair', 'Good', 'Strong'];
        label.textContent = pw ? texts[score] || '' : '';
    }
}

function clearSecurityForm() {
    ['profileSecCurrentPassword', 'profileSecNewPassword', 'profileSecConfirmPassword'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    updatePasswordStrengthMeter('');
}

function getStoredDiariUser() {
    try {
        return JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    } catch (_) {
        return null;
    }
}

function mergeDiariUserIntoStorage(serverUser) {
    if (!serverUser || typeof serverUser !== 'object') return;
    const prev = getStoredDiariUser() || {};
    const merged = Object.assign({}, prev, serverUser, {
        isLoggedIn: prev.isLoggedIn !== false,
    });
    localStorage.setItem('diariCoreUser', JSON.stringify(merged));
    try {
        document.dispatchEvent(new CustomEvent('diari-user-updated', { bubbles: true }));
    } catch (_) {}
}

function updateSecurityStatusPill(user) {
    const pill = document.querySelector('.profile-account-detail-card--security .profile-security-status span');
    if (!pill) return;
    const on = !!(user && user.totpEnabled);
    pill.textContent = on ? 'Two-factor sign-in is on.' : 'Two-factor sign-in is off.';
}

function hydrateSecurity2fa() {
    const user = getStoredDiariUser();
    const toggle = document.getElementById('profileSec2faToggle');
    if (!toggle) return;
    toggle.dataset.hydrating = '1';
    toggle.checked = !!(user && user.totpEnabled);
    delete toggle.dataset.hydrating;
    updateSecurityStatusPill(user);
}

function getProfileTotpDisableDigitInputs() {
    return Array.from(document.querySelectorAll('[data-profile-totp-disable-digit]'));
}

function getProfileTotpDisableCode() {
    return getProfileTotpDisableDigitInputs()
        .map(function (d) {
            return (d.value || '').replace(/\D/g, '');
        })
        .join('');
}

function updateProfileTotpDisableCounter() {
    const el = document.getElementById('profileTotpDisableCounter');
    if (!el) return;
    el.textContent = `${getProfileTotpDisableCode().length}/6`;
}

function clearProfileTotpDisableDigits() {
    getProfileTotpDisableDigitInputs().forEach(function (d) {
        d.value = '';
        d.disabled = false;
    });
    updateProfileTotpDisableCounter();
}

function setProfileTotpDisablePrimaryButton() {
    const primary = document.getElementById('profileTotpModalPrimary');
    if (!primary) return;
    primary.classList.add('profile-totp-modal__btn--danger');
    primary.innerHTML = '<i class="bi bi-shield-slash" aria-hidden="true"></i> Disable 2FA';
}

function wireProfileTotpDisableDigits() {
    const digits = getProfileTotpDisableDigitInputs();
    if (!digits.length || digits[0].dataset.totpDigitsWired === '1') return;
    digits[0].dataset.totpDigitsWired = '1';
    digits.forEach(function (input, idx) {
        input.addEventListener('input', function (e) {
            var v = (e.target.value || '').replace(/\D/g, '').slice(-1);
            e.target.value = v;
            updateProfileTotpDisableCounter();
            if (v && idx < digits.length - 1) {
                digits[idx + 1].focus();
            }
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Backspace' && !input.value && idx > 0) {
                digits[idx - 1].focus();
            }
        });
        input.addEventListener('paste', function (e) {
            e.preventDefault();
            var raw = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
            digits.forEach(function (d, i) {
                d.value = raw[i] || '';
            });
            updateProfileTotpDisableCounter();
            var next = raw.length >= 6 ? 5 : raw.length;
            if (digits[next]) {
                digits[next].focus();
            }
        });
    });
}

function resetTotpModal() {
    const modal = document.getElementById('profileTotpModal');
    const setup = document.getElementById('profileTotpModalSetup');
    const disable = document.getElementById('profileTotpModalDisable');
    const qrBlock = document.getElementById('profileTotpQrBlock');
    const pw = document.getElementById('profileTotpSetupPassword');
    const code = document.getElementById('profileTotpConfirmCode');
    const dpw = document.getElementById('profileTotpDisablePassword');
    const primary = document.getElementById('profileTotpModalPrimary');
    if (modal) modal.hidden = true;
    if (setup) setup.hidden = true;
    if (disable) disable.hidden = true;
    if (qrBlock) qrBlock.hidden = true;
    if (pw) pw.value = '';
    if (code) code.value = '';
    if (dpw) dpw.value = '';
    clearProfileTotpDisableDigits();
    if (primary) {
        primary.disabled = false;
        primary.classList.remove('profile-totp-modal__btn--danger');
        primary.textContent = 'Continue';
    }
    const dialog = document.querySelector('.profile-totp-modal__dialog');
    if (dialog) dialog.setAttribute('aria-labelledby', 'profileTotpModalTitle');
    document.body.classList.remove('profile-totp-modal-open');
}

function openTotpModal() {
    const modal = document.getElementById('profileTotpModal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('profile-totp-modal-open');
}

function openTotpSetupModal() {
    const setup = document.getElementById('profileTotpModalSetup');
    const disable = document.getElementById('profileTotpModalDisable');
    const title = document.getElementById('profileTotpModalTitle');
    const lead = document.getElementById('profileTotpSetupLead');
    const qrBlock = document.getElementById('profileTotpQrBlock');
    const primary = document.getElementById('profileTotpModalPrimary');
    if (disable) disable.hidden = true;
    if (setup) setup.hidden = false;
    if (title) title.textContent = 'Set up authenticator';
    if (lead) {
        lead.textContent = 'Enter your account password to generate a setup QR code.';
        lead.hidden = false;
    }
    if (qrBlock) qrBlock.hidden = true;
    const img = document.getElementById('profileTotpQrImg');
    if (img) img.removeAttribute('src');
    const pw = document.getElementById('profileTotpSetupPassword');
    if (pw) pw.value = '';
    const code = document.getElementById('profileTotpConfirmCode');
    if (code) code.value = '';
    if (primary) {
        primary.classList.remove('profile-totp-modal__btn--danger');
        primary.textContent = 'Show QR code';
        primary.dataset.totpAction = 'setup-qr';
    }
    const dialog = document.querySelector('.profile-totp-modal__dialog');
    if (dialog) dialog.setAttribute('aria-labelledby', 'profileTotpModalTitle');
    openTotpModal();
    setTimeout(function () {
        if (pw) pw.focus();
    }, 50);
}

function openTotpDisableModal() {
    const setup = document.getElementById('profileTotpModalSetup');
    const disable = document.getElementById('profileTotpModalDisable');
    const primary = document.getElementById('profileTotpModalPrimary');
    if (setup) setup.hidden = true;
    if (disable) disable.hidden = false;
    const dpw = document.getElementById('profileTotpDisablePassword');
    if (dpw) dpw.value = '';
    clearProfileTotpDisableDigits();
    if (primary) {
        primary.disabled = false;
        primary.dataset.totpAction = 'disable';
        setProfileTotpDisablePrimaryButton();
    }
    const dialog = document.querySelector('.profile-totp-modal__dialog');
    if (dialog) dialog.setAttribute('aria-labelledby', 'profileTotpDisableTitle');
    openTotpModal();
    setTimeout(function () {
        if (dpw) dpw.focus();
    }, 50);
}

function wireProfileTotpModal() {
    const modal = document.getElementById('profileTotpModal');
    if (!modal || modal.dataset.wired === '1') return;
    modal.dataset.wired = '1';

    const backdrop = document.getElementById('profileTotpModalBackdrop');
    const cancel = document.getElementById('profileTotpModalCancel');
    const primary = document.getElementById('profileTotpModalPrimary');

    function close() {
        resetTotpModal();
        hydrateSecurity2fa();
    }

    if (backdrop) backdrop.addEventListener('click', close);
    if (cancel) cancel.addEventListener('click', close);
    const closeBtn = document.getElementById('profileTotpModalCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', close);

    wireProfileTotpDisableDigits();

    if (primary) {
        primary.addEventListener('click', function () {
            const user = getStoredDiariUser();
            const uid = user && user.id != null ? Number(user.id) : 0;
            if (!uid) {
                showNotification('Sign in to manage two-factor authentication.', 'warning');
                close();
                return;
            }
            const action = primary.dataset.totpAction || '';

            if (action === 'setup-qr') {
                const password = (document.getElementById('profileTotpSetupPassword')?.value || '').trim();
                if (!password) {
                    showNotification('Enter your password to continue.', 'warning');
                    return;
                }
                primary.disabled = true;
                primary.textContent = 'Loading…';
                fetch('/api/user/totp/setup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, password: password }),
                })
                    .then(function (res) {
                        return res.json().then(function (data) {
                            return { ok: res.ok, data: data };
                        });
                    })
                    .then(function (_ref) {
                        var ok = _ref.ok;
                        var data = _ref.data;
                        primary.disabled = false;
                        primary.textContent = 'Enable 2FA';
                        primary.dataset.totpAction = 'setup-confirm';
                        if (!ok || !data.success) {
                            showNotification(data.error || 'Could not start setup.', 'error');
                            primary.textContent = 'Show QR code';
                            primary.dataset.totpAction = 'setup-qr';
                            return;
                        }
                        const img = document.getElementById('profileTotpQrImg');
                        if (img && data.qrDataUri) img.src = data.qrDataUri;
                        const qrBlock = document.getElementById('profileTotpQrBlock');
                        const lead = document.getElementById('profileTotpSetupLead');
                        if (lead) lead.hidden = true;
                        if (qrBlock) qrBlock.hidden = false;
                        const codeEl = document.getElementById('profileTotpConfirmCode');
                        if (codeEl) codeEl.focus();
                    })
                    .catch(function () {
                        primary.disabled = false;
                        primary.textContent = 'Show QR code';
                        primary.dataset.totpAction = 'setup-qr';
                        showNotification('Could not reach the server.', 'error');
                    });
                return;
            }

            if (action === 'setup-confirm') {
                const code = (document.getElementById('profileTotpConfirmCode')?.value || '').replace(/\D/g, '');
                if (code.length !== 6) {
                    showNotification('Enter the 6-digit code from your app.', 'warning');
                    return;
                }
                primary.disabled = true;
                primary.textContent = 'Enabling…';
                fetch('/api/user/totp/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, code: code }),
                })
                    .then(function (res) {
                        return res.json().then(function (data) {
                            return { ok: res.ok, data: data };
                        });
                    })
                    .then(function (_ref2) {
                        var ok2 = _ref2.ok;
                        var data2 = _ref2.data;
                        primary.disabled = false;
                        primary.textContent = 'Enable 2FA';
                        if (!ok2 || !data2.success) {
                            showNotification(data2.error || 'Invalid code.', 'error');
                            return;
                        }
                        mergeDiariUserIntoStorage(data2.user);
                        hydrateSecurity2fa();
                        initializeProfileFromStorage();
                        showNotification('Two-factor authentication is enabled.', 'success');
                        resetTotpModal();
                    })
                    .catch(function () {
                        primary.disabled = false;
                        primary.textContent = 'Enable 2FA';
                        showNotification('Could not reach the server.', 'error');
                    });
                return;
            }

            if (action === 'disable') {
                const password = (document.getElementById('profileTotpDisablePassword')?.value || '').trim();
                const code = getProfileTotpDisableCode();
                if (!password || code.length !== 6) {
                    showNotification('Enter your password and a 6-digit code.', 'warning');
                    return;
                }
                primary.disabled = true;
                primary.classList.remove('profile-totp-modal__btn--danger');
                primary.textContent = 'Disabling…';
                fetch('/api/user/totp/disable', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: uid, password: password, code: code }),
                })
                    .then(function (res) {
                        return res.json().then(function (data) {
                            return { ok: res.ok, data: data };
                        });
                    })
                    .then(function (_ref3) {
                        var ok3 = _ref3.ok;
                        var data3 = _ref3.data;
                        primary.disabled = false;
                        setProfileTotpDisablePrimaryButton();
                        if (!ok3 || !data3.success) {
                            showNotification(data3.error || 'Could not disable 2FA.', 'error');
                            return;
                        }
                        mergeDiariUserIntoStorage(data3.user);
                        hydrateSecurity2fa();
                        initializeProfileFromStorage();
                        showNotification('Two-factor authentication is disabled.', 'success');
                        resetTotpModal();
                    })
                    .catch(function () {
                        primary.disabled = false;
                        setProfileTotpDisablePrimaryButton();
                        showNotification('Could not reach the server.', 'error');
                    });
            }
        });
    }
}

function savePersonalInfoForm() {
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    } catch (_) {
        user = null;
    }
    if (!user || typeof user !== 'object') {
        showNotification('Sign in to save profile details.', 'warning');
        return;
    }

    const first = (document.getElementById('profileFieldFirstName')?.value || '').trim();
    const last = (document.getElementById('profileFieldLastName')?.value || '').trim();
    const nick = (document.getElementById('profileFieldNickname')?.value || '').trim();
    const email = (document.getElementById('profileFieldEmail')?.value || '').trim();
    const gender = (document.getElementById('profileFieldGender')?.value || '').trim();
    const bday = (document.getElementById('profileFieldBirthday')?.value || '').trim();

    if (!nick) {
        showNotification('Username is required.', 'warning');
        return;
    }
    if (!email || !email.includes('@')) {
        showNotification('Please enter a valid email address.', 'warning');
        return;
    }

    user.firstName = first;
    user.lastName = last;
    user.nickname = nick;
    user.email = email;
    user.gender = gender || null;
    user.birthday = bday || null;

    localStorage.setItem('diariCoreUser', JSON.stringify(user));
    document.dispatchEvent(new CustomEvent('diari-user-updated', { bubbles: true }));
    initializeProfileFromStorage();
    showNotification('Profile updated.', 'success');
    closeProfileSection();
}

function initializeAccountDetailPanels() {
    document.getElementById('profilePersonalCancelBtn')?.addEventListener('click', function () {
        closeProfileSection();
    });
    document.getElementById('profilePersonalSaveBtn')?.addEventListener('click', savePersonalInfoForm);
    document.getElementById('profileSecurityCancelBtn')?.addEventListener('click', function () {
        clearSecurityForm();
        closeProfileSection();
    });
    document.getElementById('profileSecuritySaveBtn')?.addEventListener('click', function () {
        showNotification('Password changes will be available in a future update.', 'info');
    });
    document.getElementById('profilePersonalChangePhotoBtn')?.addEventListener('click', function () {
        const input = ensureProfileAvatarFileInput();
        input.click();
    });

    document.querySelectorAll('.profile-account-field__reveal').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const id = btn.getAttribute('data-profile-pw');
            const field = id && document.getElementById(id);
            if (!field) return;
            const show = field.type === 'password';
            field.type = show ? 'text' : 'password';
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('bi-eye', show);
                icon.classList.toggle('bi-eye-slash', !show);
            }
        });
    });

    const np = document.getElementById('profileSecNewPassword');
    if (np) {
        np.addEventListener('input', function () {
            updatePasswordStrengthMeter(np.value);
        });
    }

    wireProfileTotpModal();
    const totpToggle = document.getElementById('profileSec2faToggle');
    if (totpToggle && !totpToggle.dataset.wired) {
        totpToggle.dataset.wired = '1';
        totpToggle.addEventListener('change', function () {
            if (totpToggle.dataset.hydrating === '1') return;
            const wantOn = totpToggle.checked;
            const user = getStoredDiariUser();
            if (!user || !user.id) {
                showNotification('Sign in to manage two-factor authentication.', 'warning');
                totpToggle.checked = false;
                return;
            }
            if (wantOn) {
                totpToggle.checked = false;
                openTotpSetupModal();
            } else {
                totpToggle.checked = true;
                openTotpDisableModal();
            }
        });
    }
}

function processAvatarFileToDataUrl(file, done) {
    const reader = new FileReader();
    reader.onload = function () {
        const result = reader.result;
        if (typeof result !== 'string') {
            done(null);
            return;
        }
        const image = new Image();
        image.onload = function () {
            try {
                const maxEdge = 360;
                let w = image.naturalWidth || image.width;
                let h = image.naturalHeight || image.height;
                if (!w || !h) {
                    done(null);
                    return;
                }
                if (w > maxEdge || h > maxEdge) {
                    const scale = Math.min(maxEdge / w, maxEdge / h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    done(result);
                    return;
                }
                ctx.drawImage(image, 0, 0, w, h);
                done(canvas.toDataURL('image/jpeg', 0.86));
            } catch (_) {
                done(null);
            }
        };
        image.onerror = function () {
            done(null);
        };
        image.src = result;
    };
    reader.onerror = function () {
        done(null);
    };
    reader.readAsDataURL(file);
}

function ensureProfileAvatarFileInput() {
    let el = document.getElementById('profileAvatarFileInput');
    if (!el) {
        el = document.createElement('input');
        el.type = 'file';
        el.id = 'profileAvatarFileInput';
        el.accept = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';
        el.setAttribute('aria-hidden', 'true');
        el.tabIndex = -1;
        el.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-100px;top:0;';
        document.body.appendChild(el);
    }
    return el;
}

// Initialize Profile Interactions
function initializeProfileInteractions() {
    const mobileLogoutBtn = document.getElementById('profileMobileLogoutBtn');
    if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener('click', function() {
            localStorage.removeItem('diariCoreUser');
            window.location.href = 'login.html';
        });
    }

    const pageLogoutBtn = document.getElementById('profilePageLogoutBtn');
    if (pageLogoutBtn) {
        pageLogoutBtn.addEventListener('click', function() {
            localStorage.removeItem('diariCoreUser');
            window.location.href = 'login.html';
        });
    }

    // Avatar: open file picker, resize, save to diariCoreUser.avatarDataUrl, sync sidebar
    const avatarEditBtn = document.querySelector('.avatar-edit-btn');
    const avatarMainImg = document.querySelector('.profile-overview-section .avatar-image');
    if (avatarEditBtn && avatarMainImg) {
        const input = ensureProfileAvatarFileInput();
        if (input.dataset.avatarBound !== '1') {
            input.dataset.avatarBound = '1';
            avatarEditBtn.addEventListener('click', function (e) {
                e.preventDefault();
                input.click();
            });
            input.addEventListener('change', function () {
                const file = input.files && input.files[0];
                input.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    showNotification('Please choose an image file.', 'warning');
                    return;
                }
                if (file.size > 4 * 1024 * 1024) {
                    showNotification('Image is too large (max 4 MB).', 'warning');
                    return;
                }
                processAvatarFileToDataUrl(file, function (dataUrl) {
                    if (!dataUrl) {
                        showNotification('Could not read that image. Try JPG or PNG.', 'error');
                        return;
                    }
                    if (dataUrl.length > 900000) {
                        showNotification('Processed image is still too large. Try a smaller photo.', 'error');
                        return;
                    }
                    let user = null;
                    try {
                        user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
                    } catch (_) {
                        user = null;
                    }
                    if (!user || typeof user !== 'object') {
                        showNotification('Sign in to save a profile photo.', 'warning');
                        return;
                    }
                    user.avatarDataUrl = dataUrl;
                    localStorage.setItem('diariCoreUser', JSON.stringify(user));
                    avatarMainImg.src = dataUrl;
                    document.dispatchEvent(new CustomEvent('diari-user-updated', { bubbles: true }));

                    const uid = Number(user.id ?? user.userId ?? 0);
                    if (Number.isInteger(uid) && uid > 0) {
                        fetch('/api/user/avatar', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: uid, avatarDataUrl: dataUrl }),
                        })
                            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                            .then(({ ok, data }) => {
                                if (!ok || !data.success) throw new Error(data.error || 'save failed');
                                const serverUser = data.user;
                                if (serverUser && typeof serverUser === 'object') {
                                    const next = { ...user, ...serverUser };
                                    if (serverUser.avatarDataUrl) next.avatarDataUrl = serverUser.avatarDataUrl;
                                    localStorage.setItem('diariCoreUser', JSON.stringify(next));
                                    document.dispatchEvent(new CustomEvent('diari-user-updated', { bubbles: true }));
                                }
                                showNotification('Profile photo updated.', 'success');
                                const personalPanel = document.getElementById('profileSectionPersonalInfo');
                                if (personalPanel && !personalPanel.hidden) {
                                    hydratePersonalInfoPanel();
                                }
                            })
                            .catch(function () {
                                showNotification(
                                    'Photo is saved on this device only. Could not sync to the server—try again when you are online.',
                                    'warning'
                                );
                            });
                    } else {
                        showNotification('Profile photo updated.', 'success');
                    }
                });
            });
        }
    }
}

// Initialize Preference Toggles
function initializePreferenceToggles() {
    const toggleSwitches = document.querySelectorAll(
        '#profileSectionPreferences .toggle-switch input[type="checkbox"], #profileSectionPreferences .switch input[type="checkbox"]'
    );

    const darkModeToggle = document.getElementById('toggleDarkMode');
    if (darkModeToggle && window.DiariTheme && typeof window.DiariTheme.getTheme === 'function') {
        darkModeToggle.checked = window.DiariTheme.getTheme() === 'dark';
    }
    
    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', function() {
            const row = this.closest('.appearance-item, .notifications-item, .preference-item');
            if (!row) return;

            if (this.id === 'toggleDarkMode' && window.DiariTheme && typeof window.DiariTheme.setTheme === 'function') {
                window.DiariTheme.setTheme(this.checked ? 'dark' : 'light');
            }

            const titleEl = row.querySelector(
                '.appearance-subtitle, .notifications-subtitle, .preference-title'
            );
            const preferenceTitle = titleEl ? titleEl.textContent.trim() : 'Preference';
            const isChecked = this.checked;
            
            showNotification(`${preferenceTitle} ${isChecked ? 'enabled' : 'disabled'}`, 'success');
            console.log('Preference changed:', preferenceTitle, isChecked);
            
            // In a real app, this would save to backend
            savePreference(preferenceTitle, isChecked);
        });
    });
}

// Save Preference (Mock Function)
function savePreference(title, value) {
    // In a real app, this would make an API call
    console.log('Saving preference:', title, value);
    
    // Simulate API call
    setTimeout(() => {
        console.log('Preference saved successfully');
    }, 500);
}

// Initialize Storage Actions
function initializeStorageActions() {
    // Export button
    const exportBtn = document.querySelector('.btn-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            showNotification('Preparing data export...', 'info');
            
            // Simulate export process
            setTimeout(() => {
                exportData();
            }, 1500);
        });
    }

    document.querySelectorAll('.btn-privacy').forEach(function (btn) {
        btn.addEventListener('click', function () {
            showNotification('Privacy policy is coming soon.', 'info');
        });
    });

    // Backup button
    const backupBtn = document.querySelector('.btn-backup');
    if (backupBtn) {
        backupBtn.addEventListener('click', function() {
            showNotification('Creating backup...', 'info');
            
            // Simulate backup process
            setTimeout(() => {
                createBackup();
            }, 1500);
        });
    }

    // Clear data button
    const deleteBtn = document.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            const confirmed = confirm('Are you sure you want to clear all data? This action cannot be undone.');
            
            if (confirmed) {
                showNotification('Clearing data...', 'warning');
                
                // Simulate data clearing
                setTimeout(() => {
                    clearData();
                }, 1500);
            }
        });
    }
}

// Export Data (Mock Function)
function exportData() {
    // In a real app, this would generate and download a file
    const mockData = {
        entries: [],
        preferences: {},
        exportDate: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(mockData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `diari-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
    
    showNotification('Data exported successfully!', 'success');
}

// Create Backup (Mock Function)
function createBackup() {
    // In a real app, this would create a cloud backup
    console.log('Creating backup...');
    
    setTimeout(() => {
        showNotification('Backup created successfully!', 'success');
        console.log('Backup completed');
    }, 1000);
}

// Clear Data (Mock Function)
function clearData() {
    // In a real app, this would clear user data
    console.log('Clearing data...');
    
    setTimeout(() => {
        showNotification('All data cleared successfully', 'success');
        console.log('Data cleared');
        
        // Update storage display
        updateStorageDisplay(0, 0, 0);
    }, 1000);
}

// Update Storage Display
function updateStorageDisplay(textSize, attachmentSize, backupSize) {
    const totalSize = textSize + attachmentSize + backupSize;
    const percentage = (totalSize / 5 * 100).toFixed(0); // 5GB total
    
    // Update storage amount
    const storageAmount = document.querySelector('.storage-amount');
    if (storageAmount) {
        storageAmount.textContent = `${(totalSize / 1024).toFixed(1)} GB of 5 GB used`;
    }
    
    // Update storage bar
    const storageFill = document.querySelector('.storage-fill');
    if (storageFill) {
        storageFill.style.width = `${percentage}%`;
    }
    
    // Update storage breakdown
    const storageItems = document.querySelectorAll('.storage-item');
    if (storageItems[0]) storageItems[0].querySelector('.storage-size').textContent = `${(textSize / 1024).toFixed(1)} GB`;
    if (storageItems[1]) storageItems[1].querySelector('.storage-size').textContent = `${(attachmentSize / 1024).toFixed(1)} GB`;
    if (storageItems[2]) storageItems[2].querySelector('.storage-size').textContent = `${(backupSize / 1024).toFixed(1)} GB`;
}

const PROFILE_SECTION_PANELS = {
    preferences: 'profileSectionPreferences',
    privacy: 'profileSectionPrivacy',
    'personal-information': 'profileSectionPersonalInfo',
    security: 'profileSectionSecurity',
};

const PROFILE_SECTION_COPY = {
    preferences: {
        title: 'Preferences',
        subtitle: 'Customize your DiariCore experience.',
    },
    privacy: {
        title: 'Privacy',
        subtitle: 'Data usage and sharing.',
    },
    'personal-information': {
        title: 'Personal Information',
        subtitle: 'Update your name, email, and profile details',
    },
    security: {
        title: 'Security Settings',
        subtitle: 'Change password and enable two-factor authentication',
    },
};

function profileSectionFromHash() {
    const h = (location.hash || '').replace(/^#/, '').toLowerCase();
    return PROFILE_SECTION_PANELS[h] ? h : '';
}

function setProfileUrlHash(sectionKey) {
    try {
        const base = `${location.pathname}${location.search}`;
        if (sectionKey) {
            history.replaceState({}, '', `${base}#${sectionKey}`);
        } else {
            history.replaceState({}, '', base);
        }
    } catch (_) {}
}

function openProfileSection(sectionKey) {
    if (!PROFILE_SECTION_PANELS[sectionKey]) return;
    const overview = document.getElementById('profileOverviewShell');
    const shell = document.getElementById('profileSectionShell');
    if (!overview || !shell) return;

    overview.hidden = true;
    shell.hidden = false;
    document.body.classList.add('page-profile-section-open');

    Object.keys(PROFILE_SECTION_PANELS).forEach(function (k) {
        const el = document.getElementById(PROFILE_SECTION_PANELS[k]);
        if (el) el.hidden = k !== sectionKey;
    });

    const copy = PROFILE_SECTION_COPY[sectionKey];
    const titleEl = document.getElementById('profileSectionTitle');
    const subEl = document.getElementById('profileSectionSubtitle');
    if (titleEl && copy) titleEl.textContent = copy.title;
    if (subEl && copy) subEl.textContent = copy.subtitle;

    setProfileUrlHash(sectionKey);
    window.scrollTo(0, 0);

    if (sectionKey === 'personal-information') {
        hydratePersonalInfoPanel();
    }
    if (sectionKey === 'security') {
        clearSecurityForm();
        hydrateSecurity2fa();
    }
}

function closeProfileSection() {
    const overview = document.getElementById('profileOverviewShell');
    const shell = document.getElementById('profileSectionShell');
    if (!overview || !shell || shell.hidden) return;

    shell.hidden = true;
    overview.hidden = false;
    document.body.classList.remove('page-profile-section-open');

    Object.keys(PROFILE_SECTION_PANELS).forEach(function (k) {
        const el = document.getElementById(PROFILE_SECTION_PANELS[k]);
        if (el) el.hidden = true;
    });

    setProfileUrlHash(null);
    window.scrollTo(0, 0);
}

function initializeProfileSectionNavigation() {
    const backBtn = document.getElementById('profileSectionBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', function () {
            closeProfileSection();
        });
    }

    document.querySelectorAll('[data-profile-section]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            const key = btn.getAttribute('data-profile-section');
            if (key) openProfileSection(key);
        });
    });

    const mobileBackBtn = document.getElementById('profileMobileBackBtn');
    if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', function () {
            if (document.body.classList.contains('page-profile-section-open')) {
                closeProfileSection();
            } else {
                window.location.href = 'dashboard.html';
            }
        });
    }

    const editIdentityBtn = document.getElementById('profileEditIdentityBtn');
    if (editIdentityBtn) {
        editIdentityBtn.addEventListener('click', function () {
            openProfileSection('personal-information');
        });
    }

    window.addEventListener('hashchange', function () {
        const key = profileSectionFromHash();
        if (key) openProfileSection(key);
        else closeProfileSection();
    });

    const initial = profileSectionFromHash();
    if (initial) {
        openProfileSection(initial);
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existingNotification = document.querySelector('.profile-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification
    const notification = document.createElement('div');
    notification.className = 'profile-notification';
    notification.innerHTML = `
        <i class="bi bi-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;

    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 400px;
        word-wrap: break-word;
        background: ${getNotificationColor(type)};
        color: white;
        font-family: 'Inter', sans-serif;
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    // Remove after delay
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Get Notification Icon
function getNotificationIcon(type) {
    const icons = {
        'success': 'check-circle',
        'error': 'x-circle',
        'warning': 'exclamation-triangle',
        'info': 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Get Notification Color
function getNotificationColor(type) {
    const colors = {
        'success': '#7FBF9F',
        'error': '#E74C3C',
        'warning': '#F4A261',
        'info': '#7FA7BF'
    };
    return colors[type] || '#7FA7BF';
}

if (document.body && document.body.classList.contains('page-profile')) {
    initializeProfileFromStorage();
} else if (window.DiariShell && typeof window.DiariShell.release === 'function') {
    window.DiariShell.release();
} else {
    document.documentElement.classList.remove('diari-shell-pending');
}
