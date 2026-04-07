// DORMANT — real-time canvas capture for baking visualizer into MP4
// Shelved because MediaRecorder only records in real-time:
// a 4-min song = 4-min wait. Revisit when switching to server-side
// ffmpeg filter approach (showwaves/showfreqs filters).

async function captureCanvasVideo(durationSecs) {
    return new Promise((resolve) => {
        const canvas = document.getElementById("visualizer")
        const stream = canvas.captureStream(30)
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" })
        const chunks = []

        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }))

        const savedOffset = startOffset
        if (isPlaying) tonePlayer.stop()
        startOffset = 0
        startTime = Tone.now()
        isPlaying = true
        tonePlayer.start(Tone.now(), 0)

        recorder.start()
        setTimeout(() => {
            recorder.stop()
            tonePlayer.stop()
            startOffset = savedOffset
            isPlaying = false
            document.getElementById("play-pause").textContent = "Play"
        }, durationSecs * 1000 + 500)
    })
}

// In export flow, this was Phase 2 between audio render and ffmpeg encode:
//
//   if (hasVizOverlay) {
//       document.getElementById("progress-label").textContent = "Capturing visualizer..."
//       const webm = await captureCanvasVideo(renderDuration)
//       formData.append("visual", webm, "visual.webm")
//       setProgress(70)
//   }
//
// Flask endpoint handled .webm visual input like so:
//   if is_webm:
//       cmd = [ffmpeg, "-y", "-i", visual_path, "-i", audio_path,
//              "-shortest", "-c:v", "libx264", "-c:a", "aac",
//              "-pix_fmt", "yuv420p", "-progress", "pipe:1", "-nostats", output_path]
