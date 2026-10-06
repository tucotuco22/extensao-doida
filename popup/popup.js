'use strict';

const els = {
  enabled: document.getElementById('enabled'),
  likeEnabled: document.getElementById('likeEnabled'),
  commentEnabled: document.getElementById('commentEnabled'),
  delayMinSec: document.getElementById('delayMinSec'),
  delayMaxSec: document.getElementById('delayMaxSec'),
  scrollStepPx: document.getElementById('scrollStepPx'),
  scrollDelaySec: document.getElementById('scrollDelaySec'),
  maxLikesPerHour: document.getElementById('maxLikesPerHour'),
  maxLikesPerDay: document.getElementById('maxLikesPerDay'),
  maxCommentsPerDay: document.getElementById('maxCommentsPerDay'),
  comments: document.getElementById('comments'),
  postList: document.getElementById('postList'),
  listProgress: document.getElementById('listProgress'),
  cardList: document.getElementById('cardList'),
  cardScroll: document.getElementById('cardScroll'),
  cLikesDay: document.getElementById('cLikesDay'),
  cLikesHour: document.getElementById('cLikesHour'),
  cCommentsDay: document.getElementById('cCommentsDay'),
  save: document.getElementById('save'),
  resetCounters: document.getElementById('resetCounters'),
  restartList: document.getElementById('restartList'),
  testLike: document.getElementById('testLike'),
  testComment: document.getElementById('testComment'),
  toast: document.getElementById('toast')
};

function num(id) {
  const v = parseInt(els[id].value, 10);
  return Number.isFinite(v) ? v : 0;
}

function currentMode() {
  const r = document.querySelector('input[name="mode"]:checked');
  return r ? r.value : 'current';
}

function fillForm(cfg) {
  els.enabled.checked = !!cfg.enabled;
  els.likeEnabled.checked = !!cfg.likeEnabled;
  els.commentEnabled.checked = !!cfg.commentEnabled;
  els.delayMinSec.value = cfg.delayMinSec;
  els.delayMaxSec.value = cfg.delayMaxSec;
  els.scrollStepPx.value = cfg.scrollStepPx;
  els.scrollDelaySec.value = cfg.scrollDelaySec;
  els.maxLikesPerHour.value = cfg.maxLikesPerHour;
  els.maxLikesPerDay.value = cfg.maxLikesPerDay;
  els.maxCommentsPerDay.value = cfg.maxCommentsPerDay;
  els.comments.value = (cfg.comments || []).join('\n');
  els.postList.value = (cfg.postList || []).join('\n');

  const modeInput = document.querySelector(`input[name="mode"][value="${cfg.mode}"]`);
  if (modeInput) modeInput.checked = true;

  renderCounters(cfg.counters);
  renderListProgress(cfg);
  updateVisibility();
}

function renderCounters(c) {
  if (!c) return;
  els.cLikesDay.textContent = c.likesDay;
  els.cLikesHour.textContent = c.likesHour;
  els.cCommentsDay.textContent = c.commentsDay;
}

function renderListProgress(cfg) {
  els.listProgress.textContent = `${cfg.listIndex}/${(cfg.postList || []).length}`;
}

function updateVisibility() {
  const mode = currentMode();
  els.cardList.hidden = mode !== 'list';
  els.cardScroll.hidden = mode !== 'feed';
}

function collect() {
  let min = num('delayMinSec');
  let max = num('delayMaxSec');
  if (min < 1) min = 1;
  if (max < min) max = min;
  return {
    enabled: els.enabled.checked,
    mode: currentMode(),
    likeEnabled: els.likeEnabled.checked,
    commentEnabled: els.commentEnabled.checked,
    delayMinSec: min,
    delayMaxSec: max,
    scrollStepPx: Math.max(200, num('scrollStepPx') || 800),
    scrollDelaySec: Math.max(1, num('scrollDelaySec') || 6),
    maxLikesPerHour: Math.max(0, num('maxLikesPerHour')),
    maxLikesPerDay: Math.max(0, num('maxLikesPerDay')),
    maxCommentsPerDay: Math.max(0, num('maxCommentsPerDay')),
    comments: els.comments.value.split('\n').map((s) => s.trim()).filter(Boolean),
    postList: els.postList.value.split('\n').map((s) => s.trim()).filter(Boolean)
  };
}

function showToast(text, ok = true) {
  els.toast.textContent = text;
  els.toast.className = 'toast ' + (ok ? 'ok' : 'err');
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { els.toast.hidden = true; }, 2500);
}

async function save() {
  const cfg = await loadConfig();
  const merged = { ...cfg, ...collect() };
  await saveConfig(merged);
  renderListProgress(merged);
  showToast('Salvo ✓');
}

els.save.addEventListener('click', save);

// Auto-salva qualquer mudança e alterna a visibilidade dos cards por modo.
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || !t.matches) return;
  if (t.matches('input[name="mode"]')) {
    updateVisibility();
    save();
    return;
  }
  if (t.matches('input, textarea')) {
    save();
  }
});

els.resetCounters.addEventListener('click', async () => {
  const cfg = await loadConfig();
  cfg.counters = { ...DEFAULT_CONFIG.counters };
  await saveConfig(cfg);
  renderCounters(cfg.counters);
  showToast('Contadores zerados');
});

els.restartList.addEventListener('click', async () => {
  try {
    const res = await API.runtime.sendMessage({ type: 'restartList' });
    const ok = res && res.ok;
    showToast(ok ? 'Lista reiniciada ✓' : 'Falhou', ok);
  } catch (e) {
    showToast('Erro: ' + String(e), false);
  }
});

async function test(action) {
  const btn = action === 'like' ? els.testLike : els.testComment;
  btn.disabled = true;
  try {
    const res = await API.runtime.sendMessage({ type: 'runNow', action });
    const ok = res && res.ok;
    let msg = ok ? 'Ação executada ✓' : 'Falhou: ' + (res && res.reason ? res.reason : 'desconhecido');
    if (!ok && res && Array.isArray(res.labels) && res.labels.length) {
      msg += ' — [' + res.labels.slice(0, 8).join(', ') + ']';
    }
    if (!ok && res && res.debug && Array.isArray(res.debug.candidates) && res.debug.candidates.length) {
      msg += ' — botões: [' + res.debug.candidates.slice(0, 10).join(', ') + ']';
    }
    showToast(msg, ok);
  } catch (e) {
    showToast('Erro: ' + String(e), false);
  } finally {
    btn.disabled = false;
  }
}

els.testLike.addEventListener('click', () => test('like'));
els.testComment.addEventListener('click', () => test('comment'));

// Atualiza os contadores e o progresso da lista em tempo real quando o background grava.
API.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    const cfg = changes[STORAGE_KEY].newValue;
    if (!cfg) return;
    if (cfg.counters) renderCounters(cfg.counters);
    renderListProgress(cfg);
  }
});

(async function init() {
  const cfg = await loadConfig();
  fillForm(cfg);
})();
