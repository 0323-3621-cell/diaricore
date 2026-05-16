/**
 * On-device speech-to-text (no DiariCore /api call).
 * Uses Whisper Tiny via @xenova/transformers from CDN — model downloads once, then cached in browser.
 */
(function (global) {
    'use strict';

    const MODEL_ID = 'Xenova/whisper-tiny';
    let pipelinePromise = null;

    function isSupported() {
        return Boolean(global.AudioContext || global.webkitAudioContext);
    }

    async function loadTranscriber() {
        if (!pipelinePromise) {
            pipelinePromise = (async function () {
                const { pipeline, env } = await import(
                    'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2'
                );
                env.allowLocalModels = false;
                env.useBrowserCache = true;
                return pipeline('automatic-speech-recognition', MODEL_ID);
            })();
        }
        return pipelinePromise;
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
        } finally {
            try {
                await ctx.close();
            } catch (_) {}
        }
    }

    /**
     * @param {Blob} blob
     * @param {(msg: string) => void} [onStatus]
     * @returns {Promise<string>}
     */
    async function transcribeBlob(blob, onStatus) {
        if (!blob || blob.size < 200) {
            throw new Error('Recording too short.');
        }
        if (onStatus) onStatus('Loading on-device speech model (first use may take a minute)…');
        const transcriber = await loadTranscriber();
        if (onStatus) onStatus('Preparing audio…');
        const audio = await blobToMono16k(blob);
        if (onStatus) onStatus('Transcribing on your device…');
        const out = await transcriber(audio, { sampling_rate: 16000 });
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
        transcribeBlob,
    };
})(typeof window !== 'undefined' ? window : globalThis);
