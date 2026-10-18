// ===== 기본 설정 =====
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const messageEl = document.getElementById("message");

// ===== 게임 오브젝트 =====
// 주인공 (파란 타원형 도트)
const player = {
  x: 400,
  y: 450,
  rx: 12,        // 타원 가로 반지름
  ry: 16,        // 타원 세로 반지름
  speed: 180,    // 초당 이동 픽셀
};

// 낡은 오두막 (갈색 사각형)
const hut = { x: 100, y: 90, w: 150, h: 110 };

// 모아이 석상 (x, y는 발밑 중심 좌표)
const moai = {
  x: 600,
  y: 300,
  w: 56,         // 몸통 너비
  h: 110,        // 전체 높이
  interactRange: 90,  // 이 거리 안에 들어오면 안내 문구 표시
};

// 충돌 판정용 사각형 목록 (플레이어가 통과하지 못하는 영역)
const obstacles = [
  { x: hut.x, y: hut.y, w: hut.w, h: hut.h },
  { x: moai.x - moai.w / 2, y: moai.y - moai.h, w: moai.w, h: moai.h },
];

// ===== 키보드 입력 =====
// e.code는 물리적 키 위치를 나타내므로 한글 입력 상태에서도 WASD가 동작합니다.
const keys = {};

window.addEventListener("keydown", (e) => {
  const gameKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  if (gameKeys.includes(e.code)) e.preventDefault(); // 방향키로 페이지 스크롤 방지

  keys[e.code] = true;

  // E 키: 모아이 근처에서만 반응 (Step 1에서는 안내 메시지만 표시)
  if (e.code === "KeyE" && !e.repeat && isNearMoai()) {
    messageEl.textContent = "턱 깎기는 다음 단계(Step 2)에서 구현됩니다!";
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// ===== 유틸 함수 =====
function isNearMoai() {
  const dx = player.x - moai.x;
  const dy = player.y - (moai.y - moai.h / 2); // 석상 중앙 기준
  return Math.hypot(dx, dy) < moai.interactRange;
}

// 플레이어 바운딩 박스와 사각형이 겹치는지 검사
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

// ===== 업데이트 =====
function update(dt) {
  let dx = 0;
  let dy = 0;

  if (keys["ArrowLeft"] || keys["KeyA"]) dx -= 1;
  if (keys["ArrowRight"] || keys["KeyD"]) dx += 1;
  if (keys["ArrowUp"] || keys["KeyW"]) dy -= 1;
  if (keys["ArrowDown"] || keys["KeyS"]) dy += 1;

  // 대각선 이동 시 속도가 빨라지지 않도록 정규화
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  // X, Y를 따로 이동해서 벽에 부딪혀도 미끄러지듯 움직이게 함
  const nextX = player.x + dx * player.speed * dt;
  if (!collides(nextX, player.y)) player.x = nextX;

  const nextY = player.y + dy * player.speed * dt;
  if (!collides(player.x, nextY)) player.y = nextY;

  // 화면 밖으로 나가지 않게 제한
  player.x = Math.max(player.rx, Math.min(canvas.width - player.rx, player.x));
  player.y = Math.max(player.ry, Math.min(canvas.height - player.ry, player.y));

  // 석상에서 멀어지면 메시지 지우기
  if (!isNearMoai()) messageEl.textContent = "";
}

// ===== 그리기 =====
function drawGround() {
  // 모래 바닥 위에 점을 몇 개 찍어 질감 표현
  ctx.fillStyle = "#e2c98f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(160, 130, 70, 0.25)";
  for (let i = 0; i < 60; i++) {
    const x = (i * 137) % canvas.width;
    const y = (i * 251) % canvas.height;
    ctx.fillRect(x, y, 3, 3);
  }
}

function drawHut() {
  // 벽
  ctx.fillStyle = "#8b5a2b";
  ctx.fillRect(hut.x, hut.y, hut.w, hut.h);
  // 테두리
  ctx.strokeStyle = "#4e3016";
  ctx.lineWidth = 4;
  ctx.strokeRect(hut.x, hut.y, hut.w, hut.h);
  // 문
  ctx.fillStyle = "#4e3016";
  ctx.fillRect(hut.x + hut.w / 2 - 14, hut.y + hut.h - 40, 28, 40);
  // 이름표
  ctx.fillStyle = "#fff";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("낡은 오두막", hut.x + hut.w / 2, hut.y - 8);
}

function drawMoai() {
  const left = moai.x - moai.w / 2;
  const top = moai.y - moai.h;

  // 그림자
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(moai.x, moai.y, moai.w * 0.7, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // 몸통 + 머리
  ctx.fillStyle = "#8d8d8d";
  ctx.fillRect(left, top, moai.w, moai.h);
  // 이마 쪽을 조금 더 넓게
  ctx.fillRect(left - 4, top, moai.w + 8, 40);

  // 눈썹(어두운 그늘)
  ctx.fillStyle = "#5f5f5f";
  ctx.fillRect(left, top + 14, moai.w, 8);

  // 코
  ctx.fillStyle = "#757575";
  ctx.fillRect(moai.x - 5, top + 20, 10, 26);

  // 입
  ctx.fillStyle = "#4a4a4a";
  ctx.fillRect(moai.x - 14, top + 56, 28, 4);

  // 길쭉한 턱
  ctx.fillStyle = "#9a9a9a";
  ctx.fillRect(moai.x - 16, top + 62, 32, 34);

  // 외곽선
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top, moai.w, moai.h);
}

function drawPlayer() {
  // 그림자
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y + player.ry - 2, player.rx, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 파란 타원
  ctx.fillStyle = "#2f6fed";
  ctx.beginPath();
  ctx.ellipse(player.x, player.y, player.rx, player.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#173f94";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// 둥근 사각형 경로를 만드는 도우미 함수
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
  const boxY = moai.y - moai.h - boxH - 14; // 석상 머리 위

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

function draw() {
  drawGround();
  drawHut();

  // 위쪽에 있는 오브젝트를 먼저 그려서 깊이감 표현 (y값 기준 정렬)
  if (player.y < moai.y) {
    drawPlayer();
    drawMoai();
  } else {
    drawMoai();
    drawPlayer();
  }

  if (isNearMoai()) drawPrompt();
}

// ===== 게임 루프 =====
let lastTime = performance.now();

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05); // 초 단위, 탭 전환 시 튀는 값 방지
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);