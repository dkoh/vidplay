document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const videoUpload = document.getElementById('video-upload');
    const videoPlayer = document.getElementById('video-player');
    const startTimeInput = document.getElementById('start-time-input');
    const endTimeInput = document.getElementById('end-time-input');
    const markStartBtn = document.getElementById('mark-start-btn');
    const markEndBtn = document.getElementById('mark-end-btn');
    const addClipBtn = document.getElementById('add-clip-btn');
    const clipsList = document.getElementById('timestamps-list');
    let videoFile = null;

    // --- Core Functions ---
    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        const ms = Math.floor((seconds - Math.floor(seconds)) * 1000).toString().padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    }

    function parseTime(timeStr) {
        if (!timeStr || !timeStr.includes(':')) return NaN;
        const parts = timeStr.split(':');
        const secondsParts = parts[2].split('.');
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(secondsParts[0], 10);
        const milliseconds = parseInt(secondsParts[1] || '0', 10);
        return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    }
    
    function createResultsSrt(container, results) {
        let resultsHTML = '';
        results.forEach((result, index) => {
            const uniqueId = `${container.id}-result-${index}`;
            resultsHTML += `
                <div class="result-set">
                    <h4>${result.service}</h4>
                    <div class="srt-output">
                        <div class="srt-block">
                            <label>Transcription</label>
                            <textarea id="${uniqueId}-transcription" readonly>${result.transcription}</textarea>
                            <div class="subtitle-controls">
                                <button class="show-subs-btn" data-target-id="${uniqueId}-transcription" data-lang="en" data-label="${result.service} Transcription">Show on Player</button>
                                <button class="save-srt-btn" data-target-id="${uniqueId}-transcription" data-filename="transcription.srt">Save as .srt</button>
                            </div>
                        </div>
                        <div class="srt-block">
                            <label>Translation</label>
                            <textarea id="${uniqueId}-translation" readonly>${result.translation}</textarea>
                             <div class="subtitle-controls">
                                <button class="show-subs-btn" data-target-id="${uniqueId}-translation" data-lang="es" data-label="${result.service} Translation">Show on Player</button>
                                <button class="save-srt-btn" data-target-id="${uniqueId}-translation" data-filename="translation.srt">Save as .srt</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = resultsHTML;
    }

    let currentTrackUrl = null;
    function displaySubtitlesOnPlayer(vttContent, lang, label, srcUrl = null) {
        const existingTrack = videoPlayer.querySelector('track');

        // Clean up previous subtitle track and its object URL
        if (existingTrack) {
            videoPlayer.removeChild(existingTrack);
        }
        if (currentTrackUrl) {
            URL.revokeObjectURL(currentTrackUrl);
            currentTrackUrl = null;
        }
        
        // Don't add a track if there's no content to create a blob from
        if (!srcUrl && (!vttContent || vttContent.trim() === '' || vttContent.toLowerCase().includes('n/a'))) {
            return; 
        }

        const trackSrc = srcUrl ? srcUrl : URL.createObjectURL(new Blob([vttContent], { type: 'text/vtt' }));
        if (!srcUrl) {
            currentTrackUrl = trackSrc; // Only manage URLs we created
        }

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = label;
        track.srclang = lang;
        track.src = trackSrc;
        track.default = true;

        videoPlayer.appendChild(track);
        track.mode = 'showing';
    }

    function addClipToList(start, end) {
        const uniqueId = `clip-${Date.now()}`;
        const listItem = document.createElement('li');
        listItem.id = uniqueId;
        listItem.className = 'clip-item';
        
        listItem.innerHTML = `
            <div class="clip-info">
                <strong>Clip: ${formatTime(start)} - ${formatTime(end)}</strong>
                <button class="transcribe-btn" data-start-time="${start}" data-end-time="${end}" data-target-id="${uniqueId}">Transcribe</button>
            </div>
            <div class="clip-options">
                <div class="service-option"><input type="checkbox" id="${uniqueId}-google-chirp" value="google-chirp" class="service-checkbox" checked> <label for="${uniqueId}-google-chirp">Google Chirp</label></div>
                <div class="service-option"><input type="checkbox" id="${uniqueId}-openai" value="openai" class="service-checkbox" checked> <label for="${uniqueId}-openai">OpenAI API</label></div>
                <div class="service-option"><input type="checkbox" id="${uniqueId}-local-base" value="local-base" class="service-checkbox" checked> <label for="${uniqueId}-local-base">Local Whisper (Base)</label></div>
                <div class="service-option"><input type="checkbox" id="${uniqueId}-local-medium" value="local-medium" class="service-checkbox"> <label for="${uniqueId}-local-medium">Local Whisper (Medium)</label></div>
                <div class="service-option"><input type="checkbox" id="${uniqueId}-local-large" value="local-large-v2" class="service-checkbox"> <label for="${uniqueId}-local-large">Local Whisper (Large-v2)</label></div>
            </div>
            <div id="results-${uniqueId}" class="results-container"></div>
        `;
        clipsList.appendChild(listItem);
    }

    // --- Event Listeners ---
    videoUpload.addEventListener('change', (event) => {
        videoFile = event.target.files[0];
        if (videoFile) {
            videoPlayer.src = URL.createObjectURL(videoFile);
        }
    });

    document.getElementById('srt-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const fileReader = new FileReader();
            fileReader.onload = (e) => {
                let content = e.target.result;
                // Basic conversion from SRT to VTT if needed
                if (file.name.endsWith('.srt')) {
                    content = "WEBVTT\n\n" + content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
                }
                displaySubtitlesOnPlayer(content, 'en', file.name);
            };
            fileReader.readAsText(file);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.target.tagName.toLowerCase() === 'input' || event.target.isContentEditable) return;
        if (event.code === 'Space') {
            event.preventDefault();
            videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
        }
    });

    markStartBtn.addEventListener('click', () => {
        startTimeInput.value = formatTime(videoPlayer.currentTime);
    });

    markEndBtn.addEventListener('click', () => {
        endTimeInput.value = formatTime(videoPlayer.currentTime);
    });

    addClipBtn.addEventListener('click', () => {
        const startTime = parseTime(startTimeInput.value);
        const endTime = parseTime(endTimeInput.value);

        if (isNaN(startTime) || isNaN(endTime)) {
            alert("Invalid time format. Please use HH:MM:SS.ms and ensure both fields are filled.");
            return;
        }
        if (endTime <= startTime) {
            alert("End time must be after start time.");
            return;
        }

        addClipToList(startTime, endTime);
        startTimeInput.value = '';
        endTimeInput.value = '';
    });

    clipsList.addEventListener('click', async (event) => {
        if (event.target.classList.contains('transcribe-btn')) {
            const button = event.target;
            const clipElement = button.closest('.clip-item');
            const { startTime, endTime, targetId } = button.dataset;
            const resultsContainer = document.getElementById(`results-${targetId}`);

            const selectedServices = Array.from(clipElement.querySelectorAll('.service-checkbox:checked')).map(cb => cb.value);

            if (selectedServices.length === 0) {
                alert("Please select at least one transcription service for this clip.");
                return;
            }
            if (!videoFile) {
                alert("The video file is not available. Please upload it again if necessary.");
                return;
            }

            button.disabled = true;
            button.textContent = 'Transcribing...';
            resultsContainer.innerHTML = '<p>Processing...</p>';

            const formData = new FormData();
            formData.append('file', videoFile);
            formData.append('startTime', startTime);
            formData.append('endTime', endTime);
            selectedServices.forEach(service => formData.append('services', service));

            try {
                const response = await fetch('/transcribe', { method: 'POST', body: formData });
                const data = await response.json();
                if (response.ok) {
                    createResultsSrt(resultsContainer, data.results);
                } else {
                    resultsContainer.innerHTML = `<p class="error">Error: ${data.error || 'Unknown error'}</p>`;
                }
            } catch (error) {
                resultsContainer.innerHTML = `<p class="error">Network or script error: ${error.message}</p>`;
            } finally {
                button.disabled = false;
                button.textContent = 'Transcribe';
            }
        } else if (event.target.classList.contains('show-subs-btn')) {
            const button = event.target;
            const { targetId, lang, label } = button.dataset;
            const srtContent = document.getElementById(targetId).value;
            displaySubtitlesOnPlayer(srtContent, lang, label);
        } else if (event.target.classList.contains('save-srt-btn')) {
            const button = event.target;
            const { targetId, filename } = button.dataset;
            const vttContent = document.getElementById(targetId).value;
            
            // Convert VTT to SRT for saving
            const srtContent = vttContent
                .replace(/(\d{2}:\d{2}:\d{2})\.(\d{3})/g, '$1,$2') // H:M:S.ms -> H:M:S,ms
                .replace(/^WEBVTT\n\n/, '')
                .replace(/^WEBVTT\n/, '');

            const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
});
