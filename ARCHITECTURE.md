# Architecture

ChatGPT Prompt Queue is intentionally implemented as one self-contained userscript, but internally it is divided into clear responsibilities so changes to ChatGPT's DOM do not require rewriting the queue engine.

## High-level flow

```text
User adds prompts
      ↓
Queue state: pending
      ↓
Start
      ↓
ChatGPT Adapter writes + sends prompt
      ↓
Completion detector watches response
      ↓
Prompt state: done
      ↓
Pause/Stop gate
      ↓
Next pending prompt
      ↓
All done → visual + audio completion alert
```

## State model

Each queue item has one of four states:

```text
pending → running → done
              │
              └────→ error
```

A failed item becomes `error`. Starting the queue again converts previous errors back to `pending` so they can be retried.

Global execution state is represented separately:

- `running`
- `paused`
- `stopRequested`
- `currentId`
- `editingId`
- `draggedId`

This separation is important: an item's lifecycle is not the same thing as whether the queue engine is paused or stopping.

## ChatGPT Adapter

The adapter contains all behavior that depends directly on the ChatGPT UI:

- `findComposer()`
- `findSendButton()`
- `isGenerating()`
- `setPrompt()`
- `sendPrompt()`
- `getAssistantMessages()`
- `getLatestAssistantFingerprint()`
- `waitForCompletion()`

When ChatGPT changes its DOM, this is the first section to inspect.

### Composer detection

The script tries multiple selectors instead of relying on generated CSS class names. This makes it less sensitive to ordinary styling changes.

### Prompt insertion

Prompt insertion supports both a conventional `textarea` and ChatGPT's content-editable composer. It dispatches input/change events so the application reacts as if the user had entered text.

### Send detection

The adapter checks multiple current/fallback Send button selectors and validates that the candidate is usable before clicking it.

## Completion detection

A fixed timer is deliberately avoided.

`waitForCompletion()` combines several signals:

1. A new assistant message must appear after the prompt was sent.
2. The latest assistant message is fingerprinted from content length and its final text segment.
3. The fingerprint timestamp is updated whenever response content changes.
4. Known stop/generation indicators are checked.
5. Completion is accepted only after generation indicators disappear and the message has remained stable for a defined interval.

This layered detection is designed to reduce both false completion and unnecessarily long waits.

## Queue semantics

### Pause

Pause never stops the currently generating ChatGPT response. It blocks the transition from one completed queue item to the next.

### Stop

Stop sets `stopRequested = true`. If an answer is currently generating, Prompt Queue waits for it to finish, marks that item complete, then exits the loop while keeping remaining items pending.

This avoids leaving ChatGPT and Prompt Queue with conflicting ideas about whether a response completed.

## Persistence

State is serialized to browser `localStorage`.

During persistence, an item saved as `running` is normalized to `pending`. This means a page reload during execution does not permanently leave an item in an impossible running state.

The current storage key is:

```text
miguel_prompt_queue_v1
```

Any future incompatible storage-schema change should use an explicit migration or a new storage key.

## UI isolation

The panel is mounted inside a Shadow DOM root. This prevents most ChatGPT page styles from accidentally affecting Prompt Queue and vice versa.

Keyboard/input events in the queue textarea are additionally stopped from propagating across the shadow boundary. This fixes a real failure mode where ChatGPT's global keyboard handling could steal focus and redirect input to its own composer.

## Drag and drop

Queue reordering uses the browser's native drag-and-drop events. Reordering is disabled while execution is active so queue ordering cannot mutate underneath the currently running state machine.

## Audio

Completion audio uses the Web Audio API rather than an external sound file.

Because browsers enforce autoplay restrictions, the userscript attempts to unlock/resume the audio context during real user gestures and provides a manual sound-test button.

## Failure philosophy

Prompt Queue favors explicit failure over silent continuation.

If sending or completion detection throws:

- The current queue item becomes `error`.
- The queue stops.
- The panel reports the error.
- A later Start retries failed items.

This is safer than silently skipping a prompt in a dependent multi-step workflow.
