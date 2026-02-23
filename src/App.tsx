import { useState, useMemo, useEffect } from 'react';
// Eksplicit type-only import for React hændelser (verbatimModuleSyntax)
import type { FormEvent } from 'react';
import { 
  Calendar, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  CalendarDays,
  ShieldAlert,
  CheckCircle2,
  Wand2,
  Settings,
  Lock,
  UserCircle,
  ClipboardList,
  LogOut,
  Users,
  UserPlus,
  ArrowRight,
  UserCheck,
  Info
} from 'lucide-react';

// --- Firebase Setup ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import type { QuerySnapshot, DocumentData } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAy_f-CiJLAKTP6nGMDEysBye5-hozsT2Q",
  authDomain: "vagtplan-47257.firebaseapp.com",
  projectId: "vagtplan-47257",
  storageBucket: "vagtplan-47257.firebasestorage.app",
  messagingSenderId: "170066202547",
  appId: "1:170066202547:web:c64cc218a5894cae5185c6",
  measurementId: "G-G1T4J2LML8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'vagtplan-47257';

// --- Helpers ---
const parseDate = (dateString: string): Date => {
  if (!dateString) return new Date();
  const [y, m, d] = dateString.split('-');
  return new Date(Number(y), Number(m) - 1, Number(d));
};

const formatDateForInput = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateShort = (date: Date): string => {
  return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
};

const getDayName = (date: Date): string => {
  return date.toLocaleDateString('da-DK', { weekday: 'short' });
};

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; 
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'planner' | 'employee'>('employee'); 
  const [currentEmpId, setCurrentEmpId] = useState<string>(''); 
  const [activeTab, setActiveTab] = useState<'input' | 'calendar' | 'staff'>('input');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [weekendShifts, setWeekendShifts] = useState<Shift[]>([]);

  const today = new Date();
  const [period, setPeriod] = useState({
    start: formatDateForInput(new Date(today.getFullYear(), 4, 1)),
    end: formatDateForInput(new Date(today.getFullYear(), 7, 31))
  });
  
  const [maxAway, setMaxAway] = useState(3);
  const [absForm, setAbsForm] = useState({ empId: '', type: 'vacation', start: '', end: '' });
  const [shiftForm, setShiftForm] = useState({ empId: '', date: '', type: '7-vagt' });
  const [newEmployeeName, setNewEmployeeName] = useState('');

  // Sørg for at Tailwind er indlæst hvis StackBlitz mangler det
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e: any) { console.error(e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    try {
      unsubs.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), (s: QuerySnapshot<DocumentData>) => {
        setEmployees(s.docs.map(d => ({ ...d.data(), id: d.id } as Employee)));
      }));
      unsubs.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'absences'), (s: QuerySnapshot<DocumentData>) => {
        setAbsences(s.docs.map(d => ({ ...d.data(), id: d.id } as Absence)));
      }));
      unsubs.push(onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'shifts'), (s: QuerySnapshot<DocumentData>) => {
        setWeekendShifts(s.docs.map(d => ({ ...d.data(), id: d.id } as Shift)));
      }));
    } catch (e: any) { console.error(e); }
    return () => unsubs.forEach(fn => fn());
  }, [user]);

  const getAbsenceOnDate = (date: Date, empId: string) => {
    const time = date.getTime();
    return absences.find(a => a.empId === empId && parseDate(a.start).getTime() <= time && parseDate(a.end).getTime() >= time);
  };

  const getShiftOnDate = (date: Date, empId: string) => {
    const dStr = formatDateForInput(date);
    return weekendShifts.find(s => s.empId === empId && s.date === dStr);
  };

  const periodDates = useMemo(() => {
    const dates: Date[] = [];
    let curr = parseDate(period.start);
    const end = parseDate(period.end);
    while (curr <= end) { dates.push(new Date(curr)); curr.setDate(curr.getDate() + 1); }
    return dates;
  }, [period]);

  const conflicts = useMemo(() => {
    const found: string[] = [];
    weekendShifts.forEach(s => {
      const a = getAbsenceOnDate(parseDate(s.date), s.empId);
      if (a) {
        const emp = employees.find(e => e.id === s.empId);
        found.push(`${emp?.name || 'Ukendt'} har en ${s.type} d. ${formatDateShort(parseDate(s.date))} under ferie.`);
      }
    });
    return found;
  }, [absences, weekendShifts, employees]);

  // Vigtigt: Begræns medarbejder-visning til dem selv
  const visibleEmployees = useMemo(() => {
    if (role === 'planner') return employees.sort((a,b) => a.name.localeCompare(b.name));
    return employees.filter(e => e.id === currentEmpId);
  }, [employees, role, currentEmpId]);

  // Vigtigt: Begræns registreringer til dem selv i listen
  const displayAbsences = useMemo(() => {
    const list = role === 'planner' ? absences : absences.filter(a => a.empId === currentEmpId);
    return [...list].sort((a,b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());
  }, [absences, role, currentEmpId]);

  const handleAddEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), { name: newEmployeeName });
      setNewEmployeeName('');
    } catch (e: any) { console.error(e); }
  };

  const handleDeleteEmployee = async (id: string) => {
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'employees', id)); } catch (e: any) { console.error(e); }
  };

  const handleAddAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!absForm.start || !absForm.end) return;
    const targetId = role === 'employee' ? currentEmpId : absForm.empId;
    if (!targetId) { alert("Vælg venligst dit navn først."); return; }
    const newId = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', newId), { ...absForm, empId: targetId, id: newId });
    setAbsForm({ ...absForm, start: '', end: '', empId: '' });
  };

  const handleAddShift = async (e: FormEvent) => {
    e.preventDefault();
    if (!shiftForm.date || !shiftForm.empId) return alert("Vælg både dato og medarbejder.");
    const newId = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), { ...shiftForm, id: newId });
    setShiftForm({ ...shiftForm, empId: '', date: '', type: '7-vagt' });
  };

  const handleAutoDistribute = async () => {
    const weekendDates = periodDates.filter(d => isWeekend(d));
    let counts: Record<string, number> = {};
    employees.forEach(e => counts[e.id] = weekendShifts.filter(s => s.empId === e.id).length);

    for (const date of weekendDates) {
      const dStr = formatDateForInput(date);
      if (weekendShifts.some(s => s.date === dStr)) continue;
      const time = date.getTime();
      const available = employees.filter(emp => !absences.some(a => a.empId === emp.id && parseDate(a.start).getTime() <= time && parseDate(a.end).getTime() >= time));
      if (available.length > 0) {
        available.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
        const selected = available[0];
        const newId = Date.now().toString() + Math.random().toString(36).substring(7);
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), { empId: selected.id, date: dStr, id: newId, type: '7-vagt' });
        counts[selected.id] = (counts[selected.id] || 0) + 1;
      }
    }
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-white text-slate-400">Indlæser...</div>
  );

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col font-sans text-left overflow-x-hidden">
      {/* GLOBAL CSS OVERRIDE FOR AT FJERNE STACKBLITZ CENTRERING */}
      <style>{`
        #root { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; display: block !important; }
        body { margin: 0; padding: 0; place-items: start !important; background-color: #F8FAFC; }
        * { box-sizing: border-box; }
      `}</style>
      
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 h-16 sticky top-0 z-50 px-4 md:px-8 flex items-center justify-between shadow-sm w-full">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
              <CalendarDays className="w-5 h-5" />
            </div>
            <span className="font-black text-xl text-slate-900 tracking-tight hidden sm:inline uppercase">VagtPlan</span>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('input')}
              className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'input' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ClipboardList className="w-4 h-4" /> <span className="hidden sm:inline">Registrering</span>
            </button>
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Calendar className="w-4 h-4" /> <span className="hidden sm:inline">Kalender</span>
            </button>
            {role === 'planner' && (
              <button 
                onClick={() => setActiveTab('staff')}
                className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'staff' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Users className="w-4 h-4" /> <span className="hidden sm:inline">Personale</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border transition-all group ${!currentEmpId && role === 'employee' ? 'bg-red-50 border-red-200 ring-2 ring-red-100 animate-pulse' : 'bg-slate-50 border-slate-200'}`}>
            <UserCircle className={`w-4 h-4 ${!currentEmpId && role === 'employee' ? 'text-red-400' : 'text-slate-400 group-hover:text-blue-500'}`} />
            <select 
              value={currentEmpId} 
              onChange={(e) => setCurrentEmpId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="">Vælg dit navn...</option>
              {employees.sort((a,b) => a.name.localeCompare(b.name)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          
          <button 
            onClick={() => {
              const newRole = role === 'planner' ? 'employee' : 'planner';
              setRole(newRole);
              if (newRole === 'employee') setActiveTab('input');
            }}
            className={`p-2.5 rounded-xl transition-all border flex items-center gap-2 ${role === 'planner' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
          >
            {role === 'planner' ? <Lock className="w-5 h-5" /> : <UserCircle className="w-5 h-5" />}
            <span className="text-[10px] font-black uppercase tracking-widest hidden lg:inline">
              {role === 'planner' ? 'Admin Mode' : 'Admin Login'}
            </span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8">
        
        {/* --- REGISTRATION VIEW --- */}
        {activeTab === 'input' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            <div className="lg:col-span-12 mb-2">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Fraværsregistrering</h1>
              <p className="text-slate-500 font-medium text-lg mt-1">Indsend dine ønsker til ferie og fridage.</p>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <section className={`bg-white rounded-3xl shadow-sm border p-6 md:p-8 overflow-hidden relative transition-all ${!currentEmpId && role === 'employee' ? 'border-red-100' : 'border-slate-200'}`}>
                <div className={`absolute top-0 left-0 w-full h-1.5 ${!currentEmpId && role === 'employee' ? 'bg-red-400' : (absForm.type === 'vacation' ? 'bg-green-500' : 'bg-amber-500')}`}></div>
                
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-600" /> Nyt ønske
                </h2>

                {!currentEmpId && role === 'employee' ? (
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-100 mb-6">
                    <p className="text-red-700 text-xs font-bold leading-tight flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 shrink-0" /> Du skal vælge dit navn i toppen først!
                    </p>
                  </div>
                ) : role === 'employee' && (
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-6 flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Aktiv profil</p>
                      <p className="text-blue-900 text-sm font-bold">{employees.find(e => e.id === currentEmpId)?.name}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleAddAbsence} className={`space-y-6 ${!currentEmpId && role === 'employee' ? 'opacity-30 pointer-events-none' : ''}`}>
                  {role === 'planner' && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Vælg Medarbejder</label>
                      <select value={absForm.empId} onChange={e => setAbsForm({...absForm, empId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Vælg...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Ønsketype</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vacation'})} className={`py-3 rounded-xl text-xs font-black border transition-all ${absForm.type === 'vacation' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-400'}`}>Ferie</button>
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vagtfri'})} className={`py-3 rounded-xl text-xs font-black border transition-all ${absForm.type === 'vagtfri' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-400'}`}>Vagtfri</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Fra</label>
                      <input type="date" value={absForm.start} onChange={e => setAbsForm({...absForm, start: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Til</label>
                      <input type="date" value={absForm.end} onChange={e => setAbsForm({...absForm, end: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-sm font-black shadow-xl shadow-blue-100 transition-all active:scale-95">Gem ønske</button>
                </form>
              </section>

              {role === 'planner' && (
                <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
                  <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-blue-600" /> Tildel Weekendvagt
                  </h2>
                  <form onSubmit={handleAddShift} className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Dato</label>
                      <input type="date" value={shiftForm.date} onChange={e => setShiftForm({...shiftForm, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Vagttype</label>
                      <select value={shiftForm.type} onChange={e => setShiftForm({...shiftForm, type: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="7-vagt">7-vagt</option>
                        <option value="9-vagt">9-vagt</option>
                        <option value="15-vagt">15-vagt</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Medarbejder</label>
                      <select value={shiftForm.empId} onChange={e => setShiftForm({...shiftForm, empId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Vælg...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                    <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl text-sm font-black shadow-lg transition-all active:scale-95">Bekræft vagt</button>
                  </form>
                </section>
              )}
            </div>

            <div className="lg:col-span-8">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden w-full">
                <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-white">
                  <h2 className="font-black text-2xl text-slate-900">
                    {role === 'planner' ? 'Alle registreringer' : 'Mine registreringer'}
                  </h2>
                  <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-full">
                    <Info className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Cloud Synkroniseret</span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {displayAbsences.length === 0 ? (
                    <div className="p-24 text-center text-slate-400 font-bold italic text-lg">Ingen registreringer fundet...</div>
                  ) : (
                    displayAbsences.map(a => {
                      const emp = employees.find(e => e.id === a.empId);
                      return (
                        <div key={a.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-4 md:gap-6">
                            <div className={`w-1.5 h-12 rounded-full ${a.type === 'vacation' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                            <div>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-black text-lg text-slate-900">{emp?.name || 'Ukendt'}</span>
                                <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-lg ${a.type === 'vacation' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.type === 'vacation' ? 'Ferie' : 'Vagtfri'}</span>
                              </div>
                              <p className="text-sm font-bold text-slate-500 mt-1 flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" /> {formatDateShort(parseDate(a.start))} — {formatDateShort(parseDate(a.end))}
                              </p>
                            </div>
                          </div>
                          {(role === 'planner' || a.empId === currentEmpId) && (
                            <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', a.id))} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- CALENDAR VIEW --- */}
        {activeTab === 'calendar' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {conflicts.length > 0 && role === 'planner' && (
              <div className="bg-red-50 border border-red-100 rounded-[2rem] p-6 md:p-8 flex gap-6">
                <div className="bg-red-500 p-3 rounded-2xl text-white self-start">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-red-900 font-black text-lg">Konflikter fundet</h3>
                  <p className="text-red-700 text-sm font-medium mb-4 italic">Følgende personer er tildelt vagter mens de har ønsket fravær:</p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {conflicts.map((c, i) => <li key={i} className="text-red-600 text-[11px] font-black flex items-center gap-2 bg-white/50 p-2 rounded-lg border border-red-100 uppercase"><ArrowRight className="w-3 h-3" /> {c}</li>)}
                  </ul>
                </div>
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden w-full">
              <div className="p-8 border-b border-slate-100 flex flex-wrap justify-between items-center gap-6 bg-white sticky left-0">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-50 text-blue-600 p-2.5 rounded-2xl">
                    <CalendarDays className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Planlægnings-matrix</h2>
                </div>
                <div className="flex flex-wrap gap-5">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest"><div className="w-3.5 h-3.5 bg-green-500 rounded-md"></div> Ferie</div>
                  <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest"><div className="w-3.5 h-3.5 bg-amber-400 rounded-md"></div> Vagtfri</div>
                  <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest"><div className="w-3.5 h-3.5 bg-blue-600 rounded-md"></div> Vagt</div>
                </div>
              </div>
              
              <div className="overflow-x-auto w-full">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="sticky left-0 z-20 bg-white p-6 text-left border-r border-slate-100 min-w-[200px] shadow-sm">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Medarbejder</span>
                      </th>
                      {periodDates.map((date, i) => (
                        <th key={i} className={`p-3 min-w-[50px] text-center border-r border-slate-100/50 ${isWeekend(date) ? 'bg-slate-50/80' : ''}`}>
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{getDayName(date).charAt(0)}</div>
                          <div className={`text-sm font-black ${isWeekend(date) ? 'text-slate-900' : 'text-slate-500'}`}>{date.getDate()}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={periodDates.length + 1} className="p-24 text-center text-slate-400 font-bold italic text-lg">
                          Vælg dit navn i toppen for at se din plan.
                        </td>
                      </tr>
                    ) : (
                      visibleEmployees.map(emp => (
                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors">
                          <td className={`sticky left-0 z-20 p-6 font-black text-sm border-r border-slate-100 transition-colors ${currentEmpId === emp.id ? 'bg-blue-50/50 text-blue-700' : 'bg-white text-slate-700'}`}>
                            {emp.name}
                          </td>
                          {periodDates.map((date, i) => {
                            const abs = getAbsenceOnDate(date, emp.id);
                            const shift = getShiftOnDate(date, emp.id);
                            const conflict = abs && shift;
                            let bg = "";
                            if (conflict) bg = "bg-red-500";
                            else if (shift) bg = "bg-blue-600 shadow-inner shadow-blue-900/20";
                            else if (abs?.type === 'vacation') bg = "bg-green-500";
                            else if (abs?.type === 'vagtfri') bg = "bg-amber-400";

                            return (
                              <td key={i} className={`p-0 border-r border-slate-100/30 h-14 ${isWeekend(date) && !bg ? 'bg-slate-50/40' : ''}`}>
                                <div className={`w-full h-full flex items-center justify-center transition-all ${bg ? 'scale-[0.85] rounded-xl text-[10px] font-black text-white' : ''} ${bg}`}>
                                  {shift && !conflict && <span>{shift.type.split('-')[0]}</span>}
                                  {conflict && <AlertTriangle className="w-4 h-4 text-white animate-pulse" />}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))
                    )}
                    {role === 'planner' && employees.length > 0 && (
                      <tr className="bg-slate-100/50 border-t-2 border-slate-200">
                        <td className="sticky left-0 z-20 bg-slate-200 p-4 text-right font-black text-[10px] text-slate-500 uppercase border-r border-slate-200">Total på ferie</td>
                        {periodDates.map((date, i) => {
                          const count = employees.filter(e => getAbsenceOnDate(date, e.id)?.type === 'vacation').length;
                          return (
                            <td key={i} className={`text-center font-black text-xs border-r border-slate-100/30 py-3 ${count > maxAway ? 'bg-red-100 text-red-600' : 'text-slate-400'}`}>
                              {count > 0 ? count : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {role === 'planner' && (
              <section className="bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                  <div>
                    <h2 className="text-2xl font-black mb-2 tracking-tight">Indstillinger & Fordeling</h2>
                    <p className="text-slate-400 text-sm font-medium mb-4">Styr periode, grænser og kør automatisk weekend-tildeling.</p>
                    <button onClick={handleAutoDistribute} className="bg-blue-600 hover:bg-blue-500 text-white py-3 px-6 rounded-xl text-sm font-black flex items-center gap-3 transition-all active:scale-95 shadow-xl shadow-blue-900/20">
                      <Wand2 className="w-5 h-5" /> Kør automatisk fordeling
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Planlægning Start</label>
                      <input type="date" value={period.start} onChange={e => setPeriod({...period, start: e.target.value})} className="bg-slate-800 border-none rounded-xl px-4 py-2 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Planlægning Slut</label>
                      <input type="date" value={period.end} onChange={e => setPeriod({...period, end: e.target.value})} className="bg-slate-800 border-none rounded-xl px-4 py-2 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase mb-2 block tracking-widest">Max fravær pr. dag</label>
                      <input type="number" min="1" max="10" value={maxAway} onChange={e => setMaxAway(parseInt(e.target.value))} className="bg-slate-800 border-none rounded-xl px-4 py-2 text-sm font-bold text-white outline-none w-24 focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
                <Settings className="absolute -bottom-8 -right-8 w-48 h-48 text-white/5 rotate-12 pointer-events-none" />
              </section>
            )}
          </div>
        )}

        {/* --- STAFF MANAGEMENT VIEW --- */}
        {activeTab === 'staff' && role === 'planner' && (
          <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
            <header className="mb-12 text-center">
              <h1 className="text-4xl font-black text-slate-900 tracking-tight">Personalestyring</h1>
              <p className="text-slate-500 text-lg">Administrer listen over ansatte i redaktionen.</p>
            </header>

            <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 mb-10">
              <form onSubmit={handleAddEmployee} className="flex gap-4">
                <div className="relative flex-1">
                  <UserPlus className="absolute left-4 top-3.5 w-5 h-5 text-slate-300" />
                  <input type="text" placeholder="Navn på medarbejder..." value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-2xl text-sm font-black transition-all shadow-lg shadow-blue-100">Opret</button>
              </form>
            </section>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {employees.length === 0 ? (
                  <div className="p-16 text-center text-slate-400 font-bold italic text-lg">Ingen medarbejdere oprettet endnu...</div>
                ) : (
                  employees.sort((a,b) => a.name.localeCompare(b.name)).map(emp => (
                    <div key={emp.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center font-black text-lg uppercase">{emp.name.charAt(0)}</div>
                        <span className="font-black text-xl text-slate-900">{emp.name}</span>
                      </div>
                      <button onClick={() => handleDeleteEmployee(emp.id)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100 active:scale-95">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="h-24 flex items-center justify-center border-t border-slate-100 bg-white mt-auto">
        <button onClick={() => window.location.reload()} className="flex items-center gap-3 text-slate-400 hover:text-slate-900 font-black text-xs uppercase tracking-widest transition-all">
          <LogOut className="w-4 h-4" /> Nulstil session
        </button>
      </footer>
    </div>
  );
}

// Interfaces 
interface Employee { id: string; name: string; }
interface Absence { id: string; empId: string; type: string; start: string; end: string; }
interface Shift { id: string; empId: string; date: string; type: string; }