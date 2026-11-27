/**
 * Phase 4: monthly Excel workbooks built in the browser (SheetJS), in today's layouts:
 *  D = Daily Report (Active Feedback, Bed Occupancy census, Bed Vacant)
 *  R = Daily Reporting (Summary + all ICC logs + collected / department-wise / totals)
 *  A = Floor Manager monthly (ICC Dashboard + logs + Inventory)
 * Sheet names and column headings are copied from the current workbooks.
 */
(function () {
  'use strict';
  var X = window.XlsxExport = {};
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function ist(ms) { return new Date(Number(ms) + 5.5 * 3600000); }
  function dmy(day) { return day ? day.slice(8, 10) + '-' + day.slice(5, 7) + '-' + day.slice(0, 4) : ''; }
  function dot(day) { return day.slice(8, 10) + '.' + day.slice(5, 7) + '.' + day.slice(0, 4); }
  function msDay(ms) { if (!ms) return ''; return ist(ms).toISOString().slice(0, 10); }
  function msDmy(ms) { return ms ? dmy(msDay(ms)) : ''; }
  function msTime(ms) { if (!ms) return ''; var d = ist(ms); return dmy(msDay(ms)) + ' ' + d.toISOString().slice(11, 16); }
  function monthYear(day) { return MON[Number(day.slice(5, 7)) - 1] + '-' + day.slice(0, 4); }
  function pad(n) { n = Number(n) || 0; return n < 10 ? '0' + n : String(n); }
  function ageSex(p) { if (!p) return ''; return [p.age, p.gender ? p.gender.charAt(0).toUpperCase() : ''].filter(String).join('/'); }

  /** A sheet from rows (array of arrays), with column widths and optional merges. */
  function sheet(rows, widths, merges) {
    var ws = window.XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = (widths || []).map(function (w) { return { wch: w }; });
    if (merges) ws['!merges'] = merges;
    return ws;
  }
  function add(wb, name, ws) { window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); }

  /** One log sheet: title row, heading row, then one row per record. */
  function log(title, head, list, fn, widths) {
    var rows = [[title], head];
    list.forEach(function (r, i) { rows.push([i + 1].concat(fn(r))); });
    return sheet(rows, widths || head.map(function (h) { return Math.min(40, Math.max(10, String(h).length + 2)); }));
  }

  /** Transposed sheet (PCC, Room upgradation): labels down column A, one column per record. */
  function transposed(title, labels, list, fn) {
    var rows = [[title].concat(list.map(function (r, i) { return 'Sr. ' + (i + 1); }))];
    labels.forEach(function (l, li) { rows.push([l].concat(list.map(function (r) { return fn(r)[li]; }))); });
    return sheet(rows, [42].concat(list.map(function () { return 30; })));
  }

  function prep(d) {
    var by = {};
    d.records.slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.ts - b.ts; }).forEach(function (r) {
      (by[r.k] = by[r.k] || []).push(r);
    });
    var hod = {};
    d.hods.forEach(function (x) { hod[x.name] = x.hod; });
    return {
      by: function (k) { return by[k] || []; },
      p: function (r) { return d.patients[r.admn] || null; },
      snap: function (r) { return (r.data && r.data.snap) || {}; },
      hod: function (dep) { return hod[dep] || ''; },
      days: d.days
    };
  }

  function nameOf(r) { return r.name || (r.data.manual ? r.data.manual.name : '') || r.data.reviewer || ''; }

  /* ---------- shared log layouts ---------- */

  function activeFeedback(c) {
    return log('Active Feedback', ['S.No.', 'Month and Year', 'Date', 'Room No/ Area', 'Admitting Dr', 'Feedback', 'Positive/Negative',
      'Department', 'Responsible HOD', 'Action Plan'], c.by('active_feedback'), function (r) {
      var s = c.snap(r);
      return [monthYear(r.d), dmy(r.d), r.admn ? s.bed : (r.floor + ' (on floor)'), s.consultant || '', r.data.feedback, r.st, r.dep, c.hod(r.dep), r.data.action_plan];
    }, [6, 12, 12, 14, 22, 60, 12, 22, 20, 40]);
  }

  function googleR(c) {
    return log('Google Reviews', ['Sr.No', 'Month& Year', 'Date', 'Pt Name', 'Comments', 'Type of feedback', 'Stars'], c.by('google_review'),
      function (r) { return [monthYear(r.d), dmy(r.d), r.data.reviewer || r.name, r.data.review, r.st, r.data.stars]; }, [6, 12, 12, 24, 60, 14, 8]);
  }

  function loyalty(c, title) {
    return log(title, ['S.No.', 'Floor', 'Date of Loyalty coupon given', 'Patient name', 'Admitting Dr', 'Reffereing Dr', 'Diagnosis', 'Total Amount',
      'Loyal Coupon given By', 'Remarks'], c.by('loyalty'), function (r) {
      var s = c.snap(r);
      return [r.floor, dmy(r.d), r.name, s.consultant, s.ref_doctor, r.data.diagnosis, r.data.total_amount, r.u, r.data.remarks];
    });
  }

  function video(c, title) {
    return log(title, ['Sr. No', 'Month', 'Date of Videofeedback Taken', 'Bed No.', 'IP No', 'Patient Name', 'Admitting Doctor', 'Reffered to/Referred by',
      'Primary Diagnosis', 'Floor Manager', 'Type of Payment', 'Remarks'], c.by('video_feedback'), function (r) {
      var s = c.snap(r);
      return [monthYear(r.d), dmy(r.d), s.bed, r.admn, r.name, s.consultant, s.ref_doctor, r.data.diagnosis, r.u, s.payment_cat, r.data.remarks];
    });
  }

  function campaign(c, title) {
    return log(title, ['S.No.', 'Floor', 'Month', 'Date of lead given', 'Patient name', 'IP No.', 'Admitting Doctor', 'Refferring Doctor', 'Type of Campaign',
      'Lead Given by', 'Lead given to whom'], c.by('lead_campaign'), function (r) {
      var s = c.snap(r);
      return [r.floor, monthYear(r.d), dmy(r.d), r.name, r.admn, s.consultant, s.ref_doctor, r.data.campaign, r.u, r.data.given_to];
    });
  }

  function homecare(c, title, withBy) {
    var head = ['S.No.', 'Floor', 'Month', 'Date of lead given', 'Patient name', 'IP No.', 'Admitting Doctor', 'Refferring Doctor', 'Type of service Required'];
    head = head.concat(withBy ? ['Lead given by', 'Lead given to whom'] : ['Lead given to whom']);
    return log(title, head, c.by('lead_homecare'), function (r) {
      var s = c.snap(r);
      var row = [r.floor, monthYear(r.d), dmy(r.d), r.name, r.admn, s.consultant, s.ref_doctor, r.data.service];
      return row.concat(withBy ? [r.u, r.data.given_to] : [r.data.given_to]);
    });
  }

  function training(c, title) {
    return log(title, ['S.No.', 'Floor', 'Month', 'Date of Training', 'Training subject', 'Training given by'], c.by('training'),
      function (r) { return [r.floor, monthYear(r.d), dmy(r.d), r.data.subject, r.data.given_by]; });
  }

  function damaDor(c) {
    return log('DAMA DOR', ['Sr No.', 'DOA', 'UHID No.', 'IPD No.', 'Patient Name', 'Consultant Name', 'Bed Details', 'Payment Mode', 'Diagnosis',
      'Counselling done by', 'DOD', 'DAMA/ DOR', 'Transfer to other hospital', 'Remarks'], c.by('dama_dor'), function (r) {
      var s = c.snap(r), p = c.p(r) || {};
      var stayed = r.data.outcome === 'Counselled and stayed';
      return [msDmy(p.admn_dt || s.admn_dt), r.umr, r.admn, r.name, s.consultant, s.bed + (s.ward ? ' (' + s.ward + ')' : ''), s.payment_cat, r.data.diagnosis,
        r.data.counselled_by, stayed ? '' : msDmy(p.dis_dt), r.data.type, r.data.destination,
        [r.data.reason, stayed ? 'Counselled and stayed' : '', r.data.remarks].filter(String).join(' · ')];
    });
  }

  function pcc(c) {
    var labels = ['Date', 'Patient Name', 'IP No', 'UMR No', 'Age/ Sex', 'Address', 'Area', 'A Type', 'Geography Tagging', 'Contact No', 'Occupation',
      'Next of Kin', 'Diagnosis', 'Treating Dr', 'Ref Dr', 'Pt Type', 'Special AC and above', 'Special Needs',
      'How can we deliver more than expected in this patient/ relatives', '>> 1', '>> 2', '>> 3', '>> 4', '>> 5', 'RMO POC', 'Billing POC',
      'TPA POC', 'Corporate POC', 'ICC person handling', 'Remarks by Med Admin/ Ops/ UH/ Consultant, etc'];
    return transposed('PCC', labels, c.by('pcc'), function (r) {
      var s = c.snap(r), p = c.p(r) || {}, d = r.data;
      return [dmy(r.d), r.name, r.admn, r.umr, ageSex(p), p.address, d.area, d.a_type, d.geo_tag, p.mobile, d.occupation, d.next_of_kin, d.diagnosis,
        s.consultant, s.ref_doctor, s.upgrade_type || s.payment_cat, s.ward_category, d.special_needs, d.deliver_more, d.action1, d.action2, d.action3,
        d.action4, d.action5, d.rmo_poc, d.billing_poc, d.tpa_poc, d.corporate_poc, r.u, d.remarks_admin];
    });
  }

  /* ---------- D: Daily Report ---------- */

  function census(c, settings) {
    var groups = settings.report_groups.map(function (g) { return g.name; });
    var days = c.days.filter(function (d) { return d && d.admissions; });
    var last = days[days.length - 1];
    var row = function (label, fn, mtd) { return [label].concat(days.map(fn)).concat([mtd || '']); };
    var cats = [['Cash', 'Cash'], ['Corporate Premium', 'Corporate Premium'], ['Corporate CGHS', 'Corporate CGHS'], ['SOCH', 'SOCH'],
      ['TPA Admissions', 'TPA'], ['Yojana', 'Yojana'], ['Clinical Research', 'Clinical Research']];
    var rows = [[], row('Date', function (d) { return dot(d.day); }, 'MTD'), [],
      row('Admission Details', function (d) { return pad(d.admissions.total); }, last ? last.lines.admissionRemark : '')];
    cats.forEach(function (ct) {
      var mtd = !last ? '' : ct[1] === 'Corporate CGHS' ? last.lines.cghsRemark : ct[1] === 'Yojana' ? last.lines.yojanaRemark : '';
      rows.push(row(ct[0], function (d) { return pad(d.admissions.cats[ct[1]]); }, mtd));
    });
    rows.push([]);
    rows.push(row('Bed Occupancy Report', function (d) { return pad(d.occupancy); }, ''));
    groups.forEach(function (g) {
      rows.push(row(g, function (d) { var x = d.lines.groups[g]; return x ? x.cell : ''; }, last && last.lines.groups[g] ? last.lines.groups[g].activity : ''));
    });
    return sheet(rows, [26].concat(days.map(function () { return 22; })).concat([90]));
  }

  function activityLines(c, settings) {
    var groups = settings.report_groups.map(function (g) { return g.name; });
    var rows = [['Activity line (one row per day and floor)'], ['Date', 'Floor', 'Census', 'Activity line']];
    c.days.forEach(function (d) {
      if (!d || !d.lines) return;
      groups.forEach(function (g) { var x = d.lines.groups[g]; if (x) rows.push([dmy(d.day), g, x.cell, x.activity]); });
    });
    return sheet(rows, [12, 14, 40, 140]);
  }

  function bedVacant(br, settings) {
    var head = 'Bed Ready List Date (' + (br.at ? msTime(br.at) : '') + ')';
    var rows = [['', head], ['', '', pad(br.total), 'Ready bed list', 'After discharge', 'Stay']];
    br.groups.forEach(function (g) {
      var list = function (a) { return a.length ? a.map(function (b) { return b.label; }).join('\n') : '0'; };
      rows.push(['', g.name, pad(g.stay), g.closed ? 'FLOOR CLOSED' : list(g.ready), g.closed ? 'FLOOR CLOSED' : list(g.after), pad(g.stay)]);
    });
    return sheet(rows, [2, 14, 8, 34, 34, 8], [{ s: { r: 0, c: 1 }, e: { r: 0, c: 5 } }]);
  }

  X.buildD = function (d) {
    var c = prep(d), wb = window.XLSX.utils.book_new();
    add(wb, 'Active Feedback', activeFeedback(c));
    add(wb, 'Bed Occupancy', census(c, d.settings));
    add(wb, 'Activity Line', activityLines(c, d.settings));
    add(wb, 'Bed Vacant', bedVacant(d.bedReady, d.settings));
    return wb;
  };

  /* ---------- R: Daily Reporting ---------- */

  function summarySheet(c) {
    var days = c.days.filter(function (d) { return d && d.summary; });
    var R = function (label, fn) { return [label].concat(days.map(function (d) { return fn ? fn(d.summary) : ''; })); };
    var rows = [[ 'Details' ].concat(days.map(function (d) { return dot(d.day); })), [],
      ['Active Feedback'], R('Total', function (s) { return s.active.total; }), R('Positive', function (s) { return s.active.pos; }),
      R('Negative', function (s) { return s.active.neg; }), R('Action taken Remarks'), [],
      ['Discharge FB'], R('Total', function (s) { return s.discharge.total; }), R('Positive', function (s) { return s.discharge.pos; }),
      R('Negative', function (s) { return s.discharge.neg; }), R('Others', function (s) { return s.discharge.others; }), [],
      ['Tablet FB'], R('Total', function (s) { return s.tablet.total; }), R('Positive', function (s) { return s.tablet.pos; }),
      R('Negative', function (s) { return s.tablet.neg; }), R('Remarks Action taken'), [],
      ['Night IPD &OPD '], R('Total', function (s) { return s.night.total; }), R('Positive', function (s) { return s.night.pos; }),
      R('Negative', function (s) { return s.night.neg; }), R('Remarks & Action Taken'), R('Others', function (s) { return s.night.others; }), [],
      ['Google Reviews'], R('Total', function (s) { return s.google.total; }), R('Positive', function (s) { return s.google.pos; }),
      R('Negative', function (s) { return s.google.neg; }), R('Remarks $ Action taken'), [],
      ['DAMA/ DOR'], R('Total ', function (s) { return s.dama.total; }), R('Avoidable Reason', function (s) { return s.dama.avoidable; }),
      R('Unavoidable Reasons', function (s) { return s.dama.unavoidable; }), R('Reason', function (s) { return s.dama.reasons.join('; '); }), [],
      ['LAMA'], R('Total ', function (s) { return s.lama.total; }), R('Avoidable Reason', function (s) { return s.lama.avoidable; }),
      R('Unavoidable Reasons', function (s) { return s.lama.unavoidable; }), [],
      ['108 Ambulance'], R('Total', function (s) { return s.ambulance.total; }), R('Remarks', function (s) { return s.ambulance.remarks; }), [],
      ['Care Coach'], R('Total ', function (s) { return s.careCoach.total; }), R('Today', function (s) { return s.careCoach.today; }),
      R('Tom Plan ', function (s) { return s.careCoach.tomorrow; }), [],
      R('Wow Moment', function (s) { return s.wow; }), R('Video Feedback', function (s) { return s.video; }),
      R('Succes Story Leads', function (s) { return s.success; }), R('Homecare Leads by ICC', function (s) { return s.homecare; }),
      R('Campaign Leads by ICC', function (s) { return s.campaign; }), R('Loyalty card', function (s) { return s.loyalty; }),
      R('DAMA/ DOR', function (s) { return s.damaCount; })];
    return sheet(rows, [26].concat(days.map(function () { return 11; })));
  }

  function dischargeFb(c) {
    return log('Discharge Feedback', ['S NO', 'DOA', 'UMR  NO', 'PATIENT NAME', 'Doctor Name', 'DOD', 'BED NO', 'ADDRESS', 'MOBILE', 'Feedback',
      'NPS (0-10)', 'Positive / Negative', 'Department', 'Action plan'], c.by('discharge_call').filter(function (r) { return r.data.final === 'Y'; }), function (r) {
      var s = c.snap(r), p = c.p(r) || {}, d = r.data;
      var fb = d.feedback || '';
      if (r.s === 'failed' || !fb) fb = [d.outcome, fb].filter(String).join(': ');
      return [msDmy(p.admn_dt || s.admn_dt), r.umr, r.name, s.consultant, msDmy(p.dis_dt || s.dis_dt), s.bed, p.address, p.mobile, fb, d.nps,
        r.st || 'Others', r.dep, d.action_plan];
    }, [6, 12, 16, 24, 20, 12, 8, 30, 14, 50, 8, 12, 20, 30]);
  }

  function nightIpd(c) {
    return log('Night IPD Feedback', ['Sr. No', 'Date of Calling', 'Night IPD Date', 'Patient Name', 'Age/ Sex', 'Dr. Name', 'REFERING DOCTER', 'Diagnosis',
      'Bed Number  ICU/Ward', 'In Time (Emergency)', 'Out Time (Ward)', 'Feedback', 'Floor Manager Update  by', 'Re Assesment (Ward)', 'Remark'],
    c.by('night_ipd'), function (r) {
      var s = c.snap(r), p = c.p(r), d = r.data;
      return [dmy(r.d), msDmy(s.admn_dt), r.name, ageSex(p || s), s.consultant, s.ref_doctor, d.diagnosis, s.bed, d.in_time, d.out_time, d.feedback, r.u, d.reassessment, d.remark];
    });
  }

  function nightOpd(c) {
    return log('Night OPD Feedbacks', ['Sr. No.', 'Calling Date', 'Night OPD Date', 'Patient Name', 'Age/ Sex', 'INFORMED  DR NAME', 'BILL AMOUNT', 'Diagnosis',
      'Bed Number  ICU/Ward', 'In Time (Emergency)', 'Out Time (ER)', 'LAMA/ OPD DISCHARGE', 'Feedback', 'FLOOR MANAGER', 'REMARKS', 'Contact No'],
    c.by('night_opd'), function (r) {
      var d = r.data, m = d.manual || {};
      return [dmy(r.d), dmy(d.visit_date), m.name, m.age_sex, d.informed_dr, d.bill_amount, d.diagnosis, d.bed_area, d.in_time, d.out_time, d.disposition,
        d.feedback, r.u, d.remarks, m.contact];
    });
  }

  function tabletSheet(d) {
    var labels = d.ratingLabels.map(function (x) { return x[1]; });
    var rows = [['Tablet Feedbacks'], ['Sr.No.', 'Patient Name', 'UHID No.', 'IPD No.', 'Age/Gender', 'Admission Date', 'Discharge Date', 'Date of Suggestion',
      'Suggestions/Feedback', 'Dr. Name', 'Phone Number'].concat(labels)];
    d.tablet.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (t, i) {
      rows.push([i + 1, t.name, t.umr, t.admn, t.age_gender, dmy(t.admn_day), dmy(t.dis_day), msTime(t.ts), t.feedback, t.doctor, '']
        .concat(d.ratingLabels.map(function (x) { return t.ratings[x[0]] || 0; })));
    });
    return sheet(rows, [6, 24, 16, 14, 10, 12, 12, 16, 40, 20, 8].concat(labels.map(function () { return 12; })));
  }

  function wowR(c) {
    return log('WoW Moment', ['S.No.', 'Month', 'Date of Wow Moment', 'Patient Name', 'Diagnosis', 'AdmittIng Dr Name', 'Reff Dr', 'Category', 'Contact No.',
      'WoW Moment Description', 'Remarks', 'Floor Manager'], c.by('wow'), function (r) {
      var s = c.snap(r), p = c.p(r) || {};
      return [monthYear(r.d), dmy(r.d), r.name, r.data.diagnosis, s.consultant, s.ref_doctor, s.ward_category, p.mobile, r.data.celebration + ': ' + r.data.description,
        r.data.remarks, r.u];
    });
  }

  function lama(c) {
    return log('LAMA Tracker', ['Sr.No', 'Date of Admission', 'Date of Discharge', 'IP No', 'Patient Name', 'Admitting Doctor/Consultation By', 'Contact no',
      'Diagnosis', 'Duty MO/Nurse', 'Counselling By', 'Reason', 'Hospitral Name', 'Department', 'Discharge Type', 'Floor Manager'], c.by('lama'), function (r) {
      var d = r.data, m = d.manual || {};
      return [dmy(d.admission_date), dmy(d.lama_date), m.uhid || r.admn, m.name || r.name, d.admitting_dr, m.contact, d.diagnosis, d.duty_mo, d.counselled_by,
        d.reason, d.followup, d.area, 'LAMA', r.u];
    });
  }

  function roomUp(c, forms) {
    var def = forms.filter(function (f) { return f.kind === 'room_upgrade'; })[0];
    var labels = ['DATE', 'UHID / IP NO', 'NAME OF PATIENT', 'ADMITTING DOCTOR'].concat(def.fields.map(function (f) { return f.l; })).concat(['ENTRY DONE BY']);
    return transposed('Room upgradation', labels, c.by('room_upgrade'), function (r) {
      var s = c.snap(r);
      return [dmy(r.d), r.umr + ' / ' + r.admn, r.name, s.consultant].concat(def.fields.map(function (f) { return r.data[f.k]; })).concat([r.u]);
    });
  }

  function collected(c, d) {
    var rows = [['Daily Active Feedback'], ['Sr. No', 'Type of  Feedback', 'Feedback', 'Positive/Negative ', 'Department', 'Responsible HOD']];
    var n = 0;
    var push = function (type, text, st, dep) { rows.push([++n, type, text, st || 'Others', dep || '', c.hod(dep)]); };
    c.by('active_feedback').forEach(function (r) { push('Active feedback', (r.name ? 'Pt ' + r.name + ': ' : '') + r.data.feedback, r.st, r.dep); });
    c.by('discharge_call').filter(function (r) { return r.data.final === 'Y'; }).forEach(function (r) { push('Discharge feedback', r.data.feedback || r.data.outcome, r.st, r.dep); });
    c.by('night_ipd').forEach(function (r) { push('Night IPD feedback', r.data.feedback, r.st, r.dep); });
    c.by('night_opd').forEach(function (r) { push('Night OPD feedback', r.data.feedback, r.st, r.dep); });
    c.by('google_review').forEach(function (r) { push('Google review', (r.data.stars ? r.data.stars + ' Star: ' : '') + r.data.review, r.st, r.dep); });
    d.tablet.forEach(function (t) { push('Tablet feedback', t.feedback || ('Score ' + t.score), t.sentiment, ''); });
    return sheet(rows, [6, 18, 80, 12, 22, 22]);
  }

  function deptWise(counts) {
    var rows = [[], ['', '', 'Sr. No.', 'Department-wise Complaints', 'Count']];
    counts.departments.forEach(function (d, i) {
      rows.push(['', '', i + 1, d.name, d.total]);
      d.issues.forEach(function (x) { rows.push(['', '', '', x.issue, x.count]); });
    });
    return sheet(rows, [2, 2, 8, 50, 8]);
  }

  function totals(counts, month) {
    var rows = [['', 'Sr. No', 'Department', 'Count']];
    counts.departments.forEach(function (d, i) { rows.push(['', i + 1, d.name, d.total]); });
    var right = [['Feedback ' + month], ['Type of feedback', 'Total', 'Poisitive', 'Negative', 'suggestion', 'others']];
    Object.keys(counts.feedbackTotals).forEach(function (k) {
      var t = counts.feedbackTotals[k];
      right.push([k, t.total, t.pos, t.neg, t.suggestion, t.others]);
    });
    var a = counts.feedbackAll;
    right.push(['Total Feedback', a.total, a.pos, a.neg, a.suggestion, a.others]);
    right.forEach(function (r, i) {
      var row = rows[i + 3] = rows[i + 3] || ['', '', '', ''];
      while (row.length < 8) row.push('');
      rows[i + 3] = row.slice(0, 8).concat(r);
    });
    return sheet(rows, [2, 8, 30, 8, 2, 2, 2, 2, 22, 8, 10, 10, 10, 8]);
  }

  X.buildR = function (d, forms) {
    var c = prep(d), wb = window.XLSX.utils.book_new();
    add(wb, 'Summary', summarySheet(c));
    add(wb, 'Active Feedback', activeFeedback(c));
    add(wb, 'Discharge Feedback', dischargeFb(c));
    add(wb, 'Night IPD Feedback', nightIpd(c));
    add(wb, 'Night OPD Feedbacks', nightOpd(c));
    add(wb, 'Tablet Feedbacks', tabletSheet(d));
    add(wb, 'Google Reviews', googleR(c));
    add(wb, 'Loyalty Card', loyalty(c, 'Loyalty Card'));
    add(wb, 'PCC', pcc(c));
    add(wb, 'WoW Moment', wowR(c));
    add(wb, 'Video Feedback', video(c, 'Video Feedback'));
    add(wb, 'Campaign Conversion', campaign(c, 'Campaign Conversion'));
    add(wb, 'Homecare lead', homecare(c, 'Homecare lead', true));
    add(wb, 'DAMA DOR', damaDor(c));
    add(wb, 'LAMA Tracker', lama(c));
    add(wb, 'Training Calendar', training(c, 'Training Calendar'));
    add(wb, 'Room upgradation ', roomUp(c, forms));
    add(wb, 'Colleted Sheet - ' + monthYear(d.from), collected(c, d));
    add(wb, 'DEPARTMENT WISE FEEDBACK', deptWise(d.counts));
    add(wb, 'Total feedback', totals(d.counts, monthYear(d.from)));
    return wb;
  };

  /* ---------- A: Floor Manager monthly ---------- */

  function dashboard(counts, month) {
    var x = counts.dashboard;
    var w = function (t) { return (x.wowTypes || {})[t] || 0; };
    var rows = [['ICC Dasboard'], ['S.No.', 'Measuring Component', 'Compliance '], ['', '', 'IP Count (Discharge)- ' + month],
      [1, 'Google Reviews', x.google], [2, 'PCC', x.pcc], [3, 'Wow Moments', x.wow],
      ['', '(a) New Born Celebration', w('New Born Celebration')], ['', '(b)  Birthday Celebration', w('Birthday Celebration')],
      ['', '(c) Wedding Anniversary Celebration', w('Wedding Anniversary Celebration')],
      ['', '(d) Critical Surgeries when gets Successful', w('Critical Surgeries when gets Successful')],
      ['', '(e) Last Chemo Celebration', w('Last Chemo Celebration')],
      [4, 'Loyalty cards distributed', x.loyalty], [5, 'Social media counts(video feedback)', x.video], [6, 'Homecare Conversion', x.homecare],
      [7, 'Campaign Conversion', x.campaign], [8, 'Training by FM', x.training], [9, 'DAMA', x.dama], [10, 'DOR', x.dor],
      [11, 'Any special activity (Like BLS, Special education etc)', x.special]];
    return sheet(rows, [6, 46, 22]);
  }

  function inventory(d) {
    var rows = [['Inventory ' + monthYear(d.from)]];
    var floors = {};
    d.inventory.forEach(function (r) { (floors[r.floor] = floors[r.floor] || []).push(r); });
    var order = d.settings.inventory_items || [];
    Object.keys(floors).forEach(function (f) {
      rows.push([]);
      rows.push([f]);
      rows.push(['S.No', 'PARTICULARS', 'OPENING', 'PATIENT USE', 'LAUNDRY', 'FLOOR STOCKS', 'CONDEMN', 'SEWING', 'TOTAL', 'DIFFERENCE', 'REMARKS', 'Indent']);
      floors[f].sort(function (a, b) { var i = order.indexOf(a.item), j = order.indexOf(b.item); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); })
        .forEach(function (r, i) {
          rows.push([i + 1, r.item, r.opening, r.patient_use, r.laundry, r.floor_stock, r.condemn, r.sewing, r.total, r.difference, r.remarks, r.indent]);
        });
    });
    if (!Object.keys(floors).length) rows.push(['No inventory saved for this month.']);
    return sheet(rows, [6, 30, 10, 12, 10, 12, 10, 10, 10, 12, 24, 12]);
  }

  X.buildA = function (d) {
    var c = prep(d), wb = window.XLSX.utils.book_new();
    add(wb, 'Summary', dashboard(d.counts, monthYear(d.from)));
    add(wb, 'Google Reviews', log('Google Reviews', ['S.No.', 'Floor', 'Month', 'Date of Google review', 'Google review', 'Positive/ Negative', 'Floor Manager', 'Stars'],
      c.by('google_review'), function (r) { return [r.floor, monthYear(r.d), dmy(r.d), r.data.review, r.st, r.u, r.data.stars]; }));
    add(wb, 'PCC', pcc(c));
    add(wb, 'Wow Moment', log('Wow Moment', ['S.No.', 'Floor', 'Date of Celebration', 'Type of Celebration', 'Patient Name', 'Dr. Name', 'Remarks'],
      c.by('wow'), function (r) { return [r.floor, dmy(r.d), r.data.celebration, r.name, c.snap(r).consultant, [r.data.description, r.data.remarks].filter(String).join(' · ')]; }));
    add(wb, 'Loyalty Cards Distributed', loyalty(c, 'Loyalty Cards Distributed'));
    add(wb, 'Video Feedbacks', video(c, 'Video Feedbacks'));
    add(wb, 'Homecare leads', homecare(c, 'Homecare leads', false));
    add(wb, 'Campaign conversion', campaign(c, 'Campaign conversion'));
    add(wb, 'Training', training(c, 'Training'));
    add(wb, 'DAMA DOR', damaDor(c));
    add(wb, 'Special activity done on floor', log('Special activity done on floor', ['S.No.', 'Floor', 'Month', 'Date', 'Description of special activity', 'Floor manager'],
      c.by('special_activity'), function (r) { return [r.floor, monthYear(r.d), dmy(r.d), r.data.description, r.u]; }));
    add(wb, 'Inventory', inventory(d));
    return wb;
  };

  X.fileName = function (which, d, branchName) {
    var m = monthYear(d.from);
    var names = { D: 'Daily Report', R: 'Daily Reporting', A: 'Floor Manager Monthly' };
    return 'MAHS ICC ' + names[which] + ' ' + m + (branchName ? ' - ' + branchName : '') + '.xlsx';
  };
})();
