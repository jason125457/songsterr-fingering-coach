const fs = require('fs');

async function searchCursors() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  console.log('\n=== Matches for cursors ===');
  const regex = /.{0,200}this\.cursors\..{0,200}/g;
  let m;
  let count = 0;
  while ((m = regex.exec(code)) !== null && count < 6) {
    console.log(`${++count}: ${m[0].trim()}`);
  }

  // Look for SVG elements representing the cursor line
  const svgCursorMatches = [...code.matchAll(/id:\s*["'][^"']*cursor[^"']*["']/gi)].map(m => m[0]);
  console.log('\nSVG element IDs with "cursor":', svgCursorMatches);
}

searchCursors().catch(console.error);
