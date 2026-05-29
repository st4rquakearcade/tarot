/**
 * Tarot — App Logic
 */

import { CARDS } from './cards.js';

const MIN_COUNT = 1;
const MAX_COUNT = CARDS.length;
const GRID_PX = 36;
const CARD_RATIO = 1.7;

// 카드 크기 (장수 + 매트 크기에 따라 유동)
const CARD_F_MAX = 0.13;
const CARD_F_MIN = 0.05;
const CARD_W_FLOOR = 34;
const CARD_W_CEIL = 150;
const COUNT_LO = 4;
const COUNT_HI = 24;

// 개별 카드 크기 조절(Scale) 범위
const SCALE_MIN = 0.4;
const SCALE_MAX = 3;
const SCALE_STEP = 0.1;

const HISTORY_LIMIT = 50;

const el = {
  drawBtn: document.getElementById('draw-btn'),
  count: document.getElementById('count'),
  result: document.getElementById('result'),
  spreadToggle: document.getElementById('spread-toggle'),
  spreadEditor: document.getElementById('spread-editor'),
  spreadMat: document.getElementById('spread-mat'),
  resetSpread: document.getElementById('reset-spread'),
  toggleSpread: document.getElementById('toggle-spread'),
};

let hasDrawn = false;
let positions = []; // [{x, y, reversed?, rotation?, scale?}]
let selectedIndex = -1;
let resizeMode = false; // Ctrl+T 키보드 크기 조정 모드
let cardW = 56;
let cardH = cardW * CARD_RATIO;
let lastMatSize = { width: 800, height: 800 };

let history = [];
let future = [];

/* ---------- Helpers ---------- */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function getMatSize() {
  const rect = el.spreadMat.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    lastMatSize = { width: rect.width, height: rect.height };
  }
  return lastMatSize;
}

function applyCardSize() {
  const count = getCount();
  const { width, height } = getMatSize();
  const side = Math.min(width, height);

  const t = clamp((count - COUNT_LO) / (COUNT_HI - COUNT_LO), 0, 1);
  const factor = CARD_F_MAX - t * (CARD_F_MAX - CARD_F_MIN);
  cardW = clamp(side * factor, CARD_W_FLOOR, CARD_W_CEIL);
  cardH = cardW * CARD_RATIO;

  const hoverScale = clamp(150 / cardW, 1.4, 4.5);

  [el.spreadMat, el.result].forEach(node => {
    node.style.setProperty('--card-w', cardW.toFixed(1) + 'px');
    node.style.setProperty('--hover-scale', hoverScale.toFixed(2));
  });
}

// 회전(90/270이면 가로·세로 swap) + 개별 scale을 반영한 카드 박스 크기 (px)
function cardBox(pos) {
  const s = (pos && pos.scale) || 1;
  const rotated = pos && ((pos.rotation || 0) % 180) !== 0;
  return {
    w: (rotated ? cardH : cardW) * s,
    h: (rotated ? cardW : cardH) * s,
  };
}

function clampToBounds(x, y, width, height, pos) {
  const box = cardBox(pos);
  const mx = (box.w / 2 / width) * 100;
  const my = (box.h / 2 / height) * 100;
  return {
    x: clamp(x, mx, 100 - mx),
    y: clamp(y, my, 100 - my),
  };
}

function snapPercent(percent, sizePx) {
  const px = (percent / 100) * sizePx;
  const snapped = Math.round(px / GRID_PX) * GRID_PX;
  return (snapped / sizePx) * 100;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getCount() {
  const value = parseInt(el.count.value, 10);
  const safe = clamp(Number.isNaN(value) ? 3 : value, MIN_COUNT, MAX_COUNT);
  el.count.value = safe;
  return safe;
}

const getDirectionMode = () =>
  document.querySelector('input[name="direction"]:checked').value;

const isSpreadMode = () => el.spreadToggle.checked;

/* ---------- Undo / Redo ---------- */

const snapshot = () => positions.map(p => ({ ...p }));

function pushHistory() {
  history.push(snapshot());
  if (history.length > HISTORY_LIMIT) history.shift();
  future = [];
}

function undo() {
  if (history.length === 0) return;
  future.push(snapshot());
  positions = history.pop();
  renderSpreadEditor();
}

function redo() {
  if (future.length === 0) return;
  history.push(snapshot());
  positions = future.pop();
  renderSpreadEditor();
}

/* ---------- Spread Editor ---------- */

function defaultPositions(count) {
  const { width, height } = getMatSize();
  return Array.from({ length: count }, (_, i) => {
    const base = { rotation: 0, scale: 1 };
    const rawX = (100 / (count + 1)) * (i + 1);
    const p = clampToBounds(rawX, 50, width, height, base);
    return { ...base, x: p.x, y: p.y };
  });
}

function syncPositions(count) {
  const defaults = defaultPositions(count);
  positions = Array.from({ length: count }, (_, i) => {
    const existing = positions[i];
    if (!existing) return defaults[i];
    // 필요 속성 보강
    return {
      rotation: 0,
      scale: 1,
      ...existing,
    };
  });
}

function markerStyle(pos) {
  return [
    `left:${pos.x}%`,
    `top:${pos.y}%`,
    `--rot:${pos.rotation || 0}deg`,
    `--scale:${pos.scale || 1}`,
  ].join('; ');
}

function renderSpreadEditor() {
  const count = getCount();
  applyCardSize();
  syncPositions(count);

  el.spreadMat.innerHTML = positions
    .map(
      (pos, i) => `
        <div
          class="spread-marker${pos.reversed ? ' reversed' : ''}"
          data-i="${i}"
          style="${markerStyle(pos)}"
          tabindex="0"
        >
          <span class="spread-marker__num">${i + 1}</span>
          <span class="spread-marker__dir" aria-hidden="true">↻</span>
          <span class="spread-marker__handle" aria-hidden="true"></span>
        </div>
      `
    )
    .join('');

  el.spreadMat.querySelectorAll('.spread-marker').forEach(attachMarker);
  selectedIndex = -1;
  resizeMode = false;
}

function selectMarker(idx) {
  selectedIndex = idx;
  el.spreadMat.querySelectorAll('.spread-marker').forEach((m, i) => {
    m.classList.toggle('selected', i === idx);
    if (i !== idx) m.classList.remove('resize-mode');
  });
}

function updateMarker(idx) {
  const marker = el.spreadMat.querySelector(`.spread-marker[data-i="${idx}"]`);
  if (!marker) return;
  const pos = positions[idx];
  marker.style.left = pos.x + '%';
  marker.style.top = pos.y + '%';
  marker.style.setProperty('--rot', (pos.rotation || 0) + 'deg');
  marker.style.setProperty('--scale', pos.scale || 1);
  marker.classList.toggle('reversed', !!pos.reversed);
}

function attachMarker(marker) {
  const index = parseInt(marker.dataset.i, 10);
  if (Number.isNaN(index)) return;

  let drag = null;
  let resize = null;

  // 위치 드래그
  marker.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('spread-marker__handle')) return;
    e.preventDefault();
    try { marker.setPointerCapture(e.pointerId); } catch (_) {}
    selectMarker(index);

    const matRect = el.spreadMat.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    drag = {
      offsetX: e.clientX - (markerRect.left + markerRect.width / 2),
      offsetY: e.clientY - (markerRect.top + markerRect.height / 2),
      matRect,
      before: snapshot(),
      moved: false,
    };
    marker.classList.add('dragging');
  });

  marker.addEventListener('pointermove', e => {
    if (!drag) return;
    const rawX =
      ((e.clientX - drag.offsetX - drag.matRect.left) / drag.matRect.width) * 100;
    const rawY =
      ((e.clientY - drag.offsetY - drag.matRect.top) / drag.matRect.height) * 100;

    let x = rawX;
    let y = rawY;
    if (!e.altKey) {
      x = snapPercent(rawX, drag.matRect.width);
      y = snapPercent(rawY, drag.matRect.height);
    }
    const b = clampToBounds(x, y, drag.matRect.width, drag.matRect.height, positions[index]);

    if (b.x !== positions[index].x || b.y !== positions[index].y) drag.moved = true;
    positions[index] = { ...positions[index], x: b.x, y: b.y };
    marker.style.left = b.x + '%';
    marker.style.top = b.y + '%';
  });

  const endDrag = e => {
    if (!drag) return;
    if (drag.moved) {
      history.push(drag.before);
      if (history.length > HISTORY_LIMIT) history.shift();
      future = [];
    }
    drag = null;
    marker.classList.remove('dragging');
    try { marker.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  marker.addEventListener('pointerup', endDrag);
  marker.addEventListener('pointercancel', endDrag);

  // 크기 조정 핸들 (있으면)
  const handle = marker.querySelector('.spread-marker__handle');
  if (!handle) return;

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    selectMarker(index);

    const rect = marker.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    resize = {
      cx,
      cy,
      startDist: Math.max(Math.hypot(e.clientX - cx, e.clientY - cy), 1),
      startScale: positions[index].scale || 1,
    };
    pushHistory();
  });

  handle.addEventListener('pointermove', e => {
    if (!resize) return;
    const dist = Math.hypot(e.clientX - resize.cx, e.clientY - resize.cy);
    const scale = clamp(
      resize.startScale * (dist / resize.startDist),
      SCALE_MIN,
      SCALE_MAX
    );
    positions[index].scale = scale;
    marker.style.setProperty('--scale', scale.toFixed(2));
  });

  const endResize = e => {
    if (!resize) return;
    resize = null;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  handle.addEventListener('pointerup', endResize);
  handle.addEventListener('pointercancel', endResize);
}

function moveSelected(dxCells, dyCells) {
  const { width, height } = getMatSize();
  const pos = positions[selectedIndex];
  let nx = pos.x;
  let ny = pos.y;

  if (dxCells) nx = snapPercent(pos.x + dxCells * ((GRID_PX / width) * 100), width);
  if (dyCells) ny = snapPercent(pos.y + dyCells * ((GRID_PX / height) * 100), height);

  const bounded = clampToBounds(nx, ny, width, height, pos);
  pos.x = bounded.x;
  pos.y = bounded.y;
}

function setResizeMode(on) {
  resizeMode = on;
  el.spreadMat
    .querySelectorAll('.spread-marker')
    .forEach((m, i) => m.classList.toggle('resize-mode', on && i === selectedIndex));
}

/* ---------- Keyboard ---------- */

document.addEventListener('keydown', e => {
  if (!isSpreadMode()) return;
  if (el.spreadEditor.classList.contains('collapsed')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  // 실행 취소 / 다시 실행
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  // Ctrl+T : 크기 조정 모드 토글 (선택된 마커가 있을 때)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    if (selectedIndex >= 0) setResizeMode(!resizeMode);
    return;
  }

  if (selectedIndex < 0) return;
  const pos = positions[selectedIndex];
  if (!pos) return;

  let handled = false;

  if (e.key === 'Escape' && resizeMode) {
    setResizeMode(false);
    handled = true;
  } else if (
    e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
    e.key === 'ArrowUp' || e.key === 'ArrowDown'
  ) {
    pushHistory();
    if (resizeMode) {
      // 크기 조정 모드: ↑/→ 키우기, ↓/← 줄이기
      const dir = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1 : -1;
      pos.scale = clamp((pos.scale || 1) + dir * SCALE_STEP, SCALE_MIN, SCALE_MAX);
    } else {
      const cells = e.shiftKey ? 2 : 1;
      if (e.key === 'ArrowLeft') moveSelected(-cells, 0);
      else if (e.key === 'ArrowRight') moveSelected(cells, 0);
      else if (e.key === 'ArrowUp') moveSelected(0, -cells);
      else moveSelected(0, cells);
    }
    handled = true;
  } else if (e.key === 'r' || e.key === 'R') {
    pushHistory();
    pos.rotation = ((pos.rotation || 0) + 90) % 360;
    handled = true;
  } else if (e.key === 't' || e.key === 'T') {
    // 방향(정/역) 전환 (Ctrl 없는 T)
    pushHistory();
    pos.reversed = !pos.reversed;
    handled = true;
  }

  if (handled) {
    e.preventDefault();
    updateMarker(selectedIndex);
  }
});

/* ---------- Collapse Toggle ---------- */

function setCollapsed(c) {
  el.spreadEditor.classList.toggle('collapsed', c);
}

/* ---------- Drawing & Rendering ---------- */

function drawCards() {
  const count = getCount();
  const allowReversed = getDirectionMode() === 'both';
  const spread = isSpreadMode();

  if (spread) {
    applyCardSize();
    syncPositions(count);
  }

  const drawn = shuffle(CARDS)
    .slice(0, count)
    .map((card, i) => {
      const pos = spread ? positions[i] : null;
      const isReversed =
        pos && pos.reversed === true
          ? true
          : allowReversed && Math.random() < 0.5;
      return { card, isReversed, position: pos };
    });

  render(drawn, spread);

  if (spread) setCollapsed(true);

  if (!hasDrawn) {
    el.drawBtn.textContent = '다시 뽑기';
    hasDrawn = true;
  }
}

function render(drawn, spread) {
  el.result.className = spread ? 'result result--spread' : 'result';

  if (!(spread && drawn.length)) {
    el.result.style.width = '';
    el.result.style.maxWidth = '';
    el.result.style.aspectRatio = '';
    el.result.style.height = '';
    el.result.innerHTML = drawn.map(toCardHtml).join('');
    return;
  }

  // 카드들이 실제 차지하는 영역(bounding box)에 맞춰 결과 영역 크기 결정
  const { width: S } = getMatSize();

  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  drawn.forEach(d => {
    const box = cardBox(d.position);
    const cx = (d.position.x / 100) * S;
    const cy = (d.position.y / 100) * S;
    left = Math.min(left, cx - box.w / 2);
    right = Math.max(right, cx + box.w / 2);
    top = Math.min(top, cy - box.h / 2);
    bottom = Math.max(bottom, cy + box.h / 2);
  });

  const pad = 12;
  left -= pad; right += pad; top -= pad; bottom += pad;
  const bw = right - left;
  const bh = bottom - top;

  const remapped = drawn.map(d => {
    const cx = (d.position.x / 100) * S;
    const cy = (d.position.y / 100) * S;
    return {
      ...d,
      position: {
        ...d.position,
        x: ((cx - left) / bw) * 100,
        y: ((cy - top) / bh) * 100,
      },
    };
  });

  el.result.style.width = bw + 'px';
  el.result.style.maxWidth = '100%';
  el.result.style.aspectRatio = `${bw} / ${bh}`;
  el.result.style.height = '';
  el.result.innerHTML = remapped.map(toCardHtml).join('');
}

function toCardHtml({ card, isReversed, position }, index) {
  const spread = !!position;
  const keywords = isReversed ? card.reversed : card.upright;
  const directionText = isReversed ? '역방향' : '정방향';
  const imgClass = `card__image${isReversed ? ' card__image--reversed' : ''}`;
  const dirClass = `card__direction${isReversed ? ' card__direction--reversed' : ''}`;

  const keywordHtml = keywords
    .map((kw, i) => `<span class="card__keyword" style="--i:${i}">${kw}</span>`)
    .join('');

  const shortName = card.name.split(' (')[0];
  const label = spread
    ? `<div class="card__label">
         <span class="card__label-name">${shortName}</span>
         <span class="card__label-dir${isReversed ? ' card__label-dir--rev' : ''}">${directionText}</span>
       </div>`
    : '';

  const infoBlock = spread
    ? ''
    : `<div class="card__info">
         <div class="card__name">${card.name}</div>
         <div class="${dirClass}">${directionText}</div>
       </div>`;

  const posStyle = position
    ? `left:${position.x}%; top:${position.y}%; --rot:${position.rotation || 0}deg; --scale:${position.scale || 1}; `
    : '';
  const style = `${posStyle}animation-delay:${index * 0.06}s`;

  return `
    <article class="card" style="${style}">
      <div class="card__image-wrap" tabindex="0">
        <img src="${card.image}" alt="${card.name}" class="${imgClass}" loading="lazy" />
        <div class="card__meaning" aria-hidden="true">
          ${keywordHtml}
        </div>
        ${label}
      </div>
      ${infoBlock}
    </article>
  `;
}

/* ---------- Events ---------- */

el.drawBtn.addEventListener('click', drawCards);

el.count.addEventListener('change', () => {
  getCount();
  if (isSpreadMode()) {
    history = []; future = [];
    renderSpreadEditor();
  }
});

el.spreadToggle.addEventListener('change', () => {
  el.spreadEditor.hidden = !isSpreadMode();
  if (isSpreadMode()) {
    history = []; future = [];
    setCollapsed(false);
    renderSpreadEditor();
  }
});

el.resetSpread.addEventListener('click', () => {
  pushHistory();
  positions = defaultPositions(getCount());
  renderSpreadEditor();
});

el.toggleSpread.addEventListener('click', () => {
  const willExpand = el.spreadEditor.classList.contains('collapsed');
  setCollapsed(!willExpand);
  if (willExpand) renderSpreadEditor();
});

// 매트 바깥 클릭 시 선택 해제
document.addEventListener('pointerdown', e => {
  if (!isSpreadMode() || selectedIndex < 0) return;
  if (e.target.closest('.spread-marker')) return;
  selectedIndex = -1;
  resizeMode = false;
  el.spreadMat
    .querySelectorAll('.spread-marker.selected, .spread-marker.resize-mode')
    .forEach(m => m.classList.remove('selected', 'resize-mode'));
});

// 창 크기 변경 시 카드 크기 재계산
let resizeTimer;
window.addEventListener('resize', () => {
  if (!isSpreadMode()) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyCardSize, 150);
});
