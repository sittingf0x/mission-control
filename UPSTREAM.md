# Upstream (Builderz) — optional

This codebase started from [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control) and has diverged significantly (OpenClaw integrations, Kanban, Linear, Skill Architect, company registry, etc.). **This fork is the product of record** — we do not merge upstream by default.

## Git remotes

| Remote     | URL                                      | Role                                      |
| ---------- | ---------------------------------------- | ----------------------------------------- |
| `origin`   | `github.com/sittingf0x/mission-control`  | Canonical repo — all day-to-day pushes.   |
| `upstream` | `github.com/builderz-labs/mission-control` | Optional — releases and security fixes. |

## When to look at upstream

- Periodically (e.g. quarterly) or when you hear about a security advisory:  
  `git fetch upstream` and review `upstream/main` tags / release notes.
- Cherry-pick or manually port only what you want; resolve conflicts against **your** `main`.

## What we do not do automatically

- No obligation to open PRs to Builderz.
- No automatic merges from upstream — review first.
