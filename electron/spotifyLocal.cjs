const { execFile: defaultExecFile } = require('child_process');

// electron/spotifyLocal.cjs
// Reads the desktop Spotify client's media session without Spotify Web API credentials.

const EXEC_MAX_BUFFER_BYTES = 256 * 1024;
const PROCESS_CHECK_TIMEOUT_MS = 2_000;
const PLAYBACK_PROBE_TIMEOUT_MS = 5_000;
const MAC_DURATION_POSITION_TOLERANCE_MS = 2_000;
const MAC_MIN_PLAUSIBLE_DURATION_MS = 30_000;
const PLAYERCTL_FIELD_SEPARATOR = '\u001f';

const MAC_SPOTIFY_SCRIPT = `
use framework "Foundation"

on putText(payload, fieldName, fieldValue)
  if fieldValue is missing value then
    payload's setObject:"" forKey:fieldName
  else
    payload's setObject:(fieldValue as text) forKey:fieldName
  end if
end putText

set payload to current application's NSMutableDictionary's dictionary()
payload's setObject:true forKey:"running"

tell application "Spotify"
  set playbackState to player state as text
  my putText(payload, "state", playbackState)

  if playbackState is not "stopped" then
    set spotifyTrack to current track
    my putText(payload, "title", name of spotifyTrack)
    my putText(payload, "artist", artist of spotifyTrack)
    my putText(payload, "album", album of spotifyTrack)

    try
      my putText(payload, "id", id of spotifyTrack)
    on error
      my putText(payload, "id", "")
    end try

    try
      my putText(payload, "uri", spotify url of spotifyTrack)
    on error
      my putText(payload, "uri", "")
    end try

    try
      my putText(payload, "coverUrl", artwork url of spotifyTrack)
    on error
      my putText(payload, "coverUrl", "")
    end try

    try
      payload's setObject:(duration of spotifyTrack as integer) forKey:"duration"
    on error
      payload's setObject:0 forKey:"duration"
    end try

    try
      payload's setObject:(player position as real) forKey:"position"
    on error
      payload's setObject:0 forKey:"position"
    end try
  end if
end tell

set {jsonData, jsonError} to current application's NSJSONSerialization's dataWithJSONObject:payload options:0 |error|:(reference)
if jsonData is missing value then error (jsonError's localizedDescription() as text)
return (current application's NSString's alloc()'s initWithData:jsonData encoding:(current application's NSUTF8StringEncoding)) as text
`.trim();

// PowerShell is kept as one fixed program argument; no renderer or metadata value is interpolated.
const WINDOWS_GSMTC_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]

function Await-WinRtOperation($operation, [Type]$resultType) {
  $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.IsGenericMethod -and
      $_.GetGenericArguments().Count -eq 1 -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  $task = $asTaskMethod.MakeGenericMethod($resultType).Invoke($null, [object[]]@($operation))
  $task.Wait()
  return $task.Result
}

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$manager = Await-WinRtOperation ($managerType::RequestAsync()) $managerType
$session = $null
$sessionRank = -1

foreach ($candidate in $manager.GetSessions()) {
  if ([string]$candidate.SourceAppUserModelId -notmatch '(?i)spotify') {
    continue
  }
  $candidateStatus = $candidate.GetPlaybackInfo().PlaybackStatus.ToString()
  $candidateRank = 0
  if ($candidateStatus -eq 'Playing') {
    $candidateRank = 2
  } elseif ($candidateStatus -eq 'Paused') {
    $candidateRank = 1
  }
  if ($candidateRank -gt $sessionRank) {
    $session = $candidate
    $sessionRank = $candidateRank
  }
  if ($candidateRank -eq 2) {
    break
  }
}

if ($null -eq $session) {
  @{ running = $false } | ConvertTo-Json -Compress
  exit 0
}

$mediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$media = Await-WinRtOperation ($session.TryGetMediaPropertiesAsync()) $mediaType
$playbackInfo = $session.GetPlaybackInfo()
$timeline = $session.GetTimelineProperties()
$state = $playbackInfo.PlaybackStatus.ToString().ToLowerInvariant()
$durationMs = [Math]::Max(0, [Math]::Round(($timeline.EndTime - $timeline.StartTime).TotalMilliseconds))
$positionMs = [Math]::Max(0, [Math]::Round(($timeline.Position - $timeline.StartTime).TotalMilliseconds))

if ($state -eq 'playing') {
  $rate = 1.0
  if ($null -ne $playbackInfo.PlaybackRate) {
    $rate = [double]$playbackInfo.PlaybackRate
  }
  $elapsedMs = ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalMilliseconds
  if ($elapsedMs -gt 0) {
    $positionMs += [Math]::Round($elapsedMs * $rate)
  }
}

if ($durationMs -gt 0) {
  $positionMs = [Math]::Min($durationMs, $positionMs)
}

@{
  running = $true
  state = $state
  id = $null
  uri = $null
  type = 'track'
  title = [string]$media.Title
  artist = [string]$media.Artist
  album = [string]$media.AlbumTitle
  coverUrl = $null
  durationMs = [double]$durationMs
  progressMs = [double]$positionMs
  sourceId = [string]$session.SourceAppUserModelId
} | ConvertTo-Json -Compress
`.trim();

const PLAYERCTL_FORMAT = [
  '{{status}}',
  '{{mpris:trackid}}',
  '{{xesam:url}}',
  '{{xesam:title}}',
  '{{xesam:artist}}',
  '{{xesam:album}}',
  '{{mpris:artUrl}}',
  '{{mpris:length}}',
  '{{position}}',
].join(PLAYERCTL_FIELD_SEPARATOR);

const PLAYERCTL_ARGS = Object.freeze([
  '--player=spotify',
  'metadata',
  '--format',
  PLAYERCTL_FORMAT,
]);

const GDBUS_LIST_NAMES_ARGS = Object.freeze([
  'call',
  '--session',
  '--dest',
  'org.freedesktop.DBus',
  '--object-path',
  '/org/freedesktop/DBus',
  '--method',
  'org.freedesktop.DBus.ListNames',
]);

const SPOTIFY_MPRIS_SERVICE_PATTERN = /^org\.mpris\.MediaPlayer2\.spotify(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/i;

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toOptionalString = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
};

const stringifyError = (error) => (
  error instanceof Error ? error.message : String(error || 'Unknown error')
);

const parseJsonObject = (output, label) => {
  const normalized = typeof output === 'string' ? output.trim() : '';
  if (!normalized) {
    throw new Error(`${label} returned no output.`);
  }

  const candidates = [normalized, ...normalized.split(/\r?\n/).reverse()];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Some PowerShell hosts emit a harmless banner before the JSON line.
    }
  }

  throw new Error(`${label} returned malformed JSON.`);
};

const normalizeMacSpotifyDurationMs = (duration, options = {}) => {
  const rawDuration = Math.max(0, toFiniteNumber(duration));
  if (rawDuration === 0) {
    return 0;
  }

  const positionMs = Math.max(0, toFiniteNumber(options.positionMs));
  if (positionMs > rawDuration + MAC_DURATION_POSITION_TOLERANCE_MS) {
    return Math.floor(rawDuration * 1000);
  }

  // Current clients report milliseconds despite the sdef saying seconds. Values below a
  // plausible native duration are treated as legacy seconds when position cannot disambiguate.
  if (rawDuration >= MAC_MIN_PLAUSIBLE_DURATION_MS) {
    return Math.floor(rawDuration);
  }
  return Math.floor(rawDuration * 1000);
};

const parseMacSpotifyOutput = (output) => {
  const payload = parseJsonObject(output, 'Spotify AppleScript');
  if (payload.running === false || String(payload.state || '').toLowerCase() === 'stopped') {
    return { running: false, backend: 'applescript' };
  }

  const progressMs = Math.max(0, toFiniteNumber(payload.position) * 1000);
  return {
    ...payload,
    running: true,
    backend: 'applescript',
    durationMs: normalizeMacSpotifyDurationMs(payload.duration, {
      positionMs: progressMs,
    }),
    progressMs,
    sourceId: 'com.spotify.client',
  };
};

const parseWindowsSpotifyOutput = (output) => ({
  ...parseJsonObject(output, 'Spotify GSMTC'),
  backend: 'gsmtc',
});

const parsePlayerctlSpotifyOutput = (output) => {
  const normalized = typeof output === 'string' ? output.replace(/[\r\n]+$/, '') : '';
  if (!normalized) {
    return { running: false, backend: 'playerctl' };
  }

  const fields = normalized.split(PLAYERCTL_FIELD_SEPARATOR);
  if (fields.length !== 9) {
    throw new Error('Spotify playerctl returned an unexpected field count.');
  }

  const [state, id, uri, title, artist, album, coverUrl, durationUs, positionUs] = fields;
  return {
    running: true,
    backend: 'playerctl',
    state,
    id,
    uri,
    title,
    artist,
    album,
    coverUrl,
    durationMs: Math.max(0, toFiniteNumber(durationUs) / 1000),
    progressMs: Math.max(0, toFiniteNumber(positionUs) / 1000),
    sourceId: 'org.mpris.MediaPlayer2.spotify',
  };
};

const unescapeGVariantString = (value) => String(value || '')
  .replace(/\\x([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
  .replace(/\\u([0-9a-f]{4})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\r')
  .replace(/\\t/g, '\t')
  .replace(/\\(['"\\])/g, '$1');

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractGVariantString = (output, key) => {
  const quotedValue = "(?:'((?:\\\\.|[^'])*)'|\"((?:\\\\.|[^\"])*)\")";
  const pattern = new RegExp(
    `[\"']${escapeRegExp(key)}[\"']\\s*:\\s*<\\s*(?:objectpath\\s+|@[a-z0-9{}()]+\\s+)?${quotedValue}\\s*>`,
    'i',
  );
  const match = pattern.exec(String(output || ''));
  return match ? unescapeGVariantString(match[1] ?? match[2] ?? '') : '';
};

const extractGVariantNumber = (output, key) => {
  const pattern = new RegExp(
    `[\"']${escapeRegExp(key)}[\"']\\s*:\\s*<\\s*(?:(?:u?int(?:16|32|64)|double)\\s+)?(-?\\d+(?:\\.\\d+)?)\\s*>`,
    'i',
  );
  return toFiniteNumber(pattern.exec(String(output || ''))?.[1]);
};

const extractGVariantStringArray = (output, key) => {
  const pattern = new RegExp(
    `[\"']${escapeRegExp(key)}[\"']\\s*:\\s*<\\s*\\[((?:\\\\.|[^\\]])*)\\]\\s*>`,
    'i',
  );
  const arrayMatch = pattern.exec(String(output || ''));
  if (!arrayMatch) {
    return [];
  }

  const values = [];
  const valuePattern = /'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"/g;
  let match;
  while ((match = valuePattern.exec(arrayMatch[1])) !== null) {
    values.push(unescapeGVariantString(match[1] ?? match[2] ?? ''));
  }
  return values;
};

const findSpotifyMprisService = (output) => {
  const matches = [];
  const namePattern = /['"](org\.mpris\.MediaPlayer2\.spotify(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)['"]/gi;
  let match;
  while ((match = namePattern.exec(String(output || ''))) !== null) {
    if (SPOTIFY_MPRIS_SERVICE_PATTERN.test(match[1])) {
      matches.push(match[1]);
    }
  }
  return matches.sort((left, right) => {
    const leftExact = left.toLowerCase() === 'org.mpris.mediaplayer2.spotify';
    const rightExact = right.toLowerCase() === 'org.mpris.mediaplayer2.spotify';
    if (leftExact !== rightExact) return leftExact ? -1 : 1;
    return left.localeCompare(right);
  })[0] || null;
};

const parseGdbusSpotifyOutput = (output, serviceName) => {
  if (!SPOTIFY_MPRIS_SERVICE_PATTERN.test(serviceName || '')) {
    throw new Error('Spotify returned an invalid MPRIS service name.');
  }

  const artists = extractGVariantStringArray(output, 'xesam:artist');
  return {
    running: true,
    backend: 'gdbus',
    state: extractGVariantString(output, 'PlaybackStatus'),
    id: extractGVariantString(output, 'mpris:trackid'),
    uri: extractGVariantString(output, 'xesam:url'),
    title: extractGVariantString(output, 'xesam:title'),
    artist: artists.join(', '),
    album: extractGVariantString(output, 'xesam:album'),
    coverUrl: extractGVariantString(output, 'mpris:artUrl'),
    durationMs: Math.max(0, extractGVariantNumber(output, 'mpris:length') / 1000),
    progressMs: Math.max(0, extractGVariantNumber(output, 'Position') / 1000),
    sourceId: serviceName,
  };
};

const normalizeSpotifyLocalPlayback = (payload, nowMs = Date.now()) => {
  const state = String(payload?.state || '').trim().toLowerCase();
  if (!payload || payload.running === false || ['stopped', 'closed', 'opened'].includes(state)) {
    return null;
  }
  if (payload.running !== true) {
    throw new Error('Spotify local playback payload did not confirm a running session.');
  }
  if (state !== 'playing' && state !== 'paused') {
    throw new Error(`Spotify local playback returned an invalid state: ${state || 'missing'}.`);
  }

  const id = toOptionalString(payload.id);
  const uri = toOptionalString(payload.uri);
  const title = toOptionalString(payload.title);
  if (!id && !uri && !title) {
    throw new Error('Spotify local playback returned no track metadata.');
  }

  const durationMs = Math.max(0, Math.floor(toFiniteNumber(payload.durationMs)));
  const rawProgressMs = Math.max(0, Math.floor(toFiniteNumber(payload.progressMs)));
  const progressMs = durationMs > 0 ? Math.min(rawProgressMs, durationMs) : rawProgressMs;
  const rawType = toOptionalString(payload.type)?.toLowerCase();

  return {
    id: id || uri,
    uri,
    type: rawType === 'episode' || uri?.includes(':episode:') ? 'episode' : 'track',
    title: title || 'Spotify',
    artist: Array.isArray(payload.artist)
      ? payload.artist.map(toOptionalString).filter(Boolean).join(', ') || 'Spotify'
      : toOptionalString(payload.artist) || 'Spotify',
    album: toOptionalString(payload.album) || '',
    coverUrl: toOptionalString(payload.coverUrl),
    durationMs,
    progressMs,
    isPlaying: state === 'playing',
    sampledAtMs: Math.floor(toFiniteNumber(nowMs, Date.now())),
    device: {
      id: toOptionalString(payload.sourceId),
      name: 'Spotify',
      type: 'Computer',
      isRestricted: false,
    },
  };
};

const runExecFile = (execFileImpl, file, args, { timeoutMs, signal } = {}) => new Promise((resolve, reject) => {
  const options = {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: EXEC_MAX_BUFFER_BYTES,
    windowsHide: true,
  };
  if (signal) {
    options.signal = signal;
  }

  try {
    execFileImpl(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        error.stderr = typeof stderr === 'string' ? stderr : '';
        reject(error);
        return;
      }
      resolve(typeof stdout === 'string' ? stdout : String(stdout || ''));
    });
  } catch (error) {
    reject(error);
  }
});

const isProcessNotFound = (error) => Number(error?.code) === 1;

const probeMacSpotify = async (run, signal) => {
  try {
    await run('/usr/bin/pgrep', ['-xq', 'Spotify'], {
      timeoutMs: PROCESS_CHECK_TIMEOUT_MS,
      signal,
    });
  } catch (error) {
    if (isProcessNotFound(error)) {
      return { running: false, backend: 'applescript' };
    }
    throw error;
  }

  const output = await run('/usr/bin/osascript', ['-l', 'AppleScript', '-e', MAC_SPOTIFY_SCRIPT], {
    timeoutMs: PLAYBACK_PROBE_TIMEOUT_MS,
    signal,
  });
  return parseMacSpotifyOutput(output);
};

const probeWindowsSpotify = async (run, signal) => {
  const output = await run('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    WINDOWS_GSMTC_SCRIPT,
  ], {
    timeoutMs: PLAYBACK_PROBE_TIMEOUT_MS,
    signal,
  });
  return parseWindowsSpotifyOutput(output);
};

const buildGdbusGetAllArgs = (serviceName) => {
  if (!SPOTIFY_MPRIS_SERVICE_PATTERN.test(serviceName || '')) {
    throw new Error('Spotify returned an invalid MPRIS service name.');
  }
  return [
    'call',
    '--session',
    '--dest',
    serviceName,
    '--object-path',
    '/org/mpris/MediaPlayer2',
    '--method',
    'org.freedesktop.DBus.Properties.GetAll',
    'org.mpris.MediaPlayer2.Player',
  ];
};

const probeLinuxSpotify = async (run, signal) => {
  try {
    const output = await run('playerctl', PLAYERCTL_ARGS, {
      timeoutMs: PLAYBACK_PROBE_TIMEOUT_MS,
      signal,
    });
    return parsePlayerctlSpotifyOutput(output);
  } catch (playerctlError) {
    let namesOutput;
    try {
      namesOutput = await run('gdbus', GDBUS_LIST_NAMES_ARGS, {
        timeoutMs: PLAYBACK_PROBE_TIMEOUT_MS,
        signal,
      });
    } catch (gdbusError) {
      throw new Error(
        `Neither playerctl nor gdbus could read Spotify (${stringifyError(playerctlError)}; ${stringifyError(gdbusError)}).`,
      );
    }

    const serviceName = findSpotifyMprisService(namesOutput);
    if (!serviceName) {
      return { running: false, backend: 'gdbus' };
    }

    const output = await run('gdbus', buildGdbusGetAllArgs(serviceName), {
      timeoutMs: PLAYBACK_PROBE_TIMEOUT_MS,
      signal,
    });
    return parseGdbusSpotifyOutput(output, serviceName);
  }
};

const resolveSpotifyLocalBackend = (platform) => {
  if (platform === 'darwin') return 'applescript';
  if (platform === 'win32') return 'gsmtc';
  if (platform === 'linux') return 'playerctl';
  return null;
};

function createSpotifyLocalController(options = {}) {
  const platform = typeof options.platform === 'string' ? options.platform : process.platform;
  const execFileImpl = typeof options.execFile === 'function' ? options.execFile : defaultExecFile;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const run = (file, args, runOptions) => runExecFile(execFileImpl, file, args, runOptions);

  const getPlayback = async ({ signal } = {}) => {
    try {
      let payload;
      if (platform === 'darwin') {
        payload = await probeMacSpotify(run, signal);
      } else if (platform === 'win32') {
        payload = await probeWindowsSpotify(run, signal);
      } else if (platform === 'linux') {
        payload = await probeLinuxSpotify(run, signal);
      } else {
        throw new Error(`Spotify local playback is not supported on ${platform}.`);
      }

      return {
        playback: normalizeSpotifyLocalPlayback(payload, now()),
        retryAfterMs: null,
      };
    } catch (error) {
      const aborted = signal?.aborted || error?.name === 'AbortError';
      return {
        playback: null,
        retryAfterMs: null,
        error: aborted
          ? 'Spotify local playback request was cancelled.'
          : `Spotify local playback probe failed: ${stringifyError(error)}`,
      };
    }
  };

  const getStatus = () => ({
    supported: resolveSpotifyLocalBackend(platform) !== null,
    platform,
    backend: resolveSpotifyLocalBackend(platform),
  });

  return {
    getPlayback,
    getStatus,
  };
}

module.exports = {
  EXEC_MAX_BUFFER_BYTES,
  PLAYERCTL_FIELD_SEPARATOR,
  createSpotifyLocalController,
  findSpotifyMprisService,
  normalizeMacSpotifyDurationMs,
  normalizeSpotifyLocalPlayback,
  parseGdbusSpotifyOutput,
  parseMacSpotifyOutput,
  parsePlayerctlSpotifyOutput,
  parseWindowsSpotifyOutput,
  resolveSpotifyLocalBackend,
};
