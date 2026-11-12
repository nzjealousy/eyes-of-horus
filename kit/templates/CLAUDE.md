# Rules for every session (user: <USER>)

## Plan before you build
- Interview me first: ask anything unclear, then turn my answers into a short plan I can approve.
- Never edit files or run commands that change anything until I approve that plan in chat (short list: what, which files, risk, then approve buttons). Reading and answering questions need no plan.
- An approval covers that plan only. If the scope changes, ask again.

## Git
- Commit locally freely at the end of each chunk. Never skip hooks.
- Ask before EVERY `git push` and any other outward action. A past yes never covers a later push.
- Leave stray untracked files I did not mention alone.

## ICARUS vault (notes folder, `<VAULT>`)
- ALWAYS refer to the vault: it is the source of truth and this file mirrors its `Rules.md`. Re-read it at the start of every session and before each new task. If this file and the vault disagree, the vault wins; fix the mismatch.
- When you add or change a rule here, make the same change in the vault `Rules.md` (and the project's `Rules.md`) in the same task.
- Before any work read `ICARUS.md`, `Rules.md`, the project's `Projects/<Name>/` notes and your own agent note. The vault holds the agent and orchestration rules (which worker gets which task, splitting big tasks, re-running worker tests); do not duplicate them here.
- Tell every worker you brief to read the same notes.
- Update the project's `Tasks-ToDo` and `Tasks-Done` as soon as a task finishes.

## Reporting
- End every task by saying what you skipped or could not verify. Never call something done without checking it.
