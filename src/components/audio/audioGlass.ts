// src/components/audio/audioGlass.ts
// Shared translucent glass styling for Hi-Fi audio components.

export const audioGlass = (daylight: boolean) => daylight
    ? 'bg-white/60 border-white/30'
    : 'bg-white/10 border-white/15';
