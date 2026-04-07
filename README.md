# Speed Adjuster

A web app for downloading YouTube audio and adjusting speed, pitch, and effects in the browser. Export as WAV or MP4.

## Features

- Download audio from a YouTube URL
- Adjust speed, pitch, bass boost, reverb, and distortion in real time
- Upload an image or GIF to use as the video visual
- Export processed audio as WAV or MP4

## Requirements

- Python 3.10+
- ffmpeg

## Setup

1. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

2. Create a `.env` file in the project root:
   ```
   SECRET_KEY=your-secret-key-here
   FFMPEG_PATH=path/to/ffmpeg/bin
   ```

3. Run the app:
   ```
   python app.py
   ```
   Or with gunicorn (production):
   ```
   gunicorn app:app -w 1 --timeout 300
   ```

4. Open `http://127.0.0.1:5000` in your browser.

## Notes

- For personal use only. You are responsible for ensuring you have the right to download and modify any content.
- The `downloads/` folder is used for temporary files and is wiped on startup.
