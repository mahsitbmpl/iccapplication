/**
 * Phase 3 screens: Complaints board, Send to HOD dialog, HOD page (private link, no login), Email settings.
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var Views = window.Views = window.Views || {};

  var LABEL = { waiting: 'No HOD email', sent: 'With HOD', action: 'Action given', closed: 'Closed' };
  var BADGE = { waiting: 'bad', sent: 'warn', action: 'info', closed: 'ok' };
  function badge(status) { return h('span', { class: 'badge ' + (BADGE[status] || 'grey') }, LABEL[status] || status); }
  function ago(ts) {
    var d = Math.floor((Date.now() - ts) / 86400000);
    return d <= 0 ? 'today' : d === 1 ? '1 day ago' : d + ' days ago';
  }
  Views._cmpLabel = LABEL;

  /* ---------- Send to HOD (from a negative feedback record) ---------- */

  Views._sendToHod = function (rec, patient, onDone) {
    var d = rec.data || {};
    var depts = S.boot.depts || [];
    var dept = h('select', null, h('option', { value: '' }, 'Choose…'));
    depts.forEach(function (x) { dept.appendChild(h('option', { value: x.name, selected: x.name === rec.dep ? 'selected' : null }, x.name)); });
    var issue = h('select', null, h('option', { value: '' }, '—'));
    function fillIssues() {
      var x = depts.filter(function (y) { return y.name === dept.value; })[0];
      I.clear(issue).appendChild(h('option', { value: '' }, '—'));
      ((x && x.issues) || []).forEach(function (t) { issue.appendChild(h('option', { value: t }, t)); });
    }
    dept.addEventListener('change', fillIssues); fillIssues();
    var text = d.feedback || d.review || d.details || '';
    if (rec.k === 'tablet') text = 'Tablet feedback score ' + d.score + (d.feedback ? ': ' + d.feedback : '');
    if (rec.k === 'discharge_call' && d.nps !== '' && d.nps !== undefined) text = 'Discharge call, NPS ' + d.nps + (text ? ': ' + text : '');
    var details = h('textarea', { rows: 4 }, text);
    var err = h('div');
    var body = h('div', { class: 'form' },
      h('p', { class: 'small muted', style: 'margin-top:0' }, 'The HOD gets a mail with a link to write the action taken. You will see it on the Complaints board.'),
      err,
      h('label', { class: 'f' }, h('span', null, 'Department'), dept),
      h('label', { class: 'f' }, h('span', null, 'Issue Type'), issue),
      h('label', { class: 'f' }, h('span', null, 'Complaint details'), details));
    I.modal('Send to HOD', body, [{ label: 'Cancel' }, { label: 'Send to HOD', primary: true, onClick: function () {
      if (!dept.value) { I.clear(err).appendChild(h('div', { class: 'msg err' }, 'Choose the department.')); return false; }
      return I.Api.call('sendToHod', { source: rec.id, admn_no: patient ? patient.admn_no : '', department: dept.value, issue: issue.value,
        details: details.value }).then(function (r) {
        if (r.patient) S.patients[r.patient.admn_no] = r.patient;
        I.toast(sentText(r.complaint));
        if (onDone) onDone(r);
        return true;
      }).catch(function (e) { I.clear(err).appendChild(h('div', { class: 'msg err' }, I.errText(e))); return false; });
    } }]);
  };

  function sentText(c) {
    return c.status === 'waiting' ? c.id + ' saved. ' + c.dept + ' has no HOD email yet: add it in Settings > Departments, then send it from the Complaints board.'
      : c.id + ' sent to ' + (c.hod || c.dept) + '.';
  }
  Views._cmpSentText = sentText;

  /* ---------- Complaints board ---------- */

  Views.complaints = function (main) {
    var tab = sessionStorage.getItem('icc.cmptab') || 'hod';
    var q = h('input', { type: 'search', placeholder: 'Search complaint no, patient, department, text…' });
    var deptF = h('select', null, h('option', { value: '' }, 'All departments'));
    var floorF = h('select', null, h('option', { value: '' }, 'All floors'));
    (S.boot.depts || []).forEach(function (d) { deptF.appendChild(h('option', { value: d.name }, d.name)); });
    (S.boot.settings.report_groups || []).forEach(function (g) { floorF.appendChild(h('option', { value: g.name }, g.name)); });
    var head = h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Complaints'), h('div', { class: 'sub', id: 'cmpsub' }, 'Loading…')));
    main.appendChild(head);
    var warn = h('div');
    var tabs = h('div', { class: 'tabs' });
    var box = h('div');
    main.appendChild(warn);
    main.appendChild(h('div', { class: 'card' }, h('div', { class: 'toolbar' }, q, deptF, floorF), tabs, box));
    var data = null;
    function load() {
      I.Api.call('complaintBoard').then(function (d) { data = d; draw(); })
        .catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    function draw() {
      if (I.route().page !== 'complaints') return;
      var list = data.complaints;
      var words = q.value.trim().toLowerCase().split(/\s+/).filter(String);
      var f = list.filter(function (c) {
        if (deptF.value && c.dept !== deptF.value) return false;
        if (floorF.value && c.floor !== floorF.value) return false;
        var hay = [c.id, c.name, c.admn, c.dept, c.issue, c.details, c.bed, c.floor, c.hod, c.action].join(' ').toLowerCase();
        return words.every(function (w) { return hay.indexOf(w) >= 0; });
      });
      var groups = {
        hod: f.filter(function (c) { return c.status === 'sent' || c.status === 'waiting'; }),
        check: f.filter(function (c) { return c.status === 'action'; }),
        closed: f.filter(function (c) { return c.status === 'closed'; })
      };
      var sub = document.getElementById('cmpsub');
      if (sub) sub.textContent = groups.hod.length + ' with HOD · ' + groups.check.length + ' with the HOD\'s action, to check and close · ' + groups.closed.length + ' closed in the last 30 days';
      I.clear(warn);
      var waiting = list.filter(function (c) { return c.status === 'waiting'; });
      if (waiting.length) warn.appendChild(h('div', { class: 'msg warn' }, waiting.length + ' complaint(s) not sent: no HOD email for ' +
        waiting.map(function (c) { return c.dept; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') +
        '. Add it in Settings > Departments, then open the complaint and press "Send mail".'));
      I.clear(tabs);
      [['hod', 'With HOD', groups.hod.length], ['check', 'To check', groups.check.length], ['closed', 'Closed', groups.closed.length]].forEach(function (t) {
        tabs.appendChild(h('button', { class: tab === t[0] ? 'on' : '', onclick: function () { tab = t[0]; sessionStorage.setItem('icc.cmptab', tab); draw(); } },
          t[1], ' ', h('span', { class: 'count' }, t[2])));
      });
      I.clear(box);
      var show = groups[tab];
      if (!show.length) { box.appendChild(h('p', { class: 'muted' }, tab === 'check' ? 'Nothing to check.' : 'No complaints here.')); return; }
      var ul = h('ul', { class: 'reclist cmplist' });
      show.forEach(function (c) {
        var sentBack = c.history.some(function (x) { return x.what === 'sent back'; });
        ul.appendChild(h('li', { tabindex: 0, onclick: function () { detail(c); } },
          h('div', { class: 'recmain' }, h('b', null, c.id), h('span', { class: 'rectext' }, c.dept + (c.issue ? ' · ' + c.issue : '')), badge(c.status),
            sentBack && c.status !== 'closed' ? h('span', { class: 'badge warn' }, 'Sent back') : null),
          h('div', { class: 'preline cmpdetails' }, c.status === 'action' ? 'Action: ' + c.action : c.details),
          h('div', { class: 'small muted' }, [c.floor, c.bed ? 'bed ' + c.bed : '', c.name].filter(String).join(' · ') + ' · raised ' + I.fmtDT(c.ts) +
            ' by ' + c.by + (c.status === 'closed' ? ' · closed ' + I.fmtDT(c.closedTs) : ' · ' + ago(c.ts)))));
      });
      box.appendChild(ul);
    }
    function detail(c) {
      var dl = h('dl', { class: 'recdl' });
      function row(k, v) { if (v === '' || v === undefined || v === null) return; dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', { class: 'preline' }, String(v))); }
      row('Status', LABEL[c.status]);
      row('Department', c.dept); row('Issue', c.issue); row('Complaint', c.details);
      row('Patient', [c.name, c.admn, c.bed ? 'bed ' + c.bed : ''].filter(String).join(' · '));
      row('Floor', c.floor);
      row('Raised', I.fmtDT(c.ts) + ' by ' + c.by + ' (' + ({ complaint: 'Complaint form', active_feedback: 'Active Feedback', discharge_call: 'Discharge call',
        google_review: 'Google review', tablet: 'Tablet feedback' }[c.src] || c.src) + ')');
      row('HOD', [c.hod, c.hodEmail].filter(String).join(' · ') || 'No HOD email');
      if (c.cc) row('Copy to', c.cc);
      row('Action taken', c.action ? c.action + '\n— ' + c.actionBy + ', ' + I.fmtDT(c.actionTs) : '');
      if (c.status === 'closed') row('Closed', I.fmtDT(c.closedTs) + ' by ' + c.closedBy + (c.closeRemark ? ': ' + c.closeRemark : ''));
      var hist = h('ul', { class: 'timeline' });
      c.history.slice().reverse().forEach(function (x) {
        hist.appendChild(h('li', null, h('div', { class: 'small muted' }, I.fmtDT(x.ts) + ' · ' + x.by), x.what + (x.note ? ': ' + x.note : '')));
      });
      var body = h('div', null, dl, h('h3', { class: 'small', style: 'margin:16px 0 4px' }, 'History'), hist);
      var acts = [{ label: 'Back' }];
      if (c.admn) acts.unshift({ label: 'Open patient', onClick: function () { I.go('patient/' + encodeURIComponent(c.admn)); return true; } });
      if (data.canClose && c.status !== 'closed') {
        acts.unshift({ label: 'More…', onClick: function () { more(c); return true; } });
        if (c.status === 'action') acts.push({ label: 'Send back', onClick: function () { ask(c, 'send_back', 'Send back to the HOD', 'Why is the action not enough?', true); return true; } });
        if (c.status === 'waiting') acts.push({ label: 'Send mail', primary: true, onClick: function () { doAct(c, 'resend', {}); return true; } });
        acts.push({ label: 'Close complaint', primary: c.status === 'action', onClick: function () {
          ask(c, 'close', 'Close ' + c.id, c.status === 'action' ? 'Closing remark (optional)' : 'The HOD has not answered. Closing remark (needed)', c.status !== 'action');
          return true;
        } });
      }
      I.modal(c.id + ' · ' + c.dept, body, acts).box.classList.add('wide');
    }
    function more(c) {
      var dept = h('select', null);
      (S.boot.depts || []).forEach(function (x) { dept.appendChild(h('option', { value: x.name, selected: x.name === c.dept ? 'selected' : null }, x.name)); });
      var issue = h('select', null);
      function fill() {
        var x = (S.boot.depts || []).filter(function (y) { return y.name === dept.value; })[0];
        I.clear(issue).appendChild(h('option', { value: '' }, '—'));
        ((x && x.issues) || []).forEach(function (t) { issue.appendChild(h('option', { value: t, selected: t === c.issue ? 'selected' : null }, t)); });
      }
      dept.addEventListener('change', fill); fill();
      I.modal(c.id + ': more actions', h('div', { class: 'form' },
        h('p', { class: 'small muted', style: 'margin-top:0' }, 'Move it to another department (its HOD gets a new mail), send the mail again, or cancel it.'),
        h('label', { class: 'f' }, h('span', null, 'Department'), dept), h('label', { class: 'f' }, h('span', null, 'Issue Type'), issue)), [
        { label: 'Back' },
        { label: 'Cancel complaint', danger: true, onClick: function () { ask(c, 'cancel', 'Cancel ' + c.id, 'Why is it cancelled? (for example: duplicate)', true); return true; } },
        { label: 'Send mail again', onClick: function () { doAct(c, 'resend', {}); return true; } },
        { label: 'Move', primary: true, onClick: function () {
          if (dept.value === c.dept) { I.toast('Choose another department to move it.', true); return false; }
          doAct(c, 'reroute', { department: dept.value, issue: issue.value }); return true;
        } }
      ]);
    }
    function ask(c, op, title, label, needed) {
      var ta = h('textarea', { rows: 3 });
      var err = h('div');
      I.modal(title, h('div', { class: 'form' }, err, h('label', { class: 'f' }, h('span', null, label), ta)), [
        { label: 'Back' },
        { label: op === 'close' ? 'Close complaint' : op === 'cancel' ? 'Cancel complaint' : 'Send back', primary: op !== 'cancel', danger: op === 'cancel', onClick: function () {
          if (needed && !ta.value.trim()) { I.clear(err).appendChild(h('div', { class: 'msg err' }, 'Please write it.')); return false; }
          return doAct(c, op, { remark: ta.value.trim(), reason: ta.value.trim() }).then(function (ok) { return ok; });
        } }
      ]);
    }
    function doAct(c, op, extra) {
      return I.Api.call('complaintAction', Object.assign({ cmp_id: c.id, op: op }, extra)).then(function (r) {
        I.toast({ close: 'Closed', cancel: 'Cancelled', send_back: 'Sent back to the HOD', resend: r.complaint.status === 'waiting' ? 'Still no HOD email' : 'Mail sent again',
          reroute: 'Moved to ' + r.complaint.dept }[op]);
        S.patients = {};
        load();
        return true;
      }).catch(function (e) { I.toast(I.errText(e), true); return false; });
    }
    q.addEventListener('input', function () { if (data) draw(); });
    deptF.addEventListener('change', function () { if (data) draw(); });
    floorF.addEventListener('change', function () { if (data) draw(); });
    I.clear(box).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading…'));
    load();
  };

  /* ---------- Email settings and mail log ---------- */

  Views.mail = function (main) {
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Email'),
      h('div', { class: 'sub' }, 'Complaint mails to HODs go through a queue and are sent every 5 minutes.'))));
    var box = h('div');
    main.appendChild(box);
    function load() {
      I.clear(box).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading…'));
      I.Api.call('mailLog').then(draw).catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    function draw(d) {
      I.clear(box);
      var s = d.settings;
      var en = h('input', { type: 'checkbox', checked: s.enabled });
      var name = h('input', { type: 'text', value: s.sender_name });
      var reply = h('input', { type: 'email', value: s.reply_to, placeholder: 'icc@…' });
      var copy = h('input', { type: 'text', value: s.icc_copy, placeholder: 'ICC team email(s), comma separated' });
      var dto = h('input', { type: 'text', value: s.daily_to || '', placeholder: 'emails, comma separated' });
      var wto = h('input', { type: 'text', value: s.weekly_to || '', placeholder: 'emails, comma separated' });
      var pd = h('select', null);
      [['name_ip_bed', 'Name, IP No and bed (no mobile)'], ['ip_bed', 'IP No and bed only'], ['name_ip_bed_mobile', 'Name, IP No, bed and mobile']].forEach(function (o) {
        pd.appendChild(h('option', { value: o[0], selected: o[0] === s.patient_details ? 'selected' : null }, o[1]));
      });
      var lim = h('input', { type: 'number', value: s.daily_limit, min: 0 });
      var dig = h('input', { type: 'number', value: s.digest_at, min: 0 });
      var res = h('input', { type: 'number', value: s.reserve, min: 0 });
      var url = h('input', { type: 'url', value: s.app_url, placeholder: 'https://…github.io/…/' });
      var save = h('button', { class: 'btn primary', onclick: function () {
        save.disabled = true;
        I.Api.call('saveMailSettings', { settings: { enabled: en.checked, sender_name: name.value, reply_to: reply.value, icc_copy: copy.value,
          patient_details: pd.value, daily_limit: lim.value, digest_at: dig.value, reserve: res.value, app_url: url.value,
          daily_to: dto.value, weekly_to: wto.value } })
          .then(function () { I.toast('Saved'); load(); }).catch(function (e) { save.disabled = false; I.toast(I.errText(e), true); });
      } }, 'Save');
      box.appendChild(h('div', { class: 'card form' }, h('h2', null, 'Settings'),
        h('label', { class: 'f check' }, en, ' Send mails'),
        h('div', { class: 'formgrid' },
          h('label', { class: 'f' }, h('span', null, 'Sender name'), name),
          h('label', { class: 'f' }, h('span', null, 'Reply-to email'), reply),
          h('label', { class: 'f wide' }, h('span', null, 'ICC copy on every complaint mail'), copy),
          h('label', { class: 'f wide' }, h('span', null, 'Patient details in complaint mails and on the HOD page'), pd),
          h('label', { class: 'f' }, h('span', null, 'Gmail recipients per day'), lim),
          h('label', { class: 'f' }, h('span', null, 'Combine complaint mails into an hourly digest from'), dig),
          h('label', { class: 'f' }, h('span', null, 'Keep for the daily report mails'), res),
          h('label', { class: 'f wide' }, h('span', null, 'App address used in the HOD links'), url),
          h('label', { class: 'f wide' }, h('span', null, 'Daily report mail at 6 PM to'), dto),
          h('label', { class: 'f wide' }, h('span', null, 'Weekly report mail on Monday 9 AM to'), wto)),
        h('p', { class: 'small muted' }, 'Other mails (daily and weekly reports, Phase 4) carry figures only, never patient names or mobile numbers.'),
        save));
      var to = h('input', { type: 'email', placeholder: 'your email' });
      var test = h('button', { class: 'btn', onclick: function () {
        test.disabled = true;
        I.Api.call('testMail', { to: to.value }).then(function (r) { I.toast(r.sent ? 'Test mail sent' : 'Queued: ' + JSON.stringify(r)); load(); })
          .catch(function (e) { test.disabled = false; I.toast(I.errText(e), true); });
      } }, 'Send test mail');
      var now = h('button', { class: 'btn', onclick: function () {
        now.disabled = true;
        I.Api.call('sendMailNow').then(function (r) { I.toast((r.sent || 0) + ' sent' + (r.waiting ? ', ' + r.waiting + ' waiting' : '')); load(); })
          .catch(function (e) { now.disabled = false; I.toast(I.errText(e), true); });
      } }, 'Send queued mails now');
      var tb = h('tbody');
      d.mails.forEach(function (m) {
        tb.appendChild(h('tr', null, h('td', { class: 'small' }, m.created), h('td', null, m.kind), h('td', { class: 'small' }, m.to + (m.cc ? ' (cc ' + m.cc + ')' : '')),
          h('td', null, m.subject), h('td', null, h('span', { class: 'badge ' + (m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'warn') }, m.status),
            m.error ? h('div', { class: 'small muted' }, m.error) : null)));
      });
      box.appendChild(h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h2', null, 'Mail log'),
        h('span', { class: 'badge grey' }, d.remaining === null ? 'quota unknown' : d.remaining + ' recipients left today')),
        h('div', { class: 'toolbar' }, to, test, now, h('button', { class: 'btn', onclick: function (e) {
          var b = e.currentTarget; b.disabled = true;
          I.Api.call('sendReportNow', { which: 'daily' }).then(function (r) { I.toast('Daily report: ' + r.result); load(); })
            .catch(function (x) { b.disabled = false; I.toast(I.errText(x), true); });
        } }, 'Send daily report now')),
        d.mails.length ? h('div', { class: 'tablewrap' }, h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', null, 'Queued'), h('th', null, 'Kind'),
          h('th', null, 'To'), h('th', null, 'Subject'), h('th', null, 'Status'))), tb)) : h('p', { class: 'muted' }, 'No mails yet.'),
        h('p', { class: 'small muted' }, 'Mails are removed from the log after 30 days.')));
    }
    load();
  };

  /* ---------- HOD page (opened from the mail, no login) ---------- */

  window.HodPage = {
    render: function (root, parts) {
      var req = { branchId: decodeURIComponent(parts[0] || ''), cmpId: decodeURIComponent(parts[1] || ''), token: parts[2] || '' };
      var box = h('div', { class: 'card hodcard' }, h('span', { class: 'spin' }), ' Loading…');
      I.clear(root).appendChild(h('div', { class: 'auth hod' }, window.App.logo(), box, window.App.footer()));
      function call(action, extra) { return I.Api.call(action, Object.assign({}, req, extra || {}), { branch: false, noAuth: true }); }
      function draw(v, msg) {
        I.clear(box);
        box.appendChild(h('div', { class: 'cardhead' }, h('h2', null, v.id), h('span', { class: 'badge ' + (v.closed ? 'ok' : v.status === 'action' ? 'info' : 'warn') },
          v.closed ? 'Closed by ICC' : v.status === 'action' ? 'Action sent' : 'Waiting for your action')));
        if (msg) box.appendChild(h('div', { class: 'msg ok' }, msg));
        var dl = h('dl', { class: 'recdl' });
        function row(k, val) { if (!val) return; dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', { class: 'preline' }, String(val))); }
        row('Date', v.date); row('Department', v.dept); row('Issue', v.issue); row('Floor', v.floor);
        row('Patient', [v.patient, v.ip ? 'IP ' + v.ip : '', v.bed ? 'bed ' + v.bed : '', v.mobile].filter(Boolean).join(' · '));
        row('Complaint', v.details); row('Raised by', v.raisedBy);
        v.sentBack.forEach(function (s) { row('Sent back ' + s.at, s.note); });
        box.appendChild(dl);
        if (v.closed) {
          box.appendChild(h('p', { class: 'muted' }, 'ICC closed this complaint on ' + v.closedAt + '. Thank you.'));
          if (v.action) box.appendChild(h('div', { class: 'msg' }, 'Your action: ' + v.action));
          return;
        }
        var ta = h('textarea', { rows: 5 }, v.action || '');
        var by = h('input', { type: 'text', value: v.actionBy || v.hod || '' });
        var err = h('div');
        var btn = h('button', { class: 'btn primary', type: 'submit' }, v.action ? 'Update action taken' : 'Send action taken');
        box.appendChild(h('form', { class: 'form', onsubmit: function (e) {
          e.preventDefault();
          btn.disabled = true; I.clear(err);
          call('hodAction', { text: ta.value, by: by.value }).then(function (nv) { draw(nv, 'Thank you. ICC has your action and will close the complaint after checking.'); })
            .catch(function (x) { btn.disabled = false; err.appendChild(h('div', { class: 'msg err' }, I.errText(x))); });
        } }, err,
          h('label', { class: 'f' }, h('span', null, 'Action taken'), ta),
          h('label', { class: 'f' }, h('span', null, 'Your name'), by), btn));
      }
      call('hodView').then(function (v) { draw(v); }).catch(function (e) {
        I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e)));
      });
    }
  };
})();
