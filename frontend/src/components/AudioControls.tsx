import { useState, useEffect } from 'react';
import { getAudioSettings, setAudioSettings, subscribeAudioSettings } from '@/lib/audio-settings';
import { Switch } from '@/components/ui/switch';

export function AudioControls() {
  const [settings, setSettings] = useState(getAudioSettings);
  useEffect(() => subscribeAudioSettings(setSettings), []);
  return <div className="space-y-3 rounded-2xl border border-border p-3">
    <p className="text-xs font-semibold">Áudio da chamada</p>
    {(['inputVolume', 'outputVolume'] as const).map((key) => <label key={key} className="block space-y-1 text-xs">
      <span className="flex justify-between"><span>{key === 'inputVolume' ? 'Ganho do microfone' : 'Volume de saída'}</span><span>{settings[key]}%</span></span>
      <input aria-label={key === 'inputVolume' ? 'Ganho do microfone' : 'Volume de saída'} type="range" min="0" max="100" value={settings[key]} onChange={(event) => setAudioSettings({ [key]: Number(event.target.value) })} className="w-full accent-primary" />
    </label>)}
    {(['noiseSuppression', 'echoCancellation'] as const).map((key) => <label key={key} className="flex items-center justify-between text-xs"><span>{key === 'noiseSuppression' ? 'Redução de ruído' : 'Cancelamento de eco'}</span><Switch checked={settings[key]} onCheckedChange={(value) => setAudioSettings({ [key]: value })} /></label>)}
  </div>;
}
