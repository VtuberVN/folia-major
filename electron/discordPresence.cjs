const DISCORD_PRESENCE_UPDATE_INTERVAL_MS = 15_000;
const DISCORD_ACTIVITY_TYPE_LISTENING = 2;
const DEFAULT_DISCORD_APPLICATION_ID = '1203744706702610522';

// electron/discordPresence.cjs
// Maintains Discord Rich Presence from the main-process playback snapshot.

function normalizeDiscordApplicationId(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return /^\d{16,24}$/.test(trimmed) ? trimmed : '';
}

function normalizeDiscordImageUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost')
    ) {
      return '';
    }
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return '';
  }
}

function getSnapshotTimestamp(snapshot) {
  const updatedAt = Number(snapshot?.updatedAt);
  return Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now();
}

function buildDiscordActivity(snapshot) {
  if (!snapshot || !snapshot.hasTrack || !snapshot.title) {
    return null;
  }

  const title = String(snapshot.title).slice(0, 128);
  const artist = typeof snapshot.artist === 'string' && snapshot.artist.trim()
    ? snapshot.artist.trim().slice(0, 128)
    : 'Folia';
  const playerState = snapshot.playerState === 'PLAYING' ? 'PLAYING' : 'PAUSED';
  const duration = Number(snapshot.duration);
  const currentTime = Math.max(0, Number(snapshot.currentTime) || 0);
  const hasFiniteDuration = Number.isFinite(duration) && duration > currentTime + 1;
  const coverImageUrl = normalizeDiscordImageUrl(snapshot.coverUrl);

  const activity = {
    name: title,
    type: DISCORD_ACTIVITY_TYPE_LISTENING,
    statusDisplayType: 2,
    details: title,
    state: playerState === 'PLAYING' ? artist : `Paused - ${artist}`,
    largeImageText: coverImageUrl ? title : 'Folia',
    smallImageText: playerState === 'PLAYING' ? 'Playing' : 'Paused',
    instance: false,
  };

  if (coverImageUrl) {
    activity.largeImageKey = coverImageUrl;
  }

  if (playerState === 'PLAYING' && hasFiniteDuration) {
    const sampledAt = getSnapshotTimestamp(snapshot);
    activity.startTimestamp = Math.max(0, sampledAt - currentTime * 1000);
    activity.endTimestamp = sampledAt + (duration - currentTime) * 1000;
  }

  return activity;
}

function getActivityKey(activity) {
  if (!activity) {
    return 'empty';
  }
  return JSON.stringify({
    details: activity.details,
    state: activity.state,
    largeImageKey: activity.largeImageKey,
    startTimestamp: activity.startTimestamp ? Math.round(activity.startTimestamp / 1000) : null,
    endTimestamp: activity.endTimestamp ? Math.round(activity.endTimestamp / 1000) : null,
  });
}

function createDiscordPresenceController({
  getApplicationId,
  isEnabled,
  onStatusChange,
  createClient = (applicationId) => {
    const { Client } = require('@xhayper/discord-rpc');
    return new Client({ clientId: applicationId, transport: { type: 'ipc' } });
  },
} = {}) {
  let client = null;
  let connectingPromise = null;
  let pendingClient = null;
  let connectionGeneration = 0;
  let currentApplicationId = '';
  let lastActivityKey = '';
  let lastUpdateAt = 0;
  let lastSnapshot = null;
  let status = {
    enabled: false,
    configured: false,
    connected: false,
    error: null,
    applicationId: null,
    updatedAt: Date.now(),
  };

  const publishStatus = (patch = {}) => {
    const nextStatus = {
      ...status,
      ...patch,
      updatedAt: Date.now(),
    };
    if (
      nextStatus.enabled === status.enabled &&
      nextStatus.configured === status.configured &&
      nextStatus.connected === status.connected &&
      nextStatus.error === status.error &&
      nextStatus.applicationId === status.applicationId
    ) {
      return status;
    }
    status = nextStatus;
    onStatusChange?.(status);
    return status;
  };

  const getStatus = () => ({ ...status });

  const disposeClient = async (activeClient) => {
    if (!activeClient) return;
    try {
      if (activeClient.isConnected) {
        await activeClient.user?.clearActivity?.(process.pid);
      }
    } catch {
      // Clearing presence is best-effort; Discord may already be closed.
    }
    try {
      await activeClient.destroy();
    } catch {
      // The local Discord IPC can disappear at any time.
    }
  };

  const destroyClient = async () => {
    const generation = ++connectionGeneration;
    const clients = [...new Set([client, pendingClient].filter(Boolean))];
    client = null;
    pendingClient = null;
    connectingPromise = null;
    lastActivityKey = '';
    lastUpdateAt = 0;
    await Promise.all(clients.map(disposeClient));
    return generation;
  };

  const ensureClient = async () => {
    const applicationId = normalizeDiscordApplicationId(getApplicationId?.());
    const enabled = Boolean(isEnabled?.());
    publishStatus({
      enabled,
      configured: Boolean(applicationId),
      applicationId: applicationId || null,
    });

    if (!enabled || !applicationId) {
      const generation = await destroyClient();
      if (generation !== connectionGeneration) return null;
      publishStatus({
        connected: false,
        error: enabled ? 'Discord application identity is unavailable.' : null,
      });
      return null;
    }

    if (client && currentApplicationId === applicationId && client.isConnected) {
      return client;
    }

    if (connectingPromise && currentApplicationId === applicationId) {
      return connectingPromise;
    }

    const generation = await destroyClient();
    if (generation !== connectionGeneration) return null;
    currentApplicationId = applicationId;

    let nextClient;
    const connection = Promise.resolve()
      .then(async () => {
        if (generation !== connectionGeneration) return null;
        nextClient = createClient(applicationId);
        pendingClient = nextClient;
        nextClient.on('disconnected', () => {
          if (client === nextClient && generation === connectionGeneration) {
            publishStatus({ connected: false, error: 'Discord disconnected.' });
          }
        });
        await nextClient.login();
        if (generation !== connectionGeneration) {
          await disposeClient(nextClient);
          return null;
        }
        client = nextClient;
        publishStatus({ connected: true, error: null });
        return nextClient;
      })
      .catch(async (error) => {
        await disposeClient(nextClient);
        if (generation === connectionGeneration) {
          client = null;
          publishStatus({
            connected: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return null;
      })
      .finally(() => {
        if (connectingPromise === connection) connectingPromise = null;
        if (pendingClient === nextClient) pendingClient = null;
      });
    connectingPromise = connection;

    return connectingPromise;
  };

  const publishSnapshot = async (snapshot) => {
    lastSnapshot = snapshot || null;
    const activity = buildDiscordActivity(lastSnapshot);
    const activeClient = await ensureClient();
    if (!activeClient || activeClient !== client) {
      return getStatus();
    }
    const generation = connectionGeneration;

    if (!activity) {
      if (lastActivityKey !== 'empty') {
        try {
          await activeClient.user?.clearActivity?.(process.pid);
          if (generation !== connectionGeneration || activeClient !== client) return getStatus();
          lastActivityKey = 'empty';
          publishStatus({ connected: true, error: null });
        } catch (error) {
          if (generation === connectionGeneration && activeClient === client) {
            publishStatus({ connected: false, error: error instanceof Error ? error.message : String(error) });
          }
        }
      }
      return getStatus();
    }

    const activityKey = getActivityKey(activity);
    const now = Date.now();
    if (activityKey === lastActivityKey && now - lastUpdateAt < DISCORD_PRESENCE_UPDATE_INTERVAL_MS) {
      return getStatus();
    }

    try {
      await activeClient.user?.setActivity(activity, process.pid);
      if (generation !== connectionGeneration || activeClient !== client) return getStatus();
      lastActivityKey = activityKey;
      lastUpdateAt = now;
      publishStatus({ connected: true, error: null });
    } catch (error) {
      if (generation === connectionGeneration && activeClient === client) {
        publishStatus({ connected: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return getStatus();
  };

  const refresh = async () => {
    return publishSnapshot(lastSnapshot);
  };

  return {
    getStatus,
    publishSnapshot,
    refresh,
    destroy: destroyClient,
  };
}

module.exports = {
  buildDiscordActivity,
  createDiscordPresenceController,
  DEFAULT_DISCORD_APPLICATION_ID,
  normalizeDiscordApplicationId,
  normalizeDiscordImageUrl,
};
