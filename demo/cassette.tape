# demo/cassette.tape — VHS recording script (https://github.com/charmbracelet/vhs)
#
# Render with: scripts/hero.sh demo/cassette.tape
# Output: demo/cassette.gif (raw), demo/hero.gif + demo/hero.webp (web-optimized).
#
# This cassette demonstrates the *real* baseline validation loop a human or agent
# runs locally before opening a PR: structural validators + Symphony dry-run.
# Keep it short — under ~15 seconds rendered — so the README hero stays small.

Output demo/cassette.gif

Set FontSize 16
Set Width 1200
Set Height 720
Set Padding 20
Set Theme "Catppuccin Frappe"
Set TypingSpeed 40ms

# Step 1: structural / placeholder / layered-architecture validators.
Type "scripts/validate-knowledge-base.sh"
Enter
Sleep 4s

# Step 2: Symphony dry-run — proves the orchestrator can render a prompt
# for an active issue without dispatching a real agent.
Type "scripts/symphony.sh once --dry-run --limit 1"
Enter
Sleep 4s

# Step 3: list candidate work so the viewer sees the local-markdown tracker.
Type "scripts/symphony.sh list"
Enter
Sleep 3s
