/**
 * DiariCore password rules — keep COMMON_PASSWORDS in sync with password_policy.py
 */
(function (global) {
    var COMMON_PASSWORDS = [
        'password',
        '12345678',
        '123456789',
        'qwerty',
        'qwerty123',
        '111111',
        'iloveyou',
        'admin',
        'welcome',
        'monkey',
        'dragon',
        'letmein',
        'abc123',
        'password1',
    ];
    var COMMON_SET = {};
    for (var i = 0; i < COMMON_PASSWORDS.length; i++) {
        COMMON_SET[COMMON_PASSWORDS[i].toLowerCase()] = true;
    }

    var SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;':\",.<>?/`~\\";

    function hasSpecialChar(p) {
        for (var i = 0; i < SPECIAL_CHARS.length; i++) {
            if (p.indexOf(SPECIAL_CHARS.charAt(i)) !== -1) return true;
        }
        return false;
    }
    var MIN_LEN = 12;
    var MAX_LEN = 64;

    function norm(s) {
        return String(s || '').trim();
    }

    function containsPersonal(passwordLower, token) {
        var t = norm(token).toLowerCase();
        if (t.length < 2) return false;
        return passwordLower.indexOf(t) !== -1;
    }

    function isCommonPassword(password) {
        var l = String(password || '').trim().toLowerCase();
        return !!COMMON_SET[l];
    }

    /**
     * @param {string} password
     * @param {{ nickname?: string, email?: string, firstName?: string, lastName?: string }} personal
     */
    function getChecklistState(password, personal) {
        var p = password != null ? String(password) : '';
        var pl = p.toLowerCase();
        var per = personal || {};
        return {
            len12: p.length >= MIN_LEN,
            upper: /[A-Z]/.test(p),
            lower: /[a-z]/.test(p),
            digit: /[0-9]/.test(p),
            special: hasSpecialChar(p),
            noSpace: p.indexOf(' ') === -1,
            noPersonal: !(
                containsPersonal(pl, per.nickname) ||
                containsPersonal(pl, per.email) ||
                containsPersonal(pl, per.firstName) ||
                containsPersonal(pl, per.lastName)
            ),
        };
    }

    function countChecklistPassed(state) {
        var n = 0;
        if (state.len12) n++;
        if (state.upper) n++;
        if (state.lower) n++;
        if (state.digit) n++;
        if (state.special) n++;
        if (state.noSpace) n++;
        if (state.noPersonal) n++;
        return n;
    }

    function passwordsMatch(password, confirm) {
        return String(confirm || '') === String(password || '') && String(confirm || '').length > 0;
    }

    /**
     * Score 0–8: seven checklist rules + passwords match.
     */
    function getStrengthScore(password, confirm, personal) {
        var state = getChecklistState(password, personal);
        var c = countChecklistPassed(state);
        if (passwordsMatch(password, confirm)) c += 1;
        return c;
    }

    function getStrengthBand(score) {
        if (score <= 3) return { key: 'weak', label: 'Weak', color: '#c75c5c' };
        if (score <= 6) return { key: 'fair', label: 'Fair', color: '#d4a017' };
        if (score === 7) return { key: 'good', label: 'Good', color: '#9db85a' };
        return { key: 'strong', label: 'Strong', color: '#4a7c59' };
    }

    function allChecklistPassed(state) {
        return countChecklistPassed(state) === 7;
    }

    /**
     * Ready to submit: all checklist + match + not common + max length (silent).
     */
    function isPasswordSubmitReady(password, confirm, personal) {
        var p = String(password || '');
        if (p.length > MAX_LEN) return false;
        if (!allChecklistPassed(getChecklistState(p, personal))) return false;
        if (!passwordsMatch(p, confirm)) return false;
        if (isCommonPassword(p)) return false;
        return true;
    }

    global.DiariPasswordPolicy = {
        COMMON_PASSWORDS: COMMON_PASSWORDS,
        MIN_LEN: MIN_LEN,
        MAX_LEN: MAX_LEN,
        getChecklistState: getChecklistState,
        countChecklistPassed: countChecklistPassed,
        getStrengthScore: getStrengthScore,
        getStrengthBand: getStrengthBand,
        isCommonPassword: isCommonPassword,
        passwordsMatch: passwordsMatch,
        allChecklistPassed: allChecklistPassed,
        isPasswordSubmitReady: isPasswordSubmitReady,
    };

    var RULE_ROWS = [
        { key: 'len12', text: 'At least 12 characters' },
        { key: 'upper', text: 'Contains an uppercase letter' },
        { key: 'lower', text: 'Contains a lowercase letter' },
        { key: 'digit', text: 'Contains a number' },
        { key: 'special', text: 'Contains a special character' },
        { key: 'noSpace', text: 'No spaces' },
        { key: 'noPersonal', text: "Doesn't contain your name, username, or email" },
    ];

    function attachPasswordLive(opts) {
        var P = global.DiariPasswordPolicy;
        if (!P || !opts.passwordEl || !opts.confirmEl || !opts.submitBtn) {
            return { refresh: function () {}, destroy: function () {} };
        }

        var passwordEl = opts.passwordEl;
        var confirmEl = opts.confirmEl;
        var hintEl = opts.hintEl;
        var liveWrap = opts.liveWrap;
        var getPersonal = opts.getPersonal || function () {
            return {};
        };
        var commonErrorEl = opts.commonErrorEl || null;
        var formRoot = opts.formRoot || null;
        var alwaysShowLive = !!opts.alwaysShowLive;

        var rows = {};
        if (liveWrap && !liveWrap.querySelector('.pwd-checklist')) {
            liveWrap.innerHTML = '';
            var ul = document.createElement('ul');
            ul.className = 'pwd-checklist';
            ul.setAttribute('role', 'list');
            for (var i = 0; i < RULE_ROWS.length; i++) {
                var r = RULE_ROWS[i];
                var li = document.createElement('li');
                li.className = 'pwd-checklist__item';
                li.setAttribute('data-key', r.key);
                li.innerHTML =
                    '<span class="pwd-checklist__icon" aria-hidden="true"></span><span class="pwd-checklist__text">' +
                    r.text +
                    '</span>';
                ul.appendChild(li);
                rows[r.key] = li;
            }
            liveWrap.appendChild(ul);
            var strength = document.createElement('div');
            strength.className = 'pwd-strength';
            strength.innerHTML =
                '<div class="pwd-strength__track" role="progressbar" aria-valuemin="0" aria-valuemax="8" aria-valuenow="0" aria-valuetext="Weak"><div class="pwd-strength__fill"></div></div><span class="pwd-strength__label">Weak</span>';
            liveWrap.appendChild(strength);
        } else if (liveWrap) {
            for (var j = 0; j < RULE_ROWS.length; j++) {
                var rk = RULE_ROWS[j].key;
                rows[rk] = liveWrap.querySelector('.pwd-checklist__item[data-key="' + rk + '"]');
            }
        }

        var fillEl = liveWrap && liveWrap.querySelector('.pwd-strength__fill');
        var labelEl = liveWrap && liveWrap.querySelector('.pwd-strength__label');
        var trackEl = liveWrap && liveWrap.querySelector('.pwd-strength__track');

        function updateHint() {
            if (!hintEl) return;
            hintEl.hidden = passwordEl.value.length > 0;
        }

        function updateRows(state) {
            for (var k in rows) {
                if (!rows[k]) continue;
                var ok = !!state[k];
                rows[k].classList.toggle('is-pass', ok);
                rows[k].classList.toggle('is-fail', !ok);
                var ic = rows[k].querySelector('.pwd-checklist__icon');
                if (ic) ic.textContent = ok ? '\u2713' : '\u00d7';
            }
        }

        function updateStrength(score) {
            var band = P.getStrengthBand(score);
            if (fillEl) {
                fillEl.style.width = Math.min(100, (score / 8) * 100) + '%';
                fillEl.style.backgroundColor = band.color;
            }
            if (labelEl) {
                labelEl.textContent = band.label;
                labelEl.style.color = band.color;
            }
            if (trackEl) {
                trackEl.setAttribute('aria-valuenow', String(score));
                trackEl.setAttribute('aria-valuetext', band.label);
            }
        }

        function refresh() {
            if (formRoot && formRoot.hidden) {
                return { ready: false };
            }
            var p = passwordEl.value;
            if (p.length > MAX_LEN) {
                passwordEl.value = p.slice(0, MAX_LEN);
                p = passwordEl.value;
            }
            var c = confirmEl.value;
            if (c.length > MAX_LEN) {
                confirmEl.value = c.slice(0, MAX_LEN);
                c = confirmEl.value;
            }
            updateHint();
            var personal = getPersonal();
            var state = P.getChecklistState(p, personal);
            var score = P.getStrengthScore(p, c, personal);
            updateRows(state);
            updateStrength(score);
            var ready = P.isPasswordSubmitReady(p, c, personal);
            if (liveWrap) liveWrap.hidden = p.length === 0 || (!alwaysShowLive && ready);
            if (commonErrorEl && ready) commonErrorEl.classList.remove('show');
            opts.submitBtn.disabled = !ready;
            return { state: state, score: score, ready: ready };
        }

        function onBlurPassword() {
            var p = passwordEl.value;
            if (p.length > 0 && P.isCommonPassword(p)) {
                if (commonErrorEl) {
                    commonErrorEl.textContent =
                        'This password is too common. Choose a less predictable password.';
                    commonErrorEl.classList.add('show');
                }
            } else if (commonErrorEl) {
                commonErrorEl.classList.remove('show');
            }
        }

        function onInput() {
            if (commonErrorEl && !P.isCommonPassword(passwordEl.value)) {
                commonErrorEl.classList.remove('show');
            }
            refresh();
        }

        passwordEl.setAttribute('maxlength', String(MAX_LEN));
        confirmEl.setAttribute('maxlength', String(MAX_LEN));
        passwordEl.addEventListener('input', onInput);
        passwordEl.addEventListener('blur', onBlurPassword);
        if (hintEl) {
            passwordEl.addEventListener('focus', updateHint);
        }
        confirmEl.addEventListener('input', onInput);

        opts.submitBtn.disabled = true;
        refresh();

        return {
            refresh: refresh,
            destroy: function () {
                passwordEl.removeEventListener('input', onInput);
                passwordEl.removeEventListener('blur', onBlurPassword);
                if (hintEl) {
                    passwordEl.removeEventListener('focus', updateHint);
                }
                confirmEl.removeEventListener('input', onInput);
            },
        };
    }

    global.DiariPasswordLive = { attach: attachPasswordLive };
})(typeof window !== 'undefined' ? window : this);
