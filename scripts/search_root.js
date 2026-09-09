const fs = require('fs');

async function searchRoot() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for getElementById("root") ===');
  const regex = /.{0,150}getElementById\(["']root["']\).{0,150}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 5) {
    console.log(`${++count}: ${m[0].trim()}`);
  }
}

searchRoot().catch(console.error);
