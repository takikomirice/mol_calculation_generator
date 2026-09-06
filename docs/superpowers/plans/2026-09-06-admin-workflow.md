# Admin workflow implementation plan

> Execute inline with review checkpoints; the user already requested implementation and branch push.

**Goal:** Reduce repeated filtering, student-review navigation and searching for management sheets.
**Architecture:** Keep the existing Monitor.html and Code.gs deployment. Add an on-demand, authenticated, read-only link API; keep all learner write paths unchanged. Use client-side state for list and review navigation.
**Tech Stack:** GAS, vanilla HTML/JS, node:test, Chromium/Playwright, clasp.

- [x] Add failing server tests in tests/monitor-refresh.test.mjs for auth-before-read, allowlisted sheet links, matched student row and missing sheets without writes.
- [x] Add failing browser tests in tests/admin-workflow.test.mjs for class-ID filtering, tab preferences, clear filters, sequential review with stale responses, dialog error/retry and mobile keyboard behavior.
- [x] Implement getMonitorOperationLinks in Code.gs and the operation dialog, preferences, filter summary and review navigation in Monitor.html. Keep normal refresh and grading call counts unchanged.
- [x] Update semantic API/HTML expectations in tests/monitor-html.test.mjs. Run focused tests; resolve real failures, then npm test once.
- [x] Review implementation and correct outdated operation guidance in 運用手順.md and docs/admin-retirement.md while preserving the existing menu-only write operations.
- [x] Use scripts/deploy-test-gas.ps1 to test and deploy. Verify real GAS guide links and 10 synthetic students using the existing isolated review fixture, including next/previous/filter behavior. Record timings without credentials.
- [x] Commit/push feat/admin-workflow-ux, verify CI and clean status, record provisional management score and remaining limitations.

Validation commands: node --test tests/admin-workflow.test.mjs tests/monitor-refresh.test.mjs tests/monitor-html.test.mjs; npm test; scripts/deploy-test-gas.ps1. Public artifacts contain no auth URLs or real student data.

Completed: GAS v20 browser checks and 264 local tests passed. Implementation commit `603ce8d` was pushed; GitHub Actions run `34038653625` passed. The assessment and measured limits are recorded in [admin-workflow.md](../../admin-workflow.md).
