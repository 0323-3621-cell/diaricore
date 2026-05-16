/**
 * DiariCore Write Entry — unified session management (timer, drafts, idle timeout, single-tab lock).
 * Loaded only on write-entry.html. Vanilla JS; localStorage keys prefixed diaricore_session_.
 */
(function (global) {
    'use strict';

    var PREFIX = 'diaricore_session_';
    var KEYS = {
        start: PREFIX + 'start',
        draft: PREFIX + 'draft',
        lock: PREFIX + 'lock',
    };
    var CHANNEL_NAME = 'diaricore_session';
    var HEARTBEAT_MS = 60000;
    var LOCK_STALE_MS = 5 * 60000;
    var AUTOSAVE_MS = 30000;
    var TIMER_TICK_MS = 60000;
    var TYPING_IDLE_MS = 2 * 60000;
    var USER_IDLE_MS = 30 * 60000;
    var TIMEOUT_MODAL_MS = 10 * 60000;
    var CONCURRENT_WAIT_MS = 500;
    var DRAFT_TOAST_MS = 2000;

    var hooks = null;
    var readyResolve = null;
    var readyPromise = new Promise(function (resolve) {
        readyResolve = resolve;
    });

    var tabId = String(Date.now()) + '_' + String(Math.random()).slice(2, 10);
    var channel = null;
    var active = false;
    var sessionStartMs = null;
    var destroyed = false;
    var concurrentDone = false;
    var sessionStarted = false;

    var timers = {
        display: null,
        autosave: null,
        heartbeat: null,
        typingIdle: null,
        userIdle: null,
        timeoutAuto: null,
    };

    var state = {
        typingPaused: false,
        timeoutModalOpen: false,
    };

    var els = {};
    var activityBound = false;

    function isWriteEntryPage() {
        return document.body && document.body.classList.contains('page-write-entry');
    }

    function safeParse(raw) {
        try {
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function readLock() {
        return safeParse(localStorage.getItem(KEYS.lock));
    }

    function writeLock() {
        localStorage.setItem(
            KEYS.lock,
            JSON.stringify({
                tab_id: tabId,
                started_at: sessionStartMs || Date.now(),
                heartbeat_at: Date.now(),
            })
        );
    }

    function clearLock() {
        var lock = readLock();
        if (lock && lock.tab_id === tabId) localStorage.removeItem(KEYS.lock);
    }

    function isLockStale(lock) {
        if (!lock || !lock.tab_id) return true;
        var hb = Number(lock.heartbeat_at || lock.started_at || 0);
        return Date.now() - hb > LOCK_STALE_MS;
    }

    function readDraft() {
        return safeParse(localStorage.getItem(KEYS.draft));
    }

    function clearDraft() {
        localStorage.removeItem(KEYS.draft);
    }

    function draftHasContent(draft) {
        if (!draft || typeof draft !== 'object') return false;
        return Boolean(String(draft.title || '').trim() || String(draft.body || '').trim());
    }

    function getSessionStartMs() {
        if (sessionStartMs) return sessionStartMs;
        var n = Number(localStorage.getItem(KEYS.start));
        if (Number.isFinite(n) && n > 0) {
            sessionStartMs = n;
            return n;
        }
        return null;
    }

    function setSessionStartMs(ms) {
        sessionStartMs = ms;
        localStorage.setItem(KEYS.start, String(ms));
    }

    function formatMinutes(mins) {
        var m = Math.max(1, Math.floor(mins));
        return m === 1 ? '1 minute' : m + ' minutes';
    }

    function elapsedMinutes() {
        var start = getSessionStartMs();
        if (!start) return 0;
        return Math.floor((Date.now() - start) / 60000);
    }

    function updateTimerDisplay() {
        if (!els.timer) return;
        var mins = elapsedMinutes();
        if (mins < 1) {
            els.timer.hidden = true;
            els.timer.textContent = '';
            return;
        }
        els.timer.hidden = false;
        if (state.typingPaused) {
            els.timer.textContent = '\u23F8 Paused \u00B7 ' + formatMinutes(mins);
        } else {
            els.timer.textContent = '\u270D\uFE0F Writing for ' + formatMinutes(mins);
        }
    }

    function showDraftToast() {
        if (!els.draftToast) return;
        els.draftToast.classList.add('is-visible');
        clearTimeout(showDraftToast._hideTimer);
        showDraftToast._hideTimer = setTimeout(function () {
            els.draftToast.classList.remove('is-visible');
        }, DRAFT_TOAST_MS);
    }

    function collectDraft() {
        if (!hooks || typeof hooks.getDraftState !== 'function') return null;
        var d = hooks.getDraftState();
        if (!d) return null;
        if (!String(d.title || '').trim() && !String(d.body || '').trim()) return null;
        return {
            title: String(d.title || ''),
            body: String(d.body || ''),
            tags: Array.isArray(d.tags) ? d.tags.slice() : [],
            photos_pending: Array.isArray(d.photos_pending) ? d.photos_pending : [],
            session_start: getSessionStartMs() || Date.now(),
            last_saved: Date.now(),
            date: d.date || new Date().toISOString(),
        };
    }

    function persistDraft() {
        if (!active || destroyed) return;
        var draft = collectDraft();
        if (!draft) return;
        localStorage.setItem(KEYS.draft, JSON.stringify(draft));
        showDraftToast();
    }

    function broadcast(msg) {
        try {
            if (channel) channel.postMessage(msg);
        } catch (_) {}
    }

    function releaseBodyScroll() {
        var anyOpen =
            (els.concurrentModal && !els.concurrentModal.hidden) ||
            (els.draftModal && !els.draftModal.hidden) ||
            (els.timeoutModal && !els.timeoutModal.hidden);
        if (!anyOpen) document.body.style.overflow = '';
    }

    function openModal(el) {
        if (!el) return;
        el.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeModal(el) {
        if (!el) return;
        el.hidden = true;
        releaseBodyScroll();
    }

    function resetUserIdleTimer() {
        clearTimeout(timers.userIdle);
        if (!active || destroyed) return;
        timers.userIdle = setTimeout(onUserIdle, USER_IDLE_MS);
    }

    function resetTypingIdleTimer() {
        clearTimeout(timers.typingIdle);
        if (!active || destroyed) return;
        timers.typingIdle = setTimeout(function () {
            state.typingPaused = true;
            updateTimerDisplay();
        }, TYPING_IDLE_MS);
    }

    function onUserActivity() {
        if (!active || destroyed) return;
        resetUserIdleTimer();
    }

    function onTyping() {
        if (!active || destroyed) return;
        state.typingPaused = false;
        updateTimerDisplay();
        resetTypingIdleTimer();
        resetUserIdleTimer();
    }

    function onUserIdle() {
        if (!active || destroyed || state.timeoutModalOpen) return;
        state.timeoutModalOpen = true;
        if (els.timeoutSessionMeta) {
            var mins = elapsedMinutes();
            els.timeoutSessionMeta.textContent =
                'Session started ' +
                (mins < 1 ? 'less than a minute' : formatMinutes(mins)) +
                ' ago';
        }
        openModal(els.timeoutModal);
        clearTimeout(timers.timeoutAuto);
        timers.timeoutAuto = setTimeout(onTimeoutModalExpired, TIMEOUT_MODAL_MS);
    }

    function onTimeoutModalExpired() {
        if (!state.timeoutModalOpen) return;
        persistDraft();
        state.timeoutModalOpen = false;
        closeModal(els.timeoutModal);
        endSession('timeout_auto');
        var banner = document.createElement('div');
        banner.setAttribute('role', 'status');
        banner.className = 'diari-session-farewell';
        banner.textContent = 'We saved your draft. See you next time.';
        document.body.appendChild(banner);
        requestAnimationFrame(function () {
            banner.classList.add('is-visible');
        });
        setTimeout(function () {
            global.location.href = 'dashboard.html';
        }, 1800);
    }

    function dismissTimeoutModal() {
        state.timeoutModalOpen = false;
        clearTimeout(timers.timeoutAuto);
        closeModal(els.timeoutModal);
        resetUserIdleTimer();
    }

    function runConcurrentCheck() {
        return new Promise(function (resolve) {
            var otherActive = false;
            var settled = false;

            function done(blocked) {
                if (settled) return;
                settled = true;
                resolve(Boolean(blocked));
            }

            try {
                channel = new BroadcastChannel(CHANNEL_NAME);
                channel.onmessage = function (ev) {
                    var data = ev.data || {};
                    if (data.type === 'session_check' && active && !destroyed) {
                        broadcast({ type: 'session_active', tab_id: tabId });
                    }
                    if (data.type === 'session_active' && data.tab_id !== tabId) {
                        otherActive = true;
                    }
                    if (data.type === 'session_takeover' && data.tab_id !== tabId) {
                        endSession('takeover');
                    }
                };
                channel.postMessage({ type: 'session_check', tab_id: tabId });
            } catch (_) {
                done(false);
                return;
            }

            setTimeout(function () {
                var lock = readLock();
                var lockBlocks =
                    lock && lock.tab_id !== tabId && !isLockStale(lock);
                done(otherActive || lockBlocks);
            }, CONCURRENT_WAIT_MS);
        });
    }

    function showConcurrentModal() {
        return new Promise(function (resolve) {
            openModal(els.concurrentModal);
            function cleanup(choice) {
                closeModal(els.concurrentModal);
                els.concurrentUseBtn.removeEventListener('click', onUse);
                els.concurrentBackBtn.removeEventListener('click', onBack);
                resolve(choice);
            }
            function onUse() {
                broadcast({ type: 'session_takeover', tab_id: tabId });
                clearLock();
                cleanup('use');
            }
            function onBack() {
                cleanup('back');
            }
            els.concurrentUseBtn.addEventListener('click', onUse);
            els.concurrentBackBtn.addEventListener('click', onBack);
        });
    }

    function showDraftRecoveryModal(draft) {
        return new Promise(function (resolve) {
            var title = String(draft.title || '').trim() || 'Untitled entry';
            var body = String(draft.body || '').trim();
            var snippet = body.slice(0, 100) + (body.length > 100 ? '\u2026' : '');
            var dateLabel = 'Previous session';
            try {
                dateLabel = new Date(draft.date || draft.last_saved).toLocaleString(undefined, {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                });
            } catch (_) {}
            if (els.draftPreviewTitle) els.draftPreviewTitle.textContent = title;
            if (els.draftPreviewMeta) els.draftPreviewMeta.textContent = dateLabel;
            if (els.draftPreviewSnippet) els.draftPreviewSnippet.textContent = snippet || '(No body text)';
            openModal(els.draftModal);
            function cleanup(choice) {
                closeModal(els.draftModal);
                els.draftContinueBtn.removeEventListener('click', onContinue);
                els.draftFreshBtn.removeEventListener('click', onFresh);
                resolve(choice);
            }
            function onContinue() {
                cleanup('continue');
            }
            function onFresh() {
                cleanup('fresh');
            }
            els.draftContinueBtn.addEventListener('click', onContinue);
            els.draftFreshBtn.addEventListener('click', onFresh);
        });
    }

    function bindActivityListeners() {
        if (activityBound) return;
        activityBound = true;
        var passive = { passive: true };
        document.addEventListener('mousemove', onUserActivity, passive);
        document.addEventListener('keydown', onUserActivity);
        document.addEventListener('scroll', onUserActivity, passive);
        document.addEventListener('touchstart', onUserActivity, passive);

        document.addEventListener('input', function (e) {
            var t = e.target;
            if (t && (t.id === 'journalText' || t.id === 'journalTitleInput')) onTyping();
        });

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') persistDraft();
        });

        window.addEventListener('beforeunload', function () {
            persistDraft();
        });

        if (els.timeoutContinueBtn) {
            els.timeoutContinueBtn.addEventListener('click', dismissTimeoutModal);
        }
        if (els.timeoutSaveBtn) {
            els.timeoutSaveBtn.addEventListener('click', function () {
                dismissTimeoutModal();
                if (hooks && typeof hooks.saveEntryAndRedirect === 'function') {
                    hooks.saveEntryAndRedirect('entries.html');
                }
            });
        }
        if (els.timeoutDiscardBtn) {
            els.timeoutDiscardBtn.addEventListener('click', function () {
                dismissTimeoutModal();
                clearDraft();
                endSession('timeout_discard');
                global.location.href = 'dashboard.html';
            });
        }
    }

    function startBackground() {
        active = true;
        writeLock();
        updateTimerDisplay();

        timers.display = setInterval(updateTimerDisplay, TIMER_TICK_MS);
        timers.autosave = setInterval(persistDraft, AUTOSAVE_MS);
        timers.heartbeat = setInterval(function () {
            if (!active || destroyed) return;
            writeLock();
            broadcast({ type: 'session_active', tab_id: tabId });
        }, HEARTBEAT_MS);

        resetUserIdleTimer();
        resetTypingIdleTimer();
        bindActivityListeners();
        broadcast({ type: 'session_active', tab_id: tabId });
    }

    function cacheElements() {
        els.timer = document.getElementById('diariSessionTimer');
        els.draftToast = document.getElementById('diariSessionDraftToast');
        els.draftModal = document.getElementById('diariSessionDraftModal');
        els.concurrentModal = document.getElementById('diariSessionConcurrentModal');
        els.timeoutModal = document.getElementById('diariSessionTimeoutModal');
        els.draftPreviewTitle = document.getElementById('diariSessionDraftPreviewTitle');
        els.draftPreviewMeta = document.getElementById('diariSessionDraftPreviewMeta');
        els.draftPreviewSnippet = document.getElementById('diariSessionDraftPreviewSnippet');
        els.draftContinueBtn = document.getElementById('diariSessionDraftContinueBtn');
        els.draftFreshBtn = document.getElementById('diariSessionDraftFreshBtn');
        els.concurrentUseBtn = document.getElementById('diariSessionConcurrentUseBtn');
        els.concurrentBackBtn = document.getElementById('diariSessionConcurrentBackBtn');
        els.timeoutContinueBtn = document.getElementById('diariSessionTimeoutContinueBtn');
        els.timeoutSaveBtn = document.getElementById('diariSessionTimeoutSaveBtn');
        els.timeoutDiscardBtn = document.getElementById('diariSessionTimeoutDiscardBtn');
        els.timeoutSessionMeta = document.getElementById('diariSessionTimeoutMeta');
    }

    async function runConcurrentPhase() {
        if (!isWriteEntryPage()) {
            concurrentDone = true;
            return;
        }
        cacheElements();
        var blocked = await runConcurrentCheck();
        if (blocked) {
            var choice = await showConcurrentModal();
            if (choice === 'back') {
                global.location.href = 'dashboard.html';
                return;
            }
            broadcast({ type: 'session_takeover', tab_id: tabId });
        }
        var lock = readLock();
        if (lock && lock.tab_id !== tabId && !isLockStale(lock)) {
            localStorage.removeItem(KEYS.lock);
        }
        concurrentDone = true;
    }

    async function startSessionPhase() {
        if (!isWriteEntryPage() || sessionStarted || destroyed) return;
        if (!concurrentDone) await runConcurrentPhase();
        if (destroyed || global.location.pathname.indexOf('write-entry') === -1) return;

        sessionStarted = true;
        var visitStart = Date.now();
        var existingStart = Number(localStorage.getItem(KEYS.start));
        var draft = readDraft();

        if (draftHasContent(draft) && hooks && typeof hooks.applyDraft === 'function') {
            var sameSession =
                existingStart > 0 && Number(draft.session_start) === existingStart;
            if (sameSession) {
                setSessionStartMs(existingStart);
                hooks.applyDraft(draft);
            } else {
                var recovery = await showDraftRecoveryModal(draft);
                if (recovery === 'continue') {
                    setSessionStartMs(Number(draft.session_start) || visitStart);
                    hooks.applyDraft(draft);
                } else {
                    clearDraft();
                    setSessionStartMs(visitStart);
                }
            }
        } else {
            setSessionStartMs(existingStart > 0 ? existingStart : visitStart);
        }

        startBackground();
        readyResolve();
    }

    function endSession(reason) {
        if (destroyed && reason !== 'takeover') return;
        destroyed = true;
        active = false;

        clearInterval(timers.display);
        clearInterval(timers.autosave);
        clearInterval(timers.heartbeat);
        clearTimeout(timers.typingIdle);
        clearTimeout(timers.userIdle);
        clearTimeout(timers.timeoutAuto);

        if (reason === 'saved' || reason === 'discarded' || reason === 'timeout_discard') {
            clearDraft();
        }

        clearLock();
        localStorage.removeItem(KEYS.start);
        sessionStartMs = null;

        broadcast({ type: 'session_ended', tab_id: tabId });

        try {
            if (channel) channel.close();
        } catch (_) {}
        channel = null;

        if (els.timer) {
            els.timer.hidden = true;
            els.timer.textContent = '';
        }

        if (reason !== 'takeover') {
            state.timeoutModalOpen = false;
            releaseBodyScroll();
        }
    }

    global.DiariSessionManager = {
        whenReady: function () {
            return readyPromise;
        },
        registerHooks: function (h) {
            hooks = h || null;
        },
        start: function () {
            return startSessionPhase();
        },
        endSession: endSession,
        notifyActivity: onTyping,
        persistDraft: persistDraft,
        getSessionStartMs: getSessionStartMs,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runConcurrentPhase);
    } else {
        runConcurrentPhase();
    }
})(typeof window !== 'undefined' ? window : this);
