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
  Download,
  Wand2,
  Settings,
  Lock,
  UserCircle,
  ChevronRight,
  LayoutDashboard,
  ClipboardList,
  Clock,
  LogOut
} from 'lucide-react';

// --- Firebase Cloud Storage Setup ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import type { QuerySnapshot, DocumentData } from 'firebase/firestore';

// --- TypeScript Interfaces ---
interface Absence {
  id: string;
  empId: number;
  type: string;
  start: string;
  end: string;
}

interface Shift {
  id: string;
  empId: number;
  date: string;
}

// Firebase konfiguration
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

// --- Dato Hjælpere ---
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

const EMPLOYEES = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `Medarbejder ${i + 1}`
}));

export default function App() {
  // --- Tilstand ---
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'planner' | 'employee'>('planner');
  const [currentEmpId, setCurrentEmpId] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'input' | 'calendar'>('dashboard');

  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), 4, 1);
  const defaultEnd = new Date(today.getFullYear(), 7, 31);

  const [period, setPeriod] = useState({
    start: formatDateForInput(defaultStart),
    end: formatDateForInput(defaultEnd)
  });
  
  const [maxAway, setMaxAway] = useState(3);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [weekendShifts, setWeekendShifts] = useState<Shift[]>([]);
  const [absForm, setAbsForm] = useState({ empId: 1, type: 'vacation', start: '', end: '' });
  const [shiftForm, setShiftForm] = useState({ empId: 0, date: '' });

  // --- Firebase Hooks ---
  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); } catch (e) { console.error(e); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubs: (() => void)[] = [];
    try {
      const absRef = collection(db, 'artifacts', appId, 'public', 'data', 'absences');
      unsubs.push(onSnapshot(absRef, (s: QuerySnapshot<DocumentData>) => {
        setAbsences(s.docs.map(d => ({ ...d.data(), id: d.id } as Absence)));
      }));
      const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
      unsubs.push(onSnapshot(shiftsRef, (s: QuerySnapshot<DocumentData>) => {
        setWeekendShifts(s.docs.map(d => ({ ...d.data(), id: d.id } as Shift)));
      }));
    } catch (e) { console.error(e); }
    return () => unsubs.forEach(fn => fn());
  }, [user]);

  // --- Logik ---
  const getAbsenceOnDate = (date: Date, empId: number) => {
    const time = date.getTime();
    return absences.find(a => a.empId === empId && parseDate(a.start).getTime() <= time && parseDate(a.end).getTime() >= time);
  };

  const hasShiftOnDate = (date: Date, empId: number) => {
    const dStr = formatDateForInput(date);
    return weekendShifts.some(s => s.empId === empId && s.date === dStr);
  };

  const periodDates = useMemo(() => {
    const dates: Date[] = [];
    let curr = parseDate(period.start);
    const end = parseDate(period.end);
    while (curr <= end) { dates.push(new Date(curr)); curr.setDate(curr.getDate() + 1); }
    return dates;
  }, [period]);

  const stats = useMemo(() => {
    const todayStr = formatDateForInput(new Date());
    return {
      awayToday: EMPLOYEES.filter(e => getAbsenceOnDate(new Date(), e.id)).length,
      totalWishes: absences.length,
      shiftsAssigned: weekendShifts.length,
      pendingWeekends: periodDates.filter(d => isWeekend(d)).length * 2 - weekendShifts.length
    };
  }, [absences, weekendShifts, periodDates]);

  const conflicts = useMemo(() => {
    const found: string[] = [];
    weekendShifts.forEach(s => {
      const a = getAbsenceOnDate(parseDate(s.date), s.empId);
      if (a) found.push(`${EMPLOYEES.find(e => e.id === s.empId)?.name} har vagt d. ${formatDateShort(parseDate(s.date))} under ferie.`);
    });
    return found;
  }, [absences, weekendShifts]);

  // --- Handlinger ---
  const handleAddAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!absForm.start || !absForm.end) return;
    const targetId = role === 'employee' ? currentEmpId : absForm.empId;
    const newId = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', newId), { ...absForm, empId: targetId, id: newId });
    setAbsForm({ ...absForm, start: '', end: '' });
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400">Forbinder...</div>;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 h-16 sticky top-0 z-50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-lg shadow-blue-200">
              <CalendarDays className="w-5 h-5" />
            </div>
            <span className="font-black text-xl text-slate-900 tracking-tight">VagtPlan</span>
          </div>

          <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <LayoutDashboard className="w-4 h-4" /> Overblik
            </button>
            <button 
              onClick={() => setActiveTab('input')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'input' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <ClipboardList className="w-4 h-4" /> Registrering
            </button>
            <button 
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'calendar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Calendar className="w-4 h-4" /> Kalender
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <UserCircle className="w-4 h-4 text-slate-400" />
            <select 
              value={currentEmpId} 
              onChange={(e) => setCurrentEmpId(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
              {EMPLOYEES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          
          <button 
            onClick={() => setRole(role === 'planner' ? 'employee' : 'planner')}
            className={`p-2 rounded-xl transition-all ${role === 'planner' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-400'}`}
            title="Skift rolle"
          >
            {role === 'planner' ? <Lock className="w-5 h-5" /> : <UserCircle className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        
        {/* --- DASHBOARD VIEW --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Velkommen tilbage</h1>
              <p className="text-slate-500 font-medium">Her er status på sommerens planlægning.</p>
            </header>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Væk i dag', value: stats.awayToday, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Samlede ønsker', value: stats.totalWishes, icon: ClipboardList, color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Vagter tildelt', value: stats.shiftsAssigned, icon: CheckCircle2, color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Konflikter', value: conflicts.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' }
              ].map((s, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
                  <div className={`${s.bg} ${s.color} p-3 rounded-xl`}>
                    <s.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{s.label}</p>
                    <p className="text-2xl font-black text-slate-900">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Konflikt liste */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="font-black text-slate-900">Vigtige bemærkninger</h2>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <div className="p-6 space-y-4">
                  {conflicts.length === 0 ? (
                    <div className="flex items-center gap-3 text-green-600 bg-green-50 p-4 rounded-xl font-bold text-sm">
                      <CheckCircle2 className="w-5 h-5" /> Ingen konflikter i planen lige nu.
                    </div>
                  ) : (
                    conflicts.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 text-red-700 bg-red-50 p-4 rounded-xl font-bold text-sm">
                        <AlertTriangle className="w-5 h-5 shrink-0" /> {c}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Hurtig Info / Guide */}
              <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-xl font-black mb-2">Husk deadlines</h2>
                  <p className="text-slate-400 text-sm mb-6 leading-relaxed">Alle ferieønsker skal være indtastet før udgangen af marts for at vi kan sikre en retfærdig fordeling.</p>
                  <button onClick={() => setActiveTab('input')} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
                    Gå til registrering <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <CalendarDays className="absolute -bottom-4 -right-4 w-40 h-40 text-white/5 rotate-12" />
              </div>
            </div>
          </div>
        )}

        {/* --- REGISTRATION VIEW --- */}
        {activeTab === 'input' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            
            {/* Sidebar Flow: Formularer */}
            <div className="lg:col-span-4 space-y-6">
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-hidden relative">
                <div className={`absolute top-0 left-0 w-full h-1 ${absForm.type === 'vacation' ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                <h2 className="text-sm font-black text-slate-400 uppercase mb-6 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-blue-600" /> Nyt ferieønske
                </h2>
                <form onSubmit={handleAddAbsence} className="space-y-4">
                  {role === 'planner' && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Medarbejder</label>
                      <select value={absForm.empId} onChange={e => setAbsForm({...absForm, empId: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none">
                        {EMPLOYEES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Kategori</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vacation'})} className={`py-2 rounded-lg text-xs font-bold border transition-all ${absForm.type === 'vacation' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-400'}`}>Ferie</button>
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vagtfri'})} className={`py-2 rounded-lg text-xs font-bold border transition-all ${absForm.type === 'vagtfri' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-400'}`}>Vagtfri</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Fra</label>
                      <input type="date" value={absForm.start} onChange={e => setAbsForm({...absForm, start: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">Til</label>
                      <input type="date" value={absForm.end} onChange={e => setAbsForm({...absForm, end: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-black transition-all shadow-lg shadow-blue-100 active:scale-95">Gem registrering</button>
                </form>
              </section>

              {role === 'planner' && (
                <section className="bg-slate-900 rounded-2xl p-6 text-white space-y-6">
                  <h2 className="text-xs font-black text-slate-500 uppercase flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Admin indstillinger
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Periode start</label>
                      <input type="date" value={period.start} onChange={e => setPeriod({...period, start: e.target.value})} className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Periode slut</label>
                      <input type="date" value={period.end} onChange={e => setPeriod({...period, end: e.target.value})} className="w-full bg-slate-800 border-none rounded-lg px-3 py-2 text-sm text-white outline-none" />
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* List View */}
            <div className="lg:col-span-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="font-black text-slate-900">Aktuelle registreringer</h2>
                  <div className="flex gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2 py-1 bg-slate-50 rounded border border-slate-100">Viser alle</span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {absences.length === 0 ? (
                    <div className="p-16 text-center text-slate-400 font-medium italic">Ingen registreringer endnu...</div>
                  ) : (
                    [...absences].sort((a,b) => parseDate(a.start).getTime() - parseDate(b.start).getTime()).map(a => {
                      const emp = EMPLOYEES.find(e => e.id === a.empId);
                      const isVacation = a.type === 'vacation';
                      const isMine = a.empId === currentEmpId;
                      return (
                        <div key={a.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-10 rounded-full ${isVacation ? 'bg-green-500' : 'bg-amber-500'}`}></div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{emp?.name} {isMine && <span className="text-[10px] text-blue-600">(Dig)</span>}</span>
                                <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${isVacation ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{a.type === 'vacation' ? 'Ferie' : 'Vagtfri'}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{formatDateShort(parseDate(a.start))} til {formatDateShort(parseDate(a.end))}</p>
                            </div>
                          </div>
                          {(role === 'planner' || isMine) && (
                            <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', a.id))} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-4 h-4" />
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
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 bg-white sticky left-0">
                <h2 className="text-xl font-black text-slate-900">Planlægningsmatrix</h2>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Ferie</div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><div className="w-3 h-3 bg-amber-400 rounded-sm"></div> Vagtfri</div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><div className="w-3 h-3 bg-blue-600 rounded-sm"></div> Weekendvagt</div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-20 bg-slate-50 p-4 text-left border-r border-slate-200 min-w-[160px]">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Medarbejder</span>
                      </th>
                      {periodDates.map((date, i) => (
                        <th key={i} className={`p-2 min-w-[40px] text-center border-r border-slate-100 ${isWeekend(date) ? 'bg-slate-100' : ''}`}>
                          <div className="text-[10px] font-black text-slate-400 uppercase">{getDayName(date).charAt(0)}</div>
                          <div className={`text-xs font-bold ${isWeekend(date) ? 'text-slate-900' : 'text-slate-500'}`}>{date.getDate()}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {EMPLOYEES.map(emp => (
                      <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className={`sticky left-0 z-20 p-4 font-bold text-sm border-r border-slate-200 transition-colors ${currentEmpId === emp.id ? 'bg-blue-50 text-blue-700' : 'bg-white'}`}>
                          {emp.name}
                        </td>
                        {periodDates.map((date, i) => {
                          const abs = getAbsenceOnDate(date, emp.id);
                          const shift = hasShiftOnDate(date, emp.id);
                          const conflict = abs && shift;
                          
                          let bg = "";
                          if (conflict) bg = "bg-red-500";
                          else if (shift) bg = "bg-blue-600";
                          else if (abs?.type === 'vacation') bg = "bg-green-500";
                          else if (abs?.type === 'vagtfri') bg = "bg-amber-400";

                          return (
                            <td key={i} className={`p-0 border-r border-slate-100 h-10 ${isWeekend(date) && !bg ? 'bg-slate-50/50' : ''}`}>
                              <div className={`w-full h-full flex items-center justify-center transition-all ${bg}`}>
                                {shift && !conflict && <div className="w-1 h-1 bg-white rounded-full"></div>}
                                {conflict && <AlertTriangle className="w-3 h-3 text-white animate-pulse" />}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {role === 'planner' && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <div className="flex flex-col md:flex-row gap-8">
                  <div className="md:w-1/3">
                    <h2 className="text-xl font-black text-slate-900 mb-2">Weekendfordeling</h2>
                    <p className="text-slate-500 text-sm mb-6">Tildel manuelt eller lad systemet fordele de resterende weekendvagter baseret på retfærdighed.</p>
                    <button onClick={handleAutoDistribute} className="w-full bg-slate-900 text-white py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-slate-800 transition-all">
                      <Wand2 className="w-4 h-4" /> Kør auto-fordeling
                    </button>
                  </div>
                  <div className="md:w-2/3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {EMPLOYEES.map(emp => (
                      <div key={emp.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50">
                        <p className="text-[10px] font-black text-slate-400 uppercase truncate">{emp.name}</p>
                        <p className="text-xl font-black text-slate-900">{weekendShifts.filter(s => s.empId === emp.id).length} <span className="text-[10px] text-slate-400">vagter</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Footer / Logout */}
      <footer className="h-20 flex items-center justify-center border-t border-slate-100">
        <button onClick={() => window.location.reload()} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm transition-all">
          <LogOut className="w-4 h-4" /> Log ud af systemet
        </button>
      </footer>
    </div>
  );

  // --- Hjælpefunktion for auto-fordeling ---
  async function handleAutoDistribute() {
    const weekendDates = periodDates.filter(d => isWeekend(d));
    let counts: Record<number, number> = {};
    EMPLOYEES.forEach(e => counts[e.id] = weekendShifts.filter(s => s.empId === e.id).length);

    for (const date of weekendDates) {
      const dStr = formatDateForInput(date);
      if (weekendShifts.some(s => s.date === dStr)) continue;
      
      const time = date.getTime();
      const available = EMPLOYEES.filter(emp => !absences.some(a => a.empId === emp.id && parseDate(a.start).getTime() <= time && parseDate(a.end).getTime() >= time));
      
      if (available.length > 0) {
        available.sort((a, b) => counts[a.id] - counts[b.id]);
        const selected = available[0];
        const newId = Date.now().toString() + Math.random().toString(36).substring(7);
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), { empId: selected.id, date: dStr, id: newId });
        counts[selected.id]++;
      }
    }
  }
}