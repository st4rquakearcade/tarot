/**
 * Tarot — App Logic
 */

import { CARDS } from './cards.js';

const MIN_COUNT = 1;
const MAX_COUNT = CARDS.length; // 78 — 덱 크기가 자연 상한
const GRID_PX = 36; // 그리드 한 칸 크기 (정사각형, px)

// 카드 크기 범위 (px) — 장수에 따라 이 사이에서 유동 조정
const CARD_W_MAX = 56;
const CARD_W_MIN = 28;
const COUNT_LO = 4; // 이하면 최대 크기
const COUNT_HI = 24; // 이상이면 최소 크기
const CARD_RATIO = 1.7; // 세로 / 가로

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
let positions = []; // [{x, y, reversed?}] — 퍼센트 좌표
let selectedIndex = -1; // 현재 선택된 마커 인덱스
let cardW = CARD_W_MAX; // 현재 카드 너비 (px)
let cardH = cardW * CARD_RATIO;

/* ---------- Helpers ---------- */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function getMatSize() {
  const rect = el.spreadMat.getBoundingClientRect();
  return {
    width: rect.width || el.spreadMat.offsetWidth || 800,
    height: rect.height || el.spreadMat.offsetHeight || 800,
  };
}

// 카드 수 + 매트 너비에 따라 카드 크기를 정하고 CSS 변수로 반영
function applyCardSize() {
  const count = getCount();
  const { width } = getMatSize();

  const t = clamp((count - COUNT_LO) / (COUNT_HI - COUNT_LO), 0, 1);
  let w = CARD_W_MAX - t * (CARD_W_MAX - CARD_W_MIN);
  w = clamp(Math.min(w, width / 6), CARD_W_MIN, CARD_W_MAX);

  cardW = w;
  cardH = w * CARD_RATIO;

  // 작은 카드일수록 호버 확대 배율을 키워 가독성 확보
  const hoverScale = clamp(130 / cardW, 1.5, 4.5);

  [el.spreadMat, el.result].forEach(node => {
    node.style.setProperty('--card-w', cardW + 'px');
    node.style.setProperty('--hover-scale', hoverScale.toFixed(2));
  });
}

// 카드가 매트 밖으로 나가지 않도록 좌표 제한 (이미지 박스 기준, 대칭)
function clampToBounds(x, y, width, height) {
  const mx = (cardW / 2 / width) * 100;
  const my = (cardH / 2 / height) * 100;
  return {
    x: clamp(x, mx, 100 - mx),
    y: clamp(y, my, 100 - my),
  };
}

// percent 값을 매트 크기 기준 GRID_PX 단위에 스냅한 후 다시 percent로 변환
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

/* ---------- Spread Editor ---------- */

function defaultPositions(count) {
  const { width, height } = getMatSize();
  return Array.from({ length: count }, (_, i) => {
    const rawX = (100 / (count + 1)) * (i + 1);
    return clampToBounds(rawX, 50, width, height);
  });
}

function syncPositions(count) {
  const defaults = defaultPositions(count);
  positions = Array.from({ length: count }, (_, i) => positions[i] || defaults[i]);
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
          style="left:${pos.x}%; top:${pos.y}%"
          tabindex="0"
        >
          <span class="spread-marker__num">${i + 1}</span>
          <span class="spread-marker__dir" aria-hidden="true">↻</span>
        </div>
      `
    )
    .join('');

  el.spreadMat.querySelectorAll('.spread-marker').forEach(attachDrag);
  selectedIndex = -1;
}

function selectMarker(idx) {
  selectedIndex = idx;
  el.spreadMat.querySelectorAll('.spread-marker').forEach((m, i) => {
    m.classList.toggle('selected', i === idx);
  });
}

function updateMarker(idx) {
  const marker = el.spreadMat.querySelector(`.spread-marker[data-i="${idx}"]`);
  if (!marker) return;
  const pos = positions[idx];
  marker.style.left = pos.x + '%';
  marker.style.top = pos.y + '%';
  marker.classList.toggle('reversed', !!pos.reversed);
}

function attachDrag(marker) {
  const index = parseInt(marker.dataset.i, 10);
  let drag = null;

  marker.addEventListener('pointerdown', e => {
    e.preventDefault();
    marker.setPointerCapture(e.pointerId);
    selectMarker(index);

    const matRect = el.spreadMat.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    drag = {
      offsetX: e.clientX - (markerRect.left + markerRect.width / 2),
      offsetY: e.clientY - (markerRect.top + markerRect.height / 2),
      matRect,
    };
    marker.classList.add('dragging');
  });

  // 드래그는 스냅 없이 자유 배치 (경계만 제한)
  marker.addEventListener('pointermove', e => {
    if (!drag) return;
    const rawX =
      ((e.clientX - drag.offsetX - drag.matRect.left) / drag.matRect.width) * 100;
    const rawY =
      ((e.clientY - drag.offsetY - drag.matRect.top) / drag.matRect.height) * 100;
    const { x, y } = clampToBounds(rawX, rawY, drag.matRect.width, drag.matRect.height);
    positions[index] = { ...positions[index], x, y };
    marker.style.left = x + '%';
    marker.style.top = y + '%';
  });

  const endDrag = e => {
    if (!drag) return;
    drag = null;
    marker.classList.remove('dragging');
    try {
      marker.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  marker.addEventListener('pointerup', endDrag);
  marker.addEventListener('pointercancel', endDrag);
}

// 키보드 이동: 그리드에 스냅 + 경계 제한
function moveSelected(dxCells, dyCells) {
  const { width, height } = getMatSize();
  const pos = positions[selectedIndex];
  let nx = pos.x;
  let ny = pos.y;

  if (dxCells) nx = snapPercent(pos.x + dxCells * ((GRID_PX / width) * 100), width);
  if (dyCells) ny = snapPercent(pos.y + dyCells * ((GRID_PX / height) * 100), height);

  const bounded = clampToBounds(nx, ny, width, height);
  pos.x = bounded.x;
  pos.y = bounded.y;
}

/* ---------- Keyboard Shortcuts (Spread Mode) ---------- */

document.addEventListener('keydown', e => {
  if (!isSpreadMode() || selectedIndex < 0) return;
  if (el.spreadEditor.classList.contains('collapsed')) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  const pos = positions[selectedIndex];
  if (!pos) return;

  const cells = e.shiftKey ? 2 : 1; // 기본 1칸, Shift는 2칸
  let handled = false;

  switch (e.key) {
    case 'ArrowLeft':
      moveSelected(-cells, 0);
      handled = true;
      break;
    case 'ArrowRight':
      moveSelected(cells, 0);
      handled = true;
      break;
    case 'ArrowUp':
      moveSelected(0, -cells);
      handled = true;
      break;
    case 'ArrowDown':
      moveSelected(0, cells);
      handled = true;
      break;
    case 't':
    case 'T':
      // Ctrl+T(브라우저 새 탭)도 막아본다 — 브라우저 정책에 따라 불가할 수 있음
      pos.reversed = !pos.reversed;
      handled = true;
      break;
  }

  if (handled) {
    e.preventDefault();
    updateMarker(selectedIndex);
  }
});

/* ---------- Collapse Toggle ---------- */

function setCollapsed(collapsed) {
  el.spreadEditor.classList.toggle('collapsed', collapsed);
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
      // 마커에 명시적 reversed=true가 있으면 무조건 역방향
      // 그 외엔 양방향 모드면 랜덤, 정방향 모드면 정방향
      const isReversed =
        pos && pos.reversed === true
          ? true
          : allowReversed && Math.random() < 0.5;

      return { card, isReversed, position: pos };
    });

  render(drawn, spread);

  // 카드를 뽑으면 편집기를 접는다
  if (spread) setCollapsed(true);

  if (!hasDrawn) {
    el.drawBtn.textContent = '다시 뽑기';
    hasDrawn = true;
  }
}

function render(drawn, spread) {
  el.result.className = spread ? 'result result--spread' : 'result';
  el.result.innerHTML = drawn.map(toCardHtml).join('');
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

  // 스프레드 모드: 이름(한글)/방향을 이미지 위에 항상 표시, 호버 시 키워드만
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

  const posStyle = position ? `left:${position.x}%; top:${position.y}%; ` : '';
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
  if (isSpreadMode()) renderSpreadEditor();
});

el.spreadToggle.addEventListener('change', () => {
  el.spreadEditor.hidden = !isSpreadMode();
  if (isSpreadMode()) {
    setCollapsed(false);
    renderSpreadEditor();
  }
});

el.resetSpread.addEventListener('click', () => {
  positions = defaultPositions(getCount());
  renderSpreadEditor();
});

el.toggleSpread.addEventListener('click', () => {
  const willExpand = el.spreadEditor.classList.contains('collapsed');
  setCollapsed(!willExpand);
  if (willExpand) renderSpreadEditor(); // 펼칠 때 정확한 위치로 다시 그림
});

// 매트 바깥 클릭 시 마커 선택 해제
document.addEventListener('pointerdown', e => {
  if (!isSpreadMode() || selectedIndex < 0) return;
  if (e.target.closest('.spread-marker')) return;
  selectedIndex = -1;
  el.spreadMat
    .querySelectorAll('.spread-marker.selected')
    .forEach(m => m.classList.remove('selected'));
});

// 창 크기 변경 시 카드 크기 재계산
let resizeTimer;
window.addEventListener('resize', () => {
  if (!isSpreadMode()) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyCardSize, 150);
});
