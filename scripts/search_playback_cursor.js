const fs = require('fs');

async function searchPlaybackCursor() {
  const url = 'https://static3.songsterr.com/production-main/static3/legacy/appClient-plTPDBW7.js';
  const res = await fetch(url);
  const code = await res.text();

  // Search for player cursor or playback cursor
  const terms = ['playerCursor', 'playbackCursor', 'playhead', 'currentBeat', 'activeBeat', 'cursorBar', 'currentTick', 'playbackState'];
  for (const t of terms) {
    const count = (code.match(new RegExp(t, 'gi')) || []).length;
    console.log(`Term "${t}": ${count}`);
  }

  // Search for how cursor moves in tab SVG:
  // Usually there is a vertical green line or rect moving across measures!
  const rectMatches = [...code.matchAll(/class(?:Name)?:\s*["'][^"']*(?:cursor|playhead|pointer)[^"']*["']/gi)].map(m => m[0]);
  console.log('Class matches with cursor/playhead/pointer:', rectMatches.slice(0, 10));

  // Search for audio element / web audio
  const audioMatches = [...code.matchAll(/new\s+(?:window\.)?AudioContext/gi)].length;
  console.log('AudioContext creation count:', audioMatches);
}

searchPlaybackCursor().catch(console.error);
