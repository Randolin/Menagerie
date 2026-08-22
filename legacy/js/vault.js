// Local persistence: an unencrypted working draft (so a page refresh never
// eats a half-finished survey) and the passphrase-locked vault.
//
// The vault key lives only in memory — closing or reloading the page locks
// the vault again. Nothing here ever touches the network.

import { deriveVaultKeys, encryptVault, decryptVault } from './crypto.js';

const DRAFT_KEY = 'moxy.draft.v1';
const VAULT_PREFIX = 'moxy.vault.v1.';

// --- Draft ---------------------------------------------------------------

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(answers) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
  } catch { /* storage may be unavailable; drafts are best-effort */ }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// --- Vault ---------------------------------------------------------------

let session = null; // { locator, key, data }

function emptyVault() {
  return { v: 1, profiles: [], connections: [] };
}

export function currentSession() {
  return session;
}

export function lockVault() {
  session = null;
}

export async function openVault(passphrase, { createIfMissing = false } = {}) {
  const { locator, key } = await deriveVaultKeys(passphrase);
  const slot = VAULT_PREFIX + locator;
  const stored = localStorage.getItem(slot);
  let data;
  if (stored === null) {
    if (!createIfMissing) return null; // no vault under this passphrase
    data = emptyVault();
  } else {
    try {
      data = await decryptVault(stored, key);
    } catch {
      // A locator collision without a matching key is cryptographically
      // implausible; treat any failure as corrupt storage.
      throw new Error('That vault exists but could not be decrypted — storage may be corrupted.');
    }
  }
  session = { locator, key, data };
  if (stored === null) await persist();
  return session;
}

async function persist() {
  if (!session) throw new Error('Vault is locked.');
  const blob = await encryptVault(session.data, session.key);
  localStorage.setItem(VAULT_PREFIX + session.locator, blob);
}

export async function saveProfile(label, answers, id = null) {
  if (!session) throw new Error('Vault is locked.');
  const now = Date.now();
  if (id) {
    const p = session.data.profiles.find((x) => x.id === id);
    if (!p) throw new Error('Profile not found.');
    p.label = label;
    p.answers = answers;
    p.updatedAt = now;
  } else {
    id = crypto.randomUUID();
    session.data.profiles.push({ id, label, answers, createdAt: now, updatedAt: now });
  }
  await persist();
  return id;
}

export async function deleteProfile(id) {
  if (!session) throw new Error('Vault is locked.');
  session.data.profiles = session.data.profiles.filter((p) => p.id !== id);
  await persist();
}

export async function saveConnection(label, code, notes = '') {
  if (!session) throw new Error('Vault is locked.');
  const conn = { id: crypto.randomUUID(), label, code, notes, addedAt: Date.now() };
  session.data.connections.push(conn);
  await persist();
  return conn;
}

export async function updateConnection(id, patch) {
  if (!session) throw new Error('Vault is locked.');
  const c = session.data.connections.find((x) => x.id === id);
  if (!c) throw new Error('Connection not found.');
  Object.assign(c, patch);
  await persist();
}

export async function deleteConnection(id) {
  if (!session) throw new Error('Vault is locked.');
  session.data.connections = session.data.connections.filter((c) => c.id !== id);
  await persist();
}

// Export/import the encrypted blob for moving between devices. The export is
// ciphertext — it can only be opened with the same passphrase.
export function exportVaultBlob() {
  if (!session) throw new Error('Vault is locked.');
  const blob = localStorage.getItem(VAULT_PREFIX + session.locator);
  return JSON.stringify({ moxyVault: 1, locator: session.locator, data: blob });
}

export async function importVaultBlob(text, passphrase) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not a Moxy vault export.');
  }
  if (!parsed || parsed.moxyVault !== 1 || !parsed.locator || !parsed.data) {
    throw new Error('That file is not a Moxy vault export.');
  }
  const { locator, key } = await deriveVaultKeys(passphrase);
  if (locator !== parsed.locator) {
    throw new Error('That passphrase does not match this vault export.');
  }
  await decryptVault(parsed.data, key); // verify before storing
  localStorage.setItem(VAULT_PREFIX + parsed.locator, parsed.data);
  return openVault(passphrase);
}
