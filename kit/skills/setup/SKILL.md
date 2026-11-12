---
name: setup
description: Set up horus-kit - check the bundled plugins, copy the notes-vault memory templates and offer to add the working rules to ~/.claude/CLAUDE.md. Runs only when the user types /horus-kit:setup.
disable-model-invocation: true
---

# horus-kit setup

Walk the user through these steps one at a time. Finish each step and wait for the user's answer before the next. Ask before every write. Never install plugins, change settings or delete anything yourself: print commands for the user to run.

Keep a running list of what you wrote, what you skipped and what the user still has to do; step 5 prints it.

## 1. Check the plugins

Run `claude plugin list` (read-only) and report, for each of `eyes-of-horus`, `savvy-flow` and `savvy-progress`, whether it is installed and enabled.

For each missing one, print the exact commands for the user to run in their own shell (do not run them):

```
claude plugin marketplace add https://github.com/JohnnyVizz/claude-kit.git
claude plugin install savvy-flow@claude-kit
claude plugin install savvy-progress@claude-kit
claude plugin install eyes-of-horus@eyes-of-horus
```

Print only the lines that are needed (the marketplace line only when savvy-flow or savvy-progress is missing and the `claude-kit` marketplace is not added yet).

## 2. Optional extras

Mention these extras, one line each, and say they are optional. Do not install them. If the user wants one, print the commands to add its marketplace and install it, for the user to run:

- ponytail (lazy senior dev mode): `claude plugin marketplace add DietrichGebert/ponytail`
- skins (transcript skins): `claude plugin marketplace add hellosverre/claude-skins`
- cache-tax (prompt-cache cost mod): `claude plugin marketplace add karanb192/claude-code-mods`
- gamedev (game development skills): `claude plugin marketplace add gamedev-skills/awesome-gamedev-agent-skills`

After adding a marketplace, the user runs `claude plugin install <plugin>@<marketplace>`; read the plugin and marketplace names from `claude plugin marketplace list` or the `/plugin` browser rather than guessing them.

## 3. Copy the notes vault

1. Ask where the notes folder should go: an Obsidian vault or any folder. Ask for an absolute path. Call it `<VAULT>`.
2. Ask what name the notes should use for the user. Call it `<USER>`.
3. List the files under `${CLAUDE_PLUGIN_ROOT}/templates/vault/` and show the user the target path of each one under `<VAULT>`.
4. For each file that already exists at the target, ask whether to overwrite, skip or show a diff first. Never overwrite without a yes. Default is skip.
5. After a yes for the whole list, copy each file, replacing every `<VAULT>` with the chosen folder and every `<USER>` with the given name. Keep the folder structure (`Agents/`, `Projects/_Template/`). Do not change anything else in the text.

## 4. Offer the global rules

1. Read `${CLAUDE_PLUGIN_ROOT}/templates/CLAUDE.md`, replace `<VAULT>` and `<USER>` as in step 3, and show the user the exact text you would add.
2. Ask whether to append it to `~/.claude/CLAUDE.md`. Only on a clear yes:
   - If the file is missing, create it with that text.
   - If it exists, append the text at the end after one blank line. Never delete, reorder or rewrite what is already there.
   - If it already contains a `# Rules for every session` heading, say so and ask again before appending a second copy.

## 5. Finish

Print three short lists:

- Written: every file created or changed, with its full path.
- Skipped: every file or step the user declined or that already existed.
- Still to do: the install commands from step 1 that are still needed, then `/reload-plugins`, then `/horus-doctor` to check the eyes-of-horus mod.
