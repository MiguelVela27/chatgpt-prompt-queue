# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-09-10

### Fixed

- Isolated keyboard, composition, paste, cut, and input events inside the Prompt Queue editor so ChatGPT no longer steals focus after the first typed character.

### Changed

- Standardized the public userscript UI and messages in English while retaining multilingual DOM fallbacks for ChatGPT compatibility.

## [1.0.0] - 2026-09-10

### Added

- Sequential prompt queue execution.
- Automatic ChatGPT response-completion detection.
- Add, edit, duplicate, and delete prompt actions.
- Drag-and-drop prompt reordering.
- Movable floating panel with persistent position.
- Minimize/restore behavior.
- Persistent queue and UI state through `localStorage`.
- Pause/resume behavior that waits for the active response to finish.
- Safe stop behavior that preserves pending prompts.
- Retry of failed prompts.
- Progress tracking and per-prompt states.
- Completion sound with configurable volume and a manual sound test.
- Optional browser notification when permission is already granted.
- Shadow DOM encapsulation for UI styling and event isolation.
