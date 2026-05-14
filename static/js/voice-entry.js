// Voice Entry — live dictation via Web Speech API, then hand off to Write Entry for tags/photos/analysis.
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

    document.addEventListener('DOMContentLoaded', function () {
        try {
            let isRecording = false;
            let mediaRecorder = null;
            let audioChunks = [];
            let mediaStream = null;
            let startTime = null;
            let timerInterval = null;
            let recognition = null;
            let wantRecognitionRunning = false;
            let speechFinalText = '';

            const voiceCircle = document.getElementById('voiceCircle');
            const micIcon = document.getElementById('micIcon');
            const statusText = document.getElementById('statusText');
            const finalTranscript = document.getElementById('finalTranscript');
            const recordingState = document.getElementById('recordingState');
            const recordingText = document.getElementById('recordingText');
            const postRecordingContainer = document.getElementById('postRecordingContainer');
            const recordingDuration = document.getElementById('recordingDuration');
            const wordCount = document.getElementById('wordCount');
            const retryBtn = document.getElementById('retryBtn');
            const saveBtn = document.getElementById('saveBtn');
            const mobileSaveBtn = document.getElementById('saveEntryBtn');
            const mobileRetryBtn = document.getElementById('mobileRetryBtn');

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
            if (sidebarToggle) {
                sidebarToggle.addEventListener('click', function () {
                    sidebar.classList.toggle('collapsed');
                });
            }

            function setPostPanelVisible(visible) {
                if (!postRecordingContainer) return;
                postRecordingContainer.hidden = !visible;
            }

            function updateTranscriptReadonly() {
                if (!finalTranscript) return;
                finalTranscript.readOnly = isRecording && speechSupported;
            }

            function updateWordCountFromTranscript() {
                if (!wordCount || !finalTranscript) return;
                wordCount.textContent = String(countWords(finalTranscript.value));
            }

            function stopMediaStream() {
                if (mediaStream) {
                    mediaStream.getTracks().forEach(function (t) {
                        t.stop();
                    });
                    mediaStream = null;
                }
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

            function attachSpeechRecognition() {
                const Ctor = getSpeechRecognitionCtor();
                if (!Ctor) return;
                speechFinalText = '';
                recognition = new Ctor();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = (navigator.language || 'en-US').slice(0, 5);

                recognition.onresult = function (event) {
                    let interim = '';
                    for (let i = event.resultIndex; i < event.results.length; i += 1) {
                        const piece = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            speechFinalText += piece;
                        } else {
                            interim += piece;
                        }
                    }
                    if (finalTranscript) {
                        finalTranscript.value = (speechFinalText + interim).trim();
                        updateWordCountFromTranscript();
                    }
                };

                recognition.onerror = function (ev) {
                    const err = ev && ev.error ? ev.error : '';
                    if (err === 'no-speech' || err === 'audio-capture') return;
                    if (statusText && err === 'not-allowed') {
                        statusText.textContent = 'Microphone blocked — allow access in browser settings.';
                    }
                };

                recognition.onend = function () {
                    if (!wantRecognitionRunning) return;
                    setTimeout(function () {
                        if (!wantRecognitionRunning || !recognition) return;
                        try {
                            recognition.start();
                        } catch (_) {}
                    }, 120);
                };
            }

            function startSpeechRecognitionSafe() {
                const Ctor = getSpeechRecognitionCtor();
                if (!Ctor || !recognition) return;
                wantRecognitionRunning = true;
                try {
                    recognition.start();
                } catch (e) {
                    wantRecognitionRunning = false;
                    console.error(e);
                }
            }

            if (voiceCircle) {
                voiceCircle.addEventListener('click', function () {
                    if (!isRecording) {
                        void startRecording();
                    } else {
                        stopRecording();
                    }
                });
            }

            async function startRecording() {
                try {
                    speechFinalText = '';
                    if (finalTranscript) {
                        finalTranscript.value = '';
                        finalTranscript.readOnly = false;
                    }
                    updateWordCountFromTranscript();

                    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

                    if (speechSupported) {
                        attachSpeechRecognition();
                        startSpeechRecognitionSafe();
                    } else {
                        mediaRecorder = new MediaRecorder(mediaStream);
                        audioChunks = [];
                        mediaRecorder.ondataavailable = function (event) {
                            if (event.data && event.data.size) audioChunks.push(event.data);
                        };
                        mediaRecorder.onstop = function () {
                            /* No server STT — user types in the transcript box. */
                        };
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
                            'Recording… This browser has no live captioning. Speak, then stop — you can type your words below.';
                    }

                    timerInterval = setInterval(updateRecordingTimer, 100);
                } catch (error) {
                    console.error('Error accessing microphone:', error);
                    if (statusText) {
                        statusText.style.display = 'block';
                        statusText.textContent = 'Microphone access denied or unavailable.';
                    }
                }
            }

            function stopRecording() {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    try {
                        mediaRecorder.stop();
                    } catch (_) {}
                    mediaRecorder = null;
                }

                stopSpeechRecognition();

                stopMediaStream();

                isRecording = false;
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }

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
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                if (recordingDuration) {
                    recordingDuration.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
                }

                updateTranscriptReadonly();
                updateWordCountFromTranscript();

                if (!speechSupported && finalTranscript && !finalTranscript.value.trim()) {
                    finalTranscript.placeholder =
                        'Type what you said here, or try Chrome / Edge on desktop for live dictation.';
                }

                setPostPanelVisible(true);
            }

            function updateRecordingTimer() {
                if (!startTime || !recordingText) return;
                const elapsed = Date.now() - startTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                recordingText.textContent = `Recording... ${minutes}:${String(seconds).padStart(2, '0')}`;
            }

            function resetRecording() {
                stopSpeechRecognition();
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    try {
                        mediaRecorder.stop();
                    } catch (_) {}
                    mediaRecorder = null;
                }
                stopMediaStream();
                isRecording = false;
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                speechFinalText = '';

                setPostPanelVisible(false);
                if (finalTranscript) {
                    finalTranscript.value = '';
                    finalTranscript.readOnly = false;
                    finalTranscript.placeholder =
                        'Your speech will appear here as you speak. You can also type or paste if your browser does not support dictation.';
                }
                if (recordingDuration) recordingDuration.textContent = '00:00';
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
                const transcript = (finalTranscript && finalTranscript.value) ? finalTranscript.value.trim() : '';
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
