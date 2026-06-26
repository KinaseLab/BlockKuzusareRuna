const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const livesEl = document.querySelector("#lives");
const restartBtn = document.querySelector("#restart");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const touchDirs = new Set();
const bestKey = "block-runner-breakout-best";

let best = Number(localStorage.getItem(bestKey) || 0);
let state;
let lastTime = 0;

bestEl.textContent = best;

function resetGame() {
  state = {
    score: 0,
    lives: 3,
    levelTime: 0,
    invincible: 1.2,
    gameOver: false,
    player: { x: W / 2 - 42, y: 110, w: 84, h: 30, speed: 360 },
    paddle: { x: W / 2 - 72, y: H - 44, w: 144, h: 18, speed: 460 },
    balls: [newBall(W * 0.35, H * 0.54, 250, 245)],
    gems: [],
    walls: makeWalls(),
    sparks: [],
    spawnTimer: 1.7,
  };
  updateHud();
}

function newBall(x, y, vx, vy) {
  return { x, y, r: 10, vx, vy, hitFlash: 0 };
}

function makeWalls() {
  const walls = [];
  const rows = 4;
  const cols = 9;
  const gap = 9;
  const bw = 76;
  const bh = 22;
  const startX = (W - (cols * bw + (cols - 1) * gap)) / 2;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (row === 1 && (col === 4 || col === 5)) continue;
      walls.push({
        x: startX + col * (bw + gap),
        y: 208 + row * (bh + gap),
        w: bw,
        h: bh,
        hp: 1,
      });
    }
  }
  return walls;
}

function updateHud() {
  scoreEl.textContent = Math.floor(state.score);
  livesEl.textContent = state.lives;
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

function spawnGem() {
  state.gems.push({
    x: 70 + Math.random() * (W - 140),
    y: 86 + Math.random() * 380,
    r: 8,
    life: 7,
  });
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

function loseLife() {
  state.lives -= 1;
  state.invincible = 1.4;
  addSparks(state.player.x + state.player.w / 2, state.player.y + state.player.h / 2, "#f06449");
  state.player.x = W / 2 - state.player.w / 2;
  state.player.y = 105;
  if (state.lives <= 0) {
    state.gameOver = true;
    best = Math.max(best, Math.floor(state.score));
    localStorage.setItem(bestKey, String(best));
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

  state.levelTime += dt;
  state.invincible = Math.max(0, state.invincible - dt);
  state.spawnTimer -= dt;
  state.score += dt * 12;

  if (state.spawnTimer <= 0) {
    spawnGem();
    state.spawnTimer = Math.max(0.55, 1.9 - state.levelTime * 0.018);
  }

  if (state.levelTime > 18 && state.balls.length === 1) {
    state.balls.push(newBall(W * 0.72, H * 0.45, -280, 230));
  }
  if (state.levelTime > 42 && state.balls.length === 2) {
    state.balls.push(newBall(W * 0.52, H * 0.33, 310, 255));
  }

  movePlayer(dt);
  movePaddle(dt);
  moveBalls(dt);
  updateGems(dt);
  updateSparks(dt);
  updateHud();
}

function movePlayer(dt) {
  const axis = inputAxis();
  const len = Math.hypot(axis.x, axis.y) || 1;
  state.player.x += (axis.x / len) * state.player.speed * dt;
  state.player.y += (axis.y / len) * state.player.speed * dt;
  state.player.x = clamp(state.player.x, 18, W - state.player.w - 18);
  state.player.y = clamp(state.player.y, 62, H - 106);
}

function movePaddle(dt) {
  const targetBall = state.balls.reduce((bestBall, ball) => (ball.y > bestBall.y ? ball : bestBall), state.balls[0]);
  const pressure = Math.sin(state.levelTime * 1.8) * 44;
  const target = clamp((targetBall.x * 0.76 + (state.player.x + state.player.w / 2) * 0.24) + pressure, 80, W - 80);
  const center = state.paddle.x + state.paddle.w / 2;
  state.paddle.x += clamp(target - center, -state.paddle.speed * dt, state.paddle.speed * dt);
  state.paddle.x = clamp(state.paddle.x, 12, W - state.paddle.w - 12);
}

function moveBalls(dt) {
  for (const ball of state.balls) {
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
      ball.x = W / 2;
      ball.y = H * 0.5;
      ball.vx = (Math.random() > 0.5 ? 1 : -1) * 260;
      ball.vy = -260;
    }

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
        addSparks(wall.x + wall.w / 2, wall.y + wall.h / 2, "#ffd166");
        break;
      }
    }

    if (state.invincible <= 0 && circleRectHit(ball, state.player)) {
      loseLife();
      bounceFromRect(ball, state.player, 1.02);
    }
  }

  if (state.walls.length === 0) {
    state.walls = makeWalls();
    state.score += 220;
    state.balls.forEach((ball) => {
      ball.vx *= 1.08;
      ball.vy *= 1.08;
    });
  }
}

function updateGems(dt) {
  const playerCenter = {
    x: state.player.x + state.player.w / 2,
    y: state.player.y + state.player.h / 2,
  };
  for (let i = state.gems.length - 1; i >= 0; i -= 1) {
    const gem = state.gems[i];
    gem.life -= dt;
    const dx = gem.x - playerCenter.x;
    const dy = gem.y - playerCenter.y;
    if (Math.hypot(dx, dy) < gem.r + 42) {
      state.gems.splice(i, 1);
      state.score += 90;
      addSparks(gem.x, gem.y, "#2ec4b6");
    } else if (gem.life <= 0) {
      state.gems.splice(i, 1);
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
  ctx.clearRect(0, 0, W, H);
  drawArena();
  state.gems.forEach(drawGem);
  state.walls.forEach(drawWall);
  drawPaddle();
  state.balls.forEach(drawBall);
  drawPlayer();
  drawSparks();

  if (state.gameOver) {
    overlay("GAME OVER", "Press Space or Restart");
  } else if (state.levelTime < 2.5) {
    overlay("RUN, LITTLE BLOCK", "Move with WASD / arrows. Touch buttons work too.");
  }
}

function drawArena() {
  const grid = 32;
  ctx.fillStyle = "#171b22";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.045)";
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
  ctx.fillText("Escape the breakout machine", 24, 34);
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawPlayer() {
  const p = state.player;
  const flashing = state.invincible > 0 && Math.floor(state.invincible * 12) % 2 === 0;
  ctx.save();
  ctx.shadowColor = "#2ec4b6";
  ctx.shadowBlur = flashing ? 0 : 18;
  roundedRect(p.x, p.y, p.w, p.h, 7);
  ctx.fillStyle = flashing ? "rgba(46,196,182,0.42)" : "#2ec4b6";
  ctx.fill();
  ctx.fillStyle = "#0f2020";
  ctx.fillRect(p.x + 16, p.y + 9, 12, 5);
  ctx.fillRect(p.x + p.w - 28, p.y + 9, 12, 5);
  ctx.restore();
}

function drawWall(wall) {
  roundedRect(wall.x, wall.y, wall.w, wall.h, 5);
  ctx.fillStyle = "#ffd166";
  ctx.fill();
  ctx.fillStyle = "rgba(20,20,20,0.16)";
  ctx.fillRect(wall.x + 7, wall.y + 5, wall.w - 14, 3);
}

function drawPaddle() {
  const p = state.paddle;
  roundedRect(p.x, p.y, p.w, p.h, 7);
  ctx.fillStyle = "#f06449";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillRect(p.x + 12, p.y + 4, p.w - 24, 3);
}

function drawBall(ball) {
  ctx.save();
  ctx.shadowColor = ball.hitFlash > 0 ? "#ffffff" : "#8ecae6";
  ctx.shadowBlur = ball.hitFlash > 0 ? 24 : 12;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = "#8ecae6";
  ctx.fill();
  ctx.restore();
}

function drawGem(gem) {
  ctx.save();
  ctx.translate(gem.x, gem.y);
  ctx.rotate(performance.now() * 0.003);
  ctx.fillStyle = gem.life < 1.5 ? "rgba(46,196,182,0.5)" : "#2ec4b6";
  ctx.beginPath();
  ctx.moveTo(0, -gem.r);
  ctx.lineTo(gem.r, 0);
  ctx.lineTo(0, gem.r);
  ctx.lineTo(-gem.r, 0);
  ctx.closePath();
  ctx.fill();
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
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
  if (event.key === " " && state.gameOver) resetGame();
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

restartBtn.addEventListener("click", resetGame);

document.querySelectorAll(".pad").forEach((button) => {
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

resetGame();
requestAnimationFrame(loop);
