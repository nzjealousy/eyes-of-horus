# Eyes of Horus

A Claude Code mod that restyles the desktop app and the terminal in gold and obsidian black, with purple and aqua accents.

- **Eye and orb:** an ASCII Eye of Horus sits centred under the latest reply. It looks around, follows the pointer while it is over the eye, and blinks. With voice-over on, an orb with subtitles reads replies aloud.
- **Dashboard above the prompt:** ponytail level buttons, a context bar, cost, token, agent-time and turn counts, the savvy-flow progress bar, and a heartbeat trace that speeds up while Claude works.
- **Gods pane:** a card for each savvy-flow agent, drawn as an Egyptian god by tier (Ra, Anubis, Horus, Thoth, Bastet), plus a foldable timeline of the session. The Running and Finished groups fold on their own. `/clear` empties the timeline, the cards, the progress bar and the cost, token, time and turn counts.
- **The Temple:** a second pane, opened with `/temple` or the ↗ on a Gods card. Idle gods and workers stand together in a columned hall, and an agent that just finished celebrates there for a few seconds. Each working agent gets its own chamber: its animated figure, progress bar, running clock, token count and the last few things it did. The ↗ on a chamber (or on a Gods card) fills the pane with that one agent and its longer action list, with Back, Transcript (the full conversation; terminal only, as the desktop app has no main view to open) and a two-click Stop.
- **Hall of Truth:** the session log in the Gods pane, grouped by turn. A Now line says what runs at the moment, filter chips show All, Main, Agents or Tools, and each turn header shows how long the turn took. Every entry of the log (its newest 400) is listed; scroll the pane to see older ones. A Stop turn button on the Now line and a Stop button on each running agent's row each need two clicks: the first turns the button into Sure?, the second stops it, and the button resets after 3 seconds.
- **Agent rows open the Temple:** clicking an agent's row (or one of its tool rows) in the Hall of Truth opens that agent's chamber, as the ↗ on its card does.
- **Finish toasts:** when an agent finishes or fails, a short in-app toast says so (`Horus: <task> finished` or `failed`).
- **Agent reports:** a finished or failed agent's focus view shows the start of its final report under its title, cleaned of control characters and credentials.
- **Figures out of step:** the hall's members and the chambers' figures each move in their own rhythm instead of all at once.
- **Log after resume:** the Hall of Truth log (its newest 400 entries) is saved per session and comes back when you resume that session with `claude --resume`; `/reload-plugins` already kept it.

## Install

At the prompt of a terminal session:

```
/plugin install eyes-of-horus --marketplace nzjealousy/eyes-of-horus
```

From a shell:

```
claude plugin install eyes-of-horus --marketplace nzjealousy/eyes-of-horus
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `nzjealousy/eyes-of-horus`, then Add plugin.

## Commands

- `/voiceover [on|off|test]` turns voice-over on or off, or speaks one test line.
- `/temple` opens the Temple pane.
- `/horus-eye` reports what the eye is doing and the last drawing fault, if any.
- `/horus-motion [on|off]` turns the mod's animations on or off (no argument toggles). They are on by default and ignore the system's reduced-motion setting.
- `/horus-doctor` reports, one line each, what works in this session: surfaces, panes, the ponytail flag, whether motion is on, stored counts, and whether a plugin can call TaskStop (a harmless probe on a fake id).

## What it changes

- Every savvy-flow agent (`savvy-*`) gets a short "terse answers" line prepended to its prompt. Other agents' prompts are left alone.
- The session log shows tool names and descriptions only for shell tools, with control characters and credentials (`token=`, `Bearer ...`, `user:pass@`) masked.
- The mod only reads the ponytail flag file in your Claude config folder; it makes no network calls and runs no shell commands.

## Limits

- The desktop sidebar can only be tinted, and the prompt box itself cannot be replaced.
- The eye follows the pointer only while the pointer is over it.
- Voice-over uses the system speech synthesizer; where none is available it shows subtitles only.
- The dashboard works best with the ponytail and savvy-flow plugins installed.
