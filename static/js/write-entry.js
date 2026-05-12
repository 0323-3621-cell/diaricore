// Write Entry Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let selectedFeeling = null;
    let selectedTags = new Set();
    let manualDateTime = null;
    /** Last-good datetime-local value while editing; reverting avoids overwriting digits with “now”. */
    let journalDateTimeBaselineLocal = '';
    let pickerOpenedAtLocalStr = '';
    let priorManualDateTimeOnPickerOpen = null;

    /** Progress bar 0→100% duration and minimum time before results (same value keeps bar and gate aligned). */
    const MOOD_ANALYSIS_TOTAL_MS = 8000;
    /** If book became ready very late, extend slightly so it is not a flash (ms after ready). */
    const MOOD_ANALYSIS_MIN_AFTER_BOOK_MS = 1200;

    let moodAnalysisLoadingShownAt = 0;
    let moodAnalysisBookReadyAt = null;
    let moodAnalysisProgressTimer = null;

    function clearMoodAnalysisProgressTimer() {
        if (moodAnalysisProgressTimer != null) {
            clearInterval(moodAnalysisProgressTimer);
            moodAnalysisProgressTimer = null;
        }
    }

    /** Book-Loader via lottie-web (plain div — avoids lottie-player freezing off-screen/hidden animations). */
    const MOOD_ANALYSIS_BOOK_LOTTIE_SRC = '/noto-emoji/Book-Loader.json';
    let moodAnalysisBookMountEl = null;
    let moodAnalysisBookAnim = null;
    let moodAnalysisBookPrimePromise = null;

    primeMoodAnalysisBookLottie();

    function normalizeTag(tag) {
        return String(tag || '').trim().replace(/\s+/g, ' ');
    }

    function getCurrentUserId() {
        const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        const raw = user?.id ?? user?.userId ?? 0;
        const parsed = Number(raw);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    }

    const DEFAULT_TAGS = [
        { name: 'School', icon: 'bi bi-book', iconType: 'bi' },
        { name: 'Home', icon: 'bi bi-house', iconType: 'bi' },
        { name: 'Friends', icon: 'bi bi-people', iconType: 'bi' },
        { name: 'Work', icon: 'bi bi-briefcase', iconType: 'bi' },
        { name: 'Family', icon: 'bi bi-heart', iconType: 'bi' },
        { name: 'Health', icon: 'bi bi-heart-pulse', iconType: 'bi' },
        { name: 'Money', icon: 'bi bi-currency-dollar', iconType: 'bi' },
        { name: 'Bills', icon: 'bi bi-receipt', iconType: 'bi' },
    ];
    const DEFAULT_TAG_SET = new Set(DEFAULT_TAGS.map((x) => normalizeTag(x.name).toLowerCase()));
    const TAG_USAGE_KEY = 'diariCoreTagUsage';
    const TAG_EXPANDED_KEY = 'diariCoreTagsExpanded';
    const TAG_SYNC_QUEUE_KEY = 'diariCoreTagSyncQueue';

    const CUSTOM_TAGS_BATCH_SIZE = 100;
    const ICON_SEARCH_ALIASES = {
        money: ['cash', 'coin', 'wallet', 'credit-card', 'bank', 'piggy-bank', 'currency'],
        bills: ['receipt', 'cash', 'credit-card', 'wallet', 'currency'],
        budget: ['wallet', 'piggy-bank', 'cash', 'graph', 'calculator'],
        finance: ['bank', 'cash', 'coin', 'wallet', 'credit-card', 'currency'],
        payment: ['credit-card', 'wallet', 'cash', 'coin', 'receipt'],
        food: ['cup', 'egg', 'apple', 'basket', 'cake', 'cup-hot'],
        fitness: ['heart-pulse', 'activity', 'bicycle', 'trophy', 'stopwatch'],
        travel: ['airplane', 'car', 'bus', 'train', 'geo', 'suitcase'],
        study: ['book', 'journal', 'pen', 'pencil', 'mortarboard', 'backpack'],
        work: ['briefcase', 'building', 'laptop', 'display', 'clipboard'],
        home: ['house', 'lamp', 'door', 'window', 'shop'],
        family: ['people', 'person', 'heart', 'house-heart', 'emoji-smile'],
    };
    let pickerIconNames = [];
    let customTagPage = 0;
    let customTagSearch = '';
    let selectedPickerIconName = '';
    let tagItemsState = [];
    let tagExpanded = localStorage.getItem(TAG_EXPANDED_KEY) === '1';
    const OFFLINE_DB_NAME = 'diariCoreOfflineMedia';
    const OFFLINE_DB_STORE = 'pendingEntries';
    const MAX_IMAGE_WARN = 10;
    const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    let attachedImages = [];
    let lightboxIndex = 0;
    let dragDepth = 0;

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function iconClassForTag(tagName) {
        const t = normalizeTag(tagName).toLowerCase();
        const match = DEFAULT_TAGS.find((x) => x.name.toLowerCase() === t);
        return match ? match.icon : 'bi bi-hash';
    }

    function iconMarkup(iconName, iconType = 'bi') {
        if (iconType === 'bi') {
            const normalized = String(iconName || '').trim();
            const cls = normalized.startsWith('bi ') ? normalized : `bi bi-${normalized || 'hash'}`;
            return `<i class="${escapeHtml(cls)}"></i>`;
        }
        return `<i class="bi bi-hash"></i>`;
    }

    function openOfflineDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(OFFLINE_DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(OFFLINE_DB_STORE)) {
                    db.createObjectStore(OFFLINE_DB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
        });
    }

    async function idbPut(value) {
        const db = await openOfflineDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
            tx.objectStore(OFFLINE_DB_STORE).put(value);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB put failed'));
        });
        db.close();
    }

    async function idbGetAll() {
        const db = await openOfflineDb();
        const result = await new Promise((resolve, reject) => {
            const tx = db.transaction(OFFLINE_DB_STORE, 'readonly');
            const req = tx.objectStore(OFFLINE_DB_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
        });
        db.close();
        return result;
    }

    async function idbDelete(id) {
        const db = await openOfflineDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
            tx.objectStore(OFFLINE_DB_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
        });
        db.close();
    }

    function formatPhotoCount(n) {
        return `${n} photo${n === 1 ? '' : 's'} attached`;
    }

    function updatePhotoBadge() {
        const badge = document.getElementById('photoCountBadge');
        if (!badge) return;
        const count = attachedImages.length;
        badge.hidden = count <= 0;
        badge.textContent = formatPhotoCount(count);
    }

    function updateImageProgress(id, progress) {
        attachedImages = attachedImages.map((img) => (img.id === id ? { ...img, progress } : img));
        renderImageGallery();
    }

    async function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Could not read file'));
            reader.readAsDataURL(file);
        });
    }

    function dataUrlToBlob(dataUrl) {
        const [meta, base64] = String(dataUrl || '').split(',');
        const mimeMatch = /data:(.*?);base64/.exec(meta || '');
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const bytes = Uint8Array.from(atob(base64 || ''), (c) => c.charCodeAt(0));
        return new Blob([bytes], { type: mime });
    }

    async function uploadImageOnline(file, userId, localId) {
        const form = new FormData();
        form.append('file', file);
        form.append('userId', String(userId));
        updateImageProgress(localId, 30);
        const res = await fetch('/api/uploads/image', { method: 'POST', body: form });
        updateImageProgress(localId, 85);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success || !json?.url) {
            throw new Error(json?.error || 'Upload failed');
        }
        return String(json.url);
    }

    function makeImageItem({ url = '', dataUrl = '', name = '' } = {}) {
        return {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            url,
            dataUrl,
            name,
            progress: 0,
        };
    }

    function renderImageGallery() {
        const gallery = document.getElementById('entryGallery');
        const toolbar = document.getElementById('entryGalleryToolbar');
        if (!gallery) return;
        const count = attachedImages.length;
        if (toolbar) toolbar.hidden = count !== 1;
        updatePhotoBadge();
        if (!count) {
            gallery.className = 'entry-gallery is-empty';
            gallery.innerHTML = `
                <button type="button" class="entry-gallery-empty" id="entryGalleryEmptyTrigger">
                    <i class="bi bi-image"></i>
                    <span>Add photos to your entry</span>
                </button>
            `;
            const trigger = document.getElementById('entryGalleryEmptyTrigger');
            trigger?.addEventListener('click', () => document.getElementById('imageFileInput')?.click());
            return;
        }
        gallery.className = 'entry-gallery';
        let mode = 'mode-4';
        if (count === 1) mode = 'mode-1';
        else if (count === 2) mode = 'mode-2';
        else if (count === 3) mode = 'mode-3';
        const baseCells = attachedImages.map((img, idx) => {
            const src = img.url || img.dataUrl;
            const cls = mode === 'mode-3' && idx === 0 ? 'entry-gallery-item is-primary' : 'entry-gallery-item';
            const progress = img.progress > 0 && img.progress < 100
                ? `<div class="entry-img-progress"><span style="width:${Math.max(8, img.progress)}%"></span></div>`
                : '';
            return `
                <div class="${cls}" data-image-id="${img.id}">
                    <img src="${escapeHtml(src)}" alt="Attached image" />
                    ${progress}
                    <div class="entry-gallery-item-actions">
                        <button type="button" class="entry-gallery-action-btn" data-action="preview" data-index="${idx}" aria-label="Preview image"><i class="bi bi-search"></i></button>
                        <button type="button" class="entry-gallery-action-btn" data-action="delete" data-id="${escapeHtml(img.id)}" aria-label="Delete image"><i class="bi bi-trash3"></i></button>
                    </div>
                </div>
            `;
        });
        const addMoreCell = (count >= 4)
            ? `<button type="button" class="entry-gallery-add-cell" id="entryGalleryAddMore"><i class="bi bi-plus-lg"></i><span>Add more photos</span></button>`
            : '';
        gallery.innerHTML = `<div class="entry-gallery-grid ${mode}">${baseCells.join('')}${addMoreCell}</div>`;
        gallery.querySelectorAll('[data-action="preview"]').forEach((btn) => {
            btn.addEventListener('click', () => openLightbox(Number(btn.dataset.index || 0)));
        });
        gallery.querySelectorAll('[data-action="delete"]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = String(btn.dataset.id || '');
                if (!id) return;
                if (!confirm('Remove this photo?')) return;
                attachedImages = attachedImages.filter((img) => img.id !== id);
                renderImageGallery();
            });
        });
        document.getElementById('entryGalleryAddMore')?.addEventListener('click', () => {
            document.getElementById('imageFileInput')?.click();
        });
    }

    function openLightbox(index) {
        if (!attachedImages.length) return;
        lightboxIndex = Math.max(0, Math.min(index, attachedImages.length - 1));
        const modal = document.getElementById('photoLightbox');
        const img = document.getElementById('photoLightboxImage');
        if (!modal || !img) return;
        const current = attachedImages[lightboxIndex];
        img.src = current.url || current.dataUrl || '';
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        const modal = document.getElementById('photoLightbox');
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    function moveLightbox(step) {
        if (!attachedImages.length) return;
        const next = (lightboxIndex + step + attachedImages.length) % attachedImages.length;
        openLightbox(next);
    }

    async function addImagesFromFiles(fileList) {
        const files = Array.from(fileList || []).filter((f) => ACCEPTED_IMAGE_TYPES.has(String(f.type || '').toLowerCase()));
        if (!files.length) return;
        const userId = getCurrentUserId();
        if (attachedImages.length + files.length > MAX_IMAGE_WARN) {
            alert('You added more than 10 images. This is okay, but it may affect upload speed.');
        }
        for (const file of files) {
            const item = makeImageItem({ name: file.name });
            attachedImages.push(item);
            renderImageGallery();
            try {
                if (isOnlineNow() && userId) {
                    const url = await uploadImageOnline(file, userId, item.id);
                    attachedImages = attachedImages.map((img) => (
                        img.id === item.id ? { ...img, url, progress: 100 } : img
                    ));
                } else {
                    updateImageProgress(item.id, 20);
                    const dataUrl = await fileToDataUrl(file);
                    attachedImages = attachedImages.map((img) => (
                        img.id === item.id ? { ...img, dataUrl, progress: 100 } : img
                    ));
                }
            } catch (e) {
                console.error('Image add failed:', e);
                attachedImages = attachedImages.filter((img) => img.id !== item.id);
                alert(`Could not add image: ${e.message || 'Unknown error'}`);
            }
            renderImageGallery();
        }
    }

    async function flushOfflineEntryQueue() {
        if (!isOnlineNow()) return;
        const userId = getCurrentUserId();
        if (!userId) return;
        let pending = [];
        try {
            pending = await idbGetAll();
        } catch (e) {
            console.warn('Unable to read pending offline entries:', e);
            return;
        }
        for (const item of pending) {
            try {
                const imageUrls = [];
                for (const img of item.images || []) {
                    if (img.url) {
                        imageUrls.push(img.url);
                        continue;
                    }
                    if (img.dataUrl) {
                        const blob = dataUrlToBlob(img.dataUrl);
                        const ext = (blob.type || 'image/png').split('/')[1] || 'png';
                        const file = new File([blob], `offline-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
                        const url = await uploadImageOnline(file, userId, `offline_${Math.random()}`);
                        imageUrls.push(url);
                    }
                }
                const response = await fetch('/api/entries', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        title: item.title || '',
                        entryDateTimeLocal: item.entryDateTimeLocal || '',
                        text: item.text || '',
                        tags: item.tags || [],
                        imageUrls,
                    }),
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result?.success || !result?.entry) {
                    throw new Error(result?.error || 'Offline sync entry save failed');
                }
                await idbDelete(item.id);
            } catch (e) {
                console.warn('Offline entry sync failed for item:', item?.id, e);
            }
        }
    }

    function isOnlineNow() {
        return navigator.onLine !== false;
    }

    function readJsonStorage(key, fallbackValue) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallbackValue;
            const parsed = JSON.parse(raw);
            return parsed ?? fallbackValue;
        } catch {
            return fallbackValue;
        }
    }

    function writeJsonStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn(`Failed to persist ${key}:`, e);
        }
    }

    function getTagUsageMap() {
        const raw = readJsonStorage(TAG_USAGE_KEY, {});
        return raw && typeof raw === 'object' ? raw : {};
    }

    function setTagUsage(tagName, ts = Date.now()) {
        const key = normalizeTag(tagName).toLowerCase();
        if (!key) return;
        const usage = getTagUsageMap();
        usage[key] = ts;
        writeJsonStorage(TAG_USAGE_KEY, usage);
    }

    function getTagSyncQueue() {
        const queue = readJsonStorage(TAG_SYNC_QUEUE_KEY, []);
        return Array.isArray(queue) ? queue : [];
    }

    function setTagSyncQueue(queue) {
        writeJsonStorage(TAG_SYNC_QUEUE_KEY, Array.isArray(queue) ? queue : []);
    }

    function queueTagOperation(op) {
        const queue = getTagSyncQueue();
        queue.push({ ...op, queuedAt: Date.now() });
        setTagSyncQueue(queue);
    }

    async function flushTagSyncQueue() {
        const userId = getCurrentUserId();
        if (!userId || !isOnlineNow()) return;
        const queue = getTagSyncQueue();
        if (!queue.length) return;
        const remaining = [];
        for (const op of queue) {
            try {
                if (op?.type === 'add') {
                    const res = await fetch('/api/tags', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            tag: op.tag,
                            iconName: op.iconName || '',
                        }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.success) throw new Error(json?.error || 'Add sync failed');
                } else if (op?.type === 'delete') {
                    const res = await fetch('/api/tags', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId,
                            tag: op.tag,
                        }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok || !json?.success) throw new Error(json?.error || 'Delete sync failed');
                }
            } catch (e) {
                console.warn('Deferred tag sync failed, keeping in queue:', e);
                remaining.push(op);
            }
        }
        setTagSyncQueue(remaining);
    }

    function getOrderedTags(items) {
        const usage = getTagUsageMap();
        return [...items].sort((a, b) => {
            const aUsed = Number(usage[normalizeTag(a.tag).toLowerCase()] || 0);
            const bUsed = Number(usage[normalizeTag(b.tag).toLowerCase()] || 0);
            if (aUsed !== bUsed) return bUsed - aUsed;
            return Number(a.baseOrder || 0) - Number(b.baseOrder || 0);
        });
    }

    function setTagExpanded(nextValue) {
        tagExpanded = !!nextValue;
        localStorage.setItem(TAG_EXPANDED_KEY, tagExpanded ? '1' : '0');
    }

    function updateMoreButton(extraCount) {
        const moreBtn = document.getElementById('moreTagsBtn');
        if (!moreBtn) return;
        const textEl = moreBtn.querySelector('span');
        if (!extraCount || extraCount <= 0) {
            moreBtn.style.display = 'none';
            moreBtn.classList.remove('expanded');
            if (textEl) textEl.textContent = 'more';
            return;
        }
        moreBtn.style.display = 'inline-flex';
        moreBtn.classList.toggle('expanded', tagExpanded);
        if (textEl) {
            textEl.textContent = tagExpanded ? 'less' : `+ ${extraCount} more tags`;
        }
    }

    function applyTagCollapse() {
        const container = document.querySelector('.tags-container');
        const addBtn = container?.querySelector('.tag-btn.add-tag');
        if (!container || !addBtn) return;

        const tagButtons = Array.from(container.querySelectorAll('.tag-btn:not(.add-tag)'));
        tagButtons.forEach((btn) => {
            btn.classList.remove('extra-row');
            btn.classList.remove('is-hidden-row');
            btn.style.display = 'flex';
        });
        addBtn.style.display = 'flex';

        if (!tagButtons.length) {
            updateMoreButton(0);
            return;
        }

        const rowTop = tagButtons[0].offsetTop;
        const firstRowTags = tagButtons.filter((btn) => Math.abs(btn.offsetTop - rowTop) <= 2);
        const firstRowSet = new Set(firstRowTags);
        const extras = tagButtons.filter((btn) => !firstRowSet.has(btn));
        extras.forEach((btn) => btn.classList.add('extra-row'));

        if (!tagExpanded) {
            const firstHidden = extras[0] || null;
            if (firstHidden) container.insertBefore(addBtn, firstHidden);
            extras.forEach((btn) => {
                btn.classList.add('is-hidden-row');
            });
            container.classList.add('is-collapsed');
            container.classList.remove('is-expanded');
        } else {
            container.appendChild(addBtn);
            extras.forEach((btn) => {
                btn.classList.remove('is-hidden-row');
            });
            container.classList.add('is-expanded');
            container.classList.remove('is-collapsed');
        }
        updateMoreButton(extras.length);
    }

    function renderTagButtons() {
        const container = document.querySelector('.tags-container');
        if (!container) return;
        const addBtn = container.querySelector('.tag-btn.add-tag');
        container.querySelectorAll('.tag-btn:not(.add-tag)').forEach((el) => el.remove());

        const ordered = getOrderedTags(tagItemsState);
        ordered.forEach((item) => {
            const btn = document.createElement('button');
            btn.className = 'tag-btn';
            btn.dataset.tag = item.tag;
            btn.dataset.iconName = item.iconName || '';
            btn.dataset.iconType = 'bi';
            btn.dataset.custom = item.isDefault ? '0' : '1';
            const resolvedBi = item.iconName || iconClassForTag(item.tag);
            const deleteMarkup = item.isDefault
                ? ''
                : `<button type="button" class="tag-delete-btn" aria-label="Delete ${escapeHtml(item.tag)} tag" title="Delete tag">&times;</button>`;
            btn.innerHTML = `${iconMarkup(resolvedBi, 'bi')}<span>${escapeHtml(item.tag)}</span>${deleteMarkup}`;
            btn.addEventListener('click', function(event) {
                const deleteBtn = event.target.closest('.tag-delete-btn');
                if (deleteBtn) return;
                const tag = normalizeTag(this.dataset.tag);
                if (!tag) return;
                if (selectedTags.has(tag)) {
                    selectedTags.delete(tag);
                    this.classList.remove('selected');
                } else {
                    selectedTags.add(tag);
                    this.classList.add('selected');
                    setTagUsage(tag);
                }
                applyTagCollapse();
            });
            const deleteBtn = btn.querySelector('.tag-delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const tag = normalizeTag(btn.dataset.tag);
                    if (!tag) return;
                    const ok = confirm('Delete this tag?');
                    if (!ok) return;
                    await deleteCustomTag(tag);
                });
            }
            if (selectedTags.has(item.tag)) btn.classList.add('selected');
            if (addBtn) container.insertBefore(btn, addBtn);
            else container.appendChild(btn);
        });

        applyTagCollapse();
    }

    async function syncUserTagsIntoUI() {
        const userId = getCurrentUserId();
        const defaults = DEFAULT_TAGS.map((x, idx) => ({
            tag: normalizeTag(x.name),
            iconName: x.icon,
            isDefault: true,
            baseOrder: idx,
        }));
        let merged = [...defaults];

        if (userId && isOnlineNow()) {
            try {
                const res = await fetch(`/api/tags?userId=${encodeURIComponent(String(userId))}`);
                const json = await res.json();
                if (res.ok && json.success) {
                    const custom = Array.isArray(json.tagItems)
                        ? json.tagItems.map((x, idx) => ({
                            tag: normalizeTag(x?.tag),
                            iconName: String(x?.iconName || '').trim().toLowerCase(),
                            isDefault: false,
                            baseOrder: defaults.length + idx,
                        }))
                        : [];
                    merged = defaults.concat(custom);
                }
            } catch (e) {
                console.warn('Using local tag fallback due to sync error:', e);
            }
        }

        // Apply offline queue effects optimistically in UI.
        const queue = getTagSyncQueue();
        queue.forEach((op) => {
            const key = normalizeTag(op?.tag).toLowerCase();
            if (!key) return;
            if (op.type === 'add') {
                if (!merged.some((x) => normalizeTag(x.tag).toLowerCase() === key)) {
                    merged.push({
                        tag: normalizeTag(op.tag),
                        iconName: String(op.iconName || '').trim().toLowerCase(),
                        isDefault: DEFAULT_TAG_SET.has(key),
                        baseOrder: merged.length,
                    });
                }
            } else if (op.type === 'delete') {
                merged = merged.filter((x) => normalizeTag(x.tag).toLowerCase() !== key || x.isDefault);
            }
        });

        const seen = new Set();
        tagItemsState = merged.filter((item, idx) => {
            const key = normalizeTag(item?.tag).toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            item.baseOrder = Number(item.baseOrder ?? idx);
            item.isDefault = DEFAULT_TAG_SET.has(key);
            if (!item.iconName) item.iconName = iconClassForTag(item.tag);
            return true;
        });
        renderTagButtons();
        await flushTagSyncQueue();
    }

    function updateJournalDateTime() {
        const dateTimeEl = document.getElementById('journalDateTime');
        if (!dateTimeEl) return;
        const sourceDate = manualDateTime || new Date();
        const datePart = sourceDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
        const timePart = sourceDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
        dateTimeEl.textContent = `${datePart} | ${timePart}`;
    }
    
    // Reset selected states on page load
    function resetSelections() {
        // Reset feelings selection
        selectedFeeling = null;
        const feelingCards = document.querySelectorAll('.feeling-card');
        feelingCards.forEach(card => {
            card.classList.remove('selected');
        });
        
        // Reset tags selection
        selectedTags.clear();
        const tagButtons = document.querySelectorAll('.tag-btn:not(.add-tag)');
        tagButtons.forEach(button => {
            button.classList.remove('selected');
        });
        
        console.log('Selections reset on page load');
    }
    
    // Call reset function immediately
    resetSelections();
    
    // Category switching functionality
    const categoryButtons = document.querySelectorAll('.category-btn');
    const categoryGrids = document.querySelectorAll('.category-grid');
    
    categoryButtons.forEach(button => {
        button.addEventListener('click', function() {
            const category = this.dataset.category;
            
            // Remove active class from all buttons and grids
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            categoryGrids.forEach(grid => grid.classList.remove('active'));
            
            // Add active class to clicked button and corresponding grid
            this.classList.add('active');
            const targetGrid = document.querySelector(`.category-grid[data-category="${category}"]`);
            if (targetGrid) {
                targetGrid.classList.add('active');
            }
        });
    });
    
    // Feeling selection functionality
    const feelingCards = document.querySelectorAll('.feeling-card');
    feelingCards.forEach(card => {
        card.addEventListener('click', function() {
            // Remove selected class from all cards
            feelingCards.forEach(c => c.classList.remove('selected'));
            
            // Add selected class to clicked card
            this.classList.add('selected');
            selectedFeeling = this.dataset.feeling;
            
            console.log('Selected feeling:', selectedFeeling);
        });
    });
    
    function updateTagVisibility() {
        applyTagCollapse();
    }
    
    // Initialize tags (defaults + user tags) then apply visibility rules
    syncUserTagsIntoUI();
    
    // Update on window resize
    window.addEventListener('resize', updateTagVisibility);
    window.addEventListener('online', () => {
        flushTagSyncQueue();
        syncUserTagsIntoUI();
        flushOfflineEntryQueue();
    });
    
    const customTagModal = document.getElementById('customTagModal');
    const customTagNameInput = document.getElementById('customTagNameInput');
    const customTagIconSearch = document.getElementById('customTagIconSearch');
    const customTagIconsGrid = document.getElementById('customTagIconsGrid');
    const customTagPagination = document.getElementById('customTagPagination');
    const customTagIconMeta = document.getElementById('customTagIconMeta');
    const customTagSaveBtn = document.getElementById('customTagSaveBtn');

    function filteredPickerIcons() {
        const q = customTagSearch.trim().toLowerCase();
        if (!q) return pickerIconNames;
        const aliasTerms = ICON_SEARCH_ALIASES[q] || [];
        return pickerIconNames.filter((name) => {
            if (name.includes(q)) return true;
            return aliasTerms.some((term) => name.includes(term));
        });
    }

    function renderCustomTagIconPage() {
        if (!customTagIconsGrid || !customTagPagination || !customTagIconMeta) return;
        const filtered = filteredPickerIcons();
        const pageCount = Math.max(1, Math.ceil(filtered.length / CUSTOM_TAGS_BATCH_SIZE));
        customTagPage = Math.max(0, Math.min(customTagPage, pageCount - 1));
        const start = customTagPage * CUSTOM_TAGS_BATCH_SIZE;
        const end = Math.min(filtered.length, start + CUSTOM_TAGS_BATCH_SIZE);
        const items = filtered.slice(start, end);
        customTagIconsGrid.innerHTML = items
            .map((iconName) => `
                <button type="button" class="custom-tag-icon-btn${selectedPickerIconName === iconName ? ' is-selected' : ''}" data-icon-name="${escapeHtml(iconName)}">
                    <i class="bi bi-${escapeHtml(iconName)}"></i>
                    <span>${escapeHtml(iconName)}</span>
                </button>
            `)
            .join('');
        customTagIconMeta.textContent = `${filtered.length} icons • page ${customTagPage + 1}/${pageCount}`;

        customTagPagination.innerHTML = `
            <button type="button" class="custom-tag-page-btn" data-page="prev" ${customTagPage <= 0 ? 'disabled' : ''}>Previous</button>
            <span class="custom-tag-page-meta">Showing ${filtered.length ? (start + 1) : 0}–${end} of ${filtered.length}</span>
            <button type="button" class="custom-tag-page-btn" data-page="next" ${customTagPage >= pageCount - 1 ? 'disabled' : ''}>Next</button>
        `;

        customTagIconsGrid.querySelectorAll('.custom-tag-icon-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                selectedPickerIconName = btn.dataset.iconName || '';
                renderCustomTagIconPage();
                updateCustomTagSaveState();
            });
        });
        customTagPagination.querySelectorAll('.custom-tag-page-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.dataset.page === 'prev') customTagPage -= 1;
                if (btn.dataset.page === 'next') customTagPage += 1;
                renderCustomTagIconPage();
            });
        });
    }

    function updateCustomTagSaveState() {
        if (!customTagSaveBtn) return;
        const validName = normalizeTag(customTagNameInput?.value || '');
        customTagSaveBtn.disabled = !(validName && selectedPickerIconName);
    }

    async function ensurePickerIconNamesLoaded() {
        if (pickerIconNames.length) return;
        const res = await fetch('/bootstrap-icon-names.json');
        const json = await res.json();
        if (!Array.isArray(json)) throw new Error('Invalid icon list');
        pickerIconNames = json
            .map((x) => String(x || '').trim().toLowerCase())
            .filter((x) => /^[a-z0-9-]+$/.test(x));
    }

    async function openCustomTagModal() {
        if (!customTagModal) return;
        customTagNameInput.value = '';
        customTagIconSearch.value = '';
        customTagSearch = '';
        selectedPickerIconName = '';
        customTagPage = 0;
        customTagSaveBtn.disabled = true;
        customTagModal.hidden = false;
        document.body.style.overflow = 'hidden';
        customTagIconMeta.textContent = 'Loading icons...';
        try {
            await ensurePickerIconNamesLoaded();
            renderCustomTagIconPage();
        } catch (e) {
            customTagIconMeta.textContent = 'Could not load icons. Try again.';
            customTagIconsGrid.innerHTML = '';
            customTagPagination.innerHTML = '';
            console.error(e);
        }
    }

    function closeCustomTagModal() {
        if (!customTagModal) return;
        customTagModal.hidden = true;
        document.body.style.overflow = '';
    }

    // Add tag functionality
    const addTagBtn = document.querySelector('.tag-btn.add-tag');
    addTagBtn.addEventListener('click', openCustomTagModal);
    const moreTagsBtn = document.getElementById('moreTagsBtn');
    if (moreTagsBtn) {
        moreTagsBtn.addEventListener('click', () => {
            setTagExpanded(!tagExpanded);
            applyTagCollapse();
        });
    }

    if (customTagModal) {
        customTagModal.querySelectorAll('[data-role="close-modal"]').forEach((el) => {
            el.addEventListener('click', closeCustomTagModal);
        });
        customTagModal.addEventListener('click', (event) => {
            if (event.target === customTagModal) closeCustomTagModal();
        });
    }
    if (customTagIconSearch) {
        customTagIconSearch.addEventListener('input', () => {
            customTagSearch = String(customTagIconSearch.value || '');
            customTagPage = 0;
            renderCustomTagIconPage();
        });
    }
    if (customTagNameInput) {
        customTagNameInput.addEventListener('input', updateCustomTagSaveState);
    }
    if (customTagSaveBtn) {
        customTagSaveBtn.addEventListener('click', async () => {
            const tagName = normalizeTag(customTagNameInput?.value || '');
            if (!tagName || !selectedPickerIconName) return;
            const ok = await createNewTag(tagName, selectedPickerIconName, 'bi');
            if (ok) {
                closeCustomTagModal();
            } else {
                customTagNameInput.focus();
                customTagNameInput.select();
            }
        });
    }

    async function createNewTag(tagName, iconName = '', iconType = 'bi') {
        const normalizedName = normalizeTag(tagName);
        if (!normalizedName) return false;
        const normalizedKey = normalizedName.toLowerCase();
        if (tagItemsState.some((item) => normalizeTag(item.tag).toLowerCase() === normalizedKey)) {
            alert('This tag already exists. Please choose a different name.');
            return false;
        }

        const nextTag = {
            tag: normalizedName,
            iconName: (iconType === 'bi' ? iconName : '') || iconClassForTag(normalizedName),
            isDefault: false,
            baseOrder: tagItemsState.length + DEFAULT_TAGS.length + 10,
        };
        tagItemsState.push(nextTag);
        setTagUsage(normalizedName);
        setTagExpanded(true);
        renderTagButtons();

        const userId = getCurrentUserId();
        if (!userId) {
            queueTagOperation({ type: 'add', tag: normalizedName, iconName: nextTag.iconName });
            return true;
        }

        if (!isOnlineNow()) {
            queueTagOperation({ type: 'add', tag: normalizedName, iconName: nextTag.iconName });
            return true;
        }

        try {
            const response = await fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, tag: normalizedName, iconName: nextTag.iconName }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) {
                throw new Error(result?.error || 'Failed to save tag.');
            }
        } catch (e) {
            console.error('Failed to save tag:', e);
            queueTagOperation({ type: 'add', tag: normalizedName, iconName: nextTag.iconName });
        }

        return true;
    }

    async function deleteCustomTag(tagName) {
        const normalized = normalizeTag(tagName);
        const key = normalized.toLowerCase();
        if (!normalized || DEFAULT_TAG_SET.has(key)) return false;
        tagItemsState = tagItemsState.filter((x) => normalizeTag(x.tag).toLowerCase() !== key);
        selectedTags.delete(normalized);
        renderTagButtons();

        const userId = getCurrentUserId();
        if (!userId || !isOnlineNow()) {
            queueTagOperation({ type: 'delete', tag: normalized });
            return true;
        }
        try {
            const response = await fetch('/api/tags', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, tag: normalized }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) {
                throw new Error(result?.error || 'Failed to delete tag.');
            }
        } catch (e) {
            console.warn('Delete will sync later:', e);
            queueTagOperation({ type: 'delete', tag: normalized });
        }
        return true;
    }

    const imageFileInput = document.getElementById('imageFileInput');
    const addPhotosBtn = document.getElementById('addPhotosBtn');
    const entrySplitLayout = document.getElementById('entrySplitLayout');
    const entryDropOverlay = document.getElementById('entryDropOverlay');
    const photoLightbox = document.getElementById('photoLightbox');
    const photoLightboxClose = document.getElementById('photoLightboxClose');
    const photoLightboxPrev = document.getElementById('photoLightboxPrev');
    const photoLightboxNext = document.getElementById('photoLightboxNext');

    addPhotosBtn?.addEventListener('click', () => imageFileInput?.click());
    imageFileInput?.addEventListener('change', async () => {
        await addImagesFromFiles(imageFileInput.files);
        imageFileInput.value = '';
    });

    if (entrySplitLayout) {
        const hasImageDrag = (evt) => Array.from(evt.dataTransfer?.types || []).includes('Files');
        entrySplitLayout.addEventListener('dragenter', (event) => {
            if (!hasImageDrag(event)) return;
            event.preventDefault();
            dragDepth += 1;
            if (entryDropOverlay) entryDropOverlay.hidden = false;
        });
        entrySplitLayout.addEventListener('dragover', (event) => {
            if (!hasImageDrag(event)) return;
            event.preventDefault();
        });
        entrySplitLayout.addEventListener('dragleave', (event) => {
            if (!hasImageDrag(event)) return;
            event.preventDefault();
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0 && entryDropOverlay) entryDropOverlay.hidden = true;
        });
        entrySplitLayout.addEventListener('drop', async (event) => {
            if (!hasImageDrag(event)) return;
            event.preventDefault();
            dragDepth = 0;
            if (entryDropOverlay) entryDropOverlay.hidden = true;
            await addImagesFromFiles(event.dataTransfer?.files || []);
        });
    }

    photoLightboxClose?.addEventListener('click', closeLightbox);
    photoLightboxPrev?.addEventListener('click', () => moveLightbox(-1));
    photoLightboxNext?.addEventListener('click', () => moveLightbox(1));
    photoLightbox?.addEventListener('click', (event) => {
        if (event.target === photoLightbox) closeLightbox();
    });

    renderImageGallery();
    
    const journalText = document.getElementById('journalText');
    const journalTitleInput = document.getElementById('journalTitleInput');
    const charCount = document.getElementById('charCount');
    const journalDateTimeBtn = document.getElementById('journalDateTimeBtn');
    const journalDateTimeInput = document.getElementById('journalDateTimeInput');

    const toLocalInputValue = (dateObj) => {
        const d = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
        return d.toISOString().slice(0, 16);
    };
    const nowLocalInputValue = () => toLocalInputValue(new Date());

    function parseManualFromLocalDatetime(str) {
        if (!str || typeof str !== 'string' || str.length < 16) return null;
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    /** Respect HTML datetime-local ordering: same string shape as max ⇒ year/month/day/time constrained consistently. */
    function applyCommittedLocalDatetime(localStr) {
        if (priorManualDateTimeOnPickerOpen === null && localStr === pickerOpenedAtLocalStr) {
            manualDateTime = null;
        } else {
            manualDateTime = parseManualFromLocalDatetime(localStr);
        }
        updateJournalDateTime();
    }

    /**
     * Only validates when value is a complete datetime-local string (yyyy-mm-ddThh:mm).
     * Incomplete values are left alone so typing / native picker aren’t wiped on blur.
     * Future values revert to last baseline or current max (never mid-keystroke — no input listener).
     */
    function clampFutureJournalDateTimeLocal() {
        if (!journalDateTimeInput) return;
        const maxStr = nowLocalInputValue();
        journalDateTimeInput.max = maxStr;
        const v = (journalDateTimeInput.value || '').trim();
        if (v.length < 16) return;
        if (v > maxStr) {
            const fb = journalDateTimeBaselineLocal || pickerOpenedAtLocalStr || maxStr;
            journalDateTimeInput.value = fb;
            journalDateTimeBaselineLocal = fb;
            applyCommittedLocalDatetime(fb);
            return;
        }
        journalDateTimeBaselineLocal = v;
        applyCommittedLocalDatetime(v);
    }

    let journalDateTimeBlurHideTimer = null;

    function hideJournalDateTimeEditor() {
        clearTimeout(journalDateTimeBlurHideTimer);
        journalDateTimeBlurHideTimer = null;
        clampFutureJournalDateTimeLocal();
        if (journalDateTimeInput) journalDateTimeInput.style.display = 'none';
    }

    function journalDateTimeEditorIsOpen() {
        return journalDateTimeInput && journalDateTimeInput.style.display === 'inline-block';
    }

    if (journalDateTimeInput) {
        journalDateTimeInput.max = nowLocalInputValue();
    }

    updateJournalDateTime();
    setInterval(() => {
        if (!manualDateTime) updateJournalDateTime();
        if (journalDateTimeInput) journalDateTimeInput.max = nowLocalInputValue();
    }, 30000);

    if (journalDateTimeBtn && journalDateTimeInput) {
        journalDateTimeBtn.addEventListener('click', () => {
            if (journalDateTimeEditorIsOpen()) {
                hideJournalDateTimeEditor();
                return;
            }
            priorManualDateTimeOnPickerOpen = manualDateTime;
            const baseDate = manualDateTime || new Date();
            journalDateTimeInput.max = nowLocalInputValue();
            const candidate = new Date(baseDate);
            const now = new Date();
            const safeBase = candidate.getTime() > now.getTime() ? now : candidate;
            pickerOpenedAtLocalStr = toLocalInputValue(safeBase);
            journalDateTimeBaselineLocal = pickerOpenedAtLocalStr;
            journalDateTimeInput.value = journalDateTimeBaselineLocal;
            journalDateTimeInput.style.display = 'inline-block';
            journalDateTimeInput.focus();
        });

        journalDateTimeInput.addEventListener('focus', () => {
            clearTimeout(journalDateTimeBlurHideTimer);
            journalDateTimeBlurHideTimer = null;
            journalDateTimeInput.max = nowLocalInputValue();
        });
        journalDateTimeInput.addEventListener('change', () => {
            clampFutureJournalDateTimeLocal();
        });

        journalDateTimeInput.addEventListener('blur', () => {
            clearTimeout(journalDateTimeBlurHideTimer);
            journalDateTimeBlurHideTimer = setTimeout(() => {
                journalDateTimeBlurHideTimer = null;
                if (!journalDateTimeEditorIsOpen()) return;
                if (document.activeElement === journalDateTimeInput) return;
                hideJournalDateTimeEditor();
            }, 200);
        });
        journalDateTimeInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' || event.key === 'Enter') hideJournalDateTimeEditor();
        });
    }

    journalText.addEventListener('input', function() {
        const count = this.value.length;
        if (charCount) {
            charCount.textContent = count;
            if (count > 4500) {
                charCount.style.color = 'var(--warning-color)';
            } else if (count > 4000) {
                charCount.style.color = 'var(--info-color)';
            } else {
                charCount.style.color = 'var(--text-muted)';
            }
        }
    });
    
    // Voice input button functionality
    const voiceInputBtn = document.getElementById('voiceInputBtn');
    
    if (voiceInputBtn) {
        voiceInputBtn.addEventListener('click', function() {
            // Both mobile and desktop now redirect to voice-entry.html
            window.location.href = 'voice-entry.html';
        });
    }
    
    async function handleSaveEntry() {
        const entryText = journalText.value.trim();
        const entryTitle = normalizeTag(journalTitleInput?.value || '');
        if (journalDateTimeInput && journalDateTimeInput.value.trim().length >= 16) {
            clampFutureJournalDateTimeLocal();
        }
        const entryDateTimeLocal = manualDateTime && journalDateTimeInput?.value ? String(journalDateTimeInput.value) : '';
        if (!entryText) {
            alert('Please write something in your journal entry.');
            return;
        }
        Array.from(selectedTags).forEach((tag) => setTagUsage(tag));
        renderTagButtons();

        const userId = getCurrentUserId();

        setSavingState(true);
        const analysisOverlay = ensureAnalysisOverlay();
        try {
            await primeMoodAnalysisBookLottie();
        } catch (_) {
            /* overlay still shows copy-only loading */
        }
        showAnalysisLoading(analysisOverlay);

        try {
            let imageUrls = attachedImages.map((img) => img.url).filter(Boolean);
            if (isOnlineNow() && userId) {
                const pendingUploads = attachedImages.filter((img) => !img.url && img.dataUrl);
                for (const item of pendingUploads) {
                    const blob = dataUrlToBlob(item.dataUrl);
                    const ext = (blob.type || 'image/png').split('/')[1] || 'png';
                    const file = new File([blob], `queued-${Date.now()}.${ext}`, { type: blob.type || 'image/png' });
                    const url = await uploadImageOnline(file, userId, item.id);
                    attachedImages = attachedImages.map((img) => (img.id === item.id ? { ...img, url, progress: 100 } : img));
                }
                imageUrls = attachedImages.map((img) => img.url).filter(Boolean);
            }
            const response = await fetch('/api/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    title: entryTitle,
                    entryDateTimeLocal,
                    text: entryText,
                    tags: Array.from(selectedTags).map(normalizeTag).filter(Boolean),
                    imageUrls
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success || !result.entry) {
                throw new Error(result.error || 'Failed to save entry.');
            }
            const analysisEngine = (result.analysisEngine || '').toString().toLowerCase();

            const savedEntry = {
                ...result.entry,
                title: result.entry.title || entryTitle,
                characterCount: entryText.length,
                moodScoringOffline: false,
            };
            const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
            entries.push(savedEntry);
            localStorage.setItem('diariCoreEntries', JSON.stringify(entries));
            console.log('Entry saved:', savedEntry);

            await delayUntilMoodAnalysisGate();
            showAnalysisResult(analysisOverlay, savedEntry, analysisEngine === 'fallback');
            localStorage.removeItem('diariCoreDraft');
            attachedImages = [];
            renderImageGallery();
        } catch (error) {
            console.error('Failed to save entry via API:', error);
            const fallbackEntry = {
                title: entryTitle,
                feeling: 'unspecified',
                tags: Array.from(selectedTags),
                text: entryText,
                imageUrls: attachedImages.map((img) => img.url || img.dataUrl).filter(Boolean),
                date: new Date().toISOString(),
                characterCount: entryText.length,
                moodScoringOffline: true,
            };
            try {
                await idbPut({
                    id: `offline_entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    userId,
                    title: entryTitle,
                    entryDateTimeLocal,
                    text: entryText,
                    tags: Array.from(selectedTags).map(normalizeTag).filter(Boolean),
                    images: attachedImages.map((img) => ({ url: img.url || '', dataUrl: img.dataUrl || '' })),
                    createdAt: new Date().toISOString(),
                });
            } catch (queueError) {
                console.warn('Could not queue offline entry:', queueError);
            }
            const entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
            entries.push(fallbackEntry);
            localStorage.setItem('diariCoreEntries', JSON.stringify(entries));
            await delayUntilMoodAnalysisGate();
            showAnalysisResult(analysisOverlay, fallbackEntry, true);
            localStorage.removeItem('diariCoreDraft');
        } finally {
            setSavingState(false);
        }
    }

    // Save entry functionality (desktop + mobile save buttons)
    const saveEntryButtons = document.querySelectorAll('#saveEntryBtn, .btn-save-entry');
    saveEntryButtons.forEach((btn) => {
        btn.addEventListener('click', handleSaveEntry);
    });
    
    // Cancel functionality
    const cancelBtn = document.getElementById('cancelBtn');
    cancelBtn.addEventListener('click', function() {
        if (journalText.value.trim() || selectedTags.size > 0) {
            if (confirm('Are you sure you want to cancel? Your unsaved changes will be lost.')) {
                window.location.href = 'dashboard.html';
            }
        } else {
            window.location.href = 'dashboard.html';
        }
    });
    
    async function delayUntilMoodAnalysisGate() {
        const shownAt = moodAnalysisLoadingShownAt || Date.now();
        const barEnd = shownAt + MOOD_ANALYSIS_TOTAL_MS;
        const bookEnd = moodAnalysisBookReadyAt
            ? moodAnalysisBookReadyAt + MOOD_ANALYSIS_MIN_AFTER_BOOK_MS
            : 0;
        const targetEnd = Math.max(barEnd, bookEnd);
        const wait = Math.max(0, targetEnd - Date.now());
        await new Promise((resolve) => setTimeout(resolve, wait));
    }

    function getMoodAnalysisBookPool() {
        let el = document.getElementById('moodAnalysisBookPool');
        if (!el) {
            el = document.createElement('div');
            el.id = 'moodAnalysisBookPool';
            el.className = 'mood-analysis-book-pool';
            el.setAttribute('aria-hidden', 'true');
            document.body.appendChild(el);
        }
        return el;
    }

    /** Fetch JSON once + lottie-web loadAnimation into off-screen mount (no IntersectionObserver freeze). */
    function primeMoodAnalysisBookLottie() {
        if (moodAnalysisBookPrimePromise) return moodAnalysisBookPrimePromise;
        moodAnalysisBookPrimePromise = (async () => {
            if (typeof window.lottie === 'undefined' || typeof window.lottie.loadAnimation !== 'function') {
                console.warn('Book-Loader: lottie-web not loaded');
                return null;
            }
            if (moodAnalysisBookMountEl && moodAnalysisBookAnim) return moodAnalysisBookAnim;
            try {
                const res = await fetch(MOOD_ANALYSIS_BOOK_LOTTIE_SRC, { credentials: 'same-origin' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const pool = getMoodAnalysisBookPool();
                const mount = document.createElement('div');
                mount.className = 'mood-analysis-book-lottie mood-analysis-book-mount';
                mount.setAttribute('aria-hidden', 'true');
                pool.appendChild(mount);
                moodAnalysisBookMountEl = mount;
                const anim = window.lottie.loadAnimation({
                    container: mount,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    animationData: data,
                });
                moodAnalysisBookAnim = anim;
                anim.addEventListener('DOMLoaded', () => {
                    if (!moodAnalysisBookReadyAt) moodAnalysisBookReadyAt = Date.now();
                });
                requestAnimationFrame(() => {
                    if (!moodAnalysisBookReadyAt) moodAnalysisBookReadyAt = Date.now();
                });
                return anim;
            } catch (e) {
                console.warn('Book-Loader preload:', e);
                return null;
            }
        })();
        return moodAnalysisBookPrimePromise;
    }

    function parkMoodAnalysisBookMount() {
        if (!moodAnalysisBookMountEl) return;
        const pool = getMoodAnalysisBookPool();
        moodAnalysisBookMountEl.classList.remove('mood-analysis-book-lottie--in-overlay');
        moodAnalysisBookMountEl.setAttribute('aria-hidden', 'true');
        pool.appendChild(moodAnalysisBookMountEl);
        try {
            if (moodAnalysisBookAnim && typeof moodAnalysisBookAnim.resize === 'function') moodAnalysisBookAnim.resize();
        } catch (_) {}
    }

    function ensureAnalysisOverlay() {
        let overlay = document.getElementById('moodAnalysisOverlay');
        if (overlay) {
            const card = overlay.querySelector('.mood-analysis-card');
            const footer = card?.querySelector('.mood-analysis-card__footer');
            if (footer && footer.querySelector('#moodAnalysisContinueBtn') && !footer.querySelector('#moodAnalysisSaveExitBtn')) {
                footer.className = 'mood-analysis-card__footer mood-analysis-card__footer--dual';
                footer.id = 'moodAnalysisFooter';
                footer.innerHTML = `
                    <button type="button" class="mood-analysis-btn mood-analysis-btn--outline" id="moodAnalysisSaveExitBtn">Save &amp; Exit</button>
                    <button type="button" class="mood-analysis-btn mood-analysis-btn--solid" id="moodAnalysisContinueBtn">Continue</button>
                `;
            }
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.id = 'moodAnalysisOverlay';
        overlay.className = 'mood-analysis-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="mood-analysis-card">
                <div class="mood-analysis-card__header">
                    <h3 class="mood-analysis-card__title">Mood Analysis</h3>
                </div>
                <div class="mood-analysis-card__body" id="moodAnalysisBody"></div>
                <div class="mood-analysis-card__footer mood-analysis-card__footer--dual" id="moodAnalysisFooter">
                    <button type="button" class="mood-analysis-btn mood-analysis-btn--outline" id="moodAnalysisSaveExitBtn">Save &amp; Exit</button>
                    <button type="button" class="mood-analysis-btn mood-analysis-btn--solid" id="moodAnalysisContinueBtn">Continue</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    function showAnalysisLoading(overlay) {
        parkMoodAnalysisBookMount();
        clearMoodAnalysisProgressTimer();

        const header = overlay.querySelector('.mood-analysis-card__header');
        const body = overlay.querySelector('#moodAnalysisBody');
        const footer = overlay.querySelector('.mood-analysis-card__footer');
        if (header) header.style.display = 'none';
        body.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.className = 'mood-analysis-loading mood-analysis-loading--book';

        const mount = moodAnalysisBookMountEl;
        if (mount) {
            mount.classList.add('mood-analysis-book-lottie--in-overlay');
            mount.removeAttribute('aria-hidden');
            mount.setAttribute('aria-label', 'Loading animation');
            wrap.appendChild(mount);
            try {
                if (moodAnalysisBookAnim && typeof moodAnalysisBookAnim.play === 'function') moodAnalysisBookAnim.play();
                if (moodAnalysisBookAnim && typeof moodAnalysisBookAnim.resize === 'function') moodAnalysisBookAnim.resize();
            } catch (_) {}
        }

        const titleEl = document.createElement('h4');
        titleEl.className = 'mood-analysis-loading__title';
        titleEl.textContent = 'Analyzing your entry...';

        const subEl = document.createElement('p');
        subEl.className = 'mood-analysis-loading__subtitle';
        subEl.textContent = 'Detecting mood patterns and insights...';

        const progressWrap = document.createElement('div');
        progressWrap.className = 'mood-analysis-progress';
        progressWrap.setAttribute('role', 'progressbar');
        progressWrap.setAttribute('aria-valuemin', '0');
        progressWrap.setAttribute('aria-valuemax', '100');
        progressWrap.setAttribute('aria-valuenow', '0');
        progressWrap.setAttribute('aria-label', 'Analysis progress');

        const progressTrack = document.createElement('div');
        progressTrack.className = 'mood-analysis-progress__track';

        const progressFill = document.createElement('div');
        progressFill.className = 'mood-analysis-progress__fill';

        progressTrack.appendChild(progressFill);
        progressWrap.appendChild(progressTrack);

        const progressPct = document.createElement('span');
        progressPct.className = 'mood-analysis-progress__pct';
        progressPct.textContent = '0%';
        progressWrap.appendChild(progressPct);

        wrap.appendChild(titleEl);
        wrap.appendChild(subEl);
        wrap.appendChild(progressWrap);
        body.appendChild(wrap);

        overlay.querySelector('.mood-analysis-card')?.classList.remove('mood-analysis-card--result');
        overlay.querySelector('.mood-analysis-card')?.classList.add('mood-analysis-card--analyzing');

        footer.style.display = 'none';
        overlay.hidden = false;
        moodAnalysisLoadingShownAt = Date.now();

        const totalMs = MOOD_ANALYSIS_TOTAL_MS;
        const progressStart = Date.now();
        moodAnalysisProgressTimer = setInterval(() => {
            const elapsed = Date.now() - progressStart;
            const pct = Math.min(100, Math.round((elapsed / totalMs) * 100));
            progressPct.textContent = `${pct}%`;
            progressWrap.setAttribute('aria-valuenow', String(pct));
            if (pct >= 100) clearMoodAnalysisProgressTimer();
        }, 80);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                progressFill.style.transition = `width ${totalMs}ms linear`;
                progressFill.style.width = '100%';
            });
            try {
                if (moodAnalysisBookAnim && typeof moodAnalysisBookAnim.resize === 'function') moodAnalysisBookAnim.resize();
            } catch (_) {}
        });
    }

    function computeEnergy(score) {
        if (score >= 0.65) return 'High';
        if (score >= 0.45) return 'Moderate';
        return 'Low';
    }

    function computeInterpretation(score) {
        if (score >= 0.65) return 'Clear dominant mood';
        if (score >= 0.45) return 'Mixed emotional signals';
        return 'Highly mixed / ambiguous';
    }

    function formatPct(value) {
        const n = Number(value ?? 0);
        return `${(Math.max(0, Math.min(1, n)) * 100).toFixed(1)}%`;
    }

    function toTitleCase(text) {
        return (text || '')
            .toString()
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function buildSignalPairs(entry, primaryEmotion, primaryScore) {
        const allowed = ['sad', 'anxious', 'angry', 'happy', 'neutral'];
        const allProbs = entry && typeof entry.all_probs === 'object' ? entry.all_probs : null;

        if (allProbs) {
            const merged = {};
            allowed.forEach((label) => {
                merged[label] = Number(allProbs[label] || 0);
            });
            if (primaryEmotion && primaryEmotion in merged) {
                merged[primaryEmotion] = Number(primaryScore || merged[primaryEmotion] || 0);
            }
            return Object.entries(merged).sort((a, b) => b[1] - a[1]);
        }

        const fallback = {};
        allowed.forEach((label) => {
            fallback[label] = label === primaryEmotion ? Number(primaryScore || 0.5) : 0;
        });
        return Object.entries(fallback).sort((a, b) => b[1] - a[1]);
    }

    function showAnalysisResult(overlay, entry, isFallback = false) {
        clearMoodAnalysisProgressTimer();
        parkMoodAnalysisBookMount();
        const analysisCard = overlay.querySelector('.mood-analysis-card');
        analysisCard?.classList.remove('mood-analysis-card--analyzing');
        analysisCard?.classList.add('mood-analysis-card--result');

        const header = overlay.querySelector('.mood-analysis-card__header');
        const body = overlay.querySelector('#moodAnalysisBody');
        const footer = overlay.querySelector('.mood-analysis-card__footer');
        if (header) header.style.display = 'none';

        const emotion = (entry.emotionLabel || entry.feeling || 'neutral').toString().toLowerCase();
        const score = Number(entry.emotionScore || entry.sentimentScore || 0.5);
        const sentiment = (entry.sentimentLabel || 'neutral').toString().toLowerCase();
        const valence = sentiment === 'positive' ? 'Positive' : sentiment === 'negative' ? 'Negative' : 'Balanced';
        const pairs = buildSignalPairs(entry, emotion, score);
        const secondary = pairs[1] && Number(pairs[1][1]) >= 0.15 ? pairs[1] : null;
        const interpretationText = computeInterpretation(score);
        const energyLabel = computeEnergy(score);

        const confidencePct = Math.max(0, Math.min(100, Math.round(score * 100)));
        const secondaryConfidencePct =
            secondary != null ? Math.max(0, Math.min(100, Math.round(Number(secondary[1]) * 100))) : null;

        const signalsBarsHtml = pairs
            .map(([label, prob]) => {
                const pct = Math.max(0, Math.min(100, Math.round(Number(prob) * 100)));
                const slug = String(label || '').toLowerCase();
                return `
                    <div class="mood-result-signal">
                        <div class="mood-result-signal__row">
                            <span class="mood-result-signal__name">${escapeHtml(toTitleCase(slug))}</span>
                            <span class="mood-result-signal__pct">${formatPct(prob)}</span>
                        </div>
                        <div class="mood-result-signal__track" aria-hidden="true">
                            <div class="mood-result-signal__fill mood-result-signal__fill--${escapeHtml(slug)}" data-pct="${pct}" style="width: 0%"></div>
                        </div>
                    </div>`;
            })
            .join('');

        const secondaryBlock = secondary
            ? `
                <div class="mood-result-emotion mood-result-emotion--secondary">
                    <span class="mood-result-emotion__label">Secondary</span>
                    <p class="mood-result-emotion__value">${escapeHtml(toTitleCase(String(secondary[0])))}</p>
                    <span class="mood-result-badge mood-result-badge--amber">${secondaryConfidencePct}% Confidence</span>
                </div>`
            : `
                <div class="mood-result-emotion mood-result-emotion--secondary mood-result-emotion--empty">
                    <span class="mood-result-emotion__label">Secondary</span>
                    <p class="mood-result-emotion__value mood-result-emotion__value--muted">None detected</p>
                    <span class="mood-result-badge mood-result-badge--muted">No strong secondary signal</span>
                </div>`;

        body.innerHTML = `
            <div class="mood-result-v2">
                <header class="mood-result-v2__hero">
                    <h2 class="mood-result-v2__title">Analysis Complete</h2>
                    <p class="mood-result-v2__subtitle">Here's what we observed from your entry.</p>
                </header>
                <div class="mood-result-v2__grid">
                    <div class="mood-result-v2__col mood-result-v2__col--primary">
                        <section class="mood-result-panel mood-result-panel--emotions" aria-labelledby="mood-result-emotions-heading">
                            <p id="mood-result-emotions-heading" class="mood-result-panel__eyebrow">Detected emotions</p>
                            <div class="mood-result-emotion mood-result-emotion--primary-block">
                                <span class="mood-result-emotion__label">Primary</span>
                                <p class="mood-result-emotion__value">${escapeHtml(toTitleCase(emotion))}</p>
                                <span class="mood-result-badge mood-result-badge--green">${confidencePct}% Confidence</span>
                            </div>
                            ${secondaryBlock}
                        </section>
                    </div>
                    <div class="mood-result-v2__col mood-result-v2__col--secondary">
                        <section class="mood-result-panel mood-result-panel--signals" aria-labelledby="mood-result-signals-heading">
                            <h3 id="mood-result-signals-heading" class="mood-result-panel__title mood-result-panel__title--icon">
                                <i class="bi bi-activity" aria-hidden="true"></i>
                                Emotional Signals
                            </h3>
                            <div class="mood-result-signal-list">${signalsBarsHtml}</div>
                        </section>
                        <section class="mood-result-panel mood-result-panel--insights" aria-labelledby="mood-result-insights-heading">
                            <h3 id="mood-result-insights-heading" class="visually-hidden">Valence, energy, and interpretation</h3>
                            <div class="mood-result-insights__pair">
                                <div class="mood-result-kv">
                                    <span class="mood-result-kv__label">Valence</span>
                                    <p class="mood-result-kv__value">${escapeHtml(valence)}</p>
                                </div>
                                <div class="mood-result-kv">
                                    <span class="mood-result-kv__label">Energy</span>
                                    <p class="mood-result-kv__value">${escapeHtml(energyLabel)}</p>
                                </div>
                            </div>
                            <p class="mood-result-insights__text">${escapeHtml(interpretationText)}</p>
                        </section>
                    </div>
                </div>
                ${isFallback ? '<p class="mood-result-fallback-note">Saved with fallback analysis</p>' : ''}
            </div>
        `;

        requestAnimationFrame(() => {
            body.querySelectorAll('.mood-result-signal__fill').forEach((el) => {
                const p = el.getAttribute('data-pct');
                if (p != null) el.style.width = `${p}%`;
            });
        });

        footer.style.display = 'flex';
        const goDashboard = () => {
            overlay.hidden = true;
            window.location.href = 'dashboard.html';
        };
        const continueBtn = overlay.querySelector('#moodAnalysisContinueBtn');
        const saveExitBtn = overlay.querySelector('#moodAnalysisSaveExitBtn');
        if (continueBtn) continueBtn.onclick = goDashboard;
        if (saveExitBtn) saveExitBtn.onclick = goDashboard;
    }

    function setSavingState(isSaving) {
        const buttons = document.querySelectorAll('#saveEntryBtn, .btn-save-entry');
        buttons.forEach((btn) => {
            btn.disabled = isSaving;
            btn.style.opacity = isSaving ? '0.75' : '1';
            btn.style.cursor = isSaving ? 'not-allowed' : 'pointer';
        });
    }
    
    // Auto-save functionality (optional)
    let autoSaveTimer;
    journalText.addEventListener('input', function() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            // Save draft to localStorage
            const draft = {
                feeling: selectedFeeling,
                tags: Array.from(selectedTags),
                text: this.value,
                date: new Date().toISOString()
            };
            localStorage.setItem('diariCoreDraft', JSON.stringify(draft));
            console.log('Draft saved');
        }, 2000);
    });
    
    // Load draft on page load - DISABLED to prevent default selections
    function loadDraft() {
        // Disabled - do not load drafts to prevent automatic selections
        console.log('Draft loading disabled - no default selections');
        return;
        
        // Original code commented out:
        /*
        const draft = JSON.parse(localStorage.getItem('diariCoreDraft') || 'null');
        if (draft) {
            // Restore feeling
            if (draft.feeling) {
                const feelingCard = document.querySelector(`[data-feeling="${draft.feeling}"]`);
                if (feelingCard) {
                    feelingCard.click();
                }
            }
            
            // Restore tags
            if (draft.tags && draft.tags.length > 0) {
                draft.tags.forEach(tag => {
                    const tagButton = document.querySelector(`[data-tag="${tag}"]`);
                    if (tagButton) {
                        tagButton.click();
                    }
                });
            }
            
            // Restore text
            if (draft.text) {
                journalText.value = draft.text;
                journalText.dispatchEvent(new Event('input'));
            }
        }
        */
    }
    
    // Load draft on page load
    loadDraft();
    flushOfflineEntryQueue();
});
