import React from 'react';
import type { Theme } from '../../../../types';
import { colorWithAlpha } from '../../colorMix';

// src/components/visualizer/backgrounds/sora/soraSettingsRows.tsx
// Presentational rows for the Sora 3D settings card: section headers, slider rows, and pill groups.

export const SoraSectionLabel: React.FC<{ children: React.ReactNode; theme: Theme }> = ({ children, theme }) => (
    <div className="text-xs font-medium uppercase tracking-[0.24em] opacity-45" style={{ color: theme.secondaryColor }}>
        {children}
    </div>
);

export interface SoraSliderRowProps {
    label: string;
    value: number;
    valueLabel?: string;
    min: number;
    max: number;
    step: number;
    digits?: number;
    rangeInputClass: string;
    theme: Theme;
    onChange: (value: number) => void;
    onPointerDown?: () => void;
    onPointerUp?: () => void;
}

export const SoraSliderRow: React.FC<SoraSliderRowProps> = ({
    label,
    value,
    valueLabel,
    min,
    max,
    step,
    digits = 2,
    rangeInputClass,
    theme,
    onChange,
    onPointerDown,
    onPointerUp,
}) => (
    <label className="block space-y-2">
        <span className="flex justify-between gap-3 text-sm" style={{ color: theme.primaryColor }}>
            <span>{label}</span>
            <span className="font-mono opacity-70">{valueLabel ?? value.toFixed(digits)}</span>
        </span>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={event => onChange(Number(event.target.value))}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={rangeInputClass}
        />
    </label>
);

export interface SoraPillOption<T extends string> {
    value: T;
    label: string;
}

export const SoraPillGroup = <T extends string>({
    label,
    value,
    options,
    onChange,
    isDaylight,
    theme,
}: {
    label?: string;
    value: T;
    options: SoraPillOption<T>[];
    onChange: (value: T) => void;
    isDaylight: boolean;
    theme: Theme;
}) => (
    <div className="space-y-2.5">
        {label && <SoraSectionLabel theme={theme}>{label}</SoraSectionLabel>}
        <div className="flex flex-wrap gap-2">
            {options.map(option => {
                const isActive = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className="rounded-full border px-3 py-2 text-sm transition-all"
                        style={{
                            color: theme.primaryColor,
                            borderColor: isActive ? theme.accentColor : colorWithAlpha(theme.secondaryColor, isDaylight ? 0.18 : 0.14),
                            backgroundColor: isActive
                                ? colorWithAlpha(theme.accentColor, isDaylight ? 0.1 : 0.16)
                                : colorWithAlpha(theme.secondaryColor, 0.08),
                            boxShadow: isActive ? `inset 0 0 0 1px ${theme.accentColor}` : 'none',
                        }}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    </div>
);
