// electron/wasapi/wasapiEngine.cjs
//
// Main-process facade over the WASAPI worker. Resolves the native module and FFmpeg paths,
// owns the worker thread, and exposes a small async API consumed by the IPC handlers.
// Everything it does is mirrored to <userData>/wasapi-debug.log so a packaged build can be
// diagnosed without a visible main-process console.

'use strict';

const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { resolveFfmpeg, TRANSCODE_RUNTIME_DIR } = require('../modSystem/ffmpeg.cjs');

const createWasapiEngine = ({ app }) => {
    let worker = null;
    let ready = false;
    let initPromise = null;
    let eventForwarder = null;
    let listDevicesPending = null;
    let ffmpegPath = '';
    let logPath = null;
    try {
        logPath = path.join(app.getPath('userData'), 'wasapi-debug.log');
    } catch {
        logPath = null;
    }

    const log = (message) => {
        if (!logPath) return;
        const line = `[${new Date().toISOString()}] ${message}\n`;
        // Asynchronous on purpose: a synchronous append on the main thread can stall the app's
        // event loop (and therefore the tray) when the disk is busy.
        fs.appendFile(logPath, line, () => {});
    };

    // The native addon ships unpacked next to this file.
    const resolveNativePath = () => {
        const dir = __dirname.replace('app.asar', 'app.asar.unpacked');
        return path.join(dir, 'folia_wasapi.node');
    };

    const resolveFfmpegPath = async () => {
        const status = await resolveFfmpeg({
            appGetAppPath: () => app.getAppPath(),
            packagedDirName: TRANSCODE_RUNTIME_DIR,
        });
        if (!status.available || !status.path) {
            throw new Error('FFmpeg is not available');
        }
        return status.path;
    };

    const ensureWorker = async () => {
        if (ready) return;
        if (initPromise) return initPromise;
        initPromise = (async () => {
            const nativePath = resolveNativePath();
            ffmpegPath = await resolveFfmpegPath();
            log(`init native=${nativePath} ffmpeg=${ffmpegPath} log=${logPath}`);
            worker = new Worker(path.join(__dirname, 'wasapiWorker.cjs'));
            // Never let the worker (or its native playback thread) keep the app alive on quit.
            worker.unref();

            const result = new Promise((resolve, reject) => {
                const onMessage = (msg) => {
                    if (!msg || typeof msg.type !== 'string') return;
                    if (msg.type === 'init-result') {
                        worker.off('message', onMessage);
                        ready = true;
                        resolve();
                    } else if (msg.type === 'error') {
                        worker.off('message', onMessage);
                        reject(new Error(msg.message));
                    }
                };
                worker.on('message', onMessage);
            });

            worker.on('message', handleMessage);
            worker.on('error', (err) => {
                log(`worker error: ${err && err.message}`);
                if (eventForwarder) eventForwarder({ type: 'error', message: err.message });
            });
            worker.postMessage({ type: 'init', nativePath, ffmpegPath, logPath });
            await result;
            log('worker ready');
        })().catch((error) => {
            log(`init failed: ${error && error.message}`);
            initPromise = null;
            throw error;
        });
        await initPromise;
    };

    const handleMessage = (msg) => {
        if (!msg || typeof msg.type !== 'string') return;
        // `position` fires four times a second; keep it out of the log file.
        if (msg.type !== 'position') log(`event ${JSON.stringify(msg)}`);
        if (msg.type === 'listDevices-result') {
            if (listDevicesPending) {
                listDevicesPending.resolve(msg.devices || []);
                listDevicesPending = null;
            }
            return;
        }
        if (eventForwarder) eventForwarder(msg);
    };

    const listDevices = async () => {
        await ensureWorker();
        return new Promise((resolve) => {
            listDevicesPending = { resolve };
            worker.postMessage({ type: 'listDevices' });
            setTimeout(() => {
                if (listDevicesPending) {
                    listDevicesPending.resolve([]);
                    listDevicesPending = null;
                }
            }, 3000);
        });
    };

    const send = async (msg) => {
        await ensureWorker();
        log(`send ${JSON.stringify(msg)}`);
        worker.postMessage(msg);
    };

    const play = (source, startSec) => send({
        type: 'play',
        source,
        startSec: startSec || 0,
    });

    const pause = () => send({ type: 'pause' });
    const resume = (source, startSec) => send({
        type: 'resume',
        source,
        startSec: startSec || 0,
    });
    const seek = (source, startSec) => send({
        type: 'seek',
        source,
        startSec: startSec || 0,
    });
    const stop = async () => {
        if (!worker || !ready) return;
        log('stop requested');
        return new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            const onMsg = (msg) => {
                if (msg && (msg.type === 'stopped' || msg.type === 'closed')) {
                    worker?.off('message', onMsg);
                    done();
                }
            };
            worker.on('message', onMsg);
            worker.postMessage({ type: 'stop' });
            const timer = setTimeout(() => {
                worker?.off('message', onMsg);
                done();
            }, 1200);
            if (typeof timer?.unref === 'function') timer.unref();
        });
    };

    const setDevice = (deviceId) => send({ type: 'setDevice', deviceId: deviceId || '' });

    const dispose = async () => {
        const current = worker;
        if (!current) return;
        worker = null;
        ready = false;
        initPromise = null;
        log('dispose');
        // Ask the worker to close the native renderer (which stops its Rust playback thread and
        // releases the exclusive endpoint) and wait briefly for it to report back before the hard
        // terminate. Without this the native thread can outlive the worker and stall app exit.
        try {
            current.postMessage({ type: 'close' });
        } catch {
            // Already gone.
        }
        await new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            current.once('message', (msg) => {
                if (msg && msg.type === 'closed') done();
            });
            current.once('exit', done);
            const timer = setTimeout(done, 800);
            if (typeof timer?.unref === 'function') timer.unref();
        });
        await current.terminate().catch(() => {});
    };

    return {
        listDevices,
        play,
        pause,
        resume,
        seek,
        stop,
        setDevice,
        dispose,
        setEventForwarder: (fn) => {
            eventForwarder = fn;
        },
    };
};

module.exports = { createWasapiEngine };
