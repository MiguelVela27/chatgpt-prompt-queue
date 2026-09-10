# Release Process

## 1. Choose the version

Use Semantic Versioning:

- PATCH: bug fixes that preserve behavior.
- MINOR: backward-compatible new features.
- MAJOR: intentionally incompatible behavior or storage/API changes.

## 2. Update source metadata

Update both:

```javascript
// @version      X.Y.Z
```

and:

```javascript
const VERSION = 'X.Y.Z';
```

## 3. Update documentation

- Add the new version to `CHANGELOG.md`.
- Update the Current version section in `README.md`.
- Create or update release notes.
- Mention any storage migration or compatibility change prominently.

## 4. Validate syntax

```bash
node --check chatgpt-prompt-queue.user.js
```

## 5. Run manual regression tests

Complete [`MANUAL_TEST_CHECKLIST.md`](MANUAL_TEST_CHECKLIST.md), especially:

- Typing/focus isolation.
- Sequential execution.
- Completion detection.
- Pause.
- Stop.
- Persistence.
- Sound test.

## 6. Commit

Example:

```bash
git add .
git commit -m "Release v1.0.2"
git push
```

## 7. Tag

```bash
git tag -a v1.0.2 -m "ChatGPT Prompt Queue v1.0.2"
git push origin v1.0.2
```

## 8. Publish GitHub release

Use the version tag, release title, and release notes. Confirm the `.user.js` file on `main` contains the same version before publishing.
