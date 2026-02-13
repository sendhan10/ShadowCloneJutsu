const video = document.getElementById("cameraInput");
const canvas = document.getElementById("effectCanvas");
const ctx = canvas.getContext("2d");
const statusPill = document.getElementById("statusPill");
const cloneCountControl = document.getElementById("cloneCount");
const cloneCountLabel = document.getElementById("cloneCountLabel");

let streamReady = false;
let latestResults = null;
let clonesActiveUntil = 0;
let smokeActiveUntil = 0;
let smokeParticles = [];
let previousGesture = false;
let cloneCount = Number(cloneCountControl.value);

cloneCountControl.addEventListener("input", () => {
  cloneCount = Number(cloneCountControl.value);
  cloneCountLabel.textContent = String(cloneCount);
});

function setStatus(text) {
  statusPill.textContent = text;
}

function resizeCanvasToVideo() {
  if (!video.videoWidth || !video.videoHeight) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFingerStraight(landmarks, mcpIndex, pipIndex, dipIndex, tipIndex) {
  const mcp = landmarks[mcpIndex];
  const pip = landmarks[pipIndex];
  const dip = landmarks[dipIndex];
  const tip = landmarks[tipIndex];
  const baseToTip = distance(mcp, tip);
  const jointPath = distance(mcp, pip) + distance(pip, dip) + distance(dip, tip);
  return baseToTip / jointPath > 0.88;
}

function isFingerCurled(landmarks, mcpIndex, tipIndex) {
  const mcp = landmarks[mcpIndex];
  const tip = landmarks[tipIndex];
  return distance(mcp, tip) < 0.09;
}

function classifyHandSign(landmarks) {
  const indexStraight = isFingerStraight(landmarks, 5, 6, 7, 8);
  const middleCurled = isFingerCurled(landmarks, 9, 12);
  const ringCurled = isFingerCurled(landmarks, 13, 16);
  const pinkyCurled = isFingerCurled(landmarks, 17, 20);
  return indexStraight && middleCurled && ringCurled && pinkyCurled;
}

function detectShadowCloneSign(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length < 2) return false;

  const [left, right] = results.multiHandLandmarks;
  const leftWrist = left[0];
  const rightWrist = right[0];

  const wristsClose = distance(leftWrist, rightWrist) < 0.15;
  const palmsCentered = Math.abs(midpoint(leftWrist, rightWrist).x - 0.5) < 0.28;

  return wristsClose && palmsCentered && classifyHandSign(left) && classifyHandSign(right);
}

function spawnSmoke() {
  smokeParticles = [];
  const centerX = canvas.width * 0.5;
  const centerY = canvas.height * 0.55;

  for (let i = 0; i < 120; i += 1) {
    smokeParticles.push({
      x: centerX + (Math.random() - 0.5) * 120,
      y: centerY + (Math.random() - 0.5) * 80,
      vx: (Math.random() - 0.5) * 2.4,
      vy: -Math.random() * 1.8 - 0.25,
      radius: Math.random() * 18 + 12,
      alpha: 0.6 + Math.random() * 0.35
    });
  }
}

function drawBaseFrame() {
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawCloneFrames(now) {
  const t = now / 1000;
  const spread = Math.min(cloneCount, 6);

  for (let i = 0; i < spread; i += 1) {
    const slot = i - (spread - 1) / 2;
    const sway = Math.sin(t * 2 + i) * 15;
    const offsetX = slot * 70 + sway;
    const alpha = 0.16 + i * 0.05;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(offsetX, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

function drawSmoke(now) {
  if (now > smokeActiveUntil || smokeParticles.length === 0) return;

  const wind = Math.sin(now / 280) * 0.25;
  for (const particle of smokeParticles) {
    particle.x += particle.vx + wind;
    particle.y += particle.vy;
    particle.radius *= 1.004;
    particle.alpha *= 0.987;

    const gradient = ctx.createRadialGradient(
      particle.x,
      particle.y,
      particle.radius * 0.2,
      particle.x,
      particle.y,
      particle.radius
    );

    gradient.addColorStop(0, `rgba(235, 235, 245, ${particle.alpha})`);
    gradient.addColorStop(1, "rgba(140, 140, 150, 0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  smokeParticles = smokeParticles.filter((p) => p.alpha > 0.03 && p.y > -60);
}

function render(now = performance.now()) {
  requestAnimationFrame(render);
  if (!streamReady) return;

  resizeCanvasToVideo();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBaseFrame();

  if (now < clonesActiveUntil) {
    drawCloneFrames(now);
    setStatus("Shadow clones active");
  }

  drawSmoke(now);

  if (latestResults?.multiHandLandmarks?.length) {
    for (const landmarks of latestResults.multiHandLandmarks) {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "#80bfff", lineWidth: 3 });
      drawLandmarks(ctx, landmarks, { color: "#e8f3ff", lineWidth: 1, radius: 2 });
    }
  }

  if (now > clonesActiveUntil && now > smokeActiveUntil) {
    setStatus("Show the hand sign to trigger clones");
  }
}

async function setup() {
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6
  });

  hands.onResults((results) => {
    latestResults = results;
    const signDetected = detectShadowCloneSign(results);

    if (signDetected && !previousGesture) {
      const now = performance.now();
      smokeActiveUntil = now + 900;
      clonesActiveUntil = now + 5000;
      spawnSmoke();
    }

    previousGesture = signDetected;
  });

  try {
    const camera = new Camera(video, {
      onFrame: async () => {
        if (!video.videoWidth) return;
        await hands.send({ image: video });
      },
      width: 1280,
      height: 720
    });

    await camera.start();
    streamReady = true;
    setStatus("Show the hand sign to trigger clones");
    render();
  } catch (error) {
    setStatus("Camera access failed. Allow camera and refresh.");
    console.error(error);
  }
}

setup();
