/* Лапа — клієнтська логіка магазину (без фреймворків).
   Модулі: формат, сховище, аналітика, кошик, шапка, анімації, пошук, картки, каталог, товар і галерея,
   калькулятор, сцена з точками, кошик-сторінка, оформлення, подяка, обране. */
(() => {
  'use strict';
  const CFG = Object.assign({ free: 0, sub: 0, cadences: [2, 3, 4, 5, 6, 8], cadence: 4, promo: {}, endpoint: '', npFrom: 90, pets: [], colls: [] }, window.LAPA || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NB = '\u00a0'; // нерозривний пробіл: «1 960,80 ₴», «4 тижні» не розриваються
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Портативна копія (відкривається з диска, file://): шляхи від кореня → відносні, каталоги → index.html
  const ROOT = window.LAPA_ROOT;
  const R = (u) => {
    if (!ROOT || typeof u !== 'string' || u[0] !== '/' || u[1] === '/') return u;
    const m = u.match(/^([^?#]*)(.*)$/); let path = m[1].slice(1);
    if (path === '' || path.endsWith('/')) path += 'index.html';
    return ROOT + path + m[2];
  };

  /* ---------------- формат ---------------- */
  const money = (v) => {
    if (v == null || isNaN(v)) return '';
    let whole = Math.floor(v + 1e-9);
    let frac = Math.round((v - whole) * 100);
    if (frac === 100) { whole += 1; frac = 0; }
    return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (frac ? ',' + String(frac).padStart(2, '0') : '') + NB + '₴';
  };
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    return b === 1 ? one : many;
  };
  const goods = (n) => n + NB + plural(n, 'товар', 'товари', 'товарів');
  const weeks = (n) => n + NB + plural(n, 'тиждень', 'тижні', 'тижнів');
  const subOn = () => Number(CFG.sub) > 0;
  const subPrice = (p) => Math.round(p * (100 - (CFG.sub || 0))) / 100;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateUA = (d) => d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }).replace(/ /g, NB);
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
  const svg = (paths, w = 1.8) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICON = {
    bag: svg('<path d="M5 8h14l-1 12.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8L5 8Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
    heart: svg('<path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 8.3-3.6L12 8.3l.7-.9A4.6 4.6 0 0 1 21 11c-2 4.6-9 9-9 9Z"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4"/>'),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.2),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  };

  /* ---------------- сховище й аналітика ---------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('lapa:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('lapa:' + k, JSON.stringify(v)); } catch (e) { /* приватний режим */ } },
  };
  const track = (event, data) => { window.dataLayer = window.dataLayer || []; window.dataLayer.push(Object.assign({ event }, data || {})); };
  const gaItem = (x) => ({ item_id: x.id, item_name: x.t, item_brand: x.b, item_variant: x.l, price: x.mode === 'sub' ? subPrice(x.p) : x.p, quantity: x.q || 1 });

  /* ---------------- сервер магазину: є, якщо сайт запущено через server/app.py ---------------- */
  // Без сервера (статичний хостинг, портативна копія) усе працює як демо: замовлення лишаються в браузері.
  const API = {
    p: null,
    ready() {
      if (!this.p) {
        this.p = ROOT || location.protocol === 'file:' ? Promise.resolve(null)
          : fetch('/api/health', { credentials: 'same-origin', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      }
      return this.p;
    },
    async call(method, url, body) {
      const opt = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
      if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
      let r;
      try { r = await fetch(url, opt); } catch (e) { throw Object.assign(new Error('Немає з’єднання. Перевірте інтернет і спробуйте ще раз.'), { status: 0 }); }
      let data = null;
      try { data = await r.json(); } catch (e) { /* відповідь не JSON */ }
      if (!r.ok) throw Object.assign(new Error((data && data.error) || 'Сервер не відповідає. Спробуйте за хвилину.'), { status: r.status, data });
      return data;
    },
  };
  const apiGet = (u) => API.call('GET', u);
  const apiPost = (u, b) => API.call('POST', u, b || {});

  /* підписка: доставок на рік, ціна на місяць, економія — так само рахує сервер (server/shop.py) */
  const perYear = (cad) => Math.round(52 / cad);
  const subNums = (p, q, cad) => { const s = subPrice(p), n = perYear(cad); return { del: Math.round(s * q * 100) / 100, full: Math.round(p * q * 100) / 100, n, month: (s * q * n) / 12, year: (p - s) * q * n }; };
  const approx = (v) => '≈' + NB + money(Math.round(v));
  const isoDay = (n) => { const d = addDays(n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const fromISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const dateISO = (s) => (s ? dateUA(fromISO(s)) : '');

  /* форми: телефон, помилка біля поля, кнопка «зайнято» */
  const fmtPhone = (raw) => {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '38' + d; else if (d.startsWith('80')) d = '3' + d; else if (!d.startsWith('380') && d.length) d = '380' + d;
    d = d.slice(0, 12);
    const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)].filter(Boolean);
    return p.length ? '+' + p.join(' ') : '';
  };
  const phoneOK = (v) => /^\+380 \d{2} \d{3} \d{2} \d{2}$/.test(v);
  function bindPhone(input) {
    input.addEventListener('input', () => { input.value = fmtPhone(input.value); });
    input.addEventListener('focus', () => { if (!input.value) input.value = '+380 '; });
  }
  function setErr(el, msg) {
    const field = el.closest('.field') || el.closest('.check') || el.parentElement;
    let m = field.querySelector('.error-msg');
    el.classList.toggle('is-invalid', !!msg); el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg) { if (!m) { m = document.createElement('span'); m.className = 'error-msg'; m.setAttribute('role', 'alert'); field.appendChild(m); } m.textContent = msg; } else if (m) m.remove();
  }
  const busy = (b, on) => { if (!b) return; b.disabled = on; b.classList.toggle('is-loading', on); };

  /* ---------------- тости ---------------- */
  function toast(html, ms = 3600, text = false) {
    const zone = $('[data-toasts]');
    if (!zone) return;
    const el = document.createElement('div');
    el.className = 'toast' + (text ? ' is-text' : '');
    el.innerHTML = html;
    zone.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s, transform .3s'; el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 320); }, ms);
  }
  const bumpCart = () => $$('[data-cart-count]').forEach((el) => { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); });

  /* ---------------- кошик ---------------- */
  const Cart = {
    items: store.get('cart', []),
    promo: store.get('promo', ''),
    lastKey: null,
    save() { store.set('cart', this.items); store.set('promo', this.promo); renderCart(); },
    key: (id, vi, mode) => `${id}:${vi}:${mode}`,
    add(item, qty) {
      if (item.mode === 'sub' && !subOn()) item.mode = 'once';
      const k = this.key(item.id, item.vi, item.mode);
      const ex = this.items.find((x) => x.key === k);
      if (ex) { ex.q = Math.min(99, ex.q + qty); if (item.mode === 'sub') ex.cad = item.cad; } else this.items.push(Object.assign({}, item, { key: k, q: qty }));
      this.lastKey = k;
      this.save();
      bumpCart();
      track('add_to_cart', { ecommerce: { currency: 'UAH', value: (item.mode === 'sub' ? subPrice(item.p) : item.p) * qty, items: [gaItem(Object.assign({}, item, { q: qty }))] } });
    },
    find(k) { return this.items.find((x) => x.key === k); },
    setQty(k, q) { const x = this.find(k); if (!x) return; x.q = Math.max(1, Math.min(99, q || 1)); this.save(); },
    remove(k) { const x = this.find(k); this.items = this.items.filter((i) => i.key !== k); this.save(); if (x) track('remove_from_cart', { ecommerce: { items: [gaItem(x)] } }); },
    setMode(k, mode, cad) {
      const x = this.find(k); if (!x) return;
      const nk = this.key(x.id, x.vi, mode);
      const other = this.find(nk);
      if (other && other !== x) { other.q = Math.min(99, other.q + x.q); this.items = this.items.filter((i) => i !== x); } else { x.mode = mode; x.key = nk; if (cad) x.cad = cad; }
      this.save();
    },
    setCad(k, cad) { const x = this.find(k); if (x) { x.cad = cad; this.save(); } },
    clear() { this.items = []; this.promo = ''; this.save(); },
    count() { return this.items.reduce((a, x) => a + x.q, 0); },
    totals() {
      let full = 0, subDisc = 0, promoBase = 0;
      this.items.forEach((x) => {
        if (x.mode === 'sub' && !subOn()) x.mode = 'once';
        full += x.p * x.q;
        if (x.mode === 'sub') subDisc += (x.p - subPrice(x.p)) * x.q; else promoBase += x.p * x.q;
      });
      const pct = this.promo && CFG.promo[this.promo] ? CFG.promo[this.promo] : 0;
      const promoDisc = Math.round(promoBase * pct) / 100;
      const total = Math.round((full - subDisc - promoDisc) * 100) / 100;
      // наповнювачі важкі: якщо вони понад половину суми, безкоштовна доставка не діє (правило з бізнес-плану)
      const litter = this.items.reduce((a, x) => a + (x.k === 'litter' ? (x.mode === 'sub' ? subPrice(x.p) : x.p) * x.q : 0), 0);
      const heavy = Boolean(CFG.litterRule) && total > 0 && litter / total > 0.5;
      const free = CFG.free > 0 && total >= CFG.free && !heavy;
      return { full, subDisc: Math.round(subDisc * 100) / 100, promoDisc, total, free, heavy, left: CFG.free > 0 && !heavy ? Math.max(0, CFG.free - total) : 0, count: this.count() };
    },
  };

  const cadOptions = (sel) => CFG.cadences.map((c) => `<option value="${c}"${c === sel ? ' selected' : ''}>кожні ${weeks(c)}</option>`).join('');

  function lineHTML(x, compact) {
    const price = (x.mode === 'sub' ? subPrice(x.p) : x.p) * x.q;
    const full = x.p * x.q;
    const strike = x.mode === 'sub' ? full : (x.o ? x.o * x.q : null);
    const mode = !compact && x.sb && subOn() ? `<div class="line__mode">
        <label class="check"><input type="checkbox" data-sub-toggle${x.mode === 'sub' ? ' checked' : ''}>Підписка −${CFG.sub}%</label>
        ${x.mode === 'sub' ? `<select class="select" data-cad aria-label="Частота доставки">${cadOptions(x.cad || CFG.cadence)}</select>` : ''}</div>`
      : (x.mode === 'sub' ? `<div class="line__mode"><span class="badge badge--sub">Підписка · кожні ${weeks(x.cad || CFG.cadence)}</span></div>` : '');
    const qty = compact ? `<span class="muted">× ${x.q}</span>` : `<div class="stepper stepper--sm"><button type="button" data-q="-1" aria-label="Менше">−</button><input type="number" min="1" max="99" value="${x.q}" aria-label="Кількість" data-qinput><button type="button" data-q="1" aria-label="Більше">+</button></div>`;
    return `<li class="line${x.key === Cart.lastKey ? ' is-new' : ''}" data-key="${esc(x.key)}">
      <a class="line__img" href="${esc(R(x.u))}"><img src="${esc(R(x.i))}" alt="" width="84" height="84" loading="lazy"></a>
      <div>
        <div class="line__top"><div><a class="line__t" href="${esc(R(x.u))}">${esc(x.t)}</a><p class="line__v">${esc([x.l && x.l !== '1 шт' ? x.l : ''].filter(Boolean).join(' · '))}</p></div>
        ${compact ? '' : `<button class="line__rm" type="button" data-rm aria-label="Видалити ${esc(x.t)}">${ICON.trash}</button>`}</div>
        ${mode}
        <div class="line__bottom">${qty}<div class="line__p">${money(price)}${strike && strike > price ? `<s>${money(strike)}</s>` : ''}</div></div>
      </div></li>`;
  }

  function shipText(t) {
    if (t.free) return 'безкоштовно';
    return 'за тарифами НП';
  }
  function summaryRows(t) {
    return `<div class="sumrows">
      <div class="sumrow"><span>Товари (${t.count})</span><b>${money(t.full)}</b></div>
      ${t.subDisc ? `<div class="sumrow sumrow--save"><span>Знижка за підпискою</span><b>−${money(t.subDisc)}</b></div>` : ''}
      ${t.promoDisc ? `<div class="sumrow sumrow--save"><span>Промокод ${esc(Cart.promo)}</span><b>−${money(t.promoDisc)}</b></div>` : ''}
      <div class="sumrow"><span>Доставка</span><b>${shipText(t)}</b></div>
      <div class="sumrow sumrow--total"><span>Разом</span><b>${money(t.total)}</b></div></div>`;
  }
  function shipbarHTML(t) {
    const pct = Math.min(100, Math.round((t.total / CFG.free) * 100));
    if (t.heavy) return '<p><b>Доставка за тарифом перевізника</b> — понад половину замовлення становлять наповнювачі, вони важкі.</p>';
    return t.free ? `<p><b>Доставка безкоштовна</b> — сума замовлення від ${money(CFG.free)}</p><div class="gauge"><span style="width:100%"></span></div>`
      : `<p>До безкоштовної доставки: <b>${money(t.left)}</b></p><div class="gauge"><span style="width:${pct}%"></span></div>`;
  }
  const deliveryHint = (t) => CFG.free > 0
    ? (t.heavy ? `Понад половину суми — наповнювачі, тому доставка за тарифами Нової пошти (від ${CFG.npFrom} ₴).` : t.free ? 'Доставка безкоштовна.' : `Доставку оплачуєте за тарифами Нової пошти (від ${CFG.npFrom} ₴). До безкоштовної — ${money(t.left)}.`)
    : `Доставку оплачуєте за тарифами Нової пошти — від ${CFG.npFrom} ₴ за посилку до 2 кг.`;

  const emptyCart = `<div class="cart-empty">${svg('<path d="M5 8h14l-1 12.2a1 1 0 0 1-1 .8H7a1 1 0 0 1-1-.8L5 8Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>', 1.6)}
    <h3>Кошик порожній</h3><p>Почніть із розділу для вашого улюбленця.</p>
    <div class="hero__ctas">${CFG.pets.slice(0, 2).map((p) => `<a class="btn btn--brand" href="${R(p.u)}">${esc(p.t)}</a>`).join('')}</div></div>`;

  function renderCart() {
    const t = Cart.totals();
    $$('[data-cart-count]').forEach((el) => { el.textContent = t.count; el.hidden = !t.count; });
    $$('[data-cart-sum]').forEach((el) => { el.textContent = t.count ? money(t.total) : ''; el.hidden = !t.count; });
    const drawer = $('[data-drawer]');
    if (drawer) {
      $('[data-cart-count-text]', drawer).textContent = t.count ? ' ' + goods(t.count) : '';
      const bar = $('[data-shipbar]', drawer);
      bar.hidden = !t.count || !(CFG.free > 0);
      bar.className = 'shipbar' + (t.free ? ' is-free' : '');
      if (CFG.free > 0) bar.innerHTML = shipbarHTML(t);
      $('[data-cart-lines]', drawer).innerHTML = t.count ? Cart.items.map((x) => lineHTML(x)).join('') : `<li>${emptyCart}</li>`;
      $('[data-cart-foot]', drawer).innerHTML = t.count ? `${summaryRows(t)}<a class="btn btn--brand btn--lg btn--block" href="${R('/zamovlennia/')}">Оформити замовлення</a><a class="link" href="${R('/koshyk/')}">Переглянути кошик</a>` : '';
      $('[data-cart-foot]', drawer).hidden = !t.count;
    }
    renderCartPage();
    renderCheckoutSummary();
  }

  /* шухляда */
  let lastFocus = null;
  function openDrawer() {
    const d = $('[data-drawer]'); if (!d) return;
    lastFocus = document.activeElement;
    d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    setTimeout(() => { const b = $('.drawer__head button', d); if (b) b.focus(); }, 60);
    track('view_cart', { ecommerce: { currency: 'UAH', value: Cart.totals().total, items: Cart.items.map(gaItem) } });
  }
  function closeDrawer() {
    const d = $('[data-drawer]'); if (!d || !d.classList.contains('is-open')) return;
    d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true');
    document.documentElement.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  function bindLines(root) {
    root.addEventListener('click', (e) => {
      const line = e.target.closest('.line'); if (!line) return;
      const k = line.dataset.key;
      if (e.target.closest('[data-rm]')) { Cart.remove(k); return; }
      const step = e.target.closest('[data-q]');
      if (step) { const x = Cart.find(k); if (x) Cart.setQty(k, x.q + Number(step.dataset.q)); }
    });
    root.addEventListener('change', (e) => {
      const line = e.target.closest('.line'); if (!line) return;
      const k = line.dataset.key;
      if (e.target.matches('[data-sub-toggle]')) Cart.setMode(k, e.target.checked ? 'sub' : 'once', CFG.cadence);
      else if (e.target.matches('[data-cad]')) Cart.setCad(k, Number(e.target.value));
      else if (e.target.matches('[data-qinput]')) Cart.setQty(k, Number(e.target.value));
    });
  }

  /* ---------------- обране ---------------- */
  const Wish = {
    ids: store.get('wish', []),
    has(id) { return this.ids.includes(id); },
    toggle(id) { if (this.has(id)) this.ids = this.ids.filter((x) => x !== id); else this.ids.unshift(id); store.set('wish', this.ids); this.render(); return this.has(id); },
    render() {
      $$('[data-wish-count]').forEach((el) => { el.textContent = this.ids.length; el.hidden = !this.ids.length; });
      $$('[data-wish]').forEach((b) => b.setAttribute('aria-pressed', this.has(b.dataset.wish) ? 'true' : 'false'));
    },
  };

  /* ---------------- картки товарів ---------------- */
  const cardCache = new WeakMap();
  function cardData(card) {
    if (!cardCache.has(card)) cardCache.set(card, { v: JSON.parse(card.dataset.v || '[]'), f: JSON.parse(card.dataset.f || '{}') });
    return cardCache.get(card);
  }
  function setCardVariant(card, i) {
    const { v } = cardData(card);
    const x = v[i]; if (!x) return;
    card.dataset.cur = i;
    $$('.vchip', card).forEach((b) => { const on = Number(b.dataset.vi) === i; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    const now = $('[data-pnow]', card), old = $('[data-pold]', card), unit = $('[data-punit]', card), sub = $('[data-psub]', card), img = $('[data-img]', card);
    if (now) { now.textContent = money(x.p); now.classList.toggle('is-sale', !!x.o); }
    if (old) { old.textContent = x.o ? money(x.o) : ''; old.hidden = !x.o; }
    if (unit) unit.textContent = x.u || '';
    if (sub) sub.textContent = money(subPrice(x.p));
    const pl = $('[data-plabel]', card), plw = $('[data-plabel-wrap]', card);
    if (pl) { pl.textContent = x.l && x.l !== '1 шт' ? x.l : ''; if (plw) plw.hidden = !pl.textContent; }
    if (img && x.i && !/-720\.webp$/.test(img.getAttribute('src'))) { if (img.getAttribute('src') !== R(x.i)) img.src = R(x.i); }
    else if (img && x.i) { const big = R(x.i.replace('-360.webp', '-720.webp')); if (img.getAttribute('src') !== big) img.src = big; }
    const add = $('[data-add]', card) || $('.pcard__add', card);
    if (add) { add.disabled = !x.a; const t = $('.t', add); if (t) t.textContent = x.a ? 'У кошик' : 'Немає'; }
  }
  function confirmButton(btn, label = 'Додано') {
    if (!btn) return;
    const t = $('.t', btn), prev = btn.innerHTML;
    btn.classList.add('is-done');
    if (t) btn.innerHTML = ICON.check + `<span class="t">${label}</span>`;
    clearTimeout(btn._lapaT);
    btn._lapaT = setTimeout(() => { btn.classList.remove('is-done'); if (t) btn.innerHTML = prev; }, 1600);
  }
  function addFromCard(card, btn) {
    const { v } = cardData(card);
    const i = Number(card.dataset.cur ?? card.dataset.d ?? 0);
    const x = v[i];
    if (!x || !x.a) return;
    const item = { id: card.dataset.id, vi: i, t: card.dataset.t, b: card.dataset.b, l: x.l, u: card.dataset.url, i: x.i, p: x.p, o: x.o, mode: 'once', cad: CFG.cadence, sb: card.dataset.sub === '1', k: card.dataset.k || '' };
    Cart.add(item, 1);
    confirmButton(btn);
    toast(`<img src="${esc(R(x.i))}" alt=""><div><b>${ICON.check}Додано в кошик</b><small>${esc(item.t)}${x.l && x.l !== '1 шт' ? ' · ' + esc(x.l) : ''}</small></div><a href="${R('/koshyk/')}" data-cart-open>Кошик</a>`);
  }

  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.pcard .vchip');
    if (chip) { e.preventDefault(); setCardVariant(chip.closest('.pcard'), Number(chip.dataset.vi)); return; }
    const add = e.target.closest('.pcard [data-add]');
    if (add) { e.preventDefault(); addFromCard(add.closest('.pcard'), add); return; }
    const wish = e.target.closest('[data-wish]');
    if (wish) {
      e.preventDefault();
      const on = Wish.toggle(wish.dataset.wish);
      toast(on ? `<div><b>Додано в обране</b><small>Зберігається в цьому браузері</small></div><a href="${R('/obrane/')}">Обране</a>`
        : `<div><b>Прибрано з обраного</b><small>Повернути можна будь-коли</small></div><a href="${R('/obrane/')}">Обране</a>`, 2600, true);
      return;
    }
    const open = e.target.closest('[data-cart-open]');
    if (open) { e.preventDefault(); openDrawer(); return; }
    if (e.target.closest('[data-cart-close]')) { e.preventDefault(); closeDrawer(); }
  });

  /* ---------------- шапка, меню, вкладки ---------------- */
  function initHeader() {
    const hdr = $('[data-hdr]');
    if (hdr) { const onScroll = () => hdr.classList.toggle('is-stuck', window.scrollY > 8); onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); }
    const mega = $('[data-mega]'), toggle = $('[data-mega-toggle]');
    if (mega && toggle) {
      const set = (open) => { mega.hidden = !open; toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) { const a = $('a', mega); if (a && document.activeElement === toggle && toggle._kbd) a.focus(); } };
      toggle.addEventListener('keydown', () => { toggle._kbd = true; });
      toggle.addEventListener('click', (e) => { e.stopPropagation(); set(mega.hidden); toggle._kbd = false; });
      document.addEventListener('click', (e) => { if (!mega.hidden && !mega.contains(e.target)) set(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mega.hidden) { set(false); toggle.focus(); } });
    }
    const mm = $('[data-mmenu]');
    if (mm) {
      const open = () => { mm.hidden = false; requestAnimationFrame(() => mm.classList.add('is-open')); document.documentElement.style.overflow = 'hidden'; setTimeout(() => { const b = $('[data-mmenu-close]', mm); if (b) b.focus(); }, 60); };
      const close = () => { mm.classList.remove('is-open'); document.documentElement.style.overflow = ''; setTimeout(() => { mm.hidden = true; }, 300); };
      $$('[data-mmenu-open]').forEach((b) => b.addEventListener('click', open));
      $$('[data-mmenu-close]', mm).forEach((b) => b.addEventListener('click', close));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mm.hidden) close(); });
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
    const demo = $('[data-demo-note]');
    if (demo) { if (store.get('demo-hidden', false)) demo.remove(); else $('[data-demo-close]', demo).addEventListener('click', () => { store.set('demo-hidden', true); demo.remove(); }); }
    $$('[data-tabs]').forEach((tabs) => {
      const btns = $$('[data-tab]', tabs);
      const show = (b) => {
        btns.forEach((x) => x.setAttribute('aria-selected', x === b ? 'true' : 'false'));
        $$('[data-tabpanel]').forEach((p) => {
          const on = p.dataset.tabpanel === b.dataset.tab;
          p.hidden = !on;
          if (on && !reduceMotion) { p.classList.remove('is-swap'); void p.offsetWidth; p.classList.add('is-swap'); }
        });
      };
      tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b); });
      tabs.addEventListener('keydown', (e) => {
        const i = btns.indexOf(document.activeElement); if (i < 0) return;
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (step) { e.preventDefault(); const n = btns[(i + step + btns.length) % btns.length]; n.focus(); show(n); }
      });
    });
  }

  /* ---------------- анімації: перший екран і поява секцій ---------------- */
  function initMotion() {
    const hero = $('[data-hero]');
    if (hero) { const go = () => hero.classList.add('is-ready'); requestAnimationFrame(() => requestAnimationFrame(go)); setTimeout(go, 120); }
    const els = $$('[data-reveal]');
    if (!els.length) return;
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.95) el.classList.add('is-in'); else io.observe(el);
    });
  }

  /* ---------------- сцена з точками ---------------- */
  function initScene() {
    const scene = $('[data-scene]'); if (!scene) return;
    const spots = $$('[data-spot]', scene);
    const closeAll = (except) => spots.forEach((s) => { if (s !== except) { s.classList.remove('is-open'); $('.spot__btn', s).setAttribute('aria-expanded', 'false'); } });
    spots.forEach((s) => {
      const btn = $('.spot__btn', s);
      const hover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // миша: картка вже видна при наведенні — клік одразу відкриває товар; дотик: перший дотик показує картку
        if (hover && s.classList.contains('is-open') && !s._kbd) { location.href = $('.spot__card', s).href; return; }
        const open = !s.classList.contains('is-open'); closeAll(s); s.classList.toggle('is-open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') s._kbd = true; });
      btn.addEventListener('blur', () => { s._kbd = false; });
      if (hover) {
        s.addEventListener('mouseenter', () => { closeAll(s); s.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); });
        s.addEventListener('mouseleave', () => { s.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); });
      }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('[data-spot]')) closeAll(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
    if (!reduceMotion && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { spots.forEach((s, i) => setTimeout(() => s.classList.add('is-ping'), i * 220)); io.disconnect(); } }, { threshold: 0.5 });
      io.observe(scene);
    }
  }

  /* ---------------- пошук ---------------- */
  let indexPromise = null;
  const fetchIndex = () => (ROOT
    ? new Promise((ok, fail) => { if (window.LAPA_INDEX) return ok(window.LAPA_INDEX); const sc = document.createElement('script'); sc.src = R('/assets/data/search.js'); sc.onload = () => (window.LAPA_INDEX ? ok(window.LAPA_INDEX) : fail(new Error('index'))); sc.onerror = fail; document.head.appendChild(sc); })
    : fetch('/assets/data/search.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
  const loadIndex = () => (indexPromise = indexPromise || fetchIndex().catch((e) => { indexPromise = null; throw e; }));
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[’'`ʼ]/g, '').replace(/\s+/g, ' ').trim();
  function searchIn(items, q) {
    const toks = norm(q).split(' ').filter(Boolean);
    if (!toks.length) return [];
    return items.map((it) => {
      const hay = it._q || (it._q = norm(it.q));
      if (!toks.every((t) => hay.includes(t))) return null;
      const title = norm(it.t);
      let s = 0;
      toks.forEach((t) => { if (title.includes(t)) s += 3; if (title.startsWith(t)) s += 2; if (norm(it.b).startsWith(t)) s += 2; });
      s += it.h ? 1 : 0; s -= it.st ? 0 : 5;
      return { it, s };
    }).filter(Boolean).sort((a, b) => b.s - a.s || a.it.r - b.it.r).map((x) => x.it);
  }
  const sections = () => CFG.pets.concat(CFG.colls);
  function initSearch() {
    const form = $('[data-search]'); if (!form) return;
    const input = $('input', form), pop = $('[data-search-pop]', form);
    let active = -1, timer = null, seq = 0;
    const close = () => { pop.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); };
    const show = (html) => { pop.innerHTML = html; pop.hidden = false; input.setAttribute('aria-expanded', 'true'); };
    const render = async () => {
      const q = input.value.trim();
      if (q.length < 2) { close(); return; }
      const my = ++seq;
      if (!indexPromise) show('<div class="search__state search__state--loading">Шукаємо…</div>');
      let items;
      try { items = await loadIndex(); } catch (e) {
        if (my === seq) show('<div class="search__state"><b>Пошук тимчасово недоступний</b>Не вдалося завантажити каталог. Перевірте з’єднання.<button class="btn btn--ghost btn--sm" type="button" data-retry>Спробувати ще раз</button></div>');
        return;
      }
      if (my !== seq) return;
      const res = searchIn(items, q);
      const nq = norm(q);
      const secs = sections().filter((s) => norm(s.t).includes(nq) || nq.split(' ').some((t) => t.length > 2 && norm(s.t).includes(t)));
      const chips = secs.length ? `<div class="search__cats">${secs.slice(0, 6).map((s) => `<a class="chip" href="${R(s.u)}">${esc(s.t)}</a>`).join('')}</div>` : '';
      if (!res.length) {
        const all = sections().slice(0, 8).map((s) => `<a class="chip" href="${R(s.u)}">${esc(s.t)}</a>`).join('');
        show(`<div class="search__state"><b>Нічого не знайшли за «${esc(q)}»</b>Перевірте написання або оберіть розділ:</div><div class="search__cats">${all}</div>`);
        return;
      }
      show(chips + res.slice(0, 6).map((it, i) => {
        const v = it.v[it.d] || it.v[0];
        const min = Math.min(...it.v.map((x) => x.p));
        return `<a class="sug${i === active ? ' is-active' : ''}" href="${R(it.u)}" role="option"><img src="${R(v.i)}" alt="" width="56" height="56"><span><b>${esc(it.t)}</b><small>${esc(it.m)}</small></span><span class="p">${it.v.length > 1 ? 'від ' : ''}${money(min)}</span></a>`;
      }).join('') + `<a class="search__all" href="${R('/poshuk/?q=' + encodeURIComponent(q))}">Усі результати (${res.length})${ICON.arrow}</a>`);
    };
    input.addEventListener('focus', () => { loadIndex().catch(() => {}); if (input.value.trim().length >= 2) render(); });
    input.addEventListener('input', () => { clearTimeout(timer); active = -1; timer = setTimeout(render, 120); });
    pop.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) { e.preventDefault(); render(); } });
    input.addEventListener('keydown', (e) => {
      const links = $$('.sug', pop);
      if (e.key === 'Escape') { close(); return; }
      if (pop.hidden || !links.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => l.classList.toggle('is-active', i === active));
        links[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = links[active].href; }
    });
    document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
    form.addEventListener('submit', (e) => { if (!input.value.trim()) { e.preventDefault(); input.focus(); } else track('search', { search_term: input.value.trim() }); });
  }

  /* картка з індексу (пошук, обране) — та сама розмітка, що й на сервері */
  function cardFromIndex(it) {
    const d = it.d || 0, v = it.v[d] || it.v[0];
    const chips = it.v.length > 1 ? `<div class="pcard__vars" role="group" aria-label="Варіант">${it.v.slice(0, 4).map((x, i) => `<button class="vchip${i === d ? ' is-on' : ''}${x.a ? '' : ' is-out'}" type="button" data-vi="${i}" aria-pressed="${i === d}">${esc(x.l)}</button>`).join('')}</div>` : '';
    const badge = !it.st ? '<span class="badge badge--out">Немає в наявності</span>' : (it.x ? `<span class="badge badge--sale">−${it.x}%</span>` : '');
    const label = v.l && v.l !== '1 шт' ? v.l : '';
    return `<article class="pcard${it.st ? '' : ' is-out'}" data-pcard data-id="${it.id}" data-d="${d}" data-v="${esc(JSON.stringify(it.v))}" data-t="${esc(it.t)}" data-b="${esc(it.b)}" data-url="${it.u}" data-sub="${it.sb}" data-k="${it.k || ''}">
      <div class="pcard__media"><img src="${R(v.i)}" alt="${esc(it.t)}" width="360" height="360" loading="lazy" data-img></div>
      ${badge ? `<div class="pcard__badges">${badge}</div>` : ''}
      <button class="pcard__wish" type="button" data-wish="${it.id}" aria-pressed="${Wish.has(it.id)}" aria-label="В обране: ${esc(it.t)}">${ICON.heart}</button>
      <div class="pcard__body">${it.mo ? `<p class="pcard__mood">«${esc(it.mo)}»</p>` : ''}<h3 class="pcard__title"><a href="${R(it.u)}">${esc(it.t)}</a></h3>
        <p class="pcard__type">${esc(it.m)}<span data-plabel-wrap${label ? '' : ' hidden'}> · <b data-plabel>${esc(label)}</b></span></p>${chips}
        <div class="pcard__foot"><div class="price"><div class="price__row"><span class="price__now${v.o ? ' is-sale' : ''}" data-pnow>${money(v.p)}</span><s class="price__old" data-pold${v.o ? '' : ' hidden'}>${v.o ? money(v.o) : ''}</s></div><span class="price__unit" data-punit>${esc(v.u || '')}</span></div>
        ${it.st ? `<button class="pcard__add" type="button" data-add aria-label="Додати в кошик: ${esc(it.t)}">${ICON.bag}<span class="t">У кошик</span></button>` : `<button class="pcard__add" type="button" disabled aria-label="Немає в наявності: ${esc(it.t)}"><span class="t">Немає</span></button>`}</div>
        ${it.sb && subOn() ? `<p class="pcard__sub">${ICON.refresh}з підпискою <b data-psub>${money(subPrice(v.p))}</b></p>` : ''}</div></article>`;
  }

  async function initSearchPage() {
    const grid = $('[data-search-grid]'); if (!grid) return;
    const q = new URLSearchParams(location.search).get('q') || '';
    const input = $('[data-search] input'); if (input) input.value = q;
    if (!q) return;
    const loading = $('[data-search-loading]'), empty = $('[data-search-empty]'), err = $('[data-search-error]');
    const run = async () => {
      loading.hidden = false; err.hidden = true; empty.hidden = true;
      let items;
      try { items = await loadIndex(); } catch (e) { loading.hidden = true; err.hidden = false; return; }
      loading.hidden = true;
      const res = searchIn(items, q);
      $('[data-search-title]').textContent = `Пошук: «${q}»`;
      $('[data-search-sub]').textContent = res.length ? `Знайдено ${goods(res.length)}` : '';
      grid.innerHTML = res.slice(0, 60).map(cardFromIndex).join('');
      empty.hidden = !!res.length;
      if (!res.length) $('[data-search-empty-text]').textContent = `За запитом «${q}» нічого немає. Перевірте написання або почніть із розділу:`;
      Wish.render();
      track('view_search_results', { search_term: q, results: res.length });
    };
    const retry = $('[data-search-retry]'); if (retry) retry.addEventListener('click', run);
    run();
  }

  async function initWishPage() {
    const grid = $('[data-wish-grid]'); if (!grid) return;
    const render = async () => {
      let items = [];
      try { items = await loadIndex(); } catch (e) { grid.innerHTML = '<div class="empty"><h3>Не вдалося завантажити обране</h3><p>Перевірте з’єднання й оновіть сторінку.</p></div>'; return; }
      const map = new Map(items.map((x) => [x.id, x]));
      const list = Wish.ids.map((id) => map.get(id)).filter(Boolean);
      grid.innerHTML = list.map(cardFromIndex).join('');
      $('[data-wish-empty]').hidden = !!list.length;
    };
    render();
    document.addEventListener('click', (e) => { if (e.target.closest('[data-wish]')) setTimeout(render, 0); });
  }

  /* ---------------- каталог: фільтри, сортування, пагінація ---------------- */
  function initCatalog() {
    const root = $('[data-catalog]'); if (!root) return;
    const grid = $('[data-grid]', root);
    const cards = $$('.pcard', grid);
    const panel = $('[data-filters]', root);
    const PAGE = 24;
    const st = { facets: {}, pmin: null, pmax: null, sale: false, stock: false, sort: 'rank', shown: PAGE };
    const groups = $$('[data-facet]', panel);
    const qs = new URLSearchParams(location.search);
    if (qs.get('brand')) st.facets['Бренд'] = new Set(qs.getAll('brand'));
    (qs.get('f') || '').split('|').filter(Boolean).forEach((pair) => { const [k, v] = pair.split(':'); if (k && v) (st.facets[k] = st.facets[k] || new Set()).add(v); });
    if (qs.get('sort')) st.sort = qs.get('sort');
    if (qs.get('sale') === '1') st.sale = true;
    const match = (card, skip) => {
      const { f } = cardData(card);
      for (const [name, set] of Object.entries(st.facets)) {
        if (name === skip || !set.size) continue;
        const vals = f[name] || [];
        if (!vals.some((v) => set.has(v))) return false;
      }
      const price = Number(card.dataset.price);
      if (st.pmin != null && price < st.pmin) return false;
      if (st.pmax != null && price > st.pmax) return false;
      if (st.sale && !Number(card.dataset.disc)) return false;
      if (st.stock && card.dataset.stock !== '1') return false;
      return true;
    };
    const sorters = {
      rank: (a, b) => a.dataset.rank - b.dataset.rank,
      'price-asc': (a, b) => a.dataset.price - b.dataset.price,
      'price-desc': (a, b) => b.dataset.price - a.dataset.price,
      'per-asc': (a, b) => (Number(a.dataset.per) || 1e9) - (Number(b.dataset.per) || 1e9),
      disc: (a, b) => b.dataset.disc - a.dataset.disc || a.dataset.rank - b.dataset.rank,
      new: (a, b) => b.dataset.new - a.dataset.new || a.dataset.rank - b.dataset.rank,
    };
    function apply(scroll) {
      const ok = cards.filter((c) => match(c));
      const sorted = ok.slice().sort(sorters[st.sort] || sorters.rank);
      const okSet = new Set(ok);
      cards.forEach((c) => { if (!okSet.has(c)) c.hidden = true; });
      sorted.forEach((c, i) => { c.hidden = i >= st.shown; grid.appendChild(c); });
      cards.filter((c) => !okSet.has(c)).forEach((c) => grid.appendChild(c));
      $('[data-count]', root).textContent = ok.length;
      $('[data-count-word]', root).textContent = plural(ok.length, 'товар', 'товари', 'товарів');
      const sc = $('[data-sheet-count]'); if (sc) { sc.textContent = ok.length; $('[data-sheet-word]').textContent = plural(ok.length, 'товар', 'товари', 'товарів'); }
      $('[data-empty]', root).hidden = !!ok.length;
      const more = $('[data-more-wrap]', root);
      more.hidden = ok.length <= st.shown;
      $('[data-shown]', root).textContent = `Показано ${Math.min(st.shown, ok.length)} з ${ok.length}`;
      groups.forEach((g) => {
        const name = g.dataset.facet;
        const base = cards.filter((c) => match(c, name));
        const cnt = {};
        base.forEach((c) => (cardData(c).f[name] || []).forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; }));
        $$('.check', g).forEach((lab) => { const inp = $('input', lab), n = cnt[inp.value] || 0; $('.c', lab).textContent = n; lab.style.opacity = n || inp.checked ? '' : '.45'; });
      });
      const chips = [];
      Object.entries(st.facets).forEach(([name, set]) => set.forEach((v) => chips.push(`<button class="afilter" type="button" data-rm-f="${esc(name)}" data-rm-v="${esc(v)}">${esc(v)}${ICON.close}</button>`)));
      if (st.pmin != null || st.pmax != null) chips.push(`<button class="afilter" type="button" data-rm-price>${st.pmin != null ? 'від ' + st.pmin : ''} ${st.pmax != null ? 'до ' + st.pmax : ''} ₴${ICON.close}</button>`);
      if (st.sale) chips.push(`<button class="afilter" type="button" data-rm-flag="sale">Зі знижкою${ICON.close}</button>`);
      if (st.stock) chips.push(`<button class="afilter" type="button" data-rm-flag="stock">В наявності${ICON.close}</button>`);
      $('[data-active]', root).innerHTML = chips.join('');
      const fc = $('[data-fcount]', root); fc.textContent = chips.length; fc.hidden = !chips.length;
      const p = new URLSearchParams();
      const fl = [];
      Object.entries(st.facets).forEach(([k, set]) => set.forEach((v) => { if (k === 'Бренд') p.append('brand', v); else fl.push(k + ':' + v); }));
      if (fl.length) p.set('f', fl.join('|'));
      if (st.sort !== 'rank') p.set('sort', st.sort);
      if (st.sale) p.set('sale', '1');
      history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : ''));
      if (scroll) root.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    const syncControls = () => {
      groups.forEach((g) => { const set = st.facets[g.dataset.facet]; $$('input', g).forEach((i) => { i.checked = !!(set && set.has(i.value)); }); });
      $$('[data-flag]', panel).forEach((i) => { i.checked = !!st[i.dataset.flag]; });
      const s = $('[data-sort]', root); if (s) s.value = st.sort;
      $('[data-pmin]', panel).value = st.pmin ?? ''; $('[data-pmax]', panel).value = st.pmax ?? '';
    };
    panel.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-fv]')) {
        const name = t.closest('[data-facet]').dataset.facet;
        const set = st.facets[name] = st.facets[name] || new Set();
        if (t.checked) set.add(t.value); else set.delete(t.value);
        if (!set.size) delete st.facets[name];
      } else if (t.matches('[data-flag]')) st[t.dataset.flag] = t.checked;
      else if (t.matches('[data-pmin],[data-pmax]')) { const v = (x) => (x.value === '' ? null : Math.max(0, Number(x.value))); st.pmin = v($('[data-pmin]', panel)); st.pmax = v($('[data-pmax]', panel)); }
      st.shown = PAGE; apply();
    });
    panel.addEventListener('click', (e) => {
      const m = e.target.closest('[data-more-opts]');
      if (m) { const o = m.previousElementSibling; const c = o.classList.toggle('is-collapsed'); m.textContent = c ? `Показати всі (${$$('.check', o).length})` : 'Згорнути'; }
    });
    $('[data-sort]', root).addEventListener('change', (e) => { st.sort = e.target.value; apply(); track('sort_catalog', { sort: st.sort }); });
    $('[data-more]', root).addEventListener('click', () => { st.shown += PAGE; apply(); });
    const reset = () => { st.facets = {}; st.pmin = st.pmax = null; st.sale = st.stock = false; st.shown = PAGE; syncControls(); apply(); };
    $$('[data-f-reset]', root).forEach((b) => b.addEventListener('click', reset));
    $('[data-active]', root).addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rmF) { const set = st.facets[b.dataset.rmF]; if (set) { set.delete(b.dataset.rmV); if (!set.size) delete st.facets[b.dataset.rmF]; } }
      if (b.hasAttribute('data-rm-price')) { st.pmin = st.pmax = null; }
      if (b.dataset.rmFlag) st[b.dataset.rmFlag] = false;
      syncControls(); apply();
    });
    const bar = $('[data-sheet-bar]');
    let scrim = null;
    const openSheet = () => { panel.classList.add('is-open'); if (bar) bar.classList.add('is-open'); scrim = document.createElement('div'); scrim.className = 'filters-scrim'; scrim.addEventListener('click', closeSheet); document.body.appendChild(scrim); document.documentElement.style.overflow = 'hidden'; };
    const closeSheet = () => { panel.classList.remove('is-open'); if (bar) bar.classList.remove('is-open'); if (scrim) scrim.remove(); scrim = null; document.documentElement.style.overflow = ''; };
    $$('[data-filters-open]', root).forEach((b) => b.addEventListener('click', openSheet));
    $$('[data-filters-close]').forEach((b) => b.addEventListener('click', closeSheet));
    syncControls(); apply();
    track('view_item_list', { item_list_name: document.title });
  }

  /* ---------------- калькулятор «на скільки вистачить» ---------------- */
  function initCalc(root, onRec) {
    const bag = $('[data-calc-bag]', root), portion = $('[data-calc-portion]', root);
    const calc = () => {
      const kg = Number(bag.value), g = Math.max(5, Number(portion.value) || 0);
      const days = Math.max(1, Math.floor((kg * 1000) / g));
      $('[data-calc-days]', root).textContent = days;
      $('[data-calc-days-word]', root).textContent = plural(days, 'день', 'дні', 'днів');
      $('[data-calc-end]', root).textContent = dateUA(addDays(days));
      const cad = $('[data-calc-cadence]', root);
      if (cad) { const fit = CFG.cadences.filter((w) => w * 7 <= days - 2); const rec = fit.length ? fit[fit.length - 1] : CFG.cadences[0]; cad.textContent = days < 12 ? 'візьміть більшу фасовку' : 'кожні ' + weeks(rec); if (onRec) onRec(days < 12 ? null : rec); }
    };
    bag.addEventListener('change', calc); portion.addEventListener('input', calc); calc();
    return { setBag(kg) { if (!kg) return; let opt = $$('option', bag).find((o) => Number(o.value) === kg); if (!opt) { opt = new Option(String(kg).replace('.', ',') + ' кг', kg); bag.add(opt); } bag.value = String(kg); calc(); } };
  }

  /* ---------------- сторінка товару: варіанти, галерея, лайтбокс ---------------- */
  function initPDP() {
    const root = $('[data-pdp]'); if (!root) return;
    const v = JSON.parse(root.dataset.v);
    let cur = Number(root.dataset.d || 0);
    const calcEl = $('[data-calc]', root);
    let recCad = null, applyBtn = null;
    const calc = calcEl ? initCalc(calcEl, (rec) => { recCad = rec; if (applyBtn) applyBtn.hidden = !rec; }) : null;
    const mainImg = $('[data-main-img]', root);
    const gallery = JSON.parse(root.dataset.gallery || '[]');
    let gi = 0;
    const mode = () => ($('input[name="mode"]:checked', root) || {}).value || 'once';
    const setV = (i) => {
      cur = i; const x = v[i];
      $$('.vopt', root).forEach((b) => { const on = Number(b.dataset.vi) === i; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      const po = $('[data-price-once]', root); po.textContent = money(x.p); po.classList.toggle('is-sale', !!x.o);
      const po2 = $('[data-price-once2]', root); if (po2) po2.textContent = money(x.p);
      const old = $('[data-price-old]', root); if (old) { old.textContent = x.o ? money(x.o) : ''; old.hidden = !x.o; }
      const db = $('[data-disc]', root); if (db) { const d = x.o ? Math.round((1 - x.p / x.o) * 100) : 0; db.textContent = '−' + d + '%'; db.hidden = !d; }
      const ps = $('[data-price-sub]', root); if (ps) ps.textContent = money(subPrice(x.p));
      const u = $('[data-unit]', root); if (u) u.textContent = x.u || '';
      $$('[data-vlabel]').forEach((el) => { el.textContent = x.l || ''; });
      $$('[data-sku]').forEach((s) => { s.textContent = x.s || ''; });
      const stock = $('[data-stock]', root); if (stock) { stock.className = x.a ? 'ok' : 'no'; stock.textContent = x.a ? 'В наявності' : 'Немає в наявності'; }
      if (x.I && mainImg && mainImg.getAttribute('src') !== x.I) { mainImg.style.opacity = '.3'; mainImg.onload = () => { mainImg.style.opacity = ''; }; mainImg.src = R(x.I); const k = gallery.indexOf(x.I); if (k >= 0) setThumb(k, false); }
      const bb = $('[data-bb-price]'); if (bb) bb.textContent = money(mode() === 'sub' ? subPrice(x.p) : x.p);
      const bl = $('[data-bb-label]'); if (bl) bl.textContent = x.l || root.dataset.t;
      $$('[data-pdp-add]').forEach((b) => { b.disabled = !x.a; });
      if (calc && x.gu === 'g' && x.g) calc.setBag(Math.round(x.g / 100) / 10);
      renderSC();
    };
    $$('.vopt', root).forEach((b) => b.addEventListener('click', () => setV(Number(b.dataset.vi))));
    $$('.buyopt input', root).forEach((r) => r.addEventListener('change', () => { $$('.buyopt', root).forEach((l) => l.classList.toggle('is-on', $('input', l).checked)); setV(cur); }));
    const cad = $('[data-cadence]', root);
    if (cad) cad.addEventListener('focus', () => { const s = $('input[value="sub"]', root); if (s && !s.checked) { s.checked = true; s.dispatchEvent(new Event('change')); } });
    const qty = $('[data-qty]', root);
    $$('[data-step]', root).forEach((b) => b.addEventListener('click', () => { qty.value = Math.max(1, Math.min(99, Number(qty.value || 1) + Number(b.dataset.step))); renderSC(); }));
    // підписка: ціна на місяць і економія за рік для обраної фасовки, кількості й частоти
    const sc = $('[data-subcalc]', root);
    function renderSC() {
      if (!sc) return;
      const x = v[cur], q = Math.max(1, Number(qty.value || 1)), c = cad ? Number(cad.value) : CFG.cadence, n = subNums(x.p, q, c), on = mode() === 'sub';
      $('[data-sc-cad]', sc).textContent = 'кожні ' + weeks(c);
      $('[data-sc-month]', sc).textContent = approx(n.month);
      $('[data-sc-year]', sc).textContent = approx(n.year);
      $('[data-sc-next]', sc).textContent = on ? ` Наступна доставка після цієї — близько ${dateUA(addDays(c * 7))}.` : '';
      sc.classList.toggle('is-on', on);
    }
    if (sc) { qty.addEventListener('input', renderSC); if (cad) cad.addEventListener('change', renderSC); renderSC(); }
    if (calcEl && cad && root.dataset.sub === '1') {
      const line = $('[data-calc-cadence]', calcEl);
      if (line) {
        applyBtn = document.createElement('button');
        applyBtn.type = 'button'; applyBtn.className = 'calc__apply'; applyBtn.hidden = !recCad;
        applyBtn.innerHTML = ICON.refresh + 'Обрати для підписки';
        line.closest('.calc__line').after(applyBtn);
        applyBtn.addEventListener('click', () => {
          if (!recCad) return;
          cad.value = String(recCad);
          const s = $('input[value="sub"]', root); if (s && !s.checked) { s.checked = true; s.dispatchEvent(new Event('change')); }
          renderSC();
          const buy = $('.buy', root); if (buy) buy.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
          toast(`<div><b>${ICON.check}Підписка кожні ${weeks(recCad)}</b><small>Частоту обрано — лишилося додати в кошик.</small></div>`, 3200, true);
        });
      }
    }
    // галерея
    const thumbs = $$('[data-thumb]', root), dots = $$('[data-dot]', root);
    function setThumb(k, swap = true) {
      gi = (k + gallery.length) % gallery.length;
      thumbs.forEach((x, j) => x.classList.toggle('is-on', j === gi));
      dots.forEach((x, j) => x.classList.toggle('is-on', j === gi));
      if (swap && mainImg && gallery[gi]) mainImg.src = R(gallery[gi]);
    }
    thumbs.forEach((b, j) => b.addEventListener('click', () => setThumb(j)));
    dots.forEach((b, j) => b.addEventListener('click', () => setThumb(j)));
    const zoom = $('[data-zoom]', root);
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (zoom && fine) {
      zoom.addEventListener('mousemove', (e) => { const r = zoom.getBoundingClientRect(); zoom.style.setProperty('--zx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%'); zoom.style.setProperty('--zy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%'); });
      zoom.addEventListener('mouseenter', () => zoom.classList.add('is-zoom'));
      zoom.addEventListener('mouseleave', () => zoom.classList.remove('is-zoom'));
    }
    if (zoom) {
      let sx = null;
      zoom.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
      zoom.addEventListener('touchend', (e) => { if (sx == null || gallery.length < 2) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) { setThumb(gi + (dx < 0 ? 1 : -1)); zoom._swiped = true; setTimeout(() => { zoom._swiped = false; }, 300); } sx = null; });
      zoom.addEventListener('click', (e) => { if (zoom._swiped || e.target.closest('.gallery__badges')) return; openLB(); });
    }
    // лайтбокс
    const lb = $('[data-lightbox]');
    let lbFocus = null;
    const lbImg = lb && $('[data-lb-img]', lb), lbCount = lb && $('[data-lb-count]', lb);
    const lbShow = (k) => { gi = (k + gallery.length) % gallery.length; if (lbImg) lbImg.src = R(gallery[gi]) || mainImg.src; if (lbCount) lbCount.textContent = `${gi + 1} / ${Math.max(1, gallery.length)}`; };
    function openLB() { if (!lb) return; lbFocus = document.activeElement; lbShow(gi); lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden'; setTimeout(() => $('[data-lb-close]', lb).focus(), 60); }
    function closeLB() { if (!lb || !lb.classList.contains('is-open')) return; lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); document.documentElement.style.overflow = ''; setThumb(gi); if (lbFocus) lbFocus.focus(); }
    if (lb) {
      $('[data-lb-close]', lb).addEventListener('click', closeLB);
      const prev = $('[data-lb-prev]', lb), next = $('[data-lb-next]', lb);
      if (prev) prev.addEventListener('click', () => lbShow(gi - 1));
      if (next) next.addEventListener('click', () => lbShow(gi + 1));
      lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('lightbox__stage')) closeLB(); });
      document.addEventListener('keydown', (e) => { if (!lb.classList.contains('is-open')) return; if (e.key === 'Escape') closeLB(); if (e.key === 'ArrowRight') lbShow(gi + 1); if (e.key === 'ArrowLeft') lbShow(gi - 1); });
      let tx = null;
      lb.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
      lb.addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) lbShow(gi + (dx < 0 ? 1 : -1)); tx = null; });
    }
    const zbtn = $('[data-lightbox-open]', root); if (zbtn) zbtn.addEventListener('click', (e) => { e.stopPropagation(); openLB(); });
    // додавання
    const add = (e) => {
      const x = v[cur]; if (!x.a) return;
      const m = mode();
      const item = { id: root.dataset.id, vi: cur, t: root.dataset.t, b: root.dataset.b, l: x.l, u: root.dataset.url, i: x.i, p: x.p, o: x.o, mode: m, cad: cad ? Number(cad.value) : CFG.cadence, sb: root.dataset.sub === '1', k: root.dataset.kind || '' };
      Cart.add(item, Math.max(1, Number(qty.value || 1)));
      const btn = e && e.currentTarget;
      if (btn) { btn.classList.add('is-done'); setTimeout(() => btn.classList.remove('is-done'), 1200); }
      setTimeout(openDrawer, reduceMotion ? 0 : 180);
    };
    $$('[data-pdp-add]').forEach((b) => b.addEventListener('click', add));
    const buybar = $('[data-buybar]'), mainBtn = $('.buy__row [data-pdp-add]', root);
    if (buybar && mainBtn && 'IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => { const show = !en.isIntersecting && en.boundingClientRect.top < 0; buybar.classList.toggle('is-shown', show); buybar.setAttribute('aria-hidden', show ? 'false' : 'true'); $('button', buybar).tabIndex = show ? 0 : -1; }).observe(mainBtn);
    }
    track('view_item', { ecommerce: { currency: 'UAH', value: v[cur].p, items: [{ item_id: root.dataset.id, item_name: root.dataset.t, item_brand: root.dataset.b, item_variant: v[cur].l, price: v[cur].p }] } });
  }

  /* ---------------- сторінка кошика ---------------- */
  const hasPromo = () => Object.keys(CFG.promo || {}).length > 0;
  function renderCartPage() {
    const page = $('[data-cart-page]'); if (!page) return;
    const t = Cart.totals();
    const lines = $('[data-cart-lines-page]', page), sum = $('[data-cart-summary]', page);
    if (!t.count) { lines.innerHTML = `<li>${emptyCart}</li>`; sum.hidden = true; return; }
    sum.hidden = false;
    lines.innerHTML = Cart.items.map((x) => lineHTML(x)).join('');
    sum.innerHTML = `<h2>Разом</h2>${CFG.free > 0 ? `<div class="shipbar${t.free ? ' is-free' : ''}" style="border-radius:16px;margin-bottom:16px">${shipbarHTML(t)}</div>` : ''}
      ${hasPromo() ? promoHTML() : ''}${summaryRows(t)}
      <a class="btn btn--brand btn--lg btn--block" href="${R('/zamovlennia/')}" style="margin-top:18px">Оформити замовлення</a>
      <p class="hint" style="margin-top:12px">${deliveryHint(t)}</p>`;
  }
  function promoHTML() {
    return `<form class="promo" data-promo><label class="sr-only" for="promo">Промокод</label><input class="input" id="promo" name="promo" placeholder="Промокод" value="${esc(Cart.promo)}" autocomplete="off"><button class="btn btn--ghost" type="submit">Застосувати</button></form><p class="hint" data-promo-msg></p>`;
  }
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-promo]'); if (!f) return;
    e.preventDefault();
    const code = f.promo.value.trim().toUpperCase();
    const ok = code && CFG.promo[code];
    Cart.promo = ok ? code : ''; Cart.save();
    const msg = $('[data-promo-msg]');
    if (msg) { msg.textContent = !code ? '' : ok ? `Промокод застосовано: −${CFG.promo[code]}%` : 'Промокод не знайдено або він уже не діє'; msg.style.color = ok ? 'var(--sage-ink)' : 'var(--err)'; }
  });

  /* ---------------- оформлення ---------------- */
  function renderCheckoutSummary() {
    const box = $('[data-co-summary]'); if (!box) return;
    const t = Cart.totals();
    if (!t.count) { box.innerHTML = emptyCart; const f = $('[data-checkout]'); if (f) $$('section', f).forEach((s) => { s.style.opacity = '.5'; }); return; }
    const pay = ($('input[name="pay"]:checked') || {}).value || 'card';
    box.innerHTML = `<h2>Ваше замовлення</h2><ul class="lines">${Cart.items.map((x) => lineHTML(x, true)).join('')}</ul>
      ${hasPromo() ? promoHTML() : ''}${summaryRows(t)}
      <button class="btn btn--brand btn--lg btn--block" type="submit" style="margin-top:18px" data-submit>${pay === 'card' ? 'Перейти до оплати' : 'Підтвердити замовлення'} · ${money(t.total)}</button>
      <p class="hint" style="margin-top:12px">${deliveryHint(t)}</p>`;
  }

  /* випадний список з пошуком (місто, відділення): клавіатура, aria, захист від застарілих відповідей */
  function combo(input, list, o) {
    let ai = -1, items = [], timer = null, seq = 0;
    const min = o.min == null ? 2 : o.min;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); ai = -1; };
    const state = (html) => { list.innerHTML = `<li class="ac__state" aria-disabled="true">${html}</li>`; list.hidden = false; input.setAttribute('aria-expanded', 'true'); };
    const opt = (v, d) => (typeof v === 'function' ? v() : v == null ? d : v);
    const run = async () => {
      const q = input.value.trim(), my = ++seq;
      if (q.length < min) { close(); return; }
      if (opt(o.loading, true)) state('Шукаємо…');
      try {
        const res = await o.fetch(q);
        if (my !== seq) return;
        items = res || []; ai = -1;
        if (!items.length) { const msg = o.empty && o.empty(q); if (msg) state(esc(msg)); else close(); return; }
        list.innerHTML = items.map((it, i) => `<li role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="false">${o.render(it)}</li>`).join('');
        list.hidden = false; input.setAttribute('aria-expanded', 'true');
      } catch (e) {
        if (my !== seq) return;
        if (o.error) o.error(e);
        state(esc(e.message));
      }
    };
    const choose = (i) => { const it = items[i]; if (!it) return; close(); o.pick(it); };
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, opt(o.delay, 220)); });
    input.addEventListener('focus', () => { if (min === 0 && !input.value) run(); });
    input.addEventListener('keydown', (e) => {
      const lis = $$('li[role=option]', list);
      if (list.hidden || !lis.length) { if (e.key === 'ArrowDown') { e.preventDefault(); run(); } return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); ai = (ai + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
        lis.forEach((l, i) => { l.classList.toggle('is-active', i === ai); l.setAttribute('aria-selected', i === ai ? 'true' : 'false'); });
        input.setAttribute('aria-activedescendant', lis[ai].id); lis[ai].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && ai >= 0) { e.preventDefault(); choose(ai); } else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', (e) => { const li = e.target.closest('li[role=option]'); if (li) { e.preventDefault(); choose(Number(li.dataset.i)); } });
    input.addEventListener('blur', () => setTimeout(close, 150));
    return { run, close };
  }

  const SETTLEMENT = { 'м.': 'місто', 'смт': 'селище міського типу', 'с.': 'село', 'с-ще': 'селище', 'сщ': 'селище' };
  const shipLine = (d, b) => {
    const s = String(b || '').trim();
    if (d.method === 'np-courier') return 'Кур’єр Нової пошти, ' + (d.address || '');
    if (/^(Відділення|Поштомат|Пункт)/.test(s)) return 'Нова пошта, ' + s.replace(/^Поштомат "Нова Пошта"/, 'поштомат').replace(/^Відділення/, 'відділення');
    return 'Нова пошта, ' + (d.method === 'np-locker' ? 'поштомат ' : 'відділення ') + (/^\d+$/.test(s) ? '№' + s : s);
  };

  function initCheckout() {
    const form = $('[data-checkout]'); if (!form) return;
    track('begin_checkout', { ecommerce: { currency: 'UAH', value: Cart.totals().total, items: Cart.items.map(gaItem) } });
    const saved = store.get('customer', {});
    ['first_name', 'last_name', 'phone', 'email', 'city', 'address'].forEach((n) => { if (saved[n] && form[n]) form[n].value = saved[n]; });
    const phone = form.phone, city = form.city, branch = form.branch;
    const cityList = $('[data-city-list]', form), branchList = $('[data-branch-list]', form), branchHint = $('[data-branch-hint]', form);
    let apiOn = false, npDown = false, branchTitle = '';
    bindPhone(phone);
    const shipVal = () => (form.querySelector('input[name="ship"]:checked') || {}).value;
    const syncShip = () => {
      const val = shipVal(), courier = val === 'np-courier';
      $('[data-ship-branch]', form).hidden = courier; $('[data-ship-address]', form).hidden = !courier;
      $('[data-branch-label]', form).textContent = apiOn && !npDown ? (val === 'np-locker' ? 'Поштомат *' : 'Відділення *') : (val === 'np-locker' ? 'Номер поштомата *' : 'Номер відділення *');
    };
    const clearBranch = () => { branch.value = ''; form.branch_ref.value = ''; branchTitle = ''; if (branchHint) { branchHint.hidden = true; branchHint.textContent = ''; } };
    let lastShip = shipVal();
    $$('input[name="ship"]', form).forEach((r) => r.addEventListener('change', () => {
      const val = shipVal();
      if (apiOn && val !== 'np-courier' && lastShip !== 'np-courier' && val !== lastShip) clearBranch(); // відділення ≠ поштомат
      lastShip = val; syncShip();
    }));
    syncShip();
    $$('input[name="pay"]', form).forEach((r) => r.addEventListener('change', renderCheckoutSummary));

    // місто: без сервера — короткий список, із сервером — довідник Нової пошти; відділення — лише з сервера
    if (saved.branch_num && !saved.branch_ref) branch.value = saved.branch_num;
    const live = () => apiOn && !npDown;
    const npErr = (e) => {
      if (e.status && e.status < 500) return;
      npDown = true; syncShip(); branch.setAttribute('inputmode', 'numeric'); branch.placeholder = 'Наприклад, 12';
      const hint = $('[data-np-hint]', form); if (hint && !hint.dataset.down) { hint.dataset.down = '1'; hint.textContent += ' Довідник Нової пошти зараз не відповідає — вкажіть місто й номер відділення вручну.'; }
    };
    combo(city, cityList, {
      min: 1, delay: () => (live() ? 220 : 0), loading: () => live(),
      fetch: (q) => {
        if (!live()) return Promise.resolve((CFG.cities || []).filter((c) => c.toLowerCase().startsWith(q.toLowerCase())).slice(0, 8));
        if (q.length < 2) return Promise.resolve([]);
        return apiGet('/api/np/cities?q=' + encodeURIComponent(q)).then((d) => d.items);
      },
      render: (c) => (typeof c === 'string' ? esc(c) : `<b>${esc(c.name)}</b><small>${esc([SETTLEMENT[c.type] || c.type, c.region, c.area].filter(Boolean).join(' · '))}</small>`),
      empty: (q) => (live() && q.length >= 2 ? 'Не знайшли населеного пункту з відділенням Нової пошти. Перевірте назву.' : ''),
      error: npErr,
      pick: (c) => {
        if (typeof c === 'string') { city.value = c; return; }
        city.value = c.name; form.city_ref.value = c.ref; clearBranch(); setErr(city, '');
        if (shipVal() !== 'np-courier') setTimeout(() => branch.focus(), 0);
      },
    });
    city.addEventListener('input', () => { if (form.city_ref.value) { form.city_ref.value = ''; clearBranch(); } });

    API.ready().then((h) => {
      if (!h || !h.np) return;
      apiOn = true;
      if (saved.city_ref && saved.city === city.value) {
        form.city_ref.value = saved.city_ref;
        if (saved.branch_ref) { form.branch_ref.value = saved.branch_ref; branch.value = saved.branch || ''; branchTitle = saved.branch_title || ''; }
      } else if (!form.branch_ref.value) branch.value = '';
      branch.setAttribute('inputmode', 'search');
      branch.placeholder = 'Номер або вулиця';
      city.placeholder = 'Почніть вводити назву, напр. Одеса';
      syncShip();
      branch.addEventListener('input', () => { if (form.branch_ref.value) { form.branch_ref.value = ''; branchTitle = ''; if (branchHint) branchHint.hidden = true; } });
      combo(branch, branchList, {
        min: 0, loading: () => live(),
        fetch: (q) => {
          if (!live()) return Promise.resolve([]);
          if (!form.city_ref.value) return Promise.reject(new Error('Спершу оберіть місто зі списку'));
          const type = shipVal() === 'np-locker' ? 'postomat' : 'branch';
          return apiGet(`/api/np/warehouses?city=${encodeURIComponent(form.city_ref.value)}&type=${type}&q=${encodeURIComponent(q)}`).then((d) => d.items);
        },
        render: (w) => `<b>${w.kind === 'postomat' ? 'Поштомат' : 'Відділення'} №${esc(w.number)}</b><small>${esc(w.address)}${w.max_kg ? ' · до ' + w.max_kg + ' кг' : ''}${w.residents_only ? ' · лише для мешканців будинку' : ''}</small>`,
        empty: (q) => (!live() ? '' : q ? 'Нічого не знайшли. Спробуйте номер або назву вулиці.' : (shipVal() === 'np-locker' ? 'Поштоматів у цьому місті не знайшли — оберіть відділення.' : 'Відділень у цьому місті не знайшли.')),
        error: npErr,
        pick: (w) => {
          branch.value = `№${w.number}, ${w.address}`; form.branch_ref.value = w.ref; branchTitle = w.title; setErr(branch, '');
          const notes = [w.max_kg ? `Вантаж до ${w.max_kg} кг на одне місце.` : '', w.residents_only ? 'Поштомат лише для мешканців будинку — оберіть інший, якщо не живете там.' : ''].filter(Boolean);
          if (branchHint) { branchHint.textContent = notes.join(' '); branchHint.hidden = !notes.length; }
        },
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!Cart.count()) return;
      const ship = shipVal(), isLive = live(), cityInput = city;
      const checks = [
        [form.first_name, (val) => val.trim().length >= 2, 'Вкажіть ім’я'],
        [form.last_name, (val) => val.trim().length >= 2, 'Вкажіть прізвище — його попросять у відділенні'],
        [phone, phoneOK, 'Телефон у форматі +380 XX XXX XX XX'],
        [form.email, (val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), 'Перевірте email'],
        [cityInput, (val) => val.trim().length >= 2 && (!isLive || !!form.city_ref.value), isLive ? 'Оберіть місто зі списку' : 'Вкажіть місто'],
        ship === 'np-courier' ? [form.address, (val) => val.trim().length >= 5, 'Вкажіть адресу доставки']
          : isLive ? [branch, () => !!form.branch_ref.value, ship === 'np-locker' ? 'Оберіть поштомат зі списку' : 'Оберіть відділення зі списку']
            : [branch, (val) => /^\d{1,6}$/.test(val.trim()), 'Вкажіть номер цифрами'],
        [form.agree, () => form.agree.checked, 'Потрібна згода з умовами'],
      ];
      let first = null;
      checks.forEach(([el, ok, msg]) => { const bad = !ok(el.value || ''); setErr(el, bad ? msg : ''); if (bad && !first) first = el; });
      if (first) { first.focus(); first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); return; }
      const t = Cart.totals();
      const pay = form.querySelector('input[name="pay"]:checked').value;
      const now = new Date();
      const customer = { first_name: form.first_name.value.trim(), last_name: form.last_name.value.trim(), phone: phone.value, email: form.email.value.trim() };
      const delivery = { method: ship, city: cityInput.value.trim(), city_ref: form.city_ref.value, branch: isLive ? (branchTitle || branch.value.trim()) : branch.value.trim(), branch_ref: form.branch_ref.value, address: form.address.value.trim() };
      const items = Cart.items.map((x) => ({ id: x.id, title: x.t, brand: x.b, variant: x.l, qty: x.q, price: x.p, mode: x.mode, cadence_weeks: x.mode === 'sub' ? x.cad : null, line_total: (x.mode === 'sub' ? subPrice(x.p) : x.p) * x.q, url: x.u, img: x.i }));
      store.set('customer', Object.assign({}, customer, { city: delivery.city, city_ref: delivery.city_ref, branch: branch.value.trim(), branch_ref: delivery.branch_ref, branch_title: branchTitle, branch_num: isLive ? '' : branch.value.trim(), address: delivery.address }));
      const btn = $('[data-submit]'); busy(btn, true);
      const fail = (title, msg) => { busy($('[data-submit]'), false); toast(`<div><b>${esc(title)}</b><small>${esc(msg)}</small></div>`, 7000, true); };

      if (apiOn) {
        const body = { customer, delivery, payment: pay, comment: form.comment.value.trim(), no_call: form.no_call.checked, promo: Cart.promo || null,
          items: Cart.items.map((x) => ({ id: x.id, vi: x.vi, qty: x.q, mode: x.mode, cad: x.cad })), expect_total: t.total };
        try {
          const res = await apiPost('/api/orders', body);
          const order = { id: res.id, token: res.token, server: true, created: now.toISOString(), customer, delivery, payment: pay, comment: body.comment, no_call: body.no_call, promo: body.promo, items, totals: res.totals };
          const orders = store.get('orders', []); orders.unshift(order); store.set('orders', orders.slice(0, 20));
          store.set('lastOrder', order);
          track('purchase', { ecommerce: { transaction_id: res.id, currency: 'UAH', value: res.totals.total, items: Cart.items.map(gaItem) } });
          Cart.clear();
          location.href = R('/dyakuiemo/?o=' + encodeURIComponent(res.id) + '&t=' + encodeURIComponent(res.token));
        } catch (err) {
          if (err.status === 409 && err.data && err.data.quote) {
            // ціни змінилися: беремо актуальні з сервера, покупець бачить нову суму й підтверджує ще раз
            err.data.quote.lines.forEach((ln) => Cart.items.forEach((x) => { if (x.id === ln.id && Number(x.vi) === ln.vi) x.p = ln.unit; }));
            Cart.save();
            fail('Ціни оновилися', err.message);
            const box = $('[data-co-summary]'); if (box) box.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
            return;
          }
          const f = err.data && err.data.field;
          const el = f && { first_name: form.first_name, last_name: form.last_name, phone, email: form.email, city: cityInput, branch, address: form.address }[f];
          if (el) { busy($('[data-submit]'), false); setErr(el, err.message); el.focus(); return; }
          fail('Не вдалося оформити замовлення', err.message);
        }
        return;
      }

      // без сервера: демо або зовнішній обробник (SITE['order_endpoint'])
      const id = 'LP-' + String(now.getFullYear()).slice(2) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const order = { id, created: now.toISOString(), customer, delivery, payment: pay, comment: form.comment.value.trim(), no_call: form.no_call.checked, promo: Cart.promo || null, items, totals: t };
      if (CFG.endpoint) {
        try {
          const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
          const r = await fetch(CFG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order), signal: ctl.signal });
          if (!r.ok) throw new Error(r.status);
          order.sent = true;
        } catch (err) {
          fail('Не вдалося надіслати замовлення', 'Перевірте з’єднання й спробуйте ще раз — дані форми збережено.');
          return;
        }
      }
      const orders = store.get('orders', []); orders.unshift(order); store.set('orders', orders.slice(0, 20));
      store.set('lastOrder', order);
      track('purchase', { ecommerce: { transaction_id: id, currency: 'UAH', value: t.total, items: Cart.items.map(gaItem) } });
      Cart.clear();
      location.href = R('/dyakuiemo/?o=' + encodeURIComponent(id));
    });
  }

  /* ---------------- подяка ---------------- */
  const lineRow = (x) => `<li class="line"><span class="line__img"><img src="${esc(R(x.img))}" alt="" width="56" height="56"></span><div><div class="line__top"><div><a class="line__t" href="${esc(R(x.url))}">${esc(x.title)}</a><p class="line__v">${esc(x.variant && x.variant !== '1 шт' ? x.variant + ' · ' : '')}${x.qty} шт${x.mode === 'sub' ? ' · підписка кожні ' + weeks(x.cadence_weeks) : ''}</p></div><b class="line__p">${money(x.line_total)}</b></div></div></li>`;

  async function initThanks() {
    const root = $('[data-thanks]'); if (!root) return;
    const qs = new URLSearchParams(location.search), id = qs.get('o'), tok = qs.get('t');
    const h = id && tok ? await API.ready() : null;
    if (h) {
      try { renderThanksServer(root, await apiGet(`/api/orders/${encodeURIComponent(id)}?t=${encodeURIComponent(tok)}`), h); return; } catch (e) { /* покажемо збережене в браузері */ }
    }
    const o = store.get('lastOrder', null); if (!o) return;
    const subs = o.items.filter((x) => x.mode === 'sub');
    $('[data-thanks-lead]', root).innerHTML = `Номер замовлення <b>${esc(o.id)}</b>. ${o.no_call ? 'Підтвердимо його повідомленням.' : 'Зателефонуємо або напишемо для підтвердження.'} Номер накладної надішлемо в SMS або месенджері.`;
    const panel = $('[data-thanks-panel]', root);
    panel.hidden = false;
    panel.innerHTML = `<ul class="lines">${o.items.map(lineRow).join('')}</ul>
      <div class="sumrows" style="margin-top:12px"><div class="sumrow"><span>Доставка</span><b>${esc(o.delivery.city)} · ${esc(shipLine(o.delivery, o.delivery.branch))}</b></div>
      <div class="sumrow"><span>Оплата</span><b>${o.payment === 'card' ? 'карткою онлайн' : 'при отриманні'}</b></div>
      <div class="sumrow sumrow--total"><span>Разом</span><b>${money(o.totals.total)}</b></div></div>
      ${o.payment === 'card' ? '<p class="note" style="margin-top:14px">Демо: у робочій версії тут відкривається захищена сторінка оплати (plata by mono / LiqPay), а чек надходить автоматично.</p>' : ''}
      ${subs.length ? `<p class="note note--info" style="margin-top:14px">Підписка оформлена: наступна доставка — приблизно ${dateUA(addDays(Math.min(...subs.map((x) => x.cadence_weeks)) * 7))}.</p>` : ''}`;
  }

  function renderThanksServer(root, o, h) {
    $('[data-thanks-lead]', root).innerHTML = `Номер замовлення <b>${esc(o.id)}</b>. ${o.no_call ? 'Підтвердимо його повідомленням.' : 'Зателефонуємо або напишемо для підтвердження.'} Статус і номер накладної — у <a href="${R('/kabinet/')}">«Моєму кабінеті»</a>.`;
    const panel = $('[data-thanks-panel]', root);
    panel.hidden = false;
    const pay = o.pay
      ? `<form class="thanks__pay" method="post" action="${esc(o.pay.action)}" accept-charset="utf-8"><input type="hidden" name="data" value="${esc(o.pay.data)}"><input type="hidden" name="signature" value="${esc(o.pay.signature)}">
          <button class="btn btn--brand btn--lg btn--block" type="submit">Оплатити ${money(o.total)}</button><p class="hint">Оплата на захищеній сторінці LiqPay: Visa, Mastercard, Apple Pay, Google Pay.</p></form>`
      : o.payment === 'card' && o.pay_status === 'paid' ? '<p class="note note--ok">Оплату отримано. Дякуємо!</p>'
        : o.payment === 'card' ? `<p class="note">${h.demo ? 'Демо: онлайн-оплату ще не підключено — вона вмикається ключами LiqPay на сервері.' : 'Посилання на оплату надішлемо після підтвердження замовлення.'}</p>` : '';
    const subs = o.subscriptions || [];
    panel.innerHTML = `<ul class="lines">${o.items.map(lineRow).join('')}</ul>
      <div class="sumrows" style="margin-top:12px">
        ${o.sub_discount ? `<div class="sumrow sumrow--save"><span>Знижка за підпискою</span><b>−${money(o.sub_discount)}</b></div>` : ''}
        ${o.promo_discount ? `<div class="sumrow sumrow--save"><span>Промокод</span><b>−${money(o.promo_discount)}</b></div>` : ''}
        <div class="sumrow"><span>Доставка</span><b>${esc(o.city)} · ${esc(shipLine({ method: o.ship_method, address: o.address }, o.branch))}</b></div>
        <div class="sumrow"><span>Вартість доставки</span><b>${o.free_shipping ? 'безкоштовно' : 'за тарифами Нової пошти'}</b></div>
        <div class="sumrow"><span>Оплата</span><b>${o.payment === 'card' ? 'карткою онлайн' : 'при отриманні'}</b></div>
        <div class="sumrow sumrow--total"><span>Разом</span><b>${money(o.total)}</b></div></div>
      ${pay}
      ${subs.length ? `<div class="thanks__subs"><h2>${subs.length > 1 ? 'Підписки оформлено' : 'Підписку оформлено'}</h2>${subs.map((s) => `<div class="thanks__sub">${ICON.refresh}<p><b>${esc(s.title)}</b> · ${esc(s.variant)} × ${s.qty}, кожні ${weeks(s.cadence_weeks)}.<br>Наступна доставка — <b>${dateISO(s.next_date)}</b>, нагадаємо ${dateISO(s.reminder_date)}.${s.numbers ? ` Економія ≈ ${money(Math.round(s.numbers.saving_per_year))} на рік.` : ''}</p></div>`).join('')}
        <a class="link-arrow" href="${R('/kabinet/')}">Пропустити, змінити чи поставити на паузу — у кабінеті${ICON.arrow}</a></div>` : ''}`;
    const cab = $('[data-thanks-cab]'); if (cab) cab.hidden = false;
  }

  /* ---------------- мій кабінет ---------------- */
  const SHIP_SHORT = { 'np-branch': 'відділення', 'np-locker': 'поштомат', 'np-courier': 'кур’єр' };
  async function initAccount() {
    const root = $('[data-acc]'); if (!root) return;
    const h = await API.ready();
    if (!h) return accStatic(root);
    root.addEventListener('click', onCopy);
    bindSubs(root, h);
    try { accApp(root, await apiGet('/api/me'), h); } catch (e) {
      if (e.status === 401) accLogin(root, h);
      else root.innerHTML = `<div class="empty">${svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>')}<h3>Кабінет тимчасово недоступний</h3><p>${esc(e.message)}</p><button class="btn btn--brand" type="button" onclick="location.reload()">Спробувати ще раз</button></div>`;
    }
  }

  function accStatic(root) {
    const orders = store.get('orders', []);
    root.innerHTML = `<div class="panel acc-static"><h2>Вхід у кабінет працює із сервером магазину</h2><p>Цю демо-копію відкрито без сервера (<code>server/app.py</code>), тому вхід за номером телефону вимкнено.${orders.length ? ' Замовлення, оформлені в цьому браузері, — нижче.' : ''}</p></div>
      ${orders.length ? `<section class="acc-sec"><h2>Замовлення з цього браузера</h2><div class="ordcards">${orders.map((o) => `<article class="ordcard"><header class="ordcard__head"><div><b>${esc(o.id)}</b><span class="muted">${dateUA(new Date(o.created))}</span></div><b class="ordcard__sum">${money(o.totals.total)}</b></header>
        <ul class="ordcard__items">${o.items.map((x) => `<li><img src="${esc(R(x.img))}" alt="" width="44" height="44" loading="lazy"><span>${esc(x.title)}<small>${esc(x.variant)} × ${x.qty}${x.mode === 'sub' ? ' · підписка' : ''}</small></span></li>`).join('')}</ul></article>`).join('')}</div></section>` : ''}`;
  }

  function accLogin(root, h) {
    const saved = store.get('customer', {});
    root.innerHTML = `<section class="acc-login">
      <div class="acc-login__card panel">
        <form data-acc-phone novalidate><h2>Вхід за номером телефону</h2><p class="muted">Той самий номер, що й у замовленні. ${h.sms ? 'Надішлемо SMS з кодом.' : 'Надішлемо код для входу.'}</p>
          <label class="field"><span>Телефон</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 __ ___ __ __" value="${esc(saved.phone || '')}"></label>
          <button class="btn btn--brand btn--lg btn--block" type="submit">Отримати код</button></form>
        <form data-acc-code novalidate hidden><h2>Введіть код</h2><p class="muted" data-acc-sent></p>
          <label class="field"><span>Код (4 цифри)</span><input class="input input--code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="4"></label>
          <p class="note note--info" data-acc-demo hidden></p>
          <button class="btn btn--brand btn--lg btn--block" type="submit">Увійти</button>
          <p class="acc-login__alt"><button class="linkbtn" type="button" data-acc-back>Змінити номер</button><button class="linkbtn" type="button" data-acc-resend disabled>Надіслати ще раз</button></p></form>
      </div>
      <div class="acc-login__aside">
        <span class="acc-login__arch"><img src="${R(CFG.catsImg || '/assets/img/brand/cut-cat.webp')}" alt="" width="420" height="525" loading="lazy"></span>
        <ul class="acc-perks">
          <li>${ICON.refresh}<span><b>Підписки</b>пропустити доставку, змінити дату, частоту чи кількість, поставити на паузу</span></li>
          <li>${svg('<path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z"/><path d="m4 8 8 4 8-4M12 12v8"/>')}<span><b>Замовлення</b>статус і номер накладної Нової пошти</span></li>
          <li>${svg('<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>')}<span><b>Без паролів</b>вхід кодом; на цьому пристрої — 30 днів</span></li>
        </ul>
      </div></section>`;
    const fp = $('[data-acc-phone]', root), fc = $('[data-acc-code]', root);
    const resend = $('[data-acc-resend]', root);
    let phoneVal = '', timer = null;
    bindPhone(fp.phone);
    const countdown = (s) => {
      clearInterval(timer); resend.disabled = true;
      const tick = () => { resend.textContent = s > 0 ? `Надіслати ще раз через ${s} с` : 'Надіслати ще раз'; resend.disabled = s > 0; s -= 1; if (s < 0) clearInterval(timer); };
      tick(); timer = setInterval(tick, 1000);
    };
    const ask = async (btn) => {
      busy(btn, true);
      let ok = false;
      try {
        const r = await apiPost('/api/auth/code', { phone: phoneVal });
        fp.hidden = true; fc.hidden = false;
        $('[data-acc-sent]', fc).textContent = r.sent ? `Надіслали SMS на ${r.phone}.` : `Номер ${r.phone}.`;
        const demo = $('[data-acc-demo]', fc);
        demo.hidden = !r.demo_code;
        if (r.demo_code) demo.innerHTML = `Демо: SMS-сервіс не підключено, тому код показуємо тут — <b>${esc(r.demo_code)}</b>`;
        fc.code.value = ''; setErr(fc.code, ''); fc.code.focus();
        ok = true;
      } catch (e) {
        if (fc.hidden) { setErr(fp.phone, e.message); fp.phone.focus(); } else toast(`<div><b>Код не надіслано</b><small>${esc(e.message)}</small></div>`, 5000, true);
      }
      busy(btn, false);
      if (ok) countdown(60);
    };
    fp.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!phoneOK(fp.phone.value)) { setErr(fp.phone, 'Телефон у форматі +380 XX XXX XX XX'); fp.phone.focus(); return; }
      setErr(fp.phone, ''); phoneVal = fp.phone.value; ask($('button[type=submit]', fp));
    });
    resend.addEventListener('click', () => ask(resend));
    $('[data-acc-back]', root).addEventListener('click', () => { fc.hidden = true; fp.hidden = false; clearInterval(timer); fp.phone.focus(); });
    const verify = async () => {
      const code = fc.code.value.replace(/\D/g, '');
      if (code.length !== 4) { setErr(fc.code, 'Код — 4 цифри'); fc.code.focus(); return; }
      const btn = $('button[type=submit]', fc); busy(btn, true);
      try { await apiPost('/api/auth/verify', { phone: phoneVal, code }); clearInterval(timer); accApp(root, await apiGet('/api/me'), h); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); }
      catch (e) { busy(btn, false); setErr(fc.code, e.message); fc.code.select(); }
    };
    fc.code.addEventListener('input', () => { fc.code.value = fc.code.value.replace(/\D/g, '').slice(0, 4); if (fc.code.value.length === 4) verify(); });
    fc.addEventListener('submit', (e) => { e.preventDefault(); verify(); });
  }

  function subCard(s) {
    const n = s.numbers || {}, st = s.status;
    const badge = st === 'active' ? '<span class="badge badge--sub">Активна</span>' : st === 'paused' ? '<span class="badge">На паузі</span>' : '<span class="badge badge--out">Скасована</span>';
    const next = st === 'active' && s.next_date ? `<div class="subcard__next"><span>Наступна доставка</span><b>${dateISO(s.next_date)}</b><small>нагадаємо ${dateISO(s.reminder_date)}${s.schedule && s.schedule.length > 1 ? ' · далі ' + s.schedule.slice(1, 3).map(dateISO).join(', ') : ''}</small></div>` : '';
    const ctl = st === 'active' ? `<div class="subcard__ctl">
        <label class="field"><span>Частота</span><select class="select" data-s-cad>${cadOptions(s.cadence_weeks)}</select></label>
        <div class="field"><span id="sq-${s.id}">Упаковок</span><div class="stepper stepper--sm"><button type="button" data-s-q="-1" aria-label="Менше">−</button><input type="number" min="1" max="20" value="${s.qty}" data-s-qty aria-labelledby="sq-${s.id}"><button type="button" data-s-q="1" aria-label="Більше">+</button></div></div>
        <label class="field"><span>Дата доставки</span><input class="input" type="date" data-s-date value="${esc(s.next_date)}" min="${isoDay(1)}" max="${isoDay(120)}"></label></div>` : '';
    const acts = st === 'active'
      ? `<button class="btn btn--ghost btn--sm" type="button" data-s-act="skip">Пропустити наступну</button><button class="btn btn--ghost btn--sm" type="button" data-s-act="pause">Пауза</button><button class="linkbtn linkbtn--danger" type="button" data-s-act="cancel">Скасувати підписку</button>`
      : `<button class="btn btn--brand btn--sm" type="button" data-s-act="resume">Відновити</button>${st === 'paused' ? '<button class="linkbtn linkbtn--danger" type="button" data-s-act="cancel">Скасувати підписку</button>' : ''}`;
    return `<article class="subcard is-${st}" data-sid="${s.id}">
      <a class="subcard__img" href="${esc(R(s.url))}" tabindex="-1" aria-hidden="true"><img src="${esc(R(s.img))}" alt="" width="96" height="96" loading="lazy"></a>
      <div class="subcard__main">
        <div class="subcard__top"><div><a class="subcard__t" href="${esc(R(s.url))}">${esc(s.title)}</a><p class="subcard__v">${esc(s.variant)} × ${s.qty} · кожні ${weeks(s.cadence_weeks)}</p></div>${badge}</div>
        ${n.per_delivery != null ? `<p class="subcard__price"><b>${money(n.per_delivery)}</b> за доставку <s>${money(Math.round(n.unit * s.qty * 100) / 100)}</s><span>економія ${approx(n.saving_per_year)} на рік</span></p>` : ''}
        ${s.available ? '' : '<p class="note">Цього товару зараз немає в наявності.</p>'}
        ${next}${ctl}<div class="subcard__acts">${acts}</div>
      </div></article>`;
  }

  function orderCard(o) {
    return `<article class="ordcard"><header class="ordcard__head"><div><b>${esc(o.id)}</b><span class="muted">${dateISO(o.created_at)}${o.source === 'subscription' ? ' · за підпискою' : ''}</span></div>
        <span class="status status--${esc(o.status)}">${esc(o.status_label)}</span><b class="ordcard__sum">${money(o.total)}</b></header>
      <ul class="ordcard__items">${o.items.map((x) => `<li><img src="${esc(R(x.img))}" alt="" width="44" height="44" loading="lazy"><span>${esc(x.title)}<small>${esc(x.variant)} × ${x.qty}${x.mode === 'sub' ? ' · підписка' : ''}</small></span></li>`).join('')}</ul>
      <p class="ordcard__meta"><span>${esc(o.city)}, ${esc(SHIP_SHORT[o.ship_method] || '')} ${esc(o.ship_method === 'np-courier' ? o.address : String(o.branch || '').replace(/^Відділення |^Поштомат "Нова Пошта" /, '').replace(/\s*\([^)]*кг[^)]*\)/, ''))}</span>
        <span>${esc(o.pay_label)}</span>${o.ttn ? `<span>ТТН <b>${esc(o.ttn)}</b> <button class="linkbtn" type="button" data-copy="${esc(o.ttn)}">Скопіювати</button></span>` : ''}</p></article>`;
  }

  function accApp(root, me, h) {
    const name = me.first_name ? `, ${esc(me.first_name)}` : '';
    const sm = me.summary;
    const d = me.delivery;
    const where = d ? `${d.city}, ${d.ship_method === 'np-courier' ? d.address : String(d.branch || '').replace(/\s*\([^)]*кг[^)]*\)/, '')}` : '';
    root.innerHTML = `<div class="acc-top"><div><p class="acc-hello">Вітаємо${name}!</p><p class="muted">${esc(me.phone)}</p></div><button class="btn btn--ghost btn--sm" type="button" data-acc-logout>Вийти</button></div>
      ${me.subscriptions.length ? `<section class="acc-sec" aria-labelledby="acc-subs-h"><div class="acc-sec__head"><h2 id="acc-subs-h">Підписки</h2>
          <dl class="acc-sum" data-acc-sum><div><dt>Активних</dt><dd>${sm.active}</dd></div><div><dt>Приблизно на місяць</dt><dd>${approx(sm.per_month)}</dd></div><div class="is-save"><dt>Економія за рік</dt><dd>${approx(sm.saving_per_year)}</dd></div></dl></div>
        <div class="subcards">${me.subscriptions.map(subCard).join('')}</div>
        ${where ? `<p class="hint acc-where">Доставка за підпискою — туди ж, куди й останнє замовлення: ${esc(where)}. Щоб змінити адресу, вкажіть нову в наступному замовленні.</p>` : ''}</section>`
        : `<section class="acc-sec acc-empty"><h2>Підписок поки немає</h2><p>Корм, який приїжджає сам: −${CFG.sub}% на кожну доставку, частота від ${Math.min(...CFG.cadences)} до ${Math.max(...CFG.cadences)} тижнів, скасування будь-коли.</p><a class="btn btn--brand" href="${R('/pidpyska/')}">Як працює підписка</a></section>`}
      <section class="acc-sec" aria-labelledby="acc-ord-h"><h2 id="acc-ord-h">Замовлення</h2>${me.orders.length ? `<div class="ordcards">${me.orders.map(orderCard).join('')}</div>` : '<p class="muted">Замовлень за цим номером ще немає.</p>'}</section>`;
    $('[data-acc-logout]', root).addEventListener('click', async () => { try { await apiPost('/api/auth/logout'); } catch (e) { /* однаково виходимо */ } accLogin(root, h); });
  }
  function onCopy(e) {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const done = () => toast(`<div><b>${ICON.check}Скопійовано</b><small>${esc(b.dataset.copy)}</small></div>`, 2400, true);
    if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).then(done, () => {}); else done();
  }

  function bindSubs(root, h) {
    const say = { skip: (s) => `Наступну доставку пропущено — тепер ${dateISO(s.next_date)}`, pause: () => 'Підписку поставлено на паузу', resume: (s) => `Підписку відновлено — доставка ${dateISO(s.next_date)}`,
      cancel: () => 'Підписку скасовано', cadence: (s) => `Тепер кожні ${weeks(s.cadence_weeks)}, наступна доставка ${dateISO(s.next_date)}`, date: (s) => `Доставку перенесено на ${dateISO(s.next_date)}`, qty: (s) => `Упаковок у доставці: ${s.qty}` };
    const act = async (card, action, value) => {
      card.classList.add('is-busy');
      try {
        const s = await apiPost(`/api/me/subscriptions/${card.dataset.sid}`, { action, value });
        const tmp = document.createElement('div'); tmp.innerHTML = subCard(s);
        const fresh = tmp.firstElementChild; card.replaceWith(fresh);
        toast(`<div><b>${ICON.check}${esc(say[action](s))}</b></div>`, 3200, true);
        const ctl = $(`[data-s-act="${action === 'pause' ? 'resume' : action === 'resume' ? 'pause' : action}"]`, fresh) || $(action === 'cadence' ? '[data-s-cad]' : action === 'date' ? '[data-s-date]' : action === 'qty' ? '[data-s-qty]' : '.subcard__t', fresh);
        if (ctl) ctl.focus({ preventScroll: true });
        apiGet('/api/me').then((me) => { const box = $('[data-acc-sum]', root); if (!box) return; const sm = me.summary; $$('dd', box).forEach((dd, i) => { dd.textContent = [sm.active, approx(sm.per_month), approx(sm.saving_per_year)][i]; }); }).catch(() => {});
      } catch (e) {
        card.classList.remove('is-busy');
        if (e.status === 401) { accLogin(root, h); return; }
        toast(`<div><b>Не вдалося змінити підписку</b><small>${esc(e.message)}</small></div>`, 5000, true);
      }
    };
    root.addEventListener('click', (e) => {
      const card = e.target.closest('.subcard'); if (!card || card.classList.contains('is-busy')) return;
      const b = e.target.closest('[data-s-act]');
      if (b) {
        if (b.dataset.sAct === 'cancel' && !window.confirm('Скасувати підписку? Знижку на наступні доставки буде втрачено.')) return;
        act(card, b.dataset.sAct); return;
      }
      const q = e.target.closest('[data-s-q]');
      if (q) {
        const inp = $('[data-s-qty]', card); inp.value = Math.max(1, Math.min(20, Number(inp.value || 1) + Number(q.dataset.sQ)));
        clearTimeout(card._qt); card._qt = setTimeout(() => act(card, 'qty', Number(inp.value)), 600);
      }
    });
    root.addEventListener('change', (e) => {
      const card = e.target.closest('.subcard'); if (!card) return;
      if (e.target.matches('[data-s-cad]')) act(card, 'cadence', Number(e.target.value));
      else if (e.target.matches('[data-s-date]') && e.target.value) act(card, 'date', e.target.value);
      else if (e.target.matches('[data-s-qty]')) { clearTimeout(card._qt); act(card, 'qty', Math.max(1, Math.min(20, Number(e.target.value) || 1))); }
    });
  }

  /* ---------------- калькулятор підписки на /pidpyska/ ---------------- */
  function initSubCalcPage() {
    const root = $('[data-subcalc-page]'); if (!root) return;
    const items = JSON.parse(root.dataset.items || '[]'); if (!items.length) return;
    const ps = $('[data-c-product]', root), vs = $('[data-c-variant]', root), qi = $('[data-c-qty]', root);
    const cadOf = () => Number(($('input[name="c-cad"]:checked', root) || {}).value || CFG.cadence);
    const cur = () => items.find((x) => x.id === ps.value) || items[0];
    const fillV = () => { const it = cur(); vs.innerHTML = it.v.map((v, i) => `<option value="${i}"${i === it.d ? ' selected' : ''}${v.a ? '' : ' disabled'}>${esc(v.l || '1 шт')} — ${money(v.p)}</option>`).join(''); };
    const calc = () => {
      const it = cur(), v = it.v[Number(vs.value) || 0], q = Math.max(1, Math.min(20, Number(qi.value) || 1)), c = cadOf(), n = subNums(v.p, q, c);
      $('[data-c-year]', root).textContent = approx(n.year);
      $('[data-c-del]', root).textContent = money(n.del);
      $('[data-c-full]', root).textContent = money(n.full);
      $('[data-c-count]', root).textContent = n.n;
      $('[data-c-month]', root).textContent = approx(n.month);
      $('[data-c-dates]', root).textContent = 'перша — із замовленням, далі ' + [1, 2, 3].map((k) => dateUA(addDays(c * 7 * k))).join(', ');
      $('[data-c-link]', root).href = R(it.u);
      $('[data-c-add]', root).disabled = !v.a;
    };
    ps.addEventListener('change', () => { fillV(); calc(); });
    vs.addEventListener('change', calc);
    qi.addEventListener('input', calc);
    $$('[data-c-step]', root).forEach((b) => b.addEventListener('click', () => { qi.value = Math.max(1, Math.min(20, (Number(qi.value) || 1) + Number(b.dataset.cStep))); calc(); }));
    $$('input[name="c-cad"]', root).forEach((r) => r.addEventListener('change', calc));
    $('[data-c-add]', root).addEventListener('click', (e) => {
      const it = cur(), vi = Number(vs.value) || 0, v = it.v[vi]; if (!v || !v.a) return;
      Cart.add({ id: it.id, vi, t: it.t, b: it.b, l: v.l, u: it.u, i: v.i, p: v.p, o: v.o, mode: 'sub', cad: cadOf(), sb: true, k: it.k }, Math.max(1, Number(qi.value) || 1));
      confirmButton(e.currentTarget, 'Додано');
      setTimeout(openDrawer, reduceMotion ? 0 : 180);
    });
    calc();
  }

  /* ---------------- старт ---------------- */
  function init() {
    initHeader();
    initMotion();
    bindLines($('[data-drawer]') || document.createElement('div'));
    const cp = $('[data-cart-page]'); if (cp) bindLines(cp);
    renderCart();
    Wish.render();
    initSearch();
    initSearchPage();
    initWishPage();
    initCatalog();
    initPDP();
    initScene();
    $$('[data-calc]').forEach((c) => { if (!c.closest('[data-pdp]')) initCalc(c); });
    initCheckout();
    initThanks();
    initAccount();
    initSubCalcPage();
    window.addEventListener('storage', (e) => { if (e.key === 'lapa:cart') { Cart.items = store.get('cart', []); renderCart(); } if (e.key === 'lapa:wish') { Wish.ids = store.get('wish', []); Wish.render(); } });
  }
  window.__lapa = 1;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
