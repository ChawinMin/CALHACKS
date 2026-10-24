# Contributing

## Branches
- `main` is always demo-ready. Do not commit to it directly.
- Branch names: `task<N>/<short-description>` (e.g. `task3/speech-to-text`) or `fix/<thing>`.

## Commits
Short, imperative: `Add MediaPipe hand tracking`. Commit small and often.

## Pull requests
1. Push your branch and open a PR using the template.
2. Link the task (`Task N`) and any Issue.
3. Get 1 teammate review. Changes to `protocols/` need a reviewer to confirm the medical content.
4. Squash-merge, delete the branch, tick the box in `docs/TASKS.md`.

## Code
- Python 3.10+; add dependencies to `requirements.txt` in your PR.
- Keep secrets (API keys) in `.env`; never commit them.
- Each module exposes a small, documented interface (see `docs/WORKFLOW.md`).
