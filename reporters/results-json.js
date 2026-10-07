// @ts-check
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

/**
 * Records every run as JSON, with a finding for each step of each check.
 *
 *   results/latest.json          the most recent run
 *   results/runs/<run id>.json   every run, kept
 *
 * A "finding" is one thing a test checked: each expect() with its message
 * ("the Stripe card field should be on the form"), and any test.step(). Each
 * has its own passed/failed, duration and error. Playwright's own plumbing
 * (browser start-up, fixtures, hooks) is left out.
 *
 * Storytime Studio will read these later (its Automations page).
 */

const SUITE = 'ebo-smoke-testing';
const SCHEMA = 1;

/** Test number from its file name: "04-flipbooks.spec.js" -> 4; the sign-in setup -> 0. */
function numberOf(file) {
  const base = path.basename(file);
  if (/\.setup\./.test(base)) return 0;
  const m = base.match(/^(\d+)-/);
  return m ? Number(m[1]) : null;
}

/** Plain text of an error, without the terminal colour codes Playwright adds. */
function errorText(err) {
  if (!err) return null;
  // eslint-disable-next-line no-control-regex
  const strip = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
  return { message: strip(err.message).trim(), where: err.location ? `${path.basename(err.location.file)}:${err.location.line}` : null };
}

/**
 * The findings of one attempt: test.step()s and expect()s, in order, nested as
 * written. An expect.poll's inner retries are folded into the one finding.
 * @param {import('@playwright/test/reporter').TestStep[]} steps
 */
function findings(steps) {
  /** @type {any[]} */
  const out = [];
  for (const s of steps) {
    if (s.category === 'test.step') {
      out.push({ kind: 'step', title: s.title, status: s.error ? 'failed' : 'passed', durationMs: s.duration, error: errorText(s.error), findings: findings(s.steps) });
    } else if (s.category === 'expect') {
      out.push({ kind: 'check', title: s.title, status: s.error ? 'failed' : 'passed', durationMs: s.duration, error: errorText(s.error) });
    } else if (s.category === 'pw:api' || s.category === 'test.attach') {
      // actions themselves aren't findings, but checks can sit inside them
      out.push(...findings(s.steps));
    }
    // hooks and fixtures: Playwright's own set-up, not findings
  }
  return out;
}

class ResultsJsonReporter {
  constructor() {
    /** @type {Map<string, any>} */
    this.tests = new Map();
    this.runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    this.dir = path.join(process.cwd(), 'results');
  }

  /** @param {import('@playwright/test/reporter').FullConfig} config */
  onBegin(config) {
    this.startedAt = new Date();
    this.baseUrl = config.projects.find((p) => p.name === 'smoke')?.use?.baseURL || process.env.EBO_BASE_URL || null;
  }

  /**
   * Called once per attempt; the last attempt wins, and a pass after a failure
   * is "flaky".
   * @param {import('@playwright/test/reporter').TestCase} test
   * @param {import('@playwright/test/reporter').TestResult} result
   */
  onTestEnd(test, result) {
    const steps = findings(result.steps);
    // an error outside any check (e.g. a page that never loaded) still becomes a finding
    if (result.status !== 'passed' && result.status !== 'skipped' && !steps.some(function failed(f) { return f.status === 'failed' || (f.findings || []).some(failed); })) {
      steps.push({ kind: 'check', title: 'the test ran to the end', status: 'failed', durationMs: 0, error: errorText(result.error) });
    }
    this.tests.set(test.id, {
      number: numberOf(test.location.file),
      title: test.title,
      file: path.basename(test.location.file),
      project: test.parent.project()?.name || null,
      status: test.outcome() === 'flaky' ? 'flaky' : result.status,
      durationMs: result.duration,
      attempts: result.retry + 1,
      startedAt: result.startTime.toISOString(),
      error: errorText(result.error),
      findings: steps,
      attachments: result.attachments.filter((a) => a.path).map((a) => ({ name: a.name, contentType: a.contentType, path: path.relative(process.cwd(), /** @type {string} */ (a.path)) })),
    });
  }

  /** @param {import('@playwright/test/reporter').FullResult} result */
  onEnd(result) {
    // nothing ran (e.g. `--list`): don't record an empty run over the last real one
    if (this.tests.size === 0) return;
    const tests = [...this.tests.values()].sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
    const count = (s) => tests.filter((t) => t.status === s).length;
    const gh = process.env.GITHUB_ACTIONS === 'true';

    const run = {
      schema: SCHEMA,
      suite: SUITE,
      runId: this.runId,
      status: result.status, // passed | failed | timedout | interrupted
      startedAt: (this.startedAt || result.startTime).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: result.duration,
      site: this.baseUrl,
      ranOn: gh
        ? { source: 'github', runUrl: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`, trigger: process.env.GITHUB_EVENT_NAME || null, commit: process.env.GITHUB_SHA || null }
        : { source: 'local', machine: os.hostname() },
      summary: { total: tests.length, passed: count('passed'), failed: count('failed') + count('timedOut') + count('interrupted'), flaky: count('flaky'), skipped: count('skipped') },
      tests,
    };

    fs.mkdirSync(path.join(this.dir, 'runs'), { recursive: true });
    const json = JSON.stringify(run, null, 2);
    fs.writeFileSync(path.join(this.dir, 'runs', `${this.runId}.json`), json);
    fs.writeFileSync(path.join(this.dir, 'latest.json'), json);
    console.log(`\nResults: results/latest.json (${run.summary.passed} passed, ${run.summary.failed} failed)`);
  }

  printsToStdio() {
    return false; // the list reporter does the console output
  }
}

module.exports = ResultsJsonReporter;
