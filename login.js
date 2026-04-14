// DiariCore Login Page JavaScript - Sliding Panel Version

document.addEventListener('DOMContentLoaded', function() {
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
    
    // Switch to Sign Up mode
    function switchToSignUp() {
        loginContainer.classList.add('signup-mode');
        
        // Fade out current content
        signinSection.style.opacity = '0';
        signinWelcome.style.opacity = '0';
        
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
        loginContainer.classList.remove('signup-mode');
        
        // Fade out current content
        signupSection.style.opacity = '0';
        signupWelcome.style.opacity = '0';
        
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
    
    // Show error message
    function showError(inputElement, message) {
        inputElement.classList.add('error');
        inputElement.classList.remove('success');

        const customError = document.getElementById(`${inputElement.id}-error`);
        if (customError) {
            customError.textContent = message;
            customError.style.display = 'block';
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
            customError.style.display = 'none';
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
            customError.style.display = 'none';
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
            if (!value) return showError(field, 'Nickname is required.'), false;
            if (value.length < 2) return showError(field, 'Nickname must be at least 2 characters.'), false;
            showSuccess(field); return true;
        }

        if (fieldId === 'signUpEmail') {
            if (!value) return showError(field, 'Email is required.'), false;
            if (!isValidEmail(value)) return showError(field, 'Please enter a valid email.'), false;
            showSuccess(field); return true;
        }

        if (fieldId === 'firstName') {
            if (!value) return showError(field, 'First name is required.'), false;
            if (value.length < 2) return showError(field, 'First name must be at least 2 characters.'), false;
            showSuccess(field); return true;
        }

        if (fieldId === 'lastName') {
            if (!value) return showError(field, 'Last name is required.'), false;
            if (value.length < 2) return showError(field, 'Last name must be at least 2 characters.'), false;
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
            if (value.length < 6) return showError(field, 'Password must be at least 6 characters.'), false;
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
                showError(document.getElementById('email'), 'Email is required');
                isValid = false;
            } else if (!isValidEmail(email)) {
                showError(document.getElementById('email'), 'Please enter a valid email');
                isValid = false;
            } else {
                showSuccess(document.getElementById('email'));
            }
            
            // Validate password
            if (!password) {
                showError(document.getElementById('password'), 'Password is required');
                isValid = false;
            } else if (password.length < 6) {
                showError(document.getElementById('password'), 'Password must be at least 6 characters');
                isValid = false;
            } else {
                showSuccess(document.getElementById('password'));
            }
            
            if (isValid) {
                const submitBtn = loginForm.querySelector('.btn-signin');
                submitBtn.textContent = 'Signing In...';
                submitBtn.disabled = true;
                
                setTimeout(() => {
                    localStorage.setItem('diariCoreUser', JSON.stringify({
                        email: email,
                        isLoggedIn: true,
                        loginTime: new Date().toISOString()
                    }));
                    
                    showNotification('Login successful! Redirecting...', 'success');
                    
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500);
                }, 2000);
            }
        });
    }
    
    // Sign up form submission
    if (signUpForm) {
        signUpForm.addEventListener('submit', function(e) {
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
                showError(document.getElementById('nickname'), 'Nickname is required');
                isValid = false;
            } else if (nickname.length < 2) {
                showError(document.getElementById('nickname'), 'Nickname must be at least 2 characters');
                isValid = false;
            } else {
                showSuccess(document.getElementById('nickname'));
            }

            // Validate first name
            if (!firstName) {
                showError(document.getElementById('firstName'), 'First name is required');
                isValid = false;
            } else if (firstName.length < 2) {
                showError(document.getElementById('firstName'), 'First name must be at least 2 characters');
                isValid = false;
            } else {
                showSuccess(document.getElementById('firstName'));
            }

            // Validate last name
            if (!lastName) {
                showError(document.getElementById('lastName'), 'Last name is required');
                isValid = false;
            } else if (lastName.length < 2) {
                showError(document.getElementById('lastName'), 'Last name must be at least 2 characters');
                isValid = false;
            } else {
                showSuccess(document.getElementById('lastName'));
            }

            // Validate gender
            if (!gender) {
                showError(document.getElementById('gender'), 'Gender is required');
                isValid = false;
            } else {
                showSuccess(document.getElementById('gender'));
            }

            // Validate birthday
            if (!birthday) {
                showError(document.getElementById('birthday'), 'Birthday is required');
                isValid = false;
            } else {
                showSuccess(document.getElementById('birthday'));
            }
            
            // Validate email
            if (!email) {
                showError(document.getElementById('signUpEmail'), 'Email is required');
                isValid = false;
            } else if (!isValidEmail(email)) {
                showError(document.getElementById('signUpEmail'), 'Please enter a valid email');
                isValid = false;
            } else {
                showSuccess(document.getElementById('signUpEmail'));
            }
            
            // Validate password
            if (!password) {
                showError(document.getElementById('signUpPassword'), 'Password is required');
                isValid = false;
            } else if (password.length < 6) {
                showError(document.getElementById('signUpPassword'), 'Password must be at least 6 characters');
                isValid = false;
            } else {
                showSuccess(document.getElementById('signUpPassword'));
            }

            // Validate confirm password
            if (!confirmPassword) {
                showError(document.getElementById('confirmPassword'), 'Please confirm your password');
                isValid = false;
            } else if (confirmPassword !== password) {
                showError(document.getElementById('confirmPassword'), 'Passwords do not match');
                isValid = false;
            } else {
                showSuccess(document.getElementById('confirmPassword'));
            }
            
            if (isValid) {
                const submitBtn = signUpForm.querySelector('.btn-signin');
                submitBtn.textContent = 'Creating Account...';
                submitBtn.disabled = true;
                
                setTimeout(() => {
                    const users = JSON.parse(localStorage.getItem('diariCoreUsers') || '[]');
                    const fullName = `${firstName} ${lastName}`.trim();
                    users.push({
                        nickname: nickname,
                        firstName: firstName,
                        lastName: lastName,
                        fullName: fullName,
                        gender: gender,
                        birthday: birthday,
                        email: email,
                        password: password,
                        createdAt: new Date().toISOString()
                    });
                    localStorage.setItem('diariCoreUsers', JSON.stringify(users));
                    
                    localStorage.setItem('diariCoreUser', JSON.stringify({
                        nickname: nickname,
                        firstName: firstName,
                        lastName: lastName,
                        email: email,
                        fullName: fullName,
                        gender: gender,
                        birthday: birthday,
                        isLoggedIn: true,
                        loginTime: new Date().toISOString()
                    }));
                    
                    showNotification('Account created successfully! Redirecting...', 'success');
                    
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 2000);
                }, 2000);
            }
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
    
    // Clear validation on input
    document.querySelectorAll('.form-input').forEach(input => {
        input.addEventListener('input', function() {
            clearValidation(this);
        });
    });
    
    // Floating Label Animation
    function initFloatingLabels() {
        const inputWrappers = document.querySelectorAll('.input-wrapper');
        
        inputWrappers.forEach(wrapper => {
            const input = wrapper.querySelector('.form-input');
            
            if (input) {
                // Check on load if input has value
                if (input.value.trim() !== '') {
                    wrapper.classList.add('has-content');
                }
                
                // Add event listeners
                input.addEventListener('input', function() {
                    if (this.value.trim() !== '') {
                        wrapper.classList.add('has-content');
                    } else {
                        wrapper.classList.remove('has-content');
                    }
                });
                
                input.addEventListener('blur', function() {
                    if (this.value.trim() === '') {
                        wrapper.classList.remove('has-content');
                    }
                });
                
                input.addEventListener('focus', function() {
                    wrapper.classList.add('has-content');
                });
            }
        });
    }
    
    initFloatingLabels();
});
