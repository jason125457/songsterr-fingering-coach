const fs = require('fs');

async function searchBundle() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  console.log('Fetching appClient bundle...');
  const res = await fetch(url);
  const code = await res.text();
  console.log('Bundle length:', code.length);

  const terms = ['cursor', 'data-cursor', 'playhead', 'currentMeasure', 'activeMeasure', 'data-measure', 'playback', 'currentTime', 'AudioContext', 'WebAssembly'];
  for (const t of terms) {
    const count = (code.match(new RegExp(t, 'gi')) || []).length;
    console.log(`Term "${t}": ${count} occurrences`);
  }

  // Find occurrences of cursor in context
  const regex = /.{0,60}cursor.{0,60}/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(code)) !== null && matches.length < 15) {
    matches.push(m[0]);
  }
  console.log('\n--- Sample Cursor Contexts ---');
  matches.forEach((s, idx) => console.log(`${idx + 1}: ${s.trim()}`));
}

searchBundle().catch(console.error);
