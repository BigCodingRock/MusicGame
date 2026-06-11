const audioUpload = document.getElementById('audio-upload');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const accuracyEl = document.getElementById('accuracy');
const judgmentEl = document.getElementById('judgment');
const bgVideo = document.getElementById('bg-video');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReplay = document.getElementById('btn-replay');
const loadingText = document.getElementById('loading-text');

// Settings DOM
const difficultyInput = document.getElementById('setting-difficulty');
const speedInput = document.getElementById('setting-speed');
const sizeInput = document.getElementById('setting-size');
const speedVal = document.getElementById('speed-val');
const sizeVal = document.getElementById('size-val');

// Progress DOM
const timePassedEl = document.getElementById('time-passed');
const timeTotalEl = document.getElementById('time-total');
const progressFill = document.getElementById('progress-fill');

// Stats DOM
const counts = {
    sick: document.getElementById('count-sick'),
    good: document.getElementById('count-good'),
    ok: document.getElementById('count-ok'),
    bad: document.getElementById('count-bad'),
    miss: document.getElementById('count-miss')
};

let audioContext;
let audioBuffer;
let audioSource;
let isPlaying = false;
let isPaused = false;
let startTime = 0;
let pauseTimeOffset = 0;
let lastPauseTime = 0;

// Game State
let notes = [];
let score = 0;
let combo = 0;
let stats = { sick: 0, good: 0, ok: 0, bad: 0, miss: 0 };
let totalNotesHitOrMissed = 0;
let totalPossibleScore = 0;
let currentActualScore = 0; // used for accuracy

// Config & Settings
let scrollSpeed = parseInt(speedInput.value);
let noteSize = parseInt(sizeInput.value);
let receptorY = 100;
let laneWidth = canvas.width / 4;

const colors = ['#c24b99', '#00ffff', '#12fa05', '#f9393f'];

// Hit windows (in seconds)
const windows = {
    sick: 0.045,
    good: 0.090,
    ok: 0.135,
    bad: 0.160
};
const maxHitWindow = windows.bad;

// Keybinds: array of arrays, each lane has 2 possible keys
let keybinds = [
    ['ArrowLeft', 'A'],
    ['ArrowDown', 'S'],
    ['ArrowUp', 'W'],
    ['ArrowRight', 'D']
];

// Load settings from local storage
function loadSettings() {
    const saved = localStorage.getItem('rhythmSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.difficulty) difficultyInput.value = parsed.difficulty;
            if (parsed.scrollSpeed) {
                speedInput.value = parsed.scrollSpeed;
                scrollSpeed = parsed.scrollSpeed;
                speedVal.innerText = scrollSpeed;
            }
            if (parsed.noteSize) {
                sizeInput.value = parsed.noteSize;
                noteSize = parsed.noteSize;
                sizeVal.innerText = noteSize;
            }
            if (parsed.keybinds) {
                keybinds = parsed.keybinds;
                document.getElementById('key-left-1').value = keybinds[0][0];
                document.getElementById('key-left-2').value = keybinds[0][1];
                document.getElementById('key-down-1').value = keybinds[1][0];
                document.getElementById('key-down-2').value = keybinds[1][1];
                document.getElementById('key-up-1').value = keybinds[2][0];
                document.getElementById('key-up-2').value = keybinds[2][1];
                document.getElementById('key-right-1').value = keybinds[3][0];
                document.getElementById('key-right-2').value = keybinds[3][1];
            }
        } catch (e) { console.error("Error loading settings"); }
    } else {
        // Initial defaults reading from DOM if no local storage
        keybinds = [
            [document.getElementById('key-left-1').value, document.getElementById('key-left-2').value],
            [document.getElementById('key-down-1').value, document.getElementById('key-down-2').value],
            [document.getElementById('key-up-1').value, document.getElementById('key-up-2').value],
            [document.getElementById('key-right-1').value, document.getElementById('key-right-2').value]
        ];
    }
}
loadSettings();

function saveSettings() {
    const settings = {
        difficulty: difficultyInput.value,
        scrollSpeed: scrollSpeed,
        noteSize: noteSize,
        keybinds: keybinds
    };
    localStorage.setItem('rhythmSettings', JSON.stringify(settings));
}

// Key press visual states and timings
let keyStates = [false, false, false, false];
let receptorGlow = [0, 0, 0, 0];

// Settings Update Listeners
difficultyInput.addEventListener('change', (e) => {
    saveSettings();
    if (audioBuffer && !isPlaying) {
        generateBeatmap(audioBuffer);
    }
});

speedInput.addEventListener('input', (e) => {
    scrollSpeed = parseInt(e.target.value);
    speedVal.innerText = scrollSpeed;
    saveSettings();
});

sizeInput.addEventListener('input', (e) => {
    noteSize = parseInt(e.target.value);
    sizeVal.innerText = noteSize;
    saveSettings();
});

const updateKeybinds = () => {
    keybinds[0][0] = document.getElementById('key-left-1').value;
    keybinds[0][1] = document.getElementById('key-left-2').value;
    keybinds[1][0] = document.getElementById('key-down-1').value;
    keybinds[1][1] = document.getElementById('key-down-2').value;
    keybinds[2][0] = document.getElementById('key-up-1').value;
    keybinds[2][1] = document.getElementById('key-up-2').value;
    keybinds[3][0] = document.getElementById('key-right-1').value;
    keybinds[3][1] = document.getElementById('key-right-2').value;
    saveSettings();
};

document.querySelectorAll('.setting-group input[type="text"]').forEach(input => {
    input.addEventListener('change', updateKeybinds);
});

audioUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Reset UI
    btnStart.disabled = true;
    btnPause.disabled = true;
    btnReplay.disabled = true;
    loadingText.innerText = "Processing file...";
    bgVideo.src = "";

    // If it's a video file, set it as the background
    if (file.type.startsWith('video/')) {
        bgVideo.src = URL.createObjectURL(file);
    }

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        audioContext.decodeAudioData(arrayBuffer, function(buffer) {
            audioBuffer = buffer;
            generateBeatmap(buffer);

            // Enable start button instead of auto-starting
            loadingText.innerText = "Ready!";
            btnStart.disabled = false;
            btnReplay.disabled = false;
        }, function(e) {
            console.error("Error decoding audio data", e);
            alert("Error decoding audio file.");
            loadingText.innerText = "Error decoding file.";
        });
    };
    reader.readAsArrayBuffer(file);
});

function generateBeatmap(buffer) {
    notes = [];
    const channelData = buffer.getChannelData(0); // Use left channel
    const sampleRate = buffer.sampleRate;

    // Improved onset detection: Spectral flux (positive difference between samples)
    const windowSize = Math.floor(sampleRate * 0.02); // 20ms window

    const energies = [];
    let prevSample = 0;
    for (let i = 0; i < channelData.length; i += windowSize) {
        let flux = 0;
        for (let j = 0; j < windowSize && (i + j) < channelData.length; j++) {
            let currentSample = Math.abs(channelData[i + j]);
            let diff = currentSample - prevSample;
            if (diff > 0) flux += diff;
            prevSample = currentSample;
        }
        energies.push(flux);
    }

    // BPM Estimation via interval analysis
    // Find absolute maximum energy to set a dynamic minimum threshold
    let maxAbsEnergy = 0;
    for (let i = 0; i < energies.length; i++) {
        if (energies[i] > maxAbsEnergy) maxAbsEnergy = energies[i];
    }

    const peakThreshold = maxAbsEnergy * 0.2;
    const rawPeaks = [];

    for (let i = 0; i < energies.length; i++) {
        if (energies[i] > peakThreshold) {
            rawPeaks.push((i * windowSize) / sampleRate);
        }
    }

    // Find the most common interval between peaks
    const intervals = {};
    for (let i = 0; i < rawPeaks.length; i++) {
        for (let j = 1; j < 5 && i + j < rawPeaks.length; j++) {
            let diff = rawPeaks[i + j] - rawPeaks[i];
            if (diff > 0.2 && diff < 1.0) { // between 60 and 300 BPM
                // round to nearest 0.05s
                let rounded = Math.round(diff * 20) / 20;
                if (rounded > 0) {
                    intervals[rounded] = (intervals[rounded] || 0) + 1;
                }
            }
        }
    }

    let bestInterval = 0.5; // Default 120 BPM
    let maxCount = 0;
    for (let interval in intervals) {
        if (intervals[interval] > maxCount) {
            maxCount = intervals[interval];
            bestInterval = parseFloat(interval);
        }
    }

    // We can use fractions of the beat interval for snapping
    const beatSnap = bestInterval / 4; // 16th notes
    console.log("Estimated BPM:", Math.round(60 / bestInterval), "Snap interval:", beatSnap);

    // Adjust logic based on difficulty
    // Using flux means average values are lower and peaks are sharper.
    // We remove the random `chance` drop so that every detected note corresponds to a real beat,
    // preserving rhythm accuracy.
    const diffMap = {
        'easy': { mult: 2.0, localWin: 45 },
        'medium': { mult: 1.5, localWin: 30 },
        'hard': { mult: 1.1, localWin: 15 },
        'wtf': { mult: 0.8, localWin: 8 }
    };

    const diffSetting = difficultyInput.value;
    const config = diffMap[diffSetting] || diffMap['medium'];

    const localWindowSize = config.localWin;
    const multiplier = config.mult;

    // With spectral flux, noise floor can be ignored more aggressively
    const minAbsEnergy = maxAbsEnergy * 0.05;

    // To prevent overlapping notes at the same snap time
    let usedSnaps = new Set();

    for (let i = 0; i < energies.length; i++) {
        let start = Math.max(0, i - Math.floor(localWindowSize / 2));
        let end = Math.min(energies.length, i + Math.floor(localWindowSize / 2));

        let localSum = 0;
        for (let j = start; j < end; j++) {
            localSum += energies[j];
        }
        let localAverage = localSum / (end - start);

        if (energies[i] > localAverage * multiplier && energies[i] > minAbsEnergy) {
            const rawTime = (i * windowSize) / sampleRate;

            // Quantize time to nearest beatSnap
            const snappedTime = Math.round(rawTime / beatSnap) * beatSnap;

            // Add if we haven't already added a note here at this snapped time
            if (!usedSnaps.has(snappedTime)) {
                notes.push({
                    time: snappedTime,
                    lane: Math.floor(Math.random() * 4),
                    hit: false,
                    missed: false
                });
                usedSnaps.add(snappedTime);
            }
        }
    }

    // Ensure notes are strictly sorted by time
    notes.sort((a, b) => a.time - b.time);
    console.log("Generated " + notes.length + " quantized notes.");
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
}

function startGame() {
    if (isPlaying && !isPaused) return; // Already playing

    if (isPaused) {
        // Resume
        isPaused = false;
        audioContext.resume();
        if (bgVideo.src) bgVideo.play();
        btnStart.disabled = true;
        btnPause.disabled = false;
        requestAnimationFrame(gameLoop);
        if (document.activeElement) document.activeElement.blur();
        return;
    }

    if (audioSource) {
        try { audioSource.stop(); } catch(e) {}
    }

    score = 0;
    combo = 0;
    stats = { sick: 0, good: 0, ok: 0, bad: 0, miss: 0 };
    totalNotesHitOrMissed = 0;
    totalPossibleScore = 0;
    currentActualScore = 0;
    pauseTimeOffset = 0;

    timeTotalEl.innerText = formatTime(audioBuffer.duration);

    updateStats();
    judgmentEl.innerText = "";
    judgmentEl.style.opacity = 0;

    // Reset notes
    notes.forEach(n => { n.hit = false; n.missed = false; });

    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);

    startTime = audioContext.currentTime;
    audioSource.start(0);
    isPlaying = true;
    isPaused = false;

    btnStart.disabled = true;
    btnPause.disabled = false;

    if (bgVideo.src) {
        bgVideo.currentTime = 0;
        bgVideo.play();
    }

    // Unfocus active element to ensure keybinds work right away
    if (document.activeElement) document.activeElement.blur();

    requestAnimationFrame(gameLoop);
}

function pauseGame() {
    if (!isPlaying || isPaused) return;

    isPaused = true;
    audioContext.suspend();
    if (bgVideo.src) bgVideo.pause();

    btnStart.disabled = false;
    btnStart.innerText = "Resume";
    btnPause.disabled = true;
}

function replayGame() {
    if (!audioBuffer) return;

    if (isPlaying || isPaused) {
        try { audioSource.stop(); } catch(e) {}
        isPlaying = false;
        isPaused = false;
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    btnStart.innerText = "Start";
    startGame();
}

btnStart.addEventListener('click', startGame);
btnPause.addEventListener('click', pauseGame);
btnReplay.addEventListener('click', replayGame);

function updateStats() {
    scoreEl.innerText = score;
    comboEl.innerText = combo;

    counts.sick.innerText = stats.sick;
    counts.good.innerText = stats.good;
    counts.ok.innerText = stats.ok;
    counts.bad.innerText = stats.bad;
    counts.miss.innerText = stats.miss;

    if (totalNotesHitOrMissed > 0) {
        let acc = (currentActualScore / totalPossibleScore) * 100;
        accuracyEl.innerText = acc.toFixed(2) + "%";
    } else {
        accuracyEl.innerText = "0.00%";
    }
}

// Rotations for Left, Down, Up, Right arrows
const arrowRotations = [Math.PI, Math.PI / 2, -Math.PI / 2, 0];

function drawArrow(x, y, size, rotation, color, fill = true, opacity = 1.0) {
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate(rotation);

    ctx.globalAlpha = opacity;
    ctx.beginPath();

    // Draw an arrow shape
    const half = size / 2;
    const quarter = size / 4;

    ctx.moveTo(half, 0); // Tip (pointing right naturally before rotation)
    ctx.lineTo(0, half); // Bottom corner
    ctx.lineTo(0, quarter); // Inner bottom
    ctx.lineTo(-half, quarter); // Back bottom
    ctx.lineTo(-half, -quarter); // Back top
    ctx.lineTo(0, -quarter); // Inner top
    ctx.lineTo(0, -half); // Top corner
    ctx.closePath();

    ctx.lineWidth = 3;
    if (fill) {
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
    } else {
        ctx.strokeStyle = color;
        ctx.stroke();
    }

    ctx.restore();
}

function drawReceptors() {
    for (let i = 0; i < 4; i++) {
        const x = i * laneWidth + (laneWidth - noteSize) / 2;

        // Update glow effect decay
        if (receptorGlow[i] > 0) {
            receptorGlow[i] -= 0.1;
        }

        // If key is pressed, fill the receptor slightly
        if (keyStates[i] || receptorGlow[i] > 0) {
            drawArrow(x, receptorY, noteSize, arrowRotations[i], colors[i], true, Math.max(0.3, receptorGlow[i]));
        }

        // Draw outline
        drawArrow(x, receptorY, noteSize, arrowRotations[i], colors[i], false, 0.8);
    }
}

function gameLoop() {
    if (!isPlaying || isPaused) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawReceptors();

    // audioContext.currentTime progresses when NOT suspended, so we just use that directly
    const currentTime = audioContext.currentTime - startTime;

    // Draw notes
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.hit) continue;

        const timeDiff = note.time - currentTime;
        const y = receptorY + timeDiff * scrollSpeed;

        // If note goes way past the receptor and wasn't hit
        if (timeDiff < -maxHitWindow && !note.missed) {
            note.missed = true;
            handleMiss();
        }

        // Only draw if on screen
        if (y > -noteSize && y < canvas.height && !note.missed) {
            const x = note.lane * laneWidth + (laneWidth - noteSize) / 2;
            drawArrow(x, y, noteSize, arrowRotations[note.lane], colors[note.lane], true);
        }
    }

    // Update progress bar
    timePassedEl.innerText = formatTime(currentTime);
    let progressPct = (currentTime / audioBuffer.duration) * 100;
    progressFill.style.width = Math.min(100, progressPct) + "%";

    // Check if song finished
    if (currentTime > audioBuffer.duration) {
        isPlaying = false;
        btnStart.innerText = "Start";
        btnStart.disabled = false;
        btnPause.disabled = true;
        showJudgment("FINISH", "#ffffff");
        return;
    }

    requestAnimationFrame(gameLoop);
}

function showJudgment(text, color) {
    judgmentEl.innerText = text;
    judgmentEl.style.color = color;
    judgmentEl.style.opacity = 1;

    // Quick scale bump effect
    judgmentEl.style.transform = "scale(1.2)";
    setTimeout(() => {
        judgmentEl.style.transform = "scale(1)";
    }, 50);

    // Fade out
    clearTimeout(judgmentEl.timeout);
    judgmentEl.timeout = setTimeout(() => {
        judgmentEl.style.opacity = 0;
    }, 1000);
}

function getLaneFromKey(code, key) {
    // Check against keybinds. Match either e.code or e.key (ignoring case)
    for (let i = 0; i < 4; i++) {
        if (keybinds[i][0].toLowerCase() === code.toLowerCase() ||
            keybinds[i][0].toLowerCase() === key.toLowerCase() ||
            keybinds[i][1].toLowerCase() === code.toLowerCase() ||
            keybinds[i][1].toLowerCase() === key.toLowerCase()) {
            return i;
        }
    }
    return -1;
}

window.addEventListener('keydown', function(e) {
    // Ignore input if focused on an input element
    if (document.activeElement.tagName === 'INPUT') return;

    if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
            if (isPaused) {
                startGame();
            } else {
                pauseGame();
            }
        }
        return;
    }

    if (!isPlaying || isPaused) return;

    let lane = getLaneFromKey(e.code, e.key);

    if (lane !== -1 && !keyStates[lane]) {
        keyStates[lane] = true;
        receptorGlow[lane] = 1.0; // Trigger visual effect
        handleHit(lane);
    }
});

window.addEventListener('keyup', function(e) {
    if (document.activeElement.tagName === 'INPUT') return;

    let lane = getLaneFromKey(e.code, e.key);
    if (lane !== -1) {
        keyStates[lane] = false;
    }
});

function handleHit(lane) {
    const currentTime = audioContext.currentTime - startTime;

    // Find the closest note in this lane
    let closestNote = null;
    let minDiff = Infinity;

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.lane === lane && !note.hit && !note.missed) {
            const diff = Math.abs(note.time - currentTime);
            if (diff < minDiff && diff <= maxHitWindow) {
                minDiff = diff;
                closestNote = note;
            }
        }
    }

    if (closestNote) {
        closestNote.hit = true;

        let judgment = "";
        let color = "";
        let points = 0;
        let accuracyVal = 0;

        totalNotesHitOrMissed++;
        totalPossibleScore += 350; // max points per note

        if (minDiff <= windows.sick) {
            judgment = "SICK!";
            color = "#00ffff";
            points = 350;
            accuracyVal = 350;
            stats.sick++;
            combo++;
        } else if (minDiff <= windows.good) {
            judgment = "GOOD";
            color = "#12fa05";
            points = 200;
            accuracyVal = 250;
            stats.good++;
            combo++;
        } else if (minDiff <= windows.ok) {
            judgment = "OK";
            color = "#ffff00";
            points = 100;
            accuracyVal = 100;
            stats.ok++;
            combo = 0;
        } else {
            judgment = "BAD";
            color = "#ffaa00";
            points = 0;
            accuracyVal = 0;
            stats.bad++;
            combo = 0;
        }

        score += points;
        currentActualScore += accuracyVal;

        updateStats();
        showJudgment(judgment, color);
    } else {
        // Ghost tap - user requested no penalty
    }
}

function handleMiss() {
    combo = 0;
    stats.miss++;
    score -= 10;
    totalNotesHitOrMissed++;
    totalPossibleScore += 350; // Add to possible score to reduce accuracy
    updateStats();
    showJudgment("MISS", "#ff0000");
}
