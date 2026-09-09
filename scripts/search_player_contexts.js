const fs = require('fs');

async function searchContexts() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  function printMatches(term) {
    console.log(`\n=== Matches for ${term} ===`);
    const regex = new RegExp(`.{0,150}${term}.{0,150}`, 'g');
    let m;
    let count = 0;
    while ((m = regex.exec(code)) !== null && count < 6) {
      console.log(`${++count}: ${m[0].trim()}`);
    }
  }

  printMatches('playerCursor');
  printMatches('playbackState');
  printMatches('activeBeat');
}

searchContexts().catch(console.error);
