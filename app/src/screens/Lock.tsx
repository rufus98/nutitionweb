import { useState } from 'react';
import { useApp } from '../app/store';

/** Blocco con PIN all'avvio (Impostazioni → Privacy & sicurezza). */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { settings } = useApp();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const submit = () => {
    if (pin === settings?.pin) onUnlock();
    else { setErr(true); setPin(''); }
  };
  return (
    <div className="h-full grid place-items-center bg-side">
      <form className="flex flex-col items-center gap-5 w-[300px]" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="w-11 h-11 rounded-xl bg-sage-400 text-[#0F3B40] grid place-items-center font-bold text-xl">n</div>
        <div className="text-center"><div className="text-white text-xl font-semibold">Nutrea Studio è bloccato</div><div className="text-side-muted text-[13px] mt-1">Inserisci il PIN per continuare</div></div>
        <input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setErr(false); }}
          className="w-full text-center tracking-[.5em] text-xl font-mono py-3 rounded-ctl border border-white/15 bg-white/[.06] text-white outline-none focus:border-sage-400" maxLength={8} aria-label="PIN" />
        {err && <div className="text-[#F0A39A] text-[13px] -mt-2">PIN non corretto</div>}
        <button className="w-full py-3 rounded-ctl bg-sage-400 text-[#0F3B40] font-bold border-0">Sblocca</button>
      </form>
    </div>
  );
}
