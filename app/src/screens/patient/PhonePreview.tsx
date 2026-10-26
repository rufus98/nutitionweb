import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import * as repo from '../../db/repo';
import type { Appointment, Patient, Plan, Visit } from '../../db/types';
import { useEscape } from '../../components/ui';
import { today } from '../../lib/format';
import { buildPatientView } from '../../patientApp/buildView';
import { PatientApp, type PatientStore } from '../../patientApp/PatientApp';

/** Anteprima dell'app paziente in una cornice da telefono: è lo stesso componente della web app (web/),
 *  con gli stessi dati che il server pubblica per questo paziente (buildPatientView). */
export function PhonePreview({ patient, plan, onClose }: { patient: Patient; plan: Plan; onClose: () => void }) {
  const { settings } = useApp();
  useEscape(onClose);
  const [data, setData] = useState<{ visits: Visit[]; appts: Appointment[] } | null>(null);
  const [scale, setScale] = useState(1);
  const [banner, setBanner] = useState(settings!.app.install);
  useEffect(() => {
    Promise.all([repo.listVisits(patient.id), repo.patientAppointments(patient.id)]).then(([visits, appts]) => setData({ visits, appts }));
    const fit = () => setScale(Math.min(1, (window.innerHeight - 48) / 844));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [patient.id]);
  // Memoria dell'anteprima: solo in RAM, non tocca il telefono del paziente.
  const store = useMemo<PatientStore>(() => { const m = new Map<string, string>(); return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) }; }, []);
  const view = useMemo(() => data && buildPatientView({
    patient, plan, visits: data.visits, appointments: data.appts, settings: settings!, today: today(), pdfUrl: plan.has_pdf ? '#' : null,
  }), [data, patient, plan, settings]);
  const s = settings!;

  return (
    <div className="fixed inset-0 z-30 grid place-items-center animate-[fadeIn_.12s_ease]" style={{ background: 'rgb(var(--overlay) / var(--overlay-a))' }} onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="relative" style={{ width: 390 * scale, height: 844 * scale }}>
        <button onClick={onClose} className="absolute -right-12 top-0 w-9 h-9 rounded-full border-0 bg-white/90 text-[#18211F] text-lg" aria-label="Chiudi anteprima">×</button>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 390, height: 844, colorScheme: 'light' }}
          className="rounded-[54px] bg-[#0E1716] p-2.5 shadow-[0_30px_70px_rgba(15,30,32,.28)]">
          <div className="relative w-[370px] h-[824px] rounded-[44px] overflow-hidden bg-[#F6F5F1] flex flex-col text-[#18211F]" style={{ fontFamily: 'Figtree, sans-serif' }}>
            <div className="h-[50px] flex-none flex justify-between items-center px-[30px] text-[15px] font-semibold relative z-[2]">
              <span>9:41</span><span className="absolute left-1/2 top-[11px] -translate-x-1/2 w-[120px] h-8 rounded-[20px] bg-[#0E1716]" />
              <span className="flex gap-[5px] items-center"><span className="w-[17px] h-2.5 rounded-sm bg-[#18211F]" /><span className="w-6 h-[11px] rounded-[3px] border-[1.5px] border-[#18211F] p-px"><span className="block w-[70%] h-full bg-[#18211F] rounded-[1px]" /></span></span>
            </div>
            <div className="flex-none text-center font-mono text-[10.5px] pb-1 text-[#8A928F]">{s.appDomain}/p/{patient.token}</div>
            <div className="flex-1 min-h-0 pb-[18px] bg-[#F6F5F1]">
              {view && <PatientApp view={view} env={{ today: today(), store, preview: true, install: { show: banner, prompt: null, dismiss: () => setBanner(false) } }} />}
            </div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[130px] h-[5px] rounded-[3px] bg-[#18211F]" />
          </div>
        </div>
      </div>
    </div>
  );
}
