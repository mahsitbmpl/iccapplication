/**
 * App shell: login / first start / password change, layout, branch switcher, routing.
 * Data shows from the device cache first, then refreshes from the server.
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var root = document.getElementById('app');

  var NAV = [
    { page: 'home', label: 'Home', ico: 'home' },
    { page: 'patients', label: 'Patients', ico: 'patients' },
    { page: 'dashboard', label: 'Dashboard', ico: 'chart', perm: 'view_dashboard' },
    { page: 'bedready', label: 'Bed Ready', ico: 'bed', perm: ['view_dashboard', 'active_feedback', 'manage_lists'] },
    { page: 'calls', label: 'Discharge calls', short: 'Calls', ico: 'phone', perm: 'discharge_calls' },
    { page: 'general', label: 'General', ico: 'clipboard', perm: ['google_reviews', 'active_feedback', 'night_ipd_opd', 'dama_dor_lama', 'leads', 'inventory_training', 'raise_complaints'] },
    { page: 'inventory', label: 'Inventory', ico: 'box', perm: 'inventory_training' },
    { page: 'complaints', label: 'Complaints', ico: 'alert', perm: ['raise_complaints', 'close_complaints'] },
    { page: 'upload', label: 'Upload', ico: 'upload', perm: 'upload' },
    { page: 'quality', label: 'Data quality', short: 'Quality', ico: 'quality' },
    { page: 'settings', label: 'Settings', ico: 'settings', perm: ['manage_lists', 'manage_departments'] },
    { page: 'users', label: 'Users', ico: 'users', perm: 'manage_users' },
    { page: 'system', label: 'System', ico: 'system', perm: 'manage_users' },
    { page: 'exports', label: 'Excel', ico: 'file', perm: 'download_excel' },
    { page: 'mail', label: 'Email', ico: 'file', perm: 'mail_settings' },
    { page: 'health', label: 'Health', ico: 'system', perm: 'manage_users' },
    { page: 'branches', label: 'Branches', ico: 'branches', superOnly: true }
  ];

  var App = {
    init: function () {
      if (!window.ICC_CONFIG || /PASTE_YOUR/.test(window.ICC_CONFIG.API_URL)) return App.showConfigNeeded();
      if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
      window.addEventListener('hashchange', App.render);
      if (App.hodLink()) return;
      if (!S.token || !S.profile) return App.showLogin();
      if (S.profile.user.must_change) return App.showChangePassword(true);
      App.startBranch();
    },

    showConfigNeeded: function () {
      I.clear(root).appendChild(h('div', { class: 'auth' }, h('div', { class: 'card' },
        h('h2', null, 'Setup needed'),
        h('p', null, 'Open js/config.js and paste the Apps Script web app URL into API_URL, then reload.')), App.footer()));
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
      I.clear(root).appendChild(h('div', { class: 'auth' }, App.logo(), h('div', { class: 'card' }, form), App.footer()));
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
      I.clear(root).appendChild(h('div', { class: 'auth' }, App.logo(), h('div', { class: 'card' }, form), App.footer()));
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
      I.clear(root).appendChild(h('div', { class: 'auth' }, App.logo(), h('div', { class: 'card' }, form), App.footer()));
    },

    logo: function () {
      document.body.classList.add('authbg');
      return h('div', { class: 'logo' }, h('img', { src: 'img/logo.png', alt: 'Marengo Asia Hospitals', width: 190 }),
        h('span', { class: 'wordmark' }, 'MAHS ICC'), h('span', { class: 'tag' }, 'Internal Customer Care'));
    },

    footer: function () {
      return h('footer', { class: 'credit' }, 'Designed & Developed by IT Department, Marengo Asia Hospital, Surat');
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
          h('button', { class: 'btn', onclick: App.logout }, 'Log out')), App.footer()));
        return;
      }
      if (ids.indexOf(S.branchId) < 0) { S.branchId = ids[0]; I.Store.set('branchId', S.branchId); }
      S.boot = I.Store.get('boot.' + S.branchId, null);
      S.index = I.Store.get('index.' + S.branchId, null);
      S.patients = {};
      App.renderShell();
      App.refreshBranch();
    },

    /**
     * One call on opening: settings, upload status and the patient list (only the changes
     * since this device's copy). Screens show the cached copy first, then re-render if needed.
     */
    refreshBranch: function () {
      var bid = S.branchId;
      App.setRefreshing(true);
      return I.Api.call('bootstrap', { indexVersion: S.index ? S.index.version : '' }).then(function (boot) {
        if (bid !== S.branchId) return;
        var ix = boot.index;
        delete boot.index;
        var changed = !S.boot || S.boot.dataVersion !== boot.dataVersion;
        S.boot = boot; I.Store.set('boot.' + bid, boot);
        App.checkVersions(boot.appVersion);
        App.prefetchScreens();
        var res = I.applyIndex(ix);
        if (res === 'need-full') return App.refreshIndex(true).then(function () { App.render(); });
        if (changed || res) App.render();
      }).catch(function (e) {
        if (e.code !== 'SESSION') I.toast(I.errText(e), true);
      }).then(function () { App.setRefreshing(false); });
    },

    /** After start, quietly load the screens this user opens most, so they open at once. */
    prefetchScreens: function () {
      if (App._prefetched === S.branchId) return;
      App._prefetched = S.branchId;
      var list = [];
      if (I.can('discharge_calls')) list.push(['callPool', {}]);
      if (I.can('view_dashboard') || I.can('active_feedback') || I.can('manage_lists')) list.push(['bedReady', {}]);
      if (I.can('raise_complaints') || I.can('close_complaints')) list.push(['complaintBoard', {}]);
      if (I.can('view_dashboard')) list.push(['dayReport', { day: new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10) }]);
      setTimeout(function () { I.prefetch(list); }, 2500);
    },

    /** The app (GitHub) and the server (Apps Script) must be the same version, or new screens fail. */
    checkVersions: function (server) {
      var app = window.ICC_CONFIG.APP_VERSION || '';
      var old = document.getElementById('verwarn');
      if (old) old.parentNode.removeChild(old);
      var mm = function (v) { return v.split('-')[0].split('.').slice(0, 2).join('.'); };
      if (!server || mm(server) === mm(app)) return;
      var main = document.getElementById('main');
      if (!main || !I.can('manage_users')) return;
      main.parentNode.insertBefore(h('div', { id: 'verwarn', class: 'msg warn', style: 'margin:12px 16px 0' },
        'The server (Apps Script) runs version ' + server.split('-')[0] + ' but the app is ' + app.split('-')[0] +
        '. Paste all new .gs files, then Deploy → Manage deployments → pencil → Version: New version → Deploy.'), main);
    },

    refreshIndex: function (force) {
      var bid = S.branchId;
      var have = S.index && !force ? S.index.version : '';
      return I.Api.call('searchIndex', { version: have }).then(function (ix) {
        if (bid !== S.branchId) return false;
        var res = I.applyIndex(ix);
        if (res === 'need-full') return App.refreshIndex(true);
        return res;
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
      if (el) el.textContent = on ? 'Updating…' : '';
    },

    renderShell: function () {
      document.body.classList.remove('authbg');
      var p = S.profile;
      var entry = p.branches[S.branchId];
      var multi = Object.keys(p.branches).length > 1;
      function branchControl() {
        if (!multi) return h('span', { class: 'branchname' }, I.icon('branches', 15), entry.name);
        var sel = h('select', { 'aria-label': 'Branch', onchange: function () {
          S.branchId = sel.value; I.Store.set('branchId', S.branchId); I.go('home'); App.startBranch();
        } });
        Object.keys(p.branches).forEach(function (id) {
          sel.appendChild(h('option', { value: id, selected: id === S.branchId ? 'selected' : null }, p.branches[id].name));
        });
        return h('label', { class: 'branchsel' }, I.icon('branches', 15), sel);
      }
      var items = NAV.filter(function (n) {
        if (n.superOnly) return p.user.is_super;
        if (!n.perm) return true;
        return [].concat(n.perm).some(I.can);
      });
      var nav = h('nav', { class: 'navlist', 'aria-label': 'Main' });
      items.forEach(function (n) {
        nav.appendChild(h('a', { href: '#/' + n.page, 'data-page': n.page }, I.icon(n.ico), h('span', null, n.label)));
      });
      var initials = String(p.user.display_name || p.user.username).split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
      var side = h('aside', { class: 'sidenav' },
        h('a', { class: 'side-brand', href: '#/home' }, h('span', { class: 'markwrap' }, h('img', { src: 'img/mark.png', alt: '', width: 28, height: 28 })),
          h('span', null, h('span', { class: 'wordmark' }, 'MAHS ICC'), h('span', { class: 'tagline' }, 'Internal Customer Care'))),
        h('div', { class: 'brandline' }),
        nav,
        h('div', { class: 'side-user' }, h('span', { class: 'avatar' }, initials),
          h('span', { class: 'who' }, h('b', null, p.user.display_name), h('span', null, entry.role)),
          h('button', { class: 'iconbtn', title: 'Log out', 'aria-label': 'Log out', onclick: App.logout }, I.icon('logout'))));
      var bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Main' });
      items.filter(function (n) { return ['home', 'patients', 'calls', 'general', 'upload'].indexOf(n.page) >= 0; }).forEach(function (n) {
        bottom.appendChild(h('a', { href: '#/' + n.page, 'data-page': n.page }, I.icon(n.ico, 20), h('span', null, n.short || n.label)));
      });
      var more = items.filter(function (n) { return ['dashboard', 'bedready', 'complaints', 'quality', 'settings', 'inventory', 'exports', 'mail', 'health', 'users', 'system', 'branches'].indexOf(n.page) >= 0; });
      if (more.length) bottom.appendChild(h('a', { href: '#/more', 'data-page': 'more' }, I.icon('more', 20), h('span', null, 'More')));
      var main = h('main', { class: 'main', id: 'main' });
      var top = h('header', { class: 'topbar' },
        h('a', { class: 'top-brand', href: '#/home' }, h('img', { src: 'img/mark.png', alt: '', width: 26, height: 26 }), h('span', { class: 'wordmark' }, 'MAHS ICC')),
        branchControl(),
        h('span', { id: 'refreshing', class: 'refreshing' }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'iconbtn top-logout', title: 'Log out', 'aria-label': 'Log out', onclick: App.logout }, I.icon('logout')));
      I.clear(root).appendChild(h('div', { class: 'shell' }, side,
        h('div', { class: 'mainwrap' }, h('div', { class: 'brandline top-line' }), top, main, App.footer()), bottom));
      App.render();
    },

    /** HOD private link from a complaint mail: its own page, no login. */
    hodLink: function () {
      var m = location.hash.match(/^#\/hod\/(.+)$/);
      if (!m) return false;
      document.body.classList.add('authbg');
      window.HodPage.render(root, m[1].split('/'));
      return true;
    },

    render: function () {
      if (App.hodLink()) return;
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
