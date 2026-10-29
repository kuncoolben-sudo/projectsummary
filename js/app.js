/* ระบบสรุปโครงการ — สร้างรายงานการประเมินผลโครงการจากแบบฟอร์ม และบันทึกเป็น PDF */
(function () {
  'use strict';

  const STORAGE_KEY = 'project-summary:v1';
  const UI_KEY = 'project-summary:ui';
  // Cover decoration is vector (SVG) so it is sharp at any print resolution; the emblem is the
  // template's own bitmap, placed where it sat on the template cover.
  const DEFAULT_COVER = 'assets/cover-bg.svg';
  const DEFAULT_COVER_LOGO = 'assets/school-logo.png';
  const MIN_DPI = 300;
  // Largest uploads are scaled down to this many px on the long side; 3000 px still gives
  // > 300 dpi in the largest photo slot (225 mm), 3600 px covers a full A4 cover (297 mm).
  const PHOTO_MAX_SIDE = 3000, COVER_MAX_SIDE = 3600;
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
      officeShort: '', deputy: '', deputyPosition: '',
      stage: 'proposal',
      // แบบเสนอโครงการ
      policyFocus: '', natStrategy: { hr: false, admin: false, other: '' },
      obecStrategy: '', std1: '', std2: '', std3: '', areaStrategy: '', schoolStrategy: '',
      rationale: '', targetQuantity: '', targetQuality: '',
      budgetItems: [{ text: '', comp: 0, use: 0, mat: 0 }],
      budgetSources: { teaching: 0, activity: 0, income: 0, other: 0, otherName: '' },
      kpiQuality: [''], beneficiaries: [''],
      evalMethods: { survey: true, form: true, other: '' },
      expectedResults: '',
      // รายงานสรุปโครงการ
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
      coverImage: '',
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
      officeShort: 'สพป.นครปฐม เขต 2', stage: 'done',
      deputy: 'นางสาวรัตนา  ธนธนานนท์', deputyPosition: 'รองผู้อำนวยการโรงเรียนวัดปรีดาราม',
      policyFocus: 'ส่งเสริมสนับสนุนกิจกรรมพัฒนาผู้เรียน',
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

  // Sample proposal: the school's own proposal template (fiscal year 2569).
  function sampleProposal() {
    const base = sampleState();
    const keep = ['school', 'schoolFull', 'office', 'officeShort', 'obec', 'ministry', 'director', 'directorPosition',
      'deputy', 'deputyPosition', 'owner', 'ownerPosition', 'project', 'workGroup', 'projectType', 'policyFocus', 'objectives', 'indicators'];
    const owner = 'นายเบญจรงค์ นุ่มวัฒนะ';
    return Object.assign(blankState(), Object.fromEntries(keep.map(k => [k, base[k]])), {
      year: '2569', stage: 'proposal',
      natStrategy: { hr: true, admin: false, other: '' },
      obecStrategy: 'กลยุทธ์ที่ 3 ยกระดับคุณภาพการศึกษาให้สอดคล้องกับการเปลี่ยนแปลงในศตวรรษที่ 21',
      std1: '1.1.2 , 1.2.1', std2: '2.3', std3: '3.1',
      areaStrategy: '2 พัฒนาขีดความสามารถของผู้เรียนเพื่อการแข่งขันสู่ความเป็นเลิศ',
      schoolStrategy: '2 จัดการศึกษาเพื่อเพิ่มความสามารถของผู้เรียนเพื่อการแข่งขันสู่ความเป็นเลิศ',
      rationale: 'กิจกรรมลูกเสือและเนตรนารีเป็นกิจกรรมที่บรรจุอยู่ในหลักสูตรสถานศึกษา ซึ่งเป็นกิจกรรมพัฒนาผู้เรียนที่มุ่งเน้นให้เด็กมีความรักชาติ มีระเบียบวินัย มีความสามัคคี การดำรงชีพในคราวจำเป็นและการปฏิบัติตนให้เป็นประโยชน์ต่อสังคม ดังนั้นการอยู่ค่ายพักแรมจึงถือว่าเป็นหัวใจสำคัญของกิจกรรมลูกเสือในการที่จะสรุปพฤติกรรมต่างๆที่ได้รับการศึกษาในช่วงระยะปีการศึกษาว่ามีพฤติกรรมอันพึงประสงค์มากน้อยเพียงใด\n\n' +
        'ดังนั้นงานบริหารทั่วไปได้เล็งเห็นความสำคัญของการเข้าค่ายพักแรมจึงกำหนดให้มีการเข้าค่ายพักแรมของลูกเสือและเนตรนารีสามัญของโรงเรียนวัดปรีดารามขึ้นในประมาณเดือนธันวาคม 2568 หรือเดือน มกราคม 2569',
      targetQuantity: 'ลูกเสือและเนตรนารีชั้นประถมศึกษาปีที่ 1 - 6 เข้าค่ายพักแรมปีละ 1 ครั้ง',
      targetQuality: 'ลูกเสือและเนตรนารีชั้นประถมศึกษาปีที่ 1 - 6 สามารถสอบผ่านหลักสูตรร้อยละ 100',
      steps: [
        { activity: 'เสนอโครงการเพื่ออนุมัติ', period: 'ต.ค. 68', owner },
        { activity: 'ประชุมผู้กำกับ รองผู้กำกับ', period: 'ต.ค. 68', owner },
        { activity: 'แต่งตั้งคณะกรรมการดำเนินงาน', period: 'ต.ค. 68', owner: 'ผู้อำนวยการ' },
        { activity: 'ประสานงานกับครูลูกเสือในกลุ่ม', period: 'พ.ย. 68', owner },
        { activity: 'ดำเนินงานตามโครงการ', period: 'ธ.ค. 68 – ม.ค. 69', owner: 'คณะกรรมการ' },
        { activity: 'ติดตามผลและประเมินผล', period: 'มี.ค. 69', owner },
        { activity: 'สรุปผลและรายงานผลตามโครงการ', period: 'มี.ค. 69', owner }
      ],
      planStart: 'ตุลาคม 2568', planEnd: 'กันยายน 2569',
      budgetItems: [
        { text: 'จัดทำเอกสารการเข้าค่ายพักแรมลูกเสือ – เนตรนารี สามัญ', comp: 0, use: 0, mat: 3000 },
        { text: 'การเข้าค่ายพักแรมลูกเสือ – เนตรนารี สามัญ', comp: 0, use: 0, mat: 68355 },
        { text: 'รายงานสรุปผลการจัดกิจกรรม', comp: 0, use: 0, mat: 0 }
      ],
      budgetPlan: 70355,
      budgetSources: { teaching: 0, activity: 70355, income: 0, other: 0, otherName: '' },
      kpiQuality: ['ลูกเสือและเนตรนารีชั้นประถมศึกษาปีที่ 1 - 6 สามารถสอบผ่านหลักสูตร ร้อยละ 100'],
      beneficiaries: ['นักเรียนโรงเรียนวัดปรีดาราม'],
      evalMethods: { survey: true, form: true, other: '' },
      expectedResults: 'ลูกเสือและเนตรนารีได้รับประสบการณ์ตรงจากการอยู่ร่วมกัน และได้นำประสบการณ์จากที่ได้เรียนไปใช้ในชีวิตประจำวัน'
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
    ['natStrategy', 'budgetSources', 'evalMethods'].forEach(k => { out[k] = Object.assign(blankState()[k], out[k] || {}); });
    delete out.logoImage; // sub-cover logo was removed; drop it from older saved data
    // projects saved before the proposal form existed were summary reports
    if (!data || !data.stage) out.stage = 'done';
    ['objectives', 'participants', 'indicators', 'followSteps', 'followResults', 'steps', 'evalItems', 'satItems', 'photos',
      'budgetItems', 'kpiQuality', 'beneficiaries']
      .forEach(k => { if (!Array.isArray(out[k])) out[k] = blankState()[k]; });
    out.budgetItems = out.budgetItems.map(it => ({ text: it.text || '', comp: toNum(it.comp), use: toNum(it.use), mat: toNum(it.mat) }));
    ['teaching', 'activity', 'income', 'other'].forEach(k => { out.budgetSources[k] = toNum(out.budgetSources[k]); });
    ['evalItems', 'satItems'].forEach(k => {
      out[k] = out[k].map(it => ({ text: it.text || '', c: LEVELS.map((_, i) => toNum(it.c && it.c[i])) }));
    });
    return out;
  }

  // The working copy goes to IndexedDB (full-resolution photos do not fit localStorage's ~5 MB);
  // localStorage keeps a copy too when it fits, as a fallback for browsers without IndexedDB.
  const WORKING_ID = '__working__';
  let saveTimer = null;
  function writeWorkingCopy() {
    saveTimer = null;
    const el = document.getElementById('saveStatus');
    state._autosavedAt = Date.now(); // lets init pick the newer of the two copies
    let lsOk = true;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { lsOk = false; try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ } }
    const done = () => { el.textContent = 'บันทึกอัตโนมัติในเบราว์เซอร์แล้ว ' + new Date().toLocaleTimeString('th-TH'); };
    dbPut({ id: WORKING_ID, data: state, updatedAt: Date.now() }).then(done).catch(() => {
      if (lsOk) done();
      else el.textContent = 'บันทึกอัตโนมัติไม่สำเร็จ — กด "บันทึกโครงการ" หรือ "ส่งออกข้อมูล" เพื่อเก็บไว้';
    });
  }
  function loadWorkingCopy() {
    return dbGet(WORKING_ID).then(rec => (rec ? normalize(rec.data) : null)).catch(() => null);
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeWorkingCopy, 400);
  }
  // don't lose the last edits when the tab is closed/reloaded within the debounce window
  window.addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); writeWorkingCopy(); } });

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
  function renderSummary() {
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
        ${s.coverImage ? `<img class="cover-bg" src="${esc(s.coverImage)}" alt="">`
          : `<img class="cover-bg" src="${DEFAULT_COVER}" alt=""><img class="cover-logo" src="${DEFAULT_COVER_LOGO}" alt="">`}
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

    return pages.join('') || '<div class="sheet"><p class="center">ยังไม่ได้เลือกหน้าที่จะแสดง</p></div>';
  }

  // Totals of the proposal's budget table (2.7); its grand total is also the summary's planned budget.
  function budgetTotals(s) {
    const rows = s.budgetItems.map(it => Object.assign({}, it, { total: toNum(it.comp) + toNum(it.use) + toNum(it.mat) }));
    const sum = k => rows.reduce((a, r) => a + toNum(r[k]), 0);
    return { rows, comp: sum('comp'), use: sum('use'), mat: sum('mat'), total: sum('total') };
  }
  const proposalBudget = s => budgetTotals(s).total || toNum(s.budgetPlan);

  // แบบเสนอโครงการ — one flowing document laid out like the school's template
  function renderProposal() {
    const s = state, bt = budgetTotals(s), src = s.budgetSources, ns = s.natStrategy, em = s.evalMethods;
    const pk = on => `(<span class="ck${on ? ' on' : ''}"></span>)`;
    const val = (v, w = '10em') => blank(v, w);
    const items = arr => arr.filter(t => String(t).trim());
    const amount = v => (toNum(v) > 0 ? money(v) : '................................');
    const dash = v => (v ? money(v) : '-');
    const head = (num, title, note) => `<p class="t1 section"><span class="b">${num} ${title}</span>${note ? ` (${note})` : ''}</p>`;
    return `
      <div class="sheet prop">
        <p><span class="b">โครงการ</span> ${esc(s.project.replace(/^โครงการ\s*/, ''))}</p>
        <p><span class="b">ลักษณะโครงการ</span>&nbsp;&nbsp; ${opt(s.projectType === 'continuing', 'โครงการต่อเนื่อง')}${opt(s.projectType === 'new', 'โครงการใหม่')}</p>
        <p><span class="b">กลุ่มงานรับผิดชอบ</span> ${esc(s.workGroup)}</p>
        <p><span class="b">สอดคล้องกับนโยบายและจุดเน้น สพฐ.</span> ${esc(s.policyFocus)}</p>
        <p><span class="b">ผู้รับผิดชอบโครงการ</span> ${esc(s.owner)}</p>

        <p class="b section">1. ความสอดคล้อง</p>
        <div class="choice"><span>1.1 ยุทธศาสตร์ชาติ 20 ปี (Z)</span><span class="opts">
          <span>${pk(ns.hr)} ด้านการพัฒนาและเสริมสร้างศักยภาพทรัพยากรมนุษย์</span>
          <span>${pk(ns.admin)} ด้านการปรับสมดุลและพัฒนาระบบบริหารจัดการภาครัฐ</span>
          <span>${pk(!!ns.other.trim())} อื่น ๆ (ระบุ) ${ns.other.trim() ? esc(ns.other) : '......................................................'}</span>
        </span></div>
        <p class="t1">1.2 กลยุทธ์ สพฐ. (X) กลยุทธ์ที่ (ระบุ) ${val(s.obecStrategy)}</p>
        <p class="t1">1.3 มาตรฐานการศึกษา</p>
        <p class="i1 t1">1.3.1 คุณภาพผู้เรียน มาตรฐานที่ 1 ตัวบ่งชี้ที่ ${val(s.std1, '5em')}</p>
        <p class="i1 t1">1.3.2 กระบวนการบริหารและการจัดการ มาตรฐานที่ 2 ตัวบ่งชี้ที่ ${val(s.std2, '5em')}</p>
        <p class="i1 t1">1.3.3 กระบวนการจัดการเรียนการสอน มาตรฐานที่ 3 ตัวบ่งชี้ที่ ${val(s.std3, '5em')}</p>
        <p class="t1">1.4 กลยุทธ์ ${esc(or(s.officeShort, 'สพป.'))} (X) กลยุทธ์ที่ (ระบุ) ${val(s.areaStrategy)}</p>
        <p class="t1">1.5 กลยุทธ์โรงเรียน (X) กลยุทธ์ที่ (ระบุ) ${val(s.schoolStrategy)}</p>
        <p class="t1">1.6 นโยบายและจุดเน้น สพฐ. ${val(s.policyFocus)}</p>

        <p class="b section">2. รายละเอียดโครงการ (X)</p>
        ${head('2.1', 'หลักการและเหตุผล', 'แสดงปัญหา เหตุผล ความจำเป็นต้องมีโครงการ และผลประโยชน์ที่จะได้รับจากการดำเนินงานตามโครงการ')}
        ${paras(s.rationale, 'i1 t1 justify')}
        ${head('2.2', 'วัตถุประสงค์', 'แสดงความต้องการว่าจะให้เกิดอะไรขึ้น ต้องชัดเจน ปฏิบัติได้ วัดได้ ประเมินได้')}
        ${items(s.objectives).map((o, i) => `<p class="i1 t1">${i + 1}. ${esc(o)}</p>`).join('')}
        ${head('2.3', 'เป้าหมาย', 'ต้องสอดคล้องกับวัตถุประสงค์')}
        <p class="i1 t1">1) เชิงปริมาณ (ผลผลิต) (ระบุจำนวน ปริมาณของผลงานที่เกิดขึ้นหลังจากดำเนินการเสร็จ)</p>
        ${paras(s.targetQuantity, 'i1 t2 pre')}
        <p class="i1 t1">2) เชิงคุณภาพ (ผลลัพธ์) (ระบุผลประโยชน์ที่เกิดขึ้นหลังจากดำเนินการเสร็จ)</p>
        ${paras(s.targetQuality, 'i1 t2 pre')}
        ${head('2.4', 'กิจกรรมและวิธีดำเนินงาน')}
        <table class="t">
          <thead><tr><th style="width:8%">ที่</th><th>รายละเอียด/กิจกรรม</th><th style="width:22%">ระยะเวลา</th><th style="width:28%">ผู้รับผิดชอบ</th></tr></thead>
          <tbody>${s.steps.map((st, i) => `<tr><td class="c">${i + 1}.</td><td>${esc(st.activity)}</td><td class="c">${esc(st.period)}</td><td>${esc(st.owner)}</td></tr>`).join('')}</tbody>
        </table>
        <p class="t1 section"><span class="b">2.5 ระยะเวลาดำเนินโครงการ</span> ${val(s.planStart, '6em')} – ${val(s.planEnd, '6em')}</p>
        <p class="t1 section"><span class="b">2.6 งบประมาณ</span> ${money(proposalBudget(s))} บาท</p>
        <p class="i1 t1">${pk(src.teaching > 0)} เงินอุดหนุน (ค่าจัดการเรียนการสอน) จำนวน ${amount(src.teaching)} บาท</p>
        <p class="i1 t1">${pk(src.activity > 0)} เงินอุดหนุน (กิจกรรมพัฒนาผู้เรียน) จำนวน ${amount(src.activity)} บาท</p>
        <p class="i1 t1">${pk(src.income > 0)} เงินรายได้สถานศึกษา จำนวน ${amount(src.income)} บาท</p>
        <p class="i1 t1">${pk(src.other > 0)} อื่น ๆ (ระบุ) ${esc(src.otherName) || '........................................'} จำนวน ${amount(src.other)} บาท</p>
        ${head('2.7', 'รายละเอียดการใช้งบประมาณ', 'ขอถัวจ่ายทุกรายการ')}
        <table class="t budget">
          <thead>
            <tr><th rowspan="3" style="width:32%">กิจกรรมและรายละเอียด<br>การใช้งบประมาณ</th><th colspan="3">งบประมาณจำแนกตามรายการ</th><th rowspan="3" style="width:20%">รวม<br>งบประมาณ</th></tr>
            <tr><th colspan="3">งบดำเนินงาน</th></tr>
            <tr><th>ตอบแทน</th><th>ใช้สอย</th><th>วัสดุ</th></tr>
          </thead>
          <tbody>${bt.rows.filter(r => r.text.trim() || r.total).map((r, i) => `<tr><td>${i + 1}. ${esc(r.text)}</td><td class="c">${dash(r.comp)}</td><td class="c">${dash(r.use)}</td><td class="c">${dash(r.mat)}</td><td class="c">${dash(r.total)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td style="text-align:center">รวมทั้งสิ้น</td><td class="c">${dash(bt.comp)}</td><td class="c">${dash(bt.use)}</td><td class="c">${dash(bt.mat)}</td><td class="c">${dash(bt.total)}</td></tr></tfoot>
        </table>
        ${head('2.8', 'ดัชนีชี้วัดความสำเร็จ (KPIs)')}
        <p class="t20"><span class="b">2.8.1 ตัวชี้วัดเชิงปริมาณ</span> (ความสำเร็จตามวัตถุประสงค์ของโครงการที่สามารถวัดได้เชิงตัวเลข)</p>
        ${items(s.indicators).map((t, i) => `<p class="t3">${i + 1}) ${esc(t)}</p>`).join('')}
        <p class="t20"><span class="b">2.8.2 ตัวชี้วัดเชิงคุณภาพ</span> (การวัดความสำเร็จตามวัตถุประสงค์ของโครงการว่ามีคุณภาพอย่างไร เช่น คุณภาพชีวิต ความพึงพอใจของผู้รับบริการ การเปลี่ยนแปลงพฤติกรรม)</p>
        ${items(s.kpiQuality).map((t, i) => `<p class="t3">${i + 1}) ${esc(t)}</p>`).join('')}
        ${head('2.9', 'กลุ่มเป้าหมายผู้ได้รับผลประโยชน์')}
        ${items(s.beneficiaries).map((t, i) => `<p class="t20">2.9.${i + 1} ${esc(t)}</p>`).join('')}
        ${head('2.10', 'การประเมินผลโครงการ')}
        <p class="i1 t1">${pk(em.survey)} แบบสอบถาม</p>
        <p class="i1 t1">${pk(em.form)} แบบประเมิน</p>
        <p class="i1 t1">${pk(!!em.other.trim())} อื่น ๆ (ระบุ) ${em.other.trim() ? esc(em.other) : '........................................................'}</p>
        ${head('2.11', 'ผลที่คาดว่าจะได้รับ')}
        ${paras(s.expectedResults, 'i1 t1 justify')}

        <div class="sign keep">
          <div class="s">ลงชื่อ...................................................ผู้เสนอโครงการ<br>( ${esc(s.owner)} )<br>${esc(s.ownerPosition)}${esc(s.school)}</div>
          ${s.deputy.trim() ? `<div class="s">ลงชื่อ...................................................ผู้อนุมัติโครงการ<br>( ${esc(s.deputy)} )<br>${esc(s.deputyPosition)}</div>` : ''}
          <div class="s">ลงชื่อ...................................................ผู้อนุมัติโครงการ<br>( ${esc(s.director)} )<br>${esc(s.directorPosition)}</div>
        </div>
      </div>`;
  }

  function render() {
    const s = state;
    $('#doc').innerHTML = docMode === 'proposal' ? renderProposal() : renderSummary();
    const ev = ratingSummary(s.evalItems), sat = ratingSummary(s.satItems);

    // summaries in the form
    $('#evalResult').textContent = `ผลสำเร็จ ร้อยละ ${fmt2(ev.total)} (ผู้ประเมิน ${ev.respondents} คน)`;
    $('#satResult').textContent = `ความพึงพอใจ ร้อยละ ${fmt2(sat.total)} — ${satLevel(sat.total).text} / ระดับคุณภาพ${qualityLevel(sat.total)}`;
    const diff = toNum(s.budgetPlan) - toNum(s.budgetActual);
    $('#budgetHint').textContent = (diff === 0 ? 'ใช้งบประมาณตามแผน'
      : diff > 0 ? `ต่ำกว่าแผน ${money(diff)} บาท` : `สูงกว่าแผน ${money(-diff)} บาท`) +
      (budgetTotals(s).total > 0 ? ' (งบตามแผนมาจากรายละเอียดงบประมาณในแบบเสนอโครงการ)' : '');
    const bt = budgetTotals(s).total, srcSum = ['teaching', 'activity', 'income', 'other'].reduce((a, k) => a + toNum(s.budgetSources[k]), 0);
    $('#sourcesHint').textContent = !bt && !srcSum ? ''
      : srcSum === bt ? `แหล่งงบประมาณรวม ${money(srcSum)} บาท ตรงกับยอดรวมรายละเอียดงบประมาณ`
      : `⚠ แหล่งงบประมาณรวม ${money(srcSum)} บาท ไม่เท่ากับยอดรวมรายละเอียดงบประมาณ ${money(bt)} บาท`;
    updateDpiInfo();
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

  function changed() { state._dirty = true; render(); save(); updateProjectStatus(); }

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
  // ---------------------------------------------------------------- print resolution
  // Text and table lines print as vectors; only bitmaps have a resolution, which is their pixel
  // size divided by the size they are printed at.
  const dimsCache = new Map(); // image src -> { w, h }
  function getDims(src) {
    if (dimsCache.has(src)) return Promise.resolve(dimsCache.get(src));
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => { const d = { w: img.naturalWidth, h: img.naturalHeight }; dimsCache.set(src, d); resolve(d); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  // Printed box (mm) of a photo for each "photos per page" layout: [column width, max height].
  const PHOTO_BOX = { 1: [160, 225], 2: [160, 108], 4: [77, 105], 6: [77, 68] };
  // Width (mm) at which an image of size d is printed in a boxW x maxH box (object-fit: contain).
  const printedWidth = (d, boxW, maxH) => Math.min(boxW, maxH * d.w / d.h);
  const dpiAt = (px, mm) => Math.round(px / (mm / 25.4));
  const pxFor = mm => Math.ceil(mm / 25.4 * MIN_DPI);

  // Every bitmap that will be printed, with its effective dpi.
  function printedImages() {
    const s = state, on = k => docMode === 'summary' && s.sections[k] !== false, items = [];
    if (on('cover')) {
      if (s.coverImage) {
        items.push(getDims(s.coverImage).then(d => d && {
          label: 'ภาพพื้นหลังหน้าปก', dpi: Math.min(dpiAt(d.w, 210), dpiAt(d.h, 297)),
          need: `${pxFor(210)} × ${pxFor(297)} px`
        }));
      } else {
        items.push(getDims(DEFAULT_COVER_LOGO).then(d => d && {
          label: 'ตราโรงเรียนบนหน้าปก (ภาพจากไฟล์ต้นแบบ)', dpi: dpiAt(d.w, 37.9),
          need: `ภาพพื้นหลังหน้าปกขนาด ${pxFor(210)} × ${pxFor(297)} px`
        }));
      }
    }
    if (on('appendix')) {
      const [boxW, maxH] = PHOTO_BOX[parseInt(s.photosPerPage, 10)] || PHOTO_BOX[2];
      s.photos.forEach((p, i) => items.push(getDims(p.src).then(d => {
        if (!d) return null;
        const mm = printedWidth(d, boxW, maxH);
        return { label: `ภาพกิจกรรมที่ ${i + 1}${p.caption ? ` (${p.caption})` : ''}`, dpi: dpiAt(d.w, mm),
                 need: `กว้างอย่างน้อย ${pxFor(mm)} px`, photo: i };
      })));
    }
    return Promise.all(items).then(list => list.filter(Boolean));
  }

  function updateDpiInfo() {
    printedImages().then(list => {
      $$('#photoList .dpi').forEach(el => {
        const it = list.find(x => x.photo === +el.dataset.dpiI);
        el.textContent = it ? `${it.dpi} dpi${it.dpi < MIN_DPI ? ' ⚠' : ''}` : '';
        el.className = 'dpi ' + (it && it.dpi < MIN_DPI ? 'low' : 'ok');
        el.title = it && it.dpi < MIN_DPI ? `ต่ำกว่า ${MIN_DPI} dpi — ควรใช้รูป${it.need}` : 'ความละเอียดเมื่อพิมพ์';
      });
      const cover = list.find(x => x.photo == null);
      $('#coverDpi').textContent = state.coverImage
        ? `ภาพพื้นหลังที่อัปโหลด: ประมาณ ${cover ? cover.dpi : '-'} dpi เมื่อพิมพ์${cover && cover.dpi < MIN_DPI ? ` (ต่ำกว่า ${MIN_DPI} dpi ควรใช้ภาพ ${cover.need})` : ''}`
        : `ภาพเริ่มต้น: ลวดลายเป็นภาพเวกเตอร์ คมชัดทุกความละเอียด ส่วนตราโรงเรียนมีความละเอียดประมาณ ${cover ? cover.dpi : '-'} dpi (จำกัดตามไฟล์ต้นแบบ)`;
    });
  }

  function renderPhotos() {
    $('#photoList').innerHTML = state.photos.map((p, i) => `
      <div class="photo-item" data-i="${i}">
        <img src="${esc(p.src)}" alt="">
        <span class="dpi" data-dpi-i="${i}"></span>
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
  // Keeps the original file untouched whenever it is no larger than maxSide, so photos are not
  // recompressed and print at their full resolution; only bigger images are scaled down.
  function readImage(file, maxSide = PHOTO_MAX_SIDE) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (/^image\/(jpeg|png|webp|gif)$/.test(file.type) && Math.max(w, h) <= maxSide) {
            dimsCache.set(reader.result, { w, h });
            return resolve(reader.result);
          }
          const scale = Math.min(1, maxSide / Math.max(w, h));
          const c = document.createElement('canvas');
          c.width = Math.round(w * scale); c.height = Math.round(h * scale);
          const ctx = c.getContext('2d');
          const png = file.type === 'image/png'; // keep transparency
          if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const out = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92);
          dimsCache.set(out, { w: c.width, h: c.height });
          resolve(out);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Budget table editor (proposal 2.7); sums update in place so typing keeps focus.
  function renderBudget() {
    const bt = budgetTotals(state);
    const cell = k => `<td class="sum" data-sum="${k}"></td>`;
    $('#budgetEditor').innerHTML = `<table><thead><tr><th>ที่</th><th>กิจกรรมและรายละเอียด</th><th>ตอบแทน</th><th>ใช้สอย</th><th>วัสดุ</th><th>รวม</th><th></th></tr></thead><tbody>` +
      bt.rows.map((it, i) => `<tr data-i="${i}"><td>${i + 1}</td><td class="item"><input data-f="text" value="${esc(it.text)}"></td>` +
        ['comp', 'use', 'mat'].map(k => `<td><input type="number" min="0" step="any" inputmode="decimal" data-f="${k}" value="${it[k] || ''}"></td>`).join('') +
        `<td class="sum" data-row-sum="${i}"></td><td><button type="button" data-act="del" title="ลบ">✕</button></td></tr>`).join('') +
      `</tbody><tfoot><tr><td></td><th>รวมทั้งสิ้น</th>${cell('comp')}${cell('use')}${cell('mat')}${cell('total')}<td></td></tr></tfoot></table>`;
    updateBudgetSums();
  }
  function updateBudgetSums() {
    const bt = budgetTotals(state);
    $$('#budgetEditor [data-row-sum]').forEach(td => { td.textContent = money(bt.rows[+td.dataset.rowSum].total); });
    $$('#budgetEditor [data-sum]').forEach(td => { td.textContent = money(bt[td.dataset.sum]); });
  }
  function onBudgetEvent(e) {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const i = +tr.dataset.i, f = e.target.dataset.f;
    if (e.type === 'input' && f) {
      state.budgetItems[i][f] = f === 'text' ? e.target.value : toNum(e.target.value);
      updateBudgetSums(); syncBudgetPlan(); changed();
    } else if (e.type === 'click' && e.target.dataset.act === 'del') {
      state.budgetItems.splice(i, 1); renderBudget(); syncBudgetPlan(); changed();
    }
  }
  // The summary's planned budget follows the proposal's budget table once that has amounts.
  function syncBudgetPlan() {
    const t = budgetTotals(state).total, inp = $('[data-bind="budgetPlan"]');
    if (t > 0) state.budgetPlan = t;
    inp.disabled = t > 0;
    inp.value = state.budgetPlan;
    inp.title = t > 0 ? 'คำนวณจากรายละเอียดการใช้งบประมาณในแบบเสนอโครงการ' : '';
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
    renderBudget();
    syncBudgetPlan();
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
  function downloadBlob(blob, prefix, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // ASCII-only name: some browsers drop non-ASCII download names and fall back to "download"
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    a.download = `${prefix}-${stamp}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const yearSlug = data => 'project-summary-' + (String(data.year).replace(/[^0-9]/g, '') || 'data');
  function downloadJSON(data = projectData(state), prefix = yearSlug(data)) {
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), prefix, 'json');
  }

  // ---------------------------------------------------------------- Word export
  // The builder (js/docx-export.js) and its fonts/images (js/docx-assets.js, ~1.3 MB) load on first use.
  const loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src; el.onload = resolve;
      el.onerror = () => { delete loaded[src]; reject(new Error('load ' + src)); };
      document.head.appendChild(el);
    }));
  }
  function saveDocx() {
    const btn = $('#btnDocx');
    btn.disabled = true;
    toast('กำลังสร้างไฟล์ Word…');
    Promise.all([loadScript('js/docx-assets.js'), loadScript('js/docx-export.js')])
      .then(() => window.ProjectDocx.build({ doc: docMode, state, ratingSummary, qualityLevel, satLevel, fill, fmt, fmt2, money, or, LEVELS, getDims, printedWidth, PHOTO_BOX, budgetTotals, proposalBudget }))
      .then(({ blob, skipped }) => {
        downloadBlob(blob, docMode === 'proposal' ? yearSlug(state).replace('summary', 'proposal') : yearSlug(state), 'docx');
        toast(skipped ? `บันทึกไฟล์ Word แล้ว (ข้ามรูป ${skipped} รูปที่เบราว์เซอร์อ่านไฟล์ไม่ได้ — ลองเพิ่มรูปใหม่ผ่านปุ่ม "เพิ่มรูปภาพ")` : 'บันทึกไฟล์ Word แล้ว');
      })
      .catch(err => { console.error(err); toast('สร้างไฟล์ Word ไม่สำเร็จ'); })
      .finally(() => { btn.disabled = false; });
  }

  // ---------------------------------------------------------------- saved projects (IndexedDB)
  // IndexedDB rather than localStorage: a project with photos easily exceeds localStorage's ~5 MB.
  const DB_NAME = 'project-summary', DB_STORE = 'projects';
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('no indexedDB'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }
  function dbRun(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    }));
  }
  const dbAll = () => dbRun('readonly', st => st.getAll()).then(l => l.filter(r => r.id !== WORKING_ID));
  const dbGet = id => dbRun('readonly', st => st.get(id));
  const dbPut = rec => dbRun('readwrite', st => st.put(rec));
  const dbDelete = id => dbRun('readwrite', st => st.delete(id));

  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // The project data without the editor's bookkeeping fields.
  function projectData(src) {
    const { _id, _dirty, _savedAt, _autosavedAt, ...data } = src;
    return data;
  }
  function makeRecord(id, data) {
    return {
      id, data, updatedAt: Date.now(),
      name: (data.project || '').trim() || 'โครงการไม่มีชื่อ',
      year: data.year || '', owner: data.owner || '', stage: data.stage || 'done'
    };
  }

  function saveProject() {
    const id = state._id || newId();
    const rec = makeRecord(id, projectData(state));
    return dbPut(rec).then(() => {
      state._id = id; state._dirty = false; state._savedAt = rec.updatedAt;
      save(); updateProjectStatus();
      toast(`บันทึกโครงการ "${rec.name}" แล้ว`);
      if ($('#projectsDialog').open) renderProjectList();
    }).catch(() => toast('บันทึกโครงการไม่สำเร็จ — เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูล กรุณาใช้ "ส่งออกข้อมูล"'));
  }

  function confirmDiscard(what) {
    return !state._dirty || confirm(`โครงการที่เปิดอยู่มีการแก้ไขที่ยังไม่ได้บันทึก\nต้องการ${what}โดยไม่บันทึกหรือไม่?\n(กด "ยกเลิก" แล้วกด "บันทึกโครงการ" ก่อน หากต้องการเก็บไว้)`);
  }

  function openProject(id) {
    if (id === state._id && !state._dirty) { $('#projectsDialog').close(); return; }
    if (!confirmDiscard('เปิดโครงการอื่น')) return;
    dbGet(id).then(rec => {
      if (!rec) return toast('ไม่พบโครงการนี้');
      replaceState(Object.assign({}, rec.data, { _id: rec.id, _dirty: false, _savedAt: rec.updatedAt }), `เปิดโครงการ "${rec.name}" แล้ว`);
      setDoc(docForStage(state.stage));
      $('#projectsDialog').close();
    });
  }

  function duplicateProject(id) {
    dbGet(id).then(rec => {
      if (!rec) return;
      const data = JSON.parse(JSON.stringify(rec.data));
      data.project = (data.project || 'โครงการไม่มีชื่อ') + ' (สำเนา)';
      return dbPut(makeRecord(newId(), data)).then(() => { toast('ทำสำเนาโครงการแล้ว'); renderProjectList(); });
    });
  }

  function deleteProject(id) {
    dbGet(id).then(rec => {
      if (!rec || !confirm(`ลบโครงการ "${rec.name}" ออกจากรายการ?\nการลบไม่สามารถย้อนกลับได้`)) return;
      return dbDelete(id).then(() => {
        if (state._id === id) { delete state._id; state._dirty = true; save(); updateProjectStatus(); }
        toast('ลบโครงการแล้ว'); renderProjectList();
      });
    });
  }

  const STAGES = { proposal: 'เสนอโครงการ', running: 'กำลังดำเนินการ', done: 'สรุปผลแล้ว' };
  // a project still being proposed opens on the proposal, later stages on the summary report
  const docForStage = st => (st === 'proposal' ? 'proposal' : 'summary');

  function fmtDate(t) {
    return new Date(t).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderProjectList() {
    const box = $('#projectList');
    dbAll().then(list => {
      const q = $('#projectSearch').value.trim().toLowerCase();
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      const stageOf = r => STAGES[(r.data && r.data.stage) || r.stage] || STAGES.done;
      const shown = list.filter(r => !q || `${r.name} ${r.owner} ${r.year} ${stageOf(r)}`.toLowerCase().includes(q));
      if (!shown.length) {
        box.innerHTML = `<p class="pd-empty">${list.length ? 'ไม่พบโครงการที่ค้นหา' : 'ยังไม่มีโครงการที่บันทึกไว้<br>กรอกข้อมูลแล้วกด "บันทึกโครงการ" ที่แถบด้านบน'}</p>`;
        return;
      }
      box.innerHTML = shown.map(r => `
        <div class="pd-item${r.id === state._id ? ' current' : ''}" data-id="${esc(r.id)}">
          <div class="info">
            <div class="name">${esc(r.name)}${r.id === state._id ? '<span class="badge">กำลังเปิด</span>' : ''}</div>
            <div class="meta"><span class="stage stage-${esc((r.data && r.data.stage) || r.stage || 'done')}">${stageOf(r)}</span> ปีงบประมาณ ${esc(r.year || '-')} · ${esc(r.owner || '-')} · บันทึกล่าสุด ${fmtDate(r.updatedAt)}</div>
          </div>
          <div class="acts">
            <button type="button" class="btn small" data-act="open">เปิด/แก้ไข</button>
            <button type="button" class="btn small" data-act="copy">ทำสำเนา</button>
            <button type="button" class="btn small" data-act="export">ส่งออก</button>
            <button type="button" class="btn small danger" data-act="delete">ลบ</button>
          </div>
        </div>`).join('');
    }).catch(() => { box.innerHTML = '<p class="pd-empty">เบราว์เซอร์นี้ไม่อนุญาตให้เก็บข้อมูลโครงการ (เช่น โหมดไม่ระบุตัวตน)</p>'; });
  }

  function updateProjectStatus() {
    const name = (state.project || '').trim() || 'โครงการไม่มีชื่อ';
    const status = !state._id ? 'ยังไม่ได้บันทึก' : state._dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกแล้ว';
    $('#currentProject').textContent = `${name} — ${status}`;
    $('#btnSaveProject').classList.toggle('dirty', !state._id || !!state._dirty);
  }

  function backupAll() {
    dbAll().then(list => {
      if (!list.length) return toast('ยังไม่มีโครงการที่บันทึกไว้');
      downloadJSON({ type: 'project-summary-backup', version: 1, exportedAt: new Date().toISOString(), projects: list }, 'project-summary-backup');
    });
  }

  // ---------------------------------------------------------------- Word import
  // js/docx-import.js reads the school's proposal form / summary report (and this system's own
  // exports) and returns the fields it recognised; they start a new, unsaved project.
  const IMPORT_EXPECT = {
    proposal: { project: 'ชื่อโครงการ', owner: 'ผู้รับผิดชอบโครงการ', objectives: 'วัตถุประสงค์', steps: 'กิจกรรม/ขั้นตอน',
      planStart: 'ระยะเวลาดำเนินโครงการ', budgetItems: 'รายละเอียดการใช้งบประมาณ', indicators: 'ตัวชี้วัด' },
    summary: { project: 'ชื่อโครงการ', year: 'ปีงบประมาณ', owner: 'ผู้รับผิดชอบโครงการ', objectives: 'วัตถุประสงค์', steps: 'ขั้นตอนการปฏิบัติงาน',
      budgetPlan: 'งบประมาณตามแผน', budgetActual: 'งบประมาณที่ใช้จริง', indicators: 'ตัวชี้วัด', evalItems: 'แบบประเมินผลการปฏิบัติการ', satItems: 'แบบประเมินความพึงพอใจ' }
  };
  function importDocx(file) {
    if (!confirmDiscard('นำเข้าไฟล์ Word')) return;
    toast('กำลังอ่านไฟล์ Word…');
    loadScript('js/docx-import.js')
      .then(() => file.arrayBuffer())
      .then(buf => window.ProjectDocxImport.parse(buf))
      .then(res => {
        if (!res.types.length) {
          toast('ไม่พบรูปแบบแบบเสนอโครงการหรือรายงานสรุปโครงการในไฟล์นี้');
          return;
        }
        const keep = {};
        ['school', 'schoolFull', 'office', 'officeShort', 'obec', 'ministry', 'director', 'directorPosition',
          'deputy', 'deputyPosition', 'policyFocus', 'coverImage'].forEach(k => { keep[k] = state[k]; });
        const next = Object.assign(blankState(), keep, res.fields);
        // a proposal imported while working on summaries is a project that is already running
        next.stage = res.types.includes('summary') ? 'done' : (docMode === 'summary' ? 'running' : 'proposal');
        next._dirty = true;
        replaceState(next);
        showImportReport(res, file.name);
      })
      .catch(err => {
        console.error(err);
        toast(err && err.message === 'no-decompression' ? 'เบราว์เซอร์นี้อ่านไฟล์ Word ไม่ได้ กรุณาใช้ Chrome, Edge, Firefox หรือ Safari รุ่นใหม่'
          : 'อ่านไฟล์ไม่สำเร็จ — รองรับเฉพาะไฟล์ .docx (ถ้าเป็น .doc ให้เปิดใน Word แล้วบันทึกเป็น .docx)');
      });
  }
  function showImportReport(res, name) {
    const typeNames = res.types.map(t => DOCS[t]).join(' และ ');
    const missing = [];
    res.types.forEach(t => Object.entries(IMPORT_EXPECT[t]).forEach(([k, label]) => {
      if (!(k in res.fields) && !missing.includes(label)) missing.push(label);
    }));
    $('#importReport').innerHTML = `
      <p>ไฟล์ <b>${esc(name)}</b> เป็น<b>${typeNames}</b> สร้างเป็นโครงการใหม่ (ยังไม่ได้บันทึก) โดยคงข้อมูลโรงเรียนเดิมไว้</p>
      <h3>นำเข้าแล้ว ${res.found.length} รายการ</h3>
      <div class="chips">${res.found.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>
      ${missing.length ? `<h3>ไม่พบในไฟล์ (กรอกเพิ่มเองในแบบฟอร์ม)</h3><div class="chips">${missing.map(f => `<span class="chip miss">${esc(f)}</span>`).join('')}</div>` : ''}
      ${res.warnings.length ? `<h3>ควรตรวจสอบ</h3><ul>${res.warnings.map(w => `<li class="warn">${esc(w)}</li>`).join('')}</ul>` : ''}`;
    $('#toast').classList.remove('show');
    $('#importDialog').showModal();
  }

  // Accepts a Word file, a backup of all projects or a single exported project.
  function importFile(file, { openSingle }) {
    if (/\.docx$/i.test(file.name) || /wordprocessingml/.test(file.type)) { importDocx(file); return; }
    if (/\.doc$/i.test(file.name)) { toast('รองรับเฉพาะไฟล์ .docx — เปิดไฟล์ใน Word แล้วบันทึกเป็น .docx ก่อน'); return; }
    const r = new FileReader();
    r.onload = () => {
      let data;
      try { data = JSON.parse(r.result); } catch (e) { return toast('ไฟล์ไม่ถูกต้อง'); }
      if (data && data.type === 'project-summary-backup' && Array.isArray(data.projects)) {
        const recs = data.projects.filter(p => p && p.id && p.data);
        Promise.all(recs.map(rec => dbPut(rec)))
          .then(() => { toast(`นำเข้า ${recs.length} โครงการแล้ว`); if ($('#projectsDialog').open) renderProjectList(); })
          .catch(() => toast('นำเข้าไม่สำเร็จ'));
      } else if (data && typeof data === 'object') {
        const proj = projectData(data);
        if (openSingle) {
          if (!confirmDiscard('นำเข้าไฟล์')) return;
          replaceState(Object.assign(proj, { _dirty: true }), 'นำเข้าข้อมูลแล้ว — กด "บันทึกโครงการ" เพื่อเก็บไว้ในรายการ');
        } else {
          dbPut(makeRecord(newId(), normalize(proj))).then(() => { toast('นำเข้าโครงการแล้ว'); renderProjectList(); });
        }
      } else toast('ไฟล์ไม่ถูกต้อง');
    };
    r.readAsText(file);
  }

  // The preview can be hidden (mobile form view), in which case the embedded font has not been
  // requested yet, so load it explicitly before printing.
  function fontsReady() {
    if (!document.fonts) return null;
    return Promise.all(['400', '700'].map(w => document.fonts.load(`${w} 16pt "TH Sarabun New"`)))
      .then(() => document.fonts.ready)
      .catch(() => null);
  }

  async function savePdf() {
    const low = await printedImages().then(l => l.filter(x => x.dpi < MIN_DPI));
    if (low.length && !confirm(`รูปภาพต่อไปนี้มีความละเอียดต่ำกว่า ${MIN_DPI} dpi เมื่อพิมพ์:\n` +
        low.map(x => `• ${x.label}: ประมาณ ${x.dpi} dpi (ควรใช้รูป${x.need})`).join('\n') +
        `\n\nข้อความ เส้นตาราง และลวดลายหน้าปกใน PDF เป็นเวกเตอร์ คมชัดทุกความละเอียดอยู่แล้ว` +
        `\nรูปจะคมชัดเท่าไฟล์ต้นฉบับเท่านั้น (ระบบไม่ลดความละเอียดรูป)\n\nบันทึก PDF ต่อหรือไม่?`)) return;
    const prevTitle = document.title;
    document.title = `${docMode === 'proposal' ? 'แบบเสนอโครงการ' : 'สรุปโครงการ'} ${state.project || ''} ปีงบประมาณ ${state.year}`.trim();
    // Wait for images so nothing is missing from the PDF.
    const imgs = $$('#doc img');
    Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })))
      .then(fontsReady)
      .then(() => {
        window.print();
        setTimeout(() => { document.title = prevTitle; }, 500);
      });
  }

  function replaceState(next, msg) {
    state = normalize(next);
    renderForm(); render(); save(); updateProjectStatus();
    if (msg) toast(msg);
  }

  // ---------------------------------------------------------------- document switch
  const DOCS = { proposal: 'แบบเสนอโครงการ', summary: 'รายงานสรุปโครงการ' };
  let docMode = 'summary';
  function saveUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ view: document.body.dataset.view, doc: docMode })); } catch (e) { /* ignore */ }
  }
  function setDoc(mode) {
    docMode = DOCS[mode] ? mode : 'summary';
    document.body.dataset.doc = docMode;
    $$('[data-doc-btn]').forEach(b => {
      const on = b.dataset.docBtn === docMode;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on));
    });
    $('#docLabel').textContent = DOCS[docMode];
    saveUi();
    render();
  }

  async function init() {
    let ui = {};
    try { ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}'); if (ui.view) document.body.dataset.view = ui.view; } catch (e) { /* ignore */ }
    docMode = DOCS[ui.doc] ? ui.doc : 'summary';
    document.body.dataset.doc = docMode;
    if (!document.body.dataset.view) document.body.dataset.view = 'form';
    $$('.mobile-switch button').forEach(b => b.classList.toggle('active', b.dataset.view === document.body.dataset.view));

    // An IndexedDB write started while the page was closing may not have finished; the synchronous
    // localStorage copy is then newer, so keep whichever copy was saved last.
    const working = await loadWorkingCopy();
    if (working && (working._autosavedAt || 0) >= (state._autosavedAt || 0)) state = working;

    renderForm();
    setDoc(docMode);
    updateProjectStatus();
    $$('[data-doc-btn]').forEach(b => b.addEventListener('click', () => setDoc(b.dataset.docBtn)));

    const editor = $('#editor');
    editor.addEventListener('input', e => {
      if (e.target.closest('[data-list]')) return onListEvent(e);
      if (e.target.closest('#stepsEditor')) return onStepsEvent(e);
      if (e.target.closest('[data-rating]')) return onRatingEvent(e);
      if (e.target.closest('#photoList')) return onPhotoEvent(e);
      if (e.target.closest('#budgetEditor')) return onBudgetEvent(e);
      onFieldInput(e);
    });
    editor.addEventListener('change', e => { if (e.target.matches('select, input[type=checkbox]')) onFieldInput(e); });
    editor.addEventListener('click', e => {
      if (e.target.closest('[data-list]')) return onListEvent(e);
      if (e.target.closest('#stepsEditor')) return onStepsEvent(e);
      if (e.target.closest('[data-rating]')) return onRatingEvent(e);
      if (e.target.closest('#photoList')) return onPhotoEvent(e);
      if (e.target.closest('#budgetEditor')) return onBudgetEvent(e);
      const add = e.target.closest('[data-add-rating]');
      if (add) { state[add.dataset.addRating].push({ text: '', c: [0, 0, 0, 0, 0] }); renderRatings(); changed(); }
    });

    $('#addBudgetItem').addEventListener('click', () => {
      state.budgetItems.push({ text: '', comp: 0, use: 0, mat: 0 }); renderBudget(); changed();
      focusLast($('#budgetEditor'), 'input[data-f=text]');
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
      state.coverImage = await readImage(f, COVER_MAX_SIDE); e.target.value = ''; changed();
    });
    $('#coverReset').addEventListener('click', () => { state.coverImage = ''; changed(); });

    $('#btnPdf').addEventListener('click', savePdf);
    $('#btnDocx').addEventListener('click', saveDocx);
    $('#btnExport').addEventListener('click', () => downloadJSON());
    $('#btnSaveProject').addEventListener('click', saveProject);
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(); }
    });
    $('#btnProjects').addEventListener('click', () => {
      $('#projectSearch').value = '';
      renderProjectList();
      $('#projectsDialog').showModal();
    });
    $('#projectsDialog').addEventListener('click', e => {
      if (e.target === e.currentTarget || e.target.closest('[data-close]')) return $('#projectsDialog').close();
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const id = btn.closest('.pd-item').dataset.id;
      ({ open: openProject, copy: duplicateProject, delete: deleteProject,
         export: i => dbGet(i).then(rec => rec && downloadJSON(rec.data)) })[btn.dataset.act](id);
    });
    $('#projectSearch').addEventListener('input', renderProjectList);
    $('#importDialog').addEventListener('click', e => {
      if (e.target === e.currentTarget || e.target.closest('[data-close]')) $('#importDialog').close();
    });
    $('#btnBackup').addEventListener('click', backupAll);
    $('#backupImport').addEventListener('change', e => {
      const f = e.target.files[0]; if (f) importFile(f, { openSingle: false }); e.target.value = '';
    });
    $('#btnSample').addEventListener('click', () => {
      if (confirmDiscard('โหลดข้อมูลตัวอย่าง') && (state._dirty || confirm(`แทนที่ข้อมูลที่เปิดอยู่ด้วยตัวอย่าง${DOCS[docMode]}?`))) {
        replaceState(docMode === 'proposal' ? sampleProposal() : sampleState(), `โหลดตัวอย่าง${DOCS[docMode]}แล้ว`);
      }
    });
    $('#btnNew').addEventListener('click', () => {
      if (confirmDiscard('เริ่มโครงการใหม่') && (state._dirty || confirm('เริ่มโครงการใหม่? (โครงการที่บันทึกไว้ยังอยู่ในรายการ "โครงการที่บันทึกไว้")'))) {
        const keep = sampleState(); const b = blankState();
        // keep the school details so a new project only needs project-specific data
        ['school', 'schoolFull', 'office', 'officeShort', 'obec', 'ministry', 'director', 'directorPosition',
          'deputy', 'deputyPosition', 'policyFocus', 'coverImage']
          .forEach(k => { b[k] = state[k] || keep[k]; });
        replaceState(b, 'เริ่มโครงการใหม่แล้ว — เริ่มจากแบบเสนอโครงการ');
        setDoc('proposal');
      }
    });
    $('#fileImport').addEventListener('change', e => {
      const f = e.target.files[0]; if (f) importFile(f, { openSingle: true }); e.target.value = '';
    });

    $$('.mobile-switch button').forEach(b => b.addEventListener('click', () => {
      document.body.dataset.view = b.dataset.view;
      $$('.mobile-switch button').forEach(x => x.classList.toggle('active', x === b));
      saveUi();
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
