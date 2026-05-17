/**
 * DiariCore offline emotion ONNX — browser inference when offline only.
 * Online saves still use /api → Hugging Face Space; this module is never called when online.
 */
(function (global) {
    'use strict';

    const HF_MODEL_ID = 'sseia/diari-core-mood';
    const MODEL_URL =
        'https://huggingface.co/' + HF_MODEL_ID + '/resolve/main/model.onnx';
    const ML_CACHE = 'diaricore-ml-v1';
    const WORKER_URL = '/diari-emotion-onnx-worker.js';
    const MAX_LEN = 256;

    let ready = false;
    let preparing = null;
    let tokenizer = null;
    let worker = null;
    let runId = 0;

    function isOnline() {
        return global.navigator.onLine !== false;
    }

    function tensorToIntArray(tensor) {
        if (!tensor) return [];
        if (tensor.data) {
            const d = tensor.data;
            if (typeof d.length === 'number') {
                return Array.from(d, (v) => Number(v));
            }
        }
        if (Array.isArray(tensor)) return tensor.map((v) => Number(v));
        return [];
    }

    async function fetchModelBuffer() {
        const cache = await caches.open(ML_CACHE);
        let res = await cache.match(MODEL_URL);
        if (!res && isOnline()) {
            const net = await fetch(MODEL_URL, { mode: 'cors', credentials: 'omit' });
            if (!net.ok) {
                throw new Error('Model download failed: ' + net.status);
            }
            await cache.put(MODEL_URL, net.clone());
            res = net;
        }
        if (!res) {
            throw new Error('Emotion model not cached; connect once while online to download it.');
        }
        return res.arrayBuffer();
    }

    function createWorker() {
        return new Promise((resolve, reject) => {
            const w = new Worker(WORKER_URL);
            const timeout = setTimeout(() => {
                w.terminate();
                reject(new Error('Worker init timeout'));
            }, 180000);

            w.onmessage = (ev) => {
                const data = ev.data || {};
                if (data.type === 'ready') {
                    clearTimeout(timeout);
                    resolve(w);
                } else if (data.type === 'error' && !data.id) {
                    clearTimeout(timeout);
                    reject(new Error(data.message || 'Worker error'));
                }
            };

            w.onerror = (e) => {
                clearTimeout(timeout);
                reject(e.error || new Error('Worker failed'));
            };

            fetchModelBuffer()
                .then((buf) => {
                    w.postMessage({ type: 'init', model: buf }, [buf]);
                })
                .catch((err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
        });
    }

    async function loadTokenizer() {
        const mod = await import(
            /* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm'
        );
        const { AutoTokenizer, env } = mod;
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
            env.backends.onnx.wasm.numThreads = 1;
        }
        return AutoTokenizer.from_pretrained(HF_MODEL_ID, { progress_callback: null });
    }

    async function prepare() {
        if (ready) return true;
        if (preparing) return preparing;

        preparing = (async () => {
            if (!global.DiariEmotionPipeline) {
                throw new Error('DiariEmotionPipeline not loaded');
            }
            const [tok, w] = await Promise.all([loadTokenizer(), createWorker()]);
            tokenizer = tok;
            worker = w;
            ready = true;
            return true;
        })();

        try {
            return await preparing;
        } catch (e) {
            preparing = null;
            throw e;
        }
    }

    function runInference(inputIds, attentionMask) {
        return new Promise((resolve, reject) => {
            if (!worker) {
                reject(new Error('Worker not ready'));
                return;
            }
            const id = ++runId;
            const onMsg = (ev) => {
                const data = ev.data || {};
                if (data.type === 'result' && data.id === id) {
                    worker.removeEventListener('message', onMsg);
                    resolve(data.logits);
                } else if (data.type === 'error' && data.id === id) {
                    worker.removeEventListener('message', onMsg);
                    reject(new Error(data.message || 'Inference failed'));
                }
            };
            worker.addEventListener('message', onMsg);
            worker.postMessage({
                type: 'run',
                id,
                inputIds,
                attentionMask,
            });
        });
    }

    async function analyze(text) {
        const clean = (text || '').trim();
        if (!clean) {
            return global.DiariEmotionPipeline.fallback(clean);
        }

        await prepare();

        const encoded = await tokenizer(clean, {
            add_special_tokens: true,
            max_length: MAX_LEN,
            padding: 'max_length',
            truncation: true,
        });

        const inputIds = tensorToIntArray(encoded.input_ids);
        const attentionMask = tensorToIntArray(encoded.attention_mask);

        const logits = await runInference(inputIds, attentionMask);
        return global.DiariEmotionPipeline.analyzeFromLogits(clean, logits);
    }

    /** Fire-and-forget cache warm-up while online; does not change online API behavior. */
    function prepareInBackground() {
        if (!isOnline() || ready || preparing) return;
        void prepare().catch((e) => {
            console.info('[DiariEmotionOnnx] Background prepare skipped:', e.message || e);
        });
    }

    global.DiariEmotionOnnx = {
        prepare,
        analyze,
        isReady: () => ready,
        isPreparing: () => Boolean(preparing),
        prepareInBackground,
        MODEL_URL,
    };
})(typeof window !== 'undefined' ? window : self);
