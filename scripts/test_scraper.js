const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const url = 'https://dricomeye.net/37_aoexam/aoexam10.html';
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  
  let count = 0;
  $('table tr').each((i, el) => {
    const tds = $(el).find('td');
    if (tds.length >= 3 && count < 10) {
      let rowData = [];
      tds.each((j, td) => {
        const text = $(td).text().replace(/\s+/g, ' ').trim();
        if (text) rowData.push(text);
      });
      if (rowData.length > 0 && rowData.join('').length > 10) {
        console.log(rowData);
        count++;
      }
    }
  });
}

test();
