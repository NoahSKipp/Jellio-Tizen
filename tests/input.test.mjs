import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RemoteKey,
  QuickHubButton,
  QuickHubTrigger,
  normalizeKey,
  LongPressDetector,
  QuickHubKeyGate,
} from '../src/input/remote.js';

test('Remote key normalization for Tizen and desktop keys', () => {
  assert.equal(normalizeKey({ keyCode: 38 }), RemoteKey.UP);
  assert.equal(normalizeKey({ keyCode: 40 }), RemoteKey.DOWN);
  assert.equal(normalizeKey({ keyCode: 37 }), RemoteKey.LEFT);
  assert.equal(normalizeKey({ keyCode: 39 }), RemoteKey.RIGHT);
  assert.equal(normalizeKey({ keyCode: 13 }), RemoteKey.ENTER);
  assert.equal(normalizeKey({ keyCode: 10009 }), RemoteKey.BACK);
  assert.equal(normalizeKey({ keyCode: 27 }), RemoteKey.BACK);
  assert.equal(normalizeKey({ keyCode: 415 }), RemoteKey.PLAY);
  assert.equal(normalizeKey({ keyCode: 19 }), RemoteKey.PAUSE);
  assert.equal(normalizeKey({ keyCode: 10252 }), RemoteKey.PLAY_PAUSE);
  assert.equal(normalizeKey({ keyCode: 403 }), RemoteKey.RED);
  assert.equal(normalizeKey({ keyCode: 404 }), RemoteKey.GREEN);
  assert.equal(normalizeKey({ keyCode: 405 }), RemoteKey.YELLOW);
  assert.equal(normalizeKey({ keyCode: 406 }), RemoteKey.BLUE);

  // Desktop keyboard mappings
  assert.equal(normalizeKey({ key: 'ArrowUp' }), RemoteKey.UP);
  assert.equal(normalizeKey({ key: 'Escape' }), RemoteKey.BACK);
  assert.equal(normalizeKey({ key: 'Backspace' }), RemoteKey.BACK);
  assert.equal(normalizeKey({ key: 'p' }), RemoteKey.PLAY_PAUSE);
  assert.equal(normalizeKey({ key: 'q' }), RemoteKey.QUICK_HUB);
});

test('LongPressDetector fires onSelect on short press', (t, done) => {
  let selectFired = false;
  let longFired = false;

  const detector = new LongPressDetector({
    thresholdMs: 100,
    onSelect: () => {
      selectFired = true;
    },
    onLongSelect: () => {
      longFired = true;
    },
  });

  detector.handleKeyDown(RemoteKey.ENTER);
  setTimeout(() => {
    detector.handleKeyUp(RemoteKey.ENTER);
    assert.equal(selectFired, true);
    assert.equal(longFired, false);
    done();
  }, 30);
});

test('LongPressDetector fires onLongSelect on long hold and suppresses onSelect on release', (t, done) => {
  let selectFired = false;
  let longFired = false;

  const detector = new LongPressDetector({
    thresholdMs: 50,
    onSelect: () => {
      selectFired = true;
    },
    onLongSelect: () => {
      longFired = true;
    },
  });

  detector.handleKeyDown(RemoteKey.ENTER);
  setTimeout(() => {
    assert.equal(longFired, true);
    detector.handleKeyUp(RemoteKey.ENTER);
    assert.equal(selectFired, false);
    done();
  }, 80);
});

test('QuickHubKeyGate handles BACK button hold trigger', (t, done) => {
  let toggled = false;
  const gate = new QuickHubKeyGate({
    button: QuickHubButton.BACK,
    trigger: QuickHubTrigger.HOLD,
    holdTimeoutMs: 50,
    onToggle: () => {
      toggled = true;
    },
  });

  const downRes = gate.onKeyDown(10009, RemoteKey.BACK, true, false);
  assert.equal(downRes.action, 'START_HOLD');

  setTimeout(() => {
    assert.equal(toggled, true);
    const upRes = gate.onKeyUp(10009, RemoteKey.BACK);
    assert.equal(upRes.action, 'CONSUME');
    done();
  }, 80);
});

test('QuickHubKeyGate releases short BACK press as REPLAY_PRESS if released before timeout', (t, done) => {
  let toggled = false;
  const gate = new QuickHubKeyGate({
    button: QuickHubButton.BACK,
    trigger: QuickHubTrigger.HOLD,
    holdTimeoutMs: 100,
    onToggle: () => {
      toggled = true;
    },
  });

  const downRes = gate.onKeyDown(10009, RemoteKey.BACK, true, false);
  assert.equal(downRes.action, 'START_HOLD');

  setTimeout(() => {
    const upRes = gate.onKeyUp(10009, RemoteKey.BACK);
    assert.equal(upRes.action, 'REPLAY_PRESS');
    assert.equal(toggled, false);
    done();
  }, 20);
});

test('QuickHubKeyGate passes BACK when QuickHub is already open so Back closes it', () => {
  const gate = new QuickHubKeyGate({
    button: QuickHubButton.BACK,
    trigger: QuickHubTrigger.HOLD,
  });

  const res = gate.onKeyDown(10009, RemoteKey.BACK, true, true);
  assert.equal(res.action, 'PASS');
});

test('QuickHubKeyGate handles color button triggers and key recording mode', () => {
  const gate = new QuickHubKeyGate({
    button: QuickHubButton.RED,
    trigger: QuickHubTrigger.SINGLE_PRESS,
  });

  const res = gate.onKeyDown(403, RemoteKey.RED, true, false);
  assert.equal(res.action, 'TOGGLE');

  let recordedCode = null;
  gate.startRecording((code) => {
    recordedCode = code;
    return true;
  });

  const recRes = gate.onKeyDown(405, RemoteKey.YELLOW, true, false);
  assert.equal(recRes.action, 'CONSUME');
  assert.equal(recordedCode, 405);
  assert.equal(gate.isRecording, false);
});
