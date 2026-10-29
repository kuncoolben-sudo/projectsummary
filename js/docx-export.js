/* ระบบสรุปโครงการ — export the report as a Word document (.docx).
   Hand-written WordprocessingML + a small ZIP writer: no libraries, works offline and from file://.
   Loaded on demand by app.js together with js/docx-assets.js (fonts and images). */
(function () {
  'use strict';

  const FONT = 'TH Sarabun New';
  const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const DOC_NS = W_NS + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  // Page: A4 with the same margins as the web/PDF version (top 25, right 20, bottom 20, left 30 mm).
  const MM_TW = 1440 / 25.4;              // twips per mm
  const MM_EMU = 36000;                    // EMU per mm
  const tw = mm => Math.round(mm * MM_TW);
  const ptTw = pt => Math.round(pt * 20);
  const CONTENT_MM = 160;

  const enc = new TextEncoder();
  const x = v => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ------------------------------------------------------------------ ZIP
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function deflateRaw(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { return null; }
  }
  // files: [{ name, data: Uint8Array, compress: bool }]
  async function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const packed = f.compress ? await deflateRaw(f.data) : null;
      const method = packed ? 8 : 0, body = packed || f.data;
      const head = (sig, extra) => {
        const v = new DataView(new ArrayBuffer(extra ? 46 : 30));
        let o = 0;
        const u16 = n => { v.setUint16(o, n, true); o += 2; }, u32 = n => { v.setUint32(o, n, true); o += 4; };
        u32(sig); if (extra) u16(20);
        u16(20); u16(0x0800); u16(method); u16(0); u16(0x21); // utf-8 names, 1980-01-01 00:00
        u32(crc); u32(body.length); u32(f.data.length); u16(name.length); u16(0);
        if (extra) { u16(0); u16(0); u16(0); u32(0); u32(offset); }
        return new Uint8Array(v.buffer);
      };
      parts.push(head(0x04034b50, false), name, body);
      central.push(head(0x02014b50, true), name);
      offset += 30 + name.length + body.length;
    }
    const size = central.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)],
      { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // ------------------------------------------------------------------ WordprocessingML helpers
  function rPr(o) {
    let s = '';
    if (o.font) s += `<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}" w:cs="${o.font}"/>`;
    if (o.b) s += '<w:b/><w:bCs/>';
    if (o.color) s += `<w:color w:val="${o.color}"/>`;
    if (o.sz) s += `<w:sz w:val="${o.sz * 2}"/><w:szCs w:val="${o.sz * 2}"/>`;
    return s ? `<w:rPr>${s}</w:rPr>` : '';
  }
  // text run; "\n" becomes a line break
  const run = (text, o = {}) => `<w:r>${rPr(o)}` +
    String(text == null ? '' : text).split('\n').map(t => `<w:t xml:space="preserve">${x(t)}</w:t>`).join('<w:br/>') + '</w:r>';
  const tab = '<w:r><w:tab/></w:r>';
  // Checkboxes are tiny vector images: symbol fonts (Wingdings, Segoe UI Symbol) are missing or
  // fall back to colour emoji in some apps (Word for Mac, LibreOffice, Google Docs).
  const BOX_SVG = on => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<rect x="7" y="7" width="86" height="86" fill="#fff" stroke="#000" stroke-width="8"/>' +
    (on ? '<path d="M24 52 L43 71 L78 27" fill="none" stroke="#000" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' : '') + '</svg>';
  // the "( ✓ )" mark of the proposal form: a check without the box
  const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path d="M18 52 L42 76 L84 22" fill="none" stroke="#000" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let boxRids = null;
  const box = on => inlineImage(boxRids[on ? 1 : 0].png, 3.1, 3.1, boxRids[on ? 1 : 0].svg, on ? '☑' : '☐');
  const opt = (on, label) => box(on) + run(' ' + label + '      ');

  // o: align, before/after (pt), indent/firstLine (mm), border (dotted bottom), keepNext, pageBreak, tabs [{pos mm, val}]
  function para(content, o = {}) {
    let p = '';
    if (o.keepNext) p += '<w:keepNext/>';
    if (o.keepLines) p += '<w:keepLines/>';
    if (o.pageBreak) p += '<w:pageBreakBefore/>';
    if (o.border) p += '<w:pBdr><w:bottom w:val="dotted" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>';
    if (o.tabs) p += `<w:tabs>${o.tabs.map(t => `<w:tab w:val="${t.val || 'left'}" w:pos="${tw(t.pos)}"/>`).join('')}</w:tabs>`;
    if (o.before || o.after) p += `<w:spacing w:before="${ptTw(o.before || 0)}" w:after="${ptTw(o.after || 0)}"/>`;
    if (o.indent || o.firstLine || o.hanging) {
      p += `<w:ind w:left="${tw(o.indent || 0)}"${o.firstLine ? ` w:firstLine="${tw(o.firstLine)}"` : ''}${o.hanging ? ` w:hanging="${tw(o.hanging)}"` : ''}/>`;
    }
    if (o.align) p += `<w:jc w:val="${o.align}"/>`;
    if (o.sz) p += rPr({ sz: o.sz }); // paragraph mark size (affects empty lines)
    return `<w:p>${p ? `<w:pPr>${p}</w:pPr>` : ''}${content}</w:p>`;
  }
  const textPara = (text, o = {}, r = {}) => para(run(text, r), o);
  // multi-paragraph text (blank line = new paragraph), like paras() in app.js
  const textBlock = (text, o = {}, r = {}) => String(text || '').split(/\n\s*\n/).filter(t => t.trim())
    .map(t => textPara(t, o, r)).join('');

  // rows: [[cell]], cell = { c: paragraphs xml, span, vmerge: 'restart'|'continue', shade, valign }
  function table(rows, widths, o = {}) {
    const total = widths.reduce((s, w) => s + w, 0);
    const bd = o.borders === false ? 'none' : 'single';
    const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(k => `<w:${k} w:val="${bd}" w:sz="4" w:space="0" w:color="000000"/>`).join('');
    let xml = `<w:tbl><w:tblPr><w:tblW w:w="${tw(total)}" w:type="dxa"/>` +
      (o.center ? '<w:jc w:val="center"/>' : '') + (o.indent ? `<w:tblInd w:w="${tw(o.indent)}" w:type="dxa"/>` : '') +
      `<w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar><w:left w:w="85" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${tw(w)}"/>`).join('')}</w:tblGrid>`;
    rows.forEach((row, ri) => {
      xml += `<w:tr><w:trPr><w:cantSplit/>${ri < (o.headerRows || 0) ? '<w:tblHeader/>' : ''}</w:trPr>`;
      let col = 0;
      row.forEach(cell => {
        const span = cell.span || 1;
        const w = widths.slice(col, col + span).reduce((s, v) => s + v, 0);
        col += span;
        xml += `<w:tc><w:tcPr><w:tcW w:w="${tw(w)}" w:type="dxa"/>` +
          (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') +
          (cell.vmerge ? `<w:vMerge${cell.vmerge === 'restart' ? ' w:val="restart"' : ''}/>` : '') +
          (cell.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${cell.shade}"/>` : '') +
          `<w:vAlign w:val="${cell.valign || 'top'}"/></w:tcPr>${cell.c || para('')}</w:tc>`;
      });
      xml += '</w:tr>';
    });
    return xml + '</w:tbl>';
  }

  // ------------------------------------------------------------------ images
  let media = [], rels = [], drawingId = 1;
  function addMedia(bytes, ext) {
    const name = `image${media.length + 1}.${ext}`;
    media.push({ name: 'word/media/' + name, data: bytes });
    const id = 'rIdImg' + media.length;
    rels.push(`<Relationship Id="${id}" Type="${REL}/image" Target="media/${name}"/>`);
    return id;
  }
  function graphic(rid, cx, cy, svgRid) {
    const id = drawingId;
    const ext = svgRid ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">` +
      `<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${svgRid}"/></a:ext></a:extLst>` : '';
    return `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
      `<pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}">${ext}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic>`;
  }
  function inlineImage(rid, wMm, hMm, svgRid, descr) {
    const cx = Math.round(wMm * MM_EMU), cy = Math.round(hMm * MM_EMU), id = drawingId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="${id}" name="Picture ${id}"${descr ? ` descr="${descr}"` : ''}/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
      graphic(rid, cx, cy, svgRid) + '</wp:inline></w:drawing></w:r>';
  }
  // positioned on the page, behind the text (cover artwork)
  function pageImage(rid, xMm, yMm, wMm, hMm, svgRid) {
    const cx = Math.round(wMm * MM_EMU), cy = Math.round(hMm * MM_EMU), id = drawingId++;
    return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${id}" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">` +
      `<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round(xMm * MM_EMU)}</wp:posOffset></wp:positionH>` +
      `<wp:positionV relativeFrom="page"><wp:posOffset>${Math.round(yMm * MM_EMU)}</wp:posOffset></wp:positionV>` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
      `<wp:docPr id="${id}" name="Picture ${id}"/><wp:cNvGraphicFramePr/>` + graphic(rid, cx, cy, svgRid) + '</wp:anchor></w:drawing></w:r>';
  }

  const b64bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = reject; img.src = src;
    });
  }
  async function toPng(src, w, h) {
    const img = await loadImg(src);
    const c = document.createElement('canvas');
    c.width = w || img.naturalWidth; c.height = h || img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return new Promise(r => c.toBlob(b => b.arrayBuffer().then(a => r(new Uint8Array(a))), 'image/png'));
  }
  // bytes + extension of any image src; Word takes JPEG/PNG, anything else is converted to PNG
  async function imageBytes(src) {
    let bytes, mime;
    const m = /^data:([^;,]+)(;base64)?,/.exec(src);
    if (m) {
      mime = m[1];
      const body = src.slice(m[0].length);
      bytes = m[2] ? b64bytes(body) : enc.encode(decodeURIComponent(body));
    } else {
      const res = await fetch(src); // fails for neighbouring files when opened via file://
      if (!res.ok) throw new Error('fetch ' + res.status);
      mime = (res.headers.get('content-type') || '').split(';')[0] || (/\.png$/i.test(src) ? 'image/png' : 'image/jpeg');
      bytes = new Uint8Array(await res.arrayBuffer());
    }
    if (mime === 'image/jpeg' || mime === 'image/png') return { bytes, ext: mime === 'image/png' ? 'png' : 'jpeg' };
    return { bytes: await toPng(src), ext: 'png' };
  }

  // ------------------------------------------------------------------ embedded font (ECMA-376 §17.8.1)
  function obfuscatedFont(bytes) {
    const hex = () => Math.floor(Math.random() * 16).toString(16).toUpperCase();
    const g = n => Array.from({ length: n }, hex).join('');
    const key = `{${g(8)}-${g(4)}-${g(4)}-${g(4)}-${g(12)}}`;
    const pos = [35, 33, 31, 29, 27, 25, 22, 20, 17, 15, 12, 10, 7, 5, 3, 1];
    const k = pos.map(i => parseInt(key.substr(i, 2), 16));
    const out = new Uint8Array(bytes);
    for (let i = 0; i < 16; i++) { out[i] ^= k[i]; out[i + 16] ^= k[i]; }
    return { key, data: out };
  }

  // ------------------------------------------------------------------ the report
  async function build(ctx) {
    const { state: s, ratingSummary, qualityLevel, satLevel, fill, fmt, fmt2, money, or, LEVELS, getDims, printedWidth, PHOTO_BOX, budgetTotals, proposalBudget } = ctx;
    const A = window.DOCX_ASSETS;
    media = []; rels = []; drawingId = 1;
    let skipped = 0;
    boxRids = [];
    for (const svg of [BOX_SVG(false), BOX_SVG(true), CHECK_SVG]) {
      const png = await toPng('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), 64, 64);
      boxRids.push({ png: addMedia(png, 'png'), svg: addMedia(enc.encode(svg), 'svg') });
    }
    const ev = ratingSummary(s.evalItems), sat = ratingSummary(s.satItems);
    const on = k => s.sections[k] !== false;
    const projectName = or(s.project, 'ชื่อโครงการ');
    const owner = or(s.owner, '');
    const school2 = s.schoolFull || s.school;
    const body = [];
    let first = true;
    // every page starts on a new page; o.pageBreak is set on its first paragraph
    const page = () => { const pb = !first; first = false; return pb; };

    const B = { b: true };
    const H = (text, sz = 18, o = {}) => textPara(text, Object.assign({ align: 'center', after: 4 }, o), { b: true, sz });
    const sub = (text, o = {}) => textPara(text, Object.assign({ indent: 8 }, o));
    const head = (text, o = {}) => textPara(text, Object.assign({ before: 4, keepNext: true }, o), B);
    const block = (text, o = {}) => textBlock(or(text, '-'), Object.assign({ indent: 8 }, o));
    const rule = () => para('', { border: true, sz: 6, after: 6 });
    const signRight = (lines, indent = 70) => lines.map((l, i) => textPara(l, { indent, align: 'center', before: i ? 0 : 12, keepNext: i < lines.length - 1 })).join('');
    const signTwo = (left, right) => table([[
      { c: left.map(l => textPara(l, { align: 'center' })).join('') },
      { c: right.map(l => textPara(l, { align: 'center' })).join('') }
    ]], [80, 80], { borders: false });
    const spacer = pt => para('', { before: 0, after: 0, sz: 2 }).replace('<w:pPr>', `<w:pPr><w:spacing w:before="${ptTw(pt)}" w:after="0" w:line="40" w:lineRule="exact"/>`);
    const cell = (text, o = {}) => ({ c: textPara(text, { align: o.align || 'left' }, o.r || {}), ...o });
    const hcell = (text, o = {}) => ({ c: textPara(text, { align: 'center' }, { b: true, ...(o.r || {}) }), shade: 'F2F2F2', valign: 'center', ...o });
    const lineText = (arr, prefix) => arr.filter(t => String(t).trim()).map((t, i) => sub(prefix(i) + ' ' + t)).join('');

    if (ctx.doc === 'proposal') {
      // ---- แบบเสนอโครงการ: indents follow the template (0.5 inch = 12.7 mm steps)
      const bt = budgetTotals(s), src = s.budgetSources, ns = s.natStrategy, em = s.evalMethods;
      const items = arr => arr.filter(t => String(t).trim());
      const pk = on => run('(') + (on ? inlineImage(boxRids[2].png, 3.1, 3.1, boxRids[2].svg, '✓') : run('   ')) + run(')');
      const amount = v => (+v > 0 ? money(v) : '................................');
      const dash = v => (v ? money(v) : '-');
      const val = v => ((v && String(v).trim()) ? v : '....................');
      const label = (l, v, o = {}) => para(run(l + ' ', B) + run(v), o);
      const heading = (num, title, note, o = {}) => para(run(`${num} ${title}`, B) + (note ? run(` (${note})`) : ''),
        Object.assign({ firstLine: 12.7, keepNext: true, before: 4 }, o));
      const L1 = { indent: 12.7, firstLine: 12.7 };

      body.push(label('โครงการ', s.project.replace(/^โครงการ\s*/, '')));
      body.push(para(run('ลักษณะโครงการ  ', B) + opt(s.projectType === 'continuing', 'โครงการต่อเนื่อง') + opt(s.projectType === 'new', 'โครงการใหม่')));
      body.push(label('กลุ่มงานรับผิดชอบ', s.workGroup));
      body.push(label('สอดคล้องกับนโยบายและจุดเน้น สพฐ.', s.policyFocus));
      body.push(label('ผู้รับผิดชอบโครงการ', s.owner));

      body.push(textPara('1. ความสอดคล้อง', { before: 4, keepNext: true }, B));
      body.push(para(run('1.1 ยุทธศาสตร์ชาติ 20 ปี (Z)') + tab + pk(ns.hr) + run(' ด้านการพัฒนาและเสริมสร้างศักยภาพทรัพยากรมนุษย์'),
        { indent: 63.5, hanging: 50.8, tabs: [{ pos: 63.5 }] }));
      body.push(para(pk(ns.admin) + run(' ด้านการปรับสมดุลและพัฒนาระบบบริหารจัดการภาครัฐ'), { indent: 63.5 }));
      body.push(para(pk(!!ns.other.trim()) + run(' อื่น ๆ (ระบุ) ' + (ns.other.trim() || '......................................................')), { indent: 63.5 }));
      body.push(textPara(`1.2 กลยุทธ์ สพฐ. (X) กลยุทธ์ที่ (ระบุ) ${val(s.obecStrategy)}`, { firstLine: 12.7 }));
      body.push(textPara('1.3 มาตรฐานการศึกษา', { firstLine: 12.7 }));
      body.push(textPara(`1.3.1 คุณภาพผู้เรียน มาตรฐานที่ 1 ตัวบ่งชี้ที่ ${val(s.std1)}`, L1));
      body.push(textPara(`1.3.2 กระบวนการบริหารและการจัดการ มาตรฐานที่ 2 ตัวบ่งชี้ที่ ${val(s.std2)}`, L1));
      body.push(textPara(`1.3.3 กระบวนการจัดการเรียนการสอน มาตรฐานที่ 3 ตัวบ่งชี้ที่ ${val(s.std3)}`, L1));
      body.push(textPara(`1.4 กลยุทธ์ ${or(s.officeShort, 'สพป.')} (X) กลยุทธ์ที่ (ระบุ) ${val(s.areaStrategy)}`, { firstLine: 12.7 }));
      body.push(textPara(`1.5 กลยุทธ์โรงเรียน (X) กลยุทธ์ที่ (ระบุ) ${val(s.schoolStrategy)}`, { firstLine: 12.7 }));
      body.push(textPara(`1.6 นโยบายและจุดเน้น สพฐ. ${val(s.policyFocus)}`, { firstLine: 12.7 }));

      body.push(textPara('2. รายละเอียดโครงการ (X)', { before: 4, keepNext: true }, B));
      body.push(heading('2.1', 'หลักการและเหตุผล', 'แสดงปัญหา เหตุผล ความจำเป็นต้องมีโครงการ และผลประโยชน์ที่จะได้รับจากการดำเนินงานตามโครงการ'));
      body.push(textBlock(s.rationale, Object.assign({ align: 'thaiDistribute' }, L1)));
      body.push(heading('2.2', 'วัตถุประสงค์', 'แสดงความต้องการว่าจะให้เกิดอะไรขึ้น ต้องชัดเจน ปฏิบัติได้ วัดได้ ประเมินได้'));
      items(s.objectives).forEach((o, i) => body.push(textPara(`${i + 1}. ${o}`, L1)));
      body.push(heading('2.3', 'เป้าหมาย', 'ต้องสอดคล้องกับวัตถุประสงค์'));
      body.push(textPara('1) เชิงปริมาณ (ผลผลิต) (ระบุจำนวน ปริมาณของผลงานที่เกิดขึ้นหลังจากดำเนินการเสร็จ)', Object.assign({ keepNext: true }, L1)));
      body.push(textBlock(s.targetQuantity, { indent: 12.7, firstLine: 25.4 }));
      body.push(textPara('2) เชิงคุณภาพ (ผลลัพธ์) (ระบุผลประโยชน์ที่เกิดขึ้นหลังจากดำเนินการเสร็จ)', Object.assign({ keepNext: true }, L1)));
      body.push(textBlock(s.targetQuality, { indent: 12.7, firstLine: 25.4 }));
      body.push(heading('2.4', 'กิจกรรมและวิธีดำเนินงาน'));
      body.push(table([
        [hcell('ที่'), hcell('รายละเอียด/กิจกรรม'), hcell('ระยะเวลา'), hcell('ผู้รับผิดชอบ')],
        ...s.steps.map((st, i) => [cell(`${i + 1}.`, { align: 'center' }), cell(st.activity), cell(st.period, { align: 'center' }), cell(st.owner)])
      ], [13, 67, 35, 45], { headerRows: 1 }));
      body.push(para(run('2.5 ระยะเวลาดำเนินโครงการ', B) + run(` ${val(s.planStart)} – ${val(s.planEnd)}`), { firstLine: 12.7, before: 6 }));
      body.push(para(run('2.6 งบประมาณ', B) + run(` ${money(proposalBudget(s))} บาท`), { firstLine: 12.7, before: 4, keepNext: true }));
      body.push(para(pk(src.teaching > 0) + run(` เงินอุดหนุน (ค่าจัดการเรียนการสอน) จำนวน ${amount(src.teaching)} บาท`), L1));
      body.push(para(pk(src.activity > 0) + run(` เงินอุดหนุน (กิจกรรมพัฒนาผู้เรียน) จำนวน ${amount(src.activity)} บาท`), L1));
      body.push(para(pk(src.income > 0) + run(` เงินรายได้สถานศึกษา จำนวน ${amount(src.income)} บาท`), L1));
      body.push(para(pk(src.other > 0) + run(` อื่น ๆ (ระบุ) ${src.otherName || '........................................'} จำนวน ${amount(src.other)} บาท`), L1));
      body.push(heading('2.7', 'รายละเอียดการใช้งบประมาณ', 'ขอถัวจ่ายทุกรายการ'));
      const sh = { vmerge: 'continue', shade: 'F2F2F2' }, num = (v, o = {}) => cell(dash(v), Object.assign({ align: 'right' }, o));
      body.push(table([
        [hcell('กิจกรรมและรายละเอียด\nการใช้งบประมาณ', { vmerge: 'restart' }), { ...hcell('งบประมาณจำแนกตามรายการ'), span: 3 }, hcell('รวม\nงบประมาณ', { vmerge: 'restart' })],
        [sh, { ...hcell('งบดำเนินงาน'), span: 3 }, sh],
        [sh, hcell('ตอบแทน'), hcell('ใช้สอย'), hcell('วัสดุ'), sh],
        ...bt.rows.filter(r => r.text.trim() || r.total).map((r, i) => [cell(`${i + 1}. ${r.text}`), num(r.comp), num(r.use), num(r.mat), num(r.total)]),
        [{ ...hcell('รวมทั้งสิ้น'), shade: null }, num(bt.comp, { r: B }), num(bt.use, { r: B }), num(bt.mat, { r: B }), num(bt.total, { r: B })]
      ], [51.6, 25.5, 25.5, 25.5, 31.9], { headerRows: 3 }));
      body.push(heading('2.8', 'ดัชนีชี้วัดความสำเร็จ (KPIs)', '', { before: 6 }));
      body.push(para(run('2.8.1 ตัวชี้วัดเชิงปริมาณ', B) + run(' (ความสำเร็จตามวัตถุประสงค์ของโครงการที่สามารถวัดได้เชิงตัวเลข)'), { firstLine: 20, keepNext: true }));
      items(s.indicators).forEach((t, i) => body.push(textPara(`${i + 1}) ${t}`, { firstLine: 38.1 })));
      body.push(para(run('2.8.2 ตัวชี้วัดเชิงคุณภาพ', B) + run(' (การวัดความสำเร็จตามวัตถุประสงค์ของโครงการว่ามีคุณภาพอย่างไร เช่น คุณภาพชีวิต ความพึงพอใจของผู้รับบริการ การเปลี่ยนแปลงพฤติกรรม)'), { firstLine: 20, keepNext: true }));
      items(s.kpiQuality).forEach((t, i) => body.push(textPara(`${i + 1}) ${t}`, { firstLine: 38.1 })));
      body.push(heading('2.9', 'กลุ่มเป้าหมายผู้ได้รับผลประโยชน์'));
      items(s.beneficiaries).forEach((t, i) => body.push(textPara(`2.9.${i + 1} ${t}`, { firstLine: 20 })));
      body.push(heading('2.10', 'การประเมินผลโครงการ'));
      body.push(para(pk(em.survey) + run(' แบบสอบถาม'), L1));
      body.push(para(pk(em.form) + run(' แบบประเมิน'), L1));
      body.push(para(pk(!!em.other.trim()) + run(' อื่น ๆ (ระบุ) ' + (em.other.trim() || '........................................................')), L1));
      body.push(heading('2.11', 'ผลที่คาดว่าจะได้รับ'));
      body.push(textBlock(s.expectedResults, Object.assign({ align: 'thaiDistribute' }, L1)));
      // signatures: one block kept together, centred in the right part of the page like the template's text box
      const sigs = [['ลงชื่อ...................................................ผู้เสนอโครงการ', `( ${s.owner} )`, `${s.ownerPosition}${s.school}`]];
      if (s.deputy.trim()) sigs.push(['ลงชื่อ...................................................ผู้อนุมัติโครงการ', `( ${s.deputy} )`, s.deputyPosition]);
      sigs.push(['ลงชื่อ...................................................ผู้อนุมัติโครงการ', `( ${s.director} )`, s.directorPosition]);
      const lines = sigs.flatMap((blockLines, bi) => blockLines.map((l, li) => ({ l, before: li ? 0 : (bi ? 14 : 20) })));
      lines.forEach((x, k) => body.push(textPara(x.l, { indent: 36, align: 'center', before: x.before, keepNext: k < lines.length - 1 })));
    } else {

    // ---- cover
    if (on('cover')) {
      const pb = page();
      let art = '';
      if (s.coverImage) {
        const im = await imageBytes(s.coverImage).catch(() => null);
        if (im) art += pageImage(addMedia(im.bytes, im.ext), 0, 0, 210, 297); else skipped++;
      } else {
        // vector artwork for Word 2016+, with a PNG fallback for older versions
        const svgSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(A.coverSvg);
        const png = await toPng(svgSrc, 1240, 1754);
        const svgRid = addMedia(enc.encode(A.coverSvg), 'svg');
        art += pageImage(addMedia(png, 'png'), 0, 0, 210, 297, svgRid);
        art += pageImage(addMedia(b64bytes(A.coverLogo), 'png'), 85.4, 8.2, 37.9, 37.9 * 305 / 255);
      }
      const mmPt = mm => mm * 72 / 25.4;
      body.push(para(art + run('การประเมินผลโครงการ', { b: true, sz: 33, color: '3D1B63' }), { align: 'center', before: mmPt(45), pageBreak: pb }));
      body.push(textPara(projectName, { align: 'center', before: mmPt(8) }, { b: true, sz: 28 }));
      body.push(textPara('ปีงบประมาณ ' + s.year, { align: 'center', before: mmPt(3) }, { b: true, sz: 28 }));
      body.push(textPara('หัวหน้าโครงการ / ผู้รับผิดชอบโครงการ', { align: 'center', before: mmPt(24) }, { b: true, sz: 24 }));
      body.push(textPara(owner, { align: 'center' }, { b: true, sz: 24 }));
      body.push(textPara(s.school + '\n' + s.office, { align: 'center', before: mmPt(27) }, { b: true, sz: 24 }));
    }

    // ---- preface
    if (on('preface')) {
      body.push(H('คำนำ', 18, { pageBreak: page() }));
      body.push(textBlock(fill(s.preface), { align: 'thaiDistribute', firstLine: 12.5, before: 4 }));
      body.push(textPara(s.school, { align: 'right', before: 24 }));
    }

    // ---- memo
    if (on('memo')) {
      const pb = page();
      const garuda = addMedia(b64bytes(A.garuda), 'png');
      body.push(para(inlineImage(garuda, 15, 15 * 173 / 179) + tab + run('บันทึกข้อความ', { b: true, sz: 29 }),
        { pageBreak: pb, tabs: [{ pos: CONTENT_MM / 2, val: 'center' }], after: 4 }));
      body.push(para(run('ส่วนราชการ ', { b: true, sz: 20 }) + run(`${s.school} ${s.office}`), { border: true }));
      body.push(para(run('ที่ ', { b: true, sz: 20 }) + run(s.memoNo || '') + tab + run('วันที่ ', { b: true, sz: 20 }) + run(s.memoDate || ''),
        { border: true, tabs: [{ pos: 80 }] }));
      body.push(para(run('เรื่อง ', { b: true, sz: 20 }) + run(s.project), { border: true, after: 6 }));
      body.push(para(run('เรียน ', B) + run(or(s.directorPosition, 'ผู้อำนวยการโรงเรียน'))));
      body.push(textPara(`ด้วยข้าพเจ้าได้รับมอบหมายให้รับผิดชอบ${s.project} ใน${s.workGroup} ประจำปีงบประมาณ ${s.year} ได้ดำเนินการตามแผนเสร็จสิ้นโครงการแล้ว จึงขอรายงานผลการปฏิบัติงาน โดยแนบเอกสารการประเมินผลการปฏิบัติงานตาม${s.project} มากับหนังสือนี้`,
        { align: 'thaiDistribute', firstLine: 12.5, before: 4 }));
      body.push(head('ปัญหาและอุปสรรคในการดำเนินโครงการ/กิจกรรม'));
      body.push(textBlock(or(s.memoProblems, '-'), { firstLine: 12.5 }));
      body.push(head('ข้อเสนอแนะ', { before: 0 }));
      body.push(textBlock(or(s.memoSuggestions, '-'), { firstLine: 12.5 }));
      body.push(textPara('จึงเรียนมาเพื่อโปรดทราบและพิจารณา', { firstLine: 12.5, before: 4 }));
      body.push(signRight(['(ลงชื่อ)..............................................................', `(${owner})`,
        'ผู้รับผิดชอบโครงการ/กิจกรรม', `ตำแหน่ง${s.ownerPosition} ${s.school}`]));
    }

    // ---- report
    if (on('report')) {
      const diff = (+s.budgetPlan || 0) - (+s.budgetActual || 0);
      body.push(H(`รายงานผลการปฏิบัติงานตามโครงการ / กิจกรรม ${s.school} ปีงบประมาณ ${s.year}`, 18, { pageBreak: page(), after: 0 }));
      body.push(rule());
      body.push(para(run('ชื่อโครงการ  ', B) + run(s.project)));
      body.push(para(run('ลักษณะโครงการ  ', B) + opt(s.projectType === 'new', 'ใหม่') + opt(s.projectType === 'continuing', 'ต่อเนื่อง')));
      body.push(para(run('ผู้รับผิดชอบ  ', B) + run(owner + '    ') + run('กลุ่มงาน ', B) + run(s.workGroup)));
      body.push(rule());
      body.push(head('1. วัตถุประสงค์', { before: 0 }));
      body.push(lineText(s.objectives, i => `${i + 1}.`));
      body.push(head('2. การดำเนินการ'));
      body.push(para(opt(s.status === 'done', 'ดำเนินการแล้วเสร็จ') + opt(s.status === 'doing', 'กำลังดำเนินการ') + opt(s.status === 'notyet', 'ยังไม่ได้ดำเนินการ'), { indent: 8 }));
      body.push(head('3. ระยะเวลาในการดำเนินการ'));
      body.push(sub(`3.1 เวลาดำเนินการตามแผน เริ่ม ${s.planStart || '..........'} – ${s.planEnd || '..........'}`));
      body.push(sub(`3.2 สรุปเวลาดำเนินการจริง เริ่ม ${s.actualStart || '..........'} – ${s.actualEnd || '..........'}`));
      body.push(para(opt(s.timing === 'onplan', 'ตามแผน') + opt(s.timing === 'early', 'เร็วกว่าแผน') + opt(s.timing === 'late', 'ช้ากว่าแผน') +
        (s.timing === 'late' ? run('เพราะ ' + (s.lateReason || '....................')) : ''), { indent: 16 }));
      body.push(head('4. บุคคลที่เกี่ยวข้องในการจัดกิจกรรม'));
      body.push(lineText(s.participants, i => `4.${i + 1}`));
      body.push(head('5. ขั้นตอนการปฏิบัติงานการจัดกิจกรรม ให้สำเร็จลุล่วงตามวัตถุประสงค์ของโครงการ และรายงานผลดังนี้'));
      body.push(table([
        [hcell('ที่'), hcell('รายละเอียด/กิจกรรม'), hcell('ระยะเวลา'), hcell('ผู้รับผิดชอบ')],
        ...s.steps.map((st, i) => [cell(`${i + 1}.`, { align: 'center' }), cell(st.activity), cell(st.period, { align: 'center' }), cell(st.owner)])
      ], [13, 67, 35, 45], { headerRows: 1 }));
      body.push(head('6. งบประมาณ'));
      body.push(sub(`6.1 งบประมาณที่จัดสรรตามแผน ${money(s.budgetPlan)} บาท`));
      body.push(sub(`6.2 งบประมาณที่ใช้จริง ${money(s.budgetActual)} บาท`));
      body.push(sub('6.3 สรุปการใช้จ่ายงบประมาณ'));
      body.push(para(opt(diff === 0, 'ตามแผน') + opt(diff > 0, `ต่ำกว่าแผน ${diff > 0 ? money(diff) : '.........'} บาท`) +
        opt(diff < 0, `สูงกว่าแผน ${diff < 0 ? money(-diff) : '.........'} บาท`), { indent: 16 }));
      body.push(head('7. ตัวชี้วัดความสำเร็จของกิจกรรม (เป้าหมาย)'));
      body.push(lineText(s.indicators, i => `7.${i + 1}`));
      body.push(head(`8. ผลสำเร็จที่ปฏิบัติได้ตามตัวชี้วัด คิดเป็นร้อยละ ${fmt2(ev.total)}`, { keepNext: false }));
      body.push(head('9. สรุปผลการประเมินโดยรวมของงาน/กิจกรรม/โครงการ (สรุปมาจากแบบประเมินความพึงพอใจ)'));
      body.push(para(run('สรุปผลการประเมินได้ร้อยละ ') + run(fmt2(sat.total), B) + run(' ระดับคุณภาพ ') + run(qualityLevel(sat.total), B), { indent: 8, keepNext: true }));
      body.push(table([
        [hcell('เกณฑ์การประเมิน (ร้อยละ)'), hcell('ระดับคุณภาพ')],
        ...[['0 – 59', 'ปรับปรุง'], ['60 – 69', 'พอใช้'], ['70 – 79', 'ดี'], ['80 – 100', 'ดีมาก']]
          .map(([a, b]) => [cell(a, { align: 'center' }), cell(b, { align: 'center' })])
      ], [56, 56], { indent: 16 }));
      [['10. สภาพปัญหา / อุปสรรค / กิจกรรม / โครงการ', s.problems], ['11. จุดเด่นของงาน / กิจกรรม / โครงการ', s.strengths],
        ['12. จุดด้อยของงาน / กิจกรรม / โครงการ', s.weaknesses], ['13. ข้อเสนอแนะ เพื่อนำไปพัฒนาครั้งต่อไป', s.improvements]]
        .forEach(([h, t], i) => { body.push(head(h, i ? { before: 0 } : {})); body.push(block(t)); });
      body.push(signRight(['ลงชื่อ...............................................ผู้รายงาน', `(${owner})`]));
      body.push(head('14. ความคิดเห็นผู้บริหาร'));
      if (s.directorComment && s.directorComment.trim()) body.push(textBlock(s.directorComment, { indent: 8, keepNext: true }));
      else body.push(para('', { border: true, keepNext: true }) + para('', { border: true, keepNext: true }));
      body.push(signRight(['ลงชื่อ................................................', `(${s.director})`, s.directorPosition]));
    }

    // ---- sub covers
    const subCover = title => {
      const mmPt = mm => mm * 72 / 25.4;
      body.push(textPara(title, { align: 'center', before: mmPt(15), pageBreak: page() }, { b: true, sz: 24 }));
      [projectName, school2, 'ปีงบประมาณ ' + s.year].forEach(t => body.push(textPara(t, { align: 'center' }, { b: true, sz: 22 })));
      body.push(textPara(`${owner}\n${s.ownerPosition} ${school2}`, { align: 'center', before: mmPt(62) }, { sz: 22 }));
      body.push(textPara(`${s.office}\n${s.obec}\n${s.ministry}`, { align: 'center', before: mmPt(62) }, { b: true, sz: 22 }));
    };
    if (on('coverSummary')) subCover('สรุปและรายงานโครงการ');

    const twoSign = () => signTwo(['(ลงชื่อ)............................................................', `(${owner})`, 'ผู้รายงาน'],
      ['(ลงชื่อ)............................................................', `(${s.director})`, s.directorPosition]);

    // ---- follow-up form
    if (on('followup')) {
      body.push(H('แบบติดตามและประเมินผลเมื่อสิ้นสุดโครงการ', 18, { pageBreak: page(), after: 0 }));
      body.push(H(`ปีงบประมาณ ${s.year}\n${school2}`));
      body.push(para(run('ชื่อโครงการ  ', B) + run(s.project), { before: 4 }));
      body.push(head('1. การดำเนินการ'));
      body.push(sub('เริ่มดำเนินงาน ดังต่อไปนี้'));
      body.push(lineText(s.followSteps, i => `1.${i + 1}`));
      body.push(head('2. ปัญหาและอุปสรรคในการดำเนินงาน')); body.push(block(s.followProblems));
      body.push(head('3. วิธีการแก้ไข')); body.push(block(s.followSolutions));
      body.push(head('4. สรุปผลการดำเนินงาน'));
      body.push(lineText(s.followResults, i => `${i + 1})`) || sub('-'));
      body.push(head('5. ข้อเสนอแนะในการดำเนินงานครั้งต่อไป')); body.push(block(s.followSuggestions));
      body.push(spacer(18)); body.push(twoSign());
    }

    const evaluators = () => para(run('ผู้ประเมิน  ', B) + opt(s.evaluators.teacher, 'ครู') + opt(s.evaluators.student, 'นักเรียน') + opt(s.evaluators.parent, 'ผู้ปกครอง'),
      { align: 'center', before: 4, after: 4 });
    const ratingTable = (items, sum, heading) => {
      const num = v => (v ? fmt(v) : '');
      const lvl = l => ({ c: textPara(`${l.label}\n${l.score}`, { align: 'center' }, { b: true, sz: 14 }), shade: 'F2F2F2', valign: 'center' });
      const foot = (label, vals, f) => [{ ...hcell(label), span: 2, shade: null }, ...vals.map(v => cell(f(v), { align: 'center', r: B }))];
      return table([
        [hcell('ที่', { vmerge: 'restart' }), hcell('รายการ', { vmerge: 'restart' }), { ...hcell(heading), span: 5 }],
        [{ vmerge: 'continue', shade: 'F2F2F2' }, { vmerge: 'continue', shade: 'F2F2F2' }, ...LEVELS.map(lvl)],
        ...items.map((it, i) => [cell(`${i + 1}.`, { align: 'center' }), cell(it.text), ...it.c.map(v => cell(num(+v || 0), { align: 'center' }))]),
        foot('รวมค่าความถี่', sum.freq, num),
        foot('รวมค่าความถี่ x คะแนนเต็ม', sum.weighted, num),
        foot('ร้อยละ', sum.pct, v => (v ? fmt2(v) : ''))
      ], [11, 69, 16, 16, 16, 16, 16], { headerRows: 2 }) + textPara(`จำนวนผู้ประเมิน ${sum.respondents} คน`, {}, { sz: 14 });
    };
    const collector = () => signRight([`(ลงชื่อ) ............................................................. ผู้รวบรวมข้อมูล`, `( ${owner} )`], 40);

    if (on('evalTable')) {
      body.push(H(`แบบสรุปการประเมินผลการปฏิบัติการ${s.project}\n${s.school} ปีงบประมาณ ${s.year}`, 18, { pageBreak: page() }));
      body.push(evaluators());
      body.push(ratingTable(s.evalItems, ev, 'ระดับความสำเร็จ'));
      body.push(textPara(`สรุปความสำเร็จของ${s.project} คิดเป็นร้อยละ ${fmt2(ev.total)}`, { align: 'center', before: 6 }, B));
      body.push(collector());
    }

    if (on('coverSat')) subCover('สรุปและรายงานผลการประเมินความพึงพอใจ');

    if (on('satReport')) {
      const lv = satLevel(sat.total);
      const groups = [s.evaluators.teacher && 'คณะครู', s.evaluators.student && 'นักเรียน', s.evaluators.parent && 'ผู้ปกครองนักเรียน'].filter(Boolean);
      body.push(H('รายงานผลการประเมินความพึงพอใจ', 18, { pageBreak: page(), after: 0 }));
      body.push(H(s.project));
      body.push(textBlock(fill(s.satIntro), { align: 'thaiDistribute', firstLine: 12.5, before: 4 }));
      groups.forEach((g, i) => body.push(sub(`${i + 1}. ${g}`)));
      body.push(textPara(`เป็นการสุ่มตัวอย่างของประชากรที่ใช้ในการประเมิน ${sat.respondents} คน และได้สร้างเกณฑ์มาตรฐานความพึงพอใจ 5 ระดับ ดังนี้`,
        { align: 'thaiDistribute', firstLine: 12.5, before: 4, after: 4, keepNext: true }));
      body.push(table([
        [hcell('ค่าเฉลี่ยร้อยละ'), hcell('การแปลค่า'), hcell('ระดับความพึงพอใจ')],
        ...[['80 - 100', 'มีความพึงพอใจมากที่สุด', 5], ['70 - 79', 'มีความพึงพอใจมาก', 4], ['60 - 69', 'มีความพึงพอใจปานกลาง', 3],
          ['50 - 59', 'มีความพึงพอใจน้อย', 2], ['0 - 49', 'มีความพึงพอใจน้อยที่สุด', 1]]
          .map(([a, b, c]) => [cell(a, { align: 'center' }), cell(b), cell(String(c), { align: 'center' })])
      ], [36, 64, 36], { center: true }));
      body.push(para(run(`จากการสรุปผลการประเมินความพึงพอใจ${s.project} ปีงบประมาณ ${s.year} ได้ค่าเฉลี่ยร้อยละ `) + run(fmt2(sat.total), B) +
        run(` เมื่อเปรียบเทียบกับมาตรฐานความพึงพอใจ สรุปได้ว่า${s.project} มีความพึงพอใจ`) + run(lv.text, B) +
        run(' การดำเนินงานและความพึงพอใจโครงการอยู่ในเกณฑ์มาตรฐานระดับ ') + run(String(lv.level), B),
        { align: 'thaiDistribute', firstLine: 12.5, before: 6 }));
      body.push(spacer(18)); body.push(twoSign());
    }

    if (on('satTable')) {
      body.push(H(`แบบสรุปความพึงพอใจของ${s.project}\n${s.school} ปีงบประมาณ ${s.year}`, 18, { pageBreak: page() }));
      body.push(evaluators());
      body.push(ratingTable(s.satItems, sat, 'ระดับความพึงพอใจ'));
      body.push(textPara(`สรุปความพึงพอใจของ${s.project} คิดเป็นร้อยละ ${fmt2(sat.total)}`, { align: 'center', before: 6 }, B));
      body.push(collector());
    }

    // ---- appendix: same layout and sizes as the PDF
    if (on('appendix') && s.photos.length) {
      const per = parseInt(s.photosPerPage, 10) || 2;
      const [boxW, maxH] = PHOTO_BOX[per] || PHOTO_BOX[2];
      const figs = [];
      for (const p of s.photos) {
        const im = await imageBytes(p.src).catch(() => null);
        const d = im && await getDims(p.src);
        if (!im || !d) { skipped++; continue; }
        const wMm = printedWidth(d, boxW, maxH);
        figs.push(para(inlineImage(addMedia(im.bytes, im.ext), wMm, wMm * d.h / d.w), { align: 'center', keepNext: !!p.caption }) +
          (p.caption ? textPara(p.caption, { align: 'center' }, { sz: 14 }) : ''));
      }
      for (let i = 0; i < figs.length; i += per) {
        body.push(H(s.appendixTitle, 18, { pageBreak: page(), after: 0 }));
        body.push(textPara(`${s.project} ${school2} ปีงบประมาณ ${s.year}`, { align: 'center', after: 6 }));
        const chunk = figs.slice(i, i + per);
        if (per <= 2) chunk.forEach((f, j) => { if (j) body.push(spacer(10)); body.push(f); });
        else {
          const rows = [];
          for (let j = 0; j < chunk.length; j += 2) rows.push([{ c: chunk[j] }, { c: chunk[j + 1] || para('') }]);
          body.push(table(rows, [80, 80], { borders: false }));
        }
      }
    }

    } // end of the summary report

    if (!body.length) body.push(textPara('ยังไม่ได้เลือกหน้าที่จะแสดง', { align: 'center' }));

    // ---- package
    const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${tw(25)}" w:right="${tw(20)}" w:bottom="${tw(20)}" w:left="${tw(30)}" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOC_NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;
    const fontR = obfuscatedFont(b64bytes(A.fontRegular)), fontB = obfuscatedFont(b64bytes(A.fontBold));
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}>` +
      `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:eastAsia="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>` +
      `<w:sz w:val="32"/><w:szCs w:val="32"/><w:lang w:val="th-TH" w:eastAsia="en-US" w:bidi="th-TH"/></w:rPr></w:rPrDefault>` +
      `<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
      `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/>` +
      `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>` +
      `<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W_NS}><w:embedTrueTypeFonts/>` +
      `<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
      `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const fontTable = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts ${W_NS}>` +
      `<w:font w:name="${FONT}"><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/>` +
      `<w:embedRegular r:id="rIdFont1" w:fontKey="${fontR.key}"/><w:embedBold r:id="rIdFont2" w:fontKey="${fontB.key}"/></w:font>` +
      `</w:fonts>`;
    const xmlHead = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const relsXml = list => `${xmlHead}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.join('')}</Relationships>`;
    const title = x(`${ctx.doc === 'proposal' ? 'แบบเสนอโครงการ' : 'สรุปโครงการ'} ${s.project || ''} ปีงบประมาณ ${s.year}`);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `${xmlHead}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
      `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${title}</dc:title><dc:creator>${x(s.owner || '')}</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const types = `${xmlHead}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="svg" ContentType="image/svg+xml"/>` +
      `<Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
      `<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const t = str => ({ data: enc.encode(str), compress: true });
    const blob = await zip([
      { name: '[Content_Types].xml', ...t(types) },
      { name: '_rels/.rels', ...t(relsXml([`<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>`,
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`])) },
      { name: 'docProps/core.xml', ...t(core) },
      { name: 'word/document.xml', ...t(documentXml) },
      { name: 'word/_rels/document.xml.rels', ...t(relsXml([
        `<Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/>`,
        `<Relationship Id="rIdSettings" Type="${REL}/settings" Target="settings.xml"/>`,
        `<Relationship Id="rIdFonts" Type="${REL}/fontTable" Target="fontTable.xml"/>`, ...rels])) },
      { name: 'word/styles.xml', ...t(styles) },
      { name: 'word/settings.xml', ...t(settings) },
      { name: 'word/fontTable.xml', ...t(fontTable) },
      { name: 'word/_rels/fontTable.xml.rels', ...t(relsXml([
        `<Relationship Id="rIdFont1" Type="${REL}/font" Target="fonts/font1.odttf"/>`,
        `<Relationship Id="rIdFont2" Type="${REL}/font" Target="fonts/font2.odttf"/>`])) },
      { name: 'word/fonts/font1.odttf', data: fontR.data, compress: true },
      { name: 'word/fonts/font2.odttf', data: fontB.data, compress: true },
      ...media.map(m => ({ name: m.name, data: m.data, compress: /\.svg$/.test(m.name) }))
    ]);
    return { blob, skipped };
  }

  window.ProjectDocx = { build };
})();
