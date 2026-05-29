/**
 * Tarot — App Logic
 */

import { CARDS as _CARDS } from './cards.js';

const MAJOR_COUNT = 22; // cards.js의 처음 22장이 메이저 아르카나
const CARDS = _CARDS.map((c, i) => ({
  ...c,
  arcana: i < MAJOR_COUNT ? 'major' : 'minor',
}));

const MIN_COUNT = 1;
const MAX_COUNT = CARDS.length;
const GRID_PX = 36;
const CARD_RATIO = 1.7;

const CARD_F_MAX = 0.13;
const CARD_F_MIN = 0.05;
const CARD_W_FLOOR = 34;
const CARD_W_CEIL = 150;
const COUNT_LO = 4;
const COUNT_HI = 24;

const SCALE_MIN = 0.4;
const SCALE_MAX = 3;
const SCALE_STEP = 0.1;

const HISTORY_LIMIT = 50;
const DRAG_THRESHOLD_PCT = 0.5; // 매트 대비 % 단위 드래그 임계값

const el = {
  drawBtn: document.getElementById('draw-btn'),
  count: document.getElementById('count'),
  result: document.getElementById('result'),
  spreadToggle: document.getElementById('spread-toggle'),
  spreadEditor: document.getElementById('spread-editor'),
  spreadMat: document.getElementById('spread-mat'),
  resetSpread: document.getElementById('reset-spread'),
  toggleSpread: document.getElementById('toggle-spread'),
  selectionRect: null,
  // 퀵 액션 버튼
  qaMulti: document.getElementById('qa-multi'),
  qaAll: document.getElementById('qa-all'),
  qaClear: document.getElementById('qa-clear'),
  qaRotate: document.getElementById('qa-rotate'),
  qaFlip: document.getElementById('qa-flip'),
  qaResize: document.getElementById('qa-resize'),
  qaUndo: document.getElementById('qa-undo'),
  qaRedo: document.getElementById('qa-redo'),
};

let hasDrawn = false;
let positions = [];
let selectedIndices = new Set();
let resizeMode = false;
let multiSelectMode = false; // 퀵 액션 다중 선택 모드
let cardW = 56;
let cardH = cardW * CARD_RATIO;
let lastMatSize = { width: 800, height: 800 };

let history = [];
let future = [];

let selecting = null; // 선택 박스 드래그 상태

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
  return { x: clamp(x, mx, 100 - mx), y: clamp(y, my, 100 - my) };
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
  const max = getPool().length;
  const safe = clamp(Number.isNaN(value) ? 3 : value, MIN_COUNT, max);
  el.count.value = safe;
  return safe;
}

const getDirectionMode = () =>
  document.querySelector('input[name="direction"]:checked').value;

const getArcanaMode = () =>
  document.querySelector('input[name="arcana"]:checked').value;

function getPool() {
  const mode = getArcanaMode();
  if (mode === 'major') return CARDS.slice(0, MAJOR_COUNT);
  if (mode === 'minor') return CARDS.slice(MAJOR_COUNT);
  return CARDS;
}

const isSpreadMode = () => el.spreadToggle.checked;

/* ---------- Selection ---------- */

function clearSelection() {
  selectedIndices.clear();
  resizeMode = false;
  updateSelectionUI();
  updateToolbarState();
}

function selectOne(idx) {
  selectedIndices = new Set([idx]);
  resizeMode = false;
  updateSelectionUI();
  updateToolbarState();
}

function toggleSelect(idx) {
  if (selectedIndices.has(idx)) selectedIndices.delete(idx);
  else selectedIndices.add(idx);
  if (!selectedIndices.size) resizeMode = false;
  updateSelectionUI();
  updateToolbarState();
}

function updateSelectionUI() {
  el.spreadMat.querySelectorAll('.spread-marker').forEach((m, i) => {
    m.classList.toggle('selected', selectedIndices.has(i));
    m.classList.toggle('resize-mode', resizeMode && selectedIndices.has(i));
  });
}

function updateToolbarState() {
  const has = selectedIndices.size > 0;
  [el.qaClear, el.qaRotate, el.qaFlip, el.qaResize].forEach(b => {
    if (b) b.disabled = !has;
  });
  if (el.qaUndo) el.qaUndo.disabled = history.length === 0;
  if (el.qaRedo) el.qaRedo.disabled = future.length === 0;
  if (el.qaResize) el.qaResize.classList.toggle('active', resizeMode);
  if (el.qaMulti) el.qaMulti.classList.toggle('active', multiSelectMode);
}

function setMultiSelectMode(on) {
  multiSelectMode = on;
  el.spreadEditor.classList.toggle('multi-select', on);
  updateToolbarState();
}

/* ---------- Undo / Redo ---------- */

const snapshot = () => positions.map(p => ({ ...p }));

function pushHistory() {
  history.push(snapshot());
  if (history.length > HISTORY_LIMIT) history.shift();
  future = [];
  updateToolbarState();
}

function undo() {
  if (!history.length) return;
  future.push(snapshot());
  positions = history.pop();
  renderSpreadEditor();
  updateToolbarState();
}

function redo() {
  if (!future.length) return;
  history.push(snapshot());
  positions = future.pop();
  renderSpreadEditor();
  updateToolbarState();
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
    return { rotation: 0, scale: 1, ...existing };
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

  const markersHtml = positions
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

  el.spreadMat.innerHTML =
    `<div class="selection-rect" id="selection-rect" hidden></div>` + markersHtml;
  el.selectionRect = el.spreadMat.querySelector('#selection-rect');

  el.spreadMat.querySelectorAll('.spread-marker').forEach(attachMarker);
  selectedIndices.clear();
  resizeMode = false;
  updateToolbarState();
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

function updateMany(indices) {
  indices.forEach(i => updateMarker(i));
}

function attachMarker(marker) {
  const index = parseInt(marker.dataset.i, 10);
  if (Number.isNaN(index)) return;

  let drag = null;
  let resize = null;

  // ---- 위치 드래그 (그룹 이동) ----
  marker.addEventListener('pointerdown', e => {
    if (e.target.classList.contains('spread-marker__handle')) return;

    // 다중 선택 모드: 마커 클릭은 토글, 드래그 동작 없음
    if (multiSelectMode) {
      e.preventDefault();
      toggleSelect(index);
      return;
    }

    e.preventDefault();
    try { marker.setPointerCapture(e.pointerId); } catch (_) {}

    // 선택 갱신
    const mod = e.shiftKey || e.ctrlKey || e.metaKey;
    if (mod) {
      toggleSelect(index);
    } else if (!selectedIndices.has(index)) {
      selectOne(index);
    }

    if (!selectedIndices.has(index)) return;

    const matRect = el.spreadMat.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();

    // 선택된 모든 마커의 시작 위치 저장
    const startPositions = new Map();
    selectedIndices.forEach(i => {
      startPositions.set(i, { x: positions[i].x, y: positions[i].y });
    });

    drag = {
      offsetX: e.clientX - (markerRect.left + markerRect.width / 2),
      offsetY: e.clientY - (markerRect.top + markerRect.height / 2),
      matRect,
      before: snapshot(),
      moved: false,
      startPositions,
    };
    marker.classList.add('dragging');
  });

  marker.addEventListener('pointermove', e => {
    if (!drag) return;

    // 잡은 마커의 목표 위치 (raw)
    const rawX =
      ((e.clientX - drag.offsetX - drag.matRect.left) / drag.matRect.width) * 100;
    const rawY =
      ((e.clientY - drag.offsetY - drag.matRect.top) / drag.matRect.height) * 100;

    let targetX = rawX;
    let targetY = rawY;
    if (!e.altKey) {
      targetX = snapPercent(rawX, drag.matRect.width);
      targetY = snapPercent(rawY, drag.matRect.height);
    }

    const startPos = drag.startPositions.get(index);
    let dx = targetX - startPos.x;
    let dy = targetY - startPos.y;

    // 그룹 전체가 경계 안에 머무는 dx, dy로 제한 (모양 유지)
    selectedIndices.forEach(i => {
      const sp = drag.startPositions.get(i);
      if (!sp) return;
      const b = clampToBounds(
        sp.x + dx, sp.y + dy,
        drag.matRect.width, drag.matRect.height,
        positions[i]
      );
      const possibleDx = b.x - sp.x;
      const possibleDy = b.y - sp.y;
      if (Math.abs(possibleDx) < Math.abs(dx)) dx = possibleDx;
      if (Math.abs(possibleDy) < Math.abs(dy)) dy = possibleDy;
    });

    if (dx !== 0 || dy !== 0) drag.moved = true;

    // 적용
    selectedIndices.forEach(i => {
      const sp = drag.startPositions.get(i);
      if (!sp) return;
      positions[i].x = sp.x + dx;
      positions[i].y = sp.y + dy;
      updateMarker(i);
    });
  });

  const endDrag = e => {
    if (!drag) return;
    if (drag.moved) {
      history.push(drag.before);
      if (history.length > HISTORY_LIMIT) history.shift();
      future = [];
      updateToolbarState();
    }
    drag = null;
    marker.classList.remove('dragging');
    try { marker.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  marker.addEventListener('pointerup', endDrag);
  marker.addEventListener('pointercancel', endDrag);

  // ---- 크기 조정 핸들 (그룹 배율) ----
  const handle = marker.querySelector('.spread-marker__handle');
  if (!handle) return;

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}

    if (!selectedIndices.has(index)) selectOne(index);

    const rect = marker.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const startScales = new Map();
    selectedIndices.forEach(i => {
      startScales.set(i, positions[i].scale || 1);
    });

    resize = {
      cx, cy,
      startDist: Math.max(Math.hypot(e.clientX - cx, e.clientY - cy), 1),
      startScales,
    };
    pushHistory();
  });

  handle.addEventListener('pointermove', e => {
    if (!resize) return;
    const dist = Math.hypot(e.clientX - resize.cx, e.clientY - resize.cy);
    const ratio = dist / resize.startDist;
    selectedIndices.forEach(i => {
      const start = resize.startScales.get(i);
      if (start == null) return;
      const next = clamp(start * ratio, SCALE_MIN, SCALE_MAX);
      positions[i].scale = next;
      updateMarker(i);
    });
  });

  const endResize = e => {
    if (!resize) return;
    resize = null;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  handle.addEventListener('pointerup', endResize);
  handle.addEventListener('pointercancel', endResize);
}

/* ---------- 매트 빈 영역: 영역 선택 박스 ---------- */

el.spreadMat.addEventListener('pointerdown', e => {
  if (e.target.closest('.spread-marker')) return;
  if (!el.selectionRect) return;
  e.preventDefault();
  try { el.spreadMat.setPointerCapture(e.pointerId); } catch (_) {}

  const rect = el.spreadMat.getBoundingClientRect();
  const sx = ((e.clientX - rect.left) / rect.width) * 100;
  const sy = ((e.clientY - rect.top) / rect.height) * 100;

  selecting = {
    rect,
    sx, sy,
    initial: new Set(selectedIndices),
    shift: e.shiftKey,
    ctrl: e.ctrlKey || e.metaKey,
    moved: false,
  };
});

el.spreadMat.addEventListener('pointermove', e => {
  if (!selecting) return;
  const cx = ((e.clientX - selecting.rect.left) / selecting.rect.width) * 100;
  const cy = ((e.clientY - selecting.rect.top) / selecting.rect.height) * 100;

  if (!selecting.moved) {
    if (Math.abs(cx - selecting.sx) < DRAG_THRESHOLD_PCT &&
        Math.abs(cy - selecting.sy) < DRAG_THRESHOLD_PCT) return;
    selecting.moved = true;
    el.selectionRect.hidden = false;
  }

  const left = Math.min(selecting.sx, cx);
  const right = Math.max(selecting.sx, cx);
  const top = Math.min(selecting.sy, cy);
  const bottom = Math.max(selecting.sy, cy);

  el.selectionRect.style.left = left + '%';
  el.selectionRect.style.top = top + '%';
  el.selectionRect.style.width = (right - left) + '%';
  el.selectionRect.style.height = (bottom - top) + '%';

  // 박스 안 마커들 (중심점 포함 기준)
  const inBox = new Set();
  positions.forEach((p, i) => {
    if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) inBox.add(i);
  });

  if (selecting.shift) {
    selectedIndices = new Set([...selecting.initial, ...inBox]);
  } else if (selecting.ctrl) {
    const r = new Set(selecting.initial);
    inBox.forEach(i => { if (r.has(i)) r.delete(i); else r.add(i); });
    selectedIndices = r;
  } else {
    selectedIndices = inBox;
  }
  updateSelectionUI();
});

const endSelecting = e => {
  if (!selecting) return;
  if (!selecting.moved && !selecting.shift && !selecting.ctrl) {
    clearSelection();
  }
  if (el.selectionRect) el.selectionRect.hidden = true;
  selecting = null;
  try { el.spreadMat.releasePointerCapture(e.pointerId); } catch (_) {}
};
el.spreadMat.addEventListener('pointerup', endSelecting);
el.spreadMat.addEventListener('pointercancel', endSelecting);

/* ---------- Group keyboard ops ---------- */

function moveSelectedGroup(dxCells, dyCells) {
  const { width, height } = getMatSize();
  const dxPct = dxCells * ((GRID_PX / width) * 100);
  const dyPct = dyCells * ((GRID_PX / height) * 100);

  // 그룹 전체가 경계 안에 머무는 최대 이동량 계산
  let dx = dxPct, dy = dyPct;
  selectedIndices.forEach(i => {
    const p = positions[i];
    const target = clampToBounds(p.x + dx, p.y + dy, width, height, p);
    const possibleDx = target.x - p.x;
    const possibleDy = target.y - p.y;
    if (Math.abs(possibleDx) < Math.abs(dx)) dx = possibleDx;
    if (Math.abs(possibleDy) < Math.abs(dy)) dy = possibleDy;
  });

  selectedIndices.forEach(i => {
    const p = positions[i];
    // 스냅: 새 위치를 그리드에 다시 맞춤
    const sx = snapPercent(p.x + dx, width);
    const sy = snapPercent(p.y + dy, height);
    const b = clampToBounds(sx, sy, width, height, p);
    p.x = b.x;
    p.y = b.y;
  });
}

function rotateSelected() {
  selectedIndices.forEach(i => {
    positions[i].rotation = ((positions[i].rotation || 0) + 90) % 360;
  });
}

function toggleSelectedReversed() {
  selectedIndices.forEach(i => {
    positions[i].reversed = !positions[i].reversed;
  });
}

function scaleSelected(dir) {
  selectedIndices.forEach(i => {
    const s = (positions[i].scale || 1) + dir * SCALE_STEP;
    positions[i].scale = clamp(s, SCALE_MIN, SCALE_MAX);
  });
}

function setResizeMode(on) {
  resizeMode = on;
  updateSelectionUI();
  updateToolbarState();
}

/* ---------- Keyboard ---------- */

document.addEventListener('keydown', e => {
  if (!isSpreadMode()) return;
  if (el.spreadEditor.classList.contains('collapsed')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

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

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 't') {
    e.preventDefault();
    if (selectedIndices.size) setResizeMode(!resizeMode);
    return;
  }

  if (selectedIndices.size === 0) return;
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
      const dir = (e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1 : -1;
      scaleSelected(dir);
    } else {
      const cells = e.shiftKey ? 2 : 1;
      if (e.key === 'ArrowLeft') moveSelectedGroup(-cells, 0);
      else if (e.key === 'ArrowRight') moveSelectedGroup(cells, 0);
      else if (e.key === 'ArrowUp') moveSelectedGroup(0, -cells);
      else moveSelectedGroup(0, cells);
    }
    handled = true;
  } else if (e.key === 'r' || e.key === 'R') {
    pushHistory();
    rotateSelected();
    handled = true;
  } else if (e.key === 't' || e.key === 'T') {
    pushHistory();
    toggleSelectedReversed();
    handled = true;
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    // Ctrl+A: 전체 선택
    e.preventDefault();
    selectedIndices = new Set(positions.map((_, i) => i));
    updateSelectionUI();
    return;
  }

  if (handled) {
    e.preventDefault();
    updateMany(selectedIndices);
  }
});

/* ---------- Collapse ---------- */

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

  const drawn = shuffle(getPool())
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
         <span class="card__arcana card__arcana--${card.arcana}">
           ${card.arcana === 'major' ? '메이저' : '마이너'}
         </span>
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

document.querySelectorAll('input[name="arcana"]').forEach(radio => {
  radio.addEventListener('change', () => {
    getCount(); // 풀 변경에 따라 카드 수 클램프
    if (isSpreadMode()) {
      history = []; future = [];
      renderSpreadEditor();
    }
  });
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

/* ---- Quick Action Toolbar ---- */

el.qaMulti.addEventListener('click', () => setMultiSelectMode(!multiSelectMode));

el.qaAll.addEventListener('click', () => {
  selectedIndices = new Set(positions.map((_, i) => i));
  updateSelectionUI();
  updateToolbarState();
});

el.qaClear.addEventListener('click', () => {
  clearSelection();
});

el.qaRotate.addEventListener('click', () => {
  if (!selectedIndices.size) return;
  pushHistory();
  rotateSelected();
  updateMany(selectedIndices);
});

el.qaFlip.addEventListener('click', () => {
  if (!selectedIndices.size) return;
  pushHistory();
  toggleSelectedReversed();
  updateMany(selectedIndices);
});

el.qaResize.addEventListener('click', () => {
  if (!selectedIndices.size) return;
  setResizeMode(!resizeMode);
});

el.qaUndo.addEventListener('click', undo);
el.qaRedo.addEventListener('click', redo);

// 초기 툴바 상태
updateToolbarState();

// 매트 바깥 클릭 시 선택 해제
document.addEventListener('pointerdown', e => {
  if (!isSpreadMode()) return;
  if (!selectedIndices.size) return;
  if (e.target.closest('.spread-marker')) return;
  if (e.target.closest('#spread-mat')) return; // 매트 안은 자체 핸들러가 처리
  clearSelection();
});

let resizeTimer;
window.addEventListener('resize', () => {
  if (!isSpreadMode()) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyCardSize, 150);
});
