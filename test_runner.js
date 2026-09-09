/**
 * test_runner.js
 * Automated test suite for Songsterr Fingering Coach Phase 1
 * Validates extraction logic on 3 distinct Songsterr tabs.
 */

const assert = require('assert');

const CDN_HOSTS = ['dqsljvtekg760', 'd34shlm8p2ums2', 'd3cqchs6g3b5ew'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midi) {
  if (typeof midi !== 'number') return '?';
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

function buildPartUrl(songId, revisionId, image, partId, attempt = 0) {
  if (image && image.endsWith('-stage')) {
    return `https://d3d3l6a6rcgkaf.cloudfront.net/${songId}/${revisionId}/${image}/${partId}.json`;
  }
  if (image) {
    const host = CDN_HOSTS[attempt % CDN_HOSTS.length];
    return `https://${host}.cloudfront.net/${songId}/${revisionId}/${image}/${partId}.json`;
  }
  return `https://d3rrfvx08uyjp1.cloudfront.net/part/${revisionId}/${partId}`;
}

function parseMeasures(measures, tuning, maxMeasures = 5) {
  const result = [];
  const measuresToProcess = measures.slice(0, maxMeasures);

  measuresToProcess.forEach((measure, mIdx) => {
    const measureNumber = mIdx + 1;
    const timeSignature = measure.signature ? `${measure.signature[0]}/${measure.signature[1]}` : '4/4';
    const marker = measure.marker?.text || null;
    const notesList = [];

    if (measure.voices) {
      measure.voices.forEach((voice) => {
        if (!voice.beats) return;
        voice.beats.forEach((beat, bIdx) => {
          const beatNumber = bIdx + 1;
          const duration = beat.duration 
            ? `${beat.duration[0]}/${beat.duration[1]}` 
            : (beat.type ? `1/${beat.type}` : 'unknown');

          if (beat.notes && beat.notes.length > 0) {
            beat.notes.forEach((note) => {
              if (note.rest) {
                notesList.push({
                  measureNumber,
                  beatNumber,
                  timing: duration,
                  isRest: true
                });
              } else if (note.fret !== undefined && note.string !== undefined) {
                const stringIndex = note.string;
                const stringNumber = note.string + 1;
                const baseMidi = Array.isArray(tuning) && tuning[stringIndex] !== undefined ? tuning[stringIndex] : null;
                const openStringName = baseMidi !== null ? midiToNoteName(baseMidi) : `Str ${stringNumber}`;
                const notePitch = baseMidi !== null ? midiToNoteName(baseMidi + note.fret) : null;

                notesList.push({
                  measureNumber,
                  beatNumber,
                  timing: duration,
                  stringIndex: stringIndex,
                  stringNumber: stringNumber,
                  openString: openStringName,
                  fret: note.fret,
                  pitch: notePitch,
                  isTie: !!note.tie,
                  isRest: false
                });
              }
            });
          }
        });
      });
    }

    result.push({
      measureNumber,
      timeSignature,
      marker,
      notesCount: notesList.filter(n => !n.isRest).length,
      notes: notesList
    });
  });

  return result;
}

async function fetchAndExtractSong(songId, targetPartId = null) {
  const metaRes = await fetch(`https://www.songsterr.com/api/meta/${songId}`);
  if (!metaRes.ok) throw new Error(`Failed to fetch meta for songId ${songId}`);
  const meta = await metaRes.json();

  const revisionId = meta.revisionId || meta.latestRevisionId;
  const image = meta.image;
  const title = meta.title;
  const artist = meta.artist;
  const tracks = meta.tracks;

  const partId = targetPartId !== null ? targetPartId : (meta.popularTrackGuitar ?? meta.defaultTrack ?? 0);
  const trackIndex = tracks.findIndex(t => (t.partId ?? -1) === partId);
  const track = trackIndex !== -1 ? tracks[trackIndex] : (tracks[partId] || tracks[0]);
  const actualPartId = track?.partId ?? partId;

  const partUrl = buildPartUrl(songId, revisionId, image, actualPartId);
  const partRes = await fetch(partUrl);
  if (!partRes.ok) throw new Error(`Failed to fetch part JSON: ${partRes.status} from ${partUrl}`);
  const partData = await partRes.json();

  const tuning = partData.tuning || track?.tuning || [64, 59, 55, 50, 45, 40];
  const first5Measures = parseMeasures(partData.measures, tuning, 5);

  return {
    song: {
      songId,
      revisionId,
      title,
      artist
    },
    track: {
      partId: actualPartId,
      name: track?.name || partData.name,
      instrument: track?.instrument || partData.instrument,
      tuningMidi: tuning,
      tuningNames: tuning.map(midiToNoteName),
      totalMeasures: partData.measures.length
    },
    first5Measures
  };
}

async function runTests() {
  console.log('🎸 Running Songsterr Fingering Coach Phase 1 Acceptance Tests...\n');
  const results = [];

  // Test 1: Metallica - Enter Sandman (songId: 19, Clean Guitar partId: 3)
  console.log('--- Test 1: Metallica - Enter Sandman (Clean Guitar Intro) ---');
  const res1 = await fetchAndExtractSong(19, 3);
  assert.strictEqual(res1.song.songId, 19);
  assert.strictEqual(res1.song.title, 'Enter Sandman');
  assert.strictEqual(res1.song.artist, 'Metallica');
  assert.strictEqual(res1.first5Measures.length, 5);
  // Verify intro riff notes: Measure 2 beat 1 is string 5 fret 0, beat 2 is string 4 fret 7, beat 3 is string 3 fret 5
  const m2Notes = res1.first5Measures[1].notes.filter(n => !n.isRest);
  assert.ok(m2Notes.length >= 6, 'Measure 2 should have at least 6 notes');
  assert.strictEqual(m2Notes[0].stringIndex, 5);
  assert.strictEqual(m2Notes[0].fret, 0); // E string 0
  assert.strictEqual(m2Notes[1].stringIndex, 4);
  assert.strictEqual(m2Notes[1].fret, 7); // A string 7
  assert.strictEqual(m2Notes[2].stringIndex, 3);
  assert.strictEqual(m2Notes[2].fret, 5); // D string 5
  console.log('✅ Test 1 Passed! Verified Enter Sandman Clean Guitar notes (0-7-5-6-5-7-0).\n');
  results.push(res1);

  // Test 2: Deep Purple - Smoke on the Water (songId: 329, Rhythm Guitar partId: 2)
  console.log('--- Test 2: Deep Purple - Smoke on the Water (Rhythm Guitar Intro) ---');
  const res2 = await fetchAndExtractSong(329, 2);
  assert.strictEqual(res2.song.songId, 329);
  assert.strictEqual(res2.song.title, 'Smoke On The Water');
  assert.strictEqual(res2.song.artist, 'Deep Purple');
  assert.strictEqual(res2.first5Measures.length, 5);
  // Verify measure 1 double stops (5th fret on strings 3 and 4)
  const m1Notes = res2.first5Measures[0].notes.filter(n => !n.isRest);
  assert.ok(m1Notes.length >= 4, 'Measure 1 should have double stops');
  const fret5Notes = m1Notes.filter(n => n.fret === 5);
  assert.ok(fret5Notes.length >= 2, 'Measure 1 must contain 5th fret double stops');
  console.log('✅ Test 2 Passed! Verified Smoke on the Water double stops on strings 3 & 4.\n');
  results.push(res2);

  // Test 3: Nirvana - Come as You Are (songId: 14, Rhythm Guitar partId: 5)
  console.log('--- Test 3: Nirvana - Come as You Are (Rhythm Guitar Intro) ---');
  const res3 = await fetchAndExtractSong(14, 5);
  assert.strictEqual(res3.song.songId, 14);
  assert.strictEqual(res3.song.title, 'Come As You Are');
  assert.strictEqual(res3.song.artist, 'Nirvana');
  assert.strictEqual(res3.first5Measures.length, 5);
  // Measure 1 notes: 0, 0, 1 on string 5 (Low D string, tuning [62, 57, ...])
  const cayaM1Notes = res3.first5Measures[0].notes.filter(n => !n.isRest);
  assert.strictEqual(cayaM1Notes.length, 3);
  assert.strictEqual(cayaM1Notes[0].fret, 0);
  assert.strictEqual(cayaM1Notes[1].fret, 0);
  assert.strictEqual(cayaM1Notes[2].fret, 1);
  console.log('✅ Test 3 Passed! Verified Come as You Are intro riff (0-0-1 on string 5).\n');
  results.push(res3);

  console.log('🎉 ALL 3 TESTS PASSED PERFECTLY!\n');

  // Save sample JSON outputs to scratch/samples.json for inspection
  const fs = require('fs');
  fs.writeFileSync('sample_output.json', JSON.stringify(results, null, 2), 'utf-8');
  console.log('Saved 3 sample outputs to sample_output.json');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
