/**
 * Admin screens: users and permission ticks, branches, system (benchmark, audit log).
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var Views = window.Views = window.Views || {};

  /* ================= USERS ================= */
  Views.users = function (main) {
    if (!I.can('manage_users')) { main.appendChild(h('div', { class: 'msg err' }, 'No permission.')); return; }
    var box = h('div', null, h('span', { class: 'spin' }));
    main.appendChild(h('div', { class: 'row between' }, h('h1', null, 'Users · ' + S.boot.branch.name),
      h('button', { class: 'btn primary', onclick: function () { editUser(null); } }, '+ Add user')));
    main.appendChild(box);
    var meta = null;
    function load() {
      I.Api.call('listUsers').then(function (d) {
        meta = d;
        I.clear(box);
        var t = h('table', { class: 't' }, h('tr', null, ['Name', 'Username', 'Role here', 'Status', 'Last login', ''].map(function (x) { return h('th', null, x); })));
        d.users.forEach(function (u) {
          var status = [];
          if (u.active !== 'Y') status.push(h('span', { class: 'badge grey' }, 'Disabled'));
          if (u.locked) status.push(h('span', { class: 'badge bad' }, 'Locked'));
          if (u.must_change) status.push(h('span', { class: 'badge warn' }, 'Must change password'));
          if (!u.in_branch) status.push(h('span', { class: 'badge grey' }, 'No access to this branch'));
          if (!status.length) status.push(h('span', { class: 'badge ok' }, 'Active'));
          t.appendChild(h('tr', null, h('td', null, h('b', null, u.display_name)), h('td', null, u.username), h('td', null, u.is_super ? 'Admin (all branches)' : u.role || '—'),
            h('td', null, status), h('td', { class: 'small' }, u.last_login),
            h('td', null, h('div', { class: 'row' },
              h('button', { class: 'btn small', onclick: function () { editUser(u); } }, 'Edit'),
              h('button', { class: 'btn small', onclick: function () { resetPw(u); } }, 'Reset password'),
              u.locked ? h('button', { class: 'btn small', onclick: function () {
                I.Api.call('unlockUser', { user_id: u.user_id }).then(function () { I.toast('Unlocked'); load(); }).catch(function (e) { I.toast(I.errText(e), true); });
              } }, 'Unlock') : null))));
        });
        box.appendChild(h('div', { class: 'card tablewrap' }, t));
      }).catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    function editUser(u) {
      if (!meta) return;
      var isNew = !u;
      u = u || { role: 'Floor Manager', perms: meta.roleDefaults['Floor Manager'], active: 'Y', in_branch: true };
      var username = h('input', { type: 'text', value: u.username || '', autocapitalize: 'none', disabled: !isNew });
      var name = h('input', { type: 'text', value: u.display_name || '' });
      var temp = h('input', { type: 'text', placeholder: '8+ characters, letters and numbers' });
      var role = h('select', { onchange: function () { setTicks(meta.roleDefaults[role.value]); } });
      meta.roles.forEach(function (r) { role.appendChild(h('option', { value: r, selected: r === u.role ? 'selected' : null }, r)); });
      var active = h('input', { type: 'checkbox', checked: u.active === 'Y' });
      var inBranch = h('input', { type: 'checkbox', checked: u.in_branch !== false });
      var ticks = {};
      var tickBox = h('div');
      meta.permissions.forEach(function (p) {
        ticks[p[0]] = h('input', { type: 'checkbox', checked: (u.perms || []).indexOf(p[0]) >= 0 });
        tickBox.appendChild(h('label', { class: 'chk', style: 'min-width:200px' }, ticks[p[0]], p[1]));
      });
      function setTicks(list) { Object.keys(ticks).forEach(function (k) { ticks[k].checked = list.indexOf(k) >= 0; }); }
      var body = h('div', null,
        h('div', { class: 'grid k2' }, h('label', { class: 'f' }, h('span', null, 'Username'), username), h('label', { class: 'f' }, h('span', null, 'Display name'), name)),
        isNew ? h('label', { class: 'f' }, h('span', null, 'Temporary password (user must change it at first login)'), temp) : null,
        u.is_super ? h('p', { class: 'msg info' }, 'The main admin always has every permission in every branch.') : h('div', null,
          h('label', { class: 'f' }, h('span', null, 'Role in ' + S.boot.branch.name + ' (sets default ticks)'), role),
          h('h3', null, 'Permissions'), tickBox,
          h('label', { class: 'chk' }, inBranch, 'Has access to this branch')),
        isNew ? null : h('label', { class: 'chk' }, active, 'Account active'));
      I.modal(isNew ? 'Add user' : 'Edit user', body, [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: function () {
        var rec = { user_id: u.user_id, username: username.value, display_name: name.value };
        if (isNew) rec.tempPassword = temp.value; else rec.active = active.checked ? 'Y' : 'N';
        if (!u.is_super) {
          rec.role = role.value;
          rec.perms = Object.keys(ticks).filter(function (k) { return ticks[k].checked; });
          rec.in_branch = inBranch.checked;
        }
        return I.Api.call('saveUser', { user: rec }).then(function () { I.toast('Saved'); load(); return true; })
          .catch(function (e) { I.toast(I.errText(e), true); return false; });
      } }]);
    }
    function resetPw(u) {
      var temp = h('input', { type: 'text', placeholder: '8+ characters, letters and numbers' });
      I.modal('Reset password · ' + u.display_name, h('div', null,
        h('p', { class: 'small' }, 'The user is logged out everywhere and must choose a new password at the next login.'),
        h('label', { class: 'f' }, h('span', null, 'Temporary password'), temp)), [{ label: 'Cancel' }, { label: 'Reset', primary: true, onClick: function () {
          return I.Api.call('resetPassword', { user_id: u.user_id, tempPassword: temp.value }).then(function () { I.toast('Password reset'); load(); return true; })
            .catch(function (e) { I.toast(I.errText(e), true); return false; });
        } }]);
    }
    load();
  };

  /* ================= BRANCHES ================= */
  Views.branches = function (main) {
    if (!S.profile.user.is_super) { main.appendChild(h('div', { class: 'msg err' }, 'Only the main admin manages branches.')); return; }
    var box = h('div', null, h('span', { class: 'spin' }));
    main.appendChild(h('div', { class: 'row between' }, h('h1', null, 'Branches'), h('button', { class: 'btn primary', onclick: function () { edit({}); } }, '+ Add branch')));
    main.appendChild(box);
    function load() {
      I.Api.call('listBranches', {}, { branch: false }).then(function (list) {
        I.clear(box);
        var t = h('table', { class: 't' }, h('tr', null, ['Branch', 'HIS Location Name', 'Active', 'Data sheet', ''].map(function (x) { return h('th', null, x); })));
        list.forEach(function (b) {
          t.appendChild(h('tr', null, h('td', null, h('b', null, b.name)), h('td', null, b.location_match), h('td', null, b.active === 'Y' ? 'Yes' : 'No'),
            h('td', null, b.data_url ? h('a', { href: b.data_url, target: '_blank', rel: 'noopener' }, 'Open') : ''),
            h('td', null, h('button', { class: 'btn small', onclick: function () { edit(b); } }, 'Edit'))));
        });
        box.appendChild(h('div', { class: 'card tablewrap' }, t));
      }).catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    function edit(b) {
      var name = h('input', { type: 'text', value: b.name || '' });
      var loc = h('input', { type: 'text', value: b.location_match || '' });
      var act = h('input', { type: 'checkbox', checked: b.active !== 'N' });
      I.modal(b.branch_id ? 'Edit branch' : 'Add branch', h('div', null,
        h('label', { class: 'f' }, h('span', null, 'Branch name'), name),
        h('label', { class: 'f' }, h('span', null, 'HIS "Location Name" for this branch (used to detect wrong-branch files)'), loc),
        b.branch_id ? h('label', { class: 'chk' }, act, 'Active') : h('p', { class: 'small muted' }, 'A new data spreadsheet is created from the template with default settings. Import its bed list in Settings.')),
        [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: function () {
          return I.Api.call('saveBranch', { branch: { branch_id: b.branch_id, name: name.value, location_match: loc.value, active: act.checked ? 'Y' : 'N' } }, { branch: false })
            .then(function () { return I.Api.call('me', {}, { branch: false }); })
            .then(function (p) { S.profile = p; I.Store.set('profile', p); I.toast('Saved'); window.App.renderShell(); return true; })
            .catch(function (e) { I.toast(I.errText(e), true); return false; });
        } }]);
    }
    load();
  };

  /* ================= SYSTEM: benchmark + audit ================= */
  Views.system = function (main) {
    if (!I.can('manage_users')) { main.appendChild(h('div', { class: 'msg err' }, 'No permission.')); return; }
    main.appendChild(h('h1', null, 'System'));
    main.appendChild(h('div', { class: 'card' }, h('h2', null, 'About'),
      h('div', { class: 'small' }, 'App ' + window.ICC_CONFIG.APP_VERSION + ' · server ' + S.boot.appVersion),
      h('div', { class: 'small muted mono', style: 'word-break:break-all' }, window.ICC_CONFIG.API_URL)));
    benchCard(main);
    var audit = h('div');
    main.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, 'Audit log (latest 300)'),
      h('button', { class: 'btn small', onclick: function () {
        I.clear(audit).appendChild(h('span', { class: 'spin' }));
        I.Api.call('listAudit').then(function (rows) {
          I.clear(audit);
          var t = h('table', { class: 't' }, h('tr', null, ['When', 'User', 'Action', 'Target', 'Detail'].map(function (x) { return h('th', null, x); })));
          rows.forEach(function (r) { t.appendChild(h('tr', null, h('td', { class: 'small' }, r.ts), h('td', null, r.user), h('td', null, r.action), h('td', null, r.target), h('td', { class: 'small' }, r.detail))); });
          audit.appendChild(h('div', { class: 'tablewrap' }, t));
        }).catch(function (e) { I.clear(audit).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
      } }, 'Load')), audit));
  };

  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; }

  function benchCard(main) {
    var isBench = S.boot.branch.name === 'BENCH TEST';
    var pw = h('input', { type: 'password', placeholder: 'Your password (only to time the login step; optional)' });
    var out = h('div');
    var btn = h('button', { class: 'btn primary', disabled: !isBench, onclick: run }, 'Run benchmark');
    main.appendChild(h('div', { class: 'card' }, h('h2', null, 'Speed benchmark'),
      isBench ? h('p', { class: 'small' }, 'Runs every timed action several times against this branch and shows the time from tap to answer on this device. Takes about 2 minutes.')
        : h('div', { class: 'msg info' }, 'Switch the branch to "BENCH TEST" first (create it by running benchGenerate() in the Apps Script editor). The benchmark edits and uploads data, so it never runs on a real branch.'),
      h('label', { class: 'f' }, h('span', null, 'Password for the login timing'), pw), btn, out));

    function run() {
      btn.disabled = true;
      I.clear(out);
      var results = [];
      var table = h('table', { class: 't' }, h('tr', null, ['Action', 'Runs', 'Median (s)', 'Slowest (s)', 'Server median (s)', 'Reply size'].map(function (x) { return h('th', null, x); })));
      var status = h('div', { class: 'small muted' });
      out.appendChild(status);
      out.appendChild(h('div', { class: 'tablewrap' }, table));
      var ix = null, sizes = null;

      function timed(label, n, fn, pre) {
        var times = [], server = [], bytes = 0;
        var p = Promise.resolve();
        for (var i = 0; i < n; i++) {
          p = p.then(function () { return pre ? pre() : null; }).then(function () {
            status.textContent = 'Running: ' + label + '…';
            var t0 = performance.now();
            return fn().then(function (extra) {
              times.push(performance.now() - t0);
              if (extra && extra.serverMs !== undefined) server.push(extra.serverMs);
              else if (I.Api.last) server.push(I.Api.last.serverMs);
              bytes = extra && extra.bytes !== undefined ? extra.bytes : (I.Api.last ? I.Api.last.bytes : 0);
            });
          });
        }
        return p.then(function () {
          var r = { label: label, n: n, med: median(times) / 1000, max: Math.max.apply(null, times) / 1000,
            srv: server.length ? median(server) / 1000 : null, kb: bytes ? Math.round(bytes / 102.4) / 10 : null };
          results.push(r);
          table.appendChild(h('tr', null, h('td', null, label), h('td', null, n), h('td', null, h('b', { style: r.med > 2 ? 'color:var(--bad)' : '' }, r.med.toFixed(2))),
            h('td', null, r.max.toFixed(2)), h('td', null, r.srv === null ? '—' : r.srv.toFixed(2)), h('td', null, r.kb === null ? '' : r.kb + ' KB')));
        });
      }
      function api(a, b, o) { return function () { return I.Api.call(a, b, o); }; }
      var admns = I.indexObjects().filter(function (o) { return o.status === 'IN'; }).map(function (o) { return o.admn_no; });
      var k = 0;
      var unitFlip = 0;

      Promise.resolve()
        .then(function () { return I.Api.call('benchStep', { step: 'sizes' }).then(function (s) { sizes = s; }); })
        .then(function () { return timed('Network round trip (ping)', 3, api('ping', {}, { branch: false })); })
        .then(function () {
          if (!pw.value) return;
          return timed('Login (password check + new session)', 3, function () {
            return I.Api.call('login', { username: S.profile.user.username, password: pw.value, token: 'none' }, { branch: false });
          });
        })
        .then(function () { return timed('Open app (bootstrap)', 3, api('bootstrap')); })
        .then(function () {
          return timed('Patient list download, cold cache', 3, function () {
            return I.Api.call('searchIndex', { version: '' }).then(function (d) { ix = d; });
          }, function () { return I.Api.call('benchStep', { step: 'clearCache' }); });
        })
        .then(function () { return timed('Patient list download, warm cache', 3, api('searchIndex', { version: '' })); })
        .then(function () { return timed('Patient list check, unchanged', 3, function () { return I.Api.call('searchIndex', { version: ix.version }); }); })
        .then(function () {
          var saved = S.index; S.index = ix;
          var t0 = performance.now();
          for (var i = 0; i < 20; i++) I.searchIndex(['patel', '60', 'sip2', 'ram'][i % 4]);
          var ms = (performance.now() - t0) / 20;
          S.index = saved;
          results.push({ label: 'Search on device (per query)', n: 20, med: ms / 1000, max: ms / 1000, srv: null, kb: null });
          table.appendChild(h('tr', null, h('td', null, 'Search on device (per query, ' + ix.rows.length + ' patients)'), h('td', null, 20),
            h('td', null, h('b', null, (ms / 1000).toFixed(3))), h('td', null, ''), h('td', null, '—'), h('td', null, '')));
        })
        .then(function () { return timed('Patient card', 5, function () { return I.Api.call('getPatient', { admn_no: admns[k++ % admns.length] }); }); })
        .then(function () {
          return timed('Save an edit (unit)', 3, function () {
            return I.Api.call('editPatient', { admn_no: admns[0], changes: { unit: (unitFlip++ % 2) ? 'Medical' : 'Chemo' }, note: 'benchmark' });
          });
        })
        .then(function () {
          return timed('Upload all 4 HIS files', 2, function () {
            var total = 0, bytes = 0;
            return I.Api.call('benchStep', { step: 'makeFiles' }).then(function (files) {
              var seq = Promise.resolve();
              ['admission', 'bed_occupancy', 'transfer', 'discharge'].forEach(function (ft) {
                seq = seq.then(function () {
                  return I.Api.call('uploadHis', { fileType: ft, fileName: 'bench.xlsx', fields: files[ft].fields, rows: files[ft].rows, meta: {}, confirm: { date: true, branch: true } })
                    .then(function () { total += I.Api.last.serverMs; bytes += I.Api.last.bytes; });
                });
              });
              return seq.then(function () { return { serverMs: total, bytes: bytes }; });
            });
          });
        })
        .then(function () { return timed('Daily summary (census, admissions)', 3, api('homeSummary')); })
        .then(function () { return timed('Older records search (3 years History)', 3, api('searchHistory', { q: 'PATEL' })); })
        .then(function () {
          status.textContent = 'Done.';
          var txt = 'ICC benchmark ' + I.fmtDT(Date.now()) + '\nDevice: ' + navigator.userAgent + '\nData: ' + JSON.stringify(sizes) + '\n' +
            results.map(function (r) { return r.label + ' | runs ' + r.n + ' | median ' + r.med.toFixed(2) + 's | slowest ' + r.max.toFixed(2) + 's | server ' + (r.srv === null ? '-' : r.srv.toFixed(2) + 's') + (r.kb ? ' | ' + r.kb + ' KB' : ''); }).join('\n');
          var ta = h('textarea', { rows: 8, class: 'mono' }, txt);
          out.appendChild(h('div', { class: 'small', style: 'margin-top:8px' }, 'Data size: ' + sizes.Patients + ' hot patients, ' + sizes.historyPatients + ' history patients (' + sizes.historyYears.join(', ') + '), ' + sizes.Sessions + ' sessions.'));
          out.appendChild(h('h3', null, 'Copy these results back into the chat'));
          out.appendChild(ta);
          out.appendChild(h('button', { class: 'btn small', onclick: function () { ta.select(); document.execCommand('copy'); I.toast('Copied'); } }, 'Copy'));
          btn.disabled = false;
          window.App.dataChanged();
        })
        .catch(function (e) { status.textContent = ''; out.appendChild(h('div', { class: 'msg err' }, 'Benchmark stopped: ' + I.errText(e))); btn.disabled = false; });
    }
  }
})();
