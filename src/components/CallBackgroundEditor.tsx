import { useState } from 'react';
import { useCallBackground, saveCallBackground, callTileBackground, type CallBackground } from '@/lib/call-background';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { GradientEditor } from './GradientEditor';
export function CallBackgroundEditor({ banner }: { banner?: string }) {
  const settings=useCallBackground();const [error,setError]=useState('');
  function save(value:CallBackground){try{saveCallBackground(value);setError('');}catch{setError('Não foi possível guardar o fundo. Tenta novamente.');}}
  return <section className="rounded-3xl border border-border bg-card p-6 space-y-5"><div><h3 className="text-sm font-semibold">Fundo da chamada</h3><p className="text-xs text-muted-foreground mt-1">Escolhe o aspeto dos cartões dos participantes. A preferência fica guardada neste dispositivo.</p></div><div className="grid gap-2 sm:grid-cols-3">{([{mode:'neutral',label:'Neutro'},{mode:'profile',label:'Cor do perfil'},{mode:'custom',label:'Personalizado'}] as const).map((option)=><Button key={option.mode} size="sm" variant={settings.mode===option.mode?'default':'outline'} aria-pressed={settings.mode===option.mode} onClick={()=>save({...settings,mode:option.mode})}>{option.label}</Button>)}</div><div className="h-36 rounded-2xl border border-white/10 bg-[#141418] flex flex-col items-center justify-center text-white" style={callTileBackground(settings,banner)}><span className="grid size-12 place-items-center rounded-2xl bg-white/15 text-lg">T</span><span className="mt-2 text-xs">Pré-visualização</span></div>
  {settings.mode==='custom'&&<><div className="flex items-center justify-between gap-4"><Label htmlFor="call-background-color" className="text-xs">Cor sólida</Label><input id="call-background-color" type="color" value={/^#[a-f0-9]{6}$/i.test(settings.value)?settings.value:'#202a28'} onChange={(e)=>save({mode:'custom',value:e.target.value})} className="h-10 w-16 rounded-lg border border-border" /></div><GradientEditor onApply={(value)=>save({mode:'custom',value})}/></>}
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}</section>;
}


