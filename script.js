// ============================================================
// 이스터 섬의 턱 - script.js
// ============================================================

// ===== 0. HTML 요소 확인 =====
// index.html이 이 script.js와 짝이 맞지 않으면(예전 버전 등) 원인을 화면에 알려줌
const REQUIRED_IDS = [
  "gameCanvas", "message", "goldText", "resetBtn",
  "dialogue", "dlgName", "dlgText", "dlgNext",
  "carveModal", "carvePanel", "carveStage", "chinShape",
  "gaugeFill", "gaugeText", "carveDone", "carveBtn", "carveClose",
];

(function checkElements() {
  const missing = REQUIRED_IDS.filter((id) => !document.getElementById(id));
  if (missing.length === 0) return;

  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;left:0;right:0;top:0;padding:14px;z-index:9999;" +
    "background:#b71c1c;color:#fff;font:14px sans-serif;text-align:center;";
  banner.textContent =
    "index.html이 최신 버전이 아닙니다. 누락된 요소 id: " + missing.join(", ") +
    " → index.html, style.css, script.js 3개를 모두 새 버전으로 교체해 주세요.";
  document.body.appendChild(banner);
  throw new Error("누락된 HTML 요소: " + missing.join(", "));
})();

// ===== 1. 기본 설정 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const messageEl = document.getElementById("message");
const goldTextEl = document.getElementById("goldText");
const resetBtn = document.getElementById("resetBtn");

// 대화창 요소
const dialogueEl = document.getElementById("dialogue");
const dlgNameEl = document.getElementById("dlgName");
const dlgTextEl = document.getElementById("dlgText");
const dlgNextEl = document.getElementById("dlgNext");

// 턱 깎기 모달 요소
const carveModal = document.getElementById("carveModal");
const carvePanel = document.getElementById("carvePanel");
const carveStage = document.getElementById("carveStage");
const chinEl = document.getElementById("chinShape");
const gaugeFill = document.getElementById("gaugeFill");
const gaugeText = document.getElementById("gaugeText");
const carveDoneEl = document.getElementById("carveDone");
const carveBtn = document.getElementById("carveBtn");
const carveClose = document.getElementById("carveClose");

// ===== 2. 저장 데이터 (LocalStorage) =====
// 저장 구조: { gold, isSharp, tutorialDone, rewardDone, playerPos:{x,y} }
//  - isSharp      : 석상이 V라인으로 깎였는지
//  - rewardDone   : 관광객 보상(+100G)을 이미 받았는지 (새로고침 시 중복 지급 방지)
//  - playerPos    : 화면 크기에 대한 비율(0~1)이라 창 크기가 달라져도 안전함
const SAVE_KEY = "easterChinSave";
const DEFAULT_PLAYER_POS = { x: 0.3, y: 0.75 };

function defaultSave() {
  return {
    gold: 0,
    isSharp: false,
    tutorialDone: false,
    rewardDone: false,
    playerPos: { ...DEFAULT_PLAYER_POS },
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

// 불러온 값이 이상해도(손상/수동 편집 등) 안전한 값만 남김
function sanitizeSave(raw) {
  const data = defaultSave();
  if (!raw || typeof raw !== "object") return data;

  if (Number.isFinite(raw.gold) && raw.gold >= 0) data.gold = Math.floor(raw.gold);
  data.isSharp = raw.isSharp === true;
  data.tutorialDone = raw.tutorialDone === true;
  data.rewardDone = raw.rewardDone === true;

  const p = raw.playerPos;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
    data.playerPos = { x: clamp01(p.x), y: clamp01(p.y) };
  }
  return data;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return sanitizeSave(JSON.parse(raw));
  } catch (err) {
    // JSON이 깨졌거나 localStorage 접근이 막힌 경우 → 초기 상태로 시작
    console.warn("저장 데이터를 불러오지 못해 초기화합니다:", err);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      /* 무시 */
    }
    return defaultSave();
  }
}

const save = loadSave();

let ready = false;      // 초기화가 끝나기 전에는 저장하지 않음 (플레이어 위치가 아직 없으므로)
let resetting = false;  // 리셋 중에는 저장하지 않음 (새로고침 직전 자동 저장으로 되살아나는 것 방지)

function saveGame() {
  if (!ready || resetting) return;
  try {
    save.playerPos = {
      x: clamp01(player.x / canvas.width),
      y: clamp01(player.y / canvas.height),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn("저장에 실패했습니다:", err);
  }
}

// ===== 3. 게임 오브젝트 =====
// 주인공 (파란 타원형 도트)
const player = { x: 0, y: 0, rx: 12, ry: 16, speed: 190 };

// 낡은 오두막 (갈색 사각형)
const hut = { x: 0, y: 0, w: 150, h: 110 };

// 모아이 석상 (x, y는 발밑 중심 좌표)
const moai = { x: 0, y: 0, w: 56, h: 110, interactRange: 90 };

// 관광객 NPC
// mode: null(대기) | "arriving"(석상 앞으로 걸어오는 중) | "leaving"(바다 쪽으로 돌아가는 중)
const tourist = { x: 0, y: 0, rx: 12, ry: 16, speed: 110, visible: false, mode: null };

let seaStart = 0;     // 바다 시작 x좌표 (화면 오른쪽 약 20%)
let speckles = [];    // 모래 질감 점
let obstacles = [];   // 충돌 사각형
let animT = 0;        // 애니메이션용 시간(초)

// ===== 4. 화면 크기 / 레이아웃 =====
function layout() {
  // 캔버스를 창 크기에 맞춰 꽉 채움 (회색 여백 없음)
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const W = canvas.width;
  const H = canvas.height;

  seaStart = W * 0.8;

  hut.x = W * 0.08;
  hut.y = H * 0.14;

  moai.x = W * 0.5;
  moai.y = H * 0.55;

  // 걷는 중이 아닐 때만 튜토리얼용 기본 위치로 맞춤
  if (!tourist.mode) {
    tourist.x = moai.x - 95;
    tourist.y = moai.y + 12;
  }

  obstacles = [
    { x: hut.x, y: hut.y, w: hut.w, h: hut.h },
    { x: moai.x - moai.w / 2, y: moai.y - moai.h, w: moai.w, h: moai.h },
  ];

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

// 플레이어가 갈 수 있는 가장 오른쪽 x (해안선 앞까지)
function maxPlayerX() {
  return seaStart - 20 - player.rx;
}

// ===== 5. 메시지 / 골드 UI =====
let messageUntil = 0; // 0이면 석상에서 멀어질 때 사라지는 메시지

function showMessage(text, ms = 0) {
  messageEl.textContent = text;
  messageUntil = ms ? performance.now() + ms : 0;
}

function updateGoldUI(bump = false) {
  goldTextEl.textContent = save.gold;
  if (bump) {
    const box = goldTextEl.parentElement;
    box.classList.remove("bump");
    void box.offsetWidth; // 애니메이션 재시작
    box.classList.add("bump");
  }
}

// ===== 6. 키보드 입력 =====
// e.code는 물리적 키 위치라서 한글 입력 상태에서도 WASD가 동작합니다.
const keys = {};

window.addEventListener("keydown", (e) => {
  const blocked = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"];
  if (blocked.includes(e.code)) e.preventDefault();

  keys[e.code] = true;
  if (e.repeat) return;

  // 턱 깎기 팝업이 열려 있을 때: Esc로 닫기
  if (carveActive) {
    if (e.code === "Escape" && !carveFinishing) closeCarve();
    return;
  }

  // 대화 중에는 Enter로만 진행
  if (dialogueActive) {
    if (e.code === "Enter" || e.code === "NumpadEnter") advanceDialogue();
    return;
  }

  // 자유 이동 모드: 모아이 근처에서 E 키
  if (e.code === "KeyE" && isNearMoai()) {
    if (save.isSharp) {
      showMessage("이미 날렵한 V라인이다!", 2000);
    } else {
      openCarve();
    }
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// 창 포커스를 잃으면 눌린 키 상태 초기화 (캐릭터가 계속 걷는 현상 방지)
window.addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
});

// 클릭으로도 대화 진행
window.addEventListener("mousedown", () => {
  if (dialogueActive) advanceDialogue();
});

// ===== 7. 대화 시스템 =====
const tutorialScript = [
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

// 턱 깎기 완료 후 관광객 보상 대화
const rewardScript = [
  { speaker: "관광객", text: "와! 세상에… 이 턱선 좀 봐! 진짜 베일 것 같잖아?!" },
  { speaker: "관광객", text: "이건 예술이에요! 팁으로 100골드 놓고 갑니다!" },
  { speaker: "주인공", text: "오… 진짜 돈을 주네? 이스터 섬에서 턱만 잘 깎아도 먹고살겠는데?!" },
];

let dialogueScript = [];
let dialogueOnEnd = null;
let dialogueActive = false;
let dialogueIndex = 0;
let typingTimer = null;
let typing = false;
let currentFullText = "";
const TYPE_SPEED = 35; // 글자당 ms

function startDialogue(script, onEnd) {
  dialogueScript = script;
  dialogueOnEnd = onEnd || null;
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

  const callback = dialogueOnEnd;
  dialogueOnEnd = null;
  if (callback) callback();
}

// 튜토리얼 대화가 끝났을 때
function onTutorialEnd() {
  save.tutorialDone = true;
  tourist.visible = false; // 관광객은 잠시 자리를 비움 (턱을 깎으면 다시 등장)
  saveGame();
}

// 보상 대화가 끝났을 때: +100 골드
function onRewardEnd() {
  save.rewardDone = true;
  save.gold += 100;
  updateGoldUI(true);
  showMessage("+100 Gold!", 2500);
  saveGame();

  tourist.mode = "leaving"; // 관광객은 바다 쪽으로 돌아감
}

// ===== 8. 턱 깎기 미니게임 =====
let carveActive = false;     // 팝업이 열려 있는지
let carveFinishing = false;  // 100% 도달 후 닫히는 중인지
let carveProgress = 0;       // V라인 완성도 (0~100)

function openCarve() {
  carveActive = true;
  carveFinishing = false;
  carveDoneEl.classList.add("hidden");
  carveModal.classList.remove("hidden");
  messageEl.textContent = "";
  messageUntil = 0;
  renderCarve();
}

function closeCarve() {
  carveActive = false;
  carveModal.classList.add("hidden");
}

// 게이지와 팝업 속 석상의 턱 모양을 진행도에 맞춰 갱신
function renderCarve() {
  gaugeFill.style.width = carveProgress + "%";
  gaugeText.textContent = carveProgress + "%";

  const p = carveProgress / 100;
  const cx = 120;                      // 석상 중심 x
  const topY = 138;                    // 턱이 시작되는 y
  const wTop = 56;                     // 턱 윗부분 반너비
  const wBot = 52 * (1 - p) + 5 * p;   // 아랫부분 반너비: 넓음 → 뾰족
  const botY = 205 + 35 * p;           // 턱 끝: 점점 길어짐

  chinEl.setAttribute(
    "points",
    `${cx - wTop},${topY} ${cx + wTop},${topY} ${cx + wBot},${botY} ${cx - wBot},${botY}`
  );
}

// 타격 시 튀는 돌 조각
function spawnChips(clientX, clientY) {
  const rect = carveStage.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  for (let i = 0; i < 7; i++) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.left = x + "px";
    chip.style.top = y + "px";
    chip.style.setProperty("--dx", Math.random() * 90 - 45 + "px");
    chip.style.setProperty("--dy", Math.random() * 70 - 35 + "px");
    carveStage.appendChild(chip);
    setTimeout(() => chip.remove(), 550);
  }
}

// 팝업 + 화면 전체 흔들림
function shakeAll() {
  [carvePanel, canvas].forEach((el) => {
    const cls = el === canvas ? "shake-screen" : "shake";
    el.classList.remove(cls);
    void el.offsetWidth; // 애니메이션 재시작
    el.classList.add(cls);
  });
}

// 망치질 한 번
function hitChin(clientX, clientY) {
  if (carveFinishing) return;

  // 위치가 없으면(버튼으로 친 경우) 턱 중앙에서 조각이 튐
  if (clientX === undefined) {
    const r = chinEl.getBoundingClientRect();
    clientX = r.left + r.width / 2;
    clientY = r.top + r.height / 2;
  }

  carveProgress = Math.min(100, carveProgress + 7 + Math.floor(Math.random() * 4));
  shakeAll();
  spawnChips(clientX, clientY);
  renderCarve();

  if (carveProgress >= 100) finishCarve();
}

function finishCarve() {
  carveFinishing = true;
  carveDoneEl.classList.remove("hidden"); // "날렵한 V라인 완성!"

  setTimeout(() => {
    closeCarve();
    save.isSharp = true; // 이제부터 맵의 석상이 V라인으로 그려짐
    saveGame();
    showMessage("날렵한 V라인 완성!", 2500);

    // 잠시 후 관광객이 등장
    setTimeout(startTouristVisit, 1500);
  }, 1500);
}

chinEl.addEventListener("click", (e) => hitChin(e.clientX, e.clientY));
carveBtn.addEventListener("click", () => {
  carveBtn.blur(); // Space/Enter로 다시 눌리는 것 방지
  hitChin();
});
carveClose.addEventListener("click", () => {
  carveClose.blur();
  if (!carveFinishing) closeCarve();
});

// ===== 9. 관광객 보상 스토리 =====
// 맵 오른쪽(바다 쪽)에서 등장해 석상 앞까지 걸어옴
function startTouristVisit() {
  if (save.rewardDone) return;
  tourist.x = seaStart - 30;
  tourist.y = moai.y + 14;
  tourist.visible = true;
  tourist.mode = "arriving";
}

function updateTourist(dt) {
  if (!tourist.visible || !tourist.mode) return;

  const arriving = tourist.mode === "arriving";
  const tx = arriving ? moai.x + 85 : seaStart - 30;
  const ty = arriving ? moai.y + 14 : tourist.y;

  const dx = tx - tourist.x;
  const dy = ty - tourist.y;
  const dist = Math.hypot(dx, dy);
  const step = tourist.speed * dt;

  if (dist <= step) {
    // 도착
    tourist.x = tx;
    tourist.y = ty;
    tourist.mode = null;

    if (arriving) {
      startDialogue(rewardScript, onRewardEnd);
    } else {
      tourist.visible = false;
    }
  } else {
    tourist.x += (dx / dist) * step;
    tourist.y += (dy / dist) * step;
  }
}

// ===== 10. 유틸 함수 =====
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

// ===== 11. 업데이트 =====
function update(dt) {
  // 시간이 지난 메시지 지우기
  if (messageUntil && performance.now() > messageUntil) {
    messageEl.textContent = "";
    messageUntil = 0;
  }

  updateTourist(dt);

  // 대화 중이거나 팝업이 열려 있으면 이동 불가
  if (dialogueActive || carveActive) return;

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

  // 맵 경계(화면 + 해안선) 밖으로 나가지 않게 제한
  clampPlayer();

  if (!isNearMoai() && !messageUntil) messageEl.textContent = "";
}

// ===== 12. 그리기 =====
function drawGround() {
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#e2c98f";
  ctx.fillRect(0, 0, W, H);

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

  // 바다 본체
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

  // 바다 안쪽의 물결 줄무늬
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

// 석상 발밑 그림자 (두 모양 공통)
function drawMoaiShadow() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(moai.x, moai.y, moai.w * 0.7, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}

// 턱 깎기 전: 투박한 네모 턱의 모아이
function drawMoai() {
  const left = moai.x - moai.w / 2;
  const top = moai.y - moai.h;

  drawMoaiShadow();

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

// 턱 깎은 후: 뾰족하고 날렵한 V라인 모아이
function drawMoaiV() {
  const left = moai.x - moai.w / 2;
  const right = moai.x + moai.w / 2;
  const top = moai.y - moai.h;

  drawMoaiShadow();

  // 몸통
  ctx.fillStyle = "#7b7b7b";
  ctx.fillRect(left, top + 60, moai.w, moai.h - 60);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top + 60, moai.w, moai.h - 60);

  // 머리: 아래로 갈수록 좁아지는 V자 턱
  ctx.fillStyle = "#a8a8a8";
  ctx.beginPath();
  ctx.moveTo(left - 4, top);
  ctx.lineTo(right + 4, top);
  ctx.lineTo(right + 4, top + 42);
  ctx.lineTo(moai.x + 5, top + 96);
  ctx.lineTo(moai.x - 5, top + 96);
  ctx.lineTo(left - 4, top + 42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 눈썹 그늘 / 코 / 입
  ctx.fillStyle = "#5f5f5f";
  ctx.fillRect(left - 4 + 2, top + 14, moai.w + 4, 8);
  ctx.fillStyle = "#757575";
  ctx.fillRect(moai.x - 5, top + 20, 10, 26);
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(moai.x - 12, top + 58, 24, 4);

  // 반짝이는 효과
  const a = 0.4 + 0.6 * ((Math.sin(animT * 5) + 1) / 2);
  const sx = right + 16;
  const sy = top + 34;
  ctx.fillStyle = `rgba(255, 235, 120, ${a})`;
  ctx.fillRect(sx - 1, sy - 8, 3, 16);
  ctx.fillRect(sx - 8, sy - 1, 16, 3);
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
  animT = t;

  drawGround();
  drawSea(t);
  drawHut();

  // y(발밑) 기준으로 정렬해서 아래쪽에 있는 것이 위에 그려지게 함
  const list = [
    { y: moai.y, fn: save.isSharp ? drawMoaiV : drawMoai },
    { y: player.y + player.ry, fn: drawPlayer },
  ];
  if (tourist.visible) list.push({ y: tourist.y + tourist.ry, fn: drawTourist });
  list.sort((a, b) => a.y - b.y);
  list.forEach((o) => o.fn());

  // 아직 턱을 깎지 않았고 자유 이동 중일 때만 안내 표시
  if (!dialogueActive && !carveActive && !save.isSharp && isNearMoai()) drawPrompt();
}

// ===== 13. 게임 루프 =====
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}

// ===== 14. 리셋 버튼 =====
// 버튼을 눌러도 대화가 넘어가지 않도록 클릭 전파를 막음
resetBtn.addEventListener("mousedown", (e) => e.stopPropagation());

resetBtn.addEventListener("click", () => {
  resetBtn.blur(); // 포커스가 남아 Space/Enter로 다시 눌리는 것 방지

  if (!confirm("저장된 데이터를 모두 삭제하고 처음부터 다시 시작할까요?")) return;

  resetting = true; // 새로고침 직전의 자동 저장이 데이터를 되살리지 못하게 막음
  try {
    localStorage.removeItem(SAVE_KEY); // 이 게임의 저장 데이터만 삭제
  } catch (err) {
    console.warn("저장 데이터를 삭제하지 못했습니다:", err);
  }
  location.reload(); // 초기 상태(튜토리얼)부터 다시 시작
});

// ===== 15. 자동 저장 =====
// 위치는 계속 바뀌므로 주기적으로 + 탭을 닫거나 숨길 때 저장
setInterval(saveGame, 3000);
window.addEventListener("beforeunload", saveGame);
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});

// ===== 16. 시작 =====
window.addEventListener("resize", layout);
layout();
updateGoldUI();

// 저장된 위치(비율)를 복원. 장애물 안에 끼는 위치면 기본 위치로 대체
player.x = save.playerPos.x * canvas.width;
player.y = save.playerPos.y * canvas.height;
clampPlayer();
if (collides(player.x, player.y)) {
  player.x = DEFAULT_PLAYER_POS.x * canvas.width;
  player.y = DEFAULT_PLAYER_POS.y * canvas.height;
  clampPlayer();
}

ready = true;

if (!save.tutorialDone) {
  // 처음 시작: 튜토리얼 대화
  startDialogue(tutorialScript, onTutorialEnd);
} else if (save.isSharp && !save.rewardDone) {
  // 턱은 깎았지만 보상을 받기 전에 새로고침한 경우: 관광객 다시 등장
  setTimeout(startTouristVisit, 1000);
}

requestAnimationFrame(loop);