# Manual Test Checklist

Use harmless test prompts when validating a release.

## Installation

- [ ] Userscript saves successfully in Tampermonkey.
- [ ] Reloading `chatgpt.com` shows the Prompt Queue panel.
- [ ] Browser console reports the expected Prompt Queue version.

## Input isolation

- [ ] Click the Prompt Queue textarea.
- [ ] Type a full sentence one character at a time.
- [ ] Focus remains in the Prompt Queue textarea.
- [ ] ChatGPT's main composer does not receive the typed characters.
- [ ] Ctrl/Cmd + Enter adds the prompt.

## Basic queue execution

Add:

```text
Reply only: TEST 1
Reply only: TEST 2
Reply only: TEST 3
```

Then verify:

- [ ] Start sends TEST 1.
- [ ] TEST 2 is not sent before response 1 completes.
- [ ] TEST 2 is sent automatically afterward.
- [ ] TEST 3 is sent automatically afterward.
- [ ] All three items become completed.
- [ ] Progress reaches 3/3.

## Queue management

- [ ] Add a prompt.
- [ ] Edit it.
- [ ] Duplicate it.
- [ ] Delete one copy.
- [ ] Reorder two prompts with drag and drop.
- [ ] Remove completed items.
- [ ] Reset statuses.
- [ ] Clear all.

## Pause

- [ ] Start a queue with at least three prompts.
- [ ] Click Pause while ChatGPT is answering.
- [ ] Current response is allowed to finish.
- [ ] Next prompt is not sent.
- [ ] Click Resume.
- [ ] Queue continues with the next pending prompt.

## Stop

- [ ] Start a queue with at least three prompts.
- [ ] Click Stop during a response.
- [ ] Current response finishes normally.
- [ ] No additional prompt is sent.
- [ ] Remaining prompts stay pending.

## Persistence

- [ ] Add multiple prompts.
- [ ] Move the panel.
- [ ] Minimize or restore the panel.
- [ ] Adjust sound preference/volume.
- [ ] Reload the page.
- [ ] Queue contents and expected UI preferences are restored.

## Audio

- [ ] Click Test and hear the completion sound.
- [ ] Adjust volume and verify the change.
- [ ] Complete a real test queue and hear the final alert.

## Error behavior

- [ ] If practical, simulate/send in a state that triggers an adapter error.
- [ ] Current item becomes error.
- [ ] Queue stops instead of skipping silently.
- [ ] Starting again retries failed items.

## Regression acceptance

A release should not be tagged if any of these core tests fail:

- Input isolation.
- Sequential sending.
- Completion detection.
- Pause safety.
- Stop safety.
- Persistence.
