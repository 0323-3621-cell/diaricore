/**
 * DiariCore API client: session cookies, CSRF, and optional session refresh.
 * Does not modify request bodies — journal text is sent as the user typed it.
 */
(function (w) {
    var CSRF_KEY = 'diariCoreCsrf';
    var nativeFetch = w.fetch.bind(w);

    function getCsrfToken() {
        try {
            return sessionStorage.getItem(CSRF_KEY) || '';
        } catch (_) {
            return '';
        }
    }

    function setCsrfToken(token) {
        if (!token) return;
        try {
            sessionStorage.setItem(CSRF_KEY, String(token));
        } catch (_) {}
    }

    function clearCsrfToken() {
        try {
            sessionStorage.removeItem(CSRF_KEY);
        } catch (_) {}
    }

    function isApiUrl(url) {
        if (!url) return false;
        var s = String(url);
        if (s.indexOf('/api/') === 0) return true;
        try {
            var u = new URL(s, w.location.origin);
            return u.origin === w.location.origin && u.pathname.indexOf('/api/') === 0;
        } catch (_) {
            return false;
        }
    }

    function isPublicApiUrl(url) {
        var path = url;
        try {
            path = new URL(String(url), w.location.origin).pathname;
        } catch (_) {}
        return (
            path.indexOf('/api/health') === 0 ||
            path.indexOf('/api/register') === 0 ||
            path.indexOf('/api/login') === 0 ||
            path.indexOf('/api/password/') === 0 ||
            path.indexOf('/api/check-availability') === 0
        );
    }

    function needsCsrf(method) {
        var m = (method || 'GET').toUpperCase();
        return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
    }

    w.fetch = function (input, init) {
        init = init || {};
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (!isApiUrl(url)) {
            return nativeFetch(input, init);
        }

        init.credentials = init.credentials || 'include';

        if (needsCsrf(init.method) && !isPublicApiUrl(url)) {
            var csrf = getCsrfToken();
            if (csrf) {
                var headers = new Headers(init.headers || {});
                if (!headers.has('X-CSRF-Token')) {
                    headers.set('X-CSRF-Token', csrf);
                }
                init.headers = headers;
            }
        }

        return nativeFetch(input, init).then(function (res) {
            if (
                res.status === 401 &&
                isApiUrl(url) &&
                !isPublicApiUrl(url) &&
                typeof w.DiariApi !== 'undefined' &&
                w.DiariApi._redirectOnAuthFailure !== false
            ) {
                try {
                    var hasUser = w.localStorage.getItem('diariCoreUser');
                    if (hasUser && !/login\.html|register\.html|verify-registration/.test(w.location.pathname)) {
                        w.localStorage.removeItem('diariCoreUser');
                        clearCsrfToken();
                        w.location.href = 'login.html';
                    }
                } catch (_) {}
            }
            return res;
        });
    };

    function bootstrapSession() {
        var hasUser = false;
        try {
            hasUser = Boolean(w.localStorage.getItem('diariCoreUser'));
        } catch (_) {}
        if (!hasUser || getCsrfToken()) {
            return Promise.resolve(null);
        }
        return nativeFetch('/api/auth/session', { credentials: 'include' })
            .then(function (res) {
                return res.json().then(function (data) {
                    return { ok: res.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result || !result.ok || !result.data || !result.data.success) {
                    return null;
                }
                if (result.data.csrfToken) {
                    setCsrfToken(result.data.csrfToken);
                }
                if (result.data.user) {
                    try {
                        var stored = JSON.parse(w.localStorage.getItem('diariCoreUser') || '{}');
                        var merged = Object.assign({}, stored, result.data.user, {
                            isLoggedIn: true,
                        });
                        w.localStorage.setItem('diariCoreUser', JSON.stringify(merged));
                    } catch (_) {}
                }
                return result.data;
            })
            .catch(function () {
                return null;
            });
    }

  function logoutApi() {
        clearCsrfToken();
        return nativeFetch('/api/logout', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        }).catch(function () {});
    }

    w.DiariApi = {
        getCsrfToken: getCsrfToken,
        setCsrfToken: setCsrfToken,
        clearCsrfToken: clearCsrfToken,
        bootstrapSession: bootstrapSession,
        logoutApi: logoutApi,
        _redirectOnAuthFailure: true,
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapSession);
    } else {
        bootstrapSession();
    }
})(window);
