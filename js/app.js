/* ระบบสรุปโครงการ — สร้างรายงานการประเมินผลโครงการจากแบบฟอร์ม และบันทึกเป็น PDF */
(function () {
  'use strict';

  const STORAGE_KEY = 'project-summary:v1';
  const UI_KEY = 'project-summary:ui';
  const DEFAULT_COVER = 'assets/cover-bg.jpg';
  const DEFAULT_LOGO = 'assets/school-logo.png';
  const LEVELS = [
    { score: 5, label: 'มากที่สุด' },
    { score: 4, label: 'มาก' },
    { score: 3, label: 'ปานกลาง' },
    { score: 2, label: 'น้อย' },
    { score: 1, label: 'น้อยที่สุด' }
  ];

  const SECTIONS = [
    ['cover', 'ปกรายงาน'],
    ['preface', 'คำนำ'],
    ['memo', 'บันทึกข้อความ'],
    ['report', 'รายงานผลการปฏิบัติงาน'],
    ['coverSummary', 'ปกสรุปและรายงานโครงการ'],
    ['followup', 'แบบติดตามและประเมินผล'],
    ['evalTable', 'แบบสรุปการประเมินผล'],
    ['coverSat', 'ปกรายงานความพึงพอใจ'],
    ['satReport', 'รายงานผลความพึงพอใจ'],
    ['satTable', 'แบบสรุปความพึงพอใจ'],
    ['appendix', 'ภาคผนวก (ภาพกิจกรรม)']
  ];

  const DEFAULT_PREFACE = [
    'รายงานการประเมินผลโครงการตามแผนปฏิบัติการ ปี {year} ฉบับนี้ เป็นการสรุปรวบรวมข้อมูล/สารสนเทศ ร่องรอยหลักฐานการดำเนินงานตามโครงการ โดยทางโรงเรียนได้ให้ความสำคัญของการบริหารงานตามวงจรคุณภาพ PDCA ประกอบด้วย',
    'P = Plan หมายถึง การวางแผนจากวัตถุประสงค์ และเป้าหมายที่ได้กำหนดขึ้น\nD = Do หมายถึง การปฏิบัติตามแผนที่ได้เขียนไว้อย่างเป็นระบบและมีความต่อเนื่อง\nC = Check หมายถึง การตรวจสอบผลการดำเนินงานในแต่ละขั้นตอนของแผนงานว่ามีปัญหาอะไรเกิดขึ้น จำเป็นต้องเปลี่ยนแปลงแก้ไขในขั้นตอนใดบ้าง\nA = Action หมายถึง การดำเนินการให้เหมาะสม เพื่อใช้ในการทำงานครั้งต่อไป',
    'เมื่อได้วางแผน (P) นำไปปฏิบัติ (D) ระหว่างปฏิบัติก็ตรวจสอบ (C) พบปัญหาก็ทำการแก้ไขหรือปรับปรุง (A) การปรับปรุงก็เริ่มจากการวางแผนก่อน วนไปเรื่อย ๆ ซึ่งทางโรงเรียนได้ดำเนินการตามกิจกรรมเชิงประจักษ์แยกเป็นส่วน ๆ ตามโครงการอย่างชัดเจน',
    'ขอขอบคุณ คุณครูผู้รับผิดชอบโครงการ ผู้มีส่วนเกี่ยวข้องทุกท่าน หวังว่าเอกสารรายงานการประเมินผลโครงการ ฉบับนี้ จะเป็นประโยชน์แก่คณะทำงานที่มีส่วนร่วมผลักดันวงจรคุณภาพ PDCA ไม่ให้หยุดหรือจบลงเพื่อจะหมุนไปข้างหน้าเรื่อย ๆ'
  ].join('\n\n');

  const DEFAULT_SAT_INTRO = '{project}มีกิจกรรมในด้านต่าง ๆ หลายด้าน และเมื่อปฏิบัติกิจกรรมแต่ละกิจกรรมแล้ว จึงมีการประเมินความพึงพอใจกิจกรรมดังกล่าว เกิดความพึงพอใจต่อ ครู นักเรียน ผู้ปกครองนักเรียนอย่างไร โดยใช้บุคลากรต่าง ๆ ดังนี้';

  function blankState() {
    return {
      project: '', year: String(new Date().getFullYear() + 543), workGroup: '',
      projectType: 'new', status: 'done',
      owner: '', ownerPosition: 'ครู',
      school: '', schoolFull: '', office: '',
      obec: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน', ministry: 'กระทรวงศึกษาธิการ',
      director: '', directorPosition: '',
      preface: DEFAULT_PREFACE,
      memoNo: '', memoDate: '', memoProblems: '-', memoSuggestions: '-',
      objectives: [''],
      planStart: '', planEnd: '', actualStart: '', actualEnd: '',
      timing: 'onplan', lateReason: '',
      participants: [''],
      steps: [
        { activity: 'เสนอโครงการเพื่ออนุมัติ', period: '', owner: '' },
        { activity: 'แต่งตั้งคณะกรรมการดำเนินงาน', period: '', owner: '' },
        { activity: 'ดำเนินงานตามโครงการ', period: '', owner: '' },
        { activity: 'ติดตามผลและประเมินผล', period: '', owner: '' },
        { activity: 'สรุปผลและรายงานผลตามโครงการ', period: '', owner: '' }
      ],
      budgetPlan: 0, budgetActual: 0,
      indicators: [''],
      problems: '-', strengths: '-', weaknesses: '-', improvements: '-', directorComment: '',
      followSteps: ['เสนอและขออนุมัติโครงการ', 'แต่งตั้งคณะกรรมการดำเนินงาน', 'ปฏิบัติตามแผนกิจกรรม', 'สรุป ประเมินผลรายงาน'],
      followProblems: '-', followSolutions: '-', followResults: [''], followSuggestions: '-',
      evaluators: { teacher: true, student: true, parent: true },
      evalItems: [
        { text: 'มีการวางแผนการปฏิบัติงาน', c: [0, 0, 0, 0, 0] },
        { text: 'ดำเนินการตามแผนปฏิบัติงาน', c: [0, 0, 0, 0, 0] },
        { text: 'ความร่วมมือของผู้ที่เกี่ยวข้อง', c: [0, 0, 0, 0, 0] },
        { text: 'งานสำเร็จบรรลุวัตถุประสงค์', c: [0, 0, 0, 0, 0] }
      ],
      satIntro: DEFAULT_SAT_INTRO,
      satItems: [
        { text: 'วัสดุ อุปกรณ์เพียงพอต่อการใช้งาน', c: [0, 0, 0, 0, 0] },
        { text: 'งานเสร็จตามที่กำหนด', c: [0, 0, 0, 0, 0] },
        { text: 'ความแข็งแรงและปลอดภัยที่ได้รับ', c: [0, 0, 0, 0, 0] },
        { text: 'การสร้างเสริมภูมิทัศน์และการพัฒนาอาคารสถานที่', c: [0, 0, 0, 0, 0] }
      ],
      appendixTitle: 'ภาคผนวก ภาพกิจกรรม',
      photosPerPage: '2',
      photos: [],
      coverImage: '', logoImage: '',
      sections: Object.fromEntries(SECTIONS.map(([k]) => [k, true]))
    };
  }

  function sampleState() {
    const owner = 'นายเบญจรงค์  นุ่มวัฒนะ';
    return Object.assign(blankState(), {
      project: 'โครงการเข้าค่ายพักแรมลูกเสือ - เนตรนารี', year: '2568', workGroup: 'งานบริหารทั่วไป',
      projectType: 'continuing', status: 'done',
      owner, ownerPosition: 'ครู',
      school: 'โรงเรียนวัดปรีดาราม', schoolFull: 'โรงเรียนวัดปรีดาราม (มณีศิริวรรณ)',
      office: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษานครปฐม เขต 2',
      director: 'นางสาวธิญดา  โชติรุจิธนกุล', directorPosition: 'ผู้อำนวยการโรงเรียนวัดปรีดาราม',
      memoNo: '     /2568', memoDate: '30 กันยายน พ.ศ. 2568',
      objectives: [
        'เพื่อส่งเสริมให้ลูกเสือ-เนตรนารี ได้รับความรู้ในวิชาลูกเสือ-เนตรนารี และสามารถนำประสบการณ์ที่ได้เรียนไปใช้ในชีวิตประจำวัน',
        'เพื่อส่งเสริมให้ลูกเสือ-เนตรนารี ได้ปฏิบัติกิจกรรมการอยู่ค่ายพักแรมและได้รับประสบการณ์ตรงในการอยู่ร่วมกัน'
      ],
      planStart: 'ตุลาคม 2567', planEnd: 'กันยายน 2568', actualStart: 'ตุลาคม 2567', actualEnd: 'กันยายน 2568',
      timing: 'onplan',
      participants: ['นักเรียนชั้นประถมศึกษาปีที่ 1 – 6 จำนวน 176 คน', 'คณะครูโรงเรียนวัดปรีดาราม จำนวน 12 คน'],
      steps: [
        { activity: 'เสนอโครงการเพื่ออนุมัติ', period: 'ต.ค. 67', owner: 'นายเบญจรงค์ นุ่มวัฒนะ' },
        { activity: 'ประชุมผู้กำกับ รองผู้กำกับ', period: 'ต.ค. 67', owner: 'นายเบญจรงค์ นุ่มวัฒนะ' },
        { activity: 'แต่งตั้งคณะกรรมการดำเนินงาน', period: 'ต.ค. 67', owner: 'ผู้อำนวยการ' },
        { activity: 'ประสานงานกับครูลูกเสือในกลุ่ม', period: 'ธ.ค. 67', owner: 'นายเบญจรงค์ นุ่มวัฒนะ' },
        { activity: 'ดำเนินงานตามโครงการ', period: 'ธ.ค. 67 – ม.ค. 68', owner: 'คณะกรรมการ' },
        { activity: 'ติดตามผลและประเมินผล', period: 'ส.ค. 68', owner: 'นายเบญจรงค์ นุ่มวัฒนะ' },
        { activity: 'สรุปผลและรายงานผลตามโครงการ', period: 'ก.ย. 68', owner: 'นายเบญจรงค์ นุ่มวัฒนะ' }
      ],
      budgetPlan: 56305, budgetActual: 55730,
      indicators: [
        'ลูกเสือและเนตรนารีชั้นประถมศึกษาปีที่ 1 - 6 สามารถสอบผ่านวิชาลูกเสือ ร้อยละ 100',
        'นักเรียน ชั้น ป.1-6 เข้าร่วมกิจกรรม การเข้าค่ายพักแรมลูกเสือ – เนตรนารี ร้อยละ 100'
      ],
      followResults: ['ลูกเสือและเนตรนารีชั้นประถมศึกษาปีที่ 1 - 6 สามารถสอบผ่านหลักสูตร ร้อยละ 100'],
      evalItems: [
        { text: 'มีการวางแผนการปฏิบัติงาน', c: [15, 13, 2, 0, 0] },
        { text: 'ดำเนินการตามแผนปฏิบัติงาน', c: [14, 13, 3, 0, 0] },
        { text: 'ความร่วมมือของผู้ที่เกี่ยวข้อง', c: [12, 15, 3, 0, 0] },
        { text: 'งานสำเร็จบรรลุวัตถุประสงค์', c: [25, 5, 0, 0, 0] }
      ],
      satItems: [
        { text: 'วัสดุ อุปกรณ์เพียงพอต่อการใช้งาน', c: [13, 15, 2, 0, 0] },
        { text: 'งานเสร็จตามที่กำหนด', c: [12, 16, 2, 0, 0] },
        { text: 'ความแข็งแรงและปลอดภัยที่ได้รับ', c: [13, 16, 1, 0, 0] },
        { text: 'การสร้างเสริมภูมิทัศน์และการพัฒนาอาคารสถานที่', c: [15, 15, 0, 0, 0] }
      ],
      photosPerPage: '1',
      photos: [
        { src: 'assets/sample-photo-1.jpg', caption: '' },
        { src: 'assets/sample-photo-2.jpg', caption: '' }
      ]
    });
  }

  // ---------------------------------------------------------------- state
  let state = load() || sampleState();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalize(JSON.parse(raw));
    } catch (e) { return null; }
  }

  // Fill in any keys missing from older/imported data so rendering never breaks.
  function normalize(data) {
    const base = blankState();
    const out = Object.assign(base, data || {});
    out.evaluators = Object.assign(blankState().evaluators, out.evaluators || {});
    out.sections = Object.assign(blankState().sections, out.sections || {});
    ['objectives', 'participants', 'indicators', 'followSteps', 'followResults', 'steps', 'evalItems', 'satItems', 'photos']
      .forEach(k => { if (!Array.isArray(out[k])) out[k] = base[k]; });
    ['evalItems', 'satItems'].forEach(k => {
      out[k] = out[k].map(it => ({ text: it.text || '', c: LEVELS.map((_, i) => toNum(it.c && it.c[i])) }));
    });
    return out;
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const el = document.getElementById('saveStatus');
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        el.textContent = 'บันทึกอัตโนมัติในเบราว์เซอร์แล้ว ' + new Date().toLocaleTimeString('th-TH');
      } catch (e) {
        el.textContent = 'บันทึกอัตโนมัติไม่สำเร็จ (ข้อมูล/รูปภาพมีขนาดใหญ่) — กรุณาใช้ "ส่งออกข้อมูล" เพื่อเก็บไฟล์';
      }
    }, 400);
  }

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toNum(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2); }
  function fmt2(n) { return n.toFixed(2); }
  function money(n) { return toNum(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }
  function or(v, fallback) { return (v && String(v).trim()) ? v : fallback; }
  function fill(text) {
    return String(text || '')
      .replace(/\{project\}/g, state.project)
      .replace(/\{year\}/g, state.year)
      .replace(/\{school\}/g, state.school);
  }
  function paras(text, cls = 'indent justify') {
    return String(text || '').split(/\n\s*\n/).filter(p => p.trim())
      .map(p => `<p class="${cls}">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  const cb = on => `<span class="cb${on ? ' on' : ''}"></span>`;
  const opt = (on, label) => `<span class="opt">${cb(on)}${label}</span>`;
  const blank = (v, w = '8em') => (v && String(v).trim()) ? esc(v) : `<span class="dots" style="min-width:${w}">&nbsp;</span>`;

  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function setPath(obj, path, val) {
    const ks = path.split('.'); const last = ks.pop();
    ks.reduce((o, k) => (o[k] = o[k] || {}), obj)[last] = val;
  }

  // ---------------------------------------------------------------- calculations
  function ratingSummary(items) {
    const freq = LEVELS.map((_, i) => items.reduce((s, it) => s + toNum(it.c[i]), 0));
    const weighted = freq.map((f, i) => f * LEVELS[i].score);
    const respondents = items.reduce((m, it) => Math.max(m, it.c.reduce((s, x) => s + toNum(x), 0)), 0);
    const max = respondents * items.length * 5;
    const pct = weighted.map(w => (max ? (w / max) * 100 : 0));
    const total = pct.reduce((s, x) => s + x, 0);
    return { freq, weighted, pct, total, respondents };
  }
  function qualityLevel(p) {
    if (p >= 80) return 'ดีมาก';
    if (p >= 70) return 'ดี';
    if (p >= 60) return 'พอใช้';
    return 'ปรับปรุง';
  }
  function satLevel(p) {
    if (p >= 80) return { level: 5, text: 'มากที่สุด' };
    if (p >= 70) return { level: 4, text: 'มาก' };
    if (p >= 60) return { level: 3, text: 'ปานกลาง' };
    if (p >= 50) return { level: 2, text: 'น้อย' };
    return { level: 1, text: 'น้อยที่สุด' };
  }

  // ---------------------------------------------------------------- document rendering
  function render() {
    const s = state;
    const ev = ratingSummary(s.evalItems);
    const sat = ratingSummary(s.satItems);
    const pages = [];
    const on = k => s.sections[k] !== false;
    const projectName = or(s.project, 'ชื่อโครงการ');
    const ownerLine = esc(or(s.owner, ''));

    if (on('cover')) {
      pages.push(`
      <div class="sheet cover cover-main">
        <img class="cover-bg" src="${esc(s.coverImage || DEFAULT_COVER)}" alt="">
        <div class="c-title">การประเมินผลโครงการ</div>
        <div class="c-project">${esc(projectName)}</div>
        <div class="c-year">ปีงบประมาณ ${esc(s.year)}</div>
        <div class="c-owner-label">หัวหน้าโครงการ / ผู้รับผิดชอบโครงการ</div>
        <div class="c-owner">${ownerLine}</div>
        <div class="c-school">${esc(s.school)}<br>${esc(s.office)}</div>
      </div>`);
    }

    if (on('preface')) {
      pages.push(`
      <div class="sheet">
        <h2 class="center">คำนำ</h2>
        <div class="section">${paras(fill(s.preface))}</div>
        <p class="right" style="margin-top:24pt">${esc(s.school)}</p>
      </div>`);
    }

    if (on('memo')) {
      pages.push(`
      <div class="sheet">
        <div class="memo-head"><img src="assets/garuda.png" alt=""><div class="t">บันทึกข้อความ</div><div></div></div>
        <div class="memo-line"><span class="k">ส่วนราชการ</span><span class="v">${esc(s.school)} ${esc(s.office)}</span></div>
        <div class="memo-line">
          <span class="k">ที่</span><span class="v">${esc(s.memoNo) || '&nbsp;'}</span>
          <span class="k">วันที่</span><span class="v">${esc(s.memoDate) || '&nbsp;'}</span>
        </div>
        <div class="memo-line"><span class="k">เรื่อง</span><span class="v">${esc(s.project)}</span></div>
        <div class="rule"></div>
        <p><span class="b">เรียน</span> ${esc(or(s.directorPosition, 'ผู้อำนวยการโรงเรียน'))}</p>
        <p class="indent justify section">ด้วยข้าพเจ้าได้รับมอบหมายให้รับผิดชอบ${esc(s.project)} ใน${esc(s.workGroup)} ประจำปีงบประมาณ ${esc(s.year)} ได้ดำเนินการตามแผนเสร็จสิ้นโครงการแล้ว จึงขอรายงานผลการปฏิบัติงาน โดยแนบเอกสารการประเมินผลการปฏิบัติงานตาม${esc(s.project)} มากับหนังสือนี้</p>
        <p class="b section">ปัญหาและอุปสรรคในการดำเนินโครงการ/กิจกรรม</p>
        ${paras(or(s.memoProblems, '-'), 'indent pre')}
        <p class="b">ข้อเสนอแนะ</p>
        ${paras(or(s.memoSuggestions, '-'), 'indent pre')}
        <p class="indent section">จึงเรียนมาเพื่อโปรดทราบและพิจารณา</p>
        <div class="sign end"><div class="s">
          (ลงชื่อ)..............................................................<br>
          (${ownerLine})<br>ผู้รับผิดชอบโครงการ/กิจกรรม<br>ตำแหน่ง${esc(s.ownerPosition)} ${esc(s.school)}
        </div></div>
      </div>`);
    }

    if (on('report')) {
      const budgetDiff = toNum(s.budgetPlan) - toNum(s.budgetActual);
      const ql = qualityLevel(sat.total);
      pages.push(`
      <div class="sheet">
        <h3 class="center">รายงานผลการปฏิบัติงานตามโครงการ / กิจกรรม ${esc(s.school)} ปีงบประมาณ ${esc(s.year)}</h3>
        <div class="rule"></div>
        <p><span class="b">ชื่อโครงการ</span>&nbsp;&nbsp; ${esc(s.project)}</p>
        <p><span class="b">ลักษณะโครงการ</span>&nbsp;&nbsp; ${opt(s.projectType === 'new', 'ใหม่')}${opt(s.projectType === 'continuing', 'ต่อเนื่อง')}</p>
        <p><span class="b">ผู้รับผิดชอบ</span>&nbsp;&nbsp; ${ownerLine} &nbsp;&nbsp; <span class="b">กลุ่มงาน</span> ${esc(s.workGroup)}</p>
        <div class="rule"></div>

        <p class="b">1. วัตถุประสงค์</p>
        ${s.objectives.filter(x => x.trim()).map((o, i) => `<p class="sub">${i + 1}. ${esc(o)}</p>`).join('')}

        <p class="b section">2. การดำเนินการ</p>
        <p class="sub">${opt(s.status === 'done', 'ดำเนินการแล้วเสร็จ')}${opt(s.status === 'doing', 'กำลังดำเนินการ')}${opt(s.status === 'notyet', 'ยังไม่ได้ดำเนินการ')}</p>

        <p class="b section">3. ระยะเวลาในการดำเนินการ</p>
        <p class="sub">3.1 เวลาดำเนินการตามแผน เริ่ม ${blank(s.planStart)} – ${blank(s.planEnd)}</p>
        <p class="sub">3.2 สรุปเวลาดำเนินการจริง เริ่ม ${blank(s.actualStart)} – ${blank(s.actualEnd)}</p>
        <p class="sub" style="padding-left:3em">${opt(s.timing === 'onplan', 'ตามแผน')}${opt(s.timing === 'early', 'เร็วกว่าแผน')}${opt(s.timing === 'late', 'ช้ากว่าแผน')}${s.timing === 'late' ? 'เพราะ ' + blank(s.lateReason, '14em') : ''}</p>

        <p class="b section">4. บุคคลที่เกี่ยวข้องในการจัดกิจกรรม</p>
        ${s.participants.filter(x => x.trim()).map((p, i) => `<p class="sub">4.${i + 1} ${esc(p)}</p>`).join('')}

        <p class="b section">5. ขั้นตอนการปฏิบัติงานการจัดกิจกรรม ให้สำเร็จลุล่วงตามวัตถุประสงค์ของโครงการ และรายงานผลดังนี้</p>
        <table class="t">
          <thead><tr><th style="width:8%">ที่</th><th>รายละเอียด/กิจกรรม</th><th style="width:22%">ระยะเวลา</th><th style="width:28%">ผู้รับผิดชอบ</th></tr></thead>
          <tbody>${s.steps.map((st, i) => `<tr><td class="c">${i + 1}.</td><td>${esc(st.activity)}</td><td class="c">${esc(st.period)}</td><td>${esc(st.owner)}</td></tr>`).join('')}</tbody>
        </table>

        <p class="b section">6. งบประมาณ</p>
        <p class="sub">6.1 งบประมาณที่จัดสรรตามแผน ${money(s.budgetPlan)} บาท</p>
        <p class="sub">6.2 งบประมาณที่ใช้จริง ${money(s.budgetActual)} บาท</p>
        <p class="sub">6.3 สรุปการใช้จ่ายงบประมาณ</p>
        <p class="sub" style="padding-left:3em">
          ${opt(budgetDiff === 0, 'ตามแผน')}${opt(budgetDiff > 0, 'ต่ำกว่าแผน ' + (budgetDiff > 0 ? money(budgetDiff) : '.........') + ' บาท')}${opt(budgetDiff < 0, 'สูงกว่าแผน ' + (budgetDiff < 0 ? money(-budgetDiff) : '.........') + ' บาท')}
        </p>

        <p class="b section">7. ตัวชี้วัดความสำเร็จของกิจกรรม (เป้าหมาย)</p>
        ${s.indicators.filter(x => x.trim()).map((p, i) => `<p class="sub">7.${i + 1} ${esc(p)}</p>`).join('')}

        <p class="b section">8. ผลสำเร็จที่ปฏิบัติได้ตามตัวชี้วัด คิดเป็นร้อยละ ${fmt2(ev.total)}</p>
        <p class="b section">9. สรุปผลการประเมินโดยรวมของงาน/กิจกรรม/โครงการ (สรุปมาจากแบบประเมินความพึงพอใจ)</p>
        <p class="sub">สรุปผลการประเมินได้ร้อยละ <span class="b">${fmt2(sat.total)}</span> ระดับคุณภาพ <span class="b">${ql}</span></p>
        <table class="t" style="width:70%;margin-left:3em">
          <thead><tr><th>เกณฑ์การประเมิน (ร้อยละ)</th><th>ระดับคุณภาพ</th></tr></thead>
          <tbody>
            <tr><td class="c">0 – 59</td><td class="c">ปรับปรุง</td></tr>
            <tr><td class="c">60 – 69</td><td class="c">พอใช้</td></tr>
            <tr><td class="c">70 – 79</td><td class="c">ดี</td></tr>
            <tr><td class="c">80 – 100</td><td class="c">ดีมาก</td></tr>
          </tbody>
        </table>

        <p class="b section">10. สภาพปัญหา / อุปสรรค / กิจกรรม / โครงการ</p>${paras(or(s.problems, '-'), 'sub pre')}
        <p class="b">11. จุดเด่นของงาน / กิจกรรม / โครงการ</p>${paras(or(s.strengths, '-'), 'sub pre')}
        <p class="b">12. จุดด้อยของงาน / กิจกรรม / โครงการ</p>${paras(or(s.weaknesses, '-'), 'sub pre')}
        <p class="b">13. ข้อเสนอแนะ เพื่อนำไปพัฒนาครั้งต่อไป</p>${paras(or(s.improvements, '-'), 'sub pre')}

        <div class="sign end"><div class="s">ลงชื่อ...............................................ผู้รายงาน<br>(${ownerLine})</div></div>

        <div class="keep">
          <p class="b section">14. ความคิดเห็นผู้บริหาร</p>
          ${s.directorComment && s.directorComment.trim() ? paras(s.directorComment, 'sub pre') : '<div class="writein"></div><div class="writein"></div>'}
          <div class="sign end"><div class="s">ลงชื่อ................................................<br>(${esc(s.director)})<br>${esc(s.directorPosition)}</div></div>
        </div>
      </div>`);
    }

    const subCover = (title, sub) => `
      <div class="sheet cover cover-sub">
        <div class="c-title">${title}</div>
        <div class="c-sub">${esc(projectName)}</div>
        <div class="c-sub">${esc(s.schoolFull || s.school)}</div>
        <div class="c-sub">ปีงบประมาณ ${esc(s.year)}</div>
        <img class="logo" src="${esc(s.logoImage || DEFAULT_LOGO)}" alt="">
        <div class="c-owner">${ownerLine}<br>${esc(s.ownerPosition)} ${esc(s.schoolFull || s.school)}</div>
        <div class="c-org">${esc(s.office)}<br>${esc(s.obec)}<br>${esc(s.ministry)}</div>
      </div>`;

    if (on('coverSummary')) pages.push(subCover('สรุปและรายงานโครงการ'));

    const twoSign = `
      <div class="sign two"><div class="s">(ลงชื่อ)............................................................<br>(${ownerLine})<br>ผู้รายงาน</div>
      <div class="s">(ลงชื่อ)............................................................<br>(${esc(s.director)})<br>${esc(s.directorPosition)}</div></div>`;

    if (on('followup')) {
      pages.push(`
      <div class="sheet">
        <h2 class="center">แบบติดตามและประเมินผลเมื่อสิ้นสุดโครงการ</h2>
        <h3 class="center">ปีงบประมาณ ${esc(s.year)}<br>${esc(s.schoolFull || s.school)}</h3>
        <p class="section"><span class="b">ชื่อโครงการ</span>&nbsp;&nbsp; ${esc(s.project)}</p>
        <p class="b section">1. การดำเนินการ</p>
        <p class="sub">เริ่มดำเนินงาน ดังต่อไปนี้</p>
        ${s.followSteps.filter(x => x.trim()).map((p, i) => `<p class="sub">1.${i + 1} ${esc(p)}</p>`).join('')}
        <p class="b section">2. ปัญหาและอุปสรรคในการดำเนินงาน</p>${paras(or(s.followProblems, '-'), 'sub pre')}
        <p class="b section">3. วิธีการแก้ไข</p>${paras(or(s.followSolutions, '-'), 'sub pre')}
        <p class="b section">4. สรุปผลการดำเนินงาน</p>
        ${s.followResults.filter(x => x.trim()).map((p, i) => `<p class="sub">${i + 1}) ${esc(p)}</p>`).join('') || '<p class="sub">-</p>'}
        <p class="b section">5. ข้อเสนอแนะในการดำเนินงานครั้งต่อไป</p>${paras(or(s.followSuggestions, '-'), 'sub pre')}
        ${twoSign}
      </div>`);
    }

    const evaluatorsLine = `<p class="center section"><span class="b">ผู้ประเมิน</span>&nbsp;&nbsp; ${opt(s.evaluators.teacher, 'ครู')}${opt(s.evaluators.student, 'นักเรียน')}${opt(s.evaluators.parent, 'ผู้ปกครอง')}</p>`;
    const ratingTable = (items, sum, heading) => `
      <table class="t">
        <thead>
          <tr><th rowspan="2" style="width:7%">ที่</th><th rowspan="2">รายการ</th><th colspan="5">${heading}</th></tr>
          <tr>${LEVELS.map(l => `<th class="lvl" style="width:10%">${l.label}<small>${l.score}</small></th>`).join('')}</tr>
        </thead>
        <tbody>
          ${items.map((it, i) => `<tr><td class="c">${i + 1}.</td><td>${esc(it.text)}</td>${it.c.map(v => `<td class="c">${toNum(v) ? fmt(toNum(v)) : ''}</td>`).join('')}</tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="2" class="c">รวมค่าความถี่</td>${sum.freq.map(v => `<td class="c">${v ? fmt(v) : ''}</td>`).join('')}</tr>
          <tr><td colspan="2" class="c">รวมค่าความถี่ x คะแนนเต็ม</td>${sum.weighted.map(v => `<td class="c">${v ? fmt(v) : ''}</td>`).join('')}</tr>
          <tr><td colspan="2" class="c">ร้อยละ</td>${sum.pct.map(v => `<td class="c">${v ? fmt2(v) : ''}</td>`).join('')}</tr>
        </tfoot>
      </table>
      <p class="small muted">จำนวนผู้ประเมิน ${sum.respondents} คน</p>`;

    if (on('evalTable')) {
      pages.push(`
      <div class="sheet">
        <h3 class="center">แบบสรุปการประเมินผลการปฏิบัติการ${esc(s.project)}<br>${esc(s.school)} ปีงบประมาณ ${esc(s.year)}</h3>
        ${evaluatorsLine}
        ${ratingTable(s.evalItems, ev, 'ระดับความสำเร็จ')}
        <p class="b center section">สรุปความสำเร็จของ${esc(s.project)} คิดเป็นร้อยละ ${fmt2(ev.total)}</p>
        <div class="sign end"><div class="s">(ลงชื่อ) ............................................................. ผู้รวบรวมข้อมูล<br>( ${ownerLine} )</div></div>
      </div>`);
    }

    if (on('coverSat')) pages.push(subCover('สรุปและรายงานผลการประเมินความพึงพอใจ'));

    if (on('satReport')) {
      const lv = satLevel(sat.total);
      const groups = [s.evaluators.teacher && 'คณะครู', s.evaluators.student && 'นักเรียน', s.evaluators.parent && 'ผู้ปกครองนักเรียน'].filter(Boolean);
      pages.push(`
      <div class="sheet">
        <h2 class="center">รายงานผลการประเมินความพึงพอใจ</h2>
        <h3 class="center">${esc(s.project)}</h3>
        <div class="section">${paras(fill(s.satIntro))}</div>
        ${groups.map((g, i) => `<p class="sub">${i + 1}. ${g}</p>`).join('')}
        <p class="indent justify section">เป็นการสุ่มตัวอย่างของประชากรที่ใช้ในการประเมิน ${sat.respondents} คน และได้สร้างเกณฑ์มาตรฐานความพึงพอใจ 5 ระดับ ดังนี้</p>
        <table class="t" style="width:85%;margin:6pt auto">
          <thead><tr><th>ค่าเฉลี่ยร้อยละ</th><th>การแปลค่า</th><th>ระดับความพึงพอใจ</th></tr></thead>
          <tbody>
            <tr><td class="c">80 - 100</td><td>มีความพึงพอใจมากที่สุด</td><td class="c">5</td></tr>
            <tr><td class="c">70 - 79</td><td>มีความพึงพอใจมาก</td><td class="c">4</td></tr>
            <tr><td class="c">60 - 69</td><td>มีความพึงพอใจปานกลาง</td><td class="c">3</td></tr>
            <tr><td class="c">50 - 59</td><td>มีความพึงพอใจน้อย</td><td class="c">2</td></tr>
            <tr><td class="c">0 - 49</td><td>มีความพึงพอใจน้อยที่สุด</td><td class="c">1</td></tr>
          </tbody>
        </table>
        <p class="indent justify section">จากการสรุปผลการประเมินความพึงพอใจ${esc(s.project)} ปีงบประมาณ ${esc(s.year)} ได้ค่าเฉลี่ยร้อยละ <span class="b">${fmt2(sat.total)}</span> เมื่อเปรียบเทียบกับมาตรฐานความพึงพอใจ สรุปได้ว่า${esc(s.project)} มีความพึงพอใจ<span class="b">${lv.text}</span> การดำเนินงานและความพึงพอใจโครงการอยู่ในเกณฑ์มาตรฐานระดับ <span class="b">${lv.level}</span></p>
        ${twoSign}
      </div>`);
    }

    if (on('satTable')) {
      pages.push(`
      <div class="sheet">
        <h3 class="center">แบบสรุปความพึงพอใจของ${esc(s.project)}<br>${esc(s.school)} ปีงบประมาณ ${esc(s.year)}</h3>
        ${evaluatorsLine}
        ${ratingTable(s.satItems, sat, 'ระดับความพึงพอใจ')}
        <p class="b center section">สรุปความพึงพอใจของ${esc(s.project)} คิดเป็นร้อยละ ${fmt2(sat.total)}</p>
        <div class="sign end"><div class="s">(ลงชื่อ) ............................................................. ผู้รวบรวมข้อมูล<br>( ${ownerLine} )</div></div>
      </div>`);
    }

    if (on('appendix') && s.photos.length) {
      const per = parseInt(s.photosPerPage, 10) || 2;
      for (let i = 0; i < s.photos.length; i += per) {
        const chunk = s.photos.slice(i, i + per);
        pages.push(`
        <div class="sheet">
          <h3 class="center">${esc(s.appendixTitle)}</h3>
          <p class="center">${esc(s.project)} ${esc(s.schoolFull || s.school)} ปีงบประมาณ ${esc(s.year)}</p>
          <div class="photos pp${per}">
            ${chunk.map(p => `<figure><img src="${esc(p.src)}" alt="">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}</figure>`).join('')}
          </div>
        </div>`);
      }
    }

    $('#doc').innerHTML = pages.join('') || '<div class="sheet"><p class="center">ยังไม่ได้เลือกหน้าที่จะแสดง</p></div>';

    // summaries in the form
    $('#evalResult').textContent = `ผลสำเร็จ ร้อยละ ${fmt2(ev.total)} (ผู้ประเมิน ${ev.respondents} คน)`;
    $('#satResult').textContent = `ความพึงพอใจ ร้อยละ ${fmt2(sat.total)} — ${satLevel(sat.total).text} / ระดับคุณภาพ${qualityLevel(sat.total)}`;
    const diff = toNum(s.budgetPlan) - toNum(s.budgetActual);
    $('#budgetHint').textContent = diff === 0 ? 'ใช้งบประมาณตามแผน'
      : diff > 0 ? `ต่ำกว่าแผน ${money(diff)} บาท` : `สูงกว่าแผน ${money(-diff)} บาท`;
  }

  // ---------------------------------------------------------------- form binding
  function bindSimpleFields() {
    $$('[data-bind]').forEach(el => {
      const path = el.dataset.bind;
      const v = getPath(state, path);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
  }

  function onFieldInput(e) {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    const path = el.dataset.bind;
    let val = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') val = toNum(val);
    setPath(state, path, val);
    changed();
  }

  function changed() { render(); save(); }

  function rowTools() {
    return `<div class="tools"><button type="button" data-act="up" title="เลื่อนขึ้น">▲</button><button type="button" data-act="down" title="เลื่อนลง">▼</button><button type="button" data-act="del" class="del" title="ลบ">✕</button></div>`;
  }
  function moveItem(arr, i, act) {
    if (act === 'del') arr.splice(i, 1);
    else if (act === 'up' && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
    else if (act === 'down' && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
  }

  // Simple string-list editors (objectives, participants, ...)
  function renderLists() {
    $$('[data-list]').forEach(box => {
      const key = box.dataset.list;
      box.innerHTML = state[key].map((v, i) => `
        <div class="row" data-i="${i}"><span class="num">${i + 1}.</span>
          <textarea rows="2" data-li="${i}">${esc(v)}</textarea>${rowTools()}</div>`).join('') +
        `<button type="button" class="btn small" data-add>+ เพิ่ม</button>`;
    });
  }
  function onListEvent(e) {
    const box = e.target.closest('[data-list]');
    if (!box) return;
    const arr = state[box.dataset.list];
    if (e.type === 'input' && e.target.dataset.li != null) {
      arr[+e.target.dataset.li] = e.target.value; changed(); return;
    }
    if (e.type !== 'click') return;
    if (e.target.matches('[data-add]')) { arr.push(''); renderLists(); changed(); focusLast(box, 'textarea'); return; }
    const act = e.target.dataset.act; if (!act) return;
    moveItem(arr, +e.target.closest('.row').dataset.i, act); renderLists(); changed();
  }
  function focusLast(box, sel) { const all = $$(sel, box); if (all.length) all[all.length - 1].focus(); }

  // Steps table editor
  function renderSteps() {
    $('#stepsEditor').innerHTML = `<div class="row hint"><span></span><span>รายละเอียด/กิจกรรม</span><span>ระยะเวลา</span><span>ผู้รับผิดชอบ</span><span></span></div>` +
      state.steps.map((st, i) => `
      <div class="row" data-i="${i}"><span class="num">${i + 1}.</span>
        <input data-f="activity" value="${esc(st.activity)}" placeholder="กิจกรรม">
        <input data-f="period" value="${esc(st.period)}" placeholder="ระยะเวลา">
        <input data-f="owner" value="${esc(st.owner)}" placeholder="ผู้รับผิดชอบ">
        ${rowTools()}</div>`).join('');
  }
  function onStepsEvent(e) {
    const row = e.target.closest('.row[data-i]'); if (!row) return;
    const i = +row.dataset.i;
    if (e.type === 'input' && e.target.dataset.f) { state.steps[i][e.target.dataset.f] = e.target.value; changed(); return; }
    if (e.type === 'click' && e.target.dataset.act) { moveItem(state.steps, i, e.target.dataset.act); renderSteps(); changed(); }
  }

  // Rating (evaluation / satisfaction) editors
  function renderRatings() {
    $$('[data-rating]').forEach(box => {
      const key = box.dataset.rating;
      box.innerHTML = `<table><thead><tr><th>ที่</th><th>รายการ</th>${LEVELS.map(l => `<th title="${l.label}">${l.score}</th>`).join('')}<th></th></tr></thead><tbody>` +
        state[key].map((it, i) => `<tr data-i="${i}"><td>${i + 1}</td>
          <td class="item"><input data-f="text" value="${esc(it.text)}"></td>
          ${it.c.map((v, j) => `<td><input type="number" min="0" step="1" inputmode="numeric" data-c="${j}" value="${v || ''}"></td>`).join('')}
          <td><button type="button" data-act="del" title="ลบ">✕</button></td></tr>`).join('') + '</tbody></table>';
    });
  }
  function onRatingEvent(e) {
    const box = e.target.closest('[data-rating]'); if (!box) return;
    const arr = state[box.dataset.rating];
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const i = +tr.dataset.i;
    if (e.type === 'input') {
      if (e.target.dataset.f === 'text') arr[i].text = e.target.value;
      else if (e.target.dataset.c != null) arr[i].c[+e.target.dataset.c] = toNum(e.target.value);
      changed();
    } else if (e.type === 'click' && e.target.dataset.act === 'del') {
      arr.splice(i, 1); renderRatings(); changed();
    }
  }

  // Photos
  function renderPhotos() {
    $('#photoList').innerHTML = state.photos.map((p, i) => `
      <div class="photo-item" data-i="${i}">
        <img src="${esc(p.src)}" alt="">
        <input data-f="caption" value="${esc(p.caption)}" placeholder="คำบรรยายภาพ">
        <div class="tools"><button type="button" data-act="up">◀</button><button type="button" data-act="down">▶</button><button type="button" data-act="del" style="color:#b3261e">ลบ</button></div>
      </div>`).join('');
  }
  function onPhotoEvent(e) {
    const item = e.target.closest('.photo-item'); if (!item) return;
    const i = +item.dataset.i;
    if (e.type === 'input' && e.target.dataset.f === 'caption') { state.photos[i].caption = e.target.value; changed(); return; }
    if (e.type === 'click' && e.target.dataset.act) { moveItem(state.photos, i, e.target.dataset.act); renderPhotos(); changed(); }
  }

  // Downscale uploaded images so the saved data stays small enough for localStorage/JSON.
  function readImage(file, maxSide = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderSectionToggles() {
    $('#sectionToggles').innerHTML = SECTIONS.map(([k, label]) =>
      `<label><input type="checkbox" data-bind="sections.${k}" ${state.sections[k] !== false ? 'checked' : ''}> ${label}</label>`).join('');
  }

  function renderForm() {
    renderSectionToggles();
    bindSimpleFields();
    renderLists();
    renderSteps();
    renderRatings();
    renderPhotos();
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------- zoom
  let zoom = 1;
  function applyZoom() {
    $('#doc').style.zoom = zoom;
    $('#zoomLabel').textContent = Math.round(zoom * 100) + '%';
  }
  function fitZoom() {
    const w = $('#previewPane').clientWidth - 32;
    const sheetPx = 210 * 96 / 25.4;
    zoom = Math.max(0.3, Math.min(1, Math.floor((w / sheetPx) * 20) / 20));
    applyZoom();
  }

  // ---------------------------------------------------------------- actions
  function downloadJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // ASCII-only name: some browsers drop non-ASCII download names and fall back to "download"
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    a.download = `project-summary-${String(state.year).replace(/[^0-9]/g, '') || 'data'}-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function savePdf() {
    const prevTitle = document.title;
    document.title = `สรุปโครงการ ${state.project || ''} ปีงบประมาณ ${state.year}`.trim();
    // Wait for images so nothing is missing from the PDF.
    const imgs = $$('#doc img');
    Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })))
      .then(() => (document.fonts ? document.fonts.ready : null))
      .then(() => {
        window.print();
        setTimeout(() => { document.title = prevTitle; }, 500);
      });
  }

  function replaceState(next, msg) {
    state = normalize(next);
    renderForm(); render(); save();
    if (msg) toast(msg);
  }

  function init() {
    try { const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); if (ui.view) document.body.dataset.view = ui.view; } catch (e) { /* ignore */ }
    if (!document.body.dataset.view) document.body.dataset.view = 'form';
    $$('.mobile-switch button').forEach(b => b.classList.toggle('active', b.dataset.view === document.body.dataset.view));

    renderForm();
    render();

    const editor = $('#editor');
    editor.addEventListener('input', e => {
      if (e.target.closest('[data-list]')) return onListEvent(e);
      if (e.target.closest('#stepsEditor')) return onStepsEvent(e);
      if (e.target.closest('[data-rating]')) return onRatingEvent(e);
      if (e.target.closest('#photoList')) return onPhotoEvent(e);
      onFieldInput(e);
    });
    editor.addEventListener('change', e => { if (e.target.matches('select, input[type=checkbox]')) onFieldInput(e); });
    editor.addEventListener('click', e => {
      if (e.target.closest('[data-list]')) return onListEvent(e);
      if (e.target.closest('#stepsEditor')) return onStepsEvent(e);
      if (e.target.closest('[data-rating]')) return onRatingEvent(e);
      if (e.target.closest('#photoList')) return onPhotoEvent(e);
      const add = e.target.closest('[data-add-rating]');
      if (add) { state[add.dataset.addRating].push({ text: '', c: [0, 0, 0, 0, 0] }); renderRatings(); changed(); }
    });

    $('#addStep').addEventListener('click', () => {
      state.steps.push({ activity: '', period: '', owner: state.owner || '' }); renderSteps(); changed();
      focusLast($('#stepsEditor'), 'input[data-f=activity]');
    });

    $('#photoInput').addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        try { state.photos.push({ src: await readImage(f), caption: '' }); }
        catch (err) { toast('อ่านไฟล์รูปไม่สำเร็จ: ' + f.name); }
      }
      e.target.value = '';
      renderPhotos(); changed();
      if (files.length) toast(`เพิ่มรูปภาพ ${files.length} รูป`);
    });
    $('#coverInput').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      state.coverImage = await readImage(f, 2000, 0.88); e.target.value = ''; changed();
    });
    $('#logoInput').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      state.logoImage = await readImage(f, 600, 0.92); e.target.value = ''; changed();
    });
    $('#coverReset').addEventListener('click', () => { state.coverImage = ''; changed(); });
    $('#logoReset').addEventListener('click', () => { state.logoImage = ''; changed(); });

    $('#btnPdf').addEventListener('click', savePdf);
    $('#btnExport').addEventListener('click', downloadJSON);
    $('#btnSample').addEventListener('click', () => {
      if (confirm('แทนที่ข้อมูลปัจจุบันด้วยข้อมูลตัวอย่าง?')) replaceState(sampleState(), 'โหลดข้อมูลตัวอย่างแล้ว');
    });
    $('#btnNew').addEventListener('click', () => {
      if (confirm('เริ่มโครงการใหม่? ข้อมูลปัจจุบันจะถูกล้าง (แนะนำให้ "ส่งออกข้อมูล" เก็บไว้ก่อน)')) {
        const keep = sampleState(); const b = blankState();
        // keep the school details so a new project only needs project-specific data
        ['school', 'schoolFull', 'office', 'obec', 'ministry', 'director', 'directorPosition', 'coverImage', 'logoImage']
          .forEach(k => { b[k] = state[k] || keep[k]; });
        replaceState(b, 'เริ่มโครงการใหม่แล้ว');
      }
    });
    $('#fileImport').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { replaceState(JSON.parse(r.result), 'นำเข้าข้อมูลเรียบร้อย'); }
        catch (err) { toast('ไฟล์ไม่ถูกต้อง'); }
      };
      r.readAsText(f); e.target.value = '';
    });

    $$('.mobile-switch button').forEach(b => b.addEventListener('click', () => {
      document.body.dataset.view = b.dataset.view;
      $$('.mobile-switch button').forEach(x => x.classList.toggle('active', x === b));
      try { localStorage.setItem(UI_KEY, JSON.stringify({ view: b.dataset.view })); } catch (e) { /* ignore */ }
      if (b.dataset.view === 'preview') fitZoom();
    }));

    $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      zoom = Math.max(0.3, Math.min(2, +(zoom + (b.dataset.zoom === '+' ? 0.1 : -0.1)).toFixed(2)));
      applyZoom();
    }));
    fitZoom();
    window.addEventListener('resize', fitZoom);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
