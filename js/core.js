/**
 * Core helpers: DOM builder, IST dates, API client, local cache, toast/modal, router.
 * No framework, no build step: plain JavaScript that GitHub Pages can serve as is.
 */
(function () {
  'use strict';

  /* ---------- DOM ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 2);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    kids.forEach(function (k) {
      if (k === null || k === undefined || k === false) return;
      if (Array.isArray(k)) append(el, k);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    });
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function $(sel, root) { return (root || document).querySelector(sel); }


  /* ---------- icons (paths from Lucide, ISC licence) ---------- */
  var ICONS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    patients: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    quality: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    settings: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    users: '<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>',
    system: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
    branches: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    admitted: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
    transfer: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    discharged: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M7 16V11M12 16V7M17 16v-3"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2M14 13h2M8 17h2M14 17h2"/>',
    edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>'
  };
  function icon(name, size) {
    var s = document.createElement('span');
    s.className = 'ico';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<svg viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
    return s;
  }

  /* ---------- dates (always Asia/Kolkata) ---------- */
  var IST = 5.5 * 3600 * 1000;
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtD(ms) { if (!ms) return ''; var d = new Date(+ms + IST); return p2(d.getUTCDate()) + '-' + p2(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear(); }
  function fmtDT(ms) { if (!ms) return ''; var d = new Date(+ms + IST); return fmtD(ms) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); }
  function dayStart(ms) { var d = new Date((ms || Date.now()) + IST); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST; }

  /* ---------- local cache ---------- */
  var Store = {
    get: function (k, def) { try { var v = localStorage.getItem('icc.' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem('icc.' + k, JSON.stringify(v)); } catch (e) { /* storage full: ignore */ } },
    del: function (k) { localStorage.removeItem('icc.' + k); },
    clearAll: function () {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('icc.') === 0) localStorage.removeItem(k); });
    }
  };

  /* ---------- state ---------- */
  var State = {
    token: Store.get('token', ''),
    profile: Store.get('profile', null),
    branchId: Store.get('branchId', ''),
    boot: null,          // bootstrap data for the branch
    index: null,         // search index {version, cols, rows}
    patients: {}         // patient card cache (memory only)
  };

  /* ---------- API ---------- */
  function ApiError(code, message, extra) { this.code = code; this.message = message; this.extra = extra; }
  ApiError.prototype = Object.create(Error.prototype);

  var Api = {
    log: [],
    call: function (action, body, opts) {
      opts = opts || {};
      var req = Object.assign({ action: action }, body || {});
      if (State.token && !req.token && !opts.noAuth) req.token = State.token;
      // The app's address, so links in mails (HOD page) point back here.
      if (['saveActivity', 'sendToHod', 'complaintAction', 'testMail'].indexOf(action) >= 0) req.appUrl = location.href.split('#')[0];
      if (opts.branch !== false && State.branchId && !req.branchId) req.branchId = State.branchId;
      var url = window.ICC_CONFIG.API_URL;
      var t0 = performance.now();
      // text/plain body = "simple request": no CORS preflight against Apps Script.
      // A request that hangs (weak mobile signal) ends after 3 minutes instead of waiting for ever.
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 180000) : null;
      return fetch(url, { method: 'POST', body: JSON.stringify(req), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
        .catch(function (e) {
          if (e && e.name === 'AbortError') throw new ApiError('NETWORK', 'No answer from the server for 3 minutes. Check whether it was saved before trying again.');
          throw new ApiError('NETWORK', 'No connection to the server. Check the internet and try again.');
        })
        .then(function (res) { clearTimeout(timer); return res.text(); })
        .then(function (text) {
          var ms = Math.round(performance.now() - t0);
          var json;
          try { json = JSON.parse(text); }
          catch (e) { throw new ApiError('SERVER', 'Unexpected reply from the server. Check the API URL in js/config.js and that the web app access is "Anyone".'); }
          var entry = { action: action, ms: ms, serverMs: json.ms, bytes: text.length, ok: json.ok };
          Api.last = entry;
          Api.log.push(entry);
          if (Api.log.length > 200) Api.log.shift();
          if (!json.ok) {
            if (json.code === 'SESSION' && window.App) window.App.sessionEnded();
            if (json.code === 'MUST_CHANGE' && window.App) window.App.mustChange();
            throw new ApiError(json.code, json.error, json.extra);
          }
          return json.data;
        });
    }
  };

  /* ---------- toast / modal ---------- */
  var toastTimer = null;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, isErr ? 5000 : 2600);
  }
  function errText(e) { return e && e.message ? e.message : String(e); }

  function modal(title, body, actions) {
    var root = $('#modal-root');
    var bg = h('div', { class: 'modal-bg', onclick: function (ev) { if (ev.target === bg) close(); } });
    var box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, h('h2', null, title), body);
    var acts = h('div', { class: 'actions' });
    function close() { if (bg.parentNode) root.removeChild(bg); }
    (actions || [{ label: 'Close' }]).forEach(function (a) {
      acts.appendChild(h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), onclick: function () {
        var r = a.onClick ? a.onClick() : true;
        if (r && r.then) r.then(function (keep) { if (keep !== false) close(); });
        else if (r !== false) close();
      } }, a.label));
    });
    box.appendChild(acts);
    bg.appendChild(box);
    root.appendChild(bg);
    var first = box.querySelector('input, select, textarea');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return { close: close, box: box };
  }
  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      modal(title, h('p', { class: 'preline' }, text), [
        { label: 'Cancel', onClick: function () { resolve(false); } },
        { label: okLabel || 'OK', primary: true, onClick: function () { resolve(true); } }
      ]);
    });
  }

  /* ---------- permissions ---------- */
  function can(perm) {
    var b = State.profile && State.profile.branches[State.branchId];
    return !!(b && b.perms.indexOf(perm) >= 0);
  }

  /* ---------- search over the cached index (on the device) ---------- */
  var objsCache = { ref: null, list: [] };   // decoded patient list (kept out of localStorage)

  function indexObjects() {
    var ix = State.index;
    if (!ix) return [];
    if (objsCache.ref === ix && objsCache.ver === ix.version && objsCache.n === ix.rows.length) return objsCache.list;
    var cols = ix.cols;
    var groups = (State.boot && State.boot.settings.report_groups) || [];
    var list = ix.rows.map(function (r) {
      var o = {};
      for (var i = 0; i < cols.length; i++) o[cols[i]] = r[i];
      o.status = o.st === 'I' ? 'IN' : 'DISCHARGED';
      o.group = o.grp === '' || groups[o.grp] === undefined ? '' : groups[o.grp].name;
      o.admn_dt = o.adm ? o.adm * 60000 : '';
      o.dis_dt = o.dis ? o.dis * 60000 : '';
      o.last_transfer_dt = o.ltd ? o.ltd * 60000 : '';
      o._s = (o.admn_no + ' ' + o.umr_no + ' ' + o.name + ' ' + o.bed + ' ' + o.mobile).toLowerCase();
      return o;
    });
    objsCache = { ref: ix, ver: ix.version, n: ix.rows.length, list: list };
    return list;
  }

  /**
   * Apply a server answer to the device's patient list: {same}, {delta, rows, removed} or a full list.
   * Returns true if something changed, false if not, 'need-full' if a delta arrived without a base copy.
   */
  function applyIndex(ix) {
    if (!ix || ix.same) return false;
    if (ix.delta) {
      if (!State.index) return 'need-full';
      if (ix.cols && State.index.cols && ix.cols.join() !== State.index.cols.join()) return 'need-full';   // list format changed
      var cur = State.index, pos = {};
      cur.rows.forEach(function (r, i) { pos[r[0]] = i; });
      ix.rows.forEach(function (r) { if (pos[r[0]] !== undefined) cur.rows[pos[r[0]]] = r; else { pos[r[0]] = cur.rows.length; cur.rows.push(r); } });
      if (ix.removed && ix.removed.length) {
        var rm = {};
        ix.removed.forEach(function (a) { rm[a] = true; });
        cur.rows = cur.rows.filter(function (r) { return !rm[r[0]]; });
      }
      cur.version = ix.version; cur.builtAt = ix.builtAt || Date.now();
      objsCache.ref = null;
    } else {
      State.index = { version: ix.version, cols: ix.cols, rows: ix.rows, builtAt: ix.builtAt };
    }
    Store.set('index.' + State.branchId, State.index);
    return true;
  }

  function searchIndex(q) {
    var list = indexObjects();
    q = String(q || '').trim().toLowerCase();
    if (!q) return [];
    var words = q.split(/\s+/);
    var bedExact = q.toUpperCase();
    var hits = list.filter(function (o) { return words.every(function (w) { return o._s.indexOf(w) >= 0; }); });
    hits.sort(function (a, b) {
      var ae = String(a.bed).toUpperCase() === bedExact ? 0 : 1, be = String(b.bed).toUpperCase() === bedExact ? 0 : 1;
      if (ae !== be) return ae - be;
      if (a.status !== b.status) return a.status === 'IN' ? -1 : 1;
      return String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true });
    });
    return hits;
  }

  /* ---------- router (#/page/arg) ---------- */
  function route() {
    var parts = (location.hash || '#/home').slice(2).split('/');
    return { page: parts[0] || 'home', arg: decodeURIComponent(parts.slice(1).join('/')) };
  }
  function go(path) { location.hash = '#/' + path; }

  /**
   * Stale-while-revalidate: show the last answer for this screen at once, then ask the server and
   * redraw only if something changed. Screens open instantly after the first visit.
   * Kept in memory, and on the device (cleared at logout) when small.
   */
  var SWR_MEM = {};
  function swrKey(action, params) {
    var uid = State.profile && State.profile.user ? State.profile.user.user_id : '';
    return 'swr.' + uid + '.' + State.branchId + '.' + action + '.' + JSON.stringify(params || {});
  }
  function swrClear() { SWR_MEM = {}; }
  function swr(action, params, onData) {
    var key = swrKey(action, params);
    var cached = SWR_MEM[key] || Store.get(key, null);
    if (cached) { try { onData(cached.d, true); } catch (e) { console.error(e); } }
    return Api.call(action, params || {}).then(function (d) {
      var s = JSON.stringify(d);
      var fresh = { d: d, s: s };
      SWR_MEM[key] = fresh;
      if (s.length < 150000) Store.set(key, fresh); else Store.del(key);
      if (!cached || cached.s !== s) onData(d, false);
      return d;
    }).catch(function (e) {
      if (cached) { toast('Showing the last saved view: ' + errText(e), true); return cached.d; }
      throw e;
    });
  }
  /** Fetch quietly so the screen is ready when opened. */
  function prefetch(list) {
    return list.reduce(function (p, x) {
      return p.then(function () { return swr(x[0], x[1], function () {}).catch(function () {}); });
    }, Promise.resolve());
  }

  window.ICC = {
    swr: swr, prefetch: prefetch, swrClear: swrClear,
    h: h, icon: icon, clear: clear, $: $, fmtD: fmtD, fmtDT: fmtDT, dayStart: dayStart, Store: Store, State: State, Api: Api,
    ApiError: ApiError, toast: toast, errText: errText, modal: modal, confirmBox: confirmBox, can: can,
    searchIndex: searchIndex, indexObjects: indexObjects, applyIndex: applyIndex, route: route, go: go
  };
})();
