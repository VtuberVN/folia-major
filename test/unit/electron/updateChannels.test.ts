import { describe, expect, it } from 'vitest';

// test/unit/electron/updateChannels.test.ts

const {
    compareVersions,
    getReleaseUrl,
    getUpdateDiscoveryConfig,
    getUpdateProviderConfig,
    parseUpdateMetadataVersion,
    migrateVietnameseChannelPreference,
    resolveReleaseChannel,
} = require('../../../electron/updateChannels.cjs') as {
    compareVersions: (left: string, right: string) => number;
    getReleaseUrl: (channel: string | null, version: string, releasesUrl: string) => string;
    getUpdateProviderConfig: (
        releaseChannel: {
            updaterChannel: string | null;
            updateEnabled: boolean;
            rollingReleaseTag: string | null;
        },
        github: { owner: string; repo: string },
    ) => Record<string, unknown> | null;
    getUpdateDiscoveryConfig: (
        releaseChannel: {
            updaterChannel: string | null;
            updateEnabled: boolean;
            rollingReleaseTag: string | null;
        },
        github: { owner: string; repo: string },
    ) => { format: string; url: string } | null;
    parseUpdateMetadataVersion: (text: string) => string;
    migrateVietnameseChannelPreference: (input: {
        version: string; declaredChannel?: string | null; storedChannel?: string; migrationComplete?: boolean;
    }) => { channel?: string; migrationComplete: boolean };
    resolveReleaseChannel: (version: string, declaredChannel?: string | null) => {
        id: string;
        updaterChannel: string | null;
        allowPrerelease: boolean;
        updateEnabled: boolean;
        rollingReleaseTag: string | null;
    };
};

describe('release update channels', () => {
    it('uses packaged metadata before inferring a legacy version suffix', () => {
        expect(resolveReleaseChannel('0.7.0-beta.1', 'internal')).toMatchObject({
            id: 'internal',
            updaterChannel: null,
            updateEnabled: false,
        });
    });

    it.each([
        ['0.7.0', 'realeco', 'latest', false],
        ['0.7.16-vi.1', 'vietnamese', 'vi', true],
        ['0.7.0-beta.123', 'limo', 'beta', true],
        ['0.7.0-alpha.123', 'cielo', 'alpha', true],
    ])('maps %s to the %s lane', (version, id, updaterChannel, allowPrerelease) => {
        expect(resolveReleaseChannel(version)).toMatchObject({ id, updaterChannel, allowPrerelease });
    });

    it('opens rolling prereleases instead of manufacturing a semver tag', () => {
        const releasesUrl = 'https://github.com/chthollyphile/folia-major/releases';

        expect(getReleaseUrl('limo', '0.7.0-beta.123', releasesUrl)).toBe(`${releasesUrl}/tag/limo`);
        expect(getReleaseUrl('cielo', '0.7.0-alpha.123', releasesUrl)).toBe(`${releasesUrl}/tag/cielo`);
        expect(getReleaseUrl('realeco', '0.7.0', releasesUrl)).toBe(`${releasesUrl}/tag/v0.7.0`);
    });

    it('reads rolling prerelease metadata directly instead of using the GitHub release feed', () => {
        const github = { owner: 'chthollyphile', repo: 'folia-major' };

        expect(getUpdateProviderConfig(resolveReleaseChannel('0.7.0-beta.123', 'limo'), github)).toEqual({
            provider: 'generic',
            url: 'https://github.com/chthollyphile/folia-major/releases/download/limo/',
            channel: 'beta',
            useMultipleRangeRequest: false,
        });
        expect(getUpdateProviderConfig(resolveReleaseChannel('0.7.0-alpha.123', 'cielo'), github)).toEqual({
            provider: 'generic',
            url: 'https://github.com/chthollyphile/folia-major/releases/download/cielo/',
            channel: 'alpha',
            useMultipleRangeRequest: false,
        });
    });

    it('restores the GitHub provider after switching back to Realeco', () => {
        expect(getUpdateProviderConfig(
            resolveReleaseChannel('0.7.0', 'realeco'),
            { owner: 'chthollyphile', repo: 'folia-major' },
        )).toEqual({
            provider: 'github',
            owner: 'chthollyphile',
            repo: 'folia-major',
            channel: 'latest',
        });
    });

    it('builds discovery endpoints for stable and rolling channels', () => {
        const github = { owner: 'chthollyphile', repo: 'folia-major' };

        expect(getUpdateDiscoveryConfig(resolveReleaseChannel('0.7.3', 'realeco'), github)).toEqual({
            format: 'yaml',
            url: 'https://github.com/chthollyphile/folia-major/releases/latest/download/latest.yml',
        });
        expect(getUpdateDiscoveryConfig(resolveReleaseChannel('0.7.4-beta.1', 'limo'), github)).toEqual({
            format: 'yaml',
            url: 'https://github.com/chthollyphile/folia-major/releases/download/limo/beta.yml',
        });
    });

    it('compares stable and timestamped prerelease versions', () => {
        expect(compareVersions('0.7.4', '0.7.3')).toBe(1);
        expect(compareVersions('0.7.4', '0.7.4-beta.1788851094')).toBe(1);
        expect(compareVersions('0.7.4-beta.1788851094', '0.7.4-beta.1788763093')).toBe(1);
        expect(compareVersions('0.7.4-alpha.2', '0.7.4-alpha.10')).toBe(-1);
        expect(compareVersions('v0.7.4', '0.7.4')).toBe(0);
    });

    it('reads the version from electron-builder channel metadata', () => {
        expect(parseUpdateMetadataVersion("version: 0.7.4-beta.1788851094\nfiles:\n  - url: Folia.exe\n"))
            .toBe('0.7.4-beta.1788851094');
    });

    it('isolates Vietnamese metadata and downloads from stable and beta releases', () => {
        const github = { owner: 'Lynx-1ST', repo: 'folia-major' };
        const lane = resolveReleaseChannel('0.7.16-vi.2', 'vietnamese');
        expect(getReleaseUrl(lane.id, '0.7.16-vi.2', 'https://github.com/Lynx-1ST/folia-major/releases'))
            .toBe('https://github.com/Lynx-1ST/folia-major/releases/tag/vietnamese');
        expect(getUpdateProviderConfig(lane, github)).toEqual({
            provider: 'generic',
            url: 'https://github.com/Lynx-1ST/folia-major/releases/download/vietnamese/',
            channel: 'vi',
            useMultipleRangeRequest: false,
        });
        expect(getUpdateDiscoveryConfig(lane, github)).toEqual({
            format: 'yaml',
            url: 'https://github.com/Lynx-1ST/folia-major/releases/download/vietnamese/vi.yml',
        });
    });

    it.each([undefined, 'realeco'])('migrates legacy Vietnamese preferences %s once', (storedChannel) => {
        const result = migrateVietnameseChannelPreference({
            version: '0.7.16-vi.1', declaredChannel: 'realeco', storedChannel,
        });
        expect(result).toEqual({ channel: 'vietnamese', migrationComplete: true });
        // After migration, switching to stable intentionally must survive every restart.
        expect(migrateVietnameseChannelPreference({
            version: '0.7.16-vi.2', declaredChannel: 'vietnamese', storedChannel: 'realeco',
            migrationComplete: result.migrationComplete,
        })).toEqual({ channel: 'realeco', migrationComplete: true });
    });

    it.each(['limo', 'cielo', 'vietnamese'])('preserves an existing %s selection during migration', (storedChannel) => {
        expect(migrateVietnameseChannelPreference({ version: '0.7.16-vi.1', storedChannel }))
            .toEqual({ channel: storedChannel, migrationComplete: true });
    });

    it('recognizes explicit Vietnamese packaging but leaves non-Vietnamese installations alone', () => {
        expect(migrateVietnameseChannelPreference({
            version: '0.7.17', declaredChannel: 'vietnamese', storedChannel: 'realeco',
        })).toEqual({ channel: 'vietnamese', migrationComplete: true });
        expect(migrateVietnameseChannelPreference({
            version: '0.7.17', declaredChannel: 'realeco', storedChannel: 'realeco',
        })).toEqual({ channel: 'realeco', migrationComplete: false });
        expect(resolveReleaseChannel('0.7.16-vi.2', 'realeco').id).toBe('realeco');
        expect(compareVersions('0.7.16-vi.10', '0.7.16-vi.2')).toBe(1);
    });
});
