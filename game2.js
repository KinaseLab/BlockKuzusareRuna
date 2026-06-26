const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const livesEl = document.querySelector("#lives");
const restartBtn = document.querySelector("#restart");
const styleToggleBtn = document.querySelector("#styleToggle");
const controlsEl = document.querySelector("#controls");
const controlsToggleBtn = document.querySelector("#controlsToggle");
const switchBlockBtn = document.querySelector("#switchBlock");
const titleScreenEl = document.querySelector("#titleScreen");
const startGameBtn = document.querySelector("#startGame");
const titleMessageEl = document.querySelector("#titleMessage");

const titleMessages = [
  "You can make it.\nDon't give up.",
  "最後の一人になってもあきらめないで。",
  "逃げるは恥だが役に立つ。",
  "逃げるが勝ち。",
  "最後まで残ったブロックが勝ち。\ngood job",
];

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const touchDirs = new Set();
const bestKey = "block-runner-breakout-best";
const styleKey = "block-runner-breakout-style";
const controlsKey = "block-runner-breakout-controls";
const brick = { w: 52, h: 18, gap: 6, rows: 6, cols: 14 };
const playableCount = 8;
const wallPushWeight = 0.3;
const maxBalls = 8;
const powerupBaseChance = 0.5;
const powerupMaxChance = 0.9;
const powerupScoreStep = 500;
const powerupChanceStep = 0.1;
const powerupChaseSafeTime = 0.45;
const powerupChaseMaxTime = 3.2;
const dashTapWindow = 260;
const dashDuration = 0.20;
const dashCooldown = 0.12;
const dashSpeedMultiplier = 3;
const powerTypes = [
  { id: "wide", label: "W", color: "#8ecae6" },
  { id: "addBall", label: "+", color: "#f6bd60" },
  { id: "speedUp", label: "S", color: "#f28482" },
  { id: "split3", label: "3", color: "#cdb4db" },
  { id: "magnet", label: "A", color: "#b8f2e6" },
];

let best = Number(localStorage.getItem(bestKey) || 0);
let renderMode = localStorage.getItem(styleKey) || "retro";
let controlsVisible = localStorage.getItem(controlsKey);
controlsVisible = controlsVisible === null ? matchMedia("(pointer: coarse)").matches : controlsVisible === "true";
let gameStarted = false;
let state;
let lastTime = 0;

bestEl.textContent = best;
applyRenderMode();
applyControlsVisibility();

function resetGame() {
  const layout = makeWallLayout();
  state = {
    score: 0,
    levelTime: 0,
    countdown: 3,
    invincible: 1.2,
    gameOver: false,
    players: layout.players,
    activePlayerIndex: 0,
    player: layout.players[0],
    paddle: { x: W / 2 - 84, y: H - 44, w: 168, baseW: 168, h: 18, speed: 980 },
    balls: [newBall(W * 0.35, H * 0.54, 250, 245)],
    ballMilestones: { second: false, third: false },
    walls: layout.walls,
    powerups: [],
    sparks: [],
    effects: { wide: 0, magnet: 0 },
    dash: { time: 0, cooldown: 0, lastKey: "", lastTap: 0 },
  };
  updateHud();
}

function newBall(x, y, vx, vy) {
  return { x, y, r: 10, vx, vy, hitFlash: 0 };
}

function makeWallLayout() {
  const walls = [];
  const players = [];
  const startX = (W - (brick.cols * brick.w + (brick.cols - 1) * brick.gap)) / 2;
  const startY = 168;
  const playerIndexes = new Set();
  while (playerIndexes.size < playableCount) {
    playerIndexes.add(Math.floor(Math.random() * brick.rows * brick.cols));
  }
  let index = 0;

  for (let row = 0; row < brick.rows; row += 1) {
    for (let col = 0; col < brick.cols; col += 1) {
      const cell = {
        x: startX + col * (brick.w + brick.gap),
        y: startY + row * (brick.h + brick.gap),
        w: brick.w,
        h: brick.h,
        row,
        col,
      };

      if (playerIndexes.has(index)) {
        players.push({ ...cell, speed: 360 });
      } else {
        walls.push(cell);
      }
      index += 1;
    }
  }

  return { walls, players };
}

function makeWallsAroundPlayers() {
  const walls = [];
  const startX = (W - (brick.cols * brick.w + (brick.cols - 1) * brick.gap)) / 2;
  const startY = 168;

  for (let row = 0; row < brick.rows; row += 1) {
    for (let col = 0; col < brick.cols; col += 1) {
      const cell = {
        x: startX + col * (brick.w + brick.gap),
        y: startY + row * (brick.h + brick.gap),
        w: brick.w,
        h: brick.h,
        row,
        col,
      };

      if (!state.players.some((player) => rectsOverlap(player, cell))) {
        walls.push(cell);
      }
    }
  }

  return walls;
}

function updateHud() {
  scoreEl.textContent = Math.floor(state.score);
  livesEl.textContent = state.players.length;
  bestEl.textContent = best;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circleRectHit(ball, rect) {
  const cx = clamp(ball.x, rect.x, rect.x + rect.w);
  const cy = clamp(ball.y, rect.y, rect.y + rect.h);
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  return dx * dx + dy * dy <= ball.r * ball.r;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function blockBounds(block, axis, value) {
  const next = { ...block, [axis]: value };
  return next.x >= 18 && next.x + next.w <= W - 18 && next.y >= 62 && next.y + next.h <= H - 106;
}

function activePlayer() {
  return state.players[state.activePlayerIndex];
}

function syncActivePlayer() {
  state.player = activePlayer();
}

function switchActivePlayer() {
  if (state.gameOver || state.countdown > 0 || state.players.length === 0) return;
  state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  syncActivePlayer();
  addSparks(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2, "#e63946");
}

function applyRenderMode() {
  canvas.classList.toggle("retro", renderMode === "retro");
  canvas.classList.toggle("modern", renderMode === "modern");
  ctx.imageSmoothingEnabled = renderMode === "modern";
  styleToggleBtn.textContent = renderMode === "retro" ? "Retro" : "Modern";
}

function toggleRenderMode() {
  renderMode = renderMode === "retro" ? "modern" : "retro";
  localStorage.setItem(styleKey, renderMode);
  applyRenderMode();
}

function bounceFromRect(ball, rect, boost = 1) {
  const previousX = ball.x - ball.vx * 0.016;
  const previousY = ball.y - ball.vy * 0.016;
  const fromLeft = previousX <= rect.x;
  const fromRight = previousX >= rect.x + rect.w;
  const fromTop = previousY <= rect.y;
  const fromBottom = previousY >= rect.y + rect.h;

  if ((fromLeft || fromRight) && !(fromTop || fromBottom)) {
    ball.vx *= -1;
    ball.x = fromLeft ? rect.x - ball.r : rect.x + rect.w + ball.r;
  } else {
    ball.vy *= -1;
    ball.y = fromTop ? rect.y - ball.r : rect.y + rect.h + ball.r;
  }

  ball.vx *= boost;
  ball.vy *= boost;
  ball.hitFlash = 0.12;
}

function spawnPowerup(x, y) {
  const scoreMultiplier = 1 + Math.floor(state.score / powerupScoreStep) * powerupChanceStep;
  const spawnChance = Math.min(powerupMaxChance, powerupBaseChance * scoreMultiplier);
  if (Math.random() > spawnChance) return;
  const type = powerTypes[Math.floor(Math.random() * powerTypes.length)];
  state.powerups.push({
    x,
    y,
    w: 28,
    h: 18,
    vy: 98,
    type: type.id,
    label: type.label,
    color: type.color,
  });
}

function applyOpponentPower(type) {
  if (type === "wide") {
    state.effects.wide = 9;
    state.paddle.w = 212;
  }

  if (type === "addBall") {
    addBallFrom(selectSplitSourceBall());
  }

  if (type === "speedUp") {
    speedUpBalls(1.22);
  }

  if (type === "split3") {
    splitBallIntoThree(selectSplitSourceBall());
  }

  if (type === "magnet") {
    state.effects.magnet = 8;
  }

  addSparks(state.paddle.x + state.paddle.w / 2, state.paddle.y, "#8ecae6");
}

function addBallFrom(source) {
  if (!source || state.balls.length >= maxBalls) return;

  const speed = Math.max(280, Math.hypot(source.vx, source.vy));
  const angle = source.vx >= 0 ? Math.PI * 0.68 : Math.PI * 0.32;
  state.balls.push(newBall(source.x, source.y, Math.cos(angle) * speed, -Math.abs(Math.sin(angle) * speed)));
}

function speedUpBalls(multiplier) {
  state.balls.forEach((ball) => {
    ball.vx *= multiplier;
    ball.vy *= multiplier;
    ball.hitFlash = 0.2;
  });
}

function splitBallIntoThree(source) {
  if (!source) return;

  const speed = Math.max(300, Math.hypot(source.vx, source.vy));
  const baseAngle = Math.atan2(source.vy, source.vx);
  const angles = [baseAngle - 0.55, baseAngle, baseAngle + 0.55];
  source.vx = Math.cos(angles[0]) * speed;
  source.vy = Math.sin(angles[0]) * speed;
  source.hitFlash = 0.22;

  angles.slice(1).forEach((angle) => {
    if (state.balls.length < maxBalls) {
      state.balls.push(newBall(source.x, source.y, Math.cos(angle) * speed, Math.sin(angle) * speed));
    }
  });
}

function selectSplitSourceBall() {
  return state.balls.reduce((bestBall, ball) => (paddleThreat(ball) < paddleThreat(bestBall) ? ball : bestBall), state.balls[0]);
}

function addSparks(x, y, color) {
  for (let i = 0; i < 12; i += 1) {
    state.sparks.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 220,
      life: 0.35 + Math.random() * 0.25,
      color,
    });
  }
}

function removePlayableBlock(player) {
  const removedIndex = state.players.indexOf(player);
  if (removedIndex < 0) return;

  addSparks(player.x + player.w / 2, player.y + player.h / 2, "#f06449");
  state.players.splice(removedIndex, 1);
  state.invincible = 0.8;

  if (state.players.length === 0) {
    state.gameOver = true;
    best = Math.max(best, Math.floor(state.score));
    localStorage.setItem(bestKey, String(best));
  } else {
    if (removedIndex < state.activePlayerIndex) {
      state.activePlayerIndex -= 1;
    } else if (removedIndex === state.activePlayerIndex) {
      state.activePlayerIndex = Math.min(removedIndex, state.players.length - 1);
    }
    syncActivePlayer();
  }

  updateHud();
}

function inputAxis() {
  const left = keys.has("arrowleft") || keys.has("a") || touchDirs.has("left");
  const right = keys.has("arrowright") || keys.has("d") || touchDirs.has("right");
  const up = keys.has("arrowup") || keys.has("w") || touchDirs.has("up");
  const down = keys.has("arrowdown") || keys.has("s") || touchDirs.has("down");
  return { x: Number(right) - Number(left), y: Number(down) - Number(up) };
}

function update(dt) {
  if (state.gameOver) return;

  if (state.countdown > 0) {
    state.countdown = Math.max(0, state.countdown - dt);
    state.invincible = Math.max(0, state.invincible - dt);
    updateSparks(dt);
    updateHud();
    return;
  }

  state.levelTime += dt;
  state.invincible = Math.max(0, state.invincible - dt);
  state.effects.wide = Math.max(0, state.effects.wide - dt);
  state.effects.magnet = Math.max(0, state.effects.magnet - dt);
  state.dash.time = Math.max(0, state.dash.time - dt);
  state.dash.cooldown = Math.max(0, state.dash.cooldown - dt);
  state.score += dt * 12;

  if (state.effects.wide <= 0) {
    state.paddle.w += (state.paddle.baseW - state.paddle.w) * Math.min(1, dt * 8);
  }

  if (!state.ballMilestones.second && state.levelTime > 18 && state.balls.length === 1) {
    state.balls.push(newBall(W * 0.72, H * 0.45, -280, 230));
    state.ballMilestones.second = true;
  }
  if (!state.ballMilestones.third && state.levelTime > 42 && state.balls.length === 2) {
    state.balls.push(newBall(W * 0.52, H * 0.33, 310, 255));
    state.ballMilestones.third = true;
  }

  movePlayer(dt);
  movePaddle(dt);
  moveBalls(dt);
  updatePowerups(dt);
  updateSparks(dt);
  updateHud();
}

function movePlayer(dt) {
  syncActivePlayer();
  const axis = inputAxis();
  const len = Math.hypot(axis.x, axis.y) || 1;
  const dashBoost = state.dash.time > 0 && len > 0 ? dashSpeedMultiplier : 1;
  const speed = state.player.speed * dashBoost;
  const dx = (axis.x / len) * speed * dt;
  const dy = (axis.y / len) * speed * dt;

  state.player.x += dx;
  state.player.x = clamp(state.player.x, 18, W - state.player.w - 18);
  resolvePlayerWallCollisions("x", dx);

  state.player.y += dy;
  state.player.y = clamp(state.player.y, 62, H - 106);
  resolvePlayerWallCollisions("y", dy);
}

function resolvePlayerWallCollisions(axis, delta) {
  if (delta === 0) return;

  for (const block of pushableBlocks()) {
    if (!rectsOverlap(state.player, block)) continue;

    if (!tryPushBlock(block, axis, pushDistance(state.player, block, axis, delta) * wallPushWeight)) {
      settlePlayerAgainst(block, axis, delta);
    } else if (rectsOverlap(state.player, block)) {
      settlePlayerAgainst(block, axis, delta);
    }
  }

  state.player.x = clamp(state.player.x, 18, W - state.player.w - 18);
  state.player.y = clamp(state.player.y, 62, H - 106);
}

function inactivePlayers() {
  return state.players.filter((_, index) => index !== state.activePlayerIndex);
}

function pushableBlocks() {
  return state.walls.concat(inactivePlayers());
}

function settlePlayerAgainst(block, axis, delta) {
  if (axis === "x") {
    state.player.x = delta > 0 ? block.x - state.player.w : block.x + block.w;
  } else {
    state.player.y = delta > 0 ? block.y - state.player.h : block.y + block.h;
  }
}

function pushDistance(pusher, block, axis, delta) {
  if (axis === "x") {
    return delta > 0 ? pusher.x + pusher.w - block.x : pusher.x - (block.x + block.w);
  }

  return delta > 0 ? pusher.y + pusher.h - block.y : pusher.y - (block.y + block.h);
}

function tryPushBlock(block, axis, delta) {
  const movedBlocks = new Map();
  if (pushBlock(block, axis, delta, new Set(), movedBlocks)) return true;

  movedBlocks.forEach((position, movedBlock) => {
    movedBlock.x = position.x;
    movedBlock.y = position.y;
  });
  return false;
}

function pushBlock(block, axis, delta, visited, movedBlocks) {
  if (delta === 0) return true;
  if (visited.has(block)) return false;
  visited.add(block);

  const nextPosition = block[axis] + delta;
  if (!blockBounds(block, axis, nextPosition)) return false;

  const nextBlock = { ...block, [axis]: nextPosition };
  const blockers = pushableBlocks().filter((otherBlock) => otherBlock !== block);

  for (const blocker of blockers) {
    if (!rectsOverlap(nextBlock, blocker)) continue;
    if (!pushBlock(blocker, axis, pushDistance(nextBlock, blocker, axis, delta), visited, movedBlocks)) return false;
  }

  if (!movedBlocks.has(block)) movedBlocks.set(block, { x: block.x, y: block.y });
  block[axis] = nextPosition;
  return true;
}

function movePaddle(dt) {
  const targetBall = state.balls.reduce((bestBall, ball) => {
    const ballThreat = paddleThreat(ball);
    const bestThreat = paddleThreat(bestBall);
    return ballThreat < bestThreat ? ball : bestBall;
  }, state.balls[0]);
  const urgency = paddleThreat(targetBall);
  const ballX = predictPaddleCrossing(targetBall);
  const targetPowerup = selectPaddlePowerupTarget(urgency);
  const powerupPull = paddlePowerupPull(targetPowerup, urgency);
  const predictedX = targetPowerup ? ballX * (1 - powerupPull) + targetPowerup.x * powerupPull : ballX;
  const pressure = urgency < 0.55 ? 0 : Math.sin(state.levelTime * 1.8) * 10;
  const playerPull = urgency < 0.7 ? 0 : state.effects.magnet > 0 ? 0.28 : 0.12;
  const ballPull = 1 - playerPull;
  const halfPaddle = state.paddle.w / 2;
  const target = clamp((predictedX * ballPull + (state.player.x + state.player.w / 2) * playerPull) + pressure, halfPaddle + 12, W - halfPaddle - 12);
  const center = state.paddle.x + state.paddle.w / 2;
  const urgencyBoost = urgency < 0.35 ? 2.1 : urgency < 0.8 ? 1.45 : targetPowerup ? 1.25 : 1;
  state.paddle.x += clamp(target - center, -state.paddle.speed * urgencyBoost * dt, state.paddle.speed * urgencyBoost * dt);
  state.paddle.x = clamp(state.paddle.x, 12, W - state.paddle.w - 12);
}

function paddleThreat(ball) {
  if (ball.vy <= 0) return 1000 + (H - ball.y) / Math.max(120, Math.abs(ball.vy));
  return Math.max(0, (state.paddle.y - ball.r - ball.y) / Math.max(120, ball.vy));
}

function selectPaddlePowerupTarget(ballThreat) {
  if (ballThreat < powerupChaseSafeTime || state.powerups.length === 0) return null;

  const paddleCenter = state.paddle.x + state.paddle.w / 2;
  const bestPowerup = state.powerups.reduce((best, powerup) => {
    const score = paddlePowerupScore(powerup, paddleCenter, ballThreat);
    if (score === Infinity) return best;
    if (!best || score < best.score) return { powerup, score };
    return best;
  }, null);
  return bestPowerup ? bestPowerup.powerup : null;
}

function paddlePowerupScore(powerup, paddleCenter, ballThreat) {
  if (powerup.vy <= 0 || powerup.y > state.paddle.y + state.paddle.h) return Infinity;

  const timeToPaddle = (state.paddle.y - powerup.h / 2 - powerup.y) / powerup.vy;
  if (timeToPaddle < -0.18 || timeToPaddle > Math.min(powerupChaseMaxTime, ballThreat + 0.65)) return Infinity;

  const travelTime = Math.abs(powerup.x - paddleCenter) / Math.max(1, state.paddle.speed);
  const typeBonus = powerup.type === "addBall" || powerup.type === "split3" ? 0.18 : 0;
  return timeToPaddle + travelTime * 0.85 - typeBonus;
}

function paddlePowerupPull(powerup, ballThreat) {
  if (!powerup) return 0;
  if (ballThreat > 1.2) return 0.88;
  if (ballThreat > 0.75) return 0.68;
  return 0.38;
}

function predictPaddleCrossing(ball) {
  if (ball.vy <= 0) return ball.x;

  const timeToPaddle = Math.max(0, (state.paddle.y - ball.r - ball.y) / ball.vy);
  const minX = ball.r;
  const maxX = W - ball.r;
  const span = maxX - minX;
  const rawX = ball.x + ball.vx * timeToPaddle - minX;
  const folded = Math.abs(((rawX % (span * 2)) + span * 2) % (span * 2) - span);
  return minX + span - folded;
}

function moveBalls(dt) {
  for (let ballIndex = state.balls.length - 1; ballIndex >= 0; ballIndex -= 1) {
    const ball = state.balls[ballIndex];
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.hitFlash = Math.max(0, ball.hitFlash - dt);

    if (ball.x < ball.r) {
      ball.x = ball.r;
      ball.vx *= -1;
    }
    if (ball.x > W - ball.r) {
      ball.x = W - ball.r;
      ball.vx *= -1;
    }
    if (ball.y < 54 + ball.r) {
      ball.y = 54 + ball.r;
      ball.vy *= -1;
    }
    if (ball.y > H + ball.r) {
      if (state.balls.length > 1) {
        state.balls.splice(ballIndex, 1);
        continue;
      }

      resetBall(ball);
    }

    rescuePaddleCatch(ball);

    if (circleRectHit(ball, state.paddle) && ball.vy > 0) {
      const offset = (ball.x - (state.paddle.x + state.paddle.w / 2)) / (state.paddle.w / 2);
      ball.vx = offset * 390;
      ball.vy = -Math.abs(ball.vy) - 18;
      ball.y = state.paddle.y - ball.r;
      ball.hitFlash = 0.16;
    }

    for (let i = state.walls.length - 1; i >= 0; i -= 1) {
      const wall = state.walls[i];
      if (circleRectHit(ball, wall)) {
        bounceFromRect(ball, wall, 1.004);
        state.walls.splice(i, 1);
        state.score += 25;
        spawnPowerup(wall.x + wall.w / 2, wall.y + wall.h / 2);
        addSparks(wall.x + wall.w / 2, wall.y + wall.h / 2, "#ffd166");
        break;
      }
    }

    const hitPlayer = state.players.find((player) => circleRectHit(ball, player));
    if (state.invincible <= 0 && hitPlayer) {
      bounceFromRect(ball, hitPlayer, 1.02);
      removePlayableBlock(hitPlayer);
      if (state.gameOver) return;
    }
  }

  if (state.gameOver) return;

  if (state.walls.length === 0) {
    state.walls = makeWallsAroundPlayers();
    state.score += 220;
    state.balls.forEach((ball) => {
      ball.vx *= 1.08;
      ball.vy *= 1.08;
    });
  }
}

function rescuePaddleCatch(ball) {
  const p = state.paddle;
  const crossingPaddle = ball.vy > 0 && ball.y + ball.r >= p.y - 4 && ball.y - ball.r <= p.y + p.h + 20;
  if (!crossingPaddle) return;

  const side = ball.vx >= 0 ? -1 : 1;
  const offset = p.w * 0.22 * side;
  p.x = clamp(ball.x - p.w / 2 + offset, 12, W - p.w - 12);
}

function resetBall(ball) {
  ball.x = W / 2;
  ball.y = H * 0.5;
  ball.vx = (Math.random() > 0.5 ? 1 : -1) * 260;
  ball.vy = -260;
  ball.hitFlash = 0.16;
}

function updatePowerups(dt) {
  for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
    const powerup = state.powerups[i];
    powerup.y += powerup.vy * dt;
    const powerupRect = {
      x: powerup.x - powerup.w / 2,
      y: powerup.y - powerup.h / 2,
      w: powerup.w,
      h: powerup.h,
    };

    if (rectsOverlap(powerupRect, state.paddle)) {
      applyOpponentPower(powerup.type);
      state.powerups.splice(i, 1);
    } else if (powerup.y > H + 20) {
      state.powerups.splice(i, 1);
    }
  }
}

function updateSparks(dt) {
  for (let i = state.sparks.length - 1; i >= 0; i -= 1) {
    const spark = state.sparks[i];
    spark.life -= dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vx *= 0.94;
    spark.vy *= 0.94;
    if (spark.life <= 0) state.sparks.splice(i, 1);
  }
}

function draw() {
  ctx.imageSmoothingEnabled = renderMode === "modern";
  ctx.clearRect(0, 0, W, H);
  drawArena();
  state.walls.forEach(drawWall);
  state.players.forEach((player, index) => drawPlayableBlock(player, index));
  state.powerups.forEach(drawPowerup);
  drawPaddle();
  state.balls.forEach(drawBall);
  drawSparks();

  if (state.gameOver) {
    overlay("GAME OVER", "Press Space or Restart");
  } else if (state.countdown > 0) {
    drawCountdown();
  }
}

function drawArena() {
  const grid = 32;
  ctx.fillStyle = renderMode === "retro" ? "#15171f" : "#171b22";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = renderMode === "retro" ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 54);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 54; y <= H; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#11141b";
  ctx.fillRect(0, 0, W, 54);
  ctx.fillStyle = "#aab3c2";
  ctx.font = "700 18px Segoe UI, sans-serif";
  const hint = state.countdown > 0 ? "Find the flashing brick" : "Escape from inside the wall";
  ctx.fillText(hint, 24, 34);
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  if (renderMode === "modern" && typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
}

function drawPlayableBlock(player, index) {
  const isActive = index === state.activePlayerIndex;
  const isCountingDown = state.countdown > 0;
  const flashing = isCountingDown && Math.floor(state.countdown * 12) % 2 === 0;

  ctx.save();
  roundedRect(player.x, player.y, player.w, player.h, 6);
  ctx.fillStyle = isActive && !isCountingDown ? "#2ec4b6" : "#ffd166";
  if (renderMode === "modern" && isActive && !isCountingDown) {
    ctx.shadowColor = "#2ec4b6";
    ctx.shadowBlur = 18;
  }
  ctx.fill();
  drawBrickDetails(player.x, player.y, player.w, player.h);

  if (isCountingDown && !flashing) {
    ctx.strokeStyle = "#e63946";
    ctx.lineWidth = 4;
    ctx.strokeRect(player.x - 3, player.y - 3, player.w + 6, player.h + 6);
    ctx.strokeStyle = "#ffccd5";
    ctx.lineWidth = 2;
    ctx.strokeRect(player.x - 6, player.y - 6, player.w + 12, player.h + 12);
  }
  ctx.restore();
}

function drawBrickDetails(x, y, w, h) {
  if (renderMode === "modern") {
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(x + 8, y + 5, w - 16, 4);
    ctx.fillStyle = "rgba(20,20,20,0.12)";
    ctx.fillRect(x + 8, y + h - 6, w - 16, 3);
    return;
  }

  ctx.fillStyle = "rgba(20,20,20,0.20)";
  ctx.fillRect(Math.round(x + 6), Math.round(y + 5), Math.round(w - 12), 3);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  for (let px = x + 8; px < x + w - 6; px += 14) {
    ctx.fillRect(Math.round(px), Math.round(y + h - 6), 6, 2);
  }
}

function drawCountdown() {
  const number = Math.max(1, Math.ceil(state.countdown));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f3f6fb";
  ctx.font = "900 86px Segoe UI, sans-serif";
  ctx.fillText(String(number), W / 2, 108);
  ctx.fillStyle = "#c8d1df";
  ctx.font = "700 20px Segoe UI, sans-serif";
  ctx.fillText("Remember your block", W / 2, 164);
  ctx.restore();
}

function drawWall(wall) {
  roundedRect(wall.x, wall.y, wall.w, wall.h, 6);
  ctx.fillStyle = "#ffd166";
  ctx.fill();
  drawBrickDetails(wall.x, wall.y, wall.w, wall.h);
}

function drawPaddle() {
  const p = state.paddle;
  ctx.save();
  roundedRect(p.x, p.y, p.w, p.h, 7);
  ctx.fillStyle = state.effects.wide > 0 ? "#f6bd60" : "#f06449";
  if (renderMode === "modern") {
    ctx.shadowColor = state.effects.wide > 0 ? "#f6bd60" : "#f06449";
    ctx.shadowBlur = 14;
  }
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(p.x + 12, p.y + 4, p.w - 24, 3);
  if (state.effects.magnet > 0) {
    ctx.strokeStyle = "rgba(184,242,230,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x - 5, p.y - 5, p.w + 10, p.h + 10);
  }
  ctx.restore();
}

function drawBall(ball) {
  ctx.save();
  if (renderMode === "modern") {
    ctx.shadowColor = ball.hitFlash > 0 ? "#ffffff" : "#8ecae6";
    ctx.shadowBlur = ball.hitFlash > 0 ? 24 : 12;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = "#8ecae6";
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.fillStyle = "#8ecae6";
  ctx.fillRect(Math.round(ball.x - ball.r), Math.round(ball.y - ball.r), ball.r * 2, ball.r * 2);
  if (ball.hitFlash > 0) {
    ctx.fillStyle = "#f3f6fb";
    ctx.fillRect(Math.round(ball.x - 4), Math.round(ball.y - 4), 8, 8);
  }
  ctx.restore();
}

function drawPowerup(powerup) {
  ctx.save();
  roundedRect(powerup.x - powerup.w / 2, powerup.y - powerup.h / 2, powerup.w, powerup.h, 5);
  ctx.fillStyle = powerup.color;
  if (renderMode === "modern") {
    ctx.shadowColor = powerup.color;
    ctx.shadowBlur = 10;
  }
  ctx.fill();
  ctx.fillStyle = "#11141b";
  ctx.font = "900 13px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(powerup.label, powerup.x, powerup.y + 1);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawSparks() {
  state.sparks.forEach((spark) => {
    ctx.globalAlpha = clamp(spark.life * 2.5, 0, 1);
    ctx.fillStyle = spark.color;
    ctx.fillRect(spark.x, spark.y, 4, 4);
  });
  ctx.globalAlpha = 1;
}

function overlay(title, subtitle) {
  ctx.save();
  ctx.fillStyle = "rgba(8, 10, 14, 0.64)";
  ctx.fillRect(0, 54, W, H - 54);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3f6fb";
  ctx.font = "900 48px Segoe UI, sans-serif";
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.fillStyle = "#c8d1df";
  ctx.font = "700 22px Segoe UI, sans-serif";
  ctx.fillText(subtitle, W / 2, H / 2 + 24);
  ctx.restore();
}

function loop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (gameStarted) update(dt);
  draw();
  requestAnimationFrame(loop);
}

function isArrowKey(key) {
  return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key);
}

function triggerDashTap(key) {
  if (!state || state.gameOver || !isArrowKey(key)) return;

  const now = performance.now();
  if (
    !keys.has(key.toLowerCase()) &&
    state.dash.cooldown <= 0 &&
    state.dash.lastKey === key &&
    now - state.dash.lastTap <= dashTapWindow
  ) {
    state.dash.time = dashDuration;
    state.dash.cooldown = dashCooldown;
  }

  state.dash.lastKey = key;
  state.dash.lastTap = now;
}

window.addEventListener("keydown", (event) => {
  if (!gameStarted) return;

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (!event.repeat) triggerDashTap(event.key);
  if (event.key === " " && state.gameOver) {
    resetGame();
  } else if (event.key === " " && !event.repeat) {
    switchActivePlayer();
  }
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

restartBtn.addEventListener("click", resetGame);
styleToggleBtn.addEventListener("click", toggleRenderMode);
controlsToggleBtn.addEventListener("click", toggleControls);
startGameBtn.addEventListener("click", startGame);
switchBlockBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (!gameStarted) return;

  if (state.gameOver) {
    resetGame();
  } else {
    switchActivePlayer();
  }
});

function applyControlsVisibility() {
  controlsEl.classList.toggle("is-visible", controlsVisible);
  controlsToggleBtn.textContent = controlsVisible ? "Controller ON" : "Controller OFF";
  controlsToggleBtn.setAttribute("aria-pressed", String(controlsVisible));
}

function toggleControls() {
  controlsVisible = !controlsVisible;
  localStorage.setItem(controlsKey, String(controlsVisible));
  if (!controlsVisible) touchDirs.clear();
  applyControlsVisibility();
}

function setRandomTitleMessage() {
  const index = Math.floor(Math.random() * titleMessages.length);
  titleMessageEl.textContent = titleMessages[index];
}

function startGame() {
  gameStarted = true;
  titleScreenEl.classList.add("is-hidden");
  lastTime = performance.now();
  resetGame();
}

document.querySelectorAll(".pad[data-dir]").forEach((button) => {
  const dir = button.dataset.dir;
  const start = (event) => {
    event.preventDefault();
    touchDirs.add(dir);
  };
  const end = (event) => {
    event.preventDefault();
    touchDirs.delete(dir);
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
});

setRandomTitleMessage();
resetGame();
requestAnimationFrame(loop);
