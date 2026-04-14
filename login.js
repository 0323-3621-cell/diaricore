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
    const resetModal = document.getElementById('resetModal');
    const resetBackdrop = document.getElementById('resetBackdrop');
    const resetCloseBtn = document.getElementById('resetCloseBtn');
    const resetAlert = document.getElementById('resetAlert');
    const resetRequestForm = document.getElementById('resetRequestForm');
    const resetConfirmForm = document.getElementById('resetConfirmForm');
    const resetIdentifierInput = document.getElementById('resetIdentifier');
    const resetCodeInput = document.getElementById('resetCode');
    const resetNewPasswordInput = document.getElementById('resetNewPassword');
    const resetConfirmPasswordInput = document.getElementById('resetConfirmPassword');
    const sendResetCodeBtn = document.getElementById('sendResetCodeBtn');
    const verifyResetCodeBtn = document.getElementById('verifyResetCodeBtn');
    const resendResetCodeBtn = document.getElementById('resendResetCodeBtn');
    const resetTimerLabel = document.getElementById('resetTimerLabel');
    const resetOtpDigits = Array.from(document.querySelectorAll('.reset-otp-digit'));
    const confirmResetBtn = document.getElementById('confirmResetBtn');
    const resetVerifyBackBtn = document.getElementById('resetVerifyBackBtn');
    const resetPasswordBackBtn = document.getElementById('resetPasswordBackBtn');
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    const resetSubtitle = document.getElementById('resetSubtitle');
    let pendingRegistrationEmail = '';
    let otpTimerInterval = null;
    let otpExpirySeconds = 0;
    let resetIdentifier = '';
    let verifiedResetCode = '';
    let resetResendInterval = null;
    let resetResendRemaining = 0;
    let resetVerifyInProgress = false;
    let resetAutoVerifyTimeout = null;
    
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
                showError(document.getElementById(fieldId), data.message || (fieldId === 'nickname' ? 'Username already exists.' : 'Email already exists.'));
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
                return showError(field, 'Username is required.'), false;
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
            
            const username = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            
            let isValid = true;
            
            // Validate username
            if (!username) {
                showError(document.getElementById('email'), 'Username is required.');
                isValid = false;
            } else if (username.length < 4 || username.length > 64) {
                showError(document.getElementById('email'), 'Field must be between 4 and 64 characters long.');
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
                    body: JSON.stringify({ username: username, password: password })
                })
                    .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                    .then(({ ok, data }) => {
                        if (!ok || !data.success) {
                            const usernameField = document.getElementById('email');
                            const passwordField = document.getElementById('password');
                            const loginError = data.error || 'Invalid username or password.';
                            if (usernameField) {
                                usernameField.classList.add('error');
                                usernameField.classList.remove('success');
                            }
                            if (passwordField) {
                                passwordField.value = '';
                                showError(passwordField, loginError);
                                passwordField.focus();
                            }
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

    const signInUsernameField = document.getElementById('email');
    const signInPasswordField = document.getElementById('password');

    if (signInUsernameField) {
        signInUsernameField.addEventListener('input', function () {
            const value = this.value.trim();
            if (!value) {
                showError(this, 'Username is required.');
                return;
            }
            if (value.length < 4 || value.length > 64) {
                showError(this, 'Field must be between 4 and 64 characters long.');
                return;
            }
            showSuccess(this);
        });
        signInUsernameField.addEventListener('blur', function () {
            const value = this.value.trim();
            if (!value) {
                showError(this, 'Username is required.');
                return;
            }
            if (value.length < 4 || value.length > 64) {
                showError(this, 'Field must be between 4 and 64 characters long.');
                return;
            }
            showSuccess(this);
        });
    }

    if (signInPasswordField) {
        signInPasswordField.addEventListener('input', function () {
            const value = this.value;
            if (!value) {
                showError(this, 'Password is required.');
                return;
            }
            if (value.length < 8) {
                showError(this, 'Password must be at least 8 characters.');
                return;
            }
            showSuccess(this);
        });
        signInPasswordField.addEventListener('blur', function () {
            const value = this.value;
            if (!value) {
                showError(this, 'Password is required.');
                return;
            }
            if (value.length < 8) {
                showError(this, 'Password must be at least 8 characters.');
                return;
            }
            showSuccess(this);
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
                showError(document.getElementById('nickname'), 'Username is required.');
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
    
    function setResetAlert(message, type = 'error') {
        if (!resetAlert) return;
        resetAlert.textContent = message;
        resetAlert.className = `reset-alert ${type}`;
        resetAlert.hidden = false;
    }

    function clearResetAlert() {
        if (!resetAlert) return;
        resetAlert.hidden = true;
        resetAlert.textContent = '';
        resetAlert.className = 'reset-alert';
    }

    function resetOtpInputs() {
        if (resetAutoVerifyTimeout) {
            clearTimeout(resetAutoVerifyTimeout);
            resetAutoVerifyTimeout = null;
        }
        resetOtpDigits.forEach((d) => {
            d.value = '';
        });
    }

    function getResetOtpCode() {
        return resetOtpDigits.map((d) => d.value).join('');
    }

    function setVerifyResetButtonLoading(isLoading) {
        if (!verifyResetCodeBtn) return;
        verifyResetCodeBtn.disabled = isLoading;
        verifyResetCodeBtn.classList.toggle('is-loading', isLoading);
        if (isLoading) {
            verifyResetCodeBtn.innerHTML = '<span class="reset-btn-spinner" aria-hidden="true"></span><span>Verifying...</span>';
            return;
        }
        verifyResetCodeBtn.textContent = 'Verify Code';
    }

    function submitResetCodeVerification() {
        if (resetVerifyInProgress) return;
        const code = getResetOtpCode();
        if (code.length !== 6) {
            setResetAlert('Please enter the 6-digit reset code.');
            return;
        }

        resetVerifyInProgress = true;
        setVerifyResetButtonLoading(true);

        fetch('/api/password/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: resetIdentifier || (resetIdentifierInput?.value || '').trim(), code })
        })
            .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
            .then(({ ok, data }) => {
                if (!ok || !data.success) {
                    setResetAlert(data.error || 'Invalid or expired reset code.');
                    return;
                }
                verifiedResetCode = code;
                if (resetConfirmForm) resetConfirmForm.hidden = true;
                if (resetPasswordForm) resetPasswordForm.hidden = false;
                if (resetSubtitle) resetSubtitle.textContent = 'Set your new password to finish recovery.';
                setResetAlert('Code verified. Set your new password.', 'success');
            })
            .catch(() => setResetAlert('Could not reach the server. Please try again.'))
            .finally(() => {
                resetVerifyInProgress = false;
                setVerifyResetButtonLoading(false);
            });
    }

    function startResetResendCooldown(seconds = 57) {
        resetResendRemaining = seconds;
        if (resetResendInterval) clearInterval(resetResendInterval);
        const render = () => {
            const m = Math.floor(resetResendRemaining / 60);
            const s = resetResendRemaining % 60;
            if (resetTimerLabel) {
                resetTimerLabel.textContent = `(${m}:${String(s).padStart(2, '0')})`;
            }
        };
        if (resendResetCodeBtn) resendResetCodeBtn.disabled = true;
        render();
        resetResendInterval = setInterval(() => {
            resetResendRemaining -= 1;
            if (resetResendRemaining <= 0) {
                clearInterval(resetResendInterval);
                resetResendInterval = null;
                if (resetTimerLabel) resetTimerLabel.textContent = '';
                if (resendResetCodeBtn) resendResetCodeBtn.disabled = false;
                return;
            }
            render();
        }, 1000);
    }

    function openResetModal() {
        if (!resetModal) return;
        resetModal.hidden = false;
        resetIdentifier = '';
        verifiedResetCode = '';
        clearResetAlert();
        if (resetRequestForm) resetRequestForm.hidden = false;
        if (resetConfirmForm) resetConfirmForm.hidden = true;
        if (resetPasswordForm) resetPasswordForm.hidden = true;
        if (resetSubtitle) resetSubtitle.textContent = 'Enter the email associated with your account to reset your password.';
        if (resetIdentifierInput) {
            resetIdentifierInput.value = '';
            resetIdentifierInput.focus();
        }
        resetOtpInputs();
        if (resetNewPasswordInput) resetNewPasswordInput.value = '';
        if (resetConfirmPasswordInput) resetConfirmPasswordInput.value = '';
        if (resetResendInterval) {
            clearInterval(resetResendInterval);
            resetResendInterval = null;
        }
        if (resendResetCodeBtn) resendResetCodeBtn.disabled = false;
        if (resetTimerLabel) resetTimerLabel.textContent = '';
    }

    function closeResetModal() {
        if (!resetModal) return;
        resetModal.hidden = true;
        resetIdentifier = '';
        verifiedResetCode = '';
        clearResetAlert();
        if (resetResendInterval) {
            clearInterval(resetResendInterval);
            resetResendInterval = null;
        }
    }

    if (resetCloseBtn) resetCloseBtn.addEventListener('click', closeResetModal);
    if (resetBackdrop) resetBackdrop.addEventListener('click', closeResetModal);

    if (resetRequestForm) {
        const validateResetIdentifierField = () => {
            if (!resetIdentifierInput) return false;
            const value = (resetIdentifierInput.value || '').trim();
            if (!value) {
                showError(resetIdentifierInput, 'Email address is required.');
                return false;
            }
            if (!isValidEmail(value)) {
                showError(resetIdentifierInput, 'Please enter a valid email.');
                return false;
            }
            clearValidation(resetIdentifierInput);
            return true;
        };

        if (resetIdentifierInput) {
            resetIdentifierInput.addEventListener('input', validateResetIdentifierField);
            resetIdentifierInput.addEventListener('blur', validateResetIdentifierField);
        }

        resetRequestForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const identifier = (resetIdentifierInput?.value || '').trim();
            if (!validateResetIdentifierField()) {
                return;
            }
            clearResetAlert();
            if (sendResetCodeBtn) {
                sendResetCodeBtn.disabled = true;
                sendResetCodeBtn.classList.add('is-loading');
                sendResetCodeBtn.innerHTML = '<span class="reset-btn-spinner" aria-hidden="true"></span><span>Sending Reset Code...</span>';
            }
            fetch('/api/password/forgot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier, email: identifier })
            })
                .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        if (resetIdentifierInput) {
                            showError(
                                resetIdentifierInput,
                                data.error || 'This email doesn’t appear to be associated with any account yet.'
                            );
                        } else {
                            setResetAlert(data.error || 'Failed to send reset code.');
                        }
                        return;
                    }
                    if (resetIdentifierInput) {
                        clearValidation(resetIdentifierInput);
                    }
                    resetIdentifier = identifier;
                    if (resetRequestForm) resetRequestForm.hidden = true;
                    if (resetConfirmForm) resetConfirmForm.hidden = false;
                    if (resetSubtitle) resetSubtitle.textContent = 'Thank you for verifying. Kindly check your email for the code.';
                    clearResetAlert();
                    startResetResendCooldown(60);
                    if (resetOtpDigits[0]) resetOtpDigits[0].focus();
                })
                .catch(() => setResetAlert('Could not reach the server. Please try again.'))
                .finally(() => {
                    if (sendResetCodeBtn) {
                        sendResetCodeBtn.disabled = false;
                        sendResetCodeBtn.classList.remove('is-loading');
                        sendResetCodeBtn.textContent = 'Send Reset Code';
                    }
                });
        });
    }

    if (resetVerifyBackBtn) {
        resetVerifyBackBtn.addEventListener('click', function () {
            clearResetAlert();
            if (resetConfirmForm) resetConfirmForm.hidden = true;
            if (resetRequestForm) resetRequestForm.hidden = false;
            if (resetPasswordForm) resetPasswordForm.hidden = true;
            if (resetSubtitle) resetSubtitle.textContent = 'Enter the email associated with your account to reset your password.';
            if (resetResendInterval) {
                clearInterval(resetResendInterval);
                resetResendInterval = null;
            }
        });
    }

    if (resetPasswordBackBtn) {
        resetPasswordBackBtn.addEventListener('click', function () {
            clearResetAlert();
            if (resetPasswordForm) resetPasswordForm.hidden = true;
            if (resetConfirmForm) resetConfirmForm.hidden = false;
            if (resetSubtitle) resetSubtitle.textContent = 'Thank you for verifying. Kindly check your email for the code.';
            startResetResendCooldown(Math.max(resetResendRemaining, 20));
        });
    }

    if (resetOtpDigits.length) {
        resetOtpDigits.forEach((input, idx) => {
            input.addEventListener('input', (e) => {
                const v = e.target.value.replace(/\D/g, '').slice(-1);
                e.target.value = v;
                clearResetAlert();
                if (v && idx < resetOtpDigits.length - 1) {
                    resetOtpDigits[idx + 1].focus();
                }
                const isComplete = getResetOtpCode().length === 6;
                if (isComplete) {
                    if (resetAutoVerifyTimeout) clearTimeout(resetAutoVerifyTimeout);
                    resetAutoVerifyTimeout = setTimeout(() => {
                        if (!resetVerifyInProgress && resetConfirmForm && !resetConfirmForm.hidden) {
                            submitResetCodeVerification();
                        }
                    }, 220);
                }
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && idx > 0) {
                    resetOtpDigits[idx - 1].focus();
                }
                if (e.key === 'Backspace' && resetAutoVerifyTimeout) {
                    clearTimeout(resetAutoVerifyTimeout);
                    resetAutoVerifyTimeout = null;
                }
            });
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6).split('');
                resetOtpDigits.forEach((d, i) => {
                    d.value = digits[i] || '';
                });
                clearResetAlert();
                if (getResetOtpCode().length === 6) {
                    if (resetAutoVerifyTimeout) clearTimeout(resetAutoVerifyTimeout);
                    resetAutoVerifyTimeout = setTimeout(() => {
                        if (!resetVerifyInProgress && resetConfirmForm && !resetConfirmForm.hidden) {
                            submitResetCodeVerification();
                        }
                    }, 220);
                }
            });
        });
    }

    if (resendResetCodeBtn) {
        resendResetCodeBtn.addEventListener('click', () => {
            if (!resetIdentifier || resendResetCodeBtn.disabled) return;
            clearResetAlert();
            resendResetCodeBtn.disabled = true;
            resendResetCodeBtn.classList.add('is-loading');
            fetch('/api/password/forgot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: resetIdentifier, email: resetIdentifier })
            })
                .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        setResetAlert(data.error || 'Failed to resend reset code.');
                        resendResetCodeBtn.classList.remove('is-loading');
                        resendResetCodeBtn.disabled = false;
                        return;
                    }
                    setResetAlert('Verification code has been resent to your email.', 'success');
                    resetOtpInputs();
                    startResetResendCooldown(60);
                    resendResetCodeBtn.classList.remove('is-loading');
                })
                .catch(() => {
                    setResetAlert('Could not reach the server. Please try again.');
                    resendResetCodeBtn.classList.remove('is-loading');
                    resendResetCodeBtn.disabled = false;
                });
        });
    }

    if (resetConfirmForm) {
        resetConfirmForm.addEventListener('submit', function (e) {
            e.preventDefault();
            submitResetCodeVerification();
        });
    }

    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const newPassword = resetNewPasswordInput?.value || '';
            const confirmPassword = resetConfirmPasswordInput?.value || '';

            if (!newPassword) {
                setResetAlert('New password is required.');
                return;
            }
            if (newPassword.length < 8) {
                setResetAlert('Password must be at least 8 characters.');
                return;
            }
            if (confirmPassword !== newPassword) {
                setResetAlert('Passwords do not match.');
                return;
            }

            clearResetAlert();
            if (confirmResetBtn) {
                confirmResetBtn.disabled = true;
                confirmResetBtn.textContent = 'Updating...';
            }
            fetch('/api/password/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: resetIdentifier || (resetIdentifierInput?.value || '').trim(),
                    code: verifiedResetCode,
                    newPassword
                })
            })
                .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
                .then(({ ok, data }) => {
                    if (!ok || !data.success) {
                        setResetAlert(data.error || 'Failed to reset password.');
                        return;
                    }
                    setResetAlert(data.message || 'Password updated successfully.', 'success');
                    setTimeout(() => {
                        closeResetModal();
                        showNotification('Password reset complete. Please sign in.', 'success');
                    }, 700);
                })
                .catch(() => setResetAlert('Could not reach the server. Please try again.'))
                .finally(() => {
                    if (confirmResetBtn) {
                        confirmResetBtn.disabled = false;
                        confirmResetBtn.textContent = 'Update Password';
                    }
                });
        });
    }

    // Forgot password
    const forgotPassword = document.querySelector('.forgot-password');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', function(e) {
            e.preventDefault();
            const username = document.getElementById('email').value.trim();
            openResetModal();
            if (username && resetIdentifierInput && isValidEmail(username)) {
                resetIdentifierInput.value = username;
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

    if (initialMode === 'signup' && signupSection && signupWelcome) {
        // Ensure the correct view when coming back from verification page
        switchToSignUp();
    }
});
