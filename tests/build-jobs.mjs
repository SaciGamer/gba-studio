import assert from 'node:assert/strict';
import { runBuildJobs } from '../dist/main/utils/builders/runBuildJobs.js';

for (const parallel of [1, 2, 4]) {
  let active = 0, peak = 0;
  const results = await runBuildJobs(Array.from({ length: 8 }, (_, index) => async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 8 - index));
    --active;
    return index;
  }), parallel);
  assert.equal(peak, parallel);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7]);
}
let completed = false, queuedStarted = false;
await assert.rejects(runBuildJobs([
  async () => { throw new Error('invalid layer'); },
  async () => { await new Promise(resolve => setTimeout(resolve, 10)); completed = true; },
  async () => { queuedStarted = true; },
], 2), /invalid layer/);
assert(completed, 'active jobs must settle before shared inputs are cleaned');
assert(!queuedStarted, 'stop scheduling after failure');
assert.deepEqual(await runBuildJobs([], 4), []);
console.log('Build jobs: configured concurrency, ordered results and failure draining passed.');
