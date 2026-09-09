const fs = require('fs');

async function investigate() {
  const url = 'https://www.songsterr.com/a/wsa/schoolgirl-byebye-tab-s6557798';
  console.log('Fetching Songsterr page:', url);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await res.text();
  console.log('Page HTML length:', html.length);

  // Extract all script src
  const scriptRegex = /<script[^>]+src=["']([^"']+)["']/gi;
  let match;
  const scripts = [];
  while ((match = scriptRegex.exec(html)) !== null) {
    scripts.push(match[1]);
  }
  console.log('Found script tags:', scripts);

  // Look for js bundles
  const mainScript = scripts.find(s => s.includes('app') || s.includes('main') || s.includes('chunk') || s.includes('bundle') || s.includes('_next'));
  console.log('Main bundle candidate:', mainScript);

  // Search inside HTML for cursor, playback, or audio elements
  console.log('Has audio tag in HTML?', html.includes('<audio'));
  console.log('Has video tag in HTML?', html.includes('<video'));
}

investigate().catch(console.error);
