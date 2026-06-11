const audioUpload = document.getElementById('audio-upload');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const judgmentEl = document.getElementById('judgment');

let audioContext;
let audioBuffer;
let audioSource;
let isPlaying = false;
let startTime = 0;

// Game State
let notes = []; // { time: float, lane: int (0-3), hit: boolean, missed: boolean }
let score = 0;
let combo = 0;

// Config
const scrollSpeed = 500; // pixels per second
const receptorY = 100;
const laneWidth = canvas.width / 4;
const noteSize = 50;
const hitWindow = 0.15; // seconds
const colors = ['#c24b99', '#00ffff', '#12fa05', '#f9393f']; // Left, Down, Up, Right

audioUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        audioContext.decodeAudioData(arrayBuffer, function(buffer) {
            audioBuffer = buffer;
            generateBeatmap(buffer);
            startGame();
        }, function(e) {
            console.error("Error decoding audio data", e);
            alert("Error decoding audio file.");
        });
    };
    reader.readAsArrayBuffer(file);
});

function generateBeatmap(buffer) {
    notes = [];
    const channelData = buffer.getChannelData(0); // Use left channel for simplicity
    const sampleRate = buffer.sampleRate;

    // Simple onset detection (energy based)
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
    let maxEnergy = 0;

    const energies = [];
    for (let i = 0; i < channelData.length; i += windowSize) {
        let energy = 0;
        for (let j = 0; j < windowSize && (i + j) < channelData.length; j++) {
            energy += channelData[i + j] * channelData[i + j];
        }
        energies.push(energy);
        if (energy > maxEnergy) maxEnergy = energy;
    }

    // Dynamic thresholding
    const threshold = maxEnergy * 0.4; // 40% of max energy

    let lastBeatTime = 0;
    const minTimeBetweenBeats = 0.2; // 200ms

    for (let i = 0; i < energies.length; i++) {
        if (energies[i] > threshold) {
            const time = (i * windowSize) / sampleRate;
            if (time - lastBeatTime > minTimeBetweenBeats) {
                notes.push({
                    time: time,
                    lane: Math.floor(Math.random() * 4), // 0: Left, 1: Down, 2: Up, 3: Right
                    hit: false,
                    missed: false
                });
                lastBeatTime = time;
            }
        }
    }
    console.log("Generated " + notes.length + " notes.");
}

function startGame() {
    if (audioSource) {
        audioSource.stop();
    }

    score = 0;
    combo = 0;
    updateStats();
    judgmentEl.innerText = "";

    // Reset notes
    notes.forEach(n => { n.hit = false; n.missed = false; });

    audioSource = audioContext.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioContext.destination);

    startTime = audioContext.currentTime;
    audioSource.start(0);
    isPlaying = true;

    requestAnimationFrame(gameLoop);
}

function updateStats() {
    scoreEl.innerText = score;
    comboEl.innerText = combo;
}

function drawReceptors() {
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = colors[i];
        ctx.beginPath();
        ctx.rect(i * laneWidth + (laneWidth - noteSize) / 2, receptorY, noteSize, noteSize);
        ctx.stroke();
    }
}

function gameLoop() {
    if (!isPlaying) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawReceptors();

    const currentTime = audioContext.currentTime - startTime;

    // Draw notes
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.hit) continue;

        const timeDiff = note.time - currentTime;
        const y = receptorY + timeDiff * scrollSpeed;

        // If note goes way past the receptor and wasn't hit
        if (timeDiff < -hitWindow && !note.missed) {
            note.missed = true;
            combo = 0;
            updateStats();
            showJudgment("MISS", "#ff0000");
        }

        // Only draw if on screen
        if (y > -noteSize && y < canvas.height && !note.missed) {
            ctx.fillStyle = colors[note.lane];
            ctx.fillRect(note.lane * laneWidth + (laneWidth - noteSize) / 2, y, noteSize, noteSize);
        }
    }

    // Check if song finished
    if (currentTime > audioBuffer.duration) {
        isPlaying = false;
        showJudgment("FINISH", "#ffffff");
        return;
    }

    requestAnimationFrame(gameLoop);
}

function showJudgment(text, color) {
    judgmentEl.innerText = text;
    judgmentEl.style.color = color;
}

window.addEventListener('keydown', function(e) {
    if (!isPlaying) return;

    let lane = -1;
    switch(e.code) {
        case 'ArrowLeft': case 'KeyA': lane = 0; break;
        case 'ArrowDown': case 'KeyS': lane = 1; break;
        case 'ArrowUp': case 'KeyW': lane = 2; break;
        case 'ArrowRight': case 'KeyD': lane = 3; break;
    }

    if (lane !== -1) {
        handleHit(lane);
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
            if (diff < minDiff && diff <= hitWindow) {
                minDiff = diff;
                closestNote = note;
            }
        }
    }

    if (closestNote) {
        closestNote.hit = true;
        combo++;

        let judgment = "";
        let color = "";
        let points = 0;

        if (minDiff < 0.05) {
            judgment = "SICK!";
            color = "#00ffff";
            points = 350;
        } else if (minDiff < 0.1) {
            judgment = "GOOD";
            color = "#00ff00";
            points = 200;
        } else {
            judgment = "BAD";
            color = "#ffaa00";
            points = 50;
            combo = 0; // reset combo on bad? typical FNF doesn't always, but let's do it for difficulty
        }

        score += points;
        updateStats();
        showJudgment(judgment, color);
    } else {
        // Ghost tap penalty? Or just ignore.
    }
}
