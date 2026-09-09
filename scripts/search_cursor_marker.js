const fs = require('fs');

async function searchCursorMarker() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for cursorMarker ===');
  const regex = /.{0,200}cursorMarker.{0,200}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 5) {
    console.log(`${++count}: ${m[0].trim()}`);
  }

  console.log('\n=== Matches for [data-cursor] ===');
  const regex2 = /.{0,200}data-cursor.{0,200}/g;
  let m2;
  count = 0;
  while ((m2 = regex2.exec(code)) !== null && count < 5) {
    console.log(`${++count}: ${m2[0].trim()}`);
  }
}

searchCursorMarker().catch(console.error);
