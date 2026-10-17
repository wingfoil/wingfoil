/**
 * task-285 (`bug-378`) — stands in for a `workflow next` latency suite in the two-file pass of
 * `test/cli/latency-report-pass.test.ts`: it prints one sibling-shaped line through `process.stdout.write`, as those
 * suites do (task-216, task-283), so the pass has two files and the reader must still take the report's own load
 * window. Not collected by `jest.config.js` (`**\/*.test.ts`); selected only by this directory's `jest.config.cjs`.
 */
describe('sibling fixture (task-285): a workflow next suite\'s one line', () => {
  afterAll(() => {
    process.stdout.write(
      'workflow next: p95 40 ms (n=25, min 30 ms, max 41 ms); load average (1-min / 5-min): before 7.04 / 6.00, after 9.62 / 7.00\n',
    );
  });

  it('runs one trivial case, so the file passes', () => {
    expect(true).toBe(true);
  });
});
