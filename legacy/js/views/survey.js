// The survey wizard: one section at a time, every question optional,
// answers autosaved to a local draft so a refresh never loses work.

import { el, toast } from '../ui.js';
import { SECTIONS, INTEREST_LEVELS } from '../schema.js';
import { loadDraft, saveDraft } from '../vault.js';

let sectionIdx = 0;

export function render(main, ctx) {
  if (!ctx.state.answers) {
    const draft = loadDraft();
    ctx.state.answers = draft || {};
    if (draft && Object.keys(draft).length) {
      toast('Restored your draft from this browser.');
    }
  }
  sectionIdx = Math.min(sectionIdx, SECTIONS.length - 1);
  drawSection(main, ctx);
}

function persist(ctx) {
  saveDraft(ctx.state.answers);
}

function answeredCount(section, answers) {
  return section.items.filter((it) => {
    const v = answers[it.id];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }).length;
}

function drawSection(main, ctx) {
  const answers = ctx.state.answers;
  const section = SECTIONS[sectionIdx];
  main.replaceChildren();

  main.append(
    el('div', { class: 'survey-progress', role: 'tablist' },
      SECTIONS.map((s, i) => el('button', {
        class: `survey-step ${i === sectionIdx ? 'active' : answeredCount(s, answers) > 0 ? 'done' : ''}`,
        role: 'tab', 'aria-selected': i === sectionIdx ? 'true' : 'false',
        onclick: () => { sectionIdx = i; drawSection(main, ctx); },
      }, s.title)),
    ),
  );

  const card = el('div', { class: 'card' },
    el('h2', { text: section.title }),
    el('p', { class: 'sub', text: section.blurb }),
  );

  if (section.privacy === 'match') {
    card.append(el('div', { class: 'notice' },
      'Answers here are never visible in the open. They travel as scrambled fingerprints and ',
      'only appear when both profiles marked the same desire. “Not for me” answers are never ',
      'shared in any form — but a determined tech-savvy recipient of your link could ',
      'test for the positive ones, so leave out anything you wouldn’t want guessed.'));
  }

  const optedIn = !section.optIn || section.items.some((it) => answers[it.id] !== undefined)
    || answers[`_optin.${section.id}`] === true;

  if (section.optIn && !optedIn) {
    card.append(el('div', { class: 'optin-gate' },
      el('h3', {}, 'This section is optional — and private by design.'),
      el('p', { class: 'sub' },
        'Skip it entirely, or fill it in knowing answers only surface on a mutual match.'),
      el('div', { class: 'btn-row', style: 'justify-content:center' },
        el('button', {
          class: 'btn btn-primary',
          onclick: () => { answers[`_optin.${section.id}`] = true; persist(ctx); drawSection(main, ctx); },
        }, 'Open this section'),
        el('button', { class: 'btn btn-ghost', onclick: () => nav(1, main, ctx) }, 'Skip it'),
      ),
    ));
  } else {
    for (const item of section.items) {
      card.append(renderItem(item, answers, () => persist(ctx)));
    }
  }

  const last = sectionIdx === SECTIONS.length - 1;
  card.append(el('div', { class: 'btn-row', style: 'margin-top:20px' },
    sectionIdx > 0
      ? el('button', { class: 'btn', onclick: () => nav(-1, main, ctx) }, '← Back')
      : null,
    last
      ? el('button', {
          class: 'btn btn-primary',
          onclick: () => { persist(ctx); ctx.navigate('share'); },
        }, 'Finish → get my link')
      : el('button', { class: 'btn btn-primary', onclick: () => nav(1, main, ctx) }, 'Next →'),
    el('span', { class: 'fine', style: 'margin-left:auto' },
      `${answeredCount(section, answers)} of ${section.items.length} answered — all optional`),
  ));

  main.append(card);
  window.scrollTo(0, 0);
}

function nav(dir, main, ctx) {
  sectionIdx = Math.max(0, Math.min(SECTIONS.length - 1, sectionIdx + dir));
  drawSection(main, ctx);
}

function renderItem(item, answers, onChange) {
  const block = el('div', { class: 'item-block' });
  const label = el('span', { class: 'field-label', text: item.label ?? '' });

  const set = (v) => {
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) delete answers[item.id];
    else answers[item.id] = v;
    onChange();
  };

  switch (item.type) {
    case 'text': {
      block.append(label);
      if (item.hint) block.append(el('div', { class: 'field-hint', text: item.hint }));
      let input;
      if (item.short) {
        input = el('input', { type: 'text', value: answers[item.id] ?? '', autocomplete: 'off' });
        if (item.suggest) {
          const listId = `dl-${item.id.replace(/\W/g, '')}`;
          input.setAttribute('list', listId);
          block.append(el('datalist', { id: listId },
            item.suggest.map((s) => el('option', { value: s }))));
        }
      } else {
        input = el('textarea', {}, answers[item.id] ?? '');
      }
      input.addEventListener('input', () => set(input.value.trim() === '' ? undefined : input.value));
      block.append(input);
      break;
    }
    case 'choice': {
      block.append(label);
      const grid = el('div', { class: 'opt-grid', role: 'group', 'aria-label': item.label });
      item.options.forEach((opt, i) => {
        const b = el('button', {
          class: 'opt', 'aria-pressed': answers[item.id] === i ? 'true' : 'false',
          onclick: () => {
            set(answers[item.id] === i ? undefined : i);
            grid.querySelectorAll('.opt').forEach((o, j) =>
              o.setAttribute('aria-pressed', answers[item.id] === j ? 'true' : 'false'));
          },
        }, opt);
        grid.append(b);
      });
      block.append(grid);
      break;
    }
    case 'multi': {
      block.append(label);
      const grid = el('div', { class: 'opt-grid', role: 'group', 'aria-label': item.label });
      item.options.forEach((opt, i) => {
        const selected = () => Array.isArray(answers[item.id]) && answers[item.id].includes(i);
        const b = el('button', {
          class: 'opt', 'aria-pressed': selected() ? 'true' : 'false',
          onclick: () => {
            const cur = new Set(Array.isArray(answers[item.id]) ? answers[item.id] : []);
            if (cur.has(i)) cur.delete(i); else cur.add(i);
            set([...cur].sort((a, b2) => a - b2));
            b.setAttribute('aria-pressed', selected() ? 'true' : 'false');
          },
        }, opt);
        grid.append(b);
      });
      block.append(grid);
      break;
    }
    case 'scale': {
      const ticks = el('div', { class: 'scale-ticks', role: 'group', 'aria-label': `${item.left} versus ${item.right}` });
      for (let v = 0; v <= 6; v++) {
        const b = el('button', {
          class: `scale-tick ${answers[item.id] === v ? 'selected' : ''}`,
          'aria-label': `${v} of 6 toward ${item.right}`,
          title: `${v}/6`,
          onclick: () => {
            set(answers[item.id] === v ? undefined : v);
            ticks.querySelectorAll('.scale-tick').forEach((t, j) =>
              t.classList.toggle('selected', answers[item.id] === j));
          },
        }, String(v));
        ticks.append(b);
      }
      block.append(el('div', { class: 'scale-input' },
        el('span', { class: 'scale-side', text: item.left }),
        ticks,
        el('span', { class: 'scale-side right', text: item.right }),
      ));
      break;
    }
    case 'interest': {
      block.append(label);
      const grid = el('div', { class: 'interest-input', role: 'group', 'aria-label': item.label });
      INTEREST_LEVELS.forEach(({ value, label: lv }) => {
        const b = el('button', {
          class: 'opt', 'aria-pressed': answers[item.id] === value ? 'true' : 'false',
          onclick: () => {
            set(answers[item.id] === value ? undefined : value);
            grid.querySelectorAll('.opt').forEach((o, j) =>
              o.setAttribute('aria-pressed', answers[item.id] === j ? 'true' : 'false'));
          },
        }, lv);
        grid.append(b);
      });
      block.append(grid);
      break;
    }
  }
  return block;
}
