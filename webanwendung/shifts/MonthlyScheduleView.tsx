import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Users,
  RefreshCw,
  CalendarDays,
  RotateCw,
  ArrowLeftIcon,
  Plus,
  Edit2,
  Sunrise,
  Sunset,
  Moon,
  Trash2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonthlySchedule, WeeklySchedule, Shift } from "@/types/shifts";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  parseISO,
  getDay,
  isWeekend,
  addDays,
  formatISO,
  startOfWeek,
  isWithinInterval,
  endOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { Absence, AbsenceType } from "@/types/absence";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MonthlyScheduleViewProps {
  role: "admin" | "manager" | "employee";
  onCreateShift: (date: string) => void;
  onEditShift: (shift: Shift) => void;
  onDeleteShift?: (shiftId: string) => void;
  shifts?: Shift[];
  onAcceptShift?: (shiftId: string) => void;
  onDeclineShift?: (shiftId: string) => void;
  userAbsences?: Absence[];
  teamAbsences?: Absence[];
}

const MonthlyScheduleView: React.FC<MonthlyScheduleViewProps> = ({
  role,
  onCreateShift,
  onEditShift,
  onDeleteShift,
  shifts = [],
  onAcceptShift,
  onDeclineShift,
  userAbsences = [],
  teamAbsences = []
}) => {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [monthSchedule, setMonthSchedule] = useState<MonthlySchedule | null>(null);
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"month" | "day" | "list">("month");
  const [showAbsences, setShowAbsences] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Kombiniere alle Abwesenheiten basierend auf der Benutzerrolle
  const allAbsences = role === "admin" || role === "manager" 
    ? teamAbsences 
    : userAbsences;

  // Monatsdaten laden
  useEffect(() => {
    loadMonthlySchedule();
  }, [currentDate, user, shifts]);

  // Monatsdaten laden
  const loadMonthlySchedule = () => {
    setLoading(true);

    // Wenn externe Schichten übergeben wurden, diese verwenden
    if (shifts.length > 0) {
      const firstDayOfMonth = startOfMonth(currentDate);
      const lastDayOfMonth = endOfMonth(currentDate);
      
      // Filtere Schichten im aktuellen Monat
      const monthShifts = shifts.filter(shift => {
        const shiftDate = new Date(shift.date);
        return isWithinInterval(shiftDate, { start: firstDayOfMonth, end: lastDayOfMonth });
      });
      
      // Erstelle Wochenpläne
      const weekStarts: Date[] = [];
      let day = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 });
      
      // Finde die Anfänge aller Wochen im Monat
      while (day <= lastDayOfMonth) {
        weekStarts.push(day);
        day = addDays(day, 7);
      }
      
      // Erstelle Wochenpläne
      const mockWeeklySchedules: WeeklySchedule[] = [];
      
      // Für jede Woche Schichten extrahieren
      weekStarts.forEach((weekStart, weekIndex) => {
        const weekEnd = addDays(weekStart, 6);
        
        // Filtere Schichten für diese Woche
        const weekShifts = monthShifts.filter(shift => {
          const shiftDate = new Date(shift.date);
          return isWithinInterval(shiftDate, { start: weekStart, end: weekEnd });
        });
        
        // Wochenplan erstellen
        const weeklySchedule: WeeklySchedule = {
          id: `week_${weekIndex}`,
          startDate: format(weekStart, "yyyy-MM-dd"),
          endDate: format(weekEnd, "yyyy-MM-dd"),
          shifts: weekShifts,
          status: "published",
          createdBy: "system",
          createdAt: new Date().toISOString(),
        };
        
        mockWeeklySchedules.push(weeklySchedule);
      });
      
      // Monatsplan erstellen
      const mockMonthSchedule: MonthlySchedule = {
        id: `month_${currentDate.getFullYear()}_${currentDate.getMonth()}`,
        year: currentDate.getFullYear(),
        month: currentDate.getMonth(),
        weeklySchedules: mockWeeklySchedules,
        status: "published",
        createdBy: "system",
        createdAt: new Date().toISOString(),
      };
      
      setMonthSchedule(mockMonthSchedule);
      setWeeklySchedules(mockWeeklySchedules);
      setAllShifts(monthShifts);
      setLoading(false);
      return;
    }

    // Mock-Daten für die Demonstration laden
    setTimeout(() => {
      // 4 Wochen innerhalb des Monats generieren
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      
      const mockWeeklySchedules: WeeklySchedule[] = [];
      const allShifts: Shift[] = [];
      
      // Alle Tage des Monats durchlaufen
      const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const weekStarts: Date[] = [];
      
      // Montag der ersten Woche finden (kann im vorherigen Monat sein)
      let firstMonday = monthStart;
      while (getDay(firstMonday) !== 1) {
        firstMonday = addDays(firstMonday, -1);
      }
      
      // Vier Wochen ab dem ersten Montag generieren
      for (let i = 0; i < 5; i++) {
        const weekStart = addDays(firstMonday, i * 7);
        if (isSameMonth(weekStart, monthStart) || isSameMonth(addDays(weekStart, 6), monthStart)) {
          weekStarts.push(weekStart);
        }
      }
      
      // Für jede Woche Schichten generieren
      weekStarts.forEach((weekStart, weekIndex) => {
        const weekEnd = addDays(weekStart, 6);
        const weekShifts: Shift[] = [];
        
        // Zufällige Anzahl von Schichten pro Woche
        const shiftsCount = Math.floor(Math.random() * 10) + 5;
        
        for (let i = 0; i < shiftsCount; i++) {
          // Zufälligen Tag in der Woche wählen
          const randomDay = Math.floor(Math.random() * 7);
          const shiftDate = addDays(weekStart, randomDay);
          
          // Schicht nur erstellen, wenn der Tag im aktuellen Monat liegt
          if (isSameMonth(shiftDate, currentDate)) {
            const isWeekendDay = isWeekend(shiftDate);
            const shiftTypes = isWeekendDay 
              ? ["Wochenendschicht", "Sonderschicht"] 
              : ["Frühschicht", "Spätschicht", "Nachtschicht"];
            
            const randomShiftType = shiftTypes[Math.floor(Math.random() * shiftTypes.length)];
            let startTime = "";
            let endTime = "";
            
            // Zeiten basierend auf Schichttyp festlegen
            switch (randomShiftType) {
              case "Frühschicht":
                startTime = "06:00";
                endTime = "14:00";
                break;
              case "Spätschicht":
                startTime = "14:00";
                endTime = "22:00";
                break;
              case "Nachtschicht":
                startTime = "22:00";
                endTime = "06:00";
                break;
              case "Wochenendschicht":
                startTime = "10:00";
                endTime = "18:00";
                break;
              case "Sonderschicht":
                startTime = "12:00";
                endTime = "20:00";
                break;
            }
            
            // Zufällige Benutzer zuweisen (inkl. aktuellem Benutzer für einige Schichten)
            const assignCurrentUser = Math.random() > 0.7;
            const assignedUsers = [];
            
            if (assignCurrentUser && user?.uid) {
              assignedUsers.push({
                userId: user.uid,
                userName: user.displayName || "Aktueller Benutzer",
                status: ["accepted", "pending", "assigned"][Math.floor(Math.random() * 3)] as any,
                notes: "",
              });
            }
            
            // Weitere zufällige Benutzer
            const userCount = Math.floor(Math.random() * 3) + 1;
            const userNames = ["Max Mustermann", "Anna Schmidt", "Thomas Weber", "Laura Müller", "Sabine Fischer"];
            
            for (let j = 0; j < userCount; j++) {
              const randomUserId = `user${Math.floor(Math.random() * 10) + 1}`;
              if (!assignedUsers.some(u => u.userId === randomUserId)) {
                assignedUsers.push({
                  userId: randomUserId,
                  userName: userNames[Math.floor(Math.random() * userNames.length)],
                  status: ["accepted", "pending", "declined", "assigned"][Math.floor(Math.random() * 4)] as any,
                  notes: "",
                });
              }
            }
            
            const shift: Shift = {
              id: `shift_${weekIndex}_${i}`,
              title: randomShiftType,
              date: format(shiftDate, "yyyy-MM-dd"),
              startTime,
              endTime,
              assignedUsers,
              createdBy: "admin1",
              createdAt: new Date().toISOString(),
              notes: "",
            };
            
            weekShifts.push(shift);
            allShifts.push(shift);
          }
        }
        
        // Wochenplan erstellen
        const weeklySchedule: WeeklySchedule = {
          id: `week_${weekIndex}`,
          startDate: format(weekStart, "yyyy-MM-dd"),
          endDate: format(weekEnd, "yyyy-MM-dd"),
          shifts: weekShifts,
          status: "published",
          createdBy: "admin1",
          createdAt: new Date().toISOString(),
        };
        
        mockWeeklySchedules.push(weeklySchedule);
      });
      
      // Monatsplan erstellen
      const mockMonthSchedule: MonthlySchedule = {
        id: `month_${currentDate.getFullYear()}_${currentDate.getMonth()}`,
        year: currentDate.getFullYear(),
        month: currentDate.getMonth(),
        weeklySchedules: mockWeeklySchedules,
        status: "published",
        createdBy: "admin1",
        createdAt: new Date().toISOString(),
      };
      
      setMonthSchedule(mockMonthSchedule);
      setWeeklySchedules(mockWeeklySchedules);
      setAllShifts(allShifts);
      setLoading(false);
    }, 1000);
  };

  // Zum vorherigen Monat wechseln
  const handlePreviousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  // Zum nächsten Monat wechseln
  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  // Zum aktuellen Monat wechseln
  const handleCurrentMonth = () => {
    setCurrentDate(new Date());
  };

  // Bestimme die Farbe basierend auf dem Schichttyp
  const getShiftColor = (shift: Shift) => {
    if (shift.title.includes("Früh")) return "#e3f2fd";
    if (shift.title.includes("Mittag")) return "#e8f5e9";
    if (shift.title.includes("Abend")) return "#f3e5f5";
    if (shift.title.includes("Spät")) return "#fff8e1";
    if (shift.title.includes("Bar")) return "#ffebee";
    if (shift.title.includes("Küche")) return "#e0f2f1";
    if (shift.title.includes("Service")) return "#f1f8e9";
    return "#e2e8f0"; // Standard grau
  };

  // Filtere die tatsächlich anzuzeigenden Schichten
  const displayShifts = shifts.length > 0 ? shifts : allShifts;

  // Filtere Schichten nach Status für Listenansicht
  const filteredShifts = displayShifts.filter(shift => {
    if (filterStatus === "all") return true;
    
    // Wenn ein bestimmter Status ausgewählt ist, filtere Schichten, die mindestens eine Zuweisung mit diesem Status haben
    return shift.assignedUsers.some(assignment => {
      if (filterStatus === "assigned") return assignment.status === "assigned";
      if (filterStatus === "accepted") return assignment.status === "accepted";
      if (filterStatus === "pending") return assignment.status === "pending";
      if (filterStatus === "declined") return assignment.status === "declined";
      return true;
    });
  });

  // Schichten für einen bestimmten Tag anzeigen
  const getShiftsForDay = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    return displayShifts.filter(shift => shift.date === dayStr);
  };

  // Abwesenheiten für einen bestimmten Tag abrufen
  const getAbsencesForDay = (day: Date) => {
    return allAbsences.filter(absence => {
      if (!showAbsences) return false;
      const startDate = new Date(absence.startDate);
      const endDate = new Date(absence.endDate);
      return day >= startDate && day <= endDate;
    });
  };

  // Schicht-Icon basierend auf Schichttyp
  const getShiftIcon = (shiftTitle: string) => {
    if (shiftTitle.includes("Früh")) return <Sunrise className="h-3 w-3 mr-1" />;
    if (shiftTitle.includes("Spät")) return <Sunset className="h-3 w-3 mr-1" />;
    if (shiftTitle.includes("Nacht")) return <Moon className="h-3 w-3 mr-1" />;
    return <Clock className="h-3 w-3 mr-1" />;
  };

  // Bestimme, ob der Benutzer eine Schicht bearbeiten kann
  const canEditShift = (shift: Shift, role: string, userId?: string) => {
    if (role === "admin" || role === "manager") return true;
    // Mitarbeiter können keine Schichten bearbeiten
    return false;
  };

  // Schriftfarbe basierend auf Hintergrundfarbe bestimmen
  const getTextColor = (bgColor: string) => {
    // Konvertiere HEX zu RGB
    const r = parseInt(bgColor.substr(1, 2), 16);
    const g = parseInt(bgColor.substr(3, 2), 16);
    const b = parseInt(bgColor.substr(5, 2), 16);
    
    // Berechne Helligkeit (YIQ-Formel)
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // Verwende weiße Schrift bei dunklen Hintergründen
    return (yiq >= 150) ? '#000000' : '#ffffff';
  };

  // Kalenderansicht - Tage im Monat
  const renderMonth = () => {
    const firstDayOfMonth = startOfMonth(currentDate);
    const lastDayOfMonth = endOfMonth(currentDate);
    const startWeek = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 });
    const endWeek = endOfWeek(lastDayOfMonth, { weekStartsOn: 1 });
    
    const days = [];
    let day = startWeek;
    
    // Tage der Woche im Header
    const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
    
    // Kalender aufbauen
    while (day <= endWeek) {
      days.push(day);
      day = addDays(day, 1);
    }
    
    // 7 Tage pro Woche
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    
    return (
      <div className="mt-4">
        <div className="rounded-md border overflow-hidden">
          {/* Wochentage-Header */}
          <div className="grid grid-cols-7 bg-slate-100">
            {weekdays.map((day, index) => (
              <div key={index} className="p-2 text-center font-medium">
                {day}
              </div>
            ))}
          </div>
          
          {/* Kalender */}
          <div className="bg-white">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((day, dayIndex) => {
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isToday = isSameDay(day, new Date());
                  const dayShifts = getShiftsForDay(day);
                  const dayAbsences = getAbsencesForDay(day);
                  const hasAbsence = dayAbsences.length > 0;
                  
                  // Benutzerspezifische Abwesenheit
                  const userAbsence = dayAbsences.find(absence => absence.userId === user?.uid);
                  
                  // Überprüfen, ob der aktuelle Benutzer an diesem Tag eine Schicht hat
                  const hasUserShift = dayShifts.some(shift => 
                    shift.assignedUsers.some(assignment => assignment.userId === user?.uid)
                  );
                  
                  return (
                    <div 
                      key={dayIndex} 
                      className={`
                        min-h-[120px] border p-1 relative
                        ${!isCurrentMonth ? "bg-gray-50 opacity-50" : ""}
                        ${isToday ? "ring-2 ring-primary ring-inset" : ""}
                        ${isWeekend(day) ? "bg-slate-50" : ""}
                        ${hasAbsence ? "bg-gradient-to-br from-orange-50" : ""}
                        cursor-pointer hover:bg-slate-50 transition-colors
                      `}
                      onClick={() => {
                        if (role === "admin" || role === "manager") {
                          const dateStr = format(day, "yyyy-MM-dd");
                          onCreateShift(dateStr);
                        }
                      }}
                    >
                      <div className={`
                        text-right p-1 font-medium text-sm
                        ${isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center ml-auto" : ""}
                      `}>
                        {format(day, "d")}
                      </div>
                      
                      {/* Abwesenheiten anzeigen */}
                      {hasAbsence && (
                        <div className="absolute top-0 right-0 mt-1 mr-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                              </TooltipTrigger>
                              <TooltipContent side="right">
                                <div className="text-xs p-1">
                                  <div className="font-bold">Abwesenheiten:</div>
                                  <ul className="list-disc list-inside">
                                    {dayAbsences.map(absence => (
                                      <li key={absence.id}>
                                        {absence.userName} - 
                                        {String(absence.type) === 'vacation'
                                          ? " Urlaub" 
                                          : String(absence.type) === 'sick'
                                            ? " Krank" 
                                            : " Abwesend"}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                      
                      {/* Schichten für diesen Tag anzeigen */}
                      <div className="space-y-1 mt-1">
                        {dayShifts.slice(0, 3).map((shift, idx) => {
                          // Finde die Zuweisung für den aktuellen Benutzer
                          const userAssignment = shift.assignedUsers.find(
                            a => a.userId === user?.uid
                          );
                          
                          // Bestimme die Farbe basierend auf Status oder Schichttyp
                          let bgColor = "#e2e8f0"; // Standard: grau
                          
                          if (userAssignment) {
                            switch (userAssignment.status) {
                              case "accepted":
                                bgColor = "#10b981"; // grün
                                break;
                              case "pending":
                                bgColor = "#f59e0b"; // gelb
                                break;
                              case "declined":
                                bgColor = "#ef4444"; // rot
                                break;
                              default:
                                bgColor = "#3b82f6"; // blau
                            }
                          }
                          
                          // Schichttyp-basierte Farbe, falls keine Benutzerzuweisung
                          if (!userAssignment) {
                            if (shift.title.includes("Früh")) bgColor = "#0ea5e9"; // Sky blue
                            else if (shift.title.includes("Mittag")) bgColor = "#10b981"; // Green
                            else if (shift.title.includes("Abend")) bgColor = "#8b5cf6"; // Purple
                            else if (shift.title.includes("Spät")) bgColor = "#f97316"; // Orange
                            else if (shift.title.includes("Bar")) bgColor = "#ec4899"; // Pink
                            else if (shift.title.includes("Küche")) bgColor = "#84cc16"; // Lime
                            else if (shift.title.includes("Service")) bgColor = "#06b6d4"; // Cyan
                            else if (shift.title.includes("Nacht")) bgColor = "#6366f1"; // Indigo
                          }
                          
                          return (
                            <TooltipProvider key={shift.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div 
                                    className={`
                                      text-xs px-1 py-0.5 rounded truncate flex items-center
                                      ${userAssignment ? "font-medium" : ""}
                                    `}
                                    style={{ backgroundColor: bgColor, color: getTextColor(bgColor) }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (canEditShift(shift, role, user?.uid)) {
                                        onEditShift(shift);
                                      }
                                    }}
                                  >
                                    {getShiftIcon(shift.title)}
                                    <span className="truncate">{shift.title}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-xs">
                                  <div className="text-sm">
                                    <div className="font-bold">{shift.title}</div>
                                    <div>Zeit: {shift.startTime} - {shift.endTime}</div>
                                    <div className="mt-1">Mitarbeiter: {shift.assignedUsers.length}</div>
                                    {userAssignment && (
                                      <div className="mt-1">
                                        Status: {userAssignment.status === "accepted" ? "Akzeptiert" :
                                                 userAssignment.status === "declined" ? "Abgelehnt" :
                                                 userAssignment.status === "pending" ? "Ausstehend" :
                                                 "Zugewiesen"}
                                      </div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })}
                        
                        {/* Wenn es mehr als 3 Schichten gibt, zeige +X an */}
                        {dayShifts.length > 3 && (
                          <div className="text-xs text-center text-slate-500 bg-slate-100 rounded py-0.5">
                            +{dayShifts.length - 3} weitere
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="w-full shadow-sm border-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Monatsplan</CardTitle>
          <CardDescription>
            {format(currentDate, "MMMM yyyy", { locale: de })}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" onClick={handlePreviousMonth}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {format(subMonths(currentDate, 1), "MMM", { locale: de })}
          </Button>
          <Button variant="outline" size="sm" onClick={handleCurrentMonth}>
            Aktueller Monat
          </Button>
          <Button variant="outline" size="sm" onClick={handleNextMonth}>
            {format(addMonths(currentDate, 1), "MMM", { locale: de })}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowAbsences(!showAbsences)}
            className={showAbsences ? "bg-orange-50" : ""}
          >
            {showAbsences ? "Urlaub ausblenden" : "Urlaub anzeigen"}
          </Button>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "month" | "day" | "list")}>
            <TabsList>
              <TabsTrigger value="month">Monat</TabsTrigger>
              <TabsTrigger value="day">Tag</TabsTrigger>
              <TabsTrigger value="list">Liste</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <span className="animate-spin mr-2">
            <RefreshCw size={20} />
          </span>
          Lade Schichtplan...
        </div>
      ) : (
        <CardContent>
          {viewMode === "month" && renderMonth()}
          
          {viewMode === "day" && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium">
                  {format(selectedDate || new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
                </h3>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate || new Date(), -1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
                    Heute
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedDate(addDays(selectedDate || new Date(), 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Abwesenheiten für den ausgewählten Tag */}
              {showAbsences && getAbsencesForDay(selectedDate || new Date()).length > 0 && (
                <div className="mb-4 p-3 bg-orange-50 rounded-md border border-orange-100">
                  <h4 className="font-medium text-orange-800 mb-2">Abwesenheiten</h4>
                  <div className="space-y-1">
                    {getAbsencesForDay(selectedDate || new Date()).map(absence => (
                      <div key={absence.id} className="flex items-center text-sm text-orange-700">
                        <span className="w-4 h-4 bg-orange-200 rounded-full mr-2"></span>
                        <span>{absence.userName} - </span>
                        <span className="font-medium ml-1">
                          {String(absence.type) === 'vacation'
                            ? "Urlaub" 
                            : String(absence.type) === 'sick'
                              ? "Krank" 
                              : "Abwesend"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Schichten für den ausgewählten Tag */}
              <div className="space-y-3">
                {getShiftsForDay(selectedDate || new Date()).length === 0 ? (
                  <div className="text-center p-8 bg-slate-50 rounded-md">
                    <p className="text-slate-500">Keine Schichten für diesen Tag.</p>
                    {(role === "admin" || role === "manager") && (
                      <Button 
                        variant="outline" 
                        className="mt-2"
                        onClick={() => onCreateShift(format(selectedDate || new Date(), "yyyy-MM-dd"))}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Schicht hinzufügen
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {getShiftsForDay(selectedDate || new Date()).map(shift => {
                      // Finde die Zuweisung für den aktuellen Benutzer
                      const userAssignment = shift.assignedUsers.find(
                        a => a.userId === user?.uid
                      );
                      
                      return (
                        <Card key={shift.id} className="overflow-hidden hover:shadow-sm transition-shadow">
                          <CardHeader className="p-3 bg-slate-50">
                            <CardTitle className="text-base flex justify-between items-center">
                              <span className="flex items-center">
                                {getShiftIcon(shift.title)} {shift.title}
                              </span>
                              {userAssignment && (
                                <Badge className={
                                  userAssignment.status === "accepted" ? "bg-green-500" :
                                  userAssignment.status === "declined" ? "bg-red-500" :
                                  userAssignment.status === "pending" ? "bg-yellow-500" :
                                  "bg-blue-500"
                                }>
                                  {userAssignment.status === "accepted" ? "Akzeptiert" :
                                   userAssignment.status === "declined" ? "Abgelehnt" :
                                   userAssignment.status === "pending" ? "Ausstehend" :
                                   "Zugewiesen"}
                                </Badge>
                              )}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-3">
                            <div className="text-sm space-y-1">
                              <div className="flex items-center">
                                <Clock className="h-4 w-4 mr-1 text-muted-foreground" />
                                <span>
                                  {shift.startTime} - {shift.endTime}
                                </span>
                              </div>
                              <div className="flex items-center">
                                <Users className="h-4 w-4 mr-1 text-muted-foreground" />
                                <span>
                                  {shift.assignedUsers.length} Mitarbeiter
                                </span>
                              </div>
                              {shift.notes && (
                                <div className="text-muted-foreground mt-2">
                                  {shift.notes}
                                </div>
                              )}
                            </div>
                            
                            {/* Aktionsbuttons für Mitarbeiter */}
                            {userAssignment && userAssignment.status === "pending" && 
                             role === "employee" && onAcceptShift && onDeclineShift && (
                              <div className="flex justify-between mt-3 pt-2 border-t">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="flex-1 mr-1 bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                                  onClick={() => onDeclineShift(shift.id)}
                                >
                                  Ablehnen
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="flex-1 ml-1 bg-green-50 hover:bg-green-100 text-green-600 border-green-200"
                                  onClick={() => onAcceptShift(shift.id)}
                                >
                                  Annehmen
                                </Button>
                              </div>
                            )}
                            
                            {/* Bearbeitungsbutton für Admins/Manager */}
                            {(role === "admin" || role === "manager") && (
                              <div className="mt-3 pt-2 border-t">
                                <div className="flex space-x-1 mt-1">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 px-2 text-xs" 
                                    onClick={() => onEditShift(shift)}
                                  >
                                    <Edit2 className="h-3 w-3 mr-1" /> Bearbeiten
                                  </Button>
                                  {onDeleteShift && (
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="h-7 px-2 text-xs border-red-500 text-red-500 hover:bg-red-50" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteShift(shift.id);
                                      }}
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" /> Löschen
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
          
          {viewMode === "list" && (
            <div>
              <div className="mb-4 flex justify-between items-center">
                <h3 className="text-lg font-medium">
                  Alle Schichten im {format(currentDate, "MMMM yyyy", { locale: de })}
                </h3>
                <Select
                  value={filterStatus}
                  onValueChange={value => setFilterStatus(value)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Alle Schichten" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Schichten</SelectItem>
                    <SelectItem value="assigned">Zugewiesen</SelectItem>
                    <SelectItem value="accepted">Akzeptiert</SelectItem>
                    <SelectItem value="pending">Ausstehend</SelectItem>
                    <SelectItem value="declined">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-3">
                {filteredShifts.length === 0 ? (
                  <div className="text-center p-8 bg-slate-50 rounded-md">
                    <p className="text-slate-500">Keine Schichten für den ausgewählten Filter.</p>
                  </div>
                ) : (
                  filteredShifts.map(shift => {
                    // Finde die Zuweisung für den aktuellen Benutzer
                    const userAssignment = shift.assignedUsers.find(
                      a => a.userId === user?.uid
                    );
                    
                    return (
                      <Card key={shift.id} className="overflow-hidden hover:shadow-sm transition-shadow">
                        <CardHeader className="p-3 bg-slate-50">
                          <CardTitle className="text-base flex justify-between items-center">
                            <span className="flex items-center">
                              {getShiftIcon(shift.title)} {shift.title}
                            </span>
                            {userAssignment && (
                              <Badge className={
                                userAssignment.status === "accepted" ? "bg-green-500" :
                                userAssignment.status === "declined" ? "bg-red-500" :
                                userAssignment.status === "pending" ? "bg-yellow-500" :
                                "bg-blue-500"
                              }>
                                {userAssignment.status === "accepted" ? "Akzeptiert" :
                                 userAssignment.status === "declined" ? "Abgelehnt" :
                                 userAssignment.status === "pending" ? "Ausstehend" :
                                 "Zugewiesen"}
                              </Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3">
                          <div className="text-sm space-y-1">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                              <span>
                                {format(new Date(shift.date), "EEEE, d. MMMM", { locale: de })}
                              </span>
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1 text-muted-foreground" />
                              <span>
                                {shift.startTime} - {shift.endTime}
                              </span>
                            </div>
                            <div className="flex items-center">
                              <Users className="h-4 w-4 mr-1 text-muted-foreground" />
                              <span>
                                {shift.assignedUsers.length} Mitarbeiter
                              </span>
                            </div>
                          </div>
                          
                          {/* Aktionsbuttons für Mitarbeiter */}
                          {userAssignment && userAssignment.status === "pending" && 
                           role === "employee" && onAcceptShift && onDeclineShift && (
                            <div className="flex justify-between mt-3 pt-2 border-t">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="flex-1 mr-1 bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                                onClick={() => onDeclineShift(shift.id)}
                              >
                                Ablehnen
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="flex-1 ml-1 bg-green-50 hover:bg-green-100 text-green-600 border-green-200"
                                onClick={() => onAcceptShift(shift.id)}
                              >
                                Annehmen
                              </Button>
                            </div>
                          )}
                          
                          {/* Bearbeitungsbutton für Admins/Manager */}
                          {(role === "admin" || role === "manager") && (
                            <div className="mt-3 pt-2 border-t">
                              <div className="flex space-x-1 mt-1">
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-7 px-2 text-xs" 
                                  onClick={() => onEditShift(shift)}
                                >
                                  <Edit2 className="h-3 w-3 mr-1" /> Bearbeiten
                                </Button>
                                {onDeleteShift && (
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 px-2 text-xs border-red-500 text-red-500 hover:bg-red-50" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteShift(shift.id);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" /> Löschen
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default MonthlyScheduleView; 