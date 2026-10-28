# Contributing

Thanks for your interest in vanilla-yamleditor!

## Reporting bugs

Open an issue on [GitHub](https://github.com/quazardous/vanilla-yamleditor/issues) with:

- What you tried to do.
- What you expected to happen.
- What actually happened (paste error messages / unexpected output).
- Your environment (browser and version, Node version if the bug is in the build or tests, package version).

A short YAML snippet that reproduces the problem is worth pages of prose. For tree-mode edits, give the
YAML before the edit, the edit, and the text you expected after it.

## Getting help

For usage questions, open an issue on [GitHub](https://github.com/quazardous/vanilla-yamleditor/issues)
and tag it `question`.

## Development

```sh
npm install          # also builds dist/
npm run dev          # the playground (demo/) with live reload
npm test             # vitest (jsdom)
npm run type-check   # tsc --noEmit
npm run build        # vite build + type declarations
```

Node 18 or newer.

## Sending a pull request

1. Fork and branch off `main` (one feature per branch).
2. Make the change. Keep diffs focused: small PRs review fast.
3. Add or update tests as needed; `npm test` and `npm run type-check` must stay green.
4. Add a changeset if the change affects users of the package: run `npx changeset`, pick the bump
   (patch / minor / major) and write a one-line summary. It becomes the `CHANGELOG.md` entry at release.
5. Open the PR. Describe the **what** and the **why**; mechanical diff details belong in the commit
   messages, not the PR body.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `ci:`, `docs:`,
`test:`, `refactor:`. Keep the subject line ≤ 72 chars, in English, followed by a blank line and a body
that explains the why when it isn't obvious.

## Code of conduct

Be kind and assume good faith.
