import { useState, useMemo, useEffect } from 'react';
// Eksplicit type-only import for React hændelser
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
  UserCircle
} from 'lucide-react';

// --- Firebase Cloud Storage Setup ---
import { initializeApp } from 'firebase/app';

// Importer kun funktioner (værdier) fra Auth
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
// Importer kun typer fra Auth (Løser TS1484)
import type { User } from 'firebase/auth';

// Importer kun funktioner fra Firestore
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
// Importer kun typer fra Firestore
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
  return day === 0 || day === 6; // 0 = Søndag, 6 = Lørdag
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
  const [activeTab, setActiveTab] = useState('planning'); 

  const [absForm, setAbsForm] = useState({ empId: 1, type: 'vacation', start: '', end: '' });
  const [shiftForm, setShiftForm] = useState({ empId: 0, date: '' });

  // --- Firebase Database Hooks ---
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
      // Lyt efter fravær
      const absRef = collection(db, 'artifacts', appId, 'public', 'data', 'absences');
      unsubs.push(onSnapshot(absRef, (snapshot: QuerySnapshot<DocumentData>) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Absence));
        setAbsences(data);
      }, (error: any) => console.error("Fejl ved hentning af fravær:", error)));

      // Lyt efter vagter
      const shiftsRef = collection(db, 'artifacts', appId, 'public', 'data', 'shifts');
      unsubs.push(onSnapshot(shiftsRef, (snapshot: QuerySnapshot<DocumentData>) => {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Shift));
        setWeekendShifts(data);
      }, (error: any) => console.error("Fejl ved hentning af vagter:", error)));
    } catch (error: any) {
      console.error("Fejl ved opsætning af Firestore listeners:", error);
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
        warnings.push(`D. ${formatDateShort(date)} er der ${awayCount} medarbejdere på ferie (Grænsen er sat til ${maxAway}).`);
      }
    });
    return warnings;
  }, [periodDates, absences, maxAway]);

  const conflicts = useMemo(() => {
    const foundConflicts: {shift: Shift, absence: Absence, message: string}[] = [];
    weekendShifts.forEach(shift => {
      const shiftDateObj = parseDate(shift.date);
      const shiftTime = shiftDateObj.getTime();
      const empAbsences = absences.filter(v => v.empId === shift.empId);
      
      empAbsences.forEach(abs => {
        const start = parseDate(abs.start).getTime();
        const end = parseDate(abs.end).getTime();
        if (shiftTime >= start && shiftTime <= end) {
          const typeName = abs.type === 'vacation' ? 'ferie' : 'vagtfri';
          foundConflicts.push({
            shift, absence: abs,
            message: `Konflikt: ${EMPLOYEES.find(e => e.id === shift.empId)?.name} har en weekendvagt d. ${formatDateShort(shiftDateObj)}, men har ${typeName} i denne periode.`
          });
        }
      });
    });
    return foundConflicts;
  }, [absences, weekendShifts]);

  const shiftCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    EMPLOYEES.forEach(emp => counts[emp.id] = 0);
    weekendShifts.forEach(shift => {
      if (counts[shift.empId] !== undefined) counts[shift.empId]++;
    });
    return counts;
  }, [weekendShifts]);

  const availableEmployeesForShift = useMemo(() => {
    if (!shiftForm.date) return [];
    const shiftTime = parseDate(shiftForm.date).getTime();
    return EMPLOYEES.filter(emp => {
      const isAbsent = absences.some(a => {
        if (a.empId !== emp.id) return false;
        const start = parseDate(a.start).getTime();
        const end = parseDate(a.end).getTime();
        return shiftTime >= start && shiftTime <= end;
      });
      return !isAbsent; 
    });
  }, [shiftForm.date, absences]);

  // --- Handlinger ---
  const handleAddAbsence = async (e: FormEvent) => {
    e.preventDefault();
    if (!absForm.start || !absForm.end) return alert('Vælg venligst både start- og slutdato.');
    if (parseDate(absForm.start).getTime() > parseDate(absForm.end).getTime()) return alert('Startdato skal være før slutdato.');
    
    const targetEmpId = role === 'employee' ? currentEmpId : absForm.empId;
    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', newId), { 
        ...absForm, 
        empId: targetEmpId,
        id: newId 
      });
      setAbsForm({ ...absForm, start: '', end: '' });
    } catch (err: any) {
      console.error("Fejl ved gemning af fravær:", err);
      alert("Der opstod en fejl ved gemning i skyen.");
    }
  };

  const handleDeleteAbsence = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'absences', id));
    } catch (err: any) {
      console.error("Fejl ved sletning:", err);
      alert("Der opstod en fejl ved sletning fra skyen.");
    }
  };

  const handleShiftDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (!newDate) {
      setShiftForm({ date: '', empId: 0 });
      return;
    }
    const shiftTime = parseDate(newDate).getTime();
    const available = EMPLOYEES.filter(emp => {
      const isAbsent = absences.some(a => {
        if (a.empId !== emp.id) return false;
        const start = parseDate(a.start).getTime();
        const end = parseDate(a.end).getTime();
        return shiftTime >= start && shiftTime <= end;
      });
      return !isAbsent;
    });

    setShiftForm({ date: newDate, empId: available.length > 0 ? available[0].id : 0 });
  };

  const handleAddShift = async (e: FormEvent) => {
    e.preventDefault();
    if (!shiftForm.date) return alert('Vælg venligst en dato for vagten.');
    if (!shiftForm.empId || shiftForm.empId === 0) return alert('Vælg venligst en ledig medarbejder.');
    
    const shiftDate = parseDate(shiftForm.date);
    if (!isWeekend(shiftDate)) {
      const confirmNonWeekend = window.confirm('Datoen er ikke en lørdag eller søndag. Vil du tilføje den alligevel?');
      if (!confirmNonWeekend) return;
    }

    const newId = Date.now().toString() + Math.random().toString(36).substring(7);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), { 
        ...shiftForm, 
        id: newId 
      });
      setShiftForm({ empId: 0, date: '' });
    } catch (err: any) {
      console.error("Fejl ved tildeling af vagt:", err);
    }
  };

  const handleDeleteShift = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', id));
    } catch (err: any) {
      console.error("Fejl ved sletning af vagt:", err);
    }
  };

  const handleAutoDistribute = async () => {
    const weekendDates = periodDates.filter(d => isWeekend(d));
    let currentCounts = { ...shiftCounts };
    let addedCount = 0;

    for (const date of weekendDates) {
      const time = date.getTime();
      const dateStr = formatDateForInput(date);

      if (weekendShifts.some(s => s.date === dateStr)) continue;

      let available = EMPLOYEES.filter(emp => {
        const isAbsent = absences.some(a => {
          if (a.empId !== emp.id) return false;
          const start = parseDate(a.start).getTime();
          const end = parseDate(a.end).getTime();
          return time >= start && time <= end;
        });
        return !isAbsent;
      });

      if (available.length > 0) {
        available.sort((a, b) => (currentCounts[a.id] || 0) - (currentCounts[b.id] || 0));
        const selectedEmp = available[0];
        const newId = Date.now().toString() + Math.random().toString(36).substring(7);

        try {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'shifts', newId), {
            id: newId,
            empId: selectedEmp.id,
            date: dateStr
          });
          currentCounts[selectedEmp.id] = (currentCounts[selectedEmp.id] || 0) + 1;
          addedCount++;
        } catch (err: any) {
          console.error(err);
        }
      }
    }
    alert(`Auto-fordeling fuldført! Der blev automatisk tilføjet ${addedCount} nye vagter.`);
  };

  const handleExportCSV = () => {
    let csvContent = "\uFEFFMedarbejder;Type;Start Dato;Slut Dato\n";
    absences.forEach(a => {
      const emp = EMPLOYEES.find(e => e.id === a.empId);
      const typeName = a.type === 'vacation' ? 'Ferie' : 'Vagtfri';
      csvContent += `${emp?.name};${typeName};${formatDateShort(parseDate(a.start))};${formatDateShort(parseDate(a.end))}\n`;
    });
    weekendShifts.forEach(s => {
      const emp = EMPLOYEES.find(e => e.id === s.empId);
      const dateStr = formatDateShort(parseDate(s.date));
      csvContent += `${emp?.name};Weekendvagt;${dateStr};${dateStr}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "vagtplan.csv";
    link.click();
  };

  // --- Hjælpefunktioner til overblik ---
  const getAbsenceOnDate = (date: Date, empId: number) => {
    const time = date.getTime();
    return absences.find(a => a.empId === empId && time >= parseDate(a.start).getTime() && time <= parseDate(a.end).getTime());
  };

  const hasShiftOnDate = (date: Date, empId: number) => {
    const time = date.getTime();
    return weekendShifts.some(s => s.empId === empId && parseDate(s.date).getTime() === time);
  };

  if (!user) return <div className="p-8 text-center text-slate-500">Forbinder til skydatabase...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* --- ROLLE & LOGIN BAR --- */}
        <div className="bg-slate-800 text-white p-3 rounded-xl mb-6 flex flex-col sm:flex-row items-center justify-between shadow-sm gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-300">Skift visning:</span>
            <div className="flex bg-slate-900 rounded-lg p-1">
              <button 
                onClick={() => setRole('planner')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${role === 'planner' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <Lock className="w-4 h-4" /> Planlægger
              </button>
              <button 
                onClick={() => setRole('employee')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${role === 'employee' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <UserCircle className="w-4 h-4" /> Medarbejder
              </button>
            </div>
          </div>
          
          {role === 'employee' && (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-sm text-slate-300 whitespace-nowrap">Hvem er du?</span>
              <select 
                value={currentEmpId} 
                onChange={(e) => setCurrentEmpId(Number(e.target.value))}
                className="w-full sm:w-auto bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
              >
                {EMPLOYEES.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <CalendarDays className="w-8 h-8 text-blue-600" />
              Ferie- & Vagtplanlægger
            </h1>
            <p className="text-slate-500 mt-1">
              {role === 'planner' ? 'Styr ferieønsker og weekendvagter (Sky-synkroniseret).' : 'Indtast dine ferieønsker og se vagtplanen.'}
            </p>
          </div>

          <div className="flex bg-white rounded-lg shadow-sm border border-slate-200 p-1">
            <button 
              onClick={() => setActiveTab('planning')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'planning' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Planlægning
            </button>
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'overview' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Overblik
            </button>
          </div>
          
          {role === 'planner' && (
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Eksportér (Excel)
            </button>
          )}
        </header>

        {/* --- TAB: PLANLÆGNING --- */}
        {activeTab === 'planning' && (
          <div className="space-y-6">
            
            {role === 'planner' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-slate-400" /> Indstillinger
                </h2>
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Startdato</label>
                    <input type="date" value={period.start} onChange={e => setPeriod({...period, start: e.target.value})} className="border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Slutdato</label>
                    <input type="date" value={period.end} onChange={e => setPeriod({...period, end: e.target.value})} className="border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                      <Settings className="w-4 h-4 text-slate-400" /> Max væk af gangen
                    </label>
                    <input type="number" min="1" max="10" value={maxAway} onChange={e => setMaxAway(Number(e.target.value) || 0)} className="w-32 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>
            )}

            <div className={`grid grid-cols-1 ${role === 'planner' ? 'lg:grid-cols-2' : ''} gap-6`}>
              
              {/* Ferie Input */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className={`w-5 h-5 ${role === 'employee' ? 'text-green-600' : 'text-green-500'}`} />
                  {role === 'planner' ? 'Indtast Ferie & Vagtfriønsker' : 'Mine Ønsker'}
                </h2>
                
                <form onSubmit={handleAddAbsence} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <div className="flex gap-4">
                    {role === 'planner' && (
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Medarbejder</label>
                        <select value={absForm.empId} onChange={e => setAbsForm({...absForm, empId: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white outline-none">
                          {EMPLOYEES.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                      <select value={absForm.type} onChange={e => setAbsForm({...absForm, type: e.target.value})} className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white outline-none">
                        <option value="vacation">Ferie</option>
                        <option value="vagtfri">Ønsker vagtfri</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Fra</label>
                      <input type="date" value={absForm.start} onChange={e => setAbsForm({...absForm, start: e.target.value})} className="w-full border border-slate-300 rounded-lg px-4 py-2" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Til</label>
                      <input type="date" value={absForm.end} onChange={e => setAbsForm({...absForm, end: e.target.value})} className="w-full border border-slate-300 rounded-lg px-4 py-2" />
                    </div>
                  </div>
                  <button type="submit" className={`w-full text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${absForm.type === 'vacation' ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-500 hover:bg-yellow-600'}`}>
                    <Plus className="w-4 h-4" /> Tilføj
                  </button>
                </form>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {absences.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-4">Ingen data indtastet.</p>
                  ) : (
                    [...absences].sort((a,b) => parseDate(a.start).getTime() - parseDate(b.start).getTime()).map(abs => {
                      const emp = EMPLOYEES.find(e => e.id === abs.empId);
                      const isVacation = abs.type === 'vacation';
                      const isMine = role === 'employee' && abs.empId === currentEmpId;
                      const canDelete = role === 'planner' || isMine;
                      const opacityClass = (role === 'employee' && !isMine) ? 'opacity-60' : '';

                      return (
                        <div key={abs.id} className={`flex justify-between items-center bg-white border border-slate-200 p-3 rounded-lg border-l-4 ${opacityClass}`} style={{borderLeftColor: isVacation ? '#4ade80' : '#facc15'}}>
                          <div>
                            <span className="font-medium text-slate-800">{emp?.name} {isMine && '(Dig)'}</span>
                            <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                              {isVacation ? 'Ferie' : 'Vagtfri'}
                            </span>
                            <span className="text-sm text-slate-500 block mt-1">
                              {formatDateShort(parseDate(abs.start))} - {formatDateShort(parseDate(abs.end))}
                            </span>
                          </div>
                          {canDelete && (
                            <button onClick={() => handleDeleteAbsence(abs.id)} className="text-red-400 hover:text-red-600 p-2">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Weekendvagter (Kun Planlægger) */}
              {role === 'planner' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-blue-500" /> Weekendvagter
                  </h2>
                  
                  <form onSubmit={handleAddShift} className="space-y-4 mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dato</label>
                      <input type="date" value={shiftForm.date} onChange={handleShiftDateChange} className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Medarbejder</label>
                      <select value={shiftForm.empId} onChange={e => setShiftForm({...shiftForm, empId: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-4 py-2 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none" disabled={!shiftForm.date || availableEmployeesForShift.length === 0}>
                        {!shiftForm.date && <option value="0">Vælg dato først</option>}
                        {shiftForm.date && availableEmployeesForShift.length === 0 && <option value="0">Ingen ledige</option>}
                        {availableEmployeesForShift.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                      </select>
                    </div>
                    <button type="submit" disabled={!shiftForm.date || !shiftForm.empId} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors">
                      <Plus className="w-4 h-4" /> Tildel
                    </button>
                  </form>

                  <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-center justify-between">
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold">Auto-fordeling</p>
                      <p className="text-xs mt-0.5 opacity-90">Udfyld automatisk tomme weekender.</p>
                    </div>
                    <button onClick={handleAutoDistribute} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                      <Wand2 className="w-4 h-4" /> Kør
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                    {[...weekendShifts].sort((a,b) => parseDate(a.date).getTime() - parseDate(b.date).getTime()).map(shift => {
                      const emp = EMPLOYEES.find(e => e.id === shift.empId);
                      return (
                        <div key={shift.id} className="flex justify-between items-center bg-white border border-slate-200 p-3 rounded-lg">
                          <div>
                            <span className="font-medium text-slate-800">{emp?.name}</span>
                            <span className="text-sm text-slate-500 block">
                              {getDayName(parseDate(shift.date))}. {formatDateShort(parseDate(shift.date))}
                            </span>
                          </div>
                          <button onClick={() => handleDeleteShift(shift.id)} className="text-red-400 hover:text-red-600 p-2">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- TAB: OVERBLIK --- */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {(conflicts.length > 0 || (role === 'planner' && absenceWarnings.length > 0)) && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <h3 className="text-red-800 font-bold">Opmærksomhed påkrævet!</h3>
                </div>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  {conflicts.map((conf, idx) => <li key={`conf-${idx}`} className="text-sm font-semibold">{conf.message}</li>)}
                  {role === 'planner' && absenceWarnings.map((warn, idx) => <li key={`warn-${idx}`} className="text-sm">{warn}</li>)}
                </ul>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800">Vagtplan</h2>
                <div className="flex gap-4 text-sm flex-wrap">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-400 rounded-sm"></div> Ferie</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-400 rounded-sm"></div> Vagtfri</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> Vagt</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-sm"></div> Konflikt</div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <div className="min-w-max">
                  <div className="flex border-b border-slate-200">
                    <div className="w-32 flex-shrink-0 p-3 bg-white sticky left-0 z-10 border-r border-slate-200">
                      <span className="text-xs font-semibold text-slate-400 uppercase">Medarbejder</span>
                    </div>
                    {periodDates.map((date, i) => (
                      <div key={i} className={`w-10 flex-shrink-0 flex flex-col items-center justify-center py-2 border-r border-slate-100 ${isWeekend(date) ? 'bg-slate-100' : 'bg-white'}`}>
                        <span className="text-[10px] text-slate-500 uppercase">{getDayName(date).charAt(0)}</span>
                        <span className="text-xs font-semibold text-slate-900">{date.getDate()}</span>
                      </div>
                    ))}
                  </div>

                  {EMPLOYEES.map(emp => (
                    <div key={emp.id} className={`flex border-b border-slate-100 hover:bg-slate-50 transition-colors ${role === 'employee' && currentEmpId === emp.id ? 'bg-blue-50/50' : ''}`}>
                      <div className="w-32 flex-shrink-0 p-3 bg-white sticky left-0 z-10 border-r border-slate-200 font-medium text-sm text-slate-700 flex items-center">
                        {emp.name} {role === 'employee' && currentEmpId === emp.id && ' (Dig)'}
                      </div>
                      {periodDates.map((date, i) => {
                        const absence = getAbsenceOnDate(date, emp.id);
                        const isVacation = absence?.type === 'vacation';
                        const isVagtfri = absence?.type === 'vagtfri';
                        const hasShift = hasShiftOnDate(date, emp.id);
                        const isConflict = (isVacation || isVagtfri) && hasShift;
                        const weekend = isWeekend(date);

                        let bgColor = weekend ? 'bg-slate-50' : 'bg-white';
                        if (isConflict) bgColor = 'bg-red-500';
                        else if (hasShift) bgColor = 'bg-blue-500';
                        else if (isVacation) bgColor = 'bg-green-400';
                        else if (isVagtfri) bgColor = 'bg-yellow-400';

                        return (
                          <div key={i} className={`w-10 flex-shrink-0 border-r border-slate-100 relative ${bgColor}`}>
                            {isVacation && !hasShift && !isConflict && <div className="absolute inset-y-1 inset-x-0 bg-green-400 opacity-80"></div>}
                            {isVagtfri && !hasShift && !isConflict && <div className="absolute inset-y-1 inset-x-0 bg-yellow-400 opacity-80"></div>}
                            {hasShift && !isConflict && <div className="absolute inset-2 rounded-sm bg-blue-500 flex items-center justify-center"><div className="w-1 h-1 bg-white rounded-full"></div></div>}
                            {isConflict && <div className="absolute inset-1 rounded-sm bg-red-500 flex items-center justify-center animate-pulse"><AlertTriangle className="w-3 h-3 text-white" /></div>}
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  <div className="flex bg-slate-100 text-xs text-slate-500 font-medium">
                    <div className="w-32 flex-shrink-0 p-2 bg-slate-100 sticky left-0 z-10 border-r border-slate-200 text-right pr-4 flex items-center justify-end">
                      På ferie:
                    </div>
                    {periodDates.map((date, i) => {
                      const countAway = EMPLOYEES.filter(emp => getAbsenceOnDate(date, emp.id)?.type === 'vacation').length;
                      const isOverLimit = countAway > maxAway;
                      return (
                        <div key={i} className={`w-10 flex-shrink-0 flex items-center justify-center border-r border-slate-200 py-2 ${isOverLimit ? 'bg-red-100' : ''}`}>
                          <span className={isOverLimit ? 'text-red-600 font-bold' : ''}>{countAway > 0 ? countAway : '-'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-slate-500" /> Statistik
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {EMPLOYEES.map(emp => (
                  <div key={emp.id} className={`bg-slate-50 rounded-lg p-3 border border-slate-100 text-center ${role === 'employee' && currentEmpId === emp.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}>
                    <div className="text-sm font-medium text-slate-600 mb-1">{emp.name}</div>
                    <div className="text-2xl font-bold text-slate-800">
                      {shiftCounts[emp.id]} <span className="text-xs text-slate-400 font-normal">vagter</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}