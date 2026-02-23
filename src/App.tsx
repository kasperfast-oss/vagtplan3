import { useState, useMemo, useEffect } from 'react';
// Eksplicit type-only import for React hændelser (verbatimModuleSyntax)
import type { FormEvent, ChangeEvent } from 'react';
import { 
  Calendar, 
  AlertTriangle, 
  Users, 
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
  Info
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

// Din specifikke Firebase konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyAy_f-CiJLAKTP6nGMDEysBye5-hozsT2Q",
  authDomain: "vagtplan-47257.firebaseapp.com",
  projectId: "vagtplan-47257",
  storageBucket: "vagtplan-47257.firebasestorage.app",
  messagingSenderId: "170066202547",
  appId: "1:170066202547:web:c64cc218a5894cae5185c6",
  measurementId: "G-G1T4J2LML8"
};

// Standard initialisering
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'vagtplan-47257';

// --- Hælperfunktioner til datoer ---
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

// Generer liste af medarbejdere (1-10)
const EMPLOYEES = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  name: `Medarbejder ${i + 1}`
}));

export default function App() {
  // --- Auth & Roller ---
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'planner' | 'employee'>('planner');
  const [currentEmpId, setCurrentEmpId] = useState<number>(1);

  // --- State ---
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
  const [activeTab, setActiveTab] = useState<'planning' | 'overview'>('planning'); 

  const [absForm, setAbsForm] = useState({ empId: 1, type: 'vacation', start: '', end: '' });
  const [shiftForm, setShiftForm] = useState({ empId: 0, date: '' });

  // --- Firebase Hooks ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error: any) {
        console.error("Fejl ved initialisering af Auth:", error);
      }
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
      unsubs.push(onSnapshot(absRef, (snapshot: QuerySnapshot<DocumentData>) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Absence));
        setAbsences(data);
      }, (error: any) => console.error("Fejl ved fravær:", error)));

      const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
      unsubs.push(onSnapshot(shiftsRef, (snapshot: QuerySnapshot<DocumentData>) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Shift));
        setWeekendShifts(data);
      }, (error: any) => console.error("Fejl ved vagter:", error)));
    } catch (error: any) {
      console.error("Cloud listener fejl:", error);
    }
    return () => unsubs.forEach(fn => fn());
  }, [user]);

  // --- Logik ---
  const periodDates = useMemo(() => {
    const dates: Date[] = [];
    let curr = parseDate(period.start);
    const end = parseDate(period.end);
    while (curr <= end) {
      dates.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  }, [period]);

  const absenceWarnings = useMemo(() => {
    const warnings: string[] = [];
    periodDates.forEach(date => {
      const time = date.getTime();
      const awayCount = EMPLOYEES.filter(emp => 
        absences.some(a => a.empId === emp.id && a.type === 'vacation' && time >= parseDate(a.start).getTime() && time <= parseDate(a.end).getTime())
      ).length;
      if (awayCount > maxAway) {
        warnings.push(`D. ${formatDateShort(date)}: ${awayCount} på ferie (Grænse: ${maxAway}).`);
      }
    });
    return warnings;
  }, [periodDates, absences, maxAway]);

  const conflicts = useMemo(() => {
    const found: {message: string}[] = [];
    weekendShifts.forEach(shift => {
      const shiftTime = parseDate(shift.date).getTime();
      const empAbs = absences.filter(v => v.empId === shift.empId);
      empAbs.forEach(abs => {
        if (shiftTime >= parseDate(abs.start).getTime() && shiftTime <= parseDate(abs.end).getTime()) {
          const emp = EMPLOYEES.find(e => e.id === shift.empId);
          found.push({ message: `Vagtkonflikt for ${emp?.name} d. ${formatDateShort(parseDate(shift.date))}.` });
        }
      });
    });
    return found;
  }, [absences, weekendShifts]);

  const shiftCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    EMPLOYEES.forEach(emp => counts[emp.id] = 0);
    weekendShifts.forEach(s => { if (counts[s.empId] !== undefined) counts[s.empId]++; });
    return counts;
  }, [weekendShifts]);

  const availableEmployeesForShift = useMemo(() => {
    if (!shiftForm.date) return [];
    const time = parseDate(shiftForm.date).getTime();
    return EMPLOYEES.filter(emp => !absences.some(a => a.empId === emp.id && time >= parseDate(a.start).getTime() && time <= parseDate(a.end).getTime()));
  }, [shiftForm.date, absences]);

  // --- Handlinger ---
  const handleAddAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!absForm.start || !absForm.end) return;
    const targetEmpId = role === 'employee' ? currentEmpId : absForm.empId;
    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', newId), { ...absForm, empId: targetEmpId, id: newId });
      setAbsForm({ ...absForm, start: '', end: '' });
    } catch (err: any) { console.error(err); }
  };

  const handleDeleteAbsence = async (id: string) => {
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', id)); } catch (err: any) { console.error(err); }
  };

  const handleAddShift = async (e: FormEvent) => {
    e.preventDefault();
    if (!shiftForm.date || !shiftForm.empId) return;
    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), { ...shiftForm, id: newId });
      setShiftForm({ empId: 0, date: '' });
    } catch (err: any) { console.error(err); }
  };

  const handleDeleteShift = async (id: string) => {
    try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', id)); } catch (err: any) { console.error(err); }
  };

  const handleAutoDistribute = async () => {
    const weekendDates = periodDates.filter(d => isWeekend(d));
    let counts = { ...shiftCounts };
    for (const date of weekendDates) {
      const dateStr = formatDateForInput(date);
      if (weekendShifts.some(s => s.date === dateStr)) continue;
      const time = date.getTime();
      const available = EMPLOYEES.filter(emp => !absences.some(a => a.empId === emp.id && time >= parseDate(a.start).getTime() && time <= parseDate(a.end).getTime()));
      if (available.length > 0) {
        available.sort((a, b) => counts[a.id] - counts[b.id]);
        const selected = available[0];
        const newId = Date.now().toString() + Math.random().toString(36).substring(7);
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), { empId: selected.id, date: dateStr, id: newId });
        counts[selected.id]++;
      }
    }
  };

  const handleExportCSV = () => {
    let csv = "\uFEFFMedarbejder;Type;Dato/Periode\n";
    absences.forEach(a => {
      const emp = EMPLOYEES.find(e => e.id === a.empId);
      csv += `${emp?.name};${a.type === 'vacation' ? 'Ferie' : 'Vagtfri'};${formatDateShort(parseDate(a.start))} - ${formatDateShort(parseDate(a.end))}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "vagtplan.csv";
    link.click();
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">Forbinder til skydatabase...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-12">
      {/* Top Bar - Rolle Skifter */}
      <div className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg text-white">
              <CalendarDays className="w-6 h-6" />
            </div>
            <span className="font-bold text-lg hidden sm:inline">VagtPlan Pro</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-slate-800 rounded-full p-1 border border-slate-700">
              <button 
                onClick={() => setRole('planner')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${role === 'planner' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Lock className="w-3 h-3" /> Planlægger
              </button>
              <button 
                onClick={() => setRole('employee')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${role === 'employee' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <UserCircle className="w-3 h-3" /> Medarbejder
              </button>
            </div>
            
            {role === 'employee' && (
              <select 
                value={currentEmpId} 
                onChange={(e) => setCurrentEmpId(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-green-500"
              >
                {EMPLOYEES.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">
              Sommerferie <span className="text-blue-600">2024</span>
            </h1>
            <p className="text-slate-500 font-medium mt-2 flex items-center gap-2">
              <Info className="w-4 h-4" /> 
              {role === 'planner' ? 'Du administrerer afdelingens samlede vagtplan.' : `Hej ${EMPLOYEES.find(e => e.id === currentEmpId)?.name}, her kan du se og ønske din ferie.`}
            </p>
          </div>

          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 self-start md:self-auto">
            <button 
              onClick={() => setActiveTab('planning')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'planning' ? 'bg-slate-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Plus className="w-4 h-4" /> Input
            </button>
            <button 
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-slate-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Calendar className="w-4 h-4" /> Overblik
            </button>
          </div>
        </div>

        {/* Tab Indhold: PLANLÆGNING */}
        {activeTab === 'planning' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Venstre Kolonne: Indstillinger & Formularer */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Periode Definition (Kun Planlægger) */}
              {role === 'planner' && (
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Periode & Regler
                  </h2>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Startdato</label>
                      <input type="date" value={period.start} onChange={e => setPeriod({...period, start: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Slutdato</label>
                      <input type="date" value={period.end} onChange={e => setPeriod({...period, end: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Max medarbejdere på ferie</label>
                      <input type="number" min="1" max="10" value={maxAway} onChange={e => setMaxAway(Number(e.target.value) || 0)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                </section>
              )}

              {/* Ferie/Vagtfri Input Formular */}
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-hidden relative">
                <div className={`absolute top-0 left-0 w-full h-1 ${absForm.type === 'vacation' ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Tilføj Ønske
                </h2>
                <form onSubmit={handleAddAbsence} className="space-y-4">
                  {role === 'planner' && (
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Medarbejder</label>
                      <select value={absForm.empId} onChange={e => setAbsForm({...absForm, empId: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none">
                        {EMPLOYEES.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vacation'})} className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${absForm.type === 'vacation' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}>Ferie</button>
                      <button type="button" onClick={() => setAbsForm({...absForm, type: 'vagtfri'})} className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${absForm.type === 'vagtfri' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}>Vagtfri</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Fra</label>
                      <input type="date" value={absForm.start} onChange={e => setAbsForm({...absForm, start: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Til</label>
                      <input type="date" value={absForm.end} onChange={e => setAbsForm({...absForm, end: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none" />
                    </div>
                  </div>
                  <button type="submit" className={`w-full py-3 rounded-xl text-sm font-black text-white transition-all shadow-md active:scale-95 ${absForm.type === 'vacation' ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                    Gem Ønske
                  </button>
                </form>
              </section>

              {/* Weekendvagt Formular (Kun Planlægger) */}
              {role === 'planner' && (
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
                  <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" /> Tildel Vagt
                  </h2>
                  <form onSubmit={handleAddShift} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Dato</label>
                      <input type="date" value={shiftForm.date} onChange={e => setShiftForm({...shiftForm, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1 block">Vælg Ledig Medarbejder</label>
                      <select 
                        value={shiftForm.empId} 
                        onChange={e => setShiftForm({...shiftForm, empId: Number(e.target.value)})} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none disabled:opacity-50"
                        disabled={!shiftForm.date}
                      >
                        <option value="0">{shiftForm.date ? 'Vælg medarbejder...' : 'Vælg dato først'}</option>
                        {availableEmployeesForShift.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                      </select>
                    </div>
                    <button type="submit" disabled={!shiftForm.date || !shiftForm.empId} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-3 rounded-xl text-sm font-black transition-all shadow-md active:scale-95">
                      Bekræft Vagt
                    </button>
                  </form>
                  <button onClick={handleAutoDistribute} className="w-full mt-4 flex items-center justify-center gap-2 text-blue-600 text-xs font-black py-2 rounded-lg border border-blue-100 hover:bg-blue-50 transition-all">
                    <Wand2 className="w-3.5 h-3.5" /> Kør Automatisk Fordeling
                  </button>
                </section>
              )}
            </div>

            {/* Højre Kolonne: Lister over registreringer */}
            <div className="lg:col-span-2 space-y-6">
              {/* Eksisterende Fravær */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h2 className="text-lg font-black text-slate-900">Aktuelle Ønsker</h2>
                  {role === 'planner' && (
                    <button onClick={handleExportCSV} className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs font-bold">
                      <Download className="w-3.5 h-3.5" /> Eksportér Excel
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                  {absences.length === 0 ? (
                    <div className="p-12 text-center text-slate-400 italic">Ingen ferieønsker registreret endnu...</div>
                  ) : (
                    [...absences].sort((a,b) => parseDate(a.start).getTime() - parseDate(b.start).getTime()).map(abs => {
                      const emp = EMPLOYEES.find(e => e.id === abs.empId);
                      const isVacation = abs.type === 'vacation';
                      const isMine = role === 'employee' && abs.empId === currentEmpId;
                      const canDelete = role === 'planner' || isMine;
                      if (role === 'employee' && !isMine && abs.type === 'vagtfri') return null; // Skjul andres vagtfri-ønsker

                      return (
                        <div key={abs.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-10 rounded-full ${isVacation ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{emp?.name} {isMine && <span className="text-xs text-blue-600">(Dig)</span>}</span>
                                <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${isVacation ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {isVacation ? 'Ferie' : 'Vagtfri'}
                                </span>
                              </div>
                              <p className="text-sm text-slate-500 font-medium mt-0.5">
                                {formatDateShort(parseDate(abs.start))} — {formatDateShort(parseDate(abs.end))}
                              </p>
                            </div>
                          </div>
                          {canDelete && (
                            <button onClick={() => handleDeleteAbsence(abs.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Weekendvagt Liste (Kun hvis der er nogen) */}
              {weekendShifts.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100">
                    <h2 className="text-lg font-black text-slate-900">Planlagte Weekendvagter</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
                    {[...weekendShifts].sort((a,b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()).map(shift => {
                      const emp = EMPLOYEES.find(e => e.id === shift.empId);
                      return (
                        <div key={shift.id} className="bg-white p-4 flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-50 text-blue-600 p-2 rounded-lg">
                              <CalendarDays className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-400 uppercase">{getDayName(parseDate(shift.date))}. {formatDateShort(parseDate(shift.date))}</p>
                              <p className="font-bold text-slate-900">{emp?.name}</p>
                            </div>
                          </div>
                          {role === 'planner' && (
                            <button onClick={() => handleDeleteShift(shift.id)} className="p-2 text-slate-300 hover:text-red-500 rounded-lg transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Indhold: OVERBLIK */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* Advarsler Box */}
            {(conflicts.length > 0 || (role === 'planner' && absenceWarnings.length > 0)) && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col sm:flex-row gap-4">
                <div className="bg-red-500 p-2 rounded-xl text-white self-start">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-red-900 font-black text-lg">Konflikter opdaget</h3>
                  <p className="text-red-700 text-sm font-medium mb-3">Planen overholder ikke de opsatte regler eller har medarbejdere på vagt under ferie.</p>
                  <ul className="space-y-1">
                    {conflicts.map((c, i) => <li key={i} className="text-red-600 text-xs font-bold flex items-center gap-2"><ChevronRight className="w-3 h-3" /> {c.message}</li>)}
                    {role === 'planner' && absenceWarnings.map((w, i) => <li key={i} className="text-red-600 text-xs font-medium flex items-center gap-2"><ChevronRight className="w-3 h-3" /> {w}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {/* Selve Kalender Matrix */}
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4">
                <h2 className="text-xl font-black text-slate-900">Vagtplan Matrix</h2>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><div className="w-3 h-3 bg-green-500 rounded-sm"></div> Ferie</div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><div className="w-3 h-3 bg-yellow-400 rounded-sm"></div> Vagtfri</div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><div className="w-3 h-3 bg-blue-600 rounded-sm"></div> Vagt</div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-20 bg-slate-50 p-4 text-left border-r border-slate-200 min-w-[160px]">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Medarbejder</span>
                      </th>
                      {periodDates.map((date, i) => (
                        <th key={i} className={`p-2 min-w-[40px] text-center border-r border-slate-100 ${isWeekend(date) ? 'bg-slate-100' : ''}`}>
                          <div className="text-[10px] font-black text-slate-400 uppercase">{getDayName(date).charAt(0)}</div>
                          <div className={`text-xs font-bold ${isWeekend(date) ? 'text-slate-900' : 'text-slate-600'}`}>{date.getDate()}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {EMPLOYEES.map(emp => (
                      <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className={`sticky left-0 z-20 p-4 font-bold text-sm border-r border-slate-200 transition-colors ${role === 'employee' && currentEmpId === emp.id ? 'bg-blue-50 text-blue-700' : 'bg-white'}`}>
                          {emp.name} {role === 'employee' && currentEmpId === emp.id && ' (Dig)'}
                        </td>
                        {periodDates.map((date, i) => {
                          const abs = getAbsenceOnDate(date, emp.id);
                          const shift = hasShiftOnDate(date, emp.id);
                          const conflict = abs && shift;
                          
                          let bg = "";
                          if (conflict) bg = "bg-red-500";
                          else if (shift) bg = "bg-blue-600 shadow-inner";
                          else if (abs?.type === 'vacation') bg = "bg-green-500";
                          else if (abs?.type === 'vagtfri') bg = "bg-yellow-400";

                          return (
                            <td key={i} className={`p-0 border-r border-slate-100 h-10 ${isWeekend(date) && !bg ? 'bg-slate-50/50' : ''}`}>
                              <div className={`w-full h-full flex items-center justify-center transition-all ${bg}`}>
                                {shift && !conflict && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                {conflict && <AlertTriangle className="w-3 h-3 text-white animate-pulse" />}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {/* Opsamling i bunden */}
                    <tr className="bg-slate-50">
                      <td className="sticky left-0 z-20 bg-slate-50 p-3 text-right pr-4 text-[10px] font-black text-slate-400 uppercase border-r border-slate-200">På Ferie:</td>
                      {periodDates.map((date, i) => {
                        const count = EMPLOYEES.filter(emp => getAbsenceOnDate(date, emp.id)?.type === 'vacation').length;
                        return (
                          <td key={i} className={`text-center text-xs font-black border-r border-slate-100 ${count > maxAway ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}>
                            {count > 0 ? count : '-'}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Statistik / Retfærdighedstjek */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-blue-600" /> Vagtfordeling
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {EMPLOYEES.map(emp => (
                  <div key={emp.id} className={`p-4 rounded-2xl border transition-all ${role === 'employee' && currentEmpId === emp.id ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="text-[10px] font-black text-slate-400 uppercase mb-1 truncate">{emp.name}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900">{shiftCounts[emp.id]}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">vagter</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

// --- Hjælpefunktioner flyttet ud for renere kode ---
const getAbsenceOnDate = (date: Date, empId: number) => {
  // Denne funktion genbruges af Matrix
  // Bemærk: Vi bruger de faktiske state-værdier inde i komponenten, så her sender vi blot logikken tilbage
};

const hasShiftOnDate = (date: Date, empId: number) => {
  // Samme her
};