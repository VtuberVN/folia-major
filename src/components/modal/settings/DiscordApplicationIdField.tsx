import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// src/components/modal/settings/DiscordApplicationIdField.tsx
// Validates and saves the public Discord application identity used by Rich Presence.
export default function DiscordApplicationIdField({ value, onSave }: {
    value: string;
    onSave: (value: string) => Promise<void>;
}) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState(value);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => { setDraft(value); }, [value]);

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        const id = draft.trim();
        if (!/^\d{16,24}$/.test(id)) {
            setMessage('options.discordApplicationIdInvalid');
            return;
        }
        setSaving(true);
        setMessage('');
        try {
            await onSave(id);
            setMessage('options.discordApplicationIdSaved');
        } catch {
            setMessage('options.discordApplicationIdSaveFailed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={save} className="space-y-2">
            <label htmlFor="discord-application-id" className="text-sm font-medium">
                {t('options.discordApplicationId')}
            </label>
            <p className="text-[11px] opacity-60">{t('options.discordApplicationIdHint')}</p>
            <div className="flex gap-2">
                <input id="discord-application-id" value={draft} inputMode="numeric"
                    autoComplete="off" spellCheck={false} maxLength={24} disabled={saving}
                    onChange={event => { setDraft(event.target.value); setMessage(''); }}
                    className="min-w-0 flex-1 rounded-lg border border-current/20 bg-transparent px-3 py-2 text-sm" />
                <button type="submit" disabled={saving || draft.trim() === value}
                    className="rounded-lg border border-current/20 px-3 py-2 text-sm disabled:opacity-40">
                    {t(saving ? 'options.discordApplicationIdSaving' : 'ui.apply')}
                </button>
            </div>
            {message && <p role="status" className="text-[11px]">{t(message)}</p>}
        </form>
    );
}
