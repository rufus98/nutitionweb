// Accesso del paziente: prima volta (dal link di attivazione sceglie la password) e accessi successivi (password).
// Moduli compatibili con i gestori di password: il "nome utente" nascosto è il link personale.
import { useState, type FormEvent, type ReactNode } from 'react';
import { activate, ApiError, FormError, login, type AuthNeeded } from './api';

const RULE = 'Almeno 10 caratteri. Una frase facile da ricordare va benissimo.';

function Shell({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto px-7 py-10 flex flex-col justify-center gap-6 text-[#18211F]">{children}</div>;
}

function Logo() {
  return <div className="w-12 h-12 rounded-[13px] bg-[#0F3B40] text-[#A9C6B1] grid place-items-center font-bold text-xl">n</div>;
}

function PasswordField({ id, label, value, onChange, autoComplete, show, autoFocus }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; show: boolean; autoFocus?: boolean }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[#2C3533]">{label}</span>
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} required
        className="h-[52px] rounded-[14px] border border-[#DAD8D1] bg-white px-4 text-[16px] outline-none focus:border-[#1E5A5F] focus:ring-2 focus:ring-[#1E5A5F]/15" />
    </label>
  );
}

function Help({ info }: { info: AuthNeeded }) {
  if (!info.studio.whatsapp) return null;
  const text = encodeURIComponent(`Ciao, sono ${info.firstName}: mi serve un nuovo link per accedere all'app del piano nutrizionale.`);
  return (
    <a href={`https://wa.me/${info.studio.whatsapp}?text=${text}`} target="_blank" rel="noopener noreferrer" className="text-center text-[14px] font-semibold text-[#1E5A5F] no-underline">
      Chiedi aiuto a {info.studio.name || 'lo studio'} su WhatsApp
    </a>
  );
}

/** Prima volta: il link contiene il codice di attivazione; il paziente sceglie la password. */
export function Activate({ token, code, info, onDone, onUseLogin }: { token: string; code: string; info: AuthNeeded; onDone: () => void; onUseLogin: () => void }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; code?: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if ([...pw].length < 10) return setErr({ text: 'La password deve avere almeno 10 caratteri', code: 'password' });
    if (pw !== pw2) return setErr({ text: 'Le due password non coincidono', code: 'password' });
    setBusy(true); setErr(null);
    try { await activate(token, code, pw); onDone(); }
    catch (x) { setErr({ text: x instanceof FormError || x instanceof ApiError ? x.message : 'Attivazione non riuscita: riprova', code: x instanceof FormError ? x.code : undefined }); setBusy(false); }
  };
  const expired = err?.code === 'activation';
  return (
    <Shell>
      <Logo />
      <div>
        <div className="text-[14px] text-[#6B7472]">{info.studio.name}</div>
        <h1 className="m-0 text-[27px] font-semibold tracking-[-.02em] leading-tight">{info.firstName ? `Ciao ${info.firstName}, ` : ''}scegli la tua password</h1>
        <p className="mt-2 mb-0 text-[15px] leading-[1.55] text-[#5E6866]">Ti servirà per aprire il piano dal tuo link personale. Solo tu la conosci: lo studio non la vede.</p>
      </div>
      {expired ? <>
        <div className="text-[14px] text-[#9B2C1F] bg-[#FBEDEA] rounded-[12px] px-4 py-3 leading-snug">{err!.text}</div>
        {info.state === 'login' && <button onClick={onUseLogin} className="h-[54px] rounded-[15px] border border-[#DAD8D1] bg-white font-semibold text-base">Ho già una password: accedi</button>}
        <Help info={info} />
      </> : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input type="text" name="username" autoComplete="username" value={`${location.host}/p/${token}`} readOnly hidden />
          <PasswordField id="new" label="Nuova password" value={pw} onChange={setPw} autoComplete="new-password" show={show} autoFocus />
          <PasswordField id="again" label="Ripeti la password" value={pw2} onChange={setPw2} autoComplete="new-password" show={show} />
          <label className="flex items-center gap-2.5 text-[14px] text-[#5E6866]"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-5 h-5 accent-[#1E5A5F]" />Mostra la password</label>
          <div className="text-[13px] text-[#6B7472]">{RULE}</div>
          {err && <div role="alert" className="text-[14px] text-[#9B2C1F] bg-[#FBEDEA] rounded-[12px] px-4 py-3">{err.text}</div>}
          <button disabled={busy} className="h-[54px] rounded-[15px] border-0 bg-[#1E5A5F] text-white font-semibold text-base disabled:opacity-60">{busy ? 'Un momento…' : 'Salva e apri il piano'}</button>
        </form>
      )}
    </Shell>
  );
}

/** Accessi successivi: link personale + password. */
export function Login({ token, info, onDone }: { token: string; info: AuthNeeded; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await login(token, pw); onDone(); }
    catch (x) { setErr(x instanceof FormError || x instanceof ApiError ? x.message : 'Accesso non riuscito: riprova'); setBusy(false); setPw(''); }
  };
  if (info.state === 'activate') {
    return (
      <Shell>
        <Logo />
        <div>
          <h1 className="m-0 text-[27px] font-semibold tracking-[-.02em] leading-tight">{info.firstName ? `Ciao ${info.firstName}` : 'Ciao'}</h1>
          <p className="mt-2 mb-0 text-[15px] leading-[1.55] text-[#5E6866]">Per il primo accesso apri il <b>link di attivazione</b> che ti ha inviato {info.studio.name || 'lo studio'}: lì sceglierai la tua password.</p>
        </div>
        <Help info={info} />
      </Shell>
    );
  }
  return (
    <Shell>
      <Logo />
      <div>
        <div className="text-[14px] text-[#6B7472]">{info.studio.name}</div>
        <h1 className="m-0 text-[27px] font-semibold tracking-[-.02em] leading-tight">{info.firstName ? `Ciao ${info.firstName}` : 'Ciao'}</h1>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input type="text" name="username" autoComplete="username" value={`${location.host}/p/${token}`} readOnly hidden />
        <PasswordField id="pw" label="Password" value={pw} onChange={setPw} autoComplete="current-password" show={show} autoFocus />
        <label className="flex items-center gap-2.5 text-[14px] text-[#5E6866]"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="w-5 h-5 accent-[#1E5A5F]" />Mostra la password</label>
        {err && <div role="alert" className="text-[14px] text-[#9B2C1F] bg-[#FBEDEA] rounded-[12px] px-4 py-3">{err}</div>}
        <button disabled={busy || !pw} className="h-[54px] rounded-[15px] border-0 bg-[#1E5A5F] text-white font-semibold text-base disabled:opacity-60">{busy ? 'Un momento…' : 'Apri il mio piano'}</button>
      </form>
      <div className="text-center text-[13.5px] text-[#6B7472]">Password dimenticata? Chiedi allo studio un nuovo link di attivazione.</div>
      <Help info={info} />
    </Shell>
  );
}
