const fs = require('fs');

async function main() {
  const metaRes = await fetch('https://www.songsterr.com/api/meta/329');
  const meta = await metaRes.json();
  const revisionId = meta.revisionId || meta.latestRevisionId;
  const image = meta.image;

  const track = meta.tracks[2];
  const partId = track.partId ?? 2;
  const partUrl = `https://dqsljvtekg760.cloudfront.net/329/${revisionId}/${image}/${partId}.json`;
  const res = await fetch(partUrl);
  const data = await res.json();

  console.log('Track:', track.name, track.instrument);
  data.measures.slice(0, 5).forEach((m, mIdx) => {
    console.log(`\n--- Measure ${mIdx + 1} ---`);
    m.voices?.forEach(v => v.beats?.forEach((b, bIdx) => {
      const notes = (b.notes || []).map(n => n.rest ? 'REST' : `str:${n.string} fret:${n.fret}`).join(', ');
      console.log(`  Beat ${bIdx + 1} (dur=${JSON.stringify(b.duration || b.type)}): [${notes}]`);
    }));
  });
}

main().catch(console.error);
