// Exercises hub: every section's exercises, filterable by topic tag and difficulty, with progress.
import { renderExercises, getProgress, TAGS, tagChip, $, $$ } from '../common.js';
import { SECTIONS } from '../data/exercises/index.js';

const all = SECTIONS.flatMap(s => s.list);
const usedTags = Object.keys(TAGS).filter(t => all.some(e => (e.tags || []).includes(t)));
const state = { tags: new Set(), diff: 0, hideSolved: false };

$('#tag-filter').innerHTML = usedTags.map(t => tagChip(t).replace('<span class="tag"', `<span class="tag" role="button" tabindex="0" aria-pressed="false" data-tag="${t}"`)).join('');

function progress() {
  const p = getProgress();
  const solved = all.filter(e => p[e.id]).length;
  $('#ex-total').textContent = `${solved} of ${all.length} solved`;
  $('#ex-bar').style.width = (100 * solved / Math.max(1, all.length)) + '%';
  $('#ex-sections').innerHTML = SECTIONS.filter(s => s.list.length).map(s => {
    const k = s.list.filter(e => p[e.id]).length;
    return `<div><a href="#sec-${s.id}">${s.title}</a> <span class="muted small">${k}/${s.list.length}</span><div class="progress-bar"><div style="width:${100 * k / s.list.length}%"></div></div></div>`;
  }).join('');
}

function render() {
  const p = getProgress();
  const keep = e => (!state.tags.size || (e.tags || []).some(t => state.tags.has(t)))
    && (!state.diff || (e.difficulty || 1) === state.diff) && (!state.hideSolved || !p[e.id]);
  const groups = $('#ex-groups');
  groups.innerHTML = '';
  let shown = 0;
  for (const s of SECTIONS) {
    const list = s.list.filter(keep);
    if (!list.length) continue;
    shown += list.length;
    const wrap = document.createElement('section');
    wrap.innerHTML = `<h2 id="sec-${s.id}">${s.title} <a class="small" href="${s.page}#exercises" style="font-family:var(--font);font-weight:400">read the section →</a></h2><div></div>`;
    groups.appendChild(wrap);
    const box = wrap.querySelector('div');
    renderExercises(box, list, { startIndex: s.list.indexOf(list[0]) + 1 });
    box.addEventListener('progress', progress);
  }
  if (!shown) groups.innerHTML = '<p class="muted" style="margin-top:24px">No exercises match these filters.</p>';
}

$('#tag-filter').addEventListener('click', e => {
  const el = e.target.closest('[data-tag]'); if (!el) return;
  const t = el.dataset.tag;
  state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
  el.setAttribute('aria-pressed', state.tags.has(t));
  render();
});
$('#tag-filter').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.tag) { e.preventDefault(); e.target.click(); } });
$$('[data-diff]').forEach(b => b.addEventListener('click', () => {
  state.diff = +b.dataset.diff;
  $$('[data-diff]').forEach(x => x.setAttribute('aria-pressed', x === b));
  render();
}));
$('#hide-solved').addEventListener('change', e => { state.hideSolved = e.target.checked; render(); });
$('#clear-filters').addEventListener('click', () => {
  state.tags.clear(); state.diff = 0; state.hideSolved = false;
  $$('[data-tag]').forEach(x => x.setAttribute('aria-pressed', 'false'));
  $$('[data-diff]').forEach((x, i) => x.setAttribute('aria-pressed', i === 0));
  $('#hide-solved').checked = false;
  render();
});
progress();
render();
