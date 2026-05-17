/**
 * Web Worker: ONNX Runtime inference only (offline emotion model).
 */
'use strict';

const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';

let session = null;
let ortReady = null;

function loadOrt() {
    if (ortReady) return ortReady;
    ortReady = new Promise((resolve, reject) => {
        try {
            importScripts(ORT_CDN + 'ort.min.js');
            if (typeof ort === 'undefined') {
                reject(new Error('onnxruntime-web failed to load'));
                return;
            }
            ort.env.wasm.wasmPaths = ORT_CDN;
            ort.env.wasm.numThreads = 1;
            resolve(ort);
        } catch (e) {
            reject(e);
        }
    });
    return ortReady;
}

async function initSession(modelBuffer) {
    const ortLib = await loadOrt();
    session = await ortLib.InferenceSession.create(modelBuffer, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
    });
}

self.onmessage = async (event) => {
    const msg = event.data || {};
    try {
        if (msg.type === 'init') {
            await initSession(msg.model);
            self.postMessage({ type: 'ready' });
            return;
        }

        if (msg.type === 'run') {
            if (!session) {
                throw new Error('ONNX session not initialized');
            }
            const ortLib = await loadOrt();
            const inputIds = new ortLib.Tensor(
                'int64',
                BigInt64Array.from(msg.inputIds, (n) => BigInt(n)),
                [1, msg.inputIds.length]
            );
            const attentionMask = new ortLib.Tensor(
                'int64',
                BigInt64Array.from(msg.attentionMask, (n) => BigInt(n)),
                [1, msg.attentionMask.length]
            );
            const outputs = await session.run({
                input_ids: inputIds,
                attention_mask: attentionMask,
            });
            const logitsTensor = outputs.logits || outputs[Object.keys(outputs)[0]];
            const logits = Array.from(logitsTensor.data);
            self.postMessage({ type: 'result', id: msg.id, logits });
            return;
        }
    } catch (err) {
        self.postMessage({
            type: 'error',
            id: msg.id,
            message: err && err.message ? err.message : String(err),
        });
    }
};
