import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createStageApi } from '../../../electron/stageApi.cjs';

// test/unit/stage/stageApiSource.test.ts
// Verifies authoritative Stage source persistence and serialized server transitions.

const listenOnEphemeralPort = async (server: ReturnType<typeof http.createServer>) => {
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to resolve an ephemeral port.');
    }
    return address.port;
};

const closeHttpServer = async (server: ReturnType<typeof http.createServer>) => {
    if (!server.listening) return;

    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
};

const getFreePort = async () => {
    const server = http.createServer();
    const port = await listenOnEphemeralPort(server);
    await closeHttpServer(server);
    return port;
};

const createStageSourceApi = ({
    enabled = true,
    source = 'stage-api',
    port = 19876,
    userDataPath = '/tmp/folia-stage-source-test',
}: {
    enabled?: boolean;
    source?: string;
    port?: number;
    userDataPath?: string;
} = {}) => {
    const values = new Map<string, unknown>([
        ['stage-enabled', enabled],
        ['stage-source', source],
        ['stage-port', port],
    ]);
    const send = vi.fn();
    const stageApi = createStageApi({
        app: { getPath: () => userDataPath },
        store: {
            get: (key: string) => values.get(key),
            has: (key: string) => values.has(key),
            set: (key: string, value: unknown) => values.set(key, value),
        },
        getMainWindow: () => ({
            isDestroyed: () => false,
            webContents: { send },
        }),
        stageModeEnabledSettingKey: 'stage-enabled',
        stageModeSourceSettingKey: 'stage-source',
        stageApiTokenSettingKey: 'stage-token',
        stageApiPortSettingKey: 'stage-port',
        defaultStageApiPort: port,
        getNeteasePort: () => 39999,
        searchStageSongs: undefined,
    });

    return { send, stageApi, values };
};

describe('Stage API source normalization', () => {
    it('preserves spotify-local while leaving the push API disabled', async () => {
        const { send, stageApi, values } = createStageSourceApi();

        expect(stageApi.buildStageStatus()).toMatchObject({
            enabled: true,
            modeEnabled: true,
            source: 'stage-api',
        });

        const status = await stageApi.setStageSource('spotify-local');
        expect(values.get('stage-source')).toBe('spotify-local');
        expect(status).toMatchObject({
            enabled: false,
            modeEnabled: true,
            source: 'spotify-local',
        });
        expect(send).toHaveBeenCalledWith('stage-session-updated', expect.objectContaining({
            source: 'spotify-local',
        }));
    });

    it.each([
        'stage-api',
        'now-playing',
        'playercap',
        'spotify',
        'spotify-local',
    ] as const)('accepts and persists the %s source', async (source) => {
        const { send, stageApi, values } = createStageSourceApi({ enabled: false });

        const status = await stageApi.setStageSource(source);

        expect(values.get('stage-source')).toBe(source);
        expect(status).toMatchObject({
            enabled: false,
            modeEnabled: false,
            source: null,
        });
        expect(send).toHaveBeenCalledWith('stage-session-updated', expect.objectContaining({
            modeEnabled: false,
            source: null,
        }));
    });

    it('rejects unsupported sources before persistence or synchronization', async () => {
        const { send, stageApi, values } = createStageSourceApi({ source: 'now-playing' });

        await expect(stageApi.setStageSource('not-a-stage-source')).rejects.toMatchObject({
            code: 'INVALID_STAGE_SOURCE',
            statusCode: 400,
        });

        expect(values.get('stage-source')).toBe('now-playing');
        expect(send).not.toHaveBeenCalled();
    });

    it('cleans up a failed listen and allows the next queued sync to recover', async () => {
        const blocker = http.createServer();
        const port = await listenOnEphemeralPort(blocker);
        const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'folia-stage-source-'));
        const { stageApi, values } = createStageSourceApi({
            enabled: false,
            port,
            userDataPath,
        });

        try {
            await expect(stageApi.setStageEnabled(true)).rejects.toMatchObject({
                code: 'EADDRINUSE',
            });
            expect(values.get('stage-enabled')).toBe(true);

            await closeHttpServer(blocker);

            const status = await stageApi.syncStageModeState();
            expect(status).toMatchObject({
                enabled: true,
                modeEnabled: true,
                source: 'stage-api',
                port,
            });

            const healthResponse = await fetch(`http://127.0.0.1:${port}/stage/health`);
            expect(healthResponse.ok).toBe(true);
            await expect(healthResponse.json()).resolves.toMatchObject({
                enabled: true,
                source: 'stage-api',
                port,
            });
        } finally {
            await closeHttpServer(blocker);
            await stageApi.stopStageServer();
            await rm(userDataPath, { recursive: true, force: true });
        }
    });

    it('serializes concurrent source transitions and leaves the final server running', async () => {
        const port = await getFreePort();
        const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'folia-stage-source-'));
        const { stageApi, values } = createStageSourceApi({
            enabled: false,
            port,
            userDataPath,
        });

        try {
            await stageApi.setStageEnabled(true);

            const [localStatus, apiStatus] = await Promise.all([
                stageApi.setStageSource('spotify-local'),
                stageApi.setStageSource('stage-api'),
            ]);

            expect(localStatus).toMatchObject({
                enabled: false,
                modeEnabled: true,
                source: 'spotify-local',
            });
            expect(apiStatus).toMatchObject({
                enabled: true,
                modeEnabled: true,
                source: 'stage-api',
            });
            expect(values.get('stage-source')).toBe('stage-api');

            const healthResponse = await fetch(`http://127.0.0.1:${port}/stage/health`);
            expect(healthResponse.ok).toBe(true);
            await expect(healthResponse.json()).resolves.toMatchObject({
                enabled: true,
                source: 'stage-api',
                port,
            });
        } finally {
            await stageApi.stopStageServer();
            await rm(userDataPath, { recursive: true, force: true });
        }
    });

    it('exposes the authoritative setter through Electron and renderer typing', async () => {
        const [mainSource, preloadSource, rendererTypes] = await Promise.all([
            readFile(new URL('../../../electron/main.cjs', import.meta.url), 'utf8'),
            readFile(new URL('../../../electron/preload.cjs', import.meta.url), 'utf8'),
            readFile(new URL('../../../src/vite-env.d.ts', import.meta.url), 'utf8'),
        ]);

        expect(mainSource).toContain("ipcMain.handle('stage-set-source'");
        expect(mainSource).toContain('return stageApi.setStageSource(source);');
        expect(preloadSource).toContain("setStageSource: (source) => ipcRenderer.invoke('stage-set-source', source)");
        expect(rendererTypes).toContain('setStageSource: (source: StageSource) => Promise<StageStatus>;');
    });
});
