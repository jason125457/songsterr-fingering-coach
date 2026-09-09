/**
 * run_all_tests.js
 * 
 * Master test runner executing both:
 * 1. synthetic.test.js (5 required edge case scenarios)
 * 2. fixtures.test.js (3 real-world Songsterr songs from Phase 1)
 */

const { runSyntheticTests } = require('./synthetic.test');
const { runFixtureTests } = require('./fixtures.test');

console.log('====================================================');
console.log('🎸 SONGSTERR FINGERING COACH - PHASE 2 TEST SUITE');
console.log('====================================================\n');

try {
  runSyntheticTests();
  runFixtureTests();
  console.log('====================================================');
  console.log('🏆 ALL TEST SUITES PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
} catch (err) {
  console.error('\n❌ TEST SUITE FAILED:');
  console.error(err);
  process.exit(1);
}
