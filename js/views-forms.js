/**
 * Phase 2 screens: the ICC forms (drawn from the server's form list), the patient card
 * sections, the discharge-call pool, the General area, inventory and the Manager pending list.
 */
(function () {
  'use strict';
  var I = window.ICC, h = I.h, S = I.State;
  var Views = window.Views = window.Views || {};

  var SECTION_ORDER = ['active_feedback', 'google_review', 'discharge_call', 'night_ipd', 'complaint', 'dama_dor', 'room_upgrade', 'wow',
    'video_feedback', 'loyalty', 'lead_homecare', 'lead_campaign', 'lead_success', 'pcc', 'tablet'];
  var GENERAL_KINDS = ['google_review', 'active_feedback', 'complaint', 'night_opd', 'lama', 'lead_success', 'training',
    'special_activity', 'ambulance_108', 'care_coach'];

  function forms() { return (S.boot && S.boot.forms) || { forms: [], manual: [] }; }
  function formDef(kind) { return forms().forms.filter(function (f) { return f.kind === kind; })[0]; }
  function label(kind) { if (kind === 'tablet') return 'Tablet Feedback'; var d = formDef(kind); return d ? d.label : kind; }
  function today() { return dayKeyOf(Date.now()); }
  function dayKeyOf(ms) { var d = new Date(ms + 5.5 * 3600000); return d.toISOString().slice(0, 10); }
  function fmtDay(d) { return d ? d.slice(8, 10) + '-' + d.slice(5, 7) + '-' + d.slice(0, 4) : ''; }
  function me() { return S.profile.user; }
  function isManager() { return !!(S.boot && S.boot.manager); }
  function canChange(rec) { return isManager() || rec.uid === me().user_id || (!rec.uid && rec.u === (me().display_name || me().username)); }
  function settings() { return S.boot.settings; }
  function groups() { return (settings().report_groups || []).map(function (g) { return g.name; }); }

  /** One short line from a record's values. */
  function summary(kind, data) {
    if (kind === 'tablet') return 'Score ' + data.score + (data.feedback ? ' · ' + data.feedback : '');
    var def = formDef(kind);
    if (!def) return '';
    var parts = [];
    def.fields.some(function (f) {
      var v = data[f.k];
      if (v === '' || v === undefined || v === null) return false;
      if (['area', 'text', 'combo', 'sel', 'reason', 'dept', 'num', 'nps'].indexOf(f.t) >= 0) parts.push(f.t === 'nps' ? 'NPS ' + v : String(v));
      return parts.length >= 2;
    });
    return parts.join(' · ');
  }

  function stBadge(rec) {
    var out = [];
    if (rec.st) out.push(h('span', { class: 'badge ' + (rec.st === 'Positive' ? 'ok' : 'bad') }, rec.st));
    var s = rec.s;
    if (rec.k === 'complaint' && s === 'open') out.push(h('span', { class: 'badge warn' }, 'Open'));
    if (rec.k === 'dama_dor') {
      if (s === 'open') out.push(h('span', { class: 'badge warn' }, 'Not discharged yet'));
      if (s === 'closed') out.push(h('span', { class: 'badge grey' }, 'Discharged' + (rec.dod ? ' ' + rec.dod : '')));
      if (s === 'stayed') out.push(h('span', { class: 'badge ok' }, 'Counselled and stayed'));
    }
    if (rec.k === 'discharge_call') {
      var d = rec.data || {};
      out.push(h('span', { class: 'badge grey' }, 'Try ' + (d.attempt || 1)));
      if (s === 'retry') out.push(h('span', { class: 'badge warn' }, 'Try again'));
      if (s === 'failed') out.push(h('span', { class: 'badge grey' }, 'Not reached'));
    }
    return out;
  }

  /* ================= FORM DRAWING ================= */

  /**
   * Draw a form. opts: {def, values, snap (patient values), floor, needFloor, manual, day}
   * Returns {el, read()} where read() returns {data, floor, day, manual} or throws a message.
   */
  function buildForm(opts) {
    var def = opts.def, vals = opts.values || {}, snap = opts.snap || {};
    var picks = settings().pick_lists || {};
    var wrap = h('div', { class: 'form' });
    var inputs = {}, extra = {};
    var depts = S.boot.depts || [];

    function fieldLabel(f, req) { return h('span', null, f.l, req ? h('i', { class: 'req', 'aria-hidden': 'true' }, ' *') : null); }
    function initial(f) {
      if (vals[f.k] !== undefined && vals[f.k] !== '') return vals[f.k];
      if (f.auto && snap[f.auto] !== undefined && snap[f.auto] !== '') return snap[f.auto];
      if (f.t === 'staff') return me().display_name || me().username;
      return f.def !== undefined ? f.def : '';
    }
    function seg(options, cur, cls) {
      var box = h('div', { class: 'seg ' + (cls || '') });
      var state = { value: cur || '' };
      options.forEach(function (o) {
        var b = h('button', { type: 'button', class: o === state.value ? 'on' : '', 'aria-pressed': o === state.value ? 'true' : 'false', onclick: function () {
          state.value = state.value === o ? '' : o;
          Array.prototype.forEach.call(box.children, function (c) { c.className = c.textContent === state.value ? 'on' : ''; c.setAttribute('aria-pressed', c.textContent === state.value); });
          if (state.onchange) state.onchange(state.value);
        } }, o);
        box.appendChild(b);
      });
      box._state = state;
      return box;
    }
    function datalist(id, list) {
      var dl = h('datalist', { id: id });
      (list || []).forEach(function (v) { dl.appendChild(h('option', { value: v })); });
      return dl;
    }

    // Date of the record
    var dayIn = h('input', { type: 'date', value: opts.day || today(), max: today() });
    var top = h('div', { class: 'formtop' }, h('label', { class: 'f' }, h('span', null, def.scope === 'day' ? 'Date' : 'Date'), dayIn));
    var floorSel = null;
    if (opts.needFloor) {
      floorSel = h('select', null, h('option', { value: '' }, 'Choose floor…'));
      groups().forEach(function (g) { floorSel.appendChild(h('option', { value: g, selected: g === opts.floor ? 'selected' : null }, g)); });
      top.appendChild(h('label', { class: 'f' }, fieldLabel({ l: 'Floor' }, def.scope !== 'manual'), floorSel));
    }
    wrap.appendChild(top);

    // Manual (not in HIS) patient
    var manualIn = null;
    if (def.scope === 'manual') {
      manualIn = {};
      var mv = opts.manual || {};
      var mbox = h('fieldset', { class: 'manual' }, h('legend', null, 'Patient (not from HIS)'));
      forms().manual.forEach(function (f) {
        var inp = h('input', { type: 'text', value: mv[f.k] || '', autocomplete: 'off' });
        if (f.k === 'contact') inp.setAttribute('inputmode', 'tel');
        manualIn[f.k] = inp;
        mbox.appendChild(h('label', { class: 'f' }, fieldLabel(f, f.req), inp));
      });
      var hint = h('div', { class: 'small muted' }, 'Type a UHID seen before to fill the name and mobile.');
      mbox.appendChild(hint);
      manualIn.uhid.addEventListener('change', function () {
        var u = manualIn.uhid.value.trim().toUpperCase();
        if (!u) return;
        var o = I.indexObjects().filter(function (x) { return String(x.umr_no).toUpperCase() === u; })[0];
        if (o) {
          if (!manualIn.name.value) manualIn.name.value = o.name;
          if (!manualIn.contact.value) manualIn.contact.value = o.mobile;
          hint.textContent = 'Filled from ' + o.admn_no + ' (' + o.name + ').';
        } else hint.textContent = 'UHID not found on this device. Type the details.';
      });
      wrap.appendChild(mbox);
    }

    var grid = h('div', { class: 'formgrid' });
    def.fields.forEach(function (f) {
      var req = f.req || def.allReq;
      var cur = initial(f);
      var el, field = h('label', { class: 'f' + (f.t === 'area' ? ' wide' : '') });
      if (f.t === 'area') el = h('textarea', { rows: 3 }, String(cur));
      else if (f.t === 'num') el = h('input', { type: 'text', inputmode: 'decimal', value: cur });
      else if (f.t === 'date') el = h('input', { type: 'date', value: cur, max: today() });
      else if (f.t === 'time') el = h('input', { type: 'time', value: cur });
      else if (f.t === 'yn') { el = seg(['YES', 'NO'], String(cur).toUpperCase()); field = h('div', { class: 'f' }); }
      else if (f.t === 'pn') { el = seg(['Positive', 'Negative'], cur, 'pn'); field = h('div', { class: 'f' }); }
      else if (f.t === 'nps') {
        el = seg(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], cur === '' ? '' : String(cur), 'nps');
        field = h('div', { class: 'f wide' });
      } else if (f.t === 'sel' || f.t === 'reason') {
        var opts2 = f.opts || (f.pick ? picks[f.pick] || [] : (settings()[f.list] || []).map(function (o) { return typeof o === 'string' ? o : o.text; }));
        el = h('select', null, h('option', { value: '' }, 'Choose…'));
        (f.t === 'reason' ? settings()[f.list] || [] : opts2.map(function (o) { return { text: o }; })).forEach(function (o) {
          el.appendChild(h('option', { value: o.text, selected: o.text === cur ? 'selected' : null }, o.text + (o.avoidable ? '  (avoidable)' : '')));
        });
      } else if (f.t === 'dept') {
        el = h('select', null, h('option', { value: '' }, '—'));
        depts.forEach(function (d) { el.appendChild(h('option', { value: d.name, selected: d.name === cur ? 'selected' : null }, d.name)); });
      } else if (f.t === 'issue') {
        el = h('select', null, h('option', { value: '' }, '—'));
        el._cur = cur;
      } else if (f.t === 'combo' || f.t === 'staff') {
        var id = 'dl-' + def.kind + '-' + f.k;
        el = h('input', { type: 'text', value: cur, list: id, autocomplete: 'off' });
        field.appendChild(datalist(id, f.t === 'combo' ? picks[f.list] : []));
      } else el = h('input', { type: 'text', value: cur });
      inputs[f.k] = { f: f, el: el };
      field.insertBefore(fieldLabel(f, req), field.firstChild);
      field.appendChild(el);
      grid.appendChild(field);
    });
    wrap.appendChild(grid);

    // Issue types follow the chosen department; department suggested from the words of the feedback.
    var deptIn = inputs.department, issueIn = inputs.issue;
    function fillIssues() {
      if (!issueIn) return;
      var d = depts.filter(function (x) { return x.name === deptIn.el.value; })[0];
      var keep = issueIn.el.value || issueIn.el._cur;
      I.clear(issueIn.el).appendChild(h('option', { value: '' }, '—'));
      ((d && d.issues) || []).forEach(function (t) { issueIn.el.appendChild(h('option', { value: t, selected: t === keep ? 'selected' : null }, t)); });
    }
    if (deptIn) {
      deptIn.el.addEventListener('change', function () { deptIn.el._manual = true; fillIssues(); });
      fillIssues();
      var textIn = inputs.feedback || inputs.details;
      if (textIn) textIn.el.addEventListener('input', function () {
        if (deptIn.el._manual || (vals.department && deptIn.el.value)) return;
        var hit = suggestDept(textIn.el.value);
        if (hit && deptIn.el.value !== hit) { deptIn.el.value = hit; fillIssues(); }
      });
    }
    // NPS sets Positive/Negative (7 and above is positive by default)
    if (inputs.nps && inputs.sentiment) {
      var min = Number((settings().nps_rule || {}).positive_min || 7);
      inputs.nps.el._state.onchange = function (v) {
        if (v === '') return;
        var want = Number(v) >= min ? 'Positive' : 'Negative';
        Array.prototype.forEach.call(inputs.sentiment.el.children, function (c) { if (c.textContent === want && inputs.sentiment.el._state.value !== want) c.click(); });
      };
    }

    function read() {
      var data = {};
      Object.keys(inputs).forEach(function (k) {
        var x = inputs[k];
        data[k] = x.el._state ? x.el._state.value : String(x.el.value).trim();
        if ((x.f.req || def.allReq) && data[k] === '') throw x.f.l + ' is required.';
      });
      var out = { data: data, day: dayIn.value || today() };
      if (floorSel) {
        out.floor = floorSel.value;
        if (!out.floor && def.scope !== 'manual') throw 'Choose the floor.';
      }
      if (manualIn) {
        out.manual = {};
        Object.keys(manualIn).forEach(function (k) { out.manual[k] = manualIn[k].value.trim(); });
        if (!out.manual.name) throw 'Patient name is required.';
      }
      return out;
    }
    return { el: wrap, read: read, inputs: inputs };
  }

  function suggestDept(text) {
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    var hit = '';
    (S.boot.depts || []).some(function (d) {
      return String(d.keywords || '').split(',').some(function (k) {
        k = k.trim();
        if (!k) return false;
        var re = new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)');
        if (re.test(t)) { hit = d.name; return true; }
        return false;
      });
    });
    return hit;
  }

  /**
   * Open a form in a dialog.
   * o: {kind, patient (card) | null, rec (existing record), floor, prefill, onSaved(d)}
   */
  function openForm(o) {
    var def = formDef(o.kind);
    if (!def) return;
    var rec = o.rec;
    var p = o.patient;
    var needFloor = !p && def.scope !== 'day';
    var form = buildForm({ def: def, values: Object.assign({}, o.prefill || {}, rec ? rec.data : {}), snap: p ? p.snap : (rec && rec.data.snap) || {},
      needFloor: needFloor, floor: rec ? rec.floor : o.floor, manual: rec ? rec.data.manual : null, day: rec ? rec.d : '' });
    var body = h('div', null);
    if (p) body.appendChild(h('div', { class: 'formpt' }, h('b', null, p.name), ' · bed ' + (p.fields.bed.value || '—') + ' · IP ' + p.admn_no));
    var err = h('div');
    body.appendChild(err);
    body.appendChild(form.el);
    var m = I.modal((rec ? 'Change ' : '') + def.label, body, [
      { label: 'Cancel' },
      { label: rec ? 'Save changes' : 'Save', primary: true, onClick: function () {
        var v;
        try { v = form.read(); } catch (msg) { I.clear(err).appendChild(h('div', { class: 'msg err' }, String(msg))); return false; }
        var btns = m.box.querySelectorAll('.actions .btn');
        Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
        return I.Api.call('saveActivity', { kind: def.kind, act_id: rec ? rec.id : '', admn_no: p ? p.admn_no : '', day: v.day,
          floor: v.floor, data: v.data, manual: v.manual }).then(function (d) {
          if (d.picks) S.boot.settings.pick_lists = d.picks;
          if (d.patient) { S.patients[d.patient.admn_no] = d.patient; }
          I.toast(rec ? 'Changes saved' : 'Saved');
          if (o.onSaved) o.onSaved(d);
          return true;
        }).catch(function (e) {
          Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
          I.clear(err).appendChild(h('div', { class: 'msg err' }, I.errText(e)));
          return false;
        });
      } }
    ]);
    m.box.classList.add('wide');
    // Phones: no keyboard popping up on open. Larger screens: start at the first field, not the date.
    setTimeout(function () {
      if (window.innerWidth < 720) { if (document.activeElement) document.activeElement.blur(); return; }
      var first = m.box.querySelector('.formgrid input, .formgrid select, .formgrid textarea, fieldset.manual input');
      if (first) first.focus();
    }, 60);
  }

  function removeRecord(rec, onDone) {
    var reason = h('input', { type: 'text', placeholder: 'For example: entered twice' });
    var err = h('div');
    I.modal('Remove ' + label(rec.k) + '?', h('div', null, h('p', null, 'The record stays in the audit trail as removed.'), err,
      h('label', { class: 'f' }, h('span', null, 'Reason'), reason)), [
      { label: 'Cancel' },
      { label: 'Remove', danger: true, onClick: function () {
        if (!reason.value.trim()) { I.clear(err).appendChild(h('div', { class: 'msg err' }, 'Give a reason.')); return false; }
        return I.Api.call('voidActivity', { act_id: rec.id, reason: reason.value.trim() }).then(function (d) {
          if (d.patient) S.patients[d.patient.admn_no] = d.patient;
          I.toast('Removed');
          if (onDone) onDone(d);
          return true;
        }).catch(function (e) { I.clear(err).appendChild(h('div', { class: 'msg err' }, I.errText(e))); return false; });
      } }
    ]);
  }

  /** Record details as a definition list (for a tap on a record). */
  function showRecord(rec, onChange, patient) {
    var def = rec.k === 'tablet' ? null : formDef(rec.k);
    var dl = h('dl', { class: 'recdl' });
    function row(k, v) { if (v === '' || v === undefined || v === null) return; dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', { class: 'preline' }, String(v))); }
    row('Date', fmtDay(rec.d));
    row('By', rec.u);
    if (rec.floor) row('Floor', rec.floor);
    if (rec.data && rec.data.manual) { row('Patient', rec.data.manual.name); row('UHID', rec.data.manual.uhid); row('Age/ Sex', rec.data.manual.age_sex); row('Contact', rec.data.manual.contact); }
    if (def) def.fields.forEach(function (f) { row(f.l, rec.data[f.k]); });
    if (rec.k === 'tablet') {
      row('Score', rec.data.score);
      row('Feedback', rec.data.feedback);
      var labels = { diet: 'Dietitian / Food', radiology: 'Radiology / Lab', coordination: 'Floor Manager coordination', rights: 'Rights explained',
        overall: 'Overall satisfaction', recommend: 'Would recommend', security: 'Security / Attendant', icu_ot: 'ICU / OT', cleanliness: 'Cleanliness / Linen',
        pharmacy: 'Pharmacy', admission: 'Admission process', doctor: 'In-house doctor', nursing: 'Nursing care', discharge_tpa: 'Discharge / TPA', diet2: 'Dietician / Food (2)' };
      Object.keys(rec.data.ratings || {}).forEach(function (k) { row(labels[k] || k, rec.data.ratings[k] || 'not rated'); });
    }
    if (rec.ub) row('Last changed by', rec.ub + ' · ' + I.fmtDT(rec.ua));
    var acts = [{ label: 'Close' }];
    var editable = def && rec.k !== 'discharge_call' && canChange(rec) && !(patient && patient.fromHistory);
    if (editable) {
      acts.unshift({ label: 'Remove', danger: true, onClick: function () { removeRecord(rec, onChange); return true; } });
      acts.push({ label: 'Change', primary: true, onClick: function () { openForm({ kind: rec.k, rec: rec, patient: patient, onSaved: onChange }); return true; } });
    }
    I.modal(label(rec.k), dl, acts);
  }

  /* ================= PATIENT CARD SECTIONS ================= */

  /** Drawn by the patient card (views-main.js). */
  Views._sections = function (p, onChange) {
    var card = h('div', { class: 'card' }, h('h2', null, 'ICC records'));
    var hist = !!p.fromHistory;
    var acts = (p.acts || []).slice().sort(function (a, b) { return b.ts - a.ts; });
    // Add buttons for the forms this user may fill for this patient.
    var add = h('div', { class: 'addbar' });
    SECTION_ORDER.forEach(function (k) {
      if (k === 'tablet') return;
      if (k === 'discharge_call') {
        if (p.status === 'DISCHARGED' && I.can('discharge_calls') && !hist) add.appendChild(h('button', { class: 'chip add', onclick: function () { callDialog(p.admn_no, p, onChange); } }, I.icon('phone', 14), 'Discharge call'));
        return;
      }
      var def = formDef(k);
      if (!def || !I.can(def.perm) || hist) return;
      if (k === 'dama_dor' && p.status !== 'IN') return;
      add.appendChild(h('button', { class: 'chip add', onclick: function () { openForm({ kind: k, patient: p, onSaved: onChange }); } }, '+ ' + def.label));
    });
    if (add.children.length) card.appendChild(add);
    if (!acts.length) card.appendChild(h('p', { class: 'muted small' }, hist ? 'No ICC records.' : 'No ICC records yet. Use the buttons above to add one.'));
    var byKind = {};
    acts.forEach(function (a) { (byKind[a.k] = byKind[a.k] || []).push(a); });
    SECTION_ORDER.forEach(function (k) {
      if (!byKind[k]) return;
      var ul = h('ul', { class: 'reclist' });
      byKind[k].forEach(function (a) {
        ul.appendChild(h('li', { onclick: function () { showRecord(a, onChange, p); }, tabindex: 0 },
          h('div', { class: 'recmain' }, h('span', { class: 'rectext' }, summary(k, a.data || {}) || label(k)), stBadge(a)),
          h('div', { class: 'small muted' }, fmtDay(a.d) + ' · ' + a.u + (a.dep ? ' · ' + a.dep : ''))));
      });
      card.appendChild(h('div', { class: 'recsec' }, h('h3', null, label(k), h('span', { class: 'count' }, byKind[k].length)), ul));
    });
    return card;
  };

  /** Room Upgradation from a transfer line of the timeline: "628 (WARD A) → 427 (WARD B)". */
  Views._upgradeFromHop = function (p, text, onChange) {
    var m = String(text).match(/^(\S+) \((.*?)\) → (\S+) \((.*?)\)/);
    if (!m) return null;
    if (!I.can('room_upgrade') || p.status !== 'IN' || p.fromHistory) return null;
    var cats = (settings().pick_lists || {}).room_categories || [];
    function cat(ward) {
      var w = ward.toLowerCase().replace(/[^a-z]/g, '');
      var best = '';
      cats.forEach(function (c) { var k = c.toLowerCase().replace(/[^a-z]/g, ''); if (k && w.indexOf(k) >= 0 && k.length > best.length) best = c; });
      return best;
    }
    return h('button', { class: 'linkbtn small', onclick: function (e) {
      e.stopPropagation();
      openForm({ kind: 'room_upgrade', patient: p, onSaved: onChange,
        prefill: { actual_room: m[1], actual_category: cat(m[2]), upgraded_room: m[3], upgraded_category: cat(m[4]) } });
    } }, 'Room upgradation for this move');
  };

  /* ================= DISCHARGE CALLS ================= */

  function callDialog(admn, patient, onDone) {
    var def = formDef('discharge_call');
    var body = h('div', null, h('span', { class: 'spin' }));
    var form = null, err = h('div'), altUsed = { v: false };
    var m = I.modal('Discharge call', body, [
      { label: 'Cancel' },
      { label: 'Save result', primary: true, onClick: function () {
        if (!form) return false;
        var v;
        try { v = form.read(); } catch (msg) { I.clear(err).appendChild(h('div', { class: 'msg err' }, String(msg))); return false; }
        v.data.alt = altUsed.v;
        return I.Api.call('callAction', { admn_no: admn, op: 'result', data: v.data }).then(function (d) {
          if (d.patient) S.patients[admn] = d.patient;
          I.toast(d.call.status === 'open' ? 'Saved. Will come back tomorrow (try ' + d.call.attempts + ').' : 'Call saved');
          if (onDone) onDone(d);
          return true;
        }).catch(function (e) { I.clear(err).appendChild(h('div', { class: 'msg err' }, I.errText(e))); return false; });
      } }
    ]);
    m.box.classList.add('wide');
    var load = patient && patient.snap ? Promise.resolve(patient) : I.Api.call('getPatient', { admn_no: admn });
    load.then(function (p) {
      S.patients[admn] = p;
      I.clear(body);
      var tel = String(p.mobile || '').replace(/[^\d+]/g, '');
      var alt = String(p.alt_contact || '');
      var altTel = (alt.match(/\+?\d[\d\s-]{8,}\d/) || [''])[0].replace(/[^\d+]/g, '');
      body.appendChild(h('div', { class: 'callhead' },
        h('div', null, h('b', null, p.name), h('div', { class: 'small muted' }, 'IP ' + p.admn_no + ' · discharged ' + p.dis_dt_f +
          (p.fields.discharge_type.value ? ' · ' + p.fields.discharge_type.value : '') + ' · ' + (p.fields.consultant.value || ''))),
        h('div', { class: 'callbtns' },
          tel.length >= 10 ? h('a', { class: 'btn primary', href: 'tel:' + tel }, I.icon('phone', 16), 'Call ' + p.mobile) : h('span', { class: 'muted small' }, 'No mobile in HIS'),
          altTel.length >= 10 ? h('a', { class: 'btn', href: 'tel:' + altTel, onclick: function () { altUsed.v = true; } }, I.icon('phone', 16), 'Alternate') : null),
        alt ? h('div', { class: 'small muted' }, 'Alternate contact: ' + alt) : null));
      body.appendChild(err);
      form = buildForm({ def: def, snap: p.snap });
      form.el.querySelector('.formtop').style.display = 'none';
      body.appendChild(form.el);
    }).catch(function (e) { I.clear(body).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
  }

  Views.calls = function (main) {
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Discharge calls'),
      h('div', { class: 'sub', id: 'callsub' }, 'Loading…'))));
    var box = h('div');
    main.appendChild(box);
    var filter = sessionStorage.getItem('icc.callf') || 'mine';
    function load() {
      return I.Api.call('callPool').then(function (d) { if (I.route().page === 'calls') draw(d); })
        .catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    function draw(d) {
      I.clear(box);
      var mine = d.open.filter(function (x) { return x.assignedTo === d.me; });
      var free = d.open.filter(function (x) { return !x.assignedTo; });
      var sub = document.getElementById('callsub');
      if (sub) sub.textContent = d.open.length + ' to call · ' + d.done.length + ' done today' + (d.later ? ' · ' + d.later + ' tomorrow' : '') + ' · discharged in the last ' + d.poolDays + ' days';
      if (d.canManage) box.appendChild(dutyCard(d, load));
      var chips = h('div', { class: 'chips' });
      [['mine', 'My calls (' + mine.length + ')'], ['free', 'Not taken (' + free.length + ')'], ['all', 'All open (' + d.open.length + ')'], ['done', 'Done today (' + d.done.length + ')']].forEach(function (c) {
        chips.appendChild(h('button', { class: 'chip' + (filter === c[0] ? ' on' : ''), onclick: function () { filter = c[0]; sessionStorage.setItem('icc.callf', filter); draw(d); } }, c[1]));
      });
      var list = filter === 'mine' ? mine : filter === 'free' ? free : filter === 'done' ? d.done : d.open;
      var ul = h('ul', { class: 'list calllist' });
      list.forEach(function (x) { ul.appendChild(callRow(x, d, load)); });
      box.appendChild(h('div', { class: 'card' }, chips, list.length ? ul : h('p', { class: 'muted' },
        filter === 'mine' ? 'No calls taken by you. Take one from "Not taken".' : 'Nothing here.')));
    }
    load();
  };

  function callRow(x, d, reload) {
    var tel = String(x.mobile || '').replace(/[^\d+]/g, '');
    var done = x.status === 'done' || x.status === 'failed';
    var right = h('div', { class: 'rowbtns' });
    if (!done) {
      if (!x.assignedTo) right.appendChild(h('button', { class: 'btn small', onclick: function (e) { e.stopPropagation(); act(x.admn, 'take', reload); } }, 'Take'));
      else if (x.assignedTo === d.me) {
        if (tel.length >= 10) right.appendChild(h('a', { class: 'btn small primary', href: 'tel:' + tel, onclick: function (e) { e.stopPropagation(); } }, I.icon('phone', 14), 'Call'));
        right.appendChild(h('button', { class: 'btn small', onclick: function (e) { e.stopPropagation(); callDialog(x.admn, null, reload); } }, 'Result'));
      } else if (d.canManage) right.appendChild(h('button', { class: 'btn small', onclick: function (e) { e.stopPropagation(); act(x.admn, 'take', reload); } }, 'Take over'));
    }
    return h('li', { onclick: function () { I.go('patient/' + encodeURIComponent(x.admn)); } }, h('div', { class: 'pt-row' },
      h('span', { class: 'bed' }, x.bed || '—'),
      h('div', null, h('div', { class: 'nm' }, x.name),
        h('div', { class: 'small muted' }, 'Discharged ' + I.fmtDT(x.dis) + (x.dtype ? ' · ' + x.dtype : '') + (x.dept ? ' · ' + x.dept : '')),
        h('div', { class: 'small' },
          x.attempts ? h('span', { class: 'badge warn' }, 'Tried ' + x.attempts + '× · ' + x.lastOutcome) : null,
          x.assignedName && x.assignedTo !== d.me ? h('span', { class: 'badge grey' }, 'With ' + x.assignedName) : null,
          done ? h('span', { class: 'badge ' + (x.sentiment === 'Positive' ? 'ok' : x.sentiment === 'Negative' ? 'bad' : 'grey') },
            (x.status === 'failed' ? 'Not reached' : x.sentiment || 'Done') + (x.nps !== '' && x.nps !== undefined ? ' · NPS ' + x.nps : '') + ' · ' + x.doneBy) : null)),
      right));
  }

  function act(admn, op, reload) {
    I.Api.call('callAction', { admn_no: admn, op: op }).then(function () { I.toast(op === 'take' ? 'Taken' : 'Released'); reload(); })
      .catch(function (e) { I.toast(I.errText(e), true); reload(); });
  }

  function dutyCard(d, reload) {
    var on = {};
    d.duty.users.forEach(function (u) { on[u.id] = true; });
    var list = h('div', { class: 'chips' });
    d.staff.forEach(function (s) {
      var cb = h('input', { type: 'checkbox', checked: on[s.id] });
      list.appendChild(h('label', { class: 'chip check' }, cb, s.name));
      cb.addEventListener('change', function () { on[s.id] = cb.checked; });
    });
    var save = h('button', { class: 'btn small', onclick: function () {
      save.disabled = true;
      I.Api.call('setCallDuty', { users: Object.keys(on).filter(function (k) { return on[k]; }) }).then(function () { I.toast('Duty saved'); reload(); })
        .catch(function (e) { save.disabled = false; I.toast(I.errText(e), true); });
    } }, 'Save duty');
    var share = h('button', { class: 'btn small primary', onclick: function () {
      share.disabled = true;
      I.Api.call('distributeCalls').then(function (r) {
        I.toast(r.given + ' calls shared: ' + r.perPerson.map(function (x) { return x.name + ' ' + x.calls; }).join(', '));
        reload();
      }).catch(function (e) { share.disabled = false; I.toast(I.errText(e), true); });
    } }, 'Share out the calls not taken');
    return h('details', { class: 'card', open: d.duty.users.length ? null : 'open' },
      h('summary', null, h('b', null, 'On call duty today'), ' ', h('span', { class: 'muted small' },
        d.duty.users.length ? d.duty.users.map(function (u) { return u.name; }).join(', ') : 'nobody ticked yet')),
      h('p', { class: 'small muted' }, 'Tick who is making calls today, save, then share out the calls nobody has taken.'),
      list, h('div', { class: 'rowbtns' }, save, share));
  }

  /* ================= GENERAL AREA ================= */

  Views.general = function (main, arg) {
    var kinds = GENERAL_KINDS.filter(function (k) { var d = formDef(k); return d && I.can(d.perm); });
    var kind = kinds.indexOf(arg) >= 0 ? arg : (sessionStorage.getItem('icc.genk') && kinds.indexOf(sessionStorage.getItem('icc.genk')) >= 0 ? sessionStorage.getItem('icc.genk') : kinds[0]);
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'General'),
      h('div', { class: 'sub' }, 'Records without a patient from HIS: on-floor feedback, Google reviews, Night OPD, LAMA, training and daily counts'))));
    if (!kinds.length) { main.appendChild(h('div', { class: 'msg' }, 'You have no ticks for these records.')); return; }
    var tabs = h('div', { class: 'tabs scroll' });
    kinds.forEach(function (k) {
      tabs.appendChild(h('button', { class: k === kind ? 'on' : '', onclick: function () { sessionStorage.setItem('icc.genk', k); I.go('general/' + k); } }, label(k)));
    });
    main.appendChild(tabs);
    var def = formDef(kind);
    var from = h('input', { type: 'date', value: today(), max: today() });
    var to = h('input', { type: 'date', value: today(), max: today() });
    var listBox = h('div');
    var addBtn = h('button', { class: 'btn primary', onclick: function () { openForm({ kind: kind, onSaved: load }); } }, '+ Add ' + def.label);
    main.appendChild(h('div', { class: 'card' },
      h('div', { class: 'toolbar' }, addBtn, h('span', { class: 'spacer' }),
        h('label', { class: 'f inline' }, h('span', null, 'From'), from), h('label', { class: 'f inline' }, h('span', null, 'To'), to)),
      listBox));
    from.addEventListener('change', load); to.addEventListener('change', load);
    function load() {
      I.clear(listBox).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading…'));
      I.Api.call('listActivities', { from: from.value, to: to.value, kinds: [kind] }).then(function (d) {
        I.clear(listBox);
        var recs = d.records;
        if (!recs.length) { listBox.appendChild(h('p', { class: 'muted' }, 'No ' + def.label + ' records for these dates.')); return; }
        var ul = h('ul', { class: 'reclist' });
        recs.forEach(function (r) {
          var who = r.data && r.data.manual ? r.data.manual.name + (r.data.manual.uhid ? ' (' + r.data.manual.uhid + ')' : '')
            : r.admn ? r.name + ' (' + r.admn + ')' : '';
          ul.appendChild(h('li', { tabindex: 0, onclick: function () { if (r.admn) I.go('patient/' + encodeURIComponent(r.admn)); else showRecord(r, load); } },
            h('div', { class: 'recmain' }, h('span', { class: 'rectext' }, (who ? who + ' · ' : '') + (summary(kind, r.data) || def.label)), stBadge(r),
              r.manual ? h('span', { class: 'badge warn' }, 'Not from HIS') : null),
            h('div', { class: 'small muted' }, fmtDay(r.d) + (r.floor ? ' · ' + r.floor : '') + ' · ' + r.u)));
        });
        listBox.appendChild(ul);
      }).catch(function (e) { I.clear(listBox).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    load();
  };

  /* ================= INVENTORY ================= */

  Views.inventory = function (main) {
    var month = h('input', { type: 'month', value: today().slice(0, 7), max: today().slice(0, 7) });
    var floor = h('select');
    groups().forEach(function (g) { floor.appendChild(h('option', { value: g }, g)); });
    var saved = sessionStorage.getItem('icc.invfloor');
    if (saved) floor.value = saved;
    var box = h('div');
    var info = h('span', { class: 'small muted' });
    var saveBtn = h('button', { class: 'btn primary', disabled: true }, 'Save inventory');
    main.appendChild(h('div', { class: 'pagehead' }, h('div', null, h('h1', null, 'Inventory'),
      h('div', { class: 'sub' }, 'Monthly count per floor. TOTAL and DIFFERENCE are worked out for you.'))));
    main.appendChild(h('div', { class: 'card' }, h('div', { class: 'toolbar' },
      h('label', { class: 'f inline' }, h('span', null, 'Month'), month), h('label', { class: 'f inline' }, h('span', null, 'Floor'), floor),
      h('span', { class: 'spacer' }), info, saveBtn), box));
    var rows = [];
    var COLS = [['opening', 'OPENING'], ['patient_use', 'PATIENT USE'], ['laundry', 'LAUNDRY'], ['floor_stock', 'FLOOR STOCKS'],
      ['condemn', 'CONDEMN'], ['sewing', 'SEWING']];
    function calc(r) {
      var n = function (k) { return Number(r[k]) || 0; };
      var total = n('patient_use') + n('laundry') + n('floor_stock') + n('condemn') + n('sewing');
      return { total: total, difference: n('opening') - total };
    }
    function load() {
      sessionStorage.setItem('icc.invfloor', floor.value);
      saveBtn.disabled = true;
      I.clear(box).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Loading…'));
      I.Api.call('getInventory', { month: month.value, floor: floor.value }).then(function (d) {
        rows = d.rows;
        info.textContent = d.saved ? 'Saved ' + d.updatedAt + ' by ' + d.updatedBy : 'Not saved yet' + (rows.some(function (r) { return r.opening !== ''; }) ? ' · opening taken from last month' : '');
        draw();
        saveBtn.disabled = false;
      }).catch(function (e) { I.clear(box).appendChild(h('div', { class: 'msg err' }, I.errText(e))); });
    }
    function draw() {
      var tb = h('tbody');
      rows.forEach(function (r, i) {
        var tot = h('td', { class: 'num' }), dif = h('td', { class: 'num' });
        function upd() { var c = calc(r); tot.textContent = c.total; dif.textContent = c.difference; dif.className = 'num' + (c.difference < 0 ? ' neg' : ''); }
        var tr = h('tr', null, h('td', { class: 'num muted' }, i + 1), h('th', { scope: 'row' }, r.item));
        COLS.forEach(function (c) {
          var inp = h('input', { type: 'text', inputmode: 'numeric', value: r[c[0]], 'aria-label': r.item + ' ' + c[1] });
          inp.addEventListener('input', function () { r[c[0]] = inp.value.replace(/[^\d]/g, ''); if (inp.value !== r[c[0]]) inp.value = r[c[0]]; upd(); });
          tr.appendChild(h('td', null, inp));
        });
        tr.appendChild(tot); tr.appendChild(dif);
        ['remarks', 'indent'].forEach(function (k) {
          var inp = h('input', { type: 'text', value: r[k], 'aria-label': r.item + ' ' + k });
          inp.addEventListener('input', function () { r[k] = inp.value; });
          tr.appendChild(h('td', null, inp));
        });
        upd();
        tb.appendChild(tr);
      });
      var head = h('tr', null, h('th', null, 'Sr.No'), h('th', null, 'PARTICULARS'));
      COLS.forEach(function (c) { head.appendChild(h('th', null, c[1])); });
      ['TOTAL', 'DIFFERENCE', 'REMARKS', 'Indent'].forEach(function (c) { head.appendChild(h('th', null, c)); });
      I.clear(box).appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'invgrid' }, h('thead', null, head), tb)));
    }
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true;
      I.Api.call('saveInventory', { month: month.value, floor: floor.value, rows: rows }).then(function (d) {
        info.textContent = 'Saved ' + d.updatedAt + ' by ' + d.updatedBy;
        I.toast('Inventory saved');
        saveBtn.disabled = false;
      }).catch(function (e) { saveBtn.disabled = false; I.toast(I.errText(e), true); });
    });
    month.addEventListener('change', load); floor.addEventListener('change', load);
    load();
  };

  /* ================= MANAGER PENDING (on Home) ================= */

  Views._pendingCard = function () {
    if (!isManager()) return null;
    var card = h('div', { class: 'card', style: 'display:none' });
    I.Api.call('pendingList').then(function (d) {
      if (!d.dama.length) return;
      card.style.display = '';
      card.appendChild(h('h2', null, 'Pending: DAMA/DOR still in house', h('span', { class: 'count' }, d.dama.length)));
      card.appendChild(h('p', { class: 'small muted' }, 'Marked DAMA/DOR more than ' + d.damaDays + ' days ago and HIS still shows the patient in house.'));
      var ul = h('ul', { class: 'reclist' });
      d.dama.forEach(function (a) {
        ul.appendChild(h('li', { tabindex: 0, onclick: function () { I.go('patient/' + encodeURIComponent(a.admn)); } },
          h('div', { class: 'recmain' }, h('span', { class: 'rectext' }, a.name + ' · bed ' + (a.bed || '—')), h('span', { class: 'badge warn' }, a.daysOpen + ' days')),
          h('div', { class: 'small muted' }, (a.data.type || '') + ' · ' + (a.data.reason || '') + ' · marked ' + fmtDay(a.d) + ' by ' + a.u)));
      });
      card.appendChild(ul);
    }).catch(function () {});
    return card;
  };

  /* ================= TABLET FEEDBACK UPLOAD (on the Upload screen) ================= */

  Views._tabletCard = function () {
    if (!I.can('upload')) return null;
    var st = (S.boot.uploads && S.boot.uploads.tablet) || null;
    var status = h('span', { class: 'slotpill ' + (st ? 'done' : '') }, st ? 'Uploaded ' + st.at + ' by ' + st.by : 'Not uploaded today');
    var input = h('input', { type: 'file', accept: '.csv,.txt,.xls,.xlsx', class: 'visually-hidden', id: 'tabfile' });
    var out = h('div');
    var card = h('div', { class: 'card' }, h('div', { class: 'cardhead' }, h('h2', null, 'Tablet Feedback'), h('span', { class: 'badge grey' }, 'Optional'), status),
      h('p', { class: 'small muted' }, 'Export "Feedback Patientwise" from the tablet software and choose the file. Rows already uploaded are skipped, so the whole month can be uploaded every day. The phone number column is not read.'),
      h('label', { class: 'btn', for: 'tabfile' }, I.icon('file', 16), 'Choose tablet file'), input, out);
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      I.clear(out).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Reading ' + file.name + '…'));
      file.arrayBuffer().then(function (buf) {
        var parsed = window.HisParse.parseTablet(window.XLSX, new Uint8Array(buf));
        if (!parsed.rows.length) throw new Error('The file has no feedback rows.');
        I.clear(out).appendChild(h('div', { class: 'muted' }, h('span', { class: 'spin' }), ' Uploading ' + parsed.rows.length + ' rows…'));
        return I.Api.call('uploadTablet', { fileName: file.name, rows: parsed.rows }).then(function (d) {
          var s = d.summary;
          I.clear(out).appendChild(h('div', { class: 'msg ok' }, s.new + ' new feedback rows saved (' + s.duplicates + ' already there). ' +
            s.positive + ' positive, ' + s.negative + ' negative. ' + s.matched + ' linked to patient cards' +
            (s.notInRegistry ? ', ' + s.notInRegistry + ' not in the patient list (older or not uploaded from HIS)' : '') + '.' +
            (parsed.meta.missing.length ? ' Columns not found: ' + parsed.meta.missing.join(', ') + '.' : '')));
          status.className = 'slotpill done';
          status.textContent = 'Uploaded just now';
          if (S.boot.uploads) S.boot.uploads.tablet = { at: 'just now', by: me().username, new: s.new };
          if (s.matched) { S.patients = {}; window.App.dataChanged(); }
        });
      }).catch(function (e) { I.clear(out).appendChild(h('div', { class: 'msg err' }, I.errText(e))); })
        .then(function () { input.value = ''; });
    });
    return card;
  };
})();
