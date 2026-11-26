/**
 * Main screens: Home (today at a glance), Patients (search + quick lists),
 * Patient card (locked + editable fields, edit trail), Upload (4 HIS boxes), Data quality, More.
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var Views = window.Views = window.Views || {};
  function p2(n) { n = Number(n) || 0; return (n < 10 ? '0' : '') + n; }

  /* ================= HOME ================= */
  Views.home = function (main) {
    var objs = I.indexObjects();
    var start = I.dayStart();
    var inHouse = objs.filter(function (o) { return o.status === 'IN'; });
    var k = {
      inhouse: inHouse.length,
      admitted: objs.filter(function (o) { return o.admn_dt >= start; }).length,
      transferred: objs.filter(function (o) { return o.last_transfer_dt >= start; }).length,
      discharged: objs.filter(function (o) { return o.status === 'DISCHARGED' && o.dis_dt >= start; }).length,
      notin: inHouse.filter(function (o) { return o.in_latest === 'N'; }).length
    };
    main.appendChild(h('div', { class: 'row between' }, h('h1', null, 'Today at a glance'),
      h('span', { class: 'muted small' }, I.fmtD(Date.now()) + (S.index ? ' · list from ' + I.fmtDT(S.index.builtAt) : ''))));
    function kpi(n, label, list) {
      return h('div', { class: 'kpi', onclick: function () { I.go('patients/' + list); } }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, label));
    }
    main.appendChild(h('div', { class: 'grid k4' }, kpi(k.inhouse, 'In-house', 'inhouse'), kpi(k.admitted, 'Admitted today', 'admitted'),
      kpi(k.transferred, 'Transferred today', 'transferred'), kpi(k.discharged, 'Discharged today', 'discharged')));
    if (k.notin) {
      main.appendChild(h('div', { class: 'msg warn', style: 'cursor:pointer', onclick: function () { I.go('patients/notin'); } },
        k.notin + ' in-house patient(s) are not in the latest bed list (no discharge received yet).'));
    }

    // Upload slots
    var up = (S.boot.uploads && S.boot.uploads.boxes) || {};
    var upCard = h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, 'HIS uploads today'),
      I.can('upload') ? h('a', { href: '#/upload' }, 'Upload files') : null));
    var g = h('div', { class: 'grid k4' });
    Object.keys(up).forEach(function (ft) {
      var b = up[ft];
      g.appendChild(h('div', { class: 'box' }, h('h4', null, b.label),
        ['Morning', 'Evening'].map(function (slot) {
          var s = b[slot];
          return h('div', { class: 'slot' + (s ? '' : ' missing') }, slot + ': ', s ? (s.at.slice(11) + ' · ' + s.by + ' · ' + s.rows + ' rows') : 'not uploaded');
        })));
    });
    upCard.appendChild(g);
    main.appendChild(upCard);

    // Census by report group (Stay = in-house now) with unit split
    var groups = S.boot.settings.report_groups || [];
    var census = h('div', { class: 'card' }, h('h2', null, 'Floor census (Stay = in-house now)'));
    var t = h('table', { class: 't' }, h('tr', null, h('th', null, 'Group'), h('th', null, 'Stay'), h('th', null, 'Admitted today'), h('th', null, 'Discharged today')));
    groups.forEach(function (gr) {
      var mine = objs.filter(function (o) { return o.group === gr.name; });
      var stay = mine.filter(function (o) { return o.status === 'IN'; });
      var unitTxt = '';
      if (gr.units && gr.units.length) {
        var parts = gr.units.map(function (u) { return u + ': ' + p2(stay.filter(function (o) { return o.unit === u; }).length); });
        var unassigned = stay.filter(function (o) { return !o.unit || gr.units.indexOf(o.unit) < 0; }).length;
        if (unassigned) parts.push('Unassigned: ' + p2(unassigned));
        unitTxt = '(' + parts.join(' || ') + ')';
      }
      t.appendChild(h('tr', null, h('td', null, h('b', null, gr.name), unitTxt ? h('div', { class: 'small muted' }, unitTxt) : null), h('td', null, h('b', null, p2(stay.length))),
        h('td', null, p2(mine.filter(function (o) { return o.admn_dt >= start; }).length)),
        h('td', null, p2(mine.filter(function (o) { return o.status === 'DISCHARGED' && o.dis_dt >= start; }).length))));
    });
    census.appendChild(h('div', { class: 'tablewrap' }, t));
    main.appendChild(census);

    // Admissions today by payment category
    var cats = S.boot.paymentCategories.concat(['Unassigned']);
    var adm = objs.filter(function (o) { return o.admn_dt >= start; });
    var at = h('table', { class: 't' });
    cats.forEach(function (c) {
      var n = adm.filter(function (o) { return (o.payment_cat || 'Unassigned') === c; }).length;
      if (c === 'Unassigned' && !n) return;
      at.appendChild(h('tr', null, h('td', null, c), h('td', { class: 'right' }, h('b', null, p2(n)))));
    });
    at.appendChild(h('tr', null, h('td', null, h('b', null, 'Admission Details (total)')), h('td', { class: 'right' }, h('b', null, p2(adm.length)))));
    main.appendChild(h('div', { class: 'card' }, h('h2', null, 'Admissions today by payment category'), at));
    main.appendChild(h('p', { class: 'small muted' }, h('a', { href: '#/quality' }, 'Data-quality list'), ' · ',
      h('a', { href: '#', onclick: function (e) { e.preventDefault(); window.App.showChangePassword(false); } }, 'Change my password')));
  };

  /* ================= PATIENTS ================= */
  var QUICK = [
    ['inhouse', 'In-house'], ['admitted', 'Admitted today'], ['transferred', 'Transferred today'],
    ['discharged', 'Discharged today'], ['notin', 'Not in latest bed list'], ['repeat', 'Repeat admissions']
  ];

  Views.patients = function (main, arg) {
    var q = sessionStorage.getItem('icc.q') || '';
    var quick = arg || (q ? '' : 'inhouse');
    var pageSize = 50, shown = pageSize, deptFilter = '';
    var input = h('input', { type: 'search', placeholder: 'Search bed, name, IP no, UMR no, mobile', value: q, 'aria-label': 'Search patients' });
    var chips = h('div', { class: 'chips' });
    var listBox = h('div');
    var olderBox = h('div');
    main.appendChild(h('h1', null, 'Patients'));
    main.appendChild(h('div', { class: 'card' }, input, chips, listBox, olderBox));
    function renderChips() {
      I.clear(chips);
      QUICK.forEach(function (c) {
        chips.appendChild(h('button', { class: 'chip' + (quick === c[0] && !input.value ? ' on' : ''), onclick: function () {
          input.value = ''; sessionStorage.removeItem('icc.q'); quick = c[0]; shown = pageSize; render();
        } }, c[1]));
      });
    }
    function quickList() {
      var start = I.dayStart();
      var all = I.indexObjects();
      var f = {
        inhouse: function (o) { return o.status === 'IN'; },
        admitted: function (o) { return o.admn_dt >= start; },
        transferred: function (o) { return o.last_transfer_dt >= start; },
        discharged: function (o) { return o.status === 'DISCHARGED' && o.dis_dt >= start; },
        notin: function (o) { return o.status === 'IN' && o.in_latest === 'N'; },
        repeat: function (o) { return o.flags.indexOf('R') >= 0 && (!deptFilter || o.department === deptFilter); }
      }[quick] || function () { return false; };
      return all.filter(f).sort(function (a, b) { return String(a.bed).localeCompare(String(b.bed), undefined, { numeric: true }); });
    }
    function render() {
      renderChips();
      I.clear(listBox); I.clear(olderBox);
      var qv = input.value.trim();
      var list = qv ? I.searchIndex(qv) : quickList();
      if (!qv && quick === 'repeat') {
        var depts = {};
        I.indexObjects().forEach(function (o) { if (o.flags.indexOf('R') >= 0 && o.department) depts[o.department] = 1; });
        var sel = h('select', { onchange: function () { deptFilter = sel.value; shown = pageSize; render(); } }, h('option', { value: '' }, 'All departments'));
        Object.keys(depts).sort().forEach(function (d) { sel.appendChild(h('option', { value: d, selected: d === deptFilter ? 'selected' : null }, d)); });
        listBox.appendChild(h('div', { style: 'margin-bottom:8px' }, sel));
      }
      listBox.appendChild(h('div', { class: 'muted small' }, list.length + ' patient(s)'));
      var ul = h('ul', { class: 'list' });
      list.slice(0, shown).forEach(function (o) { ul.appendChild(patientRow(o)); });
      listBox.appendChild(ul);
      if (list.length > shown) listBox.appendChild(h('button', { class: 'btn small', onclick: function () { shown += pageSize; render(); } }, 'Show more'));
      if (qv.length >= 3) {
        olderBox.appendChild(h('button', { class: 'btn small', style: 'margin-top:10px', onclick: function () { searchOlder(qv); } }, 'Include older records (History)'));
      }
    }
    function searchOlder(qv) {
      I.clear(olderBox).appendChild(h('div', { class: 'muted small' }, h('span', { class: 'spin' }), ' Searching older records…'));
      I.Api.call('searchHistory', { q: qv }).then(function (d) {
        I.clear(olderBox);
        olderBox.appendChild(h('h3', null, 'Older records (' + d.results.length + ')' + (d.yearsSearched.length ? ' · ' + d.yearsSearched.join(', ') : ' · no history yet')));
        var ul = h('ul', { class: 'list' });
        d.results.forEach(function (o) { ul.appendChild(patientRow({ admn_no: o.admn_no, umr_no: o.umr_no, name: o.name, bed: o.bed,
          status: o.status, admn_dt: o.admn_dt, dis_dt: o.dis_dt, flags: '', payment_cat: '', unit: '', group: o.year })); });
        olderBox.appendChild(ul);
      }).catch(function (e) { I.clear(olderBox).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { sessionStorage.setItem('icc.q', input.value); shown = pageSize; render(); }, 120);
    });
    render();
    if (!arg) input.focus();
  };

  function patientRow(o) {
    var badges = [];
    if (o.status !== 'IN') badges.push(h('span', { class: 'badge grey' }, 'Discharged ' + I.fmtD(o.dis_dt)));
    if (o.flags && o.flags.indexOf('V') >= 0) badges.push(h('span', { class: 'badge warn' }, 'VIP'));
    if (o.flags && o.flags.indexOf('R') >= 0) badges.push(h('span', { class: 'badge' }, 'Repeat'));
    if (o.status === 'IN' && o.in_latest === 'N') badges.push(h('span', { class: 'badge bad' }, 'Not in latest bed list'));
    if (o.payment_cat) badges.push(h('span', { class: 'badge grey' }, o.payment_cat));
    if (o.unit) badges.push(h('span', { class: 'badge ok' }, o.unit));
    return h('li', { onclick: function () { I.go('patient/' + encodeURIComponent(o.admn_no)); } },
      h('div', { class: 'pt-row' }, h('span', { class: 'bed' }, o.bed || '—'),
        h('div', null, h('div', { class: 'nm' }, o.name), h('div', { class: 'small muted' }, o.admn_no + ' · ' + o.umr_no + (o.group ? ' · ' + o.group : '') + ' · adm ' + I.fmtD(o.admn_dt)),
          h('div', null, badges))));
  }

  /* ================= PATIENT CARD ================= */
  var FIELD_ORDER = ['bed', 'ward', 'room', 'consultant', 'ref_doctor', 'department', 'payment_cat', 'unit', 'organisation',
    'patient_group', 'ward_category', 'discharge_type', 'vip', 'gender', 'age'];

  Views.patient = function (main, admn, noFetch) {
    var box = h('div');
    main.appendChild(h('div', { class: 'row' }, h('a', { href: '#/patients' }, '← Patients')));
    main.appendChild(box);
    var cached = S.patients[admn];
    if (cached) renderCard(box, cached);
    else {
      var o = I.indexObjects().filter(function (x) { return x.admn_no === admn; })[0];
      box.appendChild(h('div', { class: 'card' }, h('h1', null, o ? o.name : admn), h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading…')));
    }
    if (noFetch && cached) return;
    I.Api.call('getPatient', { admn_no: admn }).then(function (p) {
      S.patients[admn] = p;
      if (I.route().arg === admn) renderCard(I.clear(box), p);
    }).catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
  };

  function renderCard(box, p) {
    I.clear(box);
    var lb = S.boot.labels;
    var b = p.badges;
    var head = h('div', { class: 'card' },
      h('h1', { style: 'margin-bottom:4px' }, p.name),
      h('div', { class: 'muted small' }, 'IP ' + p.admn_no + ' · UMR ' + p.umr_no + (p.report_group ? ' · ' + p.report_group : '')),
      h('div', { style: 'margin-top:8px' },
        h('span', { class: 'badge ' + (p.status === 'IN' ? 'ok' : 'grey') }, p.status === 'IN' ? 'In-house' : 'Discharged ' + p.dis_dt_f),
        b.vip ? h('span', { class: 'badge warn' }, 'VIP') : null,
        b.readmission ? h('span', { class: 'badge bad' }, 'Re-admission (' + b.readmissionDays + ' days)') : (b.repeat ? h('span', { class: 'badge' }, 'Repeat admission') : null),
        h('span', { class: 'badge grey' }, b.payment_cat || 'Payment: unassigned'),
        h('span', { class: 'badge ' + (b.unit === 'Unassigned' ? 'warn' : 'ok') }, 'Unit: ' + b.unit),
        b.er ? h('span', { class: 'badge' }, 'Via ER') : null,
        p.source === 'MANUAL' ? h('span', { class: 'badge warn' }, 'Not from HIS') : null,
        p.status === 'IN' && p.in_latest === 'N' ? h('span', { class: 'badge bad' }, 'Not in latest bed list since ' + p.not_in_list_since) : null,
        p.fromHistory ? h('span', { class: 'badge grey' }, 'History ' + p.fromHistory) : null));
    box.appendChild(head);

    var locked = h('div', { class: 'card' }, h('h2', null, 'From HIS (locked)'));
    var lg = h('div', { class: 'fieldgrid' });
    function lockRow(k, v) { lg.appendChild(h('div', { class: 'fld' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v || '—'), h('span', { class: 'lock', title: 'From HIS, not editable' }, '🔒'))); }
    lockRow('UMR No', p.umr_no);
    lockRow('IP No', p.admn_no);
    lockRow('Name', p.name);
    var tel = String(p.mobile || '').replace(/[^\d+]/g, '');
    lg.appendChild(h('div', { class: 'fld' }, h('span', { class: 'k' }, 'Mobile'),
      h('span', { class: 'v' }, tel.length >= 10 ? h('a', { href: 'tel:' + tel }, p.mobile) : (p.mobile || '—')), h('span', { class: 'lock' }, '🔒')));
    lockRow('Address', p.address);
    lockRow('Responsible person / alternate', p.alt_contact);
    lockRow('Admission', p.admn_dt_f);
    lockRow('Discharge', p.dis_dt_f + (p.dschrg_status ? ' (' + p.dschrg_status + ')' : ''));
    if (p.prev_admn_no) lockRow('Previous admission', p.prev_admn_no + ' · ' + p.prev_admn_dt_f);
    locked.appendChild(lg);
    box.appendChild(locked);

    var ed = h('div', { class: 'card' }, h('h2', null, 'Details (editable)'));
    var eg = h('div', { class: 'fieldgrid' });
    var canEdit = I.can('edit_patient') && !p.fromHistory;
    FIELD_ORDER.forEach(function (f) {
      var fd = p.fields[f];
      eg.appendChild(h('div', { class: 'fld' }, h('span', { class: 'k' }, lb[f] || f),
        h('span', { class: 'v' }, fd.value || (f === 'unit' ? 'Unassigned' : '—'),
          fd.differs ? h('span', { class: 'hisdiff' }, 'HIS differs: ' + (fd.his || 'blank')) : null),
        canEdit ? h('button', { class: 'btn small', onclick: function () { editField(p, f); } }, 'Edit') : null));
    });
    ed.appendChild(eg);
    box.appendChild(ed);

    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'ICC sections'),
      h('p', { class: 'muted small' }, 'Active feedback, discharge call, night IPD/OPD, complaint, DAMA/DOR, room upgradation, wow, video, loyalty, leads and PCC cards arrive in Phase 2.')));

    var events = [];
    events.push({ ts: p.admn_dt, text: 'Admitted' + (p.fields.bed.his ? ' · bed ' + p.fields.bed.his : '') });
    if (p.dis_dt) events.push({ ts: p.dis_dt, text: 'Discharged' + (p.fields.discharge_type.value ? ' · ' + p.fields.discharge_type.value : '') });
    (p.timeline || []).forEach(function (e) { events.push({ ts: e.ts, text: (e.kind === 't' ? 'Bed transfer ' : '') + e.text }); });
    events.sort(function (a, b2) { return b2.ts - a.ts; });
    var tl = h('ul', { class: 'timeline' });
    events.forEach(function (e) { tl.appendChild(h('li', null, h('div', { class: 'small muted' }, I.fmtDT(e.ts)), e.text)); });
    box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Timeline'), tl));
  }

  function rerender(admn) {
    if (I.route().page === 'patient' && I.route().arg === admn) Views.patient(I.clear(document.getElementById('main')), admn, true);
  }

  /** Lists used by the edit dialog, loaded once per session. */
  function lists() {
    if (S._lists) return Promise.resolve(S._lists);
    return Promise.all([I.Api.call('listBeds'), I.Api.call('listDoctors'), I.Api.call('listDepartments')]).then(function (r) {
      S._lists = { beds: r[0], doctors: r[1], departments: r[2] };
      return S._lists;
    });
  }

  function editField(p, f) {
    var fd = p.fields[f];
    var lb = S.boot.labels[f] || f;
    var input;
    var note = h('input', { type: 'text', placeholder: 'Reason (optional)' });
    var body = h('div', null, h('p', { class: 'small muted' }, 'HIS value: ' + (fd.his || 'blank')));
    var holder = h('div', null, h('span', { class: 'spin' }));
    body.appendChild(holder);
    body.appendChild(h('label', { class: 'f' }, h('span', null, 'Note'), note));
    function select(options, cur) {
      var s = h('select');
      options.forEach(function (o) { s.appendChild(h('option', { value: o[0], selected: o[0] === cur ? 'selected' : null }, o[1])); });
      return s;
    }
    var ready = lists().then(function (L) {
      I.clear(holder);
      if (f === 'payment_cat') input = select([['', '(unassigned)']].concat(S.boot.paymentCategories.map(function (c) { return [c, c]; })), fd.value);
      else if (f === 'unit') input = select([['', 'Unassigned']].concat((S.boot.settings.units || []).map(function (u) { return [u, u]; })), fd.value);
      else if (f === 'discharge_type') input = select([['', '(none)']].concat((S.boot.settings.discharge_types || []).map(function (d) { return [d.name, d.name]; })), fd.value);
      else if (f === 'vip') input = select([['N', 'No'], ['Y', 'Yes']], fd.value || 'N');
      else if (f === 'gender') input = select([['', '—'], ['Male', 'Male'], ['Female', 'Female'], ['Other', 'Other']], fd.value);
      else {
        var dl = null;
        var opts = f === 'bed' ? L.beds.filter(function (b) { return b.active === 'Y'; }).map(function (b) { return b.bed_no + ''; })
          : (f === 'consultant' || f === 'ref_doctor') ? L.doctors.filter(function (d) { return d.active !== 'N'; }).map(function (d) { return d.display_name; })
          : f === 'department' ? L.departments.filter(function (d) { return d.active !== 'N'; }).map(function (d) { return d.name; }) : null;
        if (opts) { dl = h('datalist', { id: 'dl-' + f }); opts.forEach(function (o) { dl.appendChild(h('option', { value: o })); }); }
        input = h('input', { type: 'text', value: fd.value, list: dl ? 'dl-' + f : null });
        if (dl) holder.appendChild(dl);
        if (f === 'bed') holder.appendChild(h('p', { class: 'small muted' }, 'Ward and room follow the bed list automatically.'));
      }
      holder.appendChild(h('label', { class: 'f' }, h('span', null, lb), input));
      if (fd.his && fd.his !== fd.value) holder.appendChild(h('button', { class: 'btn small', onclick: function () { input.value = fd.his; } }, 'Use HIS value'));
      input.focus();
    }).catch(function (e) { I.clear(holder).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    I.modal('Edit ' + lb, body, [
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: function () {
        return ready.then(function () {
          var val = input.value.trim();
          if (val === (fd.value || '')) return true;
          // Optimistic: show the new value at once, roll back if the server refuses.
          var before = JSON.parse(JSON.stringify(p));
          p.fields[f].value = val; p.fields[f].differs = val !== p.fields[f].his;
          if (f === 'unit') p.badges.unit = val || 'Unassigned';
          if (f === 'payment_cat') p.badges.payment_cat = val;
          rerender(p.admn_no);
          var changes = {}; changes[f] = val;
          I.Api.call('editPatient', { admn_no: p.admn_no, changes: changes, note: note.value }).then(function (d) {
            S.patients[p.admn_no] = d.patient;
            rerender(p.admn_no);
            I.toast('Saved');
            window.App.dataChanged();
          }).catch(function (e) {
            S.patients[p.admn_no] = before;
            rerender(p.admn_no);
            I.toast('Not saved: ' + I.errText(e), true);
          });
          return true;
        });
      } }
    ]);
  }

  /* ================= UPLOAD ================= */
  var ORDER = ['admission', 'bed_occupancy', 'transfer', 'discharge'];

  Views.upload = function (main) {
    if (!I.can('upload')) { main.appendChild(h('div', { class: 'msg err' }, 'You do not have the Upload HIS data permission.')); return; }
    var detected = {};      // fileType -> parsed sheet + file name
    var busy = false;
    var results = h('div');
    var fileInput = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', multiple: true, class: 'hidden', onchange: function () { readFiles(fileInput.files); fileInput.value = ''; } });
    var drop = h('div', { class: 'drop', onclick: function () { if (!busy) fileInput.click(); } },
      h('b', null, 'Tap to choose HIS files, or drop them here'),
      h('div', { class: 'small muted' }, 'Bed Occupancy, Admission List, Discharge Report, Bed Transfer — any order, one or several at once. Each file is recognised by its column headings.'));
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { if (!busy) readFiles(e.dataTransfer.files); });
    var boxesWrap = h('div', { class: 'boxes' });
    var uploadAll = h('button', { class: 'btn primary', disabled: true, onclick: function () { run(ORDER.filter(function (ft) { return detected[ft]; })); } }, 'Upload all detected files');
    var clearBtn = h('button', { class: 'btn', disabled: true, onclick: function () { detected = {}; renderBoxes(); } }, 'Clear');
    var undoBox = h('div');
    main.appendChild(h('h1', null, 'Upload HIS files'));
    main.appendChild(h('div', { class: 'card' }, drop, fileInput, boxesWrap, h('div', { class: 'row', style: 'margin-top:12px' }, uploadAll, clearBtn)));
    main.appendChild(results);
    main.appendChild(undoBox);
    main.appendChild(h('div', { class: 'card' }, h('h2', null, 'Tablet feedback'), h('p', { class: 'small muted' }, 'The optional daily Tablet Feedback upload box arrives with the feedback module in Phase 2.')));

    function renderBoxes() {
      I.clear(boxesWrap);
      var status = (S.boot.uploads && S.boot.uploads.boxes) || {};
      ORDER.forEach(function (ft) {
        var st = status[ft] || {};
        var d = detected[ft];
        boxesWrap.appendChild(h('div', { class: 'box' + (d ? ' ready' : '') },
          h('h4', null, S.boot.fileTypes[ft]),
          ['Morning', 'Evening'].map(function (slot) {
            var x = st[slot];
            return h('div', { class: 'slot' + (x ? ' done' : ' missing') }, (x ? '✓ ' : '○ ') + slot + ': ' + (x ? x.at.slice(11) + ' · ' + x.by + ' · ' + x.rows + ' rows' : 'not uploaded'));
          }),
          d ? h('div', { class: 'file' }, h('div', { class: 'fname', title: d.fileName }, d.fileName),
            h('div', { class: 'small' }, d.rows.length + ' rows' + (d.meta.dateTo ? ' · dated ' + I.fmtD(d.meta.dateTo) : '')),
            d.meta.missingFields.length ? h('div', { class: 'small warn-text' }, 'Columns not found: ' + d.meta.missingFields.join(', ')) : null) : null,
          d ? h('button', { class: 'btn small primary', disabled: busy, onclick: function () { run([ft]); } }, 'Upload this file') : null));
      });
      uploadAll.disabled = busy || !Object.keys(detected).length;
      clearBtn.disabled = busy || !Object.keys(detected).length;
      uploadAll.textContent = busy ? 'Uploading…' : 'Upload all detected files';
      drop.classList.toggle('disabled', busy);
    }

    function readFiles(files) {
      if (typeof XLSX === 'undefined') return I.toast('Excel reader not loaded yet. Check the connection and reload.', true);
      Array.prototype.forEach.call(files, function (file) {
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var sheets = window.HisParse.parseHis(XLSX, new Uint8Array(reader.result), S.boot.settings.his_mapping, S.boot.dateFields);
            if (!sheets.length) { results.insertBefore(h('div', { class: 'msg err' }, file.name + ': not recognised as a HIS file (column headings not found). Check Settings > Column mapping.'), results.firstChild); return; }
            sheets.forEach(function (sh) { sh.fileName = file.name; detected[sh.fileType] = sh; });
            renderBoxes();
          } catch (e) {
            results.insertBefore(h('div', { class: 'msg err' }, file.name + ': ' + I.errText(e)), results.firstChild);
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    /** Upload the chosen file types in ONE call. */
    function run(types, confirm) {
      if (busy || !types.length) return Promise.resolve();
      busy = true; renderBoxes();
      var rowsTotal = types.reduce(function (n, ft) { return n + detected[ft].rows.length; }, 0);
      var card = h('div', { class: 'card' }, h('div', null, h('span', { class: 'spin' }), ' Uploading ' + types.length + ' file(s), ' + rowsTotal + ' rows… please keep this page open.'));
      results.insertBefore(card, results.firstChild);
      var files = types.map(function (ft) { var d = detected[ft]; return { fileType: ft, fileName: d.fileName, fields: d.fields, rows: d.rows, meta: d.meta }; });
      return I.Api.call('uploadHisBatch', { files: files, confirm: confirm || {} }).then(function (r) {
        if (r.needConfirm) {
          results.removeChild(card);
          busy = false; renderBoxes();
          return I.confirmBox('Please check', r.needConfirm.map(function (c) { return c.message; }).join('\n\n'), 'Upload anyway').then(function (yes) {
            if (!yes) return;
            var c = Object.assign({}, confirm || {});
            r.needConfirm.forEach(function (x) { c[x.key] = true; });
            return run(types, c);
          });
        }
        types.forEach(function (ft) { delete detected[ft]; });
        S.boot.uploads = r.uploads; I.Store.set('boot.' + S.branchId, S.boot);
        showSummary(card, r);
        busy = false; renderBoxes(); renderUndo();
        window.App.dataChanged();
      }).catch(function (e) {
        busy = false; renderBoxes();
        I.clear(card).appendChild(h('div', { class: 'msg err' }, 'Upload failed: ' + I.errText(e) + ' Nothing was saved; you can try again.'));
      });
    }

    function showSummary(card, r) {
      I.clear(card);
      card.appendChild(h('div', { class: 'row between' }, h('h2', null, '✓ Uploaded ' + r.files.length + ' file(s)'), h('span', { class: 'small muted' }, r.at + ' · ' + r.by)));
      var t = h('table', { class: 't' }, h('tr', null, ['File', 'Slot', 'Rows', 'New', 'Updated', 'Unchanged', 'Your edits kept', 'Not in latest bed list'].map(function (x) { return h('th', null, x); })));
      r.files.forEach(function (f) {
        t.appendChild(h('tr', null, h('td', null, h('b', null, f.fileLabel)), h('td', null, f.slot), h('td', null, f.rows), h('td', null, f.new),
          h('td', null, f.updated), h('td', null, f.unchanged), h('td', null, f.editsKeptPatients || 0), h('td', null, f.fileType === 'bed_occupancy' ? f.notInLatest : '—')));
      });
      card.appendChild(h('div', { class: 'tablewrap' }, t));
      card.appendChild(h('div', { class: 'msg ok small' }, 'Nothing deleted. ' + r.files.reduce(function (n, f) { return n + (f.transfersAdded || 0); }, 0) + ' bed transfer hop(s) recorded.'));
      r.files.forEach(function (f) {
        (f.confirmed || []).forEach(function (w) { card.appendChild(h('div', { class: 'msg warn small' }, w + ' (confirmed)')); });
        (f.warnings || []).forEach(function (w) { card.appendChild(h('div', { class: 'msg warn small' }, f.fileLabel + ': ' + w)); });
      });
      if (r.unknownBeds.length) {
        var ub = h('div', { class: 'msg warn' }, 'Beds not in the bed list: ');
        r.unknownBeds.forEach(function (b) {
          ub.appendChild(h('span', { style: 'margin-right:8px;display:inline-block' }, b.bed_no + ' (' + (b.ward || '?') + ')',
            I.can('manage_lists') ? h('button', { class: 'btn small', style: 'margin-left:4px', onclick: function (ev) {
              ev.target.disabled = true;
              I.Api.call('saveBed', { bed: { bed_no: b.bed_no, ward: b.ward, room: b.room } }).then(function () { ev.target.textContent = 'Added'; S._lists = null; })
                .catch(function (e) { I.toast(I.errText(e), true); ev.target.disabled = false; });
            } }, 'Add to bed list') : null));
        });
        card.appendChild(ub);
      }
      if (r.newDoctors.length) card.appendChild(h('div', { class: 'msg info small' }, 'New doctors learned: ' + r.newDoctors.join(', ') + '. Merge spellings in Settings > Doctors.'));
      if (r.newDepartments.length) card.appendChild(h('div', { class: 'msg info small' }, 'New departments: ' + r.newDepartments.join(', ') + ' — assign HOD in Settings > Departments.'));
      if (r.newOrgs.length) card.appendChild(h('div', { class: 'msg info small' }, 'New organisations: ' + r.newOrgs.join(', ') + '.'));
    }

    function renderUndo() {
      I.clear(undoBox);
      var last = S.boot.uploads && S.boot.uploads.lastUpload;
      if (!last) return;
      undoBox.appendChild(h('div', { class: 'card' }, h('div', { class: 'row between' },
        h('div', null, h('b', null, 'Last upload: '), last.label + ' · ' + last.at + ' · ' + last.by),
        h('button', { class: 'btn danger', onclick: function () {
          I.confirmBox('Undo last upload?', 'This reverts only the HIS values brought by "' + last.label + '" at ' + last.at +
            '. Your edits and all ICC entries stay. Patients that only this upload created are hidden, not deleted.', 'Undo').then(function (yes) {
            if (!yes) return;
            I.Api.call('undoUpload', { uploadId: last.uploadId }).then(function (u) {
              I.toast('Undone: ' + u.restored + ' restored, ' + u.voidedNew + ' hidden');
              S.patients = {};
              return I.Api.call('uploadStatus').then(function (st) {
                S.boot.uploads = st; I.Store.set('boot.' + S.branchId, S.boot);
                renderBoxes(); renderUndo(); window.App.dataChanged();
              });
            }).catch(function (e) { I.toast(I.errText(e), true); });
          });
        } }, 'Undo last upload'))));
    }

    renderBoxes(); renderUndo();
  };

  /* ================= DATA QUALITY ================= */
  Views.quality = function (main) {
    main.appendChild(h('h1', null, 'Data quality'));
    var box = h('div', null, h('span', { class: 'spin' }), ' Checking…');
    main.appendChild(box);
    var titles = {
      missing_mobile: 'In-house patients with missing mobile', discharge_before_admission: 'Discharge before admission',
      occupied_after_discharge: 'Bed shown occupied for a discharged patient', two_in_one_bed: 'Two patients in one bed',
      stale_open: 'Open admissions not in the bed list (no discharge yet)', unknown_bed: 'Beds not in the bed list',
      repeat_admissions: 'Repeat admissions (in-house)'
    };
    I.Api.call('dataQuality').then(function (d) {
      I.clear(box);
      if (d.newDepartments.length) box.appendChild(h('div', { class: 'msg warn' }, 'New departments without HOD: ' + d.newDepartments.join(', ') + '. ',
        h('a', { href: '#/settings/departments' }, 'Assign HOD')));
      Object.keys(titles).forEach(function (k) {
        var list = d.lists[k] || [];
        var c = h('div', { class: 'card' }, h('h2', null, titles[k] + ' (' + list.length + ')'));
        if (!list.length) c.appendChild(h('div', { class: 'muted small' }, 'None.'));
        var ul = h('ul', { class: 'list' });
        list.slice(0, 100).forEach(function (o) {
          ul.appendChild(h('li', { onclick: function () { I.go('patient/' + encodeURIComponent(o.admn_no)); } },
            h('div', { class: 'pt-row' }, h('span', { class: 'bed' }, o.bed || '—'), h('div', null, h('div', { class: 'nm' }, o.name),
              h('div', { class: 'small muted' }, o.admn_no + (o.department ? ' · ' + o.department : '') + (o.detail ? ' · ' + o.detail : '')),
              o.readmission ? h('span', { class: 'badge bad' }, 'Re-admission') : null))));
        });
        c.appendChild(ul);
        box.appendChild(c);
      });
    }).catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
  };

  /* ================= MORE (phone menu) ================= */
  Views.more = function (main) {
    main.appendChild(h('h1', null, 'More'));
    var ul = h('ul', { class: 'list card' });
    if (I.can('manage_users')) {
      ul.appendChild(h('li', { onclick: function () { I.go('users'); } }, 'Users and permissions'));
      ul.appendChild(h('li', { onclick: function () { I.go('system'); } }, 'System: benchmark, audit log'));
    }
    if (S.profile.user.is_super) ul.appendChild(h('li', { onclick: function () { I.go('branches'); } }, 'Branches'));
    ul.appendChild(h('li', { onclick: function () { I.go('quality'); } }, 'Data quality'));
    ul.appendChild(h('li', { onclick: function () { window.App.showChangePassword(false); } }, 'Change my password'));
    ul.appendChild(h('li', { onclick: function () { window.App.logout(); } }, 'Log out'));
    main.appendChild(ul);
  };
})();
