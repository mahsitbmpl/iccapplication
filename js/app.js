/**
 * App shell: login / first start / password change, layout, branch switcher, routing.
 * Data shows from the device cache first, then refreshes from the server.
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var root = document.getElementById('app');

  var NAV = [
    { page: 'home', label: 'Home', ico: '⌂' },
    { page: 'patients', label: 'Patients', ico: '☰' },
    { page: 'upload', label: 'Upload', ico: '⇪', perm: 'upload' },
    { page: 'quality', label: 'Quality', ico: '✓' },
    { page: 'settings', label: 'Settings', ico: '⚙', perm: ['manage_lists', 'manage_departments'] },
    { page: 'users', label: 'Users', ico: '👤', perm: 'manage_users' },
    { page: 'system', label: 'System', ico: 'ⓘ', perm: 'manage_users' },
    { page: 'branches', label: 'Branches', ico: '⌘', superOnly: true }
  ];

  var App = {
    init: function () {
      if (!window.ICC_CONFIG || /PASTE_YOUR/.test(window.ICC_CONFIG.API_URL)) return App.showConfigNeeded();
      if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
      window.addEventListener('hashchange', App.render);
      if (!S.token || !S.profile) return App.showLogin();
      if (S.profile.user.must_change) return App.showChangePassword(true);
      App.startBranch();
    },

    showConfigNeeded: function () {
      I.clear(root).appendChild(h('div', { class: 'auth' }, h('div', { class: 'card' },
        h('h2', null, 'Setup needed'),
        h('p', null, 'Open js/config.js and paste the Apps Script web app URL into API_URL, then reload.'))));
    },

    /* ---------- auth screens ---------- */
    showLogin: function (msg) {
      var err = h('div');
      if (msg) err.appendChild(h('div', { class: 'msg warn' }, msg));
      var u = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', id: 'lg-user' });
      var p = h('input', { type: 'password', autocomplete: 'current-password', id: 'lg-pass' });
      var btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%' }, 'Log in');
      var form = h('form', { onsubmit: function (e) {
        e.preventDefault();
        btn.disabled = true; btn.textContent = 'Logging in…'; I.clear(err);
        I.Api.call('login', { username: u.value, password: p.value }, { branch: false }).then(function (d) {
          if (d.needSetup) return App.showSetup();
          App.sessionStarted(d);
        }).catch(function (e) {
          err.appendChild(h('div', { class: 'msg err' }, I.errText(e)));
          btn.disabled = false; btn.textContent = 'Log in';
        });
      } }, h('label', { class: 'f' }, h('span', null, 'Username'), u), h('label', { class: 'f' }, h('span', null, 'Password'), p), err, btn);
      I.clear(root).appendChild(h('div', { class: 'auth' }, App.logo(), h('div', { class: 'card' }, form)));
      setTimeout(function () { u.focus(); }, 30);
    },

    showSetup: function () {
      var err = h('div');
      var code = h('input', { type: 'text', autocapitalize: 'characters' });
      var p1 = h('input', { type: 'password', autocomplete: 'new-password' });
      var p2 = h('input', { type: 'password', autocomplete: 'new-password' });
      var btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%' }, 'Set admin password');
      var form = h('form', { onsubmit: function (e) {
        e.preventDefault(); I.clear(err);
        if (p1.value !== p2.value) return err.appendChild(h('div', { class: 'msg err' }, 'The two passwords differ.'));
        btn.disabled = true;
        I.Api.call('setupAdmin', { setupCode: code.value, newPassword: p1.value }, { branch: false })
          .then(App.sessionStarted)
          .catch(function (e) { err.appendChild(h('div', { class: 'msg err' }, I.errText(e))); btn.disabled = false; });
      } },
        h('p', { class: 'small' }, 'First start. Enter the setup code shown in the Apps Script log after running setup(), and choose the admin password (8+ characters, letters and numbers).'),
        h('label', { class: 'f' }, h('span', null, 'Setup code'), code),
        h('label', { class: 'f' }, h('span', null, 'New admin password'), p1),
        h('label', { class: 'f' }, h('span', null, 'Repeat password'), p2), err, btn);
      I.clear(root).appendChild(h('div', { class: 'auth' }, App.logo(), h('div', { class: 'card' }, form)));
    },

    showChangePassword: function (forced) {
      var err = h('div');
      var o = h('input', { type: 'password', autocomplete: 'current-password' });
      var p1 = h('input', { type: 'password', autocomplete: 'new-password' });
      var p2 = h('input', { type: 'password', autocomplete: 'new-password' });
      var btn = h('button', { class: 'btn primary', type: 'submit', style: 'width:100%' }, 'Save new password');
      var form = h('form', { onsubmit: function (e) {
        e.preventDefault(); I.clear(err);
        if (p1.value !== p2.value) return err.appendChild(h('div', { class: 'msg err' }, 'The two passwords differ.'));
        btn.disabled = true;
        I.Api.call('changePassword', { oldPassword: o.value, newPassword: p1.value }, { branch: false }).then(function (d) {
          S.profile = d.profile; I.Store.set('profile', d.profile);
          I.toast('Password changed');
          App.startBranch();
        }).catch(function (e) { err.appendChild(h('div', { class: 'msg err' }, I.errText(e))); btn.disabled = false; });
      } },
        h('p', { class: 'small' }, forced ? 'Please choose your own password before you start.' : 'Change your password.'),
        h('label', { class: 'f' }, h('span', null, forced ? 'Temporary password' : 'Current password'), o),
        h('label', { class: 'f' }, h('span', null, 'New password (8+ characters, letters and numbers)'), p1),
        h('label', { class: 'f' }, h('span', null, 'Repeat new password'), p2), err, btn,
        forced ? h('p', { class: 'small' }, h('a', { href: '#', onclick: function (e) { e.preventDefault(); App.logout(); } }, 'Log out')) : null);
      I.clear(root).appendChild(h('div', { class: 'auth' }, App.logo(), h('div', { class: 'card' }, form)));
    },

    logo: function () {
      return h('div', { class: 'logo' }, h('b', null, 'ICC Hospital Operations'), h('span', { class: 'muted small' }, 'Internal Customer Care'));
    },

    sessionStarted: function (d) {
      S.token = d.token; S.profile = d.profile;
      I.Store.set('token', d.token); I.Store.set('profile', d.profile);
      if (d.profile.user.must_change) return App.showChangePassword(true);
      App.startBranch();
    },

    sessionEnded: function () {
      if (!S.token) return;
      S.token = ''; S.profile = null; S.boot = null; S.index = null; S.patients = {};
      I.Store.clearAll();
      App.showLogin('Your session has ended. Please log in again.');
    },

    mustChange: function () {
      if (S.profile) { S.profile.user.must_change = true; I.Store.set('profile', S.profile); }
      App.showChangePassword(true);
    },

    logout: function () {
      var token = S.token;
      I.Api.call('logout', { token: token }, { branch: false }).catch(function () {});
      S.token = ''; S.profile = null; S.boot = null; S.index = null; S.patients = {};
      I.Store.clearAll();                 // patient data never stays on a shared device
      App.showLogin();
    },

    /* ---------- branch ---------- */
    startBranch: function () {
      var ids = Object.keys(S.profile.branches || {});
      if (!ids.length) {
        I.clear(root).appendChild(h('div', { class: 'auth' }, App.logo(), h('div', { class: 'card' },
          h('p', null, 'Your account has no branch yet. Ask the Admin to give you access.'),
          h('button', { class: 'btn', onclick: App.logout }, 'Log out'))));
        return;
      }
      if (ids.indexOf(S.branchId) < 0) { S.branchId = ids[0]; I.Store.set('branchId', S.branchId); }
      S.boot = I.Store.get('boot.' + S.branchId, null);
      S.index = I.Store.get('index.' + S.branchId, null);
      S.patients = {};
      App.renderShell();
      App.refreshBranch();
    },

    /** Refresh bootstrap and search index in the background; re-render if something changed. */
    refreshBranch: function () {
      var bid = S.branchId;
      App.setRefreshing(true);
      return I.Api.call('bootstrap').then(function (boot) {
        if (bid !== S.branchId) return;
        var changed = !S.boot || S.boot.dataVersion !== boot.dataVersion;
        S.boot = boot; I.Store.set('boot.' + bid, boot);
        return App.refreshIndex().then(function () { if (changed) App.render(); });
      }).catch(function (e) {
        if (e.code !== 'SESSION') I.toast(I.errText(e), true);
      }).then(function () { App.setRefreshing(false); });
    },

    refreshIndex: function (force) {
      var bid = S.branchId;
      var have = S.index && !force ? S.index.version : '';
      return I.Api.call('searchIndex', { version: have }).then(function (ix) {
        if (bid !== S.branchId) return false;
        if (ix.same) return false;
        S.index = ix; I.Store.set('index.' + bid, ix);
        return true;
      });
    },

    /** Called after any save that changes data: refresh index quietly. */
    dataChanged: function () {
      return App.refreshIndex().then(function (changed) {
        if (changed && ['home', 'patients'].indexOf(I.route().page) >= 0) App.render();
      }).catch(function () {});
    },

    setRefreshing: function (on) {
      var el = document.getElementById('refreshing');
      if (el) el.textContent = on ? 'updating…' : '';
    },

    renderShell: function () {
      var p = S.profile;
      var sel = h('select', { 'aria-label': 'Branch', onchange: function () {
        S.branchId = sel.value; I.Store.set('branchId', S.branchId); I.go('home'); App.startBranch();
      } });
      Object.keys(p.branches).forEach(function (id) {
        sel.appendChild(h('option', { value: id, selected: id === S.branchId ? 'selected' : null }, p.branches[id].name));
      });
      var items = NAV.filter(function (n) {
        if (n.superOnly) return p.user.is_super;
        if (!n.perm) return true;
        return [].concat(n.perm).some(I.can);
      });
      var side = h('nav', { class: 'sidenav' }), bottom = h('nav', { class: 'bottomnav' });
      items.forEach(function (n) {
        side.appendChild(h('a', { href: '#/' + n.page, 'data-page': n.page }, h('span', { class: 'nav-ico' }, n.ico), n.label));
      });
      items.filter(function (n) { return ['home', 'patients', 'upload', 'quality', 'settings'].indexOf(n.page) >= 0; }).forEach(function (n) {
        bottom.appendChild(h('a', { href: '#/' + n.page, 'data-page': n.page }, h('span', { class: 'nav-ico' }, n.ico), n.label));
      });
      var more = items.filter(function (n) { return ['users', 'system', 'branches'].indexOf(n.page) >= 0; });
      if (more.length) bottom.appendChild(h('a', { href: '#/more', 'data-page': 'more' }, h('span', { class: 'nav-ico' }, '⋯'), 'More'));
      var main = h('main', { class: 'main', id: 'main' });
      I.clear(root).appendChild(h('div', null,
        h('header', { class: 'topbar' },
          h('span', { class: 'title' }, 'ICC'),
          Object.keys(p.branches).length > 1 ? sel : h('span', null, p.branches[S.branchId].name),
          h('span', { id: 'refreshing', class: 'refreshing', style: 'color:#cfe' }),
          h('span', { class: 'spacer' }),
          h('span', { class: 'user' }, p.user.display_name),
          h('button', { onclick: App.logout, title: 'Log out' }, 'Log out')),
        h('div', { class: 'layout' }, side, main), bottom));
      App.render();
    },

    render: function () {
      var main = document.getElementById('main');
      if (!main) return;
      var r = I.route();
      document.querySelectorAll('[data-page]').forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('data-page') === r.page || (r.page === 'patient' && a.getAttribute('data-page') === 'patients'));
      });
      var view = window.Views[r.page] || window.Views.home;
      I.clear(main);
      if (!S.boot) { main.appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading branch…')); return; }
      try { view(main, r.arg); } catch (e) { main.appendChild(h('div', { class: 'msg err' }, 'Screen error: ' + I.errText(e))); console.error(e); }
      window.scrollTo(0, 0);
    }
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', App.init);
})();
