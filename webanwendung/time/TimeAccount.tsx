import React, { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, getDaysInMonth, addMonths, subMonths, setDate, isWeekend, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { AbsenceService } from "@/lib/services/absenceService";
import { TimeEntryService, safeParseDate } from "@/lib/services/timeEntryService";
import { Absence, AbsenceType, AbsenceStatus } from "@/types/absence";
import { TimeEntry } from "@/types/timeEntry";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Clock, CalendarDays, BarChart3, Lightbulb, RefreshCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart, 
  Pie, 
  Cell
} from "recharts";
import { getAbsenceBalance } from "@/lib/services/absenceService";
import { AbsenceBalance } from "@/types/absence";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import timeUtils from "@/lib/utils/timeUtils";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Definiere die Arbeitsstunden pro Tag (Standard: 8 Stunden)
const WORK_HOURS_PER_DAY = 8;

// Berechnung der wöchentlichen Sollstunden basierend auf Benutzervertrag
const calculateWeeklyTargetHours = (userContract: any): number => {
  if (!userContract) return 40; // Standardwert: 40 Stunden
  
  // Verwende die vertraglichen Arbeitsstunden, wenn verfügbar
  if (userContract.contractWorkHours && userContract.contractWorkHours > 0) {
    return userContract.contractWorkHours;
  }
  
  // Alternativ basierend auf Wochenplan berechnen
  if (userContract.weeklySchedule && Object.keys(userContract.weeklySchedule).length > 0) {
    const totalHours = Object.values(userContract.weeklySchedule).reduce((total: number, day: any) => {
      if (day && day.hours) {
        return total + day.hours;
      }
      return total;
    }, 0);
    
    // Wenn Stunden im Wochenplan definiert sind, verwende diese
    if (totalHours > 0) {
      return totalHours;
    }
  }
  
  // Berechne basierend auf Arbeitstagen, falls vorhanden
  if (userContract.workDays && userContract.workDays.length > 0) {
    return userContract.workDays.length * 8; // Standard: 8 Stunden pro Arbeitstag
  }
  
  return 40; // Fallback
};

// Arbeitstage im Monat (ohne Wochenenden)
const getWorkdaysInMonth = (date: Date): number => {
  const daysInMonth = getDaysInMonth(date);
  let workdays = 0;
  
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = setDate(date, day);
    if (!isWeekend(currentDate)) {
      workdays++;
    }
  }
  
  return workdays;
};

// Formatiere die Zeit in Stunden und Minuten
const formatTime = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  
  return `${h}h ${m > 0 ? `${m}m` : ''}`;
};

// Formatiere die Dauer mit Berücksichtigung von Sekunden
const formatDuration = (seconds: number, includePause: boolean = false, pauseMinutes: number = 0): string => {
  if (!seconds && seconds !== 0) return "0h 0m";
  
  // Verwende timeUtils für konsistente Formatierung
  const formattedDuration = timeUtils.formatDuration(seconds);
  
  // Wenn Pausenanzeige gewünscht und Pausenminuten vorhanden sind
  if (includePause && pauseMinutes > 0) {
    return `${formattedDuration} (inkl. ${pauseMinutes}m Pause)`;
  }
  
  return formattedDuration;
};

// Monat auswählen (deutsch)
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

type TimeAccountProps = {
  userId?: string;
  username?: string;
  isAdmin?: boolean;
};

const TimeAccount = ({ userId, username, isAdmin = false }: TimeAccountProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const currentUserId = userId || (user?.uid || '');
  const currentUsername = username || (user?.displayName || 'Unbekannt');
  
  // State
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [monthlyDataByPeriod, setMonthlyDataByPeriod] = useState<{
    [key: number]: {
      target: number;
      actual: number;
      absence: number;
      balance: number;
    }
  }>({});
  const [vacationBalance, setVacationBalance] = useState<AbsenceBalance | null>(null);
  const [progress, setProgress] = useState(0);
  const [syncIndicator, setSyncIndicator] = useState(false);
  // Neue State-Variablen für detaillierte Zeitanalyse
  const [timeSourceBreakdown, setTimeSourceBreakdown] = useState<{
    manual: number; // Manuell erfasste Zeit in Sekunden
    automatic: number; // Automatisch erfasste Zeit in Sekunden
    fromOrders: number; // Zeit aus Aufträgen in Sekunden
    total: number; // Gesamtzeit in Sekunden
  }>({
    manual: 0,
    automatic: 0,
    fromOrders: 0,
    total: 0
  });
  const [timeByProject, setTimeByProject] = useState<Array<{
    projectName: string;
    projectId: string;
    time: number; // Zeit in Sekunden
    percentage: number; // Prozentualer Anteil an der Gesamtzeit
  }>>([]);
  const [timeByDay, setTimeByDay] = useState<{[key: string]: number}>({});
  // Neuer State für Benutzervertrag
  const [userContract, setUserContract] = useState<any>(null);
  const [weeklyTargetHours, setWeeklyTargetHours] = useState<number>(40); // Standard: 40 Stunden

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i);

  // Laden der Daten für den ausgewählten Monat
  useEffect(() => {
    if (!currentUserId) return;
    
    const loadMonthData = async () => {
      setLoading(true);
      
      try {
        // Zeitraum für den ausgewählten Monat
        const startDate = startOfMonth(selectedMonth);
        const endDate = endOfMonth(selectedMonth);
        
        // Zeiteinträge und Abwesenheiten parallel laden
        const [entries, absencesList] = await Promise.all([
          TimeEntryService.getUserTimeEntries(currentUserId, startDate, endDate),
          AbsenceService.getUserAbsences(currentUserId, {
            startDate,
            endDate
          })
        ]);
        
        setTimeEntries(entries);
        setAbsences(absencesList);
        
        // Zeitquellen-Analyse durchführen
        analyzeTimeSources(entries);
        // Zeitverteilung nach Projekten analysieren
        analyzeTimeByProject(entries);
        // Zeitverteilung nach Tagen analysieren
        analyzeTimeByDay(entries, startDate, endDate);
      } catch (error) {
        console.error('Fehler beim Laden der Zeitkontodaten:', error);
        toast({
          title: 'Fehler',
          description: 'Die Zeitkontodaten konnten nicht geladen werden.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadMonthData();
  }, [currentUserId, selectedMonth]);
  
  // Laden der Jahresdaten
  useEffect(() => {
    if (!currentUserId) return;
    
    const loadYearData = async () => {
      try {
        const yearData: {
          [key: number]: {
            target: number;
            actual: number;
            absence: number;
            balance: number;
          }
        } = {};
        
        // Für jeden Monat im Jahr
        for (let month = 0; month < 12; month++) {
          const date = new Date(selectedYear, month, 1);
          const startDate = startOfMonth(date);
          const endDate = endOfMonth(date);
          
          // Arbeitstage im Monat
          const workdaysInMonth = getWorkdaysInMonth(date);
          const targetHours = workdaysInMonth * WORK_HOURS_PER_DAY;
          
          // Zeiteinträge und Abwesenheiten parallel laden
          const [entries, absencesList] = await Promise.all([
            TimeEntryService.getUserTimeEntries(currentUserId, startDate, endDate),
            AbsenceService.getUserAbsences(currentUserId, {
              startDate,
              endDate
            })
          ]);
          
          // Tatsächliche Arbeitsstunden berechnen
          const actualHours = entries.reduce((total, entry) => {
            if (entry.status === 'completed') {
              return total + (entry.duration || 0);
            }
            return total;
          }, 0);
          
          // Abwesenheitsstunden berechnen
          const absenceHours = absencesList
            .filter(a => a.status === AbsenceStatus.APPROVED)
            .reduce((total, absence) => {
              return total + (absence.daysCount * WORK_HOURS_PER_DAY);
            }, 0);
          
          // Saldo berechnen (positiv = Überstunden, negativ = Minusstunden)
          const balance = actualHours + absenceHours - targetHours;
          
          yearData[month] = {
            target: targetHours,
            actual: actualHours,
            absence: absenceHours,
            balance,
          };
        }
        
        setMonthlyDataByPeriod(yearData);
      } catch (error) {
        console.error('Fehler beim Laden der Jahresdaten:', error);
        toast({
          title: 'Fehler',
          description: 'Die Jahresdaten konnten nicht geladen werden.',
          variant: 'destructive',
        });
      }
    };
    
    loadYearData();
  }, [currentUserId, selectedYear]);
  
  // Zum vorherigen Monat wechseln
  const goToPreviousMonth = () => {
    setSelectedMonth(prevDate => subMonths(prevDate, 1));
  };
  
  // Zum nächsten Monat wechseln
  const goToNextMonth = () => {
    setSelectedMonth(prevDate => addMonths(prevDate, 1));
  };
  
  // Berechne Soll-Arbeitsstunden basierend auf dem Vertrag
  const calculateMonthlyTargetHours = () => {
    // Standardberechnung: Arbeitstage im Monat (ohne Wochenenden)
    const workdaysInMonth = getWorkdaysInMonth(selectedMonth);
    
    if (!userContract) {
      // Fallback auf einfache Berechnung, wenn kein Vertrag vorhanden
      return workdaysInMonth * WORK_HOURS_PER_DAY;
    }
    
    // Vertragliche Arbeitszeit vorhanden
    const weeklyHours = userContract.contractWorkHours || 40;
    const workDays = userContract.workDays || ["monday", "tuesday", "wednesday", "thursday", "friday"];
    
    // Tage im ausgewählten Monat durchgehen
    let totalTargetHours = 0;
    
    // Mapping von Wochentagen zu workDays-IDs mit korrektem Typ
    const dayMapping: { [key: number]: string } = {
      0: "sunday",
      1: "monday",
      2: "tuesday",
      3: "wednesday",
      4: "thursday",
      5: "friday",
      6: "saturday"
    };
    
    // Jeden Tag des Monats prüfen
    const daysInCurrentMonth = getDaysInMonth(selectedMonth);
    const currentMonthYear = selectedMonth.getFullYear();
    const currentMonth = selectedMonth.getMonth();
    
    for (let day = 1; day <= daysInCurrentMonth; day++) {
      const date = new Date(currentMonthYear, currentMonth, day);
      const dayOfWeek = date.getDay();
      const dayKey = dayMapping[dayOfWeek];
      
      // Prüfen, ob dieser Tag ein Arbeitstag laut Vertrag ist
      if (workDays.includes(dayKey)) {
        // Wenn der Vertrag einen Wochenplan hat, die Stunden aus dem Plan verwenden
        if (userContract.weeklySchedule && userContract.weeklySchedule[dayKey]) {
          const daySchedule = userContract.weeklySchedule[dayKey];
          totalTargetHours += daySchedule.hours || 0;
        } else {
          // Ansonsten gleichmäßig auf die Arbeitstage verteilen
          totalTargetHours += weeklyHours / workDays.length;
        }
      }
    }
    
    return Math.round(totalTargetHours * 3600); // In Sekunden umrechnen für Konsistenz
  };
  
  // Berechnen der Sollstunden für den aktuellen Monat unter Berücksichtigung des Vertrags
  const targetHours = calculateMonthlyTargetHours();
  
  // Berechnen der tatsächlichen Arbeitsstunden
  const actualHours = timeEntries.reduce((total, entry) => {
    // Nur abgeschlossene oder genehmigte Einträge zählen
    if (entry.status === 'completed' || entry.status === 'approved') {
      // Sicherstellen, dass duration eine Zahl ist
      const duration = typeof entry.duration === 'number' ? entry.duration : 0;
      return total + duration;
    }
    return total;
  }, 0);
  
  // Berechnen der Abwesenheitsstunden (nur genehmigte)
  const absenceHours = absences
    .filter(a => a.status === AbsenceStatus.APPROVED)
    .reduce((total, absence) => {
      return total + (absence.daysCount * WORK_HOURS_PER_DAY);
    }, 0);
  
  // Berechnen der Gesamtpausenzeit in Minuten
  const totalPauseMinutes = timeEntries.reduce((total, entry) => {
    // Sicherstellen, dass pauseMinutes eine Zahl ist
    const pauseMinutes = typeof entry.pauseMinutes === 'number' ? entry.pauseMinutes : 0;
    return total + pauseMinutes;
  }, 0);
  
  // Berechnen des Saldos (positiv = Überstunden, negativ = Minusstunden)
  const balance = actualHours + absenceHours - targetHours;
  
  // Berechnen des Fortschritts für die Progress-Bar
  useEffect(() => {
    if (vacationBalance) {
      const total = vacationBalance.totalDays + (vacationBalance.carryOverDays || 0);
      if (total === 0) {
        setProgress(0);
        return;
      }
      
      const used = vacationBalance.usedDays + vacationBalance.pendingDays;
      setProgress(Math.min(100, Math.round((used / total) * 100)));
    } else {
      setProgress(0);
    }
  }, [vacationBalance]);
  
  // Gruppiere Abwesenheiten nach Datum
  const absencesByDate: { [date: string]: Absence[] } = {};
  absences.forEach(absence => {
    // Für jeden Tag in der Abwesenheitsspanne
    let currentDate = new Date(absence.startDate);
    while (currentDate <= absence.endDate) {
      if (!isWeekend(currentDate)) {
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        if (!absencesByDate[dateKey]) {
          absencesByDate[dateKey] = [];
        }
        absencesByDate[dateKey].push(absence);
      }
      currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
    }
  });
  
  // Gruppiere Zeiteinträge nach Datum
  const entriesByDate: { [date: string]: TimeEntry[] } = {};
  timeEntries.forEach(entry => {
    if (entry.date) {
      const entryDate = safeParseDate(entry.date);
      if (entryDate) {
        const dateKey = format(entryDate, 'yyyy-MM-dd');
        if (!entriesByDate[dateKey]) {
          entriesByDate[dateKey] = [];
        }
        entriesByDate[dateKey].push(entry);
      }
    }
  });
  
  // Berechnung des kumulierten Jahressaldos
  const calculateYearToDateBalance = () => {
    let totalBalance = 0;
    const currentMonth = new Date().getMonth();
    
    for (let month = 0; month <= currentMonth; month++) {
      if (monthlyDataByPeriod[month]) {
        totalBalance += monthlyDataByPeriod[month].balance;
      }
    }
    
    return totalBalance;
  };
  
  const yearToDateBalance = calculateYearToDateBalance();
  
  // Datumsarray für den aktuellen Monat generieren
  const daysInMonth = Array.from(
    { length: getDaysInMonth(selectedMonth) },
    (_, i) => new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), i + 1)
  );

  useEffect(() => {
    loadData();
  }, [userId, selectedYear, selectedMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      setSyncIndicator(true); // Zeige Synchronisationsindikator an
      
      if (!currentUserId) {
        console.error("Benutzer-ID fehlt");
        return;
      }
      
      // Zeitraum für die Abfrage definieren
      const periodStart = startOfMonth(new Date(selectedYear, selectedMonth.getMonth()));
      const periodEnd = endOfMonth(new Date(selectedYear, selectedMonth.getMonth()));
      
      // Daten parallel laden für bessere Performance
      const [entries, balance, contractDoc] = await Promise.all([
        // Zeiteinträge laden
        TimeEntryService.getUserTimeEntries(currentUserId, periodStart, periodEnd),
        // Urlaubssaldo laden
        getAbsenceBalance(currentUserId, selectedYear),
        // Benutzervertrag laden
        getDoc(doc(db, "userContracts", currentUserId))
      ]);
      
      setTimeEntries(entries);
      setVacationBalance(balance);
      
      // Benutzervertrag verarbeiten
      if (contractDoc.exists()) {
        const contractData = contractDoc.data();
        setUserContract(contractData);
        
        // Wöchentliche Sollstunden berechnen
        const targetHours = calculateWeeklyTargetHours(contractData);
        setWeeklyTargetHours(targetHours);
        
        // Zeitquellenanalyse durchführen
        analyzeTimeSources(entries);
        // Zeitverteilung nach Projekten analysieren
        analyzeTimeByProject(entries);
        // Zeitverteilung nach Tagen analysieren
        analyzeTimeByDay(entries, periodStart, periodEnd);
      } else {
        // Kein Vertrag gefunden, Standard verwenden
        setWeeklyTargetHours(40);
      }
      
    } catch (error) {
      console.error("Fehler beim Laden der Daten:", error);
      toast({
        title: "Fehler",
        description: "Die Daten konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      // Kurze Animation für Synchronisations-Feedback
      setTimeout(() => setSyncIndicator(false), 800);
    }
  };

  const getMonthlyStats = () => {
    const stats = {
      totalHours: 0,
      totalDays: 0,
      totalPauseMinutes: 0,
      averageHoursPerDay: 0,
      averagePausePerDay: 0,
      daysWorked: new Set(),
    };
    
    timeEntries.forEach(entry => {
      if (entry.duration) {
        // Dauer in Stunden (duration ist in Sekunden)
        const hours = entry.duration / 3600;
        stats.totalHours += hours;
        
        // Pausenzeit addieren
        if (entry.pauseMinutes) {
          stats.totalPauseMinutes += entry.pauseMinutes;
        }
        
        // Tag zum Set hinzufügen, um einzigartige Arbeitstage zu zählen
        if (entry.date) {
          const entryDate = safeParseDate(entry.date);
          if (entryDate) {
            const dateStr = format(entryDate, 'yyyy-MM-dd');
            stats.daysWorked.add(dateStr);
          }
        }
      }
    });
    
    stats.totalDays = stats.daysWorked.size;
    stats.averageHoursPerDay = stats.totalDays > 0 ? stats.totalHours / stats.totalDays : 0;
    stats.averagePausePerDay = stats.totalDays > 0 ? stats.totalPauseMinutes / stats.totalDays : 0;
    
    return stats;
  };

  const generateMonthlyData = () => {
    // Gruppierung nach Tagen
    const dailyData: {[key: string]: number} = {};
    
    timeEntries.forEach(entry => {
      if (entry.duration && entry.date) {
        const entryDate = safeParseDate(entry.date);
        if (entryDate) {
          const day = format(entryDate, 'dd.MM.yyyy');
          dailyData[day] = (dailyData[day] || 0) + entry.duration / 60; // Umrechnung in Stunden
        }
      }
    });
    
    // Umwandlung in Array für Recharts
    return Object.entries(dailyData).map(([date, hours]) => ({
      date,
      hours: Math.round(hours * 100) / 100 // Runden auf 2 Dezimalstellen
    }));
  };

  const generateProjectData = () => {
    // Gruppierung nach Projekten
    const projectData: {[key: string]: number} = {};
    
    timeEntries.forEach(entry => {
      if (entry.duration) {
        const projectName = entry.projectName || 'Kein Projekt';
        projectData[projectName] = (projectData[projectName] || 0) + entry.duration / 60;
      }
    });
    
    // Umwandlung in Array für Recharts
    return Object.entries(projectData).map(([name, hours]) => ({
      name,
      hours: Math.round(hours * 100) / 100
    }));
  };

  const getVacationData = () => {
    if (!vacationBalance) return [];
    
    return [
      { name: 'Verwendet', value: vacationBalance.usedDays, color: '#4f46e5' },
      { name: 'Ausstehend', value: vacationBalance.pendingDays, color: '#f59e0b' },
      { name: 'Verbleibend', value: vacationBalance.remainingDays, color: '#10b981' }
    ];
  };

  const generateWorkAndPauseData = () => {
    // Gruppierung nach Tagen
    const dailyData: { [key: string]: { work: number, pause: number } } = {};
    
    timeEntries.forEach(entry => {
      if (entry.duration && entry.date) {
        const entryDate = safeParseDate(entry.date);
        if (entryDate) {
          const day = format(entryDate, 'dd.MM.yyyy');
          if (!dailyData[day]) {
            dailyData[day] = { work: 0, pause: 0 };
          }
          
          // Arbeitszeit in Stunden
          dailyData[day].work += entry.duration / 3600;
          
          // Pausenzeit in Stunden
          if (entry.pauseMinutes) {
            dailyData[day].pause += entry.pauseMinutes / 60;
          }
        }
      }
    });
    
    // Umwandlung in Array für Recharts
    return Object.entries(dailyData).map(([date, data]) => ({
      date,
      work: Math.round(data.work * 100) / 100, // Runden auf 2 Dezimalstellen
      pause: Math.round(data.pause * 100) / 100 // Runden auf 2 Dezimalstellen
    }));
  };

  const getPauseStats = () => {
    const stats = {
      totalPauseMinutes: 0,
      averagePauseMinutes: 0,
      pauseCount: 0,
      entriesWithPause: 0,
      maxPause: 0,
      minPause: Number.MAX_VALUE
    };
    
    // Filter für Einträge mit Pausen
    const entriesWithPause = timeEntries.filter(entry => entry.pauseMinutes && entry.pauseMinutes > 0);
    
    if (entriesWithPause.length === 0) {
      return {
        ...stats,
        minPause: 0
      };
    }
    
    // Berechne Pausenstatistiken
    stats.entriesWithPause = entriesWithPause.length;
    stats.pauseCount = entriesWithPause.length;
    
    entriesWithPause.forEach(entry => {
      if (entry.pauseMinutes) {
        stats.totalPauseMinutes += entry.pauseMinutes;
        stats.maxPause = Math.max(stats.maxPause, entry.pauseMinutes);
        stats.minPause = Math.min(stats.minPause, entry.pauseMinutes);
      }
    });
    
    stats.averagePauseMinutes = stats.totalPauseMinutes / stats.pauseCount;
    
    return stats;
  };
  
  // Pausenstatistiken abrufen
  const pauseStats = getPauseStats();

  const monthlyStats = getMonthlyStats();
  const chartData = generateMonthlyData();
  const projectData = generateProjectData();
  const vacationData = getVacationData();
  
  const COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

  // Refresh-Funktion mit visueller Rückmeldung
  const handleRefresh = () => {
    if (loadData) {
      setSyncIndicator(true);
      loadData();
      // Kurze Animation für Synchronisations-Feedback
      setTimeout(() => setSyncIndicator(false), 1000);
    }
  };

  // Formatierung eines Datums, wenn es gültig ist
  const formatDateIfValid = (date: any, formatStr: string = 'dd.MM.yyyy'): string => {
    if (!date) return '';
    
    try {
      // Verwende safeParseDate für sichere Konvertierung verschiedener Datumsformate
      const parsedDate = safeParseDate(date);
      if (!parsedDate) return '';
      
      return format(parsedDate, formatStr, { locale: de });
    } catch (error) {
      console.error('Fehler beim Formatieren des Datums:', error);
      return '';
    }
  };
  
  // Formatierung einer Uhrzeit, wenn sie gültig ist
  const formatTimeIfValid = (time: any, formatStr: string = 'HH:mm'): string => {
    if (!time) return '';
    
    try {
      // Verwende safeParseDate für sichere Konvertierung verschiedener Zeitformate
      const parsedTime = safeParseDate(time);
      if (!parsedTime) return '';
      
      return format(parsedTime, formatStr, { locale: de });
    } catch (error) {
      console.error('Fehler beim Formatieren der Zeit:', error);
      return '';
    }
  };

  // Neue Funktion zur Analyse der Zeitquellen
  const analyzeTimeSources = (entries: TimeEntry[]) => {
    let manual = 0;
    let automatic = 0;
    let fromOrders = 0;
    let total = 0;
    
    entries.forEach(entry => {
      if (entry.status === 'completed') {
        const entryDuration = entry.duration || 0;
        total += entryDuration;
        
        if (entry.isManualEntry) {
          manual += entryDuration;
        } else if (entry.orderReference || entry.auftragId) {
          fromOrders += entryDuration;
        } else {
          automatic += entryDuration;
        }
      }
    });
    
    setTimeSourceBreakdown({
      manual,
      automatic,
      fromOrders,
      total
    });
  };
  
  // Neue Funktion zur Analyse der Zeit nach Projekten
  const analyzeTimeByProject = (entries: TimeEntry[]) => {
    const projectTimeMap: { [key: string]: { time: number, name: string } } = {};
    let totalTime = 0;
    
    // Aggregiere Zeiten nach Projekten
    entries.forEach(entry => {
      if (entry.status === 'completed' && entry.duration) {
        totalTime += entry.duration;
        
        if (entry.projectId) {
          const projectId = entry.projectId;
          const projectName = entry.projectName || 'Unbekanntes Projekt';
          
          if (!projectTimeMap[projectId]) {
            projectTimeMap[projectId] = { time: 0, name: projectName };
          }
          
          projectTimeMap[projectId].time += entry.duration;
        }
      }
    });
    
    // Transformiere in Array und berechne Prozentsätze
    const projectTimes = Object.entries(projectTimeMap).map(([projectId, data]) => ({
      projectId,
      projectName: data.name,
      time: data.time,
      percentage: totalTime > 0 ? (data.time / totalTime) * 100 : 0
    }));
    
    // Sortiere nach Zeit (absteigend)
    projectTimes.sort((a, b) => b.time - a.time);
    
    setTimeByProject(projectTimes);
  };
  
  // Neue Funktion zur Analyse der Zeit nach Tagen
  const analyzeTimeByDay = (entries: TimeEntry[], startDate: Date, endDate: Date) => {
    const daysMap: {[key: string]: number} = {};
    
    // Initialisiere alle Tage im Zeitraum mit 0
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      daysMap[dateKey] = 0;
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Aggregiere Zeiten nach Tagen
    entries.forEach(entry => {
      if (entry.status === 'completed' && entry.duration && entry.date) {
        const entryDate = safeParseDate(entry.date);
        if (entryDate) {
          const dateKey = format(entryDate, 'yyyy-MM-dd');
          
          if (daysMap[dateKey] !== undefined) {
            daysMap[dateKey] += entry.duration;
          }
        }
      }
    });
    
    setTimeByDay(daysMap);
  };

  // Neues Rendersegment für die Zeitquellenaufschlüsselung
  const renderTimeSourceBreakdown = () => {
    const { manual, automatic, fromOrders, total } = timeSourceBreakdown;
    const manualPercentage = total > 0 ? (manual / total) * 100 : 0;
    const automaticPercentage = total > 0 ? (automatic / total) * 100 : 0;
    const ordersPercentage = total > 0 ? (fromOrders / total) * 100 : 0;
    
    const data = [
      { name: 'Manuell', value: manualPercentage, time: manual },
      { name: 'Automatisch', value: automaticPercentage, time: automatic },
      { name: 'Aus Aufträgen', value: ordersPercentage, time: fromOrders }
    ];
    
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Zeiterfassung nach Quelle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="text-2xl font-bold">
              {formatDuration(total)}
            </div>
            <div className="text-sm text-muted-foreground">
              Gesamtzeit in diesem Monat
            </div>
          </div>
          
          <div className="space-y-2 mb-4">
            {data.map((item) => (
              <div key={item.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{item.name}</span>
                  <span className="font-medium">
                    {formatDuration(item.time)} ({item.value.toFixed(1)}%)
                  </span>
                </div>
                <Progress value={item.value} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };
  
  // Rendersegment für die Projektaufschlüsselung
  const renderTimeByProject = () => {
    if (timeByProject.length === 0) {
      return null;
    }
    
    // Zeige nur die Top 5 Projekte
    const topProjects = timeByProject.slice(0, 5);
    
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Zeit nach Projekten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {topProjects.map((project) => (
              <div key={project.projectId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate max-w-[200px]">{project.projectName}</span>
                  <span className="font-medium">
                    {formatDuration(project.time)} ({project.percentage.toFixed(1)}%)
                  </span>
                </div>
                <Progress value={project.percentage} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Neue Funktion für den Export von Zeitberichten
  const exportTimeReport = () => {
    if (!timeEntries.length) {
      toast({
        title: "Keine Daten vorhanden",
        description: "Es sind keine Zeiteinträge für den Export verfügbar.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Datum für den Dateinamen
      const dateStr = format(selectedMonth, 'yyyy-MM', { locale: de });
      const filename = `zeitbericht_${currentUsername.replace(/\s/g, '_')}_${dateStr}.csv`;
      
      // CSV-Header
      let csvContent = "Datum;Start;Ende;Dauer (Std.);Pause (Min.);Projekt;Kunde;Notiz;Quelle\n";
      
      // Einträge hinzufügen
      timeEntries.forEach(entry => {
        const date = formatDateIfValid(entry.date, 'dd.MM.yyyy');
        const startTime = formatTimeIfValid(entry.startTime, 'HH:mm');
        const endTime = entry.endTime ? formatTimeIfValid(entry.endTime, 'HH:mm') : '';
        
        const durationHours = entry.duration ? (entry.duration / 3600).toFixed(2) : '';
        const pauseMinutes = entry.pauseMinutes || 0;
        
        let source = 'Automatisch';
        if (entry.isManualEntry) source = 'Manuell';
        if (entry.fromOrders || entry.orderReference || entry.auftragId) source = 'Auftrag';
        
        // Zeileninhalt mit Semikolon getrennt und Anführungszeichen um Text-Felder
        const row = [
          date,
          startTime,
          endTime,
          durationHours,
          pauseMinutes,
          `"${entry.projectName || ''}"`,
          `"${entry.customerName || ''}"`,
          `"${entry.note?.replace(/"/g, '""') || ''}"`,
          source
        ].join(';');
        
        csvContent += row + '\n';
      });
      
      // CSV-Datei erstellen und herunterladen
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Export erfolgreich",
        description: `Der Zeitbericht wurde als ${filename} exportiert.`,
        variant: "default",
      });
    } catch (error) {
      console.error("Fehler beim Exportieren des Zeitberichts:", error);
      toast({
        title: "Export fehlgeschlagen",
        description: "Der Zeitbericht konnte nicht exportiert werden.",
        variant: "destructive",
      });
    }
  };

  // Reagiere auf Vertragsänderungen
  useEffect(() => {
    // Funktion, die bei Vertragsänderungen aufgerufen wird
    const handleContractUpdate = (event: CustomEvent) => {
      const { userId, contract } = event.detail;
      
      // Nur reagieren, wenn es den aktuellen Benutzer betrifft
      if (userId === currentUserId) {
        console.log("Vertragsänderung für aktuellen Benutzer erkannt", contract);
        // Benutzervertrag aktualisieren
        setUserContract(contract);
        
        // Wöchentliche Sollstunden neu berechnen
        const targetHours = calculateWeeklyTargetHours(contract);
        setWeeklyTargetHours(targetHours);
        
        // Daten neu laden
        loadData();
      }
    };
    
    // Event-Listener registrieren
    window.addEventListener('contractUpdated', handleContractUpdate as EventListener);
    
    // Event-Listener entfernen, wenn Komponente unmountet
    return () => {
      window.removeEventListener('contractUpdated', handleContractUpdate as EventListener);
    };
  }, [currentUserId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Zeitkonto: {currentUsername}</h2>
          <p className="text-muted-foreground">
            Übersicht über Ihre Arbeitszeiten und Urlaubskontingent
          </p>
        </div>
        
        <div className="flex items-center gap-2 mt-4 sm:mt-0">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={syncIndicator}>
            {syncIndicator ? (
              <RefreshCcw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            <span className="ml-2">Aktualisieren</span>
          </Button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4">
        <Card className="w-full md:w-1/3">
          <CardHeader>
            <CardTitle className="text-lg">Zeitübersicht</CardTitle>
            <CardDescription>
              {format(selectedMonth, 'MMMM yyyy', { locale: de })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="font-semibold">
                {MONTHS[selectedMonth.getMonth()]} {selectedMonth.getFullYear()}
              </div>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <div className="space-y-4">
                {renderTimeSourceBreakdown()}
                {renderTimeByProject()}
              </div>
            )}
          </CardContent>
        </Card>
        
        <div className="w-full md:w-2/3">
          <Tabs defaultValue="month" className="w-full">
            <TabsList className="inline-flex w-auto min-w-full overflow-x-auto pb-2 mb-4">
              {isAdmin && <TabsTrigger value="overview">Übersicht</TabsTrigger>}
              <TabsTrigger value="month">Monatsübersicht</TabsTrigger>
              <TabsTrigger value="year">Jahresübersicht</TabsTrigger>
              <TabsTrigger value="timeAccount">Zeitkonto</TabsTrigger>
              <TabsTrigger value="timeSheet">Arbeitszeitnachweis</TabsTrigger>
              <TabsTrigger value="vacation">Urlaubskonto</TabsTrigger>
            </TabsList>
            
            <TabsContent value="month">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Monatliche Übersicht</CardTitle>
                  <CardDescription>
                    {format(selectedMonth, 'MMMM yyyy', { locale: de })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Gesamtstunden</p>
                        <p className="text-2xl font-bold">{formatDuration(actualHours)}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Arbeitstage</p>
                        <p className="text-2xl font-bold">{monthlyStats.totalDays}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Ø Stunden pro Tag</p>
                        <p className="text-2xl font-bold">{monthlyStats.averageHoursPerDay.toFixed(2)}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Pausenzeit</p>
                        <p className="text-2xl font-bold">{totalPauseMinutes}m</p>
                      </div>
                    </div>
                    
                    <Separator className="my-2" />
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Soll-Stunden</p>
                        <p className="text-xl font-medium">{formatDuration(targetHours)}</p>
                        {userContract && (
                          <p className="text-xs text-muted-foreground">
                            Basierend auf {userContract.contractWorkHours || 40}h/Woche
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Ist-Stunden</p>
                        <p className="text-xl font-medium">{formatDuration(actualHours)}</p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Saldo</p>
                        <p className={`text-xl font-medium ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {balance >= 0 ? '+' : ''}{formatDuration(balance)}
                        </p>
                      </div>
                    </div>
                    
                    {/* Fortschrittsanzeige für Arbeitszeiterfüllung */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Arbeitszeiterfüllung</span>
                        <span>{Math.min(100, (actualHours / targetHours * 100) || 0).toFixed(0)}%</span>
                      </div>
                      <Progress 
                        value={Math.min(100, (actualHours / targetHours * 100) || 0)} 
                        className={`h-2 ${actualHours >= targetHours ? 'bg-green-200' : 'bg-amber-200'}`}
                      />
                    </div>
                    
                    {/* Hinweis auf Vertragsbasis */}
                    {userContract && (
                      <div className="mt-6 text-sm p-3 bg-blue-50 rounded-md border border-blue-100">
                        <div className="font-medium text-blue-800 mb-1">Vertragsarbeitszeit</div>
                        <div className="text-blue-700">
                          <p>Ihre Soll-Arbeitszeit basiert auf {userContract.contractWorkHours || 40} Stunden pro Woche,
                          verteilt auf {userContract.workDays?.length || 5} Arbeitstage.</p>
                          {userContract.weeklySchedule && (
                            <p className="mt-1">Die tägliche Arbeitszeit variiert je nach Wochentag gemäß Ihrem Zeitplan.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="year">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Jahresübersicht</CardTitle>
                  <CardDescription>
                    Übersicht über Ihr Jahreskontingent
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-2 p-4 bg-primary/5 rounded-lg">
                      <h3 className="font-medium text-sm text-muted-foreground">Jahres-Sollstunden</h3>
                      <p className="text-2xl font-bold">
                        {formatDuration(Object.values(monthlyDataByPeriod).reduce((total, month) => total + month.target, 0))}
                      </p>
                    </div>
                    <div className="space-y-2 p-4 bg-primary/5 rounded-lg">
                      <h3 className="font-medium text-sm text-muted-foreground">Jahres-Istzeit</h3>
                      <p className="text-2xl font-bold">
                        {formatDuration(Object.values(monthlyDataByPeriod).reduce((total, month) => total + month.actual, 0))}
                      </p>
                    </div>
                    <div className="space-y-2 p-4 bg-green-50 rounded-lg">
                      <h3 className="font-medium text-sm text-muted-foreground">Wöchentliche Sollstunden (Vertrag)</h3>
                      <p className="text-2xl font-bold">{weeklyTargetHours} Stunden</p>
                      {userContract && userContract.workDays && (
                        <p className="text-xs text-muted-foreground">
                          Verteilt auf {userContract.workDays.length} Arbeitstage
                        </p>
                      )}
                    </div>
                    <div className={`space-y-2 p-4 rounded-lg ${yearToDateBalance >= 0 ? 'bg-green-50' : 'bg-amber-50'}`}>
                      <h3 className="font-medium text-sm text-muted-foreground">Jahressaldo</h3>
                      <p className={`text-2xl font-bold ${yearToDateBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {yearToDateBalance >= 0 ? '+' : ''}{formatDuration(yearToDateBalance)}
                      </p>
                    </div>
                  </div>
                  
                  <h3 className="font-medium mb-4">Monatliche Übersicht</h3>
                  
                  <div className="space-y-4">
                    {Object.entries(monthlyDataByPeriod).map(([month, data]) => (
                      <div key={month} className="border rounded-md overflow-hidden">
                        <details className="group">
                          <summary className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-50">
                            <div className="font-medium">{MONTHS[parseInt(month)]}</div>
                            <div className="flex items-center gap-3">
                              <span className={`font-medium ${data.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {data.balance >= 0 ? '+' : ''}{formatDuration(data.balance)}
                              </span>
                              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                            </div>
                          </summary>
                          
                          <div className="border-t p-3 bg-gray-50">
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                              <div className="text-muted-foreground">Sollstunden:</div>
                              <div className="text-right font-medium">{formatDuration(data.target)}</div>
                              
                              <div className="text-muted-foreground">Istzeit:</div>
                              <div className="text-right font-medium">{formatDuration(data.actual)}</div>
                              
                              <div className="text-muted-foreground">Abwesenheit:</div>
                              <div className="text-right font-medium">{formatDuration(data.absence)}</div>
                              
                              <div className="text-muted-foreground">Saldo:</div>
                              <div className={`text-right font-medium ${data.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {data.balance >= 0 ? '+' : ''}{formatDuration(data.balance)}
                              </div>
                            </div>
                            
                            {/* Fortschrittsbalken */}
                            <div className="mt-3">
                              <div className="text-xs text-muted-foreground mb-1">Zielerfüllung:</div>
                              <Progress
                                value={data.target > 0 ? Math.min(100, (data.actual / data.target) * 100) : 0}
                                className={`h-2 ${data.actual >= data.target ? 'bg-green-200' : 'bg-amber-200'}`}
                              />
                            </div>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="timeAccount">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Zeitkonto {format(selectedMonth, 'MMMM yyyy', { locale: de })}</CardTitle>
                  <CardDescription>
                    Übersicht über Ihr Zeitkonto, aufgeschlüsselt nach Herkunft der Zeit
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Übersichtskarte mit Gesamtzeit */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2 p-4 bg-primary/5 rounded-lg">
                          <h3 className="font-medium text-sm text-muted-foreground">Gesamtarbeitszeit</h3>
                          <p className="text-2xl font-bold">
                            {formatDuration(timeSourceBreakdown.total)}
                          </p>
                        </div>
                        <div className="space-y-2 p-4 bg-green-50 rounded-lg">
                          <h3 className="font-medium text-sm text-muted-foreground">Soll-Arbeitszeit</h3>
                          <p className="text-2xl font-bold">
                            {formatDuration(targetHours)}
                          </p>
                        </div>
                        <div className="space-y-2 p-4 bg-amber-50 rounded-lg">
                          <h3 className="font-medium text-sm text-muted-foreground">Saldo</h3>
                          <p className={`text-2xl font-bold ${
                            (timeSourceBreakdown.total - targetHours) >= 0 
                            ? 'text-green-600' 
                            : 'text-red-600'
                          }`}>
                            {
                              (timeSourceBreakdown.total - targetHours) >= 0 
                              ? '+' 
                              : ''
                            }
                            {formatDuration(timeSourceBreakdown.total - targetHours)}
                          </p>
                        </div>
                      </div>
                      
                      {/* Aufschlüsselung nach Zeitquelle */}
                      <div className="space-y-4">
                        <h3 className="font-medium">Aufschlüsselung nach Zeitquelle</h3>
                        
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="flex items-center">
                                <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                                Automatische Erfassung
                              </span>
                              <span className="font-medium">
                                {formatDuration(timeSourceBreakdown.automatic)} ({
                                  timeSourceBreakdown.total 
                                    ? Math.round((timeSourceBreakdown.automatic / timeSourceBreakdown.total) * 100) 
                                    : 0
                                }%)
                              </span>
                            </div>
                            <Progress 
                              value={
                                timeSourceBreakdown.total 
                                  ? (timeSourceBreakdown.automatic / timeSourceBreakdown.total) * 100 
                                  : 0
                              } 
                              className="h-2 bg-gray-100"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="flex items-center">
                                <span className="w-3 h-3 rounded-full bg-amber-500 mr-2"></span>
                                Manuelle Erfassung
                              </span>
                              <span className="font-medium">
                                {formatDuration(timeSourceBreakdown.manual)} ({
                                  timeSourceBreakdown.total 
                                    ? Math.round((timeSourceBreakdown.manual / timeSourceBreakdown.total) * 100) 
                                    : 0
                                }%)
                              </span>
                            </div>
                            <Progress 
                              value={
                                timeSourceBreakdown.total 
                                  ? (timeSourceBreakdown.manual / timeSourceBreakdown.total) * 100 
                                  : 0
                              } 
                              className="h-2 bg-gray-100"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="flex items-center">
                                <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                                Aus Aufträgen
                              </span>
                              <span className="font-medium">
                                {formatDuration(timeSourceBreakdown.fromOrders)} ({
                                  timeSourceBreakdown.total 
                                    ? Math.round((timeSourceBreakdown.fromOrders / timeSourceBreakdown.total) * 100) 
                                    : 0
                                }%)
                              </span>
                            </div>
                            <Progress 
                              value={
                                timeSourceBreakdown.total 
                                  ? (timeSourceBreakdown.fromOrders / timeSourceBreakdown.total) * 100 
                                  : 0
                              } 
                              className="h-2 bg-gray-100"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Top-Projekte */}
                      {timeByProject.length > 0 && (
                        <div className="space-y-4 mt-6">
                          <h3 className="font-medium">Top-Projekte</h3>
                          
                          <div className="space-y-3">
                            {timeByProject.slice(0, 5).map((project, index) => (
                              <div key={project.projectId} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="truncate max-w-[250px]">{project.projectName}</span>
                                  <span className="font-medium">
                                    {formatDuration(project.time)} ({Math.round(project.percentage)}%)
                                  </span>
                                </div>
                                <Progress 
                                  value={project.percentage} 
                                  className="h-2 bg-gray-100"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Tageweise Aufschlüsselung */}
                      <div className="space-y-4 mt-6">
                        <h3 className="font-medium">Tägliche Arbeitszeit</h3>
                        
                        <div className="space-y-2">
                          {Object.entries(timeByDay)
                            .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                            .map(([date, seconds], index) => {
                              const displayDate = new Date(date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
                              const dayEntries = entriesByDate[date] || [];
                              const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
                              
                              return (
                                <div 
                                  key={date}
                                  className={`border rounded-md overflow-hidden ${isWeekend ? 'bg-gray-50' : ''}`}
                                >
                                  <details className="group">
                                    <summary className="flex justify-between text-sm py-2 px-3 cursor-pointer hover:bg-gray-50">
                                      <div className="flex items-center gap-2">
                                        <span className={isWeekend ? 'text-gray-500' : ''}>{displayDate}</span>
                                        {absencesByDate[date] && (
                                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                            Abwesenheit
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{formatDuration(seconds)}</span>
                                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                                      </div>
                                    </summary>
                                    
                                    {dayEntries.length > 0 ? (
                                      <div className="p-3 border-t text-sm">
                                        <div className="space-y-2">
                                          {dayEntries.map(entry => (
                                            <div key={entry.id} className="flex justify-between items-center text-xs py-1 border-b last:border-0">
                                              <div>
                                                <div className="font-medium">{entry.projectName || 'Kein Projekt'}</div>
                                                <div className="text-muted-foreground">{entry.description || entry.note || '-'}</div>
                                              </div>
                                              <div className="text-right">
                                                {entry.duration ? formatDuration(entry.duration) : '-'}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : absencesByDate[date] ? (
                                      <div className="p-3 border-t text-sm bg-blue-50">
                                        <div className="space-y-2">
                                          {absencesByDate[date].map(absence => {
                                            // Sichere Typprüfung
                                            const isVacation = absence.type?.toString() === AbsenceType.VACATION.toString();
                                            return (
                                              <div key={absence.id} className="text-blue-700">
                                                {isVacation ? 'Urlaub' : 'Abwesenheit'}: {absence.reason || '-'}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="p-3 border-t text-sm text-gray-500">
                                        Keine Einträge für diesen Tag
                                      </div>
                                    )}
                                  </details>
                                </div>
                              );
                            })
                          }
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="timeSheet">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Arbeitszeitnachweis</CardTitle>
                  <CardDescription>
                    Detaillierte Übersicht aller Zeiteinträge im ausgewählten Zeitraum
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {timeEntries.length > 0 ? (
                    <Table>
                      <TableCaption>
                        Zeiteinträge für {format(selectedMonth, 'MMMM yyyy', { locale: de })}
                      </TableCaption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Projekt</TableHead>
                          <TableHead>Beschreibung</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>Ende</TableHead>
                          <TableHead>Pause</TableHead>
                          <TableHead className="text-right">Dauer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {timeEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              {formatDateIfValid(entry.date)}
                            </TableCell>
                            <TableCell>{entry.projectName || 'Kein Projekt'}</TableCell>
                            <TableCell>{entry.description || entry.note || '-'}</TableCell>
                            <TableCell>
                              {formatTimeIfValid(entry.startTime)}
                            </TableCell>
                            <TableCell>
                              {formatTimeIfValid(entry.endTime)}
                            </TableCell>
                            <TableCell>
                              {entry.pauseMinutes && entry.pauseMinutes > 0
                                ? `${entry.pauseMinutes} Min.`
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              {entry.duration 
                                ? formatDuration(entry.duration)
                                : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Keine Daten</AlertTitle>
                      <AlertDescription>
                        Keine Zeiteinträge für den ausgewählten Zeitraum vorhanden.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="vacation">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Urlaubskonto {selectedYear}</CardTitle>
                  <CardDescription>
                    Übersicht über Ihr Urlaubskontingent
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {vacationBalance ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Gesamtanspruch</p>
                          <p className="text-2xl font-bold">{vacationBalance.totalDays + (vacationBalance.carryOverDays || 0)} Tage</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Verwendet</p>
                          <p className="text-2xl font-bold">{vacationBalance.usedDays} Tage</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Ausstehend</p>
                          <p className="text-2xl font-bold">{vacationBalance.pendingDays} Tage</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground">Übertrag</p>
                          <p className="text-2xl font-bold">{vacationBalance.carryOverDays || 0} Tage</p>
                        </div>
                      </div>
                      <div className="h-40 mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={vacationData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                              nameKey="name"
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                            >
                              {vacationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 mt-1">
                        <Progress 
                          value={progress} 
                          className={`h-2 ${progress > 90 ? 'bg-orange-200' : ''}`}
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>0</span>
                          <span>{vacationBalance.totalDays + (vacationBalance.carryOverDays || 0)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Keine Daten</AlertTitle>
                      <AlertDescription>
                        Keine Urlaubsdaten für das ausgewählte Jahr verfügbar.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            {isAdmin && (
              <TabsContent value="overview">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Mitarbeiter-Übersicht</CardTitle>
                    <CardDescription>
                      Übersicht über alle Mitarbeiter-Zeitkonten
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    ) : (
                      <>
                        <div className="rounded-md border mb-6">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Mitarbeiter</TableHead>
                                <TableHead>Soll</TableHead>
                                <TableHead>Ist</TableHead>
                                <TableHead>Saldo</TableHead>
                                <TableHead>Urlaub</TableHead>
                                <TableHead>Aktionen</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {/* Hier würden wir in einer erweiterten Version alle Mitarbeiter anzeigen */}
                              <TableRow>
                                <TableCell className="font-medium">{currentUsername}</TableCell>
                                <TableCell>
                                  {formatDuration(targetHours)}
                                </TableCell>
                                <TableCell>{formatDuration(timeSourceBreakdown.total)}</TableCell>
                                <TableCell className={
                                  (timeSourceBreakdown.total - targetHours) >= 0 
                                    ? 'text-green-600' 
                                    : 'text-red-600'
                                }>
                                  {
                                    (timeSourceBreakdown.total - targetHours) >= 0 
                                      ? '+' 
                                      : ''
                                  }
                                  {formatDuration(timeSourceBreakdown.total - targetHours)}
                                </TableCell>
                                <TableCell>
                                  {vacationBalance ? `${vacationBalance.usedDays}/${vacationBalance.totalDays}` : "-/-"}
                                </TableCell>
                                <TableCell>
                                  <Button variant="outline" size="sm" onClick={() => exportTimeReport()}>
                                    Export
                                  </Button>
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                        
                        <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200">
                          <h3 className="font-medium text-sm text-yellow-800 mb-2">Hinweis</h3>
                          <p className="text-sm text-yellow-700">
                            In dieser Ansicht können Sie Zeitkonten aller Mitarbeiter einsehen und verwalten.
                            Um detaillierte Zeitkonten eines Mitarbeiters anzuzeigen, wählen Sie den entsprechenden 
                            Mitarbeiter aus der Liste aus.
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default TimeAccount; 