// Voice Entry JavaScript
document.addEventListener('DOMContentLoaded', function() {
    let isRecording = false;
    let mediaRecorder;
    let audioChunks = [];
    let startTime;
    let timerInterval;
    
    // Get DOM elements
    const voiceCircle = document.getElementById('voiceCircle');
    const micIcon = document.getElementById('micIcon');
    const statusText = document.getElementById('statusText');
    const transcriptText = document.getElementById('transcriptText');
    const finalTranscript = document.getElementById('finalTranscript');
    const recordingState = document.getElementById('recordingState');
    const postRecordingContainer = document.getElementById('postRecordingContainer');
    const recordingDuration = document.getElementById('recordingDuration');
    const wordCount = document.getElementById('wordCount');
    const retryBtn = document.getElementById('retryBtn');
    const saveBtn = document.getElementById('saveBtn');
    
    // Sidebar functionality
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('collapsed');
        });
    }
    
    // Voice recording functionality
    voiceCircle.addEventListener('click', function() {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });
    
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = function(event) {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = function() {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                processAudio(audioBlob);
            };
            
            mediaRecorder.start();
            isRecording = true;
            startTime = Date.now();
            
            // Update UI for recording state
            micIcon.className = 'bi bi-stop-fill';
            voiceCircle.style.background = '#ef4444';
            recordingState.style.display = 'block';
            
            // Start timer
            timerInterval = setInterval(updateTimer, 100);
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            statusText.textContent = 'Microphone access denied';
        }
    }
    
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        
        isRecording = false;
        clearInterval(timerInterval);
        
        // Update UI for stopped recording
        micIcon.className = 'bi bi-mic';
        voiceCircle.style.background = 'var(--primary-color)';
        recordingState.style.display = 'none';
        statusText.textContent = 'Recording complete';
        
        // Calculate final duration
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        recordingDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Show post-recording container after a short delay
        setTimeout(() => {
            postRecordingContainer.style.display = 'block';
        }, 500);
    }
    
    function updateTimer() {
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        recordingDuration.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    function processAudio(audioBlob) {
        // Simulate speech-to-text processing
        // In a real implementation, you would send this to a speech-to-text API
        setTimeout(() => {
            const simulatedTranscript = "This is a sample transcript of your voice entry. In a real implementation, this would be the actual text converted from your speech using a speech-to-text service like Google Speech-to-Text or Azure Speech Services.";
            transcriptText.textContent = simulatedTranscript;
            finalTranscript.textContent = simulatedTranscript;
            
            // Update word count
            const words = simulatedTranscript.split(/\s+/).filter(word => word.length > 0).length;
            wordCount.textContent = words;
        }, 1500);
    }
    
    // Retry button functionality
    retryBtn.addEventListener('click', function() {
        // Reset UI
        postRecordingContainer.style.display = 'none';
        transcriptText.textContent = 'Your speech will appear here as you speak...';
        finalTranscript.textContent = 'Your speech will appear here as you speak...';
        statusText.textContent = 'Tap to start recording';
        recordingDuration.textContent = '00:00';
        wordCount.textContent = '0';
        
        // Clear any existing recording data
        audioChunks = [];
    });
    
    // Save button functionality
    saveBtn.addEventListener('click', function() {
        const transcript = transcriptText.textContent;
        if (transcript && transcript !== 'Your speech will appear here as you speak...') {
            // Save to localStorage (placeholder)
            let entries = JSON.parse(localStorage.getItem('diariCoreEntries') || '[]');
            const entry = {
                id: Date.now(),
                type: 'voice',
                text: transcript,
                date: new Date().toISOString(),
                duration: recordingDuration.textContent,
                wordCount: wordCount.textContent,
                characterCount: transcript.length,
                audioData: 'audio_blob_data_placeholder' // In real implementation, you'd store the audio
            };
            entries.push(entry);
            localStorage.setItem('diariCoreEntries', JSON.stringify(entries));
            
            // Show success message
            statusText.textContent = 'Entry saved successfully!';
            
            // Redirect after delay
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
        }
    });
});
