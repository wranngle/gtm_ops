# Product Spec: Flagship GTM Engine

Status: Draft
Owner: wranngle
Last reviewed: 2026-04-30

## One-Line Product

A synthetic internal automation system that demonstrates ElevenLabs agent evals, GTM workflow routing, Python/SQL reconciliation, and operator review in one public-safe monorepo.

## Primary Users

- ElevenLabs hiring reviewers evaluating automation, internal tooling, and agent workflow judgment.
- Future agents implementing and validating the repo.
- Human operator reviewing synthetic GTM events.

## Core Workflows

1. Run synthetic ElevenLabs agent evals.
2. Replay a synthetic webhook.
3. Inspect lead and call outcomes in the ops console.
4. Run Python/SQL reconciliation over usage and revenue fixtures.
5. Generate an ops digest.

## Non-Goals

- No live production credentials.
- No real customer data.
- No private repo history.
- No live outbound calls or SMS.

