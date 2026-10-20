import type { JsonValue } from '@/types/onlineMusic';
import { OnlineProviderError } from '@/types/onlineMusic';
import { omni } from '@/services/onlineMusic/omni';
import type { ModRuntimeInfo } from '../types';
import type {
    FoliumJsonValue,
    FoliumPlatformDescription,
    FoliumPlatformErrorCode,
    FoliumPlatformResponse,
    FoliumPlatformService,
} from './contract';
import { readFoliumAccountState } from './account';
import type { FoliumStoppedCheck } from './api';

// src/mods/folium/platformRaw.ts
// The experimental `platform.raw` (Folium 1.7, #788): a platform's own backend endpoints, called as the
// account signed in to Folia, for what Omni does not offer yet. Main window only (loaded with
// experimental.ts). Everything goes through Omni (`omni.requestProviderRaw`), which hands the call to
// the platform's adapter; the platform keeps the table of which endpoints read, which write and which
// are never open, and the adapter adds the session. Here: the mod's permissions against that table, its
// arguments, a cap on how often one mod may call, dropping an answer that comes after the account
// changed, and the platform's failures as the contract's codes.

/** Requests one mod may start in a minute, and may have under way at once. */
const RATE_WINDOW_MS = 60_000;
const RATE_PER_WINDOW = 60;
const MAX_IN_FLIGHT = 4;
/** The most `params` may weigh, as JSON. */
const MAX_PARAMS_LENGTH = 16 * 1024;
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** A rejection with one of the contract's codes, as the code and as the message. */
const platformError = (code: FoliumPlatformErrorCode): Error => Object.assign(new Error(code), { code });

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const isJsonValue = (value: unknown, depth: number): boolean => {
    if (depth > 16) return false;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (Array.isArray(value)) return value.every((item) => isJsonValue(item, depth + 1));
    return isPlainObject(value) && Object.values(value).every((item) => isJsonValue(item, depth + 1));
};

/* The parameters as Omni takes them, or a TypeError that says what is wrong with them. */
const checkParams = (params: unknown, reserved: readonly string[]): Record<string, JsonValue> => {
    if (params === undefined) return {};
    if (!isPlainObject(params)) throw new TypeError('invalid-params: params must be a plain object');
    for (const [name, value] of Object.entries(params)) {
        if (!PARAM_NAME.test(name)) throw new TypeError(`invalid-params: "${name}" is no parameter name (letters, digits and _)`);
        if (reserved.includes(name)) throw new TypeError(`invalid-params: "${name}" is set by the host`);
        if (!isJsonValue(value, 0)) throw new TypeError(`invalid-params: "${name}" is not a JSON value`);
    }
    if (JSON.stringify(params).length > MAX_PARAMS_LENGTH) throw new TypeError('invalid-params: params are over 16 KB as JSON');
    return params as Record<string, JsonValue>;
};

/*
 * A platform's failure as a contract code. `signedIn`: an account was signed in when the request was
 * sent, which tells a session that ran out from no session at all.
 */
const codeOfFailure = (error: unknown, signedIn: boolean): FoliumPlatformErrorCode => {
    if (error instanceof OnlineProviderError) {
        if (error.code === 'auth-required') return signedIn ? 'session-expired' : 'not-signed-in';
        if (error.code === 'subscription-required') return 'vip-required';
        if (error.code === 'unsupported') return 'unsupported';
        if (error.httpStatus === 429 || error.retryAfterMs !== undefined) return 'rate-limited';
    }
    return 'network';
};

/* Rejects with `aborted` as soon as `signal` aborts, whatever `work` is doing then. */
const untilAborted = <T>(work: Promise<T>, signal: AbortSignal): Promise<T> => new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(platformError('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
});

/**
 * `folium.experimental['platform.raw']` for one mod. `stopped` refuses calls after the activation was torn
 * down; `onRelease` receives the function that ends it, which aborts the requests still under way.
 */
export const createFoliumPlatformService = (
    mod: ModRuntimeInfo,
    stopped: FoliumStoppedCheck = () => false,
    onRelease: (release: () => void) => void = () => {},
): FoliumPlatformService => {
    const started: number[] = [];
    let inFlight = 0;
    // The requests under way, aborted when the activation ends: each then rejects with `aborted`.
    const underWay = new Set<AbortController>();
    onRelease(() => {
        underWay.forEach((controller) => controller.abort(new DOMException('The mod stopped', 'AbortError')));
        underWay.clear();
    });
    // Endpoints this mod has called, for the log line said once per endpoint.
    const told = new Set<string>();

    const describe = (providerId: string): FoliumPlatformDescription => {
        const info = typeof providerId === 'string' ? omni.getRawRequestInfo(providerId) : null;
        return info
            ? Object.freeze({ supported: true, backend: Object.freeze({ name: info.backend.name, version: info.backend.version }) })
            : Object.freeze({ supported: false });
    };

    const request = async (
        providerId: string,
        endpoint: string,
        params?: Record<string, FoliumJsonValue>,
        options?: { signal?: AbortSignal },
    ): Promise<FoliumPlatformResponse> => {
        if (typeof providerId !== 'string' || typeof endpoint !== 'string') {
            throw new TypeError('invalid-arguments: providerId and endpoint must be strings');
        }
        const signal = options?.signal;
        if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError('invalid-arguments: options.signal must be an AbortSignal');
        if (stopped('experimental platform.raw.request') || signal?.aborted) throw platformError('aborted');

        const info = omni.getRawRequestInfo(providerId);
        if (!info) throw platformError('unsupported');
        const rule = omni.describeRawEndpoint(providerId, endpoint);
        if (!rule || rule.access === 'denied') {
            console.warn(`[Folium:${mod.id}] platform.raw ${providerId} ${endpoint}: refused, the platform does not open this endpoint`);
            throw platformError('endpoint-denied');
        }
        const needed = rule.access === 'write'
            ? [`platform.${providerId}.read`, `platform.${providerId}.write`]
            : [`platform.${providerId}.read`];
        const missing = needed.find((permission) => !mod.permissions.includes(permission));
        if (missing) throw platformError(`permission-denied:${missing}`);
        const sent = checkParams(params, info.reservedParams);
        // The values too, as the platform reads them: one it puts into the upstream path must not lead
        // the session-bearing request to another endpoint (`id: '../../logout'`).
        const problem = omni.checkRawParams(providerId, endpoint, sent);
        if (problem !== null) throw new TypeError(`invalid-params: ${problem}`);

        const now = Date.now();
        while (started.length > 0 && now - started[0] >= RATE_WINDOW_MS) started.shift();
        if (started.length >= RATE_PER_WINDOW || inFlight >= MAX_IN_FLIGHT) {
            console.warn(`[Folium:${mod.id}] platform.raw ${providerId} ${endpoint}: refused, over ${RATE_PER_WINDOW} requests a minute or ${MAX_IN_FLIGHT} at once`);
            throw platformError('rate-limited');
        }
        if (!told.has(`${providerId}\n${endpoint}`)) {
            told.add(`${providerId}\n${endpoint}`);
            console.info(rule.omni
                ? `[Folium:${mod.id}] platform.raw ${providerId} ${endpoint}: Omni already offers this (omni.${rule.omni}); the host's typed interface is the one to use where it has it`
                : `[Folium:${mod.id}] platform.raw ${providerId} ${endpoint}: first call (${rule.access})`);
        }

        // The account the request is made as. An answer that comes after a switch of the provider or the
        // account is dropped: it may be the previous account's.
        const generation = omni.getActiveRequestGeneration();
        const before = readFoliumAccountState(providerId);
        const signedIn = before?.status === 'signed-in';
        // Aborted by the caller's signal or by the end of the activation, whichever comes first.
        const controller = new AbortController();
        const abort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', abort, { once: true });
        underWay.add(controller);
        started.push(now);
        inFlight += 1;
        try {
            const work = omni.requestProviderRaw(providerId, endpoint, sent, controller.signal);
            let body: JsonValue;
            try {
                body = await untilAborted(work, controller.signal);
            } catch (error) {
                if (controller.signal.aborted) throw platformError('aborted');
                if ((error as { code?: unknown } | null)?.code === 'aborted') throw error;
                const code = codeOfFailure(error, signedIn);
                console.warn(`[Folium:${mod.id}] platform.raw ${providerId} ${endpoint}: ${code}`, error);
                throw platformError(code);
            }
            const after = readFoliumAccountState(providerId);
            if (generation !== omni.getActiveRequestGeneration() || (after?.accountKey ?? null) !== (before?.accountKey ?? null)) {
                console.warn(`[Folium:${mod.id}] platform.raw ${providerId} ${endpoint}: the account changed while it was under way; the answer is dropped`);
                throw platformError('account-changed');
            }
            return Object.freeze({ body, accountKey: after?.accountKey ?? null });
        } finally {
            inFlight -= 1;
            underWay.delete(controller);
            signal?.removeEventListener('abort', abort);
        }
    };

    return Object.freeze({ describe, request });
};
