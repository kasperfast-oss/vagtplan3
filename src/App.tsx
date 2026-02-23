import { useState, useMemo, useEffect } from 'react';
// Explicit type-only import for React events (verbatimModuleSyntax)
import type { FormEvent } from 'react';
import { 
  Calendar, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  CalendarDays,
  ShieldAlert,
  Wand2,
  Settings,
  Lock,
  UserCircle,
  ClipboardList,
  LogOut,
  Users,
  UserPlus,
  UserCheck,
  Info,
  Download,
  ChevronRight
} from 'lucide-react';

// --- Firebase Setup ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, updateDoc } from 'firebase/firestore';
import type { QuerySnapshot, DocumentData } from 'firebase/firestore';

// --- Interfaces ---
interface Employee { id: string; name: string; }
interface Absence { id: string; empId: string; type: string; start: string; end: string; }
interface Shift { id: string; empId: string; date: string; type: string; }

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

// --- Hjælpefunktioner ---
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

const getMonthName = (date: Date): string => {
  return date.toLocaleDateString('da-DK', { month: 'long' }).toUpperCase();
};

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; 
};

export default function App() {
  // --- Tilstand (State) ---
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

  // Sørg for at Tailwind er indlæst
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

  // --- Logik og Filtre ---
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

  const monthGroups = useMemo(() => {
    const groups: { name: string; span: number }[] = [];
    if (periodDates.length === 0) return groups;
    let currentMonth = getMonthName(periodDates[0]);
    let count = 0;
    periodDates.forEach((date, index) => {
      const m = getMonthName(date);
      if (m === currentMonth) { count++; } else {
        groups.push({ name: currentMonth, span: count });
        currentMonth = m;
        count = 1;
      }
      if (index === periodDates.length - 1) { groups.push({ name: currentMonth, span: count }); }
    });
    return groups;
  }, [periodDates]);

  const conflicts = useMemo(() => {
    const found: string[] = [];
    weekendShifts.forEach(s => {
      if (!s.empId) return;
      const a = getAbsenceOnDate(parseDate(s.date), s.empId);
      if (a) {
        const emp = employees.find(e => e.id === s.empId);
        found.push(`${emp?.name || 'Ukendt'} har en ${s.type} d. ${formatDateShort(parseDate(s.date))} under ferie.`);
      }
    });
    return found;
  }, [absences, weekendShifts, employees]);

  const visibleEmployees = useMemo(() => {
    if (role === 'planner') return employees.sort((a,b) => a.name.localeCompare(b.name));
    return employees.filter(e => e.id === currentEmpId);
  }, [employees, role, currentEmpId]);

  const displayAbsences = useMemo(() => {
    const list = role === 'planner' ? absences : absences.filter(a => a.empId === currentEmpId);
    return [...list].sort((a,b) => parseDate(a.start).getTime() - parseDate(b.start).getTime());
  }, [absences, role, currentEmpId]);

  // --- Handlinger ---
  const handleExportFullCSV = () => {
    let csv = "\uFEFFNavn;Type;Dato;Detaljer\n";
    employees.sort((a,b) => a.name.localeCompare(b.name)).forEach(emp => {
      periodDates.forEach(date => {
        const abs = getAbsenceOnDate(date, emp.id);
        const shift = getShiftOnDate(date, emp.id);
        if (abs) csv += `${emp.name};Fravær;${formatDateShort(date)};${abs.type === 'vacation' ? 'Ferie' : 'Vagtfri'}\n`;
        if (shift) csv += `${emp.name};Vagt;${formatDateShort(date)};${shift.type}\n`;
      });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `fuld_vagtplan.csv`;
    link.click();
  };

  const handleExportIndividualCSV = () => {
    if (!currentEmpId) return;
    const emp = employees.find(e => e.id === currentEmpId);
    if (!emp) return;
    let csv = `\uFEFFVagtplan for ${emp.name}\nDato;Dag;Type;Detalje\n`;
    periodDates.forEach(date => {
      const abs = getAbsenceOnDate(date, emp.id);
      const shift = getShiftOnDate(date, emp.id);
      if (abs || shift) {
        const type = abs ? 'Fravær' : 'Vagt';
        const detail = abs ? (abs.type === 'vacation' ? 'Ferie' : 'Vagtfri') : shift?.type;
        csv += `${formatDateShort(date)};${getDayName(date)};${type};${detail}\n`;
      }
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `min_vagtplan_${emp.name}.csv`;
    link.click();
  };

  const handleAddEmployee = async (e: FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'employees'), { name: newEmployeeName });
      setNewEmployeeName('');
    } catch (e: any) { console.error(e); }
  };

  const handleDeleteEmployee = async (id: string) => {
    if (window.confirm("Slet medarbejder?")) {
      try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'employees', id)); } catch (e: any) { console.error(e); }
    }
  };

  const handleAddAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!absForm.start || !absForm.end) return;
    const targetId = role === 'employee' ? currentEmpId : absForm.empId;
    if (!targetId) { alert("Vælg dit navn først."); return; }
    const newId = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', newId), { ...absForm, empId: targetId, id: newId });
    setAbsForm({ ...absForm, start: '', end: '', empId: '' });
  };

  const handleAddShift = async (e: FormEvent) => {
    e.preventDefault();
    if (!shiftForm.date) return alert("Vælg en dato.");
    const newId = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), { ...shiftForm, id: newId });
    setShiftForm({ ...shiftForm, empId: '', date: '', type: '7-vagt' });
  };

  const handleAutoDistribute = async () => {
    const unassignedShifts = weekendShifts.filter(s => !s.empId);
    if (unassignedShifts.length === 0) return alert("Ingen ledige vagter.");
    let counts: Record<string, number> = {};
    employees.forEach(e => counts[e.id] = weekendShifts.filter(s => s.empId === e.id).length);
    for (const shift of unassignedShifts) {
      const time = parseDate(shift.date).getTime();
      const available = employees.filter(emp => !absences.some(a => a.empId === emp.id && parseDate(a.start).getTime() <= time && parseDate(a.end).getTime() >= time));
      if (available.length > 0) {
        available.sort((a, b) => (counts[a.id] || 0) - (counts[b.id] || 0));
        const selected = available[0];
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', shift.id), { empId: selected.id });
        counts[selected.id] = (counts[selected.id] || 0) + 1;
      }
    }
  };

  const handleClearAllAbsences = async () => {
    if (window.confirm("Ryd ALT fravær?")) {
      const promises = absences.map(a => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', a.id)));
      await Promise.all(promises);
    }
  };

  const handleClearAllShifts = async () => {
    if (window.confirm("Ryd ALLE vagter?")) {
      const promises = weekendShifts.map(s => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', s.id)));
      await Promise.all(promises);
    }
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-400 font-sans uppercase tracking-widest text-xs">Forbinder...</div>;

  return (
    <div className="min-h-screen w-full bg-[#F8FAFC] flex flex-col font-sans text-left overflow-x-hidden">
      <style>{`
        #root { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; display: block !important; }
        body { margin: 0; padding: 0; place-items: start !important; background-color: #F8FAFC; }
        * { box-sizing: border-box; }
        .sticky-month-text {
          position: sticky;
          left: 200px;
          display: inline-block;
          padding: 0 1rem;
          white-space: nowrap;
        }
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
            <button onClick={() => setActiveTab('input')} className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'input' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <ClipboardList className="w-4 h-4" /> <span className="hidden sm:inline">Registrering</span>
            </button>
            <button onClick={() => setActiveTab('calendar')} className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Calendar className="w-4 h-4" /> <span className="hidden sm:inline">Kalender</span>
            </button>
            {role === 'planner' && (
              <button onClick={() => setActiveTab('staff')} className={`flex items-center gap-2 px-3 md:px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'staff' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <Users className="w-4 h-4" /> <span className="hidden sm:inline">Personale</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border transition-all group ${!currentEmpId && role === 'employee' ? 'bg-red-50 border-red-200 ring-2 ring-red-100 animate-pulse' : 'bg-slate-50 border-slate-200'}`}>
            <UserCircle className={`w-4 h-4 ${!currentEmpId && role === 'employee' ? 'text-red-400' : 'text-slate-400 group-hover:text-blue-500'}`} />
            <select value={currentEmpId} onChange={(e) => setCurrentEmpId(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer">
              <option value="">Vælg dit navn...</option>
              {employees.sort((a,b) => a.name.localeCompare(b.name)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <button onClick={() => {setRole(role==='planner'?'employee':'planner'); if(role==='planner')setActiveTab('input');}} className={`p-2.5 rounded-xl transition-all border flex items-center gap-2 ${role === 'planner' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
            {role === 'planner' ? <Lock className="w-5 h-5" /> : <UserCircle className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 text-left">
        {activeTab === 'input' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            <div className="lg:col-span-12 mb-2 flex justify-between items-end">
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight">Fraværsregistrering</h1>
                <p className="text-slate-500 font-medium text-lg mt-1">Indsend dine ønsker til ferie og fridage herunder.</p>
              </div>
              {currentEmpId && role === 'employee' && (
                <button onClick={handleExportIndividualCSV} className="bg-white border border-slate-200 px-6 py-3 rounded-2xl text-sm font-black text-slate-700 flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
                  <Download className="w-4 h-4 text-blue-600" /> Download min plan
                </button>
              )}
            </div>

            <div className="lg:col-span-4 space-y-6">
              <section className={`bg-white rounded-3xl shadow-sm border p-6 md:p-8 overflow-hidden relative transition-all ${!currentEmpId && role === 'employee' ? 'border-red-100' : 'border-slate-200'}`}>
                <div className={`absolute top-0 left-0 w-full h-1.5 ${!currentEmpId && role === 'employee' ? 'bg-red-400' : (absForm.type === 'vacation' ? 'bg-green-500' : 'bg-amber-500')}`}></div>
                <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2 text-left"><Plus className="w-5 h-5 text-blue-600" /> Nyt ønske</h2>
                
                {currentEmpId && role === 'employee' ? (
                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-6 flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <div className="text-left">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">Aktiv profil</p>
                      <p className="text-blue-900 text-sm font-bold leading-none">{employees.find(e => e.id === currentEmpId)?.name}</p>
                    </div>
                  </div>
                ) : role === 'employee' && (
                  <div className="bg-red-50 p-4 rounded-2xl border border-red-100 mb-6 flex items-center gap-2 text-red-700 text-xs font-bold leading-tight"><AlertTriangle className="w-5 h-5 shrink-0" /> Vælg dit navn i toppen først!</div>
                )}

                <form onSubmit={handleAddAbsence} className={`space-y-6 ${!currentEmpId && role === 'employee' ? 'opacity-30 pointer-events-none' : ''}`}>
                  {role === 'planner' && (
                    <div className="text-left">
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest ml-1">Medarbejder</label>
                      <select value={absForm.empId} onChange={e => setAbsForm({...absForm, empId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all">
                        <option value="">Vælg...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest ml-1">Ønsketype</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vacation'})} className={`py-3 rounded-xl text-xs font-black border transition-all ${absForm.type === 'vacation' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-400'}`}>Ferie</button>
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vagtfri'})} className={`py-3 rounded-xl text-xs font-black border transition-all ${absForm.type === 'vagtfri' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-400'}`}>Vagtfri</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input type="date" value={absForm.start} onChange={e => setAbsForm({...absForm, start: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="date" value={absForm.end} onChange={e => setAbsForm({...absForm, end: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl text-sm font-black shadow-xl shadow-blue-100 transition-all active:scale-95">Gem registrering</button>
                </form>
              </section>

              {role === 'planner' && (
                <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 overflow-hidden relative text-left">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600"></div>
                  <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-8 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-blue-600" /> Indskriv Vagtbehov</h2>
                  <form onSubmit={handleAddShift} className="space-y-6">
                    <input type="date" value={shiftForm.date} onChange={e => setShiftForm({...shiftForm, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={shiftForm.type} onChange={e => setShiftForm({...shiftForm, type: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="7-vagt">7-vagt</option><option value="9-vagt">9-vagt</option><option value="15-vagt">15-vagt</option>
                    </select>
                    <select value={shiftForm.empId} onChange={e => setShiftForm({...shiftForm, empId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Lad være ledig (auto-fordel)</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl text-sm font-black shadow-lg transition-all active:scale-95">Bekræft vagtbehov</button>
                  </form>
                </section>
              )}
            </div>

            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden w-full text-left">
                <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center bg-white">
                  <h2 className="font-black text-2xl text-slate-900 uppercase tracking-tight">{role === 'planner' ? 'Alle registreringer' : 'Mine registreringer'}</h2>
                  <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-full leading-none"><Info className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest leading-none">Opdateret</span></div>
                </div>
                <div className="divide-y divide-slate-100">
                  {displayAbsences.length === 0 ? <div className="p-24 text-center text-slate-400 font-bold italic text-lg">Ingen registreringer fundet...</div> : displayAbsences.map(a => {
                    const emp = employees.find(e => e.id === a.empId);
                    return (
                      <div key={a.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-4 md:gap-6">
                          <div className={`w-1.5 h-12 rounded-full ${a.type === 'vacation' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                          <div>
                            <div className="flex items-center gap-3"><span className="font-black text-lg text-slate-900">{emp?.name || 'Ukendt'}</span><span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-lg ${a.type === 'vacation' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.type === 'vacation' ? 'Ferie' : 'Vagtfri'}</span></div>
                            <p className="text-sm font-bold text-slate-500 mt-1 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {formatDateShort(parseDate(a.start))} — {formatDateShort(parseDate(a.end))}</p>
                          </div>
                        </div>
                        <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', a.id))} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {role === 'planner' && (
                <section className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white space-y-8 text-left">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Settings className="w-4 h-4" /> System-indstillinger</h2>
                    <button onClick={handleExportFullCSV} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-xl shadow-blue-900/40"><Download className="w-4 h-4" /> Download Fuld Vagtplan</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-2 tracking-widest ml-1">Start dato</label><input type="date" value={period.start} onChange={e => setPeriod({...period, start: e.target.value})} className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-2 tracking-widest ml-1">Slut dato</label><input type="date" value={period.end} onChange={e => setPeriod({...period, end: e.target.value})} className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
                    <div><label className="text-[10px] font-black text-slate-400 uppercase block mb-2 tracking-widest ml-1">Max fravær</label><input type="number" min="1" max="10" value={maxAway} onChange={e => setMaxAway(parseInt(e.target.value) || 0)} className="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all" /></div>
                  </div>
                  <div className="pt-6 border-t border-slate-800 grid grid-cols-2 gap-4">
                    <button onClick={handleClearAllAbsences} className="w-full bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Ryd fravær</button>
                    <button onClick={handleClearAllShifts} className="w-full bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-900/50 py-3 rounded-xl text-xs font-black flex items-center justify-center gap-2"><Trash2 className="w-4 h-4" /> Ryd vagtbehov</button>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* --- KALENDER --- */}
        {activeTab === 'calendar' && (
          <div className="space-y-8 animate-in fade-in duration-500 text-left">
            {conflicts.length > 0 && role === 'planner' && (
              <div className="bg-red-50 border border-red-100 rounded-[2rem] p-6 md:p-8 flex gap-6 text-left">
                <div className="bg-red-500 p-3 rounded-2xl text-white self-start"><AlertTriangle className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-red-900 font-black text-lg">Konflikter opdaget</h3>
                  <p className="text-red-700 text-sm font-medium mb-4 italic text-left">Følgende personer er tildelt vagter mens de har ønsket fravær:</p>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
                    {conflicts.map((c, i) => <li key={i} className="text-red-600 text-[11px] font-black flex items-center gap-2 bg-white/50 p-2 rounded-lg border border-red-100 uppercase text-left"><ChevronRight className="w-3 h-3" /> {c}</li>)}
                  </ul>
                </div>
              </div>
            )}

            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden w-full text-left">
              <div className="p-8 border-b border-slate-100 flex flex-wrap justify-between items-center gap-6 bg-white sticky left-0 text-left">
                <div className="flex items-center gap-3"><div className="bg-blue-50 text-blue-600 p-2.5 rounded-2xl"><CalendarDays className="w-6 h-6" /></div><h2 className="text-2xl font-black text-slate-900 tracking-tight text-left">Planlægnings-matrix</h2></div>
                <div className="flex flex-wrap gap-5">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest"><div className="w-3.5 h-3.5 bg-green-500 rounded-md"></div> Ferie</div>
                  <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest"><div className="w-3.5 h-3.5 bg-amber-400 rounded-md"></div> Vagtfri</div>
                  <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest"><div className="w-3.5 h-3.5 bg-blue-600 rounded-md"></div> Vagt</div>
                </div>
              </div>
              <div className="overflow-x-auto w-full">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100/50 border-b border-slate-200">
                      <th className="sticky left-0 z-20 bg-white p-4 border-r border-slate-100 shadow-sm min-w-[200px]"></th>
                      {monthGroups.map((g, i) => (
                        <th key={i} colSpan={g.span} className="p-3 border-r border-slate-100/50 text-left bg-blue-600/5">
                          <span className="sticky-month-text font-black text-[10px] text-blue-700 uppercase tracking-[0.3em]">{g.name}</span>
                        </th>
                      ))}
                    </tr>
                    <tr className="bg-slate-50/50 border-b border-slate-100 text-left">
                      <th className="sticky left-0 z-20 bg-white p-6 text-left border-r border-slate-100 min-w-[200px] shadow-sm font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] text-left">Medarbejder</th>
                      {periodDates.map((date, i) => (
                        <th key={i} className={`p-3 min-w-[50px] text-center border-r border-slate-100/50 ${isWeekend(date) ? 'bg-slate-50/80' : ''}`}>
                          <div className="flex flex-col items-center">
                            <div className="text-[10px] font-black text-slate-400 uppercase mb-1">{getDayName(date).charAt(0)}</div>
                            <div className={`text-sm font-black ${isWeekend(date) ? 'text-slate-900' : 'text-slate-500'}`}>{date.getDate()}</div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEmployees.length === 0 ? (
                      <tr><td colSpan={periodDates.length + 1} className="p-24 text-center text-slate-400 font-bold italic text-lg">Vælg dit navn i toppen...</td></tr>
                    ) : visibleEmployees.map(emp => (
                      <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/30 transition-colors text-left">
                        <td className={`sticky left-0 z-20 p-6 font-black text-sm border-r border-slate-100 transition-colors ${currentEmpId === emp.id ? 'bg-blue-50/50 text-blue-700' : 'bg-white text-slate-700'}`}>{emp.name}</td>
                        {periodDates.map((date, i) => {
                          const abs = getAbsenceOnDate(date, emp.id);
                          const shift = getShiftOnDate(date, emp.id);
                          const conflict = abs && shift;
                          let bg = conflict ? "bg-red-500" : (shift ? "bg-blue-600 shadow-inner shadow-blue-900/20" : (abs?.type === 'vacation' ? "bg-green-500" : (abs?.type === 'vagtfri' ? "bg-amber-400" : "")));
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
                    ))}
                    {role === 'planner' && employees.length > 0 && (
                      <>
                        <tr className="bg-slate-100/50 border-t-2 border-slate-200 text-left">
                          <td className="sticky left-0 z-20 bg-slate-200 p-4 text-left font-black text-[10px] text-blue-600 uppercase border-r border-slate-200 shadow-sm leading-tight text-left">Ledige vagter</td>
                          {periodDates.map((date, i) => {
                            const openShifts = weekendShifts.filter(s => !s.empId && s.date === formatDateForInput(date));
                            return <td key={i} className={`text-center font-black text-[10px] border-r border-slate-100/30 py-3 ${openShifts.length > 0 ? 'text-blue-600 bg-blue-50 animate-pulse' : 'text-slate-300'}`}>{openShifts.length > 0 ? openShifts.map(s => s.type.split('-')[0]).join('/') : '-'}</td>;
                          })}
                        </tr>
                        <tr className="bg-slate-100/50 border-t border-slate-200 text-left">
                          <td className="sticky left-0 z-20 bg-slate-200 p-4 text-left font-black text-[10px] text-slate-500 uppercase border-r border-slate-200 shadow-sm leading-tight text-left">Total på ferie</td>
                          {periodDates.map((date, i) => {
                            const count = employees.filter(e => getAbsenceOnDate(date, e.id)?.type === 'vacation').length;
                            return <td key={i} className={`text-center font-black text-xs border-r border-slate-100/30 py-3 ${count > maxAway ? 'bg-red-100 text-red-600' : 'text-slate-400'}`}>{count > 0 ? count : '-'}</td>;
                          })}
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {role === 'planner' && (
              <section className="bg-white rounded-[2rem] p-8 border border-slate-200 flex justify-between items-center text-left">
                <div><h2 className="text-2xl font-black mb-2 uppercase tracking-tighter">Automatisk Vagtfordeling</h2><p className="text-slate-500 text-sm font-medium">Tildel ledige vagter til dem med færrest vagter i perioden.</p></div>
                <button onClick={handleAutoDistribute} className="bg-blue-600 hover:bg-blue-700 text-white py-4 px-8 rounded-2xl text-sm font-black flex items-center gap-2 transition-all active:scale-95 shadow-xl shadow-blue-100 leading-none"><Wand2 className="w-5 h-5" /> Fordel automatisk</button>
              </section>
            )}
          </div>
        )}

        {/* --- PERSONALE --- */}
        {activeTab === 'staff' && role === 'planner' && (
          <div className="max-w-3xl mx-auto animate-in fade-in duration-500 text-left">
            <header className="mb-12 text-left"><h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Personalestyring</h1></header>
            <section className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 mb-10 text-left">
              <form onSubmit={handleAddEmployee} className="flex gap-4">
                <div className="relative flex-1"><UserPlus className="absolute left-4 top-3.5 w-5 h-5 text-slate-300" /><input type="text" placeholder="Navn på medarbejder..." value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none transition-all" /></div>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-2xl text-sm font-black uppercase tracking-widest leading-none">Opret</button>
              </form>
            </section>
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden text-left"><div className="divide-y divide-slate-100">{employees.sort((a,b)=>a.name.localeCompare(b.name)).map(emp => (
              <div key={emp.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                <div className="flex items-center gap-4"><div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center font-black text-lg uppercase leading-none">{emp.name.charAt(0)}</div><span className="font-black text-xl text-slate-900 leading-none">{emp.name}</span></div>
                <button onClick={() => handleDeleteEmployee(emp.id)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl opacity-0 group-hover:opacity-100 transition-all active:scale-95"><Trash2 className="w-5 h-5" /></button>
              </div>
            ))}</div></div>
          </div>
        )}
      </main>

      <footer className="h-24 flex items-center justify-center border-t border-slate-100 bg-white mt-auto text-center w-full px-4 text-center">
        <button onClick={() => window.location.reload()} className="flex items-center gap-3 text-slate-400 hover:text-slate-900 font-black text-xs uppercase tracking-[0.2em] transition-all leading-none"><LogOut className="w-4 h-4" /> Nulstil session</button>
      </footer>
    </div>
  );
}