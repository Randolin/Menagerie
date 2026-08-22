// Compare view: 2–4 profiles side by side — alignment scores, value dot
// strips, the seeking matrix, the full answer grid, and mutual-only desires.

import { el, toast, copyText } from '../ui.js';
import { decodePayload, extractPayloadString, encodePayload, buildSharePayload, shareUrlFor } from '../codec.js';
import { buildMatchTokens, randomSalt } from '../crypto.js';
import { SECTIONS } from '../schema.js';
import * as match from '../match.js';
import * as charts from '../charts.js';
import { loadDraft } from '../vault.js';
import * as vault from '../vault.js';

export async function render(main, ctx) {
  if (ctx.params.codes?.length) {
    for (const c of ctx.params.codes) {
      if (!ctx.state.compareCodes.includes(c)) ctx.state.compareCodes.push(c);
    }
    ctx.state.compareCodes = ctx.state.compareCodes.slice(0, charts.MAX_COMPARE);
    history.replaceState(null, '', '#/compare');
  }
  await draw(main, ctx);
}

async function decodeAll(codes) {
  const out = [];
  for (const code of codes) {
    try {
      out.push({ code, payload: await decodePayload(code) });
    } catch (err) {
      out.push({ code, error: err.message });
    }
  }
  return out;
}

async function draw(main, ctx) {
  main.replaceChildren();
  const decoded = await decodeAll(ctx.state.compareCodes);
  const good = decoded.filter((d) => d.payload);
  const names = good.map((d, i) => match.displayName(d.payload, `Person ${'ABCD'[i]}`));

  main.append(el('h1', {}, 'Compare profiles'));
  main.append(buildSlotsCard(main, ctx, decoded, names));

  if (good.length >= 2) {
    const payloads = good.map((d) => d.payload);
    await buildResults(main, payloads, names, ctx);
  } else {
    main.append(el('div', { class: 'card' },
      el('p', { class: 'sub' },
        'Add at least two profiles to see the comparison. Add your own from the survey, paste ',
        'links you’ve been sent, or pull saved connections from your vault.'),
    ));
  }
}

function buildSlotsCard(main, ctx, decoded, names) {
  const card = el('div', { class: 'card' });
  const slotList = el('div', { class: 'slot-list' });
  let goodIdx = 0;
  decoded.forEach((d, i) => {
    const label = d.payload ? names[goodIdx++] : 'Unreadable profile';
    slotList.append(el('div', { class: 'slot' },
      el('span', { class: 'person-dot', style: d.payload ? `background:${charts.seriesVar(goodIdx - 1)}` : 'background:var(--baseline)' }),
      el('span', { class: 'person-name', text: label }),
      d.error ? el('span', { class: 'fine', text: d.error }) : null,
      el('span', { class: 'slot-meta', text: `${d.code.length} chars` }),
      el('button', {
        class: 'btn btn-ghost btn-small', 'aria-label': `Remove ${label}`,
        onclick: () => { ctx.state.compareCodes.splice(i, 1); draw(main, ctx); },
      }, '✕'),
    ));
  });
  card.append(slotList);

  const full = ctx.state.compareCodes.length >= charts.MAX_COMPARE;
  const pasteInput = el('input', { type: 'text', placeholder: 'Paste a profile link or code…', 'aria-label': 'Paste a profile link' });
  const pasteForm = el('form', {
    style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:14px',
    onsubmit: (e) => {
      e.preventDefault();
      try {
        const code = extractPayloadString(pasteInput.value);
        if (ctx.state.compareCodes.includes(code)) { toast('That profile is already here'); return; }
        ctx.state.compareCodes.push(code);
        pasteInput.value = '';
        draw(main, ctx);
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  },
    el('div', { style: 'flex:1;min-width:220px' }, pasteInput),
    el('button', { class: 'btn', disabled: full }, 'Add'),
  );
  card.append(pasteForm);

  const extras = el('div', { class: 'btn-row', style: 'margin-top:12px' });
  const mine = ctx.state.answers || loadDraft();
  if (mine && Object.keys(mine).length && !full) {
    extras.append(el('button', {
      class: 'btn btn-small',
      onclick: async () => {
        const salt = randomSalt();
        const tokens = await buildMatchTokens(mine, salt);
        const code = await encodePayload(buildSharePayload(mine, tokens, salt));
        if (!ctx.state.compareCodes.includes(code)) ctx.state.compareCodes.push(code);
        draw(main, ctx);
      },
    }, '＋ My current profile'));
  }
  const session = vault.currentSession();
  if (session && !full) {
    for (const p of session.data.profiles) {
      extras.append(el('button', {
        class: 'btn btn-small',
        onclick: async () => {
          const salt = randomSalt();
          const tokens = await buildMatchTokens(p.answers, salt);
          const code = await encodePayload(buildSharePayload(p.answers, tokens, salt));
          if (!ctx.state.compareCodes.includes(code)) ctx.state.compareCodes.push(code);
          draw(main, ctx);
        },
      }, `＋ ${p.label} (vault)`));
    }
    for (const c of session.data.connections) {
      extras.append(el('button', {
        class: 'btn btn-small',
        onclick: () => {
          try {
            const code = extractPayloadString(c.code);
            if (!ctx.state.compareCodes.includes(code)) ctx.state.compareCodes.push(code);
            draw(main, ctx);
          } catch (err) { toast(err.message, 'error'); }
        },
      }, `＋ ${c.label} (saved)`));
    }
  }
  if (extras.children.length) card.append(extras);

  if (ctx.state.compareCodes.length >= 2) {
    card.append(el('div', { class: 'btn-row', style: 'margin-top:12px' },
      el('button', {
        class: 'btn btn-ghost btn-small',
        onclick: async () => {
          const url = shareUrlFor(ctx.state.compareCodes.join('~')).replace('#p=', '#c=');
          toast(await copyText(url) ? 'Compare link copied' : 'Copy failed');
        },
      }, '🔗 Copy a link to this comparison'),
      el('button', {
        class: 'btn btn-ghost btn-small',
        onclick: () => { ctx.state.compareCodes = []; draw(main, ctx); },
      }, 'Clear all'),
    ));
  }
  return card;
}

async function buildResults(main, payloads, names, ctx) {
  const grid = match.buildGrid(payloads);
  const isPair = payloads.length === 2;

  // --- headline stats -----------------------------------------------------
  const statRow = el('div', { class: 'stat-row' });
  let pair = null;
  if (isPair) {
    pair = match.pairScores(payloads[0], payloads[1]);
    if (pair.overall !== null) {
      statRow.append(charts.statTile('Overall alignment', `${Math.round(pair.overall * 100)}%`,
        'weighted across answered sections'));
    }
  }
  const seekingGrid = grid.find((g) => g.section.id === 'seeking');
  let mutualSeeking = 0;
  if (seekingGrid) {
    for (const row of seekingGrid.rows) {
      const answered = row.answers.filter((v) => v !== null);
      if (answered.length >= 2 && Math.min(...answered) >= 2) mutualSeeking++;
    }
  }
  statRow.append(charts.statTile('Mutual connection types', String(mutualSeeking),
    'both “Curious” or “Into it”'));

  const withTokens = payloads.filter(match.hasDesiresTokens);
  let desireRows = [];
  if (withTokens.length >= 2) {
    desireRows = await match.revealMutualDesires(payloads);
    statRow.append(charts.statTile('Mutual desires', String(desireRows.length), 'revealed because both said yes'));
  }

  const results = el('div', {});
  results.append(el('div', { class: 'card' },
    el('h2', {}, 'The headline'),
    charts.personKey(names),
    statRow,
    isPair && pair && Object.keys(pair.sections).length
      ? el('div', { style: 'margin-top:14px' },
          SECTIONS.filter((s) => pair.sections[s.id] && s.privacy === 'open')
            .map((s) => charts.meter(pair.sections[s.id].score, s.title)))
      : null,
    !isPair ? el('div', { style: 'margin-top:14px' },
        el('h3', {}, 'Pairwise alignment'),
        charts.pairMatrixTable(names, (i, j) => {
          const s = match.pairScores(payloads[i], payloads[j]);
          return s.overall;
        })) : null,
  ));

  // --- values dot strips --------------------------------------------------
  const valuesGrid = grid.find((g) => g.section.id === 'values');
  if (valuesGrid && valuesGrid.rows.some((r) => r.answeredCount > 0)) {
    results.append(el('div', { class: 'card' },
      el('h2', {}, 'Values, side by side'),
      el('p', { class: 'sub' }, 'Each dot is a person. Distance between dots is the actual gap.'),
      charts.personKey(names),
      valuesGrid.rows
        .filter((r) => r.answeredCount > 0)
        .map((r) => charts.scaleStrip(r.item, r.answers, names)),
    ));
  }

  // --- seeking matrix -----------------------------------------------------
  if (seekingGrid && seekingGrid.rows.some((r) => r.answeredCount > 0)) {
    results.append(el('div', { class: 'card' },
      el('h2', {}, 'What each of you is open to'),
      el('p', { class: 'sub' }, 'Highlighted rows are mutual — everyone answered is at least “Curious”.'),
      charts.interestMatrix(
        seekingGrid.rows.filter((r) => r.answeredCount > 0), names),
    ));
  }

  // --- mutual desires -----------------------------------------------------
  if (withTokens.length >= 2) {
    const card = el('div', { class: 'card' }, el('h2', {}, 'Desires — mutual only'));
    if (withTokens.length < payloads.length) {
      card.append(el('p', { class: 'fine' },
        'Not every profile here filled in the desires section; reveals below are among those that did.'));
    }
    if (desireRows.length) {
      card.append(
        el('p', { class: 'sub' },
          'These appear because everyone (or at least two of you) marked them. One-sided ',
          'desires stay hidden — neither of you learns the other was asked.'),
        ...desireRows.map(({ item, levels }) => el('div', { class: 'reveal-card' },
          el('div', { class: 'reveal-title', text: item.label }),
          el('div', { class: 'reveal-levels' },
            levels.map((lvl, i) => lvl >= 1
              ? el('span', {},
                  el('span', { class: 'person-dot', style: `background:${charts.seriesVar(i)}` }),
                  ` ${names[i]}: ${match.interestLevelLabel(lvl)}`)
              : null)),
        )),
      );
    } else {
      card.append(el('p', { class: 'sub' },
        'No mutual desires surfaced — which only means nothing overlapped among the answers ',
        'given. One-sided answers stay invisible by design.'));
    }
    results.append(card);
  } else if (withTokens.length === 1) {
    results.append(el('div', { class: 'card' },
      el('h2', {}, 'Desires — mutual only'),
      el('p', { class: 'sub' },
        'Only one of these profiles filled in the desires section, so there is nothing to ',
        'mutually reveal.'),
    ));
  }

  // --- everything else, in the open --------------------------------------
  const restIds = ['about', 'lifestyle', 'connection', 'structure', 'notes'];
  for (const id of restIds) {
    const g = grid.find((x) => x.section.id === id);
    if (!g || !g.rows.some((r) => r.answeredCount > 0)) continue;
    const card = el('div', { class: 'card grid-section' }, el('h2', {}, g.section.title));
    for (const row of g.rows) {
      if (row.answeredCount === 0) continue;
      card.append(el('div', { class: 'grid-row' },
        el('div', { class: 'grid-item-label' },
          charts.simDot(row.sim),
          row.item.label ?? `${row.item.left} ↔ ${row.item.right}`),
        el('div', { class: 'grid-answers' },
          row.answers.map((v, i) => el('div', { class: 'grid-answer' },
            el('span', { class: 'person-dot', style: `background:${charts.seriesVar(i)}`, title: names[i] }),
            charts.answerText(row.item, v),
          ))),
      ));
    }
    results.append(card);
  }

  main.append(results);
}
