/**
 * Content script injetado em instagram.com.
 * Realiza as interações no DOM: curtir, comentar e scrollar.
 */
'use strict';

(() => {
  if (window.__extensaoDoidaInjected) return;
  window.__extensaoDoidaInjected = true;

  const API = globalThis.browser ?? globalThis.chrome;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Normaliza para comparação: minúsculas, sem acentos, sem espaços extras.
  function normalize(s) {
    return (s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // Palavras que indicam a ação "curtir" em vários idiomas.
  const LIKE_WORDS = [
    'curtir', 'curt', 'like', 'gostei', 'gostar', 'gost', 'gusta',
    "j'aime", 'jaime', 'piace', 'gefällt mir', 'gefallt mir'
  ];
  // Palavras que indicam estado "já curtido" (NÃO é a ação de curtir).
  const UNLIKE_WORDS = [
    'descurtir', 'unlike', 'no me gusta', 'nao gostei', 'non mi piace',
    'remover curtida', 'dejar', 'dislike'
  ];

  // Textos do botão de publicar comentário (em vários idiomas).
  const SUBMIT_WORDS = [
    'publicar', 'publish', 'publier', 'enviar', 'post', 'send',
    'comentar', 'comment', 'comentario'
  ];

  function isLikeLabel(raw) {
    const s = normalize(raw);
    if (!s) return false;
    for (const w of UNLIKE_WORDS) {
      if (s.includes(normalize(w))) return false;
    }
    for (const w of LIKE_WORDS) {
      if (s.includes(normalize(w))) return true;
    }
    return false;
  }

  function isCommentLabel(raw) {
    return /^(comentar|comment|comentario|comentarios|comments)$/.test(normalize(raw));
  }

  function isSubmitText(raw) {
    const s = normalize(raw);
    if (!s) return false;
    return SUBMIT_WORDS.some((w) => s === w || s.startsWith(w + ' ') || s.startsWith(w + '\n'));
  }

  function isEnabled(el) {
    return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
  }

  // Repete até achar o elemento (útil após navegação SPA).
  async function waitFor(fn, timeoutMs = 8000, interval = 400) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  // Lê o rótulo de acessibilidade de um elemento (aria-label ou <title> interno).
  function getLabel(el) {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria;
    const title = el.querySelector && el.querySelector('title');
    if (title && title.textContent && title.textContent.trim()) return title.textContent;
    return el.getAttribute('title') || '';
  }

  // Coleta rótulos candidatos da página (para diagnóstico).
  function collectPageLabels() {
    const labels = new Set();
    const sels =
      'svg[aria-label], svg[title], button[aria-label], [role="button"][aria-label], a[aria-label], div[aria-label]';
    for (const el of document.querySelectorAll(sels)) {
      const n = getLabel(el).trim();
      if (n && n.length < 60) labels.add(n);
      if (labels.size >= 30) break;
    }
    return Array.from(labels);
  }

  // Resumo dos botões clicáveis da página (para diagnóstico do publicar).
  function submitCandidatesSummary() {
    const out = [];
    for (const el of document.querySelectorAll('button[type="submit"], button, [role="button"]')) {
      const text = normalize(el.textContent || getLabel(el));
      if (!text || text.length > 30) continue;
      out.push(text + '(' + (isEnabled(el) ? 'on' : 'off') + ')');
      if (out.length >= 12) break;
    }
    return out;
  }

  // Acha o botão de curtir. O Instagram usa <div role="button"> (não <button>).
  function findLikeButton() {
    const sels =
      'svg[aria-label], svg[title], button[aria-label], [role="button"][aria-label], a[aria-label]';
    const candidates = [];
    for (const el of document.querySelectorAll(sels)) {
      if (isLikeLabel(getLabel(el))) {
        const clickable = el.closest('button, [role="button"], a') || el;
        candidates.push(clickable);
      }
    }
    return candidates.find((c) => isVisible(c)) || candidates[0] || null;
  }

  // Botão de comentar (balãozinho) num post do feed.
  function findCommentButton() {
    const sels =
      'svg[aria-label], [role="button"][aria-label], button[aria-label], a[aria-label]';
    for (const el of document.querySelectorAll(sels)) {
      if (isCommentLabel(getLabel(el))) {
        const clickable = el.closest('button, [role="button"], a') || el;
        if (isVisible(clickable)) return clickable;
      }
    }
    return null;
  }

  function findCommentTextarea() {
    for (const ta of document.querySelectorAll('textarea')) {
      const label = (
        (ta.getAttribute('aria-label') || '') +
        ' ' +
        (ta.getAttribute('placeholder') || '')
      ).toLowerCase();
      if ((label.includes('coment') || label.includes('comment')) && isVisible(ta)) {
        return ta;
      }
    }
    return null;
  }

  // Botão de publicar, em 3 camadas (não depende de <form>):
  // 1) perto do textarea; 2) button[type=submit] global; 3) por texto global.
  function findSubmitButton(ta) {
    let node = ta;
    for (let i = 0; i < 8 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      for (const el of node.querySelectorAll('button[type="submit"], button, [role="button"]')) {
        if (isEnabled(el) && isVisible(el) && isSubmitText(el.textContent || getLabel(el))) {
          return el;
        }
      }
    }
    for (const el of document.querySelectorAll('button[type="submit"]')) {
      if (isEnabled(el) && isVisible(el)) return el;
    }
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if (isEnabled(el) && isVisible(el) && isSubmitText(el.textContent || getLabel(el))) {
        return el;
      }
    }
    return null;
  }

  // O Instagram usa React: mexer direto em .value não dispara os listeners.
  // Usamos o setter nativo + InputEvent (mais fiel ao que o React espera).
  function setNativeValue(el, value) {
    const proto =
      el instanceof window.HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;

    let ev;
    try {
      ev = new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value });
    } catch (_) {
      ev = new Event('input', { bubbles: true });
    }
    el.dispatchEvent(ev);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function likePost() {
    const btn = await waitFor(() => findLikeButton(), 8000);
    if (!btn) {
      return { ok: false, reason: 'like_button_not_found', labels: collectPageLabels() };
    }
    btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(500);
    btn.click();
    await sleep(700);
    return { ok: true };
  }

  async function commentPost(text, ta) {
    if (!ta) {
      ta = await waitFor(() => findCommentTextarea(), 8000);
      if (!ta) {
        return { ok: false, reason: 'comment_box_not_found', labels: collectPageLabels() };
      }
    }

    ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(400);
    ta.focus();
    setNativeValue(ta, text);
    await sleep(900);

    const submit = await waitFor(() => findSubmitButton(ta), 5000);
    if (!submit) {
      return {
        ok: false,
        reason: 'submit_not_found',
        labels: collectPageLabels(),
        debug: { taValue: (ta.value || '').slice(0, 40), candidates: submitCandidatesSummary() }
      };
    }

    submit.click();
    await sleep(900);

    // O Instagram limpa o textarea quando o comentário é postado com sucesso.
    const posted = !(ta.value && ta.value.trim());
    if (!posted) {
      return {
        ok: false,
        reason: 'submit_noop',
        labels: collectPageLabels(),
        debug: { taValue: (ta.value || '').slice(0, 40), candidates: submitCandidatesSummary() }
      };
    }
    return { ok: true };
  }

  async function closeModal() {
    const target = document.activeElement || document.body;
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      })
    );
    await sleep(600);

    const closeSvg = document.querySelector(
      'svg[aria-label="Fechar"], svg[aria-label="Close"], svg[aria-label="Cerrar"], svg[aria-label="Fermer"]'
    );
    const closeBtn = closeSvg && (closeSvg.closest('button, [role="button"]') || closeSvg);
    if (closeBtn) closeBtn.click();
    await sleep(300);
  }

  // Modo feed + comentar: abre o post no modal (clicando no balão), comenta e fecha.
  async function openAndComment(text) {
    const btn = await waitFor(() => findCommentButton(), 8000);
    if (!btn) {
      return { ok: false, reason: 'comment_button_not_found', labels: collectPageLabels() };
    }
    btn.click();
    await sleep(1200);

    // No modal, o textarea costuma ficar focado. Prefere o focado; senão, o último.
    let ta = document.activeElement && document.activeElement.tagName === 'TEXTAREA'
      ? document.activeElement
      : null;
    if (!ta) {
      const tas = Array.from(document.querySelectorAll('textarea')).filter((t) => {
        const label = ((t.getAttribute('aria-label') || '') + ' ' + (t.getAttribute('placeholder') || '')).toLowerCase();
        return (label.includes('coment') || label.includes('comment')) && isVisible(t);
      });
      ta = tas[tas.length - 1];
    }
    if (!ta) {
      await closeModal();
      return { ok: false, reason: 'comment_box_not_found', labels: collectPageLabels() };
    }

    const res = await commentPost(text, ta);
    if (res.ok) await closeModal();
    return res;
  }

  // Modo feed: rola a página e tenta curtir o primeiro post visível ainda não curtido.
  async function scrollAndLike(stepPx) {
    window.scrollBy({ top: stepPx || 800, behavior: 'smooth' });
    await sleep(1500); // deixa o conteúdo renderizar
    const res = await likePost();
    return { ...res, liked: res.ok };
  }

  API.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return false;

    // Resposta síncrona de "estou aqui" para o background detectar a injeção.
    if (msg.type === 'ping') {
      sendResponse({ ok: true, ready: true, url: location.href });
      return false;
    }

    (async () => {
      try {
        switch (msg.type) {
          case 'perform':
            sendResponse(msg.action === 'comment' ? await commentPost(msg.comment) : await likePost());
            break;
          case 'scrollAndLike':
            sendResponse(await scrollAndLike(msg.stepPx));
            break;
          case 'openAndComment':
            sendResponse(await openAndComment(msg.comment));
            break;
          default:
            sendResponse({ ok: false, reason: 'unknown_type' });
        }
      } catch (err) {
        sendResponse({ ok: false, reason: 'error', error: String(err) });
      }
    })();

    return true;
  });
})();
