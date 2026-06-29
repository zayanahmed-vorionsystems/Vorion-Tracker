export function fmtCompact(secs:number){
  if (!secs) return '0:00';
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  return `${h}:${String(m).padStart(2,'0')}`;
}

export function fmtPrecise(secs:number){
  if (!secs) return '0:00:00';
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = Math.floor(secs%60);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function timeAgo(iso:string){
  try{
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime())/1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }catch{ return '' }
}
