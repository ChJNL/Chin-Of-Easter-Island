/* =========================================================
   이스터 섬의 턱 - script.js
   Step 6: 마을 시설 (도구 상점 / 마을 홍보판 / 이스터 부동산 '인수')
   ---------------------------------------------------------
   구성
   1) 설정/데이터 정의
   2) 상태 & localStorage 저장/불러오기
   3) 모달/토스트 UI 유틸
   4) 시설 기능 (상점, 홍보판, 부동산, 턱 깎기, 대화, 스토리)
   5) 맵/오브젝트/관광객
   6) 입력 (키보드, 터치, 캔버스 탭)
   7) 렌더링 & 게임 루프
   ========================================================= */
(() => {
  'use strict';

  /* ---------------------------------------------------------
   * 1) 설정 / 데이터 정의
   * --------------------------------------------------------- */
  const SAVE_KEY = 'easterIslandJaw_save_v1';
  const W = 800;
  const H = 480;
  const PR = 12; // 플레이어 충돌 반경
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  const CFG = {
    startGold: 100,
    carveBase: 8,            // 클릭당 기본 게이지 상승량(%)
    hammerMult: 2,           // 황금 망치: 상승량 배율
    knifeMult: 2,            // 다이아 조각 칼: 팁 배율
    touristBaseInterval: 12000, // 관광객 방문 간격(ms)
    touristBuffInterval: 5000,  // 전단지 버프 중 간격(ms)
    flyerDuration: 90 * 1000,   // 전단지 1회 지속시간
    flyerMaxStack: 10 * 60 * 1000, // 연속 구매 시 최대 누적 시간
    maxTourists: 6,
    walkSpeed: 170,
    boatSpeed: 190
  };

  const ITEMS = [
    {
      id: 'hammer', icon: '🔨', name: '황금 망치', price: 300,
      desc: '클릭당 턱 깎기 게이지 상승량이 2배가 됩니다.',
      effect: '턱 깎기 속도 2배!'
    },
    {
      id: 'knife', icon: '🔪', name: '다이아 조각 칼', price: 500,
      desc: '관광객이 주는 팁 보상이 2배가 됩니다.',
      effect: '관광객 팁 2배!'
    }
  ];

  const FLYER = { id: 'flyer', icon: '📱', name: 'SNS 전단지 배포', price: 150 };

  const ZONES = {
    coast: {
      id: 'coast', icon: '🏖️', name: '해안가 구역', price: 1000,
      desc: '파도 소리가 들리는 동쪽 해안. 오래전부터 "웃는 석상이 잠들어 있다"는 소문이 도는 땅입니다.',
      reward: '선글라스 모아이 · 더블턱 모아이 등장!'
    },
    volcano: {
      id: 'volcano', icon: '🌋', name: '화산 지대 구역', price: null,
      desc: '아직 매물로 나오지 않았습니다. (준비 중)',
      reward: '???'
    }
  };

  // 석상 정의: 위치/보상/팁
  const STATUES = {
    main:       { id: 'main',       name: '할아버지의 모아이', map: 'village', x: 430, y: 290, reward: 50,  tip: 10, zone: null,    style: 'plain' },
    sunglasses: { id: 'sunglasses', name: '선글라스 모아이',   map: 'coast',   x: 280, y: 280, reward: 120, tip: 25, zone: 'coast', style: 'sunglasses' },
    doublechin: { id: 'doublechin', name: '더블턱 모아이',     map: 'coast',   x: 540, y: 280, reward: 200, tip: 40, zone: 'coast', style: 'double' }
  };

  const MAPS = {
    village: { name: '원주민 마을' },
    sea:     { name: '이스터 바다' },
    coast:   { name: '해안가 구역' }
  };

  // 맵 출입구: rect에 닿으면 to 맵으로 이동
  const EXITS = {
    village: [
      { rect: { x: 300, y: H - 22, w: 200, h: 22 }, to: 'sea',   spawn: { x: 400, y: 80 } },
      { rect: { x: W - 20, y: 250, w: 20, h: 180 }, to: 'coast', spawn: { x: 70, y: 340 },
        requires: () => state.zones.coast, blockedMsg: '🚧 이 땅은 아직 내 것이 아니다… 이스터 부동산에 문의해 보자.' }
    ],
    sea: [
      { rect: { x: 300, y: 0, w: 200, h: 22 }, to: 'village', spawn: { x: 400, y: H - 70 } }
    ],
    coast: [
      { rect: { x: 0, y: 250, w: 20, h: 180 }, to: 'village', spawn: { x: W - 70, y: 340 } }
    ]
  };

  const VILLAGE_SPAWN = { x: 110, y: 230 };

  /* ---------------------------------------------------------
   * 2) 상태 & localStorage
   * --------------------------------------------------------- */
  function defaultState() {
    return {
      v: 1,
      gold: CFG.startGold,
      map: 'village',
      px: VILLAGE_SPAWN.x,
      py: VILLAGE_SPAWN.y,
      tools: { hammer: false, knife: false },       // 구매한 도구
      flyerUntil: 0,                                // 홍보 버프 종료 시각(타임스탬프, ms)
      zones: { coast: false },                      // 인수한 구역
      statues: {                                    // 석상 상태 (깎기 진행도/횟수/해금)
        main:       { unlocked: true,  progress: 0, count: 0 },
        sunglasses: { unlocked: false, progress: 0, count: 0 },
        doublechin: { unlocked: false, progress: 0, count: 0 }
      },
      flags: { diary: false, bottle: false, talked: 0 }
    };
  }

  // 저장 데이터를 기본 구조에 안전하게 병합(구버전/손상 데이터 대응)
  function mergeInto(base, src) {
    if (!src || typeof src !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in src)) continue;
      const b = base[k];
      const s = src[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) {
        base[k] = mergeInto(b, s);
      } else if (typeof s === typeof b) {
        base[k] = s;
      }
    }
    return base;
  }

  function sanitizeState(s) {
    if (!Number.isFinite(s.gold) || s.gold < 0) s.gold = 0;
    s.gold = Math.floor(s.gold);
    if (!Number.isFinite(s.flyerUntil)) s.flyerUntil = 0;
    if (!MAPS[s.map]) s.map = 'village';
    if (s.map === 'coast' && !s.zones.coast) s.map = 'village';
    if (!Number.isFinite(s.px) || !Number.isFinite(s.py)) { s.px = VILLAGE_SPAWN.x; s.py = VILLAGE_SPAWN.y; }
    s.px = Math.min(W - PR, Math.max(PR, s.px));
    s.py = Math.min(H - PR, Math.max(PR, s.py));
    for (const id of Object.keys(s.statues)) {
      const st = s.statues[id];
      if (!Number.isFinite(st.progress) || st.progress < 0 || st.progress >= 100) st.progress = 0;
      if (!Number.isFinite(st.count) || st.count < 0) st.count = 0;
    }
    // 인수한 구역의 석상은 항상 해금 상태 유지
    for (const d of Object.values(STATUES)) {
      if (d.zone && s.zones[d.zone]) s.statues[d.id].unlocked = true;
    }
    s.statues.main.unlocked = true;
    return s;
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultState();
      return sanitizeState(mergeInto(defaultState(), JSON.parse(raw)));
    } catch (e) {
      console.warn('저장 데이터를 불러오지 못했습니다. 새로 시작합니다.', e);
      return defaultState();
    }
  }

  let state = loadGame();
  const player = { x: state.px, y: state.py };

  function saveGame() {
    try {
      state.px = player.x;
      state.py = player.y;
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('저장 실패', e);
      return false;
    }
  }

  /* ---------------------------------------------------------
   * 3) UI 유틸 (DOM, 토스트, 모달)
   * --------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, onClick) {
    const b = el('button', cls || '', label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  let toastTimer = 0;
  let toastCooldown = 0;
  function showToast(text, ms = 2400) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  // ----- 모달 -----
  let modal = null; // { title, render, onClose, onKey, tick, api }

  function openModal(opts) {
    if (modal) closeModal();
    modal = opts;
    modal.api = {
      setMsg(text, type) {
        const m = $('modal-msg');
        m.textContent = text || '';
        m.className = 'modal-msg' + (type ? ' ' + type : '');
      },
      refresh() { renderModalBody(); },
      close() { closeModal(); }
    };
    $('modal-title').textContent = opts.title;
    $('modal-msg').textContent = '';
    $('modal-msg').className = 'modal-msg';
    renderModalBody();
    $('modal').classList.remove('hidden');
    clearDirKeys();
  }

  function renderModalBody() {
    if (!modal) return;
    const body = $('modal-body');
    const actions = $('modal-actions');
    body.innerHTML = '';
    actions.innerHTML = '';
    modal.render(body, actions, modal.api);
  }

  function closeModal() {
    if (!modal) return;
    const m = modal;
    modal = null;
    $('modal').classList.add('hidden');
    $('modal-body').innerHTML = '';
    $('modal-actions').innerHTML = '';
    $('modal-msg').textContent = '';
    if (m.onClose) m.onClose();
  }

  function openInfo(title, text, label = '확인', onClose) {
    openModal({
      title,
      onClose,
      render(body, actions, api) {
        const p = el('p', 'modal-desc', text);
        p.style.fontSize = '1rem';
        p.style.lineHeight = '1.6';
        body.appendChild(p);
        actions.appendChild(btn(label, '', () => api.close()));
      }
    });
  }

  /* ---------------------------------------------------------
   * 4) 게임 로직: 버프/배율, HUD, 시설 기능
   * --------------------------------------------------------- */
  const flyerActive = () => state.flyerUntil > Date.now();
  const carvePerClick = () => CFG.carveBase * (state.tools.hammer ? CFG.hammerMult : 1);
  const tipMult = () => (state.tools.knife ? CFG.knifeMult : 1);
  const isUnlocked = (sid) => !!state.statues[sid].unlocked;

  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateHUD() {
    $('stat-gold').textContent = `💰 ${state.gold.toLocaleString('ko-KR')} G`;
    const tools = [];
    if (state.tools.hammer) tools.push('🔨 황금 망치');
    if (state.tools.knife) tools.push('🔪 다이아 칼');
    $('stat-tools').textContent = tools.length ? tools.join(' · ') : '🧰 도구 없음';
    const rem = state.flyerUntil - Date.now();
    const buff = $('stat-buff');
    if (rem > 0) {
      buff.classList.remove('hidden');
      buff.textContent = `📣 전단지 ${fmtTime(rem)}`;
    } else {
      buff.classList.add('hidden');
    }
    $('stat-map').textContent = `📍 ${MAPS[state.map].name}`;
  }

  // ----- 도구 상점 -----
  function openShop() {
    openModal({
      title: '🏪 도구 상점',
      onClose: saveGame,
      render(body, actions, api) {
        body.appendChild(el('p', 'modal-desc', '턱 깎기 장인을 위한 특별 도구들! 한 번 사면 평생 쓸 수 있어요.'));
        body.appendChild(el('div', 'gold-line', `보유 골드: 💰 ${state.gold.toLocaleString('ko-KR')} G`));
        ITEMS.forEach((item) => {
          const owned = !!state.tools[item.id];
          const card = el('div', 'card' + (owned ? ' owned' : ''));
          card.appendChild(el('div', 'card-icon', item.icon));
          const info = el('div');
          info.appendChild(el('div', 'card-name', item.name));
          info.appendChild(el('div', 'card-desc', item.desc));
          info.appendChild(el('div', 'card-price', `${item.price} Gold`));
          card.appendChild(info);
          if (owned) {
            card.appendChild(el('span', 'badge', '보유 중'));
          } else {
            card.appendChild(btn('구매', '', () => buyTool(item, api)));
          }
          body.appendChild(card);
        });
        actions.appendChild(btn('닫기', 'ghost', () => api.close()));
      }
    });
  }

  function buyTool(item, api) {
    if (state.tools[item.id]) { api.setMsg('이미 보유한 도구입니다.', 'warn'); return; }
    if (state.gold < item.price) {
      api.setMsg(`골드가 부족합니다! (필요 ${item.price} G / 보유 ${state.gold} G)`, 'error');
      return;
    }
    state.gold -= item.price;
    state.tools[item.id] = true;
    saveGame();
    updateHUD();
    api.refresh();
    api.setMsg(`✅ ${item.name} 구매 완료! ${item.effect}`, 'ok');
  }

  // ----- 마을 홍보판 -----
  function openBoard() {
    openModal({
      title: '📢 마을 홍보판',
      onClose: saveGame,
      render(body, actions, api) {
        body.appendChild(el('p', 'modal-desc', '관광객들이 더 자주 찾아오도록 이스터 섬을 SNS에 알려 보세요!'));
        body.appendChild(el('div', 'gold-line', `보유 골드: 💰 ${state.gold.toLocaleString('ko-KR')} G`));
        const card = el('div', 'card');
        card.appendChild(el('div', 'card-icon', FLYER.icon));
        const info = el('div');
        info.appendChild(el('div', 'card-name', FLYER.name));
        info.appendChild(el('div', 'card-desc',
          `${CFG.flyerDuration / 1000}초 동안 관광객 방문 속도가 약 ${(CFG.touristBaseInterval / CFG.touristBuffInterval).toFixed(1)}배 빨라집니다. 다시 사면 시간이 누적돼요.`));
        info.appendChild(el('div', 'card-price', `${FLYER.price} Gold`));
        const status = el('div', 'card-desc');
        status.style.color = '#7ee08a';
        info.appendChild(status);
        card.appendChild(info);
        card.appendChild(btn('배포하기', '', () => buyFlyer(api)));
        body.appendChild(card);

        const refreshStatus = () => {
          const rem = state.flyerUntil - Date.now();
          status.textContent = rem > 0 ? `📣 홍보 효과 진행 중: 남은 시간 ${fmtTime(rem)}` : '';
        };
        refreshStatus();
        modal.tick = refreshStatus;
        actions.appendChild(btn('닫기', 'ghost', () => api.close()));
      }
    });
  }

  function buyFlyer(api) {
    if (state.gold < FLYER.price) {
      api.setMsg(`골드가 부족합니다! (필요 ${FLYER.price} G / 보유 ${state.gold} G)`, 'error');
      return;
    }
    state.gold -= FLYER.price;
    const base = Math.max(Date.now(), state.flyerUntil);
    state.flyerUntil = Math.min(base + CFG.flyerDuration, Date.now() + CFG.flyerMaxStack);
    saveGame();
    updateHUD();
    api.refresh();
    api.setMsg('📣 SNS 전단지 배포 완료! 관광객이 몰려옵니다!', 'ok');
  }

  // ----- 이스터 부동산 ('인수' 시스템) -----
  function openRealty() {
    openModal({
      title: '🏢 이스터 부동산',
      onClose: saveGame,
      render(body, actions, api) {
        body.appendChild(el('p', 'modal-desc', '어서 오세요, 이스터 부동산입니다. 오두막 마당 너머의 새 구역을 인수해 섬을 넓혀 보세요.'));
        body.appendChild(el('div', 'gold-line', `보유 골드: 💰 ${state.gold.toLocaleString('ko-KR')} G`));

        // 보유 구역 요약
        const owned = ['🛖 오두막 마당 (기본)'];
        if (state.zones.coast) owned.push('🏖️ 해안가 구역');
        body.appendChild(el('p', 'zone-note', `내 소유 구역: ${owned.join(' · ')}`));

        Object.values(ZONES).forEach((z) => {
          const isOwned = !!state.zones[z.id];
          const soon = z.price == null;
          const card = el('div', 'card' + (isOwned ? ' owned' : '') + (soon ? ' locked' : ''));
          card.appendChild(el('div', 'card-icon', z.icon));
          const info = el('div');
          info.appendChild(el('div', 'card-name', z.name));
          info.appendChild(el('div', 'card-desc', z.desc));
          if (!soon) {
            info.appendChild(el('div', 'card-desc', `🎁 ${z.reward}`));
            info.appendChild(el('div', 'card-price', `${z.price.toLocaleString('ko-KR')} Gold`));
          }
          card.appendChild(info);
          if (isOwned) card.appendChild(el('span', 'badge', '인수 완료'));
          else if (soon) card.appendChild(el('span', 'badge', '준비 중'));
          else card.appendChild(btn('구역 인수', '', () => acquireZone(z.id, api)));
          body.appendChild(card);
        });
        actions.appendChild(btn('닫기', 'ghost', () => api.close()));
      }
    });
  }

  function acquireZone(zoneId, api) {
    const z = ZONES[zoneId];
    if (!z || z.price == null) return;
    if (state.zones[zoneId]) { api.setMsg('이미 인수한 구역입니다.', 'warn'); return; }
    if (state.gold < z.price) {
      api.setMsg(`골드가 부족합니다! (필요 ${z.price.toLocaleString('ko-KR')} G / 보유 ${state.gold.toLocaleString('ko-KR')} G)`, 'error');
      return;
    }
    state.gold -= z.price;
    state.zones[zoneId] = true;
    for (const d of Object.values(STATUES)) {
      if (d.zone === zoneId) state.statues[d.id].unlocked = true; // 새 석상 해금
    }
    state.flags.diary = true;
    saveGame();
    updateHUD();
    buildObjects();
    api.close();
    openStory(zoneId);
  }

  function openStory(zoneId) {
    openModal({
      title: '📖 할아버지의 숨겨진 일기장',
      onClose() {
        saveGame();
        showToast('✨ 해안가 구역에 새로운 모아이 2기가 나타났다! 동쪽 길로 가 보자.', 4200);
      },
      render(body, actions, api) {
        const story = el('div', 'story');
        const lines = [
          { t: `계약서에 도장을 찍자, 부동산 주인이 낡은 나무 상자를 조심스레 건네주었다. "이 땅의 옛 주인이 남긴 겁니다."` },
          { t: '소금기에 바랜 상자 속에는 할아버지의 일기장이 들어 있었다. 모서리가 닳도록 넘겨 본 흔적이 가득했다.' },
          { t: '"오늘도 해가 지도록 턱을 깎았다. 선글라스를 낀 녀석은 젊은 날 바다 건너 처음 본 낯선 세상을 닮았고, 턱이 두 개인 녀석은 언제나 배불리 먹고 웃던 우리 가족을 닮았다."', c: 'quote' },
          { t: '"내 손주야. 이 땅은 돈으로 사는 것이 아니라 마음으로 이어받는 것이란다. 부디 이 섬의 턱을 지켜다오."', c: 'quote' },
          { t: '마지막 장 사이에는 화산 쪽을 가리키는 빛바랜 지도 조각이 끼워져 있었다… 이야기는 아직 끝나지 않았다.' },
          { t: '동쪽 해안에 눈부신 햇살과 함께 두 기의 석상이 모습을 드러냈다!' }
        ];
        lines.forEach((ln, i) => {
          const p = el('p', ln.c || '', ln.t);
          p.style.animationDelay = `${i * 0.7}s`;
          story.appendChild(p);
        });
        body.appendChild(story);
        actions.appendChild(btn('일기장을 덮는다', '', () => api.close()));
      }
    });
  }

  // ----- 턱 깎기 미니게임 -----
  function openCarve(sid) {
    const d = STATUES[sid];
    openModal({
      title: `⛏ ${d.name} - 턱 깎기`,
      onClose: saveGame,
      render(body, actions, api) {
        const st = state.statues[sid];

        const stage = el('div', 'carve-stage');
        const icon = el('div', 'carve-icon');
        if (d.style === 'double') icon.appendChild(el('span', 'chin2'));
        icon.appendChild(document.createTextNode('🗿'));
        if (d.style === 'sunglasses') icon.appendChild(el('span', 'glasses', '🕶️'));
        stage.appendChild(icon);
        body.appendChild(stage);

        const gauge = el('div', 'gauge');
        const fill = el('div', 'gauge-fill');
        const gtext = el('div', 'gauge-text');
        gauge.appendChild(fill);
        gauge.appendChild(gtext);
        body.appendChild(gauge);

        const info = el('div', 'carve-info');
        info.appendChild(el('span', '', `클릭당 +${carvePerClick()}%${state.tools.hammer ? ' (🔨 황금 망치)' : ''}`));
        info.appendChild(el('span', '', `완성 보상 ${d.reward} G`));
        const countEl = el('span', '', '');
        info.appendChild(countEl);
        body.appendChild(info);

        const updateGauge = () => {
          fill.style.width = `${st.progress}%`;
          gtext.textContent = `${Math.floor(st.progress)}%`;
          countEl.textContent = `완성 ${st.count}회`;
        };

        const doCarve = () => {
          st.progress = Math.min(100, st.progress + carvePerClick());
          icon.classList.remove('hit');
          void icon.offsetWidth; // 애니메이션 재시작
          icon.classList.add('hit');
          if (st.progress >= 100) {
            st.progress = 0;
            st.count += 1;
            state.gold += d.reward;
            api.setMsg(`🎉 턱 깎기 완성! +${d.reward} G`, 'ok');
            updateHUD();
            saveGame();
          } else {
            api.setMsg('', '');
          }
          updateGauge();
        };

        const carveBtn = btn('⛏ 턱 깎기!', 'carve-btn', doCarve);
        carveBtn.addEventListener('mousedown', (e) => e.preventDefault()); // 포커스 방지(스페이스 중복 방지)
        body.appendChild(carveBtn);

        modal.onKey = (e) => {
          if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
            if (!e.repeat) doCarve();
            return true;
          }
          return false;
        };
        updateGauge();
        actions.appendChild(btn('닫기', 'ghost', () => api.close()));
      }
    });
  }

  // ----- 원주민 대화 -----
  function nativeLines() {
    const L = [
      '오, 손주 왔구나! 이 섬에선 모아이의 턱이 마을의 복을 불러온다고 믿는단다.',
      '석상 앞에서 턱을 깎으면 골드를 벌 수 있고, 관광객들도 구경 와서 팁을 두둑이 주지.',
      '도구 상점의 황금 망치는 깎는 속도를 두 배로, 다이아 조각 칼은 팁을 두 배로 만들어 준단다.',
      '마을 홍보판에 SNS 전단지를 붙이면 관광객이 훨씬 자주 온다네.'
    ];
    if (!state.zones.coast) {
      L.push('동쪽 땅은 이스터 부동산에서 팔고 있다더군. 네 할아버지가 늘 탐내던 땅이지…');
    } else {
      L.push('동쪽 해안을 인수했구나! 그곳 석상들은 네 할아버지의 자랑이었단다.');
      L.push('일기장은 읽어 봤니? 화산 쪽에도 아직 풀리지 않은 이야기가 남아 있다지… 때가 되면 알게 될 게다.');
    }
    return L;
  }

  function openDialogue(name, face, lines) {
    let idx = 0;
    openModal({
      title: `${face} ${name}`,
      onClose: saveGame,
      render(body, actions, api) {
        const wrap = el('div', 'dialogue');
        wrap.appendChild(el('div', 'dialogue-face', face));
        const right = el('div');
        right.appendChild(el('div', 'dialogue-text', lines[idx]));
        right.appendChild(el('div', 'dialogue-page', `${idx + 1} / ${lines.length}`));
        wrap.appendChild(right);
        body.appendChild(wrap);
        if (idx < lines.length - 1) {
          actions.appendChild(btn('다음 ▶', '', () => { idx += 1; api.refresh(); }));
        } else {
          actions.appendChild(btn('끝', '', () => api.close()));
        }
      }
    });
  }

  function interactNative() {
    state.flags.talked += 1;
    openDialogue('원주민 어르신', '🧓', nativeLines());
  }

  function interactHut() {
    saveGame();
    openInfo('🛖 할아버지의 오두막', '낡았지만 따뜻한 오두막. 잠시 쉬어 가며 진행 상황을 저장했다. 💾', '확인');
  }

  function interactBottle() {
    if (state.flags.bottle) {
      openInfo('🍾 빈 병', '이미 쪽지를 꺼낸 병이다. 파도에 흔들리며 떠다닌다.');
      return;
    }
    state.flags.bottle = true;
    state.gold += 50;
    saveGame();
    updateHUD();
    openInfo('🍾 바다에 뜬 병', '병 속에는 금화 50 G와 쪽지가 들어 있었다.\n"동쪽 해안에는 내 소중한 보물이 잠들어 있단다. – 할아버지"', '확인');
  }

  // ----- 저장 / 초기화 -----
  function manualSave() {
    showToast(saveGame() ? '💾 저장되었습니다.' : '⚠ 저장에 실패했습니다.');
  }

  function confirmReset() {
    openModal({
      title: '⚠ 진행 초기화',
      render(body, actions, api) {
        const p = el('p', 'modal-desc', '골드, 도구, 홍보 버프, 인수한 구역, 석상 상태까지 모든 진행 상황이 삭제됩니다. 정말 초기화할까요?');
        p.style.fontSize = '1rem';
        body.appendChild(p);
        actions.appendChild(btn('취소', 'ghost', () => api.close()));
        actions.appendChild(btn('초기화', 'danger', () => { api.close(); doReset(); }));
      }
    });
  }

  function doReset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
    state = defaultState();
    player.x = state.px;
    player.y = state.py;
    tourists.length = 0;
    floaters.length = 0;
    spawnAcc = 8000;
    buildObjects();
    updateHUD();
    saveGame();
    showToast('🗑 새 게임을 시작합니다.');
  }

  /* ---------------------------------------------------------
   * 5) 맵 / 오브젝트 / 관광객
   * --------------------------------------------------------- */
  let objects = [];
  let nearObj = null;
  const tourists = [];
  const floaters = [];
  let spawnAcc = 8000;

  function makeStatueObj(d) {
    return {
      id: d.id, type: 'statue', sid: d.id, cx: d.x, cy: d.y,
      rect: { x: d.x - 24, y: d.y + 4, w: 48, h: 30 },
      blocking: true,
      prompt: `${d.name} 턱 깎기`,
      action: () => openCarve(d.id),
      draw: drawStatueObj
    };
  }

  function buildObjects() {
    objects = [];
    if (state.map === 'village') {
      objects.push(
        { id: 'hut', type: 'building', rect: { x: 30, y: 40, w: 150, h: 110 }, blocking: true, emoji: '🛖', size: 62,
          color: '#b98a54', stroke: '#6b4520', label: '할아버지의 오두막', prompt: '오두막에서 쉬기 (저장)', action: interactHut, draw: drawBuildingObj },
        { id: 'shop', type: 'building', rect: { x: 250, y: 40, w: 120, h: 90 }, blocking: true, emoji: '🏪', size: 54,
          color: '#e0b25c', stroke: '#8a5a1c', label: '도구 상점', prompt: '도구 상점 열기', action: openShop, draw: drawBuildingObj },
        { id: 'board', type: 'building', rect: { x: 410, y: 50, w: 80, h: 80 }, blocking: true, emoji: '📢', size: 44,
          color: '#c97a5a', stroke: '#74311c', label: '마을 홍보판', prompt: '마을 홍보판 보기', action: openBoard, draw: drawBuildingObj },
        { id: 'realty', type: 'building', rect: { x: 620, y: 40, w: 140, h: 110 }, blocking: true, emoji: '🏢', size: 60,
          color: '#7fa6c9', stroke: '#2c506e', label: '이스터 부동산', prompt: '이스터 부동산 입장', action: openRealty, draw: drawBuildingObj },
        { id: 'native', type: 'npc', rect: { x: 176, y: 322, w: 28, h: 26 }, blocking: true, emoji: '🧓', size: 32,
          label: '원주민 어르신', prompt: '원주민과 대화하기', action: interactNative, draw: drawNpcObj }
      );
    }
    if (state.map === 'sea') {
      objects.push(
        { id: 'bottle', type: 'item', rect: { x: 604, y: 284, w: 32, h: 32 }, blocking: false, emoji: '🍾', size: 30,
          label: '', prompt: '떠다니는 병 줍기', action: interactBottle, draw: drawBottleObj }
      );
    }
    for (const d of Object.values(STATUES)) {
      if (d.map === state.map && isUnlocked(d.id)) objects.push(makeStatueObj(d));
    }
  }

  function circleRect(cx, cy, r, rc) {
    const nx = clamp(cx, rc.x, rc.x + rc.w);
    const ny = clamp(cy, rc.y, rc.y + rc.h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }
  function blockedAt(x, y) {
    for (const o of objects) {
      if (o.blocking && circleRect(x, y, PR, o.rect)) return true;
    }
    return false;
  }
  function boxOverlap(x, y, r, rc) {
    return x + r > rc.x && x - r < rc.x + rc.w && y + r > rc.y && y - r < rc.y + rc.h;
  }
  function distToRect(x, y, rc) {
    const nx = clamp(x, rc.x, rc.x + rc.w);
    const ny = clamp(y, rc.y, rc.y + rc.h);
    return Math.hypot(x - nx, y - ny);
  }

  function changeMap(to, spawn) {
    state.map = to;
    player.x = spawn.x;
    player.y = spawn.y;
    tourists.length = 0;
    floaters.length = 0;
    spawnAcc = 8000;
    buildObjects();
    updateHUD();
    saveGame();
    showToast(`📍 ${MAPS[to].name}`, 1600);
  }

  function checkExits(prevX, prevY) {
    for (const e of EXITS[state.map] || []) {
      if (!boxOverlap(player.x, player.y, PR, e.rect)) continue;
      if (e.requires && !e.requires()) {
        player.x = prevX;
        player.y = prevY;
        if (toastCooldown <= 0) {
          showToast(e.blockedMsg || '지금은 갈 수 없다.');
          toastCooldown = 2.5;
        }
        return;
      }
      changeMap(e.to, e.spawn);
      return;
    }
  }

  // ----- 관광객 -----
  const TOURIST_EMOJI = ['🚶', '🚶‍♀️', '🧍', '🧍‍♀️'];

  function spawnTourist() {
    if (tourists.length >= CFG.maxTourists) return;
    const list = Object.values(STATUES).filter((d) => d.map === state.map && isUnlocked(d.id));
    if (!list.length) return;
    const d = list[Math.floor(Math.random() * list.length)];
    tourists.push({
      x: -20,
      y: state.map === 'village' ? 200 + Math.random() * 220 : 300 + Math.random() * 120,
      sid: d.id,
      tx: d.x + (Math.random() * 80 - 40),
      ty: d.y + 54 + Math.random() * 18,
      phase: 'in',
      timer: 0,
      emoji: TOURIST_EMOJI[Math.floor(Math.random() * TOURIST_EMOJI.length)]
    });
  }

  function updateTourists(dt) {
    spawnAcc += dt * 1000;
    const interval = flyerActive() ? CFG.touristBuffInterval : CFG.touristBaseInterval;
    if (spawnAcc >= interval) {
      spawnAcc = 0;
      spawnTourist();
    }
    for (let i = tourists.length - 1; i >= 0; i--) {
      const t = tourists[i];
      if (t.phase === 'in') {
        const dx = t.tx - t.x;
        const dy = t.ty - t.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 4) { t.phase = 'photo'; t.timer = 1.3; }
        else { t.x += (dx / dist) * 85 * dt; t.y += (dy / dist) * 85 * dt; }
      } else if (t.phase === 'photo') {
        t.timer -= dt;
        if (t.timer <= 0) {
          const d = STATUES[t.sid];
          const tip = Math.round(d.tip * tipMult());
          state.gold += tip;
          floaters.push({ x: t.x, y: t.y - 30, text: `+${tip} G`, life: 1.4 });
          updateHUD();
          t.phase = 'out';
        }
      } else {
        t.x += 95 * dt;
        if (t.x > W + 30) tourists.splice(i, 1);
      }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].life -= dt;
      floaters[i].y -= 28 * dt;
      if (floaters[i].life <= 0) floaters.splice(i, 1);
    }
  }

  /* ---------------------------------------------------------
   * 6) 입력
   * --------------------------------------------------------- */
  const keys = { up: false, down: false, left: false, right: false };
  const DIR_KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };
  function clearDirKeys() {
    keys.up = keys.down = keys.left = keys.right = false;
    document.querySelectorAll('.dp.active').forEach((b) => b.classList.remove('active'));
  }

  function interact() {
    if (modal || !nearObj) return;
    nearObj.action();
  }

  window.addEventListener('keydown', (e) => {
    if (modal) {
      if (e.code === 'Escape') { closeModal(); e.preventDefault(); return; }
      if (modal.onKey && modal.onKey(e)) e.preventDefault();
      return;
    }
    if (DIR_KEYS[e.code]) { keys[DIR_KEYS[e.code]] = true; e.preventDefault(); return; }
    if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
      if (!e.repeat) interact();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (DIR_KEYS[e.code]) keys[DIR_KEYS[e.code]] = false;
    if (modal && (e.code === 'Space' || e.code === 'Enter')) e.preventDefault();
  });
  window.addEventListener('blur', clearDirKeys);

  // 터치 방향 버튼
  document.querySelectorAll('.dp').forEach((b) => {
    const dir = b.dataset.dir;
    const on = (e) => { e.preventDefault(); keys[dir] = true; b.classList.add('active'); };
    const off = (e) => { e.preventDefault(); keys[dir] = false; b.classList.remove('active'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // 터치 상호작용 버튼
  $('btn-interact').addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });
  $('btn-interact').addEventListener('contextmenu', (e) => e.preventDefault());

  // 캔버스 탭: 가까이 있는 건물/NPC/석상을 직접 탭하면 상호작용
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  canvas.addEventListener('pointerdown', (e) => {
    if (modal) return;
    const r = canvas.getBoundingClientRect();
    const lx = (e.clientX - r.left) * (W / r.width);
    const ly = (e.clientY - r.top) * (H / r.height);
    const hit = objects.find((o) => o.action &&
      lx >= o.rect.x - 14 && lx <= o.rect.x + o.rect.w + 14 &&
      ly >= o.rect.y - (o.type === 'statue' ? 70 : 14) && ly <= o.rect.y + o.rect.h + 14);
    if (!hit) return;
    if (hit === nearObj) interact();
    else showToast('조금 더 가까이 가 보세요!', 1400);
  });

  $('btn-save').addEventListener('click', manualSave);
  $('btn-reset').addEventListener('click', confirmReset);
  $('modal-close').addEventListener('click', closeModal);
  $('modal').addEventListener('pointerdown', (e) => { if (e.target === $('modal')) closeModal(); });

  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

  /* ---------------------------------------------------------
   * 7) 렌더링 & 루프
   * --------------------------------------------------------- */
  function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function emoji(ch, x, y, size, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y);
    ctx.restore();
  }
  function plate(text, x, y, opts = {}) {
    const size = opts.size || 12;
    ctx.save();
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = opts.bg || 'rgba(35,22,10,0.78)';
    rrect(x - w / 2, y - size / 2 - 4, w, size + 8, 8);
    ctx.fill();
    ctx.fillStyle = opts.fg || '#fff';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function ellipse(x, y, rx, ry, fill) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // ----- 오브젝트 그리기 -----
  function drawBuildingObj(o) {
    const r = o.rect;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    rrect(r.x + 4, r.y + 6, r.w, r.h, 12);
    ctx.fill();
    ctx.fillStyle = o.color;
    rrect(r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = o.stroke;
    ctx.stroke();
    ctx.restore();
    emoji(o.emoji, r.x + r.w / 2, r.y + r.h / 2 - 2, o.size);
    plate(o.label, r.x + r.w / 2, r.y + r.h + 13);
  }
  function drawNpcObj(o, t) {
    const r = o.rect;
    const cx = r.x + r.w / 2;
    ellipse(cx, r.y + r.h, 14, 5, 'rgba(0,0,0,0.2)');
    emoji(o.emoji, cx, r.y + 8 + Math.sin(t / 400) * 1.5, o.size);
    plate(o.label, cx, r.y + r.h + 14, { size: 11 });
  }
  function drawBottleObj(o, t) {
    const r = o.rect;
    emoji(o.emoji, r.x + r.w / 2, r.y + r.h / 2 + Math.sin(t / 500) * 4, o.size, state.flags.bottle ? 0.45 : 1);
  }
  function drawStatueObj(o, t) {
    const d = STATUES[o.sid];
    const st = state.statues[o.sid];
    const { cx, cy } = o;
    ellipse(cx, cy + 34, 30, 8, 'rgba(0,0,0,0.22)');
    if (d.style === 'double') ellipse(cx, cy + 24, 15, 9, '#8d8d86');
    emoji('🗿', cx, cy, 66);
    if (d.style === 'sunglasses') emoji('🕶️', cx, cy - 6, 30);
    // 깎기 진행도 막대
    const bw = 56;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rrect(cx - bw / 2, cy - 50, bw, 8, 4);
    ctx.fill();
    if (st.progress > 0) {
      ctx.fillStyle = '#ffc13d';
      rrect(cx - bw / 2, cy - 50, bw * (st.progress / 100), 8, 4);
      ctx.fill();
    }
    plate(d.name, cx, cy + 50, { size: 11 });
  }

  // ----- 배경 -----
  function drawWaves(y0, y1, t, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let y = y0; y < y1; y += 22) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = y + Math.sin((x + t / 14 + y * 3) / 28) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  const PALMS_VILLAGE = [[262, 196], [560, 230], [722, 424], [96, 440], [640, 340]];
  const PALMS_COAST = [[90, 190], [700, 190], [420, 200], [120, 440], [690, 430]];

  function drawVillageBG(t) {
    ctx.fillStyle = '#ead7a1';
    ctx.fillRect(0, 0, W, H);
    [[120, 420, 70], [560, 390, 90], [700, 260, 60], [320, 200, 50]].forEach(([x, y, r]) => {
      ctx.globalAlpha = 0.6;
      ellipse(x, y, r, r * 0.55, '#c9d98a');
      ctx.globalAlpha = 1;
    });
    // 흙길
    ctx.fillStyle = '#d9bf84';
    ctx.fillRect(0, 168, W - 20, 36);
    // 오두막 마당 울타리
    ctx.save();
    ctx.fillStyle = 'rgba(180,140,80,0.22)';
    rrect(16, 26, 214, 360, 12);
    ctx.fill();
    ctx.setLineDash([10, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8a5a2b';
    ctx.stroke();
    ctx.restore();
    plate('오두막 마당', 123, 372, { size: 11, bg: 'rgba(110,70,30,0.8)' });
    // 바다/선착장
    const g = ctx.createLinearGradient(0, H - 30, 0, H);
    g.addColorStop(0, '#59b8e0');
    g.addColorStop(1, '#2d86c0');
    ctx.fillStyle = g;
    ctx.fillRect(0, H - 30, W, 30);
    drawWaves(H - 28, H, t, 'rgba(255,255,255,0.45)');
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(300, H - 34, 200, 34);
    ctx.strokeStyle = '#5c3a18';
    ctx.lineWidth = 2;
    for (let x = 310; x < 500; x += 20) { ctx.beginPath(); ctx.moveTo(x, H - 34); ctx.lineTo(x, H); ctx.stroke(); }
    plate('⛵ 바다로', 400, H - 46, { size: 11 });
    // 야자수
    PALMS_VILLAGE.forEach(([x, y]) => emoji('🌴', x, y, 46));
    // 동쪽 문: 인수 전 / 후
    if (!state.zones.coast) {
      ctx.strokeStyle = '#7a4b1e';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(W - 26, 250); ctx.lineTo(W - 26, 430); ctx.stroke();
      for (let y = 250; y <= 430; y += 36) { ctx.beginPath(); ctx.moveTo(W - 34, y); ctx.lineTo(W - 18, y); ctx.stroke(); }
      emoji('🪧', W - 64, 320, 34);
      plate('매물', W - 64, 352, { size: 11, bg: 'rgba(140,60,40,0.85)' });
    } else {
      ctx.fillStyle = '#d4b574';
      ctx.fillRect(W - 90, 300, 90, 70);
      emoji('➡️', W - 46 + Math.sin(t / 250) * 4, 335, 30);
      plate('해안가 구역', W - 56, 384, { size: 11, bg: 'rgba(30,110,140,0.85)' });
    }
  }

  function drawSeaBG(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3aa6dd');
    g.addColorStop(1, '#0c4a86');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawWaves(30, H, t, 'rgba(255,255,255,0.22)');
    // 위쪽 모래 띠 + 선착장
    ctx.fillStyle = '#ead7a1';
    ctx.fillRect(0, 0, W, 14);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(300, 0, 200, 24);
    plate('🏝 마을 선착장', 400, 40, { size: 11 });
    emoji('🏝️', 120, 360, 64);
    emoji('🐋', ((t / 40) % (W + 200)) - 100, 420, 48);
    emoji('🐟', 700 - ((t / 30) % 400), 200, 26);
    emoji('🐟', 250 + ((t / 50) % 300), 140, 22);
  }

  function drawCoastBG(t) {
    const g = ctx.createLinearGradient(0, 0, 0, 140);
    g.addColorStop(0, '#2f9fcf');
    g.addColorStop(1, '#6fd0e0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 140);
    drawWaves(10, 140, t, 'rgba(255,255,255,0.35)');
    ctx.fillStyle = '#f2e1b0';
    ctx.beginPath();
    ctx.moveTo(0, 130);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 130 + Math.sin((x + t / 20) / 40) * 5);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d4b574';
    ctx.fillRect(0, 300, 90, 70);
    PALMS_COAST.forEach(([x, y]) => emoji('🌴', x, y, 46));
    [[200, 400], [380, 440], [610, 380], [480, 180]].forEach(([x, y]) => emoji('🐚', x, y, 22));
    emoji('🦀', 300 + ((Math.sin(t / 900) + 1) / 2) * 260, 420, 24);
    plate('해안가 구역', 400, 160, { size: 12, bg: 'rgba(30,110,140,0.85)' });
    plate('◀ 마을', 52, 392, { size: 11 });
  }

  function drawPlayer(t) {
    const baseY = player.y;
    if (state.map === 'sea') {
      ellipse(player.x, baseY + 12, 16, 5, 'rgba(0,0,0,0.25)');
      emoji('⛵', player.x, baseY + Math.sin(t / 300) * 2, 36);
    } else {
      ellipse(player.x, baseY + 13, 12, 4, 'rgba(0,0,0,0.25)');
      emoji('🧑', player.x, baseY, 30);
    }
  }

  function render(t) {
    ctx.clearRect(0, 0, W, H);
    if (state.map === 'village') drawVillageBG(t);
    else if (state.map === 'sea') drawSeaBG(t);
    else drawCoastBG(t);

    // 깊이 정렬(발 위치 기준)
    const list = [];
    objects.forEach((o) => list.push({ y: o.rect.y + o.rect.h, draw: () => o.draw(o, t) }));
    tourists.forEach((tr) => list.push({ y: tr.y + 14, draw: () => {
      ellipse(tr.x, tr.y + 13, 11, 4, 'rgba(0,0,0,0.22)');
      emoji(tr.emoji, tr.x, tr.y, 28);
      if (tr.phase === 'photo' && Math.floor(tr.timer * 6) % 2 === 0) emoji('📸', tr.x + 16, tr.y - 18, 18);
    } }));
    list.push({ y: player.y + 14, draw: () => drawPlayer(t) });
    list.sort((a, b) => a.y - b.y).forEach((it) => it.draw());

    // 상호작용 안내
    if (nearObj && !modal) {
      const r = nearObj.rect;
      const top = nearObj.type === 'statue' ? nearObj.cy - 70 : r.y - 16;
      plate(`[E] ${nearObj.prompt}`, r.x + r.w / 2, top, { size: 12, bg: 'rgba(255,178,63,0.95)', fg: '#2a1a08' });
    }
    // 떠오르는 골드 텍스트
    floaters.forEach((f) => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe27a';
      ctx.strokeStyle = '#5a3a05';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }

  // ----- 업데이트 -----
  function update(dt) {
    if (toastCooldown > 0) toastCooldown -= dt;
    if (modal) return;

    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      const sp = (state.map === 'sea' ? CFG.boatSpeed : CFG.walkSpeed) * dt;
      const prevX = player.x;
      const prevY = player.y;
      const nx = clamp(player.x + (dx / len) * sp, PR, W - PR);
      if (!blockedAt(nx, player.y)) player.x = nx;
      const ny = clamp(player.y + (dy / len) * sp, PR, H - PR);
      if (!blockedAt(player.x, ny)) player.y = ny;
      checkExits(prevX, prevY);
    }

    // 가장 가까운 상호작용 대상
    nearObj = null;
    let best = 44;
    for (const o of objects) {
      if (!o.action) continue;
      const d = distToRect(player.x, player.y, o.rect);
      if (d < best) { best = d; nearObj = o; }
    }
    $('btn-interact').classList.toggle('ready', !!nearObj);

    updateTourists(dt);
  }

  let last = performance.now();
  let uiAcc = 0;
  let saveAcc = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    update(dt);
    render(ts);

    uiAcc += dt;
    if (uiAcc >= 0.5) {
      uiAcc = 0;
      updateHUD();
      if (modal && modal.tick) modal.tick();
    }
    saveAcc += dt;
    if (saveAcc >= 5) { saveAcc = 0; saveGame(); } // 자동 저장
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------
   * 시작
   * --------------------------------------------------------- */
  // 저장된 위치가 장애물과 겹치면 안전한 위치로 이동
  buildObjects();
  if (blockedAt(player.x, player.y)) {
    player.x = VILLAGE_SPAWN.x;
    player.y = VILLAGE_SPAWN.y;
    if (state.map !== 'village') { state.map = 'village'; buildObjects(); }
  }
  updateHUD();
  requestAnimationFrame(frame);
  showToast('석상 앞에서 E 키(또는 E 버튼)로 턱을 깎아 골드를 모아 보세요!', 4000);
})();