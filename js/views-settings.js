/**
 * Settings (per branch): beds, report groups and units, payment mapping, lists,
 * departments, doctors (alias merge), organisations, HIS column mapping.
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var Views = window.Views = window.Views || {};

  var TABS = [
    ['beds', 'Beds', 'manage_lists'], ['groups', 'Report groups & units', 'manage_lists'], ['payment', 'Payment', 'manage_lists'],
    ['lists', 'Lists', 'manage_lists'], ['departments', 'Departments', 'manage_departments'], ['doctors', 'Doctors', 'manage_lists'],
    ['mapping', 'Column mapping', 'manage_lists']
  ];

  Views.settings = function (main, arg) {
    var tabs = TABS.filter(function (t) { return I.can(t[2]); });
    if (!tabs.length) { main.appendChild(h('div', { class: 'msg err' }, 'No permission.')); return; }
    var cur = tabs.some(function (t) { return t[0] === arg; }) ? arg : tabs[0][0];
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Settings'), h('div', { class: 'sub' }, 'Lists and rules for ' + S.boot.branch.name + '.'))));
    var bar = h('div', { class: 'tabs' });
    tabs.forEach(function (t) { bar.appendChild(h('a', { class: t[0] === cur ? 'on' : '', href: '#/settings/' + t[0] }, t[1])); });
    main.appendChild(bar);
    var box = h('div', null, h('span', { class: 'spin' }), ' Loading…');
    main.appendChild(box);
    I.Api.call('getSettings').then(function (d) {
      S.settingsFull = d.settings;
      I.clear(box);
      ({ beds: tabBeds, groups: tabGroups, payment: tabPayment, lists: tabLists, departments: tabDepartments, doctors: tabDoctors, mapping: tabMapping })[cur](box, d);
    }).catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
  };

  function save(key, value, btn) {
    if (btn) btn.disabled = true;
    return I.Api.call('saveSetting', { key: key, value: value }).then(function () {
      S.settingsFull[key] = value;
      if (S.boot.settings[key] !== undefined) { S.boot.settings[key] = value; I.Store.set('boot.' + S.branchId, S.boot); }
      I.toast('Saved');
    }).catch(function (e) { I.toast(I.errText(e), true); }).then(function () { if (btn) btn.disabled = false; });
  }

  /**
   * Small editable table for a list setting.
   * cols: [{key, label, type: 'text'|'check'|'select'|'csv'|'number', options}]
   */
  function listEditor(cols, rows, onSave, opts) {
    opts = opts || {};
    rows = JSON.parse(JSON.stringify(rows || []));
    var wrap = h('div');
    function render() {
      I.clear(wrap);
      var t = h('table', { class: 't' });
      t.appendChild(h('tr', null, cols.map(function (c) { return h('th', null, c.label); }), h('th')));
      rows.forEach(function (r, i) {
        var tr = h('tr');
        cols.forEach(function (c) {
          var el;
          var val = r[c.key];
          if (c.type === 'check') el = h('input', { type: 'checkbox', checked: !!val, onchange: function () { r[c.key] = el.checked; } });
          else if (c.type === 'select') {
            el = h('select', { onchange: function () { r[c.key] = el.value; } });
            c.options.forEach(function (o) { el.appendChild(h('option', { value: o, selected: o === val ? 'selected' : null }, o || '—')); });
          } else {
            var shown = c.type === 'csv' ? (val || []).join(', ') : (val === undefined ? '' : val);
            el = h('input', { type: c.type === 'number' ? 'number' : 'text', value: shown, oninput: function () {
              r[c.key] = c.type === 'csv' ? el.value.split(',').map(function (x) { return x.trim(); }).filter(String).map(function (x) { return c.numbers ? Number(x) : x; })
                : c.type === 'number' ? Number(el.value) : el.value;
            } });
          }
          tr.appendChild(h('td', null, el));
        });
        tr.appendChild(h('td', null, opts.noRemove ? null : h('button', { class: 'btn small', title: 'Remove', onclick: function () { rows.splice(i, 1); render(); } }, '✕')));
        t.appendChild(tr);
      });
      wrap.appendChild(h('div', { class: 'tablewrap' }, t));
      var saveBtn = h('button', { class: 'btn primary', onclick: function () { onSave(rows, saveBtn); } }, 'Save');
      wrap.appendChild(h('div', { class: 'row', style: 'margin-top:8px' },
        opts.noAdd ? null : h('button', { class: 'btn', onclick: function () { var n = {}; cols.forEach(function (c) { n[c.key] = c.type === 'check' ? false : c.type === 'csv' ? [] : ''; }); rows.push(n); render(); } }, 'Add row'),
        saveBtn));
    }
    render();
    return wrap;
  }

  /* ---------- Beds ---------- */
  function tabBeds(box, d) {
    var st = d.settings;
    var fileIn = h('input', { type: 'file', accept: '.xlsx,.xls,.csv' });
    var deact = h('input', { type: 'checkbox' });
    var msg = h('div');
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Import bed list'),
      h('p', { class: 'small muted' }, 'Excel with columns Ward Name, Room Name, Bed No. New beds are added and existing ones updated. Nothing is deleted.'),
      fileIn, h('label', { class: 'chk' }, deact, 'Deactivate beds that are not in the file'),
      h('div', null, h('button', { class: 'btn primary', onclick: function () {
        var f = fileIn.files[0];
        if (!f) return I.toast('Choose the bed list file first', true);
        var rd = new FileReader();
        rd.onload = function () {
          var beds;
          try { beds = window.HisParse.parseBeds(XLSX, new Uint8Array(rd.result)); } catch (e) { return I.toast(I.errText(e), true); }
          I.Api.call('importBeds', { beds: beds, deactivateMissing: deact.checked }).then(function (r) {
            I.clear(msg).appendChild(h('div', { class: 'msg ok' }, 'Added ' + r.added + ', updated ' + r.updated + ', deactivated ' + r.deactivated +
              (r.duplicates.length ? '. Duplicate bed numbers ignored: ' + r.duplicates.join(', ') : '') + '.'));
            S._lists = null;
            Views.settings(I.clear(document.getElementById('main')), 'beds');
          }).catch(function (e) { I.clear(msg).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
        };
        rd.readAsArrayBuffer(f);
      } }, 'Import')), msg));

    var closed = (st.closed_groups || []).slice();
    var closedBox = h('div');
    (st.report_groups || []).forEach(function (g) {
      var c = h('input', { type: 'checkbox', checked: closed.indexOf(g.name) >= 0, onchange: function () {
        if (c.checked) closed.push(g.name); else closed.splice(closed.indexOf(g.name), 1);
      } });
      closedBox.appendChild(h('label', { class: 'chk' }, c, g.name));
    });
    var saveClosed = h('button', { class: 'btn primary small', onclick: function () { save('closed_groups', closed, saveClosed); } }, 'Save closed floors');
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Closed floors'), h('p', { class: 'small muted' }, 'A closed floor shows "FLOOR CLOSED" in the Bed Ready list.'), closedBox, saveClosed));

    var listBox = h('div', null, h('span', { class: 'spin' }));
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Bed list'), listBox));
    I.Api.call('listBeds').then(function (beds) {
      I.clear(listBox);
      var notReady = (st.not_ready_beds || []).slice();
      var filter = h('select', { onchange: draw }, h('option', { value: '' }, 'All groups'));
      var groups = {};
      beds.forEach(function (b) { groups[b.report_group || '(excluded)'] = 1; });
      Object.keys(groups).forEach(function (g) { filter.appendChild(h('option', { value: g }, g)); });
      var saveNR = h('button', { class: 'btn primary small', onclick: function () { save('not_ready_beds', notReady, saveNR); } }, 'Save Not-Ready ticks');
      var tableBox = h('div');
      listBox.appendChild(h('div', { class: 'row' }, filter, h('span', { class: 'muted small' }, beds.length + ' beds'), saveNR));
      listBox.appendChild(tableBox);
      function draw() {
        I.clear(tableBox);
        var t = h('table', { class: 't' }, h('tr', null, ['Bed', 'Ward', 'Room', 'Floor', 'Group', 'Not ready', 'Note', 'Active'].map(function (x) { return h('th', null, x); })));
        beds.filter(function (b) { return !filter.value || (b.report_group || '(excluded)') === filter.value; }).forEach(function (b) {
          var nr = h('input', { type: 'checkbox', checked: notReady.indexOf(b.bed_no) >= 0, onchange: function () {
            if (nr.checked) notReady.push(b.bed_no); else notReady.splice(notReady.indexOf(b.bed_no), 1);
          } });
          var note = h('input', { type: 'text', value: b.note || '', style: 'min-width:110px', onchange: function () {
            I.Api.call('saveBed', { bed: { bed_no: b.bed_no, note: note.value } }).then(function () { I.toast('Note saved'); }).catch(function (e) { I.toast(I.errText(e), true); });
          } });
          var act = h('input', { type: 'checkbox', checked: b.active === 'Y', onchange: function () {
            I.Api.call('saveBed', { bed: { bed_no: b.bed_no, active: act.checked ? 'Y' : 'N' } }).then(function () { I.toast('Saved'); S._lists = null; }).catch(function (e) { I.toast(I.errText(e), true); });
          } });
          t.appendChild(h('tr', null, h('td', null, h('b', null, b.bed_no)), h('td', null, b.ward), h('td', null, b.room), h('td', null, b.floor === '' ? 'ER' : b.floor),
            h('td', null, b.report_group || h('span', { class: 'muted' }, 'excluded')), h('td', null, nr), h('td', null, note), h('td', null, act)));
        });
        tableBox.appendChild(h('div', { class: 'tablewrap' }, t));
      }
      draw();
    }).catch(function (e) { I.clear(listBox).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
  }

  /* ---------- Report groups & units ---------- */
  function tabGroups(box, d) {
    var st = d.settings;
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Report groups'),
      h('p', { class: 'small muted' }, 'Floors in no group (default 1, 3, 5) and Emergency beds are excluded from census and reports. Units here give the census unit breakdown.'),
      listEditor([{ key: 'name', label: 'Group name' }, { key: 'floors', label: 'Floors (comma)', type: 'csv', numbers: true }, { key: 'units', label: 'Units shown (comma)', type: 'csv' }],
        st.report_groups, function (rows, btn) { save('report_groups', rows.filter(function (r) { return r.name; }), btn); })));
    var units = (st.units || []).map(function (u) { return { name: u }; });
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Unit list (dropdown on the patient card)'),
      listEditor([{ key: 'name', label: 'Unit' }], units, function (rows, btn) {
        save('units', rows.map(function (r) { return String(r.name || '').trim(); }).filter(String), btn);
      })));
  }

  /* ---------- Payment ---------- */
  function tabPayment(box, d) {
    var st = d.settings, cats = [''].concat(d.paymentCategories);
    var rules = JSON.parse(JSON.stringify(st.payment_rules || {}));
    var gm = Object.keys(rules.group_map || {}).map(function (k) { return { group: k, cat: rules.group_map[k] }; });
    var cghs = h('input', { type: 'text', value: rules.cghs_keyword || '' });
    var soch = h('input', { type: 'text', value: rules.soch_unit || '' });
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Payment category from HIS Patient Group'),
      h('p', { class: 'small muted' }, 'HIS "Admn Payment Type" is never used (it labels PMJAY patients "Corporate"). Group names match ignoring case and spaces.'),
      h('label', { class: 'f' }, h('span', null, 'Corporate + organisation containing this word → Corporate CGHS'), cghs),
      h('label', { class: 'f' }, h('span', null, 'Patients with this unit count as SOCH'), soch),
      listEditor([{ key: 'group', label: 'HIS Patient Group' }, { key: 'cat', label: 'Payment category', type: 'select', options: cats }], gm, function (rows, btn) {
        var map = {};
        rows.forEach(function (r) { if (r.group) map[String(r.group).toLowerCase().replace(/[^a-z0-9]/g, '')] = r.cat; });
        save('payment_rules', { group_map: map, cghs_keyword: cghs.value.trim(), soch_unit: soch.value.trim() }, btn);
      })));
    var rum = st.room_upgrade_map || {};
    var rumRows = d.paymentCategories.map(function (c) { return { cat: c, four: rum[c] || '' }; });
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Room Upgradation form: 7 categories → 4'),
      listEditor([{ key: 'cat', label: 'Category' }, { key: 'four', label: 'Form value', type: 'select', options: ['CASH', 'TPA', 'CORPORATE', 'AB-PMJAY'] }], rumRows, function (rows, btn) {
        var m = {}; rows.forEach(function (r) { m[r.cat] = r.four; }); save('room_upgrade_map', m, btn);
      }, { noAdd: true, noRemove: true })));
    var orgBox = h('div', null, h('span', { class: 'spin' }));
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Organisations (learned from HIS)'),
      h('p', { class: 'small muted' }, 'Corporate organisations are learned automatically. Set a category only to override the rule for one organisation.'), orgBox));
    I.Api.call('listOrgs').then(function (orgs) {
      I.clear(orgBox);
      var t = h('table', { class: 't' }, h('tr', null, h('th', null, 'Organisation'), h('th', null, 'HIS group'), h('th', null, 'Override category')));
      orgs.sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (o) {
        var sel = h('select', { onchange: function () {
          I.Api.call('saveOrg', { org: { org_key: o.org_key, payment_cat: sel.value } }).then(function () { I.toast('Saved (applies from the next upload or edit)'); }).catch(function (e) { I.toast(I.errText(e), true); });
        } });
        cats.forEach(function (c) { sel.appendChild(h('option', { value: c, selected: c === o.payment_cat ? 'selected' : null }, c || '(use rule)')); });
        t.appendChild(h('tr', null, h('td', null, o.name), h('td', null, o.patient_group), h('td', null, sel)));
      });
      orgBox.appendChild(orgs.length ? h('div', { class: 'tablewrap' }, t) : h('div', { class: 'muted small' }, 'None yet. They appear after the first upload.'));
    }).catch(function (e) { I.clear(orgBox).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
  }

  /* ---------- Lists ---------- */
  function tabLists(box, d) {
    var st = d.settings;
    var sn = Object.keys(st.short_names || {}).map(function (k) { return { ward: k, short: st.short_names[k] }; });
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Short names for the Bed Ready list'),
      listEditor([{ key: 'ward', label: 'Ward (as in bed list)' }, { key: 'short', label: 'Short name' }], sn, function (rows, btn) {
        var m = {}; rows.forEach(function (r) { if (r.ward) m[r.ward] = r.short; }); save('short_names', m, btn);
      })));
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Discharge types'),
      h('p', { class: 'small muted' }, 'Taken from the HIS Discharge file and editable on the patient card. Ticks decide which types count in the DAMA/DOR report and get discharge calls.'),
      listEditor([{ key: 'name', label: 'Type' }, { key: 'in_dama_report', label: 'In DAMA/DOR report', type: 'check' }, { key: 'in_calls', label: 'Gets discharge call', type: 'check' }],
        st.discharge_types, function (rows, btn) { save('discharge_types', rows.filter(function (r) { return r.name; }), btn); })));
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'DAMA / DOR reasons'),
      listEditor([{ key: 'text', label: 'Reason' }, { key: 'avoidable', label: 'Avoidable', type: 'check' }], st.reasons_dama_dor,
        function (rows, btn) { save('reasons_dama_dor', rows.filter(function (r) { return r.text; }), btn); })));
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'LAMA reasons'),
      listEditor([{ key: 'text', label: 'Reason' }, { key: 'avoidable', label: 'Avoidable', type: 'check' }], st.reasons_lama,
        function (rows, btn) { save('reasons_lama', rows.filter(function (r) { return r.text; }), btn); })));
    var nps = h('input', { type: 'number', min: 0, max: 10, value: (st.nps_rule || {}).positive_min });
    var rd = h('input', { type: 'number', min: 0, value: st.readmission_days });
    var b1 = h('button', { class: 'btn primary', onclick: function () {
      save('nps_rule', { positive_min: Number(nps.value) }, b1).then(function () { return save('readmission_days', Number(rd.value)); });
    } }, 'Save');
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Rules'),
      h('label', { class: 'f' }, h('span', null, 'NPS at or above this is Positive (below is Negative)'), nps),
      h('label', { class: 'f' }, h('span', null, 'Re-admission = return within this many days'), rd), b1));
    // Phase 2 lists
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Discharge call outcomes'),
      h('p', { class: 'small muted' }, 'Reached = the patient or family answered. Try again = the call comes back next day (up to the number of tries below). NPS needed = the score must be entered.'),
      listEditor([{ key: 'text', label: 'Outcome' }, { key: 'reached', label: 'Reached', type: 'check' }, { key: 'retry', label: 'Try again', type: 'check' },
        { key: 'needs_nps', label: 'NPS needed', type: 'check' }], st.call_outcomes,
        function (rows, btn) { save('call_outcomes', rows.filter(function (r) { return r.text; }), btn); })));
    var poolDays = h('input', { type: 'number', min: 1, max: 60, value: st.call_pool_days });
    var tries = h('input', { type: 'number', min: 1, max: 10, value: st.call_max_tries });
    var pendDays = h('input', { type: 'number', min: 0, max: 30, value: st.dama_pending_days });
    var b3 = h('button', { class: 'btn primary', onclick: function () {
      save('call_pool_days', Number(poolDays.value), b3).then(function () { return save('call_max_tries', Number(tries.value)); })
        .then(function () { return save('dama_pending_days', Number(pendDays.value)); });
    } }, 'Save');
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Calls and pending rules'),
      h('label', { class: 'f' }, h('span', null, 'Patients discharged in the last this many days are in the call pool'), poolDays),
      h('label', { class: 'f' }, h('span', null, 'Not reachable: tries before the call is closed'), tries),
      h('label', { class: 'f' }, h('span', null, 'DAMA/DOR still in house after this many days goes to the Manager pending list'), pendDays), b3));

    var picks = st.pick_lists || {};
    var names = [['room_categories', 'Room categories (Room Upgradation)'], ['requested_by', 'Requested By'], ['approving_authority', 'Approving Authority'],
      ['billing_head', 'Billing Head'], ['sdpe', 'SDPE'], ['celebration_types', 'Wow Moment: types of celebration'],
      ['homecare_services', 'Homecare lead: types of service'], ['campaign_types', 'Campaign lead: types of campaign'],
      ['lead_receivers', 'Leads: given to whom'], ['lama_followups', 'LAMA: follow-up outcomes']];
    var c = h('div', { class: 'card' }, h('h2', null, 'Names for pick-or-type fields'),
      h('p', { class: 'small muted' }, 'A new name typed in a form is added to its list automatically. Correct or remove names here (one per line).'));
    var grid = h('div', { class: 'formgrid' });
    names.forEach(function (n) {
      var ta = h('textarea', { rows: 4 }, (picks[n[0]] || []).join('\n'));
      ta.setAttribute('data-k', n[0]);
      grid.appendChild(h('label', { class: 'f' }, h('span', null, n[1]), ta));
    });
    c.appendChild(grid);
    var b2 = h('button', { class: 'btn primary', onclick: function () {
      var v = JSON.parse(JSON.stringify(picks));
      c.querySelectorAll('textarea').forEach(function (ta) { v[ta.getAttribute('data-k')] = ta.value.split('\n').map(function (x) { return x.trim(); }).filter(String); });
      // The Phase 1 Room Upgradation lists now live here; empty them so removed names stay removed.
      save('pick_lists', v, b2).then(function () { return save('room_upgrade_lists', { requested_by: [], approving_authority: [], billing_head: [], sdpe: [] }); });
    } }, 'Save');
    c.appendChild(b2);
    box.appendChild(c);

    var inv = h('textarea', { rows: 8 }, (st.inventory_items || []).join('\n'));
    var b4 = h('button', { class: 'btn primary', onclick: function () {
      save('inventory_items', inv.value.split('\n').map(function (x) { return x.trim(); }).filter(String), b4);
    } }, 'Save');
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Inventory items'),
      h('p', { class: 'small muted' }, 'The rows of the monthly floor inventory, in order (one per line). Counts already saved for a removed item are kept.'),
      h('label', { class: 'f' }, h('span', null, 'Items'), inv), b4));
  }

  /* ---------- Departments ---------- */
  function tabDepartments(box) {
    var listBox = h('div', null, h('span', { class: 'spin' }));
    box.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, 'Departments'),
      h('button', { class: 'btn primary small', onclick: function () { editDept({ type: 'service', active: 'Y', issue_types: [] }); } }, 'Add department')),
      h('p', { class: 'small muted' }, 'Departments are never deleted, only deactivated. New clinical departments from HIS appear as "New, assign HOD".'), listBox));
    function load() {
      I.Api.call('listDepartments').then(function (deps) {
        I.clear(listBox);
        var t = h('table', { class: 't' }, h('tr', null, ['Department', 'Type', 'HOD', 'HOD email', 'CC', 'Active', ''].map(function (x) { return h('th', null, x); })));
        deps.sort(function (a, b) { return (a.status === 'NEW' ? 0 : 1) - (b.status === 'NEW' ? 0 : 1) || a.name.localeCompare(b.name); }).forEach(function (dp) {
          t.appendChild(h('tr', null, h('td', null, h('b', null, dp.name), dp.status === 'NEW' ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, 'New, assign HOD') : null),
            h('td', null, dp.type), h('td', null, dp.hod_name), h('td', { class: 'small' }, dp.hod_email), h('td', { class: 'small' }, dp.cc_emails),
            h('td', null, dp.active === 'Y' ? 'Yes' : 'No'), h('td', null, h('button', { class: 'btn small', onclick: function () { editDept(dp); } }, 'Edit'))));
        });
        listBox.appendChild(h('div', { class: 'tablewrap' }, t));
      }).catch(function (e) { I.clear(listBox).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    function editDept(dp) {
      var f = {};
      function inp(k, label, el) { f[k] = el; return h('label', { class: 'f' }, h('span', null, label), el); }
      var type = h('select', null, h('option', { value: 'service', selected: dp.type !== 'clinical' ? 'selected' : null }, 'Service'), h('option', { value: 'clinical', selected: dp.type === 'clinical' ? 'selected' : null }, 'Clinical'));
      var active = h('select', null, h('option', { value: 'Y', selected: dp.active !== 'N' ? 'selected' : null }, 'Active'), h('option', { value: 'N', selected: dp.active === 'N' ? 'selected' : null }, 'Inactive'));
      var body = h('div', null,
        inp('name', 'Department', h('input', { type: 'text', value: dp.name || '' })),
        h('div', { class: 'grid k2' }, inp('type', 'Type', type), inp('active', 'Status', active)),
        inp('hod_name', 'HOD name', h('input', { type: 'text', value: dp.hod_name || '' })),
        inp('hod_email', 'HOD email', h('input', { type: 'email', value: dp.hod_email || '' })),
        inp('cc_emails', 'CC emails (comma separated)', h('input', { type: 'text', value: dp.cc_emails || '' })),
        inp('keywords', 'Keywords for auto-suggest (comma separated)', h('input', { type: 'text', value: dp.keywords || '' })),
        inp('aliases', 'Other names used in sheets (comma separated)', h('input', { type: 'text', value: dp.aliases || '' })),
        inp('issue_types', 'Issue types (one per line)', h('textarea', { rows: 5 }, (dp.issue_types || []).join('\n'))));
      I.modal(dp.dept_id ? 'Edit department' : 'Add department', body, [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: function () {
        var rec = { dept_id: dp.dept_id };
        Object.keys(f).forEach(function (k) { rec[k] = f[k].value; });
        rec.issue_types = f.issue_types.value.split('\n').map(function (x) { return x.trim(); }).filter(String);
        return I.Api.call('saveDepartment', { department: rec }).then(function () { I.toast('Saved'); S._lists = null; load(); return true; })
          .catch(function (e) { I.toast(I.errText(e), true); return false; });
      } }]);
    }
    load();
  }

  /* ---------- Doctors ---------- */
  function tabDoctors(box) {
    var listBox = h('div', null, h('span', { class: 'spin' }));
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Doctor master'),
      h('p', { class: 'small muted' }, 'Learned from HIS. "Dr.X", "DrX" and "X" are already treated as one. Merge two spellings of the same doctor: future uploads use the kept name.'), listBox));
    function load() {
      I.Api.call('listDoctors').then(function (docs) {
        I.clear(listBox);
        var active = docs.filter(function (d) { return !d.merged_into; }).sort(function (a, b) { return a.display_name.localeCompare(b.display_name); });
        var from = h('select'), into = h('select');
        active.forEach(function (d) { from.appendChild(h('option', { value: d.doc_key }, d.display_name)); into.appendChild(h('option', { value: d.doc_key }, d.display_name)); });
        listBox.appendChild(h('div', { class: 'card', style: 'background:#fafbfc' }, h('b', null, 'Merge'),
          h('div', { class: 'grid k2' }, h('label', { class: 'f' }, h('span', null, 'This spelling…'), from), h('label', { class: 'f' }, h('span', null, '…is the same doctor as'), into)),
          h('button', { class: 'btn primary small', onclick: function () {
            if (from.value === into.value) return I.toast('Pick two different names', true);
            I.Api.call('mergeDoctors', { from_key: from.value, into_key: into.value }).then(function () { I.toast('Merged'); S._lists = null; load(); }).catch(function (e) { I.toast(I.errText(e), true); });
          } }, 'Merge')));
        var t = h('table', { class: 't' }, h('tr', null, h('th', null, 'Name shown'), h('th', null, 'Also known as'), h('th', null, 'First seen'), h('th')));
        active.forEach(function (d) {
          var nm = h('input', { type: 'text', value: d.display_name });
          t.appendChild(h('tr', null, h('td', null, nm), h('td', { class: 'small' }, String(d.aliases || '').split('|').filter(String).join(', ')),
            h('td', { class: 'small' }, I.fmtD(d.first_seen)),
            h('td', null, h('button', { class: 'btn small', onclick: function () {
              I.Api.call('saveDoctor', { doctor: { doc_key: d.doc_key, display_name: nm.value } }).then(function () { I.toast('Saved'); S._lists = null; }).catch(function (e) { I.toast(I.errText(e), true); });
            } }, 'Save'))));
        });
        listBox.appendChild(h('div', { class: 'tablewrap' }, t));
      }).catch(function (e) { I.clear(listBox).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    load();
  }

  /* ---------- Column mapping ---------- */
  function tabMapping(box, d) {
    var map = d.settings.his_mapping;
    var ta = h('textarea', { rows: 24, class: 'mono', spellcheck: 'false' }, JSON.stringify(map, null, 2));
    var msg = h('div');
    var btn = h('button', { class: 'btn primary', onclick: function () {
      var v;
      try { v = JSON.parse(ta.value); } catch (e) { I.clear(msg).appendChild(h('div', { class: 'msg err' }, 'Not valid JSON: ' + e.message)); return; }
      I.clear(msg);
      save('his_mapping', v, btn);
    } }, 'Save mapping');
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'HIS column mapping'),
      h('p', { class: 'small muted' }, 'For each file: "signature" = headings that identify the file; "fields" = app field → accepted heading texts (first found wins; case, spaces and dots are ignored); "required" = fields without which the file is refused. Change only if HIS renames a column.'),
      ta, msg, h('div', { class: 'row', style: 'margin-top:8px' }, btn)));
  }
})();
