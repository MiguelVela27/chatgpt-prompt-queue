# Contributing

Thanks for considering a contribution to ChatGPT Prompt Queue.

## Before opening an issue

Please check the existing issues first. Because the project depends on ChatGPT's web DOM, a UI change can cause many users to observe the same breakage at once.

When reporting a bug, include:

- Browser name and version.
- Tampermonkey version.
- Operating system.
- ChatGPT interface language.
- Prompt Queue version.
- Reproduction steps.
- Expected behavior.
- Actual behavior.
- Relevant console messages prefixed with `[Prompt Queue]`.

Do not include account cookies, authentication tokens, private conversations, personal information, or sensitive prompt content.

## Development principles

Please preserve these design choices unless there is a strong reason to change them:

1. **No fixed delays for response completion.** Completion should be inferred from actual ChatGPT UI state/content stability.
2. **Keep the ChatGPT Adapter isolated.** DOM-specific selectors and behavior should stay separate from queue logic.
3. **Pause and Stop must be safe.** They should not cut off the currently generating ChatGPT response.
4. **No remote dependencies.** The userscript should remain self-contained whenever practical.
5. **No unnecessary permissions.** Keep `@grant none` unless a feature genuinely requires otherwise.
6. **Local-first privacy.** Do not add analytics, telemetry, or remote prompt storage.
7. **Fail visibly.** Errors should be reflected in queue state and console output rather than silently skipping prompts.

## Making a change

1. Fork the repository.
2. Create a branch:

```bash
git checkout -b fix/descriptive-name
```

3. Edit `chatgpt-prompt-queue.user.js`.
4. Update the version number if appropriate.
5. Run the syntax check:

```bash
node --check chatgpt-prompt-queue.user.js
```

6. Run the manual regression checklist in [`docs/MANUAL_TEST_CHECKLIST.md`](docs/MANUAL_TEST_CHECKLIST.md).
7. Update `CHANGELOG.md` for user-visible changes.
8. Commit with a descriptive message.
9. Open a pull request using the repository template.

## Style

- Plain modern JavaScript; no framework or build system unless clearly justified.
- Prefer small, named functions over large anonymous blocks.
- Keep comments focused on non-obvious behavior and browser/DOM constraints.
- Use English for public UI, documentation, source comments, and log messages.
- Keep multilingual selectors when they improve compatibility with ChatGPT accessibility labels.

## Pull requests

A good pull request explains:

- What problem it solves.
- Why the chosen implementation is appropriate.
- What parts of the queue state machine or ChatGPT DOM it affects.
- How it was manually tested.
- Whether persistence behavior or stored data format changed.
