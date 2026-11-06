# Eyes of Horus

A Claude Code mod that restyles the desktop app and the terminal in gold and obsidian black, with purple and aqua accents.

- **Eye and orb:** an ASCII Eye of Horus sits centred under the latest reply. It looks around, follows the pointer while it is over the eye, and blinks. With voice-over on, an orb with subtitles reads replies aloud.
- **Dashboard above the prompt:** ponytail level buttons, a context bar, cost, token, agent-time and turn counts, the savvy-flow progress bar, and a heartbeat trace that speeds up while Claude works.
- **Gods pane:** a card for each savvy-flow agent, drawn as an Egyptian god by tier (Ra, Anubis, Horus, Thoth, Bastet), plus a foldable timeline of the session.

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
- `/horus-eye` reports what the eye is doing and the last drawing fault, if any.

## Limits

- The desktop sidebar can only be tinted, and the prompt box itself cannot be replaced.
- The eye follows the pointer only while the pointer is over it.
- Voice-over uses the system speech synthesizer; where none is available it shows subtitles only.
- The dashboard works best with the ponytail and savvy-flow plugins installed.
