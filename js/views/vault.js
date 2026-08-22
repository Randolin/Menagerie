// Vault view: unlock/create, manage saved profiles and connections,
// export/import the encrypted vault, lock.

import { el, toast, copyText, downloadText } from '../ui.js';
import * as vault from '../vault.js';
import { generatePassphrase, buildMatchTokens, randomSalt } from '../crypto.js';
import { encodePayload, buildSharePayload, shareUrlFor, extractPayloadString } from '../codec.js';
import { unlockForm } from './share.js';

export function render(main, ctx) {
  draw(main, ctx);
}

function draw(main, ctx) {
  main.replaceChildren();
  const session = vault.currentSession();
  main.append(el('h1', {}, 'Your vault'));
  if (!session) drawLocked(main, ctx);
  else drawUnlocked(main, ctx, session);
}

function drawLocked(main, ctx) {
  main.append(
    el('div', { class: 'card' },
      el('h2', {}, 'Unlock'),
      el('p', { class: 'sub' },
        'Enter your passphrase. It never leaves this device — it only derives the key that ',
        'decrypts your vault in this browser’s storage.'),
      unlockForm(async (pass) => {
        const s = await vault.openVault(pass);
        if (!s) {
          toast('No vault found for that passphrase on this device', 'error');
          return;
        }
        toast('Vault unlocked');
        draw(main, ctx);
      }),
      el('p', { class: 'fine' },
        'Vaults live per-device. To move one, export it on the old device and import it here.'),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'New here?'),
      el('p', { class: 'sub' },
        'A vault lets you save your profile to edit later, and keep a list of connections — ',
        'all encrypted with a passphrase we generate for you. No email, no username, nothing ',
        'to identify you. If the passphrase is lost, the vault is unrecoverable — by design.'),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn btn-primary',
          onclick: async () => {
            const pass = await generatePassphrase(5);
            main.replaceChildren(
              el('h1', {}, 'Your vault'),
              el('div', { class: 'card' },
                el('h2', {}, 'Your passphrase — write it down now'),
                el('p', { class: 'sub' },
                  'Shown once, stored nowhere. Anyone with these five words can open this vault ',
                  'on this device, and no one can without them.'),
                el('div', { class: 'passphrase-box', text: pass }),
                el('div', { class: 'btn-row' },
                  el('button', {
                    class: 'btn',
                    onclick: async () => toast(await copyText(pass) ? 'Copied — store it safely' : 'Copy failed'),
                  }, '📋 Copy'),
                  el('button', {
                    class: 'btn btn-primary',
                    onclick: async () => {
                      await vault.openVault(pass, { createIfMissing: true });
                      toast('Vault created');
                      draw(main, ctx);
                    },
                  }, 'I’ve saved it — create vault'),
                  el('button', { class: 'btn btn-ghost', onclick: () => draw(main, ctx) }, 'Cancel'),
                ),
              ),
            );
          },
        }, '🔑 Create a vault'),
      ),
    ),
    el('div', { class: 'card' },
      el('h2', {}, 'Import a vault export'),
      el('p', { class: 'sub' }, 'Moving devices? Pick your exported vault file, then enter its passphrase.'),
      importForm(main, ctx),
    ),
  );
}

function importForm(main, ctx) {
  const file = el('input', { type: 'file', accept: 'application/json,.json', 'aria-label': 'Vault export file' });
  const pass = el('input', { type: 'text', placeholder: 'passphrase for that vault', 'aria-label': 'Passphrase', autocomplete: 'off' });
  return el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const f = file.files?.[0];
      if (!f) { toast('Choose a vault file first', 'error'); return; }
      try {
        await vault.importVaultBlob(await f.text(), pass.value);
        toast('Vault imported and unlocked');
        draw(main, ctx);
      } catch (err) {
        toast(err.message, 'error');
      }
    },
  },
    el('div', { class: 'field' }, file),
    el('div', { class: 'field' }, pass),
    el('button', { class: 'btn' }, 'Import'),
  );
}

function drawUnlocked(main, ctx, session) {
  const profiles = el('div', { class: 'card' }, el('h2', {}, 'My profiles'));
  if (!session.data.profiles.length) {
    profiles.append(el('p', { class: 'sub' }, 'No saved profiles yet. Finish the survey and save it here.'),
      el('a', { class: 'btn', href: '#/survey' }, 'Go to survey'));
  }
  for (const p of session.data.profiles) {
    profiles.append(el('div', { class: 'vault-item' },
      el('span', { class: 'vault-item-name', text: p.label }),
      el('span', { class: 'vault-item-meta', text: new Date(p.updatedAt).toLocaleDateString() }),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn btn-small',
          onclick: () => {
            ctx.state.answers = structuredClone(p.answers);
            ctx.state.editingProfileId = p.id;
            ctx.navigate('survey');
          },
        }, 'Edit'),
        el('button', {
          class: 'btn btn-small',
          onclick: async () => {
            const salt = randomSalt();
            const tokens = await buildMatchTokens(p.answers, salt);
            const url = shareUrlFor(await encodePayload(buildSharePayload(p.answers, tokens, salt)));
            toast(await copyText(url) ? 'Fresh share link copied' : 'Copy failed');
          },
        }, 'Copy link'),
        el('button', {
          class: 'btn btn-small btn-danger',
          onclick: async () => {
            if (!confirm(`Delete profile “${p.label}” from the vault?`)) return;
            await vault.deleteProfile(p.id);
            if (ctx.state.editingProfileId === p.id) ctx.state.editingProfileId = null;
            draw(main, ctx);
          },
        }, 'Delete'),
      ),
    ));
  }

  const conns = el('div', { class: 'card' }, el('h2', {}, 'Saved connections'));
  if (!session.data.connections.length) {
    conns.append(el('p', { class: 'sub' },
      'When someone shares a profile with you, save it here to revisit or compare later.'));
  }
  for (const c of session.data.connections) {
    const notes = el('textarea', { placeholder: 'Notes…', 'aria-label': `Notes about ${c.label}` }, c.notes || '');
    let notesTimer;
    notes.addEventListener('input', () => {
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => vault.updateConnection(c.id, { notes: notes.value }), 600);
    });
    conns.append(el('div', { class: 'vault-item', style: 'align-items:flex-start' },
      el('div', { style: 'flex:1;min-width:200px' },
        el('div', { class: 'vault-item-name', text: c.label }),
        el('div', { class: 'vault-item-meta', text: `saved ${new Date(c.addedAt).toLocaleDateString()}` }),
        el('div', { style: 'margin-top:8px' }, notes),
      ),
      el('div', { class: 'btn-row' },
        el('button', {
          class: 'btn btn-small',
          onclick: () => {
            try {
              const code = extractPayloadString(c.code);
              location.hash = '#p=' + code;
            } catch (err) { toast(err.message, 'error'); }
          },
        }, 'View'),
        el('button', {
          class: 'btn btn-small',
          onclick: () => {
            try {
              const code = extractPayloadString(c.code);
              if (!ctx.state.compareCodes.includes(code)) ctx.state.compareCodes.push(code);
              ctx.navigate('compare');
            } catch (err) { toast(err.message, 'error'); }
          },
        }, 'Compare'),
        el('button', {
          class: 'btn btn-small btn-danger',
          onclick: async () => {
            if (!confirm(`Remove “${c.label}”?`)) return;
            await vault.deleteConnection(c.id);
            draw(main, ctx);
          },
        }, 'Remove'),
      ),
    ));
  }

  // Add a connection by pasting.
  const nameInput = el('input', { type: 'text', placeholder: 'Their name (for your eyes only)', 'aria-label': 'Connection name' });
  const codeInput = el('input', { type: 'text', placeholder: 'Their profile link or code', 'aria-label': 'Connection profile link' });
  conns.append(el('form', {
    style: 'margin-top:14px;display:grid;gap:8px',
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const code = extractPayloadString(codeInput.value);
        await vault.saveConnection(nameInput.value.trim() || 'Unnamed', code);
        nameInput.value = ''; codeInput.value = '';
        toast('Connection saved');
        draw(main, ctx);
      } catch (err) { toast(err.message, 'error'); }
    },
  }, nameInput, codeInput, el('div', {}, el('button', { class: 'btn btn-small' }, 'Add connection'))));

  const housekeeping = el('div', { class: 'card' },
    el('h2', {}, 'Housekeeping'),
    el('div', { class: 'btn-row' },
      el('button', {
        class: 'btn',
        onclick: () => {
          downloadText('moxy-vault-export.json', vault.exportVaultBlob());
          toast('Export downloaded — it stays encrypted');
        },
      }, '⬇️ Export vault (encrypted)'),
      el('button', {
        class: 'btn',
        onclick: () => { vault.lockVault(); toast('Vault locked'); draw(main, ctx); },
      }, '🔒 Lock vault'),
    ),
    el('p', { class: 'fine', style: 'margin-top:10px' },
      'The export file is the same encrypted blob stored in this browser — safe to keep in ',
      'cloud storage, useless without the passphrase.'),
  );

  main.append(profiles, conns, housekeeping);
}
