/**
 * HIS Excel parsing in the browser (also loaded by the local test runner in Node).
 * - Detects each sheet's file type by its column headings (never by the title).
 * - Header row is searched in the first 10 rows (it is row 3 in the HIS exports).
 * - Reads at most MAX_ROWS rows (the HIS used range is ~1,000,000 empty rows).
 * - Stops at the first run of empty rows.
 * - Sends only the mapped columns, so unneeded data (DOB, MLC, bill amounts...) never leaves the device.
 * - Dates become epoch ms in IST whatever the device time zone is.
 */
(function (root) {
  var MAX_ROWS = 20000;
  var IST = 5.5 * 3600 * 1000;
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function key(h) { return String(h === null || h === undefined ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function blank(v) { return v === null || v === undefined || String(v).trim() === ''; }
  function ist(y, mo, d, h, mi, s) { return Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0) - IST; }

  /** Excel serial, Date or text -> epoch ms (IST). '' if unreadable. */
  function toMs(v) {
    if (blank(v)) return '';
    if (v instanceof Date) {
      // SheetJS builds Dates from the device clock; take the wall-clock parts as IST.
      return ist(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds());
    }
    if (typeof v === 'number') {
      if (v > 1e11) return v;
      if (v > 0 && v < 200000) return Math.round((v - 25569) * 86400000) - IST;
      return '';
    }
    var s = String(v).trim(), m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) return ist(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if ((m = s.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) return ist(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if ((m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[A-Za-z]*[- ](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)) && MON[m[2].toLowerCase()]) return ist(+m[3], MON[m[2].toLowerCase()], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
      var a = +m[1], b = +m[2];
      return ist(+m[3], a > 12 ? b : a, a > 12 ? a : b, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    return '';
  }

  /** Workbook bytes -> array of sheets as arrays of rows. */
  function readWorkbook(XLSX, data) {
    var wb = XLSX.read(data, { type: 'array', sheetRows: MAX_ROWS, cellDates: false, dense: true });
    return wb.SheetNames.map(function (name) {
      var aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: true });
      return { name: name, aoa: aoa };
    });
  }

  /** Find which HIS file a sheet is. Returns {fileType, headerRow} or null. */
  function detect(aoa, mapping) {
    var types = Object.keys(mapping);
    for (var r = 0; r < Math.min(10, aoa.length); r++) {
      var have = {};
      (aoa[r] || []).forEach(function (h) { have[key(h)] = true; });
      for (var i = 0; i < types.length; i++) {
        var sig = mapping[types[i]].signature || [];
        if (sig.length && sig.every(function (h) { return have[key(h)]; })) return { fileType: types[i], headerRow: r };
      }
    }
    return null;
  }

  /** Pull only mapped columns from a detected sheet. */
  function extract(aoa, headerRow, map, dateFields) {
    var header = aoa[headerRow].map(key);
    var fields = [], cols = [], missing = [];
    Object.keys(map.fields).forEach(function (f) {
      var col = -1;
      map.fields[f].some(function (h) { col = header.indexOf(key(h)); return col >= 0; });
      if (col >= 0) { fields.push(f); cols.push(col); } else missing.push(f);
    });
    var keyCol = cols[fields.indexOf('admn_no')];
    var rows = [], emptyRun = 0;
    for (var r = headerRow + 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var allEmpty = cols.every(function (c) { return blank(row[c]); });
      if (allEmpty) { if (++emptyRun >= 3) break; continue; }   // stop at the first empty rows
      emptyRun = 0;
      if (keyCol !== undefined && blank(row[keyCol])) continue;
      rows.push(cols.map(function (c, i) {
        var v = row[c];
        if (dateFields.indexOf(fields[i]) >= 0) return toMs(v);
        if (v === null || v === undefined) return '';
        return typeof v === 'number' ? v : String(v).trim();
      }));
    }
    // Row 2 holds the report date range, e.g. "25-Nov-2026 To 25-Nov-2026" (blank in the Discharge file).
    var meta = { missingFields: missing, rowCount: rows.length, dateFrom: '', dateTo: '' };
    for (var t = 0; t < headerRow; t++) {
      var txt = (aoa[t] || []).filter(function (v) { return !blank(v); }).join(' ');
      var mm = txt.match(/(\d{1,2}[- ][A-Za-z]{3}[A-Za-z]*[- ]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[-./]\d{1,2}[-./]\d{4})\s*To\s*(\d{1,2}[- ][A-Za-z]{3}[A-Za-z]*[- ]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[-./]\d{1,2}[-./]\d{4})/i);
      if (mm) { meta.dateFrom = toMs(mm[1]); meta.dateTo = toMs(mm[2]); }
    }
    return { fields: fields, rows: rows, meta: meta };
  }

  /** All HIS sheets found in one workbook (a production file has one; the sample has four). */
  function parseHis(XLSX, data, mapping, dateFields) {
    var out = [];
    readWorkbook(XLSX, data).forEach(function (sh) {
      var d = detect(sh.aoa, mapping);
      if (!d) return;
      var ex = extract(sh.aoa, d.headerRow, mapping[d.fileType], dateFields);
      out.push({ fileType: d.fileType, sheetName: sh.name, fields: ex.fields, rows: ex.rows, meta: ex.meta });
    });
    return out;
  }

  /** Bed master file: columns Ward Name, Room Name, Bed No. */
  function parseBeds(XLSX, data) {
    var sheets = readWorkbook(XLSX, data);
    for (var s = 0; s < sheets.length; s++) {
      var aoa = sheets[s].aoa;
      for (var r = 0; r < Math.min(10, aoa.length); r++) {
        var h = (aoa[r] || []).map(key);
        var w = h.indexOf('wardname'), rm = h.indexOf('roomname'), b = h.indexOf('bedno');
        if (w >= 0 && b >= 0) {
          var beds = [];
          for (var i = r + 1; i < aoa.length; i++) {
            var row = aoa[i] || [];
            if (blank(row[b])) continue;
            beds.push({ ward: String(row[w]).trim(), room: rm >= 0 ? String(row[rm]).trim() : '', bed_no: String(row[b]).trim() });
          }
          return beds;
        }
      }
    }
    throw new Error('No "Ward Name / Room Name / Bed No" columns found.');
  }

  var api = { parseHis: parseHis, parseBeds: parseBeds, toMs: toMs, detect: detect, extract: extract, readWorkbook: readWorkbook };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HisParse = api;
})(this);
