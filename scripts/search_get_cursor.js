const fs = require('fs');

async function searchGetCursor() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for .getCursor( ===');
  const regex = /.{0,200}\.getCursor\(.{0,200}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 6) {
    console.log(`${++count}: ${m[0].trim()}`);
  }
}

searchGetCursor().catch(console.error);
