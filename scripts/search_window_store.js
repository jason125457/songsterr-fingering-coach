const fs = require('fs');

async function searchWindowStore() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for __store__ ===');
  const regex = /.{0,200}__store__.{0,200}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 5) {
    console.log(`${++count}: ${m[0].trim()}`);
  }

  console.log('\n=== Matches for __debug__ ===');
  const regex2 = /.{0,200}__debug__.{0,200}/g;
  let m2;
  count = 0;
  while ((m2 = regex2.exec(code)) !== null && count < 5) {
    console.log(`${++count}: ${m2[0].trim()}`);
  }
}

searchWindowStore().catch(console.error);
