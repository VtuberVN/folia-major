// native/wasapi/src/renderer.rs
//
// WASAPI exclusive-mode (bit-perfect) renderer driven from a dedicated COM thread.
//
// The renderer owns one playback thread that performs all WASAPI/COM work (MTA), while the
// public API only touches shared state (ring buffer + stats) so it can be called from any
// napi thread, including Node worker threads. Commands that change device state (open / start /
// stop / close) travel over an mpsc channel and report back through oneshot channels.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use windows::core::GUID;
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT};
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioClient, IAudioClock, IAudioRenderClient, IMMDevice,
    IMMDeviceEnumerator, AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
    DEVICE_STATE_ACTIVE, WAVEFORMATEX, WAVEFORMATEXTENSIBLE, WAVEFORMATEXTENSIBLE_0, WAVE_FORMAT_PCM,
};
use windows::Win32::Media::Multimedia::WAVE_FORMAT_IEEE_FLOAT;
use windows::Win32::System::Com::StructuredStorage::PropVariantClear;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;

const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
const KSDATAFORMAT_SUBTYPE_PCM: GUID =
    GUID::from_u128(0x0000_0001_0000_0010_8000_00aa00389b71);
const KSDATAFORMAT_SUBTYPE_IEEE_FLOAT: GUID =
    GUID::from_u128(0x0000_0003_0000_0010_8000_00aa00389b71);

// Exclusive event-driven buffering: the buffer duration MUST be an integer multiple of the device
// period, and periodicity must equal the buffer duration. A mismatched (e.g. fixed 50 ms) buffer
// makes the driver slip samples every period, which sounds like continuous static/"electric noise".
// We therefore query the device's own period at open time and use it directly; this is only a
// fallback for the rare client that reports no period.
const FALLBACK_PERIOD_HNS: i64 = 100_000; // 10 ms
const EVENT_WAIT_TIMEOUT_MS: u32 = 25; // poll for commands while idle or recovery

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RendererState {
    Idle,
    Ready,
    Playing,
    Paused,
    Stopped,
    Closed,
}

#[derive(Clone, Debug)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Copy, Debug)]
pub struct PcmFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub is_float: bool,
}

impl PcmFormat {
    fn bytes_per_sample(self) -> usize {
        if self.is_float {
            4
        } else {
            (self.bits_per_sample as usize + 7) / 8
        }
    }

    fn block_align(self) -> usize {
        self.channels as usize * self.bytes_per_sample()
    }

    fn to_waveformatex(self) -> WAVEFORMATEX {
        let block_align = self.block_align().min(u16::MAX as usize) as u16;
        WAVEFORMATEX {
            wFormatTag: if self.is_float {
                WAVE_FORMAT_IEEE_FLOAT as u16
            } else {
                WAVE_FORMAT_PCM as u16
            },
            nChannels: self.channels,
            nSamplesPerSec: self.sample_rate,
            nAvgBytesPerSec: self.sample_rate.saturating_mul(block_align as u32),
            nBlockAlign: block_align,
            wBitsPerSample: if self.is_float {
                32
            } else {
                self.bits_per_sample
            },
            cbSize: 0,
        }
    }

    /// True when the endpoint must be described with WAVEFORMATEXTENSIBLE: Windows rejects (or
    /// misinterprets) >16-bit depths and >2 channels in a plain WAVEFORMATEX. A 24-bit song opened
    /// as plain PCM is exactly the "electric noise / static" bug.
    fn needs_waveformatextensible(self) -> bool {
        self.is_float || self.bits_per_sample > 16 || self.channels > 2
    }

    fn to_waveformatextensible(self) -> WAVEFORMATEXTENSIBLE {
        let block_align = self.block_align().min(u16::MAX as usize) as u16;
        // The container is the full bytes-per-sample; the valid bits are the source depth. Packed
        // 24-bit PCM (FFmpeg's pcm_s24le) is a 24-bit container, so both stay 24.
        let container_bits = if self.is_float { 32 } else { self.bits_per_sample };
        WAVEFORMATEXTENSIBLE {
            Format: WAVEFORMATEX {
                wFormatTag: WAVE_FORMAT_EXTENSIBLE,
                nChannels: self.channels,
                nSamplesPerSec: self.sample_rate,
                nAvgBytesPerSec: self.sample_rate.saturating_mul(block_align as u32),
                nBlockAlign: block_align,
                wBitsPerSample: container_bits,
                cbSize: 22,
            },
            Samples: WAVEFORMATEXTENSIBLE_0 {
                wValidBitsPerSample: self.bits_per_sample,
            },
            dwChannelMask: channel_mask_for(self.channels),
            SubFormat: if self.is_float {
                KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
            } else {
                KSDATAFORMAT_SUBTYPE_PCM
            },
        }
    }
}

// The standard speaker positions for common channel counts (WAVE_FORMAT_EXTENSIBLE channel mask).
fn channel_mask_for(channels: u16) -> u32 {
    match channels {
        1 => 0x4,   // FC
        2 => 0x3,   // FL | FR
        3 => 0x7,   // FL | FR | FC
        4 => 0x33,  // FL | FR | BL | BR
        5 => 0x37,  // FL | FR | FC | BL | BR
        6 => 0x3F,  // FL | FR | FC | LFE | BL | BR
        7 => 0x13F, // + BC
        8 => 0x63F, // + SL | SR
        _ => 0,
    }
}

// Statistics shared between the playback thread and the JS side.
struct Stats {
    position_frames: AtomicU64,
    clock_freq: AtomicU64,
    // The reused stream's device clock is cumulative, so each Start anchors a base to report the
    // position relative to the current track.
    position_base_frames: AtomicU64,
    position_base_set: AtomicU64,
    frames_written: AtomicU64,
    event_count: AtomicU64,
    sample_rate: AtomicU64,
    block_align: AtomicU64,
    buffer_frames: AtomicU64,
    /** Buffers the render loop had to pad with silence because the ring ran dry (glitches). */
    underruns: AtomicU64,
    state: Mutex<RendererState>,
}

impl Default for Stats {
    fn default() -> Self {
        Self {
            position_frames: AtomicU64::new(0),
            clock_freq: AtomicU64::new(0),
            position_base_frames: AtomicU64::new(0),
            position_base_set: AtomicU64::new(0),
            frames_written: AtomicU64::new(0),
            event_count: AtomicU64::new(0),
            sample_rate: AtomicU64::new(0),
            block_align: AtomicU64::new(0),
            buffer_frames: AtomicU64::new(0),
            underruns: AtomicU64::new(0),
            state: Mutex::new(RendererState::Idle),
        }
    }
}

// The ring buffer shared with the playback thread.
struct Ring {
    buf: VecDeque<u8>,
    capacity: usize,
}

impl Ring {
    fn new(capacity: usize) -> Self {
        Self {
            buf: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    fn available(&self) -> usize {
        self.capacity.saturating_sub(self.buf.len())
    }
}

struct Shared {
    ring: Mutex<Ring>,
    ring_cond: Condvar,
    stats: Stats,
}

enum Command {
    Open {
        device_id: String,
        format: PcmFormat,
        resp: Sender<Result<(), String>>,
    },
    Start {
        resp: Sender<Result<(), String>>,
    },
    Pause {
        resp: Sender<Result<(), String>>,
    },
    Stop {
        resp: Sender<Result<(), String>>,
    },
    Close {
        resp: Sender<Result<(), String>>,
    },
}

pub struct WasapiRenderer {
    cmd_tx: Sender<Command>,
    shared: Arc<Shared>,
    handle: Option<JoinHandle<()>>,
}

impl WasapiRenderer {
    pub fn new() -> Result<Self, String> {
        let (cmd_tx, cmd_rx) = mpsc::channel();
        let shared = Arc::new(Shared {
            ring: Mutex::new(Ring::new(8 * 1024 * 1024)), // 8 MiB PCM ring
            ring_cond: Condvar::new(),
            stats: Stats::default(),
        });
        let thread_shared = Arc::clone(&shared);
        let handle = std::thread::Builder::new()
            .name("folia-wasapi".into())
            .spawn(move || playback_thread(thread_shared, cmd_rx))
            .map_err(|e| format!("failed to spawn WASAPI thread: {e}"))?;

        Ok(Self {
            cmd_tx,
            shared,
            handle: Some(handle),
        })
    }

    pub fn open_exclusive(&self, device_id: &str, format: PcmFormat) -> Result<(), String> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(Command::Open {
            device_id: device_id.to_string(),
            format,
            resp: resp_tx,
        })?;
        recv_resp(resp_rx)
    }

    pub fn start(&self) -> Result<(), String> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(Command::Start { resp: resp_tx })?;
        recv_resp(resp_rx)
    }

    pub fn pause(&self) -> Result<(), String> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(Command::Pause { resp: resp_tx })?;
        recv_resp(resp_rx)
    }

    pub fn stop(&self) -> Result<(), String> {
        let (resp_tx, resp_rx) = mpsc::channel();
        self.send(Command::Stop { resp: resp_tx })?;
        recv_resp(resp_rx)
    }

    pub fn close(&self) -> Result<(), String> {
        let (resp_tx, resp_rx) = mpsc::channel();
        // The thread may have already exited; ignore send failure on a closed channel.
        let _ = self.send(Command::Close { resp: resp_tx });
        let _ = resp_rx.recv_timeout(Duration::from_secs(2));
        Ok(())
    }

    fn send(&self, cmd: Command) -> Result<(), String> {
        self.cmd_tx
            .send(cmd)
            .map_err(|_| "WASAPI renderer thread has stopped".to_string())
    }

    /// Pushes PCM bytes into the ring buffer. Never blocks: accepts what fits and returns the
    /// number of bytes taken, so the JS caller can retry later without stalling its event loop.
    pub fn write_pcm(&self, data: &[u8]) -> usize {
        let mut guard = self.shared.ring.lock().unwrap();
        let available = guard.available();
        let take = available.min(data.len());
        if take > 0 {
            guard.buf.extend(&data[..take]);
        }
        take
    }

    /// Empties the ring buffer so a reused stream does not play the previous track's audio.
    pub fn clear_buffer(&self) {
        let mut guard = self.shared.ring.lock().unwrap();
        guard.buf.clear();
    }

    pub fn get_position_ms(&self) -> f64 {
        let frames = self.shared.stats.position_frames.load(Ordering::SeqCst);
        let mut freq = self.shared.stats.clock_freq.load(Ordering::SeqCst);
        if freq == 0 {
            freq = self.shared.stats.sample_rate.load(Ordering::SeqCst);
        }
        if freq == 0 {
            0.0
        } else {
            frames as f64 * 1000.0 / freq as f64
        }
    }

    pub fn get_frames_written(&self) -> u64 {
        self.shared.stats.frames_written.load(Ordering::SeqCst)
    }

    pub fn get_underrun_count(&self) -> u64 {
        self.shared.stats.underruns.load(Ordering::SeqCst)
    }

    pub fn get_diagnostics(&self) -> (u64, u64) {
        (
            self.shared.stats.event_count.load(Ordering::SeqCst),
            self.shared.stats.buffer_frames.load(Ordering::SeqCst),
        )
    }

    pub fn get_buffered_bytes(&self) -> u64 {
        self.shared.ring.lock().unwrap().buf.len() as u64
    }

    pub fn get_state(&self) -> RendererState {
        *self.shared.stats.state.lock().unwrap()
    }
}

impl Drop for WasapiRenderer {
    fn drop(&mut self) {
        let _ = self.close();
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

fn recv_resp(rx: Receiver<Result<(), String>>) -> Result<(), String> {
    rx.recv_timeout(Duration::from_secs(10))
        .map_err(|_| "WASAPI operation timed out".to_string())?
}

// The dedicated COM thread. Owns every WASAPI interface pointer.
fn playback_thread(shared: Arc<Shared>, cmd_rx: Receiver<Command>) {
    // COM must be initialized on this thread for the entire lifetime.
    unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }

    let mut client: Option<IAudioClient> = None;
    let mut render: Option<IAudioRenderClient> = None;
    let mut clock: Option<IAudioClock> = None;
    let mut event_handle: Option<HANDLE> = None;

    // The main loop blocks on commands; "Start" switches into the render loop.
    'outer: loop {
        let cmd = match cmd_rx.recv() {
            Ok(cmd) => cmd,
            Err(_) => break,
        };

        match cmd {
            Command::Open {
                device_id,
                format,
                resp,
            } => {
                let result = open_device(&device_id, format).and_then(
                    |(c, r, clk, evt, buffer_fr)| {
                        // Pre-fill the whole exclusive buffer with silence so the event-driven
                        // stream starts cleanly (Start() on an empty buffer never signals the
                        // render event on some drivers).
                        if let Ok(buf) = unsafe { r.GetBuffer(buffer_fr) } {
                            let bytes = buffer_fr as usize * format.block_align();
                            let dst = unsafe { std::slice::from_raw_parts_mut(buf, bytes) };
                            for b in dst.iter_mut() {
                                *b = 0;
                            }
                            unsafe { let _ = r.ReleaseBuffer(buffer_fr, 0); }
                        }
                        let clock_freq = match unsafe { clk.GetFrequency() } {
                            Ok(f) if f > 0 => f,
                            _ => format.sample_rate as u64,
                        };
                        shared.stats.clock_freq.store(clock_freq, Ordering::SeqCst);
                        client = Some(c);
                        render = Some(r);
                        clock = Some(clk);
                        event_handle = Some(evt);
                        shared
                            .stats
                            .sample_rate
                            .store(format.sample_rate as u64, Ordering::SeqCst);
                        shared
                            .stats
                            .block_align
                            .store(format.block_align() as u64, Ordering::SeqCst);
                        shared.stats.buffer_frames.store(buffer_fr as u64, Ordering::SeqCst);
                        shared.stats.position_frames.store(0, Ordering::SeqCst);
                        shared.stats.position_base_set.store(0, Ordering::SeqCst);
                        *shared.stats.state.lock().unwrap() = RendererState::Ready;
                        Ok(())
                    },
                );
                let _ = resp.send(result);
            }
            Command::Start { resp } => {
                match (&client, &render, &clock, event_handle) {
                    (Some(c), Some(r), Some(clk), Some(evt)) => {
                        let current_state = *shared.stats.state.lock().unwrap();
                        if current_state != RendererState::Paused {
                            // Anchor the position to the first clock reading of this run.
                            shared.stats.position_base_set.store(0, Ordering::SeqCst);
                        }

                        // Pre-fill the hardware buffer before calling c.Start(). In WASAPI Exclusive
                        // Event-Driven mode, starting on an empty buffer prevents driver event signalling
                        // or causes immediate starvation.
                        let buffer_frames = shared.stats.buffer_frames.load(Ordering::SeqCst) as u32;
                        let bytes_per_frame = shared.stats.block_align.load(Ordering::SeqCst) as usize;
                        let bytes_per_buffer = buffer_frames as usize * bytes_per_frame;

                        if buffer_frames > 0 && bytes_per_buffer > 0 {
                            if let Ok(buf) = unsafe { r.GetBuffer(buffer_frames) } {
                                let dst = unsafe { std::slice::from_raw_parts_mut(buf, bytes_per_buffer) };
                                let written = {
                                    let mut guard = shared.ring.lock().unwrap();
                                    let take = guard.buf.len().min(bytes_per_buffer);
                                    let (s1, s2) = guard.buf.as_slices();
                                    let take1 = s1.len().min(take);
                                    dst[..take1].copy_from_slice(&s1[..take1]);
                                    let remaining = take - take1;
                                    if remaining > 0 {
                                        dst[take1..take].copy_from_slice(&s2[..remaining]);
                                    }
                                    guard.buf.drain(..take);
                                    shared.ring_cond.notify_all();
                                    take
                                };
                                if written < bytes_per_buffer {
                                    for b in dst[written..].iter_mut() {
                                        *b = 0;
                                    }
                                }
                                unsafe { let _ = r.ReleaseBuffer(buffer_frames, 0); }
                            }
                        }

                        match unsafe { c.Start() } {
                            Ok(()) => {
                                *shared.stats.state.lock().unwrap() = RendererState::Playing;
                                let _ = resp.send(Ok(()));
                                // Block until stop, pause or close is requested.
                                match render_loop(c, r, clk, &shared, evt, &cmd_rx) {
                                    RenderLoopExit::Stopped => {
                                        // Keep the client open for the next reused track.
                                    }
                                    RenderLoopExit::Paused => {
                                        // Stream is paused; remains ready for immediate start.
                                    }
                                    RenderLoopExit::Closed(close_resp) => {
                                        // Release everything BEFORE acknowledging close: a caller that
                                        // reopens the endpoint right after must not race the release.
                                        if let Some(c) = client.as_ref() {
                                            unsafe { let _ = c.Stop(); }
                                        }
                                        *shared.stats.state.lock().unwrap() = RendererState::Closed;
                                        if let Some(evt) = event_handle.take() {
                                            unsafe { let _ = CloseHandle(evt); }
                                        }
                                        drop(clock.take());
                                        drop(render.take());
                                        drop(client.take());
                                        let _ = close_resp.send(Ok(()));
                                        break 'outer;
                                    }
                                }
                            }
                            Err(e) => {
                                let _ = resp.send(Err(e.message()));
                            }
                        }
                    }
                    _ => {
                        let _ = resp.send(Err("WASAPI renderer is not open".to_string()));
                    }
                }
            }
            Command::Pause { resp } => {
                let result = if let Some(c) = client.as_ref() {
                    unsafe { c.Stop().map_err(|e| e.message()) }
                } else {
                    Ok(())
                };
                *shared.stats.state.lock().unwrap() = RendererState::Paused;
                let _ = resp.send(result);
            }
            Command::Stop { resp } => {
                let result = if let Some(c) = client.as_ref() {
                    unsafe {
                        let stop = c.Stop();
                        // Reset clears any pending buffer so a reused stream starts clean.
                        if stop.is_ok() {
                            let _ = c.Reset();
                        }
                        stop.map_err(|e| e.message())
                    }
                } else {
                    Ok(())
                };
                // The stream position restarts when the stream is reused for another track.
                shared.stats.position_frames.store(0, Ordering::SeqCst);
                *shared.stats.state.lock().unwrap() = RendererState::Stopped;
                let _ = resp.send(result);
            }
            Command::Close { resp } => {
                if let Some(c) = client.as_ref() {
                    unsafe { let _ = c.Stop(); }
                }
                *shared.stats.state.lock().unwrap() = RendererState::Closed;
                // Release the COM interfaces and the event BEFORE acknowledging: otherwise a caller
                // that reopens the endpoint immediately after close() can race the release and get
                // AUDCLNT_E_DEVICE_IN_USE.
                if let Some(evt) = event_handle.take() {
                    unsafe { let _ = CloseHandle(evt); }
                }
                drop(clock.take());
                drop(render.take());
                drop(client.take());
                let _ = resp.send(Ok(()));
                break 'outer;
            }
        }
    }

    // Cleanup: release the event, drop COM objects, uninitialize COM.
    if let Some(evt) = event_handle {
        unsafe { let _ = CloseHandle(evt); }
    }
    drop(clock);
    drop(render);
    drop(client);
    unsafe { CoUninitialize(); }
}

// Opens a device and initializes an exclusive event-driven audio client for the given format.
fn open_device(
    device_id: &str,
    format: PcmFormat,
) -> Result<(IAudioClient, IAudioRenderClient, IAudioClock, HANDLE, u32), String> {
    if format.channels == 0 || format.channels > 8
        || format.sample_rate < 8000 || format.sample_rate > 384_000
        || format.bits_per_sample == 0 || format.bits_per_sample > 32 {
        return Err("Unsupported or invalid PCM audio format parameters".to_string());
    }

    let enumerator: IMMDeviceEnumerator = unsafe {
        CoCreateInstance(
            &windows::Win32::Media::Audio::MMDeviceEnumerator,
            None,
            CLSCTX_ALL,
        )
    }
    .map_err(|e| format!("failed to create MMDeviceEnumerator: {}", e.message()))?;

    let device: IMMDevice = if device_id.is_empty() {
        unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole) }
            .map_err(|e| format!("failed to get default audio endpoint: {}", e.message()))?
    } else {
        find_device_by_id(&enumerator, device_id)?
    };

    let client: IAudioClient = unsafe { device.Activate::<IAudioClient>(CLSCTX_ALL, None) }
        .map_err(|e| format!("failed to activate IAudioClient: {}", e.message()))?;

    let wfx_plain = format.to_waveformatex();
    let wfx_extensible = format.to_waveformatextensible();
    let wfx: *const WAVEFORMATEX = if format.needs_waveformatextensible() {
        &wfx_extensible.Format
    } else {
        &wfx_plain
    };

    // Exclusive event-driven buffering must be aligned to the device period; otherwise the driver
    // slips samples every period, which is heard as continuous static ("electric noise"). Query the
    // device's own period and use it for both buffer duration and periodicity (they must be equal).
    let mut default_period: i64 = 0;
    let mut min_period: i64 = 0;
    let period_hns = match unsafe {
        client.GetDevicePeriod(Some(&mut default_period), Some(&mut min_period))
    } {
        Ok(()) if default_period > 0 => default_period,
        _ => FALLBACK_PERIOD_HNS,
    };

    unsafe {
        client.Initialize(
            AUDCLNT_SHAREMODE_EXCLUSIVE,
            AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            period_hns,
            period_hns,
            wfx,
            None,
        )
    }
    .map_err(|e| format!("exclusive initialize failed (format unsupported?): {:#010x}", e.code().0))?;

    let buffer_frames = unsafe { client.GetBufferSize() }
        .map_err(|e| format!("GetBufferSize failed: {}", e.message()))?;

    let render: IAudioRenderClient = unsafe { client.GetService::<IAudioRenderClient>() }
        .map_err(|e| format!("GetService(IAudioRenderClient) failed: {}", e.message()))?;

    let clock: IAudioClock = unsafe { client.GetService::<IAudioClock>() }
        .map_err(|e| format!("GetService(IAudioClock) failed: {}", e.message()))?;

    let event = unsafe { CreateEventW(None, false, false, None) }
        .map_err(|e| format!("CreateEventW failed: {}", e.message()))?;

    unsafe { client.SetEventHandle(event) }
        .map_err(|e| format!("SetEventHandle failed: {}", e.message()))?;

    Ok((client, render, clock, event, buffer_frames))
}

// Why the render loop returned: a Stop keeps the client alive for reuse; a Close hands the close
// response back to the thread body so it can release the COM interfaces before acknowledging.
enum RenderLoopExit {
    Stopped,
    Paused,
    Closed(Sender<Result<(), String>>),
}

// The render loop: waits on the buffer event and writes the WHOLE buffer each time
// (exclusive event-driven mode uses ping-pong double buffering, so the packet size must
// always equal the buffer size). Mirrors the IAudioClock position back to shared stats.
fn render_loop(
    client: &IAudioClient,
    render: &IAudioRenderClient,
    clock: &IAudioClock,
    shared: &Arc<Shared>,
    event_handle: HANDLE,
    cmd_rx: &Receiver<Command>,
) -> RenderLoopExit {
    let buffer_frames = shared.stats.buffer_frames.load(Ordering::SeqCst) as u32;
    let bytes_per_frame = shared.stats.block_align.load(Ordering::SeqCst) as usize;
    let bytes_per_buffer = buffer_frames as usize * bytes_per_frame;

    loop {
        // Process control commands without blocking the audio event.
        while let Ok(cmd) = cmd_rx.try_recv() {
            match cmd {
                Command::Pause { resp } => {
                    unsafe {
                        let _ = client.Stop();
                    }
                    *shared.stats.state.lock().unwrap() = RendererState::Paused;
                    let _ = resp.send(Ok(()));
                    return RenderLoopExit::Paused;
                }
                Command::Stop { resp } => {
                    unsafe {
                        let _ = client.Stop();
                        let _ = client.Reset();
                    }
                    shared.stats.position_frames.store(0, Ordering::SeqCst);
                    shared.stats.position_base_set.store(0, Ordering::SeqCst);
                    *shared.stats.state.lock().unwrap() = RendererState::Stopped;
                    let _ = resp.send(Ok(()));
                    return RenderLoopExit::Stopped;
                }
                Command::Close { resp } => {
                    // Do NOT release or acknowledge here: the thread body owns the interfaces and
                    // will drop them. Acknowledging first would let the caller reopen while the
                    // endpoint is still held (AUDCLNT_E_DEVICE_IN_USE).
                    return RenderLoopExit::Closed(resp);
                }
                _ => {}
            }
        }

        let wait = unsafe { WaitForSingleObject(event_handle, EVENT_WAIT_TIMEOUT_MS) };
        if wait != WAIT_OBJECT_0 {
            // Timeout or error: if driver missed signalling an event, attempt to prime the buffer
            // to re-trigger hardware callbacks and avoid persistent 50Hz stuttering.
            if wait == WAIT_TIMEOUT {
                if let Ok(buf) = unsafe { render.GetBuffer(buffer_frames) } {
                    let dst: &mut [u8] = unsafe { std::slice::from_raw_parts_mut(buf, bytes_per_buffer) };
                    let written = {
                        let mut guard = shared.ring.lock().unwrap();
                        let take = guard.buf.len().min(bytes_per_buffer);
                        let (s1, s2) = guard.buf.as_slices();
                        let take1 = s1.len().min(take);
                        dst[..take1].copy_from_slice(&s1[..take1]);
                        let remaining = take - take1;
                        if remaining > 0 {
                            dst[take1..take].copy_from_slice(&s2[..remaining]);
                        }
                        guard.buf.drain(..take);
                        take
                    };
                    if written < bytes_per_buffer {
                        shared.stats.underruns.fetch_add(1, Ordering::SeqCst);
                        for byte in dst[written..].iter_mut() {
                            *byte = 0;
                        }
                    }
                    unsafe {
                        let _ = render.ReleaseBuffer(buffer_frames, 0);
                    }
                }
            }
            continue;
        }
        shared.stats.event_count.fetch_add(1, Ordering::SeqCst);

        // Report the playback position from the hardware clock.
        let mut device_pos = 0u64;
        let mut qpc = 0u64;
        if unsafe { clock.GetPosition(&mut device_pos, Some(&mut qpc)) }.is_ok() {
            if shared.stats.position_base_set.swap(1, Ordering::SeqCst) == 0 {
                shared.stats.position_base_frames.store(device_pos, Ordering::SeqCst);
            }
            let base = shared.stats.position_base_frames.load(Ordering::SeqCst);
            shared
                .stats
                .position_frames
                .store(device_pos.saturating_sub(base), Ordering::SeqCst);
        }

        // Write the entire buffer (ping-pong: packet size must equal buffer size).
        let buffer = match unsafe { render.GetBuffer(buffer_frames) } {
            Ok(buf) => buf,
            Err(_) => continue,
        };
        let dst: &mut [u8] = unsafe { std::slice::from_raw_parts_mut(buffer, bytes_per_buffer) };

        // Drain the ring buffer via fast slice copy; fill any shortfall with silence.
        let written = {
            let mut guard = shared.ring.lock().unwrap();
            let take = guard.buf.len().min(bytes_per_buffer);
            let (s1, s2) = guard.buf.as_slices();
            let take1 = s1.len().min(take);
            dst[..take1].copy_from_slice(&s1[..take1]);
            let remaining = take - take1;
            if remaining > 0 {
                dst[take1..take].copy_from_slice(&s2[..remaining]);
            }
            guard.buf.drain(..take);
            shared.ring_cond.notify_all();
            take
        };
        if written < bytes_per_buffer {
            shared.stats.underruns.fetch_add(1, Ordering::SeqCst);
            for byte in dst[written..].iter_mut() {
                *byte = 0;
            }
        }

        unsafe {
            let _ = render.ReleaseBuffer(buffer_frames, 0);
        }
        shared
            .stats
            .frames_written
            .fetch_add(buffer_frames as u64, Ordering::SeqCst);
    }
}

fn find_device_by_id(
    enumerator: &IMMDeviceEnumerator,
    device_id: &str,
) -> Result<IMMDevice, String> {
    let devices = enumerate_devices(enumerator)?;
    devices
        .into_iter()
        .find(|d| d.id == device_id)
        .map(|d| d.device)
        .ok_or_else(|| format!("output device not found: {device_id}"))
}

pub fn list_output_devices() -> Result<Vec<DeviceInfo>, String> {
    unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
    let result = (|| {
        let enumerator: IMMDeviceEnumerator = unsafe {
            CoCreateInstance(
                &windows::Win32::Media::Audio::MMDeviceEnumerator,
                None,
                CLSCTX_ALL,
            )
        }
        .map_err(|e| e.message())?;
        let devices = enumerate_devices(&enumerator)?;
        Ok(devices
            .into_iter()
            .map(|d| DeviceInfo {
                id: d.id,
                name: d.name,
            })
            .collect())
    })();
    unsafe { CoUninitialize(); }
    result
}

struct EnumeratedDevice {
    id: String,
    name: String,
    device: IMMDevice,
}

fn enumerate_devices(enumerator: &IMMDeviceEnumerator) -> Result<Vec<EnumeratedDevice>, String> {
    let collection = unsafe { enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) }
        .map_err(|e| format!("EnumAudioEndpoints failed: {}", e.message()))?;

    let count = unsafe { collection.GetCount() }.map_err(|e| e.message())?;
    let mut out = Vec::with_capacity(count as usize);
    for i in 0..count {
        let device = match unsafe { collection.Item(i) } {
            Ok(d) => d,
            Err(_) => continue,
        };
        let id = device_id_string(&device).unwrap_or_default();
        let name = device_friendly_name(&device).unwrap_or_else(|_| id.clone());
        out.push(EnumeratedDevice { id, name, device });
    }
    Ok(out)
}

fn device_id_string(device: &IMMDevice) -> Result<String, String> {
    let pwstr = unsafe { device.GetId() }.map_err(|e| e.message())?;
    let result = unsafe { pwstr.to_string() }.unwrap_or_default();
    unsafe { CoTaskMemFree(Some(pwstr.0 as *const core::ffi::c_void)) };
    Ok(result)
}

fn device_friendly_name(device: &IMMDevice) -> Result<String, String> {
    let store: IPropertyStore = unsafe { device.OpenPropertyStore(STGM_READ) }
        .map_err(|e| e.message())?;
    let mut pv = unsafe { store.GetValue(&PKEY_Device_FriendlyName) }
        .map_err(|e| e.message())?;
    // The friendly name is stored as VT_LPWSTR; verify variant type before reading the wide string.
    let name = unsafe {
        if pv.vt() == VT_LPWSTR {
            let pwsz = pv.Anonymous.Anonymous.Anonymous.pwszVal;
            if pwsz.0.is_null() {
                String::new()
            } else {
                pwsz.to_string().unwrap_or_default()
            }
        } else {
            String::new()
        }
    };
    unsafe { let _ = PropVariantClear(&mut pv); }
    Ok(name)
}
