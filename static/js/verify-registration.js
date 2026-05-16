function getQueryParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name) || '';
}

function setError(message) {
    const box = document.getElementById('otpError');
    if (!box) return;
    const successBox = document.getElementById('otpSuccess');
    if (successBox) {
        successBox.classList.remove('show');
        successBox.hidden = true;
    }
    const text = box.querySelector('.alert__text');
    if (text) text.textContent = message || '';
    if (!message) {
        box.classList.remove('show');
        box.hidden = true;
        return;
    }
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('show'));
}

function setSuccess(message) {
    const box = document.getElementById('otpSuccess');
    if (!box) return;
    const errorBox = document.getElementById('otpError');
    if (errorBox) {
        errorBox.classList.remove('show');
        errorBox.hidden = true;
    }
    const text = box.querySelector('.alert__text');
    if (text) text.textContent = message || '';
    if (!message) {
        box.classList.remove('show');
        box.hidden = true;
        return;
    }
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('show'));
}

function maskEmail(email) {
    const [user, domain] = (email || '').split('@');
    if (!user || !domain) return email;
    const head = user.slice(0, 2);
    const tail = user.slice(-1);
    return `${head}${'*'.repeat(Math.max(1, user.length - 3))}${tail}@${domain}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const email = getQueryParam('email') || sessionStorage.getItem('pendingRegistrationEmail') || '';
    const emailDisplay = document.getElementById('emailDisplay');
    const inputs = Array.from(document.querySelectorAll('.digit'));
    const verifyBtn = document.getElementById('verifyBtn');
    let verifyBtnText = document.getElementById('verifyBtnText');
    let verifyBtnIcon = document.getElementById('verifyBtnIcon');
    const resendBtn = document.getElementById('resendBtn');
    const timerLabel = document.getElementById('timerLabel');
    const errorClose = document.getElementById('otpErrorClose');
    const successClose = document.getElementById('otpSuccessClose');
    const banner = document.getElementById('topBanner');
    const bannerClose = document.getElementById('bannerCloseBtn');

    if (!email) {
        setError('No pending registration found. Please sign up again.');
        verifyBtn.disabled = true;
        resendBtn.disabled = true;
        return;
    }

    // Top banner like reference project
    if (banner) {
        banner.hidden = false;
        if (bannerClose) {
            bannerClose.addEventListener('click', () => (banner.hidden = true));
        }
    }

    emailDisplay.textContent = maskEmail(email);
    if (errorClose) errorClose.addEventListener('click', () => setError(''));
    if (successClose) successClose.addEventListener('click', () => setSuccess(''));

    let seconds = 10 * 60;
    let resendCooldown = 0;
    let resendCooldownInterval = null;
    const renderTimer = () => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        timerLabel.textContent = seconds > 0 ? `Code expires in ${m}:${String(s).padStart(2, '0')}` : 'Code expired. Resend a new one.';
    };
    renderTimer();
    const interval = setInterval(() => {
        seconds -= 1;
        if (seconds <= 0) {
            seconds = 0;
            clearInterval(interval);
        }
        renderTimer();
    }, 1000);

    const code = () => inputs.map(i => i.value).join('');
    let autoVerifyTimeout = null;
    const updateBtn = () => {
        const filled = code().length === 6;
        verifyBtn.disabled = !filled;
        if (filled && !verifyBtn.disabled) {
            if (autoVerifyTimeout) clearTimeout(autoVerifyTimeout);
            autoVerifyTimeout = setTimeout(() => {
                if (!verifyBtn.disabled) verifyBtn.click();
            }, 350);
        }
    };

    const clearErrors = () => {
        setError('');
        setSuccess('');
        inputs.forEach(i => i.classList.remove('error'));
    };

    const startResendCooldown = () => {
        resendCooldown = 60;
        resendBtn.disabled = true;
        if (resendCooldownInterval) clearInterval(resendCooldownInterval);
        const renderCooldown = () => {
            const m = Math.floor(resendCooldown / 60);
            const s = resendCooldown % 60;
            resendBtn.textContent = `Resend Code (${m}:${String(s).padStart(2, '0')})`;
        };
        renderCooldown();
        resendCooldownInterval = setInterval(() => {
            resendCooldown -= 1;
            if (resendCooldown <= 0) {
                clearInterval(resendCooldownInterval);
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend Code';
                return;
            }
            renderCooldown();
        }, 1000);
    };

    inputs.forEach((input, idx) => {
        input.addEventListener('input', (e) => {
            const v = (e.target.value || '').replace(/\D/g, '').slice(-1);
            e.target.value = v;
            clearErrors();
            if (v && idx < inputs.length - 1) inputs[idx + 1].focus();
            updateBtn();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && idx > 0) inputs[idx - 1].focus();
        });
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
            inputs.forEach((d, i) => { d.value = digits[i] || ''; });
            clearErrors();
            updateBtn();
        });
    });

    verifyBtn.addEventListener('click', () => {
        const otpCode = code();
        if (otpCode.length !== 6) {
            setError('Please enter the 6-digit code.');
            inputs.forEach(i => i.classList.add('error'));
            return;
        }
        verifyBtn.disabled = true;
        verifyBtn.classList.add('is-loading');
        // refresh references in case markup changed
        verifyBtnText = document.getElementById('verifyBtnText');
        verifyBtnIcon = document.getElementById('verifyBtnIcon');
        if (verifyBtnIcon) verifyBtnIcon.outerHTML = '<span class="spinner" aria-hidden="true"></span>';
        verifyBtnText = document.getElementById('verifyBtnText');
        if (verifyBtnText) verifyBtnText.textContent = 'Verifying...';

        fetch('/api/register/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otpCode })
        })
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) {
                    setError('Invalid or expired verification code. Please try again.');
                    inputs.forEach(i => { i.value = ''; });
                    inputs.forEach(i => i.classList.add('error'));
                    inputs[0]?.focus();
                    verifyBtn.disabled = false;
                    verifyBtn.classList.remove('is-loading');
                    verifyBtn.innerHTML = '<i class="bi bi-check2-circle" id="verifyBtnIcon"></i> <span id="verifyBtnText">Verify Code</span>';
                    return;
                }
                const u = data.user;
                localStorage.setItem('diariCoreUser', JSON.stringify({
                    ...u,
                    isLoggedIn: true,
                    loginTime: new Date().toISOString()
                }));
                if (data.csrfToken && window.DiariApi && typeof window.DiariApi.setCsrfToken === 'function') {
                    window.DiariApi.setCsrfToken(data.csrfToken);
                }
                sessionStorage.removeItem('pendingRegistrationEmail');
                window.location.href = 'dashboard.html';
            })
            .catch(() => {
                setError('Could not verify right now. Please try again.');
                verifyBtn.disabled = false;
                verifyBtn.classList.remove('is-loading');
                verifyBtn.innerHTML = '<i class="bi bi-check2-circle" id="verifyBtnIcon"></i> <span id="verifyBtnText">Verify Code</span>';
            });
    });

    resendBtn.addEventListener('click', () => {
        if (resendBtn.disabled) return;
        resendBtn.disabled = true;
        resendBtn.textContent = 'Resending...';
        clearErrors();

        fetch('/api/register/resend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        })
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) {
                    setError(data.error || 'Failed to resend code.');
                    resendBtn.disabled = false;
                    resendBtn.textContent = 'Resend Code';
                    return;
                }
                seconds = 10 * 60;
                renderTimer();
                inputs.forEach(i => i.value = '');
                inputs[0].focus();
                updateBtn();
                setSuccess('Verification code has been resent to your email.');
                startResendCooldown();
            })
            .catch(() => {
                setError('Failed to resend code.');
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend Code';
            });
    });

    inputs[0]?.focus();
    updateBtn();
});

