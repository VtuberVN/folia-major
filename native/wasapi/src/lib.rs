// native/wasapi/src/lib.rs
//
// napi-rs entry point exposing the WASAPI exclusive renderer to Electron.

#![deny(clippy::all)]

mod renderer;

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

use renderer::{list_output_devices, DeviceInfo, PcmFormat, WasapiRenderer};

#[napi(object)]
pub struct NapiDeviceInfo {
    pub id: String,
    pub name: String,
}

#[napi(object)]
pub struct NapiPcmFormat {
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub is_float: bool,
}

impl From<DeviceInfo> for NapiDeviceInfo {
    fn from(value: DeviceInfo) -> Self {
        Self {
            id: value.id,
            name: value.name,
        }
    }
}

impl From<NapiPcmFormat> for PcmFormat {
    fn from(value: NapiPcmFormat) -> Self {
        Self {
            sample_rate: value.sample_rate,
            channels: value.channels,
            bits_per_sample: value.bits_per_sample,
            is_float: value.is_float,
        }
    }
}

#[napi]
pub fn enumerate_output_devices() -> napi::Result<Vec<NapiDeviceInfo>> {
    list_output_devices()
        .map(|devices| devices.into_iter().map(NapiDeviceInfo::from).collect())
        .map_err(|e| napi::Error::from_reason(e))
}

#[napi]
pub struct FoliaWasapi {
    inner: WasapiRenderer,
}

#[napi]
impl FoliaWasapi {
    #[napi(constructor)]
    pub fn new() -> napi::Result<Self> {
        WasapiRenderer::new()
            .map(|inner| Self { inner })
            .map_err(|e| napi::Error::from_reason(e))
    }

    #[napi]
    pub fn open_exclusive(&self, device_id: String, format: NapiPcmFormat) -> napi::Result<()> {
        self.inner
            .open_exclusive(&device_id, format.into())
            .map_err(|e| napi::Error::from_reason(e))
    }

    #[napi]
    pub fn start(&self) -> napi::Result<()> {
        self.inner.start().map_err(|e| napi::Error::from_reason(e))
    }

    #[napi]
    pub fn pause(&self) -> napi::Result<()> {
        self.inner.pause().map_err(|e| napi::Error::from_reason(e))
    }

    #[napi]
    pub fn stop(&self) -> napi::Result<()> {
        self.inner.stop().map_err(|e| napi::Error::from_reason(e))
    }

    #[napi]
    pub fn write_pcm(&self, data: Buffer) -> napi::Result<u32> {
        Ok(self.inner.write_pcm(data.as_ref()) as u32)
    }

    #[napi]
    pub fn get_position_ms(&self) -> f64 {
        self.inner.get_position_ms()
    }

    #[napi]
    pub fn clear_buffer(&self) {
        self.inner.clear_buffer();
    }

    #[napi]
    pub fn get_buffered_bytes(&self) -> napi::Result<f64> {
        Ok(self.inner.get_buffered_bytes() as f64)
    }

    #[napi]
    pub fn get_frames_written(&self) -> napi::Result<f64> {
        Ok(self.inner.get_frames_written() as f64)
    }

    #[napi]
    pub fn get_underrun_count(&self) -> napi::Result<f64> {
        Ok(self.inner.get_underrun_count() as f64)
    }

    #[napi]
    pub fn get_diagnostics(&self) -> napi::Result<String> {
        let (events, buffer) = self.inner.get_diagnostics();
        Ok(format!("events={events} buffer={buffer}"))
    }

    #[napi]
    pub fn get_state(&self) -> String {
        format!("{:?}", self.inner.get_state())
    }

    #[napi]
    pub fn close(&self) -> napi::Result<()> {
        self.inner.close().map_err(|e| napi::Error::from_reason(e))
    }
}
