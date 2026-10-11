// src/services/onlineMusic/spotify/spotifyAuth.ts
// Spotify OAuth & Client Credentials Authentication Manager for Folia.

export const SPOTIFY_CLIENT_ID_KEY = 'folia_spotify_client_id';
export const SPOTIFY_CLIENT_SECRET_KEY = 'folia_spotify_client_secret';
export const SPOTIFY_ACCESS_TOKEN_KEY = 'folia_spotify_access_token';
export const SPOTIFY_REFRESH_TOKEN_KEY = 'folia_spotify_refresh_token';
export const SPOTIFY_TOKEN_EXPIRY_KEY = 'folia_spotify_token_expiry';

// Default public developer credentials for demo/fallback (user can override in Settings)
export const DEFAULT_SPOTIFY_CLIENT_ID = '27a71e3b692040e3a6113b28b6d817de';
export const DEFAULT_SPOTIFY_CLIENT_SECRET = '';

let inMemoryToken = '';
let inMemoryExpiry = 0;
let inMemoryClientId = '';
let inMemoryClientSecret = '';

function getStorageItem(key: string): string {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(key) || '';
}

function setStorageItem(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    if (value) {
        localStorage.setItem(key, value);
    } else {
        localStorage.removeItem(key);
    }
}

export function getSpotifyClientId(): string {
    return inMemoryClientId || getStorageItem(SPOTIFY_CLIENT_ID_KEY) || DEFAULT_SPOTIFY_CLIENT_ID;
}

export function getSpotifyClientSecret(): string {
    return inMemoryClientSecret || getStorageItem(SPOTIFY_CLIENT_SECRET_KEY) || DEFAULT_SPOTIFY_CLIENT_SECRET;
}

export function setSpotifyCredentials(clientId: string, clientSecret: string = ''): void {
    inMemoryClientId = clientId.trim();
    inMemoryClientSecret = clientSecret.trim();
    setStorageItem(SPOTIFY_CLIENT_ID_KEY, clientId.trim());
    setStorageItem(SPOTIFY_CLIENT_SECRET_KEY, clientSecret.trim());
    // Clear existing token to force refresh
    inMemoryToken = '';
    inMemoryExpiry = 0;
    setStorageItem(SPOTIFY_ACCESS_TOKEN_KEY, '');
    setStorageItem(SPOTIFY_TOKEN_EXPIRY_KEY, '');
}

export function getStoredSpotifyAccessToken(): string {
    return inMemoryToken || getStorageItem(SPOTIFY_ACCESS_TOKEN_KEY);
}

export function setSpotifyUserToken(accessToken: string, expiresInSeconds: number = 3600, refreshToken: string = ''): void {
    inMemoryToken = accessToken.trim();
    inMemoryExpiry = Date.now() + (expiresInSeconds - 60) * 1000;
    setStorageItem(SPOTIFY_ACCESS_TOKEN_KEY, accessToken.trim());
    setStorageItem(SPOTIFY_TOKEN_EXPIRY_KEY, String(inMemoryExpiry));
    if (refreshToken) {
        setStorageItem(SPOTIFY_REFRESH_TOKEN_KEY, refreshToken.trim());
    }
}

export function clearSpotifyAuth(): void {
    inMemoryToken = '';
    inMemoryExpiry = 0;
    setStorageItem(SPOTIFY_ACCESS_TOKEN_KEY, '');
    setStorageItem(SPOTIFY_REFRESH_TOKEN_KEY, '');
    setStorageItem(SPOTIFY_TOKEN_EXPIRY_KEY, '');
}

/**
 * Gets a valid Spotify access token, requesting a new one via Client Credentials if expired.
 */
export async function getValidSpotifyAccessToken(): Promise<string> {
    const storedToken = getStoredSpotifyAccessToken();
    const storedExpiry = inMemoryExpiry || Number(getStorageItem(SPOTIFY_TOKEN_EXPIRY_KEY) || 0);

    if (storedToken && Date.now() < storedExpiry) {
        return storedToken;
    }

    const clientId = getSpotifyClientId();
    const clientSecret = getSpotifyClientSecret();

    if (!clientId) {
        throw new Error('Spotify Client ID is not configured.');
    }

    // If client secret is available, request token via Client Credentials flow
    if (clientSecret) {
        try {
            const authHeader = typeof btoa === 'function'
                ? btoa(`${clientId}:${clientSecret}`)
                : Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`,
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                }).toString(),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.access_token) {
                    setSpotifyUserToken(data.access_token, data.expires_in || 3600);
                    return data.access_token;
                }
            } else {
                console.warn('[SpotifyAuth] Client credentials token request failed:', res.status);
            }
        } catch (err) {
            console.warn('[SpotifyAuth] Token request error:', err);
        }
    }

    // If stored token exists even if expired, return it as fallback
    if (storedToken) {
        return storedToken;
    }

    throw new Error('No valid Spotify token available. Please configure Spotify credentials or sign in.');
}

/**
 * Generates Spotify OAuth 2.0 Authorization URL for user login.
 */
export function getSpotifyAuthUrl(redirectUri: string = 'http://localhost:8888/callback'): string {
    const clientId = getSpotifyClientId();
    const scopes = [
        'user-read-private',
        'user-read-email',
        'playlist-read-private',
        'playlist-read-collaborative',
        'user-library-read',
        'user-top-read',
        'streaming',
    ].join(' ');

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: scopes,
        show_dialog: 'true',
    });

    return `https://accounts.spotify.com/authorize?${params.toString()}`;
}
