# horus-kit

One install for the whole workflow:

- **eyes-of-horus**: the Claude Code restyle mod (this repo).
- **savvy-flow** and **savvy-progress** (from the `claude-kit` marketplace): the orchestrator with light/medium/careful/heavy/fable workers, and their progress bars.
- **/horus-kit:setup**: checks those plugins, copies a notes-vault memory (ICARUS index, global rules, agent notes, a project template) into a folder you pick, and offers to append the matching rules to `~/.claude/CLAUDE.md`. It asks before every write and never installs anything itself.

## Install

```
claude plugin marketplace add https://github.com/JohnnyVizz/claude-kit.git
claude plugin marketplace add nzjealousy/eyes-of-horus
claude plugin install horus-kit@eyes-of-horus
```

Add `claude-kit` first: the kit's savvy-flow and savvy-progress dependencies come from that marketplace. Then run `/reload-plugins` and `/horus-kit:setup`.

Optional extras the setup mentions but does not install: ponytail, skins, cache-tax, gamedev.
