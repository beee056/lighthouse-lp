// 早稲田・GMARCH の公式サイト/要項PDFから総合型選抜系の入試情報を
// Claude API(構造化出力)で抽出し uni-details.json を生成する。
//
// 設計:
// - 各大学のソース文書(HTML/PDF)を取得しテキスト化 → sha256ハッシュ
// - 前回実行時とハッシュが同じ大学はAPI呼び出しをスキップ(出力も据え置き)
//   → 出力が安定し、大学側が文書を更新した時だけコミット&デプロイされる
// - ANTHROPIC_API_KEY が無い場合は何もせず正常終了(既存JSONを保持)
// - 抽出結果はバリデーションし、不合格なら該当大学は旧データを保持
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');

const OUTPUT_PATH = path.join(__dirname, '..', 'uni-details.json');
const MAX_TEXT_CHARS = 120000; // Haiku(200Kトークン)に収める上限
const MODEL = 'claude-haiku-4-5';

// source types:
//   {type:'html', url}                          … ページ本文をテキスト化
//   {type:'pdf', url}                           … PDFをテキスト化
//   {type:'pdf-links', url, match, max}         … ページ内のPDFリンク(正規表現match)を最大max件取得
const UNIVERSITIES = [
  {
    id: 'waseda',
    name: '早稲田大学',
    officialUrl: 'https://www.waseda.jp/inst/admission/undergraduate/system/ao/',
    sources: [
      { type: 'html', url: 'https://www.waseda.jp/inst/admission/undergraduate/system/ao/' }
    ]
  },
  {
    id: 'meiji',
    name: '明治大学',
    officialUrl: 'https://www.meiji.ac.jp/exam/reference/tgansho.html',
    sources: [
      { type: 'html', url: 'https://www.meiji.ac.jp/exam/reference/tgansho.html' },
      { type: 'pdf-links', url: 'https://www.meiji.ac.jp/exam/reference/tgansho.html', match: /youkou/, max: 3 }
    ]
  },
  {
    id: 'aoyama',
    name: '青山学院大学',
    officialUrl: 'https://www.aoyama.ac.jp/admission/undergraduate/examination/',
    sources: [
      { type: 'html', url: 'https://www.aoyama.ac.jp/admission/undergraduate/examination/recommendation_self.html' },
      { type: 'pdf-links', url: 'https://www.aoyama.ac.jp/admission/undergraduate/examination/recommendation_self.html', match: /ad_exam/, max: 2 }
    ]
  },
  {
    id: 'rikkyo',
    name: '立教大学',
    officialUrl: 'https://www.rikkyo.ac.jp/admissions/undergraduate/guidelines/index.html',
    sources: [
      { type: 'html', url: 'https://www.rikkyo.ac.jp/admissions/undergraduate/guidelines/index.html' },
      { type: 'html', url: 'https://www.rikkyo.ac.jp/admissions/undergraduate/' }
    ]
  },
  {
    id: 'chuo',
    name: '中央大学',
    officialUrl: 'https://www.chuo-u.ac.jp/connect/admission/special/guide/',
    sources: [
      { type: 'html', url: 'https://www.chuo-u.ac.jp/connect/admission/special/guide/' },
      { type: 'pdf-links', url: 'https://www.chuo-u.ac.jp/connect/admission/special/guide/', match: /2027\/special/, max: 3 }
    ]
  },
  {
    id: 'hosei',
    name: '法政大学',
    officialUrl: 'https://nyushi.hosei.ac.jp/nyushi/seido/suisen/',
    sources: [
      { type: 'html', url: 'https://nyushi.hosei.ac.jp/nyushi/seido/suisen/' },
      { type: 'html', url: 'https://www.guide.52school.com/guidance/net-hosei-tokubetsu/gid/' },
      { type: 'pdf-links', url: 'https://www.guide.52school.com/guidance/net-hosei-tokubetsu/gid/', match: /yoko/, max: 2 }
    ]
  },
  {
    id: 'gakushuin',
    name: '学習院大学',
    officialUrl: 'https://www.univ.gakushuin.ac.jp/admissions/faculty-exam/',
    sources: [
      { type: 'html', url: 'https://www.univ.gakushuin.ac.jp/admissions/faculty-exam/recommendation-open/' },
      { type: 'pdf', url: 'https://www.univ.gakushuin.ac.jp/admissions/schedule_1.pdf' }
    ]
  }
];

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    programs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '入試制度名(例: FIT入試、自由選抜入試、公募制推薦)' },
          faculties: { type: 'string', description: '対象学部・学科(簡潔に)' },
          capacity: { type: 'string', description: '募集人員(不明なら空文字)' },
          schedule: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '項目名(例: 出願期間、選考日、合格発表)' },
                value: { type: 'string', description: '日付等の値。年を含めて具体的に' }
              },
              required: ['label', 'value'],
              additionalProperties: false
            }
          },
          url: { type: 'string', description: 'この制度の情報が載っている公式URL(不明なら空文字)' }
        },
        required: ['name', 'faculties', 'capacity', 'schedule', 'url'],
        additionalProperties: false
      }
    }
  },
  required: ['programs'],
  additionalProperties: false
};

const SYSTEM_PROMPT = `あなたは大学入試情報の構造化抽出を行うアシスタントです。
与えられた大学公式サイト・入試要項の本文テキストから、総合型選抜・公募制の学校推薦型選抜に該当する入試制度を抽出してください。

ルール:
- 総合型選抜(AO入試・自己推薦・自由選抜・FIT入試・チャレンジ入試等)と公募制推薦のみ対象。一般選抜・共通テスト利用・指定校推薦・帰国生入試・外国人留学生入試・編入学は除外
- 出願期間・選考日・合格発表日などの日程は、本文に書かれている場合のみscheduleに含める。推測で日付を作らない
- 年度が複数混在する場合は最新年度の情報を優先し、valueに年度・年を明記する
- 募集人員は本文に記載がある場合のみ。無ければ空文字
- 同一制度が学部別に分かれている場合は、学部ごとではなく制度単位でまとめ、facultiesに対象学部を列挙する
- 制度数は最大20件。情報が全く無い場合はprogramsを空配列にする`;

const stripHtml = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchPdfText(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  const parser = new PDFParse({ data: new Uint8Array(res.data) });
  try {
    const out = await parser.getText();
    return out.text.replace(/\s+/g, ' ').trim();
  } finally {
    if (parser.destroy) await parser.destroy().catch(() => {});
  }
}

async function fetchSourceTexts(university) {
  const parts = [];
  for (const source of university.sources) {
    if (source.type === 'html') {
      const { data } = await axios.get(source.url, { timeout: 30000 });
      parts.push(`===== ソース(HTML): ${source.url} =====\n${stripHtml(data)}`);
    } else if (source.type === 'pdf') {
      const text = await fetchPdfText(source.url);
      parts.push(`===== ソース(PDF): ${source.url} =====\n${text}`);
    } else if (source.type === 'pdf-links') {
      const { data } = await axios.get(source.url, { timeout: 30000 });
      const links = [...new Set(
        (data.match(/href="([^"]*\.pdf[^"]*)"/g) || [])
          .map((m) => m.slice(6, -1))
          .filter((href) => source.match.test(href))
          .map((href) => new URL(href, source.url).href)
      )].slice(0, source.max);
      for (const link of links) {
        const text = await fetchPdfText(link);
        parts.push(`===== ソース(PDF): ${link} =====\n${text}`);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return parts.join('\n\n').slice(0, MAX_TEXT_CHARS);
}

function validatePrograms(programs) {
  if (!Array.isArray(programs) || programs.length === 0 || programs.length > 20) return false;
  if (!programs.every((p) => p.name && p.name.length < 100)) return false;
  // 少なくとも1制度に、年月を含む日程または人数表現があること(抽出の空振り検知)
  const hasSubstance = programs.some(
    (p) =>
      p.schedule.some((s) => /20\d{2}年|\d{1,2}月\d{1,2}日/.test(s.value)) ||
      /[0-9０-９]+名|若干名/.test(p.capacity)
  );
  return hasSubstance;
}

async function extractWithClaude(client, university, text) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `大学名: ${university.name}\n\n以下のソーステキストから入試制度情報を抽出してください。\n\n${text}`
      }
    ]
  });
  if (response.stop_reason === 'refusal') throw new Error('extraction refused');
  const textBlock = response.content.find((b) => b.type === 'text');
  return JSON.parse(textBlock.text).programs;
}

async function run() {
  // --dry-run: ソース取得とハッシュ計算のみ(API呼び出し・ファイル書き込みなし)
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) {
    for (const university of UNIVERSITIES) {
      try {
        const text = await fetchSourceTexts(university);
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        console.log(`${university.name}: ${text.length} chars, hash ${hash.slice(0, 12)}`);
      } catch (err) {
        console.error(`${university.name}: FAILED - ${err.message}`);
      }
    }
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set. Skipping AI details scraping (existing uni-details.json is kept).');
    return;
  }
  const client = new Anthropic();

  let previous = { universities: [] };
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      previous = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    } catch (e) {
      console.warn('Could not parse existing uni-details.json, starting fresh.');
    }
  }
  const previousById = new Map((previous.universities || []).map((u) => [u.id, u]));

  const universities = [];
  let failures = 0;

  for (const university of UNIVERSITIES) {
    const old = previousById.get(university.id);
    try {
      console.log(`Fetching sources: ${university.name}`);
      const text = await fetchSourceTexts(university);
      if (text.length < 500) throw new Error(`source text too short (${text.length} chars)`);
      const sourceHash = crypto.createHash('sha256').update(text).digest('hex');

      if (old && old.sourceHash === sourceHash) {
        console.log(`  No source change. Keeping existing data (${old.programs.length} programs).`);
        universities.push(old);
        continue;
      }

      console.log(`  Source changed. Extracting with ${MODEL}...`);
      const programs = await extractWithClaude(client, university, text);
      if (!validatePrograms(programs)) throw new Error('validation failed (empty or insubstantial extraction)');

      console.log(`  Extracted ${programs.length} programs.`);
      universities.push({
        id: university.id,
        name: university.name,
        officialUrl: university.officialUrl,
        sourceHash,
        programs
      });
    } catch (err) {
      failures++;
      console.error(`  FAILED ${university.name}: ${err.message}`);
      if (old) {
        console.error('  Keeping previous data.');
        universities.push(old);
      }
    }
  }

  const output = {
    source: '各大学公式サイト・入学試験要項(Claude APIによる自動抽出)',
    universities
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
  console.log(`Done. ${universities.length} universities in uni-details.json (${failures} failures).`);
  if (universities.length === 0) process.exit(1);
}

run().catch((err) => {
  console.error('uni-details scraping failed:', err.message);
  process.exit(1);
});
