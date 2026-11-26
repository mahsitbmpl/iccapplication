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
      if (State.token && !req.token) req.token = State.token;
      if (opts.branch !== false && State.branchId && !req.branchId) req.branchId = State.branchId;
      var url = window.ICC_CONFIG.API_URL;
      var t0 = performance.now();
      // text/plain body = "simple request": no CORS preflight against Apps Script.
      return fetch(url, { method: 'POST', body: JSON.stringify(req), redirect: 'follow' })
        .catch(function () { throw new ApiError('NETWORK', 'No connection to the server. Check the internet and try again.'); })
        .then(function (res) { return res.text(); })
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

  window.ICC = {
    h: h, clear: clear, $: $, fmtD: fmtD, fmtDT: fmtDT, dayStart: dayStart, Store: Store, State: State, Api: Api,
    ApiError: ApiError, toast: toast, errText: errText, modal: modal, confirmBox: confirmBox, can: can,
    searchIndex: searchIndex, indexObjects: indexObjects, applyIndex: applyIndex, route: route, go: go
  };
})();
