type State = 'CLOSED'|'OPEN'|'HALF_OPEN';
export function createCircuit({failureThreshold=5, halfOpenAfterMs=15000, onStateChange}:{failureThreshold?:number;halfOpenAfterMs?:number;onStateChange?:(s:State)=>void} = {}) {
  let state: State = 'CLOSED', fails = 0, nextTry = 0;
  const set = (s: State) => { if (s!==state){ state=s; onStateChange?.(s);} };
  async function exec<T>(fn:()=>Promise<T>) {
    const now = Date.now();
    if (state==='OPEN') { if (now>=nextTry) set('HALF_OPEN'); else throw new Error('CircuitBreaker: OPEN'); }
    try { const r = await fn(); fails=0; set('CLOSED'); return r; }
    catch (e){ fails++; if (state==='HALF_OPEN' || fails>=failureThreshold){ set('OPEN'); nextTry = now + halfOpenAfterMs; } throw e; }
  }
  return { exec, getState:()=>state };
}

