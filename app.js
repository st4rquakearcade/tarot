/**
 * Tarot — App Logic
 */

import { CARDS } from './cards.js';

const MIN_COUNT = 1;
const MAX_COUNT = 10;

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
let positions = []; // [{x, y}] in percent — persistent across draws

/* ---------- Helpers ---------- */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

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
  // Evenly spaced horizontal row, centered vertically
  return Array.from({ length: count }, (_, i) => ({
    x: (100 / (count + 1)) * (i + 1),
    y: 50,
  }));
}

function syncPositions(count) {
  // Preserve existing positions, fill new ones with defaults
  const defaults = defaultPositions(count);
  positions = Array.from({ length: count }, (_, i) => positions[i] || defaults[i]);
}

function renderSpreadEditor() {
  const count = getCount();
  syncPositions(count);

  el.spreadMat.innerHTML = positions
    .map(
      (pos, i) => `
        <div class="spread-marker" data-i="${i}" style="left:${pos.x}%; top:${pos.y}%">
          ${i + 1}
        </div>
      `
    )
    .join('');

  el.spreadMat.querySelectorAll('.spread-marker').forEach(attachDrag);
}

function attachDrag(marker) {
  const index = parseInt(marker.dataset.i, 10);
  let drag = null;

  marker.addEventListener('pointerdown', e => {
    e.preventDefault();
    marker.setPointerCapture(e.pointerId);

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
    const x = clamp(
      ((e.clientX - drag.offsetX - drag.matRect.left) / drag.matRect.width) * 100,
      0,
      100
    );
    const y = clamp(
      ((e.clientY - drag.offsetY - drag.matRect.top) / drag.matRect.height) * 100,
      0,
      100
    );
    positions[index] = { x, y };
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

/* ---------- Drawing & Rendering ---------- */

function drawCards() {
  const count = getCount();
  const allowReversed = getDirectionMode() === 'both';
  const spread = isSpreadMode();

  if (spread) syncPositions(count);

  const drawn = shuffle(CARDS)
    .slice(0, count)
    .map((card, i) => ({
      card,
      isReversed: allowReversed && Math.random() < 0.5,
      position: spread ? positions[i] : null,
    }));

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
