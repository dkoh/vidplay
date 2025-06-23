document.addEventListener('DOMContentLoaded', () => {
    const videoUpload = document.getElementById('video-upload');
    const videoPlayer = document.getElementById('video-player');
    const markStartBtn = document.getElementById('mark-start-btn');
    const markEndBtn = document.getElementById('mark-end-btn');
    const addClipBtn = document.getElementById('add-clip-btn');
    const timestampsList = document.getElementById('timestamps-list');
    let videoFile = null;
    let startTime = null;
    let endTime = null;

    // Load video from file input
    videoUpload.addEventListener('change', function(event) {
        videoFile = event.target.files[0];
        if (videoFile) {
            const fileURL = URL.createObjectURL(videoFile);
            videoPlayer.src = fileURL;
        }
    });

    // Add spacebar play/pause functionality
    document.addEventListener('keydown', function(event) {
        // We don't want to interfere with typing in input fields
        if (event.target.tagName.toLowerCase() === 'input') {
            return;
        }

        if (event.code === 'Space') {
            event.preventDefault(); // Prevents page from scrolling
            if (videoPlayer.paused) {
                videoPlayer.play();
            } else {
                videoPlayer.pause();
            }
        }
    });

    // Mark start time
    markStartBtn.addEventListener('click', () => {
        startTime = videoPlayer.currentTime;
        endTime = null;
        markEndBtn.disabled = false;
        addClipBtn.disabled = true;
        markStartBtn.textContent = `Start: ${formatTime(startTime)}`;
        markEndBtn.textContent = 'Mark End';
    });

    // Mark end time
    markEndBtn.addEventListener('click', () => {
        endTime = videoPlayer.currentTime;
        if (endTime <= startTime) {
            alert("End time must be after start time.");
            endTime = null;
            return;
        }
        addClipBtn.disabled = false;
        markEndBtn.textContent = `End: ${formatTime(endTime)}`;
    });

    // Add clip to the list
    addClipBtn.addEventListener('click', () => {
        if (startTime !== null && endTime !== null) {
            addClipToList(startTime, endTime);
            // Reset buttons
            startTime = null;
            endTime = null;
            markStartBtn.textContent = 'Mark Start';
            markEndBtn.textContent = 'Mark End';
            markEndBtn.disabled = true;
            addClipBtn.disabled = true;
        }
    });

    function formatTime(seconds) {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function addClipToList(start, end) {
        const formattedStart = formatTime(start);
        const formattedEnd = formatTime(end);
        const listItem = document.createElement('li');
        const uniqueId = `ts-${Date.now()}`;
        listItem.innerHTML = `
            <div>
                <span>Clip: ${formattedStart} - ${formattedEnd}</span>
                <p id="${uniqueId}-transcription" class="transcription-text"></p>
                <p id="${uniqueId}-translation" class="translation-text"></p>
            </div>
            <button class="transcribe-btn" data-start-time="${start}" data-end-time="${end}" data-target-id="${uniqueId}">Transcribe</button>
        `;
        timestampsList.appendChild(listItem);
    }

    timestampsList.addEventListener('click', async (event) => {
        if (event.target.classList.contains('transcribe-btn')) {
            const button = event.target;
            const startTime = button.dataset.startTime;
            const endTime = button.dataset.endTime;
            const targetId = button.dataset.targetId;
            const transcriptionElement = document.getElementById(`${targetId}-transcription`);
            const translationElement = document.getElementById(`${targetId}-translation`);

            if (!videoFile) {
                alert("The video file is not available.");
                return;
            }

            button.disabled = true;
            button.textContent = 'Transcribing...';
            transcriptionElement.textContent = '';
            translationElement.textContent = '';

            const formData = new FormData();
            formData.append('file', videoFile);
            formData.append('startTime', startTime);
            formData.append('endTime', endTime);

            try {
                const response = await fetch('/transcribe', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    transcriptionElement.textContent = `Transcription: ${data.transcription}`;
                    translationElement.textContent = `Translation: ${data.translation}`;
                } else {
                    transcriptionElement.textContent = `Error: ${data.error}`;
                    if(data.details) {
                         transcriptionElement.textContent += ` | Details: ${data.details}`;
                    }
                }
            } catch (error) {
                transcriptionElement.textContent = `Error: ${error.message}`;
            } finally {
                button.disabled = false;
                button.textContent = 'Transcribe';
            }
        }
    });
}); 