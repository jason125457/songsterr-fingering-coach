const fs = require('fs');

async function searchPlayhead() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for cursor-playhead ===');
  const regex = /.{0,250}cursor-playhead.{0,250}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 5) {
    console.log(`${++count}: ${m[0].trim()}`);
  }
}

searchPlayhead().catch(console.error);
