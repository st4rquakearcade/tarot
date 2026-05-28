/**
 * Tarot — App Logic
 */

import { CARDS } from './cards.js';

const MIN_COUNT = 1;
const MAX_COUNT = CARDS.length; // 78 — 덱 크기가 자연 상한
const SNAP = 5; // 그리드 스냅 단위 (%)

const el = {
  drawBtn: document.getElementById('draw-btn'),
  count: document.getElementById('count'),
  result: document.getElementById('result'),
  spreadToggle: document.getElementById('spread-toggle'),
  spreadEditor: document.getElementById('spread-editor'),
  spreadMat: document.getElementById('spread-mat'),
  resetSpread: document.getElementById('reset-spread'),
};

let hasDrawn = false;
let positions = []; // [{x, y, reversed?}] — 퍼센트 좌표
let selectedIndex = -1; // 현재 선택된 마커 인덱스

/* ---------- Helpers ---------- */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const snap = v => Math.round(v / SNAP) * SNAP;

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
  return Array.from({ length: count }, (_, i) => ({
    x: snap((100 / (count + 1)) * (i + 1)),
    y: 50,
  }));
}

function syncPositions(count) {
  const defaults = defaultPositions(count);
  positions = Array.from({ length: count }, (_, i) => positions[i] || defaults[i]);
}

function renderSpreadEditor() {
  const count = getCount();
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

  marker.addEventListener('pointermove', e => {
    if (!drag) return;
    const rawX =
      ((e.clientX - drag.offsetX - drag.matRect.left) / drag.matRect.width) * 100;
    const rawY =
      ((e.clientY - drag.offsetY - drag.matRect.top) / drag.matRect.height) * 100;
    const x = clamp(snap(rawX), 0, 100);
    const y = clamp(snap(rawY), 0, 100);
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

/* ---------- Keyboard Shortcuts (Spread Mode) ---------- */

document.addEventListener('keydown', e => {
  // 스프레드 모드가 아니거나 선택된 마커가 없으면 무시
  if (!isSpreadMode() || selectedIndex < 0) return;
  // 입력 필드 포커스 중에는 무시
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  const pos = positions[selectedIndex];
  if (!pos) return;

  const step = e.shiftKey ? SNAP * 2 : SNAP; // 기본 1칸, Shift는 2칸
  let handled = false;

  switch (e.key) {
    case 'ArrowLeft':
      pos.x = clamp(pos.x - step, 0, 100);
      handled = true;
      break;
    case 'ArrowRight':
      pos.x = clamp(pos.x + step, 0, 100);
      handled = true;
      break;
    case 'ArrowUp':
      pos.y = clamp(pos.y - step, 0, 100);
      handled = true;
      break;
    case 'ArrowDown':
      pos.y = clamp(pos.y + step, 0, 100);
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

/* ---------- Drawing & Rendering ---------- */

function drawCards() {
  const count = getCount();
  const allowReversed = getDirectionMode() === 'both';
  const spread = isSpreadMode();

  if (spread) syncPositions(count);

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
  const keywords = isReversed ? card.reversed : card.upright;
  const directionText = isReversed ? '역방향' : '정방향';
  const imgClass = `card__image${isReversed ? ' card__image--reversed' : ''}`;
  const dirClass = `card__direction${isReversed ? ' card__direction--reversed' : ''}`;

  const keywordHtml = keywords
    .map((kw, i) => `<span class="card__keyword" style="--i:${i}">${kw}</span>`)
    .join('');

  const posStyle = position ? `left:${position.x}%; top:${position.y}%; ` : '';
  const style = `${posStyle}animation-delay:${index * 0.06}s`;

  return `
    <article class="card" style="${style}">
      <div class="card__image-wrap" tabindex="0">
        <img src="${card.image}" alt="${card.name}" class="${imgClass}" loading="lazy" />
        <div class="card__meaning" aria-hidden="true">
          ${keywordHtml}
        </div>
      </div>
      <div class="card__info">
        <div class="card__name">${card.name}</div>
        <div class="${dirClass}">${directionText}</div>
      </div>
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
  if (isSpreadMode()) renderSpreadEditor();
});

el.resetSpread.addEventListener('click', () => {
  positions = defaultPositions(getCount());
  renderSpreadEditor();
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
