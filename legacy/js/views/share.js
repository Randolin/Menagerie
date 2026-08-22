// Share view: turn the current answers into a link + QR code, and offer to
// save the profile into the passphrase vault.

import { el, toast, copyText } from '../ui.js';
import { buildSharePayload, encodePayload, shareUrlFor } from '../codec.js';
import { buildMatchTokens, randomSalt, generatePassphrase } from '../crypto.js';
import { loadDraft } from '../vault.js';
import * as vault from '../vault.js';
import qrcode from '../vendor/qrcode.js';

export async function render(main, ctx) {
  const answers = ctx.state.answers || loadDraft();
  if (!answers || Object.keys(answers).length === 0) {
    main.append(el('div', { class: 'card' },
      el('h2', {}, 'Nothing to share yet'),
      el('p', { class: 'sub' }, 'Fill out at least part of the survey first.'),
      el('a', { class: 'btn btn-primary', href: '#/survey' }, 'Go to the survey'),
    ));
    return;
  }
  ctx.state.answers = answers;

  // Fresh salt on every share: two links from the same answers can't be
  // correlated by their desire fingerprints.
  const salt = randomSalt();
  const tokens = await buildMatchTokens(answers, salt);
  const payload = buildSharePayload(answers, tokens, salt);
  const encoded = await encodePayload(payload);
  const url = shareUrlFor(encoded);

  const qrBox = el('div', { class: 'qr-box' });
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url, 'Byte');
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    const svg = qrBox.querySelector('svg');
    if (svg) { svg.style.width = '208px'; svg.style.height = '208px'; }
  } catch {
    qrBox.append(el('p', { class: 'fine', text: 'This profile is too large for a QR code — share the link instead.' }));
  }

  const openCount = Object.keys(payload.a).length;
  const desireCount = Object.entries(answers)
    .filter(([k, v]) => k.startsWith('dp.') && typeof v === 'number' && v >= 1).length;

  main.append(
    el('div', { class: 'card' },
      el('h2', {}, 'Your shareable profile'),
      el('p', { class: 'sub' },
        `${openCount} answer${openCount === 1 ? '' : 's'} travel${openCount === 1 ? 's' : ''} openly in this link` +
        (desireCount
          ? `, and ${desireCount} desire${desireCount === 1 ? '' : 's'} travel${desireCount === 1 ? 's' : ''} as scrambled, mutual-reveal-only fingerprints.`
          : '.'),
        ' The link itself is the profile — nothing is uploaded anywhere. Anyone you give it to ',
        'can see the open answers, so share it like you’d share a business card.'),
      el('div', { class: 'share-grid' },
        el('div', {},
          el('div', { class: 'code-box', text: url }),
          el('div', { class: 'btn-row', style: 'margin-top:12px' },
            el('button', {
              class: 'btn btn-primary',
              onclick: async () => toast(await copyText(url) ? 'Link copied' : 'Copy failed — select it manually'),
            }, '📋 Copy link'),
            el('button', {
              class: 'btn',
              onclick: async () => toast(await copyText(encoded) ? 'Code copied' : 'Copy failed'),
            }, 'Copy just the code'),
            el('a', { class: 'btn btn-ghost', href: '#/survey' }, 'Edit answers'),
          ),
          el('p', { class: 'fine', style: 'margin-top:10px' },
            'Each time you open this page the link is re-generated with a fresh scramble, ',
            'so separately shared links can’t be matched to each other.'),
        ),
        qrBox,
      ),
    ),
    buildVaultCard(ctx),
  );
}

function buildVaultCard(ctx) {
  const card = el('div', { class: 'card' });
  drawVaultSection(card, ctx);
  return card;
}

function drawVaultSection(card, ctx) {
  card.replaceChildren();
  const session = vault.currentSession();

  if (session) {
    card.append(
      el('h2', {}, 'Save to your vault'),
      el('p', { class: 'sub' }, 'Your vault is unlocked. Save this profile so you can edit it later.'),
    );
    const nameInput = el('input', {
      type: 'text',
      value: ctx.state.answers['ab.name'] || 'My profile',
      'aria-label': 'Profile name in vault',
    });
    card.append(
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'Save as' }), nameInput),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn btn-primary',
          onclick: async () => {
            const id = await vault.saveProfile(
              nameInput.value.trim() || 'My profile',
              ctx.state.answers,
              ctx.state.editingProfileId,
            );
            ctx.state.editingProfileId = id;
            toast('Saved to vault');
          },
        }, ctx.state.editingProfileId ? 'Update saved profile' : 'Save profile'),
        el('a', { class: 'btn btn-ghost', href: '#/vault' }, 'Open vault'),
      ),
    );
    return;
  }

  card.append(
    el('h2', {}, 'Want to come back and edit later?'),
    el('p', { class: 'sub' },
      'Create a vault: we generate a random passphrase, and your profile is encrypted with it ',
      'on this device. The passphrase is shown once, stored nowhere, and is the only way in. ',
      'It is completely separate from your share link — the link can never unlock your vault.'),
  );

  const actions = el('div', { class: 'btn-row' },
    el('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        const pass = await generatePassphrase(5);
        card.replaceChildren(
          el('h2', {}, 'Your passphrase — write it down now'),
          el('p', { class: 'sub' },
            'This is the only time it will ever be shown. It is not stored anywhere, ',
            'not even encrypted. If you lose it, the vault cannot be recovered by anyone.'),
          el('div', { class: 'passphrase-box', text: pass }),
          el('div', { class: 'btn-row' },
            el('button', {
              class: 'btn',
              onclick: async () => toast(await copyText(pass) ? 'Copied — now store it somewhere safe' : 'Copy failed'),
            }, '📋 Copy passphrase'),
            el('button', {
              class: 'btn btn-primary',
              onclick: async () => {
                await vault.openVault(pass, { createIfMissing: true });
                await vault.saveProfile(ctx.state.answers['ab.name'] || 'My profile', ctx.state.answers);
                toast('Vault created and profile saved');
                drawVaultSection(card, ctx);
              },
            }, 'I’ve saved it — create my vault'),
          ),
        );
      },
    }, '🔑 Generate my passphrase'),
    el('button', {
      class: 'btn btn-ghost',
      onclick: () => {
        card.replaceChildren(
          el('h2', {}, 'Unlock your vault'),
          unlockForm(async (pass) => {
            const s = await vault.openVault(pass);
            if (!s) { toast('No vault found for that passphrase', 'error'); return; }
            toast('Vault unlocked');
            drawVaultSection(card, ctx);
          }),
        );
      },
    }, 'I already have a passphrase'),
  );
  card.append(actions);
}

export function unlockForm(onUnlock) {
  const input = el('input', {
    type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
    placeholder: 'five words like these ones here',
    'aria-label': 'Vault passphrase',
  });
  const btn = el('button', { class: 'btn btn-primary' }, 'Unlock');
  const form = el('form', {
    class: 'field',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      btn.disabled = true;
      btn.textContent = 'Deriving key…';
      try { await onUnlock(input.value); }
      finally { btn.disabled = false; btn.textContent = 'Unlock'; }
    },
  }, input, el('div', { class: 'btn-row', style: 'margin-top:10px' }, btn));
  return form;
}
