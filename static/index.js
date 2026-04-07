let tonePlayer, pitchShift, eq, reverb, distortion, toneAnalyser, animFrame
let isPlaying = false
let startOffset = 0
let startTime = 0
let audioDuration = 0
let currentSpeed = 1

const form = document.getElementById("url-form")
const loadBtn = document.getElementById("load-btn")
const statusEl = document.getElementById("status")

// --- Audio setup ---

async function setupAudio() {
    await Tone.start()

    if (tonePlayer) {
        tonePlayer.stop()
        tonePlayer.dispose()
        pitchShift.dispose()
        eq.dispose()
        reverb.dispose()
        distortion.dispose()
        toneAnalyser.dispose()
        cancelAnimationFrame(animFrame)
    }

    tonePlayer = new Tone.Player("/downloadable_file")
    pitchShift = new Tone.PitchShift(0)
    eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 })
    reverb = new Tone.Reverb({ decay: 2.5, wet: 0 })
    distortion = new Tone.Distortion({ distortion: 0, wet: 0 })
    toneAnalyser = new Tone.Analyser("fft", 256)

    tonePlayer.connect(pitchShift)
    pitchShift.connect(eq)
    eq.connect(reverb)
    reverb.connect(distortion)
    distortion.connect(toneAnalyser)
    distortion.toDestination()

    await tonePlayer.load("/downloadable_file")
    audioDuration = tonePlayer.buffer.duration

    // Reset sliders
    currentSpeed = 1
    document.getElementById("speed-slider").value = 1
    document.getElementById("speed-label").textContent = "1.00x"
    document.getElementById("pitch-slider").value = 0
    document.getElementById("pitch-label").textContent = "0 st"
    document.getElementById("bass-slider").value = 0
    document.getElementById("bass-label").textContent = "0 dB"
    document.getElementById("reverb-slider").value = 0
    document.getElementById("reverb-label").textContent = "0%"
    document.getElementById("distortion-slider").value = 0
    document.getElementById("distortion-label").textContent = "0%"
    document.getElementById("seek-bar").value = 0
    document.getElementById("time-label").textContent = "0:00"

    startOffset = 0
    startTime = Tone.now()
    isPlaying = true

    tonePlayer.start(Tone.now(), 0)
    document.getElementById("play-pause").textContent = "Pause"
    document.getElementById("player-section").classList.remove("hidden")

    drawVisualizer()
    requestAnimationFrame(updateSeekBar)
}

// --- Visualizer ---

function drawVisualizer() {
    const canvas = document.getElementById("visualizer")
    const ctx = canvas.getContext("2d")
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    function draw() {
        animFrame = requestAnimationFrame(draw)
        const data = toneAnalyser.getValue()

        ctx.fillStyle = "#1a1a1a"
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const barWidth = (canvas.width / data.length) * 2.5
        let x = 0
        for (let i = 0; i < data.length; i++) {
            const normalized = Math.max(0, (data[i] + 100) / 100)
            const barHeight = normalized * canvas.height
            const brightness = Math.floor(130 + normalized * 125)
            ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)
            x += barWidth + 1
        }
    }

    draw()
}

// --- Seek bar time tracking ---

function getCurrentTime() {
    if (!isPlaying) return startOffset
    return startOffset + (Tone.now() - startTime) * currentSpeed
}

function updateSeekBar() {
    if (audioDuration > 0) {
        const current = Math.min(getCurrentTime(), audioDuration)
        const seekBar = document.getElementById("seek-bar")
        seekBar.value = (current / audioDuration) * 100

        const mins = Math.floor(current / 60)
        const secs = Math.floor(current % 60).toString().padStart(2, "0")
        document.getElementById("time-label").textContent = `${mins}:${secs}`
    }
    requestAnimationFrame(updateSeekBar)
}

// --- Form submit ---

form.addEventListener("submit", function(event) {
    event.preventDefault()
    const userText = document.getElementById("submit").value.trim()
    if (!userText) return

    loadBtn.disabled = true
    statusEl.textContent = "Downloading..."

    fetch("/give_link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: userText })
    })
    .then(response => response.json())
    .then(data => {
        loadBtn.disabled = false
        if (data.status === "ok") {
            statusEl.textContent = "Loading audio..."
            setupAudio().then(() => { statusEl.textContent = "" })
        } else {
            statusEl.textContent = "Error: " + (data.error || "something went wrong")
        }
    })
    .catch(() => {
        loadBtn.disabled = false
        statusEl.textContent = "Error: could not reach server"
    })
})

// --- Play/pause ---

document.getElementById("play-pause").addEventListener("click", function() {
    if (!tonePlayer) return

    if (isPlaying) {
        startOffset = getCurrentTime()
        tonePlayer.stop()
        isPlaying = false
        this.textContent = "Play"
    } else {
        startTime = Tone.now()
        tonePlayer.start(Tone.now(), startOffset)
        isPlaying = true
        this.textContent = "Pause"
    }
})

// --- Seek bar scrub ---

document.getElementById("seek-bar").addEventListener("input", function() {
    if (!tonePlayer) return
    const seekTo = (this.value / 100) * audioDuration
    startOffset = seekTo
    if (isPlaying) {
        tonePlayer.stop()
        startTime = Tone.now()
        tonePlayer.start(Tone.now(), startOffset)
    }
})

// --- Speed slider ---

document.getElementById("speed-slider").addEventListener("input", function() {
    const speed = parseFloat(this.value)
    currentSpeed = speed
    document.getElementById("speed-label").textContent = speed.toFixed(2) + "x"
    if (tonePlayer) {
        startOffset = getCurrentTime()
        startTime = Tone.now()
        tonePlayer.playbackRate = speed
    }
})

// --- Pitch slider ---

document.getElementById("pitch-slider").addEventListener("input", function() {
    const semitones = parseInt(this.value)
    document.getElementById("pitch-label").textContent = (semitones >= 0 ? "+" : "") + semitones + " st"
    if (pitchShift) pitchShift.pitch = semitones
})

// --- Bass boost slider ---

document.getElementById("bass-slider").addEventListener("input", function() {
    const db = parseInt(this.value)
    document.getElementById("bass-label").textContent = db + " dB"
    if (eq) eq.low.value = db
})

// --- Reverb slider ---

document.getElementById("reverb-slider").addEventListener("input", function() {
    const wet = parseFloat(this.value)
    document.getElementById("reverb-label").textContent = Math.round(wet * 100) + "%"
    if (reverb) reverb.wet.value = wet
})

// --- Progress bar helpers ---

function showProgress(label) {
    document.getElementById("progress-wrap").classList.remove("hidden")
    document.getElementById("progress-label").textContent = label
    setProgress(0)
}

function setProgress(pct) {
    document.getElementById("progress-bar").style.width = pct + "%"
    document.getElementById("progress-pct").textContent = pct + "%"
}

function hideProgress() {
    document.getElementById("progress-wrap").classList.add("hidden")
}

// --- Download rendered audio ---

function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const numSamples = buffer.length
    const byteLength = 44 + numSamples * numChannels * 2
    const arrayBuffer = new ArrayBuffer(byteLength)
    const view = new DataView(arrayBuffer)

    function writeStr(offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }
    writeStr(0, "RIFF")
    view.setUint32(4, byteLength - 8, true)
    writeStr(8, "WAVE")
    writeStr(12, "fmt ")
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * 2, true)
    view.setUint16(32, numChannels * 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, "data")
    view.setUint32(40, numSamples * numChannels * 2, true)

    let offset = 44
    for (let i = 0; i < numSamples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
            view.setInt16(offset, sample * 0x7fff, true)
            offset += 2
        }
    }
    return arrayBuffer
}

document.getElementById("download-btn").addEventListener("click", async function() {
    if (!tonePlayer) return
    this.textContent = "Rendering..."
    this.disabled = true

    const renderDuration = audioDuration / currentSpeed
    showProgress("Rendering audio...")

    // Estimate progress — offline renders ~4x faster than real-time
    const estimatedMs = (renderDuration / 4) * 1000
    const startTime_ = Date.now()
    const progressTimer = setInterval(() => {
        const pct = Math.min(95, Math.round(((Date.now() - startTime_) / estimatedMs) * 100))
        setProgress(pct)
    }, 100)

    const renderedBuffer = await Tone.Offline(async ({ transport }) => {
        const offlinePlayer = new Tone.Player(tonePlayer.buffer)
        const offlinePitch = new Tone.PitchShift(pitchShift.pitch)
        const offlineEq = new Tone.EQ3({ low: eq.low.value, mid: eq.mid.value, high: eq.high.value })
        const offlineReverb = new Tone.Reverb({ decay: 2.5, wet: reverb.wet.value })
        const offlineDistortion = new Tone.Distortion({ distortion: distortion.distortion, wet: distortion.wet.value })

        offlinePlayer.playbackRate = currentSpeed
        offlinePlayer.connect(offlinePitch)
        offlinePitch.connect(offlineEq)
        offlineEq.connect(offlineReverb)
        offlineReverb.connect(offlineDistortion)
        offlineDistortion.toDestination()

        offlinePlayer.start(0)
        transport.start()
    }, renderDuration)

    clearInterval(progressTimer)
    setProgress(100)

    const wav = audioBufferToWav(renderedBuffer)
    const blob = new Blob([wav], { type: "audio/wav" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "output.wav"
    a.click()
    URL.revokeObjectURL(url)

    hideProgress()
    this.textContent = "Download WAV"
    this.disabled = false
})

// --- Visual upload ---

let visualFile = null

document.getElementById("visual-input").addEventListener("change", function() {
    if (this.files[0]) setVisual(this.files[0])
})

const visualDrop = document.getElementById("visual-drop")
visualDrop.addEventListener("dragover", e => e.preventDefault())
visualDrop.addEventListener("drop", function(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith("image/")) setVisual(file)
})

function setVisual(file) {
    visualFile = file
    const preview = document.getElementById("visual-preview")
    preview.src = URL.createObjectURL(file)
    preview.classList.remove("hidden")
    document.getElementById("visual-hint").classList.add("hidden")
    document.getElementById("visual-clear").classList.remove("hidden")
}

document.getElementById("visual-clear").addEventListener("click", function() {
    visualFile = null
    const preview = document.getElementById("visual-preview")
    preview.src = ""
    preview.classList.add("hidden")
    document.getElementById("visual-hint").classList.remove("hidden")
    this.classList.add("hidden")
})

// --- Export MP4 ---

document.getElementById("export-video-btn").addEventListener("click", async function() {
    if (!tonePlayer) return
    this.textContent = "Rendering..."
    this.disabled = true

    const renderDuration = audioDuration / currentSpeed
    showProgress("Rendering audio...")

    const estimatedMs = (renderDuration / 4) * 1000
    const startTime_ = Date.now()
    const progressTimer = setInterval(() => {
        const pct = Math.min(45, Math.round(((Date.now() - startTime_) / estimatedMs) * 50))
        setProgress(pct)
    }, 100)

    const renderedBuffer = await Tone.Offline(async ({ transport }) => {
        const offlinePlayer = new Tone.Player(tonePlayer.buffer)
        const offlinePitch = new Tone.PitchShift(pitchShift.pitch)
        const offlineEq = new Tone.EQ3({ low: eq.low.value, mid: eq.mid.value, high: eq.high.value })
        const offlineReverb = new Tone.Reverb({ decay: 2.5, wet: reverb.wet.value })
        const offlineDistortion = new Tone.Distortion({ distortion: distortion.distortion, wet: distortion.wet.value })
        offlinePlayer.playbackRate = currentSpeed
        offlinePlayer.connect(offlinePitch)
        offlinePitch.connect(offlineEq)
        offlineEq.connect(offlineReverb)
        offlineReverb.connect(offlineDistortion)
        offlineDistortion.toDestination()
        offlinePlayer.start(0)
        transport.start()
    }, renderDuration)

    clearInterval(progressTimer)
    setProgress(50)

    const wav = audioBufferToWav(renderedBuffer)
    const formData = new FormData()
    formData.append("audio", new Blob([wav], { type: "audio/wav" }), "audio.wav")
    formData.append("duration", renderDuration.toString())
    if (visualFile) formData.append("visual", visualFile, visualFile.name)

    document.getElementById("progress-label").textContent = "Encoding video..."

    const response = await fetch("/export_video", { method: "POST", body: formData })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split("\n").filter(l => l.startsWith("data:"))
        for (const line of lines) {
            const val = line.replace("data:", "").trim()
            if (val === "done") {
                setProgress(100)
            } else {
                const ffPct = parseInt(val)
                if (!isNaN(ffPct)) setProgress(50 + Math.round(ffPct / 2))
            }
        }
    }

    const fileResp = await fetch("/get_video")
    if (fileResp.ok) {
        const mp4Blob = await fileResp.blob()
        const url = URL.createObjectURL(mp4Blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "output.mp4"
        a.click()
        URL.revokeObjectURL(url)
    } else {
        statusEl.textContent = "Export failed"
    }

    hideProgress()
    this.textContent = "Export MP4"
    this.disabled = false
})

// --- Distortion slider ---

document.getElementById("distortion-slider").addEventListener("input", function() {
    const amount = parseFloat(this.value)
    document.getElementById("distortion-label").textContent = Math.round(amount * 100) + "%"
    if (distortion) {
        distortion.distortion = amount
        distortion.wet.value = amount > 0 ? 1 : 0
    }
})
