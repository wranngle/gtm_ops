# OTP-27 vs OTP-28 toolchain pin

Status: Investigated 2026-05-02
Owner: wranngle
Follows: `symphony-upstream-drift.md` "Next pass" item #7

## Question

Upstream Symphony (`elixir/mise.toml`) pins `erlang = "28"` and
`elixir = "1.19.5-otp-28"`. Our repo-root `.mise.toml` pins
`erlang = "27"` and `elixir = "1.19.5-otp-27"`. Is the OTP-27 pin
intentional (some incompatibility we discovered) or stale (set
once, never updated)?

## Answer

**Stale.** No evidence the pin is load-bearing.

Provenance: the `.mise.toml` was first committed on 2026-05-01 in
`e4f073c "feat: install Elixir+Erlang via mise; agent runner
protocol (TD-007 T-1, T-6)"`. The commit message is about
introducing mise + the agent-runner protocol; the OTP-27 choice is
not discussed. At that time OTP-27 was the LTS and OTP-28 was
freshly released; pinning the LTS was the safer default, not a
deliberate compatibility decision.

Spot checks for OTP-28-specific incompatibilities:

  - **Direct deps in `mix.exs`** (`req`, `jason`, `solid`,
    `yaml_elixir`, `phoenix`, `phoenix_live_view`, `bandit`,
    `plug`, `telemetry`, `dialyxir`, `ex_doc`) — none have known
    OTP-28 incompatibilities at the versions we use.
  - **Transitive deps in `mix.lock`** — diff against upstream's
    `mix.lock` is minor patch bumps (bandit 1.10.3 → 1.11.0,
    credo 1.7.16 → 1.7.18, phoenix 1.8.4 → 1.8.5,
    phoenix_live_view 1.1.25 → 1.1.28, fine 0.1.4 → 0.1.6,
    floki 0.38.0 → 0.38.1, lazy_html 0.1.10 → 0.1.11). All are
    patch-level upgrades; none cross an OTP-major boundary.
  - **Codebase grep** for `:erlang` calls, NIFs, or `port/1`
    patterns that depend on OTP-internal behaviour — nothing
    that would behave differently across OTP-27 ↔ OTP-28.

## Recommendation

Bump to `erlang = "28"` and `elixir = "1.19.5-otp-28"` in a
deliberate, separate PR. The bump touches:

  1. `.mise.toml` at the repo root.
  2. CI configuration (`.github/workflows/*.yml` if any pin
     toolchain versions).
  3. Local dev environments — every operator must re-run
     `mise install` after the change.
  4. `_build/` and `deps/` get rebuilt; `mix.lock` may shift.

Risk is low (no evidence of breakage) but non-zero (every
dev rebuilds, CI runs the suite on the new toolchain). The
upside is one fewer drift item against upstream, plus
access to OTP-28's improvements (notably `:json` stdlib,
`zstd` compression, faster `Process.info/2`).

This is the kind of change that should not be done
autonomously — operators need to know to re-run `mise
install` before their next `mix` invocation.

## Decision

Pin stays at OTP-27 until someone explicitly approves the
bump. If approved, the bump itself is a 4-line change to
`.mise.toml` plus CI config; the rest is deps churn that
`mix deps.get` handles.
