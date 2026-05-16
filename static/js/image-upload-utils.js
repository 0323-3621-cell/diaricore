/**
 * Shared image upload helpers (write-entry + entry edit).
 */
(function (global) {
    'use strict';

    const PARALLEL_UPLOADS = 4;
    const COMPRESS_MIN_BYTES = 380 * 1024;
    const COMPRESS_MAX_PX = 1920;
    const JPEG_QUALITY = 0.82;

    const ACCEPTED_IMAGE_MIMES = new Set([
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/bmp',
        'image/x-ms-bmp',
        'image/tiff',
        'image/avif',
        'image/heic',
        'image/heif',
        'image/jfif',
        'image/pjpeg',
    ]);

    const IMAGE_EXT_TO_MIME = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        jfif: 'image/jpeg',
        pjpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        bmp: 'image/bmp',
        tif: 'image/tiff',
        tiff: 'image/tiff',
        avif: 'image/avif',
        heic: 'image/heic',
        heif: 'image/heif',
    };

    const IMAGE_ACCEPT_ATTR =
        'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/avif,image/heic,image/heif,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.tif,.tiff,.avif,.heic,.heif';

    function formatUploadBytes(n) {
        const b = Math.max(0, Math.floor(Number(n) || 0));
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
        return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    }

    function formatProgress(loaded, total) {
        const t = Math.max(1, Math.floor(Number(total) || 0));
        const l = Math.min(t, Math.max(0, Math.floor(Number(loaded) || 0)));
        return `${formatUploadBytes(l)} / ${formatUploadBytes(t)}`;
    }

    function progressFromBytes(loaded, total) {
        const t = Number(total) || 0;
        if (t <= 0) return 8;
        return Math.min(99, Math.max(8, Math.round((Number(loaded) / t) * 100)));
    }

    function createUploadPool(limit) {
        const cap = Math.max(1, Number(limit) || PARALLEL_UPLOADS);
        let active = 0;
        const wait = [];
        return function schedule(task) {
            return new Promise((resolve, reject) => {
                const run = async () => {
                    active += 1;
                    try {
                        resolve(await task());
                    } catch (err) {
                        reject(err);
                    } finally {
                        active -= 1;
                        const next = wait.shift();
                        if (next) next();
                    }
                };
                if (active < cap) {
                    void run();
                } else {
                    wait.push(run);
                }
            });
        };
    }

    function postImageForm(file, userId, onProgress) {
        return new Promise((resolve, reject) => {
            const form = new FormData();
            form.append('file', file);
            form.append('userId', String(userId));
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/uploads/image');
            xhr.responseType = 'json';
            xhr.upload.addEventListener('progress', (e) => {
                if (!e.lengthComputable || typeof onProgress !== 'function') return;
                onProgress(e.loaded, e.total);
            });
            xhr.addEventListener('load', () => {
                let json = xhr.response;
                if (typeof json === 'string') {
                    try {
                        json = JSON.parse(json);
                    } catch (_) {
                        json = {};
                    }
                }
                if (xhr.status >= 200 && xhr.status < 300 && json?.success && json?.url) {
                    resolve(String(json.url));
                    return;
                }
                reject(new Error(json?.error || `Upload failed (${xhr.status})`));
            });
            xhr.addEventListener('error', () => reject(new Error('Upload failed (network)')));
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
            xhr.send(form);
        });
    }

    async function uploadWithRetries(file, userId, onProgress, maxAttempts) {
        const attempts = Math.max(1, Number(maxAttempts) || 3);
        let lastErr = null;
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                return await postImageForm(file, userId, onProgress);
            } catch (e) {
                lastErr = e;
                if (attempt < attempts - 1) {
                    await new Promise((r) => setTimeout(r, 180 * (attempt + 1)));
                }
            }
        }
        throw lastErr || new Error('Upload failed');
    }

    function mimeFromFileName(name) {
        const ext = String(name || '').includes('.') ? String(name).split('.').pop().toLowerCase() : '';
        return IMAGE_EXT_TO_MIME[ext] || '';
    }

    function isAcceptedImageMime(type) {
        const t = String(type || '').toLowerCase().split(';')[0].trim();
        if (!t) return false;
        if (ACCEPTED_IMAGE_MIMES.has(t)) return true;
        return t.startsWith('image/');
    }

    async function rasterizeToJpegFile(file) {
        if (!file || typeof createImageBitmap !== 'function') return null;
        let bitmap;
        try {
            bitmap = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                bitmap.close();
                return null;
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            bitmap = null;
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (b) => (b ? resolve(b) : reject(new Error('decode failed'))),
                    'image/jpeg',
                    JPEG_QUALITY
                );
            });
            const base = String(file.name || 'photo').replace(/\.[^.]+$/i, '') || 'photo';
            return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        } catch (_) {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            return null;
        }
    }

    async function coerceImageUploadFile(file) {
        if (!file) return null;
        const type = String(file.type || '').toLowerCase().split(';')[0].trim();
        if (isAcceptedImageMime(type)) {
            try {
                return new File([file], file.name, { type: type || file.type, lastModified: file.lastModified });
            } catch (_) {
                return file;
            }
        }
        const mime = mimeFromFileName(file.name);
        if (mime && isAcceptedImageMime(mime)) {
            try {
                return new File([file], file.name, { type: mime, lastModified: file.lastModified });
            } catch (_) {
                return file;
            }
        }
        if (type.startsWith('image/') || mimeFromFileName(file.name)) {
            return rasterizeToJpegFile(file);
        }
        return null;
    }

    async function prepareUploadFile(file) {
        if (!file || typeof file.size !== 'number') return file;
        const normalized = await coerceImageUploadFile(file);
        file = normalized || file;
        if (file.type === 'image/gif') return file;
        if (file.size < COMPRESS_MIN_BYTES) return file;
        if (typeof createImageBitmap !== 'function') return file;

        let bitmap;
        try {
            bitmap = await createImageBitmap(file);
            const maxSide = Math.max(bitmap.width, bitmap.height);
            if (maxSide <= COMPRESS_MAX_PX && file.size < COMPRESS_MIN_BYTES * 1.5) {
                bitmap.close();
                return file;
            }
            const scale = Math.min(1, COMPRESS_MAX_PX / maxSide);
            const w = Math.max(1, Math.round(bitmap.width * scale));
            const h = Math.max(1, Math.round(bitmap.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                bitmap.close();
                return file;
            }
            ctx.drawImage(bitmap, 0, 0, w, h);
            bitmap.close();
            bitmap = null;
            const blob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (b) => (b ? resolve(b) : reject(new Error('compress failed'))),
                    'image/jpeg',
                    JPEG_QUALITY
                );
            });
            const base = String(file.name || 'photo').replace(/\.[^.]+$/i, '') || 'photo';
            return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        } catch (_) {
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
            return file;
        }
    }

    function spinnerHtml(bytesLabel) {
        const label = String(bytesLabel || '').trim();
        const bytes = label
            ? `<span class="entry-img-spinner__bytes">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`
            : '';
        return `<div class="entry-img-spinner" role="status" aria-label="Uploading"><span class="entry-img-spinner__ring" aria-hidden="true"></span>${bytes}</div>`;
    }

    function createSpinnerElement(bytesLabel) {
        const wrap = document.createElement('div');
        wrap.className = 'entry-img-spinner';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-label', 'Uploading');
        const ring = document.createElement('span');
        ring.className = 'entry-img-spinner__ring';
        ring.setAttribute('aria-hidden', 'true');
        wrap.appendChild(ring);
        const label = String(bytesLabel || '').trim();
        if (label) {
            const bytes = document.createElement('span');
            bytes.className = 'entry-img-spinner__bytes';
            bytes.textContent = label;
            wrap.appendChild(bytes);
        }
        return wrap;
    }

    function setSpinnerBytes(spinnerEl, bytesLabel) {
        if (!spinnerEl) return;
        const label = String(bytesLabel || '').trim();
        let bytes = spinnerEl.querySelector('.entry-img-spinner__bytes');
        if (!label) {
            if (bytes) bytes.remove();
            return;
        }
        if (!bytes) {
            bytes = document.createElement('span');
            bytes.className = 'entry-img-spinner__bytes';
            spinnerEl.appendChild(bytes);
        }
        bytes.textContent = label;
    }

    global.DiariImageUpload = {
        PARALLEL_UPLOADS,
        ACCEPTED_IMAGE_MIMES,
        IMAGE_EXT_TO_MIME,
        IMAGE_ACCEPT_ATTR,
        formatUploadBytes,
        formatProgress,
        progressFromBytes,
        createUploadPool,
        coerceImageUploadFile,
        prepareUploadFile,
        uploadWithRetries,
        spinnerHtml,
        createSpinnerElement,
        setSpinnerBytes,
    };
})(typeof window !== 'undefined' ? window : global);
