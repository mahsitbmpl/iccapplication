/**
 * Phase 4 screens: Dashboard (day and month), Bed Ready list, Excel exports, Health.
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var Views = window.Views = window.Views || {};

  function today() { return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10); }
  function dmy(day) { return day ? day.slice(8, 10) + '-' + day.slice(5, 7) + '-' + day.slice(0, 4) : ''; }
  function pad(n) { n = Number(n) || 0; return n < 10 ? '0' + n : String(n); }
  function loading(box) { I.clear(box).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading…')); }
  function fail(box, e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); }
  function table(head, rows, cls) {
    var tb = h('tbody');
    rows.forEach(function (r) { tb.appendChild(h('tr', null, r.map(function (v, i) { return h(i ? 'td' : 'th', { scope: i ? null : 'row', class: typeof v === 'number' ? 'num' : '' }, v === undefined || v === null ? '' : String(v)); }))); });
    return h('div', { class: 'tablewrap' }, h('table', { class: 't ' + (cls || '') }, h('thead', null, h('tr', null, head.map(function (x) { return h('th', null, x); }))), tb));
  }

  /* ================= DASHBOARD ================= */

  Views.dashboard = function (main, arg) {
    var mode = arg === 'month' ? 'month' : 'day';
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Dashboard'),
      h('div', { class: 'sub' }, 'Worked out from the HIS uploads and the ICC records. Nothing is typed.'))));
    var tabs = h('div', { class: 'tabs' },
      h('button', { class: mode === 'day' ? 'on' : '', onclick: function () { I.go('dashboard/day'); } }, 'Day'),
      h('button', { class: mode === 'month' ? 'on' : '', onclick: function () { I.go('dashboard/month'); } }, 'Month'));
    main.appendChild(tabs);
    var box = h('div');
    if (mode === 'day') dayView(main, box); else monthView(main, box);
    main.appendChild(box);
  };

  function dayView(main, box) {
    var day = h('input', { type: 'date', value: sessionStorage.getItem('icc.dashday') || today(), max: today() });
    var tools = h('div', { class: 'toolbar' }, h('label', { class: 'f inline' }, h('span', null, 'Date'), day), h('span', { class: 'spacer' }));
    main.appendChild(tools);
    var re = null;
    function load(recompute) {
      sessionStorage.setItem('icc.dashday', day.value);
      loading(box);
      var show = function (r) {
        if (!re && r.canRecompute) {
          re = h('button', { class: 'btn small', onclick: function () { load(true); } }, 'Work out again');
          tools.appendChild(re);
        }
        draw(r);
      };
      (recompute ? I.Api.call('dayReport', { day: day.value, recompute: true }).then(show) : I.swr('dayReport', { day: day.value }, show))
        .catch(function (e) { fail(box, e); });
    }
    function draw(r) {
      I.clear(box);
      if (r.missingSlots.length && r.day === today()) box.appendChild(h('div', { class: 'msg warn' }, 'HIS upload not done yet today: ' + r.missingSlots.join(' and ') + '.'));
      else if (r.missingSlots.length) box.appendChild(h('div', { class: 'msg warn' }, 'HIS upload missing on this day: ' + r.missingSlots.join(' and ') + '.'));
      if (r.partial) box.appendChild(h('div', { class: 'msg' }, 'This day was not saved and some of its patients are already in History: figures may be low.'));
      var s = r.summary;
      box.appendChild(h('div', { class: 'tiles' },
        tile('Admissions', r.admissions.total), tile('Bed occupancy', r.occupancy), tile('Staying now', r.stayTotal),
        tile('Active feedback', s.active.total, s.active.neg ? s.active.neg + ' negative' : ''),
        tile('Discharge calls', s.discharge.total, s.discharge.neg ? s.discharge.neg + ' negative' : ''),
        tile('Tablet feedback', s.tablet.total, s.tablet.neg ? s.tablet.neg + ' negative' : '')));
      // census
      var rows = r.groups.map(function (g) {
        var l = r.lines.groups[g.name] || {};
        return [g.name, l.cell, l.activity];
      });
      var ct = h('tbody');
      rows.forEach(function (x) { ct.appendChild(h('tr', null, h('th', { scope: 'row' }, x[0]), h('td', { class: 'preline cen' }, x[1]), h('td', { class: 'act' }, x[2]))); });
      box.appendChild(h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h2', null, 'Bed Occupancy Report ', h('span', { class: 'count' }, pad(r.occupancy))),
        h('span', { class: 'small muted' }, 'Window ' + I.fmtDT(r.window.from) + ' → ' + I.fmtDT(r.window.to) + (r.final ? ' · final' : ' · so far'))),
        h('div', { class: 'tablewrap' }, h('table', { class: 't census' }, h('thead', null, h('tr', null, h('th', null, 'Floor'), h('th', null, 'Census'), h('th', null, 'Activity line'))), ct))));
      var a = r.admissions;
      var cats = [['Cash', 'Cash'], ['Corporate Premium', 'Corporate Premium'], ['Corporate CGHS', 'Corporate CGHS', r.lines.cghsRemark], ['SOCH', 'SOCH'],
        ['TPA Admissions', 'TPA'], ['Yojana', 'Yojana', r.lines.yojanaRemark], ['Clinical Research', 'Clinical Research']];
      var left = h('div', { class: 'card' }, h('h2', null, 'Admission Details ', h('span', { class: 'count' }, pad(a.total))),
        table(['Category', 'Count', 'Remark'], cats.map(function (c) { return [c[0], a.cats[c[1]], c[2] || '']; }).concat([['From EMR', a.er, '']])));
      var right = h('div', { class: 'card' }, h('h2', null, 'Feedback'),
        table(['', 'Total', 'Positive', 'Negative', 'Others'], [
          ['Active Feedback', s.active.total, s.active.pos, s.active.neg, ''], ['Discharge calls', s.discharge.total, s.discharge.pos, s.discharge.neg, s.discharge.others],
          ['Tablet Feedback', s.tablet.total, s.tablet.pos, s.tablet.neg, ''], ['Night IPD & OPD', s.night.total, s.night.pos, s.night.neg, s.night.others],
          ['Google Reviews', s.google.total, s.google.pos, s.google.neg, '']]),
        h('h3', { class: 'small', style: 'margin:14px 0 4px' }, 'Other activity'),
        table(['', 'Count'], [['DAMA / DOR (avoidable)', s.dama.total + ' (' + s.dama.avoidable + ')'], ['LAMA (avoidable)', s.lama.total + ' (' + s.lama.avoidable + ')'],
          ['108 Ambulance', s.ambulance.total], ['Care Coach today / tomorrow', s.careCoach.today + ' / ' + s.careCoach.tomorrow], ['Wow Moment', s.wow],
          ['Video Feedback', s.video], ['Loyalty Card', s.loyalty], ['PCC', s.pcc], ['Homecare / Campaign / Success Story leads', s.homecare + ' / ' + s.campaign + ' / ' + s.success],
          ['Complaints raised', s.complaints]]));
      box.appendChild(h('div', { class: 'cols' }, left, right));
    }
    day.addEventListener('change', function () { load(false); });
    load(false);
  }

  function tile(label, n, sub) {
    return h('div', { class: 'tile' }, h('div', { class: 'tn' }, String(n)), h('div', { class: 'tl' }, label), sub ? h('div', { class: 'ts' }, sub) : null);
  }

  function monthView(main, box) {
    var month = h('input', { type: 'month', value: sessionStorage.getItem('icc.dashmonth') || today().slice(0, 7), max: today().slice(0, 7) });
    main.appendChild(h('div', { class: 'toolbar' }, h('label', { class: 'f inline' }, h('span', null, 'Month'), month)));
    function load() {
      sessionStorage.setItem('icc.dashmonth', month.value);
      loading(box);
      I.swr('monthReport', { month: month.value }, draw).catch(function (e) { fail(box, e); });
    }
    function draw(m) {
      I.clear(box);
      var x = m.dashboard, w = function (t) { return (x.wowTypes || {})[t] || 0; };
      var dash = h('div', { class: 'card' }, h('h2', null, 'ICC Dashboard'), table(['Measuring component', 'Count'], [
        ['Google Reviews', x.google], ['PCC', x.pcc], ['Wow Moments', x.wow], ['   (a) New Born Celebration', w('New Born Celebration')],
        ['   (b) Birthday Celebration', w('Birthday Celebration')], ['   (c) Wedding Anniversary Celebration', w('Wedding Anniversary Celebration')],
        ['   (d) Critical Surgeries when gets Successful', w('Critical Surgeries when gets Successful')], ['   (e) Last Chemo Celebration', w('Last Chemo Celebration')],
        ['Loyalty cards distributed', x.loyalty], ['Social media counts (video feedback)', x.video], ['Homecare Conversion', x.homecare],
        ['Campaign Conversion', x.campaign], ['Training by FM', x.training], ['DAMA', x.dama], ['DOR', x.dor], ['Any special activity', x.special]]));
      var ft = m.feedbackTotals, all = m.feedbackAll;
      var fb = h('div', { class: 'card' }, h('h2', null, 'Total feedback'), table(['Type of feedback', 'Total', 'Positive', 'Negative', 'Others'],
        Object.keys(ft).map(function (k) { return [k, ft[k].total, ft[k].pos, ft[k].neg, ft[k].others]; }).concat([['Total Feedback', all.total, all.pos, all.neg, all.others]])));
      box.appendChild(h('div', { class: 'cols' }, dash, fb));
      var max = m.departments.reduce(function (n, d) { return Math.max(n, d.total); }, 1);
      var dep = h('div', { class: 'card' }, h('h2', null, 'Negative feedback by department'),
        m.departments.length ? null : h('p', { class: 'muted' }, 'No negative feedback with a department this month.'));
      var ul = h('ul', { class: 'deplist' });
      m.departments.forEach(function (d) {
        var det = h('details', null, h('summary', null, h('span', { class: 'dn' }, d.name), h('span', { class: 'bar' }, h('i', { style: 'width:' + Math.round(d.total / max * 100) + '%' })),
          h('b', null, d.total)),
        h('ul', { class: 'issues' }, d.issues.map(function (i) { return h('li', null, h('span', null, i.issue), h('b', null, i.count)); })),
        d.hod ? h('div', { class: 'small muted' }, 'HOD: ' + d.hod) : null);
        ul.appendChild(h('li', null, det));
      });
      dep.appendChild(ul);
      box.appendChild(dep);
    }
    month.addEventListener('change', load);
    load();
  }

  /* ================= BED READY ================= */

  Views.bedready = function (main) {
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Bed Ready list'), h('div', { class: 'sub', id: 'brsub' }, 'Loading…'))));
    var bar = h('div', { class: 'toolbar' });
    var box = h('div');
    main.appendChild(bar);
    main.appendChild(box);
    var data = null, after = {}, notReady = {}, timer = null, saving = false, pendingSave = false;
    var status = h('span', { class: 'small muted', 'aria-live': 'polite' });
    function load() {
      loading(box);
      I.swr('bedReady', {}, function (d) { if (saving || timer) return; data = d; reset(); draw(); }).catch(function (e) { fail(box, e); });
    }
    function reset() {
      after = {}; notReady = {};
      data.groups.forEach(function (g) { g.after.forEach(function (b) { after[b.bed] = true; }); g.notReady.forEach(function (b) { notReady[b.bed] = true; }); });
    }
    function asText() {
      var lines = ['Bed Ready List Date (' + data.atText + ')', 'Total stay: ' + pad(data.total)];
      data.groups.forEach(function (g) {
        lines.push('');
        lines.push('*' + g.name + '* (stay ' + pad(g.stay) + ')');
        if (g.closed) { lines.push('FLOOR CLOSED'); return; }
        var ready = g.ready.concat(g.notReady).filter(function (b) { return !notReady[b.bed]; });
        var aft = g.occupied.filter(function (b) { return after[b.bed]; });
        lines.push('Ready: ' + (ready.length ? ready.map(function (b) { return b.label; }).join(', ') : '0'));
        lines.push('After discharge: ' + (aft.length ? aft.map(function (b) { return b.label; }).join(', ') : '0'));
      });
      return lines.join('\n');
    }
    /** Every tap is saved by itself (1 second after the last tap). */
    function queueSave() {
      status.textContent = 'Saving…';
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        if (saving) { pendingSave = true; return; }
        saving = true;
        I.Api.call('saveBedTicks', { after: Object.keys(after).filter(function (k) { return after[k]; }), notReady: Object.keys(notReady).filter(function (k) { return notReady[k]; }) })
          .then(function () { status.textContent = 'Saved'; })
          .catch(function (e) { status.textContent = 'Not saved: ' + I.errText(e); I.toast('Ticks not saved: ' + I.errText(e), true); })
          .then(function () { saving = false; if (pendingSave) { pendingSave = false; queueSave(); } });
      }, 1000);
    }
    function draw() {
      I.clear(box); I.clear(bar);
      var sub = document.getElementById('brsub');
      if (sub) sub.textContent = (data.atText ? 'Bed Occupancy upload of ' + data.atText : 'No Bed Occupancy upload yet: upload today\'s HIS files') + ' · ' + pad(data.total) + ' staying';
      bar.appendChild(h('button', { class: 'btn', onclick: function () {
        var t = asText();
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { I.toast('Copied. Paste it in your group.'); })
          .catch(function () { I.modal('Bed Ready list', h('textarea', { rows: 14, readonly: true }, t), [{ label: 'Close' }]); });
      } }, 'Copy as text'));
      if (data.canTick) bar.appendChild(h('span', { class: 'small muted' }, 'Tap a ready bed to mark it not ready (tap again to undo). Open "In house beds" to mark a discharge expected today.'));
      bar.appendChild(h('span', { class: 'spacer' }));
      bar.appendChild(status);
      var grid = h('div', { class: 'brgrid' });
      data.groups.forEach(function (g) {
        var card = h('div', { class: 'card brcard' + (g.closed ? ' closed' : '') }, h('div', { class: 'cardhead' }, h('h2', null, g.name),
          h('span', { class: 'count' }, pad(g.stay)), h('span', { class: 'small muted' }, 'staying')));
        if (g.closed) { card.appendChild(h('div', { class: 'msg' }, 'FLOOR CLOSED')); grid.appendChild(card); return; }
        var vacant = g.ready.concat(g.notReady).sort(function (a, b) { return a.bed.localeCompare(b.bed, 'en', { numeric: true }); });
        var readyBox = h('div'), afterBox = h('div'), nrBox = h('div');
        function paint() {
          var ready = vacant.filter(function (b) { return !notReady[b.bed]; });
          var nr = vacant.filter(function (b) { return notReady[b.bed]; });
          var aft = g.occupied.filter(function (b) { return after[b.bed]; });
          I.clear(readyBox).appendChild(sec('Ready', ready, 'ready', data.canTick ? function (b) { notReady[b.bed] = true; paint(); queueSave(); } : null));
          I.clear(afterBox).appendChild(sec('After discharge', aft, 'after', data.canTick ? function (b) { after[b.bed] = false; paint(); queueSave(); } : null));
          I.clear(nrBox);
          if (nr.length) nrBox.appendChild(sec('Not ready', nr, 'nr', data.canTick ? function (b) { notReady[b.bed] = false; paint(); queueSave(); } : null));
          if (occ) Array.prototype.forEach.call(occ.querySelectorAll('.bchip'), function (c) {
            var on = !!after[c.getAttribute('data-bed')];
            c.className = 'bchip tick ' + (on ? 'after' : 'occ');
            c.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
        }
        var occ = null;
        card.appendChild(readyBox); card.appendChild(afterBox); card.appendChild(nrBox);
        if (data.canTick && g.occupied.length) {
          occ = h('div', { class: 'bedchips' }, g.occupied.map(function (b) {
            return h('button', { type: 'button', class: 'bchip tick occ', 'data-bed': b.bed, 'aria-pressed': 'false',
              onclick: function () { after[b.bed] = !after[b.bed]; paint(); queueSave(); } }, b.label);
          }));
          card.appendChild(h('details', { class: 'brocc' }, h('summary', null, 'In house beds (' + g.occupied.length + '): tap for discharge expected today'), occ));
        }
        paint();
        grid.appendChild(card);
      });
      box.appendChild(grid);
    }
    function sec(title, list, cls, onTap) {
      return h('div', { class: 'brsec' }, h('div', { class: 'small muted' }, title + ' (' + list.length + ')'),
        list.length ? h('div', { class: 'bedchips' }, list.map(function (b) {
          return onTap ? h('button', { type: 'button', class: 'bchip tick ' + cls, title: cls === 'ready' ? 'Tap: not ready' : 'Tap to undo', onclick: function () { onTap(b); } }, b.label)
            : h('span', { class: 'bchip ' + cls }, b.label);
        })) : h('div', { class: 'small' }, '0'));
    }
    load();
  };

  /* ================= EXCEL EXPORTS ================= */

  Views.exports = function (main) {
    var month = h('input', { type: 'month', value: today().slice(0, 7), max: today().slice(0, 7) });
    var out = h('div');
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Excel'),
      h('div', { class: 'sub' }, 'The month\'s workbooks in the layouts used today, built on this device.'))));
    var btns = [['D', 'Daily Report', 'Active Feedback, Bed Occupancy (census, one column per day), Activity Line, Bed Vacant'],
      ['R', 'Daily Reporting', 'Summary (one column per day), all ICC logs, Tablet, collected sheet, department-wise and total feedback'],
      ['A', 'Floor Manager monthly', 'ICC Dashboard, Google reviews, PCC, Wow, Loyalty, Video, leads, Training, DAMA DOR, Special activity, Inventory']];
    var cache = {};
    var list = h('div', { class: 'explist' });
    btns.forEach(function (b) {
      var btn = h('button', { class: 'btn primary' }, I.icon('file', 16), 'Download');
      btn.addEventListener('click', function () { build(b[0], btn); });
      list.appendChild(h('div', { class: 'card exprow' }, h('div', null, h('h2', null, b[1]), h('p', { class: 'small muted' }, b[2])), btn));
    });
    main.appendChild(h('div', { class: 'toolbar' }, h('label', { class: 'f inline' }, h('span', null, 'Month'), month)));
    main.appendChild(list);
    main.appendChild(out);
    main.appendChild(h('p', { class: 'small muted' }, 'The files hold patient names and phone numbers: keep them inside the hospital. Days already moved to History show the figures saved each night.'));
    function build(which, btn) {
      if (!window.XLSX) { I.toast('The Excel library did not load. Check the internet connection and reload.', true); return; }
      btn.disabled = true;
      I.clear(out).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Collecting ' + month.value + '…'));
      var get = cache[month.value] ? Promise.resolve(cache[month.value]) : I.Api.call('exportMonth', { month: month.value });
      get.then(function (d) {
        cache[month.value] = d;
        var wb = which === 'D' ? window.XlsxExport.buildD(d) : which === 'R' ? window.XlsxExport.buildR(d, S.boot.forms.forms) : window.XlsxExport.buildA(d);
        var branch = (S.profile.branches[S.branchId] || {}).name || '';
        window.XLSX.writeFile(wb, window.XlsxExport.fileName(which, d, branch));
        I.clear(out).appendChild(h('div', { class: 'msg ok' }, 'Downloaded: ' + d.records.length + ' records, ' + d.days.length + ' days, ' + d.tablet.length + ' tablet rows.'));
      }).catch(function (e) { fail(out, e); }).then(function () { btn.disabled = false; });
    }
    month.addEventListener('change', function () { I.clear(out); });
  };

  /* ================= HEALTH ================= */

  Views.health = function (main) {
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Health'), h('div', { class: 'sub' }, 'Automatic jobs, backups, sheet sizes and mail.'))));
    var box = h('div');
    main.appendChild(box);
    function load(withHistory) { loading(box); I.swr('health', { withHistory: !!withHistory }, draw).catch(function (e) { fail(box, e); }); }
    function job(label, j) {
      if (!j) return [label, 'never', ''];
      var res = Array.isArray(j.result) ? j.result.join(' · ') : j.results ? j.results.join(' · ') : JSON.stringify(j.result);
      return [label, j.atText || '', res];
    }
    function draw(x) {
      I.clear(box);
      box.appendChild(x.warnings.length ? h('div', { class: 'msg warn' }, h('b', null, 'Needs attention'), h('ul', null, x.warnings.map(function (w) { return h('li', null, w); })))
        : h('div', { class: 'msg ok' }, 'All automatic jobs are installed and the last backup is recent.'));
      var act = function (label, fn) {
        var b = h('button', { class: 'btn' }, label);
        b.addEventListener('click', function () { b.disabled = true; fn().then(function (r) { I.toast(r); load(); }).catch(function (e) { b.disabled = false; I.toast(I.errText(e), true); }); });
        return b;
      };
      box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Automatic jobs'),
        table(['Job', 'Last run', 'Result'], [job('Nightly (02:00): reports saved, archive, backup', x.jobs.nightly), job('Backup', x.jobs.backup),
          job('Daily mail (18:00)', x.jobs.daily), job('Weekly mail (Monday 09:00)', x.jobs.weekly), ['Mail sender (every 5 min)', x.jobs.mailCheck || 'not yet', '']]),
        h('p', { class: 'small muted' }, 'Installed: ' + x.triggers.join(', ')),
        h('div', { class: 'rowbtns' },
          act('Back up now', function () { return I.Api.call('backupNow', {}).then(function (r) { return r.copied + ' spreadsheets copied to ICC App Data / Backups / ' + r.day; }); }),
          act('Install jobs again', function () { return I.Api.call('installJobs', {}).then(function (r) { return r.triggers.length + ' jobs installed'; }); }))));
      box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Mail'),
        table(['', ''], [['Waiting in the queue', x.mail.queued], ['Failed', x.mail.failed], ['Gmail recipients left today', x.mail.remaining === null ? 'unknown' : x.mail.remaining]])));
      var sizes = h('div', { class: 'card' }, h('h2', null, 'Spreadsheet sizes'),
        h('p', { class: 'small muted' }, 'Google Sheets allows 10 million cells per spreadsheet. Discharged patients move to a yearly History spreadsheet after 30 days.'));
      x.files.forEach(function (f) {
        if (f.error) { sizes.appendChild(h('div', { class: 'msg err' }, f.label + ': ' + f.error)); return; }
        sizes.appendChild(h('details', null, h('summary', null, h('b', null, f.label), ' · ' + f.pctOfLimit + '% of the limit',
          h('span', { class: 'bar' }, h('i', { style: 'width:' + Math.min(100, Math.max(1, f.pctOfLimit)) + '%' }))),
        table(['Sheet', 'Rows'], f.sheets.map(function (s) { return [s.name, s.rows]; }))));
      });
      sizes.appendChild(h('button', { class: 'linkbtn', onclick: function () { load(true); } }, 'Include History spreadsheets'));
      box.appendChild(sizes);
      if (x.errors && x.errors.length) box.appendChild(h('div', { class: 'card' }, h('h2', null, 'Server errors'),
        h('p', { class: 'small muted' }, 'Unexpected errors of the last hours. Users see only the reference. Full details: Apps Script → Executions.'),
        table(['Reference', 'Time', 'Action', 'Error'], x.errors.map(function (e) { return [e.ref, e.at, e.action, e.msg]; }))));
      box.appendChild(h('p', { class: 'small muted' }, 'Server version ' + x.version + ' · checked ' + x.now + ' · ' + x.counts.patientsFast + ' patients in the fast table'));
    }
    load(false);
  };
})();
