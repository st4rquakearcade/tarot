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
};

let hasDrawn = false;

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

/* ---------- Drawing ---------- */

function drawCards() {
  const count = getCount();
  const allowReversed = getDirectionMode() === 'both';

  const drawn = shuffle(CARDS)
    .slice(0, count)
    .map(card => ({
      card,
      isReversed: allowReversed && Math.random() < 0.5,
    }));

  render(drawn);

  if (!hasDrawn) {
    el.drawBtn.textContent = '다시 뽑기';
    hasDrawn = true;
  }
}

/* ---------- Rendering ---------- */

function render(drawn) {
  el.result.innerHTML = drawn.map(toCardHtml).join('');
}

function toCardHtml({ card, isReversed }, index) {
  const keywords = isReversed ? card.reversed : card.upright;
  const directionText = isReversed ? '역방향' : '정방향';
  const imgClass = `card__image${isReversed ? ' card__image--reversed' : ''}`;
  const dirClass = `card__direction${isReversed ? ' card__direction--reversed' : ''}`;

  const keywordHtml = keywords
    .map((kw, i) => `<span class="card__keyword" style="--i:${i}">${kw}</span>`)
    .join('');

  return `
    <article class="card" style="animation-delay:${index * 0.06}s">
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
el.count.addEventListener('change', getCount);
el.count.addEventListener('input', () => {
  const v = parseInt(el.count.value, 10);
  if (!Number.isNaN(v) && v > MAX_COUNT) el.count.value = MAX_COUNT;
});
