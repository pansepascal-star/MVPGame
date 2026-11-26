const canvas = document.querySelector("#soccer-field");
const context = canvas.getContext("2d");
const playerScoreElement = document.querySelector("#player-score");
const cpuScoreElement = document.querySelector("#cpu-score");
const timeElement = document.querySelector("#match-time");
const statusElement = document.querySelector("#game-status");
const possessionElement = document.querySelector("#possession-state");
const kickoffButton = document.querySelector("#kickoff-button");
const shootButton = document.querySelector("#shoot-button");
const passButton = document.querySelector("#pass-button");
const musicToggle = document.querySelector("#music-toggle");
const soundToggle = document.querySelector("#sound-toggle");
const crowdToggle = document.querySelector("#crowd-toggle");
const field = { left: 42, right: 918, top: 42, bottom: 538, goalTop: 220, goalBottom: 360 };
const keys = new Set();
const player = {
  x: 420, y: 290, radius: 20, speed: 280,
  facingX: 1, facingY: 0, moving: false, tackleCooldown: 0, tackleProgress: 0,
  targetX: 420, targetY: 290,
};
const cpu = {
  x: 540, y: 290, radius: 20, speed: 280,
  facingX: -1, facingY: 0, moving: false, tackleCooldown: 0, tackleProgress: 0,
  shotCooldown: 0, passCooldown: 0, thinkCooldown: 0, targetX: 540, targetY: 290,
};
const playerMate = {
  x: 340, y: 370, radius: 18, speed: 250,
  facingX: 1, facingY: 0, moving: false, targetX: 340, targetY: 370,
};
const cpuMate = {
  x: 620, y: 210, radius: 18, speed: 170,
  facingX: -1, facingY: 0, moving: false, targetX: 620, targetY: 210,
};
const playerDefender = {
  x: 112, y: 290, radius: 20, speed: 110,
  facingX: 1, facingY: 0, moving: false,
};
const cpuDefender = {
  x: 848, y: 290, radius: 20, speed: 110,
  facingX: -1, facingY: 0, moving: false,
};
const ball = { x: 480, y: 290, radius: 10, vx: 0, vy: 0 };

let playerScore = 0;
let cpuScore = 0;
let timeLeft = 60;
let mode = "ready";
let holder = null;
let selectedPlayer = player;
let shotDistanceToGoal = null;
let keeperHolding = null;
let keeperHoldTimer = 0;
let passTarget = null;
let passFrom = null;
let passFromTimer = 0;
let passTargetTimer = 0;
let goalPause = 0;
let ballPickupDelay = 0;
let previousFrame = 0;
let gameTime = 0;
let audioContext = null;
let masterGain = null;
let musicGain = null;
let soundGain = null;
let crowdGain = null;
let musicTimer = null;
let musicStep = 0;
let musicEnabled = true;
let soundEnabled = true;
let crowdEnabled = true;
let crowdSource = null;
let crowdLfo = null;

const musicChords = [
  { bass: 130.81, notes: [261.63, 329.63, 392] },
  { bass: 98, notes: [246.94, 293.66, 392] },
  { bass: 110, notes: [220, 261.63, 329.63] },
  { bass: 87.31, notes: [174.61, 220, 261.63] },
];
const musicMelody = [
  523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46,
  523.25, 659.25, 783.99, 1046.5, 880, 783.99, 698.46, 587.33,
];

function setStatus(message) {
  statusElement.textContent = message;
}

function ensureAudio() {
  const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
  if (!audioContext && AudioContextConstructor) {
    audioContext = new AudioContextConstructor();
    masterGain = audioContext.createGain();
    musicGain = audioContext.createGain();
    soundGain = audioContext.createGain();
    crowdGain = audioContext.createGain();
    masterGain.gain.value = 0.42;
    musicGain.gain.value = 0;
    soundGain.gain.value = 0.75;
    crowdGain.gain.value = 0;
    musicGain.connect(masterGain);
    soundGain.connect(masterGain);
    crowdGain.connect(masterGain);
    masterGain.connect(audioContext.destination);
  }
  if (!audioContext) return false;
  if (audioContext.state === "suspended") {
    audioContext.resume().catch((error) => console.warn("Audio playback could not be resumed.", error));
  }
  return true;
}

function playTone(frequency, start, duration, volume, waveform, output, endFrequency = frequency) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  oscillator.type = waveform;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playNoise(start, duration, volume, output, cutoff = 900) {
  const frameCount = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
  }
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const envelope = audioContext.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.setValueAtTime(cutoff, start);
  envelope.gain.setValueAtTime(volume, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(output);
  source.start(start);
  source.stop(start + duration);
}

function scheduleMusicStep() {
  if (!audioContext || !musicGain || !musicEnabled || mode !== "playing") {
    stopMusic();
    return;
  }
  const step = musicStep % 32;
  const chord = musicChords[Math.floor(step / 8)];
  const start = audioContext.currentTime + 0.025;
  if (step % 8 === 0) {
    chord.notes.forEach((note) => playTone(note, start, 0.9, 0.024, "triangle", musicGain));
  }
  if (step % 4 === 0) {
    playTone(chord.bass / 2, start, 0.32, 0.055, "triangle", musicGain);
    if (step % 8 === 0) playTone(125, start, 0.16, 0.13, "sine", musicGain, 48);
    else playNoise(start, 0.12, 0.045, musicGain, 1500);
  }
  if (step % 2 === 0) {
    playTone(musicMelody[Math.floor(step / 2)], start, 0.2, 0.035, "triangle", musicGain);
  }
  musicStep += 1;
}

function startMusic() {
  if (!musicEnabled || mode !== "playing" || !ensureAudio() || musicTimer !== null) return;
  musicGain.gain.setTargetAtTime(0.65, audioContext.currentTime, 0.08);
  musicStep = 0;
  scheduleMusicStep();
  musicTimer = window.setInterval(scheduleMusicStep, 125);
}

function stopMusic() {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
  if (audioContext && musicGain) {
    musicGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.06);
  }
}

function startCrowd() {
  if (!crowdEnabled || mode !== "playing" || crowdSource || !ensureAudio()) return;
  const duration = 6;
  const frameCount = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * 0.45;
  }
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const ambience = audioContext.createGain();
  const modulation = audioContext.createGain();
  const lfo = audioContext.createOscillator();
  source.buffer = buffer;
  source.loop = true;
  filter.type = "bandpass";
  filter.frequency.value = 950;
  filter.Q.value = 0.65;
  ambience.gain.value = 0.055;
  modulation.gain.value = 0.025;
  lfo.frequency.value = 0.28;
  source.connect(filter);
  filter.connect(ambience);
  ambience.connect(crowdGain);
  lfo.connect(modulation);
  modulation.connect(ambience.gain);
  crowdGain.gain.setTargetAtTime(0.8, audioContext.currentTime, 0.12);
  source.start();
  lfo.start();
  crowdSource = source;
  crowdLfo = lfo;
}

function stopCrowd() {
  if (!audioContext || !crowdGain) return;
  crowdGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.12);
  if (crowdSource) crowdSource.stop(audioContext.currentTime + 0.4);
  if (crowdLfo) crowdLfo.stop(audioContext.currentTime + 0.4);
  crowdSource = null;
  crowdLfo = null;
}

function playCrowdCheer() {
  if (!crowdEnabled || !ensureAudio()) return;
  const start = audioContext.currentTime + 0.01;
  playNoise(start, 1.8, 0.36, crowdGain, 350);
  playNoise(start + 0.08, 1.65, 0.18, crowdGain, 1400);
}

function playBallKick(start, strength) {
  playTone(88, start, 0.09, strength * 1.1, "sine", soundGain, 36);
  playNoise(start, 0.045, strength * 0.42, soundGain, 300);
  playNoise(start + 0.012, 0.025, strength * 0.12, soundGain, 1250);
}

function playSoundEffect(effect) {
  if (!soundEnabled || !ensureAudio()) return;
  const start = audioContext.currentTime + 0.01;
  if (effect === "pass") {
    playBallKick(start, 0.14);
  } else if (effect === "shot") {
    playBallKick(start, 0.25);
    playNoise(start + 0.02, 0.18, 0.07, soundGain, 550);
  } else if (effect === "receive") {
    playBallKick(start, 0.09);
  } else if (effect === "steal") {
    playTone(98, start, 0.14, 0.16, "sine", soundGain, 46);
    playNoise(start, 0.075, 0.07, soundGain, 650);
  } else if (effect === "goal") {
    [0, 0.08, 0.16].forEach((offset) => {
      playNoise(start + offset, 0.12, 0.13, soundGain, 1800);
    });
  } else if (effect === "whistle") {
    playTone(1500, start, 0.28, 0.1, "sine", soundGain);
    playTone(1900, start + 0.22, 0.32, 0.1, "sine", soundGain);
  }
}

function updateAudioButtons() {
  musicToggle.textContent = `BGM ${musicEnabled ? "ON" : "OFF"}`;
  musicToggle.setAttribute("aria-pressed", String(musicEnabled));
  soundToggle.textContent = `効果音 ${soundEnabled ? "ON" : "OFF"}`;
  soundToggle.setAttribute("aria-pressed", String(soundEnabled));
  crowdToggle.textContent = `観客 ${crowdEnabled ? "ON" : "OFF"}`;
  crowdToggle.setAttribute("aria-pressed", String(crowdEnabled));
}

function setHolder(nextHolder) {
  holder = nextHolder;
  if (nextHolder !== null) {
    shotDistanceToGoal = null;
    keeperHolding = null;
    keeperHoldTimer = 0;
  }
  passTarget = null;
  passFrom = null;
  passFromTimer = 0;
  passTargetTimer = 0;
  possessionElement.textContent = isPlayerPossession()
    ? `ボール：YOU${holder === "playerMate" ? "（味方）" : ""}`
    : holder === "cpu" || holder === "cpuMate"
      ? `ボール：CPU${holder === "cpuMate" ? "（味方）" : ""}`
      : "ボール：ルーズ";
  possessionElement.dataset.owner = isPlayerPossession() ? "player" : holder ? "cpu" : "loose";
}

function formatTime(seconds) {
  return String(Math.ceil(seconds)).padStart(2, "0");
}

function updateScoreboard() {
  playerScoreElement.textContent = String(playerScore);
  cpuScoreElement.textContent = String(cpuScore);
  timeElement.textContent = formatTime(timeLeft);
}

function resetPositions() {
  selectedPlayer = player;
  player.x = 420;
  player.y = 290;
  player.facingX = 1;
  player.facingY = 0;
  player.moving = false;
  player.tackleCooldown = 0;
  player.tackleProgress = 0;
  player.targetX = player.x;
  player.targetY = player.y;
  cpu.x = 540;
  cpu.y = 290;
  cpu.facingX = -1;
  cpu.facingY = 0;
  cpu.moving = false;
  cpu.tackleCooldown = 0.9;
  cpu.tackleProgress = 0;
  cpu.shotCooldown = 0.65;
  cpu.passCooldown = 0.8;
  cpu.thinkCooldown = 0;
  cpu.targetX = cpu.x;
  cpu.targetY = cpu.y;
  playerMate.x = 340;
  playerMate.y = 370;
  playerMate.facingX = 1;
  playerMate.facingY = 0;
  playerMate.moving = false;
  playerMate.targetX = playerMate.x;
  playerMate.targetY = playerMate.y;
  cpuMate.x = 620;
  cpuMate.y = 210;
  cpuMate.facingX = -1;
  cpuMate.facingY = 0;
  cpuMate.moving = false;
  cpuMate.targetX = cpuMate.x;
  cpuMate.targetY = cpuMate.y;
  playerDefender.x = 112;
  playerDefender.y = 290;
  playerDefender.facingX = 1;
  playerDefender.facingY = 0;
  playerDefender.moving = false;
  cpuDefender.x = 848;
  cpuDefender.y = 290;
  cpuDefender.facingX = -1;
  cpuDefender.facingY = 0;
  cpuDefender.moving = false;
  ball.x = 480;
  ball.y = 290;
  ball.vx = 0;
  ball.vy = 0;
  shotDistanceToGoal = null;
  keeperHolding = null;
  keeperHoldTimer = 0;
  ballPickupDelay = 0;
  passTarget = null;
  passFrom = null;
  passFromTimer = 0;
  passTargetTimer = 0;
  setHolder("player");
  syncHeldBall(player);
}

function resetMatch() {
  playerScore = 0;
  cpuScore = 0;
  timeLeft = 60;
  goalPause = 0;
  mode = "ready";
  keys.clear();
  resetPositions();
  kickoffButton.textContent = "キックオフ！";
  setStatus("キックオフを押して試合開始！");
  updateScoreboard();
  draw();
}

function endMatch() {
  mode = "ended";
  if (playerScore > cpuScore) setStatus("試合終了！ あなたの勝利！");
  else if (playerScore < cpuScore) setStatus("試合終了！ CPUの勝利！");
  else setStatus("試合終了！ 引き分け！");
  stopMusic();
  stopCrowd();
  playSoundEffect("whistle");
  kickoffButton.textContent = "もう一度プレイ";
}

function startMatch() {
  if (mode === "ended") resetMatch();
  if (mode === "ready") {
    mode = "playing";
    kickoffButton.textContent = "試合をリセット";
    setStatus("試合開始！ 味方が自動でサポート。Eキーでパスできます。");
    startMusic();
    startCrowd();
    playSoundEffect("whistle");
    canvas.focus({ preventScroll: true });
  } else {
    resetMatch();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceBetween(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function updateControlledPlayer() {
  if (holder === "player") {
    selectedPlayer = player;
    return;
  }
  if (holder === "playerMate") {
    selectedPlayer = playerMate;
    return;
  }
  const target = holderPerson() ?? ball;
  const otherPlayer = selectedPlayer === player ? playerMate : player;
  if (distanceBetween(otherPlayer, target) + 12 < distanceBetween(selectedPlayer, target)) {
    selectedPlayer = otherPlayer;
  }
}

function moveToward(person, targetX, targetY, dt, speed = person.speed) {
  const dx = targetX - person.x;
  const dy = targetY - person.y;
  const distance = Math.hypot(dx, dy);
  person.moving = distance > 2;
  if (!person.moving) return;
  const moveX = dx / distance;
  const moveY = dy / distance;
  const step = Math.min(distance, speed * dt);
  person.x = clamp(person.x + moveX * step, field.left + person.radius, field.right - person.radius);
  person.y = clamp(person.y + moveY * step, field.top + person.radius, field.bottom - person.radius);
  person.facingX = moveX;
  person.facingY = moveY;
}

function movePlayer(dt) {
  player.moving = false;
  playerMate.moving = false;
  const controlledPlayer = selectedPlayer;
  const dx = Number(keys.has("right")) - Number(keys.has("left"));
  const dy = Number(keys.has("down")) - Number(keys.has("up"));
  const length = Math.hypot(dx, dy);
  controlledPlayer.moving = length > 0;
  if (!length) return;
  const moveX = dx / length;
  const moveY = dy / length;
  const ownsBall = holder === (controlledPlayer === player ? "player" : "playerMate");
  const speed = ownsBall ? controlledPlayer.speed * 0.84 : controlledPlayer.speed;
  controlledPlayer.x = clamp(controlledPlayer.x + moveX * speed * dt, field.left + controlledPlayer.radius, field.right - controlledPlayer.radius);
  controlledPlayer.y = clamp(controlledPlayer.y + moveY * speed * dt, field.top + controlledPlayer.radius, field.bottom - controlledPlayer.radius);
  controlledPlayer.facingX = moveX;
  controlledPlayer.facingY = moveY;
}

function syncHeldBall(person) {
  const offset = person.radius + ball.radius + 3;
  ball.x = clamp(person.x + person.facingX * offset, field.left - 4, field.right + 4);
  ball.y = clamp(person.y + person.facingY * offset, field.top + 4, field.bottom - 4);
  ball.vx = 0;
  ball.vy = 0;
}

function holderPerson() {
  if (holder === "player") return player;
  if (holder === "playerMate") return playerMate;
  if (holder === "cpu") return cpu;
  if (holder === "cpuMate") return cpuMate;
  return null;
}

function isPlayerPossession() {
  return holder === "player" || holder === "playerMate";
}

function launchPass(passer, receiver, speed) {
  const receiverDirectionX = receiver === playerMate
    ? receiver.targetX - receiver.x
    : receiver.facingX;
  const receiverDirectionY = receiver === playerMate
    ? receiver.targetY - receiver.y
    : receiver.facingY;
  const receiverDirectionLength = Math.hypot(receiverDirectionX, receiverDirectionY) || 1;
  const lead = Math.min(receiver.speed * 0.24, 58);
  const targetX = clamp(
    receiver.x + (receiverDirectionX / receiverDirectionLength) * lead,
    field.left + 30,
    field.right - 30,
  );
  const targetY = clamp(
    receiver.y + (receiverDirectionY / receiverDirectionLength) * lead,
    field.top + 24,
    field.bottom - 24,
  );
  const dx = targetX - ball.x;
  const dy = targetY - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  setHolder(null);
  shotDistanceToGoal = null;
  ballPickupDelay = 0.08;
  ball.vx = (dx / length) * speed;
  ball.vy = (dy / length) * speed;
  passFrom = passer;
  passFromTimer = 0.35;
  passTarget = receiver;
  passTargetTimer = 1.5;
}

function segmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function chooseShotTargetY(shooter, defender, goalX) {
  const candidates = [
    field.goalTop + 18,
    field.goalTop + 42,
    (field.goalTop + field.goalBottom) / 2,
    field.goalBottom - 42,
    field.goalBottom - 18,
  ];
  return candidates.reduce((best, targetY) => {
    const clearance = segmentDistance(defender, shooter, { x: goalX, y: targetY });
    return clearance > best.clearance ? { y: targetY, clearance } : best;
  }, { y: candidates[0], clearance: -1 }).y;
}

function shoot() {
  if (mode !== "playing" || goalPause > 0) return;
  if (!isPlayerPossession()) {
    if (holder !== null) {
      setStatus("相手からボールを奪おう！");
      return;
    }
    if (distanceBetween(player, ball) > player.radius + ball.radius + 42) {
      setStatus("ボールに近づくと自動でキープできます！");
      return;
    }
    setHolder("player");
    syncHeldBall(player);
  }
  const shooter = holderPerson();
  const aimOffset = keys.has("up") ? -58 : keys.has("down") ? 58 : 0;
  const targetY = aimOffset
    ? clamp(ball.y + aimOffset, field.goalTop + 14, field.goalBottom - 14)
    : (field.goalTop + field.goalBottom) / 2;
  const targetX = field.right + 38;
  const dx = targetX - ball.x;
  const dy = targetY - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  setHolder(null);
  shotDistanceToGoal = field.right - ball.x;
  ballPickupDelay = 0.22;
  ball.vx = (dx / length) * 690 + shooter.facingX * 28;
  ball.vy = (dy / length) * 690 + shooter.facingY * 28;
  playSoundEffect("shot");
  setStatus("シュート！");
}

function pass() {
  if (mode !== "playing" || goalPause > 0) return;
  if (!isPlayerPossession()) {
    if (holder !== null) {
      setStatus("相手からボールを奪おう！");
      return;
    }
    if (distanceBetween(player, ball) > player.radius + ball.radius + 42) {
      setStatus("ボールをキープしてからパスしよう！");
      return;
    }
    setHolder("player");
    syncHeldBall(player);
  }
  const passer = holderPerson();
  const receiver = holder === "playerMate" ? player : playerMate;
  launchPass(passer, receiver, 520);
  playSoundEffect("pass");
  setStatus("味方へパス！");
}

function tryCpuPass(carrier, receiver) {
  if (cpu.passCooldown > 0) return false;
  const distance = distanceBetween(carrier, receiver);
  if (distance < 75 || distance > 310) return false;
  const pressure = Math.min(distanceBetween(carrier, player), distanceBetween(carrier, playerMate));
  if (pressure > 130) return false;
  const passLaneClearance = Math.min(
    segmentDistance(player, carrier, receiver),
    segmentDistance(playerMate, carrier, receiver),
  );
  if (passLaneClearance < 28) return false;
  launchPass(carrier, receiver, 470);
  cpu.passCooldown = 2.2;
  cpu.thinkCooldown = 0.5;
  playSoundEffect("pass");
  setStatus("CPUが味方にパス！");
  return true;
}

function shootForCpu() {
  const shooter = holderPerson();
  if (!shooter || (holder !== "cpu" && holder !== "cpuMate") || cpu.shotCooldown > 0) return;
  syncHeldBall(shooter);
  const targetX = field.left - 38;
  const targetY = clamp(
    chooseShotTargetY(shooter, player, targetX) + Math.sin(gameTime * 5.7) * 55,
    field.goalTop - 8,
    field.goalBottom + 8,
  );
  const dx = targetX - ball.x;
  const dy = targetY - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  setHolder(null);
  shotDistanceToGoal = ball.x - field.left;
  ballPickupDelay = 0.22;
  ball.vx = (dx / length) * 590;
  ball.vy = (dy / length) * 590;
  cpu.shotCooldown = 1.15;
  playSoundEffect("shot");
  setStatus("CPUがシュート！");
}

function thinkCpu() {
  if (holder === "cpu" || holder === "cpuMate") {
    const carrier = holderPerson();
    const support = holder === "cpu" ? cpuMate : cpu;
    const targetX = Math.max(field.left + 90, carrier.x - 55);
    const targetY = clamp(
      chooseShotTargetY(carrier, player, field.left - 38),
      field.goalTop + 20,
      field.goalBottom - 20,
    );
    cpu.targetX = holder === "cpu" ? targetX : clamp(carrier.x - 50, field.left + 90, field.right - 50);
    cpu.targetY = holder === "cpu" ? targetY : carrier.y;
    support.targetX = holder === "cpuMate" ? targetX : clamp(carrier.x + 95, field.left + 60, field.right - 40);
    support.targetY = holder === "cpuMate" ? targetY : clamp(carrier.y + (carrier.y < 290 ? 85 : -85), field.top + 35, field.bottom - 35);
    playerMate.targetX = clamp(carrier.x + 90, field.left + 35, field.right - 35);
    playerMate.targetY = clamp(carrier.y + (carrier.y < 290 ? 70 : -70), field.top + 25, field.bottom - 25);
    player.targetX = clamp(carrier.x + 115, field.left + 35, field.right - 35);
    player.targetY = clamp(carrier.y + (carrier.y < 290 ? -70 : 70), field.top + 25, field.bottom - 25);
    if (carrier.x < field.left + 250 || distanceBetween(carrier, player) < 76) {
      shootForCpu();
      return;
    }
    const receiver = holder === "cpu" ? cpuMate : cpu;
    if (tryCpuPass(carrier, receiver)) return;
    return;
  }

  if (isPlayerPossession()) {
    const carrier = holderPerson();
    cpu.targetX = clamp(carrier.x + 38, field.left + 34, field.right - 34);
    cpu.targetY = clamp(carrier.y + (290 - carrier.y) * 0.12, field.top + 24, field.bottom - 24);
    cpuMate.targetX = clamp(carrier.x - 88, field.left + 36, field.right - 36);
    cpuMate.targetY = clamp(carrier.y + (carrier.y < 290 ? 78 : -78), field.top + 28, field.bottom - 28);
    const supportX = clamp(carrier.x + 112, field.left + 35, field.right - 35);
    const supportY = clamp(carrier.y + (carrier.y < 290 ? 85 : -85), field.top + 25, field.bottom - 25);
    if (holder === "player") {
      playerMate.targetX = supportX;
      playerMate.targetY = supportY;
    } else {
      player.targetX = supportX;
      player.targetY = supportY;
    }
    return;
  }

  const lead = 0.24;
  const predictedX = clamp(ball.x + ball.vx * lead, field.left + 24, field.right - 24);
  const predictedY = clamp(ball.y + ball.vy * lead, field.top + 24, field.bottom - 24);
  const cpuDistance = Math.hypot(predictedX - cpu.x, predictedY - cpu.y);
  const playerDistance = Math.hypot(predictedX - player.x, predictedY - player.y);
  if (playerDistance + 24 < cpuDistance && predictedX > canvas.width * 0.52) {
    cpu.targetX = clamp(predictedX + 86, field.left + 32, field.right - 32);
    cpu.targetY = clamp(predictedY + (290 - predictedY) * 0.16, field.top + 24, field.bottom - 24);
  } else {
    cpu.targetX = predictedX;
    cpu.targetY = predictedY;
  }
  cpuMate.targetX = clamp(predictedX + 80, field.left + 36, field.right - 36);
  cpuMate.targetY = clamp(predictedY + (predictedY < 290 ? -72 : 72), field.top + 28, field.bottom - 28);
  player.targetX = clamp(predictedX - 80, field.left + 36, field.right - 36);
  player.targetY = clamp(predictedY + (predictedY < 290 ? 72 : -72), field.top + 28, field.bottom - 28);
  playerMate.targetX = clamp(predictedX + 80, field.left + 36, field.right - 36);
  playerMate.targetY = clamp(predictedY + (predictedY < 290 ? -72 : 72), field.top + 28, field.bottom - 28);
}

function moveCpu(dt) {
  cpu.shotCooldown = Math.max(0, cpu.shotCooldown - dt);
  cpu.passCooldown = Math.max(0, cpu.passCooldown - dt);
  cpu.tackleCooldown = Math.max(0, cpu.tackleCooldown - dt);
  cpu.thinkCooldown -= dt;
  if (cpu.thinkCooldown <= 0) {
    thinkCpu();
    cpu.thinkCooldown = 0.22;
  }

  const speed = holder === "cpu" ? cpu.speed * 0.84 : cpu.speed;
  moveToward(cpu, cpu.targetX, cpu.targetY, dt, speed);

  if (selectedPlayer !== player) moveToward(player, player.targetX, player.targetY, dt, player.speed);
  if (selectedPlayer !== playerMate) moveToward(playerMate, playerMate.targetX, playerMate.targetY, dt, playerMate.speed);
  moveToward(cpuMate, cpuMate.targetX, cpuMate.targetY, dt, cpuMate.speed);
  const playerCarrier = holder === "player" ? player : holder === "playerMate" ? playerMate : null;
  const tacklers = playerCarrier ? [cpu, cpuMate] : [];
  const tackler = playerCarrier && tacklers.length
    ? tacklers.reduce((nearest, person) => (
      distanceBetween(person, playerCarrier) < distanceBetween(nearest, playerCarrier) ? person : nearest
    ))
    : null;
  const inContact = tackler
    && distanceBetween(tackler, playerCarrier) <= tackler.radius + playerCarrier.radius + 6;
  if (playerCarrier && cpu.tackleCooldown === 0 && inContact) {
    cpu.tackleProgress += dt;
  } else {
    cpu.tackleProgress = 0;
  }
  if (playerCarrier && cpu.tackleProgress >= 0.4) {
    setHolder(tackler === cpu ? "cpu" : "cpuMate");
    player.tackleCooldown = 0.75;
    cpu.tackleCooldown = 1.35;
    cpu.tackleProgress = 0;
    cpu.shotCooldown = Math.max(cpu.shotCooldown, 0.55);
    cpu.thinkCooldown = 0;
    playSoundEffect("steal");
    setStatus("CPUチームにボールを奪われた！");
  }
}

function moveDefenders(dt) {
  const centerY = (field.goalTop + field.goalBottom) / 2;
  const getTargetY = (defender, goalDirection) => {
    const movingTowardGoal = ball.vx * goalDirection > 0;
    if (movingTowardGoal && Math.abs(ball.vx) > 1) {
      const interceptX = defender.x - goalDirection * (defender.radius + ball.radius);
      const timeToIntercept = (interceptX - ball.x) / ball.vx;
      if (timeToIntercept >= 0 && timeToIntercept <= 1.2) {
        return clamp(
          ball.y + (ball.vy / ball.vx) * (interceptX - ball.x),
          field.goalTop + ball.radius,
          field.goalBottom - ball.radius,
        );
      }
    }

    const isThreatening = goalDirection < 0
      ? ball.x < defender.x + 170
      : ball.x > defender.x - 170;
    return isThreatening ? clamp(ball.y, field.goalTop + 20, field.goalBottom - 20) : centerY;
  };
  const playerTargetY = getTargetY(playerDefender, -1);
  const cpuTargetY = getTargetY(cpuDefender, 1);
  moveToward(playerDefender, playerDefender.x, playerTargetY, dt);
  moveToward(cpuDefender, cpuDefender.x, cpuTargetY, dt);
  playerDefender.facingX = 1;
  cpuDefender.facingX = -1;
}

function acquireLooseBall() {
  if (holder !== null || keeperHolding || ballPickupDelay > 0) return;
  if (passTarget && distanceBetween(passTarget, ball) <= passTarget.radius + ball.radius + 38) {
    const receivedBy = passTarget === playerMate ? "playerMate" : passTarget === cpuMate ? "cpuMate" : "player";
    setHolder(receivedBy);
    playSoundEffect("receive");
    setStatus(receivedBy === "playerMate" ? "味方がパスを受けた！" : "パスが通った！");
    return;
  }
  const candidates = [
    { person: player, name: "player", team: "player" },
    { person: playerMate, name: "playerMate", team: "player" },
    { person: cpu, name: "cpu", team: "cpu" },
    { person: cpuMate, name: "cpuMate", team: "cpu" },
  ].filter((candidate) => candidate.person !== passFrom)
    .map((candidate) => ({ ...candidate, distance: distanceBetween(candidate.person, ball) }));
  const closest = candidates.reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest);
  if (closest.distance <= closest.person.radius + ball.radius + 22) {
    setHolder(closest.name);
    playSoundEffect("receive");
    if (closest.team === "player") {
      setStatus(closest.name === "playerMate" ? "味方がパスを受けた！" : "ボールキープ！ ドリブルで抜いてシュート！");
    } else {
      cpu.thinkCooldown = 0;
      setStatus("CPUチームがボールをキープ！");
    }
  }
}

function tryPlayerTackle(dt) {
  const tackler = selectedPlayer;
  if ((holder !== "cpu" && holder !== "cpuMate") || player.tackleCooldown > 0) {
    player.tackleProgress = 0;
    return;
  }
  const opponent = holderPerson();
  const inContact = distanceBetween(tackler, opponent) <= tackler.radius + opponent.radius + 6;
  player.tackleProgress = inContact ? player.tackleProgress + dt : 0;
  if (player.tackleProgress >= 0.28) {
    setHolder(tackler === player ? "player" : "playerMate");
    player.tackleCooldown = 0.75;
    cpu.tackleCooldown = 0.9;
    player.tackleProgress = 0;
    playSoundEffect("steal");
    setStatus("ナイスボール奪取！");
  }
}

function resolvePlayerContact() {
  const players = [player, playerMate, cpu, cpuMate];
  for (let firstIndex = 0; firstIndex < players.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < players.length; secondIndex += 1) {
      const first = players[firstIndex];
      const second = players[secondIndex];
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      const minimumDistance = first.radius + second.radius;
      if (distance === 0 || distance >= minimumDistance) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const push = (minimumDistance - distance) / 2;
      first.x = clamp(first.x - nx * push, field.left + first.radius, field.right - first.radius);
      first.y = clamp(first.y - ny * push, field.top + first.radius, field.bottom - first.radius);
      second.x = clamp(second.x + nx * push, field.left + second.radius, field.right - second.radius);
      second.y = clamp(second.y + ny * push, field.top + second.radius, field.bottom - second.radius);
    }
  }
}

function scoreGoal(forPlayer) {
  setHolder(null);
  shotDistanceToGoal = null;
  playCrowdCheer();
  playSoundEffect("goal");
  if (forPlayer) {
    playerScore += 1;
    setStatus("GOAL！ ナイスシュート！");
  } else {
    cpuScore += 1;
    setStatus("CPUのゴール！");
  }
  updateScoreboard();
  goalPause = 1.05;
}

function updateBall(dt) {
  if (holder !== null) return;
  if (keeperHolding) {
    const fieldDirection = keeperHolding === playerDefender ? 1 : -1;
    ball.x = keeperHolding.x + fieldDirection * (keeperHolding.radius + ball.radius + 2);
    ball.y = keeperHolding.y;
    keeperHoldTimer -= dt;
    if (keeperHoldTimer <= 0) {
      keeperHolding = null;
      ball.vx = fieldDirection * 260;
      ball.vy = (Math.random() - 0.5) * 100;
      ballPickupDelay = 0.12;
    }
    return;
  }
  const previousX = ball.x;
  const previousY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const friction = 0.986 ** (dt * 60);
  ball.vx *= friction;
  ball.vy *= friction;

  if (ball.y - ball.radius < field.top) {
    ball.y = field.top + ball.radius;
    ball.vy = Math.abs(ball.vy) * 0.72;
  } else if (ball.y + ball.radius > field.bottom) {
    ball.y = field.bottom - ball.radius;
    ball.vy = -Math.abs(ball.vy) * 0.72;
  }

  for (const defender of [playerDefender, cpuDefender]) {
    const distance = segmentDistance(
      { x: defender.x, y: defender.y },
      { x: previousX, y: previousY },
      { x: ball.x, y: ball.y },
    );
    if (distance <= defender.radius + ball.radius) {
      const directionToGoal = defender === playerDefender ? -1 : 1;
      if (shotDistanceToGoal !== null && ball.vx * directionToGoal > 0) {
        const distanceToGoal = shotDistanceToGoal;
        const fieldDirection = -directionToGoal;
        const catchChance = distanceToGoal >= 250 ? 0.8 : 0.03;
        const fumbleChance = distanceToGoal >= 250 ? 0.14 : 0.08;
        const roll = Math.random();
        shotDistanceToGoal = null;
        if (roll < catchChance) {
          keeperHolding = defender;
          keeperHoldTimer = 0.65;
          ball.x = defender.x + fieldDirection * (defender.radius + ball.radius + 2);
          ball.y = defender.y;
          ball.vx = 0;
          ball.vy = 0;
          ballPickupDelay = keeperHoldTimer;
          setStatus("キーパーがキャッチ！");
          return;
        }
        if (roll < catchChance + fumbleChance) {
          ball.x = defender.x + fieldDirection * (defender.radius + ball.radius + 2);
          ball.y = clamp(ball.y, field.goalTop + ball.radius, field.goalBottom - ball.radius);
          ball.vx = fieldDirection * Math.max(Math.abs(ball.vx) * 0.28, 140);
          ball.vy = clamp(ball.vy * 0.22 + (Math.random() - 0.5) * 90, -160, 160);
          ballPickupDelay = 0.12;
          setStatus("キーパーがファンブル！");
          return;
        }
      }
      shotDistanceToGoal = null;
      const direction = ball.x >= defender.x ? 1 : -1;
      ball.x = defender.x + direction * (defender.radius + ball.radius + 1);
      ball.vx = -Math.sign(ball.vx || direction) * Math.max(Math.abs(ball.vx) * 0.62, 180);
      ball.vy += clamp((ball.y - defender.y) * 2, -180, 180);
      setStatus("ディフェンダーにブロックされた！");
      return;
    }
  }

  const rightGoalLine = field.right - ball.radius;
  const leftGoalLine = field.left + ball.radius;
  if (ball.x > rightGoalLine && previousX <= rightGoalLine) {
    const crossing = (rightGoalLine - previousX) / (ball.x - previousX);
    const crossingY = previousY + (ball.y - previousY) * crossing;
    if (crossingY > field.goalTop + ball.radius && crossingY < field.goalBottom - ball.radius) {
      scoreGoal(true);
      return;
    }
  } else if (ball.x < leftGoalLine && previousX >= leftGoalLine) {
    const crossing = (leftGoalLine - previousX) / (ball.x - previousX);
    const crossingY = previousY + (ball.y - previousY) * crossing;
    if (crossingY > field.goalTop + ball.radius && crossingY < field.goalBottom - ball.radius) {
      scoreGoal(false);
      return;
    }
  }
  if (ball.x - ball.radius < field.left || ball.x + ball.radius > field.right) {
    ball.x = clamp(ball.x, field.left + ball.radius, field.right - ball.radius);
    ball.vx *= -0.72;
  }
}

function update(dt) {
  gameTime += dt;
  updateControlledPlayer();
  ballPickupDelay = Math.max(0, ballPickupDelay - dt);
  if (passTarget) {
    passTargetTimer -= dt;
    if (passTargetTimer <= 0) {
      passTarget = null;
    }
  }
  if (passFrom) {
    passFromTimer -= dt;
    if (passFromTimer <= 0) passFrom = null;
  }
  if (mode === "goalPause") {
    goalPause -= dt;
    if (goalPause <= 0) {
      if (timeLeft <= 0) endMatch();
      else {
        resetPositions();
        mode = "playing";
        setStatus("リスタート！");
      }
    }
    return;
  }
  if (mode !== "playing") return;
  timeLeft = Math.max(0, timeLeft - dt);
  if (timeLeft === 0) {
    endMatch();
    return;
  }
  player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
  movePlayer(dt);
  moveCpu(dt);
  updateControlledPlayer();
  moveDefenders(dt);
  tryPlayerTackle(dt);
  updateControlledPlayer();
  const carrier = holderPerson();
  if (carrier) syncHeldBall(carrier);
  else {
    updateBall(dt);
    if (goalPause > 0) {
      mode = "goalPause";
      return;
    }
    acquireLooseBall();
    updateControlledPlayer();
  }
  resolvePlayerContact();
  const currentCarrier = holderPerson();
  if (currentCarrier) syncHeldBall(currentCarrier);
  updateControlledPlayer();
}

function project(x, y) {
  const depth = clamp((y - field.top) / (field.bottom - field.top), 0, 1);
  const width = 760 + depth * 150;
  const normalizedX = (x - field.left) / (field.right - field.left);
  return {
    x: canvas.width / 2 + (normalizedX - 0.5) * width,
    y: 184 + depth * 334,
    scale: 0.82 + depth * 0.25,
  };
}

function drawStadium() {
  const sky = context.createLinearGradient(0, 0, 0, 192);
  sky.addColorStop(0, "#111a24");
  sky.addColorStop(0.7, "#34404a");
  sky.addColorStop(1, "#76826e");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#18232b";
  context.beginPath();
  context.moveTo(0, 54);
  context.lineTo(canvas.width, 54);
  context.lineTo(canvas.width, 177);
  context.lineTo(0, 177);
  context.closePath();
  context.fill();
  const crowdColors = ["#d0b38b", "#94b6a2", "#7790a3", "#d27d62", "#ded8bc"];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 48; column += 1) {
      const colorIndex = (row * 17 + column * 7) % crowdColors.length;
      context.fillStyle = crowdColors[colorIndex];
      context.globalAlpha = 0.45 + ((row + column) % 4) * 0.1;
      context.fillRect(7 + column * 20, 72 + row * 17, 7, 5);
    }
  }
  context.globalAlpha = 1;
  context.fillStyle = "#26332f";
  context.fillRect(0, 157, canvas.width, 29);
  context.fillStyle = "#d5d7c6";
  context.font = "800 14px 'Barlow Condensed', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("TWO ON TWO  •  STREET MATCH", canvas.width / 2, 171);
  context.fillStyle = "#e9efd9";
  context.fillRect(28, 22, 7, 114);
  context.fillRect(canvas.width - 35, 22, 7, 114);
  context.fillStyle = "#fff6cf";
  context.shadowColor = "#e7f4d0";
  context.shadowBlur = 18;
  context.fillRect(12, 29, 39, 5);
  context.fillRect(canvas.width - 51, 29, 39, 5);
  context.shadowBlur = 0;
}

function drawWorldPolygon(points, fillStyle, strokeStyle = null, lineWidth = 2) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    const point = project(x, y);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  if (fillStyle) {
    context.fillStyle = fillStyle;
    context.fill();
  }
  if (strokeStyle) {
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.stroke();
  }
}

function drawWorldLine(x1, y1, x2, y2, color = "#f0f2d9d9", lineWidth = 2) {
  const start = project(x1, y1);
  const end = project(x2, y2);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawWorldRect(left, top, right, bottom, fillStyle = null, strokeStyle = null) {
  drawWorldPolygon(
    [[left, top], [right, top], [right, bottom], [left, bottom]],
    fillStyle,
    strokeStyle,
  );
}

function drawWorldCircle(centerX, centerY, radius) {
  context.beginPath();
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * Math.PI * 2;
    const point = project(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.stroke();
}

function drawGoal(x, direction) {
  const backX = x + direction * 34;
  drawWorldPolygon(
    [[x, field.goalTop], [backX, field.goalTop], [backX, field.goalBottom], [x, field.goalBottom]],
    "#e9eee533",
    "#f1f3df77",
    1,
  );
  for (let y = field.goalTop + 20; y < field.goalBottom; y += 20) {
    drawWorldLine(x, y, backX, y, "#f5f6e966", 1);
  }
  for (let offset = 10; offset < 34; offset += 10) {
    drawWorldLine(x + direction * offset, field.goalTop, x + direction * offset, field.goalBottom, "#f5f6e966", 1);
  }

  const top = project(x, field.goalTop);
  const bottom = project(x, field.goalBottom);
  const postHeight = 42;
  context.strokeStyle = "#f7f5e8";
  context.lineWidth = 5;
  context.beginPath();
  context.moveTo(top.x, top.y);
  context.lineTo(top.x, top.y - postHeight * top.scale);
  context.lineTo(bottom.x, bottom.y - postHeight * bottom.scale);
  context.lineTo(bottom.x, bottom.y);
  context.stroke();
  const backTop = project(backX, field.goalTop);
  context.beginPath();
  context.moveTo(top.x, top.y - postHeight * top.scale);
  context.lineTo(backTop.x, backTop.y - postHeight * backTop.scale);
  context.stroke();
}

function drawField() {
  drawStadium();
  const farLeft = project(field.left, field.top);
  const farRight = project(field.right, field.top);
  drawWorldPolygon(
    [[field.left, field.top], [field.right, field.top], [field.right, field.bottom], [field.left, field.bottom]],
    "#28743d",
    "#e9eddb",
    3,
  );

  for (let index = 0; index < 10; index += 1) {
    if (index % 2 === 0) continue;
    const stripeLeft = field.left + ((field.right - field.left) * index) / 10;
    const stripeRight = field.left + ((field.right - field.left) * (index + 1)) / 10;
    drawWorldRect(stripeLeft, field.top, stripeRight, field.bottom, "#ffffff0b");
  }

  drawWorldLine(field.left, field.top, field.right, field.top);
  drawWorldLine(field.left, field.bottom, field.right, field.bottom);
  drawWorldLine(field.left, field.top, field.left, field.bottom);
  drawWorldLine(field.right, field.top, field.right, field.bottom);
  drawWorldLine(canvas.width / 2, field.top, canvas.width / 2, field.bottom);
  context.strokeStyle = "#f0f2d9d9";
  drawWorldCircle(canvas.width / 2, (field.top + field.bottom) / 2, 76);
  const center = project(canvas.width / 2, (field.top + field.bottom) / 2);
  context.fillStyle = "#f0f2d9";
  context.beginPath();
  context.arc(center.x, center.y, 3, 0, Math.PI * 2);
  context.fill();
  drawWorldRect(field.left, 184, field.left + 110, 396, null, "#f0f2d9d9");
  drawWorldRect(field.right - 110, 184, field.right, 396, null, "#f0f2d9d9");
  drawWorldRect(field.left, 230, field.left + 42, 350, null, "#f0f2d9d9");
  drawWorldRect(field.right - 42, 230, field.right, 350, null, "#f0f2d9d9");
  drawGoal(field.left, -1);
  drawGoal(field.right, 1);
  context.fillStyle = "#e8d8a5";
  context.font = "700 10px 'Barlow Condensed', sans-serif";
  context.textAlign = "center";
  context.fillText("HOME", farLeft.x + 18, farLeft.y - 7);
  context.fillText("AWAY", farRight.x - 18, farRight.y - 7);
}

function drawLimb(x1, y1, x2, y2, width, color) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.lineWidth = width;
  context.lineCap = "round";
  context.strokeStyle = color;
  context.stroke();
}

function drawPlayer(person, jerseyColor, shortsColor, number) {
  const ground = project(person.x, person.y);
  const scale = ground.scale;
  const direction = person.facingX < 0 ? -1 : 1;
  const stride = person.moving ? Math.sin(gameTime * 15 + (number === "2" ? 1 : 0)) * 5 * scale : 0;
  const x = ground.x;
  const y = ground.y;
  const height = 66 * scale;
  const legStartY = y - 22 * scale;
  const hipX = x - direction * 1.5 * scale;
  const legSpread = 5 * scale;

  context.save();
  context.fillStyle = "#07120c88";
  context.beginPath();
  context.ellipse(x, y + 3 * scale, 16 * scale, 5 * scale, 0, 0, Math.PI * 2);
  context.fill();

  drawLimb(hipX - legSpread, legStartY, x - legSpread - stride, y - 2 * scale, 7 * scale, shortsColor);
  drawLimb(hipX + legSpread, legStartY, x + legSpread + stride, y - 2 * scale, 7 * scale, shortsColor);
  drawLimb(x - legSpread - stride, y - 2 * scale, x - legSpread - stride + direction * 4 * scale, y, 4 * scale, "#e9e9d8");
  drawLimb(x + legSpread + stride, y - 2 * scale, x + legSpread + stride + direction * 4 * scale, y, 4 * scale, "#e9e9d8");
  drawLimb(x - legSpread - stride + direction * 3 * scale, y, x - legSpread - stride + direction * 10 * scale, y, 4 * scale, "#18211e");
  drawLimb(x + legSpread + stride + direction * 3 * scale, y, x + legSpread + stride + direction * 10 * scale, y, 4 * scale, "#18211e");

  const shoulderY = y - 43 * scale;
  const armSwing = person.moving ? Math.cos(gameTime * 15) * 4 * scale : 1 * scale;
  drawLimb(x - direction * 8 * scale, shoulderY, x - direction * 12 * scale, y - 30 * scale + armSwing, 5 * scale, jerseyColor);
  drawLimb(x + direction * 8 * scale, shoulderY, x + direction * 12 * scale, y - 30 * scale - armSwing, 5 * scale, jerseyColor);
  drawLimb(x - direction * 12 * scale, y - 30 * scale + armSwing, x - direction * 11 * scale, y - 24 * scale + armSwing, 3.5 * scale, "#d99f79");
  drawLimb(x + direction * 12 * scale, y - 30 * scale - armSwing, x + direction * 11 * scale, y - 24 * scale - armSwing, 3.5 * scale, "#d99f79");

  context.fillStyle = jerseyColor;
  context.beginPath();
  context.moveTo(x - 9 * scale, y - 51 * scale);
  context.lineTo(x + 9 * scale, y - 51 * scale);
  context.lineTo(x + 12 * scale, y - 26 * scale);
  context.lineTo(x - 11 * scale, y - 26 * scale);
  context.closePath();
  context.fill();
  context.fillStyle = "#ffffffb8";
  context.fillRect(x - 1 * scale, y - 47 * scale, 2 * scale, 17 * scale);
  context.fillStyle = "#fff7e6";
  context.font = `800 ${9 * scale}px 'Barlow Condensed', sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(number, x, y - 38 * scale);

  context.fillStyle = "#d9a681";
  context.beginPath();
  context.ellipse(x, y - height + 10 * scale, 7 * scale, 9 * scale, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#30251f";
  context.beginPath();
  context.ellipse(x - direction * 1.5 * scale, y - height + 4 * scale, 7 * scale, 5 * scale, 0, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f4d8bd";
  context.beginPath();
  context.moveTo(x + direction * 6 * scale, y - height + 10 * scale);
  context.lineTo(x + direction * 10 * scale, y - height + 12 * scale);
  context.lineTo(x + direction * 5 * scale, y - height + 14 * scale);
  context.fill();
  context.restore();
}

function drawBall() {
  const point = project(ball.x, ball.y);
  const radius = ball.radius * point.scale;
  context.fillStyle = "#07120c99";
  context.beginPath();
  context.ellipse(point.x, point.y + 2, radius * 1.25, radius * 0.48, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fffdf1";
  context.beginPath();
  context.arc(point.x, point.y - radius * 0.35, radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#26332a";
  context.beginPath();
  context.arc(point.x, point.y - radius * 0.35, radius * 0.34, 0, Math.PI * 2);
  context.fill();
}

function drawControlCursor(person) {
  const ground = project(person.x, person.y);
  context.beginPath();
  context.ellipse(ground.x, ground.y + 3, 21 * ground.scale, 7 * ground.scale, 0, 0, Math.PI * 2);
  context.strokeStyle = "#fff078";
  context.lineWidth = 3;
  context.shadowColor = "#fff078";
  context.shadowBlur = 9;
  context.stroke();
  context.shadowBlur = 0;
}

function drawOverlay() {
  if (mode === "playing" && goalPause <= 0) return;
  const title = mode === "ready" ? "READY?" : mode === "ended" ? "FULL TIME" : "GOAL!";
  context.fillStyle = "#07110c7a";
  context.fillRect(0, 184, canvas.width, canvas.height - 184);
  context.fillStyle = "#f8f6e8";
  context.font = "900 54px 'Barlow Condensed', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(title, canvas.width / 2, 340);
  if (mode === "ready") {
    context.fillStyle = "#d1e5d0";
    context.font = "700 15px 'Noto Sans JP', sans-serif";
    context.fillText("キックオフで試合開始", canvas.width / 2, 382);
  }
}

function draw() {
  drawField();
  const actors = [
    { y: player.y, draw: () => drawPlayer(player, "#37ba64", "#176d3f", "1") },
    { y: playerMate.y, draw: () => drawPlayer(playerMate, "#5bc8da", "#28788b", "2") },
    { y: cpu.y, draw: () => drawPlayer(cpu, "#e56f4c", "#832f32", "1") },
    { y: cpuMate.y, draw: () => drawPlayer(cpuMate, "#e39a55", "#94552c", "2") },
    { y: playerDefender.y, draw: () => drawPlayer(playerDefender, "#37ba64", "#176d3f", "GK") },
    { y: cpuDefender.y, draw: () => drawPlayer(cpuDefender, "#e56f4c", "#832f32", "GK") },
    { y: ball.y, draw: drawBall },
  ];
  actors.sort((first, second) => first.y - second.y).forEach((actor) => actor.draw());
  drawControlCursor(selectedPlayer);
  drawOverlay();
}

function frame(timestamp) {
  const dt = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.04) : 0;
  previousFrame = timestamp;
  update(dt);
  updateScoreboard();
  draw();
  requestAnimationFrame(frame);
}

const keyMap = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
};

document.addEventListener("keydown", (event) => {
  const direction = keyMap[event.code];
  if (direction) {
    event.preventDefault();
    keys.add(direction);
  } else if (
    event.code === "Space"
    || event.key === " "
    || event.key === "Space"
    || event.key === "Spacebar"
    || event.keyCode === 32
  ) {
    event.preventDefault();
    if (!event.repeat) shoot();
  } else if (event.code === "KeyE") {
    event.preventDefault();
    if (!event.repeat) pass();
  }
}, true);

window.addEventListener("keyup", (event) => {
  const direction = keyMap[event.code];
  if (direction) keys.delete(direction);
});

window.addEventListener("blur", () => keys.clear());
kickoffButton.addEventListener("click", startMatch);
shootButton.addEventListener("click", shoot);
passButton.addEventListener("click", pass);
musicToggle.addEventListener("click", () => {
  musicEnabled = !musicEnabled;
  updateAudioButtons();
  if (musicEnabled) startMusic();
  else stopMusic();
});
soundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  updateAudioButtons();
});
crowdToggle.addEventListener("click", () => {
  crowdEnabled = !crowdEnabled;
  updateAudioButtons();
  if (crowdEnabled) startCrowd();
  else stopCrowd();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopMusic();
    stopCrowd();
  } else {
    startMusic();
    startCrowd();
  }
});

document.querySelectorAll("[data-control]").forEach((button) => {
  const direction = button.dataset.control;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    keys.add(direction);
    button.setPointerCapture(event.pointerId);
  });
  const release = () => keys.delete(direction);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

updateAudioButtons();
resetMatch();
requestAnimationFrame(frame);
