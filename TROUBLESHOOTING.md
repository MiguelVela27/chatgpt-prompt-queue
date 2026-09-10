# Troubleshooting

## The Prompt Queue panel does not appear

Check:

1. Tampermonkey is enabled.
2. The userscript itself is enabled.
3. You are on `https://chatgpt.com/`.
4. Reload the page after saving the userscript.
5. Open the browser console and look for `[Prompt Queue]` messages.

## A prompt is not sent

Possible causes:

- ChatGPT is already generating a response.
- ChatGPT changed the composer or Send button DOM.
- The Send button has not become active.
- The current page is in an unusual mode with a different composer implementation.

Open DevTools and inspect console messages beginning with `[Prompt Queue]`.

If ChatGPT recently changed its UI, inspect the functions in the **ChatGPT Adapter** section of the userscript first.

## The queue never advances after a response

Prompt Queue intentionally waits for both a new assistant message and a stable finished-response state.

If it waits forever after ChatGPT visibly finishes:

1. Check whether a stop/generation button is still present in the DOM.
2. Check console output.
3. Report the ChatGPT UI language and browser version.
4. Include non-sensitive reproduction prompts.

Do not solve this by replacing completion detection with a large fixed timeout; that would make the queue fragile for both short and long answers.

## Typing in Prompt Queue jumps to ChatGPT's input

This was fixed in v1.0.1 by isolating keyboard and input events inside the queue editor.

If it reappears:

- Confirm you are running v1.0.1 or newer.
- Check whether another extension is also applying global keyboard shortcuts.
- Report the browser and extensions involved.

## Completion sound does not play

1. Click **Test** in the sound row.
2. Raise Prompt Queue volume.
3. Make sure the ChatGPT browser tab is not muted.
4. Check system audio output and volume.
5. Click somewhere on the page and test again so the browser receives a user gesture.
6. Check whether the browser has suspended background-tab audio.

Prompt Queue uses Web Audio and therefore follows browser autoplay/audio restrictions.

## The panel is off-screen

The userscript clamps its stored position to the current viewport on resize/reload. If browser zoom or a major viewport change causes a problem, resize the browser window once or clear the stored state.

To completely reset Prompt Queue's local data from the page console:

```javascript
localStorage.removeItem('miguel_prompt_queue_v1');
location.reload();
```

This deletes the locally stored queue and UI preferences.

## Drag and drop does not work while running

This is intentional. Reordering is disabled during queue execution to keep the state machine deterministic.

Pause is not sufficient to enable editing/reordering; stop the queue first.

## A failed prompt shows an error state

Prompt Queue stops on the error instead of silently skipping it.

Fix the underlying problem and press **Start** again. Failed items are converted back to pending and retried while already completed prompts are preserved.

## Long answers time out

The current completion wait timeout is 10 minutes per response. If your workflow legitimately requires longer single responses, the timeout in `waitForCompletion()` can be increased.

Avoid reducing completion stability intervals unless you understand the risk of the next prompt being sent before the previous response is truly finished.
