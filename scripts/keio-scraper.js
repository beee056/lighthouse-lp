// 慶應義塾大学 公式サイトから総合型選抜系入試の募集人員・日程を取得し
// keio-data.json を生成する。university-portal の慶應詳細モーダルで使用。
// 注意: 出力は決定的(タイムスタンプなし)。内容が変わった時だけコミット→デプロイされる。
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE = 'https://www.keio.ac.jp/ja/admissions/faculty/examinations/';

const PROGRAMS = [
  {
    id: 'fit',
    name: '法学部 FIT入試',
    faculties: '法学部(法律学科・政治学科)',
    url: BASE + 'ao-law/',
    strategy: 'sections',
    sectionKeys: ['出願期間', '選考日程'],
    match: ['FIT']
  },
  {
    id: 'st',
    name: '理工学部 AO入試(分野志向型)',
    faculties: '理工学部(電気情報工・数理科学・化学)',
    url: BASE + 'ao-st/',
    strategy: 'sections',
    sectionKeys: ['出願期間', '選考日程'],
    match: ['分野志向']
  },
  {
    id: 'sfc',
    name: '総合政策学部・環境情報学部 AO入試',
    faculties: '総合政策学部・環境情報学部',
    url: BASE + 'ao-sfc-pem/',
    strategy: 'table',
    tableHeading: '選考日程',
    match: ['総合政策', '環境情報']
  },
  {
    id: 'nmc',
    name: '看護医療学部 AO入試',
    faculties: '看護医療学部',
    url: BASE + 'ao-nmc/',
    strategy: 'labels',
    labelSection: '試験日程',
    labels: ['出願期間', '第1次合格発表日', '第2次選考日', '第2次合格発表日', '入学手続期間'],
    match: ['看護']
  },
  {
    id: 'self',
    name: '文学部 自主応募制による推薦入学者選考',
    faculties: '文学部',
    url: BASE + 'recommendation-self/',
    strategy: 'sections',
    sectionKeys: ['出願期間', '選考日程'],
    match: ['自主応募']
  }
];

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const truncate = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

// h2〜h5見出しを文書順に列挙する
function indexHeadings(html) {
  const headings = [];
  const re = /<h([2-5])[^>]*>([\s\S]*?)<\/h\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    headings.push({ level: Number(m[1]), text: stripTags(m[2]), start: m.index, end: re.lastIndex });
  }
  return headings;
}

// 指定テキストの見出しから、同レベル以上の次見出しまでをセクションとして返す
function findSection(html, headings, key) {
  const idx = headings.findIndex((h) => h.text === key);
  if (idx < 0) return null;
  const h = headings[idx];
  let endPos = html.length;
  for (let i = idx + 1; i < headings.length; i++) {
    if (headings[i].level <= h.level) { endPos = headings[i].start; break; }
  }
  return { heading: h, index: idx, endPos, html: html.slice(h.end, endPos) };
}

// セクション直下の小見出し(level+1)ごとに {label, value} を作る。小見出しが無ければ全文1件。
function sectionToItems(html, headings, key) {
  const sec = findSection(html, headings, key);
  if (!sec) return [];
  const subLevel = sec.heading.level + 1;
  const subs = [];
  for (let i = sec.index + 1; i < headings.length && headings[i].start < sec.endPos; i++) {
    if (headings[i].level === subLevel) subs.push(headings[i]);
  }
  if (subs.length === 0) {
    return [{ label: key, value: truncate(stripTags(sec.html), 300) }];
  }
  return subs.map((sub, i) => {
    const next = subs[i + 1];
    const value = stripTags(html.slice(sub.end, next ? next.start : sec.endPos));
    return { label: sub.text.replace(/^\d+\.\s*/, '').replace(/[「」]/g, '').trim(), value: truncate(value, 200) };
  }).filter((it) => it.value);
}

// 募集人員: 学科小見出しがあれば「学科: N名」を連結、無ければ本文から人数表現を抽出
function extractCapacity(html, headings) {
  const sec = findSection(html, headings, '募集人員');
  if (!sec) return '';
  const subLevel = sec.heading.level + 1;
  const subs = [];
  for (let i = sec.index + 1; i < headings.length && headings[i].start < sec.endPos; i++) {
    if (headings[i].level === subLevel) subs.push({ i, h: headings[i] });
  }
  const numRe = /(?:最大)?[0-9０-９,]+名(?:程度)?|若干名/;
  if (subs.length > 0) {
    const parts = subs.map(({ i, h }) => {
      const next = headings[i + 1];
      const text = stripTags(html.slice(h.end, next ? next.start : sec.endPos));
      const num = text.match(numRe);
      return h.text + ' ' + (num ? num[0] : truncate(text, 40));
    });
    return parts.join(' / ');
  }
  const text = stripTags(sec.html);
  // 人数を含む最初の文までを採用
  const m = text.match(new RegExp('^.*?(?:' + numRe.source + ')[^。]*。?'));
  return truncate((m ? m[0] : text).replace(/[（(]※[)）]/g, '').trim(), 160);
}

// SFC: 選考日程テーブル(列=AO入試の回)を {label: 回名, value: 行ラベル: 値 …} に変換
function extractScheduleTable(html, headings, key) {
  const sec = findSection(html, headings, key);
  if (!sec) return [];
  const tbl = sec.html.match(/<table[\s\S]*?<\/table>/);
  if (!tbl) return [];
  const rows = (tbl[0].match(/<tr[\s\S]*?<\/tr>/g) || []).map((r) =>
    (r.match(/<t[dh][\s\S]*?<\/t[dh]>/g) || []).map(stripTags)
  );
  if (rows.length < 2) return [];
  const header = rows[0];
  const items = [];
  for (let col = 1; col < header.length; col++) {
    const lines = [];
    for (let r = 1; r < rows.length; r++) {
      const rowLabel = rows[r][0];
      const cell = rows[r][col];
      if (rowLabel && cell) lines.push(rowLabel.replace(/[（(]注\d+[)）]/g, '').trim() + ': ' + cell);
    }
    items.push({ label: header[col].replace(/[（(]注\d+[)）]/g, '').trim(), value: lines.join(' ／ ') });
  }
  return items;
}

// nmc: セクション本文を既知ラベルで分割して {label, value} にする
function extractByLabels(html, headings, sectionKey, labels) {
  const sec = findSection(html, headings, sectionKey);
  if (!sec) return [];
  const text = stripTags(sec.html);
  const items = [];
  for (let i = 0; i < labels.length; i++) {
    const start = text.indexOf(labels[i]);
    if (start < 0) continue;
    let end = text.length;
    for (let j = i + 1; j < labels.length; j++) {
      const p = text.indexOf(labels[j], start + labels[i].length);
      if (p >= 0) { end = p; break; }
    }
    const value = text.slice(start + labels[i].length, end).trim();
    if (value) items.push({ label: labels[i], value: truncate(value, 200) });
  }
  return items;
}

async function scrapeProgram(program) {
  const { data: html } = await axios.get(program.url, { timeout: 30000 });
  const headings = indexHeadings(html);
  const capacity = extractCapacity(html, headings);
  let schedule = [];
  if (program.strategy === 'sections') {
    for (const key of program.sectionKeys) schedule = schedule.concat(sectionToItems(html, headings, key));
  } else if (program.strategy === 'table') {
    schedule = extractScheduleTable(html, headings, program.tableHeading);
  } else if (program.strategy === 'labels') {
    schedule = extractByLabels(html, headings, program.labelSection, program.labels);
  }
  if (!capacity && schedule.length === 0) {
    throw new Error(`No data extracted for ${program.id} (page structure may have changed): ${program.url}`);
  }
  return {
    id: program.id,
    name: program.name,
    faculties: program.faculties,
    url: program.url,
    match: program.match,
    capacity,
    schedule
  };
}

async function run() {
  console.log('Keio scraping started...');
  const programs = [];
  for (const program of PROGRAMS) {
    console.log(`  Scraping: ${program.name}`);
    programs.push(await scrapeProgram(program));
    await new Promise((r) => setTimeout(r, 500));
  }
  const output = {
    source: '慶應義塾大学 公式サイト 入試制度一覧 (https://www.keio.ac.jp/ja/admissions/faculty/examinations/)',
    programs
  };
  const outputPath = path.join(__dirname, '..', 'keio-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`Keio scraping complete. Saved ${programs.length} programs to keio-data.json`);
}

run().catch((err) => {
  console.error('Keio scraping failed:', err.message);
  process.exit(1);
});
