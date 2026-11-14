feat: fold every update channel into one list and one button

The update page had two places to look: the main list for exact-pinned
packages, and a separate "other install methods" section for github /
tarball / local-file installs, each with its own row and its own button. Worse
than redundant, the split was load-bearing for a bug -- the batch button sent
every selected name to POST /updates, where eligibleDeps filters out anything
that is not an exact version, so ticking a local-tarball package there did
nothing at all and said nothing about it.

The section is gone. Its rows already appeared in the main list (the update
badge map has always recorded file upgrades with action file-upgrade); what was
missing was selection and execution. Now:

- checkUpdates fetches /extras alongside /updates and marks both sets picked,
  so the checkbox count reflects everything that has an update
- applyUpdates partitions the selection by channel and runs each part on its
  own endpoint: npm names in one POST /updates pass, github as repull, file as
  file-upgrade, tarball URL as pin. Results are merged into one report, and a
  partial failure surfaces as "n of m groups failed" instead of vanishing
- the per-row badge button is untouched and still updates a single package

Removed with the panel: extraRowNode, applyExtra, checkFilePlan, the shortSha
helper, the extras sort/dim/count helpers, extraLog and filePlan state, and 18
dictionary keys in both languages (plus their en/zh symmetry entries). The
remaining extras state stays: checkExtras still refreshes the badge map after
an install or uninstall.

The behaviour suite's six assertions about that panel are replaced by ten about
the routing, including the two that would have caught the silent-skip: file
packages must reach file-upgrade, and a partial failure must be reported.
