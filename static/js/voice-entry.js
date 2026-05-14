// Voice Entry — mic + Web Audio waveform, Web Speech dictation, hand off to Write Entry.
(function () {
    const VOICE_TO_WRITE_STORAGE_KEY = 'diariCoreVoiceDraftForWrite';

    function getSpeechRecognitionCtor() {
        return window.SpeechRecognition || window.webkitSpeechRecognition || null;
    }

    function countWords(text) {
        const s = String(text || '').trim();
        if (!s) return 0;
        return s.split(/\s+/).filter(Boolean).length;
    }

    function formatElapsed(ms) {
        const totalSec = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSec / 60);
        const seconds = totalSec % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    /** Full BCP-47 tag — never truncate (e.g. `en-GB` → `en-G` breaks Web Speech). */
    function pickRecognitionLang() {
        try {
            const raw = (navigator.language || navigator.userLanguage || 'en-US').trim().replace(/_/g, '-');
            if (!raw) return 'en-US';
            return raw.length > 40 ? raw.slice(0, 40) : raw;
        } catch (_) {
            return 'en-US';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        try {
            let isRecording = false;
            let mediaRecorder = null;
            let audioChunks = [];
            let mediaStream = null;
            /** Clone used only for Web Audio visualizer so analyser and capture stay on separate tracks when possible. */
            let visualInputStream = null;
            let startTime = null;
            let recognition = null;
            let wantRecognitionRunning = false;
            let speechFinalText = '';

            let audioContext = null;
            let mediaSourceNode = null;
            let analyserNode = null;
            let freqData = null;
            let recordingRafId = null;

            const voiceRoot = document.querySelector('.voice-entry-container');
            const voiceCircle = document.getElementById('voiceCircle');
            const micIcon = document.getElementById('micIcon');
            const statusText = document.getElementById('statusText');
            const finalTranscript = document.getElementById('finalTranscript');
            const recordingState = document.getElementById('recordingState');
            const recordingTimeEl = document.getElementById('voiceEntryRecordingTime');
            const postRecordingContainer = document.getElementById('postRecordingContainer');
            const recordingDuration = document.getElementById('recordingDuration');
            const wordCount = document.getElementById('wordCount');
            const retryBtn = document.getElementById('retryBtn');
            const saveBtn = document.getElementById('saveBtn');
            const mobileSaveBtn = document.getElementById('saveEntryBtn');
            const mobileRetryBtn = document.getElementById('mobileRetryBtn');
            const transcriptHint = document.getElementById('voiceTranscriptHint');
            const waveBarEls = voiceRoot
                ? Array.from(voiceRoot.querySelectorAll('.voice-wave-bar'))
                : Array.from(document.querySelectorAll('.voice-wave-bar'));

            const speechSupported = Boolean(getSpeechRecognitionCtor());
            const isMobile = window.innerWidth <= 768;

            if (isMobile && statusText) {
                statusText.textContent = 'Tap to record';
            }

            if (isMobile && mobileRetryBtn) {
                setTimeout(function () {
                    mobileRetryBtn.style.setProperty('display', 'flex', 'important');
                }, 100);
                window.addEventListener('load', function () {
                    setTimeout(function () {
                        mobileRetryBtn.style.setProperty('display', 'flex', 'important');
                        mobileRetryBtn.style.color = 'white';
                        mobileRetryBtn.style.backgroundColor = 'var(--primary-bg)';
                    }, 50);
                });
            }

            const sidebarToggle = document.getElementById('sidebarToggle');
            const sidebar = document.getElementById('sidebar');
            if (sidebarToggle && sidebar) {
                sidebarToggle.addEventListener('click', function () {
                    sidebar.classList.toggle('collapsed');
                });
            }

            function setPostPanelVisible(visible) {
                if (!postRecordingContainer) return;
                postRecordingContainer.hidden = !visible;
            }

            function setTranscriptHint(message) {
                if (!transcriptHint) return;
                const s = String(message || '').trim();
                if (s) {
                    transcriptHint.textContent = s;
                    transcriptHint.hidden = false;
                } else {
                    transcriptHint.textContent = '';
                    transcriptHint.hidden = true;
                }
            }

            function updateTranscriptReadonly() {
                if (!finalTranscript) return;
                /* Always allow typing so users can fall back if live captions fail (e.g. Brave Shields). */
                finalTranscript.readOnly = false;
            }

            function updateWordCountFromTranscript() {
                if (!wordCount || !finalTranscript) return;
                wordCount.textContent = String(countWords(finalTranscript.value));
            }

            function stopMediaStream() {
                if (visualInputStream) {
                    visualInputStream.getTracks().forEach(function (t) {
                        t.stop();
                    });
                    visualInputStream = null;
                }
                if (mediaStream) {
                    mediaStream.getTracks().forEach(function (t) {
                        t.stop();
                    });
                    mediaStream = null;
                }
            }

            function teardownAudioGraph() {
                if (recordingRafId != null) {
                    cancelAnimationFrame(recordingRafId);
                    recordingRafId = null;
                }
                try {
                    if (mediaSourceNode) {
                        mediaSourceNode.disconnect();
                        mediaSourceNode = null;
                    }
                } catch (_) {}
                try {
                    if (analyserNode) {
                        analyserNode.disconnect();
                        analyserNode = null;
                    }
                } catch (_) {}
                freqData = null;
                /* Keep AudioContext alive across sessions so iOS/Safari stay unlocked after first user gesture. */
            }

            function stopSpeechRecognition() {
                wantRecognitionRunning = false;
                if (recognition) {
                    try {
                        recognition.onend = null;
                        recognition.stop();
                    } catch (_) {}
                    recognition = null;
                }
            }

            function primeAudioFromUserGesture() {
                try {
                    const Ctor = window.AudioContext || window.webkitAudioContext;
                    if (!Ctor) return;
                    if (!audioContext) audioContext = new Ctor();
                    if (audioContext.state === 'suspended') {
                        void audioContext.resume();
                    }
                } catch (_) {}
            }

            function attachSpeechRecognition() {
                const Ctor = getSpeechRecognitionCtor();
                if (!Ctor) return;
                speechFinalText = '';
                recognition = new Ctor();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = pickRecognitionLang();
                if ('maxAlternatives' in recognition) {
                    recognition.maxAlternatives = 1;
                }

                recognition.onstart = function () {
                    setTranscriptHint('Listening… speak clearly. Text will appear below as you talk.');
                };

                recognition.onresult = function (event) {
                    let interim = '';
                    for (let i = event.resultIndex; i < event.results.length; i += 1) {
                        const res = event.results[i];
                        if (!res || !res[0]) continue;
                        const piece = res[0].transcript || '';
                        if (res.isFinal) {
                            speechFinalText += piece;
                        } else {
                            interim += piece;
                        }
                    }
                    if (finalTranscript) {
                        const combined = speechFinalText + interim;
                        finalTranscript.value = combined.replace(/\s+/g, ' ').trim();
                        updateWordCountFromTranscript();
                    }
                };

                recognition.onerror = function (ev) {
                    const err = ev && ev.error ? ev.error : '';
                    if (err === 'no-speech' || err === 'aborted') return;
                    if (err === 'audio-capture') return;
                    if (err === 'not-allowed') {
                        wantRecognitionRunning = false;
                        setTranscriptHint(
                            'Speech recognition was blocked. Check site permissions for the microphone.'
                        );
                        if (statusText) {
                            statusText.style.display = 'block';
                            statusText.textContent = 'Microphone or speech access blocked.';
                        }
                        return;
                    }
                    if (err === 'network' || err === 'service-not-allowed') {
                        wantRecognitionRunning = false;
                        setTranscriptHint(
                            'Live captions use your browser’s speech service. If nothing appears here, try turning off Brave Shields (or similar) for this site, or use Chrome/Edge with shields disabled — you can still type your words below.'
                        );
                        return;
                    }
                    wantRecognitionRunning = false;
                    setTranscriptHint(
                        'Speech recognition stopped (' + err + '). You can type your entry in the box above.'
                    );
                };

                recognition.onend = function () {
                    if (!wantRecognitionRunning) return;
                    setTimeout(function () {
                        if (!wantRecognitionRunning || !recognition) return;
                        try {
                            recognition.start();
                        } catch (_) {}
                    }, 160);
                };
            }

            function updateTimerDisplay() {
                if (!recordingTimeEl || !startTime) return;
                recordingTimeEl.textContent = formatElapsed(Date.now() - startTime);
            }

            function updateWaveBars(nowMs) {
                if (!waveBarEls.length) return;
                const t = nowMs * 0.001;
                if (analyserNode && freqData) {
                    analyserNode.getByteFrequencyData(freqData);
                    const n = freqData.length;
                    let energy = 0;
                    const band = Math.min(24, n);
                    for (let i = 0; i < band; i += 1) energy += freqData[i];
                    energy = energy / (band * 255);

                    waveBarEls.forEach(function (bar, i) {
                        const binIdx = Math.min(n - 1, 3 + i * Math.max(1, Math.floor(n / (waveBarEls.length * 4))));
                        const bin = freqData[binIdx] / 255;
                        const idle = 0.1 + 0.09 * Math.sin(t * 2.4 + i * 0.5);
                        const spike = energy * 1.25 + bin * 0.95;
                        const scaleY = Math.min(1, Math.max(0.07, idle + spike));
                        bar.style.transform = 'scaleY(' + scaleY + ')';
                    });
                } else {
                    waveBarEls.forEach(function (bar, i) {
                        const idle = 0.12 + 0.1 * Math.sin(t * 2.4 + i * 0.5);
                        bar.style.transform = 'scaleY(' + idle + ')';
                    });
                }
            }

            function tickRecordingUi() {
                if (!isRecording) {
                    recordingRafId = null;
                    return;
                }
                const now = performance.now();
                updateTimerDisplay();
                updateWaveBars(now);
                recordingRafId = requestAnimationFrame(tickRecordingUi);
            }

            function startRecordingUiLoop() {
                if (recordingRafId != null) {
                    cancelAnimationFrame(recordingRafId);
                    recordingRafId = null;
                }
                updateTimerDisplay();
                recordingRafId = requestAnimationFrame(tickRecordingUi);
            }

            if (voiceCircle) {
                voiceCircle.addEventListener('click', function () {
                    if (!isRecording) {
                        primeAudioFromUserGesture();
                        void startRecording();
                    } else {
                        stopRecording();
                    }
                });
            }

            async function startRecording() {
                teardownAudioGraph();
                stopSpeechRecognition();

                try {
                    speechFinalText = '';
                    setTranscriptHint('');
                    if (finalTranscript) {
                        finalTranscript.value = '';
                        finalTranscript.readOnly = false;
                    }
                    updateWordCountFromTranscript();

                    /* Chromium ties SpeechRecognition to user activation: start() must run before any await in this handler. */
                    let speechStartedOk = false;
                    if (speechSupported) {
                        attachSpeechRecognition();
                        wantRecognitionRunning = true;
                        try {
                            recognition.start();
                            speechStartedOk = true;
                            setTranscriptHint(
                                'Listening… speak clearly. Text will appear below as you talk.'
                            );
                        } catch (preMicErr) {
                            console.warn('Speech start (before mic):', preMicErr);
                            stopSpeechRecognition();
                            setTranscriptHint('Connecting microphone, then starting live captions…');
                        }
                    }

                    mediaStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                        },
                    });

                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (AC) {
                        if (!audioContext) audioContext = new AC();
                        await audioContext.resume();
                        try {
                            visualInputStream = mediaStream.clone();
                        } catch (_) {
                            visualInputStream = mediaStream;
                        }
                        mediaSourceNode = audioContext.createMediaStreamSource(visualInputStream);
                        analyserNode = audioContext.createAnalyser();
                        analyserNode.fftSize = 256;
                        analyserNode.smoothingTimeConstant = 0.72;
                        mediaSourceNode.connect(analyserNode);
                        freqData = new Uint8Array(analyserNode.frequencyBinCount);
                    }

                    if (speechSupported && !speechStartedOk) {
                        attachSpeechRecognition();
                        wantRecognitionRunning = true;
                        try {
                            recognition.start();
                            speechStartedOk = true;
                            setTranscriptHint(
                                'Listening… speak clearly. Text will appear below as you talk.'
                            );
                        } catch (postMicErr) {
                            console.error(postMicErr);
                            stopSpeechRecognition();
                            setTranscriptHint(
                                'Could not start live captions. Type below, or try Chrome / Edge with microphone allowed.'
                            );
                        }
                    } else if (!speechSupported) {
                        mediaRecorder = new MediaRecorder(mediaStream);
                        audioChunks = [];
                        mediaRecorder.ondataavailable = function (event) {
                            if (event.data && event.data.size) audioChunks.push(event.data);
                        };
                        mediaRecorder.onstop = function () {};
                        mediaRecorder.start();
                    }

                    isRecording = true;
                    startTime = Date.now();
                    updateTranscriptReadonly();
                    setPostPanelVisible(true);

                    if (micIcon) micIcon.className = 'bi bi-stop-fill';
                    if (voiceCircle) voiceCircle.classList.add('recording');
                    if (recordingState) recordingState.style.display = 'block';
                    if (statusText) statusText.style.display = 'none';
                    if (isMobile && mobileRetryBtn) {
                        mobileRetryBtn.style.display = 'none';
                    }

                    if (!speechSupported && statusText) {
                        statusText.style.display = 'block';
                        statusText.textContent =
                            'Recording… Add text below, or use Chrome / Edge for live captions.';
                    }

                    startRecordingUiLoop();
                } catch (error) {
                    console.error('Error accessing microphone:', error);
                    teardownAudioGraph();
                    stopSpeechRecognition();
                    stopMediaStream();
                    isRecording = false;
                    startTime = null;
                    if (statusText) {
                        statusText.style.display = 'block';
                        statusText.textContent = 'Microphone access denied or unavailable.';
                    }
                    if (recordingState) recordingState.style.display = 'none';
                    if (voiceCircle) voiceCircle.classList.remove('recording');
                    if (micIcon) micIcon.className = 'bi bi-mic';
                }
            }

            function stopRecording() {
                if (recordingRafId != null) {
                    cancelAnimationFrame(recordingRafId);
                    recordingRafId = null;
                }

                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    try {
                        mediaRecorder.stop();
                    } catch (_) {}
                    mediaRecorder = null;
                }

                stopSpeechRecognition();
                teardownAudioGraph();
                stopMediaStream();

                isRecording = false;
                if (micIcon) micIcon.className = 'bi bi-mic';
                if (voiceCircle) voiceCircle.classList.remove('recording');
                if (recordingState) recordingState.style.display = 'none';
                if (statusText) {
                    statusText.style.display = 'block';
                    statusText.textContent = 'Recording complete';
                }
                if (isMobile && mobileRetryBtn) {
                    mobileRetryBtn.style.setProperty('display', 'flex', 'important');
                }

                const elapsed = startTime ? Date.now() - startTime : 0;
                startTime = null;
                if (recordingDuration) {
                    recordingDuration.textContent = formatElapsed(elapsed);
                }
                if (recordingTimeEl) {
                    recordingTimeEl.textContent = formatElapsed(elapsed);
                }

                updateTranscriptReadonly();
                updateWordCountFromTranscript();

                if (!speechSupported && finalTranscript && !finalTranscript.value.trim()) {
                    finalTranscript.placeholder =
                        'Type what you said here, or try Chrome / Edge on desktop for live dictation.';
                }

                setPostPanelVisible(true);
            }

            function resetRecording() {
                if (recordingRafId != null) {
                    cancelAnimationFrame(recordingRafId);
                    recordingRafId = null;
                }
                stopSpeechRecognition();
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    try {
                        mediaRecorder.stop();
                    } catch (_) {}
                    mediaRecorder = null;
                }
                teardownAudioGraph();
                stopMediaStream();
                isRecording = false;
                startTime = null;
                speechFinalText = '';

                setPostPanelVisible(false);
                setTranscriptHint('');
                if (finalTranscript) {
                    finalTranscript.value = '';
                    finalTranscript.readOnly = false;
                    finalTranscript.placeholder =
                        'Your speech will appear here as you speak. You can also type or paste if your browser does not support dictation.';
                }
                if (recordingDuration) recordingDuration.textContent = '00:00';
                if (recordingTimeEl) recordingTimeEl.textContent = '0:00';
                if (wordCount) wordCount.textContent = '0';
                if (statusText) {
                    statusText.style.display = 'block';
                    statusText.textContent = isMobile ? 'Tap to record' : 'Tap to start recording';
                }
                if (micIcon) micIcon.className = 'bi bi-mic';
                if (voiceCircle) voiceCircle.classList.remove('recording');
                if (recordingState) recordingState.style.display = 'none';
                if (isMobile && mobileRetryBtn) {
                    mobileRetryBtn.style.setProperty('display', 'flex', 'important');
                }
                waveBarEls.forEach(function (bar) {
                    bar.style.transform = 'scaleY(0.15)';
                });
                audioChunks = [];
            }

            if (finalTranscript) {
                finalTranscript.addEventListener('input', updateWordCountFromTranscript);
            }

            if (retryBtn) {
                retryBtn.addEventListener('click', function () {
                    resetRecording();
                });
            }
            if (mobileRetryBtn) {
                mobileRetryBtn.addEventListener('click', function () {
                    mobileRetryBtn.style.animation = 'spin 0.5s linear';
                    resetRecording();
                    mobileRetryBtn.style.color = 'white';
                    mobileRetryBtn.style.backgroundColor = 'var(--primary-bg)';
                    setTimeout(function () {
                        mobileRetryBtn.style.animation = '';
                    }, 500);
                });
            }

            function saveEntry() {
                const transcript = finalTranscript && finalTranscript.value ? finalTranscript.value.trim() : '';
                if (!transcript) {
                    window.alert('Add some text in the transcript (by speaking or typing) before saving.');
                    return;
                }
                try {
                    sessionStorage.setItem(
                        VOICE_TO_WRITE_STORAGE_KEY,
                        JSON.stringify({ text: transcript, ts: Date.now() })
                    );
                } catch (e) {
                    console.error(e);
                    window.alert('Could not prepare your entry. Try again or check private browsing settings.');
                    return;
                }
                window.location.href = 'write-entry.html';
            }

            if (saveBtn) saveBtn.addEventListener('click', saveEntry);
            if (mobileSaveBtn) mobileSaveBtn.addEventListener('click', saveEntry);
        } finally {
            if (window.DiariShell && typeof window.DiariShell.release === 'function') {
                window.DiariShell.release();
            }
        }
    });
})();
