import { useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { bannerStyle } from './banner-style';
export type CallBackground = { mode: 'neutral' | 'profile' | 'custom'; value: string };
const key = 'tuga.callBackground';
function snapshot() { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function subscribe(listener: () => void) { window.addEventListener('tuga-call-background', listener); window.addEventListener('storage', listener); return () => { window.removeEventListener('tuga-call-background', listener); window.removeEventListener('storage', listener); }; }
export function useCallBackground(): CallBackground { const raw=useSyncExternalStore(subscribe,snapshot,()=> ''); try { const value=JSON.parse(raw); if (['neutral','profile','custom'].includes(value?.mode) && typeof value.value==='string' && value.value.length<600000) return value; } catch { /* Neutral by default. */ } return {mode:'neutral',value:'#202a28'}; }
export function saveCallBackground(value:CallBackground) { localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new Event('tuga-call-background')); }
export function callTileBackground(settings:CallBackground,profileBanner?:string,position=50):CSSProperties { const value=settings.mode==='neutral'?'':settings.mode==='profile'?profileBanner:settings.value;if(!value)return {}; if (/^(data:|https?:|blob:)/i.test(value)) return {}; const style=bannerStyle(value,'#141418',position);return {...style,backgroundImage:style.backgroundImage==='none'?'linear-gradient(#0005,#0008)':`linear-gradient(#0005,#0008), ${style.backgroundImage}`}; }

