// DiariCore Login Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Form elements
    const loginForm = document.getElementById('loginForm');
    const signUpForm = document.getElementById('signUpForm');
    const signUpModal = document.getElementById('signUpModal');
    const showSignUpBtn = document.getElementById('showSignUpBtn');
    const switchToSignUp = document.getElementById('switchToSignUp');
    const closeModal = document.getElementById('closeModal');
    
    // Toggle password visibility
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    const toggleSignUpPassword = document.getElementById('toggleSignUpPassword');
    const signUpPasswordInput = document.getElementById('signUpPassword');
    
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    // Google Sign In/Up buttons
    const googleSignInBtn = document.getElementById('googleSignInBtn');
    const googleSignUpBtn = document.getElementById('googleSignUpBtn');
    
    // Toggle password visibility function
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
    
    // Setup password toggles
    setupPasswordToggle(togglePassword, passwordInput);
    setupPasswordToggle(toggleSignUpPassword, signUpPasswordInput);
    setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);
    
    // Show sign up modal
    function showSignUpModal() {
        signUpModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    
    // Hide sign up modal
    function hideSignUpModal() {
        signUpModal.classList.remove('show');
        document.body.style.overflow = '';
    }
    
    // Event listeners for modal
    if (showSignUpBtn) {
        showSignUpBtn.addEventListener('click', showSignUpModal);
    }
    
    if (switchToSignUp) {
        switchToSignUp.addEventListener('click', function(e) {
            e.preventDefault();
            showSignUpModal();
        });
    }
    
    if (closeModal) {
        closeModal.addEventListener('click', hideSignUpModal);
    }
    
    // Close modal when clicking outside
    signUpModal.addEventListener('click', function(e) {
        if (e.target === signUpModal) {
            hideSignUpModal();
        }
    });
    
    // Email validation
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    // Show error message
    function showError(inputElement, message) {
        inputElement.classList.add('error');
        inputElement.classList.remove('success');
        
        // Check if error message element exists
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
    
    // Clear validation state
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
                // Simulate login process
                const submitBtn = loginForm.querySelector('.btn-signin');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Signing In...';
                submitBtn.disabled = true;
                
                // Simulate API call
                setTimeout(() => {
                    // Store login state
                    localStorage.setItem('diariCoreUser', JSON.stringify({
                        email: email,
                        isLoggedIn: true,
                        loginTime: new Date().toISOString()
                    }));
                    
                    // Show success message
                    showNotification('Login successful! Redirecting...', 'success');
                    
                    // Redirect to dashboard
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
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            let isValid = true;
            
            // Validate full name
            if (!fullName) {
                showError(document.getElementById('fullName'), 'Full name is required');
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
            
            // Validate confirm password
            if (!confirmPassword) {
                showError(document.getElementById('confirmPassword'), 'Please confirm your password');
                isValid = false;
            } else if (password !== confirmPassword) {
                showError(document.getElementById('confirmPassword'), 'Passwords do not match');
                isValid = false;
            } else {
                showSuccess(document.getElementById('confirmPassword'));
            }
            
            if (isValid) {
                // Simulate sign up process
                const submitBtn = signUpForm.querySelector('.btn-signin');
                const originalText = submitBtn.textContent;
                submitBtn.textContent = 'Creating Account...';
                submitBtn.disabled = true;
                
                // Simulate API call
                setTimeout(() => {
                    // Store user data
                    const users = JSON.parse(localStorage.getItem('diariCoreUsers') || '[]');
                    users.push({
                        fullName: fullName,
                        email: email,
                        password: password, // In real app, this should be hashed
                        createdAt: new Date().toISOString()
                    });
                    localStorage.setItem('diariCoreUsers', JSON.stringify(users));
                    
                    // Auto login after sign up
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
    
    // Google Sign In/Up simulation
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
        // Remove existing notifications
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        
        notification.innerHTML = `
            <i class="bi bi-${icon}"></i>
            <span>${message}</span>
        `;
        
        // Style the notification
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
        
        // Set colors based on type
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
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
    }
    
    // Check if user is already logged in
    function checkAuthStatus() {
        const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        if (user && user.isLoggedIn) {
            // User is already logged in, redirect to dashboard
            const currentPage = window.location.pathname.split('/').pop();
            if (currentPage === 'index.html') {
                window.location.href = 'dashboard.html';
            }
        }
    }
    
    // Run auth check on page load
    checkAuthStatus();
    
    // Clear validation on input
    document.querySelectorAll('.form-input').forEach(input => {
        input.addEventListener('input', function() {
            clearValidation(this);
        });
    });
    
    // Handle Enter key in modal
    signUpModal.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideSignUpModal();
        }
    });
});
