// ============================================================
// 이스터 섬의 턱 - script.js
//  Step 7: 이스터 부동산 인수 + 해안가 석상 조각 + 진행 상태 저장
//  + 모바일 지원(가상 조이스틱 / E 버튼 / 화면 대응)
// ============================================================

// ===== 0. 설정값 (개발/테스트용 스위치) =====
const ZONE3_PRICE = 500;             // 3구역(해안가 비경 구역) 인수 비용
const DEBUG_TOOLS = true;            // true: 우측 상단에 '+100G (테스트)' 버튼 표시 (완성 후 false 로)
const FOG_FADE_SEC = 3;              // 안개가 걷히는 데 걸리는 시간(초)
const FOG_BLOCK_ALPHA = 0.35;        // 안개가 이 값보다 짙으면 통과할 수 없음

// ===== 1. HTML 요소 확인 =====
// index.html이 이 script.js와 짝이 맞지 않으면(예전 버전 등) 원인을 화면에 알려줌
const REQUIRED_IDS = [
  "gameCanvas", "message", "goldText", "areaText", "hudHint", "resetBtn", "testGoldBtn",
  "dialogue", "dlgName", "dlgText", "dlgNext", "dlgHint",
  "carveModal", "carvePanel", "carveStage", "chinShape",
  "gaugeFill", "gaugeText", "carveDone", "carveBtn", "carveClose", "carveGuide",
  "joystick", "stick", "actionBtn",
  "estateModal", "estateTitle", "estateClose", "estateBuy", "estateGold", "estateStatus", "carveTitle",
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

// ===== 2. 기본 설정 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const messageEl = document.getElementById("message");
const goldTextEl = document.getElementById("goldText");
const areaTextEl = document.getElementById("areaText");
const hudHintEl = document.getElementById("hudHint");
const resetBtn = document.getElementById("resetBtn");
const testGoldBtn = document.getElementById("testGoldBtn");

// 대화창 요소
const dialogueEl = document.getElementById("dialogue");
const dlgNameEl = document.getElementById("dlgName");
const dlgTextEl = document.getElementById("dlgText");
const dlgNextEl = document.getElementById("dlgNext");
const dlgHintEl = document.getElementById("dlgHint");

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
const carveGuideEl = document.getElementById("carveGuide");

// 모바일 조작 요소
const joystickEl = document.getElementById("joystick");
const stickEl = document.getElementById("stick");
const actionBtn = document.getElementById("actionBtn");

const estateModal = document.getElementById("estateModal");
const estateClose = document.getElementById("estateClose");
const estateBuy = document.getElementById("estateBuy");
const estateGold = document.getElementById("estateGold");
const estateStatus = document.getElementById("estateStatus");
const carveTitle = document.getElementById("carveTitle");
let estateActive = false;
let estatePreviousFocus = null;

// ===== 3. 저장 데이터 (LocalStorage) =====
// 저장 구조:
//  version, gold, isSharp(석상 V라인 여부), tutorialDone, rewardDone(관광객 보상 수령),
//  villageVisited(마을 방문), villageIntroDone(원주민 소개 대화 완료),
//  unlockedZones({ zone3: 해안가 비경 구역 인수 여부 }), coastIsSharp(해안가 석상 조각 완료),
//  playerPos(맵 전체 기준 비율 0~1)
const SAVE_KEY = "easterChinSave";
const SAVE_VERSION = 2;                          // 맵 구조가 바뀌면 올림 (이전 위치 정보 무시)
const ZONE_KEYS = ["zone3"];
const DEFAULT_PLAYER_POS = { x: 0.1, y: 0.75 };  // 오두막 앞

function defaultSave() {
  return {
    version: SAVE_VERSION,
    gold: 0,
    isSharp: false,
    coastIsSharp: false,
    tutorialDone: false,
    rewardDone: false,
    villageVisited: false,
    villageIntroDone: false,
    unlockedZones: { zone3: false },
    playerPos: { ...DEFAULT_PLAYER_POS },
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

// 불러온 값이 이상해도(손상/수동 편집/이전 버전 저장 등) 안전한 값만 남김
function sanitizeSave(raw) {
  const data = defaultSave();
  if (!raw || typeof raw !== "object") return data;

  if (Number.isFinite(raw.gold) && raw.gold >= 0) data.gold = Math.floor(raw.gold);
  data.isSharp = raw.isSharp === true;
  data.tutorialDone = raw.tutorialDone === true;
  data.rewardDone = raw.rewardDone === true;
  data.villageVisited = raw.villageVisited === true;
  data.villageIntroDone = raw.villageIntroDone === true;

  // 구역 해금 정보 (없거나 이상하면 모두 잠금)
  const z = raw.unlockedZones;
  if (z && typeof z === "object") {
    for (const key of ZONE_KEYS) data.unlockedZones[key] = z[key] === true;
  }
  // 기존 저장 파일에는 이 값이 없으므로 미완료로 시작합니다.
  data.coastIsSharp = data.unlockedZones.zone3 && raw.coastIsSharp === true;

  // 위치는 같은 맵 구조(version)일 때만 복원
  const p = raw.playerPos;
  if (raw.version === SAVE_VERSION && p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
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

let ready = false;      // 초기화가 끝나기 전에는 저장하지 않음
let resetting = false;  // 리셋 중에는 저장하지 않음 (새로고침 직전 자동 저장으로 되살아나는 것 방지)

function saveGame() {
  if (!ready || resetting) return;
  try {
    save.version = SAVE_VERSION;
    save.playerPos = {
      x: clamp01(player.x / worldW),
      y: clamp01(player.y / worldH),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn("저장에 실패했습니다:", err);
  }
}

function isZoneUnlocked(id) {
  return save.unlockedZones[id] === true;
}

// ===== 4. 게임 오브젝트 =====
// 주인공 (파란 타원형 도트)
const player = { x: 0, y: 0, rx: 12, ry: 16, speed: 190 };

// 낡은 오두막 (갈색 사각형)
const hut = { x: 0, y: 0, w: 150, h: 110 };

// 모아이 석상 (x, y는 발밑 중심 좌표)
const moai = { x: 0, y: 0, w: 56, h: 110, interactRange: 90 };

// 3구역의 쌍턱 모아이 석상
const coastMoai = { x: 0, y: 0, w: 56, h: 110, interactRange: 90 };

// 관광객 NPC
// mode: null(대기) | "arriving"(석상 앞으로 걸어오는 중) | "leaving"(마을 쪽으로 돌아가는 중)
const tourist = { x: 0, y: 0, rx: 12, ry: 16, speed: 110, visible: false, mode: null };

// 원주민 NPC (마을 중앙)
const villager = { x: 0, y: 0, rx: 12, ry: 16 };

// 마을 건물들 (위치/크기는 layout()에서 계산)
const buildings = [
  {
    id: "shop", name: "도구 상점", w: 150, h: 110, x: 0, y: 0,
    prompt: "[E] 도구 상점 (다음 단계에서 오픈)",
    closedMsg: "도구 상점은 다음 단계에서 오픈됩니다!",
  },
  {
    id: "board", name: "홍보판", w: 110, h: 90, x: 0, y: 0,
    prompt: "[E] 홍보물 붙이기 (다음 단계에서 오픈)",
    closedMsg: "홍보판은 다음 단계에서 오픈됩니다!",
  },
  {
    id: "estate", name: "이스터 부동산", w: 170, h: 120, x: 0, y: 0,
    prompt: "[E] 이스터 부동산 - 영토 인수 센터",
  },
];

// 3구역 입구 앞 '인수 대기중' 표지판 (판 + 기둥)
const zoneSign = { x: 0, y: 0, w: 250, h: 34, postX: 0, rect: { x: 0, y: 0, w: 0, h: 0 } };

// 맵 구조 (모두 layout()에서 계산)
//  [1구역 오두막 마당] ─울타리(fenceX)─ [2구역 원주민 마을] ─안개 입구(gateX)─ [3구역 해안가 비경] ─ 바다
let viewW = 0;        // 화면에 보이는 논리 가로 크기
let viewH = 0;        // 화면에 보이는 논리 세로 크기
let zoom = 1;         // 작은 화면에서 맵을 축소하는 배율
let dpr = 1;          // 화면 선명도(devicePixelRatio, 최대 2)
let layoutW = 0;      // 맵 배치 기준 가로 (좁은 화면에서도 건물이 겹치지 않게 최소값 보장)
let worldW = 0;       // 맵 전체 가로 길이 (layoutW의 3배)
let worldH = 0;       // 맵 전체 세로 길이
let fenceX = 0;       // 1구역 ↔ 2구역 경계(울타리) x
let gateY = 0;        // 울타리 통로 중심 y
let gateTop = 0;
let gateBottom = 0;
let gateX = 0;        // 2구역 ↔ 3구역 경계(안개 입구) x
let gate2Y = 0;       // 안개 입구 중심 y
let gate2Top = 0;
let gate2Bottom = 0;
let seaStart = 0;     // 바다 시작 x (3구역 오른쪽 끝)
let camX = 0;         // 카메라 x (화면 왼쪽 끝이 가리키는 맵 좌표)
let speckles = [];    // 모래 질감 점
let obstacles = [];   // 충돌 사각형
let fogRect = { x: 0, y: 0, w: 0, h: 0 }; // 안개 입구를 막는 충돌 영역
let coastDecor = { palms: [], rocks: [], pools: [] };
let animT = 0;        // 애니메이션용 시간(초)
let currentArea = ""; // 현재 위치 이름 (HUD 표시용)

// 안개 농도 (1: 짙음 → 0: 완전히 걷힘). 인수한 구역은 처음부터 0
let fogAlpha = isZoneUnlocked("zone3") ? 0 : 1;

function fogBlocks() {
  return fogAlpha > FOG_BLOCK_ALPHA;
}

// ===== 5. 화면 크기 / 레이아웃 =====
const MIN_VIEW_H = 520;    // 논리 화면 최소 높이 (이보다 낮은 화면은 축소해서 보여줌)
const MIN_LAYOUT_W = 900;  // 맵 배치 기준 최소 가로
const MAX_DPR = 2;

// 같은 시드면 항상 같은 값을 주는 난수 (화면 크기가 바뀌어도 모래 점이 깜빡이지 않게)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layout() {
  // 창 크기가 바뀌어도 캐릭터가 같은 지점에 머물도록 비율 기억
  const hadWorld = worldW > 0 && worldH > 0;
  const rx = hadWorld ? player.x / worldW : 0;
  const ry = hadWorld ? player.y / worldH : 0;

  // 캔버스를 화면에 꽉 채움 (회색 여백 없음). 낮은 화면은 zoom 으로 축소, 고해상도는 dpr 로 선명하게
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  zoom = Math.min(1, vh / MIN_VIEW_H);
  viewW = vw / zoom;
  viewH = vh / zoom;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);

  const W = Math.max(viewW, MIN_LAYOUT_W);
  const H = viewH;
  layoutW = W;
  worldW = W * 3;           // 맵은 3개 구역 (마당 + 마을 + 해안가)
  worldH = H;
  fenceX = W * 0.88;        // 1구역 오른쪽 경계
  gateX = W * 1.92;         // 2구역 오른쪽 경계 (3구역 입구)
  seaStart = worldW - W * 0.2; // 맵 맨 오른쪽 끝이 바다

  // 1구역 ↔ 2구역 울타리 통로
  gateY = H * 0.75;
  gateTop = gateY - 60;
  gateBottom = gateY + 60;

  // 2구역 ↔ 3구역 안개 입구
  gate2Y = H * 0.62;
  gate2Top = gate2Y - 70;
  gate2Bottom = gate2Y + 70;

  // ----- 1구역: 오두막 마당 -----
  hut.x = W * 0.08;
  hut.y = H * 0.14;

  moai.x = W * 0.5;
  moai.y = H * 0.55;

  // 걷는 중이 아닐 때만 튜토리얼용 기본 위치로 맞춤
  if (!tourist.mode) {
    tourist.x = moai.x - 95;
    tourist.y = moai.y + 12;
  }

  // ----- 2구역: 원주민 마을 -----
  const vilW = gateX - fenceX; // 마을 가로 길이
  const [shop, board, estate] = buildings;
  shop.x = fenceX + vilW * 0.08;
  shop.y = H * 0.1;
  board.x = fenceX + vilW * 0.35;
  board.y = H * 0.1;
  estate.x = fenceX + vilW * 0.57;
  estate.y = H * 0.1;

  villager.x = fenceX + vilW * 0.4;
  villager.y = H * 0.55;

  // 안개 입구 앞 표지판 (판은 입구에서 150px 떨어진 기둥 위)
  zoneSign.postX = gateX - 150;
  zoneSign.x = zoneSign.postX - zoneSign.w / 2;
  zoneSign.y = gate2Y - 10 - zoneSign.h;
  zoneSign.rect = { x: zoneSign.x, y: zoneSign.y, w: zoneSign.w, h: zoneSign.h + 26 };

  // ----- 3구역: 해안가 비경 구역 -----
  const coastW = seaStart - gateX;
  coastMoai.x = gateX + coastW * 0.45;
  coastMoai.y = H * 0.6;

  coastDecor = {
    palms: [
      { x: gateX + coastW * 0.15, y: H * 0.3 },
      { x: gateX + coastW * 0.72, y: H * 0.26 },
      { x: gateX + coastW * 0.27, y: H * 0.9 },
      { x: gateX + coastW * 0.8, y: H * 0.88 },
    ],
    rocks: [
      { x: gateX + coastW * 0.1, y: H * 0.62, r: 15 },
      { x: gateX + coastW * 0.18, y: H * 0.7, r: 10 },
      { x: gateX + coastW * 0.6, y: H * 0.78, r: 14 },
      { x: gateX + coastW * 0.88, y: H * 0.45, r: 17 },
      { x: gateX + coastW * 0.4, y: H * 0.18, r: 12 },
    ],
    pools: [
      { x: gateX + coastW * 0.64, y: H * 0.5, rx: 46, ry: 18 },
      { x: gateX + coastW * 0.3, y: H * 0.74, rx: 38, ry: 14 },
    ],
  };

  // ----- 충돌 -----
  obstacles = [
    // 오두막, 모아이
    { x: hut.x, y: hut.y, w: hut.w, h: hut.h },
    { x: moai.x - moai.w / 2, y: moai.y - moai.h, w: moai.w, h: moai.h },
    // 1↔2구역 울타리 (통로 부분만 비어 있음)
    { x: fenceX - 6, y: 0, w: 12, h: gateTop },
    { x: fenceX - 6, y: gateBottom, w: 12, h: H - gateBottom },
    // 2↔3구역 울타리 (안개 입구 부분만 비어 있고, 그 틈은 fogRect 가 막음)
    { x: gateX - 6, y: 0, w: 12, h: gate2Top },
    { x: gateX - 6, y: gate2Bottom, w: 12, h: H - gate2Bottom },
    // 원주민
    { x: villager.x - 14, y: villager.y - villager.ry, w: 28, h: villager.ry * 2 },
    // 인수 표지판 기둥
    { x: zoneSign.postX - 9, y: gate2Y - 10, w: 18, h: 26 },
    // 쌍턱 모아이
    { x: coastMoai.x - coastMoai.w / 2, y: coastMoai.y - coastMoai.h, w: coastMoai.w, h: coastMoai.h },
  ];
  buildings.forEach((b) => obstacles.push({ x: b.x, y: b.y, w: b.w, h: b.h }));

  // 안개가 짙은 동안 입구를 막는 영역 (캐릭터가 뚫고 지나가지 못하도록 두께 30)
  fogRect = { x: gateX - 15, y: gate2Top, w: 30, h: gate2Bottom - gate2Top };

  // ----- 모래 점 (바다 영역 제외) -----
  const rand = mulberry32(20261021);
  speckles = [];
  const count = Math.floor((seaStart * H) / 2500);
  for (let i = 0; i < count; i++) {
    speckles.push({
      x: rand() * seaStart,
      y: rand() * H,
      s: rand() < 0.15 ? 5 : 3,
    });
  }

  if (hadWorld) {
    player.x = rx * worldW;
    player.y = ry * H;
  }
  clampPlayer();
  updateCamera(0, true);
}

function clampPlayer() {
  player.x = Math.max(player.rx, Math.min(maxPlayerX(), player.x));
  player.y = Math.max(player.ry, Math.min(worldH - player.ry, player.y));
}

// 플레이어가 갈 수 있는 가장 오른쪽 x
//  - 안개가 짙으면 안개 입구 앞까지
//  - 안개가 걷히면 해안선 앞까지
function maxPlayerX() {
  if (fogBlocks()) return gateX - 16 - player.rx - 1;
  return seaStart - 20 - player.rx;
}

// 카메라가 바라볼 x: 평소엔 플레이어, 관광객이 걸어오거나 대화 중이면 둘 사이(화면 안에 둘 다 보이게)
function cameraFocusX() {
  // 관광객이 화면에 같이 들어올 만큼 가까울 때만 둘 사이를 비춤 (멀리 있으면 플레이어만 따라감)
  const touristNear = tourist.visible && Math.abs(player.x - tourist.x) < viewW - 120;
  if (touristNear && (tourist.mode || dialogueActive)) {
    const maxOffset = viewW / 2 - 60;
    const mid = (player.x + tourist.x) / 2;
    return Math.max(player.x - maxOffset, Math.min(player.x + maxOffset, mid));
  }
  return player.x;
}

// 카메라: 좌우로 스크롤 (맵 밖은 보이지 않게 제한)
function updateCamera(dt, snap) {
  const maxCam = Math.max(0, worldW - viewW);
  const target = Math.max(0, Math.min(maxCam, cameraFocusX() - viewW / 2));
  camX = snap ? target : camX + (target - camX) * Math.min(1, dt * 8);
}

// ===== 6. 메시지 / 골드 / 위치 UI =====
let messageUntil = 0;

function showMessage(text, ms = 2000) {
  messageEl.textContent = text;
  messageUntil = performance.now() + ms;
}

function updateGoldUI(bump = false) {
  goldTextEl.textContent = save.gold;
  estateGold.textContent = save.gold;
  if (bump) {
    const box = goldTextEl.parentElement;
    box.classList.remove("bump");
    void box.offsetWidth; // 애니메이션 재시작
    box.classList.add("bump");
  }
}

function setArea(name) {
  if (currentArea === name) return;
  currentArea = name;
  areaTextEl.textContent = name;
}

function areaNameAt(x) {
  if (x > gateX) return "해안가 비경 구역";
  if (x > fenceX) return "원주민 마을";
  return "오두막 마당";
}

// 구역 이동 감지 + 마을 첫 방문 처리
function checkArea() {
  setArea(areaNameAt(player.x));

  if (player.x > fenceX && !save.villageVisited) {
    save.villageVisited = true;
    saveGame();
    showMessage("원주민 마을에 도착했다! 가운데 있는 원주민에게 말을 걸어보자.", 4000);
  }
}

// 진동 (지원하는 기기에서만)
function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {
    /* 무시 */
  }
}

// ===== 7. 모바일(터치) 조작 =====
const coarseQuery = window.matchMedia("(pointer: coarse)");
let touchMode = false;
let rangeBonus = 0; // 터치에서는 상호작용 거리를 조금 넉넉하게

const HINT_TEXT = {
  desktop: {
    hud: "이동: 방향키 / WASD  |  상호작용: E",
    dlg: "클릭 또는 Enter",
    carve: "마우스로 턱을 클릭해 날렵하게 깎으세요!",
  },
  touch: {
    hud: "이동: 조이스틱  |  상호작용: E 버튼",
    dlg: "화면을 탭하세요",
    carve: "턱을 탭해서 날렵하게 깎으세요!",
  },
};

function setTouchMode(on) {
  if (touchMode === on) return;
  touchMode = on;
  document.body.classList.toggle("is-touch", on);
  rangeBonus = on ? 20 : 0;

  const t = on ? HINT_TEXT.touch : HINT_TEXT.desktop;
  hudHintEl.textContent = t.hud;
  dlgHintEl.textContent = t.dlg;
  carveGuideEl.textContent = t.carve;

  if (!on) resetJoystick();
}

// ----- 가상 조이스틱 -----
const joy = { x: 0, y: 0 }; // 조이스틱 입력 (-1 ~ 1)
let joyPointer = null;      // 조이스틱을 누르고 있는 손가락 id
const JOY_DEADZONE = 0.18;

function joyUpdate(e) {
  const r = joystickEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const maxR = r.width * 0.34; // 손잡이가 움직이는 최대 반경

  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > maxR) {
    dx = (dx / len) * maxR;
    dy = (dy / len) * maxR;
  }

  stickEl.style.setProperty("--kx", dx + "px");
  stickEl.style.setProperty("--ky", dy + "px");

  const nx = dx / maxR;
  const ny = dy / maxR;
  const mag = Math.hypot(nx, ny);
  if (mag < JOY_DEADZONE) {
    joy.x = 0;
    joy.y = 0;
  } else {
    // 데드존을 빼고 0~1 로 다시 맞춤 (살살 밀면 천천히, 끝까지 밀면 최대 속도)
    const scale = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE) / mag;
    joy.x = nx * scale;
    joy.y = ny * scale;
  }
}

function resetJoystick() {
  joy.x = 0;
  joy.y = 0;
  if (joyPointer !== null) {
    try {
      joystickEl.releasePointerCapture(joyPointer);
    } catch (e) {
      /* 무시 */
    }
  }
  joyPointer = null;
  stickEl.style.setProperty("--kx", "0px");
  stickEl.style.setProperty("--ky", "0px");
}

joystickEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation(); // 대화 넘기기 등 다른 터치 처리와 섞이지 않게
  if (dialogueActive || carveActive || estateActive || joyPointer !== null) return;
  joyPointer = e.pointerId;
  try {
    joystickEl.setPointerCapture(e.pointerId);
  } catch (err) {
    /* 무시 */
  }
  joyUpdate(e);
});

joystickEl.addEventListener("pointermove", (e) => {
  if (e.pointerId === joyPointer) joyUpdate(e);
});

["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => {
  joystickEl.addEventListener(type, (e) => {
    if (e.pointerId === joyPointer) resetJoystick();
  });
});

// ----- E 버튼 -----
actionBtn.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation(); // 이 터치가 곧바로 대화를 넘기지 않게
  if (dialogueActive || carveActive || estateActive) return;
  interact();
});

// 화면 상태에 맞춰 조작 UI 갱신 (대화/팝업 중엔 숨김, 상호작용 가능하면 E 버튼 강조)
let uiBusy = false;
let btnReady = false;

function updateTouchUI(target) {
  const busy = dialogueActive || carveActive || estateActive;
  if (busy !== uiBusy) {
    uiBusy = busy;
    document.body.classList.toggle("ui-busy", busy);
    if (busy) resetJoystick();
  }

  const isReady = !!target;
  if (isReady !== btnReady) {
    btnReady = isReady;
    actionBtn.classList.toggle("ready", isReady);
  }
}

// 확대/길게 누르기 등 브라우저 기본 동작 막기 (iOS Safari 포함)
document.addEventListener("gesturestart", (e) => e.preventDefault());
window.addEventListener("contextmenu", (e) => {
  if (touchMode) e.preventDefault();
});

// ===== 8. 상호작용 대상 찾기 =====
function isNearMoai() {
  const dx = player.x - moai.x;
  const dy = player.y - (moai.y - moai.h / 2);
  return Math.hypot(dx, dy) < moai.interactRange + rangeBonus;
}

function nearPoint(o, range) {
  return Math.hypot(player.x - o.x, player.y - o.y) < range;
}

// 플레이어와 사각형 사이의 가장 가까운 거리로 판정
function nearRect(r, range) {
  const px = Math.max(r.x, Math.min(player.x, r.x + r.w));
  const py = Math.max(r.y, Math.min(player.y, r.y + r.h));
  return Math.hypot(player.x - px, player.y - py) < range;
}

// 지금 E 키(또는 E 버튼)로 상호작용할 수 있는 대상 (없으면 null)
function getTarget() {
  if (dialogueActive || carveActive || estateActive) return null;

  // 모아이 석상 (턱을 깎은 뒤에는 안내 문구 없이 E만 반응)
  if (isNearMoai()) {
    return {
      id: "moai",
      label: save.isSharp ? null : "[E] 턱 깎기",
      x: moai.x,
      y: moai.y - moai.h,
      below: false,
    };
  }

  // 원주민 NPC
  if (nearPoint(villager, 75 + rangeBonus)) {
    return {
      id: "villager",
      label: "[E] 대화하기",
      x: villager.x,
      y: villager.y - villager.ry - 4,
      below: false,
    };
  }

  // 3구역 인수 표지판
  if (nearRect(zoneSign.rect, 50 + rangeBonus)) {
    return {
      id: "zoneSign",
      label: "[E] 표지판 읽기",
      x: zoneSign.x + zoneSign.w / 2,
      y: zoneSign.y,
      below: false,
    };
  }

  // 3구역 쌍턱 모아이 (안개가 걷힌 뒤에만)
  if (isZoneUnlocked("zone3") && !fogBlocks()) {
    const c = { x: coastMoai.x, y: coastMoai.y - coastMoai.h / 2 };
    if (nearPoint(c, coastMoai.interactRange + rangeBonus)) {
      return {
        id: "coastMoai",
        label: save.coastIsSharp ? null : "[E] 쌍턱 모아이 턱 깎기",
        x: coastMoai.x,
        y: coastMoai.y - coastMoai.h - 20,
        below: false,
      };
    }
  }

  // 부동산은 소개 대화 전에도 이용할 수 있습니다.
  {
    for (const b of buildings) {
      if (b.id !== "estate" && !save.villageIntroDone) continue;
      if (nearRect(b, 55 + rangeBonus)) {
        return { id: b.id, label: b.prompt, x: b.x + b.w / 2, y: b.y + b.h, below: true, building: b };
      }
    }
  }
  return null;
}

// E 키(또는 E 버튼)를 눌렀을 때 대상별 동작
function interact() {
  const target = getTarget();
  if (!target) return;

  switch (target.id) {
    case "moai":
      if (save.isSharp) showMessage("이미 날렵한 V라인이다!", 2000);
      else openCarve();
      break;

    case "villager":
      if (save.villageIntroDone) startDialogue(villagerRepeatScript);
      else startDialogue(villageIntroScript, onVillageIntroEnd);
      break;

    case "zoneSign":
      if (isZoneUnlocked("zone3")) startDialogue(signUnlockedScript);
      else startDialogue(signLockedScript);
      break;

    case "coastMoai":
      if (save.coastIsSharp) showMessage("이미 날렵한 V라인이다!", 2000);
      else openCarve("coastMoai");
      break;

    case "estate":
      openEstate();
      break;

    default:
      // 상점 / 홍보판: 다음 단계에서 오픈
      if (target.building) showMessage(target.building.closedMsg, 2200);
  }
}

// ===== 9. 키보드 / 포인터 입력 =====
// e.code는 물리적 키 위치라서 한글 입력 상태에서도 WASD가 동작합니다.
const keys = {};

window.addEventListener("keydown", (e) => {
  const blocked = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"];
  if (blocked.includes(e.code) && !(estateActive && e.code === "Enter")) e.preventDefault();

  keys[e.code] = true;
  if (e.repeat) return;

  if (estateActive) {
    if (e.code === "Escape") closeEstate();
    // 포커스를 닫기/인수 버튼 안에 유지합니다. Enter와 Space는 기본 버튼 동작을 사용합니다.
    if (e.code === "Tab") {
      e.preventDefault();
      if (document.activeElement === estateClose && !estateBuy.disabled) estateBuy.focus();
      else estateClose.focus();
    }
    return;
  }

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

  if (e.code === "KeyE") interact();
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// 창 포커스를 잃으면 눌린 키 상태 초기화 (캐릭터가 계속 걷는 현상 방지)
window.addEventListener("blur", () => {
  for (const k in keys) keys[k] = false;
  resetJoystick();
});

// 화면 터치/클릭으로 대화 진행 (조이스틱, E 버튼, 리셋 버튼은 stopPropagation 으로 제외됨)
window.addEventListener("pointerdown", (e) => {
  // 입력 종류에 맞춰 조작 UI 전환 (터치하면 조이스틱 표시, 마우스를 쓰면 숨김)
  if (e.pointerType === "touch") setTouchMode(true);
  else if (e.pointerType === "mouse" && !coarseQuery.matches) setTouchMode(false);

  if (estateActive) return;
  if (dialogueActive) advanceDialogue();
});

// ===== 10. 대화 시스템 =====
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

// 원주민 마을 소개 대화 (처음 말을 걸었을 때)
const villageIntroScript = [
  { speaker: "원주민", text: "야호! 오두막에 새로 온 턱 조각가가 자네인가? 반갑네!" },
  { speaker: "주인공", text: "아, 안녕하세요! 마을이 생각보다 왁자지껄하네요." },
  { speaker: "원주민", text: "허허, 우리 마을에는 자네한테 필요한 곳이 아주 많다네. 잘 들어보게나!" },
  { speaker: "원주민", text: "첫째, [도구 상점]! 더 좋은 망치와 조각칼을 사면 턱을 훨씬 날렵하고 빠르게 깎을 수 있지." },
  { speaker: "원주민", text: "둘째, [홍보판]! 거기에 모아이 턱 자랑 홍보물을 붙이면 소문을 듣고 관광객들이 떼로 몰려온다네." },
  { speaker: "원주민", text: "셋째, 가장 중요한 [이스터 부동산]!" },
  { speaker: "주인공", text: "부동산이요?" },
  { speaker: "원주민", text: "그렇다네! 돈을 모아서 섬의 구역들을 하나씩 '인수'할 수 있지. 구역을 '인수'하면 숨겨진 특이한 모아이 석상도 발굴할 수 있고, 이스터 섬의 진짜 비밀에 다가가게 된다네!" },
  { speaker: "원주민", text: "열심히 턱을 깎아서 돈을 벌고, 꼭 이스터 섬 전체를 '인수'해 보게나! 기대하겠네!" },
];

// 소개를 이미 들은 뒤 다시 말을 걸었을 때
const villagerRepeatScript = [
  { speaker: "원주민", text: "열심히 턱을 깎아서 돈을 벌게나! [도구 상점], [홍보판], [이스터 부동산]을 잊지 말고!" },
];

// 3구역 인수 표지판 대화
const signLockedScript = [
  { speaker: "표지판", text: `이 구역은 '이스터 부동산'에서 인수 후 개발할 수 있습니다! (필요 골드: ${ZONE3_PRICE} Gold)` },
];

const signUnlockedScript = [
  { speaker: "표지판", text: "[인수 완료] 이곳은 해안가 비경 구역입니다. 안쪽에서 특이한 모아이 석상이 기다리고 있습니다!" },
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

  // 튜토리얼에서 관광객이 처음 말하는 줄부터 맵에 등장
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
  vibrate(30);
  saveGame();

  tourist.mode = "leaving"; // 관광객은 마을 쪽으로 돌아감
}

// 원주민 마을 소개 대화가 끝났을 때
function onVillageIntroEnd() {
  save.villageIntroDone = true;
  saveGame();
  showMessage("이제 마을 건물에 가까이 가 보자!", 3000);
}

// ===== 부동산 영토 인수 =====
function updateEstateUI() {
  const acquired = isZoneUnlocked("zone3");
  estateGold.textContent = save.gold;
  estateBuy.disabled = acquired;
  estateBuy.textContent = acquired ? "인수 완료" : "구역 인수하기";
  estateModal.querySelector(".estate-panel").classList.toggle("acquired", acquired);
}

function openEstate() {
  if (dialogueActive || carveActive || estateActive) return;
  estatePreviousFocus = document.activeElement;
  estateActive = true;
  for (const key in keys) keys[key] = false;
  resetJoystick();
  estateStatus.textContent = isZoneUnlocked("zone3")
    ? "이미 인수한 구역입니다. 해안가에서 쌍턱 모아이 석상을 만나보세요!" : "";
  updateEstateUI();
  estateModal.classList.remove("hidden");
  updateTouchUI(null);
  estateClose.focus();
}

function closeEstate() {
  if (!estateActive) return;
  estateActive = false;
  estateModal.classList.add("hidden");
  for (const key in keys) keys[key] = false;
  resetJoystick();
  updateTouchUI(getTarget());
  if (estatePreviousFocus && typeof estatePreviousFocus.focus === "function") estatePreviousFocus.focus();
}

function onZone3Purchase() {
  if (!estateActive) return;
  if (isZoneUnlocked("zone3")) return;
  if (save.gold < ZONE3_PRICE) {
    estateStatus.textContent = "골드가 부족합니다! 턱을 더 깎아서 돈을 모아오세요!";
    return;
  }

  save.gold -= ZONE3_PRICE;
  save.unlockedZones.zone3 = true;
  fogAlpha = 0; // 인수 즉시 안개와 충돌 제한을 함께 해제합니다.
  updateGoldUI(true);
  saveGame();
  updateEstateUI();
  estateStatus.textContent = "축하합니다! 해안가 구역을 성공적으로 '인수'했습니다! 새로운 '쌍턱 모아이 석상'이 발견되었습니다!";
  estateClose.focus();
  vibrate([40, 30, 80]);
}

estateBuy.addEventListener("click", onZone3Purchase);
estateClose.addEventListener("click", closeEstate);

// 안개가 서서히 걷힘
function updateFog(dt) {
  if (isZoneUnlocked("zone3") && fogAlpha > 0) {
    fogAlpha = Math.max(0, fogAlpha - dt / FOG_FADE_SEC);
  }
}

// ===== 11. 턱 깎기 미니게임 =====
let carveActive = false;     // 팝업이 열려 있는지
let carveFinishing = false;  // 100% 도달 후 닫히는 중인지
let carveProgress = 0;       // V라인 완성도 (0~100)
let carveTarget = "moai";
const carveProgressByTarget = { moai: 0, coastMoai: 0 };

function openCarve(target = "moai") {
  if (dialogueActive || estateActive || carveActive) return;
  if (target !== "moai" && target !== "coastMoai") return;
  if (target === "coastMoai" && (!isZoneUnlocked("zone3") || save.coastIsSharp)) return;
  if (target === "moai" && save.isSharp) return;
  carveTarget = target;
  carveProgress = carveProgressByTarget[target];
  carveTitle.textContent = target === "coastMoai" ? "쌍턱 모아이 조각" : "오두막 모아이 조각";
  carveActive = true;
  carveFinishing = false;
  carveDoneEl.classList.add("hidden");
  carveModal.classList.remove("hidden");
  messageEl.textContent = "";
  messageUntil = 0;
  renderCarve();
}

function closeCarve() {
  carveProgressByTarget[carveTarget] = carveProgress;
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
  if (!carveActive || carveFinishing) return;

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
  vibrate(12);

  if (carveProgress >= 100) finishCarve();
}

function finishCarve() {
  carveFinishing = true;
  // 완료 즉시 저장하여 연출 도중 새로고침해도 결과가 유지됩니다.
  const finishedTarget = carveTarget;
  if (finishedTarget === "coastMoai") save.coastIsSharp = true;
  else save.isSharp = true;
  saveGame();
  carveDoneEl.classList.remove("hidden"); // "날렵한 V라인 완성!"
  vibrate([40, 30, 60]);

  setTimeout(() => {
    closeCarve();
    showMessage("날렵한 V라인 완성!", 2500);

    // 잠시 후 관광객이 등장
    if (finishedTarget === "moai") setTimeout(startTouristVisit, 1500);
  }, 1500);
}

// 터치에서도 빠르게 연타할 수 있도록 pointerdown 사용
chinEl.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  hitChin(e.clientX, e.clientY);
});
carveBtn.addEventListener("click", () => {
  carveBtn.blur(); // Space/Enter로 다시 눌리는 것 방지
  hitChin();
});
carveClose.addEventListener("click", () => {
  carveClose.blur();
  if (!carveFinishing) closeCarve();
});

// ===== 12. 관광객 보상 스토리 =====
// 마을 쪽 울타리 통로에서 등장해 석상 앞까지 걸어옴
function startTouristVisit() {
  if (save.rewardDone) return;
  tourist.x = fenceX + 30;
  tourist.y = gateY;
  tourist.visible = true;
  tourist.mode = "arriving";
}

function updateTourist(dt) {
  if (!tourist.visible || !tourist.mode) return;

  const arriving = tourist.mode === "arriving";
  const tx = arriving ? moai.x + 85 : fenceX + 30;
  const ty = arriving ? moai.y + 14 : gateY;

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

// ===== 13. 유틸 함수 =====
function hitsRect(px, py, r) {
  return (
    px + player.rx > r.x &&
    px - player.rx < r.x + r.w &&
    py + player.ry > r.y &&
    py - player.ry < r.y + r.h
  );
}

function collides(px, py) {
  if (obstacles.some((r) => hitsRect(px, py, r))) return true;
  // 안개가 짙은 동안은 3구역 입구가 막혀 있음
  return fogBlocks() && hitsRect(px, py, fogRect);
}

// 바다 해안선의 x좌표 (파도에 따라 일렁임)
function shoreX(y, t) {
  return seaStart + Math.sin(y * 0.02 + t * 2) * 8 + Math.sin(y * 0.05 - t * 1.3) * 4;
}

// ===== 14. 업데이트 =====
function update(dt) {
  // 시간이 지난 메시지 지우기
  if (messageUntil && performance.now() > messageUntil) {
    messageEl.textContent = "";
    messageUntil = 0;
  }

  // 부동산 이용 중에는 관광객이 새 대화를 시작하지 않도록 일시 정지합니다.
  if (!estateActive) updateTourist(dt);
  updateFog(dt);

  // 대화 중이거나 팝업이 열려 있으면 이동 불가
  if (!dialogueActive && !carveActive && !estateActive) {
    let dx = 0;
    let dy = 0;

    if (keys["ArrowLeft"] || keys["KeyA"]) dx -= 1;
    if (keys["ArrowRight"] || keys["KeyD"]) dx += 1;
    if (keys["ArrowUp"] || keys["KeyW"]) dy -= 1;
    if (keys["ArrowDown"] || keys["KeyS"]) dy += 1;

    // 조이스틱(아날로그) 입력을 더함
    dx += joy.x;
    dy += joy.y;

    // 대각선이어도 속도가 빨라지지 않도록 길이를 1 이하로 맞춤
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }

    const nextX = player.x + dx * player.speed * dt;
    if (!collides(nextX, player.y)) player.x = nextX;

    const nextY = player.y + dy * player.speed * dt;
    if (!collides(player.x, nextY)) player.y = nextY;

    // 맵 경계(화면 + 안개 입구/해안선) 밖으로 나가지 않게 제한
    clampPlayer();
    checkArea();
  }

  updateCamera(dt, false);
}

// ===== 15. 그리기 =====
// 글자 가장자리에 검은 테두리를 둘러 모래색 배경에서도 읽기 쉽게 함
function drawLabel(text, x, y, size = 13) {
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, x, y);
}

function drawGround(camDrawX) {
  // 모래 바닥 (화면에 보이는 부분 전체 채움)
  ctx.fillStyle = "#e2c98f";
  ctx.fillRect(camDrawX - 1, 0, viewW + 2, viewH);

  ctx.fillStyle = "rgba(150, 120, 60, 0.28)";
  for (const s of speckles) {
    if (s.x > camDrawX - 8 && s.x < camDrawX + viewW + 8) ctx.fillRect(s.x, s.y, s.s, s.s);
  }
}

// 마을 바닥(살짝 다른 톤) + 흙길
function drawVillageGround() {
  const H = viewH;
  const [shop, , estate] = buildings;

  ctx.fillStyle = "rgba(190, 150, 80, 0.14)";
  ctx.fillRect(fenceX, 0, gateX - fenceX, H);

  // 흙길
  ctx.fillStyle = "#d2b57c";
  // 울타리 통로 → 마을 중앙
  ctx.fillRect(fenceX - 70, gateY - 34, villager.x - (fenceX - 70), 68);
  // 마을 중앙 → 건물 앞
  const rowY = H * 0.1 + 128;
  ctx.fillRect(villager.x - 28, rowY, 56, villager.y - rowY);
  // 건물 앞 가로 길
  ctx.fillRect(shop.x + shop.w / 2, rowY, estate.x + estate.w / 2 - (shop.x + shop.w / 2), 36);
  // 마을 중앙 → 안개 입구 (3구역으로 가는 길)
  ctx.fillRect(villager.x - 28, villager.y, 56, gate2Y + 30 - villager.y);
  ctx.fillRect(villager.x, gate2Y - 30, gateX + 60 - villager.x, 60);
}

// 3구역 바닥: 밝은 해변 모래 + 물웅덩이 + 바위 + 야자수 (안개 아래에 깔림)
function drawCoastGround(t) {
  const H = viewH;

  // 밝은 해변 색
  ctx.fillStyle = "rgba(255, 240, 205, 0.42)";
  ctx.fillRect(gateX, 0, seaStart - gateX, H);

  // 물웅덩이
  for (const p of coastDecor.pools) {
    ctx.fillStyle = "rgba(90, 190, 225, 0.85)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
    // 반짝임
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.rx * 0.55, p.ry * 0.5, 0, 0, Math.PI * (1 + 0.5 * Math.sin(t * 2 + p.x)));
    ctx.stroke();
  }

  // 바위
  for (const r of coastDecor.rocks) {
    ctx.fillStyle = "#8a8f94";
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r * 1.3, r.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#4a4e52";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.beginPath();
    ctx.ellipse(r.x - r.r * 0.3, r.y - r.r * 0.3, r.r * 0.5, r.r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 야자수
  for (const p of coastDecor.palms) drawPalm(p.x, p.y, 1);
}

function drawPalm(x, y, s) {
  // 줄기
  ctx.strokeStyle = "#7a5230";
  ctx.lineWidth = 6 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 8 * s, y - 30 * s, x + 4 * s, y - 60 * s);
  ctx.stroke();
  ctx.lineCap = "butt";

  // 잎 (살랑살랑 흔들림)
  const tx = x + 4 * s;
  const ty = y - 60 * s;
  ctx.fillStyle = "#2e8b57";
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.75 + Math.sin(animT * 1.5 + i + x) * 0.05;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -16 * s, 6 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#6b3f1d"; // 코코넛
  ctx.beginPath();
  ctx.arc(tx - 3 * s, ty + 3 * s, 3.5 * s, 0, Math.PI * 2);
  ctx.arc(tx + 4 * s, ty + 4 * s, 3.5 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawSea(t) {
  const H = viewH;

  // 젖은 모래 띠 (해안선 안쪽)
  ctx.fillStyle = "#c9ab6c";
  ctx.beginPath();
  ctx.moveTo(worldW, 0);
  for (let y = 0; y <= H; y += 8) ctx.lineTo(shoreX(y, t) - 22, y);
  ctx.lineTo(worldW, H);
  ctx.closePath();
  ctx.fill();

  // 바다 본체
  const grad = ctx.createLinearGradient(seaStart, 0, worldW, 0);
  grad.addColorStop(0, "#4fc3e8");
  grad.addColorStop(1, "#1565b8");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(worldW, 0);
  for (let y = 0; y <= H; y += 8) ctx.lineTo(shoreX(y, t), y);
  ctx.lineTo(worldW, H);
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
  const seaW = worldW - seaStart;
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

// 울타리 한 줄 (통로 gapTop~gapBottom 만 비어 있음)
function drawFenceLine(x, gapTop, gapBottom, colors) {
  const H = viewH;

  // 가로대
  ctx.fillStyle = colors.rail;
  ctx.fillRect(x - 4, 0, 8, gapTop);
  ctx.fillRect(x - 4, gapBottom, 8, H - gapBottom);

  // 기둥
  ctx.fillStyle = colors.post;
  for (let y = 0; y < H; y += 40) {
    if (y + 20 > gapTop && y < gapBottom) continue; // 통로 부분은 비움
    ctx.fillRect(x - 8, y, 16, 22);
  }

  // 통로 양쪽 문기둥
  ctx.fillStyle = colors.gate;
  ctx.fillRect(x - 10, gapTop - 8, 20, 16);
  ctx.fillRect(x - 10, gapBottom - 8, 20, 16);
}

// 작은 안내 팻말 (울타리 통로 위)
function drawSmallSign(cx, cy, w, text) {
  const h = 26;
  ctx.fillStyle = "#c9a46a";
  ctx.fillRect(cx - w / 2, cy, w, h);
  ctx.strokeStyle = "#4e3016";
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - w / 2, cy, w, h);
  ctx.fillStyle = "#3b2410";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, cx, cy + 18);
}

function drawFences() {
  // 1구역 ↔ 2구역: 나무 울타리
  drawFenceLine(fenceX, gateTop, gateBottom, { rail: "#7a5230", post: "#5b3a1c", gate: "#4a2f16" });
  drawSmallSign(fenceX, gateTop - 40, 120, "원주민 마을 ▶");

  // 2구역 ↔ 3구역: 돌 울타리 (안개 입구)
  drawFenceLine(gateX, gate2Top, gate2Bottom, { rail: "#8d8d8d", post: "#5a5a5a", gate: "#3d3d3d" });
  drawSmallSign(gateX, gate2Top - 40, 140, isZoneUnlocked("zone3") ? "해안가 비경 ▶" : "??? 미개척 구역");

  // 아직 인수 전이면 입구에 붉은 밧줄
  if (!isZoneUnlocked("zone3")) {
    ctx.strokeStyle = "#d9534f";
    ctx.lineWidth = 4;
    for (const y of [gate2Top + 12, gate2Bottom - 12]) {
      ctx.beginPath();
      ctx.moveTo(gateX - 10, y);
      ctx.quadraticCurveTo(gateX, y + 8, gateX + 10, y);
      ctx.stroke();
    }
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

  drawLabel("낡은 오두막", hut.x + hut.w / 2, hut.y - 8);
}

// ----- 마을 건물 -----
function drawShop(b) {
  // 벽
  ctx.fillStyle = "#a47148";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = "#4e3016";
  ctx.lineWidth = 4;
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  // 줄무늬 차양
  const stripes = 6;
  const sw = b.w / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#d9534f" : "#ffffff";
    ctx.fillRect(b.x + i * sw, b.y, sw, 24);
  }
  ctx.strokeRect(b.x, b.y, b.w, 24);

  // 문 + 망치 아이콘
  ctx.fillStyle = "#4e3016";
  ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h - 42, 28, 42);
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🔨", b.x + 32, b.y + 68);

  drawLabel(b.name, b.x + b.w / 2, b.y - 8);
}

function drawBoard(b) {
  const boardH = b.h - 26;

  // 다리(기둥)
  ctx.fillStyle = "#5b3a1c";
  ctx.fillRect(b.x + 14, b.y + boardH, 9, 26);
  ctx.fillRect(b.x + b.w - 23, b.y + boardH, 9, 26);

  // 판
  ctx.fillStyle = "#c9a46a";
  ctx.fillRect(b.x, b.y, b.w, boardH);
  ctx.strokeStyle = "#4e3016";
  ctx.lineWidth = 4;
  ctx.strokeRect(b.x, b.y, b.w, boardH);

  // 붙어 있는 홍보물 (빈 종이들)
  const papers = [
    { dx: 10, dy: 10, w: 28, h: 22, c: "#ffffff" },
    { dx: 46, dy: 8, w: 24, h: 28, c: "#fff2a8" },
    { dx: 78, dy: 12, w: 22, h: 20, c: "#ffd1dc" },
    { dx: 18, dy: 38, w: 30, h: 18, c: "#cfe8ff" },
    { dx: 58, dy: 40, w: 26, h: 16, c: "#ffffff" },
  ];
  for (const p of papers) {
    ctx.fillStyle = p.c;
    ctx.fillRect(b.x + p.dx, b.y + p.dy, p.w, p.h);
    ctx.fillStyle = "#d9534f"; // 압정
    ctx.fillRect(b.x + p.dx + p.w / 2 - 2, b.y + p.dy + 1, 4, 4);
  }

  drawLabel(b.name, b.x + b.w / 2, b.y - 8);
}

function drawEstate(b) {
  // 벽
  ctx.fillStyle = "#7a93b5";
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = "#2f3f58";
  ctx.lineWidth = 4;
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  // 지붕 띠
  ctx.fillStyle = "#3b4a63";
  ctx.fillRect(b.x, b.y, b.w, 28);
  ctx.strokeRect(b.x, b.y, b.w, 28);

  // 창문 2개
  ctx.fillStyle = "#cfe8ff";
  ctx.fillRect(b.x + 18, b.y + 44, 32, 28);
  ctx.fillRect(b.x + b.w - 50, b.y + 44, 32, 28);
  ctx.strokeStyle = "#2f3f58";
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x + 18, b.y + 44, 32, 28);
  ctx.strokeRect(b.x + b.w - 50, b.y + 44, 32, 28);

  // 문
  ctx.fillStyle = "#2f3f58";
  ctx.fillRect(b.x + b.w / 2 - 15, b.y + b.h - 44, 30, 44);

  // 지붕 위 '땅' 표지
  ctx.fillStyle = "#ffd54a";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("★ 땅 ★", b.x + b.w / 2, b.y + 19);

  drawLabel(b.name, b.x + b.w / 2, b.y - 8);
}

function drawBuildings() {
  for (const b of buildings) {
    if (b.id === "shop") drawShop(b);
    else if (b.id === "board") drawBoard(b);
    else if (b.id === "estate") drawEstate(b);
  }
}

// 안개 입구 앞 '인수 대기중' 표지판 (안개 위에 그려서 항상 읽을 수 있음)
function drawZoneSign() {
  const unlocked = isZoneUnlocked("zone3");
  const text = unlocked ? "[인수 완료 : 해안가 비경 구역]" : "[인수 대기중 : 이스터 부동산]";
  const s = zoneSign;

  // 기둥
  ctx.fillStyle = "#5b3a1c";
  ctx.fillRect(s.postX - 5, s.y + s.h, 10, 26);

  // 판
  ctx.fillStyle = unlocked ? "#b9d9a0" : "#e0bd78";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = "#4e3016";
  ctx.lineWidth = 3;
  ctx.strokeRect(s.x, s.y, s.w, s.h);

  // 글자
  ctx.fillStyle = unlocked ? "#1f4d1f" : "#8a1f1f";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, s.x + s.w / 2, s.y + s.h / 2 + 1);
  ctx.textBaseline = "alphabetic";
}

// 석상 발밑 그림자 (모든 석상 공통)
function drawMoaiShadow(m) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(m.x, m.y, m.w * 0.7, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}

// 턱 깎기 전: 투박한 네모 턱의 모아이
function drawMoai() {
  const left = moai.x - moai.w / 2;
  const top = moai.y - moai.h;

  drawMoaiShadow(moai);

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
function drawMoaiV(m = moai) {
  const left = m.x - m.w / 2;
  const right = m.x + m.w / 2;
  const top = m.y - m.h;

  drawMoaiShadow(m);

  // 몸통
  ctx.fillStyle = "#7b7b7b";
  ctx.fillRect(left, top + 60, m.w, m.h - 60);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top + 60, m.w, m.h - 60);

  // 머리: 아래로 갈수록 좁아지는 V자 턱
  ctx.fillStyle = "#a8a8a8";
  ctx.beginPath();
  ctx.moveTo(left - 4, top);
  ctx.lineTo(right + 4, top);
  ctx.lineTo(right + 4, top + 42);
  ctx.lineTo(m.x + 5, top + 96);
  ctx.lineTo(m.x - 5, top + 96);
  ctx.lineTo(left - 4, top + 42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 눈썹 그늘 / 코 / 입
  ctx.fillStyle = "#5f5f5f";
  ctx.fillRect(left - 4 + 2, top + 14, m.w + 4, 8);
  ctx.fillStyle = "#757575";
  ctx.fillRect(m.x - 5, top + 20, 10, 26);
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(m.x - 12, top + 58, 24, 4);

  // 반짝이는 효과
  const a = 0.4 + 0.6 * ((Math.sin(animT * 5) + 1) / 2);
  const sx = right + 16;
  const sy = top + 34;
  ctx.fillStyle = `rgba(255, 235, 120, ${a})`;
  ctx.fillRect(sx - 1, sy - 8, 3, 16);
  ctx.fillRect(sx - 8, sy - 1, 16, 3);
}

// 3구역의 특이한 석상: 턱이 두 겹인 쌍턱 모아이 (이끼 낀 청회색)
function drawMoaiDouble() {
  const m = coastMoai;
  if (!isZoneUnlocked("zone3")) return;
  if (save.coastIsSharp) {
    drawMoaiV(m);
    drawLabel("쌍턱 모아이 · V라인 완성", m.x, m.y - m.h - 10);
    return;
  }
  const left = m.x - m.w / 2;
  const top = m.y - m.h;

  drawMoaiShadow(m);

  // 머리 + 몸통
  ctx.fillStyle = "#7f8f8a";
  ctx.fillRect(left, top, m.w, m.h);
  ctx.fillRect(left - 4, top, m.w + 8, 40);

  // 이끼
  ctx.fillStyle = "#5f8f4a";
  ctx.fillRect(left - 4, top, 16, 8);
  ctx.fillRect(left + m.w - 10, top + 38, 14, 10);
  ctx.fillRect(left, top + 92, 20, 8);

  // 눈썹 그늘 / 코 / 입
  ctx.fillStyle = "#4f5d59";
  ctx.fillRect(left, top + 14, m.w, 8);
  ctx.fillStyle = "#68766f";
  ctx.fillRect(m.x - 5, top + 20, 10, 26);
  ctx.fillStyle = "#33403c";
  ctx.fillRect(m.x - 14, top + 54, 28, 4);

  // 쌍턱: 첫째 턱 + 둘째 턱
  ctx.fillStyle = "#9db0aa";
  ctx.fillRect(m.x - 20, top + 60, 40, 20);
  ctx.fillStyle = "#86988f";
  ctx.fillRect(m.x - 15, top + 80, 30, 18);
  ctx.strokeStyle = "#2f3a37";
  ctx.lineWidth = 2;
  ctx.strokeRect(m.x - 20, top + 60, 40, 20);
  ctx.strokeRect(m.x - 15, top + 80, 30, 18);

  // 외곽선
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top, m.w, m.h);

  // 신비한 푸른 반짝임
  const a = 0.35 + 0.65 * ((Math.sin(animT * 4 + 1) + 1) / 2);
  ctx.fillStyle = `rgba(140, 235, 255, ${a})`;
  const sx = m.x + m.w / 2 + 16;
  const sy = top + 30;
  ctx.fillRect(sx - 1, sy - 8, 3, 16);
  ctx.fillRect(sx - 8, sy - 1, 16, 3);

  drawLabel("쌍턱 모아이", m.x, top - 10);
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

function drawVillager() {
  drawBlob(villager, "#6fa83a", "#3d6a1a"); // 초록색 원주민

  // 머리 깃털 장식
  const hx = villager.x;
  const hy = villager.y - villager.ry;
  ctx.fillStyle = "#e53935";
  ctx.fillRect(hx - 7, hy - 8, 4, 10);
  ctx.fillStyle = "#ffd54a";
  ctx.fillRect(hx - 2, hy - 11, 4, 13);
  ctx.fillStyle = "#1e88e5";
  ctx.fillRect(hx + 3, hy - 8, 4, 10);

  drawLabel("원주민", villager.x, villager.y + villager.ry + 16, 12);
}

// 안개 덩어리 하나 (가운데가 짙고 가장자리로 갈수록 투명)
function fogBlob(x, y, r, rgb, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb}, ${a})`);
  g.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// 미해금 3구역을 덮는 어두운 안개 (fogAlpha 가 줄어들면 서서히 걷힘)
function drawFog(t) {
  if (fogAlpha <= 0.002) return;

  const H = viewH;
  const zoneW = worldW - gateX;

  ctx.save();
  ctx.globalAlpha = fogAlpha;

  // 1) 3구역 전체를 덮는 어두운 안개 (울타리 바로 뒤에서 시작)
  ctx.fillStyle = "rgba(14, 18, 38, 0.95)";
  ctx.fillRect(gateX + 2, 0, zoneW, H);

  // 2) 안쪽에서 천천히 흘러가는 옅은 안개 덩어리
  for (let i = 0; i < 14; i++) {
    const bx = gateX + 120 + ((i * 0.137 + 0.05) % 1) * (zoneW - 240) + Math.sin(t * 0.25 + i * 2.1) * 40;
    const by = ((i * 0.331 + 0.11) % 1) * H + Math.cos(t * 0.2 + i * 1.3) * 30;
    fogBlob(bx, by, 90 + (i % 4) * 25, "120, 130, 175", 0.22);
  }

  // 3) 입구 틈에서 바깥으로 새어 나오는 짙은 안개
  for (let i = 0; i < 10; i++) {
    const bx = gateX - 20 + Math.sin(t * 0.5 + i * 1.9) * 30 + (i % 3) * 8;
    const by = gate2Top - 20 + (i / 9) * (gate2Bottom - gate2Top + 40) + Math.cos(t * 0.4 + i) * 12;
    fogBlob(bx, by, 60 + (i % 3) * 14, "30, 36, 66", 0.85);
  }

  ctx.restore();
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

// 상호작용 안내 말풍선
function drawPrompt(target, camDrawX) {
  const text = target.label;
  ctx.font = "bold 16px sans-serif";
  const padding = 12;
  const boxW = ctx.measureText(text).width + padding * 2;
  const boxH = 32;

  let boxX = target.x - boxW / 2;
  boxX = Math.max(camDrawX + 4, Math.min(camDrawX + viewW - boxW - 4, boxX)); // 화면 밖으로 안 나가게
  const boxY = target.below ? target.y + 8 : Math.max(4, target.y - boxH - 14);

  roundedRectPath(boxX, boxY, boxW, boxH, 8);
  ctx.fillStyle = "rgba(20, 20, 20, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "#ffd54a";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffd54a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, boxX + boxW / 2, boxY + boxH / 2);
  ctx.textBaseline = "alphabetic";
}

function draw(t) {
  animT = t;

  // 화면 선명도(dpr)와 축소 배율(zoom)을 반영한 좌표계. 카메라는 실제 픽셀 단위로 맞춰서 흔들림 방지
  const s = dpr * zoom;
  const camDrawX = Math.round(camX * s) / s;

  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.save();
  ctx.translate(-camDrawX, 0); // 이후는 모두 '맵 좌표'로 그림

  drawGround(camDrawX);
  drawVillageGround();
  drawCoastGround(t);
  drawSea(t);
  drawFences();
  drawHut();
  drawBuildings();

  // y(발밑) 기준으로 정렬해서 아래쪽에 있는 것이 위에 그려지게 함
  const list = [
    { y: moai.y, fn: save.isSharp ? drawMoaiV : drawMoai },
    { y: coastMoai.y, fn: drawMoaiDouble },
    { y: player.y + player.ry, fn: drawPlayer },
    { y: villager.y + villager.ry, fn: drawVillager },
  ];
  if (tourist.visible) list.push({ y: tourist.y + tourist.ry, fn: drawTourist });
  list.sort((a, b) => a.y - b.y);
  list.forEach((o) => o.fn());

  // 3구역 위에 안개를 덮고, 표지판은 그 위에 그림
  drawFog(t);
  drawZoneSign();

  // 상호작용 안내
  const target = getTarget();
  if (target && target.label) drawPrompt(target, camDrawX);

  ctx.restore();

  // 모바일 조작 UI(E 버튼 강조, 대화 중 숨김) 갱신
  updateTouchUI(target);
}

// ===== 16. 게임 루프 =====
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(dt);
  draw(now / 1000);
  requestAnimationFrame(loop);
}

// ===== 17. 리셋 / 테스트 버튼 =====
// 버튼을 눌러도 대화가 넘어가지 않도록 포인터 전파를 막음
resetBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
testGoldBtn.addEventListener("pointerdown", (e) => e.stopPropagation());

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

// (테스트용) 골드 100 추가: 3구역 인수 비용 500G 를 모으기 위한 임시 버튼
testGoldBtn.addEventListener("click", () => {
  testGoldBtn.blur();
  save.gold += 100;
  updateGoldUI(true);
  saveGame();
  showMessage(`+100 Gold (테스트) → 보유 ${save.gold} G`, 1500);
});

// ===== 18. 자동 저장 =====
// 위치는 계속 바뀌므로 주기적으로 + 탭을 닫거나 숨길 때 저장
setInterval(saveGame, 3000);
window.addEventListener("beforeunload", saveGame);
window.addEventListener("pagehide", saveGame);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveGame();
});

// ===== 19. 시작 =====
window.addEventListener("resize", layout);
// 일부 모바일 브라우저는 회전 직후 창 크기가 늦게 갱신되므로 한 번 더 맞춤
window.addEventListener("orientationchange", () => setTimeout(layout, 250));

if (DEBUG_TOOLS) document.body.classList.add("debug");
setTouchMode(coarseQuery.matches); // 터치 기기면 처음부터 조이스틱 표시

layout();
updateGoldUI();

// 저장된 위치(비율)를 복원. 장애물 안에 끼는 위치면 기본 위치로 대체
player.x = save.playerPos.x * worldW;
player.y = save.playerPos.y * worldH;
clampPlayer(); // 미해금 상태라면 안개 입구 앞까지로 제한됨
if (collides(player.x, player.y)) {
  player.x = DEFAULT_PLAYER_POS.x * worldW;
  player.y = DEFAULT_PLAYER_POS.y * worldH;
  clampPlayer();
}

// 현재 위치 표시 + 카메라를 플레이어에게 바로 맞춤
setArea(areaNameAt(player.x));
updateCamera(0, true);

ready = true;

if (!save.tutorialDone) {
  // 처음 시작: 튜토리얼 대화
  startDialogue(tutorialScript, onTutorialEnd);
} else if (save.isSharp && !save.rewardDone) {
  // 턱은 깎았지만 보상을 받기 전에 새로고침한 경우: 관광객 다시 등장
  setTimeout(startTouristVisit, 1000);
}

requestAnimationFrame(loop);
