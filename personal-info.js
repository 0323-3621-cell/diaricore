// DiariCore Personal Info Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initializePersonalInfoPage();
});

function initializePersonalInfoPage() {
    const user = getCurrentUserFromStorage();
    if (!user) {
        showNotification('No logged in user found. Redirecting to login...', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 900);
        return;
    }

    bindNavigationButtons();
    populateForm(user);
    bindFormSubmit();
}

function getCurrentUserFromStorage() {
    try {
        return JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
    } catch (error) {
        return null;
    }
}

function setCurrentUserInStorage(user) {
    localStorage.setItem('diariCoreUser', JSON.stringify(user));
}

function populateForm(user) {
    const firstNameInput = document.getElementById('personalInfoFirstName');
    const lastNameInput = document.getElementById('personalInfoLastName');
    const nicknameInput = document.getElementById('personalInfoNickname');
    const emailInput = document.getElementById('personalInfoEmail');

    if (!firstNameInput || !lastNameInput || !nicknameInput || !emailInput) return;

    firstNameInput.value = user.firstName || '';
    lastNameInput.value = user.lastName || '';
    nicknameInput.value = user.nickname || '';
    emailInput.value = user.email || '';
}

function bindNavigationButtons() {
    const backBtn = document.getElementById('backToProfileBtn');
    const cancelBtn = document.getElementById('cancelEditBtn');

    const goBack = () => {
        window.location.href = 'profile.html';
    };

    if (backBtn) backBtn.addEventListener('click', goBack);
    if (cancelBtn) cancelBtn.addEventListener('click', goBack);
}

function bindFormSubmit() {
    const formEl = document.getElementById('personalInfoForm');
    const saveBtn = document.getElementById('personalInfoSaveBtn');
    if (!formEl) return;

    formEl.addEventListener('submit', function(event) {
        event.preventDefault();

        const firstNameInput = document.getElementById('personalInfoFirstName');
        const lastNameInput = document.getElementById('personalInfoLastName');
        const nicknameInput = document.getElementById('personalInfoNickname');
        const emailInput = document.getElementById('personalInfoEmail');
        if (!firstNameInput || !lastNameInput || !nicknameInput || !emailInput) return;

        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const nickname = nicknameInput.value.trim();
        const email = emailInput.value.trim();

        if (!firstName || !lastName) {
            showNotification('First name and last name are required.', 'warning');
            return;
        }
        if (nickname.length < 4 || nickname.length > 64) {
            showNotification('Username must be between 4 and 64 characters.', 'warning');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showNotification('Please enter a valid email address.', 'warning');
            return;
        }

        const user = getCurrentUserFromStorage();
        if (!user) {
            showNotification('No logged in user found.', 'error');
            return;
        }

        if (saveBtn) saveBtn.disabled = true;

        const updatedUser = {
            ...user,
            firstName,
            lastName,
            nickname,
            email
        };
        setCurrentUserInStorage(updatedUser);
        showNotification('Personal info updated successfully.', 'success');

        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 650);
    });
}

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.personal-info-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'personal-info-notification';
    notification.innerHTML = `
        <i class="bi bi-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 0.85rem 1.1rem;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 0.55rem;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
        transform: translateX(110%);
        transition: transform 0.24s ease;
        background: ${getNotificationColor(type)};
        color: white;
        font-family: 'Inter', sans-serif;
        max-width: 360px;
    `;

    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
        notification.style.transform = 'translateX(110%)';
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 250);
    }, 2200);
}

function getNotificationIcon(type) {
    const map = {
        success: 'check-circle',
        error: 'x-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return map[type] || 'info-circle';
}

function getNotificationColor(type) {
    const map = {
        success: '#7fbf9f',
        error: '#e74c3c',
        warning: '#f4a261',
        info: '#7fa7bf'
    };
    return map[type] || '#7fa7bf';
}
