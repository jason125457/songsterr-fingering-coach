const fs = require('fs');

async function searchReactFiber() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  // Check how root is rendered
  const rootMatches = [...code.matchAll(/createRoot\([^)]+\)|render\([^,]+,\s*document\.getElementById\(["']root["']\)\)/g)].map(m => m[0]);
  console.log('React root matches:', rootMatches);

  // Check Provider in root
  const providerMatches = [...code.matchAll(/Provider,\s*\{[^}]*store:[^}]*\}/g)].map(m => m[0]);
  console.log('Provider store matches:', providerMatches.slice(0, 5));
}

searchReactFiber().catch(console.error);
