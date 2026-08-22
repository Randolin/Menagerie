// Moxy app shell: header, hash router, shared state.
//
// Routes:
//   #/home #/survey #/share #/compare #/vault #/about   — app pages
//   #p=m1.…                                            — someone's profile link
//   #c=m1.…~m1.…                                       — a multi-profile compare link

import { el, toast } from './ui.js';

const routes = {
  home: () => import('./views/home.js'),
  survey: () => import('./views/survey.js'),
  share: () => import('./views/share.js'),
  compare: () => import('./views/compare.js'),
  vault: () => import('./views/vault.js'),
  about: () => import('./views/about.js'),
  profile: () => import('./views/profile.js'),
};

// Session state shared across views (in memory only).
export const state = {
  answers: null,          // survey answers being edited
  editingProfileId: null, // vault profile id when editing a saved profile
  compareCodes: [],       // payload code strings queued for comparison
  incomingCode: null,     // code opened via #p= link
};

export function navigate(route, replace = false) {
  if (replace) history.replaceState(null, '', '#/' + route);
  else location.hash = '#/' + route;
  if (replace) render();
}

function buildShell() {
  const themeBtn = el('button', {
    class: 'btn btn-ghost btn-small', title: 'Theme', 'aria-label': 'Toggle theme',
    onclick: cycleTheme,
  }, '◐');
  const header = el('header', { class: 'app-header' },
    el('a', { class: 'brand', href: '#/home' },
      el('span', { class: 'brand-mark', 'aria-hidden': 'true', text: 'M' }), 'Moxy'),
    el('nav', { class: 'nav', 'aria-label': 'Main' },
      el('a', { href: '#/survey', dataset: { route: 'survey' }, text: 'My profile' }),
      el('a', { href: '#/compare', dataset: { route: 'compare' }, text: 'Compare' }),
      el('a', { href: '#/vault', dataset: { route: 'vault' }, text: 'Vault' }),
      el('a', { href: '#/about', dataset: { route: 'about' }, text: 'How it works' }),
    ),
    themeBtn,
  );
  const main = el('main', { id: 'view' });
  const footer = el('footer', { class: 'app-footer' },
    el('p', {},
      'Moxy runs entirely in your browser. No accounts, no servers, no analytics — ',
      el('a', { href: '#/about' }, 'see exactly how'), '.'),
  );
  document.body.append(header, main, footer);
}

const THEME_KEY = 'moxy.theme';
function applyTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function cycleTheme() {
  let cur = null;
  try { cur = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  const next = cur === 'dark' ? 'light' : cur === 'light' ? null : 'dark';
  try {
    if (next) localStorage.setItem(THEME_KEY, next);
    else localStorage.removeItem(THEME_KEY);
  } catch { /* ignore */ }
  applyTheme();
  toast(next ? `Theme: ${next}` : 'Theme: follow system');
}

async function render() {
  const hash = location.hash || '#/home';
  let route = 'home';
  let params = {};

  if (hash.startsWith('#p=')) {
    route = 'profile';
    params.code = hash.slice(3);
  } else if (hash.startsWith('#c=')) {
    route = 'compare';
    params.codes = hash.slice(3).split('~').filter(Boolean);
  } else if (hash.startsWith('#/')) {
    const name = hash.slice(2).split('?')[0];
    route = routes[name] ? name : 'home';
  }

  for (const a of document.querySelectorAll('.nav a')) {
    a.classList.toggle('active', a.dataset.route === route);
  }

  const main = document.getElementById('view');
  main.replaceChildren();
  try {
    const mod = await routes[route]();
    await mod.render(main, { state, navigate, params });
  } catch (err) {
    console.error(err);
    main.append(
      el('div', { class: 'card' },
        el('h2', { text: 'Something went wrong' }),
        el('p', { class: 'sub', text: String(err.message || err) }),
        el('a', { class: 'btn', href: '#/home' }, 'Back to start'),
      ),
    );
  }
  window.scrollTo(0, 0);
}

applyTheme();
buildShell();
window.addEventListener('hashchange', render);
render();
