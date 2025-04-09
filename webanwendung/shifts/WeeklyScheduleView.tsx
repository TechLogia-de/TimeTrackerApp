import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Edit2, 
  Trash2, 
  Users, 
  AlertCircle,
  RefreshCw,
  Save,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarIcon,
  ChevronsLeft,
  ChevronsRight,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  XCircle,
  CheckCircle
} from "lucide-react";
import { WeeklySchedule, Shift, ShiftAssignment } from "@/types/shifts";
import { useAuth } from "@/lib/hooks/useAuth";
import { 
  format, 
  addDays, 
  startOfWeek, 
  endOfWeek, 
  parseISO, 
  isWithinInterval, 
  isSameDay, 
  isWeekend,
  differenceInHours,
  differenceInMinutes,
  addMinutes
} from "date-fns";
import { de } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Absence, AbsenceType } from "@/types/absence";

interface WeeklyScheduleViewProps {
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

const WeekView = ({ 
  weekDays, 
  role, 
  shifts, 
  onCreateShift, 
  onEditShift,
  onDeleteShift,
  absences = [],
  onDayClick
}: { 
  weekDays: Date[]; 
  role: string;
  shifts: Shift[];
  onCreateShift: (date: string) => void;
  onEditShift: (shift: Shift) => void;
  onDeleteShift?: (shiftId: string) => void;
  absences?: Absence[];
  onDayClick: (day: Date) => void;
}) => {
  const { user } = useAuth();
  
  // Zeitintervalle für das Raster (30-Minuten-Schritte für mehr Präzision)
  const timeSlots = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2).toString().padStart(2, "0");
    const minute = i % 2 === 0 ? "00" : "30";
    return `${hour}:${minute}`;
  });
  
  // Bekomme alle Schichten für einen Tag, inkl. Schichten vom Vortag, die über Mitternacht gehen
  const getShiftsForDay = (day: Date) => {
    const dayStr = format(day, "yyyy-MM-dd");
    
    // Normale Schichten, die an diesem Tag beginnen
    const startingShifts = shifts.filter(shift => shift.date === dayStr);
    
    // Schichten vom Vortag, die über Mitternacht gehen
    const prevDayStr = format(addDays(day, -1), "yyyy-MM-dd");
    const overnightShifts = shifts.filter(shift => {
      if (shift.date !== prevDayStr) return false;
      
      // Prüfen, ob die Schicht über Mitternacht geht
      const startHour = parseInt(shift.startTime.split(':')[0]);
      const endHour = parseInt(shift.endTime.split(':')[0]);
      const endMinute = parseInt(shift.endTime.split(':')[1]);
      
      // Wenn die Endzeit früher als die Startzeit ist oder Endzeit ist 00:00, dann geht die Schicht über Mitternacht
      return (endHour < startHour) || (endHour === 0 && endMinute === 0);
    });
    
    // Alle Schichten zusammenführen
    return [...startingShifts, ...overnightShifts];
  };
  
  // Abwesenheiten für einen bestimmten Tag abrufen
  const getAbsencesForDay = (day: Date) => {
    return absences.filter(absence => {
      const startDate = new Date(absence.startDate);
      const endDate = new Date(absence.endDate);
      return day >= startDate && day <= endDate;
    });
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
  
  // Schicht-Icon basierend auf Schichttyp
  const getShiftIcon = (shiftTitle: string) => {
    if (shiftTitle.includes("Früh")) return <Sunrise className="h-3 w-3 mr-1" />;
    if (shiftTitle.includes("Spät")) return <Sunset className="h-3 w-3 mr-1" />;
    if (shiftTitle.includes("Nacht")) return <Moon className="h-3 w-3 mr-1" />;
    return <Clock className="h-3 w-3 mr-1" />;
  };
  
  // Status-Badge für Schichtzuweisungen
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "accepted":
        return <Badge className="bg-green-500 text-xs">Akzeptiert</Badge>;
      case "declined":
        return <Badge className="bg-red-500 text-xs">Abgelehnt</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500 text-xs">Ausstehend</Badge>;
      case "assigned":
        return <Badge className="bg-blue-500 text-xs">Zugewiesen</Badge>;
      default:
        return <Badge className="bg-gray-500 text-xs">{status}</Badge>;
    }
  };
  
  // Bestimme, ob der Benutzer eine Schicht bearbeiten kann
  const canEditShift = (shift: Shift) => {
    if (role === "admin" || role === "manager") return true;
    // Mitarbeiter können keine Schichten mehr bearbeiten
    return false;
  };
  
  // Raster-Layout
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        {/* Wochentage Header */}
        <div className="grid grid-cols-8 gap-1">
          <div className="col-span-1"></div>
          {weekDays.map((day, index) => {
            const isToday = isSameDay(day, new Date());
            const dayName = format(day, "EEE", { locale: de });
            const dayDate = format(day, "dd.MM", { locale: de });
            
            return (
              <div key={index} className="col-span-1">
                <div 
                  className={`text-center py-1 rounded-t-md ${isToday ? "bg-primary text-primary-foreground" : "bg-accent"} 
                    cursor-pointer hover:bg-primary/80 hover:text-primary-foreground transition-colors`}
                  onClick={() => onDayClick(day)}
                >
                  <div className="font-bold">{dayName}</div>
                  <div className="text-xs">{dayDate}</div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Zeitraster */}
        <div className="grid grid-cols-8 gap-1">
          {/* Zeitachse */}
          <div className="col-span-1">
            {timeSlots.filter((_, index) => index % 2 === 0).map((time, index) => (
              <div key={index} className="h-14 border-t flex items-center justify-center text-sm text-gray-500">
                {time}
              </div>
            ))}
          </div>
          
          {/* Tage */}
          {weekDays.map((day, dayIndex) => {
            const dayShifts = getShiftsForDay(day);
            const dayAbsences = getAbsencesForDay(day);
            
            return (
              <div 
                key={dayIndex} 
                className={`col-span-1 relative ${role === "admin" || role === "manager" ? "cursor-pointer" : ""}`}
                onClick={() => {
                  // Für alle Benutzertypen: Umschalten zur Tagesansicht
                  onDayClick(day);
                }}
              >
                {/* Zeitraster-Streifen */}
                {timeSlots.filter((_, index) => index % 2 === 0).map((_, timeIndex) => (
                  <div 
                    key={timeIndex} 
                    className={`h-14 border-t relative ${
                      isWeekend(day) ? "bg-slate-50" : ""
                    }`}
                  >
                    {/* Halbstündliche Unterteilungen */}
                    <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-gray-100"></div>
                  </div>
                ))}
                
                {/* Urlaub/Abwesenheiten als Hintergrund anzeigen */}
                {dayAbsences.map(absence => (
                  <div
                    key={absence.id}
                    className="absolute left-0 right-0 bg-orange-100 bg-opacity-50 z-0"
                    style={{
                      top: "0rem",
                      height: `${timeSlots.filter((_, index) => index % 2 === 0).length * 3.5}rem`
                    }}
                  >
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="transform -rotate-90 whitespace-nowrap text-xs text-orange-600 font-medium">
                        {absence.type === AbsenceType.VACATION
                          ? "Urlaub" 
                          : absence.type === AbsenceType.SICK
                            ? "Krank" 
                            : "Abwesend"} - {absence.userName}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Schichten */}
                {dayShifts.map(shift => {
                  // Position und Größe der Schicht berechnen
                  const startHour = parseInt(shift.startTime.split(':')[0]);
                  const startMinute = parseInt(shift.startTime.split(':')[1]);
                  const endHour = parseInt(shift.endTime.split(':')[0]);
                  const endMinute = parseInt(shift.endTime.split(':')[1]);
                  
                  // Bestimmen, ob die Schicht vom Vortag ist und über Mitternacht geht
                  const isOvernightFromPrevDay = shift.date !== format(day, "yyyy-MM-dd");
                  
                  // Höhe und Position für Schicht über Mitternacht
                  let startOffset;
                  let totalSpan;
                  
                  if (isOvernightFromPrevDay) {
                    // Für Schichten vom Vortag: von 00:00 Uhr bis zur Endzeit anzeigen
                    startOffset = 0; // Beginne um 00:00 Uhr
                    totalSpan = endHour + (endMinute / 60); // Dauer bis zur Endzeit
                  } else {
                    // Wenn endHour < startHour, dann ist es eine Schicht über Mitternacht
                    const hoursSpan = endHour < startHour 
                      ? (24 - startHour) + endHour 
                      : endHour - startHour;
                      
                    startOffset = startHour + (startMinute / 60);
                    totalSpan = hoursSpan + ((endMinute - startMinute) / 60);
                  }
                  
                  // Position von oben basierend auf Startzeit
                  const topOffset = startOffset * 3.5; // 3.5rem pro Stunde (14px * 2 Halbstunden)
                  // Höhe basierend auf Dauer
                  const height = totalSpan * 3.5;
                  
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
                  
                  // Für Schichten vom Vortag etwas transparenter machen
                  const opacity = isOvernightFromPrevDay ? "90" : "";
                  const finalBgColor = bgColor + opacity;
                  
                  const textColor = getTextColor(bgColor);
                  const shiftIcon = getShiftIcon(shift.title);
                  
                  return (
                    <TooltipProvider key={`${shift.id}${isOvernightFromPrevDay ? '_next' : ''}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute left-0 right-0 mx-1 rounded-md shadow-sm overflow-hidden cursor-pointer border transition-all hover:shadow-md z-10"
                            style={{
                              top: `${topOffset}rem`,
                              height: `${height}rem`,
                              backgroundColor: finalBgColor,
                              color: textColor,
                              zIndex: userAssignment ? 20 : 10,
                              borderStyle: isOvernightFromPrevDay ? "dashed" : "solid"
                            }}
                            onClick={(e) => {
                              e.stopPropagation(); // Verhindere Bubbling zum Tag-Container
                              if (canEditShift(shift)) {
                                onEditShift(shift);
                              }
                            }}
                          >
                            <div className="p-2 text-xs">
                              <div className="font-bold truncate flex items-center">
                                {shiftIcon} {shift.title}
                                {isOvernightFromPrevDay && <span className="ml-1 text-xs opacity-70">(Fortsetzung)</span>}
                              </div>
                              <div className="truncate">
                                {isOvernightFromPrevDay ? "00:00" : shift.startTime} - {shift.endTime}
                              </div>
                              {shift.assignedUsers.length > 0 && (
                                <div className="mt-1 truncate flex items-center">
                                  <Users className="h-3 w-3 mr-1" /> {shift.assignedUsers.length}
                                </div>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="text-sm">
                            <div className="font-bold">{shift.title}</div>
                            <div>{format(new Date(shift.date), "EEEE, dd.MM.yyyy", { locale: de })}</div>
                            <div>Zeit: {shift.startTime} - {shift.endTime}</div>
                            {isOvernightFromPrevDay && (
                              <div className="text-xs text-slate-500">
                                Diese Schicht beginnt am Vortag und geht über Mitternacht.
                              </div>
                            )}
                            
                            {shift.approvalDeadline && (
                              <div className={`mt-1 text-xs rounded py-0.5 px-1 inline-flex items-center
                                ${new Date(shift.approvalDeadline) < new Date(new Date().setDate(new Date().getDate() + 2)) 
                                  ? "bg-red-50 text-red-600" 
                                  : "bg-amber-50 text-amber-600"}`}
                              >
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Genehmigung bis: {format(new Date(shift.approvalDeadline), "dd.MM.yyyy", { locale: de })}
                              </div>
                            )}
                            
                            <div className="mt-1">Mitarbeiter:</div>
                            <ul className="list-disc list-inside">
                              {shift.assignedUsers.map(user => (
                                <li key={user.userId} className="flex items-center justify-between">
                                  <span>{user.userName}</span>
                                  {renderStatusBadge(user.status)}
                                </li>
                              ))}
                            </ul>
                            
                            {(role === 'admin' || role === 'manager') && (
                              <div className="mt-2 flex space-x-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="text-xs flex items-center" 
                                  onClick={(e) => { 
                                    e.stopPropagation();
                                    onEditShift(shift);
                                  }}
                                >
                                  <Edit2 className="h-3 w-3 mr-1" /> Bearbeiten
                                </Button>
                                {onDeleteShift && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="text-xs flex items-center border-red-500 text-red-500 hover:bg-red-50" 
                                    onClick={(e) => { 
                                      e.stopPropagation();
                                      onDeleteShift(shift.id);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" /> Löschen
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const WeeklyScheduleView: React.FC<WeeklyScheduleViewProps> = ({
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
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState<boolean>(false);
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule | null>(null);
  const [localShifts, setLocalShifts] = useState<Shift[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showAbsences, setShowAbsences] = useState<boolean>(true);

  // Kombiniere alle Abwesenheiten basierend auf der Benutzerrolle
  const allAbsences = role === "admin" || role === "manager" 
    ? teamAbsences 
    : userAbsences;

  // Lade die Schichten für die aktuelle Woche
  useEffect(() => {
    loadWeeklySchedule();
  }, [weekStart, shifts]);

  // Lädt den Wochenplan
  const loadWeeklySchedule = () => {
    setLoading(true);

    // Wenn Schichten von außen übergeben wurden, diese filtern
    if (shifts.length > 0) {
      const weekEnd = addDays(weekStart, 6);
      const startDateStr = format(weekStart, "yyyy-MM-dd");
      const endDateStr = format(weekEnd, "yyyy-MM-dd");
      
      // Filtere Schichten im aktuellen Wochenzeitraum
      const weekShifts = shifts.filter(shift => {
        const shiftDate = new Date(shift.date);
        return shiftDate >= weekStart && shiftDate <= weekEnd;
      });
      
      // Erstelle einen Wochenplan mit den gefilterten Schichten
      const schedule: WeeklySchedule = {
        id: `week_${startDateStr}_${endDateStr}`,
        startDate: startDateStr,
        endDate: endDateStr,
        shifts: weekShifts,
        status: 'published',
        createdBy: "system",
        createdAt: new Date().toISOString()
      };
      
      setWeeklySchedule(schedule);
      setLocalShifts(weekShifts);
      setLoading(false);
      return;
    }

    // Wenn keine Schichten übergeben wurden, Mock-Daten anzeigen (Fallback)
    // Mock-Daten für die Demonstration
    setTimeout(() => {
      const mockShifts: Shift[] = [
        {
          id: "shift1",
          title: "Frühschicht",
          startTime: "06:00",
          endTime: "14:00",
          date: format(addDays(weekStart, 1), "yyyy-MM-dd"), // Dienstag
          assignedUsers: [
            { userId: "user1", userName: "Max Mustermann", status: "accepted", notes: "" },
            { userId: "user2", userName: "Anna Schmidt", status: "pending", notes: "" },
          ],
          createdBy: "admin1",
          createdAt: new Date().toISOString(),
          approvalDeadline: format(addDays(weekStart, 0), "yyyy-MM-dd"), // Frist: Montag
        },
        {
          id: "shift2",
          title: "Spätschicht",
          startTime: "14:00",
          endTime: "22:00",
          date: format(addDays(weekStart, 1), "yyyy-MM-dd"), // Dienstag
          assignedUsers: [
            { userId: "user3", userName: "Thomas Weber", status: "accepted", notes: "" },
            { userId: "user4", userName: "Laura Müller", status: "declined", notes: "Krank" },
          ],
          createdBy: "admin1",
          createdAt: new Date().toISOString(),
          approvalDeadline: format(addDays(weekStart, 0), "yyyy-MM-dd"), // Frist: Montag
        },
        {
          id: "shift3",
          title: "Frühschicht",
          startTime: "06:00",
          endTime: "14:00",
          date: format(addDays(weekStart, 2), "yyyy-MM-dd"), // Mittwoch
          assignedUsers: [
            { userId: "user1", userName: "Max Mustermann", status: "accepted", notes: "" },
            { userId: "user5", userName: "Sabine Fischer", status: "accepted", notes: "" },
          ],
          createdBy: "admin1",
          createdAt: new Date().toISOString(),
          approvalDeadline: format(addDays(weekStart, 1), "yyyy-MM-dd"), // Frist: Dienstag
        },
        {
          id: "shift4",
          title: "Spätschicht",
          startTime: "14:00",
          endTime: "22:00",
          date: format(addDays(weekStart, 3), "yyyy-MM-dd"), // Donnerstag
          assignedUsers: [
            { userId: user?.uid || "user1", userName: user?.displayName || "Max Mustermann", status: "assigned", notes: "" },
          ],
          createdBy: "admin1",
          createdAt: new Date().toISOString(),
          approvalDeadline: format(addDays(new Date(), 1), "yyyy-MM-dd"), // Frist: Morgen
        },
        {
          id: "shift5",
          title: "Nachtschicht",
          startTime: "22:00",
          endTime: "06:00",
          date: format(addDays(weekStart, 4), "yyyy-MM-dd"), // Freitag
          assignedUsers: [
            { userId: "user2", userName: "Anna Schmidt", status: "accepted", notes: "" },
          ],
          createdBy: "admin1",
          createdAt: new Date().toISOString(),
          approvalDeadline: format(addDays(weekStart, 3), "yyyy-MM-dd"), // Frist: Donnerstag
        },
      ];

      // Wochenplan erstellen
      const mockWeekSchedule: WeeklySchedule = {
        id: `week_${weekStart.getTime()}`,
        startDate: format(weekStart, "yyyy-MM-dd"),
        endDate: format(addDays(weekStart, 6), "yyyy-MM-dd"),
        shifts: mockShifts,
        status: "published",
        createdBy: "admin1",
        createdAt: new Date().toISOString(),
      };

      setWeeklySchedule(mockWeekSchedule);
      setLocalShifts(mockShifts);
      setLoading(false);
    }, 1000);
  };

  const handlePreviousWeek = () => {
    const newWeekStart = addDays(weekStart, -7);
    setWeekStart(newWeekStart);
  };

  const handleNextWeek = () => {
    const newWeekStart = addDays(weekStart, 7);
    setWeekStart(newWeekStart);
  };

  const handleCurrentWeek = () => {
    const newWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    setWeekStart(newWeekStart);
  };
  
  // Navigation zum Vormonat
  const handlePreviousMonth = () => {
    const newWeekStart = addDays(weekStart, -28);
    setWeekStart(newWeekStart);
  };

  // Navigation zum nächsten Monat
  const handleNextMonth = () => {
    const newWeekStart = addDays(weekStart, 28);
    setWeekStart(newWeekStart);
  };

  // Wochentage erstellen
  const weekDays = Array.from({ length: 7 }, (_, i) => 
    addDays(weekStart, i)
  );
  
  // Filtere die tatsächlich anzuzeigenden Schichten
  const displayShifts = shifts.length > 0 ? shifts : localShifts;

  // Funktion zum Umschalten zur Tagesansicht
  const switchToDayView = (day: Date) => {
    setSelectedDay(day);
    setViewMode("day");
  };

  // Funktion zum Zurückkehren zur Wochenansicht
  const switchToWeekView = () => {
    setViewMode("week");
    setSelectedDay(null);
  };

  // Komponente für die Tagesansicht
  const DayView = ({ day }: { day: Date }) => {
    // Schichten für diesen Tag abrufen
    const dayStr = format(day, "yyyy-MM-dd");
    const dayShifts = displayShifts.filter(shift => {
      // Normale Schichten, die an diesem Tag beginnen
      if (shift.date === dayStr) return true;
      
      // Schichten vom Vortag, die über Mitternacht gehen
      const prevDayStr = format(addDays(day, -1), "yyyy-MM-dd");
      if (shift.date === prevDayStr) {
        const startHour = parseInt(shift.startTime.split(':')[0]);
        const endHour = parseInt(shift.endTime.split(':')[0]);
        const endMinute = parseInt(shift.endTime.split(':')[1]);
        
        // Wenn die Endzeit früher als die Startzeit ist oder Endzeit ist 00:00, 
        // dann geht die Schicht über Mitternacht
        return (endHour < startHour) || (endHour === 0 && endMinute === 0);
      }
      
      return false;
    });
    
    // Abwesenheiten für diesen Tag abrufen
    const dayAbsences = allAbsences.filter(absence => {
      if (!showAbsences) return false;
      const startDate = new Date(absence.startDate);
      const endDate = new Date(absence.endDate);
      return day >= startDate && day <= endDate;
    });
    
    // Status-Badge für Schichtzuweisungen
    const renderStatusBadge = (status: string) => {
      switch (status) {
        case "accepted":
          return <Badge className="bg-green-500 text-xs">Akzeptiert</Badge>;
        case "declined":
          return <Badge className="bg-red-500 text-xs">Abgelehnt</Badge>;
        case "pending":
          return <Badge className="bg-yellow-500 text-xs">Ausstehend</Badge>;
        case "assigned":
          return <Badge className="bg-blue-500 text-xs">Zugewiesen</Badge>;
        default:
          return <Badge className="bg-gray-500 text-xs">{status}</Badge>;
      }
    };
    
    // Bestimme, ob der Benutzer eine Schicht bearbeiten kann
    const canEditShift = (shift: Shift) => {
      if (role === "admin" || role === "manager") return true;
      // Mitarbeiter können keine Schichten mehr bearbeiten
      return false;
    };
    
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={switchToWeekView}
            className="flex items-center"
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Zurück zur Wochenansicht
          </Button>
          
          <h2 className="text-xl font-semibold">
            {format(day, "EEEE, d. MMMM yyyy", { locale: de })}
          </h2>
          
          {role === "admin" || role === "manager" ? (
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => onCreateShift(format(day, "yyyy-MM-dd"))}
              className="flex items-center"
            >
              <Plus className="h-4 w-4 mr-1" /> Neue Schicht
            </Button>
          ) : <div />}
        </div>
        
        {dayAbsences.length > 0 && (
          <div className="mb-4 bg-orange-50 border border-orange-100 rounded-md p-4">
            <h3 className="font-medium mb-2 text-orange-800">Abwesenheiten an diesem Tag</h3>
            <div className="space-y-2">
              {dayAbsences.map(absence => (
                <div key={absence.id} className="flex items-center text-sm text-orange-700">
                  <div className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center mr-2">
                    {absence.userName.substring(0, 1).toUpperCase()}
                  </div>
                  <span className="font-medium">{absence.userName}</span>
                  <span className="mx-2">-</span>
                  <span>
                    {absence.type === AbsenceType.VACATION
                      ? "Urlaub" 
                      : absence.type === AbsenceType.SICK
                        ? "Krank" 
                        : "Abwesend"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {dayShifts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {dayShifts.map(shift => {
              // Prüfen, ob die Schicht vom Vortag ist und über Mitternacht geht
              const isOvernightFromPrevDay = shift.date !== dayStr;
              
              // Zuweisung für aktuellen Benutzer finden (falls vorhanden)
              const userAssignment = shift.assignedUsers.find(
                a => a.userId === user?.uid
              );
              
              // Bestimme die Farbe basierend auf Status oder Schichttyp
              let bgColor = "bg-slate-100 hover:bg-slate-200"; // Standard: grau
              
              if (userAssignment) {
                switch (userAssignment.status) {
                  case "accepted":
                    bgColor = "bg-green-50 hover:bg-green-100"; // grün
                    break;
                  case "pending":
                    bgColor = "bg-amber-50 hover:bg-amber-100"; // gelb
                    break;
                  case "declined":
                    bgColor = "bg-red-50 hover:bg-red-100"; // rot
                    break;
                  default:
                    bgColor = "bg-blue-50 hover:bg-blue-100"; // blau
                }
              }
              
              return (
                <div 
                  key={shift.id} 
                  className={`p-4 rounded-lg shadow-sm ${bgColor} transition-colors cursor-pointer`}
                  onClick={() => canEditShift(shift) ? onEditShift(shift) : undefined}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold flex items-center">
                        {shift.title.includes("Früh") ? <Sunrise className="h-4 w-4 mr-1" /> :
                         shift.title.includes("Spät") ? <Sunset className="h-4 w-4 mr-1" /> :
                         shift.title.includes("Nacht") ? <Moon className="h-4 w-4 mr-1" /> :
                         <Clock className="h-4 w-4 mr-1" />}
                        {shift.title}
                        {isOvernightFromPrevDay && <span className="ml-2 text-xs text-slate-500">(Fortsetzung vom Vortag)</span>}
                      </h3>
                      <p className="text-sm mt-1 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {shift.startTime} - {shift.endTime}
                        {isOvernightFromPrevDay && " (00:00 - " + shift.endTime + " an diesem Tag)"}
                      </p>
                    </div>
                    
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
                  </div>
                  
                  {shift.notes && (
                    <div className="mt-2 text-sm text-slate-600 bg-white p-2 rounded">
                      {shift.notes}
                    </div>
                  )}
                  
                  <div className="mt-3 pt-3 border-t">
                    <h4 className="text-sm font-medium mb-2">Zugewiesene Mitarbeiter:</h4>
                    <div className="space-y-1">
                      {shift.assignedUsers.map(user => (
                        <div key={user.userId} className="flex items-center justify-between text-sm">
                          <div className="flex items-center">
                            <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center mr-2 text-xs">
                              {user.userName.substring(0, 1).toUpperCase()}
                            </div>
                            <span>{user.userName}</span>
                          </div>
                          {renderStatusBadge(user.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {(role === "admin" || role === "manager") && (
                    <div className="mt-3 pt-3 border-t flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex items-center" 
                        onClick={(e) => { 
                          e.stopPropagation();
                          onEditShift(shift);
                        }}
                      >
                        <Edit2 className="h-3 w-3 mr-1" /> Bearbeiten
                      </Button>
                      {onDeleteShift && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex items-center border-red-500 text-red-500 hover:bg-red-50" 
                          onClick={(e) => { 
                            e.stopPropagation();
                            onDeleteShift(shift.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Löschen
                        </Button>
                      )}
                    </div>
                  )}
                  
                  {userAssignment && userAssignment.status === "pending" && onAcceptShift && onDeclineShift && (
                    <div className="mt-3 pt-3 border-t">
                      {shift.approvalDeadline && (
                        <div className={`text-xs rounded py-1 px-2 mb-2 flex items-center
                          ${new Date(shift.approvalDeadline) < new Date(new Date().setDate(new Date().getDate() + 2)) 
                            ? "bg-red-50 text-red-600 border border-red-200" 
                            : "bg-amber-50 text-amber-600 border border-amber-200"}`}
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Antwort bis: {format(new Date(shift.approvalDeadline), "dd.MM.yyyy", { locale: de })}
                        </div>
                      )}
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeclineShift(shift.id);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-1" /> Ablehnen
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1 bg-green-50 hover:bg-green-100 text-green-600 border-green-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAcceptShift(shift.id);
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" /> Annehmen
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 bg-slate-50 rounded-lg text-center text-slate-500">
            <Clock className="h-12 w-12 mx-auto mb-3 text-slate-300" />
            <p className="text-lg font-medium mb-1">Keine Schichten geplant</p>
            <p>Für diesen Tag sind keine Schichten eingetragen.</p>
            {(role === "admin" || role === "manager") && (
              <Button 
                variant="default" 
                className="mt-4" 
                onClick={() => onCreateShift(format(day, "yyyy-MM-dd"))}
              >
                <Plus className="h-4 w-4 mr-1" /> Schicht hinzufügen
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Verbesserte Navigation */}
      <div className="bg-white rounded-lg shadow-sm p-3 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex items-center space-x-1">
          <Button variant="outline" size="icon" onClick={handlePreviousMonth} title="Vorheriger Monat">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handlePreviousWeek} title="Vorherige Woche">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="default" onClick={handleCurrentWeek} className="px-3">
            Aktuelle Woche
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextWeek} title="Nächste Woche">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNextMonth} title="Nächster Monat">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="text-lg font-medium">
          {viewMode === "week" 
            ? `${format(weekStart, "dd.MM.yyyy", { locale: de })} - ${format(addDays(weekStart, 6), "dd.MM.yyyy", { locale: de })}`
            : format(selectedDay || new Date(), "EEEE, dd.MM.yyyy", { locale: de })
          }
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowAbsences(!showAbsences)}
            className={showAbsences ? "bg-orange-50" : ""}
          >
            {showAbsences ? "Urlaub ausblenden" : "Urlaub anzeigen"}
          </Button>
          
          {viewMode === "week" && (role === "admin" || role === "manager") ? (
            <Button variant="default" onClick={() => onCreateShift(format(new Date(), "yyyy-MM-dd"))}>
              <Plus className="h-4 w-4 mr-2" />
              Neue Schicht
            </Button>
          ) : null}
        </div>
      </div>
      
      {loading ? (
        <div className="h-96 flex items-center justify-center bg-white rounded-lg shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Schichtplan wird geladen...</span>
        </div>
      ) : (
        <Card className="shadow-sm border-0">
          <CardContent className="p-4 overflow-hidden rounded-lg">
            {viewMode === "week" ? (
              <WeekView 
                weekDays={weekDays} 
                role={role} 
                shifts={displayShifts} 
                onCreateShift={onCreateShift}
                onEditShift={onEditShift}
                onDeleteShift={onDeleteShift}
                absences={showAbsences ? allAbsences : []}
                onDayClick={switchToDayView}
              />
            ) : selectedDay && (
              <DayView day={selectedDay} />
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Aktuelle Schichten des Benutzers (nur in Wochenansicht anzeigen) */}
      {viewMode === "week" && role === "employee" && user && (
        <div className="mt-8">
          <h3 className="text-lg font-medium mb-4">Meine Schichten in dieser Woche</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayShifts
              .filter(shift => {
                // Filtere Schichten für die aktuelle Woche
                const shiftDate = new Date(shift.date);
                return (
                  shiftDate >= weekStart && 
                  shiftDate <= addDays(weekStart, 6) && 
                  shift.assignedUsers.some(a => a.userId === user?.uid)
                );
              })
              .map(shift => {
                const userAssignment = shift.assignedUsers.find(a => a.userId === user?.uid);
                return (
                  <Card key={shift.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardHeader className="p-3 bg-slate-50">
                      <CardTitle className="text-base flex justify-between items-center">
                        <span className="flex items-center">
                          {shift.title.includes("Früh") ? <Sunrise className="h-3 w-3 mr-1" /> :
                           shift.title.includes("Spät") ? <Sunset className="h-3 w-3 mr-1" /> :
                           shift.title.includes("Nacht") ? <Moon className="h-3 w-3 mr-1" /> :
                           <Clock className="h-3 w-3 mr-1" />} {shift.title}
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
                          <CalendarIcon className="h-4 w-4 mr-1 text-muted-foreground" />
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
                        {shift.notes && (
                          <div className="text-muted-foreground mt-2">
                            {shift.notes}
                          </div>
                        )}
                      </div>
                      
                      {userAssignment && userAssignment.status === "pending" && onAcceptShift && onDeclineShift && (
                        <div className="flex flex-col gap-2 mt-3 pt-2 border-t">
                          {shift.approvalDeadline && (
                            <div className={`text-xs rounded py-1 px-2 flex items-center justify-center
                              ${new Date(shift.approvalDeadline) < new Date(new Date().setDate(new Date().getDate() + 2)) 
                                ? "bg-red-50 text-red-600 border border-red-200" 
                                : "bg-amber-50 text-amber-600 border border-amber-200"}`}
                            >
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Antwort bis: {format(new Date(shift.approvalDeadline), "dd.MM.yyyy", { locale: de })}
                            </div>
                          )}
                          <div className="flex justify-between">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1 mr-1 bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                              onClick={() => onDeclineShift(shift.id)}
                            >
                              <XCircle className="h-4 w-4 mr-1" /> Ablehnen
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1 ml-1 bg-green-50 hover:bg-green-100 text-green-600 border-green-200"
                              onClick={() => onAcceptShift(shift.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" /> Annehmen
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            
            {displayShifts.filter(
              shift => {
                const shiftDate = new Date(shift.date);
                return (
                  shiftDate >= weekStart && 
                  shiftDate <= addDays(weekStart, 6) && 
                  shift.assignedUsers.some(a => a.userId === user?.uid)
                );
              }
            ).length === 0 && (
              <div className="col-span-full p-4 bg-slate-50 rounded text-center text-slate-500">
                Keine Schichten für diese Woche zugewiesen.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeeklyScheduleView; 