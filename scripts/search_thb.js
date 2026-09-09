const fs = require('fs');

async function searchTHb() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for tHb ===');
  const regex = /class tHb[^}]+}/g;
  let m = regex.exec(code);
  if (m) console.log(m[0]);
  else {
    const regex2 = /var tHb=[^;]+;/g;
    let m2 = regex2.exec(code);
    if (m2) console.log(m2[0]);
    else {
      const regex3 = /.{0,150}tHb.{0,150}/g;
      for (let i = 0; i < 4; i++) {
        let m3 = regex3.exec(code);
        if (m3) console.log(m3[0]);
      }
    }
  }
}

searchTHb().catch(console.error);
