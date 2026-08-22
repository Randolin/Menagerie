// Chart components for the compare view. Hand-built HTML/SVG, no libraries.
//
// Encoding rules (see the dataviz method): person identity is categorical
// (slots --series-1..4, fixed order, never cycled); interest magnitude is a
// single-hue ordinal ramp; similarity is the same sequential hue. Every chart
// has a text twin — the answer grid renders every value as plain text, so no
// value is reachable only by color or hover.

import { el } from './ui.js';
import { interestLabel } from './schema.js';

export const MAX_COMPARE = 4;

export function seriesVar(i) {
  return `var(--series-${(i % MAX_COMPARE) + 1})`;
}

// Legend: always present for 2+ people.
export function personKey(names) {
  return el('div', { class: 'person-key', role: 'list' },
    names.map((name, i) => el('span', { class: 'person-chip', role: 'listitem' },
      el('span', { class: 'person-dot', style: `background:${seriesVar(i)}` }),
      el('span', { class: 'person-name', text: name }),
    )),
  );
}

// Dot strip for a bipolar 0–6 scale: one shared axis, a dot per person.
// Dots that land on the same value stack vertically with surface rings.
export function scaleStrip(item, answers, names) {
  const track = el('div', { class: 'strip-track' });
  const byValue = new Map();
  answers.forEach((v, i) => {
    if (v === null || v === undefined) return;
    if (!byValue.has(v)) byValue.set(v, []);
    byValue.get(v).push(i);
  });
  for (const [value, people] of byValue) {
    people.forEach((personIdx, stackIdx) => {
      const offset = (stackIdx - (people.length - 1) / 2) * 10;
      track.append(el('span', {
        class: 'strip-dot',
        style: `left:${(value / 6) * 100}%;background:${seriesVar(personIdx)};transform:translate(-50%,calc(-50% + ${offset}px))`,
        title: `${names[personIdx]}: ${value}/6`,
      }));
    });
  }
  const answered = answers.filter((v) => v !== null && v !== undefined);
  let gapNote = null;
  if (answered.length >= 2) {
    const gap = Math.max(...answered) - Math.min(...answered);
    if (gap <= 1) gapNote = el('span', { class: 'badge badge-close', text: 'in sync' });
    else if (gap >= 4) gapNote = el('span', { class: 'badge badge-gap', text: 'big gap' });
  }
  return el('div', { class: 'strip-row' },
    el('div', { class: 'strip-anchors' },
      el('span', { class: 'anchor', text: item.left }),
      gapNote,
      el('span', { class: 'anchor anchor-right', text: item.right }),
    ),
    track,
  );
}

// Ordinal ramp for interest levels 0–3 (single blue hue, light→dark;
// level 0 stays a neutral outline so "not for me" reads as absence of heat).
const INTEREST_RAMP = ['var(--ramp-0)', 'var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)'];

export function interestCell(level, name) {
  if (level === null || level === undefined) {
    return el('td', { class: 'cell cell-empty', title: `${name}: not answered` }, '—');
  }
  return el('td', { class: 'cell', title: `${name}: ${interestLabel(level)}` },
    el('span', {
      class: `interest-pip lvl-${level}`,
      style: level > 0 ? `background:${INTEREST_RAMP[level]}` : '',
    }),
    el('span', { class: 'cell-label', text: interestLabel(level) }),
  );
}

// Matrix of interest items × people, with mutual-interest badges.
export function interestMatrix(rows, names) {
  const table = el('table', { class: 'matrix' },
    el('thead', {},
      el('tr', {},
        el('th', { class: 'matrix-item-head', scope: 'col', text: '' }),
        names.map((n, i) => el('th', { scope: 'col' },
          el('span', { class: 'person-dot', style: `background:${seriesVar(i)}` }),
          el('span', { text: ' ' + n }),
        )),
        names.length >= 2 ? el('th', { scope: 'col', class: 'matrix-mutual-head', text: '' }) : null,
      ),
    ),
  );
  const tbody = el('tbody');
  for (const { item, answers } of rows) {
    const answered = answers.filter((v) => v !== null && v !== undefined);
    let mutual = null;
    if (names.length >= 2 && answered.length >= 2) {
      const min = Math.min(...answered);
      if (min >= 2) mutual = el('span', { class: 'badge badge-mutual', text: 'mutual ✦' });
      else if (min >= 1) mutual = el('span', { class: 'badge badge-open', text: 'possible' });
    }
    const tr = el('tr', { class: mutual && mutual.className.includes('mutual') ? 'row-mutual' : '' },
      el('th', { scope: 'row', class: 'matrix-item', text: item.label }),
      answers.map((lvl, i) => interestCell(lvl, names[i])),
      names.length >= 2 ? el('td', { class: 'matrix-mutual' }, mutual) : null,
    );
    tbody.append(tr);
  }
  table.append(tbody);
  return el('div', { class: 'matrix-wrap' }, table);
}

// Similarity meter: sequential fill on a lighter same-ramp track.
export function meter(score, label) {
  const pct = Math.round(score * 100);
  return el('div', { class: 'meter-row' },
    el('span', { class: 'meter-label', text: label }),
    el('div', { class: 'meter-track', role: 'img', 'aria-label': `${label}: ${pct}% aligned` },
      el('div', { class: 'meter-fill', style: `width:${pct}%` }),
    ),
    el('span', { class: 'meter-value', text: `${pct}%` }),
  );
}

export function statTile(label, value, sub) {
  return el('div', { class: 'stat-tile' },
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: 'stat-value', text: value }),
    sub ? el('div', { class: 'stat-sub', text: sub }) : null,
  );
}

// Small similarity indicator used on grid rows (color + title, value in text nearby).
export function simDot(sim) {
  if (sim === null) return el('span', { class: 'sim-dot sim-none', title: 'Not comparable' });
  const bucket = sim >= 0.85 ? 3 : sim >= 0.55 ? 2 : sim >= 0.3 ? 1 : 0;
  return el('span', {
    class: `sim-dot sim-${bucket}`,
    title: `${Math.round(sim * 100)}% similar`,
  });
}

// Render any open answer as readable text chips.
export function answerText(item, value) {
  if (value === null || value === undefined || value === '') {
    return el('span', { class: 'answer-empty', text: '—' });
  }
  switch (item.type) {
    case 'choice':
      return el('span', { class: 'answer-chip', text: item.options[value] ?? '?' });
    case 'multi':
      return el('span', { class: 'answer-chips' },
        (Array.isArray(value) ? value : []).map((idx) =>
          el('span', { class: 'answer-chip', text: item.options[idx] ?? '?' })));
    case 'scale':
      return el('span', { class: 'answer-chip', text: `${value}/6` });
    case 'interest':
      return el('span', { class: 'answer-chip', text: interestLabel(value) });
    default:
      return el('span', { class: 'answer-freetext', text: String(value) });
  }
}

// Pairwise overall-affinity table for 3+ people.
export function pairMatrixTable(names, getScore) {
  const table = el('table', { class: 'matrix pair-matrix' },
    el('thead', {}, el('tr', {},
      el('th', { text: '' }),
      names.map((n, i) => el('th', { scope: 'col' },
        el('span', { class: 'person-dot', style: `background:${seriesVar(i)}` }), ' ', n)),
    )),
  );
  const tbody = el('tbody');
  names.forEach((rowName, i) => {
    const tr = el('tr', {},
      el('th', { scope: 'row' },
        el('span', { class: 'person-dot', style: `background:${seriesVar(i)}` }), ' ', rowName));
    names.forEach((_, j) => {
      if (i === j) { tr.append(el('td', { class: 'cell cell-self', text: '·' })); return; }
      const s = getScore(i, j);
      tr.append(el('td', { class: 'cell' },
        s === null ? '—' : `${Math.round(s * 100)}%`));
    });
    tbody.append(tr);
  });
  table.append(tbody);
  return el('div', { class: 'matrix-wrap' }, table);
}
