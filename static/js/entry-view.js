(function (global) {
    'use strict';

    const QUEUE_KEY = 'diariCoreEntryEditQueue';

    function draftKey(entryId) {
        return `diariCoreEntryEditDraft_${entryId}`;
    }

    function getUserId() {
        const user = JSON.parse(localStorage.getItem('diariCoreUser') || 'null');
        const raw = user?.id ?? user?.userId ?? 0;
        const parsed = Number(raw);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
    }

    function normalizeTag(tag) {
        return String(tag || '').trim().replace(/\s+/g, ' ');
    }

    const DEFAULT_TAG_NAMES = ['School', 'Home', 'Friends', 'Work', 'Family', 'Health', 'Money', 'Bills'];

    function parseQueryId() {
        const q = new URLSearchParams(window.location.search);
        const raw = q.get('id');
        const n = Number(raw);
        return Number.isInteger(n) && n > 0 ? n : 0;
    }

    function loadEntryFromList(entryId) {
        const list = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
        return list.find((e) => Number(e?.id) === entryId) || null;
    }

    function replaceEntryInList(updated) {
        const list = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
        const idx = list.findIndex((e) => Number(e?.id) === Number(updated.id));
        if (idx >= 0) list[idx] = { ...list[idx], ...updated };
        else list.unshift(updated);
        localStorage.setItem('diariCoreEntries', JSON.stringify(list));
    }

    function removeEntryFromList(id) {
        const list = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
        const next = list.filter((e) => Number(e?.id) !== Number(id));
        localStorage.setItem('diariCoreEntries', JSON.stringify(next));
    }

    function readQueue() {
        try {
            const raw = localStorage.getItem(QUEUE_KEY);
            const arr = JSON.parse(raw || '[]');
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function writeQueue(arr) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
    }

    function isOnline() {
        return navigator.onLine !== false;
    }

    function serializeEditor(titleEl, bodyEl, tagSet) {
        const title = (titleEl?.value || '').trim();
        const text = (bodyEl?.value || '').trim();
        const t = [...tagSet].map(normalizeTag).filter(Boolean).sort((a, b) => a.localeCompare(b));
        return JSON.stringify({ title, text, tags: t });
    }

    function formatEntryDateLine(isoDate) {
        const d = new Date(isoDate);
        if (Number.isNaN(d.getTime())) return '';
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
        const rest = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${weekday}, ${rest} · ${time}`;
    }

    function autoResizeTextarea(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.max(200, el.scrollHeight)}px`;
    }

    /** Re-measure body height after the editor is visible (hidden ancestors yield wrong scrollHeight). */
    function reflowEditorLayout() {
        if (!activeController || activeController.signal.aborted) return;
        const editPane = document.getElementById('entryViewEditPane');
        if (editPane && editPane.hidden) return;
        const el = document.getElementById('entryViewBody');
        if (!el) return;
        autoResizeTextarea(el);
    }

    let activeController = null;

    function resetEntryDetailLoadingState() {
        const titleEl = document.getElementById('entryViewTitle');
        const bodyEl = document.getElementById('entryViewBody');
        const dateLine = document.getElementById('entryViewDateLine');
        const dateLineRead = document.getElementById('entryViewDateLineRead');
        const tagsRow = document.getElementById('entryViewTagsRow');
        const tagsRead = document.getElementById('entryViewTagsRead');
        const titleRead = document.getElementById('entryViewTitleRead');
        const bodyRead = document.getElementById('entryViewBodyRead');
        const readPane = document.getElementById('entryViewReadPane');
        const editPane = document.getElementById('entryViewEditPane');
        const readToolbar = document.getElementById('entryViewReadToolbar');
        const cancelBtn = document.getElementById('entryViewCancelBtn');
        const actionsEl = document.getElementById('entryViewActions');
        const saveAnalyzeBtn = document.getElementById('entryViewSaveAnalyzeBtn');
        const loadingHtml =
            '<span class="entry-view-loading-line" style="color:var(--text-muted);font-size:0.8rem;">Loading entry…</span>';
        if (titleEl) titleEl.value = '';
        if (bodyEl) {
            bodyEl.value = '';
            bodyEl.style.height = 'auto';
        }
        if (tagsRow) tagsRow.innerHTML = '';
        if (tagsRead) tagsRead.innerHTML = '';
        if (titleRead) {
            titleRead.textContent = '';
            titleRead.classList.remove('entry-view-title-read--muted');
        }
        if (bodyRead) bodyRead.textContent = '';
        if (dateLine) dateLine.innerHTML = loadingHtml;
        if (dateLineRead) dateLineRead.innerHTML = loadingHtml;
        if (readPane) readPane.hidden = false;
        if (editPane) editPane.hidden = true;
        if (readToolbar) readToolbar.hidden = false;
        if (cancelBtn) cancelBtn.hidden = true;
        if (actionsEl) actionsEl.hidden = true;
        if (saveAnalyzeBtn) saveAnalyzeBtn.disabled = true;
    }

    function unmount() {
        if (activeController) {
            activeController.abort();
            activeController = null;
        }
        resetEntryDetailLoadingState();
    }

    /**
     * @param {{ entryId: number, onLeavePanel: () => void, userId?: number }} opts
     */
    async function mount(opts) {
        unmount();
        const ac = new AbortController();
        activeController = ac;
        const signal = ac.signal;

        const entryId = Number(opts.entryId);
        const userId = opts.userId != null ? Number(opts.userId) : getUserId();
        const onLeavePanel = typeof opts.onLeavePanel === 'function' ? opts.onLeavePanel : () => {};

        const titleEl = document.getElementById('entryViewTitle');
        const bodyEl = document.getElementById('entryViewBody');
        const dateLine = document.getElementById('entryViewDateLine');
        const dateLineRead = document.getElementById('entryViewDateLineRead');
        const tagsRow = document.getElementById('entryViewTagsRow');
        const readPane = document.getElementById('entryViewReadPane');
        const editPane = document.getElementById('entryViewEditPane');
        const tagsRead = document.getElementById('entryViewTagsRead');
        const titleRead = document.getElementById('entryViewTitleRead');
        const bodyRead = document.getElementById('entryViewBodyRead');
        const readToolbar = document.getElementById('entryViewReadToolbar');
        const editBtn = document.getElementById('entryViewEditBtn');
        const deleteBtn = document.getElementById('entryViewDeleteBtn');
        const viewDetailsBtn = document.getElementById('entryViewViewDetailsBtn');
        const aiEmotionLabel = document.getElementById('entryViewAiEmotionLabel');
        const actionsEl = document.getElementById('entryViewActions');
        const backBtn = document.getElementById('entryViewBackBtn');
        const cancelBtn = document.getElementById('entryViewCancelBtn');
        const saveAnalyzeBtn = document.getElementById('entryViewSaveAnalyzeBtn');
        const unsavedDialog = document.getElementById('entryUnsavedDialog');
        const unsavedStay = document.getElementById('entryUnsavedStayBtn');
        const unsavedDiscard = document.getElementById('entryUnsavedDiscardBtn');

        function setBothDateLines(innerHtml) {
            if (dateLine) dateLine.innerHTML = innerHtml;
            if (dateLineRead) dateLineRead.innerHTML = innerHtml;
        }

        function toTitleCaseEmotion(raw) {
            const s = String(raw || 'neutral').trim().toLowerCase();
            if (!s) return 'Neutral';
            return s.replace(/\b\w/g, (c) => c.toUpperCase());
        }

        function escapeHtml(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        let editMode = false;

        if (
            !entryId ||
            !userId ||
            !titleEl ||
            !bodyEl ||
            !tagsRow ||
            !backBtn ||
            !cancelBtn ||
            !readPane ||
            !editPane ||
            !tagsRead ||
            !titleRead ||
            !bodyRead ||
            !dateLineRead ||
            !readToolbar ||
            !editBtn ||
            !deleteBtn ||
            !viewDetailsBtn ||
            !aiEmotionLabel
        ) {
            onLeavePanel();
            unmount();
            return;
        }

        const listEntry = loadEntryFromList(entryId);
        let entry = listEntry;

        if (!entry && isOnline()) {
            const loadingTags =
                '<span class="entry-view-tags-await" style="color:var(--text-muted);font-size:0.85rem;">Loading…</span>';
            tagsRead.innerHTML = loadingTags;
            try {
                const res = await fetch(`/api/entries/${entryId}?userId=${encodeURIComponent(String(userId))}`);
                const data = await res.json();
                if (signal.aborted) return;
                if (res.ok && data.success && data.entry) {
                    entry = data.entry;
                    replaceEntryInList(entry);
                }
            } catch (_) {}
        }

        if (signal.aborted) return;

        if (!entry) {
            onLeavePanel();
            unmount();
            return;
        }

        let tags = new Set((Array.isArray(entry.tags) ? entry.tags : []).map(normalizeTag).filter(Boolean));
        let allTagChoices = [];
        let tagPickerOpen = false;
        let pendingNavigate = null;

        function applyDraftFromStorage() {
            try {
                const raw = localStorage.getItem(draftKey(entryId));
                if (!raw) return;
                const d = JSON.parse(raw);
                if (!d || typeof d !== 'object') return;
                if (d.title != null) titleEl.value = String(d.title);
                if (d.text != null) bodyEl.value = String(d.text);
                if (Array.isArray(d.tags)) tags = new Set(d.tags.map(normalizeTag).filter(Boolean));
            } catch (_) {}
        }

        applyDraftFromStorage();

        titleEl.value = entry.title || '';
        if (!localStorage.getItem(draftKey(entryId))) {
            bodyEl.value = entry.text || '';
        }

        const displayDate = entry.date || entry.createdAt;
        const dateMarkup = `<i class="bi bi-calendar3" aria-hidden="true"></i><span>${formatEntryDateLine(displayDate)}</span>`;
        setBothDateLines(dateMarkup);

        autoResizeTextarea(bodyEl);

        let baseline = serializeEditor(titleEl, bodyEl, tags);

        function syncReadPane() {
            let p = { title: '', text: '', tags: [] };
            try {
                p = JSON.parse(baseline);
            } catch (_) {}
            tagsRead.innerHTML = '';
            const tagArr = Array.isArray(p.tags) ? p.tags : [];
            if (!tagArr.length) {
                const span = document.createElement('span');
                span.className = 'entry-view-tags-read-empty';
                span.textContent = 'No tags yet';
                tagsRead.appendChild(span);
            } else {
                tagArr.forEach((raw) => {
                    const tag = normalizeTag(raw);
                    if (!tag) return;
                    const pill = document.createElement('span');
                    pill.className = 'entry-view-tag-pill entry-view-tag-pill--readonly';
                    pill.textContent = tag.startsWith('#') ? tag : `#${tag}`;
                    tagsRead.appendChild(pill);
                });
            }
            const t = (p.title || '').trim();
            titleRead.textContent = t || 'Give your entry a title...';
            titleRead.classList.toggle('entry-view-title-read--muted', !t);
            bodyRead.textContent = p.text || '';
            aiEmotionLabel.textContent = toTitleCaseEmotion(entry.emotionLabel || entry.feeling || 'neutral');
        }

        function setEditMode(on) {
            editMode = Boolean(on);
            readPane.hidden = editMode;
            editPane.hidden = !editMode;
            readToolbar.hidden = editMode;
            cancelBtn.hidden = !editMode;
            if (actionsEl) actionsEl.hidden = !editMode;
        }

        syncReadPane();

        function isDirty() {
            return serializeEditor(titleEl, bodyEl, tags) !== baseline;
        }

        function persistDraft() {
            localStorage.setItem(
                draftKey(entryId),
                JSON.stringify({
                    title: titleEl.value,
                    text: bodyEl.value,
                    tags: Array.from(tags),
                    savedAt: new Date().toISOString(),
                })
            );
        }

        function clearDraft() {
            localStorage.removeItem(draftKey(entryId));
        }

        async function loadTagChoices() {
            const fromApi = new Set();
            try {
                if (isOnline()) {
                    const res = await fetch(`/api/tags?userId=${encodeURIComponent(String(userId))}`);
                    const data = await res.json();
                    if (res.ok && data.success && Array.isArray(data.tags)) {
                        data.tags.forEach((t) => fromApi.add(normalizeTag(t)));
                    }
                }
            } catch (_) {}
            DEFAULT_TAG_NAMES.forEach((t) => fromApi.add(normalizeTag(t)));
            tags.forEach((t) => fromApi.add(t));
            allTagChoices = Array.from(fromApi).sort((a, b) => a.localeCompare(b));
        }

        /** Defaults + current entry tags only — no network; keeps layout stable while API loads. */
        function seedTagChoicesSync() {
            const s = new Set();
            DEFAULT_TAG_NAMES.forEach((t) => s.add(normalizeTag(t)));
            tags.forEach((t) => s.add(normalizeTag(t)));
            allTagChoices = Array.from(s).sort((a, b) => a.localeCompare(b));
        }

        seedTagChoicesSync();

        const addWrap = document.createElement('div');
        addWrap.className = 'entry-view-add-tag-wrap';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'tag-btn add-tag entry-view-add-tag';
        addBtn.innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i><span>Add tag</span>';
        const picker = document.createElement('div');
        picker.className = 'entry-view-tag-picker';
        picker.hidden = true;
        addWrap.appendChild(addBtn);
        addWrap.appendChild(picker);

        function fillPicker() {
            picker.innerHTML = '';
            const applied = new Set([...tags].map((t) => t.toLowerCase()));
            const avail = allTagChoices.filter((t) => !applied.has(t.toLowerCase()));
            if (!avail.length) {
                const empty = document.createElement('p');
                empty.style.cssText = 'margin:0.5rem;padding:0.25rem;font-size:0.85rem;color:var(--text-muted)';
                empty.textContent = 'No more tags to add.';
                picker.appendChild(empty);
                return;
            }
            avail.forEach((tag) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = tag;
                b.addEventListener(
                    'click',
                    () => {
                        tags.add(normalizeTag(tag));
                        tagPickerOpen = false;
                        picker.hidden = true;
                        renderTags();
                    },
                    { signal }
                );
                picker.appendChild(b);
            });
        }

        function renderTags() {
            tagsRow.innerHTML = '';
            tags.forEach((tag) => {
                const pill = document.createElement('span');
                pill.className = 'entry-view-tag-pill';
                pill.innerHTML = `<span>${escapeHtml(tag)}</span><button type="button" aria-label="Remove ${escapeHtml(tag)}">×</button>`;
                pill.querySelector('button').addEventListener(
                    'click',
                    () => {
                        tags.delete(tag);
                        renderTags();
                        void loadTagChoices().then(() => {
                            if (!signal.aborted) fillPicker();
                        });
                    },
                    { signal }
                );
                tagsRow.appendChild(pill);
            });
            tagsRow.appendChild(addWrap);
            fillPicker();
        }

        function restoreEditorFromBaseline() {
            try {
                const p = JSON.parse(baseline);
                titleEl.value = p.title || '';
                bodyEl.value = p.text || '';
                tags = new Set((Array.isArray(p.tags) ? p.tags : []).map(normalizeTag).filter(Boolean));
                renderTags();
                autoResizeTextarea(bodyEl);
            } catch (_) {}
        }

        addBtn.addEventListener(
            'click',
            (e) => {
                e.stopPropagation();
                tagPickerOpen = !tagPickerOpen;
                picker.hidden = !tagPickerOpen;
                if (tagPickerOpen) {
                    void loadTagChoices().then(() => {
                        if (!signal.aborted) fillPicker();
                    });
                }
            },
            { signal }
        );

        document.addEventListener(
            'click',
            () => {
                if (tagPickerOpen) {
                    tagPickerOpen = false;
                    picker.hidden = true;
                }
            },
            { signal }
        );

        picker.addEventListener('click', (e) => e.stopPropagation(), { signal });

        renderTags();
        autoResizeTextarea(bodyEl);
        setEditMode(false);

        void loadTagChoices().then(() => {
            if (signal.aborted) return;
            fillPicker();
        });

        if (isOnline() && listEntry) {
            void (async () => {
                try {
                    const res = await fetch(`/api/entries/${entryId}?userId=${encodeURIComponent(String(userId))}`);
                    const data = await res.json();
                    if (signal.aborted) return;
                    if (!res.ok || !data.success || !data.entry) return;
                    const incoming = data.entry;
                    replaceEntryInList(incoming);
                    if (localStorage.getItem(draftKey(entryId))) {
                        void loadTagChoices().then(() => {
                            if (!signal.aborted) fillPicker();
                        });
                        return;
                    }
                    entry = incoming;
                    titleEl.value = entry.title || '';
                    bodyEl.value = entry.text || '';
                    const dRefresh = entry.date || entry.createdAt;
                    setBothDateLines(
                        `<i class="bi bi-calendar3" aria-hidden="true"></i><span>${formatEntryDateLine(dRefresh)}</span>`
                    );
                    tags = new Set((Array.isArray(entry.tags) ? entry.tags : []).map(normalizeTag).filter(Boolean));
                    seedTagChoicesSync();
                    renderTags();
                    autoResizeTextarea(bodyEl);
                    baseline = serializeEditor(titleEl, bodyEl, tags);
                    syncReadPane();
                    void loadTagChoices().then(() => {
                        if (!signal.aborted) fillPicker();
                    });
                } catch (_) {}
            })();
        }

        bodyEl.addEventListener(
            'input',
            () => {
                autoResizeTextarea(bodyEl);
                if (!isOnline()) persistDraft();
            },
            { signal }
        );
        titleEl.addEventListener(
            'input',
            () => {
                if (!isOnline()) persistDraft();
            },
            { signal }
        );

        function moodOptions(overlay) {
            return {
                onSaveExit() {
                    overlay.hidden = true;
                    onLeavePanel();
                },
                fetchRerunAnalysis: async () => {
                    const t = bodyEl.value.trim();
                    if (!t) throw new Error('empty');
                    const res = await fetch('/api/entries/analyze-text', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, text: t }),
                    });
                    const result = await res.json();
                    if (!res.ok || !result.success) throw new Error(result.error || 'analyze failed');
                    const fb = (result.analysisEngine || '').toString().toLowerCase() === 'fallback';
                    return {
                        entry: {
                            emotionLabel: result.emotionLabel,
                            emotionScore: result.emotionScore,
                            sentimentLabel: result.sentimentLabel,
                            sentimentScore: result.sentimentScore,
                            all_probs: result.all_probs || {},
                            feeling: result.emotionLabel,
                        },
                        isFallback: fb,
                    };
                },
            };
        }

        async function runToolbarViewAnalysis() {
            const text = (bodyEl.value || '').trim() || (entry.text || '').trim();
            if (!text) {
                window.alert('This entry has no text to analyze.');
                return;
            }
            if (!isOnline()) {
                window.alert('Connect to the internet to run analysis.');
                return;
            }
            global.DiariMoodAnalysis.resetSession();
            const overlay = global.DiariMoodAnalysis.ensureAnalysisOverlay();
            try {
                await global.DiariMoodAnalysis.primeMoodAnalysisBookLottie();
            } catch (_) {}
            global.DiariMoodAnalysis.showAnalysisLoading(overlay);
            try {
                const res = await fetch('/api/entries/analyze-text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, text }),
                });
                const result = await res.json();
                if (!res.ok || !result.success) throw new Error(result.error || 'Analyze failed');
                const previewEntry = {
                    ...entry,
                    emotionLabel: result.emotionLabel,
                    emotionScore: result.emotionScore,
                    sentimentLabel: result.sentimentLabel,
                    sentimentScore: result.sentimentScore,
                    all_probs: result.all_probs || {},
                    feeling: result.emotionLabel,
                };
                const fb = (result.analysisEngine || '').toString().toLowerCase() === 'fallback';
                await global.DiariMoodAnalysis.delayUntilMoodAnalysisGate();
                const mo = moodOptions(overlay);
                global.DiariMoodAnalysis.showAnalysisResult(overlay, previewEntry, fb, {
                    fetchRerunAnalysis: mo.fetchRerunAnalysis,
                    footerCloseLabel: 'Close',
                    onSaveExit() {
                        overlay.hidden = true;
                    },
                });
            } catch (e) {
                console.error(e);
                overlay.hidden = true;
                window.alert(e.message || 'Could not analyze this entry.');
            }
        }

        function openUnsaved(next) {
            if (!isDirty()) {
                next();
                return;
            }
            pendingNavigate = next;
            if (unsavedDialog) unsavedDialog.hidden = false;
        }

        backBtn.addEventListener(
            'click',
            () => {
                if (!editMode) {
                    onLeavePanel();
                    return;
                }
                openUnsaved(onLeavePanel);
            },
            { signal }
        );
        cancelBtn.addEventListener(
            'click',
            () => {
                if (!editMode) return;
                if (!isDirty()) {
                    setEditMode(false);
                    return;
                }
                pendingNavigate = () => {
                    restoreEditorFromBaseline();
                    setEditMode(false);
                    syncReadPane();
                };
                if (unsavedDialog) unsavedDialog.hidden = false;
            },
            { signal }
        );
        editBtn.addEventListener(
            'click',
            () => {
                if (signal.aborted) return;
                setEditMode(true);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => reflowEditorLayout());
                });
            },
            { signal }
        );
        deleteBtn.addEventListener(
            'click',
            async () => {
                if (signal.aborted) return;
                if (!window.confirm('Delete this journal entry? This cannot be undone.')) return;
                if (!isOnline()) {
                    window.alert('Connect to the internet to delete entries.');
                    return;
                }
                try {
                    const res = await fetch(`/api/entries/${entryId}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId }),
                    });
                    let data = {};
                    try {
                        data = await res.json();
                    } catch (_) {}
                    if (!res.ok || !data.success) {
                        window.alert(data.error || 'Could not delete this entry.');
                        return;
                    }
                    removeEntryFromList(entryId);
                    clearDraft();
                    onLeavePanel();
                } catch (e) {
                    console.error(e);
                    window.alert('Could not delete this entry.');
                }
            },
            { signal }
        );
        viewDetailsBtn.addEventListener(
            'click',
            () => {
                if (signal.aborted) return;
                void runToolbarViewAnalysis();
            },
            { signal }
        );
        if (unsavedStay) {
            unsavedStay.addEventListener(
                'click',
                () => {
                    if (unsavedDialog) unsavedDialog.hidden = true;
                    pendingNavigate = null;
                },
                { signal }
            );
        }
        if (unsavedDiscard) {
            unsavedDiscard.addEventListener(
                'click',
                () => {
                    if (unsavedDialog) unsavedDialog.hidden = true;
                    const fn = pendingNavigate;
                    pendingNavigate = null;
                    if (fn) fn();
                },
                { signal }
            );
        }
        if (unsavedDialog) {
            const bd = unsavedDialog.querySelector('[data-close="1"]');
            if (bd) {
                bd.addEventListener(
                    'click',
                    () => {
                        unsavedDialog.hidden = true;
                        pendingNavigate = null;
                    },
                    { signal }
                );
            }
        }

        async function patchRemote(reanalyze) {
            const payload = {
                userId,
                title: titleEl.value.trim(),
                text: bodyEl.value.trim(),
                tags: Array.from(tags).map(normalizeTag).filter(Boolean),
                reanalyze: Boolean(reanalyze),
            };
            const res = await fetch(`/api/entries/${entryId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok || !data.success || !data.entry) {
                throw new Error(data.error || 'Save failed');
            }
            return data;
        }

        function offlineMergedEntry(reanalyze) {
            const base = { ...entry, id: entryId };
            base.title = titleEl.value.trim();
            base.text = bodyEl.value.trim();
            base.tags = Array.from(tags).map(normalizeTag).filter(Boolean);
            if (reanalyze) {
                base.feeling = 'neutral';
                base.emotionLabel = 'neutral';
                base.emotionScore = 0.55;
                base.sentimentLabel = 'neutral';
                base.sentimentScore = 0.55;
                base.all_probs = { neutral: 0.55, happy: 0.1, sad: 0.1, anxious: 0.1, angry: 0.15 };
                base.moodScoringOffline = true;
            }
            return base;
        }

        function pushOfflineQueue(reanalyze) {
            const record = {
                entryId,
                userId,
                title: titleEl.value.trim(),
                text: bodyEl.value.trim(),
                tags: Array.from(tags).map(normalizeTag).filter(Boolean),
                reanalyze: Boolean(reanalyze),
                queuedAt: new Date().toISOString(),
            };
            const q = readQueue();
            q.push(record);
            writeQueue(q);
        }

        async function flushEditQueue() {
            if (!isOnline()) return;
            const q = readQueue();
            const next = [];
            for (const row of q) {
                try {
                    const res = await fetch(`/api/entries/${row.entryId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: row.userId,
                            title: row.title,
                            text: row.text,
                            tags: row.tags,
                            reanalyze: row.reanalyze,
                        }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success && data.entry) {
                        replaceEntryInList(data.entry);
                        try {
                            localStorage.removeItem(draftKey(Number(row.entryId)));
                        } catch (_) {}
                        continue;
                    }
                } catch (_) {}
                next.push(row);
            }
            writeQueue(next);
        }

        const onOnline = () => {
            flushEditQueue();
            void loadTagChoices().then(() => {
                if (signal.aborted) return;
                fillPicker();
            });
        };
        window.addEventListener('online', onOnline, { signal });

        async function runSave(reanalyze) {
            const text = bodyEl.value.trim();
            if (!text) {
                window.alert('Please add some text to your entry.');
                return;
            }
            saveAnalyzeBtn.disabled = true;
            try {
                if (!isOnline()) {
                    pushOfflineQueue(reanalyze);
                    const merged = offlineMergedEntry(reanalyze);
                    replaceEntryInList(merged);
                    entry = merged;
                    baseline = serializeEditor(titleEl, bodyEl, tags);
                    clearDraft();
                    if (reanalyze) {
                        global.DiariMoodAnalysis.resetSession();
                        const overlay = global.DiariMoodAnalysis.ensureAnalysisOverlay();
                        try {
                            await global.DiariMoodAnalysis.primeMoodAnalysisBookLottie();
                        } catch (_) {}
                        global.DiariMoodAnalysis.showAnalysisLoading(overlay);
                        await global.DiariMoodAnalysis.delayUntilMoodAnalysisGate();
                        global.DiariMoodAnalysis.showAnalysisResult(overlay, merged, true, moodOptions(overlay));
                    }
                    return;
                }

                if (reanalyze) {
                    global.DiariMoodAnalysis.resetSession();
                    const overlay = global.DiariMoodAnalysis.ensureAnalysisOverlay();
                    try {
                        await global.DiariMoodAnalysis.primeMoodAnalysisBookLottie();
                    } catch (_) {}
                    global.DiariMoodAnalysis.showAnalysisLoading(overlay);
                    try {
                        const data = await patchRemote(true);
                        entry = data.entry;
                        replaceEntryInList(entry);
                        const engine = (data.analysisEngine || '').toString().toLowerCase();
                        await global.DiariMoodAnalysis.delayUntilMoodAnalysisGate();
                        global.DiariMoodAnalysis.showAnalysisResult(overlay, data.entry, engine === 'fallback', moodOptions(overlay));
                        clearDraft();
                        baseline = serializeEditor(titleEl, bodyEl, tags);
                    } catch (err) {
                        console.error(err);
                        pushOfflineQueue(true);
                        const merged = offlineMergedEntry(true);
                        replaceEntryInList(merged);
                        entry = merged;
                        baseline = serializeEditor(titleEl, bodyEl, tags);
                        await global.DiariMoodAnalysis.delayUntilMoodAnalysisGate();
                        global.DiariMoodAnalysis.showAnalysisResult(overlay, merged, true, moodOptions(overlay));
                    }
                    return;
                }

                try {
                    const data = await patchRemote(false);
                    entry = data.entry;
                    replaceEntryInList(entry);
                    clearDraft();
                    baseline = serializeEditor(titleEl, bodyEl, tags);
                } catch (err) {
                    console.error(err);
                    pushOfflineQueue(false);
                    const merged = offlineMergedEntry(false);
                    replaceEntryInList(merged);
                    entry = merged;
                    baseline = serializeEditor(titleEl, bodyEl, tags);
                    window.alert('Saved offline. We will sync when you are back online.');
                }
            } finally {
                saveAnalyzeBtn.disabled = false;
                if (!signal.aborted) syncReadPane();
            }
        }

        saveAnalyzeBtn.addEventListener('click', () => runSave(true), { signal });

        saveAnalyzeBtn.disabled = false;

        flushEditQueue();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (signal.aborted) return;
                reflowEditorLayout();
            });
        });
    }

    global.DiariEntryDetail = {
        mount,
        unmount,
        getUserId,
        reflowEditorLayout,
    };

    document.addEventListener('DOMContentLoaded', async () => {
        if (!document.body.classList.contains('page-entry-view')) return;
        const id = parseQueryId();
        const uid = getUserId();
        if (!id || !uid) {
            window.location.href = 'entries.html';
            return;
        }
        await mount({
            entryId: id,
            onLeavePanel: () => {
                window.location.href = 'entries.html';
            },
        });
    });
})(typeof window !== 'undefined' ? window : this);
