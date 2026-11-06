/* 应用入口：导航切换 + 题库练习模块 + 各模块占位渲染 */
(function (global) {
  'use strict';

  var KP_APP = {};

  var MODULES = [
    'dashboard', 'questions', 'exam-past', 'plan',
    'vocab', 'mistakes', 'mock', 'notes', 'review'
  ];

  var LABELS = {
    dashboard:  '仪表盘',
    questions:  '题库',
    'exam-past':'真题',
    plan:       '计划',
    vocab:      '单词',
    mistakes:   '错题本',
    mock:       '模考',
    notes:      '笔记',
    review:     '间隔复习'
  };

  var TYPE_LABELS = {
    single: '单选',
    multi:  '多选',
    blank:  '填空',
    reading:'阅读'
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 占位渲染 ---------- */
  function renderPlaceholder(view, moduleId) {
    var title = LABELS[moduleId] || moduleId;
    view.innerHTML = '' +
      '<div class="card">' +
        '<h2 class="card__title">' + title + '</h2>' +
        '<p class="card__desc">该模块骨架已就绪，业务功能待实现。</p>' +
        '<div class="card__body"></div>' +
      '</div>';
  }

  /* ---------- 题库练习 ---------- */
  var QUIZ = {
    view: null,            // #view-questions
    panel: null,          // #quiz-panel
    panelInner: null,
    timer: null,          // 限时模式定时器
    session: null,        // 当前作答会话

    /* 取样题（KP_CONTENT 已加载） */
    allQuestions: function () {
      return global.KP_CONTENT && global.KP_CONTENT.kp_sampleQuestions || [];
    },

    /* 列表页渲染：四重筛选 + 题干搜索 + 限时选项 */
    renderList: function () {
      var view = this.view;
      if (!view) return;
      var qs = this.allQuestions();

      // 收集筛选维度
      var subjects = uniq(qs.map(function (q) { return q.subject; }));
      var chapters = uniq(qs.map(function (q) { return q.chapter; }));
      var types = uniq(qs.map(function (q) { return q.type; }));
      var diffs = uniq(qs.map(function (q) { return q.difficulty; })).sort();

      var favs = global.KP_STORE ? global.KP_STORE.getFavs() : [];
      var wrongSet = {};
      (global.KP_STORE ? global.KP_STORE.get('wrong') : []).forEach(function (w) { wrongSet[w.qid] = true; });

      view.innerHTML = '' +
        '<div class="card">' +
          '<h2 class="card__title">题库练习</h2>' +
          '<p class="card__desc">共 ' + qs.length + ' 道样题 · 支持筛选、限时练习、收藏、错题本</p>' +

          '<div class="quiz-filters" data-quiz-filters>' +
            group('科目', subjects, 'subj', true) +
            group('章节', chapters, 'chap', true) +
            group('题型', types, 'type', true) +
            group('难度', diffs, 'diff', true) +
            '<div class="quiz-filters__search-wrap" style="flex:1;min-width:140px;display:flex;align-items:center;gap:var(--sp-2);">' +
              '<input class="quiz-filters__search" type="search" placeholder="搜索题干…" data-quiz-search />' +
            '</div>' +
            '<div class="quiz-filters__limit">' +
              '<span class="quiz-filters__label">限时</span>' +
              '<input type="number" min="0" max="300" placeholder="分" data-quiz-limit value="" />' +
            '</div>' +
          '</div>' +

          '<div class="quiz-list" data-quiz-list></div>' +
        '</div>';

      // 状态缓存
      var state = this.filterState();
      state.subj = []; state.chap = []; state.type = []; state.diff = [];
      state.search = ''; state.limit = 0;
      this.state = state;

      // 绑定筛选
      bindFilters(view, this);
      this.renderListItems();

      function group(label, items, key, withAll) {
        var chips = items.map(function (v) {
          var label = v;
          if (key === 'type') label = TYPE_LABELS[v] || v;
          if (key === 'diff') label = '★'.repeat(v) + '☆'.repeat(5 - v);
          return '<button class="chip" data-filter-key="' + key + '" data-filter-val="' + esc(String(v)) + '">' + esc(label) + '</button>';
        }).join('');
        var allBtn = withAll ? '<button class="chip is-active" data-filter-key="' + key + '" data-filter-val="*">全部</button>' : '';
        return '<div class="quiz-filters__group"><span class="quiz-filters__label">' + label + '</span>' + allBtn + chips + '</div>';
      }

      function filterState() {
        return this.state || {};
      }
      filterState = function () { return this.state || {}; }.bind(this);
      return { group: group, filterState: filterState };
    },

    /* 渲染题目列表 */
    renderListItems: function () {
      var list = this.view && $('[data-quiz-list]', this.view);
      if (!list) return;
      var st = this.state || {};
      var qs = this.allQuestions();

      var items = qs.filter(function (q) {
        if (st.subj && st.subj.length && st.subj.indexOf(q.subject) === -1) return false;
        if (st.chap && st.chap.length && st.chap.indexOf(q.chapter) === -1) return false;
        if (st.type && st.type.length && st.type.indexOf(q.type) === -1) return false;
        if (st.diff && st.diff.length && st.diff.indexOf(q.difficulty) === -1) return false;
        if (st.search) {
          var s = st.search.toLowerCase();
          if (q.stem.toLowerCase().indexOf(s) === -1) return false;
        }
        return true;
      });

      if (!items.length) {
        list.innerHTML = '<div class="card__desc" style="text-align:center;padding:var(--sp-8)">没有符合条件的题目</div>';
        return;
      }

      var favs = global.KP_STORE ? global.KP_STORE.getFavs() : [];
      var wrongSet = {};
      (global.KP_STORE ? global.KP_STORE.get('wrong') : []).forEach(function (w) { wrongSet[w.qid] = true; });

      list.innerHTML = items.map(function (q) {
        var isFav = favs.indexOf(q.id) !== -1;
        var isWrong = wrongSet[q.id];
        var wrongTag = isWrong ? '<span style="color:var(--bad);font-weight:600;margin-left:var(--sp-1)">✗ 错题</span>' : '';
        return '' +
          '<article class="quiz-card" data-qid="' + q.id + '">' +
            '<div class="quiz-card__meta">' +
              '<span class="quiz-card__subject">' + esc(q.subject) + '</span>' +
              '<span class="quiz-card__chapter">' + esc(q.chapter) + '</span>' +
              '<span class="quiz-card__type">' + (TYPE_LABELS[q.type] || q.type) + '</span>' +
              '<span class="quiz-card__diff">' + '★'.repeat(q.difficulty) + '</span>' +
              wrongTag +
            '</div>' +
            '<p class="quiz-card__stem">' + esc(q.stem) + '</p>' +
            '<div class="quiz-card__actions">' +
              '<button class="quiz-card__fav ' + (isFav ? 'is-fav' : '') + '" data-fav="' + q.id + '" title="收藏">' + (isFav ? '★' : '☆') + '</button>' +
              '<button class="btn btn--primary" data-start="' + q.id + '">开始练习</button>' +
            '</div>' +
          '</article>';
      }).join('');

      // 收藏切换
      $all('[data-fav]', list).forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var qid = btn.getAttribute('data-fav');
          var nowFav = global.KP_STORE.toggleFav(qid);
          btn.classList.toggle('is-fav', nowFav);
          btn.textContent = nowFav ? '★' : '☆';
        });
      });

      // 开始练习
      $all('[data-start]', list).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qid = btn.getAttribute('data-start');
          var limitMin = st.limit || 0;
          this.startQuiz(qid, limitMin);
        }.bind(this));
      });
    },

    /* 开始答题面板
       context: 'practice'(默认) | 'redo'(错题重做)
       onResult(correct) 可选回调，重做场景用于掌握/累计重试 */
    startQuiz: function (qid, limitMinutes, context, onResult) {
      var qs = this.allQuestions().filter(function (q) { return q.id === qid; });
      if (!qs.length) return;
      var q = qs[0];
      this.session = {
        q: q,
        answer: q.type === 'multi' ? [] : (q.type === 'blank' ? '' : ''),
        isMulti: q.type === 'multi',
        isBlank: q.type === 'blank',
        startedAt: Date.now(),
        submitted: false,
        limitMinutes: limitMinutes || 0,
        context: context || 'practice',
        onResult: typeof onResult === 'function' ? onResult : null
      };

      this.panel.classList.add('is-open');
      this.panel.setAttribute('aria-hidden', 'false');
      this.renderPanel();

      if ((limitMinutes || 0) > 0) {
        this.startTimer(limitMinutes);
      }
    },

    /** 重做错题（供错题本调用）：复用答题组件，答对掌握 / 答错累加 */
    redoWrong: function (qid) {
      var wrongItem = global.KP_STORE && global.KP_STORE.get('wrong').filter(function (w) { return w.qid === qid; })[0];
      this.startQuiz(qid, 0, 'redo', function (correct) {
        if (!global.KP_STORE) return;
        if (correct) {
          global.KP_STORE.masterWrong(qid);
        } else {
          global.KP_STORE.addWrong({
            qid: qid,
            reason: '重做仍错',
            status: 'pending'
          });
        }
      });
    },

    /* 渲染答题面板 */
    renderPanel: function () {
      var s = this.session;
      var q = s.q;
      var inner = this.panelInner;
      if (!inner) return;

      var optHtml = '';
      if (q.type === 'blank') {
        optHtml = '<input class="quiz-blank" type="text" data-blank-input placeholder="填写答案…" autocomplete="off" value="' + esc(s.answer || '') + '" />';
      } else {
        optHtml = '<ul class="quiz-opts" data-opts-list>' +
          q.options.map(function (opt, i) {
            var letter = opt.charAt(0);
            var selected = s.answer === letter || (Array.isArray(s.answer) && s.answer.indexOf(letter) !== -1);
            return '<li class="quiz-opt ' + (selected ? 'is-selected' : '') + '" data-opt-letter="' + letter + '" data-opt-index="' + i + '">' +
              '<span class="quiz-opt__badge">' + letter + '</span>' +
              '<span class="quiz-opt__text">' + esc(opt.slice(3).trim()) + '</span>' +
            '</li>';
          }).join('') +
        '</ul>';
      }

      var timerHtml = '';
      if (s.limitMinutes > 0) {
        timerHtml = '<div class="quiz-timer ' + (this._timerActive ? 'is-active' : '') + '" data-timer>' +
          '<span data-timer-text>--:--</span>' +
          '<div class="quiz-timer__bar"><div class="quiz-timer__bar-fill" data-timer-bar style="width:100%"></div></div>' +
        '</div>';
      }

      inner.innerHTML = '' +
        '<div class="quiz-panel__header">' +
          '<div>' +
            '<div class="quiz-card__meta" style="margin-bottom:var(--sp-1)">' +
              '<span class="quiz-card__subject">' + esc(q.subject) + '</span>' +
              '<span class="quiz-card__chapter">' + esc(q.chapter) + '</span>' +
              '<span class="quiz-card__type">' + (TYPE_LABELS[q.type] || q.type) + '</span>' +
              '<span class="quiz-card__diff">' + '★'.repeat(q.difficulty) + '</span>' +
            '</div>' +
          '</div>' +
          timerHtml +
          '<button class="quiz-panel__close" data-close-panel title="关闭">✕</button>' +
        '</div>' +

        '<p class="quiz-card__stem" style="font-size:15px">' + esc(q.stem) + '</p>' +
        optHtml +

        '<div class="quiz-actions">' +
          '<button class="btn" data-close-panel2>关闭</button>' +
          '<button class="btn btn--primary" data-submit-answer>提交</button>' +
        '</div>' +

        '<div class="quiz-feedback" data-feedback></div>';

      // 绑定选项点击
      $all('[data-opt-letter]', inner).forEach(function (el) {
        el.addEventListener('click', function () {
          var letter = el.getAttribute('data-opt-letter');
          if (s.isMulti) {
            var idx = s.answer.indexOf(letter);
            if (idx === -1) s.answer.push(letter);
            else s.answer.splice(idx, 1);
            $all('[data-opt-letter]', inner).forEach(function (o) {
              var l = o.getAttribute('data-opt-letter');
              o.classList.toggle('is-selected', s.answer.indexOf(l) !== -1);
            });
          } else {
            s.answer = letter;
            $all('[data-opt-letter]', inner).forEach(function (o) {
              o.classList.toggle('is-selected', o.getAttribute('data-opt-letter') === letter);
            });
          }
        });
      });

      // 填空输入
      var blankInput = $('[data-blank-input]', inner);
      if (blankInput) {
        blankInput.addEventListener('input', function () {
          s.answer = this.value;
        });
      }

      // 关闭
      $all('[data-close-panel],[data-close-panel2]', inner).forEach(function (b) {
        b.addEventListener('click', function () { this.closePanel(); }.bind(this));
      });

      // 提交
      var submitBtn = $('[data-submit-answer]', inner);
      if (submitBtn) {
        submitBtn.addEventListener('click', function () {
          this.submitAnswer();
        }.bind(this));
      }

      // 键盘 Enter 提交
      if (blankInput) {
        blankInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') this.submitAnswer();
        }.bind(this));
      }
    },

    /* 提交并判分 */
    submitAnswer: function () {
      var s = this.session;
      if (!s || s.submitted) return;
      s.submitted = true;

      var secs = Math.round((Date.now() - s.startedAt) / 1000);
      var judge = global.KP_MODEL.judgeAnswer(s.q, s.answer);
      var correct = judge.correct;

      // 写记录
      if (global.KP_STORE) {
        global.KP_STORE.addRecord({
          qid: s.q.id,
          answer: s.answer,
          correct: correct,
          seconds: secs,
          ts: Date.now()
        });
      }

      // 错题入本 / 重做结算
      if (s.context === 'redo') {
        // 重做场景：答对标记掌握并出队列，答错累加重试
        if (correct && global.KP_STORE) {
          global.KP_STORE.masterWrong(s.q.id);
        } else if (global.KP_STORE) {
          global.KP_STORE.addWrong({
            qid: s.q.id,
            reason: '重做仍错',
            status: 'pending'
          });
        }
        if (s.onResult) s.onResult(correct);
      } else if (!correct && global.KP_STORE) {
        global.KP_STORE.addWrong({
          qid: s.q.id,
          reason: (s.answer === '' || (Array.isArray(s.answer) && !s.answer.length)) ? '未作答' : '作答错误',
          status: 'pending',
          retries: 0
        });
      }

      // 间隔复习：答过的题都进入 kp_review 追踪
      //  - 答错：stage 重置 0（今日开始复习周期）
      //  - 答对：保留/推进已有 stage（首次答对则初始化 stage=0 待复习）
      if (global.KP_STORE) {
        if (!correct) {
          global.KP_STORE.reviewForgot(s.q.id);
        } else {
          global.KP_STORE.getReview(s.q.id);
        }
      }

      this.renderFeedback(correct, secs, s.answer, s.context);
    },

    /* 渲染判分反馈 */
    renderFeedback: function (correct, secs, userAnswer, context) {
      var s = this.session;
      var q = s.q;
      var fb = this.panelInner && $('[data-feedback]', this.panelInner);
      if (!fb) return;

      var userText;
      if (Array.isArray(userAnswer)) userText = userAnswer.sort().join(', ');
      else userText = userAnswer === '' || userAnswer == null ? '（未作答）' : userAnswer;

      var isRedo = context === 'redo';
      var resultLabel = correct ? '✓ 回答正确' : '✗ 回答错误';
      var hint = '';
      if (isRedo) {
        hint = correct ? '<br><br>已标记为掌握，本题移出错题本。'
                       : '<br><br>仍在错，重做次数 +1，可稍后再试。';
      } else if (!correct) {
        hint = '<br><br>已自动加入错题本，可在「错题本」模块重做。';
      }

      fb.innerHTML = '' +
        '<div class="quiz-feedback__result ' + (correct ? 'is-correct' : 'is-wrong') + '">' +
          '<span>' + resultLabel + '</span>' +
          '<span style="font-size:12px;color:var(--text-secondary)">用时 ' + secs + 's</span>' +
        '</div>' +
        '<div class="quiz-feedback__analysis">' +
          '<strong>正确答案：</strong>' +
          (Array.isArray(q.answer) ? q.answer.join(', ') : esc(String(q.answer))) +
          '<br><strong>你的答案：</strong>' + esc(userText) +
          '<br><br><strong>解析：</strong>' + esc(q.analysis || '（无）') +
          hint +
        '</div>' +
        '<div class="quiz-actions" style="justify-content:flex-end;margin-top:var(--sp-3)">' +
          '<button class="btn" data-close-panel3>' + (isRedo ? '返回错题本' : '返回列表') + '</button>' +
          '<button class="btn btn--primary" data-retry>' + (correct ? '完成' : '再试一次') + '</button>' +
        '</div>';

      // 标记该选项反馈
      $all('[data-opt-letter]', this.panelInner).forEach(function (o) {
        var letter = o.getAttribute('data-opt-letter');
        var isCorrectOpt = Array.isArray(q.answer) ? q.answer.indexOf(letter) !== -1 : q.answer === letter;
        if (isCorrectOpt) o.style.borderColor = 'var(--ok)';
      });

      $('[data-close-panel3]', this.panelInner).addEventListener('click', function () {
        this.closePanel();
      }.bind(this));
      $('[data-retry]', this.panelInner).addEventListener('click', function () {
        this.startQuiz(q.id, s.limitMinutes, s.context, s.onResult);
      }.bind(this));

      fb.classList.add('is-shown');
    },

    /* 关闭面板 */
    closePanel: function () {
      var wasRedo = this.session && this.session.context === 'redo';
      this.stopTimer();
      this.session = null;
      this._timerActive = false;
      var panel = this.panel;
      if (panel) {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
        this.panelInner.innerHTML = '';
      }
      this.renderListItems();
      // 重做场景关闭后刷新错题本（若当前在错题本视图）
      if (wasRedo && global.KP_APP._mistakesViewActive) {
        global.KP_APP._renderMistakes();
        global.KP_APP._mistakesViewActive = false;
      }
    },

    /* 限时模式 */
    startTimer: function (minutes) {
      this.stopTimer();
      this._timerActive = true;
      var remaining = minutes * 60;
      var total = remaining;
      var el = this.panelInner && $('[data-timer]', this.panelInner);
      var textEl = el && $('[data-timer-text]', el);
      var barEl = el && $('[data-timer-bar]', el);

      function tick() {
        remaining--;
        if (remaining <= 0) {
          this.stopTimer();
          if (this._timerActive === false && this.session && !this.session.submitted) {
            // 倒计时归零自动交卷
            if (this.session) {
              this.session.submitted = true;
              // 交卷：未答的题按未作答处理
              this.submitAnswer();
            }
          }
          if (textEl) textEl.textContent = '00:00';
          if (barEl) barEl.style.width = '0%';
          if (el) { el.classList.add('is-active', 'is-danger'); }
          return;
        }
        var m = Math.floor(remaining / 60);
        var s = remaining % 60;
        if (textEl) textEl.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
        if (barEl) barEl.style.width = Math.round((remaining / total) * 100) + '%';
        if (el && remaining <= 30) el.classList.add('is-danger');
        this._quizTimer = setTimeout(tick.bind(this), 1000);
      }
      if (el) el.classList.add('is-active');
      tick();
    },

    stopTimer: function () {
      if (this._quizTimer) {
        clearTimeout(this._quizTimer);
        this._quizTimer = null;
      }
    }
  };

  function bindFilters(view, quiz) {
    var filterRoot = $('[data-quiz-filters]', view);
    if (!filterRoot) return;

    // 点击 chip 筛选
    filterRoot.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-filter-key]');
      if (!chip) return;
      var key = chip.getAttribute('data-filter-key');
      var val = chip.getAttribute('data-filter-val');

      if (val === '*') {
        // 选“全部”：清空该维度
        quiz.state[key] = [];
        $all('[data-filter-key="' + key + '"]', filterRoot).forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
      } else {
        // 切换
        var arr = quiz.state[key] || [];
        if (!arr.length || arr.indexOf(val) !== -1) {
          quiz.state[key] = [val];
        } else {
          arr.push(val);
          quiz.state[key] = arr;
        }
        $all('[data-filter-key="' + key + '"]', filterRoot).forEach(function (c) {
          var cv = c.getAttribute('data-filter-val');
          c.classList.toggle('is-active', cv === '*' ? false : arr.indexOf(cv) !== -1);
        });
        var allChip = filterRoot.querySelector('[data-filter-key="' + key + '"][data-filter-val="*"]');
        if (allChip) allChip.classList.toggle('is-active', arr.length === 0);
      }
      quiz.renderListItems();
    });

    // 搜索
    var search = $('[data-quiz-search]', filterRoot);
    if (search) {
      search.addEventListener('input', function () {
        quiz.state.search = this.value.trim();
        quiz.renderListItems();
      });
    }

    // 限时
    var limit = $('[data-quiz-limit]', filterRoot);
    if (limit) {
      limit.addEventListener('input', function () {
        var v = parseInt(this.value, 10) || 0;
        quiz.state.limit = v;
      });
    }
  }

  function uniq(arr) {
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v == null) continue;
      var k = String(v);
      if (!seen[k]) { seen[k] = true; out.push(v); }
    }
    return out;
  }

  /* ---------- CSV 导出 ---------- */
  function csvEscape(v) {
    var s = String(v == null ? '' : v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /* ---------- 错题本聚合页 ---------- */
  var MISTAKES = {
    view: null,           // #view-mistakes
    activeSubject: 'all', // 当前选中科目

    /* 取「已入错题」的题目（按 qid 反查样题，保证数据完整） */
    wrongEntries: function () {
      var wrong = global.KP_STORE ? global.KP_STORE.get('wrong') : [];
      var qs = global.KP_CONTENT ? global.KP_CONTENT.kp_sampleQuestions : [];
      var qmap = {};
      qs.forEach(function (q) { qmap[q.id] = q; });
      return wrong.map(function (w) {
        return {
          qid: w.qid,
          subject: (qmap[w.qid] && qmap[w.qid].subject) || '未知',
          chapter: (qmap[w.qid] && qmap[w.qid].chapter) || '',
          q: qmap[w.qid] || null,
          reason: w.reason || '',
          status: w.status || 'pending',
          retries: w.retries || 0
        };
      });
    },

    /* 我的最近一次作答（用于展示「我的答案」） */
    lastAnswer: function (qid) {
      var recs = global.KP_STORE ? global.KP_STORE.get('records') : [];
      for (var i = recs.length - 1; i >= 0; i--) {
        if (recs[i].qid === qid) return recs[i];
      }
      return null;
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var self = this;

      var entries = this.wrongEntries();
      var subjects = uniq(entries.map(function (e) { return e.subject; }));

      // 若当前科目已无错题，回退到全部
      if (this.activeSubject !== 'all' && subjects.indexOf(this.activeSubject) === -1) {
        this.activeSubject = 'all';
      }

      var shown = this.activeSubject === 'all'
        ? entries
        : entries.filter(function (e) { return e.subject === self.activeSubject; });

      // 构建科目 Tab 区（有题才显示 Tab）
      var middleHtml;
      if (entries.length) {
        var chips = subjects.map(function (s) {
          return '<button class="chip ' + (self.activeSubject === s ? 'is-active' : '') + '" data-mtab="' + esc(s) + '">' + esc(s) + '</button>';
        }).join('');
        middleHtml = '<div class="mistakes-tabs" data-mistakes-tabs>' +
          '<button class="chip ' + (self.activeSubject === 'all' ? 'is-active' : '') + '" data-mtab="all">全部</button>' +
          chips +
        '</div>';
      } else {
        middleHtml = '<div class="card__desc" style="text-align:center;padding:var(--sp-8)">暂无错题，保持！</div>';
      }

      view.innerHTML = '' +
        '<div class="card mistakes-card">' +
          '<div class="mistakes-card__head">' +
            '<div>' +
              '<h2 class="card__title">错题本</h2>' +
              '<p class="card__desc">共 ' + entries.length + ' 道待掌握 · 重做答对即掌握移出错题本</p>' +
            '</div>' +
            '<button class="btn" data-export-csv>导出 CSV</button>' +
          '</div>' +
          middleHtml +
          '<div class="mistakes-list" data-mistakes-list></div>' +
        '</div>';

      // 科目 Tab
      $all('[data-mtab]', view).forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.activeSubject = this.getAttribute('data-mtab');
          self.render();
        });
      });

      // 导出
      var exportBtn = $('[data-export-csv]', view);
      if (exportBtn) {
        exportBtn.addEventListener('click', function () {
          self.exportCsv(entries);
        });
      }

      // 列表（仅当前科目）
      this.renderList(shown);
    },

    renderList: function (entries) {
      var view = this.view;
      var list = view && $('[data-mistakes-list]', view);
      if (!list) return;
      var self = this;

      if (!entries.length) {
        list.innerHTML = '<div class="card__desc" style="text-align:center;padding:var(--sp-8)">该科目暂无错题</div>';
        return;
      }

      list.innerHTML = entries.map(function (e) {
        var q = e.q;
        if (!q) {
          return '<article class="mistake-item mistake-item--missing">' +
            '<p class="quiz-card__stem">题目 ' + esc(e.qid) + '（题库未找到，无法重做）</p>' +
          '</article>';
        }

        var last = self.lastAnswer(e.qid);
        var myAns = last ? last.answer : null;
        var myAnsText;
        if (Array.isArray(myAns)) myAnsText = myAns.length ? myAns.slice().sort().join(', ') : '未作答';
        else myAnsText = (myAns === '' || myAns == null) ? '未作答' : String(myAns);

        return '' +
          '<article class="mistake-item" data-mqid="' + e.qid + '">' +
            '<div class="mistake-item__meta">' +
              '<span class="mistake-item__subject">' + esc(e.subject) + '</span>' +
              (e.chapter ? '<span class="mistake-item__chapter">' + esc(e.chapter) + '</span>' : '') +
              '<span class="mistake-item__type">' + (TYPE_LABELS[q.type] || q.type) + '</span>' +
              '<span class="mistake-item__retries" ' + (e.retries > 0 ? 'data-has-retry="1"' : '') + '>重做 ' + e.retries + ' 次</span>' +
            '</div>' +
            '<p class="mistake-item__stem">' + esc(q.stem) + '</p>' +
            '<div class="mistake-item__answers">' +
              '<div class="answer-line answer-line--ok"><span class="answer-line__label">正确答案</span>' +
                '<span>' + (Array.isArray(q.answer) ? q.answer.join(', ') : esc(String(q.answer))) + '</span></div>' +
              '<div class="answer-line answer-line--bad"><span class="answer-line__label">我的答案</span>' +
                '<span>' + esc(myAnsText) + '</span></div>' +
            '</div>' +
            (e.reason ? '<div class="mistake-item__reason">错因：' + esc(e.reason) + '</div>' : '') +
            '<div class="mistake-item__actions">' +
              '<button class="btn btn--primary" data-redo="' + e.qid + '">重做</button>' +
            '</div>' +
          '</article>';
      }).join('');

      // 重做按钮：复用题库答题组件
      $all('[data-redo]', list).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qid = this.getAttribute('data-redo');
          global.KP_APP._mistakesViewActive = true;
          global.KP_APP._quiz.redoWrong(qid);
        });
      });
    },

    /* 导出 CSV：文件名 kp_wrong_<date>.csv */
    exportCsv: function (entries) {
      var qs = global.KP_CONTENT ? global.KP_CONTENT.kp_sampleQuestions : [];
      var qmap = {};
      qs.forEach(function (q) { qmap[q.id] = q; });

      var header = ['题号', '科目', '章节', '题型', '题干', '正确答案', '我的答案', '错因', '重做次数', '状态'];
      var lines = [header.map(csvEscape).join(',')];

      var self = this;
      entries.forEach(function (e) {
        var q = e.q || qmap[e.qid];
        var last = q ? self.lastAnswer(e.qid) : null;
        var myAns = last ? last.answer : '';
        myAns = Array.isArray(myAns) ? myAns.join('') : (myAns == null ? '' : myAns);
        var myAnsCell = (myAns === '' || myAns == null) ? '未作答' : myAns;
        var correctAns = Array.isArray(q && q.answer) ? (q.answer || []).join('') : (q ? String(q.answer) : '');
        lines.push([
          e.qid,
          e.subject,
          e.chapter,
          q ? (TYPE_LABELS[q.type] || q.type) : '',
          q ? q.stem : ('题目 ' + e.qid),
          correctAns,
          myAnsCell,
          e.reason,
          e.retries,
          e.status === 'mastered' ? '已掌握' : '待掌握'
        ].map(csvEscape).join(','));
      });

      var csv = '\uFEFF' + lines.join('\r\n'); // BOM 让 Excel 识别 UTF-8
      var d = new Date();
      var dateStr = d.getFullYear() +
        (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) +
        (d.getDate() < 10 ? '0' : '') + d.getDate();
      var filename = 'kp_wrong_' + dateStr + '.csv';

      try {
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        if (global.navigator && global.navigator.msSaveOrOpenBlob) {
          global.navigator.msSaveOrOpenBlob(blob, filename);
        } else {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        global.alert && global.alert('导出失败：' + err.message);
      }
    }
  };

  /* ---------- 间隔复习模块 ---------- */
  var REVIEW = {
    view: null,           // #view-review

    /* 取今日到期题目（qid 列表 → 带样题元数据） */
    dueItems: function () {
      var qids = global.KP_STORE ? global.KP_STORE.dueToday() : [];
      var qs = global.KP_CONTENT ? global.KP_CONTENT.kp_sampleQuestions : [];
      var qmap = {};
      qs.forEach(function (q) { qmap[q.id] = q; });
      var review = global.KP_STORE ? global.KP_STORE.get('review') : {};

      return qids.map(function (qid) {
        var q = qmap[qid];
        var r = review[qid];
        return {
          qid: qid,
          q: q || null,
          subject: (q && q.subject) || '未知',
          chapter: (q && q.chapter) || '',
          type: q ? (TYPE_LABELS[q.type] || q.type) : '',
          stem: q ? q.stem : ('题目 ' + qid),
          stage: r ? (r.stage || 0) : 0
        };
      });
    },

    /* 今日全部待复习总数（供仪表盘） */
    dueCount: function () {
      return global.KP_STORE ? global.KP_STORE.dueToday().length : 0;
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var self = this;

      var items = this.dueItems();
      var total = items.length;
      // 今日已处理（lastDate = 今天）
      var today = new Date().toISOString().slice(0, 10);
      var review = global.KP_STORE ? global.KP_STORE.get('review') : {};
      var done = 0;
      Object.keys(review).forEach(function (qid) {
        if (review[qid].lastDate === today) done++;
      });

      // 按科目分组
      var groups = {};
      var order = [];
      items.forEach(function (it) {
        if (!groups[it.subject]) { groups[it.subject] = []; order.push(it.subject); }
        groups[it.subject].push(it);
      });

      view.innerHTML = '' +
        '<div class="card review-card">' +
          '<div class="review-card__head">' +
            '<div>' +
              '<h2 class="card__title">间隔复习</h2>' +
              '<p class="card__desc">基于艾宾浩斯遗忘曲线 · 今日待复习 ' + total + ' 题 · 已处理 ' + done + '</p>' +
            '</div>' +
            '<div class="review-card__progress"><div class="review-card__progress-fill" data-review-progress style="width:0%"></div></div>' +
          '</div>' +

          '<div class="review-list" data-review-list>' +
            (total === 0
              ? '<div class="card__desc" style="text-align:center;padding:var(--sp-8)">今日无待复习题目，稍后再来看！</div>'
              : order.map(function (subj) {
                  return '' +
                    '<div class="review-group" data-review-group>' +
                      '<div class="review-group__title">' + esc(subj) + '<span class="review-group__count">' + groups[subj].length + '</span></div>' +
                      '<div class="review-group__items">' +
                        groups[subj].map(function (it) {
                          return '' +
                            '<div class="review-item" data-review-qid="' + it.qid + '">' +
                              '<div class="review-item__meta">' +
                                '<span class="review-item__chapter">' + esc(it.chapter) + '</span>' +
                                '<span class="review-item__type">' + esc(it.type) + '</span>' +
                                '<span class="review-item__stage">第 ' + it.stage + ' 轮</span>' +
                              '</div>' +
                              '<p class="review-item__stem">' + esc(it.stem) + '</p>' +
                              '<div class="review-item__actions">' +
                                '<button class="btn btn--sm btn--ok" data-review-master="' + it.qid + '">✓ 已复习</button>' +
                                '<button class="btn btn--sm btn--bad" data-review-forgot="' + it.qid + '">✗ 忘了</button>' +
                              '</div>' +
                            '</div>';
                        }).join('') +
                      '</div>' +
                    '</div>';
                }).join('')) +
          '</div>' +
        '</div>';

      // 已复习：stage+1
      $all('[data-review-master]', view).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qid = this.getAttribute('data-review-master');
          global.KP_STORE.reviewMastered(qid);
          self.render();
        });
      });

      // 忘了：stage 重置 0
      $all('[data-review-forgot]', view).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qid = this.getAttribute('data-review-forgot');
          global.KP_STORE.reviewForgot(qid);
          self.render();
        });
      });

      this.updateProgress();
    },

    /* 更新进度条：今日已处理（lastDate=今天）占全部到期题比例 */
    updateProgress: function () {
      var view = this.view;
      if (!view) return;
      var review = global.KP_STORE ? global.KP_STORE.get('review') : {};
      var today = new Date().toISOString().slice(0, 10);
      var total = 0, done = 0;
      Object.keys(review).forEach(function (qid) {
        total++;
        if (review[qid].lastDate === today) done++;
      });
      var fill = view.querySelector('[data-review-progress]');
      if (fill) {
        var pct = total ? Math.round((done / total) * 100) : 100;
        fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      }
      var desc = view.querySelector('.review-card__desc');
      if (desc) {
        var dueNow = this.dueCount();
        desc.textContent = '基于艾宾浩斯遗忘曲线 · 今日待复习 ' + dueNow + ' 题 · 已处理 ' + done + ' / ' + total;
      }
    }
  };

  /* ---------- 真题模块 ---------- */
  var PAST = {
    view: null,
    activePaperId: null,   // 当前打开的试卷
    filter: { year: '', subject: '' },
    /* 当前卷的临时作答态 {qid: {answer, submitted, reason}} */
    draft: {},

    REASONS: ['知识点不熟', '计算失误', '审题错误', '方法不对'],

    papers: function () {
      return global.KP_CONTENT ? global.KP_CONTENT.kp_past_papers : [];
    },

    paperById: function (id) {
      var list = this.papers();
      for (var i = 0; i < list.length; i++) {
        if (list[i].paperId === id) return list[i];
      }
      return null;
    },

    /* 试卷列表（按年份/科目筛选 + 统计已作状态） */
    filteredPapers: function () {
      var store = global.KP_STORE;
      var f = this.filter;
      var out = this.papers().filter(function (p) {
        if (f.year && String(p.year) !== String(f.year)) return false;
        if (f.subject && p.subject !== f.subject) return false;
        return true;
      });
      // 统计作答
      out.forEach(function (p) {
        var recs = store ? store.pastRecordsByPaper(p.paperId) : [];
        var byQid = {};
        recs.forEach(function (r) { byQid[r.qid] = r; });
        var answered = 0, gained = 0, total = 0, correct = 0;
        (p.questions || []).forEach(function (q) {
          total += Number(q.score) || 0;
          var r = byQid[q.qid];
          if (!r) return;
          answered++;
          if (r.correct) { gained += Number(q.score) || 0; correct++; }
        });
        p._answered = answered;
        p._total = p.questions.length;
        p._gained = gained;
        p._totalScore = total;
        p._correct = correct;
        p._scored = answered > 0;
      });
      return out;
    },

    yearOptions: function () {
      var set = {};
      this.papers().forEach(function (p) { set[p.year] = true; });
      return Object.keys(set).sort(function (a, b) { return b - a; });
    },

    subjectOptions: function () {
      var set = {};
      this.papers().forEach(function (p) { set[p.subject] = true; });
      return Object.keys(set);
    },

    /* ---------- 视图渲染 ---------- */

    render: function () {
      var view = this.view;
      if (!view) return;
      if (this.activePaperId) {
        this.renderPaper();
      } else {
        this.renderList();
      }
    },

    renderList: function () {
      var view = this.view;
      if (!view) return;
      var self = this;

      var years = this.yearOptions();
      var subjects = this.subjectOptions();

      view.innerHTML = '' +
        '<div class="card past-card">' +
          '<div class="past-card__head">' +
            '<div>' +
              '<h2 class="card__title">真题样卷</h2>' +
              '<p class="card__desc">内置 ' + this.papers().length + ' 套样卷 · 逐题作答 + 详细解析 + 错因标签</p>' +
            '</div>' +
          '</div>' +

          /* 筛选 */
          '<div class="past-filters" data-past-filters>' +
            '<div class="past-filters__group"><span class="past-filters__label">年份</span>' +
              '<button class="chip' + (!this.filter.year ? ' is-active' : '') + '" data-past-year="*">全部</button>' +
              years.map(function (y) {
                return '<button class="chip' + (String(self.filter.year) === String(y) ? ' is-active' : '') + '" data-past-year="' + y + '">' + y + '</button>';
              }).join('') +
            '</div>' +
            '<div class="past-filters__group"><span class="past-filters__label">科目</span>' +
              '<button class="chip' + (!this.filter.subject ? ' is-active' : '') + '" data-past-subject="*">全部</button>' +
              subjects.map(function (s) {
                return '<button class="chip' + (self.filter.subject === s ? ' is-active' : '') + '" data-past-subject="' + esc(s) + '">' + esc(s) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +

          /* 试卷列表 */
          '<div class="past-list" data-past-list></div>' +
        '</div>';

      // 筛选绑定
      $all('[data-past-year]', view).forEach(function (c) {
        c.addEventListener('click', function () {
          var v = this.getAttribute('data-past-year');
          self.filter.year = (v === '*') ? '' : v;
          self.renderList();
        });
      });
      $all('[data-past-subject]', view).forEach(function (c) {
        c.addEventListener('click', function () {
          var v = this.getAttribute('data-past-subject');
          self.filter.subject = (v === '*') ? '' : v;
          self.renderList();
        });
      });

      this.renderPaperList();
    },

    renderPaperList: function () {
      var view = this.view;
      var box = view && view.querySelector('[data-past-list]');
      if (!box) return;
      var self = this;
      var list = this.filteredPapers();

      if (!list.length) {
        box.innerHTML = '<div class="card__desc" style="text-align:center;padding:var(--sp-6)">当前筛选条件下暂无试卷</div>';
        return;
      }

      box.innerHTML = list.map(function (p) {
        var status = p._scored
          ? ('已作答 · 得分 <b>' + p._gained + '/' + p._totalScore + '</b>（' + Math.round(p._totalScore ? (p._gained / p._totalScore) * 100 : 0) + '%）')
          : '未作答';
        var cls = p._scored ? 'past-paper__status is-done' : 'past-paper__status';
        return '' +
          '<div class="past-paper" data-paper-open="' + p.paperId + '">' +
            '<div class="past-paper__main">' +
              '<div class="past-paper__title">' + esc(p.title) + '</div>' +
              '<div class="past-paper__meta">' +
                '<span class="past-paper__chip">' + p.year + '</span>' +
                '<span class="past-paper__chip">' + esc(p.subject) + '</span>' +
                '<span class="past-paper__chip">📝 ' + p.questions.length + ' 题</span>' +
                '<span class="past-paper__chip">⏱ ' + p.duration + ' 分钟</span>' +
              '</div>' +
            '</div>' +
            '<div class="past-paper__side">' +
              '<div class="' + cls + '">' + status + '</div>' +
              '<button class="btn btn--sm' + (p._scored ? ' btn--warn' : ' btn--primary') + '" data-paper-open-btn="' + p.paperId + '">' +
                (p._scored ? '重做' : '开始作答') + '</button>' +
            '</div>' +
          '</div>';
      }).join('');

      $all('[data-paper-open-btn]', box).forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          self.openPaper(this.getAttribute('data-paper-open-btn'));
        });
      });
      $all('[data-paper-open]', box).forEach(function (row) {
        row.addEventListener('click', function () {
          self.openPaper(this.getAttribute('data-paper-open'));
        });
      });
    },

    openPaper: function (paperId) {
      this.activePaperId = paperId;
      this.draft = {};
      this.renderPaper();
    },

    /* ---------- 试卷详情：逐题作答 ---------- */

    renderPaper: function () {
      var view = this.view;
      if (!view) return;
      var self = this;
      var paper = this.paperById(this.activePaperId);
      if (!paper) { this.activePaperId = null; this.renderList(); return; }
      var store = global.KP_STORE;

      var totalScore = 0;
      paper.questions.forEach(function (q) { totalScore += Number(q.score) || 0; });

      // 载入已有记录作为草稿初值
      var recs = store ? store.pastRecordsByPaper(paper.paperId) : [];
      var byQid = {};
      recs.forEach(function (r) { byQid[r.qid] = r; });
      this.draft = {};
      paper.questions.forEach(function (q) {
        this.draft[q.qid] = {
          answer: byQid[q.qid] ? byQid[q.qid].answer : null,
          submitted: !!byQid[q.qid],
          reason: byQid[q.qid] ? (byQid[q.qid].reason || '') : '',
          correct: byQid[q.qid] ? byQid[q.qid].correct : null
        };
      }, this);

      view.innerHTML = '' +
        '<div class="card past-card past-detail">' +
          '<div class="past-card__head">' +
            '<div>' +
              '<button class="btn btn--sm" data-past-back>← 返回列表</button>' +
              '<h2 class="card__title" style="margin-top:var(--sp-2)">' + esc(paper.title) + '</h2>' +
              '<p class="card__desc">' + paper.year + ' 年 · ' + esc(paper.subject) + ' · 满分 ' + totalScore + ' 分 · ' + paper.questions.length + ' 题</p>' +
            '</div>' +
            '<div class="past-detail__score" data-past-score></div>' +
          '</div>' +

          '<div class="past-questions" data-past-questions></div>' +

          '<div class="past-paper__actions">' +
            '<button class="btn btn--primary" data-past-submit>提交整卷</button>' +
          '</div>' +
        '</div>';

      $('[data-past-back]', view).addEventListener('click', function () {
        self.activePaperId = null;
        self.renderList();
      });

      $('[data-past-submit]', view).addEventListener('click', function () {
        self.submitAll(paper);
      });

      this.renderQuestions(paper);
      this.renderScore(paper);
    },

    /* 逐题渲染 */
    renderQuestions: function (paper) {
      var view = this.view;
      var box = view && view.querySelector('[data-past-questions]');
      if (!box) return;
      var self = this;
      var model = global.KP_MODEL;

      box.innerHTML = paper.questions.map(function (q, idx) {
        var d = self.draft[q.qid];
        var isMulti = Array.isArray(q.answer);
        var isBlank = q.type === 'blank' || (q.options && q.options.length === 0 && !isMulti);

        var qHtml = '' +
          '<div class="past-q ' + (d.submitted ? 'is-submitted' : '') + '" data-past-q="' + q.qid + '">' +
            '<div class="past-q__head">' +
              '<span class="past-q__idx">' + (idx + 1) + '</span>' +
              '<span class="past-q__score">' + q.score + ' 分</span>' +
              (d.submitted
                ? (d.correct
                    ? '<span class="past-q__tag is-ok">✓ 答对</span>'
                    : '<span class="past-q__tag is-bad">✗ 答错</span>')
                : '<span class="past-q__tag">未提交</span>') +
            '</div>' +
            '<p class="past-q__stem">' + esc(q.stem) + '</p>';

        // 选项渲染
        if (q.options && q.options.length) {
          if (isMulti) {
            qHtml += '<div class="past-q__opts past-q__opts--multi">' +
              q.options.map(function (opt) {
                var letter = opt.slice(0, 1);
                var checked = Array.isArray(d.answer) && d.answer.indexOf(letter) !== -1;
                return '<label class="opt opt--multi' + (checked ? ' is-on' : '') + '">' +
                  '<input type="checkbox" data-qopt="' + q.qid + '" value="' + letter + '"' + (checked ? ' checked' : '') + '/>' +
                  '<span>' + esc(opt) + '</span>' +
                '</label>';
              }).join('') +
            '</div>';
          } else {
            qHtml += '<div class="past-q__opts">' +
              q.options.map(function (opt) {
                var letter = opt.slice(0, 1);
                var on = d.answer === letter;
                return '<label class="opt' + (on ? ' is-on' : '') + '">' +
                  '<input type="radio" name="past-' + q.qid + '" data-qopt="' + q.qid + '" value="' + letter + '"' + (on ? ' checked' : '') + '/>' +
                  '<span>' + esc(opt) + '</span>' +
                '</label>';
              }).join('') +
            '</div>';
          }
        } else {
          // 填空
          qHtml += '<div class="past-q__blank">' +
            '<input type="text" data-qblank="' + q.qid + '" value="' + esc(d.answer || '') + '" placeholder="填写答案" />' +
          '</div>';
        }

        // 单题提交
        qHtml += '<div class="past-q__foot">' +
          (d.submitted
            ? '<button class="btn btn--sm btn--warn" data-past-retry="' + q.qid + '">重答</button>'
            : '<button class="btn btn--sm btn--primary" data-past-check="' + q.qid + '">提交本题</button>') +
        '</div>';

        // 错因标签（答错后显示）
        if (d.submitted && d.correct === false) {
          qHtml += '<div class="past-q__reason" data-past-reason-box="' + q.qid + '">' +
            '<span class="past-q__reason-label">错因：</span>' +
            self.REASONS.map(function (rs) {
              var on = d.reason === rs;
              return '<button class="chip' + (on ? ' is-active' : '') + '" data-reason="' + rs + '" data-reason-qid="' + q.qid + '">' + esc(rs) + '</button>';
            }).join('') +
          '</div>';
        }

        // 详细解析（提交后显示）
        if (d.submitted) {
          qHtml += '<div class="past-q__analysis">' +
            '<div class="past-q__analysis-title">' + (d.correct ? '解析（答对）' : '解析（答错）') + '</div>' +
            '<div class="past-q__analysis-body">' + esc(q.detailed_analysis || '暂无解析') + '</div>' +
            (q.answer !== null && q.answer !== undefined ? '<div class="past-q__analysis-answer">参考答案：' +
              (Array.isArray(q.answer) ? q.answer.join(' / ') : esc(String(q.answer))) + '</div>' : '') +
          '</div>';
        }

        qHtml += '</div>';
        return qHtml;
      }).join('');

      // 选项事件
      $all('[data-qopt]', box).forEach(function (inp) {
        inp.addEventListener('change', function () {
          var qid = this.getAttribute('data-qopt');
          var q = paper.questions.filter(function (x) { return x.qid === qid; })[0];
          var isMulti = Array.isArray(q.answer);
          if (isMulti) {
            var all = $all('[data-qopt="' + qid + '"]', box);
            var arr = [];
            all.forEach(function (cb) { if (cb.checked) arr.push(cb.value); });
            self.draft[qid].answer = arr;
          } else {
            self.draft[qid].answer = this.value;
            // 单选高亮
            $all('[data-qopt="' + qid + '"]', box).forEach(function (cb) {
              cb.closest('.opt').classList.toggle('is-on', cb.checked);
            });
          }
        });
      });
      // 填空事件
      $all('[data-qblank]', box).forEach(function (inp) {
        inp.addEventListener('input', function () {
          self.draft[this.getAttribute('data-qblank')].answer = this.value;
        });
      });
      // 单题提交
      $all('[data-past-check]', box).forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.checkQuestion(paper, this.getAttribute('data-past-check'));
        });
      });
      // 重答
      $all('[data-past-retry]', box).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qid = this.getAttribute('data-past-retry');
          self.draft[qid].submitted = false;
          self.draft[qid].correct = null;
          self.draft[qid].reason = '';
          self.renderQuestions(paper);
        });
      });
      // 错因标签
      $all('[data-reason]', box).forEach(function (btn) {
        btn.addEventListener('click', function () {
          var qid = this.getAttribute('data-reason-qid');
          var reason = this.getAttribute('data-reason');
          self.draft[qid].reason = reason;
          // 写回 store
          var rec = global.KP_STORE.pastRecordsByPaper(paper.paperId)
            .filter(function (r) { return r.qid === qid; })[0];
          if (rec) {
            rec.reason = reason;
            var arr = global.KP_STORE.get('past.records');
            for (var i = 0; i < arr.length; i++) {
              if (arr[i].qid === qid && arr[i].paperId === paper.paperId) {
                arr[i].reason = reason;
                break;
              }
            }
            global.KP_STORE.set('past.records', arr);
          }
          // 更新高亮
          $all('[data-reason-qid="' + qid + '"]', box).forEach(function (b) {
            b.classList.toggle('is-active', b === this);
          }, this);
          self.renderScore(paper);
        });
      });
    },

    /* 判定并保存单题 */
    checkQuestion: function (paper, qid) {
      var model = global.KP_MODEL;
      var store = global.KP_STORE;
      var q = paper.questions.filter(function (x) { return x.qid === qid; })[0];
      if (!q) return;
      var d = this.draft[qid];
      var result = model.judgeAnswer(q, d.answer);
      var correct = result.correct;

      d.submitted = true;
      d.correct = correct;
      if (!d.reason) d.reason = '';

      // 写 store
      store.addPastRecord({
        paperId: paper.paperId,
        qid: qid,
        answer: d.answer,
        correct: correct,
        score: Number(q.score) || 0,
        reason: (correct || !d.reason) ? '' : d.reason,
        seconds: 0
      });

      this.renderQuestions(paper);
      this.renderScore(paper);
    },

    /* 提交整卷：对未提交题做自动判定 */
    submitAll: function (paper) {
      var self = this;
      var unsubmitted = paper.questions.filter(function (q) {
        return !self.draft[q.qid].submitted;
      });
      if (unsubmitted.length) {
        unsubmitted.forEach(function (q) { self.checkQuestion(paper, q.qid); });
      }
      this.renderScore(paper);
    },

    /* 总分条 */
    renderScore: function (paper) {
      var view = this.view;
      var box = view && view.querySelector('[data-past-score]');
      if (!box) return;
      var store = global.KP_STORE;
      var s = store.pastScore(paper);

      var done = s.answered;
      var total = paper.questions.length;
      box.innerHTML = '' +
        '<div class="past-detail__score-num">' + s.gained + ' <span class="past-detail__score-max">/ ' + s.total + '</span></div>' +
        '<div class="past-detail__score-sub">已作 ' + done + '/' + total + ' · 正确 ' + s.correctCount + ' · 错 ' + s.wrongCount + '</div>' +
        (Object.keys(s.reasons).length
          ? '<div class="past-detail__reasons">' +
              Object.keys(s.reasons).map(function (k) {
                return '<span class="chip">' + esc(k) + ' ×' + s.reasons[k] + '</span>';
              }).join('') +
            '</div>'
          : '');
    }
  };

  /* ---------- 单词记忆模块 ---------- */
  var VOCAB = {
    view: null,
    flipped: false,   // 当前卡是否已翻面
    current: null,    // 当前单词 {word, phonetic, meaning, example}
    sessionIndex: 0,  // 本次会话已完成的卡片数（「换一批」重置）
    seen: {},         // 本次会话已评过的单词 {word: rating}

    words: function () {
      return global.KP_CONTENT ? global.KP_CONTENT.kp_sampleWords : [];
    },

    wordMap: function () {
      var map = {};
      this.words().forEach(function (w) { map[w.word] = w; });
      return map;
    },

    /* 统计：今日新学 / 已掌握 / 待复习 */
    stats: function () {
      var store = global.KP_STORE;
      var learned = store ? store.vocabLearnedToday() : 0;
      var mastered = store ? store.vocabMasteredCount() : 0;
      var pending = store ? store.vocabPendingCount() : 0;
      var due = store ? store.vocabDueToday().length : 0;
      return { learned: learned, mastered: mastered, pending: pending, due: due };
    },

    /* 下一张：优先今日到期复习（跳过本次会话已评过的），其次未学过的新词 */
    nextCard: function () {
      var store = global.KP_STORE;
      var words = this.words();
      if (!words.length) return null;
      var seen = this.seen;

      // 1. 今日到期复习（优先），跳过本次会话已评过的
      var due = store ? store.vocabDueToday() : [];
      var wm = this.wordMap();
      for (var i = 0; i < due.length; i++) {
        if (wm[due[i]] && !seen[due[i]]) return wm[due[i]];
      }

      // 2. 未学过、且不在复习/已掌握队列的新词（同样跳过会话内已评的）
      var learnedSet = {};
      if (store) {
        store.vocabLearnedWords().forEach(function (w) { learnedSet[w] = true; });
        var s = store.get('settings');
        if (s && Array.isArray(s.vocabMasteredSet)) {
          s.vocabMasteredSet.forEach(function (w) { learnedSet[w] = true; });
        }
        var rv = store.get('vocab.review');
        for (var k in rv) {
          if (Object.prototype.hasOwnProperty.call(rv, k)) learnedSet[k] = true;
        }
      }
      for (var j = 0; j < words.length; j++) {
        if (!learnedSet[words[j].word] && !seen[words[j].word]) return words[j];
      }
      // 全部已学过/在队列中 → 无新词可学，返回 null 展示「已完成」
      return null;
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var self = this;

      var words = this.words();
      if (!words.length) {
        view.innerHTML = '<div class="card"><h2 class="card__title">单词</h2><p class="card__desc">暂无单词数据</p></div>';
        return;
      }

      var st = this.stats();

      view.innerHTML = '' +
        '<div class="card vocab-card">' +
          '<div class="vocab-card__head">' +
            '<div>' +
              '<h2 class="card__title">单词记忆</h2>' +
              '<p class="card__desc">共 ' + words.length + ' 词 · 今日新学 ' + st.learned + ' · 已掌握 ' + st.mastered + ' · 待复习 ' + st.pending + '</p>' +
            '</div>' +
            '<button class="btn btn--sm" data-vocab-shuffle>换一批</button>' +
          '</div>' +

          /* 记忆卡片 */
          '<div class="vocab-card__zone" data-vocab-zone></div>' +

          /* 卡片下方：翻面提示 + 评级按钮 */
          '<div class="vocab-actions">' +
            '<button class="btn btn--sm" data-vocab-flip>翻面看释义</button>' +
            '<div class="vocab-rate" data-vocab-rate style="display:none">' +
              '<button class="btn btn--sm btn--ok" data-vocab-known>✓ 认识</button>' +
              '<button class="btn btn--sm btn--warn" data-vocab-fuzzy>◐ 模糊</button>' +
              '<button class="btn btn--sm btn--bad" data-vocab-forgot>✗ 不认识</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      // 绑定事件
      $('[data-vocab-shuffle]', view).addEventListener('click', function () {
        self.sessionIndex = 0;
        self.seen = {};
        self.flipped = false;
        self.render();
      });
      var flip = function () {
        self.flipped = !self.flipped;
        self.renderCard();
      };
      $('[data-vocab-flip]', view).addEventListener('click', flip);
      // 点卡片本身也可翻面
      var zone = $('[data-vocab-zone]', view);
      if (zone) zone.addEventListener('click', function (e) {
        if (e.target.closest('.vocab-rate')) return; // 评级区不触发
        flip();
      });
      $('[data-vocab-known]', view).addEventListener('click', function () {
        self.rateCurrent('known');
      });
      $('[data-vocab-fuzzy]', view).addEventListener('click', function () {
        self.rateCurrent('fuzzy');
      });
      $('[data-vocab-forgot]', view).addEventListener('click', function () {
        self.rateCurrent('forgot');
      });

      this.renderCard();
    },

    /* 渲染当前卡片（翻面切换显示/隐藏释义） */
    renderCard: function () {
      var view = this.view;
      if (!view) return;
      var zone = view.querySelector('[data-vocab-zone]');
      if (!zone) return;

      this.current = this.nextCard();
      if (!this.current) {
        zone.innerHTML = '<div class="vocab-card__done">所有单词都处理完毕，点击「换一批」重新开始。</div>';
        return;
      }

      var w = this.current;
      var review = global.KP_STORE ? global.KP_STORE.get('vocab.review') : {};
      var stage = review[w.word] ? (review[w.word].stage || 0) : 0;

      // 未翻面：只显示单词 + 音标；翻面：显示释义 + 例句 + 评级按钮
      zone.innerHTML = '' +
        '<div class="vocab-card__face ' + (this.flipped ? 'is-flipped' : '') + '">' +
          '<div class="vocab-card__word">' + esc(w.word) + '</div>' +
          '<div class="vocab-card__phonetic">' + esc(w.phonetic) + '</div>' +
          (stage > 0 ? '<div class="vocab-card__stage">复习队列 · 第 ' + stage + ' 轮</div>' : '') +
          '<div class="vocab-card__detail ' + (this.flipped ? '' : 'is-hidden') + '">' +
            '<div class="vocab-card__meaning">' + esc(w.meaning) + '</div>' +
            (w.example ? '<div class="vocab-card__example">例句：' + esc(w.example) + '</div>' : '') +
          '</div>' +
        '</div>';

      // 评级按钮区：翻面后才显示
      var rateBox = view.querySelector('[data-vocab-rate]');
      var flipBtn = view.querySelector('[data-vocab-flip]');
      if (rateBox) rateBox.style.display = this.flipped ? '' : 'none';
      if (flipBtn) flipBtn.textContent = this.flipped ? '合上卡片' : '翻面看释义';
    },

    /* 评级当前单词 */
    rateCurrent: function (rating) {
      var store = global.KP_STORE;
      if (!store || !this.current) return;
      var word = this.current.word;
      var today = new Date().toISOString().slice(0, 10);

      // 记录「新学」（去重，幂等）
      store.addVocabLearned(word, today);

      if (rating === 'fuzzy' || rating === 'forgot') {
        // 模糊 / 不认识 → 进复习队列（间隔 [1,2,4,7]）
        store.vocabRateWeak(word, today);
      } else {
        // 认识 → 已掌握，记入统计（不排队）
        store.vocabMarkMastered(word);
      }

      // 会话内标记，防止「换一批」前重复刷到同一张卡
      this.seen[word] = rating;
      this.sessionIndex++;

      // 翻回正面，推进到下一张
      this.flipped = false;
      this.renderCard();
    },

  };

  /* ---------- 学习计划模块 ---------- */
  var PLAN = {
    view: null,
    y: 0,        // 当前日历年
    m: 0,        // 当前日历月 0-11
    selDate: '', // 选中的 'YYYY-MM-DD'
    showAdd: false,

    SUBJECTS: ['政治', '英语', '数学', '专业课', '其他'],

    _todayStr: function () {
      return new Date().toISOString().slice(0, 10);
    },

    /* 计算当前选中日完成率（0-1）+ 当月完成率 */
    rate: function () {
      var store = global.KP_STORE;
      var model = global.KP_MODEL;
      var plan = store ? store.get('plan') : [];
      var day = model.planDaySummary(plan, this.selDate);
      var dayRate = day.accuracy;

      // 当月全部任务完成率
      var mm = this.m + 1;
      var prefix = this.y + '-' + (mm < 10 ? '0' + mm : mm);
      var mItems = plan.filter(function (t) { return t.date && t.date.indexOf(prefix) === 0; });
      var mDone = mItems.filter(function (t) { return t.done; }).length;
      var monthRate = mItems.length ? mDone / mItems.length : 0;

      return {
        dayItems: day.items,
        dayTotal: day.total,
        dayDone: day.done,
        dayRate: dayRate,
        monthRate: monthRate,
        monthTotal: mItems.length,
        monthDone: mDone,
        streak: store ? store.getStreak().count : 0
      };
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var self = this;
      var store = global.KP_STORE;
      var model = global.KP_MODEL;

      // 初始化 y/m/selDate
      if (!this.y || !this.m) {
        var now = new Date();
        this.y = now.getFullYear();
        this.m = now.getMonth();
        this.selDate = this._todayStr();
      }

      var cal = model.calendarWeeks(this.y, this.m);
      var completed = store ? store.completedDates() : {};
      var today = this._todayStr();

      // 日历格
      var dowLabels = ['一', '二', '三', '四', '五', '六', '日'];
      var calHtml = '<div class="plan-cal__dow">' +
        dowLabels.map(function (d) { return '<span>' + d + '</span>'; }).join('') +
      '</div>';
      cal.weeks.forEach(function (week) {
        calHtml += '<div class="plan-cal__week">' +
          week.map(function (ds) {
            if (!ds) return '<span class="plan-cal__cell plan-cal__cell--empty"></span>';
            var isToday = ds === today;
            var isSel = ds === self.selDate;
            var isDone = completed[ds];
            var dd = Number(ds.slice(8));
            var cls = 'plan-cal__cell' + (isSel ? ' is-selected' : '') + (isToday ? ' is-today' : '') + (isDone ? ' is-done' : '');
            return '<button class="' + cls + '" data-cal-date="' + ds + '">' +
              '<span class="plan-cal__num">' + dd + '</span>' +
              (isDone ? '<span class="plan-cal__tick">✓</span>' : '') +
            '</button>';
          }).join('') +
        '</div>';
      });

      var r = this.rate();

      view.innerHTML = '' +
        '<div class="card plan-card">' +
          '<div class="plan-card__head">' +
            '<div>' +
              '<h2 class="card__title">学习计划</h2>' +
              '<p class="card__desc">连续打卡 <b>' + r.streak + '</b> 天 · 当月完成率 ' + Math.round(r.monthRate * 100) + '%</p>' +
            '</div>' +
            '<button class="btn btn--sm" data-toggle-add>' + (this.showAdd ? '收起' : '+ 添加任务') + '</button>' +
          '</div>' +

          /* 完成率进度条 */
          '<div class="plan-progress">' +
            '<div class="plan-progress__row">' +
              '<span class="plan-progress__label">当日 ' + r.dayDone + '/' + r.dayTotal + '</span>' +
              '<span class="plan-progress__pct">' + Math.round(r.dayRate * 100) + '%</span>' +
            '</div>' +
            '<div class="plan-progress__bar"><div class="plan-progress__fill" style="width:' + Math.round(r.dayRate * 100) + '%"></div></div>' +
          '</div>' +

          /* 快速添加表单 */
          (this.showAdd ? this.addFormHtml() : '') +

          /* 日历 + 当天任务 */
          '<div class="plan-body">' +
            '<div class="plan-cal">' +
              '<div class="plan-cal__head">' +
                '<button class="plan-cal__nav" data-cal-prev>‹</button>' +
                '<span class="plan-cal__title">' + this.y + ' 年 ' + (this.m + 1) + ' 月</span>' +
                '<button class="plan-cal__nav" data-cal-next>›</button>' +
                '<button class="plan-cal__today" data-cal-today>今天</button>' +
              '</div>' +
              calHtml +
            '</div>' +
            '<div class="plan-day" data-plan-day></div>' +
          '</div>' +
        '</div>';

      // 日历导航
      $('[data-cal-prev]', view).addEventListener('click', function () { self.m--; if (self.m < 0) { self.m = 11; self.y--; } self.render(); });
      $('[data-cal-next]', view).addEventListener('click', function () { self.m++; if (self.m > 11) { self.m = 0; self.y++; } self.render(); });
      $('[data-cal-today]', view).addEventListener('click', function () {
        var now = new Date(); self.y = now.getFullYear(); self.m = now.getMonth(); self.selDate = self._todayStr(); self.render();
      });

      // 点选日期
      $all('[data-cal-date]', view).forEach(function (b) {
        b.addEventListener('click', function () { self.selDate = this.getAttribute('data-cal-date'); self.render(); });
      });

      // 添加表单
      var toggle = $('[data-toggle-add]', view);
      if (toggle) toggle.addEventListener('click', function () { self.showAdd = !self.showAdd; self.render(); });
      if (this.showAdd) this.bindAddForm(view);

      // 当日任务列表
      this.renderDay(view, r.dayItems);
    },

    addFormHtml: function () {
      var self = this;
      var subjOpts = this.SUBJECTS.map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === '政治' ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('');
      return '<form class="plan-add" data-plan-add>' +
        '<div class="plan-add__row">' +
          '<label class="plan-add__field"><span>日期</span><input type="date" name="date" value="' + esc(this.selDate) + '" required /></label>' +
          '<label class="plan-add__field"><span>科目</span><select name="subject">' + subjOpts + '</select></label>' +
          '<label class="plan-add__field plan-add__field--content"><span>内容</span><input type="text" name="content" placeholder="如：刷高数 10 题" required /></label>' +
          '<label class="plan-add__field"><span>时长(分)</span><input type="number" name="duration" min="0" step="5" value="30" /></label>' +
          '<button type="submit" class="btn btn--primary btn--sm">添加</button>' +
        '</div>' +
      '</form>';
    },

    bindAddForm: function (view) {
      var form = $('[data-plan-add]', view);
      if (!form) return;
      var self = this;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = form;
        var dateVal = (f.elements.date.value || '').slice(0, 10);
        var content = (f.elements.content.value || '').trim();
        if (!dateVal || !content) return;
        global.KP_STORE.addPlanItem({
          date: dateVal,
          subject: f.elements.subject.value || '其他',
          content: content,
          duration: Number(f.elements.duration.value) || 0
        });
        self.selDate = dateVal;
        self.showAdd = false;
        self.render();
      });
    },

    renderDay: function (view, items) {
      var box = view && $('[data-plan-day]', view);
      if (!box) return;
      var self = this;

      if (!items.length) {
        box.innerHTML = '<h3 class="plan-day__title">' + esc(this.selDate) + ' · 无任务</h3>' +
          '<p class="plan-day__empty">该日暂无计划，点击上方「+ 添加任务」创建。</p>';
        return;
      }

      box.innerHTML = '<h3 class="plan-day__title">' + esc(this.selDate) + ' · ' + items.length + ' 项</h3>' +
        '<ul class="plan-day__list">' +
          items.map(function (t) {
            return '<li class="plan-task ' + (t.done ? 'is-done' : '') + '" data-plan-id="' + t.id + '">' +
              '<label class="plan-task__check"><input type="checkbox" data-plan-toggle="' + t.id + '"' + (t.done ? ' checked' : '') + '/>' +
                '<span class="plan-task__box"></span></label>' +
              '<span class="plan-task__subject">' + esc(t.subject || '其他') + '</span>' +
              '<span class="plan-task__content">' + esc(t.content) + '</span>' +
              '<span class="plan-task__dur">' + (t.duration || 0) + 'min</span>' +
              '<button class="plan-task__del" data-plan-del="' + t.id + '" title="删除">✕</button>' +
            '</li>';
          }).join('') +
        '</ul>' +
        '<div class="plan-day__actions">' +
          '<button class="btn btn--sm ' + (self.isSelDayDone() ? 'btn--ok' : 'btn--primary') + '" data-plan-checkin>✓ 打卡今日</button>' +
        '</div>';

      // 勾选
      $all('[data-plan-toggle]', box).forEach(function (cb) {
        cb.addEventListener('change', function () {
          global.KP_STORE.togglePlanDone(this.getAttribute('data-plan-toggle'));
          self.render();
        });
      });
      // 删除
      $all('[data-plan-del]', box).forEach(function (b) {
        b.addEventListener('click', function () {
          global.KP_STORE.removePlanItem(this.getAttribute('data-plan-del'));
          self.render();
        });
      });
      // 打卡
      var ci = $('[data-plan-checkin]', box);
      if (ci) ci.addEventListener('click', function () {
        var s = global.KP_STORE.planCheckIn(self._todayStr());
        self.render();
      });
    },

    isSelDayDone: function () {
      var store = global.KP_STORE;
      return store ? store.isPlanDayDone(this.selDate) : false;
    }
  };

  /* ---------- 模考分析模块 ---------- */
  var MOCK = {
    view: null,
    subject: '',   // 当前查看科目（'' = 全部）

    /* 6 维薄弱点（雷达维度） */
    WEAK_DIMS: ['政治', '英语', '数学', '专业课', '时间管理', '心态'],

    SUBJECTS: ['政治', '英语', '数学', '专业课'],

    records: function () {
      var store = global.KP_STORE;
      return store ? store.get('mock.records') : [];
    },

    /* 记录列表（可按科目过滤 + 按日期降序） */
    filtered: function () {
      var subj = this.subject;
      var recs = this.records().slice();
      if (subj) {
        recs = recs.filter(function (r) { return r.subject === subj; });
      }
      recs.sort(function (a, b) {
        if (a.date === b.date) return (b.ts || 0) - (a.ts || 0);
        return a.date < b.date ? 1 : -1;
      });
      return recs;
    },

    /* 趋势数据：按日期升序，{label, score, accuracy(0-1)} */
    trendData: function () {
      var store = global.KP_STORE;
      var subj = this.subject;
      var recs = store ? store.mockRecordsSorted() : [];
      if (subj) {
        recs = recs.filter(function (r) { return r.subject === subj; });
      }
      return recs.map(function (r) {
        return { label: r.date.slice(5), score: r.score, accuracy: r.accuracy };
      });
    },

    /* 雷达数据：科目维度（取 6 维） */
    radarData: function () {
      var model = global.KP_MODEL;
      var subj = this.subject;
      var recs = this.records();
      if (subj) {
        recs = recs.filter(function (r) { return r.subject === subj; });
      }
      return model.mockRadarData(recs, this.WEAK_DIMS);
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var self = this;
      var recs = this.records();

      var subjChips = [''].concat(this.SUBJECTS).map(function (s) {
        var label = s || '全部';
        var on = s === self.subject;
        return '<button class="chip' + (on ? ' is-active' : '') + '" data-mock-subject="' + esc(s) + '">' + label + '</button>';
      }).join('');

      view.innerHTML = '' +
        '<div class="card mock-card">' +
          '<div class="mock-card__head">' +
            '<div>' +
              '<h2 class="card__title">模考分析</h2>' +
              '<p class="card__desc">记录 ' + recs.length + ' 次模考 · 趋势 + 薄弱点雷达</p>' +
            '</div>' +
            '<button class="btn btn--sm btn--primary" data-mock-open-add>+ 记录模考</button>' +
          '</div>' +

          /* 科目筛选 */
          '<div class="mock-subjects">' + subjChips + '</div>' +

          /* 图表区：趋势 + 雷达 */
          '<div class="mock-charts">' +
            '<div class="mock-chart">' +
              '<div class="mock-chart__title">分数 / 正确率趋势</div>' +
              '<div class="mock-chart__body" data-mock-trend></div>' +
            '</div>' +
            '<div class="mock-chart">' +
              '<div class="mock-chart__title">薄弱点分布（6 维）</div>' +
              '<div class="mock-chart__body" data-mock-radar></div>' +
            '</div>' +
          '</div>' +

          /* 记录列表 */
          '<div class="mock-list" data-mock-list></div>' +
        '</div>';

      // 科目筛选
      $all('[data-mock-subject]', view).forEach(function (c) {
        c.addEventListener('click', function () {
          self.subject = this.getAttribute('data-mock-subject');
          self.render();
        });
      });

      // 添加表单
      $('[data-mock-open-add]', view).addEventListener('click', function () { self.showAddForm(); });

      // 画图表
      var trendEl = view.querySelector('[data-mock-trend]');
      var radarEl = view.querySelector('[data-mock-radar]');
      if (trendEl) global.KP_CHARTS.trend(trendEl, this.trendData(), { width: 340, height: 200 });
      if (radarEl) global.KP_CHARTS.radar(radarEl, this.radarData(), { size: 260 });

      this.renderList();
    },

    /* 添加模考记录表单（弹窗） */
    showAddForm: function () {
      var self = this;
      var subjOpts = this.SUBJECTS.map(function (s) {
        return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
      }).join('');
      var dimOpts = this.WEAK_DIMS.map(function (d) {
        return '<label class="mock-dim"><input type="checkbox" name="weak" value="' + esc(d) + '"/><span>' + esc(d) + '</span></label>';
      }).join('');

      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '' +
        '<div class="modal mock-form">' +
          '<div class="modal__head"><h3>记录模考</h3><button class="btn btn--sm" data-mock-close>✕</button></div>' +
          '<form data-mock-form>' +
            '<div class="mock-form__row">' +
              '<label class="field"><span>科目</span><select name="subject" required>' + subjOpts + '</select></label>' +
              '<label class="field"><span>日期</span><input type="date" name="date" value="' + new Date().toISOString().slice(0, 10) + '" required /></label>' +
            '</div>' +
            '<div class="mock-form__row">' +
              '<label class="field"><span>得分</span><input type="number" name="score" min="0" step="0.5" required /></label>' +
              '<label class="field"><span>满分</span><input type="number" name="maxScore" min="1" step="0.5" value="100" required /></label>' +
              '<label class="field"><span>正确率(0-100)</span><input type="number" name="accuracy" min="0" max="100" step="1" value="0" /></label>' +
            '</div>' +
            '<div class="mock-form__row"><span class="field__label">薄弱点（可多选）</span>' +
              '<div class="mock-form__dims">' + dimOpts + '</div>' +
            '</div>' +
            '<div class="modal__foot">' +
              '<button type="button" class="btn" data-mock-close>取消</button>' +
              '<button type="submit" class="btn btn--primary">保存</button>' +
            '</div>' +
          '</form>' +
        '</div>';

      document.body.appendChild(overlay);

      $all('[data-mock-close]', overlay).forEach(function (b) {
        b.addEventListener('click', function () { overlay.remove(); });
      });
      // 点遮罩空白处也关闭（≤768px 底部 sheet 场景下点击的是 overlay 本体；
      // 下滑关闭通过 sw.js 注入的 delegate 处理，这里兜底纯点击遮罩）
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });

      $('form[data-mock-form]', overlay).addEventListener('submit', function (e) {
        e.preventDefault();
        var f = this;
        var score = Number(f.elements.score.value) || 0;
        var maxScore = Number(f.elements.maxScore.value) || 100;
        var accuracy = Math.max(0, Math.min(1, Number(f.elements.accuracy.value) || 0));
        var weak = [];
        $all('input[name="weak"]:checked', overlay).forEach(function (cb) { weak.push(cb.value); });
        global.KP_STORE.addMockRecord({
          date: f.elements.date.value,
          subject: f.elements.subject.value,
          score: score,
          maxScore: maxScore,
          accuracy: accuracy,
          weakPoints: weak
        });
        overlay.remove();
        self.render();
      });
    },

    /* 记录列表 */
    renderList: function () {
      var view = this.view;
      var box = view && view.querySelector('[data-mock-list]');
      if (!box) return;
      var self = this;
      var recs = this.filtered();

      if (!recs.length) {
        box.innerHTML = '<p class="mock-list__empty">暂无模考记录，点击右上角「记录模考」添加。</p>';
        return;
      }

      box.innerHTML = '<h3 class="mock-list__title">记录（' + recs.length + '）</h3>' +
        '<ul class="mock-list__items">' +
          recs.map(function (r) {
            var pctVal = Math.round((r.accuracy || 0) * 100);
            var weakHtml = (r.weakPoints && r.weakPoints.length)
              ? r.weakPoints.map(function (w) { return '<span class="mock-list__weak">' + esc(w) + '</span>'; }).join('')
              : '<span class="mock-list__weak mock-list__weak--none">无</span>';
            return '<li class="mock-item" data-mock-id="' + r.id + '">' +
              '<div class="mock-item__meta">' +
                '<span class="mock-item__date">' + r.date + '</span>' +
                '<span class="mock-item__subject">' + esc(r.subject) + '</span>' +
              '</div>' +
              '<div class="mock-item__score">' + r.score + '/' + r.maxScore + ' · 正确率 ' + pctVal + '%</div>' +
              '<div class="mock-item__weak">' + weakHtml + '</div>' +
              '<button class="mock-item__del" data-mock-del="' + r.id + '" title="删除">✕</button>' +
            '</li>';
          }).join('') +
        '</ul>';

      $all('[data-mock-del]', box).forEach(function (btn) {
        btn.addEventListener('click', function () {
          global.KP_STORE.removeMockRecord(this.getAttribute('data-mock-del'));
          self.render();
        });
      });
    }
  };

  /* ---------- 笔记模块 ---------- */
  var NOTES = {
    view: null,
    editId: null,      // 正在编辑的笔记 id（null = 新建）
    draft: { subject: '政治', tag: '', content: '' },

    SUBJECTS: ['政治', '英语', '数学', '专业课', '其他'],

    records: function () {
      var store = global.KP_STORE;
      return store ? store.get('note.list') : [];
    },

    /* 极简 Markdown → HTML（支持 # 标题、**粗体**、*斜体*、- 列表、`代码`、换行） */
    renderMarkdown: function (src) {
      var text = String(src || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var lines = text.split('\n');
      var html = '';
      var inList = false;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var isItem = /^\s*[-*]\s+/.test(line);
        if (isItem && !inList) { html += '<ul>'; inList = true; }
        if (!isItem && inList) { html += '</ul>'; inList = false; }
        if (isItem) {
          var item = line.replace(/^\s*[-*]\s+/, '');
          html += '<li>' + this.mdInline(item) + '</li>';
        } else {
          var m = line.match(/^(#{1,3})\s+(.*)$/);
          if (m) {
            var level = m[1].length;
            html += '<h' + (level + 1) + ' class="note-md__h">' + this.mdInline(m[2]) + '</h' + (level + 1) + '>';
          } else if (line.trim() === '') {
            html += '<br/>';
          } else {
            html += '<p>' + this.mdInline(line) + '</p>';
          }
        }
      }
      if (inList) html += '</ul>';
      return html;
    },

    /* 行内 Markdown：**粗体**、*斜体*、`代码` */
    mdInline: function (s) {
      return s
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+?)`/g, '<code>$1</code>');
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var self = this;
      var store = global.KP_STORE;

      var bySubj = store ? store.notesBySubject() : {};
      var subjects = Object.keys(bySubj);

      var groupHtml = subjects.map(function (subj) {
        var notes = bySubj[subj];
        var items = notes.map(function (n) {
          var editing = n.id === self.editId;
          return '<div class="note-item" data-note-id="' + n.id + '">' +
            '<div class="note-item__head">' +
              (n.tag ? '<span class="note-item__tag">#' + esc(n.tag) + '</span>' : '') +
              '<span class="note-item__ts">' + (n.ts ? new Date(n.ts).toLocaleDateString() : '') + '</span>' +
            '</div>' +
            (editing
              ? self.editFormHtml(n)
              : '<div class="note-item__body" data-note-view="' + n.id + '">' + self.renderMarkdown(n.content) + '</div>') +
          '</div>';
        }).join('');
        return '<div class="note-group">' +
          '<h3 class="note-group__title">' + esc(subj) + '（' + notes.length + '）</h3>' +
          '<div class="note-group__list">' + items + '</div>' +
        '</div>';
      }).join('');

      view.innerHTML = '' +
        '<div class="card notes-card">' +
          '<div class="notes-card__head">' +
            '<div>' +
              '<h2 class="card__title">笔记</h2>' +
              '<p class="card__desc">Markdown 编辑 · 打标签 · 按科目分组 · 共 ' + this.records().length + ' 条</p>' +
            '</div>' +
            '<button class="btn btn--sm btn--primary" data-notes-new>+ 新建笔记</button>' +
          '</div>' +

          (this.editId === 'new' ? this.newFormHtml() : '') +

          (subjects.length
            ? '<div class="note-groups">' + groupHtml + '</div>'
            : '<p class="notes-card__empty">暂无笔记，点击「新建笔记」开始记录。</p>') +
        '</div>';

      // 新建
      $('[data-notes-new]', view).addEventListener('click', function () {
        self.editId = 'new';
        self.draft = { subject: self.SUBJECTS[0], tag: '', content: '' };
        self.render();
      });

      if (this.editId === 'new') this.bindNewForm(view);

      // 各条：编辑 / 预览 / 删除
      $all('[data-note-edit]', view).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = this.getAttribute('data-note-edit');
          var n = self.records().filter(function (x) { return x.id === id; })[0];
          if (n) {
            self.editId = id;
            self.draft = { subject: n.subject, tag: n.tag, content: n.content };
            self.render();
          }
        });
      });
      $all('[data-note-del]', view).forEach(function (b) {
        b.addEventListener('click', function () {
          store.removeNote(this.getAttribute('data-note-del'));
          self.render();
        });
      });
      // 预览折叠（点 body 切换原文/渲染）
      $all('[data-note-view]', view).forEach(function (b) {
        b.addEventListener('click', function () {
          this.classList.toggle('is-raw');
        });
      });

      // 绑定各内嵌编辑表单
      var store = global.KP_STORE;
      if (store) {
        this.records().forEach(function (n) {
          if (n.id === self.editId) self.bindEditForm(view, n.id);
        });
      }
    },

    /* 新建表单 HTML */
    newFormHtml: function () {
      var self = this;
      var subjOpts = this.SUBJECTS.map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === self.draft.subject ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('');
      var tags = global.KP_STORE ? global.KP_STORE.noteTags() : [];
      var tagOpts = '<option value="">（无标签）</option>' + tags.map(function (t) {
        return '<option value="' + esc(t) + '"' + (t === self.draft.tag ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
      return '<div class="note-form" data-note-form="new">' +
        '<div class="note-form__row">' +
          '<label class="field"><span>科目</span><select name="subject">' + subjOpts + '</select></label>' +
          '<label class="field"><span>标签</span><select name="tag">' + tagOpts + '</select></label>' +
        '</div>' +
        '<div class="note-form__row">' +
          '<div class="note-md-split">' +
            '<textarea class="note-md__editor" name="content" placeholder="支持 Markdown：# 标题、**粗体**、*斜体*、- 列表、`代码`" rows="8">' + esc(this.draft.content) + '</textarea>' +
            '<div class="note-md__preview" data-note-preview></div>' +
          '</div>' +
        '</div>' +
        '<div class="note-form__foot">' +
          '<button type="button" class="btn" data-note-cancel>取消</button>' +
          '<button type="button" class="btn btn--primary" data-note-save-new>保存</button>' +
        '</div>' +
      '</div>';
    },

    /* 编辑某条笔记的表单（嵌入其条目内） */
    editFormHtml: function (n) {
      var self = this;
      var subjOpts = this.SUBJECTS.map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === n.subject ? ' selected' : '') + '>' + esc(s) + '</option>';
      }).join('');
      var tags = global.KP_STORE ? global.KP_STORE.noteTags() : [];
      var tagOpts = '<option value="">（无标签）</option>' + tags.map(function (t) {
        return '<option value="' + esc(t) + '"' + (t === n.tag ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
      return '<div class="note-form note-form--inline" data-note-form="' + n.id + '">' +
        '<div class="note-form__row">' +
          '<label class="field"><span>科目</span><select name="subject">' + subjOpts + '</select></label>' +
          '<label class="field"><span>标签</span><select name="tag">' + tagOpts + '</select></label>' +
        '</div>' +
        '<div class="note-md-split">' +
          '<textarea class="note-md__editor" name="content" placeholder="Markdown 内容" rows="6">' + esc(n.content) + '</textarea>' +
          '<div class="note-md__preview" data-note-preview>' + self.renderMarkdown(n.content) + '</div>' +
        '</div>' +
        '<div class="note-form__foot">' +
          '<button type="button" class="btn btn--sm" data-note-cancel="' + n.id + '">取消</button>' +
          '<button type="button" class="btn btn--sm btn--primary" data-note-save="' + n.id + '">保存</button>' +
        '</div>' +
      '</div>';
    },

    bindNewForm: function (view) {
      var self = this;
      var form = $('[data-note-form="new"]', view);
      if (!form) return;
      var ta = form.querySelector('textarea[name="content"]');
      var prev = form.querySelector('[data-note-preview]');
      if (ta && prev) {
        ta.addEventListener('input', function () {
          prev.innerHTML = self.renderMarkdown(ta.value);
          self.draft.content = ta.value;
        });
      }
      $all('[data-note-cancel]', form).forEach(function (b) {
        b.addEventListener('click', function () { self.editId = null; self.render(); });
      });
      $('[data-note-save-new]', form).addEventListener('click', function () {
        var subj = form.elements.subject.value;
        var tag = form.elements.tag.value;
        var content = ta ? ta.value : self.draft.content;
        if (!content.trim() && !tag) return;
        global.KP_STORE.addNote({ subject: subj, tag: tag, content: content });
        self.editId = null;
        self.draft = { subject: subj, tag: tag, content: '' };
        self.render();
      });
    },

    bindEditForm: function (view, id) {
      var self = this;
      var form = view.querySelector('[data-note-form="' + id + '"]');
      if (!form) return;
      var ta = form.querySelector('textarea[name="content"]');
      var prev = form.querySelector('[data-note-preview]');
      if (ta && prev) {
        ta.addEventListener('input', function () {
          prev.innerHTML = self.renderMarkdown(ta.value);
        });
      }
      var cancel = form.querySelector('[data-note-cancel="' + id + '"]');
      if (cancel) cancel.addEventListener('click', function () { self.editId = null; self.render(); });
      var save = form.querySelector('[data-note-save="' + id + '"]');
      if (save) save.addEventListener('click', function () {
        var data = {
          subject: form.elements.subject.value,
          tag: form.elements.tag.value,
          content: ta ? ta.value : ''
        };
        global.KP_STORE.updateNote(id, data);
        self.editId = null;
        self.render();
      });
    }
  };

  /* ---------- 仪表盘 ---------- */
  var DASHBOARD = {
    view: null,

    /* 固定 4 科 */
    SUBJECTS: ['政治', '英语', '数学', '专业课'],
    /* 每科目标题量（样题 10 道/科，用于计算进度环） */
    PER_SUBJECT_TOTAL: 10,

    /* 读 store 计算仪表盘所需数据 */
    collect: function () {
      var store = global.KP_STORE;
      var content = global.KP_CONTENT;
      var records = store ? store.get('records') : [];
      var checkins = store ? store.get('checkins') : [];
      var model = global.KP_MODEL;

      // qid → subject 映射
      var qs = content ? content.kp_sampleQuestions : [];
      var qmap = {};
      qs.forEach(function (q) { qmap[q.id] = q; });

      // 每科做题数 + 正确数
      var perSubj = {};
      this.SUBJECTS.forEach(function (s) { perSubj[s] = { total: 0, correct: 0 }; });
      records.forEach(function (rec) {
        var q = qmap[rec.qid];
        if (!q) return;
        perSubj[q.subject].total++;
        if (rec.correct === true) perSubj[q.subject].correct++;
      });

      // 科目进度 0-100：做题占目标比例（capped 100）
      var progress = store ? store.getProgressAll() : {};
      var self = this;
      var ringValues = this.SUBJECTS.map(function (subj) {
        var manual = progress[subj];
        var stored = (typeof manual === 'number' && isFinite(manual)) ? manual : null;
        var computed = Math.min(100, Math.round((perSubj[subj].total / self.PER_SUBJECT_TOTAL) * 100));
        // 手动进度优先；无手动则用做题进度；两者都无 = 0
        var value = stored !== null ? stored : computed;
        return {
          subject: subj,
          value: value,
          done: perSubj[subj].total,
          correct: perSubj[subj].correct,
          total: self.PER_SUBJECT_TOTAL,
          source: stored !== null ? 'manual' : 'auto'
        };
      });

      // 总正确率
      var accPct = Math.round((model.accuracy(records)) * 100);

      // 连续打卡：优先读 kp_streak（计划打卡写入），回退到 checkins 计算
      var streakDays = model.streak(checkins);
      var planStreak = store ? store.getStreak().count : 0;
      if (planStreak > streakDays) streakDays = planStreak;

      // 总做题数 / 未掌握错题数
      var totalRecords = records.length;
      var wrongCount = store ? store.get('wrong').length : 0;

      // 今日学习时长（累加 kp_records.seconds，仅今日）
      var todayStr = new Date().toISOString().slice(0, 10);
      var todaySecs = 0;
      records.forEach(function (rec) {
        var t = rec.ts ? new Date(rec.ts).toISOString().slice(0, 10) : null;
        if (t === todayStr && rec.seconds > 0) todaySecs += rec.seconds;
      });
      // 今日目标时长 4h = 14400s（用于进度环 0-100）
      var todayTargetSecs = 4 * 3600;
      var timePct = Math.min(100, Math.round((todaySecs / todayTargetSecs) * 100));

      // 今日待复习 / 待打卡
      var dueToday = store ? store.dueToday().length : 0;
      var needCheckin = !store.isCheckedIn(todayStr);

      return {
        ringValues: ringValues,
        totalRecords: totalRecords,
        accPct: accPct,
        streakDays: streakDays,
        wrongCount: wrongCount,
        todaySecs: todaySecs,
        todayMinutes: Math.round(todaySecs / 60),
        todayHours: Math.floor(todaySecs / 3600),
        todayRemainMin: Math.round((todaySecs % 3600) / 60),
        timePct: timePct,
        dueToday: dueToday,
        needCheckin: needCheckin
      };
    },

    formatDuration: function (secs) {
      var h = Math.floor(secs / 3600);
      var m = Math.round((secs % 3600) / 60);
      if (h > 0) return h + ' 小时 ' + m + ' 分';
      return m + ' 分钟';
    },

    render: function () {
      var view = this.view;
      if (!view) return;
      var self = this;
      var d = this.collect();

      // 4 个科目进度环
      var ringsHtml = d.ringValues.map(function (r) {
        return '' +
          '<div class="dash-ring" data-subj="' + esc(r.subject) + '">' +
            '<div class="dash-ring__svg" data-ring-svg="' + esc(r.subject) + '"></div>' +
            '<div class="dash-ring__label">' + esc(r.subject) + '</div>' +
            '<div class="dash-ring__meta">已完成 ' + r.done + '/' + r.total + ' · 正确 ' + r.correct + '</div>' +
          '</div>';
      }).join('');

      // 时间环
      var timeRingHtml = '<div class="dash-ring dash-ring--time" data-time-ring>' +
        '<div class="dash-ring__svg" data-ring-svg="time"></div>' +
        '<div class="dash-ring__label">今日学习</div>' +
        '<div class="dash-ring__meta">' + self.formatDuration(d.todaySecs) + ' / 4h</div>' +
      '</div>';

      view.innerHTML = '' +
        '<div class="card dashboard-card">' +
          '<div class="dashboard-card__head">' +
            '<div>' +
              '<h2 class="card__title">仪表盘</h2>' +
              '<p class="card__desc">学习概况 · 进度追踪 · 今日任务</p>' +
            '</div>' +
          '</div>' +

          /* 4 个进度环 + 时间环 */
          '<div class="dash-rings">' +
            ringsHtml +
            timeRingHtml +
          '</div>' +

          /* 统计卡 */
          '<div class="dash-stats">' +
            '<a class="stat" href="#questions">' +
              '<div class="stat__num">' + d.totalRecords + '</div>' +
              '<div class="stat__label">总做题数</div>' +
              '<div class="stat__hint">累计作答记录</div>' +
            '</a>' +
            '<div class="stat">' +
              '<div class="stat__num">' + d.accPct + '%</div>' +
              '<div class="stat__label">总正确率</div>' +
              '<div class="stat__hint">全部记录</div>' +
            '</div>' +
            '<div class="stat">' +
              '<div class="stat__num">' + d.streakDays + '</div>' +
              '<div class="stat__label">连续打卡</div>' +
              '<div class="stat__hint">天</div>' +
            '</div>' +
            '<a class="stat" href="#mistakes">' +
              '<div class="stat__num">' + d.wrongCount + '</div>' +
              '<div class="stat__label">未掌握错题</div>' +
              '<div class="stat__hint">题 · 错题本</div>' +
            '</a>' +
          '</div>' +

          /* 今日任务摘要 */
          '<div class="dashboard-today" data-dash-today></div>' +
        '</div>';

      // 用 KP_CHARTS 渲染 SVG 环形进度
      d.ringValues.forEach(function (r) {
        var el = view.querySelector('[data-ring-svg="' + r.subject + '"]');
        if (el) global.KP_CHARTS.ring(el, r.value, {
          size: 84,
          stroke: 7,
          color: 'var(--brand-500)',
          trackColor: 'var(--ring-track, var(--gray-100))',
          showLabel: true
        });
      });
      var timeEl = view.querySelector('[data-ring-svg="time"]');
      if (timeEl) global.KP_CHARTS.ring(timeEl, d.timePct, {
        size: 84,
        stroke: 7,
        color: 'var(--ok)',
        trackColor: 'var(--ring-track, var(--gray-100))',
        showLabel: true
      });

      this.renderToday(d);
    },

    /* 今日任务摘要：待复习 / 待打卡 */
    renderToday: function (d) {
      var view = this.view;
      var box = view && view.querySelector('[data-dash-today]');
      if (!box) return;
      d = d || this.collect();

      var tasks = [];
      if (d.dueToday > 0) {
        tasks.push('<a class="dash-task dash-task--review" href="#review"><span class="dash-task__icon">🔁</span><span class="dash-task__text">今日待复习 <b>' + d.dueToday + ' 题</b></span><span class="dash-task__go">→</span></a>');
      }
      if (d.needCheckin) {
        tasks.push('<a class="dash-task dash-task--checkin" href="#dashboard" data-open-checkin><span class="dash-task__icon">✓</span><span class="dash-task__text">今日尚未打卡</span><span class="dash-task__go">去打卡</span></a>');
      }
      if (!tasks.length) {
        box.innerHTML = '<p class="dashboard-today__empty">今日任务已全部完成，保持节奏！</p>';
        return;
      }
      box.innerHTML = '<h3 class="dashboard-today__title">今日任务</h3><div class="dash-tasks">' + tasks.join('') + '</div>';
    }
  };

  /* ---------- 导航切换 ---------- */
  function activate(moduleId) {
    if (MODULES.indexOf(moduleId) === -1) return;

    // 视图切换
    $all('.view').forEach(function (v) {
      var active = v.getAttribute('data-view') === moduleId;
      v.classList.toggle('is-active', active);
      if (active) {
        if (moduleId === 'questions') {
          // 题库视图：渲染列表
          if (!v.children.length || !v.querySelector('[data-quiz-list]')) {
            renderPlaceholder(v, moduleId); // 首先进入占位以挂载容器
          }
          renderQuizView(v);
        } else if (moduleId === 'mistakes') {
          // 错题本聚合页：每次进入都重渲染（重做结算后状态会变）
          MISTAKES.view = v;
          MISTAKES.activeSubject = 'all';
          if (global.KP_APP) global.KP_APP._mistakesViewActive = true;
          MISTAKES.render();
        } else if (moduleId === 'review') {
          // 间隔复习：每次进入重渲染（复习/忘记会改变到期集合）
          REVIEW.view = v;
          REVIEW.render();
        } else if (moduleId === 'exam-past') {
          // 真题：每次进入重渲染（筛选/打开卷会改变状态）
          PAST.view = v;
          PAST.render();
        } else if (moduleId === 'vocab') {
          // 单词记忆：每次进入重渲染（评级/掌握会改变卡片流与统计）
          VOCAB.view = v;
          VOCAB.flipped = false;
          VOCAB.render();
        } else if (moduleId === 'plan') {
          // 学习计划：每次进入重渲染（任务勾选/添加会改变状态）
          PLAN.view = v;
          PLAN.render();
        } else if (moduleId === 'mock') {
          // 模考分析：每次进入重渲染（图表随记录变化）
          MOCK.view = v;
          MOCK.render();
        } else if (moduleId === 'notes') {
          // 笔记：每次进入重渲染（增删改标签会改变分组）
          NOTES.view = v;
          NOTES.render();
        } else if (moduleId === 'dashboard') {
          // 仪表盘：联动复习 + 错题统计
          DASHBOARD.view = v;
          DASHBOARD.render();
        } else {
          // 切离错题本时复位刷新标记
          if (global.KP_APP) global.KP_APP._mistakesViewActive = false;
          if (v.children.length === 0) renderPlaceholder(v, moduleId);
        }
      }
    });

    // 侧栏
    $all('.sidebar .nav-item').forEach(function (n) {
      n.classList.toggle('is-active', n.getAttribute('data-nav') === moduleId);
    });

    // 底部 Tab
    $all('.tabbar__item').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-nav') === moduleId);
    });

    // URL hash
    if (global.history && global.history.replaceState) {
      global.history.replaceState(null, '', '#' + moduleId);
    }
  }

  /* 题库视图：占位 + 列表容器 */
  function renderQuizView(view) {
    // 替换占位卡为列表
    view.innerHTML = '';
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '' +
      '<h2 class="card__title">题库练习</h2>' +
      '<p class="card__desc">共 ' + (global.KP_CONTENT ? global.KP_CONTENT.kp_sampleQuestions.length : 0) + ' 道样题 · 支持筛选、限时练习、收藏、错题本</p>' +
      '<div data-quiz-list-root></div>';
    view.appendChild(card);

    var root = card.querySelector('[data-quiz-list-root]');
    var filterHtml = buildFilterHtml();
    root.innerHTML = filterHtml + '<div class="quiz-list" data-quiz-list></div>';

    // 设置 quiz.view 为题库 section
    QUIZ.view = view;
    QUIZ.state = { subj: [], chap: [], type: [], diff: [], search: '', limit: 0 };
    bindFilters(view, QUIZ);
    QUIZ.renderListItems();
  }

  function buildFilterHtml() {
    var qs = global.KP_CONTENT ? global.KP_CONTENT.kp_sampleQuestions : [];
    var subjects = uniq(qs.map(function (q) { return q.subject; }));
    var chapters = uniq(qs.map(function (q) { return q.chapter; }));
    var types = uniq(qs.map(function (q) { return q.type; }));
    var diffs = uniq(qs.map(function (q) { return q.difficulty; })).sort();

    function group(label, items, key) {
      var chips = items.map(function (v) {
        var lbl = v;
        if (key === 'type') lbl = TYPE_LABELS[v] || v;
        if (key === 'diff') lbl = '★'.repeat(v) + '☆'.repeat(5 - v);
        return '<button class="chip' + (key === 'diff' ? '' : '') + '" data-filter-key="' + key + '" data-filter-val="' + esc(String(v)) + '">' + esc(lbl) + '</button>';
      }).join('');
      var all = '<button class="chip is-active" data-filter-key="' + key + '" data-filter-val="*">全部</button>';
      return '<div class="quiz-filters__group"><span class="quiz-filters__label">' + label + '</span>' + all + chips + '</div>';
    }

    return '<div class="quiz-filters" data-quiz-filters>' +
      group('科目', subjects, 'subj') +
      group('章节', chapters, 'chap') +
      group('题型', types, 'type') +
      group('难度', diffs, 'diff') +
      '<div class="quiz-filters__search-wrap" style="flex:1;min-width:140px;display:flex;align-items:center;">' +
        '<input class="quiz-filters__search" type="search" placeholder="搜索题干…" data-quiz-search />' +
      '</div>' +
      '<div class="quiz-filters__limit"><span class="quiz-filters__label">限时</span>' +
        '<input type="number" min="0" max="300" placeholder="分" data-quiz-limit value="" />' +
      '</div>' +
    '</div>';
  }

  /* ---------- 倒计时 ---------- */
  function updateCountdown() {
    var el = $('#exam-days');
    if (!el) return;

    var profile = global.KP_STORE ? global.KP_STORE.get('profile') : null;
    var examDate = profile && profile.examDate;

    if (!examDate) {
      el.textContent = '--';
      return;
    }

    var target = new Date(examDate);
    if (isNaN(target.getTime())) {
      el.textContent = '--';
      return;
    }

    var now = new Date();
    var diff = target.getTime() - now.getTime();
    var days = Math.ceil(diff / 86400000);
    el.textContent = days > 0 ? String(days) : '0';
  }

  /* ---------- 打卡 ---------- */
  function bindCheckin() {
    var btn = $('#today-checkin');
    if (!btn || !global.KP_STORE) return;

    function sync() {
      var checked = global.KP_STORE.isCheckedIn();
      btn.classList.toggle('is-checked', checked);
      var txt = btn.querySelector('.btn-txt');
      var target = txt || btn;
      target.textContent = checked ? '已打卡' : '打卡';
    }

    btn.addEventListener('click', function () {
      global.KP_STORE.checkInToday();
      sync();
    });
    sync();
  }

  /* ---------- 导航事件绑定 ---------- */
  function bindNav() {
    $all('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () {
        activate(el.getAttribute('data-nav'));
      });
    });

    // 答题面板引用
    QUIZ.panel = $('#quiz-panel');
    QUIZ.panelInner = $('#quiz-panel-inner');

    // 暴露引用供跨模块调用（错题本重做 / 刷新）
    KP_APP._quiz = QUIZ;
    KP_APP._mistakesViewActive = false;
    KP_APP._renderMistakes = function () {
      // 重查当前错题本 section（activate 切换时已写入 MISTAKES.view）
      MISTAKES.render();
    };
  }

  /* ---------- 初始化 ---------- */
  function init() {
    if (global.KP_STORE) global.KP_STORE.init();

    bindNav();
    bindCheckin();
    updateCountdown();

    // hash 路由
    var initial = (global.location && global.location.hash || '#dashboard').replace('#', '');
    if (MODULES.indexOf(initial) === -1) initial = 'dashboard';
    activate(initial);

    global.addEventListener('hashchange', function () {
      var id = (global.location.hash || '').replace('#', '') || 'dashboard';
      activate(id);
    });

    return KP_APP;
  }

  KP_APP.init = init;
  KP_APP.activate = activate;

  global.KP_APP = KP_APP;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(typeof window !== 'undefined' ? window : this));
