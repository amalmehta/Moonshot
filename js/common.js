// Moonshot — shared page shell: header/nav, footer, settings (⌘,), feedback tab,
// KaTeX math, tag colours and the exercise widget. Every page imports this.

export const PAGES = [
  { href: 'index.html', title: 'Home' },
  { href: 'vehicles.html', title: '3D Vehicles' },
  { href: 'propulsion.html', title: 'Propulsion' },
  { href: 'flight.html', title: 'Flight Physics' },
  { href: 'structures.html', title: 'Hardware' },
  { href: 'software.html', title: 'Software & AI' },
  { href: 'starlink.html', title: 'Starlink' },
  { href: 'cost.html', title: 'Cost' },
  { href: 'moon.html', title: 'Moon' },
  { href: 'exercises.html', title: 'Exercises' },
  { href: 'validation.html', title: 'Validation' },
];

// ---------------------------------------------------------------------------
// Tags: related topics share a hue family; shades within a family are ≥12° apart.
//   propulsion 0–40 (reds/oranges) · structures 70–100 (olive/yellow) · cost 130–150 (greens)
//   starlink 190–205 (cyans) · orbits/mission 232–262 (blues) · software 285–335 (violets/magentas)
export const TAGS = {
  nozzles:     { label: 'Nozzles',      h: 2,   family: 'Propulsion' },
  engines:     { label: 'Engines',      h: 18,  family: 'Propulsion' },
  propulsion:  { label: 'Propulsion',   h: 30,  family: 'Propulsion' },
  combustion:  { label: 'Combustion',   h: 42,  family: 'Propulsion' },
  materials:   { label: 'Materials',    h: 72,  family: 'Hardware' },
  structures:  { label: 'Structures',   h: 86,  family: 'Hardware' },
  thermal:     { label: 'Thermal',      h: 100, family: 'Hardware' },
  cost:        { label: 'Cost',         h: 132, family: 'Economics' },
  reuse:       { label: 'Reuse',        h: 150, family: 'Economics' },
  starlink:    { label: 'Starlink',     h: 190, family: 'Communications' },
  rf:          { label: 'RF & links',   h: 205, family: 'Communications' },
  atmosphere:  { label: 'Atmosphere',   h: 222, family: 'Flight' },
  orbits:      { label: 'Orbits',       h: 236, family: 'Flight' },
  mission:     { label: 'Mission',      h: 250, family: 'Flight' },
  moon:        { label: 'Moon',         h: 264, family: 'Flight' },
  software:    { label: 'Software',     h: 286, family: 'Software' },
  gnc:         { label: 'GNC',          h: 300, family: 'Software' },
  ai:          { label: 'AI & autonomy',h: 316, family: 'Software' },
  reliability: { label: 'Reliability',  h: 332, family: 'Software' },
};

export function tagChip(name) {
  const t = TAGS[name] || { label: name, h: 250 };
  return `<span class="tag" style="--h:${t.h}" title="${t.family || ''}">${t.label}</span>`;
}
export const tagChips = names => `<span class="tags">${names.map(tagChip).join('')}</span>`;

// ---------------------------------------------------------------------------
// Settings
const SETTINGS_KEY = 'moonshot.settings';
export const DEFAULT_SETTINGS = { theme: 'system', motion: 'system', quality: 'medium', simSpeed: 1, examMode: false };
function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, v) { try { localStorage.setItem(key, v); } catch { /* private mode etc. */ } }

export function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(safeGet(SETTINGS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  safeSet(SETTINGS_KEY, JSON.stringify(s));
  applySettings(s);
  window.dispatchEvent(new CustomEvent('moonshot:settings', { detail: s }));
  return s;
}
export function onSettings(cb) { window.addEventListener('moonshot:settings', e => cb(e.detail)); }
export function reducedMotion() {
  const m = getSettings().motion;
  if (m === 'reduce') return true;
  if (m === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
/** Device-pixel-ratio cap for WebGL from the 3D quality setting. */
export function pixelRatioCap() {
  return { low: 1, medium: 1.5, high: 2.5 }[getSettings().quality] ?? 1.5;
}
/** True if the page is in dark mode (resolved). */
export function isDark() {
  const t = getSettings().theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
/** Read a CSS custom property as a string. */
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function applySettings(s) {
  const root = document.documentElement;
  if (s.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', s.theme);
  root.setAttribute('data-motion', reducedMotionFrom(s) ? 'reduce' : 'full');
}
function reducedMotionFrom(s) {
  if (s.motion === 'reduce') return true;
  if (s.motion === 'full') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
applySettings(getSettings());
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () =>
  window.dispatchEvent(new CustomEvent('moonshot:settings', { detail: getSettings() })));

// ---------------------------------------------------------------------------
// Small helpers
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Format a number with sensible significant figures and thousands separators. */
export function fmt(x, digits = 3) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  const ax = Math.abs(x);
  if (ax !== 0 && (ax < 1e-3 || ax >= 1e12)) return x.toExponential(Math.max(0, digits - 1)).replace('-', '−');
  const decimals = ax >= 10 ** digits ? 0 : Math.max(0, digits - 1 - Math.floor(Math.log10(ax || 1)));
  return x.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).replace('-', '−');
}
export function toast(msg, ms = 2200) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
/** Bind a range/number input to a label <output> and a callback; returns a getter. */
export function bindRange(id, onChange, format = v => v) {
  const input = document.getElementById(id);
  const out = document.querySelector(`output[for="${id}"]`);
  const update = () => { if (out) out.textContent = format(+input.value); onChange?.(+input.value); };
  input.addEventListener('input', update);
  if (out) out.textContent = format(+input.value);
  return () => +input.value;
}

// ---------------------------------------------------------------------------
// KaTeX (loaded once, from jsDelivr). typeset(el) renders $$…$$, \[…\] (display) and \(…\) (inline).
// A single $ is NOT a delimiter, so prices like $67M are safe.
let katexReady;
function loadKatex() {
  if (katexReady) return katexReady;
  const base = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = base + 'katex.min.css';
  document.head.appendChild(css);
  const load = src => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  katexReady = load(base + 'katex.min.js').then(() => load(base + 'contrib/auto-render.min.js')).catch(() => null);
  return katexReady;
}
export async function typeset(el = document.body) {
  await loadKatex();
  if (!window.renderMathInElement) return;
  window.renderMathInElement(el, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
    ],
    ignoredClasses: ['no-math'],
    throwOnError: false,
  });
}

// ---------------------------------------------------------------------------
// Header, footer, settings dialog, feedback tab
const LOGO = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="17" cy="7" r="4" fill="currentColor" opacity=".25"/><path d="M5 19c1-4 4-9 9-12-1 5-4 9-9 12z" fill="var(--accent)"/><path d="M5 19l-2 2M8 18l-1 3M6 16l-3 1" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const GEAR = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
const MENU = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function buildHeader() {
  const here = location.pathname.split('/').pop() || 'index.html';
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `<div class="wrap">
    <a class="brand" href="index.html">${LOGO}<span>Moonshot</span></a>
    <nav class="nav" id="site-nav" aria-label="Sections">
      ${PAGES.map(p => `<a href="${p.href}"${p.href === here ? ' aria-current="page"' : ''}>${p.title}</a>`).join('')}
    </nav>
    <span class="header-spacer"></span>
    <button class="icon-btn" id="settings-btn" title="Settings (${isMac ? '⌘' : 'Ctrl+'},)" aria-label="Settings">${GEAR}</button>
    <button class="icon-btn menu-btn" id="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="site-nav">${MENU}</button>
  </div>`;
  document.body.prepend(header);
  const nav = header.querySelector('#site-nav');
  header.querySelector('#menu-btn').addEventListener('click', e => {
    const open = nav.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', open);
  });
  header.querySelector('#settings-btn').addEventListener('click', openSettings);
}

function buildFooter() {
  const f = document.createElement('footer');
  f.className = 'site-footer';
  f.innerHTML = `<div class="wrap">
    <p><strong>Moonshot</strong> is an unofficial, independent educational project. It is not affiliated with, endorsed by, or sponsored by SpaceX.
    Every number is derived here from first principles and checked against public figures; see <a href="validation.html">Validation</a>. Values marked “est.” are public estimates, not official data.</p>
    <p class="row"><span>Press <kbd>${isMac ? '⌘' : 'Ctrl'}</kbd> <kbd>,</kbd> for settings.</span><span class="spacer"></span><a href="exercises.html">All exercises →</a></p>
  </div>`;
  document.body.appendChild(f);
}

let settingsDialog;
export function openSettings() {
  if (!settingsDialog) {
    settingsDialog = document.createElement('dialog');
    settingsDialog.className = 'modal';
    settingsDialog.setAttribute('aria-label', 'Settings');
    document.body.appendChild(settingsDialog);
  }
  const s = getSettings();
  const opt = (v, cur, label) => `<option value="${v}"${v == cur ? ' selected' : ''}>${label}</option>`;
  settingsDialog.innerHTML = `
    <div class="modal-head"><h2>Settings</h2><span class="spacer"></span><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">
      <div class="setting"><div><div>Appearance</div><div class="desc">Light, dark, or follow the system</div></div>
        <select id="set-theme">${opt('system', s.theme, 'System')}${opt('light', s.theme, 'Light')}${opt('dark', s.theme, 'Dark')}</select></div>
      <div class="setting"><div><div>Motion</div><div class="desc">Reduce motion pauses idle 3D spin and smooth scrolling</div></div>
        <select id="set-motion">${opt('system', s.motion, 'System')}${opt('full', s.motion, 'Full')}${opt('reduce', s.motion, 'Reduced')}</select></div>
      <div class="setting"><div><div>3D quality</div><div class="desc">Rendering resolution and detail in 3D views</div></div>
        <select id="set-quality">${opt('low', s.quality, 'Low (battery)')}${opt('medium', s.quality, 'Medium')}${opt('high', s.quality, 'High')}</select></div>
      <div class="setting"><div><div>Default simulation speed</div><div class="desc">Starting time warp for the Moon and landing sims</div></div>
        <select id="set-speed">${[0.5, 1, 2, 5, 10].map(v => opt(v, s.simSpeed, v + '×')).join('')}</select></div>
      <div class="setting"><div><div>Exam mode</div><div class="desc">Hide the “Show solution” buttons on exercises</div></div>
        <input type="checkbox" id="set-exam"${s.examMode ? ' checked' : ''} style="width:auto"></div>
      <hr style="margin:4px 0">
      <div class="setting"><div><div>Exercise progress</div><div class="desc">${Object.keys(getProgress()).length} solved, stored in this browser only</div></div>
        <button class="btn" id="set-reset">Reset</button></div>
    </div>
    <div class="modal-foot"><button class="btn primary" data-close>Done</button></div>`;
  const on = (id, key, cast = v => v) => settingsDialog.querySelector(id).addEventListener('change', e =>
    setSettings({ [key]: e.target.type === 'checkbox' ? e.target.checked : cast(e.target.value) }));
  on('#set-theme', 'theme'); on('#set-motion', 'motion'); on('#set-quality', 'quality');
  on('#set-speed', 'simSpeed', Number); on('#set-exam', 'examMode');
  settingsDialog.querySelector('#set-reset').addEventListener('click', () => {
    safeSet(PROGRESS_KEY, '{}'); toast('Exercise progress reset'); location.reload();
  });
  settingsDialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => settingsDialog.close()));
  if (!settingsDialog.open) settingsDialog.showModal();
}

const FEEDBACK_KEY = 'moonshot.feedback';
function buildFeedback() {
  const tab = document.createElement('button');
  tab.className = 'feedback-tab'; tab.textContent = 'Feedback'; tab.setAttribute('aria-label', 'Send feedback');
  document.body.appendChild(tab);
  const dlg = document.createElement('dialog');
  dlg.className = 'modal'; dlg.setAttribute('aria-label', 'Feedback');
  dlg.innerHTML = `
    <div class="modal-head"><h2>Feedback</h2><span class="spacer"></span><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">
      <div class="field"><span class="lbl">What’s this about?</span>
        <select id="fb-kind"><option>Wrong number or physics</option><option>Bug</option><option>Idea</option><option>Something else</option></select></div>
      <div class="field"><span class="lbl">Your note</span><textarea id="fb-text" placeholder="What did you notice? Which page/section?"></textarea></div>
      <p class="small muted">Feedback is saved in this browser (there’s no server). Use <em>Copy all</em> or <em>Download</em> to pass it on.</p>
    </div>
    <div class="modal-foot"><button class="btn" id="fb-copy">Copy all</button><button class="btn" id="fb-dl">Download</button><button class="btn primary" id="fb-save">Save</button></div>`;
  document.body.appendChild(dlg);
  const all = () => { try { return JSON.parse(safeGet(FEEDBACK_KEY) || '[]'); } catch { return []; } };
  tab.addEventListener('click', () => { dlg.showModal(); dlg.querySelector('#fb-text').focus(); });
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.querySelector('#fb-save').addEventListener('click', () => {
    const text = dlg.querySelector('#fb-text').value.trim();
    if (!text) { toast('Write a note first'); return; }
    const list = all();
    list.push({ when: new Date().toISOString(), page: location.pathname.split('/').pop() || 'index.html', kind: dlg.querySelector('#fb-kind').value, text });
    safeSet(FEEDBACK_KEY, JSON.stringify(list));
    dlg.querySelector('#fb-text').value = '';
    dlg.close(); toast(`Saved — ${list.length} note${list.length > 1 ? 's' : ''} stored`);
  });
  dlg.querySelector('#fb-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(all(), null, 2)); toast('Copied'); } catch { toast('Copy failed'); }
  });
  dlg.querySelector('#fb-dl').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(all(), null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'Moonshot Feedback.json' });
    a.click(); URL.revokeObjectURL(a.href);
  });
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); openSettings(); }
});

// ---------------------------------------------------------------------------
// Exercises widget. Exercise shape:
// { id, title, tags:[], difficulty:1–3, prompt:html, answer?:number, unit?:string,
//   tolerance?:relative (default 0.02), hints?:[html], solution:html }
const PROGRESS_KEY = 'moonshot.progress';
export function getProgress() { try { return JSON.parse(safeGet(PROGRESS_KEY) || '{}'); } catch { return {}; } }
function markSolved(id) { const p = getProgress(); p[id] = Date.now(); safeSet(PROGRESS_KEY, JSON.stringify(p)); }

/** Parse a typed answer: accepts 1e3, 1,234, unicode minus, trailing units. */
export function parseAnswer(str) {
  const s = String(str).replace(/[−–]/g, '-').replace(/,/g, '').trim();
  const m = s.match(/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}
export function checkAnswer(ex, value) {
  const tol = ex.tolerance ?? 0.02;
  if (ex.answer === 0) return Math.abs(value) <= (ex.absTolerance ?? 1e-6);
  return Math.abs(value - ex.answer) <= Math.abs(ex.answer) * tol + (ex.absTolerance ?? 0);
}

export function renderExercises(container, list, { startIndex = 1 } = {}) {
  const progress = getProgress();
  const exam = getSettings().examMode;
  container.classList.add('exercises');
  container.innerHTML = list.map((ex, i) => `
    <article class="exercise${progress[ex.id] ? ' solved' : ''}" id="ex-${ex.id}" data-id="${ex.id}">
      <header>
        <span class="ex-num">#${startIndex + i}</span>
        <span class="ex-title">${ex.title}</span>
        <span class="difficulty" title="Difficulty">${'●'.repeat(ex.difficulty || 1)}${'○'.repeat(3 - (ex.difficulty || 1))}</span>
        ${tagChips(ex.tags || [])}
        ${progress[ex.id] ? '<span class="badge good">solved</span>' : ''}
      </header>
      <div class="ex-prompt">${ex.prompt}</div>
      <div class="answer-row">
        ${ex.answer !== undefined ? `<input type="text" inputmode="decimal" aria-label="Your answer" placeholder="Your answer${ex.unit ? ' (' + ex.unit + ')' : ''}">
        <span class="muted small">${ex.unit || ''}</span>
        <button class="btn" data-act="check">Check</button>` : `<button class="btn" data-act="done">I’ve worked it out</button>`}
        ${(ex.hints || []).length ? `<button class="btn" data-act="hint">Hint</button>` : ''}
        ${exam ? '' : `<button class="btn" data-act="solution">Show solution</button>`}
        <span class="verdict" aria-live="polite"></span>
      </div>
      <div class="hints"></div>
      <div class="solution" hidden>${ex.solution || ''}</div>
    </article>`).join('');

  container.querySelectorAll('.exercise').forEach(card => {
    const ex = list.find(e => e.id === card.dataset.id);
    let hintsShown = 0;
    const verdict = card.querySelector('.verdict');
    const solved = () => { card.classList.add('solved'); markSolved(ex.id); container.dispatchEvent(new CustomEvent('progress')); };
    const input = card.querySelector('input');
    const check = () => {
      const v = parseAnswer(input.value);
      if (Number.isNaN(v)) { verdict.className = 'verdict no'; verdict.textContent = 'Enter a number'; return; }
      if (checkAnswer(ex, v)) { verdict.className = 'verdict ok'; verdict.textContent = `✓ Correct (${fmt(ex.answer, 4)} ${ex.unit || ''})`; solved(); }
      else { verdict.className = 'verdict no'; verdict.textContent = '✗ Not quite — try a hint'; }
    };
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
    card.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'check') check();
      if (act === 'done') { verdict.className = 'verdict ok'; verdict.textContent = '✓ Marked done — compare with the solution'; solved(); }
      if (act === 'hint') {
        if (hintsShown < ex.hints.length) {
          const h = document.createElement('div'); h.className = 'hint';
          h.innerHTML = `<strong>Hint ${hintsShown + 1}.</strong> ${ex.hints[hintsShown++]}`;
          card.querySelector('.hints').appendChild(h); typeset(h);
        }
        if (hintsShown >= ex.hints.length) e.target.disabled = true;
      }
      if (act === 'solution') { const s = card.querySelector('.solution'); s.hidden = !s.hidden; }
    });
  });
  typeset(container);
}

// ---------------------------------------------------------------------------
function init() {
  buildHeader();
  buildFooter();
  buildFeedback();
  if (!document.querySelector('link[href*="fonts.googleapis"]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap';
    document.head.appendChild(l);
  }
  typeset(document.body);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
