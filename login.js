// DiariCore Login Page JavaScript - Sliding Panel Version

document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialMode = (urlParams.get('mode') || '').toLowerCase();
    // Container and panels
    const loginContainer = document.getElementById('loginContainer');
    
    // Form sections
    const signinSection = document.getElementById('signinSection');
    const signupSection = document.getElementById('signupSection');
    const signinWelcome = document.getElementById('signinWelcome');
    const signupWelcome = document.getElementById('signupWelcome');
    
    // Switch buttons
    const showSignUpBtn = document.getElementById('showSignUpBtn');
    const showSignInBtn = document.getElementById('showSignInBtn');
    const mobileSwitchToSignUp = document.getElementById('mobileSwitchToSignUp');
    const mobileSwitchToSignIn = document.getElementById('mobileSwitchToSignIn');
    
    // Forms
    const loginForm = document.getElementById('loginForm');
    const signUpForm = document.getElementById('signUpForm');
    const otpSection = document.getElementById('otpSection');
    const otpEmailDisplay = document.getElementById('otpEmailDisplay');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const otpBackBtn = document.getElementById('otpBackBtn');
    const otpCodeError = document.getElementById('otpCode-error');
    const otpTimerLabel = document.getElementById('otpTimerLabel');
    const otpDigits = Array.from(document.querySelectorAll('.otp-digit'));
    
    // Password toggles
    const togglePassword = document.getElementById('togglePassword');
    const toggleSignUpPassword = document.getElementById('toggleSignUpPassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const passwordInput = document.getElementById('password');
    const signUpPasswordInput = document.getElementById('signUpPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    // Google buttons
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const googleSignUpBtn = document.getElementById('googleSignUpBtn');
    let pendingRegistrationEmail = '';
    let otpTimerInterval = null;
    let otpExpirySeconds = 0;
    
    // Switch to Sign Up mode
    function switchToSignUp() {
        loginContainer.classList.add('signup-mode');
        if (otpSection) otpSection.classList.add('hidden');
        if (signupSection) signupSection.classList.remove('hidden');
        
        // Fade out current content
        signinSection.style.opacity = '0';
        signinWelcome.style.opacity = '0';
        signupWelcome.classList.add('hidden');
        
        setTimeout(() => {
            signinSection.classList.add('hidden');
            signupSection.classList.remove('hidden');
            signinWelcome.classList.add('hidden');
            signupWelcome.classList.remove('hidden');
            
            // Fade in new content
            signupSection.style.opacity = '0';
            signupWelcome.style.opacity = '0';
            
            setTimeout(() => {
                signupSection.style.opacity = '1';
                signupWelcome.style.opacity = '1';
            }, 50);
        }, 300);
    }
    
    // Switch to Sign In mode
    function switchToSignIn() {
        // Hide signup welcome immediately to prevent flash during panel swap
        signupWelcome.classList.add('hidden');
        signupWelcome.style.opacity = '0';
        if (otpTimerInterval) {
            clearInterval(otpTimerInterval);
            otpTimerInterval = null;
        }
        if (otpSection) otpSection.classList.add('hidden');
        if (signupSection) signupSection.classList.remove('hidden');
        loginContainer.classList.remove('signup-mode');
        
        // Fade out current content
        signupSection.style.opacity = '0';
        signinWelcome.classList.add('hidden');
        
        setTimeout(() => {
            signupSection.classList.add('hidden');
            signinSection.classList.remove('hidden');
            signupWelcome.classList.add('hidden');
            signinWelcome.classList.remove('hidden');
            
            // Fade in new content
            signinSection.style.opacity = '0';
            signinWelcome.style.opacity = '0';
            
            setTimeout(() => {
                signinSection.style.opacity = '1';
                signinWelcome.style.opacity = '1';
            }, 50);
        }, 300);
    }
    
    // Event listeners for switching
    if (showSignUpBtn) {
        showSignUpBtn.addEventListener('click', switchToSignUp);
    }
    
    if (showSignInBtn) {
        showSignInBtn.addEventListener('click', switchToSignIn);
    }
    
    if (mobileSwitchToSignUp) {
        mobileSwitchToSignUp.addEventListener('click', function(e) {
            e.preventDefault();
            switchToSignUp();
        });
    }
    
    if (mobileSwitchToSignIn) {
        mobileSwitchToSignIn.addEventListener('click', function(e) {
            e.preventDefault();
            switchToSignIn();
        });
    }
    
    // Password toggle functionality
    function setupPasswordToggle(toggleBtn, passwordField) {
        if (toggleBtn && passwordField) {
            toggleBtn.addEventListener('click', function() {
                const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordField.setAttribute('type', type);
                
                // Toggle icon
                this.classList.toggle('bi-eye');
                this.classList.toggle('bi-eye-slash');
            });
        }
    }
    
    setupPasswordToggle(togglePassword, passwordInput);
    setupPasswordToggle(toggleSignUpPassword, signUpPasswordInput);
    setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);
    
    // Email validation
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function showOtpError(message) {
        if (!otpCodeError) return;
        otpCodeError.textContent = message;
        otpCodeError.classList.add('show');
    }

    function hideOtpError() {
        if (!otpCodeError) return;
        otpCodeError.classList.remove('show');
    }

    function getOtpCode() {
        return otpDigits.map((d) => d.value).join('');
    }

    function updateOtpButtonState() {
        if (!verifyOtpBtn) return;
        verifyOtpBtn.disabled = getOtpCode().length !== 6;
    }

    function resetOtpInputs() {
        otpDigits.forEach((d) => {
            d.value = '';
            d.classList.remove('error');
        });
        updateOtpButtonState();
        hideOtpError();
        if (otpDigits[0]) otpDigits[0].focus();
    }

    function startOtpCountdown(seconds) {
        otpExpirySeconds = seconds;
        if (otpTimerInterval) clearInterval(otpTimerInterval);
        const render = () => {
            const m = Math.floor(otpExpirySeconds / 60);
            const s = otpExpirySeconds % 60;
            if (otpTimerLabel) otpTimerLabel.textContent = `Code expires in ${m}:${String(s).padStart(2, '0')}`;
        };
        render();
        otpTimerInterval = setInterval(() => {
            otpExpirySeconds -= 1;
            if (otpExpirySeconds <= 0) {
                clearInterval(otpTimerInterval);
                if (otpTimerLabel) otpTimerLabel.textContent = 'Code expired. Resend a new one.';
                return;
            }
            render();
        }, 1000);
    }

    function showOtpSection(email) {
        pendingRegistrationEmail = email;
        if (otpEmailDisplay) otpEmailDisplay.textContent = email;
        signupSection.classList.add('hidden');
        if (otpSection) otpSection.classList.remove('hidden');
        resetOtpInputs();
        startOtpCountdown(10 * 60);
    }

    const availabilityState = {
        nickname: { lastCheckedValue: '', isAvailable: null, pendingPromise: null },
        signUpEmail: { lastCheckedValue: '', isAvailable: null, pendingPromise: null }
    };
    const availabilityTimers = { nickname: null, signUpEmail: null };

    function resetAvailability(fieldId) {
        if (!availabilityState[fieldId]) return;
        availabilityState[fieldId].lastCheckedValue = '';
        availabilityState[fieldId].isAvailable = null;
        availabilityState[fieldId].pendingPromise = null;
    }

    function checkFieldAvailability(fieldId, value) {
        if (!availabilityState[fieldId]) return Promise.resolve(true);
        const state = availabilityState[fieldId];

        if (state.lastCheckedValue === value && state.isAvailable !== null) {
            return Promise.resolve(state.isAvailable);
        }
        if (state.lastCheckedValue === value && state.pendingPromise) {
            return state.pendingPromise;
        }

        const apiField = fieldId === 'nickname' ? 'nickname' : 'email';
        state.lastCheckedValue = value;
        state.isAvailable = null;

        state.pendingPromise = fetch(`/api/check-availability?field=${encodeURIComponent(apiField)}&value=${encodeURIComponent(value)}`)
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) return true;
                if (state.lastCheckedValue !== value) return true;
                state.isAvailable = !!data.available;
                if (state.isAvailable) {
                    showSuccess(document.getElementById(fieldId));
                    return true;
                }
                showError(document.getElementById(fieldId), data.message || (fieldId === 'nickname' ? 'Nickname already exists.' : 'Email already exists.'));
                return false;
            })
            .catch(() => true)
            .finally(() => {
                if (state.lastCheckedValue === value) {
                    state.pendingPromise = null;
                }
            });

        return state.pendingPromise;
    }

    function scheduleAvailabilityCheck(fieldId, value) {
        if (!availabilityState[fieldId]) return;
        if (availabilityTimers[fieldId]) {
            clearTimeout(availabilityTimers[fieldId]);
        }
        availabilityTimers[fieldId] = setTimeout(() => {
            checkFieldAvailability(fieldId, value);
        }, 300);
    }
    
    // Show error message
    function showError(inputElement, message) {
        inputElement.classList.add('error');
        inputElement.classList.remove('success');

        const customError = document.getElementById(`${inputElement.id}-error`);
        if (customError) {
            customError.textContent = message;
            customError.classList.add('show');
            return;
        }

        let errorDiv = inputElement.parentElement.nextElementSibling;
        if (!errorDiv || !errorDiv.classList.contains('error-message')) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            inputElement.parentElement.after(errorDiv);
        }

        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }
    
    // Show success state
    function showSuccess(inputElement) {
        inputElement.classList.remove('error');
        inputElement.classList.add('success');

        const customError = document.getElementById(`${inputElement.id}-error`);
        if (customError) {
            customError.classList.remove('show');
        }

        const errorDiv = inputElement.parentElement.nextElementSibling;
        if (errorDiv && errorDiv.classList.contains('error-message')) {
            errorDiv.classList.remove('show');
        }
    }
    
    // Clear validation
    function clearValidation(inputElement) {
        inputElement.classList.remove('error', 'success');
        const customError = document.getElementById(`${inputElement.id}-error`);
        if (customError) {
            customError.classList.remove('show');
        }
        const errorDiv = inputElement.parentElement.nextElementSibling;
        if (errorDiv && errorDiv.classList.contains('error-message')) {
            errorDiv.classList.remove('show');
        }
    }

    function validateSignUpField(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return true;

        const value = field.value.trim();

        if (fieldId === 'nickname') {
            if (!value) {
                resetAvailability('nickname');
                return showError(field, 'Nickname is required.'), false;
            }
            if (value.length < 4 || value.length > 64) {
                resetAvailability('nickname');
                return showError(field, 'Field must be between 4 and 64 characters long.'), false;
            }
            scheduleAvailabilityCheck('nickname', value);
            return true;
        }

        if (fieldId === 'signUpEmail') {
            if (!value) {
                resetAvailability('signUpEmail');
                return showError(field, 'Email is required.'), false;
            }
            if (!isValidEmail(value)) {
                resetAvailability('signUpEmail');
                return showError(field, 'Please enter a valid email.'), false;
            }
            scheduleAvailabilityCheck('signUpEmail', value);
            return true;
        }

        if (fieldId === 'firstName') {
            if (!value) return showError(field, 'First name is required.'), false;
            showSuccess(field); return true;
        }

        if (fieldId === 'lastName') {
            if (!value) return showError(field, 'Last name is required.'), false;
            showSuccess(field); return true;
        }

        if (fieldId === 'gender') {
            if (!value) return showError(field, 'Gender is required.'), false;
            showSuccess(field); return true;
        }

        if (fieldId === 'birthday') {
            if (!value) return showError(field, 'Date of birth is required.'), false;
            showSuccess(field); return true;
        }

        if (fieldId === 'signUpPassword') {
            if (!value) return showError(field, 'Password is required.'), false;
            if (value.length < 8) return showError(field, 'Password must be at least 8 characters.'), false;
            showSuccess(field);
            // Re-validate confirm password when password changes
            if (document.getElementById('confirmPassword')?.value.trim()) {
                validateSignUpField('confirmPassword');
            }
            return true;
        }

        if (fieldId === 'confirmPassword') {
            const pass = document.getElementById('signUpPassword').value;
            if (!value) return showError(field, 'Password confirmation is required.'), false;
            if (value !== pass) return showError(field, 'Passwords do not match.'), false;
            showSuccess(field); return true;
        }

        return true;
    }
    
    // Login form submission
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            let isValid = true;
            
            // Validate email
            if (!email) {
                showError(document.getElementById('email'), 'Email is required.');
                isValid = false;
            } else if (email.toLowerCase() !== 'admin' && !isValidEmail(email)) {
                showError(document.getElementById('email'), 'Please enter a valid email.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('email'));
            }
            
            // Validate password
            if (!password) {
                showError(document.getElementById('password'), 'Password is required.');
                isValid = false;
            } else if (password.length < 8) {
                showError(document.getElementById('password'), 'Password must be at least 8 characters.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('password'));
            }
            
            if (isValid) {
                const submitBtn = loginForm.querySelector('.btn-signin');
                submitBtn.textContent = 'Signing In...';
                submitBtn.disabled = true;
                
                fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, password: password })
                })
                    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                    .then(({ ok, data }) => {
                        if (!ok || !data.success) {
                            showNotification(data.error || 'Sign in failed', 'error');
                            submitBtn.textContent = 'SIGN IN';
                            submitBtn.disabled = false;
                            return;
                        }
                        const u = data.user;
                        localStorage.setItem('diariCoreUser', JSON.stringify({
                            ...u,
                            isLoggedIn: true,
                            loginTime: new Date().toISOString()
                        }));
                        if (u.isAdmin) {
                            showNotification('Admin login successful! Redirecting...', 'success');
                            setTimeout(() => {
                                window.location.href = 'admin';
                            }, 500);
                            return;
                        }
                        showNotification('Login successful! Redirecting...', 'success');
                        setTimeout(() => {
                            window.location.href = 'dashboard.html';
                        }, 900);
                    })
                    .catch(() => {
                        showNotification('Could not reach the server. Run the DiariCore app (Flask) or check your connection.', 'error');
                        submitBtn.textContent = 'SIGN IN';
                        submitBtn.disabled = false;
                    });
            }
        });
    }
    
    // Sign up form submission
    if (signUpForm) {
        signUpForm.addEventListener('submit', async function(e) {
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
            
            // Validate nickname
            if (!nickname) {
                showError(document.getElementById('nickname'), 'Nickname is required.');
                isValid = false;
            } else if (nickname.length < 4 || nickname.length > 64) {
                showError(document.getElementById('nickname'), 'Field must be between 4 and 64 characters long.');
                isValid = false;
            }

            // Validate first name
            if (!firstName) {
                showError(document.getElementById('firstName'), 'First name is required.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('firstName'));
            }

            // Validate last name
            if (!lastName) {
                showError(document.getElementById('lastName'), 'Last name is required.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('lastName'));
            }

            // Validate gender
            if (!gender) {
                showError(document.getElementById('gender'), 'Gender is required.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('gender'));
            }

            // Validate birthday
            if (!birthday) {
                showError(document.getElementById('birthday'), 'Date of birth is required.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('birthday'));
            }
            
            // Validate email
            if (!email) {
                showError(document.getElementById('signUpEmail'), 'Email is required.');
                isValid = false;
            } else if (!isValidEmail(email)) {
                showError(document.getElementById('signUpEmail'), 'Please enter a valid email.');
                isValid = false;
            }
            
            // Validate password
            if (!password) {
                showError(document.getElementById('signUpPassword'), 'Password is required.');
                isValid = false;
            } else if (password.length < 8) {
                showError(document.getElementById('signUpPassword'), 'Password must be at least 8 characters.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('signUpPassword'));
            }

            // Validate confirm password
            if (!confirmPassword) {
                showError(document.getElementById('confirmPassword'), 'Password confirmation is required.');
                isValid = false;
            } else if (confirmPassword !== password) {
                showError(document.getElementById('confirmPassword'), 'Passwords do not match.');
                isValid = false;
            } else {
                showSuccess(document.getElementById('confirmPassword'));
            }
            
            if (isValid) {
                const nicknameAvailable = await checkFieldAvailability('nickname', nickname);
                const emailAvailable = await checkFieldAvailability('signUpEmail', email);
                if (!nicknameAvailable || !emailAvailable) {
                    return;
                }

                const submitBtn = signUpForm.querySelector('.btn-signin');
                submitBtn.textContent = 'Sending Code...';
                submitBtn.disabled = true;
                
                fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nickname: nickname,
                        email: email,
                        password: password,
                        firstName: firstName,
                        lastName: lastName,
                        gender: gender,
                        birthday: birthday
                    })
                })
                    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                    .then(({ ok, data }) => {
                        if (!data.success) {
                            if (data.field) {
                                const el = document.getElementById(data.field);
                                if (el) {
                                    showError(el, data.error || 'Invalid value');
                                } else {
                                    showNotification(data.error || 'Registration failed', 'error');
                                }
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
            }
        });
    }

    if (otpDigits.length) {
        otpDigits.forEach((input, idx) => {
            input.addEventListener('input', (e) => {
                const v = e.target.value.replace(/\D/g, '').slice(-1);
                e.target.value = v;
                e.target.classList.remove('error');
                hideOtpError();
                if (v && idx < otpDigits.length - 1) {
                    otpDigits[idx + 1].focus();
                }
                updateOtpButtonState();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && idx > 0) {
                    otpDigits[idx - 1].focus();
                }
            });
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
                otpDigits.forEach((d, i) => {
                    d.value = digits[i] || '';
                });
                updateOtpButtonState();
            });
        });
    }

    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener('click', () => {
            const otpCode = getOtpCode();
            if (otpCode.length !== 6) {
                showOtpError('Please enter the 6-digit code.');
                otpDigits.forEach((d) => d.classList.add('error'));
                return;
            }
            verifyOtpBtn.disabled = true;
            verifyOtpBtn.textContent = 'Verifying...';
            fetch('/api/register/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: pendingRegistrationEmail, otpCode })
            })
                .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        showOtpError(data.error || 'Invalid verification code.');
                        otpDigits.forEach((d) => d.classList.add('error'));
                        verifyOtpBtn.disabled = false;
                        verifyOtpBtn.textContent = 'VERIFY CODE';
                        return;
                    }
                    const u = data.user;
                    localStorage.setItem('diariCoreUser', JSON.stringify({
                        ...u,
                        isLoggedIn: true,
                        loginTime: new Date().toISOString()
                    }));
                    showNotification('Account verified successfully! Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 700);
                })
                .catch(() => {
                    showOtpError('Could not verify right now. Please try again.');
                    verifyOtpBtn.disabled = false;
                    verifyOtpBtn.textContent = 'VERIFY CODE';
                });
        });
    }

    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', () => {
            if (!pendingRegistrationEmail || resendOtpBtn.disabled) return;
            resendOtpBtn.disabled = true;
            fetch('/api/register/resend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: pendingRegistrationEmail })
            })
                .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        showOtpError(data.error || 'Failed to resend code.');
                        return;
                    }
                    showNotification('Verification code resent.', 'success');
                    resetOtpInputs();
                    startOtpCountdown(10 * 60);
                })
                .catch(() => showOtpError('Failed to resend code.'))
                .finally(() => {
                    setTimeout(() => {
                        resendOtpBtn.disabled = false;
                    }, 1200);
                });
        });
    }

    if (otpBackBtn) {
        otpBackBtn.addEventListener('click', () => {
            if (otpTimerInterval) {
                clearInterval(otpTimerInterval);
                otpTimerInterval = null;
            }
            if (otpSection) otpSection.classList.add('hidden');
            signupSection.classList.remove('hidden');
            hideOtpError();
        });
    }
    
    // Google buttons
    if (googleSignInBtn) {
        googleSignInBtn.addEventListener('click', function() {
            showNotification('Google Sign In coming soon!', 'info');
        });
    }
    
    if (googleSignUpBtn) {
        googleSignUpBtn.addEventListener('click', function() {
            showNotification('Google Sign Up coming soon!', 'info');
        });
    }
    
    // Forgot password
    const forgotPassword = document.querySelector('.forgot-password');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            
            if (!email) {
                showNotification('Please enter your email address first', 'error');
                document.getElementById('email').focus();
            } else if (!isValidEmail(email)) {
                showNotification('Please enter a valid email address', 'error');
            } else {
                showNotification('Password reset link sent to your email!', 'success');
            }
        });
    }
    
    // Notification function
    function showNotification(message, type = 'info') {
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        
        notification.innerHTML = `
            <i class="bi bi-${icon}"></i>
            <span>${message}</span>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            border-radius: 10px;
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
        `;
        
        if (type === 'success') {
            notification.style.backgroundColor = '#7FBF9F';
            notification.style.color = 'white';
        } else if (type === 'error') {
            notification.style.backgroundColor = '#e74c3c';
            notification.style.color = 'white';
        } else {
            notification.style.backgroundColor = '#7FA7BF';
            notification.style.color = 'white';
        }
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }
    
    // Check auth status
    function checkAuthStatus() {
        const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        if (user && user.isLoggedIn) {
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage === 'index.html' || currentPage === '' || currentPage === 'login.html') {
                if (user.isAdmin) {
                    window.location.href = 'admin';
                    return;
                }
                window.location.href = 'dashboard.html';
            }
        }
    }
    
    checkAuthStatus();

    const signUpFieldIds = [
        'nickname',
        'signUpEmail',
        'firstName',
        'lastName',
        'gender',
        'birthday',
        'signUpPassword',
        'confirmPassword'
    ];

    signUpFieldIds.forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (!field) return;
        field.addEventListener('blur', () => validateSignUpField(fieldId));
        field.addEventListener('input', () => validateSignUpField(fieldId));
        field.addEventListener('change', () => validateSignUpField(fieldId));
    });
    
    // Floating Label Animation
    function initFloatingLabels() {
        const inputWrappers = document.querySelectorAll('.input-wrapper');
        
        inputWrappers.forEach(wrapper => {
            const input = wrapper.querySelector('.form-input');
            
            if (input) {
                const syncHasContent = () => {
                    const v = (input.value ?? '').toString().trim();
                    if (v !== '') {
                        wrapper.classList.add('has-content');
                    } else {
                        wrapper.classList.remove('has-content');
                    }
                };
                // Check on load if input has value
                syncHasContent();
                
                // Add event listeners
                input.addEventListener('input', function() {
                    syncHasContent();
                });

                // Selects often only emit change, not input (fixes "Gender selected but looks blank")
                input.addEventListener('change', function() {
                    syncHasContent();
                });
                
                input.addEventListener('blur', function() {
                    syncHasContent();
                });
                
                input.addEventListener('focus', function() {
                    wrapper.classList.add('has-content');
                });
            }
        });
    }
    
    initFloatingLabels();

    if (initialMode === 'signup') {
        // Ensure the correct view when coming back from verification page
        switchToSignUp();
    }
});
