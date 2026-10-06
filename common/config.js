/**
 * Compartilhado entre o background e o popup.
 * - Compatibilidade de API (Firefox usa `browser`, Chrome usa `chrome`).
 * - Defaults de configuração e helpers de storage com Promises.
 */
'use strict';

const API = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEY = 'extensaoDoidaConfig';

const MODES = ['current', 'feed', 'list'];

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  mode: 'current', // 'current' | 'feed' | 'list'
  likeEnabled: true,
  commentEnabled: false,
  comments: [
    'Muito bom! 👏',
    'Adorei! 🔥',
    'Que demais! 😍',
    'Top!',
    'Excelente conteúdo!'
  ],
  postList: [], // lista de URLs (modo 'list')
  listIndex: 0, // progresso na lista (runtime)
  delayMinSec: 30,
  delayMaxSec: 120,
  scrollStepPx: 800, // px por scroll (modo 'feed')
  scrollDelaySec: 6, // intervalo entre scrolls (modo 'feed')
  maxLikesPerHour: 25,
  maxLikesPerDay: 150,
  maxCommentsPerDay: 8,
  counters: {
    date: '', // chave do dia (YYYY-MM-DD)
    hour: '', // chave da hora (YYYY-MM-DDTHH)
    likesDay: 0,
    likesHour: 0,
    commentsDay: 0
  }
});

function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      const p = API.storage[area].get(keys);
      if (p && typeof p.then === 'function') {
        p.then(resolve, reject);
      } else {
        API.storage[area].get(keys, (res) => {
          const err = API.runtime && API.runtime.lastError;
          err ? reject(new Error(err.message)) : resolve(res);
        });
      }
    } catch (e) {
      reject(e);
    }
  });
}

function storageSet(area, obj) {
  return new Promise((resolve, reject) => {
    try {
      const p = API.storage[area].set(obj);
      if (p && typeof p.then === 'function') {
        p.then(resolve, reject);
      } else {
        API.storage[area].set(obj, () => {
          const err = API.runtime && API.runtime.lastError;
          err ? reject(new Error(err.message)) : resolve();
        });
      }
    } catch (e) {
      reject(e);
    }
  });
}

function cloneDefault() {
  return {
    ...DEFAULT_CONFIG,
    comments: [...DEFAULT_CONFIG.comments],
    postList: [...DEFAULT_CONFIG.postList],
    counters: { ...DEFAULT_CONFIG.counters }
  };
}

async function loadConfig() {
  const data = await storageGet('local', STORAGE_KEY);
  const saved = data[STORAGE_KEY];
  if (!saved) return cloneDefault();

  const base = cloneDefault();
  return {
    ...base,
    ...saved,
    mode: MODES.includes(saved.mode) ? saved.mode : base.mode,
    comments: Array.isArray(saved.comments) ? saved.comments : base.comments,
    postList: Array.isArray(saved.postList) ? saved.postList : base.postList,
    counters: { ...base.counters, ...(saved.counters || {}) }
  };
}

async function saveConfig(cfg) {
  await storageSet('local', { [STORAGE_KEY]: cfg });
  return cfg;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min, max) {
  if (min > max) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
