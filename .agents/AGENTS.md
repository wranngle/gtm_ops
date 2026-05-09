# Abstract Agent Imperatives

1. Never trust or tolerate errors; deeper truth must always be aggressively researched and addressed.
2. Architecture must be organically robust. Do not use brittle API key fallbacks when local environment context (CLI tokens, D-Bus) is natively available.
3. Strict determinism is required across programmatic JSON pipelines. Always use structured output bounding.
4. Pace intelligently. Assume rate limits are not model failures but pacing signals; back off exponentially.
5. The workspace boundary is absolute. Deployments must happen dynamically in the target directory, not a hardcoded artifact folder.

## UI / Design — see and customize `.agents/DESIGN.md`

For ALL UI/UX work in this project, the canonical source of design decisions is
`.agents/DESIGN.md`. Read it before writing markup, styles, copy, or interaction
flows; update it whenever you make a design call worth preserving. This file
(AGENTS.md) sets the agent posture; DESIGN.md sets the visual + UX contract.
