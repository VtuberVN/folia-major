import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// test/unit/discordPresence.test.ts
// Verifies Discord Rich Presence payload mapping without requiring Discord.

const require = createRequire(import.meta.url);
const {
  buildDiscordActivity,
  createDiscordPresenceController,
  DEFAULT_DISCORD_APPLICATION_ID,
  normalizeDiscordApplicationId,
  normalizeDiscordImageUrl,
} = require('../../electron/discordPresence.cjs') as {
  buildDiscordActivity: (snapshot: any) => any;
  createDiscordPresenceController: (options: any) => any;
  DEFAULT_DISCORD_APPLICATION_ID: string;
  normalizeDiscordApplicationId: (value: unknown) => string;
  normalizeDiscordImageUrl: (value: unknown) => string;
};

describe('discordPresence', () => {
  it('normalizes Discord application IDs', () => {
    expect(DEFAULT_DISCORD_APPLICATION_ID).toBe('1203744706702610522');
    expect(normalizeDiscordApplicationId(' 123456789012345678 ')).toBe('123456789012345678');
    expect(normalizeDiscordApplicationId('not-a-snowflake')).toBe('');
  });

  it('normalizes externally reachable Discord cover image URLs', () => {
    expect(normalizeDiscordImageUrl(' https://example.com/cover.jpg ')).toBe('https://example.com/cover.jpg');
    expect(normalizeDiscordImageUrl('http://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
    expect(normalizeDiscordImageUrl('blob:https://example.com/id')).toBe('');
    expect(normalizeDiscordImageUrl('http://127.0.0.1:3000/cover.jpg')).toBe('');
    expect(normalizeDiscordImageUrl('file:///tmp/cover.jpg')).toBe('');
  });

  it('returns null when there is no active track', () => {
    expect(buildDiscordActivity({ hasTrack: false })).toBeNull();
    expect(buildDiscordActivity({ hasTrack: true, title: '' })).toBeNull();
  });

  it('builds a listening activity with progress timestamps while playing', () => {
    const activity = buildDiscordActivity({
      hasTrack: true,
      title: 'Song',
      artist: 'Artist',
      playerState: 'PLAYING',
      currentTime: 30,
      duration: 120,
      updatedAt: 10_000,
      coverUrl: 'https://example.com/cover.jpg',
    });

    expect(activity).toMatchObject({
      name: 'Song',
      type: 2,
      statusDisplayType: 2,
      details: 'Song',
      state: 'Artist',
      largeImageKey: 'https://example.com/cover.jpg',
      largeImageText: 'Song',
      smallImageText: 'Playing',
    });
    expect(activity.startTimestamp).toBe(0);
    expect(activity.endTimestamp).toBe(100_000);
  });

  it('marks paused playback without progress timestamps', () => {
    const activity = buildDiscordActivity({
      hasTrack: true,
      title: 'Song',
      artist: 'Artist',
      playerState: 'PAUSED',
      currentTime: 30,
      duration: 120,
      updatedAt: 10_000,
    });

    expect(activity).toMatchObject({
      details: 'Song',
      state: 'Paused - Artist',
      smallImageText: 'Paused',
    });
    expect(activity.startTimestamp).toBeUndefined();
    expect(activity.endTimestamp).toBeUndefined();
  });

  const createDeferredClient = (applicationId: string) => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const loginResult = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
    const client = {
      applicationId,
      isConnected: false,
      on: vi.fn(),
      login: vi.fn(() => loginResult),
      destroy: vi.fn(async () => { client.isConnected = false; }),
      user: { setActivity: vi.fn(async () => {}), clearActivity: vi.fn(async () => {}) },
      resolve: () => { client.isConnected = true; resolve(); },
      reject: () => reject(new Error('Old login failed')),
    };
    return client;
  };
  const nextTurn = () => new Promise<void>(resolve => setImmediate(resolve));
  const playingSnapshot = { hasTrack: true, title: 'Song', artist: 'Artist', playerState: 'PLAYING' };

  it.each(['resolve', 'reject'] as const)('ignores a stale login %s after the new identity connects', async (outcome) => {
    let applicationId = '1203744706702610522';
    const clients: ReturnType<typeof createDeferredClient>[] = [];
    const controller = createDiscordPresenceController({
      getApplicationId: () => applicationId,
      isEnabled: () => true,
      createClient: (id: string) => { const client = createDeferredClient(id); clients.push(client); return client; },
    });
    const oldConnection = controller.publishSnapshot(playingSnapshot);
    await nextTurn();
    applicationId = '1203744706702610523';
    const newConnection = controller.refresh();
    await nextTurn();
    clients[1].resolve();
    await newConnection;
    clients[0][outcome]();
    await oldConnection;

    expect(controller.getStatus()).toMatchObject({ connected: true, error: null, applicationId });
    await controller.publishSnapshot({ ...playingSnapshot, title: 'Next song' });
    expect(clients[0].user.setActivity).not.toHaveBeenCalled();
    expect(clients[0].destroy).toHaveBeenCalled();
    expect(clients[1].user.setActivity).toHaveBeenLastCalledWith(expect.objectContaining({ details: 'Next song' }), process.pid);
    await controller.destroy();
  });

  it('keeps the current login promise when an obsolete login settles first', async () => {
    let applicationId = '1203744706702610522';
    const clients: ReturnType<typeof createDeferredClient>[] = [];
    const controller = createDiscordPresenceController({
      getApplicationId: () => applicationId,
      isEnabled: () => true,
      createClient: (id: string) => { const client = createDeferredClient(id); clients.push(client); return client; },
    });
    const oldConnection = controller.publishSnapshot(playingSnapshot);
    await nextTurn();
    applicationId = '1203744706702610523';
    const newConnection = controller.refresh();
    await nextTurn();
    clients[0].resolve();
    await oldConnection;
    const refreshDuringLogin = controller.refresh();
    await nextTurn();
    expect(clients).toHaveLength(2);
    clients[1].resolve();
    await Promise.all([newConnection, refreshDuringLogin]);
    expect(controller.getStatus()).toMatchObject({ connected: true, applicationId });
    await controller.destroy();
  });

  it('does not restore presence when disabled during login', async () => {
    let enabled = true;
    const client = createDeferredClient(DEFAULT_DISCORD_APPLICATION_ID);
    const controller = createDiscordPresenceController({
      getApplicationId: () => DEFAULT_DISCORD_APPLICATION_ID,
      isEnabled: () => enabled,
      createClient: () => client,
    });
    const connection = controller.publishSnapshot(playingSnapshot);
    await nextTurn();
    enabled = false;
    await controller.refresh();
    client.resolve();
    await connection;
    expect(controller.getStatus()).toMatchObject({ enabled: false, connected: false, error: null });
    expect(client.user.setActivity).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalled();
    await controller.destroy();
  });
});
