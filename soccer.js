const canvas = document.querySelector("#soccer-field");
const context = canvas.getContext("2d");
const playerScoreElement = document.querySelector("#player-score");
const cpuScoreElement = document.querySelector("#cpu-score");
const timeElement = document.querySelector("#match-time");
const statusElement = document.querySelector("#game-status");
const kickoffButton = document.querySelector("#kickoff-button");
const shootButton = document.querySelector("#shoot-button");
const field = { left: 42, right: 918, top: 42, bottom: 538, goalTop: 220, goalBottom: 360 };
const keys = new Set();
const player = { x: 175, y: 290, radius: 24, speed: 265, facingX: 1, facingY: 0 };
const cpu = { x: 785, y: 290, radius: 24, speed: 205, cooldown: 0 };
const ball = { x: 480, y: 290, radius: 11, vx: 0, vy: 0 };

let playerScore = 0;
let cpuScore = 0;
let timeLeft = 60;
let mode = "ready";
let goalPause = 0;
let previousFrame = 0;

function setStatus(message) {
  statusElement.textContent = message;
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
  player.x = 175;
  player.y = 290;
  player.facingX = 1;
  player.facingY = 0;
  cpu.x = 785;
  cpu.y = 290;
  cpu.cooldown = 0.5;
  ball.x = 480;
  ball.y = 290;
  ball.vx = 0;
  ball.vy = 0;
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
  kickoffButton.textContent = "もう一度プレイ";
}

function startMatch() {
  if (mode === "ended") resetMatch();
  if (mode === "ready") {
    mode = "playing";
    kickoffButton.textContent = "試合をリセット";
    setStatus("試合開始！ ボールを奪ってシュート！");
    canvas.focus({ preventScroll: true });
  } else {
    resetMatch();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function placeBallAheadOf(person, directionX, directionY) {
  const forwardOffset = (ball.x - person.x) * directionX + (ball.y - person.y) * directionY;
  const minimumOffset = person.radius + ball.radius + 2;
  if (forwardOffset >= minimumOffset) return;
  ball.x = person.x + directionX * minimumOffset;
  ball.y = person.y + directionY * minimumOffset;
}

function shoot() {
  if (mode !== "playing" || goalPause > 0) return;
  const distance = Math.hypot(ball.x - player.x, ball.y - player.y);
  if (distance > player.radius + ball.radius + 22) {
    setStatus("ボールに近づいてからシュート！");
    return;
  }
  const aimOffset = keys.has("up") ? -72 : keys.has("down") ? 72 : 0;
  const targetY = clamp(ball.y + (290 - ball.y) * 0.24 + aimOffset, field.goalTop + 18, field.goalBottom - 18);
  const dx = field.right + 45 - ball.x;
  const dy = targetY - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  const directionX = dx / length;
  const directionY = dy / length;
  placeBallAheadOf(player, directionX, directionY);
  ball.vx = directionX * 650 + player.facingX * 28;
  ball.vy = directionY * 650 + player.facingY * 28;
  setStatus("シュート！");
}

function movePlayer(dt) {
  const dx = Number(keys.has("right")) - Number(keys.has("left"));
  const dy = Number(keys.has("down")) - Number(keys.has("up"));
  const length = Math.hypot(dx, dy);
  if (!length) return;
  const moveX = dx / length;
  const moveY = dy / length;
  player.x = clamp(player.x + moveX * player.speed * dt, field.left + player.radius, field.right - player.radius);
  player.y = clamp(player.y + moveY * player.speed * dt, field.top + player.radius, field.bottom - player.radius);
  player.facingX = moveX;
  player.facingY = moveY;
}

function moveCpu(dt) {
  const dx = ball.x - cpu.x;
  const dy = ball.y - cpu.y;
  const distance = Math.hypot(dx, dy);
  cpu.cooldown = Math.max(0, cpu.cooldown - dt);
  if (distance < 1) return;
  const speed = distance < 110 ? cpu.speed * 0.72 : cpu.speed;
  cpu.x = clamp(cpu.x + (dx / distance) * speed * dt, field.left + cpu.radius, field.right - cpu.radius);
  cpu.y = clamp(cpu.y + (dy / distance) * speed * dt, field.top + cpu.radius, field.bottom - cpu.radius);
  if (distance <= cpu.radius + ball.radius + 15 && cpu.cooldown === 0) {
    const targetY = clamp(ball.y + (290 - ball.y) * 0.18, field.goalTop + 16, field.goalBottom - 16);
    const shotX = field.left - 45 - ball.x;
    const shotY = targetY - ball.y;
    const shotLength = Math.hypot(shotX, shotY) || 1;
    const directionX = shotX / shotLength;
    const directionY = shotY / shotLength;
    placeBallAheadOf(cpu, directionX, directionY);
    ball.vx = directionX * 475;
    ball.vy = directionY * 475;
    cpu.cooldown = 0.9;
    setStatus("CPUのシュート！");
  }
}

function resolvePlayerContact() {
  for (const person of [player, cpu]) {
    const dx = ball.x - person.x;
    const dy = ball.y - person.y;
    const distance = Math.hypot(dx, dy);
    const minimumDistance = person.radius + ball.radius;
    if (distance === 0 || distance >= minimumDistance) continue;
    const nx = dx / distance;
    const ny = dy / distance;
    ball.x = person.x + nx * minimumDistance;
    ball.y = person.y + ny * minimumDistance;
    ball.vx += nx * 22;
    ball.vy += ny * 22;
  }
}

function scoreGoal(forPlayer) {
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

  const insideGoalMouth = ball.y - ball.radius > field.goalTop && ball.y + ball.radius < field.goalBottom;
  if (insideGoalMouth && ball.x - ball.radius < field.left) {
    if (ball.x < field.left - 22) scoreGoal(false);
    return;
  }
  if (insideGoalMouth && ball.x + ball.radius > field.right) {
    if (ball.x > field.right + 22) scoreGoal(true);
    return;
  }
  if (ball.x - ball.radius < field.left || ball.x + ball.radius > field.right) {
    ball.x = clamp(ball.x, field.left + ball.radius, field.right - ball.radius);
    ball.vx *= -0.72;
  }
}

function update(dt) {
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
  movePlayer(dt);
  moveCpu(dt);
  updateBall(dt);
  if (goalPause > 0) {
    mode = "goalPause";
    return;
  }
  resolvePlayerContact();
  const playerGap = Math.hypot(cpu.x - player.x, cpu.y - player.y);
  if (playerGap < player.radius + cpu.radius) {
    const angle = Math.atan2(cpu.y - player.y, cpu.x - player.x);
    const push = (player.radius + cpu.radius - playerGap) / 2;
    player.x = clamp(player.x - Math.cos(angle) * push, field.left + player.radius, field.right - player.radius);
    player.y = clamp(player.y - Math.sin(angle) * push, field.top + player.radius, field.bottom - player.radius);
    cpu.x = clamp(cpu.x + Math.cos(angle) * push, field.left + cpu.radius, field.right - cpu.radius);
    cpu.y = clamp(cpu.y + Math.sin(angle) * push, field.top + cpu.radius, field.bottom - cpu.radius);
  }
}

function drawGoal(x, direction) {
  context.fillStyle = "#e7f1df";
  context.fillRect(x, field.goalTop, direction * 34, field.goalBottom - field.goalTop);
  context.strokeStyle = "#f4f7ed";
  context.lineWidth = 3;
  context.strokeRect(x, field.goalTop, direction * 34, field.goalBottom - field.goalTop);
  context.lineWidth = 1;
  context.strokeStyle = "#a9b5a5";
  for (let y = field.goalTop + 20; y < field.goalBottom; y += 20) {
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + direction * 34, y);
    context.stroke();
  }
  for (let offset = 10; offset < 34; offset += 10) {
    context.beginPath();
    context.moveTo(x + direction * offset, field.goalTop);
    context.lineTo(x + direction * offset, field.goalBottom);
    context.stroke();
  }
}

function drawField() {
  context.fillStyle = "#14271b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#27733c";
  context.fillRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
  const stripeWidth = (field.right - field.left) / 10;
  for (let index = 0; index < 10; index += 1) {
    if (index % 2 === 0) continue;
    context.fillStyle = "#ffffff0b";
    context.fillRect(field.left + index * stripeWidth, field.top, stripeWidth, field.bottom - field.top);
  }
  context.strokeStyle = "#e5f1dcbb";
  context.lineWidth = 3;
  context.strokeRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
  context.beginPath();
  context.moveTo(canvas.width / 2, field.top);
  context.lineTo(canvas.width / 2, field.bottom);
  context.stroke();
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 76, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#e5f1dc";
  context.beginPath();
  context.arc(canvas.width / 2, canvas.height / 2, 4, 0, Math.PI * 2);
  context.fill();
  context.strokeRect(field.left, 184, 110, 212);
  context.strokeRect(field.right - 110, 184, 110, 212);
  context.strokeRect(field.left, 230, 42, 120);
  context.strokeRect(field.right - 42, 230, 42, 120);
  drawGoal(field.left, -1);
  drawGoal(field.right, 1);
}

function drawPlayer(person, color, number, facingX, facingY) {
  context.save();
  context.shadowColor = "#09130dcc";
  context.shadowBlur = 12;
  context.shadowOffsetY = 5;
  context.fillStyle = color;
  context.beginPath();
  context.arc(person.x, person.y, person.radius, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = 3;
  context.strokeStyle = "#f5f7ee";
  context.stroke();
  context.fillStyle = "#f8f6ec";
  context.font = "800 14px 'Barlow Condensed', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(number, person.x, person.y + 1);
  context.strokeStyle = "#ffffffcc";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(person.x + facingX * 18, person.y + facingY * 18);
  context.lineTo(person.x + facingX * 31, person.y + facingY * 31);
  context.stroke();
  context.restore();
}

function drawBall() {
  context.save();
  context.shadowColor = "#0008";
  context.shadowBlur = 7;
  context.shadowOffsetY = 3;
  context.fillStyle = "#fffdf1";
  context.beginPath();
  context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  context.fill();
  context.shadowColor = "transparent";
  context.fillStyle = "#26332a";
  context.beginPath();
  context.arc(ball.x, ball.y, 3.5, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawOverlay() {
  if (mode === "playing" && goalPause <= 0) return;
  const title = mode === "ready" ? "READY?" : mode === "ended" ? "FULL TIME" : "GOAL!";
  context.fillStyle = "#07110c7a";
  context.fillRect(field.left, field.top, field.right - field.left, field.bottom - field.top);
  context.fillStyle = "#f8f6e8";
  context.font = "900 54px 'Barlow Condensed', sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(title, canvas.width / 2, canvas.height / 2);
  if (mode === "ready") {
    context.fillStyle = "#d1e5d0";
    context.font = "700 15px 'Noto Sans JP', sans-serif";
    context.fillText("キックオフで試合開始", canvas.width / 2, canvas.height / 2 + 42);
  }
}

function draw() {
  drawField();
  drawPlayer(player, "#52d676", "1", player.facingX, player.facingY);
  drawPlayer(cpu, "#f17856", "2", -1, 0);
  drawBall();
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

window.addEventListener("keydown", (event) => {
  const direction = keyMap[event.code];
  if (direction) {
    event.preventDefault();
    keys.add(direction);
  } else if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat) shoot();
  }
});

window.addEventListener("keyup", (event) => {
  const direction = keyMap[event.code];
  if (direction) keys.delete(direction);
});

window.addEventListener("blur", () => keys.clear());
kickoffButton.addEventListener("click", startMatch);
shootButton.addEventListener("click", shoot);

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

resetMatch();
requestAnimationFrame(frame);
