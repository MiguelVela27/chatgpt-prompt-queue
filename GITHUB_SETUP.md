# GitHub Publishing Setup

This file contains the exact repository metadata and publishing steps for the first public release.

## Repository fields

**Repository name**

```text
chatgpt-prompt-queue
```

**Description**

```text
A lightweight Tampermonkey userscript that queues and runs ChatGPT prompts sequentially with pause/resume, drag-and-drop, persistence, and completion alerts.
```

**Visibility**

```text
Public
```

**Initialize repository with README / .gitignore / license**

```text
No
```

The prepared project already contains all three.

## Suggested GitHub topics

Add these under **About → Topics**:

```text
chatgpt
tampermonkey
userscript
automation
prompt-engineering
productivity
javascript
browser-automation
queue
openai
```

## Suggested About section

**Website:** leave empty for the first release unless you later publish a project page.

Enable:

- Releases
- Issues

Recommended later:

- Discussions, if people start using the project.
- Private vulnerability reporting.

## Uploading through the GitHub website

1. Create a new GitHub repository named `chatgpt-prompt-queue`.
2. Do **not** initialize it with another README, license, or `.gitignore`.
3. Open the new empty repository.
4. Choose **Add file → Upload files**.
5. Upload the entire contents of this project directory, preserving `.github/` and `docs/`.
6. Commit with:

```text
Initial release: ChatGPT Prompt Queue v1.0.1
```

## Uploading with Git

From inside the project directory:

```bash
git init
git add .
git commit -m "Initial release: ChatGPT Prompt Queue v1.0.1"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/chatgpt-prompt-queue.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` once with your actual GitHub username.

## First release

After the files are on `main`:

1. Open **Releases**.
2. Choose **Draft a new release**.
3. Create tag:

```text
v1.0.1
```

4. Release title:

```text
ChatGPT Prompt Queue v1.0.1
```

5. Paste the contents of `RELEASE_NOTES_v1.0.1.md` into the release description.
6. Publish the release.

## Recommended repository settings

Under **Settings → General**:

- Keep Issues enabled.
- Keep Releases enabled.
- Disable Wikis unless you intend to maintain one; the `docs/` directory is enough for now.

Under **Settings → Actions → General**:

- Allow GitHub Actions so the syntax-check workflow can run.

Under **Settings → Security → Code security and analysis**:

- Enable Private vulnerability reporting if available.

## After publishing

Update the raw install URL in the README by replacing:

```text
YOUR_GITHUB_USERNAME
```

with your real username.

Optionally add a screenshot at:

```text
assets/prompt-queue.png
```

Then uncomment/add the README image line described in the Screenshot section.
