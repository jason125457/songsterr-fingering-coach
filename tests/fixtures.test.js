/**
 * fixtures.test.js
 * 
 * Verifies Fingering Engine on real-world Songsterr tab fixtures from Phase 1 (sample_output.json):
 * 1. Enter Sandman (Metallica) - Arpeggiated riff frets 5-7 + open E
 * 2. Smoke On The Water (Deep Purple) - Double stops / 4ths riff frets 3-5-6
 * 3. Come As You Are (Nirvana) - Low frets 0-1-2 riff
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { normalizeFromSampleFixture } = require('../src/normalizer');
const { analyzeTab } = require('../src/fingering_engine');
const { formatConsoleDebug, formatBeatsTable } = require('../src/formatter');

function runFixtureTests() {
  console.log('🧪 Running Fixture Fingering Engine Tests (Real Songs)...\n');

  const fixturePath = path.join(__dirname, '..', 'sample_output.json');
  assert.ok(fs.existsSync(fixturePath), 'sample_output.json fixture file must exist');

  const rawFixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.strictEqual(rawFixtures.length, 3, 'Must contain 3 songs');

  // Test 1: Enter Sandman
  console.log('--- Fixture 1: Enter Sandman (Metallica) ---');
  const sandmanFixture = rawFixtures.find(f => f.song.title === 'Enter Sandman');
  assert.ok(sandmanFixture, 'Enter Sandman fixture found');

  const sandmanNorm = normalizeFromSampleFixture(sandmanFixture);
  const sandmanResult = analyzeTab(sandmanNorm);

  assert.strictEqual(sandmanResult.song.title, 'Enter Sandman');
  assert.strictEqual(sandmanResult.measures.length, 5);

  // Measure 2 is the main riff: 0 (E) -> 7 (A) -> 5 (D) -> 6 (E) -> 5 (E) -> 7 (A) -> 0 (E)
  const sandmanM2 = sandmanResult.measures[1];
  console.log(`Enter Sandman Measure 2 Position: ${sandmanM2.recommendedPosition}`);
  assert.strictEqual(sandmanM2.recommendedPosition, 5, 'Riff across frets 5, 6, 7 should be Position 5');

  const m2Notes = sandmanM2.beats.flatMap(b => b.notes);
  // Verify frets and fingers:
  // Fret 0 -> Finger 0
  // Fret 5 -> Finger 1
  // Fret 6 -> Finger 2
  // Fret 7 -> Finger 3
  m2Notes.forEach(note => {
    if (note.fret === 0) {
      assert.strictEqual(note.recommendedFinger, 0, 'Open string must have finger 0');
    } else if (note.fret === 5) {
      assert.strictEqual(note.recommendedFinger, 1, 'Fret 5 in Position 5 must be finger 1');
    } else if (note.fret === 6) {
      assert.strictEqual(note.recommendedFinger, 2, 'Fret 6 in Position 5 must be finger 2');
    } else if (note.fret === 7) {
      assert.strictEqual(note.recommendedFinger, 3, 'Fret 7 in Position 5 must be finger 3');
    }
  });
  console.log('✅ Enter Sandman passed: Accurately fingered frets 5-6-7 as Index(1), Middle(2), Ring(3).\n');

  // Test 2: Smoke On The Water
  console.log('--- Fixture 2: Smoke On The Water (Deep Purple) ---');
  const smokeFixture = rawFixtures.find(f => f.song.title === 'Smoke On The Water');
  assert.ok(smokeFixture, 'Smoke On The Water fixture found');

  const smokeNorm = normalizeFromSampleFixture(smokeFixture);
  const smokeResult = analyzeTab(smokeNorm);

  assert.strictEqual(smokeResult.song.title, 'Smoke On The Water');
  assert.strictEqual(smokeResult.measures.length, 5);

  // Measure 1: D5+A5, G3+D3, G5+D5...
  const smokeM1 = smokeResult.measures[0];
  console.log(`Smoke On The Water Measure 1 Position: ${smokeM1.recommendedPosition}`);
  assert.ok(smokeM1.recommendedPosition >= 3 && smokeM1.recommendedPosition <= 5, 'Smoke riff should be around Position 3-5');

  smokeResult.measures.forEach(m => {
    m.beats.forEach(b => {
      // If beat has 2 simultaneous fretted notes, verify valid finger assignments
      if (b.notes.length === 2 && !b.notes[0].isRest && !b.notes[1].isRest) {
        const [n1, n2] = b.notes;
        assert.ok(n1.recommendedFinger >= 1 && n1.recommendedFinger <= 4, 'Fingers must be between 1 and 4');
        assert.ok(n2.recommendedFinger >= 1 && n2.recommendedFinger <= 4, 'Fingers must be between 1 and 4');
        if (n1.fret !== n2.fret) {
          assert.notStrictEqual(n1.recommendedFinger, n2.recommendedFinger, 'Different frets simultaneously cannot use the same finger');
        }
      }
    });
  });
  console.log('✅ Smoke On The Water passed: Double-stops correctly handled with barre fingerings.\n');

  // Test 3: Come As You Are
  console.log('--- Fixture 3: Come As You Are (Nirvana) ---');
  const nirvanaFixture = rawFixtures.find(f => f.song.title === 'Come As You Are');
  assert.ok(nirvanaFixture, 'Come As You Are fixture found');

  const nirvanaNorm = normalizeFromSampleFixture(nirvanaFixture);
  const nirvanaResult = analyzeTab(nirvanaNorm);

  assert.strictEqual(nirvanaResult.song.title, 'Come As You Are');
  assert.strictEqual(nirvanaResult.measures.length, 5);

  // Riff is in Position 1 (frets 0, 1, 2)
  nirvanaResult.measures.forEach(m => {
    assert.strictEqual(m.recommendedPosition, 1, 'Come As You Are intro riff should remain in Position 1');
    m.beats.forEach(b => {
      b.notes.forEach(n => {
        if (n.fret === 0) {
          assert.strictEqual(n.recommendedFinger, 0, 'Open string should be finger 0');
        } else if (n.fret === 1) {
          assert.strictEqual(n.recommendedFinger, 1, 'Fret 1 in Position 1 should be finger 1');
        } else if (n.fret === 2) {
          assert.strictEqual(n.recommendedFinger, 2, 'Fret 2 in Position 1 should be finger 2');
        }
      });
    });
  });
  console.log('✅ Come As You Are passed: Flawlessly held Position 1 across frets 0-1-2 with fingers 0, 1, 2.\n');

  console.log('🎉 ALL 3 REAL-WORLD FIXTURE TESTS PASSED!\n');
}

if (require.main === module) {
  runFixtureTests();
}

module.exports = { runFixtureTests };
