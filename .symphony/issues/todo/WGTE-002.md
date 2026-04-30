---
id: WGTE-002
priority: 2
labels: symphony,validation
blocked_by:
---
# Extend validate-knowledge-base.sh to scan Symphony issues

Extend `scripts/validate-knowledge-base.sh` so it scans every `.md` file in `.symphony/issues/todo/` for the same placeholder strings already listed in the validator's `placeholder_scan_targets` block, failing in the same way if any are found.
