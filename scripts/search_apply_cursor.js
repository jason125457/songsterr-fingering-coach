const fs = require('fs');

async function searchApplyCursor() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for applyCursorPosition ===');
  const regex = /.{0,250}applyCursorPosition.{0,250}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 6) {
    console.log(`${++count}: ${m[0].trim()}`);
  }
}

searchApplyCursor().catch(console.error);
