// ===== 기본 설정 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const messageEl = document.getElementById("message");

// 대화창 요소
const dialogueEl = document.getElementById("dialogue");
const dlgNameEl = document.getElementById("dlgName");
const dlgTextEl = document.getElementById("dlgText");
const dlgNextEl = document.getElementById("dlgNext");

// ===== 게임 오브젝트 =====
// 주인공 (파란 타원형 도트)
const player = { x: 0, y: 0, rx: 12, ry: 16, speed: 190 };

// 낡은 오두막 (갈색 사각형) - 위치는 layout()에서 화면 크기에 맞춰 계산
const hut = { x: 0, y: 0, w: 150, h: 110 };

// 모아이 석상 (x, y는 발밑 중심 좌표)
const moai = { x: 0, y: 0, w: 56, h: 110, interactRange: 90 };

// 관광객 NPC (대화 4번째 줄부터 등장)
const tourist = { x: 0, y: 0, rx: 12, ry: 16, visible: false };

// 바다 시작 x좌표 (화면 오른쪽 약 20%가 바다)
let seaStart = 0;

// 모래 질감용 점들 (크기가 바뀔 때마다 다시 생성)
let speckles = [];

// 충돌 판정용 사각형 목록
let obstacles = [];

// ===== 화면 크기 / 레이아웃 =====
function layout() {
  // 캔버스 해상도를 창 크기와 동일하게 맞춰서 빈 여백이 생기지 않게 함
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const W = canvas.width;
  const H = canvas.height;

  seaStart = W * 0.8;

  hut.x = W * 0.08;
  hut.y = H * 0.14;

  moai.x = W * 0.5;
  moai.y = H * 0.55;

  tourist.x = moai.x - 95;
  tourist.y = moai.y + 12;

  obstacles = [
    { x: hut.x, y: hut.y, w: hut.w, h: hut.h },
    { x: moai.x - moai.w / 2, y: moai.y - moai.h, w: moai.w, h: moai.h },
  ];

  // 모래 점과 작은 돌 생성 (바다 영역 제외)
  speckles = [];
  const count = Math.floor((W * H) / 2500);
  for (let i = 0; i < count; i++) {
    speckles.push({
      x: Math.random() * seaStart,
      y: Math.random() * H,
      s: Math.random() < 0.15 ? 5 : 3,
    });
  }

  clampPlayer();
}

function clampPlayer() {
  player.x = Math.max(player.rx, Math.min(maxPlayerX(), player.x));
  player.y = Math.max(player.ry, Math.min(canvas.height - player.ry, player.y));
}

// 플레이어가 갈 수 있는 가장 오른쪽 x (파도가 닿는 해안선 앞까지)
function maxPlayerX() {
  return seaStart - 20 - player.rx;
}

// ===== 키보드 입력 =====
// e.code는 물리적 키 위치라서 한글 입력 상태에서도 WASD가 동작합니다.
const keys = {};

window.addEventListener("keydown", (e) => {
  const blocked = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"];
  if (blocked.includes(e.code)) e.preventDefault();

  keys[e.code] = true;
  if (e.repeat) return;

  // 대화 중에는 Enter로만 진행
  if (dialogueActive) {
    if (e.code === "Enter" || e.code === "NumpadEnter") advanceDialogue();
    return;
  }

  // 자유 이동 모드: 모아이 근처에서 E 키
  if (e.code === "KeyE" && isNearMoai()) {
    messageEl.textContent = "턱 깎기는 다음 단계(Step 3)에서 구현됩니다!";
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// 클릭으로도 대화 진행
window.addEventListener("mousedown", () => {
  if (dialogueActive) advanceDialogue();
});

// ===== 튜토리얼 대화 시스템 =====
const dialogueScript = [
  { speaker: "주인공", text: "할아버지… 세상에 날 혼자 두고 가시면 어떡해요…." },
  { speaker: "주인공", text: "부모님도 없고, 일자리도 없고… 가진 거라곤 할아버지가 남겨주신 이스터 섬의 땅 한 평뿐이라니." },
  { speaker: "주인공", text: "음? 휑한 오두막 안에 웬 망치랑 조각 칼이 있지?… 쳇, 줘도 이런 걸 주시고." },
  { speaker: "관광객", text: "어라? 여기도 모아이 석상이 있네! …어, 실례합니다! 혹시 이 땅 주인분이세요?" },
  { speaker: "주인공", text: "아, 네… 그런데요?" },
  { speaker: "관광객", text: "이 석상, 다 좋은데 턱선이 너무 투박하지 않나요? 턱만 좀 뾰족하고 날렵하게 깎으면 대박 날 것 같은데요?" },
  { speaker: "주인공", text: "어… 마침 망치랑 조각 칼을 줍긴 했는데… 정말 이걸 깎아보라고요?" },
  { speaker: "관광객", text: "당연하죠! 빨리 깎아봐요!" },
  { speaker: "주인공", text: "(손에 망치를 쥐며) 에라, 모르겠다. 깎아본다!" },
];

let dialogueActive = false;
let dialogueIndex = 0;
let typingTimer = null;
let typing = false;
let currentFullText = "";
const TYPE_SPEED = 35; // 글자당 ms

function startDialogue() {
  dialogueActive = true;
  dialogueIndex = 0;
  dialogueEl.classList.remove("hidden");
  showLine();
}

function showLine() {
  const line = dialogueScript[dialogueIndex];
  dlgNameEl.textContent = line.speaker;
  currentFullText = line.text;
  dlgTextEl.textContent = "";
  dlgNextEl.style.visibility = "hidden";

  // 관광객이 처음 말하는 줄부터 맵에 등장
  if (line.speaker === "관광객") tourist.visible = true;

  // 타자기 효과로 한 글자씩 출력
  typing = true;
  let i = 0;
  clearInterval(typingTimer);
  typingTimer = setInterval(() => {
    i++;
    dlgTextEl.textContent = currentFullText.slice(0, i);
    if (i >= currentFullText.length) finishTyping();
  }, TYPE_SPEED);
}

function finishTyping() {
  clearInterval(typingTimer);
  typing = false;
  dlgTextEl.textContent = currentFullText;
  dlgNextEl.style.visibility = "visible";
}

function advanceDialogue() {
  // 아직 출력 중이면 먼저 전체 문장을 보여줌
  if (typing) {
    finishTyping();
    return;
  }

  dialogueIndex++;
  if (dialogueIndex >= dialogueScript.length) {
    endDialogue();
  } else {
    showLine();
  }
}

function endDialogue() {
  dialogueActive = false;
  dialogueEl.classList.add("hidden");
  // 이제부터 자유 이동 + [E] 상호작용 가능
}

// ===== 유틸 함수 =====
function isNearMoai() {
  const dx = player.x - moai.x;
  const dy = player.y - (moai.y - moai.h / 2);
  return Math.hypot(dx, dy) < moai.interactRange;
}

function hitsRect(px, py, r) {
  return (
    px + player.rx > r.x &&
    px - player.rx < r.x + r.w &&
    py + player.ry > r.y &&
    py - player.ry < r.y + r.h
  );
}

function collides(px, py) {
  return obstacles.some((r) => hitsRect(px, py, r));
}

// 바다 해안선의 x좌표 (파도에 따라 일렁임)
function shoreX(y, t) {
  return seaStart + Math.sin(y * 0.02 + t * 2) * 8 + Math.sin(y * 0.05 - t * 1.3) * 4;
}

// ===== 업데이트 =====
function update(dt) {
  if (dialogueActive) return; // 대화 중에는 이동 불가

  let dx = 0;
  let dy = 0;

  if (keys["ArrowLeft"] || keys["KeyA"]) dx -= 1;
  if (keys["ArrowRight"] || keys["KeyD"]) dx += 1;
  if (keys["ArrowUp"] || keys["KeyW"]) dy -= 1;
  if (keys["ArrowDown"] || keys["KeyS"]) dy += 1;

  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  const nextX = player.x + dx * player.speed * dt;
  if (!collides(nextX, player.y)) player.x = nextX;

  const nextY = player.y + dy * player.speed * dt;
  if (!collides(player.x, nextY)) player.y = nextY;

  // 맵 경계(화면 + 바다 앞 해안선) 밖으로 나가지 않게 제한
  clampPlayer();

  if (!isNearMoai()) messageEl.textContent = "";
}

// ===== 그리기 =====
function drawGround() {
  const W = canvas.width;
  const H = canvas.height;

  // 모래 바닥 (전체 채움)
  ctx.fillStyle = "#e2c98f";
  ctx.fillRect(0, 0, W, H);

  // 모래 점/돌
  ctx.fillStyle = "rgba(150, 120, 60, 0.28)";
  for (const s of speckles) ctx.fillRect(s.x, s.y, s.s, s.s);
}

function drawSea(t) {
  const W = canvas.width;
  const H = canvas.height;

  // 젖은 모래 띠 (해안선 안쪽)
  ctx.fillStyle = "#c9ab6c";
  ctx.beginPath();
  ctx.moveTo(W, 0);
  for (let y = 0; y <= H; y += 8) ctx.lineTo(shoreX(y, t) - 22, y);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // 바다 본체 (가로 그라데이션: 얕은 곳 → 깊은 곳)
  const grad = ctx.createLinearGradient(seaStart, 0, W, 0);
  grad.addColorStop(0, "#4fc3e8");
  grad.addColorStop(1, "#1565b8");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(W, 0);
  for (let y = 0; y <= H; y += 8) ctx.lineTo(shoreX(y, t), y);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // 흰 거품 해안선
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let y = 0; y <= H; y += 8) {
    const x = shoreX(y, t);
    if (y === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // 바다 안쪽의 물결 줄무늬 (천천히 밀려옴)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 2;
  const seaW = W - seaStart;
  for (let row = 0; row < 14; row++) {
    const baseY = (row / 14) * H + ((t * 20) % (H / 14));
    ctx.beginPath();
    for (let x = 0; x <= seaW - 20; x += 6) {
      const px = seaStart + 30 + x;
      const py = baseY + Math.sin(x * 0.08 + t * 2 + row) * 4;
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}

function drawHut() {
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(hut.x, hut.y, hut.w, hut.h);
  ctx.strokeStyle = "#4e3016";
  ctx.lineWidth = 4;
  ctx.strokeRect(hut.x, hut.y, hut.w, hut.h);
  ctx.fillStyle = "#4e3016";
  ctx.fillRect(hut.x + hut.w / 2 - 14, hut.y + hut.h - 40, 28, 40);

  ctx.fillStyle = "#fff";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("낡은 오두막", hut.x + hut.w / 2, hut.y - 8);
}

function drawMoai() {
  const left = moai.x - moai.w / 2;
  const top = moai.y - moai.h;

  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(moai.x, moai.y, moai.w * 0.7, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8d8d8d";
  ctx.fillRect(left, top, moai.w, moai.h);
  ctx.fillRect(left - 4, top, moai.w + 8, 40);

  ctx.fillStyle = "#5f5f5f";
  ctx.fillRect(left, top + 14, moai.w, 8);

  ctx.fillStyle = "#757575";
  ctx.fillRect(moai.x - 5, top + 20, 10, 26);

  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(moai.x - 14, top + 56, 28, 4);

  ctx.fillStyle = "#9a9a9a";
  ctx.fillRect(moai.x - 16, top + 62, 32, 34);

  ctx.strokeStyle = "#444";
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top, moai.w, moai.h);
}

// 타원형 캐릭터 공통 그리기
function drawBlob(c, color, outline) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + c.ry - 2, c.rx, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawPlayer() {
  drawBlob(player, "#2f6fed", "#173f94"); // 파란 주인공
}

function drawTourist() {
  drawBlob(tourist, "#ff8a3d", "#a34a10"); // 주황색 관광객
}

function roundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPrompt() {
  const text = "[E] 턱 깎기";
  ctx.font = "bold 16px sans-serif";
  const padding = 12;
  const boxW = ctx.measureText(text).width + padding * 2;
  const boxH = 32;
  const boxX = moai.x - boxW / 2;
  const boxY = Math.max(4, moai.y - moai.h - boxH - 14);

  roundedRectPath(boxX, boxY, boxW, boxH, 8);
  ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "#ffd54a";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffd54a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, moai.x, boxY + boxH / 2);
  ctx.textBaseline = "alphabetic";
}

function draw(t) {
  drawGround();
  drawSea(t);
  drawHut();

  // y(발밑) 기준으로 정렬해서 아래쪽에 있는 것이 위에 그려지게 함
  const list = [
    { y: moai.y, fn: drawMoai },
    { y: player.y + player.ry, fn: drawPlayer },
  ];
  if (tourist.visible) list.push({ y: tourist.y + tourist.ry, fn: drawTourist });
  list.sort((a, b) => a.y - b.y);
  list.forEach((o) => o.fn());

  if (!dialogueActive && isNearMoai()) drawPrompt();
}

// ===== 게임 루프 =====
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}

// ===== 시작 =====
window.addEventListener("resize", layout);
layout();

// 주인공 시작 위치 (오두막 앞쪽)
player.x = canvas.width * 0.3;
player.y = canvas.height * 0.75;
clampPlayer();

// 관광객 위치는 layout()에서 계산됨 → 게임 시작과 동시에 튜토리얼 대화 시작
startDialogue();
requestAnimationFrame(loop);