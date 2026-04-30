# Design

This repo should feel like internal tooling, not marketing.

## Design Principles

- Dense, scannable, operational layouts.
- Explicit states: queued, running, passed, failed, replayed, ignored.
- Synthetic data labels wherever a reviewer might mistake fixtures for real customers.
- Screenshots should show workflows, not decorative hero sections.
- Prefer stable dimensions for tables, run cards, and status badges.

## First UI Target

`apps/ops-console` should show:

- synthetic lead inbox
- webhook replay panel
- agent eval results
- reconciliation summary
- audit log

