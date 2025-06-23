import os
import whisper
import ffmpeg
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Load the Whisper model
model = whisper.load_model("base")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    startTime = float(request.form.get('startTime', 0))
    endTime = float(request.form.get('endTime', 0))
    duration = endTime - startTime

    if duration <= 0:
        return jsonify({'error': 'End time must be after start time'}), 400

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file:
        # Create a temporary directory for uploaded files if it doesn't exist
        if not os.path.exists("temp"):
            os.makedirs("temp")

        temp_video_path = os.path.join("temp", file.filename)
        file.save(temp_video_path)

        try:
            # Extract a 10-second audio clip around the timestamp
            temp_audio_path = os.path.join("temp", "temp_audio.wav")
            
            (
                ffmpeg
                .input(temp_video_path, ss=startTime)
                .output(temp_audio_path, t=duration, acodec='pcm_s16le', ac=1, ar='16k')
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )

            # Transcribe the audio
            options = {"task" : "transcribe"}
            result = model.transcribe(temp_audio_path, **options)
            transcription = result['text']

            # Translate the audio
            options = {"task" : "translate"}
            result = model.transcribe(temp_audio_path, **options)
            translation = result['text']

            return jsonify({'transcription': transcription, 'translation': translation})

        except ffmpeg.Error as e:
            return jsonify({'error': 'FFmpeg error', 'details': e.stderr.decode()}), 500
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            # Clean up temporary files
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
            if os.path.exists(temp_audio_path):
                os.remove(temp_audio_path)

    return jsonify({'error': 'An unexpected error occurred'}), 500

if __name__ == '__main__':
    app.run(debug=True) 