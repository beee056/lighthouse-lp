const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URLS = [
  { url: 'https://dricomeye.net/37_aoexam/aoexam01.html', category: '総合型選抜' },
  { url: 'https://dricomeye.net/35_suisen/list_suisen01.html', category: '学校推薦型選抜（私立）' },
  { url: 'https://dricomeye.net/33_nu_suisen/list_nu_suisen01.html', category: '学校推薦型選抜（国公立）' }
];

async function scrapePrefectureLinks(baseUrlObj) {
  try {
    const { data } = await axios.get(baseUrlObj.url);
    const $ = cheerio.load(data);
    const links = new Set();
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      // Match links like aoexam10.html, list_suisen10.html
      if (href && href.match(/(aoexam|list_suisen|list_nu_suisen)\d{2}\.html/)) {
        // Resolve URL
        const absoluteUrl = new URL(href, baseUrlObj.url).href.split('?')[0]; // Remove query params for clean URL
        links.add(absoluteUrl);
      }
    });
    return Array.from(links);
  } catch (err) {
    console.error('Error fetching base URL:', baseUrlObj.url, err.message);
    return [];
  }
}

async function scrapeUniversityData(url, category) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const results = [];
    
    // Find prefecture name
    let prefName = '不明';
    $('h2, h3, title').each((i, el) => {
      const text = $(el).text();
      const match = text.match(/〔(.*?)〕/);
      if (match) prefName = match[1];
    });

    $('table tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 3) {
        let rowData = [];
        tds.each((j, td) => {
          const text = $(td).text().replace(/\s+/g, ' ').trim();
          rowData.push(text);
        });
        
        if (url.includes('35_suisen')) {
          if (rowData.length >= 3 && rowData[1] && rowData[1].match(/^\d+/)) {
            results.push({
              category: category,
              prefecture: prefName,
              type: '私立',
              university: rowData[0],
              faculty: `${rowData[1]} ${rowData[2]}`,
              capacity: rowData[3] || '',
              url: url
            });
          }
        } else {
          if (rowData.length > 2 && (rowData[0] === '国立' || rowData[0] === '公立' || rowData[0] === '私立' || rowData[0] === '省庁等')) {
            results.push({
              category: category,
              prefecture: prefName,
              type: rowData[0],
              university: rowData[1],
              faculty: rowData[2],
              capacity: rowData[3] || '',
              url: url
            });
          }
        }
      }
    });

    return results;
  } catch (err) {
    console.error('Error fetching university data:', url, err.message);
    return [];
  }
}

async function run() {
  console.log('Scraping started...');
  let allData = [];

  for (const base of BASE_URLS) {
    console.log(`Processing category: ${base.category}`);
    const links = await scrapePrefectureLinks(base);
    console.log(`Found ${links.length} prefecture links.`);
    
    for (const link of links) {
      console.log(`  Scraping: ${link}`);
      const data = await scrapeUniversityData(link, base.category);
      allData = allData.concat(data);
      // Wait a bit to avoid overwhelming the server
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const outputPath = path.join(__dirname, '..', 'data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2));
  console.log(`Scraping complete. Saved ${allData.length} records to data.json`);
}

run();
