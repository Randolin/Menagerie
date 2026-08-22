// Single-profile view — what opening someone's shared link shows.

import { el, toast } from '../ui.js';
import { decodePayload } from '../codec.js';
import { SECTIONS } from '../schema.js';
import * as match from '../match.js';
import * as charts from '../charts.js';
import * as vault from '../vault.js';

export async function render(main, ctx) {
  const code = ctx.params.code;
  let payload;
  try {
    payload = await decodePayload(code);
  } catch (err) {
    main.append(el('div', { class: 'card' },
      el('h2', {}, 'Couldn’t read that profile'),
      el('p', { class: 'sub', text: err.message }),
      el('a', { class: 'btn', href: '#/home' }, 'Go home'),
    ));
    return;
  }

  const name = match.displayName(payload, 'Someone');
  const hasDesires = match.hasDesiresTokens(payload);

  const actions = el('div', { class: 'btn-row', style: 'margin-top:16px' },
    el('button', {
      class: 'btn btn-primary',
      onclick: () => {
        if (!ctx.state.compareCodes.includes(code)) ctx.state.compareCodes.push(code);
        ctx.navigate('compare');
      },
    }, '🔍 Compare with a profile'),
    vault.currentSession()
      ? el('button', {
          class: 'btn',
          onclick: async () => {
            await vault.saveConnection(name, code);
            toast(`Saved ${name} to your vault`);
          },
        }, '💾 Save to vault')
      : el('a', { class: 'btn btn-ghost', href: '#/vault' }, 'Unlock vault to save them'),
  );

  main.append(el('div', { class: 'card' },
    el('h2', {}, `${name}’s profile`),
    el('p', { class: 'sub' },
      'This is a Moxy profile — shared with you as a link, stored on no server. ',
      hasDesires
        ? 'It includes a private desires section that only unlocks against a profile with mutual answers.'
        : ''),
    actions,
  ));

  // Open answers, section by section.
  for (const section of SECTIONS) {
    if (section.privacy !== 'open') continue;
    const answered = section.items.filter((it) => payload.a[it.id] !== undefined);
    if (!answered.length) continue;
    const card = el('div', { class: 'card grid-section' }, el('h2', {}, section.title));
    for (const item of answered) {
      if (item.type === 'scale') {
        card.append(charts.scaleStrip(item, [payload.a[item.id]], [name]));
      } else {
        card.append(el('div', { class: 'grid-row' },
          el('div', { class: 'grid-item-label' }, item.label),
          el('div', { class: 'grid-answers' }, charts.answerText(item, payload.a[item.id])),
        ));
      }
    }
    main.append(card);
  }
}
