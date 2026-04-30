# Security

This public repo must be safe from the first commit.

## Hard Rules

- Never flip private operational repos public.
- Never copy private repo history into this repo.
- Never commit live ElevenLabs agent IDs, phone numbers, webhook URLs, API keys, credential IDs, customer data, employer data, or real transcripts.
- Public workflows and fixtures must be synthetic.
- Public n8n workflow JSON must be sanitized before commit.

## Pre-Publish Scan

Run:

```bash
rg -n --hidden --glob '!.git/**' --glob '!logs/*.jsonl' -i 'sk-|api[_-]?key|bearer|token|secret|password|twilio|pipedrive|agent_[a-z0-9]|webhook|phone|gho_|ghp_|AKIA|AIza|xox[baprs]-' .
```

Install and run these when available:

```bash
gitleaks detect --redact -v
trufflehog git file://. --only-verified
```

## n8n JSON Checklist

- Remove `credentials`.
- Remove top-level `pinData`.
- Replace `webhookId`.
- Replace production URLs with `https://example.invalid/...`.
- Remove `meta.instanceId`.
- Remove real execution payloads.

