import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type Gradient = { colors: string[]; angle: number; radial: boolean; strength: number };
const defaults: Gradient = { colors: ['#4976a8', '#765987', '#b18073'], angle: 135, radial: false, strength: 35 };
function readDraft(): Gradient {
  try {
    const value = JSON.parse(localStorage.getItem('tuga.gradientDraft') || 'null');
    if (value && Array.isArray(value.colors) && value.colors.length === 3 && value.colors.every((c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) {
      return { colors: value.colors, angle: Number.isFinite(value.angle) ? Math.min(360, Math.max(0, value.angle)) : 135, radial: value.radial === true, strength: Number.isFinite(value.strength) ? Math.min(100, Math.max(0, value.strength)) : 35 };
    }
  } catch { /* Use defaults when local storage is unavailable. */ }
  return defaults;
}
export function GradientEditor({ onApply }: { onApply: (background: string) => void }) {
  const [draft, setDraft] = useState(readDraft);
  const [layered, setLayered] = useState(() => localStorage.getItem('tuga.gradientLayered') === 'true');
  const [lightLevels, setLightLevels] = useState<number[]>(() => { try { const value = JSON.parse(localStorage.getItem('tuga.gradientLightLevels') || 'null'); if (Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) return value; } catch { /* Default levels. */ } return [100, 100, 0]; });
  const [spread, setSpread] = useState(() => { const value = Number(localStorage.getItem('tuga.gradientSpread') || 55); return Number.isFinite(value) ? Math.max(20, Math.min(100, value)) : 55; });
  const [positions, setPositions] = useState<number[][]>(() => { try { const value = JSON.parse(localStorage.getItem('tuga.gradientPositions') || 'null'); if (Array.isArray(value) && value.length === 3 && value.every((point) => Array.isArray(point) && point.length === 2 && point.every((n) => Number.isFinite(n) && n >= 0 && n <= 100))) return value; } catch { /* Default positions. */ } return [[0, 0], [100, 100], [50, 50]]; });
  const [applied, setApplied] = useState(false);
  function update(value: Partial<Gradient>) { const next = { ...draft, ...value }; setDraft(next); setApplied(false); try { localStorage.setItem('tuga.gradientDraft', JSON.stringify(next)); } catch { /* Optional preference. */ } }
  const colors = draft.colors.map((color) => `${color}${Math.round(draft.strength * 2.55).toString(16).padStart(2, '0')}`);
  const background = layered ? draft.colors.map((color, i) => `radial-gradient(ellipse at ${positions[i][0]}% ${positions[i][1]}%, ${color}${Math.round(draft.strength * lightLevels[i] / 100 * 2.55).toString(16).padStart(2, '0')} 0%, transparent ${spread}%)`).join(', ') : draft.radial ? `radial-gradient(ellipse at 50% 20%, ${colors.join(', ')})` : `linear-gradient(${draft.angle}deg, ${colors.join(', ')})`;
  return <section className="rounded-3xl border border-border bg-card p-6 space-y-5">
    <div><h3 className="text-sm font-semibold">Gradiente personalizado</h3><p className="text-xs text-muted-foreground mt-1">Mistura cores ou sobrepõe luzes, como nos fundos predefinidos.</p></div>
    <div className="rounded-2xl border border-border overflow-hidden bg-background" style={{ backgroundImage: background }}><div className="p-5"><div className="flex gap-2 mb-4"><span className="size-7 rounded-lg bg-card/80" /><span className="h-7 w-24 rounded-lg bg-card/80" /></div><div className="rounded-xl bg-card/85 border border-border p-4"><p className="text-xs font-medium">As tuas conversas</p><p className="text-[11px] text-muted-foreground mt-1">Pré-visualização do fundo</p></div></div></div>
    <div className="grid grid-cols-3 gap-3">{draft.colors.map((color, index) => <div key={index} className="space-y-2"><Label htmlFor={`gradient-color-${index}`} className="text-xs">Cor {index + 1}</Label><input id={`gradient-color-${index}`} type="color" value={color} onChange={(e) => update({ colors: draft.colors.map((c, i) => i === index ? e.target.value : c) })} className="block w-full h-10 cursor-pointer rounded-lg border border-border bg-background p-1" /><span className="text-[10px] font-mono text-muted-foreground">{color.toUpperCase()}</span></div>)}</div>
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Tipo de gradiente">{['Linear', 'Radial', 'Luzes'].map((name, index) => <Button key={name} variant={(index === 2 ? layered : !layered && draft.radial === (index === 1)) ? 'default' : 'outline'} size="sm" aria-pressed={index === 2 ? layered : !layered && draft.radial === (index === 1)} onClick={() => { setLayered(index === 2); try { localStorage.setItem('tuga.gradientLayered', String(index === 2)); } catch { /* Optional preference. */ } update({ radial: index === 1 }); }}>{name}</Button>)}</div>
    {!layered && !draft.radial && <div className="space-y-2"><Label htmlFor="gradient-angle" className="text-xs">Direção — {draft.angle}°</Label><input id="gradient-angle" type="range" min="0" max="360" value={draft.angle} onChange={(e) => update({ angle: Number(e.target.value) })} className="w-full accent-primary" /></div>}
    {layered && <div className="space-y-4">
      {lightLevels.map((level, i) => <div key={i}><Label htmlFor={`light-level-${i}`} className="text-xs">Intensidade da luz {i + 1} — {level}%</Label><input id={`light-level-${i}`} type="range" min="0" max="100" value={level} className="w-full accent-primary" onChange={(e) => { const next = lightLevels.map((v, index) => index === i ? Number(e.target.value) : v); setLightLevels(next); setApplied(false); try { localStorage.setItem('tuga.gradientLightLevels', JSON.stringify(next)); } catch { /* Optional preference. */ } }} /></div>)}
      {positions.map((point, i) => <fieldset key={i} className="rounded-xl border border-border p-3 space-y-3"><legend className="text-xs px-1">Posição da luz {i + 1}</legend>{['Horizontal', 'Vertical'].map((name, axis) => <div key={name}><Label htmlFor={`light-${i}-${axis}`} className="text-[11px]">{name} — {point[axis]}%</Label><input id={`light-${i}-${axis}`} className="w-full accent-primary" type="range" min="0" max="100" value={point[axis]} onChange={(e) => { const next = positions.map((p, index) => index === i ? p.map((v, a) => a === axis ? Number(e.target.value) : v) : p); setPositions(next); setApplied(false); try { localStorage.setItem('tuga.gradientPositions', JSON.stringify(next)); } catch { /* Optional preference. */ } }} /></div>)}</fieldset>)}
      <div className="space-y-2"><Label htmlFor="light-spread" className="text-xs">Extensão das luzes — {spread}%</Label><input id="light-spread" className="w-full accent-primary" type="range" min="20" max="100" value={spread} onChange={(e) => { setSpread(Number(e.target.value)); setApplied(false); try { localStorage.setItem('tuga.gradientSpread', e.target.value); } catch { /* Optional preference. */ } }} /></div>
    </div>}
    <div className="space-y-2"><Label htmlFor="gradient-strength" className="text-xs">Intensidade — {draft.strength}%</Label><input id="gradient-strength" type="range" min="0" max="100" value={draft.strength} onChange={(e) => update({ strength: Number(e.target.value) })} className="w-full accent-primary" /><p className="text-[11px] text-muted-foreground">Uma intensidade suave mantém o texto fácil de ler.</p></div>
    <div className="flex gap-2"><Button size="sm" onClick={() => { onApply(background); setApplied(true); }}>{applied ? 'Gradiente aplicado' : 'Aplicar gradiente'}</Button><Button size="sm" variant="ghost" onClick={() => update(defaults)}>Repor cores</Button></div>
  </section>;
}

