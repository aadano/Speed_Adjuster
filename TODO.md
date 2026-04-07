# Build Plan — Audio Speed Adjuster

## What exists right now
| File | State |
|---|---|
| `app.py` | Skeleton with 3 routes; `DOWNLOAD_DIR` is broken (points at `index.js`), `/give_link` never returns on success, `/downloadable_file` is empty |
| `templates/index.html` | Shell — just an `<h1>`, no inputs, no player |
| `static/index.js` | Three empty stub functions |
| `static/styles.css` | Empty |

---

## Backend fixes & additions (`app.py`)

### 1. Fix `DOWNLOAD_DIR`
```python
# Current (broken) — points at the JS file
DOWNLOAD_DIR = os.path.join(BASE_DIR, "/static/index.js")

# Fix — should be a real temp/downloads folder
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
```

### 2. Fix `/give_link` route
- Fix the `outtmpl` — it currently also uses the JS path
- Return the filename (or a stream URL) to the client on success
- Return a proper JSON error on failure, not `jsonify({"error"})` (that's invalid syntax)
- Consider renaming each download to a unique ID (e.g. `uuid4()`) so concurrent users don't collide

### 3. Add a `/stream/<filename>` route
The frontend needs to play the audio before the user downloads it. You need a route that:
- Takes a filename
- Returns the file as a streamable response (`send_file` with `mimetype='audio/mp4'` or `audio/mpeg`)

### 4. Complete `/downloadable_file`
- Accept a filename query param or a POST body
- Use Flask's `send_file(..., as_attachment=True)` so the browser triggers a save dialog
- Optionally delete the file from disk after sending (cleanup)

### 5. (Optional but recommended) File cleanup
Downloaded audio files pile up. Either:
- Delete after download, or
- Run a background sweep that deletes files older than N minutes

---

## Frontend — `templates/index.html`

Add these elements inside `<main>`:

```
[ URL input field          ] [ Submit button ]

[ <audio> player with controls ]

Speed: [ ——o—— ] 0.75x  1x  1.25x  1.5x  2x   (live label showing current value)

[ Download button ]
```

- Link stylesheet correctly: `href="{{ url_for('static', filename='styles.css') }}"`
- Link script correctly: `src="{{ url_for('static', filename='index.js') }}"`
- Give each element an `id` so `index.js` can grab them

---

## Frontend — `static/index.js`

### `give_me_link()`
1. Read the URL from the input field
2. POST it to `/give_link` as JSON (`Content-Type: application/json`)
3. On success: set `<audio>.src` to `/stream/<returned_filename>` and call `.load()` + `.play()`
4. On error: show an error message to the user

### `adjust_slider(position)`
```js
// The Web Audio API playbackRate property does exactly this — no server roundtrip needed
audioElement.playbackRate = position;  // 0.5 – 4.0 range supported natively
```
- Wire the `<input type="range">` `oninput` event to call `adjust_slider(this.value)`
- Update a visible label so the user sees the current speed (e.g. "1.25x")

### `bar_seek()`
- The native `<audio>` element already has a seek bar — you may not need this at all
- If you want a custom seek bar, update `audioElement.currentTime` based on click position

### Download button handler
- Redirect to `/downloadable_file?filename=<current_filename>` or open in a new tab
- Disable the button until audio has been loaded

---

## Dependency checklist
Make sure these are installed and in a `requirements.txt`:
- `flask`
- `yt-dlp`
- `ffmpeg` (system binary — required by yt-dlp for audio extraction; install separately)

---

## Suggested build order
1. Fix `DOWNLOAD_DIR` and the broken yt-dlp output path in `app.py`
2. Make `/give_link` return the filename on success
3. Add the `/stream/<filename>` route
4. Complete `/downloadable_file`
5. Build the HTML layout (input, audio player, slider, download button)
6. Implement `give_me_link()` in JS
7. Implement `adjust_slider()` in JS (one line — `playbackRate`)
8. Style with CSS
9. Test end-to-end with a real YouTube URL
