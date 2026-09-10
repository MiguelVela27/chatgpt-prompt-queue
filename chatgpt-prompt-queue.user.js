// ==UserScript==
// @name         ChatGPT Prompt Queue
// @namespace    miguel.promptqueue
// @version      1.0.1
// @description  Robust prompt queue for ChatGPT with editing, reordering, pause/resume, persistence, movable UI, and completion alerts.
// @match        https://chatgpt.com/*
// @match        https://www.chatgpt.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const VERSION = '1.0.1';
    const STORAGE_KEY = 'miguel_prompt_queue_v1';

    const DEFAULTS = {
        queue: [],
        ui: {
            left: null,
            top: null,
            minimized: false
        },
        sound: {
            enabled: true,
            volume: 0.80
        }
    };

    const state = {
        queue: [],
        running: false,
        paused: false,
        stopRequested: false,
        currentId: null,
        editingId: null,
        draggedId: null
    };

    const settings = structuredCloneSafe(DEFAULTS);
    const audio = {
        context: null
    };

    let host = null;
    let root = null;

    // =========================================================
    // UTILITIES
    // =========================================================

    function structuredCloneSafe(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function uid() {
        if (crypto?.randomUUID) return crypto.randomUUID();
        return `pq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function $(selector) {
        return root?.querySelector(selector) ?? null;
    }

    function $$(selector) {
        return root ? [...root.querySelectorAll(selector)] : [];
    }

    // =========================================================
    // PERSISTENCE
    // =========================================================

    function loadPersistentState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;

            const saved = JSON.parse(raw);

            if (Array.isArray(saved.queue)) {
                state.queue = saved.queue
                    .filter(item => item && typeof item.text === 'string')
                    .map(item => ({
                        id: typeof item.id === 'string' ? item.id : uid(),
                        text: item.text,
                        status: ['pending', 'done', 'error'].includes(item.status)
                            ? item.status
                            : 'pending'
                    }));
            }

            if (saved.ui) {
                if (Number.isFinite(saved.ui.left)) settings.ui.left = saved.ui.left;
                if (Number.isFinite(saved.ui.top)) settings.ui.top = saved.ui.top;
                settings.ui.minimized = Boolean(saved.ui.minimized);
            }

            if (saved.sound) {
                settings.sound.enabled = saved.sound.enabled !== false;
                if (Number.isFinite(saved.sound.volume)) {
                    settings.sound.volume = clamp(saved.sound.volume, 0, 1);
                }
            }
        } catch (error) {
            console.warn('[Prompt Queue] Could not load saved state.', error);
        }
    }

    function savePersistentState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                queue: state.queue.map(item => ({
                    id: item.id,
                    text: item.text,
                    status: item.status === 'running' ? 'pending' : item.status
                })),
                ui: settings.ui,
                sound: settings.sound
            }));
        } catch (error) {
            console.warn('[Prompt Queue] Could not save state.', error);
        }
    }

    // =========================================================
    // ROBUST AUDIO
    // =========================================================

    async function ensureAudioContext() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return false;

            if (!audio.context || audio.context.state === 'closed') {
                audio.context = new AudioContextClass();
            }

            if (audio.context.state !== 'running') {
                await audio.context.resume();
            }

            // Nearly inaudible pulse to make sure the audio context is truly unlocked.
            if (audio.context.state === 'running') {
                const osc = audio.context.createOscillator();
                const gain = audio.context.createGain();
                gain.gain.value = 0.00001;
                osc.connect(gain);
                gain.connect(audio.context.destination);
                osc.start();
                osc.stop(audio.context.currentTime + 0.02);
                return true;
            }
        } catch (error) {
            console.warn('[Prompt Queue] Could not enable Web Audio.', error);
        }

        return false;
    }

    function resumeAudioOnUserGesture() {
        if (audio.context && audio.context.state !== 'running') {
            audio.context.resume().catch(() => {});
        }
    }

    ['pointerdown', 'keydown', 'touchend'].forEach(eventName => {
        window.addEventListener(eventName, resumeAudioOnUserGesture, true);
    });

    function scheduleTone(frequency, delay, duration, strength = 1) {
        if (!audio.context || audio.context.state !== 'running') return;

        const ctx = audio.context;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const start = ctx.currentTime + delay;
        const end = start + duration;
        const level = Math.max(0.0001, 0.16 * settings.sound.volume * strength);

        osc.type = 'square';
        osc.frequency.setValueAtTime(frequency, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(level, start + 0.015);
        gain.gain.setValueAtTime(level, Math.max(start + 0.02, end - 0.06));
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        osc.stop(end + 0.02);
    }

    async function playCompletionSound(isTest = false) {
        if (!settings.sound.enabled && !isTest) return false;

        const ready = await ensureAudioContext();
        if (!ready || !audio.context || audio.context.state !== 'running') {
            console.warn('[Prompt Queue] Audio was blocked by the browser or operating system.');
            return false;
        }

        // Three ascending tones designed to stand out over background music.
        scheduleTone(740, 0.00, 0.18, 0.95);
        scheduleTone(988, 0.24, 0.22, 1.05);
        scheduleTone(1319, 0.52, 0.42, 1.15);

        return true;
    }

    // =========================================================
    // CHATGPT ADAPTER
    // =========================================================

    function findComposer() {
        return (
            document.querySelector('#prompt-textarea[contenteditable="true"]') ||
            document.querySelector('#prompt-textarea[contenteditable="plaintext-only"]') ||
            document.querySelector('#prompt-textarea') ||
            document.querySelector('textarea[name="prompt-textarea"]')
        );
    }

    function elementIsUsable(element) {
        if (!element) return false;
        if (element.disabled) return false;
        if (element.getAttribute('aria-disabled') === 'true') return false;
        return true;
    }

    function findSendButton() {
        const candidates = [
            document.querySelector('button[data-testid="send-button"]'),
            document.querySelector('#composer-submit-button'),
            document.querySelector('form button[aria-label="Send prompt"]'),
            document.querySelector('form button[aria-label="Enviar mensaje"]')
        ];

        return candidates.find(elementIsUsable) || null;
    }

    function isGenerating() {
        const selectors = [
            'button[data-testid="stop-button"]',
            '#composer-submit-button[data-testid="stop-button"]',
            'button[aria-label="Stop streaming"]',
            'button[aria-label="Stop generating"]',
            'button[aria-label="Stop"]',
            'button[aria-label="Detener generación"]',
            'button[aria-label="Detener"]'
        ];

        return selectors.some(selector => {
            const el = document.querySelector(selector);
            return Boolean(el && el.getClientRects().length);
        });
    }

    function getAssistantMessages() {
        return [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    }

    function getAssistantMessageCount() {
        return getAssistantMessages().length;
    }

    function getLatestAssistantFingerprint() {
        const messages = getAssistantMessages();
        const last = messages[messages.length - 1];
        if (!last) return '';

        const text = (last.innerText || last.textContent || '').trim();
        return `${text.length}:${text.slice(-240)}`;
    }

    function setPrompt(text) {
        const composer = findComposer();
        if (!composer) {
            throw new Error('Could not find the ChatGPT composer.');
        }

        composer.focus();

        if (composer.tagName === 'TEXTAREA') {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLTextAreaElement.prototype,
                'value'
            )?.set;

            if (!setter) throw new Error('Could not write to the ChatGPT textarea.');

            setter.call(composer, text);
            composer.dispatchEvent(new Event('input', { bubbles: true }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);

        let success = false;
        try {
            success = document.execCommand('insertText', false, text);
        } catch {
            success = false;
        }

        if (!success || !(composer.innerText || composer.textContent || '').trim()) {
            composer.textContent = text;
            composer.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: text
            }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    async function waitForSendButton(timeout = 10000) {
        const started = Date.now();

        while (Date.now() - started < timeout) {
            const button = findSendButton();
            if (button) return button;
            await sleep(100);
        }

        throw new Error('The Send button did not become available.');
    }

    async function sendPrompt(text) {
        const previousAssistantCount = getAssistantMessageCount();

        setPrompt(text);
        const button = await waitForSendButton();
        button.click();

        console.log('[Prompt Queue] Prompt sent:', text);
        return previousAssistantCount;
    }

    async function waitForCompletion(previousAssistantCount, timeout = 600000) {
        const started = Date.now();
        let assistantSeen = false;
        let lastFingerprint = '';
        let lastChangeAt = Date.now();

        while (Date.now() - started < timeout) {
            const count = getAssistantMessageCount();

            if (count > previousAssistantCount) {
                assistantSeen = true;

                const fingerprint = getLatestAssistantFingerprint();
                if (fingerprint !== lastFingerprint) {
                    lastFingerprint = fingerprint;
                    lastChangeAt = Date.now();
                }
            }

            // Two completion guards: no known generation indicator is visible and
            // the latest assistant message has remained stable for a reasonable interval.
            if (
                assistantSeen &&
                !isGenerating() &&
                Date.now() - lastChangeAt >= 1600
            ) {
                console.log('[Prompt Queue] Response completed ✓');
                return;
            }

            await sleep(120);
        }

        throw new Error('Timed out while waiting for ChatGPT to finish the response.');
    }

    // =========================================================
    // QUEUE MANAGEMENT
    // =========================================================

    function addPrompt(text) {
        const clean = text.trim();
        if (!clean) return;

        state.queue.push({
            id: uid(),
            text: clean,
            status: 'pending'
        });

        savePersistentState();
        render();
    }

    function beginEdit(id) {
        if (state.running) return;

        const item = state.queue.find(entry => entry.id === id);
        if (!item) return;

        state.editingId = id;
        const input = $('#pq-input');
        input.value = item.text;
        input.focus();
        $('#pq-add').textContent = 'Save changes';
        $('#pq-cancel-edit').hidden = false;
        setStatus('Editing prompt. Press Ctrl/Cmd + Enter to save.');
    }

    function cancelEdit() {
        state.editingId = null;
        const input = $('#pq-input');
        if (input) input.value = '';
        const add = $('#pq-add');
        if (add) add.textContent = '+ Add';
        const cancel = $('#pq-cancel-edit');
        if (cancel) cancel.hidden = true;
        setStatus('Ready.');
    }

    function addOrSavePrompt() {
        const input = $('#pq-input');
        if (!input) return;

        const clean = input.value.trim();
        if (!clean) return;

        if (state.editingId) {
            const item = state.queue.find(entry => entry.id === state.editingId);
            if (item) {
                item.text = clean;
                item.status = 'pending';
            }
            cancelEdit();
        } else {
            addPrompt(clean);
            input.value = '';
            input.focus();
        }

        savePersistentState();
        render();
    }

    function removePrompt(id) {
        if (state.running) return;
        state.queue = state.queue.filter(item => item.id !== id);
        if (state.editingId === id) cancelEdit();
        savePersistentState();
        render();
    }

    function duplicatePrompt(id) {
        if (state.running) return;

        const index = state.queue.findIndex(item => item.id === id);
        if (index < 0) return;

        const source = state.queue[index];
        state.queue.splice(index + 1, 0, {
            id: uid(),
            text: source.text,
            status: 'pending'
        });

        savePersistentState();
        render();
    }

    function resetStatuses() {
        if (state.running) return;
        state.queue.forEach(item => item.status = 'pending');
        savePersistentState();
        render();
        setStatus('All prompts were reset to pending.');
    }

    function clearQueue() {
        if (state.running) return;

        state.queue = [];
        state.currentId = null;
        cancelEdit();
        savePersistentState();
        render();
        setStatus('Queue is empty.');
    }

    function clearCompleted() {
        if (state.running) return;
        state.queue = state.queue.filter(item => item.status !== 'done');
        savePersistentState();
        render();
        setStatus('Completed prompts removed.');
    }

    function togglePause() {
        if (!state.running) return;

        state.paused = !state.paused;

        if (state.paused) {
            setStatus(
                isGenerating()
                    ? '⏸ Pause requested: the current response will finish, then the queue will pause before the next prompt.'
                    : '⏸ Queue paused.'
            );
        } else {
            setStatus('▶ Queue resumed.');
        }

        renderControls();
    }

    function requestStop() {
        if (!state.running) return;

        state.stopRequested = true;
        state.paused = false;

        setStatus(
            isGenerating()
                ? '■ Stop requested: the current response will finish and no more prompts will be sent.'
                : '■ Stopping the queue…'
        );

        renderControls();
    }

    async function waitWhilePaused() {
        while (state.paused && !state.stopRequested) {
            await sleep(150);
        }
    }

    async function runQueue() {
        if (state.running) return;
        if (!state.queue.length) {
            setStatus('The queue is empty.');
            return;
        }

        if (isGenerating()) {
            setStatus('ChatGPT is already generating a response. Wait for it to finish before starting the queue.');
            return;
        }

        // If everything is already complete, Start behaves as Run again.
        if (!state.queue.some(item => item.status === 'pending' || item.status === 'error')) {
            state.queue.forEach(item => item.status = 'pending');
        }

        // A previously failed prompt is retried when Start is pressed.
        state.queue.forEach(item => {
            if (item.status === 'error') item.status = 'pending';
        });

        state.running = true;
        state.paused = false;
        state.stopRequested = false;
        state.currentId = null;

        savePersistentState();
        render();

        try {
            while (true) {
                await waitWhilePaused();
                if (state.stopRequested) break;

                const item = state.queue.find(entry => entry.status === 'pending');
                if (!item) break;

                state.currentId = item.id;
                item.status = 'running';
                savePersistentState();
                render();

                const index = state.queue.findIndex(entry => entry.id === item.id);
                setStatus(`Running ${index + 1}/${state.queue.length}…`);

                const previousCount = await sendPrompt(item.text);
                setStatus(`Waiting for response ${index + 1}/${state.queue.length}…`);

                await waitForCompletion(previousCount);

                item.status = 'done';
                state.currentId = null;
                savePersistentState();
                render();

                if (state.stopRequested) break;

                await waitWhilePaused();
                if (state.stopRequested) break;

                // Small buffer so the composer and DOM can settle.
                await sleep(550);
            }

            if (state.stopRequested) {
                setStatus('■ Queue stopped. Pending prompts were kept.');
            } else {
                const remaining = state.queue.some(item => item.status === 'pending' || item.status === 'error');

                if (!remaining) {
                    const total = state.queue.length;
                    setStatus(`✓ Queue complete: ${total}/${total}`);
                    flashCompletion();

                    const sounded = await playCompletionSound(false);
                    if (!sounded && settings.sound.enabled) {
                        setStatus(`✓ Queue complete: ${total}/${total} · Audio blocked; use “Test sound”.`);
                    }

                    if (Notification.permission === 'granted') {
                        try {
                            new Notification('Prompt Queue complete', {
                                body: `${total} prompt${total === 1 ? '' : 's'} completed.`
                            });
                        } catch {
                            // Optional notification: failure here never blocks the queue.
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Prompt Queue]', error);

            const current = state.queue.find(item => item.id === state.currentId);
            if (current) current.status = 'error';

            setStatus(`✕ ERROR: ${error.message}`);
            savePersistentState();
            render();
        } finally {
            state.running = false;
            state.paused = false;
            state.stopRequested = false;
            state.currentId = null;
            savePersistentState();
            render();
        }
    }

    // =========================================================
    // DRAG & DROP REORDERING
    // =========================================================

    function moveItem(draggedId, targetId, after = false) {
        if (state.running || draggedId === targetId) return;

        const from = state.queue.findIndex(item => item.id === draggedId);
        const to = state.queue.findIndex(item => item.id === targetId);
        if (from < 0 || to < 0) return;

        const [item] = state.queue.splice(from, 1);
        let newTargetIndex = state.queue.findIndex(entry => entry.id === targetId);
        if (after) newTargetIndex += 1;
        state.queue.splice(newTargetIndex, 0, item);

        savePersistentState();
        render();
    }

    function moveItemToEnd(draggedId) {
        if (state.running) return;
        const index = state.queue.findIndex(item => item.id === draggedId);
        if (index < 0) return;
        const [item] = state.queue.splice(index, 1);
        state.queue.push(item);
        savePersistentState();
        render();
    }

    function wireQueueDnD() {
        const list = $('#pq-list');
        if (!list) return;

        list.addEventListener('dragstart', event => {
            if (state.running) {
                event.preventDefault();
                return;
            }

            const row = event.target.closest('.pq-item');
            if (!row) return;

            state.draggedId = row.dataset.id;
            row.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', state.draggedId);
        });

        list.addEventListener('dragend', () => {
            state.draggedId = null;
            $$('.pq-item').forEach(row => row.classList.remove('dragging', 'drop-before', 'drop-after'));
        });

        list.addEventListener('dragover', event => {
            if (!state.draggedId || state.running) return;
            event.preventDefault();

            $$('.pq-item').forEach(row => row.classList.remove('drop-before', 'drop-after'));

            const row = event.target.closest('.pq-item');
            if (!row || row.dataset.id === state.draggedId) return;

            const rect = row.getBoundingClientRect();
            const after = event.clientY > rect.top + rect.height / 2;
            row.classList.add(after ? 'drop-after' : 'drop-before');
        });

        list.addEventListener('drop', event => {
            if (!state.draggedId || state.running) return;
            event.preventDefault();

            const row = event.target.closest('.pq-item');
            if (!row) {
                moveItemToEnd(state.draggedId);
                return;
            }

            const rect = row.getBoundingClientRect();
            const after = event.clientY > rect.top + rect.height / 2;
            moveItem(state.draggedId, row.dataset.id, after);
        });
    }

    // =========================================================
    // MOVABLE & MINIMIZABLE PANEL
    // =========================================================

    function clampHostToViewport() {
        if (!host) return;

        const rect = host.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);

        const left = clamp(rect.left, 0, maxLeft);
        const top = clamp(rect.top, 0, maxTop);

        host.style.right = 'auto';
        host.style.bottom = 'auto';
        host.style.left = `${left}px`;
        host.style.top = `${top}px`;

        settings.ui.left = left;
        settings.ui.top = top;
        savePersistentState();
    }

    function restorePanelPosition() {
        if (!host) return;

        if (Number.isFinite(settings.ui.left) && Number.isFinite(settings.ui.top)) {
            host.style.right = 'auto';
            host.style.bottom = 'auto';
            host.style.left = `${settings.ui.left}px`;
            host.style.top = `${settings.ui.top}px`;
            requestAnimationFrame(clampHostToViewport);
        }
    }

    function wirePanelDragging() {
        const header = $('#pq-header');
        if (!header || !host) return;

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        header.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            if (event.target.closest('button, input, textarea')) return;

            const rect = host.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;

            host.style.right = 'auto';
            host.style.bottom = 'auto';
            host.style.left = `${rect.left}px`;
            host.style.top = `${rect.top}px`;

            header.classList.add('grabbing');
            header.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        header.addEventListener('pointermove', event => {
            if (!dragging) return;

            const rect = host.getBoundingClientRect();
            const left = clamp(event.clientX - offsetX, 0, Math.max(0, window.innerWidth - rect.width));
            const top = clamp(event.clientY - offsetY, 0, Math.max(0, window.innerHeight - rect.height));

            host.style.left = `${left}px`;
            host.style.top = `${top}px`;
        });

        const finish = event => {
            if (!dragging) return;
            dragging = false;
            header.classList.remove('grabbing');
            try { header.releasePointerCapture?.(event.pointerId); } catch {}
            clampHostToViewport();
        };

        header.addEventListener('pointerup', finish);
        header.addEventListener('pointercancel', finish);
    }

    function toggleMinimized() {
        settings.ui.minimized = !settings.ui.minimized;
        applyMinimizedState();
        savePersistentState();
        requestAnimationFrame(clampHostToViewport);
    }

    function applyMinimizedState() {
        const panel = $('#pq-panel');
        const button = $('#pq-minimize');
        if (!panel || !button) return;

        panel.classList.toggle('minimized', settings.ui.minimized);
        button.textContent = settings.ui.minimized ? '□' : '—';
        button.title = settings.ui.minimized ? 'Restore' : 'Minimize';
    }

    // =========================================================
    // RENDER
    // =========================================================

    function statusIcon(status) {
        switch (status) {
            case 'running': return '▶';
            case 'done': return '✓';
            case 'error': return '✕';
            default: return '○';
        }
    }

    function escapeHtml(text) {
        return text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function renderQueue() {
        const list = $('#pq-list');
        if (!list) return;

        if (!state.queue.length) {
            list.innerHTML = '<div class="empty">Queue is empty</div>';
            return;
        }

        list.innerHTML = state.queue.map((item, index) => `
            <div class="pq-item status-${item.status}" data-id="${item.id}" draggable="${!state.running}">
                <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
                <div class="status-icon" title="${item.status}">${statusIcon(item.status)}</div>
                <div class="prompt-content">
                    <div class="prompt-number">${index + 1}</div>
                    <div class="prompt-text" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</div>
                </div>
                <div class="item-actions">
                    <button class="icon-btn duplicate" data-action="duplicate" title="Duplicate" ${state.running ? 'disabled' : ''}>⧉</button>
                    <button class="icon-btn edit" data-action="edit" title="Edit" ${state.running ? 'disabled' : ''}>✎</button>
                    <button class="icon-btn delete" data-action="delete" title="Delete" ${state.running ? 'disabled' : ''}>×</button>
                </div>
            </div>
        `).join('');
    }

    function renderProgress() {
        const total = state.queue.length;
        const done = state.queue.filter(item => item.status === 'done').length;
        const pending = state.queue.filter(item => item.status === 'pending').length;
        const errors = state.queue.filter(item => item.status === 'error').length;

        const counter = $('#pq-counter');
        if (counter) counter.textContent = `${done}/${total}`;

        const miniCount = $('#pq-mini-count');
        if (miniCount) miniCount.textContent = total ? `${done}/${total}` : '0';

        const bar = $('#pq-progress-bar');
        if (bar) bar.style.width = `${total ? (done / total) * 100 : 0}%`;

        const meta = $('#pq-meta');
        if (meta) {
            meta.textContent = total
                ? `${pending} pending${errors ? ` · ${errors} error${errors === 1 ? '' : 's'}` : ''}`
                : 'No prompts';
        }
    }

    function renderControls() {
        const start = $('#pq-start');
        const pause = $('#pq-pause');
        const stop = $('#pq-stop');
        const reset = $('#pq-reset');
        const clear = $('#pq-clear');
        const clearDone = $('#pq-clear-done');

        if (!start) return;

        const hasItems = state.queue.length > 0;
        const allDone = hasItems && state.queue.every(item => item.status === 'done');

        start.disabled = state.running || !hasItems;
        start.textContent = allDone && !state.running ? '↻ Run again' : '▶ Start';

        pause.disabled = !state.running || state.stopRequested;
        pause.textContent = state.paused ? '▶ Resume' : '⏸ Pause';

        stop.disabled = !state.running || state.stopRequested;
        stop.textContent = state.stopRequested ? 'Stopping…' : '■ Stop';

        reset.disabled = state.running || !hasItems;
        clear.disabled = state.running || !hasItems;
        clearDone.disabled = state.running || !state.queue.some(item => item.status === 'done');

        const add = $('#pq-add');
        if (add && !state.editingId) add.textContent = '+ Add';
    }

    function render() {
        renderQueue();
        renderProgress();
        renderControls();
        applyMinimizedState();
    }

    function setStatus(text) {
        const status = $('#pq-status');
        if (status) status.textContent = text;
    }

    function flashCompletion() {
        const panel = $('#pq-panel');
        if (!panel) return;

        panel.classList.remove('completed-flash');
        void panel.offsetWidth;
        panel.classList.add('completed-flash');
        setTimeout(() => panel.classList.remove('completed-flash'), 3500);
    }

    // =========================================================
    // UI
    // =========================================================

    function createUI() {
        if (document.getElementById('miguel-prompt-queue-host')) return;

        host = document.createElement('div');
        host.id = 'miguel-prompt-queue-host';
        host.style.position = 'fixed';
        host.style.right = '20px';
        host.style.bottom = '90px';
        host.style.zIndex = '2147483646';
        host.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

        root = host.attachShadow({ mode: 'open' });

        root.innerHTML = `
            <style>
                * { box-sizing: border-box; }
                button, textarea, input { font: inherit; }

                #pq-panel {
                    width: 390px;
                    max-width: calc(100vw - 16px);
                    max-height: min(78vh, 720px);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    color: #f4f4f5;
                    background: rgba(23, 23, 23, 0.97);
                    border: 1px solid #444;
                    border-radius: 14px;
                    box-shadow: 0 18px 55px rgba(0,0,0,.42);
                    backdrop-filter: blur(12px);
                }

                #pq-panel.minimized { width: 230px; }
                #pq-panel.minimized .pq-body { display: none; }
                #pq-panel.completed-flash { animation: pqFlash 0.55s ease 0s 5 alternate; }

                @keyframes pqFlash {
                    from { box-shadow: 0 18px 55px rgba(0,0,0,.42); border-color: #444; }
                    to   { box-shadow: 0 0 0 3px rgba(78, 201, 135, .35), 0 18px 55px rgba(0,0,0,.42); border-color: #69d89b; }
                }

                #pq-header {
                    min-height: 45px;
                    padding: 10px 10px 10px 13px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 10px;
                    cursor: grab;
                    user-select: none;
                    touch-action: none;
                    border-bottom: 1px solid #343434;
                }
                #pq-header.grabbing { cursor: grabbing; }

                .title-wrap { display: flex; align-items: center; gap: 8px; min-width: 0; }
                .drag-mark { color: #777; letter-spacing: -3px; font-size: 15px; }
                .title { font-weight: 700; font-size: 14px; white-space: nowrap; }
                .version { font-size: 10px; color: #71717a; }
                .header-right { display: flex; align-items: center; gap: 7px; }
                #pq-mini-count, #pq-counter {
                    min-width: 38px;
                    text-align: center;
                    font-size: 11px;
                    color: #a1a1aa;
                    background: #262626;
                    border: 1px solid #3b3b3b;
                    border-radius: 999px;
                    padding: 3px 7px;
                }
                #pq-mini-count { display: none; }
                #pq-panel.minimized #pq-counter { display: none; }
                #pq-panel.minimized #pq-mini-count { display: inline-block; }

                .header-btn, .icon-btn {
                    border: 0;
                    background: transparent;
                    color: #b5b5bd;
                    cursor: pointer;
                    border-radius: 7px;
                }
                .header-btn { width: 28px; height: 26px; font-size: 16px; }
                .header-btn:hover, .icon-btn:hover:not(:disabled) { background: #323232; color: white; }

                .pq-body {
                    min-height: 0;
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                #pq-input {
                    width: 100%;
                    min-height: 84px;
                    max-height: 190px;
                    resize: vertical;
                    padding: 10px 11px;
                    color: #f5f5f5;
                    background: #222;
                    border: 1px solid #414141;
                    border-radius: 9px;
                    outline: none;
                    line-height: 1.4;
                }
                #pq-input:focus { border-color: #777; box-shadow: 0 0 0 2px rgba(255,255,255,.05); }

                .input-actions, .main-controls, .utility-row, .sound-row {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                }

                .btn {
                    min-height: 34px;
                    padding: 7px 10px;
                    border: 1px solid #464646;
                    border-radius: 8px;
                    color: #f5f5f5;
                    background: #2a2a2a;
                    cursor: pointer;
                    transition: filter .12s ease, opacity .12s ease;
                }
                .btn:hover:not(:disabled) { filter: brightness(1.17); }
                .btn:disabled { opacity: .38; cursor: default; }
                .btn.primary { background: #236346; border-color: #337b5b; flex: 1; }
                .btn.pause { background: #574824; }
                .btn.stop { background: #5d2929; }
                .btn.subtle { color: #c6c6cc; background: #252525; }
                .btn.small { min-height: 30px; padding: 5px 8px; font-size: 11px; }
                #pq-add { flex: 1; }

                #pq-list {
                    min-height: 48px;
                    max-height: min(31vh, 330px);
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding-right: 2px;
                }
                #pq-list::-webkit-scrollbar { width: 7px; }
                #pq-list::-webkit-scrollbar-thumb { background: #464646; border-radius: 8px; }

                .empty {
                    padding: 14px 8px;
                    text-align: center;
                    color: #707078;
                    border: 1px dashed #383838;
                    border-radius: 9px;
                }

                .pq-item {
                    position: relative;
                    display: flex;
                    align-items: flex-start;
                    gap: 7px;
                    padding: 8px 7px;
                    border: 1px solid #373737;
                    border-radius: 9px;
                    background: #202020;
                    transition: opacity .12s ease, border-color .12s ease, transform .12s ease;
                }
                .pq-item[draggable="true"] { cursor: default; }
                .pq-item.dragging { opacity: .35; }
                .pq-item.drop-before::before,
                .pq-item.drop-after::after {
                    content: '';
                    position: absolute;
                    left: 5px;
                    right: 5px;
                    height: 2px;
                    background: #8e8e96;
                    border-radius: 99px;
                }
                .pq-item.drop-before::before { top: -4px; }
                .pq-item.drop-after::after { bottom: -4px; }
                .pq-item.status-running { border-color: #6e5e2f; background: #272419; }
                .pq-item.status-done { border-color: #315d48; }
                .pq-item.status-error { border-color: #7a3a3a; background: #2b2020; }

                .drag-handle {
                    flex: 0 0 14px;
                    color: #666;
                    cursor: grab;
                    user-select: none;
                    padding-top: 1px;
                    letter-spacing: -3px;
                }
                .status-icon { flex: 0 0 16px; padding-top: 1px; color: #b4b4bb; }
                .status-done .status-icon { color: #70d69d; }
                .status-running .status-icon { color: #e4ca73; }
                .status-error .status-icon { color: #ef8585; }

                .prompt-content { flex: 1; min-width: 0; display: flex; gap: 7px; }
                .prompt-number {
                    flex: 0 0 auto;
                    min-width: 20px;
                    height: 20px;
                    display: grid;
                    place-items: center;
                    color: #919199;
                    background: #2d2d2d;
                    border-radius: 6px;
                    font-size: 10px;
                }
                .prompt-text {
                    min-width: 0;
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-box-orient: vertical;
                    -webkit-line-clamp: 3;
                    white-space: pre-wrap;
                    overflow-wrap: anywhere;
                    line-height: 1.35;
                    font-size: 12px;
                    color: #e7e7e9;
                }
                .item-actions { display: flex; gap: 1px; flex: 0 0 auto; }
                .icon-btn { width: 24px; height: 24px; padding: 0; font-size: 14px; }
                .icon-btn.delete { font-size: 18px; }
                .icon-btn:disabled { opacity: .24; cursor: default; }

                .progress-wrap { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; }
                .progress-track { height: 5px; overflow: hidden; border-radius: 999px; background: #303030; }
                #pq-progress-bar { height: 100%; width: 0%; background: #78b993; transition: width .25s ease; }
                #pq-meta { font-size: 10px; color: #818189; white-space: nowrap; }

                #pq-status {
                    min-height: 30px;
                    padding: 7px 9px;
                    display: flex;
                    align-items: center;
                    color: #aaaab2;
                    background: #1e1e1e;
                    border: 1px solid #333;
                    border-radius: 8px;
                    font-size: 11px;
                    line-height: 1.35;
                }

                .main-controls > .btn { flex: 1; }
                .utility-row { flex-wrap: wrap; }

                .sound-row {
                    padding-top: 2px;
                    color: #9d9da5;
                    font-size: 11px;
                }
                .sound-row label { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
                #pq-volume { flex: 1; min-width: 70px; accent-color: #8c8c94; }
                #pq-volume-label { width: 34px; text-align: right; color: #c5c5ca; }

                .hint { color: #6f6f76; font-size: 10px; margin-left: auto; }
            </style>

            <section id="pq-panel">
                <header id="pq-header">
                    <div class="title-wrap">
                        <span class="drag-mark">⋮⋮</span>
                        <span class="title">Prompt Queue</span>
                        <span class="version">v${VERSION}</span>
                    </div>
                    <div class="header-right">
                        <span id="pq-counter">0/0</span>
                        <span id="pq-mini-count">0</span>
                        <button id="pq-minimize" class="header-btn" title="Minimize">—</button>
                    </div>
                </header>

                <div class="pq-body">
                    <textarea id="pq-input" placeholder="Write a prompt…\n\nCtrl/Cmd + Enter = add or save"></textarea>

                    <div class="input-actions">
                        <button id="pq-add" class="btn">+ Add</button>
                        <button id="pq-cancel-edit" class="btn subtle" hidden>Cancel edit</button>
                    </div>

                    <div id="pq-list"></div>

                    <div class="progress-wrap">
                        <div class="progress-track"><div id="pq-progress-bar"></div></div>
                        <div id="pq-meta">No prompts</div>
                    </div>

                    <div id="pq-status">Ready.</div>

                    <div class="main-controls">
                        <button id="pq-start" class="btn primary">▶ Start</button>
                        <button id="pq-pause" class="btn pause" disabled>⏸ Pause</button>
                        <button id="pq-stop" class="btn stop" disabled>■ Stop</button>
                    </div>

                    <div class="utility-row">
                        <button id="pq-reset" class="btn small subtle">↻ Reset statuses</button>
                        <button id="pq-clear-done" class="btn small subtle">Remove ✓</button>
                        <button id="pq-clear" class="btn small subtle">Clear all</button>
                    </div>

                    <div class="sound-row">
                        <label><input id="pq-sound-enabled" type="checkbox"> 🔊 Completion alert</label>
                        <input id="pq-volume" type="range" min="0" max="100" step="5">
                        <span id="pq-volume-label">80%</span>
                        <button id="pq-test-sound" class="btn small subtle">Test</button>
                    </div>

                    <div class="hint">Drag the header to move · ⋮⋮ to reorder</div>
                </div>
            </section>
        `;

        document.body.appendChild(host);

        // Initial audio control state.
        $('#pq-sound-enabled').checked = settings.sound.enabled;
        $('#pq-volume').value = Math.round(settings.sound.volume * 100);
        $('#pq-volume-label').textContent = `${Math.round(settings.sound.volume * 100)}%`;

        // Basic events.
        $('#pq-add').addEventListener('click', addOrSavePrompt);
        $('#pq-cancel-edit').addEventListener('click', cancelEdit);
        $('#pq-start').addEventListener('click', async () => {
            await ensureAudioContext(); // Run inside a real user gesture so browsers can unlock audio.
            await runQueue();
        });
        $('#pq-pause').addEventListener('click', togglePause);
        $('#pq-stop').addEventListener('click', requestStop);
        $('#pq-reset').addEventListener('click', resetStatuses);
        $('#pq-clear-done').addEventListener('click', clearCompleted);
        $('#pq-clear').addEventListener('click', clearQueue);
        $('#pq-minimize').addEventListener('click', toggleMinimized);

        $('#pq-input').addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                addOrSavePrompt();
            }
        });


        // Isolate the queue editor from ChatGPT global keyboard shortcuts.
        // The panel lives inside Shadow DOM; without this guard, composed events
        // can cross the shadow boundary and ChatGPT may receive them
        // as if they came from the host, redirecting focus to its composer.
        const queueInput = $('#pq-input');
        [
            'keydown', 'keypress', 'keyup',
            'beforeinput', 'input',
            'compositionstart', 'compositionupdate', 'compositionend',
            'paste', 'cut'
        ].forEach(type => {
            queueInput.addEventListener(type, event => {
                event.stopPropagation();
            });
        });

        $('#pq-list').addEventListener('click', event => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const row = button.closest('.pq-item');
            if (!row) return;

            const id = row.dataset.id;
            switch (button.dataset.action) {
                case 'edit': beginEdit(id); break;
                case 'duplicate': duplicatePrompt(id); break;
                case 'delete': removePrompt(id); break;
            }
        });

        $('#pq-list').addEventListener('dblclick', event => {
            const row = event.target.closest('.pq-item');
            if (row && !state.running) beginEdit(row.dataset.id);
        });

        $('#pq-sound-enabled').addEventListener('change', event => {
            settings.sound.enabled = event.target.checked;
            savePersistentState();
        });

        $('#pq-volume').addEventListener('input', event => {
            settings.sound.volume = Number(event.target.value) / 100;
            $('#pq-volume-label').textContent = `${event.target.value}%`;
            savePersistentState();
        });

        $('#pq-test-sound').addEventListener('click', async () => {
            const previousEnabled = settings.sound.enabled;
            const sounded = await playCompletionSound(true);
            settings.sound.enabled = previousEnabled;

            setStatus(
                sounded
                    ? '🔊 Test sound played. If you cannot hear it, make sure the browser tab and system audio are not muted.'
                    : '⚠️ The browser did not allow audio to start. Click again or check the tab/system audio settings.'
            );
        });

        wireQueueDnD();
        wirePanelDragging();
        restorePanelPosition();
        applyMinimizedState();
        render();
    }

    window.addEventListener('resize', () => requestAnimationFrame(clampHostToViewport));

    // =========================================================
    // STARTUP
    // =========================================================

    loadPersistentState();
    createUI();

    console.log(`[Prompt Queue] v${VERSION} loaded.`);
})();
