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
    const passwordInput = document.getElementById('password');
    const signUpPasswordInput = document.getElementById('signUpPassword');
    
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
    
    // Email validation
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    // Show error message
    function showError(inputElement, message) {
        inputElement.classList.add('error');
        inputElement.classList.remove('success');
        
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
        
        const errorDiv = inputElement.parentElement.nextElementSibling;
        if (errorDiv && errorDiv.classList.contains('error-message')) {
            errorDiv.classList.remove('show');
        }
    }
    
    // Clear validation
    function clearValidation(inputElement) {
        inputElement.classList.remove('error', 'success');
        const errorDiv = inputElement.parentElement.nextElementSibling;
        if (errorDiv && errorDiv.classList.contains('error-message')) {
            errorDiv.classList.remove('show');
        }
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
            
            const fullName = document.getElementById('fullName').value.trim();
            const email = document.getElementById('signUpEmail').value.trim();
            const password = document.getElementById('signUpPassword').value;
            
            let isValid = true;
            
            // Validate full name
            if (!fullName) {
                showError(document.getElementById('fullName'), 'Name is required');
                isValid = false;
            } else if (fullName.length < 2) {
                showError(document.getElementById('fullName'), 'Name must be at least 2 characters');
                isValid = false;
            } else {
                showSuccess(document.getElementById('fullName'));
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
            
            if (isValid) {
                const submitBtn = signUpForm.querySelector('.btn-signin');
                submitBtn.textContent = 'Creating Account...';
                submitBtn.disabled = true;
                
                setTimeout(() => {
                    const users = JSON.parse(localStorage.getItem('diariCoreUsers') || '[]');
                    users.push({
                        fullName: fullName,
                        email: email,
                        password: password,
                        createdAt: new Date().toISOString()
                    });
                    localStorage.setItem('diariCoreUsers', JSON.stringify(users));
                    
                    localStorage.setItem('diariCoreUser', JSON.stringify({
                        email: email,
                        fullName: fullName,
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
