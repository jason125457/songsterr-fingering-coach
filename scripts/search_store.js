const fs = require('fs');

async function searchStore() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for store creation / root ===');
  const regex = /.{0,150}createStore.{0,150}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 6) {
    console.log(`${++count}: ${m[0].trim()}`);
  }

  // Check window assignments
  const windowRegex = /window\.([a-zA-Z0-9_$]+)\s*=/g;
  const winVars = new Set();
  let wm;
  while ((wm = windowRegex.exec(code)) !== null) {
    winVars.add(wm[1]);
  }
  console.log('\nWindow assignments in bundle:', Array.from(winVars).slice(0, 30));
}

searchStore().catch(console.error);
