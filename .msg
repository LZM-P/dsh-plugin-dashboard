fix: the connection-reset path threw, and npm test never ran behaviour

Two regressions from the previous commit, both caught by review.

P0: the "honest connection error" fix crashed itself. load() only called
setData/setError and returned nothing, so `const healed = await load()` was
undefined; the guard was written `healed !== null`, which undefined passes, and
sameEnabledMap then read `undefined.rows`. Every optimistic operation that hit
the HMR connection reset (toggling a plugin, changing the roster) threw inside
its own catch instead of healing -- silently, because the throw replaced the
toast the branch was supposed to show. load() now returns the new snapshot on
success and null on failure, sameEnabledMap guards with a truthy check on both
sides, and the branch logic is a pure failureOutcome(message, expected, healed)
function so it can be tested as behaviour rather than grepped as text.

P1: package.json had two "test" keys. The later one won, so npm test never ran
behaviour.mjs -- the commit message claimed it did. The duplicate is gone and
the single test now runs all five suites: self-check, behaviour, job-background,
download, pnpm-command.

The behaviour tests for this path were 5 `source.includes()` checks, which is
why 33 green assertions coexisted with the TypeError. They now extract and
execute sameEnabledMap and failureOutcome for real: identical snapshots agree,
a changed row is detected, added and vanished rows are ignored, and -- the
actual bug -- an undefined or null healed snapshot returns false instead of
throwing, and never claims the change settled. Reverting the guard to
`=== null` makes exactly those two assertions fail, which is how I know the
test bites.

Also: guardedPnpm's rollback branch now reports unguarded too (a user deciding
whether to retry immediately needs to know whether the failed run even held the
gate), and the write-gate comment in index.js no longer restates the old claim
that it stops local scripts -- it is a declaration of intent, not
authentication, matching what README already says.
