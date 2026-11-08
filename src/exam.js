/* 模块：考试科目识别
 * 数据层：KP_CONTENT.kp_examRules（按学科门类 → 统考科目）
 * 存储层：kp_store 键 'exam.recognized'（用户识别记录）
 * 功能：用户输入报考院校 + 专业/学科 → 自动识别 4 门考试科目
 *       （政治 / 英语 / 数学或自命题 / 专业课）
 */
(function (global) {
  'use strict';

  var E = {};

  /* ---------- 识别规则（按学科门类，参考 2026 考研统考科目） ---------- */
  var RULES = {
    '哲学':       { en: '英语一', math: '数学一', major: '专业课（自命题）' },
    '经济学':     { en: '英语一', math: '数学三', major: '专业课（自命题）' },
    '法学':       { en: '英语一', math: null,      major: '专业课（自命题）' },
    '文学':       { en: '英语一', math: null,      major: '专业课（自命题）' },
    '历史学':     { en: '英语一', math: null,      major: '专业课（自命题）' },
    '教育学':     { en: '英语二', math: null,      major: '311 教育学专业基础（统考）' },
    '理学':       { en: '英语一', math: '数学一', major: '专业课（自命题）' },
    '工学':       { en: '英语一', math: '数学一', major: '专业课（自命题）' },
    '农学':       { en: '英语二', math: '数学一', major: '300 农学基础（统考）' },
    '医学':       { en: '英语二', math: null,      major: '306 临床医学综合（统考）' },
    '军事学':     { en: '英语二', math: '数学一', major: '专业课（自命题）' },
    '管理学':     { en: '英语二', math: '数学三', major: '专业课（自命题）' },
    '艺术学':     { en: '英语二', math: null,      major: '专业课（自命题）' },
    '交叉学科':   { en: '英语二', math: null,      major: '专业课（自命题）' },
    '新闻传播':   { en: '英语一', math: null,      major: '新闻与传播专业基础（统考）' },
    '会计':       { en: '英语二', math: '数学二', major: '199 管理类联考综合（统考）' },
    'MPA':        { en: '英语二', math: null,      major: '199 管理类联考综合（统考）' },
    'MBA':        { en: '英语二', math: null,      major: '199 管理类联考综合（统考）' },
    'MEM':        { en: '英语二', math: null,      major: '199 管理类联考综合（统考）' },
    '法律硕士':   { en: '英语一', math: null,      major: '397 法硕基础 / 398 法硕综合（统考）' },
    '计算机':     { en: '英语一', math: '数学一', major: '408 计算机学科专业基础（统考）' },
    '建筑学':     { en: '英语二', math: null,      major: '131 建筑学基础（统考）' },
    '体育学':     { en: '英语二', math: null,      major: '306 体育学基础（统考）' }
  };

  /* ---------- 学科门类匹配（关键词 → 规则键） ---------- */
  var KEYWORD_MAP = {
    '哲学':       ['哲学', '伦理学', '逻辑学', '美学'],
    '经济学':     ['经济学', '金融学', '国际经济', '世界经济', '数量经济', '经济统计', '产业经济'],
    '法学':       ['法学', '法律', '知识产权', '刑法', '民法', '诉讼法', '国际法'],
    '文学':       ['汉语言', '中国文学', '比较文学', '文艺学', '语言学'],
    '历史学':     ['历史', '考古', '文博', '史学'],
    '教育学':     ['教育学', '教育技术', '学科教学', '课程与教学', '教育心理'],
    '理学':       ['数学', '物理', '化学', '生物', '地理', '大气', '海洋', '地质', '天文', '生态', '材料', '环境科学', '心理'],
    '工学':       ['软件', '电子', '通信', '机械', '电气', '土木', '水利', '交通', '航空', '航天', '兵器', '控制', '仪器', '测绘', '能源', '动力', '核能', '食品', '轻工', '纺织', '冶金', '矿业', '安全', '化工', '海洋工程', '船舶', '船舶与海洋'],
    '农学':       ['农业', '农学', '园艺', '植物保护', '畜牧', '兽医', '草学', '林学', '林业', '水产', '草业'],
    '医学':       ['临床', '医学', '药学', '基础医学', '护理', '公共卫生', '卫生事业', '口腔', '影像', '麻醉'],
    '军事学':     ['军事', '军械'],
    '管理学':     ['工商管理', '管理科学与工程', '工业工程', '市场营销', '人力资源管理', '会计学', '审计', '技术经济', '物流', '管理'],
    '艺术学':     ['美术', '音乐', '舞蹈', '戏剧', '电影', '广播电视', '艺术设计', '设计学', '音乐学', '表演', '播音', '艺术'],
    '交叉学科':   ['人工智能', '集成电路', '智能科学', '量子', '碳中和'],
    '新闻传播':   ['新闻', '传播', '传媒', '广告', '出版', '网络传播'],
    '会计':       ['会计', 'MPACC', 'mpacc'],
    'MPA':        ['MPA', '公共管理', '工商管理硕士', '公共管理硕士'],
    'MBA':        ['MBA', '工商管理硕士'],
    'MEM':        ['MEM', '工程管理硕士'],
    '法律硕士':   ['法律硕士', '法硕', '法律（法学）', '法律（非法学）'],
    '建筑学':     ['建筑学', '城乡规划', '风景园林', '建筑'],
    '体育学':     ['体育', '运动', '武术', '球类', '体能'],
    '计算机':     ['计算机科学', '计算机技术', '计算机', '软件工程']
  };

  /* ---------- 学科门类识别 ---------- */
  E.matchCategory = function (majorInput) {
    if (!majorInput || !majorInput.trim()) return null;
    var q = String(majorInput).trim().toLowerCase();
    var qUpper = String(majorInput).trim();
    var matched = [];
    for (var cat in KEYWORD_MAP) {
      var kws = KEYWORD_MAP[cat];
      for (var i = 0; i < kws.length; i++) {
        var kw = kws[i];
        if (qUpper.indexOf(kw) >= 0 || q.indexOf(kw.toLowerCase()) >= 0) {
          matched.push(cat);
          break;
        }
      }
    }
    if (!matched.length) return null;
    /* MBA/MEM/MPA 等联考优先；其次会计；最后按命中顺序取第一个 */
    if (matched.indexOf('MBA') >= 0) return 'MBA';
    if (matched.indexOf('MEM') >= 0) return 'MEM';
    if (matched.indexOf('MPA') >= 0) return 'MPA';
    if (matched.indexOf('会计') >= 0) return '会计';
    if (matched.indexOf('法律硕士') >= 0) return '法律硕士';
    if (matched.indexOf('计算机') >= 0) return '计算机';
    if (matched.indexOf('建筑学') >= 0) return '建筑学';
    if (matched.indexOf('体育学') >= 0) return '体育学';
    if (matched.indexOf('新闻传播') >= 0) return '新闻传播';
    return matched[0];
  };

  /* ---------- 院校名称 → 门类（仅看校名时兜底） ---------- */
  var SCHOOL_CATEGORY = [
    { re: /(计算机|软件|电子|通信|邮电)/, cat: '计算机' },
    { re: /(航空|航天|国防|兵器)/,        cat: '工学' },
    { re: /(师范|教育)/,                   cat: '教育学' },
    { re: /(财经|金融|会计|税务|海关)/,     cat: '管理学' },
    { re: /(政法|公安)/,                   cat: '法学' },
    { re: /(医学院|医科大学|药学)/,        cat: '医学' },
    { re: /(外国语|语言)/,                 cat: '文学' },
    { re: /(艺术|美术学院|音乐学院)/,      cat: '艺术学' },
    { re: /(体育|运动)/,                   cat: '体育学' },
    { re: /(农业|林业|水产|牧)/,          cat: '农学' },
    { re: /(矿业|石油|地质|冶金|化工)/,    cat: '工学' },
    { re: /(交通|铁路|船舶)/,             cat: '工学' },
    { re: /(建筑|城建)/,                   cat: '建筑学' },
    { re: /(海洋)/,                         cat: '工学' },
    { re: /(民族)/,                         cat: '文学' },
    { re: /(中央|清华|北大|复旦|浙大)/,    cat: '管理学' }
  ];

  E.matchSchool = function (schoolName) {
    if (!schoolName || !schoolName.trim()) return null;
    var s = String(schoolName).trim();
    for (var i = 0; i < SCHOOL_CATEGORY.length; i++) {
      if (SCHOOL_CATEGORY[i].re.test(s)) return SCHOOL_CATEGORY[i].cat;
    }
    return null;
  };

  /* ---------- 识别 4 门考试科目 ---------- */
  E.identify = function (schoolName, majorInput) {
    var cat = E.matchCategory(majorInput) || E.matchSchool(schoolName);
    var rule = cat ? RULES[cat] : null;
    var result = {
      school: schoolName || '',
      majorInput: majorInput || '',
      category: cat,
      politics: '101 思想政治理论',
      english: rule ? rule.en : '英语二（默认）',
      math: rule && rule.math ? rule.math : null,
      major: rule ? rule.major : '专业课（自命题，未匹配到规则）',
      matched: !!(cat && rule)
    };
    if (!result.math) result.math = null;
    return result;
  };

  /* ---------- 视图 ---------- */
  E.render = function (view) {
    var store = global.KP_STORE;
    var last = store ? (store.get('exam.recognized') || [])[0] : null;
    var lastHtml = '';
    if (last && last.result) {
      lastHtml = '<div class="exam-last" data-exam-last>' +
        '<div class="exam-last__head"><b>上次识别</b><span class="exam-last__school">' + esc(last.result.school || '') + ' · ' + esc(last.majorInput || '') + '</span></div>' +
        '<div class="exam-subjects">' + buildSubjects(last.result) + '</div>' +
      '</div>';
    }

    var viewEl = view;
    viewEl.innerHTML =
      '<div class="card exam-card">' +
        '<h2 class="card__title">考试科目识别</h2>' +
        '<p class="card__desc">输入报考院校与专业 → 自动识别 4 门考试科目（政治/英语/数学/专业课）</p>' +

        '<div class="exam-form" data-exam-form>' +
          '<div class="exam-field" data-exam-field="school">' +
            '<label class="exam-field__label">报考院校</label>' +
            '<input class="exam-field__input" type="text" data-exam-input="school" placeholder="如：清华大学 / 浙江大学 / 北京邮电大学" value="' + esc((last && last.result && last.result.school) || '') + '" />' +
          '</div>' +
          '<div class="exam-field" data-exam-field="major">' +
            '<label class="exam-field__label">报考专业 / 学科</label>' +
            '<input class="exam-field__input" type="text" data-exam-input="major" placeholder="如：计算机科学与技术 / 金融学 / 法律硕士" value="' + esc((last && last.majorInput) || '') + '" />' +
          '</div>' +
          '<div class="exam-field" data-exam-field="level">' +
            '<label class="exam-field__label">层次（可选）</label>' +
            '<select class="exam-field__select" data-exam-input="level">' +
              '<option value="">不限</option>' +
              '<option value="学术型硕士">学术型硕士</option>' +
              '<option value="专业型硕士">专业型硕士</option>' +
            '</select>' +
          '</div>' +
          '<div class="exam-form__actions">' +
            '<button class="btn btn--primary" data-exam-identify>识别考试科目</button>' +
          '</div>' +
        '</div>' +

        '<div class="exam-result" data-exam-result>' + lastHtml + '</div>' +
        '<p class="exam-tip">注：考试科目以院校当年招生简章为准，本工具为「按学科门类的常见规则」快速参考。</p>' +
      '</div>';

    viewEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-exam-identify]');
      if (!btn) return;
      var form = viewEl.querySelector('[data-exam-form]');
      var schoolInput = form.querySelector('[data-exam-input="school"]');
      var majorInput = form.querySelector('[data-exam-input="major"]');
      var levelSel = form.querySelector('[data-exam-input="level"]');
      var school = schoolInput ? schoolInput.value.trim() : '';
      var major = majorInput ? majorInput.value.trim() : '';
      if (!school && !major) { flash(viewEl, '请至少填写院校或专业'); return; }
      var result = E.identify(school, major);
      var rec = { result: result, ts: new Date().toISOString() };
      if (store) {
        var list = store.get('exam.recognized') || [];
        list.unshift(rec);
        if (list.length > 20) list.length = 20;
        store.set('exam.recognized', list);
      }
      var box = viewEl.querySelector('[data-exam-result]');
      box.innerHTML = '<div class="exam-last" data-exam-last>' +
        '<div class="exam-last__head"><b>识别结果</b>' +
        '<span class="exam-last__school">' + esc(school || '（未填院校）') + ' · ' + esc(major || '（未填专业）') + '</span></div>' +
        buildSubjects(result) +
        '</div>';
      flash(viewEl, result.matched ? '已识别' : '未匹配到规则，建议查院校招生简章');
    }, true);
  };

  /* 构建 4 门科目 HTML */
  function buildSubjects(r) {
    var items = [
      { label: '政治', text: r.politics },
      { label: '英语', text: r.english },
      { label: '数学', text: r.math || '不考数学' },
      { label: '专业课', text: r.major }
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html += '<div class="exam-subject" data-exam-subject=' + esc(it.label) + '>' +
        '<div class="exam-subject__label">' + esc(it.label) + '</div>' +
        '<div class="exam-subject__text">' + esc(it.text) + '</div>' +
      '</div>';
    }
    return html;
  }

  function flash(view, msg) {
    var hint = document.getElementById('offline-hint');
    if (!hint) return;
    hint.textContent = msg;
    hint.classList.add('show');
    setTimeout(function () { hint.classList.remove('show'); }, 2200);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  global.KP_EXAM = E;
})(typeof window !== 'undefined' ? window : this);
