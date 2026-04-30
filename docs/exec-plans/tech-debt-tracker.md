# Technical Debt Tracker

This file tracks debt that should be garbage-collected continuously.

| ID | Area | Debt | Severity | Target |
| --- | --- | --- | --- | --- |
| TD-001 | Validation | Knowledge-base validator only checks required docs and basic links. It does not yet enforce package layer dependencies. | Medium | Add structural checks once code packages exist. |
| TD-002 | Observability | No local logs/metrics/traces stack exists yet. | Medium | Add structured logs first, then fixture-backed metrics. |
| TD-003 | UI validation | No ops-console UI exists yet, so there are no screenshot or DOM validation loops. | Medium | Add when `apps/ops-console` lands. |

