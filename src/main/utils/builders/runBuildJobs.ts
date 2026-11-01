/** Run independent build jobs with bounded concurrency and stable result order. */
export async function runBuildJobs<T>(jobs: Array<() => Promise<T>>, parallel = 1): Promise<T[]> {
  const count = Number.isFinite(parallel) ? Math.max(1, Math.floor(parallel)) : 1;
  const results: T[] = new Array(jobs.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(count, jobs.length) }, async () => {
    while (!failed && next < jobs.length) {
      const index = next++;
      try { results[index] = await jobs[index](); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
  }));
  // Wait for every active job before the caller cleans shared input files.
  if (failed) throw failure;
  return results;
}
