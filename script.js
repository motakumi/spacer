"use strict";

(() => {
  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("このブラウザーでは Canvas を利用できません。");
  }

  const WIDTH = 1920;
  const HEIGHT = 1080;
  const UI_HEIGHT = 90;
  const portraitMobileQuery = window.matchMedia(
    "(orientation: portrait) and (max-width: 768px) and (pointer: coarse)"
  );
  const CHARGE_TIME = 500;
  const INVINCIBLE_TIME = 500;
  const TOP_LINE_INTERVAL = 240;
  const BOTTOM_LINE_INTERVAL = 240;
  const PLAY_BUTTON = {
    x: WIDTH / 2 - 260,
    y: 630,
    width: 520,
    height: 100,
  };
  const MENU_ICON = { x: 1828, y: 10, width: 80, height: 70 };
  const PAUSE_MENU = {
    x: (WIDTH - 912) / 2,
    y: (HEIGHT - 600) / 2,
    width: 912,
    height: 600,
  };
  const PAUSE_MENU_BUTTONS = [
    { action: "continue", label: "つづける", x: WIDTH / 2 - 330, y: 455, width: 660, height: 80 },
    { action: "restart", label: "最初からやり直す", x: WIDTH / 2 - 330, y: 570, width: 660, height: 80 },
    { action: "title", label: "タイトルに戻る", x: WIDTH / 2 - 330, y: 685, width: 660, height: 80 },
  ];
  const GAME_OVER_BUTTONS = [
    { action: "retry", label: "リトライ", x: WIDTH / 2 - 300, y: 610, width: 600, height: 72 },
    { action: "title", label: "タイトルに戻る", x: WIDTH / 2 - 300, y: 700, width: 600, height: 72 },
  ];
  const HIGH_SCORE_KEY = "spacer-high-score";

  const COLOR = {
    charge: "#ffd36a",
    fullCharge: "#69e5ff",
    heart: "#ff627c",
    emptyHeart: "#3c4658",
  };

  const random = (min, max) => min + Math.random() * (max - min);
  const randomInt = (min, max) => Math.floor(random(min, max + 1));

  const stars = Array.from({ length: 190 }, () => ({
    x: randomInt(0, WIDTH),
    y: randomInt(0, HEIGHT),
    size: random(1, 3.5),
    speed: random(0.15, 1.2),
    brightness: random(0.25, 0.9),
    phase: random(0, Math.PI * 2),
  }));
  const planetBands = Array.from({ length: 5 }, (_, i) => ({
    y: (i - 2) * 48,
    x: random(-80, 80),
    height: random(4, 13),
  }));

  function resetGame(state = "TITLE") {
    return {
      state,
      boatX: 200,
      boatY: (HEIGHT + UI_HEIGHT) / 2,
      prevX: 200,
      prevY: (HEIGHT + UI_HEIGHT) / 2,
      vx: 0,
      vy: 0,
      angle: 0,
      hp: 3,
      invincibleUntil: 0,
      spacePressed: false,
      chargeStartTime: 0,
      isCharged: false,
      isBoosting: false,
      obstacles: [],
      spawnTimer: 0,
      topLineTimer: 0,
      bottomLineTimer: 120,
      scoreAccumulator: 0,
      score: 0,
      elapsedTime: 0,
      pausedAt: 0,
      isNewRecord: false,
    };
  }

  let game = resetGame();
  let mouseX = 800;
  let mouseY = HEIGHT / 2;
  let isPlayButtonHovered = false;
  let hoveredPauseButton = -1;
  const storedHighScore = Number.parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10);
  let highScore = Number.isFinite(storedHighScore) && storedHighScore >= 0 ? storedHighScore : 0;
  let spaceDown = false;
  let pointerDown = false;
  let controlPointerId = null;
  let isTouchInput = false;
  let lastFrameTime = performance.now();

  portraitMobileQuery.addEventListener("change", (event) => {
    if (!event.matches) return;
    game.spacePressed = false;
    game.isCharged = false;
    spaceDown = false;
    pointerDown = false;
    controlPointerId = null;
  });

  function isInside(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.width &&
      y >= rect.y && y <= rect.y + rect.height;
  }

  function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    mouseY = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    if (game.state === "TITLE") {
      isPlayButtonHovered =
        mouseX >= PLAY_BUTTON.x &&
        mouseX <= PLAY_BUTTON.x + PLAY_BUTTON.width &&
        mouseY >= PLAY_BUTTON.y &&
        mouseY <= PLAY_BUTTON.y + PLAY_BUTTON.height;
      canvas.style.cursor = isPlayButtonHovered ? "pointer" : "default";
      hoveredPauseButton = -1;
    } else if (game.state === "PAUSED") {
      hoveredPauseButton = PAUSE_MENU_BUTTONS.findIndex((button) =>
        isInside(button, mouseX, mouseY)
      );
      canvas.style.cursor = hoveredPauseButton !== -1 ? "pointer" : "default";
    } else if (game.state === "GAMEOVER") {
      hoveredPauseButton = GAME_OVER_BUTTONS.findIndex((button) =>
        isInside(button, mouseX, mouseY)
      );
      canvas.style.cursor = hoveredPauseButton !== -1 ? "pointer" : "default";
    } else {
      isPlayButtonHovered = false;
      hoveredPauseButton = -1;
      canvas.style.cursor = game.state === "PLAYING" && isInside(MENU_ICON, mouseX, mouseY)
        ? "pointer"
        : "default";
    }
  }

  function pauseGame() {
    if (game.state !== "PLAYING") return;
    game.state = "PAUSED";
    game.pausedAt = performance.now();
    game.spacePressed = false;
    game.isCharged = false;
    spaceDown = false;
    pointerDown = false;
    controlPointerId = null;
  }

  function resumeGame() {
    if (game.state !== "PAUSED") return;
    game.invincibleUntil += performance.now() - game.pausedAt;
    game.pausedAt = 0;
    game.state = "PLAYING";
  }

  function startCharge(now) {
    if (game.state !== "PLAYING" || game.spacePressed) return;
    game.spacePressed = true;
    game.chargeStartTime = now;
    game.isCharged = false;
  }

  function releaseCharge() {
    if (game.state !== "PLAYING" || !game.spacePressed) return;
    if (game.isCharged) {
      const radians = (game.angle * Math.PI) / 180;
      game.vx = Math.cos(radians) * 36;
      game.vy = -Math.sin(radians) * 36;
      game.isBoosting = true;
    }
    game.isCharged = false;
    game.spacePressed = false;
  }

  window.addEventListener("keydown", (event) => {
    if (portraitMobileQuery.matches) {
      event.preventDefault();
      return;
    }

    if (event.code === "Escape") {
      event.preventDefault();
      if (game.state === "PLAYING") pauseGame();
      else if (game.state === "PAUSED") resumeGame();
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (spaceDown) return;
      spaceDown = true;
      if (game.state === "PLAYING") {
        startCharge(performance.now());
      }
      return;
    }

    if (game.state === "TITLE" && event.key === "Enter") {
      game = resetGame("PLAYING");
      isPlayButtonHovered = false;
      canvas.style.cursor = "default";
      return;
    }

    if (game.state === "GAMEOVER") {
      if (event.key.toLowerCase() === "r") game = resetGame("PLAYING");
      if (event.key.toLowerCase() === "t") game = resetGame("TITLE");
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code !== "Space") return;
    event.preventDefault();
    spaceDown = false;
    if (portraitMobileQuery.matches) return;
    if (!pointerDown) releaseCharge();
  });

  window.addEventListener("blur", () => {
    spaceDown = false;
    pointerDown = false;
    controlPointerId = null;
    releaseCharge();
  });

  canvas.addEventListener("pointermove", getPointerPosition);
  canvas.addEventListener("pointerleave", () => {
    isPlayButtonHovered = false;
    hoveredPauseButton = -1;
    canvas.style.cursor = "default";
  });
  canvas.addEventListener("pointerdown", (event) => {
    getPointerPosition(event);
    canvas.focus({ preventScroll: true });
    if (event.pointerType === "touch") isTouchInput = true;
    if (game.state === "TITLE") {
      const clickedPlayButton =
        mouseX >= PLAY_BUTTON.x &&
        mouseX <= PLAY_BUTTON.x + PLAY_BUTTON.width &&
        mouseY >= PLAY_BUTTON.y &&
        mouseY <= PLAY_BUTTON.y + PLAY_BUTTON.height;
      if (clickedPlayButton) {
        game = resetGame("PLAYING");
        isPlayButtonHovered = false;
        canvas.style.cursor = "default";
      }
      return;
    }
    if (game.state === "PAUSED") {
      const buttonIndex = PAUSE_MENU_BUTTONS.findIndex((button) =>
        isInside(button, mouseX, mouseY)
      );
      const button = PAUSE_MENU_BUTTONS[buttonIndex];
      if (button?.action === "continue") resumeGame();
      else if (button?.action === "restart") game = resetGame("PLAYING");
      else if (button?.action === "title") game = resetGame("TITLE");
      hoveredPauseButton = -1;
      canvas.style.cursor = "default";
      return;
    }
    if (game.state === "GAMEOVER") {
      const button = GAME_OVER_BUTTONS.find((item) => isInside(item, mouseX, mouseY));
      if (button?.action === "retry") game = resetGame("PLAYING");
      else if (button?.action === "title") game = resetGame("TITLE");
      hoveredPauseButton = -1;
      canvas.style.cursor = "default";
      return;
    }
    if (isInside(MENU_ICON, mouseX, mouseY)) {
      pauseGame();
      return;
    }
    if (pointerDown) return;
    pointerDown = true;
    controlPointerId = event.pointerId;
    startCharge(performance.now());
    canvas.setPointerCapture(event.pointerId);
  });

  function endPointerCharge(event) {
    if (!pointerDown || event.pointerId !== controlPointerId) return;
    pointerDown = false;
    controlPointerId = null;
    if (!spaceDown) releaseCharge();
  }

  canvas.addEventListener("pointerup", endPointerCharge);
  canvas.addEventListener("pointercancel", endPointerCharge);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  function drawBackground(dt) {
    const space = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    space.addColorStop(0, "#070b20");
    space.addColorStop(0.48, "#10132e");
    space.addColorStop(1, "#080d20");
    ctx.fillStyle = space;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const nebula = ctx.createRadialGradient(
      WIDTH * 0.66, HEIGHT * 0.53, 20,
      WIDTH * 0.66, HEIGHT * 0.53, WIDTH * 0.55
    );
    nebula.addColorStop(0, "rgb(61 46 119 / 22%)");
    nebula.addColorStop(0.48, "rgb(32 61 117 / 12%)");
    nebula.addColorStop(1, "rgb(7 11 32 / 0%)");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const planetGlow = ctx.createRadialGradient(
      WIDTH * 0.79, HEIGHT * 0.33, 8,
      WIDTH * 0.79, HEIGHT * 0.33, 220
    );
    planetGlow.addColorStop(0, "rgb(94 142 219 / 32%)");
    planetGlow.addColorStop(0.72, "rgb(54 82 157 / 22%)");
    planetGlow.addColorStop(1, "rgb(38 61 124 / 0%)");
    ctx.fillStyle = planetGlow;
    ctx.beginPath();
    ctx.arc(WIDTH * 0.79, HEIGHT * 0.33, 218, 0, Math.PI * 2);
    ctx.fill();
    const planet = ctx.createLinearGradient(
      WIDTH * 0.68, HEIGHT * 0.22, WIDTH * 0.89, HEIGHT * 0.48
    );
    planet.addColorStop(0, "#a7c4ee");
    planet.addColorStop(0.35, "#526fae");
    planet.addColorStop(1, "#202b62");
    ctx.fillStyle = planet;
    ctx.beginPath();
    ctx.arc(WIDTH * 0.79, HEIGHT * 0.33, 145, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(WIDTH * 0.79, HEIGHT * 0.33, 145, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "rgb(177 207 255 / 14%)";
    for (const band of planetBands) {
      ctx.beginPath();
      ctx.ellipse(
        WIDTH * 0.79 + band.x,
        HEIGHT * 0.33 + band.y,
        170,
        band.height,
        -0.2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.restore();

    for (const star of stars) {
      star.x -= star.speed * dt;
      star.phase += 0.025 * dt;
      if (star.x < -2) {
        star.x = WIDTH + randomInt(2, 60);
        star.y = randomInt(0, HEIGHT);
      }
      const alpha = star.brightness * (0.75 + Math.sin(star.phase) * 0.25);
      ctx.fillStyle = `rgb(214 231 255 / ${alpha})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    const vignette = ctx.createRadialGradient(
      WIDTH / 2, HEIGHT / 2, HEIGHT * 0.2,
      WIDTH / 2, HEIGHT / 2, WIDTH * 0.67
    );
    vignette.addColorStop(0, "rgb(3 5 18 / 0%)");
    vignette.addColorStop(1, "rgb(3 5 18 / 48%)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function createAsteroid(lineType = "random") {
    const width = randomInt(100, 190);
    const height = randomInt(75, 145);
    const pointCount = randomInt(9, 14);
    const points = Array.from({ length: pointCount }, (_, i) => {
      const angle = (i / pointCount) * Math.PI * 2;
      const radius = random(0.76, 1);
      return {
        x: Math.cos(angle) * width * 0.5 * radius,
        y: Math.sin(angle) * height * 0.5 * radius,
      };
    });
    let y;
    if (lineType === "top") y = UI_HEIGHT + 45;
    else if (lineType === "bottom") y = HEIGHT - height - 35;
    else y = randomInt(UI_HEIGHT + 60, HEIGHT - 120);

    return {
      x: WIDTH + 100,
      y,
      width,
      height,
      speed: random(6, 12),
      points,
      rotation: random(0, Math.PI * 2),
      spin: random(-0.012, 0.012),
      craters: Array.from({ length: randomInt(2, 5) }, () => ({
        x: random(-width * 0.28, width * 0.28),
        y: random(-height * 0.28, height * 0.28),
        radius: random(7, Math.min(width, height) * 0.13),
        angle: random(-0.3, 0.3),
      })),
    };
  }

  function drawAsteroid(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
    ctx.rotate(obstacle.rotation);
    ctx.shadowColor = "rgb(0 0 0 / 55%)";
    ctx.shadowBlur = 18;
    const surface = ctx.createLinearGradient(
      -obstacle.width * 0.4, -obstacle.height * 0.45,
      obstacle.width * 0.45, obstacle.height * 0.4
    );
    surface.addColorStop(0, "#b8a38d");
    surface.addColorStop(0.38, "#74675f");
    surface.addColorStop(1, "#393a48");
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.moveTo(obstacle.points[0].x, obstacle.points[0].y);
    for (const point of obstacle.points) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgb(222 197 165 / 38%)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "rgb(27 29 39 / 45%)";
    ctx.strokeStyle = "rgb(202 185 164 / 24%)";
    ctx.lineWidth = 2;
    for (const crater of obstacle.craters) {
      ctx.beginPath();
      ctx.ellipse(
        crater.x, crater.y, crater.radius, crater.radius * 0.72,
        crater.angle, 0, Math.PI * 2
      );
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "rgb(220 205 184 / 35%)";
    ctx.beginPath();
    ctx.ellipse(-obstacle.width * 0.12, -obstacle.height * 0.18, obstacle.width * 0.17, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShuttle(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-angle * Math.PI) / 180);

    const polygon = (points, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      points.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    };

    ctx.fillStyle = "#d9783d";
    ctx.beginPath();
    ctx.roundRect(-48, -8, 65, 16, 8);
    ctx.fill();
    ctx.fillStyle = "#f0a36a";
    ctx.fillRect(-38, -5, 44, 2);
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#b9c6d7";
      ctx.beginPath();
      ctx.roundRect(-58, side * 16 - 5, 58, 10, 5);
      ctx.fill();
      ctx.fillStyle = "#e85d68";
      ctx.fillRect(-58, side * 16 - 5, 5, 10);
    }

    polygon([[-16, -11], [-39, -20], [-72, -53], [-91, -51], [-61, -12], [-30, -7], [-18, 0], [-30, 7], [-61, 12], [-91, 51], [-72, 53], [-39, 20], [-16, 11]], "#26344e");
    polygon([[-12, -9], [-36, -17], [-70, -47], [-81, -46], [-55, -11], [-27, -6], [-15, 0], [-27, 6], [-55, 11], [-81, 46], [-70, 47], [-36, 17], [-12, 9]], "#cbd7e5");
    polygon([[-9, -7], [-32, -14], [-65, -41], [-73, -40], [-49, -10], [-22, -5], [-10, 0], [-22, 5], [-49, 10], [-73, 40], [-65, 41], [-32, 14], [-9, 7]], "#eef2f7");
    polygon([[-53, -12], [-67, -22], [-81, -19], [-63, -7]], "#9aaec5");
    polygon([[-53, 12], [-67, 22], [-81, 19], [-63, 7]], "#9aaec5");
    polygon([[-73, -9], [-52, -15], [48, -12], [77, 0], [48, 12], [-52, 15], [-73, 9]], "#26344e");
    polygon([[-66, -7], [-49, -11], [46, -8], [68, 0], [46, 8], [-49, 11], [-66, 7]], "#dce5ee");
    polygon([[22, -6], [43, -5], [60, 0], [43, 5], [22, 6]], "#314a70");
    polygon([[28, -4], [43, -3], [52, 0], [43, 3]], "rgb(214 241 255 / 78%)");
    polygon([[-66, -3], [-77, -12], [-71, -2]], "#f1f3f7");
    polygon([[-66, 3], [-77, 12], [-71, 2]], "#f1f3f7");
    ctx.fillStyle = "#d7e0eb";
    ctx.beginPath();
    ctx.roundRect(-38, -10, 10, 20, 4);
    ctx.fill();
    ctx.fillStyle = "#d9783d";
    ctx.beginPath();
    ctx.roundRect(-46, -7, 7, 14, 3);
    ctx.fill();
    ctx.strokeStyle = "rgb(255 255 255 / 60%)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-48, 0);
    ctx.lineTo(51, 0);
    ctx.stroke();
    ctx.fillStyle = "#253952";
    ctx.beginPath();
    ctx.ellipse(59, 0, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHeart(x, y, filled) {
    ctx.fillStyle = filled ? COLOR.heart : COLOR.emptyHeart;
    ctx.beginPath();
    ctx.arc(x - 10, y - 6, 12, 0, Math.PI * 2);
    ctx.arc(x + 10, y - 6, 12, 0, Math.PI * 2);
    ctx.moveTo(x - 22, y - 4);
    ctx.lineTo(x + 22, y - 4);
    ctx.lineTo(x, y + 20);
    ctx.closePath();
    ctx.fill();
  }

  function drawAimLine() {
    const radians = (game.angle * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = -Math.sin(radians);
    ctx.fillStyle = game.isCharged ? COLOR.fullCharge : COLOR.charge;
    for (let i = 0; i < 6; i += 1) {
      const distance = 50 + i * 30;
      const radius = Math.max(2, 6 - i * 0.5);
      ctx.beginPath();
      ctx.arc(game.boatX + dx * distance, game.boatY + dy * distance, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoostFlame(x, y, angle, now) {
    const flicker = Math.sin(now / 24) * 8 + Math.sin(now / 11) * 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-angle * Math.PI) / 180);
    ctx.fillStyle = "#f04c2f";
    ctx.beginPath();
    ctx.moveTo(-42, -5);
    ctx.lineTo(-65, -9);
    ctx.lineTo(-91 - flicker, -4);
    ctx.lineTo(-77 - flicker * 0.65, 0);
    ctx.lineTo(-92 - flicker, 4);
    ctx.lineTo(-65, 9);
    ctx.lineTo(-42, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffad32";
    ctx.beginPath();
    ctx.moveTo(-44, -3);
    ctx.lineTo(-63, -5);
    ctx.lineTo(-78 - flicker * 0.75, -2);
    ctx.lineTo(-70 - flicker * 0.5, 0);
    ctx.lineTo(-79 - flicker * 0.75, 2);
    ctx.lineTo(-63, 5);
    ctx.lineTo(-44, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#fff1a6";
    ctx.beginPath();
    ctx.moveTo(-45, -1.5);
    ctx.lineTo(-63, -2);
    ctx.lineTo(-72 - flicker * 0.45, 0);
    ctx.lineTo(-63, 2);
    ctx.lineTo(-45, 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawGameOver() {
    ctx.fillStyle = "rgb(2 8 12 / 76%)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const { x, y, width, height } = PAUSE_MENU;
    const panel = ctx.createLinearGradient(x, y, x, y + height);
    panel.addColorStop(0, "#1b2850");
    panel.addColorStop(1, "#0b1024");
    ctx.fillStyle = panel;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 16);
    ctx.fill();
    ctx.strokeStyle = "rgb(119 173 255 / 65%)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ff6868";
    ctx.font = "800 82px 'Segoe UI', sans-serif";
    ctx.shadowColor = "rgb(255 60 60 / 34%)";
    ctx.shadowBlur = 22;
    ctx.fillText("GAME OVER", WIDTH / 2, y + 80);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgb(190 205 239 / 75%)";
    ctx.font = "600 30px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.16em";
    ctx.fillText("FINAL SCORE", WIDTH / 2, y + 170);
    ctx.letterSpacing = "0";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 72px 'Segoe UI', sans-serif";
    ctx.fillText(String(game.score).padStart(6, "0"), WIDTH / 2, y + 240);
    if (game.isNewRecord) {
      ctx.fillStyle = COLOR.fullCharge;
      ctx.font = "800 32px 'Segoe UI', sans-serif";
      ctx.letterSpacing = "0.18em";
      ctx.shadowColor = "rgb(105 229 255 / 45%)";
      ctx.shadowBlur = 18;
      ctx.fillText("NEW RECORD", WIDTH / 2, y + 310);
      ctx.shadowBlur = 0;
      ctx.letterSpacing = "0";
    }

    GAME_OVER_BUTTONS.forEach((button, index) => {
      const hovered = index === hoveredPauseButton;
      ctx.fillStyle = hovered ? "rgb(52 112 230 / 95%)" : "rgb(13 22 48 / 88%)";
      ctx.strokeStyle = hovered ? "#d5f4ff" : "rgb(119 173 255 / 82%)";
      ctx.lineWidth = hovered ? 3 : 2;
      if (hovered) {
        ctx.shadowColor = "rgb(105 229 255 / 42%)";
        ctx.shadowBlur = 24;
      }
      ctx.beginPath();
      ctx.roundRect(button.x, button.y, button.width, button.height, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#eff6ff";
      ctx.font = "700 32px 'Segoe UI', sans-serif";
      ctx.fillText(button.label, WIDTH / 2, button.y + button.height / 2);
    });
  }

  function update(now, dt) {
    if (game.state !== "PLAYING") return;

    game.elapsedTime += dt / 60;
    game.prevX = game.boatX;
    game.prevY = game.boatY;
    const dx = mouseX - game.boatX;
    const dy = mouseY - game.boatY;
    game.angle = (Math.atan2(-dy, dx) * 180) / Math.PI;

    if (game.spacePressed) {
      if (!game.isCharged && now - game.chargeStartTime >= CHARGE_TIME) {
        game.isCharged = true;
      }
    }

    game.boatX += game.vx * dt;
    game.boatY += game.vy * dt;
    game.vx *= Math.pow(0.92, dt);
    game.vy *= Math.pow(0.92, dt);
    game.boatX = Math.max(40, Math.min(WIDTH - 40, game.boatX));
    game.boatY = Math.max(UI_HEIGHT + 35, Math.min(HEIGHT - 35, game.boatY));

    const moveDistance = Math.hypot(game.boatX - game.prevX, game.boatY - game.prevY);
    if (moveDistance <= 0.2) game.isBoosting = false;

    game.spawnTimer += dt;
    const spawnRate = Math.max(20, 50 - Math.floor(game.score / 100));
    if (game.spawnTimer >= spawnRate) {
      game.obstacles.push(createAsteroid());
      game.spawnTimer = 0;
    }
    game.topLineTimer += dt;
    if (game.topLineTimer >= TOP_LINE_INTERVAL) {
      game.obstacles.push(createAsteroid("top"));
      game.topLineTimer = 0;
    }
    game.bottomLineTimer += dt;
    if (game.bottomLineTimer >= BOTTOM_LINE_INTERVAL) {
      game.obstacles.push(createAsteroid("bottom"));
      game.bottomLineTimer = 0;
    }

    if (now >= game.invincibleUntil) {
      const boatRect = { left: game.boatX - 30, right: game.boatX + 30, top: game.boatY - 25, bottom: game.boatY + 25 };
      const hitIndex = game.obstacles.findIndex((obstacle) =>
        boatRect.left < obstacle.x + obstacle.width &&
        boatRect.right > obstacle.x &&
        boatRect.top < obstacle.y + obstacle.height &&
        boatRect.bottom > obstacle.y
      );
      if (hitIndex !== -1) {
        game.obstacles.splice(hitIndex, 1);
        game.hp -= 1;
        if (game.hp <= 0) game.state = "GAMEOVER";
        else game.invincibleUntil = now + INVINCIBLE_TIME;
      }
    }

    for (let i = game.obstacles.length - 1; i >= 0; i -= 1) {
      game.obstacles[i].x -= game.obstacles[i].speed * dt;
      game.obstacles[i].rotation += game.obstacles[i].spin * dt;
      if (game.obstacles[i].x + game.obstacles[i].width < 0) {
        game.obstacles.splice(i, 1);
      }
    }

    game.scoreAccumulator += (game.boatX < WIDTH * (2 / 3) ? 0.5 : 1) * dt;
    game.score = Math.floor(game.scoreAccumulator);
    if (game.state === "GAMEOVER" && game.score > highScore) {
      game.isNewRecord = true;
      highScore = game.score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    }
  }

  function drawGame(now) {
    for (const obstacle of game.obstacles) drawAsteroid(obstacle);

    const moveDistance = Math.hypot(game.boatX - game.prevX, game.boatY - game.prevY);
    if (game.state === "PLAYING" && game.isBoosting && moveDistance > 0.2) {
      drawBoostFlame(game.boatX, game.boatY, game.angle, now);
    }

    if (game.spacePressed && game.state === "PLAYING") {
      if (Math.floor(now / 250) % 2 === 0) drawAimLine();
    }

    if (game.state === "PLAYING" || game.state === "PAUSED") {
      const visible = game.state === "PAUSED" ||
        now >= game.invincibleUntil || Math.floor(now / 50) % 2 !== 0;
      if (visible) drawShuttle(game.boatX, game.boatY, game.angle);
    }

    const hud = ctx.createLinearGradient(0, 0, 0, UI_HEIGHT);
    hud.addColorStop(0, "rgb(7 11 30 / 97%)");
    hud.addColorStop(1, "rgb(13 20 43 / 96%)");
    ctx.fillStyle = hud;
    ctx.fillRect(0, 0, WIDTH, UI_HEIGHT);
    ctx.fillStyle = "rgb(119 173 255 / 40%)";
    ctx.fillRect(0, UI_HEIGHT - 2, WIDTH, 2);
    ctx.fillStyle = "rgb(255 255 255 / 4%)";
    ctx.fillRect(0, UI_HEIGHT - 7, WIDTH, 1);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#93a89b";
    ctx.font = "700 20px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.12em";
    ctx.fillText("HP", 30, 44);
    ctx.letterSpacing = "0";
    for (let i = 0; i < 3; i += 1) drawHeart(91 + i * 49, 44, i < game.hp);
    ctx.fillStyle = "rgb(255 255 255 / 9%)";
    ctx.fillRect(250, 18, 1, 54);

    const chargeElapsed = game.spacePressed
      ? Math.min(1, (now - game.chargeStartTime) / CHARGE_TIME)
      : 0;
    const meterX = 728;
    const meterY = 51;
    const meterWidth = 464;
    ctx.textAlign = "center";
    ctx.font = "700 20px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.2em";
    ctx.fillStyle = game.isCharged ? COLOR.fullCharge : "rgb(199 218 204 / 65%)";
    ctx.fillText(
      game.isCharged
        ? "CHARGE COMPLETE  ·  RELEASE TO DASH"
        : (isTouchInput ? "HOLD SCREEN  ·  CHARGE BOOST" : "HOLD SPACE  ·  CHARGE BOOST"),
      WIDTH / 2,
      25
    );
    ctx.letterSpacing = "0";
    ctx.fillStyle = "rgb(255 255 255 / 10%)";
    ctx.beginPath();
    ctx.roundRect(meterX, meterY, meterWidth, 9, 5);
    ctx.fill();
    if (chargeElapsed > 0) {
      const meter = ctx.createLinearGradient(meterX, 0, meterX + meterWidth, 0);
      meter.addColorStop(0, COLOR.charge);
      meter.addColorStop(1, COLOR.fullCharge);
      ctx.fillStyle = game.isCharged ? COLOR.fullCharge : meter;
      ctx.shadowColor = game.isCharged ? COLOR.fullCharge : COLOR.charge;
      ctx.shadowBlur = game.isCharged ? 18 : 8;
      ctx.beginPath();
      ctx.roundRect(meterX, meterY, meterWidth * chargeElapsed, 9, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "rgb(255 255 255 / 9%)";
    ctx.fillRect(1814, 18, 1, 54);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgb(163 188 171 / 68%)";
    ctx.font = "700 18px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.19em";
    ctx.fillText("SCORE", 1784, 24);
    ctx.letterSpacing = "0";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 46px 'Segoe UI', sans-serif";
    ctx.fillText(String(game.score).padStart(6, "0"), 1784, 54);
    ctx.textAlign = "left";
    ctx.strokeStyle = "rgb(190 210 255 / 88%)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const y of [31, 45, 59]) {
      ctx.beginPath();
      ctx.moveTo(1850, y);
      ctx.lineTo(1886, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgb(255 255 255 / 5%)";
    ctx.fillRect(0, HEIGHT - 2, WIDTH, 2);

    if (game.state === "GAMEOVER") drawGameOver();
    if (game.state === "PAUSED") drawPauseMenu();
  }

  function drawPauseMenu() {
    ctx.fillStyle = "rgb(2 5 18 / 68%)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const panel = ctx.createLinearGradient(
      PAUSE_MENU.x, PAUSE_MENU.y, PAUSE_MENU.x, PAUSE_MENU.y + PAUSE_MENU.height
    );
    panel.addColorStop(0, "#1b2850");
    panel.addColorStop(1, "#0b1024");
    ctx.fillStyle = panel;
    ctx.beginPath();
    ctx.roundRect(
      PAUSE_MENU.x, PAUSE_MENU.y, PAUSE_MENU.width, PAUSE_MENU.height, 16
    );
    ctx.fill();
    ctx.strokeStyle = "rgb(119 173 255 / 75%)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#a9c8ff";
    ctx.font = "800 70px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.18em";
    ctx.fillText("PAUSE", WIDTH / 2, PAUSE_MENU.y + 105);
    ctx.letterSpacing = "0";

    PAUSE_MENU_BUTTONS.forEach((button, index) => {
      const hovered = index === hoveredPauseButton;
      ctx.fillStyle = hovered ? "rgb(52 112 230 / 95%)" : "rgb(13 22 48 / 88%)";
      ctx.strokeStyle = hovered ? "#d5f4ff" : "rgb(119 173 255 / 82%)";
      ctx.lineWidth = hovered ? 3 : 2;
      if (hovered) {
        ctx.shadowColor = "rgb(105 229 255 / 42%)";
        ctx.shadowBlur = 24;
      }
      ctx.beginPath();
      ctx.roundRect(button.x, button.y, button.width, button.height, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#eff6ff";
      ctx.font = "700 36px 'Segoe UI', sans-serif";
      ctx.fillText(button.label, WIDTH / 2, button.y + button.height / 2);
    });
  }

  function drawTitle() {
    ctx.fillStyle = "rgb(3 12 17 / 53%)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const titleGlow = ctx.createRadialGradient(
      WIDTH / 2, HEIGHT / 2 - 70, 10,
      WIDTH / 2, HEIGHT / 2 - 70, 650
    );
    titleGlow.addColorStop(0, "rgb(76 119 220 / 22%)");
    titleGlow.addColorStop(1, "rgb(10 18 48 / 0%)");
    ctx.fillStyle = titleGlow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgb(105 229 255 / 38%)";
    ctx.shadowBlur = 48;
    ctx.fillStyle = COLOR.fullCharge;
    ctx.font = "900 210px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.06em";
    ctx.fillText("SPACER", WIDTH / 2, 370);
    ctx.shadowBlur = 0;
    ctx.letterSpacing = "0";

    ctx.fillStyle = "rgb(210 224 250 / 82%)";
    ctx.font = "700 34px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.24em";
    ctx.fillText(`HI-SCORE  ${String(highScore).padStart(6, "0")}`, WIDTH / 2, 545);
    ctx.letterSpacing = "0";

    const pulse = 0.72 + Math.sin(performance.now() / 420) * 0.16;
    ctx.globalAlpha = isPlayButtonHovered ? 1 : pulse;
    ctx.fillStyle = isPlayButtonHovered ? "rgb(52 112 230 / 95%)" : "rgb(13 22 48 / 88%)";
    ctx.strokeStyle = isPlayButtonHovered ? "#d5f4ff" : "rgb(119 173 255 / 82%)";
    ctx.lineWidth = isPlayButtonHovered ? 3 : 2;
    if (isPlayButtonHovered) {
      ctx.shadowColor = "rgb(105 229 255 / 48%)";
      ctx.shadowBlur = 32;
    }
    ctx.beginPath();
    ctx.roundRect(PLAY_BUTTON.x, PLAY_BUTTON.y, PLAY_BUTTON.width, PLAY_BUTTON.height, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#eff6ff";
    ctx.font = "800 48px 'Segoe UI', sans-serif";
    ctx.letterSpacing = "0.12em";
    ctx.fillText("プレイ", WIDTH / 2, PLAY_BUTTON.y + PLAY_BUTTON.height / 2);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = "0";

    ctx.fillStyle = "rgb(224 232 250 / 82%)";
    ctx.font = "500 32px 'Segoe UI', sans-serif";
    ctx.fillText("長押しでチャージ/離してブースト", WIDTH / 2, 805);
  }

  function frame(now) {
    const dt = Math.min((now - lastFrameTime) / (1000 / 60), 3);
    lastFrameTime = now;
    const isPortraitMobile = portraitMobileQuery.matches;
    drawBackground(game.state === "PAUSED" || isPortraitMobile ? 0 : dt);
    if (!isPortraitMobile) update(now, dt);
    if (game.state === "TITLE") drawTitle();
    else drawGame(game.state === "PAUSED" ? game.pausedAt : now);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
