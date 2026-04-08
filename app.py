from dotenv import load_dotenv
load_dotenv()

from flask import Flask, render_template, request, session, jsonify, send_file, Response
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
import shutil
import subprocess
import uuid
import yt_dlp
from urllib.parse import urlparse


app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY')
if not app.secret_key:
    raise RuntimeError("SECRET_KEY environment variable is not set")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Write cookies from env var to a file if provided
COOKIES_PATH = None
_cookies_content = os.environ.get('YOUTUBE_COOKIES')
if _cookies_content:
    COOKIES_PATH = os.path.join(BASE_DIR, "cookies.txt")
    with open(COOKIES_PATH, 'w') as f:
        f.write(_cookies_content)
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
FFMPEG_PATH = os.environ.get('FFMPEG_PATH', '')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB upload limit

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Wipe leftover files from previous crashes on startup
for item in os.listdir(DOWNLOAD_DIR):
    item_path = os.path.join(DOWNLOAD_DIR, item)
    try:
        shutil.rmtree(item_path) if os.path.isdir(item_path) else os.remove(item_path)
    except OSError:
        pass

limiter = Limiter(get_remote_address, app=app, default_limits=["10 per minute"], storage_uri="memory://")


@app.route('/')
def index():
    return render_template('index.html')


def validate_youtube_url(url):
    if len(url) > 200:
        return False
    youtube_domains = ['youtube.com', 'youtu.be']
    parsed = urlparse(url)
    if not parsed.netloc:
        return False
    domain = parsed.netloc.replace('www.', '')
    return domain in youtube_domains


@app.route('/give_link', methods=['POST'])
@limiter.limit("5 per minute")
def primary_logic():
    url = request.get_json(force=False, silent=False, cache=True)
    linky = url["url"]
    if validate_youtube_url(linky):
        job_dir = os.path.join(DOWNLOAD_DIR, str(uuid.uuid4()))
        os.makedirs(job_dir)
        ydl_opts = {
            "outtmpl": os.path.join(job_dir, "%(title)s.%(ext)s"),
            'format': 'm4a/bestaudio/best',
            'noplaylist': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'm4a',
            }],
            'js_runtimes': {'node': {}},
            'extractor_args': {
                'youtubepot-bgutilhttp': {
                    'base_url': ['http://127.0.0.1:4416']
                }
            },
        }
        if FFMPEG_PATH:
            ydl_opts['ffmpeg_location'] = FFMPEG_PATH
        if COOKIES_PATH:
            ydl_opts['cookiefile'] = COOKIES_PATH
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(linky, download=True)
            filepath = info["requested_downloads"][0]["filepath"]
            session["filepath"] = filepath
            session["job_dir"] = job_dir
            return jsonify({"status": "ok"})
    else:
        return jsonify({"error": "invalid url"}), 400


@app.route('/export_video', methods=['POST'])
@limiter.limit("3 per minute")
def export_video():
    try:
        audio_file = request.files.get('audio')
        visual_file = request.files.get('visual')
        duration = float(request.form.get('duration', 0))

        if not audio_file:
            return jsonify({"error": "no audio"}), 400

        job_dir = os.path.join(DOWNLOAD_DIR, str(uuid.uuid4()))
        os.makedirs(job_dir)
        audio_path = os.path.join(job_dir, "render_audio.wav")
        audio_file.save(audio_path)
        output_path = os.path.join(job_dir, "output.mp4")
        session["video_path"] = output_path
        visual_path = None

        if visual_file:
            visual_ext = os.path.splitext(visual_file.filename)[1].lower()
            visual_path = os.path.join(job_dir, "visual" + visual_ext)
            visual_file.save(visual_path)
            is_gif = visual_ext == ".gif"
            loop_flag = ["-stream_loop", "-1"] if is_gif else ["-loop", "1"]
            cmd = [
                os.path.join(FFMPEG_PATH, "ffmpeg"), "-y",
                *loop_flag, "-i", visual_path,
                "-i", audio_path,
                "-shortest", "-c:v", "libx264", "-c:a", "aac",
                "-pix_fmt", "yuv420p", "-progress", "pipe:1", "-nostats", output_path
            ]
        else:
            cmd = [
                os.path.join(FFMPEG_PATH, "ffmpeg"), "-y",
                "-f", "lavfi", "-i", "color=c=black:s=1280x720",
                "-i", audio_path,
                "-shortest", "-c:v", "libx264", "-c:a", "aac",
                "-pix_fmt", "yuv420p", "-progress", "pipe:1", "-nostats", output_path
            ]

        def generate():
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            for line in proc.stdout:
                line = line.strip()
                if line.startswith("out_time_ms="):
                    try:
                        ms = int(line.split("=")[1])
                        pct = min(99, int((ms / 1000000) / duration * 100)) if duration > 0 else 0
                        yield f"data: {pct}\n\n"
                    except ValueError:
                        pass
                elif line == "progress=end":
                    yield "data: 100\n\n"
            proc.wait()
            yield "data: done\n\n"

            # Input files cleaned up here; output.mp4 cleaned up by /get_video
            for p in [audio_path]:
                try: os.remove(p)
                except OSError: pass
            if visual_path:
                try: os.remove(visual_path)
                except OSError: pass
            # Remove visual_path ref from job_dir locals so /get_video cleanup works

        return Response(generate(), mimetype="text/event-stream")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/get_video', methods=['GET'])
def get_video():
    output_path = session.get("video_path")
    if not output_path or not os.path.exists(output_path):
        return jsonify({"error": "file not found"}), 404
    response = send_file(output_path, as_attachment=True, download_name="output.mp4")

    @response.call_on_close
    def cleanup():
        try: shutil.rmtree(os.path.dirname(output_path))
        except OSError: pass

    return response


@app.route('/downloadable_file', methods=['GET'])
def downloadable_file():
    try:
        path = session["filepath"]
        response = send_file(path, as_attachment=True)

        @response.call_on_close
        def cleanup():
            job_dir = session.get("job_dir")
            try:
                shutil.rmtree(job_dir) if job_dir else os.remove(path)
            except OSError:
                pass

        return response
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    # Dev only — use gunicorn in production:
    # gunicorn app:app -w 1 --timeout 300
    app.run()
