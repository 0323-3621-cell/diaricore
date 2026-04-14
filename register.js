document.addEventListener('DOMContentLoaded', function () {
    const signUpForm = document.getElementById('signUpForm');
    const toggleSignUpPassword = document.getElementById('toggleSignUpPassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const signUpPasswordInput = document.getElementById('signUpPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    const availabilityState = {
        nickname: { lastCheckedValue: '', isAvailable: null, pendingPromise: null },
        signUpEmail: { lastCheckedValue: '', isAvailable: null, pendingPromise: null }
    };
    const availabilityTimers = { nickname: null, signUpEmail: null };

    function setupPasswordToggle(toggleBtn, passwordField) {
        if (!toggleBtn || !passwordField) return;
        toggleBtn.addEventListener('click', function () {
            const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordField.setAttribute('type', type);
            this.classList.toggle('bi-eye');
            this.classList.toggle('bi-eye-slash');
        });
    }

    setupPasswordToggle(toggleSignUpPassword, signUpPasswordInput);
    setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function showError(inputElement, message) {
        inputElement.classList.add('error');
        inputElement.classList.remove('success');
        const customError = document.getElementById(`${inputElement.id}-error`);
        if (customError) {
            customError.textContent = message;
            customError.classList.add('show');
        }
    }

    function showSuccess(inputElement) {
        inputElement.classList.remove('error');
        inputElement.classList.add('success');
        const customError = document.getElementById(`${inputElement.id}-error`);
        if (customError) customError.classList.remove('show');
    }

    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) existing.remove();
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        notification.innerHTML = `<i class="bi bi-${icon}"></i><span>${message}</span>`;
        notification.style.cssText = 'position:fixed;top:20px;right:20px;padding:1rem 1.5rem;border-radius:10px;display:flex;align-items:center;gap:.75rem;font-weight:500;z-index:10000;box-shadow:0 4px 20px rgba(0,0,0,.15);transform:translateX(100%);transition:transform .3s ease;max-width:420px;';
        if (type === 'success') { notification.style.backgroundColor = '#7FBF9F'; notification.style.color = 'white'; }
        else if (type === 'error') { notification.style.backgroundColor = '#e74c3c'; notification.style.color = 'white'; }
        else { notification.style.backgroundColor = '#7FA7BF'; notification.style.color = 'white'; }
        document.body.appendChild(notification);
        setTimeout(() => { notification.style.transform = 'translateX(0)'; }, 10);
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    function resetAvailability(fieldId) {
        if (!availabilityState[fieldId]) return;
        availabilityState[fieldId].lastCheckedValue = '';
        availabilityState[fieldId].isAvailable = null;
        availabilityState[fieldId].pendingPromise = null;
    }

    function checkFieldAvailability(fieldId, value) {
        if (!availabilityState[fieldId]) return Promise.resolve(true);
        const state = availabilityState[fieldId];
        if (state.lastCheckedValue === value && state.isAvailable !== null) return Promise.resolve(state.isAvailable);
        if (state.lastCheckedValue === value && state.pendingPromise) return state.pendingPromise;
        const apiField = fieldId === 'nickname' ? 'nickname' : 'email';
        state.lastCheckedValue = value;
        state.isAvailable = null;
        state.pendingPromise = fetch(`/api/check-availability?field=${encodeURIComponent(apiField)}&value=${encodeURIComponent(value)}`)
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) return true;
                if (state.lastCheckedValue !== value) return true;
                state.isAvailable = !!data.available;
                const el = document.getElementById(fieldId);
                if (!el) return state.isAvailable;
                if (state.isAvailable) {
                    showSuccess(el);
                    return true;
                }
                showError(el, data.message || (fieldId === 'nickname' ? 'Nickname already exists.' : 'Email already exists.'));
                return false;
            })
            .catch(() => true)
            .finally(() => {
                if (state.lastCheckedValue === value) state.pendingPromise = null;
            });
        return state.pendingPromise;
    }

    function scheduleAvailabilityCheck(fieldId, value) {
        if (!availabilityState[fieldId]) return;
        if (availabilityTimers[fieldId]) clearTimeout(availabilityTimers[fieldId]);
        availabilityTimers[fieldId] = setTimeout(() => checkFieldAvailability(fieldId, value), 300);
    }

    function validateSignUpField(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return true;
        const value = field.value.trim();
        if (fieldId === 'nickname') {
            if (!value) { resetAvailability('nickname'); showError(field, 'Nickname is required.'); return false; }
            if (value.length < 4 || value.length > 64) { resetAvailability('nickname'); showError(field, 'Field must be between 4 and 64 characters long.'); return false; }
            scheduleAvailabilityCheck('nickname', value);
            return true;
        }
        if (fieldId === 'signUpEmail') {
            if (!value) { resetAvailability('signUpEmail'); showError(field, 'Email is required.'); return false; }
            if (!isValidEmail(value)) { resetAvailability('signUpEmail'); showError(field, 'Please enter a valid email.'); return false; }
            scheduleAvailabilityCheck('signUpEmail', value);
            return true;
        }
        if (fieldId === 'firstName') { if (!value) { showError(field, 'First name is required.'); return false; } showSuccess(field); return true; }
        if (fieldId === 'lastName') { if (!value) { showError(field, 'Last name is required.'); return false; } showSuccess(field); return true; }
        if (fieldId === 'gender') { if (!value) { showError(field, 'Gender is required.'); return false; } showSuccess(field); return true; }
        if (fieldId === 'birthday') { if (!value) { showError(field, 'Date of birth is required.'); return false; } showSuccess(field); return true; }
        if (fieldId === 'signUpPassword') {
            if (!value) { showError(field, 'Password is required.'); return false; }
            if (value.length < 8) { showError(field, 'Password must be at least 8 characters.'); return false; }
            showSuccess(field);
            if (document.getElementById('confirmPassword')?.value.trim()) validateSignUpField('confirmPassword');
            return true;
        }
        if (fieldId === 'confirmPassword') {
            const pass = document.getElementById('signUpPassword').value;
            if (!value) { showError(field, 'Password confirmation is required.'); return false; }
            if (value !== pass) { showError(field, 'Passwords do not match.'); return false; }
            showSuccess(field); return true;
        }
        return true;
    }

    const signUpFieldIds = ['nickname', 'signUpEmail', 'firstName', 'lastName', 'gender', 'birthday', 'signUpPassword', 'confirmPassword'];
    signUpFieldIds.forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.addEventListener('blur', () => validateSignUpField(fieldId));
        field.addEventListener('input', () => validateSignUpField(fieldId));
        field.addEventListener('change', () => validateSignUpField(fieldId));
    });

    function initFloatingLabels() {
        document.querySelectorAll('.input-wrapper').forEach((wrapper) => {
            const input = wrapper.querySelector('.form-input');
            if (!input) return;
            const sync = () => {
                const v = (input.value ?? '').toString().trim();
                if (v !== '') wrapper.classList.add('has-content');
                else wrapper.classList.remove('has-content');
            };
            sync();
            input.addEventListener('input', sync);
            input.addEventListener('change', sync);
            input.addEventListener('blur', sync);
            input.addEventListener('focus', () => wrapper.classList.add('has-content'));
        });
    }

    initFloatingLabels();

    const googleSignUpBtn = document.getElementById('googleSignUpBtn');
    if (googleSignUpBtn) googleSignUpBtn.addEventListener('click', () => showNotification('Google Sign Up coming soon!', 'info'));

    if (signUpForm) {
        signUpForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const nickname = document.getElementById('nickname').value.trim();
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const gender = document.getElementById('gender').value;
            const birthday = document.getElementById('birthday').value;
            const email = document.getElementById('signUpEmail').value.trim();
            const password = document.getElementById('signUpPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            let isValid = true;
            if (!validateSignUpField('nickname')) isValid = false;
            if (!validateSignUpField('firstName')) isValid = false;
            if (!validateSignUpField('lastName')) isValid = false;
            if (!validateSignUpField('gender')) isValid = false;
            if (!validateSignUpField('birthday')) isValid = false;
            if (!validateSignUpField('signUpEmail')) isValid = false;
            if (!validateSignUpField('signUpPassword')) isValid = false;
            if (!validateSignUpField('confirmPassword')) isValid = false;
            if (!isValid) return;

            const nicknameAvailable = await checkFieldAvailability('nickname', nickname);
            const emailAvailable = await checkFieldAvailability('signUpEmail', email);
            if (!nicknameAvailable || !emailAvailable) return;

            const submitBtn = signUpForm.querySelector('.btn-signin');
            submitBtn.textContent = 'Sending Code...';
            submitBtn.disabled = true;

            fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nickname,
                    email,
                    password,
                    firstName,
                    lastName,
                    gender,
                    birthday
                })
            })
                .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        if (data.field) {
                            const el = document.getElementById(data.field);
                            if (el) showError(el, data.error || 'Invalid value');
                            else showNotification(data.error || 'Registration failed', 'error');
                        } else {
                            showNotification(data.error || 'Registration failed', 'error');
                        }
                        submitBtn.textContent = 'SIGN UP';
                        submitBtn.disabled = false;
                        return;
                    }
                    const pendingEmail = data.email || email;
                    sessionStorage.setItem('pendingRegistrationEmail', pendingEmail);
                    showNotification(data.message || 'Verification code sent to your email.', 'success');
                    submitBtn.textContent = 'SIGN UP';
                    submitBtn.disabled = false;
                    setTimeout(() => {
                        window.location.href = `verify-registration.html?email=${encodeURIComponent(pendingEmail)}`;
                    }, 450);
                })
                .catch(() => {
                    showNotification('Could not reach the server. Run the DiariCore app (Flask) or check your connection.', 'error');
                    submitBtn.textContent = 'SIGN UP';
                    submitBtn.disabled = false;
                });
        });
    }
});

