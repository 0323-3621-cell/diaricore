/**
 * On-device speech-to-text (no DiariCore /api call).
 * Uses Whisper Tiny; falls back to server from voice-entry.js when this fails (e.g. Brave blocks CDN).
 */
(function (global) {
    'use strict';

    const MODEL_ID = 'Xenova/whisper-tiny';
    const TRANSFORMERS_URLS = [
        'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2',
        'https://esm.sh/@xenova/transformers@2.17.2',
        'https://unpkg.com/@xenova/transformers@2.17.2?module',
    ];

    let pipelinePromise = null;
    let lastLoadError = null;

    function isSupported() {
        return Boolean(global.AudioContext || global.webkitAudioContext);
    }

    function resolveVoiceLang(options) {
        if (options && (options.voiceLang === 'en' || options.voiceLang === 'tl')) {
            return options.voiceLang;
        }
        if (global.DiariVoiceLocale && typeof global.DiariVoiceLocale.getVoiceLang === 'function') {
            return global.DiariVoiceLocale.getVoiceLang();
        }
        return 'en';
    }

    function whisperLanguage(voiceLang) {
        if (global.DiariVoiceLocale && typeof global.DiariVoiceLocale.whisperLanguage === 'function') {
            return global.DiariVoiceLocale.whisperLanguage(voiceLang);
        }
        return voiceLang === 'tl' ? 'tagalog' : 'english';
    }

    function configureRuntime(env) {
        if (!env || !env.backends || !env.backends.onnx || !env.backends.onnx.wasm) return;
        const wasm = env.backends.onnx.wasm;
        /* Multi-thread WASM needs COOP/COEP; without it ONNX throws and transcription fails. */
        if (global.crossOriginIsolated && global.navigator && global.navigator.hardwareConcurrency > 1) {
            wasm.numThreads = Math.min(4, global.navigator.hardwareConcurrency);
        } else {
            wasm.numThreads = 1;
        }
    }

    async function getTransformers() {
        let lastErr = null;
        for (let i = 0; i < TRANSFORMERS_URLS.length; i += 1) {
            try {
                return await import(/* webpackIgnore: true */ TRANSFORMERS_URLS[i]);
            } catch (err) {
                lastErr = err;
                console.warn('Transformers CDN failed:', TRANSFORMERS_URLS[i], err);
            }
        }
        throw lastErr || new Error('Could not load the on-device speech library (CDN blocked).');
    }

    function resetPipeline() {
        pipelinePromise = null;
    }

    async function loadTranscriber(onStatus) {
        if (!pipelinePromise) {
            pipelinePromise = (async function () {
                const { pipeline, env } = await getTransformers();
                env.allowLocalModels = false;
                env.useBrowserCache = true;
                configureRuntime(env);
                if (onStatus) onStatus('Downloading speech model (one time, ~40 MB)…');
                return pipeline('automatic-speech-recognition', MODEL_ID);
            })();
        }
        try {
            return await pipelinePromise;
        } catch (err) {
            lastLoadError = err;
            resetPipeline();
            throw err;
        }
    }

    function warmUp(options) {
        if (!isSupported()) return Promise.resolve(false);
        const onStatus =
            options && typeof options.onStatus === 'function' ? options.onStatus : null;
        return loadTranscriber(onStatus).then(
            function () {
                lastLoadError = null;
                return true;
            },
            function (err) {
                lastLoadError = err;
                console.warn('Voice model warm-up failed:', err);
                return false;
            }
        );
    }

    function getLastLoadError() {
        return lastLoadError;
    }

    function chunkParamsForDuration(durationSec) {
        const d = Math.max(0.5, durationSec);
        if (d <= 14) {
            return { chunk_length_s: Math.min(30, Math.ceil(d) + 2), stride_length_s: 2 };
        }
        if (d <= 45) {
            return { chunk_length_s: 15, stride_length_s: 3 };
        }
        return { chunk_length_s: 25, stride_length_s: 5 };
    }

    async function blobToMono16k(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const Ctor = global.AudioContext || global.webkitAudioContext;
        const ctx = new Ctor();
        try {
            const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
            const length = Math.max(1, Math.ceil(decoded.duration * 16000));
            const offline = new OfflineAudioContext(1, length, 16000);
            const source = offline.createBufferSource();
            source.buffer = decoded;
            source.connect(offline.destination);
            source.start(0);
            const rendered = await offline.startRendering();
            return rendered.getChannelData(0);
        } catch (decodeErr) {
            throw new Error(
                'Could not decode the recording audio. Try Chrome or Edge, or record a little longer.'
            );
        } finally {
            try {
                await ctx.close();
            } catch (_) {}
        }
    }

    /**
     * @param {Blob} blob
     * @param {{ onStatus?: (msg: string) => void, voiceLang?: 'en'|'tl' }} [options]
     * @returns {Promise<string>}
     */
    async function transcribeBlob(blob, options) {
        if (!blob || blob.size < 200) {
            throw new Error('Recording too short.');
        }
        const opts = options || {};
        const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : null;
        const voiceLang = resolveVoiceLang(opts);
        const language = whisperLanguage(voiceLang);

        const transcriber = await loadTranscriber(
            onStatus
                ? function (msg) {
                      onStatus(msg);
                  }
                : null
        );
        if (onStatus) onStatus('Preparing audio…');
        const audio = await blobToMono16k(blob);
        const durationSec = audio.length / 16000;
        const chunks = chunkParamsForDuration(durationSec);
        if (onStatus) onStatus('Transcribing on your device…');
        const out = await transcriber(audio, {
            sampling_rate: 16000,
            language: language,
            task: 'transcribe',
            chunk_length_s: chunks.chunk_length_s,
            stride_length_s: chunks.stride_length_s,
        });
        const text =
            out && typeof out.text === 'string'
                ? out.text.trim()
                : out && out.chunks && out.chunks[0] && out.chunks[0].text
                  ? String(out.chunks[0].text).trim()
                  : '';
        return text;
    }

    global.DiariVoiceClient = {
        isSupported,
        warmUp,
        transcribeBlob,
        getLastLoadError,
        resetPipeline,
    };
})(typeof window !== 'undefined' ? window : globalThis);
