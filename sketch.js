let video;
let handPose;
let predictions = [];
let isModelReady = false;

// --- ESTADOS DEL SISTEMA ---
let appState = "INTRO"; 

// --- CONFIGURACIÓN ASCII ---
let density = 14; 
let asciiChars = "@#W$9876543210?!abc;:+=-,._ ";
let baseHue = 0;
let jitterAmount = 0; 
let hueNoise = 0;     

// --- LÓGICA DE GESTO Y PROGRESO ---
let holdProgress = 0;
const OK_HOLD_THRESHOLD = 1000; 
const DRAIN_SPEED = 0.5;

// --- SISTEMA DE CAPTURA ---
let countdownActive = false;
let countdownStart = null;
let countdown = 0;
let photoTaken = false;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  colorMode(HSB, 360, 100, 100, 100);
  textFont("monospace");

  let constraints = { video: { facingMode: "user" }, audio: false };
  video = createCapture(constraints);
  video.size(640, 480);
  video.hide();

  const options = { maxHands: 2, flipped: false, runtime: "mediapipe" };
  
  handPose = ml5.handPose(options, () => {
    isModelReady = true;
    handPose.detectStart(video, (results) => {
      predictions = results;
    });

    setTimeout(() => { 
      appState = "TUTORIAL"; 
      const intro = document.getElementById('intro-screen');
      if (intro) intro.classList.add('hidden');
      const tut = document.getElementById('tutorial-screen');
      if (tut) tut.classList.remove('hidden');
    }, 4000); 
  });
}

function draw() {
  background(0);

  if (!isModelReady || video.width === 0) return;

  // 1. Efecto ASCII de fondo
  renderAsciiWithChaos();

  // 2. Indicadores en las manos (Se ocultan automáticamente al disparar)
  drawHandIndicators();

  // 3. Control de flujo
  if (appState === "TUTORIAL") {
    handleGestureLogic(true); 
    drawTutorialProgressUI();
  } 
  else if (appState === "INTERACTION") {
    handleGestureLogic(false); 
    updatePhotoSystem();
    drawInteractionUI();
    
    // Solo mostramos el recordatorio si no hay cuenta atrás activa
    if (!countdownActive) {
      drawBottomReminder();
    }
  }
}

/**
 * Dibuja círculos y etiquetas sobre las manos.
 * Se desactiva si hay una foto en proceso (countdownActive).
 */
function drawHandIndicators() {
  // SALIDA DE SEGURIDAD: Si estamos tomando la foto, no dibujamos nada
  if (countdownActive || appState === "INTRO") return;

  let vW = video.width;
  let vH = video.height;
  let screenAspect = width / height;
  let videoAspect = vW / vH;
  let sx, sy, sw, sh;

  if (screenAspect > videoAspect) {
    sw = vW; sh = vW / screenAspect;
    sx = 0; sy = (vH - sh) / 2;
  } else {
    sh = vH; sw = vH * screenAspect;
    sx = (vW - sw) / 2; sy = 0;
  }

  for (let hand of predictions) {
    let indexFinger = hand.keypoints[8];
    let px = map(indexFinger.x, sx + sw, sx, 0, width);
    let py = map(indexFinger.y, sy, sy + sh, 0, height);
    let handSide = hand.label || hand.handedness;

    push();
    fill(0, 0, 100);
    noStroke();
    ellipse(px, py, 12, 12); // Círculo guía
    
    textAlign(CENTER);
    textSize(14);
    let label = (handSide === "Left") ? "OK" : "DENSIDAD Y COLOR";
    
    // Texto con sombra
    fill(0, 0, 0, 150);
    text(label, px + 1, py - 19); 
    fill(0, 0, 100);
    text(label, px, py - 20);
    pop();
  }
}

function drawBottomReminder() {
  push();
  fill(0, 0, 0, 180);
  noStroke();
  rect(width/2 - 150, height - 40, 300, 30, 15);
  fill(0, 0, 100);
  textAlign(CENTER, CENTER);
  textSize(11);
  text("IZQ: ESTILO | DER: GESTO OK (FOTO)", width/2, height - 25);
  pop();
}

function renderAsciiWithChaos() {
  video.loadPixels();
  let vW = video.width;
  let vH = video.height;
  textSize(density);
  textAlign(LEFT, TOP);
  noStroke();

  let screenAspect = width / height;
  let videoAspect = vW / vH;
  let sx, sy, sw, sh;

  if (screenAspect > videoAspect) {
    sw = vW; sh = vW / screenAspect;
    sx = 0; sy = (vH - sh) / 2;
  } else {
    sh = vH; sw = vH * screenAspect;
    sx = (vW - sw) / 2; sy = 0;
  }

  let cols = ceil(width / density);
  let rows = ceil(height / density);
  let offsetX = (width - (cols * density)) / 2;
  let offsetY = (height - (rows * density)) / 2;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let vx = floor(map(x, 0, cols, sx + sw, sx)); 
      let vy = floor(map(y, 0, rows, sy, sy + sh));
      let i = (vy * vW + vx) * 4;
      
      if (video.pixels[i] !== undefined) {
        let bri = (video.pixels[i] + video.pixels[i + 1] + video.pixels[i + 2]) / 3;
        let charIdx = floor(map(bri, 0, 255, 0, asciiChars.length - 1));
        fill(baseHue, 80, bri);
        let rX = random(-jitterAmount, jitterAmount);
        let rY = random(-jitterAmount, jitterAmount);
        text(asciiChars.charAt(asciiChars.length - 1 - charIdx), (x * density) + offsetX + rX, (y * density) + offsetY + rY);
      }
    }
  }
}

function handleGestureLogic(isTutorialMode) {
  let okDetected = false;

  for (let hand of predictions) {
    let index = hand.keypoints[8];
    let thumb = hand.keypoints[4];
    let handSide = hand.label || hand.handedness;

    if (handSide === "Left") {
      let d = dist(index.x, index.y, thumb.x, thumb.y);
      if (d < 50) okDetected = true;
    } 
    
    if (!isTutorialMode && handSide === "Right" && !countdownActive) {
      baseHue = map(index.y, 0, height, 0, 360);
      let d = dist(index.x, index.y, thumb.x, thumb.y);
      density = constrain(map(d, 30, 200, 12, 60), 12, 60);
      jitterAmount = map(d, 30, 200, 0, 8);
    }
  }

  if (okDetected) {
    holdProgress += deltaTime;
  } else {
    holdProgress -= deltaTime * DRAIN_SPEED;
  }
  
  holdProgress = constrain(holdProgress, 0, OK_HOLD_THRESHOLD);

  if (holdProgress >= OK_HOLD_THRESHOLD) {
    if (isTutorialMode) {
      appState = "INTERACTION";
      const tut = document.getElementById('tutorial-screen');
      if (tut) tut.classList.add('hidden');
    } else if (!countdownActive) {
      startCountdown();
    }
    holdProgress = 0;
  }
}

function drawTutorialProgressUI() {
  if (holdProgress > 0) {
    push();
    translate(width / 2, height * 0.73); 
    let ang = map(holdProgress, 0, OK_HOLD_THRESHOLD, 0, TWO_PI);
    noFill(); stroke(0, 0, 100, 40); strokeWeight(6);
    ellipse(0, 0, 140, 140);
    stroke(0, 0, 100); strokeWeight(10);
    arc(0, 0, 140, 140, -HALF_PI, ang - HALF_PI);
    pop();
  }
}

function drawInteractionUI() {
  if (holdProgress > 0 && !countdownActive) {
    push();
    translate(width / 2, height / 2);
    let ang = map(holdProgress, 0, OK_HOLD_THRESHOLD, 0, TWO_PI);
    noFill(); stroke(0, 0, 100, 30); strokeWeight(8);
    ellipse(0, 0, 160, 160);
    stroke(0, 0, 100); strokeWeight(12);
    arc(0, 0, 160, 160, -HALF_PI, ang - HALF_PI);
    pop();
  }
  
  if (countdownActive && !photoTaken) {
    push();
    fill(0, 0, 100); textAlign(CENTER, CENTER);
    stroke(0); strokeWeight(10); textSize(width/4);
    text(countdown, width/2, height/2);
    pop();
  }
}

function startCountdown() {
  countdownActive = true;
  countdownStart = millis();
  photoTaken = false;
}

function updatePhotoSystem() {
  if (countdownActive && !photoTaken) {
    let elapsed = millis() - countdownStart;
    countdown = ceil((3000 - elapsed) / 1000);
    
    if (elapsed >= 3000) {
      saveCanvas("asciism_capture", "png");
      photoTaken = true;
      push(); background(0, 0, 100); pop(); 
      setTimeout(() => {
        countdownActive = false;
        photoTaken = false;
      }, 3000);
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}