/* 一次性清理：从 app.js 删除残留的 QUIZ 对象 + renderQuizView + buildFilterHtml
 * 用唯一文本锚点定位，避免正则转义问题。 */
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'src', 'app.js');
let text = fs.readFileSync(f, 'utf8');

function cutBetween(anchorStart, endMarker, label, includeEndMarker) {
  const i1 = text.indexOf(anchorStart);
  if (i1 === -1) { console.log('未找到锚点: ' + anchorStart.slice(0, 30)); return; }
  let i2 = text.indexOf(endMarker, i1 + anchorStart.length);
  if (i2 === -1) throw new Error('未找到结束标记: ' + label);
  if (!includeEndMarker) i2 += endMarker.length;
  // 向前把锚点前的空行/注释也吃掉
  let from = i1;
  while (from > 0) {
    const c = text[from - 1];
    if (c === '\n' || c === ' ' || c === '\t') from--; else break;
  }
  text = text.slice(0, from) + text.slice(i2);
  console.log('已删除 ' + label);
}

// 1) QUIZ 对象：从 '  var QUIZ = {' 到 该对象闭合（其内容含 startTimer/stopTimer 方法 + 闭合 '  };'）
//    QUIZ 对象闭合紧跟在 stopTimer 方法之后，用 '  };\n\n  /* ---------- 占位' 之类不可靠；
//    改为：找 QUIZ 起点，再找起点之后第一个 2 空格顶格 '  };' 行。
function cutObject(startAnchor, label) {
  const i1 = text.indexOf(startAnchor);
  if (i1 === -1) { console.log('未找到对象锚点 ' + label); return; }
  // 起点之后第一个 '\n  };'（2空格+};，对象末尾）
  const rest = text.slice(i1 + startAnchor.length);
  const close = rest.indexOf('\n  };');
  if (close === -1) throw new Error(label + ' 未找到闭合');
  const i2 = i1 + startAnchor.length + close + '\n  };\n'.length;
  let from = i1;
  while (from > 0) {
    const c = text[from - 1];
    if (c === '\n' || c === ' ' || c === '\t') from--; else break;
  }
  text = text.slice(0, from) + text.slice(i2);
  console.log('已删除对象 ' + label);
}
function cutFunc(name, label) {
  const re = new RegExp('\\n\\s*\\/\\*[^*]*\\*\\/\\s*\\n'); // 先不处理注释
  const anchor = '  function ' + name + '(';
  const i1 = text.indexOf(anchor);
  if (i1 === -1) { console.log('未找到函数 ' + label); return; }
  // 找函数体结束：从 anchor 起匹配大括号到平衡的 2 空格 '  }'
  let depth = 0, ended = false;
  let i = i1;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { ended = true; break; } }
  }
  if (!ended) throw new Error(label + ' 未闭合');
  const i2 = i + 1;
  let from = i1;
  while (from > 0) {
    const c = text[from - 1];
    if (c === '\n' || c === ' ' || c === '\t') from--;
    else break;
  }
  // 同时删除 from 处的注释行（上一行的 /* ... */）
  let f2 = from;
  const prevLineStart = text.lastIndexOf('\n', f2 - 2) + 1;
  const prevLine = text.slice(prevLineStart, f2 - 1);
  if (/^\s*\/\*\s*题库视图/.test(prevLine)) f2 = prevLineStart;
  text = text.slice(0, f2) + text.slice(i2);
  console.log('已删除函数 ' + label);
}

cutObject('  var QUIZ = {', 'QUIZ');
cutFunc('renderQuizView', 'renderQuizView');
cutFunc('buildFilterHtml', 'buildFilterHtml');
text = text.replace(/^\s*\n*[^]*?题库视图：占位.*?\n/m, '');
// 清理 '  /* ---------- 题库练习 ---------- */' 之类残留注释
text = text.replace(/^\s*\/\*[\s\S]*?题库练习 \*\/\s*\n/m, '');
text = text.replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(f, text, 'utf8');
console.log('完成，当前 ' + text.split('\n').length + ' 行');
