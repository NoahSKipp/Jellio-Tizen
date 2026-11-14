import test from 'node:test';
import assert from 'node:assert/strict';

test('Verify data modules load and export expected APIs', async () => {
  const sessionModule = await import('../src/data/session.js');
  assert.equal(typeof sessionModule.getSession, 'function');
  assert.equal(typeof sessionModule.setSession, 'function');
  assert.equal(typeof sessionModule.clearSession, 'function');

  const prefsModule = await import('../src/data/prefs.js');
  assert.equal(typeof prefsModule.DisplayPreferences.getOverscanPercent, 'function');
  assert.equal(typeof prefsModule.PlayerPrefs.getPreferReadySources, 'function');

  const apiModule = await import('../src/data/api.js');
  assert.equal(typeof apiModule.getJson, 'function');
  assert.equal(typeof apiModule.postJson, 'function');
  assert.equal(typeof apiModule.resolveServerAddress, 'function');
  assert.equal(typeof apiModule.authenticateByName, 'function');
  assert.equal(typeof apiModule.getItem, 'function');
  assert.equal(typeof apiModule.getPlaybackInfo, 'function');
  assert.equal(typeof apiModule.resolvePlayback, 'function');
  assert.equal(typeof apiModule.buildStreamUrl, 'function');
  assert.equal(typeof apiModule.getImageUrl, 'function');
  assert.equal(typeof apiModule.getUserImageUrl, 'function');

  const friendsModule = await import('../src/data/friends.js');
  assert.equal(typeof friendsModule.friendsRepository.list, 'function');
  assert.equal(typeof friendsModule.friendsRepository.sendRequest, 'function');
  assert.equal(typeof friendsModule.friendsRepository.addToWatchlists, 'function');
  assert.equal(typeof friendsModule.friendsRepository.withAddedBy, 'function');

  const syncplayModule = await import('../src/data/syncplay.js');
  assert.equal(typeof syncplayModule.syncPlayManager.start, 'function');
  assert.equal(typeof syncplayModule.syncPlayManager.join, 'function');
  assert.equal(typeof syncplayModule.syncPlayManager.leave, 'function');
  assert.equal(typeof syncplayModule.decideReconcile, 'function');

  const nowplayingModule = await import('../src/data/nowplaying.js');
  assert.equal(typeof nowplayingModule.nowPlayingManager.startPolling, 'function');
  assert.equal(typeof nowplayingModule.nowPlayingManager.setLocalPaused, 'function');
  assert.equal(typeof nowplayingModule.remoteControlManager.handleWebSocketMessage, 'function');
});

test('Friends module pure helpers', async () => {
  const { addedByMap, withAddedBy, friendFailureOf, statusFromBody, plainId, FriendFailure } = await import('../src/data/friends.js');

  assert.equal(plainId('1234-5678-ABCD'), '12345678abcd');

  const mapped = addedByMap({
    Items: {
      'abc-123': [
        { UserId: 'u1', UserName: 'Alice' },
        { UserId: 'u2', UserName: 'Bob' },
        { UserId: 'u3', UserName: 'Charlie' },
        { UserId: 'u4', UserName: 'David' },
      ],
    },
  });

  assert.equal(mapped.abc123.length, 3);
  assert.equal(mapped.abc123[0].UserId, 'u1');

  const items = [{ Id: 'abc-123', Name: 'Test Movie' }];
  const enriched = withAddedBy(items, mapped);
  assert.equal(enriched[0].AddedBy.length, 3);

  assert.equal(friendFailureOf(403, 'private'), FriendFailure.Private);
  assert.equal(friendFailureOf(403, 'closed'), FriendFailure.Closed);
  assert.equal(friendFailureOf(429, null), FriendFailure.Cooldown);
  assert.equal(friendFailureOf(409, null), FriendFailure.FriendLimit);
  assert.equal(friendFailureOf(404, null), FriendFailure.Gone);
  assert.equal(friendFailureOf(500, null), FriendFailure.Failed);

  assert.equal(statusFromBody('{"Status":"Closed"}'), 'closed');
  assert.equal(statusFromBody({ Status: 'Private' }), 'private');
});

test('SyncPlay reconcile decision logic', async () => {
  const { decideReconcile } = await import('../src/data/syncplay.js');

  const groups = [
    { GroupId: 'g1', GroupName: 'Party 1', Participants: ['Alice', 'Bob'] },
    { GroupId: 'g2', GroupName: 'Party 2', Participants: ['Charlie'] },
  ];

  // In g1, still listed in g1
  let dec = decideReconcile(groups, 'g1', { groupId: 'g1' }, 'Alice', null, false);
  assert.equal(dec.action, 'none');

  // Stored is g1, but not currently connected
  dec = decideReconcile(groups, 'g1', null, 'Alice', null, false);
  assert.equal(dec.action, 'join');
  assert.equal(dec.group.GroupId, 'g1');

  // Current g1, but g1 was deleted from groups list
  dec = decideReconcile([{ GroupId: 'g2', GroupName: 'Party 2', Participants: [] }], null, { groupId: 'g1' }, 'Alice', null, false);
  assert.equal(dec.action, 'reset');
});

test('RemoteControlManager command message parsing', async () => {
  const { RemoteControlManager } = await import('../src/data/nowplaying.js');
  const mgr = new RemoteControlManager();

  let playCmd = null;
  mgr.onPlay((cmd) => { playCmd = cmd; });

  const handledPlay = mgr.handleWebSocketMessage({
    MessageType: 'Play',
    Data: {
      ItemIds: ['item-uuid-1'],
      PlayCommand: 'PlayNow',
      StartPositionTicks: 50000000,
    },
  });

  assert.equal(handledPlay, true);
  assert.equal(playCmd.itemId, 'itemuuid1');
  assert.equal(playCmd.playCommand, 'PlayNow');
  assert.equal(playCmd.startPositionTicks, 50000000);

  let playstateCmd = null;
  mgr.onPlaystate((cmd) => { playstateCmd = cmd; });

  const handledPlaystate = mgr.handleWebSocketMessage({
    MessageType: 'Playstate',
    Data: {
      Command: 'Pause',
      SeekPositionTicks: 100000000,
    },
  });

  assert.equal(handledPlaystate, true);
  assert.equal(playstateCmd.command, 'Pause');
  assert.equal(playstateCmd.seekPositionTicks, 100000000);

  let genCmd = null;
  mgr.onGeneralCommand((cmd) => { genCmd = cmd; });

  const handledGeneral = mgr.handleWebSocketMessage({
    MessageType: 'GeneralCommand',
    Data: {
      Name: 'SetVolume',
      Arguments: { Volume: 50 },
    },
  });

  assert.equal(handledGeneral, true);
  assert.equal(genCmd.name, 'SetVolume');
  assert.equal(genCmd.arguments.Volume, '50');
});
