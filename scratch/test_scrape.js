const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const url = 'https://dricomeye.net/35_suisen/list_suisen10.html';
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const results = [];
    
    $('table tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length >= 3) {
        let rowData = [];
        tds.each((j, td) => {
          const text = $(td).text().replace(/\s+/g, ' ').trim();
          rowData.push(text);
        });
        
        if (rowData.length > 2 && (rowData[0] === '国立' || rowData[0] === '公立' || rowData[0] === '私立' || rowData[0] === '省庁等')) {
          results.push({
            type: rowData[0],
            university: rowData[1],
            faculty: rowData[2],
          });
        }
      }
    });
    console.log(`Found ${results.length} items on ${url}`);
    if (results.length > 0) {
      console.log('Sample item:', results[0]);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
