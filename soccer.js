const canvas = document.querySelector("#soccer-field");
const context = canvas.getContext("2d");
const playerScoreElement = document.querySelector("#player-score");
const cpuScoreElement = document.querySelector("#cpu-score");
const timeElement = document.querySelector("#match-time");
const statusElement = document.querySelector("#game-status");
const possessionElement = document.querySelector("#possession-state");
const kickoffButton = document.querySelector("#kickoff-button");
const shootButton = document.querySelector("#shoot-button");
const field = { left: 42, right: 918, top: 42, bottom: 538, goalTop: 220, goalBottom: 360 };
const keys = new Set();
const player = {
  x: 420, y: 290, radius: 20, speed: 280,
  facingX: 1, facingY: 0, moving: false, tackleCooldown: 0,
};
const cpu = {
  x: 540, y: 290, radius: 20, speed: 280,
  facingX: -1, facingY: 0, moving: false, tackleCooldown: 0,
  shotCooldown: 0, thinkCooldown: 0, targetX: 540, targetY: 290,
};
const playerDefender = {
  x: 112, y: 290, radius: 20, speed: 45,
  facingX: 1, facingY: 0, moving: false,
};
const cpuDefender = {
  x: 848, y: 290, radius: 20, speed: 45,
  facingX: -1, facingY: 0, moving: false,
};
const ball = { x: 480, y: 290, radius: 10, vx: 0, vy: 0 };

let playerScore = 0;
let cpuScore = 0;
let timeLeft = 60;
let mode = "ready";
let holder = null;
let goalPause = 0;
let ballPickupDelay = 0;
let previousFrame = 0;
let gameTime = 0;

function setStatus(message) {
  statusElement.textContent = message;
}

function setHolder(nextHolder) {
  holder = nextHolder;
  possessionElement.textContent = holder === "player"
    ? "ボール：YOU"
    : holder === "cpu" ? "ボール：CPU" : "ボール：ルーズ";
  possessionElement.dataset.owner = holder ?? "loose";
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
  player.x = 420;
  player.y = 290;
  player.facingX = 1;
  player.facingY = 0;
  player.moving = false;
  player.tackleCooldown = 0;
  cpu.x = 540;
  cpu.y = 290;
  cpu.facingX = -1;
  cpu.facingY = 0;
  cpu.moving = false;
  cpu.tackleCooldown = 0.9;
  cpu.shotCooldown = 0.65;
  cpu.thinkCooldown = 0;
  cpu.targetX = cpu.x;
  cpu.targetY = cpu.y;
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
  ballPickupDelay = 0;
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
  kickoffButton.textContent = "もう一度プレイ";
}

function startMatch() {
  if (mode === "ended") resetMatch();
  if (mode === "ready") {
    mode = "playing";
    kickoffButton.textContent = "試合をリセット";
    setStatus("試合開始！ ボールに近づくと自動でドリブルします。");
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
  const dx = Number(keys.has("right")) - Number(keys.has("left"));
  const dy = Number(keys.has("down")) - Number(keys.has("up"));
  const length = Math.hypot(dx, dy);
  player.moving = length > 0;
  if (!length) return;
  const moveX = dx / length;
  const moveY = dy / length;
  const speed = holder === "player" ? player.speed * 0.84 : player.speed;
  player.x = clamp(player.x + moveX * speed * dt, field.left + player.radius, field.right - player.radius);
  player.y = clamp(player.y + moveY * speed * dt, field.top + player.radius, field.bottom - player.radius);
  player.facingX = moveX;
  player.facingY = moveY;
}

function syncHeldBall(person) {
  const offset = person.radius + ball.radius + 3;
  ball.x = clamp(person.x + person.facingX * offset, field.left - 4, field.right + 4);
  ball.y = clamp(person.y + person.facingY * offset, field.top + 4, field.bottom - 4);
  ball.vx = 0;
  ball.vy = 0;
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
  if (holder !== "player") {
    if (distanceBetween(player, ball) > player.radius + ball.radius + 42) {
      setStatus("ボールに近づくと自動でキープできます！");
      return;
    }
    setHolder("player");
    syncHeldBall(player);
  }
  const aimOffset = keys.has("up") ? -58 : keys.has("down") ? 58 : 0;
  const targetY = aimOffset
    ? clamp(ball.y + aimOffset, field.goalTop + 14, field.goalBottom - 14)
    : (field.goalTop + field.goalBottom) / 2;
  const targetX = field.right + 38;
  const dx = targetX - ball.x;
  const dy = targetY - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  setHolder(null);
  ballPickupDelay = 0.22;
  ball.vx = (dx / length) * 690 + player.facingX * 28;
  ball.vy = (dy / length) * 690 + player.facingY * 28;
  setStatus("シュート！");
}

function shootForCpu() {
  if (cpu.shotCooldown > 0) return;
  syncHeldBall(cpu);
  const targetX = field.left - 38;
  const targetY = clamp(
    chooseShotTargetY(cpu, player, targetX) + Math.sin(gameTime * 5.7) * 55,
    field.goalTop - 8,
    field.goalBottom + 8,
  );
  const dx = targetX - ball.x;
  const dy = targetY - ball.y;
  const length = Math.hypot(dx, dy) || 1;
  setHolder(null);
  ballPickupDelay = 0.22;
  ball.vx = (dx / length) * 590;
  ball.vy = (dy / length) * 590;
  cpu.shotCooldown = 1.15;
  setStatus("CPUがシュート！");
}

function thinkCpu() {
  if (holder === "cpu") {
    cpu.targetX = Math.max(field.left + 90, cpu.x - 55);
    cpu.targetY = clamp(
      chooseShotTargetY(cpu, player, field.left - 38),
      field.goalTop + 20,
      field.goalBottom - 20,
    );
    if (cpu.x < field.left + 250 || distanceBetween(cpu, player) < 76) shootForCpu();
    return;
  }

  if (holder === "player") {
    const approachX = clamp(player.x + 38, field.left + 34, field.right - 34);
    cpu.targetX = approachX;
    cpu.targetY = clamp(player.y + (290 - player.y) * 0.12, field.top + 24, field.bottom - 24);
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
}

function moveCpu(dt) {
  cpu.shotCooldown = Math.max(0, cpu.shotCooldown - dt);
  cpu.tackleCooldown = Math.max(0, cpu.tackleCooldown - dt);
  cpu.thinkCooldown -= dt;
  if (cpu.thinkCooldown <= 0) {
    thinkCpu();
    cpu.thinkCooldown = 0.22;
  }

  const speed = holder === "cpu" ? cpu.speed * 0.84 : cpu.speed;
  moveToward(cpu, cpu.targetX, cpu.targetY, dt, speed);

  if (holder === "player" && cpu.tackleCooldown === 0 && distanceBetween(cpu, player) < 43) {
    setHolder("cpu");
    player.tackleCooldown = 0.75;
    cpu.tackleCooldown = 1.35;
    cpu.shotCooldown = Math.max(cpu.shotCooldown, 0.55);
    cpu.thinkCooldown = 0;
    setStatus("CPUにボールを奪われた！");
  }
}

function moveDefenders(dt) {
  const centerY = (field.goalTop + field.goalBottom) / 2;
  const playerTargetY = ball.x < field.left + 170
    ? clamp(ball.y, field.goalTop + 20, field.goalBottom - 20)
    : centerY;
  const cpuTargetY = ball.x > field.right - 170
    ? clamp(ball.y, field.goalTop + 20, field.goalBottom - 20)
    : centerY;
  moveToward(playerDefender, playerDefender.x, playerTargetY, dt);
  moveToward(cpuDefender, cpuDefender.x, cpuTargetY, dt);
  playerDefender.facingX = 1;
  cpuDefender.facingX = -1;
}

function acquireLooseBall() {
  if (holder !== null || ballPickupDelay > 0) return;
  const playerDistance = distanceBetween(player, ball);
  const cpuDistance = distanceBetween(cpu, ball);
  const pickupDistance = player.radius + ball.radius + 22;
  if (playerDistance <= pickupDistance && playerDistance <= cpuDistance) {
    setHolder("player");
    setStatus("ボールキープ！ ドリブルで抜いてシュート！");
  } else if (cpuDistance <= pickupDistance) {
    setHolder("cpu");
    cpu.thinkCooldown = 0;
    setStatus("CPUがボールをキープ！");
  }
}

function tryPlayerTackle() {
  if (holder !== "cpu" || player.tackleCooldown > 0 || !player.moving) return;
  if (distanceBetween(player, cpu) < 43) {
    setHolder("player");
    player.tackleCooldown = 0.75;
    cpu.tackleCooldown = 0.9;
    setStatus("ナイスボール奪取！");
  }
}

function resolvePlayerContact() {
  const dx = cpu.x - player.x;
  const dy = cpu.y - player.y;
  const distance = Math.hypot(dx, dy);
  const minimumDistance = player.radius + cpu.radius;
  if (distance === 0 || distance >= minimumDistance) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const push = (minimumDistance - distance) / 2;
  player.x = clamp(player.x - nx * push, field.left + player.radius, field.right - player.radius);
  player.y = clamp(player.y - ny * push, field.top + player.radius, field.bottom - player.radius);
  cpu.x = clamp(cpu.x + nx * push, field.left + cpu.radius, field.right - cpu.radius);
  cpu.y = clamp(cpu.y + ny * push, field.top + cpu.radius, field.bottom - cpu.radius);
}

function scoreGoal(forPlayer) {
  setHolder(null);
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
  ballPickupDelay = Math.max(0, ballPickupDelay - dt);
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
  moveDefenders(dt);
  tryPlayerTackle();
  if (holder === "player") syncHeldBall(player);
  else if (holder === "cpu") syncHeldBall(cpu);
  else {
    updateBall(dt);
    if (goalPause > 0) {
      mode = "goalPause";
      return;
    }
    acquireLooseBall();
  }
  resolvePlayerContact();
  if (holder === "player") syncHeldBall(player);
  else if (holder === "cpu") syncHeldBall(cpu);
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
  context.fillText("ONE ON ONE  •  STREET MATCH", canvas.width / 2, 171);
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
    { y: cpu.y, draw: () => drawPlayer(cpu, "#e56f4c", "#832f32", "2") },
    { y: playerDefender.y, draw: () => drawPlayer(playerDefender, "#37ba64", "#176d3f", "3") },
    { y: cpuDefender.y, draw: () => drawPlayer(cpuDefender, "#e56f4c", "#832f32", "4") },
    { y: ball.y, draw: drawBall },
  ];
  actors.sort((first, second) => first.y - second.y).forEach((actor) => actor.draw());
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
  }
}, true);

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
