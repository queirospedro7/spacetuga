import type { CSSProperties } from 'react';
export type MascotMood = 'idle' | 'greet' | 'typing' | 'privacy' | 'peek' | 'loading' | 'error';
export function MascotFace({ className='', animated=false, mood='idle', activity=0, look={x:0,y:0,lean:0} }: { className?:string; animated?:boolean; mood?:MascotMood; activity?:number; look?:{x:number;y:number;lean:number} }) {
  return <svg className={`${className} ${animated?'tuga-mascot-reactive':''}`} data-mood={mood} style={{'--gaze-x': `${look.x}px`,'--gaze-y': `${look.y}px`,'--pose-angle': `${look.lean}deg`} as CSSProperties} viewBox="0 0 120 120" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <g className="companion-body">
      <g className="icon-leg-left"><path d="M44 74L43 99" stroke="#202224" strokeWidth="5" strokeLinecap="round"/><path d="M43 99L34 104H48" stroke="#202224" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></g>
      <g className="icon-leg-right"><path d="M76 74L77 99" stroke="#202224" strokeWidth="5" strokeLinecap="round"/><path d="M77 99L86 104H72" stroke="#202224" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></g>
      <path d="M60 15C38 15 21 30 21 51C21 71 36 85 57 87L71 98C74 100 78 98 78 94V85C91 79 99 68 99 52C99 30 82 15 60 15Z" fill="white" stroke="#202224" strokeWidth="2.5" strokeLinejoin="round"/>
      <g className="companion-eyes"><g className="companion-gaze"><ellipse cx="48" cy="50" rx="4.3" ry="5.6" fill="#202224"/><ellipse cx="72" cy="50" rx="4.3" ry="5.6" fill="#202224"/></g></g>
      <path className="companion-smile" d="M48 67C51 71 55 73 60 73C65 73 69 71 72 67" stroke="#202224" strokeWidth="3.5" strokeLinecap="round"/>
      <path className="companion-worry" d="M50 71Q60 62 70 71" stroke="#202224" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="35" cy="61" r="3" fill="#202224" fillOpacity=".12"/><circle cx="85" cy="61" r="3" fill="#202224" fillOpacity=".12"/>
      <g className="companion-hands"><ellipse className="companion-hand companion-hand-left" cx="42" cy="87" rx="10" ry="6" fill="white" stroke="#202224" strokeWidth="2.5"/><ellipse className="companion-hand companion-hand-right" cx="78" cy="87" rx="10" ry="6" fill="white" stroke="#202224" strokeWidth="2.5"/></g>
      <circle key={activity} className="companion-spark" cx="106" cy="24" r="3" fill="#202224"/>
    </g>
  </svg>;
}

