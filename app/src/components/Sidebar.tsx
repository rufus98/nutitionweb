import { useApp, type Route } from '../app/store';
import { initialsOf } from '../lib/format';
import { cx } from './ui';

export const NAV: { id: Route['name']; label: string; key: string; match: Route['name'][] }[] = [
  { id: 'today', label: 'Oggi', key: '1', match: ['today'] },
  { id: 'patients', label: 'Pazienti', key: '2', match: ['patients', 'patient', 'new'] },
  { id: 'agenda', label: 'Agenda', key: '3', match: ['agenda'] },
  { id: 'plans', label: 'Piani nutrizionali', key: '4', match: ['plans'] },
  { id: 'payments', label: 'Pagamenti', key: '5', match: ['payments'] },
  { id: 'settings', label: 'Impostazioni', key: '6', match: ['settings'] },
];

export function Sidebar() {
  const { route, go, settings, patientCount } = useApp();
  const prof = settings?.prof;
  return (
    <aside className="bg-side text-[#DCE7E2] px-3.5 py-[22px] flex flex-col gap-7 h-full">
      <div className="flex items-center gap-2.5 px-2">
        {settings?.logo
          ? <img src={settings.logo} alt="" className="w-7 h-7 rounded-lg object-cover" />
          : <div className="w-7 h-7 rounded-lg bg-sage-400 text-[#0F3B40] grid place-items-center font-bold text-[15px]">n</div>}
        <div className="font-semibold text-base text-white tracking-[-.01em]">Nutrea <span className="text-side-muted font-medium">Studio</span></div>
      </div>
      <nav className="flex flex-col gap-0.5" aria-label="Sezioni">
        {NAV.map((n) => {
          const active = n.match.includes(route.name);
          return (
            <button key={n.id} onClick={() => go({ name: n.id } as Route)} title={`${n.label} (Ctrl+${n.key})`} aria-current={active ? 'page' : undefined}
              className={cx('px-2.5 py-[9px] rounded-lg text-left border-0 flex justify-between items-center text-sm',
                active ? 'bg-[rgba(169,198,177,.16)] text-white font-semibold' : 'bg-transparent text-side-ink hover:bg-white/[.06] hover:text-white')}>
              {n.label}
              {n.id === 'patients' && <span className="font-mono text-[11px] font-medium text-sage-400">{patientCount}</span>}
            </button>
          );
        })}
      </nav>
      <button onClick={() => go({ name: 'settings' })} className="mt-auto px-2.5 py-3 border-0 border-t border-white/10 bg-transparent flex gap-2.5 items-center text-left rounded-none hover:bg-white/[.03]">
        <div className="w-8 h-8 rounded-full bg-side-av text-white grid place-items-center text-xs font-semibold flex-none">{initialsOf((prof?.name || 'Studio').replace(/^(Dott\.ssa|Dott\.|Dr\.?)\s+/i, ''))}</div>
        <div className="min-w-0">
          <div className="text-white font-medium text-[13px] truncate">{prof?.name || 'Profilo studio'}</div>
          <div className="text-xs text-side-muted truncate">{prof?.title || 'Completa le impostazioni'}</div>
        </div>
      </button>
    </aside>
  );
}
