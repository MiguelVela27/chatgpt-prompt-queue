# ChatGPT Prompt Queue v1.0.1

First stable public release of **ChatGPT Prompt Queue**, a self-contained Tampermonkey userscript for running multi-step prompt workflows directly in the ChatGPT web interface.

## Highlights

- Queue any number of prompts and run them sequentially.
- Automatically waits for each ChatGPT response to finish before sending the next prompt.
- Add, edit, duplicate, delete, and drag-and-drop reorder prompts.
- Pause/resume without interrupting the current response.
- Safely stop after the active response finishes.
- Persistent queue, prompt status, panel position, minimized state, and sound settings.
- Movable and minimizable floating interface.
- Progress tracking with pending/running/completed/error states.
- Configurable completion sound with manual test button.
- Optional desktop notification if browser permission is already granted.
- Fully self-contained: no dependencies, analytics, trackers, or external API calls.

## v1.0.1 fix

This release includes a keyboard-event isolation fix for the queue editor. Typing inside Prompt Queue no longer allows ChatGPT's global keyboard handling to steal focus and redirect input to the main ChatGPT composer.

## Installation

Install Tampermonkey, create a new userscript, and paste the contents of `chatgpt-prompt-queue.user.js`, or open the raw `.user.js` file from GitHub after publishing the repository.

## Important note

This project automates the ChatGPT web UI and is not affiliated with OpenAI. Changes to the ChatGPT DOM may occasionally require updates to the adapter selectors.
