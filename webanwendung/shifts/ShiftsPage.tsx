import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  Calendar as CalendarIcon, 
  Users, 
  Clock, 
  CalendarDays, 
  BarChart2, 
  ArrowRight, 
  Settings,
  Loader2,
  CheckCircle,
  XCircle
} from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { 
  Shift, 
  Availability, 
  ShiftSwapRequest, 
  ShiftTemplate, 
  WeeklySchedule,
} from "@/types/shifts";
import { User } from "@/types/types";
import WeeklyScheduleView from "./WeeklyScheduleView";
import MonthlyScheduleView from "./MonthlyScheduleView";
import AvailabilityForm from "./AvailabilityForm";
import ShiftForm from "./ShiftForm";
import { useToast } from "@/components/ui/use-toast";
import { ShiftService } from "@/lib/services/shiftService";
import { UserService } from "@/lib/services/userService";
import { AbsenceType, AbsenceStatus, Absence } from "@/types/absence";
import { AbsenceService } from "@/lib/services/absenceService";
import ShiftTemplateManager from "./ShiftTemplateManager";
import ShiftSettings from "./ShiftSettings";

const ShiftsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [userRole, setUserRole] = useState<"employee" | "manager" | "admin">("employee");
  const [activeTab, setActiveTab] = useState<string>("week");
  const [isShiftFormOpen, setIsShiftFormOpen] = useState<boolean>(false);
  const [editingShift, setEditingShift] = useState<Shift | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [userAvailabilities, setUserAvailabilities] = useState<Availability[]>([]);
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userAbsences, setUserAbsences] = useState<Absence[]>([]);
  const [teamAbsences, setTeamAbsences] = useState<Absence[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [initialDataLoaded, setInitialDataLoaded] = useState<boolean>(false);
  const [isShiftSettingsOpen, setIsShiftSettingsOpen] = useState<boolean>(false);

  // Benutzerrolle aus localStorage oder Kontext holen
  useEffect(() => {
    const storedRole = localStorage.getItem("userRole");
    if (storedRole && (storedRole === "admin" || storedRole === "manager" || storedRole === "employee")) {
      setUserRole(storedRole as "admin" | "manager" | "employee");
    }

    // Daten aus der Datenbank laden
    loadInitialData();

    // Echtzeit-Listener für Schichten einrichten
    const unsubscribeShifts = ShiftService.subscribeToShifts((updatedShifts) => {
      console.log("Schichten wurden in Echtzeit aktualisiert", updatedShifts.length);
      
      // Prüfen, ob tatsächlich eine Änderung vorliegt
      let hasChanges = shifts.length !== updatedShifts.length;
      if (!hasChanges) {
        // Prüfen, ob es Änderungen in den vorhandenen Schichten gibt
        const updatedIds = new Set(updatedShifts.map(s => s.id));
        const currentIds = new Set(shifts.map(s => s.id));
        
        // Neue oder gelöschte Schichten erkennen
        if (updatedIds.size !== currentIds.size) {
          hasChanges = true;
        } else {
          // Vergleiche jede Schicht auf Änderungen
          for (const shift of updatedShifts) {
            const oldShift = shifts.find(s => s.id === shift.id);
            if (!oldShift || JSON.stringify(oldShift) !== JSON.stringify(shift)) {
              hasChanges = true;
              break;
            }
          }
        }
      }
      
      // Schichten aktualisieren
      setShifts(updatedShifts);
      
      // Benachrichtigung nur anzeigen, wenn tatsächlich eine Änderung vorliegt,
      // die initiale Datenladung abgeschlossen ist, und nicht zu viele Benachrichtigungen
      // in kurzer Zeit angezeigt werden
      const now = Date.now();
      if (hasChanges && initialDataLoaded && now - lastUpdateTime > 5000) {
        setLastUpdateTime(now);
        toast({
          title: "Schichtplan aktualisiert",
          description: "Es wurden Änderungen am Schichtplan vorgenommen.",
          variant: "default",
        });
      }
    });

    // Echtzeit-Listener für Schichttausch-Anfragen einrichten (falls Benutzer angemeldet)
    let unsubscribeRequests = () => {};
    if (user?.uid) {
      unsubscribeRequests = ShiftService.subscribeToSwapRequests(user.uid, (updatedRequests) => {
        console.log("Schichttausch-Anfragen wurden in Echtzeit aktualisiert", updatedRequests.length);
        
        // Prüfen, ob es neue Anfragen gibt
        const newPendingCount = updatedRequests.filter(r => 
          r.status === "pending" && 
          r.recipientId === user.uid && 
          !swapRequests.some(oldR => oldR.id === r.id && oldR.status === "pending")
        ).length;
        
        setSwapRequests(updatedRequests);
        
        // Benachrichtigung für neue Anfragen anzeigen
        if (newPendingCount > 0 && initialDataLoaded) {
          toast({
            title: "Neue Schichttausch-Anfrage",
            description: `Sie haben ${newPendingCount} neue Anfrage${newPendingCount > 1 ? 'n' : ''} erhalten.`,
            variant: "default",
          });
        }
      });
    }

    // Echtzeit-Listener für Abwesenheiten einrichten
    let unsubscribeAbsences = () => {};
    if (userRole === "admin" || userRole === "manager") {
      unsubscribeAbsences = ShiftService.subscribeToTeamAbsences((updatedAbsences) => {
        console.log("Abwesenheiten wurden in Echtzeit aktualisiert", updatedAbsences.length);
        
        // Abwesenheiten aktualisieren
        setTeamAbsences(updatedAbsences);
        
        // Wenn ein Benutzer angemeldet ist, aktualisiere auch die Benutzerabwesenheiten
        if (user?.uid) {
          const userOwnAbsences = updatedAbsences.filter(absence => absence.userId === user.uid);
          setUserAbsences(userOwnAbsences);
        }
      });
    }

    // Cleanup-Funktion zurückgeben
    return () => {
      // Listener abmelden, wenn die Komponente unmountet wird
      unsubscribeShifts();
      unsubscribeRequests();
      unsubscribeAbsences();
    };
  }, [user, userRole]);

  // Initiale Daten laden (nicht Echtzeit)
  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      // Mitarbeiter laden
      if (userRole === "admin" || userRole === "manager") {
        const users = user?.uid ? await UserService.getAllUsers() : [];
        setAvailableUsers(users);
      }

      // Schichtvorlagen laden
      try {
        // Zuerst versuchen, vorhandene Vorlagen zu laden
        let templates = await ShiftService.getAllShiftTemplates();
        
        // Wenn keine Vorlagen existieren, die Gastronomie-Vorlagen erstellen
        if (templates.length === 0) {
          templates = await ShiftService.createDefaultGastroTemplates();
        }
        
        setShiftTemplates(templates);
      } catch (error) {
        console.error("Fehler beim Laden der Schichtvorlagen:", error);
        setShiftTemplates(createDefaultTemplates());
      }

      // Verfügbarkeiten für den aktuellen Benutzer laden
      if (user?.uid) {
        try {
          const availabilities = await ShiftService.getUserAvailabilities(user.uid);
          setUserAvailabilities(availabilities.length > 0 ? availabilities : createDefaultAvailabilities());
        } catch (error) {
          console.error("Fehler beim Laden der Verfügbarkeiten:", error);
          setUserAvailabilities(createDefaultAvailabilities());
        }
      }

      // Abwesenheiten des Benutzers werden über die Echtzeit-Listener geladen,
      // aber wir initialisieren sie leer, um keine leere Ansicht zu haben
      setUserAbsences([]);
      setTeamAbsences([]);
    } catch (error) {
      console.error("Fehler beim Laden der Daten:", error);
      toast({
        title: "Fehler",
        description: "Die Daten konnten nicht geladen werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setInitialDataLoaded(true); // Markieren, dass die initiale Ladung abgeschlossen ist
    }
  };

  // Aktualisierte loadData-Funktion, die nicht mehr Schichten oder Abwesenheiten lädt
  // (da dies über Echtzeit-Listener erfolgt)
  const loadData = async () => {
    try {
      // Da Schichten, Anfragen und Abwesenheiten über Echtzeit-Listener aktualisiert werden,
      // müssen wir hier nur die Mitarbeiter-Liste aktualisieren
      
      // Mitarbeiter laden (falls Admin oder Manager)
      if ((userRole === "admin" || userRole === "manager") && user?.uid) {
        const users = await UserService.getAllUsers();
        setAvailableUsers(users);
      }
    } catch (error) {
      console.error("Fehler beim Aktualisieren der Mitarbeiterdaten:", error);
      toast({
        title: "Fehler",
        description: "Die Mitarbeiterdaten konnten nicht aktualisiert werden.",
        variant: "destructive",
      });
    }
  };

  // Standard-Schichtvorlagen erstellen
  const createDefaultTemplates = (): ShiftTemplate[] => {
    return [
      { id: "template1", title: "Frühschicht", startTime: "06:00", endTime: "14:00", color: "#e3f2fd" },
      { id: "template2", title: "Spätschicht", startTime: "14:00", endTime: "22:00", color: "#e8f5e9" },
      { id: "template3", title: "Nachtschicht", startTime: "22:00", endTime: "06:00", color: "#f3e5f5" },
      { id: "template4", title: "Wochenendschicht", startTime: "10:00", endTime: "18:00", color: "#fff8e1" },
    ];
  };

  // Standard-Verfügbarkeiten für den aktuellen Benutzer erstellen
  const createDefaultAvailabilities = (): Availability[] => {
    return [
      { 
        id: "avail1", 
        userId: user?.uid || "user1", 
        userName: user?.displayName || "Unbekannter Benutzer", 
        weekDay: 1, 
        startTime: "08:00", 
        endTime: "17:00", 
        recurring: true 
      },
      { 
        id: "avail2", 
        userId: user?.uid || "user1", 
        userName: user?.displayName || "Unbekannter Benutzer", 
        weekDay: 2, 
        startTime: "08:00", 
        endTime: "17:00", 
        recurring: true 
      },
      { 
        id: "avail3", 
        userId: user?.uid || "user1", 
        userName: user?.displayName || "Unbekannter Benutzer", 
        weekDay: 3, 
        startTime: "08:00", 
        endTime: "17:00", 
        recurring: true 
      },
      { 
        id: "avail4", 
        userId: user?.uid || "user1", 
        userName: user?.displayName || "Unbekannter Benutzer", 
        weekDay: 4, 
        startTime: "08:00", 
        endTime: "17:00", 
        recurring: true 
      },
      { 
        id: "avail5", 
        userId: user?.uid || "user1", 
        userName: user?.displayName || "Unbekannter Benutzer", 
        weekDay: 5, 
        startTime: "08:00", 
        endTime: "13:00", 
        recurring: true 
      }
    ];
  };

  // Prüfen, ob ein Benutzer an einem bestimmten Datum verfügbar ist
  const isUserAvailableOnDate = (userId: string, date: Date): boolean => {
    // Prüfen, ob der Benutzer an diesem Tag Urlaub oder andere Abwesenheit hat
    const userHasAbsence = teamAbsences.some(absence => 
      absence.userId === userId &&
      absence.status === AbsenceStatus.APPROVED &&
      new Date(absence.startDate) <= date &&
      new Date(absence.endDate) >= date
    );

    if (userHasAbsence) {
      return false;
    }

    // Wenn keine Abwesenheit, dann ist der Benutzer verfügbar
    return true;
  };

  // Schicht erstellen oder bearbeiten
  const handleShiftFormOpen = (shift?: Shift, date?: string) => {
    // Bei existierenden Schichten aus Mock-Daten eine neue ID zuweisen
    if (shift && shift.id && !shift.id.startsWith('real_')) {
      // Prüfen, ob die ID wahrscheinlich eine Test/Mock-ID ist
      if (shift.id.startsWith('shift') || shift.id.includes('_')) {
        console.log("Mock-Schicht erkannt, neue ID wird für Speicherung verwendet");
        shift = {
          ...shift,
          id: 'new'  // Setze ID auf 'new', damit eine neue Schicht erstellt wird
        };
      }
    }
    
    setEditingShift(shift);
    // Stelle sicher, dass das Datum ein korrektes Format hat (yyyy-MM-dd)
    if (date) {
      // Wenn das Datum ein ISO-String ist, konvertiere es ins erforderliche Format
      if (date.includes('T')) {
        const parsedDate = new Date(date);
        setSelectedDate(`${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`);
      } else {
        setSelectedDate(date);
      }
    } else {
      setSelectedDate(undefined);
    }
    setIsShiftFormOpen(true);
  };

  // Schicht speichern
  const handleSaveShift = async (shift: Shift) => {
    try {
      setIsLoading(true);
      
      // Für Mock-Daten eine neue ID verwenden
      let shiftToSave = {...shift};
      
      if (shiftToSave.id && !shiftToSave.id.startsWith('real_')) {
        // Prüfen, ob die ID wahrscheinlich eine Test/Mock-ID ist
        if (shiftToSave.id.startsWith('shift') || shiftToSave.id.includes('_')) {
          console.log("Mock-Schicht erkannt, wird als neue Schicht gespeichert");
          shiftToSave.id = 'new';
        }
      }
      
      // Finde die bestehende Schicht, falls diese aktualisiert wird
      const oldShift = shiftToSave.id && shiftToSave.id !== 'new' 
        ? shifts.find(s => s.id === shiftToSave.id) 
        : undefined;
      
      // Schicht in der Datenbank speichern und Benachrichtigungen senden
      const shiftId = await ShiftService.saveShiftWithNotifications(shiftToSave, oldShift);
      
      // Aktualisierte Schicht mit neuer ID laden
      const updatedShift = {
        ...shift,
        id: shiftId
      };
      
      // Lokalen Zustand aktualisieren
      if (shift.id && shift.id !== 'new' && !shift.id.startsWith('shift') && !shift.id.includes('_')) {
        // Bestehende Schicht aktualisieren (nur für echte Datenbankeinträge)
        setShifts(shifts.map(s => s.id === shift.id ? updatedShift : s));
      } else {
        // Neue Schicht hinzufügen
        setShifts([...shifts, updatedShift]);
      }
      
      toast({
        title: "Erfolg",
        description: `Die Schicht wurde erfolgreich ${shift.id && shift.id !== 'new' && !shift.id.startsWith('shift') && !shift.id.includes('_') ? 'aktualisiert' : 'erstellt'}.`,
      });
      
      // Daten neu laden, um sicherzustellen, dass wir die neuesten Daten haben
      loadData();
    } catch (error) {
      console.error("Fehler beim Speichern der Schicht:", error);
      toast({
        title: "Fehler",
        description: "Die Schicht konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Verfügbarkeit speichern
  const handleSaveAvailability = async (availabilities: Availability[]) => {
    if (!user?.uid) {
      toast({
        title: "Fehler",
        description: "Benutzer nicht angemeldet.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      // Verfügbarkeiten in der Datenbank speichern
      await ShiftService.saveUserAvailabilities(user.uid, availabilities);
      
      // Lokalen Zustand aktualisieren
      setUserAvailabilities(availabilities);
      
      toast({
        title: "Erfolg",
        description: "Ihre Verfügbarkeiten wurden erfolgreich gespeichert.",
      });
    } catch (error) {
      console.error("Fehler beim Speichern der Verfügbarkeiten:", error);
      toast({
        title: "Fehler",
        description: "Die Verfügbarkeiten konnten nicht gespeichert werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Schicht akzeptieren
  const handleAcceptShift = async (shiftId: string) => {
    try {
      if (!user?.uid) return;
      
      // Schicht finden
      const shiftToUpdate = shifts.find(s => s.id === shiftId);
      if (!shiftToUpdate) {
        throw new Error("Schicht nicht gefunden");
      }
      
      // Kopie der Schicht erstellen, um Änderungen vorzunehmen
      const updatedShift: Shift = {
        ...shiftToUpdate,
        assignedUsers: shiftToUpdate.assignedUsers.map(u => {
          if (u.userId === user.uid) {
            return {
              ...u,
              status: "accepted" as "accepted" | "declined" | "pending" | "assigned"
            };
          }
          return u;
        })
      };
      
      // Schicht speichern mit Benachrichtigungen
      await ShiftService.saveShiftWithNotifications(updatedShift, shiftToUpdate);
      
      toast({
        title: "Erfolg",
        description: "Die Schicht wurde erfolgreich akzeptiert.",
        variant: "default",
      });
      
      // Sende Benachrichtigung an den Schichtplaner, falls vorhanden
      if (shiftToUpdate.createdBy) {
        await ShiftService.createShiftAssignmentNotification(
          updatedShift,
          shiftToUpdate.createdBy,
          user.displayName || "Unbekannt"
        );
      }
      
    } catch (error) {
      console.error("Fehler beim Akzeptieren der Schicht:", error);
      toast({
        title: "Fehler",
        description: "Die Schicht konnte nicht akzeptiert werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    }
  };

  // Schicht ablehnen
  const handleDeclineShift = async (shiftId: string) => {
    try {
      if (!user?.uid) return;
      
      // Schicht finden
      const shiftToUpdate = shifts.find(s => s.id === shiftId);
      if (!shiftToUpdate) {
        throw new Error("Schicht nicht gefunden");
      }
      
      // Kopie der Schicht erstellen, um Änderungen vorzunehmen
      const updatedShift: Shift = {
        ...shiftToUpdate,
        assignedUsers: shiftToUpdate.assignedUsers.map(u => {
          if (u.userId === user.uid) {
            return {
              ...u,
              status: "declined" as "accepted" | "declined" | "pending" | "assigned"
            };
          }
          return u;
        })
      };
      
      // Schicht speichern mit Benachrichtigungen
      await ShiftService.saveShiftWithNotifications(updatedShift, shiftToUpdate);
      
      toast({
        title: "Erfolg",
        description: "Die Schicht wurde erfolgreich abgelehnt.",
        variant: "default",
      });
      
      // Sende Benachrichtigung an den Schichtplaner, falls vorhanden
      if (shiftToUpdate.createdBy) {
        await ShiftService.createShiftAssignmentNotification(
          updatedShift,
          shiftToUpdate.createdBy,
          user.displayName || "Unbekannt"
        );
      }
      
    } catch (error) {
      console.error("Fehler beim Ablehnen der Schicht:", error);
      toast({
        title: "Fehler",
        description: "Die Schicht konnte nicht abgelehnt werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    }
  };

  // Schichttausch-Anfrage beantworten
  const handleSwapRequestResponse = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!user?.uid) {
      toast({
        title: "Fehler",
        description: "Benutzer nicht angemeldet.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      // Anfrage in der Datenbank aktualisieren
      await ShiftService.respondToSwapRequest(
        requestId, 
        status, 
        status === 'approved' ? "Anfrage akzeptiert" : "Anfrage abgelehnt", 
        user.uid
      );
      
      // Lokalen Zustand aktualisieren
      setSwapRequests(swapRequests.map(req => 
        req.id === requestId 
          ? { ...req, status: status === 'approved' ? 'approved' : 'rejected' } 
          : req
      ));
      
      toast({
        title: "Erfolg",
        description: `Die Anfrage wurde erfolgreich ${status === 'approved' ? 'akzeptiert' : 'abgelehnt'}.`,
      });
      
      // Daten neu laden
      loadData();
    } catch (error) {
      console.error("Fehler beim Beantworten der Anfrage:", error);
      toast({
        title: "Fehler",
        description: "Die Anfrage konnte nicht bearbeitet werden. Bitte versuchen Sie es später erneut.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Bereite die Schichtdaten vor, indem Abwesenheiten berücksichtigt werden
  const prepareShiftsWithAbsences = () => {
    // Kopie der Schichten erstellen
    const preparedShifts = [...shifts];
    
    // Bei jedem Benutzer in den Schichten prüfen, ob er an dem Tag verfügbar ist
    for (const shift of preparedShifts) {
      const shiftDate = new Date(shift.date);
      
      // Für jeden zugewiesenen Benutzer prüfen, ob er verfügbar ist
      shift.assignedUsers = shift.assignedUsers.map(assignment => {
        const isAvailable = isUserAvailableOnDate(assignment.userId, shiftDate);
        
        return {
          ...assignment,
          // Wenn der Benutzer nicht verfügbar ist, Status entsprechend setzen
          status: !isAvailable ? 'declined' : assignment.status
        };
      });
    }
    
    return preparedShifts;
  };

  // Vorbereitete Schichten mit Abwesenheiten
  const shiftsWithAbsences = prepareShiftsWithAbsences();

  // Schicht löschen
  const handleDeleteShift = async (shiftId: string) => {
    if (!confirm("Möchten Sie diese Schicht wirklich löschen?")) {
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Schicht löschen - verwendet die verbesserte Funktion mit Benachrichtigungen
      await ShiftService.deleteShift(shiftId);
      
      // Lokalen Zustand aktualisieren
      setShifts(shifts.filter(s => s.id !== shiftId));
      
      toast({
        title: "Erfolg",
        description: "Die Schicht wurde erfolgreich gelöscht.",
        variant: "default",
      });
      
    } catch (error) {
      console.error("Fehler beim Löschen der Schicht:", error);
      toast({
        title: "Fehler",
        description: "Die Schicht konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white p-4 rounded-md shadow-md flex items-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span>Daten werden geladen...</span>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Schichtplanung</h1>
        <div className="flex space-x-2">
          {(userRole === "admin" || userRole === "manager") && (
            <Button onClick={() => {
              const today = new Date();
              const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              handleShiftFormOpen(undefined, formattedDate);
            }}>
              <Clock className="h-4 w-4 mr-2" />
              Neue Schicht erstellen
            </Button>
          )}
          {userRole === "admin" && (
            <Button variant="outline" onClick={() => setIsShiftSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Einstellungen
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Hauptbereich */}
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="week">
                <CalendarIcon className="h-4 w-4 mr-2" /> Wochenplan
              </TabsTrigger>
              <TabsTrigger value="month">
                <CalendarDays className="h-4 w-4 mr-2" /> Monatsplan
              </TabsTrigger>
              {userRole === "employee" && (
                <TabsTrigger value="availability">
                  <Clock className="h-4 w-4 mr-2" /> Meine Verfügbarkeit
                </TabsTrigger>
              )}
              {userRole === "admin" && (
                <TabsTrigger value="templates">
                  <BarChart2 className="h-4 w-4 mr-2" /> Schichtvorlagen
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="week" className="mt-0">
              <WeeklyScheduleView 
                role={userRole}
                onCreateShift={(date) => handleShiftFormOpen(undefined, date)}
                onEditShift={(shift) => handleShiftFormOpen(shift)}
                onDeleteShift={handleDeleteShift}
                shifts={shiftsWithAbsences}
                onAcceptShift={handleAcceptShift}
                onDeclineShift={handleDeclineShift}
                userAbsences={userAbsences}
                teamAbsences={teamAbsences}
              />
            </TabsContent>

            <TabsContent value="month" className="mt-0">
              <MonthlyScheduleView 
                role={userRole}
                onCreateShift={(date) => handleShiftFormOpen(undefined, date)}
                onEditShift={(shift) => handleShiftFormOpen(shift)}
                onDeleteShift={handleDeleteShift}
                shifts={shiftsWithAbsences}
                onAcceptShift={handleAcceptShift}
                onDeclineShift={handleDeclineShift}
                userAbsences={userAbsences}
                teamAbsences={teamAbsences}
              />
            </TabsContent>

            {userRole === "employee" && (
              <TabsContent value="availability" className="mt-0">
                <AvailabilityForm 
                  availabilities={userAvailabilities} 
                  onSave={handleSaveAvailability} 
                />
              </TabsContent>
            )}

            {userRole === "admin" && (
              <TabsContent value="templates" className="mt-0">
                <ShiftTemplateManager 
                  initialTemplates={shiftTemplates}
                  onSave={(newTemplates) => {
                    // Lokalen State aktualisieren
                    setShiftTemplates(newTemplates);
                  }}
                />
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Seitenleiste */}
        <div className="lg:col-span-1">
          <div className="space-y-4">
            {/* Unerledigte Anfragen */}
            {swapRequests.filter(req => 
              (req.status === "pending" && (req.requesterId === user?.uid || req.recipientId === user?.uid))
            ).length > 0 && (
              <div className="border rounded-md p-4">
                <h3 className="font-medium text-lg mb-2">
                  Offene Anfragen
                </h3>
                <div className="space-y-2">
                  {swapRequests
                    .filter(req => req.status === "pending" && (req.requesterId === user?.uid || req.recipientId === user?.uid))
                    .map(request => (
                      <div key={request.id} className="bg-slate-50 p-3 rounded">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-sm">
                              {request.requesterId === user?.uid
                                ? `An: ${request.recipientName}`
                                : `Von: ${request.requesterName}`}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {request.requestNotes}
                            </div>
                          </div>
                          <div className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                            Ausstehend
                          </div>
                        </div>
                        {request.recipientId === user?.uid && (
                          <div className="flex space-x-2 mt-3">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full border-green-500 text-green-500 hover:bg-green-50"
                              onClick={() => handleSwapRequestResponse(request.id, 'approved')}
                            >
                              Akzeptieren
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="w-full border-red-500 text-red-500 hover:bg-red-50"
                              onClick={() => handleSwapRequestResponse(request.id, 'rejected')}
                            >
                              Ablehnen
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Zugewiesene Schichten mit Akzeptieren/Ablehnen-Buttons */}
            {userRole === "employee" && (
              <div className="border rounded-md p-4">
                <h3 className="font-medium text-lg mb-2">
                  Zugewiesene Schichten
                </h3>
                <div className="space-y-2">
                  {shiftsWithAbsences
                    .filter(shift => 
                      shift.assignedUsers.some(assignment => 
                        assignment.userId === user?.uid && 
                        assignment.status === 'assigned'
                      ) &&
                      new Date(shift.date) >= new Date()
                    )
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map(shift => (
                      <div key={shift.id} className="bg-blue-50 p-3 rounded">
                        <div className="font-medium">{shift.title}</div>
                        <div className="text-sm flex items-center mt-1">
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {new Date(shift.date).toLocaleDateString('de-DE', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'numeric', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-sm flex items-center mt-1">
                          <Clock className="h-3 w-3 mr-1" />
                          {shift.startTime} - {shift.endTime}
                        </div>
                        <div className="flex space-x-2 mt-3">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full flex items-center justify-center border-green-500 text-green-500 hover:bg-green-50"
                            onClick={() => handleAcceptShift(shift.id)}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Akzeptieren
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full flex items-center justify-center border-red-500 text-red-500 hover:bg-red-50"
                            onClick={() => handleDeclineShift(shift.id)}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Ablehnen
                          </Button>
                        </div>
                      </div>
                    ))}
                  
                  {shiftsWithAbsences.filter(shift => 
                    shift.assignedUsers.some(assignment => 
                      assignment.userId === user?.uid && 
                      assignment.status === 'assigned'
                    ) &&
                    new Date(shift.date) >= new Date()
                  ).length === 0 && (
                    <div className="text-center p-4 text-slate-500">
                      Keine ausstehenden Schichtzuweisungen.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Kommende Schichten (für Mitarbeiter) */}
            {userRole === "employee" && (
              <div className="border rounded-md p-4">
                <h3 className="font-medium text-lg mb-2">
                  Meine nächsten Schichten
                </h3>
                <div className="space-y-2">
                  {shiftsWithAbsences
                    .filter(shift => 
                      shift.assignedUsers.some(assignment => 
                        assignment.userId === user?.uid && 
                        assignment.status === 'accepted'
                      ) &&
                      new Date(shift.date) >= new Date()
                    )
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .slice(0, 2)
                    .map(shift => (
                      <div key={shift.id} className={`bg-blue-50 p-3 rounded`}>
                        <div className="font-medium">{shift.title}</div>
                        <div className="text-sm flex items-center mt-1">
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {new Date(shift.date).toLocaleDateString('de-DE', { 
                            weekday: 'long', 
                            year: 'numeric', 
                            month: 'numeric', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-sm flex items-center mt-1">
                          <Clock className="h-3 w-3 mr-1" />
                          {shift.startTime} - {shift.endTime}
                        </div>
                      </div>
                    ))}
                  
                  {shiftsWithAbsences.filter(shift => 
                    shift.assignedUsers.some(assignment => 
                      assignment.userId === user?.uid && 
                      assignment.status === 'accepted'
                    ) &&
                    new Date(shift.date) >= new Date()
                  ).length === 0 && (
                    <div className="text-center p-4 text-slate-500">
                      Keine kommenden Schichten geplant.
                    </div>
                  )}
                </div>
                <Button 
                  variant="link" 
                  className="w-full mt-2"
                  onClick={() => setActiveTab("week")}
                >
                  Alle meine Schichten anzeigen
                </Button>
              </div>
            )}

            {/* Abwesenheiten und Urlaub */}
            {userRole === "employee" && userAbsences.length > 0 && (
              <div className="border rounded-md p-4">
                <h3 className="font-medium text-lg mb-2">
                  Meine Abwesenheiten
                </h3>
                <div className="space-y-2">
                  {userAbsences
                    .filter(absence => 
                      new Date(absence.endDate) >= new Date() && 
                      (absence.status === AbsenceStatus.APPROVED || absence.status === AbsenceStatus.PENDING)
                    )
                    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                    .slice(0, 3)
                    .map(absence => (
                      <div key={absence.id} className={`
                        p-3 rounded
                        ${absence.type === AbsenceType.VACATION ? "bg-green-50" : 
                          absence.type === AbsenceType.SICK ? "bg-red-50" : "bg-orange-50"}
                      `}>
                        <div className="font-medium">
                          {absence.type === AbsenceType.VACATION ? "Urlaub" : 
                           absence.type === AbsenceType.SICK ? "Krankheit" : "Sonstige Abwesenheit"}
                        </div>
                        <div className="text-sm flex items-center mt-1">
                          <CalendarIcon className="h-3 w-3 mr-1" />
                          {new Date(absence.startDate).toLocaleDateString('de-DE', { 
                            day: 'numeric', 
                            month: 'numeric'
                          })} - {new Date(absence.endDate).toLocaleDateString('de-DE', { 
                            day: 'numeric', 
                            month: 'numeric', 
                            year: 'numeric' 
                          })}
                        </div>
                        <div className="text-xs mt-1 text-slate-500">
                          Status: {absence.status === AbsenceStatus.APPROVED ? "Genehmigt" : 
                                 absence.status === AbsenceStatus.PENDING ? "Ausstehend" : 
                                 absence.status === AbsenceStatus.REJECTED ? "Abgelehnt" : 
                                 "Unbekannt"}
                        </div>
                      </div>
                    ))}
                  
                  {userAbsences.filter(absence => 
                    new Date(absence.endDate) >= new Date() && 
                    (absence.status === AbsenceStatus.APPROVED || absence.status === AbsenceStatus.PENDING)
                  ).length === 0 && (
                    <div className="text-center p-4 text-slate-500">
                      Keine bevorstehenden Abwesenheiten.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Schicht-Dialog */}
      {isShiftFormOpen && (
        <ShiftForm
          open={isShiftFormOpen}
          onClose={() => setIsShiftFormOpen(false)}
          onSave={handleSaveShift}
          shift={editingShift}
          date={selectedDate}
          availableUsers={availableUsers.filter(user => {
            // Filtere Benutzer basierend auf Verfügbarkeit und Abwesenheiten
            if (selectedDate) {
              const date = new Date(selectedDate);
              return isUserAvailableOnDate(user.id, date);
            }
            return true;
          })}
          shiftTemplates={shiftTemplates}
          role={userRole as "admin" | "manager"}
        />
      )}

      {/* Schichteinstellungen-Dialog */}
      {isShiftSettingsOpen && (
        <ShiftSettings
          open={isShiftSettingsOpen}
          onClose={() => setIsShiftSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default ShiftsPage; 