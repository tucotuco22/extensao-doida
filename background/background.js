/**
 * Background (event page):
 * - Agenda a próxima ação com delay aleatório via `browser.alarms`.
 * - Controla contadores diários/horários e limites anti-ban.
 * - Modos: 'current' (post atual), 'feed' (scrollar+curtir), 'list' (lista de posts).
 */
'use strict';

const ALARM_NAME = 'extensao-doida-acao';
const COMMENT_PROBABILITY = 0.08; // chance de comentar (quando habilitado) vs curtir

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hourKey(d = new Date()) {
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, '0')}`;
}

// Zera contadores quando vira o dia ou a hora.
async function refreshCounters(cfg) {
  const now = new Date();
  const dk = dateKey(now);
  const hk = hourKey(now);
  if (cfg.counters.date !== dk) {
    cfg.counters.date = dk;
    cfg.counters.likesDay = 0;
    cfg.counters.commentsDay = 0;
  }
  if (cfg.counters.hour !== hk) {
    cfg.counters.hour = hk;
    cfg.counters.likesHour = 0;
  }
  return cfg;
}

// Decide qual ação executar respeitando flags e limites.
function chooseAction(cfg) {
  const c = cfg.counters;
  const canLike =
    cfg.likeEnabled &&
    c.likesHour < cfg.maxLikesPerHour &&
    c.likesDay < cfg.maxLikesPerDay;
  const canComment =
    cfg.commentEnabled &&
    Array.isArray(cfg.comments) &&
    cfg.comments.length > 0 &&
    c.commentsDay < cfg.maxCommentsPerDay;

  if (canLike && canComment) {
    return Math.random() < COMMENT_PROBABILITY ? { type: 'comment' } : { type: 'like' };
  }
  if (canLike) return { type: 'like' };
  if (canComment) return { type: 'comment' };
  return null;
}

async function findInstagramTab() {
  const tabs = await API.tabs.query({ url: '*://*.instagram.com/*' });
  // Prefere páginas de post/reel (estrutura mais previsível).
  const detail = tabs.find((t) => /\/p\/|\/reel\/|\/reels\//.test(t.url || ''));
  return detail || tabs[0] || null;
}

async function dispatchToTab(tabId, action) {
  try {
    const res = await API.tabs.sendMessage(tabId, {
      type: 'perform',
      action: action.type,
      comment: action.comment
    });
    return res || { ok: false, reason: 'no_response' };
  } catch (e) {
    return { ok: false, reason: 'send_error', error: String(e) };
  }
}

async function dispatch(action) {
  const tab = await findInstagramTab();
  if (!tab) return { ok: false, reason: 'no_tab' };
  return dispatchToTab(tab.id, action);
}

/**
 * Executa uma única ação no post visível (modo 'current' e testes manuais).
 */
async function runOnce(forcedAction = null, opts = {}) {
  const manual = !!opts.manual;
  let cfg = await loadConfig();

  if (!manual && !cfg.enabled) return { ok: false, reason: 'disabled' };
  cfg = await refreshCounters(cfg);

  let action;
  if (forcedAction) {
    action = { type: forcedAction };
  } else {
    action = chooseAction(cfg);
    if (!action) return { ok: false, reason: 'limit_reached' };
  }

  if (action.type === 'comment') {
    const pool = cfg.comments.filter(Boolean);
    if (!pool.length) return { ok: false, reason: 'no_comments' };
    action.comment = pool[randInt(0, pool.length - 1)];
  }

  const res = await dispatch(action);

  if (res && res.ok && !manual) {
    if (action.type === 'like') {
      cfg.counters.likesHour += 1;
      cfg.counters.likesDay += 1;
    } else {
      cfg.counters.commentsDay += 1;
    }
  }
  await saveConfig(cfg);
  return res;
}

// Garante uma aba do Instagram e navega para `url`.
async function ensureInstagramTab(url) {
  const tab = await findInstagramTab();
  if (tab) {
    await API.tabs.update(tab.id, { url, active: true });
    return tab.id;
  }
  const created = await API.tabs.create({ url, active: true });
  return created.id;
}

function urlPath(u) {
  try {
    return new URL(u).pathname.replace(/\/+$/, '');
  } catch (_) {
    return String(u || '').replace(/\/+$/, '');
  }
}

// Espera o content script responder e, se `expectedUrl` for informado,
// só confirma quando a URL carregada bater com o post alvo.
async function waitForContentScript(tabId, expectedUrl, timeoutMs = 15000) {
  const expected = urlPath(expectedUrl);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await API.tabs.sendMessage(tabId, { type: 'ping' });
      if (res && res.ok && (!expected || urlPath(res.url) === expected)) {
        return true;
      }
    } catch (_) {
      /* ainda não injetado */
    }
    await sleep(500);
  }
  return false;
}

// Modo 'list': navega até o próximo post da lista e age nele.
async function runListStep() {
  const cfg = await loadConfig();
  await refreshCounters(cfg);

  const urls = cfg.postList.filter(Boolean);
  if (!urls.length) return { ok: false, reason: 'empty_list' };
  if (cfg.listIndex >= urls.length) return { ok: false, reason: 'list_done' };

  const action = chooseAction(cfg);
  if (!action) return { ok: false, reason: 'limit_reached' };
  if (action.type === 'comment') {
    const pool = cfg.comments.filter(Boolean);
    if (!pool.length) return { ok: false, reason: 'no_comments' };
    action.comment = pool[randInt(0, pool.length - 1)];
  }

  const url = urls[cfg.listIndex];

  let tabId;
  try {
    tabId = await ensureInstagramTab(url);
  } catch (e) {
    return { ok: false, reason: 'nav_error', error: String(e) };
  }

  const ready = await waitForContentScript(tabId, url);
  if (!ready) return { ok: false, reason: 'not_ready' };

  const res = await dispatchToTab(tabId, action);
  if (res && res.ok) {
    if (action.type === 'like') {
      cfg.counters.likesHour += 1;
      cfg.counters.likesDay += 1;
    } else {
      cfg.counters.commentsDay += 1;
    }
  }
  cfg.listIndex += 1;
  await saveConfig(cfg);
  return res;
}

// Modo 'feed': rola e curte, ou (se comentário habilitado) abre o post, comenta e fecha.
async function runFeedStep() {
  const cfg = await loadConfig();
  await refreshCounters(cfg);

  const action = chooseAction(cfg);
  if (!action) return { ok: false, reason: 'limit_reached' };

  const tab = await findInstagramTab();
  if (!tab) return { ok: false, reason: 'no_tab' };

  let res;
  try {
    if (action.type === 'comment') {
      const pool = cfg.comments.filter(Boolean);
      if (!pool.length) return { ok: false, reason: 'no_comments' };
      res = await API.tabs.sendMessage(tab.id, {
        type: 'openAndComment',
        comment: pool[randInt(0, pool.length - 1)]
      });
    } else {
      res = await API.tabs.sendMessage(tab.id, {
        type: 'scrollAndLike',
        stepPx: cfg.scrollStepPx || 800
      });
    }
  } catch (e) {
    return { ok: false, reason: 'send_error', error: String(e) };
  }

  if (res && res.ok) {
    if (action.type === 'like') {
      cfg.counters.likesHour += 1;
      cfg.counters.likesDay += 1;
    } else {
      cfg.counters.commentsDay += 1;
    }
  }
  await saveConfig(cfg);
  return res || { ok: false, reason: 'no_response' };
}

async function scheduleNext() {
  const cfg = await loadConfig();
  let delaySec;
  if (cfg.mode === 'feed') {
    const base = Math.max(1, Number(cfg.scrollDelaySec) || 6);
    delaySec = Math.max(1, Math.round(base * (0.8 + Math.random() * 0.4)));
  } else {
    const min = Math.max(1, Number(cfg.delayMinSec) || 30);
    const max = Math.max(min, Number(cfg.delayMaxSec) || 120);
    delaySec = randInt(min, max);
  }
  await API.alarms.create(ALARM_NAME, { delayInMinutes: delaySec / 60 });
}

async function stopScheduling() {
  await API.alarms.clear(ALARM_NAME);
}

async function startScheduling() {
  const cfg = await loadConfig();
  if (!cfg.enabled) return;
  await API.alarms.clear(ALARM_NAME);
  // Primeira ação em ~6s para feedback rápido após ativar.
  await API.alarms.create(ALARM_NAME, { delayInMinutes: 0.1 });
}

API.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const cfg = await loadConfig();
  if (!cfg.enabled) return;

  let res;
  if (cfg.mode === 'feed') res = await runFeedStep();
  else if (cfg.mode === 'list') res = await runListStep();
  else res = await runOnce();

  // No modo lista, para ao concluir (ou se não há lista).
  if (cfg.mode === 'list' && res && (res.reason === 'list_done' || res.reason === 'empty_list')) {
    await stopScheduling();
    return;
  }
  await scheduleNext();
});

// Gatilhos manuais vindos do popup.
API.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === 'runNow') {
    runOnce(msg.action, { manual: true })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, reason: 'error', error: String(e) }));
    return true;
  }

  if (msg.type === 'restartList') {
    (async () => {
      const cfg = await loadConfig();
      cfg.listIndex = 0;
      await saveConfig(cfg);
      if (cfg.enabled) await startScheduling();
      return { ok: true };
    })()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, reason: 'error', error: String(e) }));
    return true;
  }

  return false;
});

// Reage apenas quando a flag `enabled` muda de valor (liga/desliga o agendamento).
API.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  const oldVal = changes[STORAGE_KEY].oldValue;
  const newVal = changes[STORAGE_KEY].newValue;
  const wasEnabled = !!(oldVal && oldVal.enabled);
  const isEnabled = !!(newVal && newVal.enabled);
  if (wasEnabled === isEnabled) return;

  if (isEnabled) startScheduling();
  else stopScheduling();
});

API.runtime.onInstalled.addListener(() => {
  startScheduling();
});

API.runtime.onStartup.addListener(() => {
  startScheduling();
});
