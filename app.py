import os
import whisper
import ffmpeg
import datetime
from flask import Flask, render_template, request, jsonify
from openai import OpenAI
from dotenv import load_dotenv
from google.cloud import speech

load_dotenv()

app = Flask(__name__)

# --- Service Initializations ---
# Cache for local Whisper models
local_models = {}

# OpenAI API Client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Google Cloud Speech Client
gcp_speech_client = speech.SpeechClient()

def get_local_model(model_name="base"):
    """Loads a local whisper model, caching it for future use."""
    if model_name not in local_models:
        print(f"Loading local Whisper model: {model_name}...")
        local_models[model_name] = whisper.load_model(model_name)
        print(f"Model {model_name} loaded.")
    return local_models[model_name]

# --- VTT Generation ---
def format_vtt_time(seconds):
    """Converts seconds to HH:MM:SS.ms VTT time format."""
    delta = datetime.timedelta(seconds=seconds)
    total_seconds = delta.total_seconds()
    hours = int(total_seconds // 3600)
    minutes = int((total_seconds % 3600) // 60)
    seconds_val = int(total_seconds % 60)
    milliseconds = int((total_seconds - int(total_seconds)) * 1000)
    return f"{hours:02}:{minutes:02}:{seconds_val:02}.{milliseconds:03}"

def words_to_vtt(words, clip_start_time):
    """
    Converts a list of word objects into a WebVTT formatted string.
    """
    if not words:
        return f"WEBVTT\n\n1\n{format_vtt_time(clip_start_time)} --> {format_vtt_time(clip_start_time)}\n(No words found)"

    vtt_chunks = []
    current_chunk_words = []
    chunk_start_time = words[0]['start']
    max_chunk_duration = 5.0  # seconds
    max_words_per_chunk = 12

    for i, word_info in enumerate(words):
        current_chunk_words.append(word_info['word'])
        is_last_word = (i == len(words) - 1)
        chunk_duration = word_info['end'] - chunk_start_time

        if (chunk_duration > max_chunk_duration or
            len(current_chunk_words) > max_words_per_chunk or
            is_last_word):
            
            chunk_end_time = word_info['end']
            vtt_chunks.append({
                'start': chunk_start_time + clip_start_time,
                'end': chunk_end_time + clip_start_time,
                'text': ' '.join(current_chunk_words).strip()
            })
            
            if not is_last_word:
                current_chunk_words = []
                chunk_start_time = words[i+1]['start']

    vtt_output = ["WEBVTT\n"]
    for i, chunk in enumerate(vtt_chunks, 1):
        start_time_str = format_vtt_time(chunk['start'])
        end_time_str = format_vtt_time(chunk['end'])
        vtt_output.append(f"{i}\n{start_time_str} --> {end_time_str}\n{chunk['text']}")

    return "\n\n".join(vtt_output)

def extract_words_from_whisper(result):
    """Extracts a word list from a whisper transcribe result."""
    words = []
    if 'segments' in result:
        for segment in result['segments']:
            if 'words' in segment:
                words.extend(segment['words'])
    return words

# --- Transcription Logic ---
def transcribe_with_local_whisper(audio_path, clip_start_time, model_name="base"):
    model = get_local_model(model_name)
    
    # Transcribe with word timestamps
    transcribe_result = model.transcribe(audio_path, task="transcribe", word_timestamps=True)
    transcription_words = extract_words_from_whisper(transcribe_result)
    transcription_vtt = words_to_vtt(transcription_words, clip_start_time)
    
    # Translate with word timestamps
    translate_result = model.transcribe(audio_path, task="translate", word_timestamps=True)
    translation_words = extract_words_from_whisper(translate_result)
    translation_vtt = words_to_vtt(translation_words, clip_start_time)
    
    return transcription_vtt, translation_vtt

def transcribe_with_openai_api(audio_path, clip_start_time):
    # Correctly handle the response object from the openai library.
    with open(audio_path, "rb") as audio_file:
        transcription_result = openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json"
        )
        # The result object has a 'words' attribute which is a list of dicts.
        transcription_words = [{'word': w['word'], 'start': w['start'], 'end': w.get('end', w['start'] + 0.5)} for w in (transcription_result.words or [])]
        transcription_vtt = words_to_vtt(transcription_words, clip_start_time)

    with open(audio_path, "rb") as audio_file:
        translation_result = openai_client.audio.translations.create(
            model="whisper-1",
            file=audio_file,
            response_format="verbose_json"
        )
        # The translation endpoint does not support word_timestamps, so we create a basic VTT.
        translation_vtt = f"WEBVTT\n\n1\n{format_vtt_time(clip_start_time)} --> {format_vtt_time(clip_start_time + 5)}\n{translation_result.text}"

    return transcription_vtt, translation_vtt

def transcribe_with_google_chirp(audio_path, clip_start_time):
    """
    Uses a standard, compatible model ('telephony') to avoid version conflicts with 'chirp'.
    This provides a stable transcription from Google. Advanced features like translation
    with Chirp would require a more complex v2 setup.
    """
    with open(audio_path, "rb") as audio_file:
        content = audio_file.read()

    transcription_vtt = "Transcription failed."
    translation_vtt = "N/A (Google translation disabled for compatibility)"
    
    try:
        config = speech.RecognitionConfig(
            language_code="en-US",
            model="telephony", # Using a standard, compatible model
            enable_word_time_offsets=True
        )
        request = speech.RecognizeRequest(config=config, audio=speech.RecognitionAudio(content=content))
        response = gcp_speech_client.recognize(request=request)

        if response.results and response.results[0].alternatives:
            words_raw = response.results[0].alternatives[0].words
            words = [{'word': w.word, 'start': w.start_offset.total_seconds(), 'end': w.end_offset.total_seconds()} for w in words_raw]
            transcription_vtt = words_to_vtt(words, clip_start_time)
        else:
            transcription_vtt = "No transcription results found."
            
    except Exception as e:
        transcription_vtt = f"API Error: {e}"

    return transcription_vtt, translation_vtt

# --- Flask Routes ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transcribe', methods=['POST'])
def transcribe():
    services = request.form.getlist('services')
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
        if not os.path.exists("temp"):
            os.makedirs("temp")

        temp_video_path = os.path.join("temp", "temp_audio.mp4")
        file.save(temp_video_path)

        temp_audio_path = os.path.join("temp", "temp_audio.wav")

        try:
            (
                ffmpeg
                .input(temp_video_path, ss=startTime)
                .output(temp_audio_path, t=duration, acodec='pcm_s16le', ac=1, ar='16k')
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )

            results = []
            for service in services:
                try:
                    transcription, translation = "Error", "Error"
                    if service == 'google-chirp':
                        transcription, translation = transcribe_with_google_chirp(temp_audio_path, startTime)
                    elif service == 'openai':
                        transcription, translation = transcribe_with_openai_api(temp_audio_path, startTime)
                    elif service.startswith('local-'):
                        model_name = service.replace('local-', '')
                        transcription, translation = transcribe_with_local_whisper(temp_audio_path, startTime, model_name=model_name)
                    
                    results.append({
                        "service": service.replace('-', ' ').title(),
                        "transcription": transcription,
                        "translation": translation
                    })
                except Exception as e:
                    results.append({
                        "service": service.replace('-', ' ').title(),
                        "transcription": f"Failed: {e}",
                        "translation": "N/A"
                    })

            return jsonify({'results': results})

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