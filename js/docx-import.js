/* ระบบเสนอและสรุปโครงการ — read a Word file (.docx) and fill the form from it.
   Recognises the school's proposal form and summary report, including the files this system
   exports. No libraries (ZIP + WordprocessingML read here); loaded on demand by app.js. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ ZIP
  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function readZip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('not-zip');
    const entries = new Map();
    let p = dv.getUint32(eocd + 16, true);
    for (let n = dv.getUint16(eocd + 10, true); n > 0 && dv.getUint32(p, true) === 0x02014b50; n--) {
      const nameLen = dv.getUint16(p + 28, true);
      entries.set(dec.decode(u8.subarray(p + 46, p + 46 + nameLen)),
        { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), local: dv.getUint32(p + 42, true) });
      p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    }
    return {
      async read(name) {
        const e = entries.get(name);
        if (!e) return null;
        const start = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
        const data = u8.subarray(start, start + e.size);
        if (e.method === 0) return data.slice();
        if (e.method === 8) return inflateRaw(data);
        throw new Error('zip-method');
      },
      async text(name) { const d = await this.read(name); return d && dec.decode(d); }
    };
  }

  // ------------------------------------------------------------------ WordprocessingML → items
  const NS = {
    w: ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main'],
    mc: ['http://schemas.openxmlformats.org/markup-compatibility/2006'],
    r: ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'],
    a: ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'],
    wp: ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing'],
    v: ['urn:schemas-microsoft-com:vml']
  };
  const is = (el, ns, name) => el.localName === name && NS[ns].includes(el.namespaceURI);
  const attr = (el, ns, name) => {
    for (const u of NS[ns]) { const v = el.getAttributeNS(u, name); if (v) return v; }
    return '';
  };
  // Wingdings / Wingdings 2 code points used for check boxes and check marks
  const SYM = {
    'wingdings': { 0xFC: '✓', 0xFB: '✗', 0xFD: '☒', 0xFE: '☑', 0xA8: '☐', 0x6F: '☐', 0x71: '☐', 0x78: '☒' },
    'wingdings 2': { 0x50: '✓', 0x51: '✗', 0x52: '☑', 0x53: '☒', 0x54: '☒', 0xA3: '☐', 0x2A: '☐' }
  };
  function symChar(el) {
    const font = attr(el, 'w', 'font').toLowerCase(), code = parseInt(attr(el, 'w', 'char'), 16) & 0xFF;
    if (SYM[font]) return SYM[font][code] || '';
    return font.includes('wingdings') ? (SYM['wingdings'][code] || SYM['wingdings 2'][code] || '') : '';
  }

  function walk(node, ctx) {
    for (const el of node.children) {
      if (is(el, 'mc', 'Fallback')) continue; // duplicate of mc:Choice (e.g. text boxes)
      if (is(el, 'w', 'pPr') || is(el, 'w', 'rPr') || is(el, 'w', 'instrText') || is(el, 'w', 'delText') || is(el, 'w', 'del')) continue;
      if (is(el, 'w', 'txbxContent')) { ctx.boxes.push(el); continue; }
      if (is(el, 'w', 't')) ctx.out.push(el.textContent);
      else if (is(el, 'w', 'tab') || is(el, 'w', 'ptab')) ctx.out.push('\t');
      else if (is(el, 'w', 'br') || is(el, 'w', 'cr')) ctx.out.push('\n');
      else if (is(el, 'w', 'sym')) ctx.out.push(symChar(el));
      else if (is(el, 'w', 'noBreakHyphen')) ctx.out.push('-');
      else if (is(el, 'wp', 'docPr')) {
        // check boxes exported by this system are images described as ☑ / ☐ / ✓
        const d = (el.getAttribute('descr') || el.getAttribute('title') || '').trim();
        if (/^[☑☐✓☒]$/.test(d)) ctx.out.push(d);
      } else if (is(el, 'a', 'blip')) { const id = attr(el, 'r', 'embed'); if (id) ctx.images.push(id); }
      else if (is(el, 'v', 'imagedata')) { const id = attr(el, 'r', 'id'); if (id) ctx.images.push(id); }
      else walk(el, ctx);
    }
  }

  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
  const arabic = s => s.replace(/[๐-๙]/g, d => String(THAI_DIGITS.indexOf(d)));
  function clean(t) {
    return t
      .replace(/([ก-๛])\t{2,}(?=[ก-๛])/g, '$1') // tabs used to push Thai words to the next line
      .replace(/[\s ​]+/g, ' ')
      .replace(/\(\s*[xX/✔√]\s*\)/g, '(✓)')
      .trim();
  }
  // t: the text as written; k: the same with Arabic digits, used for matching (same length, so indexes line up)
  const para = (raw, images) => { const t = clean(raw); return { kind: 'p', t, k: arabic(t), images }; };

  function addParagraph(p, items) {
    const ctx = { out: [], boxes: [], images: [] };
    walk(p, ctx);
    // a soft line break starts a new line (cover lines, signatures); free text re-joins them in texts()
    ctx.out.join('').split('\n').forEach((line, i) => items.push(Object.assign(para(line, i ? [] : ctx.images), i ? { cont: true } : {})));
    for (const box of ctx.boxes) bodyItems(box, items); // text-box paragraphs follow their anchor
  }
  function tableItem(tbl) {
    const rows = [], images = [];
    for (const tr of tbl.children) {
      if (!is(tr, 'w', 'tr')) continue;
      const row = [];
      for (const tc of tr.children) {
        if (!is(tc, 'w', 'tc')) continue;
        const sub = [];
        bodyItems(tc, sub);
        const paras = [];
        sub.forEach(it => {
          images.push(...it.images);
          if (it.kind === 'p') paras.push(it.t);
          else it.rows.forEach(r => r.forEach(c => paras.push(...c.paras))); // nested tables flattened
        });
        const tcPr = [...tc.children].find(el => is(el, 'w', 'tcPr'));
        const spanEl = tcPr && [...tcPr.children].find(el => is(el, 'w', 'gridSpan'));
        const span = spanEl ? (+attr(spanEl, 'w', 'val') || 1) : 1;
        row.push({ paras, t: paras.filter(Boolean).join(' ') });
        for (let s = 1; s < span; s++) row.push({ paras: [], t: '' }); // keep columns aligned with the grid
      }
      rows.push(row);
    }
    return { kind: 'table', rows, images };
  }
  function bodyItems(container, items) {
    for (const el of container.children) {
      if (is(el, 'w', 'p')) addParagraph(el, items);
      else if (is(el, 'w', 'tbl')) items.push(tableItem(el));
      else if (is(el, 'w', 'sdt') || is(el, 'w', 'sdtContent') || is(el, 'w', 'customXml') || is(el, 'mc', 'AlternateContent') || is(el, 'mc', 'Choice')) bodyItems(el, items);
    }
  }

  async function relsOf(zip, path) {
    const xml = await zip.text(path);
    if (!xml) return [];
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    return [...dom.getElementsByTagName('Relationship')].map(r => ({ id: r.getAttribute('Id'), type: r.getAttribute('Type') || '', target: r.getAttribute('Target') || '' }));
  }

  // ------------------------------------------------------------------ helpers for the parsers
  const D = '[0-9]'; // matching runs on Arabic digits (k)
  const num = s => { const m = arabic(String(s || '')).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? +m[0] : 0; };
  const noDots = s => String(s || '').replace(/[.…·_]{3,}/g, ' ').replace(/\s+/g, ' ').trim();
  // text after a label: matched on k, sliced from t
  function after(it, re) {
    if (!it || it.kind !== 'p') return null;
    const m = re.exec(it.k);
    return m ? it.t.slice(m.index + m[0].length).trim() : null;
  }
  const idx = (list, re, from = 0, to = list.length) => {
    for (let i = Math.max(0, from); i < Math.min(to, list.length); i++) if (list[i].kind === 'p' && re.test(list[i].k)) return i;
    return -1;
  };
  // non-empty lines between two positions; lines split off by a soft line break re-join their paragraph
  const texts = (list, from, to) => {
    const out = [];
    let prev = -2;
    list.slice(from, to < 0 ? list.length : to).forEach((x, i) => {
      if (x.kind !== 'p') return;
      if (x.cont && prev === i - 1 && out.length) { if (x.t) out[out.length - 1] += ' ' + x.t; prev = i; return; }
      if (x.t) { out.push(x.t); prev = i; }
    });
    return out;
  };
  const tableIn = (list, from, to) => list.slice(from, to < 0 ? list.length : to).find(x => x.kind === 'table');
  const joinParas = lines => lines.join('\n\n');
  // skip the instruction text of a heading such as "2.1 หลักการและเหตุผล (แสดงปัญหา ..." which may run onto the next line
  function bodyFrom(list, i) {
    let depth = 0, j = i;
    do {
      const t = list[j] && list[j].kind === 'p' ? list[j].t : '';
      depth += (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length;
      j++;
    } while (depth > 0 && j < list.length);
    return j;
  }
  const NUM_PREFIX = /^\(?[0-9๐-๙]+(?:(?:\.[0-9๐-๙]+)+\.?\s+|[.)]\s*)/; // multi-level (2.9.1) tried first
  // numbered items ("1.", "1)", "4.1", "2.9.1"); unnumbered lines continue the previous item
  function listItems(lines) {
    const hasNum = lines.some(l => NUM_PREFIX.test(l));
    if (!hasNum) return lines.filter(Boolean);
    const out = [];
    lines.forEach(l => {
      if (NUM_PREFIX.test(l) || !out.length) out.push(l.replace(NUM_PREFIX, '').trim());
      else out[out.length - 1] += ' ' + l;
    });
    return out.filter(Boolean);
  }
  const CHECK = /[✓✔☑☒√]/;
  // the option that directly follows a check mark ("☑ ตามแผน", "(✓) ต่อเนื่อง")
  function checkedOption(text, options) {
    const occ = [];
    Object.entries(options).forEach(([key, label]) => {
      for (let i = text.indexOf(label); i >= 0; i = text.indexOf(label, i + 1)) occ.push({ key, i, len: label.length });
    });
    for (let m = 0; m < text.length; m++) {
      if (!CHECK.test(text[m])) continue;
      const next = occ.filter(o => o.i > m).sort((a, b) => a.i - b.i || b.len - a.len)[0];
      if (next) return next.key;
    }
    return null;
  }
  // is this option marked? looks at the closest box / parentheses before the label
  function isChecked(text, label) {
    const i = text.indexOf(label);
    if (i < 0) return null;
    const before = text.slice(Math.max(0, i - 12), i);
    let last = null;
    for (const ch of before) { if (CHECK.test(ch)) last = true; else if (ch === '☐' || ch === '(') last = false; else if (ch === ')' && last === null) last = false; }
    if (last === false && /\(✓\)\s*$/.test(before)) last = true;
    return last;
  }
  function splitPeriod(s) {
    const m = String(s || '').match(/^(.+?)\s*[–—-]\s*(.+)$/);
    return m ? [noDots(m[1]), noDots(m[2])] : [noDots(s), ''];
  }
  const positionSchool = pos => {
    const m = String(pos || '').replace(/^ตำแหน่ง\s*/, '').match(/^(.*?)\s*(โรงเรียน.+)$/);
    return m ? { position: m[1].trim(), school: m[2].trim() } : { position: String(pos || '').replace(/^ตำแหน่ง\s*/, '').trim(), school: '' };
  };
  function signatures(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind !== 'p' || !/ลงชื่อ/.test(list[i].t)) continue;
      const role = noDots(list[i].t.replace(/\(?ลงชื่อ\)?/, ''));
      let name = '', pos = '';
      for (let j = i + 1; j < Math.min(list.length, i + 4); j++) {
        const u = list[j].kind === 'p' ? list[j].t : '';
        if (/ลงชื่อ/.test(u)) break;
        const m = u.match(/^\(\s*(.+?)\s*\)$/);
        if (m && !name) { name = m[1]; continue; }
        if (name && u) { pos = u; break; }
      }
      if (name) out.push({ role, name, pos });
    }
    return out;
  }
  function applySignatures(list, R) {
    signatures(list).forEach(({ role, name, pos }) => {
      const p = pos || role;
      if (/รองผู้อำนวยการ/.test(p)) { R.set('deputy', name, 'รองผู้อำนวยการ'); R.set('deputyPosition', p); }
      else if (/^ผู้อำนวยการ/.test(p) || /^ผู้อำนวยการ/.test(role)) { R.set('director', name, 'ผู้อำนวยการ'); R.set('directorPosition', /^ผู้อำนวยการ/.test(pos) ? pos : role); }
      else if (/ผู้เสนอโครงการ|ผู้รับผิดชอบโครงการ|ผู้รายงาน|ผู้รวบรวม/.test(role)) {
        R.set('owner', name, 'ผู้รับผิดชอบโครงการ');
        if (pos) { const ps = positionSchool(pos); R.set('ownerPosition', ps.position, 'ตำแหน่ง'); R.set('school', ps.school, 'ชื่อโรงเรียน'); }
      }
    });
  }
  // activity table: header with รายละเอียด/กิจกรรม, ระยะเวลา, ผู้รับผิดชอบ; rows may hold one step each
  // or (as in the school's template) every step as separate paragraphs of one row
  function stepsTable(tbl) {
    if (!tbl) return null;
    const h = tbl.rows.findIndex(r => r.some(c => /กิจกรรม|รายละเอียด/.test(c.t)));
    if (h < 0) return null;
    const col = re => tbl.rows[h].findIndex(c => re.test(c.t));
    const a = col(/รายละเอียด|กิจกรรม/), p = col(/ระยะเวลา/), o = col(/ผู้รับผิดชอบ/);
    const out = [];
    tbl.rows.slice(h + 1).forEach(r => {
      const cellParas = i => (i >= 0 && r[i] ? r[i].paras.filter(Boolean) : []);
      const acts = cellParas(a), pers = cellParas(p), owns = cellParas(o);
      if (!acts.length) return;
      if (acts.length > 1 && (pers.length === acts.length || owns.length === acts.length)) {
        acts.forEach((act, i) => out.push({ activity: act.replace(NUM_PREFIX, '').trim(), period: pers[i] || '', owner: owns[i] || '' }));
      } else out.push({ activity: acts.join(' ').replace(NUM_PREFIX, '').trim(), period: pers.join(' '), owner: owns.join(' ') });
    });
    return out.length ? out : null;
  }
  // proposal 2.7: activity column + ตอบแทน / ใช้สอย / วัสดุ (+ รวม); the totals row is checked, not imported
  function budgetTable(tbl, R) {
    if (!tbl) return null;
    const h = tbl.rows.findIndex(r => r.some(c => /ตอบแทน/.test(c.t)) && r.some(c => /วัสดุ/.test(c.t)));
    if (h < 0) return null;
    const col = re => tbl.rows[h].findIndex(c => re.test(c.t));
    const cols = { comp: col(/ตอบแทน/), use: col(/ใช้สอย/), mat: col(/วัสดุ/) };
    const out = [];
    let declared = null;
    for (const r of tbl.rows.slice(h + 1)) {
      const first = r[0] ? r[0].t : '';
      if (/^รวม/.test(first)) { declared = num(r[r.length - 1] && r[r.length - 1].t); break; }
      const acts = (r[0] ? r[0].paras : []).filter(Boolean);
      if (!acts.length) continue;
      const vals = k => (cols[k] >= 0 && r[cols[k]] ? r[cols[k]].paras.filter(Boolean) : []);
      if (acts.length > 1) {
        acts.forEach((act, i) => out.push({ text: act.replace(NUM_PREFIX, '').trim(), comp: num(vals('comp')[i]), use: num(vals('use')[i]), mat: num(vals('mat')[i]) }));
      } else out.push({ text: acts.join(' ').replace(NUM_PREFIX, '').trim(), comp: num(vals('comp').join(' ')), use: num(vals('use').join(' ')), mat: num(vals('mat').join(' ')) });
    }
    const sum = out.reduce((s, it) => s + it.comp + it.use + it.mat, 0);
    if (declared && sum && declared !== sum) {
      R.warn(`ตารางรายละเอียดงบประมาณในไฟล์เขียนยอดรวมไว้ ${declared.toLocaleString('en-US')} บาท แต่รายการรวมกันได้ ${sum.toLocaleString('en-US')} บาท (ระบบใช้ผลรวมของรายการ)`);
    }
    return out.length ? out : null;
  }
  // rating tables: rows "1. | รายการ | 5 | 4 | 3 | 2 | 1"
  function ratingTable(tbl) {
    if (!tbl) return null;
    const out = [];
    for (const r of tbl.rows) {
      if (!r[0] || !/^[0-9]+\.?$/.test(arabic(r[0].t)) || !r[1]) continue;
      out.push({ text: r[1].t, c: [2, 3, 4, 5, 6].map(i => (r[i] ? num(r[i].t) : 0)) });
    }
    return out.length ? out : null;
  }

  // ------------------------------------------------------------------ แบบเสนอโครงการ
  function parseProposal(L, R) {
    const top = idx(L, /^1\.\s*ความสอดคล้อง/);
    const head = L.slice(0, top < 0 ? Math.min(L.length, 12) : top);
    head.forEach(it => {
      let v;
      if ((v = after(it, /^โครงการ(?!ต่อเนื่อง|ใหม่)\s*/)) != null && /^โครงการ\s/.test(it.k)) R.set('project', /^โครงการ/.test(v) ? v : 'โครงการ' + v, 'ชื่อโครงการ');
      if (/^ลักษณะโครงการ/.test(it.k)) R.set('projectType', checkedOption(it.t, { continuing: 'ต่อเนื่อง', new: 'ใหม่' }), 'ลักษณะโครงการ');
      if ((v = after(it, /^กลุ่มงาน(?:รับผิดชอบ)?\s*/)) != null) R.set('workGroup', noDots(v), 'กลุ่มงาน');
      if ((v = after(it, /^สอดคล้องกับนโยบาย(?:และจุดเน้น)?\s*สพฐ\.?\s*/)) != null) R.set('policyFocus', noDots(v), 'นโยบายและจุดเน้น สพฐ.');
      if ((v = after(it, /^ผู้รับผิดชอบโครงการ\s*/)) != null) R.set('owner', noDots(v), 'ผู้รับผิดชอบโครงการ');
    });
    // 1. ความสอดคล้อง
    const i11 = idx(L, /^1\.1\s*ยุทธศาสตร์ชาติ/), i12 = idx(L, /^1\.2\s/);
    if (i11 >= 0) {
      const t = texts(L, i11, i12).join(' ');
      const other = (t.match(/อื่น\s*ๆ\s*\(ระบุ\)\s*(.*)$/) || [])[1];
      R.set('natStrategy', {
        hr: isChecked(t, 'ด้านการพัฒนาและเสริมสร้างศักยภาพทรัพยากรมนุษย์') === true,
        admin: isChecked(t, 'ด้านการปรับสมดุล') === true,
        other: isChecked(t, 'อื่น') === true ? noDots(other) : ''
      }, 'ยุทธศาสตร์ชาติ 20 ปี');
    }
    const strategy = it => { const v = after(it, /\(ระบุ\)\s*/); return v != null ? noDots(v) : noDots(after(it, /กลยุทธ์ที่\s*/)); };
    L.forEach(it => {
      if (it.kind !== 'p') return;
      let v, m;
      if (/^1\.2\s*กลยุทธ์\s*สพฐ/.test(it.k)) R.set('obecStrategy', strategy(it), 'กลยุทธ์ สพฐ.');
      for (const n of [1, 2, 3]) if ((v = after(it, new RegExp(`มาตรฐานที่\\s*${n}\\s*ตัวบ่งชี้ที่\\s*`))) != null) R.set('std' + n, noDots(v), `มาตรฐานที่ ${n}`);
      if ((m = it.k.match(/^1\.4\s*กลยุทธ์\s*(.*?)\s*(?:\(✓\)|\(\s*\))?\s*กลยุทธ์ที่/))) {
        R.set('officeShort', it.t.substr(m[0].indexOf(m[1], 5), m[1].length).trim(), 'ชื่อย่อเขตพื้นที่');
        R.set('areaStrategy', strategy(it), 'กลยุทธ์เขตพื้นที่');
      }
      if (/^1\.5\s*กลยุทธ์โรงเรียน/.test(it.k)) R.set('schoolStrategy', strategy(it), 'กลยุทธ์โรงเรียน');
      if ((v = after(it, /^1\.6\s*นโยบายและจุดเน้น\s*สพฐ\.?\s*/)) != null) R.set('policyFocus', noDots(v), 'นโยบายและจุดเน้น สพฐ.');
    });
    // 2. รายละเอียดโครงการ
    const h = n => idx(L, new RegExp(`^2\\.${n}(?![0-9.])\\s*`));
    const H = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].reduce((o, n) => (o[n] = h(n), o), {});
    const until = n => { for (let m = n + 1; m <= 11; m++) if (H[m] >= 0) return H[m]; const s = idx(L, /ลงชื่อ/, H[n]); return s; };
    if (H[1] >= 0) R.set('rationale', joinParas(texts(L, bodyFrom(L, H[1]), until(1))), 'หลักการและเหตุผล');
    if (H[2] >= 0) R.set('objectives', listItems(texts(L, bodyFrom(L, H[2]), until(2))), 'วัตถุประสงค์');
    if (H[3] >= 0) {
      const end = until(3), q1 = idx(L, /^1\)\s*เชิงปริมาณ/, H[3], end), q2 = idx(L, /^2\)\s*เชิงคุณภาพ/, H[3], end);
      if (q1 >= 0) R.set('targetQuantity', texts(L, bodyFrom(L, q1), q2 >= 0 ? q2 : end).join('\n'), 'เป้าหมายเชิงปริมาณ');
      if (q2 >= 0) R.set('targetQuality', texts(L, bodyFrom(L, q2), end).join('\n'), 'เป้าหมายเชิงคุณภาพ');
    }
    if (H[4] >= 0) R.set('steps', stepsTable(tableIn(L, H[4], until(4))), 'กิจกรรมและวิธีดำเนินงาน');
    if (H[5] >= 0) {
      const [a, b] = splitPeriod(after(L[H[5]], /ระยะเวลาดำเนินโครงการ\s*/));
      R.set('planStart', a, 'ระยะเวลาดำเนินโครงการ'); R.set('planEnd', b);
      const y = (arabic(b || a).match(/25[0-9]{2}/g) || []).pop();
      R.set('year', y, 'ปีงบประมาณ (จากระยะเวลาดำเนินโครงการ)');
    }
    if (H[6] >= 0) {
      const total = num(after(L[H[6]], /งบประมาณ\s*/));
      if (total) R.set('budgetPlan', total, 'งบประมาณ');
      const src = { teaching: 0, activity: 0, income: 0, other: 0, otherName: '' };
      let any = false;
      L.slice(H[6] + 1, until(6)).forEach(it => {
        if (it.kind !== 'p') return;
        const amount = num((it.k.match(new RegExp(`จำนวน\\s*(${D}[0-9,.]*)\\s*บาท`)) || [])[1]);
        if (/ค่าจัดการเรียนการสอน/.test(it.k)) { src.teaching = amount; any = true; }
        else if (/กิจกรรมพัฒนาผู้เรียน/.test(it.k)) { src.activity = amount; any = true; }
        else if (/เงินรายได้สถานศึกษา/.test(it.k)) { src.income = amount; any = true; }
        else if (/อื่น\s*ๆ/.test(it.k)) {
          src.other = amount; any = true;
          src.otherName = noDots((it.t.match(/\(ระบุ\)\s*(.*?)\s*จำนวน/) || [])[1]);
        }
      });
      if (any) R.set('budgetSources', src, 'แหล่งงบประมาณ');
    }
    if (H[7] >= 0) R.set('budgetItems', budgetTable(tableIn(L, H[7], until(7)), R), 'รายละเอียดการใช้งบประมาณ');
    const k1 = idx(L, /^2\.8\.1/), k2 = idx(L, /^2\.8\.2/);
    if (k1 >= 0) R.set('indicators', listItems(texts(L, bodyFrom(L, k1), k2 >= 0 ? k2 : until(8))), 'ตัวชี้วัดเชิงปริมาณ');
    if (k2 >= 0) R.set('kpiQuality', listItems(texts(L, bodyFrom(L, k2), until(8))), 'ตัวชี้วัดเชิงคุณภาพ');
    if (H[9] >= 0) R.set('beneficiaries', listItems(texts(L, bodyFrom(L, H[9]), until(9))), 'กลุ่มเป้าหมายผู้ได้รับผลประโยชน์');
    if (H[10] >= 0) {
      const t = texts(L, H[10] + 1, until(10)).join(' ');
      const other = (t.match(/อื่น\s*ๆ\s*\(ระบุ\)\s*(.*)$/) || [])[1];
      R.set('evalMethods', {
        survey: isChecked(t, 'แบบสอบถาม') === true, form: isChecked(t, 'แบบประเมิน') === true,
        other: isChecked(t, 'อื่น') === true ? noDots(other) : ''
      }, 'การประเมินผลโครงการ');
    }
    if (H[11] >= 0) {
      const sig = idx(L, /ลงชื่อ/, H[11]);
      R.set('expectedResults', joinParas(texts(L, bodyFrom(L, H[11]), sig)), 'ผลที่คาดว่าจะได้รับ');
    }
    applySignatures(L, R);
  }

  // ------------------------------------------------------------------ รายงานสรุปโครงการ
  const SEGMENTS = [
    ['cover', /^การประเมินผลโครงการ$/], ['preface', /^คำนำ$/], ['memo', /^บันทึกข้อความ$/],
    ['report', /^รายงานผลการปฏิบัติงานตามโครงการ/], ['subSummary', /^สรุปและรายงานโครงการ$/],
    ['followup', /^แบบติดตามและประเมินผล/], ['evalTable', /^แบบสรุปการประเมินผลการปฏิบัติ/],
    ['subSat', /^สรุปและรายงานผลการประเมินความพึงพอใจ$/], ['satReport', /^รายงานผลการประเมินความพึงพอใจ$/],
    ['satTable', /^แบบสรุปความพึงพอใจ/], ['appendix', /^ภาคผนวก/]
  ];
  function parseSummary(L, R) {
    const seg = {};
    let cur = 'cover';
    L.forEach(it => {
      if (it.kind === 'p') { const hit = SEGMENTS.find(([, re]) => re.test(it.k)); if (hit) cur = hit[0]; }
      (seg[cur] = seg[cur] || []).push(it);
    });
    const S = name => seg[name] || [];
    // cover
    const cover = S('cover');
    cover.forEach((it, i) => {
      if (it.kind !== 'p') return;
      let m;
      if ((m = it.k.match(/ปีงบประมาณ\s*([0-9]{4})/))) R.set('year', it.t.substr(m.index + m[0].length - 4, 4).replace(/[๐-๙]/g, d => String(THAI_DIGITS.indexOf(d))), 'ปีงบประมาณ');
      if (/^โครงการ\S/.test(it.k)) R.set('project', it.t, 'ชื่อโครงการ');
      if (/หัวหน้าโครงการ/.test(it.k) && cover[i + 1] && cover[i + 1].kind === 'p') R.set('owner', cover[i + 1].t, 'ผู้รับผิดชอบโครงการ');
      if (/^โรงเรียน/.test(it.k)) R.set('school', it.t, 'ชื่อโรงเรียน');
      if (/^สำนักงานเขตพื้นที่/.test(it.k)) R.set('office', it.t, 'สำนักงานเขตพื้นที่การศึกษา');
    });
    // บันทึกข้อความ
    const memo = S('memo');
    memo.forEach(it => {
      if (it.kind !== 'p') return;
      let m, v;
      if ((m = it.k.match(/^ที่\s*(.*?)\s*วันที่\s*(.+)$/))) {
        R.set('memoNo', noDots(it.t.substr(it.k.indexOf(m[1], 2), m[1].length)) || ' ', 'ที่ (บันทึกข้อความ)');
        R.set('memoDate', noDots(it.t.slice(it.t.length - m[2].length)), 'วันที่ (บันทึกข้อความ)');
      }
      if ((v = after(it, /^เรียน\s*/)) != null) R.set('directorPosition', v);
      if ((m = it.t.match(/ใน((?:งาน|กลุ่ม)\S+)\s*ประจำปีงบประมาณ/))) R.set('workGroup', m[1], 'กลุ่มงาน');
      if ((m = it.t.match(/ตำแหน่ง\s*(.+?)\s*(โรงเรียน.+)$/))) { R.set('ownerPosition', m[1], 'ตำแหน่ง'); R.set('school', m[2]); }
    });
    const mp = idx(memo, /^ปัญหาและอุปสรรค/), ms = idx(memo, /^ข้อเสนอแนะ/), me = idx(memo, /^จึงเรียน/);
    if (mp >= 0) R.set('memoProblems', joinParas(texts(memo, mp + 1, ms >= 0 ? ms : me)), 'ปัญหาและอุปสรรค (บันทึกข้อความ)');
    if (ms >= 0) R.set('memoSuggestions', joinParas(texts(memo, ms + 1, me)), 'ข้อเสนอแนะ (บันทึกข้อความ)');
    // รายงานผลการปฏิบัติงาน
    const rep = S('report');
    rep.forEach(it => {
      if (it.kind !== 'p') return;
      let v, m;
      if ((v = after(it, /^ชื่อโครงการ\s*/)) != null) R.set('project', v, 'ชื่อโครงการ');
      if (/^ลักษณะโครงการ/.test(it.k)) R.set('projectType', checkedOption(it.t, { new: 'ใหม่', continuing: 'ต่อเนื่อง' }), 'ลักษณะโครงการ');
      if ((m = it.t.match(/^ผู้รับผิดชอบ\s*(.+?)\s*กลุ่มงาน\s*(.+)$/))) { R.set('owner', noDots(m[1]), 'ผู้รับผิดชอบโครงการ'); R.set('workGroup', noDots(m[2]), 'กลุ่มงาน'); }
    });
    const r = re => idx(rep, re);
    const s = [r(/^1\.\s*วัตถุประสงค์/), r(/^2\.\s*การดำเนินการ/), r(/^3\.\s*ระยะเวลา/), r(/^4\.\s*บุคคล/), r(/^5\.\s*ขั้นตอน/),
      r(/^6\.\s*งบประมาณ/), r(/^7\.\s*ตัวชี้วัด/), r(/^8\./), r(/^9\./), r(/^10\.\s*สภาพปัญหา/), r(/^11\.\s*จุดเด่น/),
      r(/^12\.\s*จุดด้อย/), r(/^13\.\s*ข้อเสนอแนะ/), r(/^14\.\s*ความคิดเห็น/)];
    const next = n => { for (let m = n + 1; m < s.length; m++) if (s[m] >= 0) return s[m]; return -1; };
    if (s[0] >= 0) R.set('objectives', listItems(texts(rep, s[0] + 1, next(0))), 'วัตถุประสงค์');
    if (s[1] >= 0) R.set('status', checkedOption(texts(rep, s[1], next(1)).join(' '), { done: 'ดำเนินการแล้วเสร็จ', doing: 'กำลังดำเนินการ', notyet: 'ยังไม่ได้ดำเนินการ' }), 'สถานะการดำเนินการ');
    if (s[2] >= 0) {
      const part = rep.slice(s[2], next(2) < 0 ? rep.length : next(2));
      part.forEach(it => {
        let v;
        if (/^3\.1/.test(it.k) && (v = after(it, /เริ่ม\s*/)) != null) { const [a, b] = splitPeriod(v); R.set('planStart', a, 'ระยะเวลาตามแผน'); R.set('planEnd', b); }
        if (/^3\.2/.test(it.k) && (v = after(it, /เริ่ม\s*/)) != null) { const [a, b] = splitPeriod(v); R.set('actualStart', a, 'ระยะเวลาดำเนินการจริง'); R.set('actualEnd', b); }
      });
      const t = texts(part, 0, -1).join(' ');
      const timing = checkedOption(t.replace(/^.*?3\.2.*?(?=[✓✔☑☒☐])/, ''), { onplan: 'ตามแผน', early: 'เร็วกว่าแผน', late: 'ช้ากว่าแผน' });
      R.set('timing', timing, 'สรุปเวลาดำเนินการ');
      if (timing === 'late') R.set('lateReason', noDots((t.match(/ช้ากว่าแผน\s*เพราะ\s*(.*)$/) || [])[1]), 'เหตุผลที่ช้ากว่าแผน');
    }
    if (s[3] >= 0) R.set('participants', listItems(texts(rep, s[3] + 1, next(3))), 'บุคคลที่เกี่ยวข้อง');
    if (s[4] >= 0) R.set('steps', stepsTable(tableIn(rep, s[4], next(4))), 'ขั้นตอนการปฏิบัติงาน');
    if (s[5] >= 0) {
      rep.slice(s[5], next(5) < 0 ? rep.length : next(5)).forEach(it => {
        if (/^6\.1/.test(it.k)) R.set('budgetPlan', num(after(it, /ตามแผน\s*/)), 'งบประมาณตามแผน');
        if (/^6\.2/.test(it.k)) R.set('budgetActual', num(after(it, /ใช้จริง\s*/)), 'งบประมาณที่ใช้จริง');
      });
    }
    if (s[6] >= 0) R.set('indicators', listItems(texts(rep, s[6] + 1, next(6))), 'ตัวชี้วัดความสำเร็จ');
    const sigAt = from => idx(rep, /ลงชื่อ/, from);
    [[9, 'problems', 'สภาพปัญหา/อุปสรรค'], [10, 'strengths', 'จุดเด่น'], [11, 'weaknesses', 'จุดด้อย'], [12, 'improvements', 'ข้อเสนอแนะเพื่อพัฒนา']].forEach(([n, key, label]) => {
      if (s[n] < 0) return;
      let end = next(n);
      const sig = sigAt(s[n] + 1);
      if (sig >= 0 && (end < 0 || sig < end)) end = sig;
      R.set(key, joinParas(texts(rep, s[n] + 1, end)), label);
    });
    if (s[13] >= 0) {
      const first = noDots(after(rep[s[13]], /ความคิดเห็นผู้บริหาร\s*/));
      const sig = sigAt(s[13] + 1);
      const more = texts(rep, s[13] + 1, sig).map(noDots).filter(Boolean);
      R.set('directorComment', [first, ...more].filter(Boolean).join('\n'), 'ความคิดเห็นผู้บริหาร');
    }
    applySignatures(rep, R);
    // ปกย่อย
    [...S('subSummary'), ...S('subSat')].forEach((it, i, arr) => {
      if (it.kind !== 'p') return;
      if (/^โรงเรียน.*\(.+\)\s*$/.test(it.k)) R.set('schoolFull', it.t, 'ชื่อโรงเรียน (เต็ม)');
      if (/^สำนักงานคณะกรรมการ/.test(it.k)) R.set('obec', it.t, 'สังกัด');
      if (/^กระทรวง/.test(it.k)) R.set('ministry', it.t, 'กระทรวง');
      if (/^สำนักงานเขตพื้นที่/.test(it.k)) R.set('office', it.t, 'สำนักงานเขตพื้นที่การศึกษา');
      const ps = /โรงเรียน/.test(it.k) && i > 0 && arr[i - 1].kind === 'p' && /^(นาย|นาง|น\.ส\.|ว่าที่)/.test(arr[i - 1].k) ? positionSchool(it.t) : null;
      if (ps && ps.position) R.set('ownerPosition', ps.position, 'ตำแหน่ง');
    });
    // แบบติดตามและประเมินผล
    const fu = S('followup');
    const f = [idx(fu, /^1\.\s*การดำเนินการ/), idx(fu, /^2\.\s*ปัญหา/), idx(fu, /^3\.\s*วิธีการแก้ไข/), idx(fu, /^4\.\s*สรุปผล/), idx(fu, /^5\.\s*ข้อเสนอแนะ/)];
    const fnext = n => { for (let m = n + 1; m < f.length; m++) if (f[m] >= 0) return f[m]; return idx(fu, /ลงชื่อ/, f[n] + 1); };
    if (f[0] >= 0) R.set('followSteps', listItems(texts(fu, f[0] + 1, fnext(0)).filter(t => !/^เริ่มดำเนินงาน/.test(t))), 'การดำเนินการ (แบบติดตาม)');
    if (f[1] >= 0) R.set('followProblems', joinParas(texts(fu, f[1] + 1, fnext(1))), 'ปัญหาและอุปสรรค (แบบติดตาม)');
    if (f[2] >= 0) R.set('followSolutions', joinParas(texts(fu, f[2] + 1, fnext(2))), 'วิธีการแก้ไข');
    if (f[3] >= 0) R.set('followResults', listItems(texts(fu, f[3] + 1, fnext(3))), 'สรุปผลการดำเนินงาน');
    if (f[4] >= 0) R.set('followSuggestions', joinParas(texts(fu, f[4] + 1, fnext(4))), 'ข้อเสนอแนะครั้งต่อไป');
    // แบบประเมิน
    const evaluators = list => {
      const it = list.find(x => x.kind === 'p' && /^ผู้ประเมิน/.test(x.k));
      if (it) R.set('evaluators', { teacher: isChecked(it.t, 'ครู') !== false, student: isChecked(it.t, 'นักเรียน') !== false, parent: isChecked(it.t, 'ผู้ปกครอง') !== false }, 'ผู้ประเมิน');
    };
    evaluators(S('evalTable')); evaluators(S('satTable'));
    R.set('evalItems', ratingTable(tableIn(S('evalTable'), 0, -1)), 'แบบประเมินผลการปฏิบัติการ');
    R.set('satItems', ratingTable(tableIn(S('satTable'), 0, -1)), 'แบบประเมินความพึงพอใจ');
    const sr = S('satReport');
    const intro = sr.find((x, i) => i > 1 && x.kind === 'p' && x.t.length > 60);
    if (intro && R.fields.project) R.set('satIntro', intro.t.split(R.fields.project).join('{project}'), 'คำอธิบายรายงานความพึงพอใจ');
    // photos: images after the satisfaction table, or in an appendix
    const st = S('satTable'), t = st.findIndex(x => x.kind === 'table');
    return [...(t >= 0 ? st.slice(t + 1) : []), ...S('appendix')].flatMap(x => x.images || []);
  }

  // ------------------------------------------------------------------ entry point
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  function dataUrl(bytes, mime) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${mime};base64,${btoa(s)}`;
  }

  async function parse(buf) {
    if (typeof DecompressionStream === 'undefined') throw new Error('no-decompression');
    const zip = readZip(buf);
    const pkgRels = await relsOf(zip, '_rels/.rels');
    const main = pkgRels.find(r => /\/officeDocument$/.test(r.type));
    const docPath = (main ? main.target : 'word/document.xml').replace(/^\//, '');
    const xml = await zip.text(docPath);
    if (!xml) throw new Error('not-docx');
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const body = [...dom.documentElement.children].find(el => is(el, 'w', 'body'));
    if (!body) throw new Error('not-docx');
    const L = [];
    bodyItems(body, L);

    const fields = {}, found = [], warnings = [];
    const R = {
      fields, warnings,
      set(key, value, label) {
        if (value == null || value === '' || (Array.isArray(value) && !value.length) || key in fields) return;
        if (typeof value === 'string' && !value.trim()) return;
        fields[key] = value;
        if (label && !found.includes(label)) found.push(label);
      },
      warn(msg) { warnings.push(msg); }
    };
    const all = L.filter(x => x.kind === 'p').map(x => x.k).join('\n');
    const types = [];
    let photoIds = [];
    if (/หลักการและเหตุผล/.test(all) && /ความสอดคล้อง|กิจกรรมและวิธีดำเนินงาน/.test(all)) { types.push('proposal'); parseProposal(L, R); }
    if (/รายงานผลการปฏิบัติงานตามโครงการ|แบบสรุปการประเมินผลการปฏิบัติ|แบบติดตามและประเมินผล|แบบสรุปความพึงพอใจ/.test(all)) {
      types.push('summary'); photoIds = parseSummary(L, R);
    }
    if (photoIds.length) {
      const dir = docPath.replace(/[^/]*$/, '');
      const rels = await relsOf(zip, `${dir}_rels/${docPath.split('/').pop()}.rels`);
      const photos = [];
      for (const id of [...new Set(photoIds)]) {
        const rel = rels.find(x => x.id === id);
        if (!rel || /^https?:/.test(rel.target)) continue;
        const path = rel.target.startsWith('/') ? rel.target.slice(1) : dir + rel.target;
        const mime = MIME[(path.split('.').pop() || '').toLowerCase()];
        const bytes = mime && await zip.read(path.replace(/[^/]+\/\.\.\//g, ''));
        if (bytes && bytes.length > 20000) photos.push({ src: dataUrl(bytes, mime), caption: '' }); // skip icons and check boxes
      }
      R.set('photos', photos, `ภาพกิจกรรม (${photos.length} ภาพ)`);
    }
    return { types, fields, found, warnings };
  }

  window.ProjectDocxImport = { parse };
})();
