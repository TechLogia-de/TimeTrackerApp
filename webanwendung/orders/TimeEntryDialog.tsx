import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Order, AssignedUser } from "@/lib/services/orderService";
import { useAuth } from "@/lib/hooks/useAuth";
import { updateUserTimeForOrder, finalizeOrderAsTeamLead } from "./completeOrder";
import { Clock, CheckCircle, Save, Loader2, Calendar, AlarmClock } from "lucide-react";

interface TimeEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onComplete: () => void;
  onOrderUpdated?: () => void;
}

interface TimeEntry {
  startTime: string;
  endTime: string;
  notes: string;
  calculatedMinutes: number;
}

export const TimeEntryDialog = ({
  isOpen,
  onClose,
  order,
  onComplete,
  onOrderUpdated
}: TimeEntryDialogProps) => {
  const { user } = useAuth();
  // Tab "team" ist jetzt standardmäßig aktiv, da nur Teamleiter Zeiten eintragen dürfen
  const [activeTab, setActiveTab] = useState<string>("team");
  const [userTime, setUserTime] = useState<TimeEntry>({
    startTime: formatTimeForInput(new Date(new Date().setHours(9, 0, 0))),
    endTime: formatTimeForInput(new Date(new Date().setHours(17, 0, 0))),
    notes: "",
    calculatedMinutes: 480 // 8 Stunden als Standardwert
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Zustand für Team-Zeiten
  const [teamTimes, setTeamTimes] = useState<Record<string, TimeEntry>>(
    {}
  );
  
  // Hilfsfunktion zum Formatieren der Zeit für Eingabefelder
  function formatTimeForInput(date: Date): string {
    return date.toTimeString().substring(0, 5); // Format: "HH:MM"
  }
  
  // Hilfsfunktion zum Berechnen der Minuten zwischen zwei Zeitpunkten
  function calculateMinutesBetween(startTime: string, endTime: string): number {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    let totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
    
    // Wenn die Endzeit vor der Startzeit ist, nehmen wir an, dass es sich um den nächsten Tag handelt
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60; // Füge einen Tag in Minuten hinzu
    }
    
    return totalMinutes;
  }
  
  // Hilfsfunktion zum Formatieren von Minuten als lesbare Zeit
  function formatMinutesAsTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  
  // Bestimme, ob der aktuelle Benutzer der Teamleiter ist
  const isTeamLead = useMemo(() => {
    if (!order || !user) return false;
    
    return (
      order.assignedUsers?.some(
        (assignedUser) => assignedUser.id === user.uid && assignedUser.isTeamLead
      ) || false
    );
  }, [order, user]);
  
  // Berechne die Zeit basierend auf Start- und Endzeit
  useEffect(() => {
    const calculatedMinutes = calculateMinutesBetween(userTime.startTime, userTime.endTime);
    setUserTime(prev => ({
      ...prev,
      calculatedMinutes
    }));
  }, [userTime.startTime, userTime.endTime]);
  
  // Setze Standardwerte für die Zeiten des Teams, wenn der Auftrag geladen wird
  useEffect(() => {
    if (order && order.assignedUsers) {
      // Setze eigene Zeit
      const currentUserEntry = order.assignedUsers.find(u => u.id === user?.uid);
      if (currentUserEntry) {
        // Wenn bereits eine Zeit erfasst wurde, diese verwenden
        const totalMinutes = currentUserEntry.timeSpent || 0;
        // Berechne Standard-Startzeit als 9 Uhr und Endzeit basierend auf der erfassten Zeit
        const defaultStartDate = new Date();
        defaultStartDate.setHours(9, 0, 0);
        const defaultEndDate = new Date(defaultStartDate);
        defaultEndDate.setMinutes(defaultEndDate.getMinutes() + totalMinutes);
        
        setUserTime({
          startTime: formatTimeForInput(defaultStartDate),
          endTime: formatTimeForInput(defaultEndDate),
          notes: currentUserEntry.timeNotes || "",
          calculatedMinutes: totalMinutes
        });
      } else {
        // Standard-Zeitraum von 9:00 bis 17:00 Uhr (8 Stunden)
        const defaultStartDate = new Date();
        defaultStartDate.setHours(9, 0, 0);
        const defaultEndDate = new Date();
        defaultEndDate.setHours(17, 0, 0);
        
        setUserTime({
          startTime: formatTimeForInput(defaultStartDate),
          endTime: formatTimeForInput(defaultEndDate),
          notes: "",
          calculatedMinutes: 480 // 8 Stunden
        });
      }
      
      // Initialisiere Team-Zeiten
      const initialTeamTimes: Record<string, TimeEntry> = {};
      
      order.assignedUsers.forEach(member => {
        // Wenn bereits Zeit erfasst wurde, diese verwenden
        if (member.timeSpent && member.timeSpent > 0) {
          // Berechne Standard-Startzeit als 9 Uhr und Endzeit basierend auf der erfassten Zeit
          const defaultStartDate = new Date();
          defaultStartDate.setHours(9, 0, 0);
          const defaultEndDate = new Date(defaultStartDate);
          defaultEndDate.setMinutes(defaultEndDate.getMinutes() + member.timeSpent);
          
          initialTeamTimes[member.id] = {
            startTime: formatTimeForInput(defaultStartDate),
            endTime: formatTimeForInput(defaultEndDate),
            notes: member.timeNotes || "",
            calculatedMinutes: member.timeSpent
          };
        } else {
          // Standard-Zeitraum von 9:00 bis 17:00 Uhr (8 Stunden)
          const defaultStartDate = new Date();
          defaultStartDate.setHours(9, 0, 0);
          const defaultEndDate = new Date();
          defaultEndDate.setHours(17, 0, 0);
          
          initialTeamTimes[member.id] = {
            startTime: formatTimeForInput(defaultStartDate),
            endTime: formatTimeForInput(defaultEndDate),
            notes: "",
            calculatedMinutes: 480 // 8 Stunden
          };
        }
      });
      
      setTeamTimes(initialTeamTimes);
    }
  }, [order, user]);
  
  // Aktualisiere die berechneten Minuten für Teammitglieder, wenn sich die Zeiten ändern
  useEffect(() => {
    const updatedTeamTimes = { ...teamTimes };
    let hasChanges = false;
    
    for (const userId in updatedTeamTimes) {
      const entry = updatedTeamTimes[userId];
      const calculatedMinutes = calculateMinutesBetween(entry.startTime, entry.endTime);
      
      if (entry.calculatedMinutes !== calculatedMinutes) {
        updatedTeamTimes[userId] = {
          ...entry,
          calculatedMinutes
        };
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      setTeamTimes(updatedTeamTimes);
    }
  }, [teamTimes]);
  
  // Wechsle standardmäßig zur Team-Ansicht, da nur Teamleiter Zeiten eintragen dürfen
  useEffect(() => {
    setActiveTab("team");
  }, []);
  
  // Handler für die Aktualisierung der Team-Zeiten
  const handleTeamTimeChange = (userId: string, field: 'startTime' | 'endTime' | 'notes', value: string) => {
    setTeamTimes(prev => {
      const updatedEntry = { ...prev[userId], [field]: value };
      
      // Wenn Start- oder Endzeit geändert wird, berechne die Minuten neu
      if (field === 'startTime' || field === 'endTime') {
        updatedEntry.calculatedMinutes = calculateMinutesBetween(
          field === 'startTime' ? value : prev[userId].startTime,
          field === 'endTime' ? value : prev[userId].endTime
        );
      }
      
      return {
        ...prev,
        [userId]: updatedEntry
      };
    });
  };
  
  // Zeit speichern für Einzelbenutzer
  const handleSaveUserTime = async () => {
    if (!user || !order) return;
    
    // Validiere die Eingabe
    if (userTime.calculatedMinutes <= 0) {
      toast({
        title: "Ungültige Zeiteingabe",
        description: "Die Endzeit muss nach der Startzeit liegen.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await updateUserTimeForOrder(
        order.id,
        user.uid,
        userTime.calculatedMinutes,
        userTime.notes
      );
      
      toast({
        title: "Zeit gespeichert",
        description: "Ihre Zeiterfassung wurde erfolgreich gespeichert.",
      });
      
      if (onOrderUpdated) {
        onOrderUpdated();
      }
      
      onClose();
    } catch (error) {
      console.error("Fehler beim Speichern der Zeit:", error);
      toast({
        title: "Fehler",
        description: "Beim Speichern der Zeit ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Auftrag als Teamleiter abschließen
  const handleFinalizeAsTeamLead = async () => {
    if (!user || !order) return;
    
    // Validiere alle Zeiteingaben
    let hasInvalidEntries = false;
    
    for (const [userId, timeData] of Object.entries(teamTimes)) {
      if (timeData.calculatedMinutes <= 0) {
        hasInvalidEntries = true;
        break;
      }
    }
    
    if (hasInvalidEntries) {
      toast({
        title: "Ungültige Zeiteingabe",
        description: "Bitte stellen Sie sicher, dass die Endzeit nach der Startzeit liegt.",
        variant: "destructive"
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Extrahiere die berechneten Minuten für jeden Benutzer
      const consolidatedTimes: Record<string, number> = {};
      const consolidatedNotes: Record<string, string> = {};
      
      Object.entries(teamTimes).forEach(([userId, timeData]) => {
        consolidatedTimes[userId] = timeData.calculatedMinutes;
        consolidatedNotes[userId] = timeData.notes;
      });
      
      await finalizeOrderAsTeamLead(
        order.id,
        user.uid,
        consolidatedTimes,
        consolidatedNotes
      );
      
      toast({
        title: "Auftrag abgeschlossen",
        description: "Der Auftrag wurde erfolgreich als abgeschlossen markiert.",
      });
      
      if (onOrderUpdated) {
        onOrderUpdated();
      }
      
      onComplete();
      onClose();
    } catch (error) {
      console.error("Fehler beim Abschließen des Auftrags:", error);
      toast({
        title: "Fehler",
        description: "Beim Abschließen des Auftrags ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Berechne Gesamtzeit für alle Teammitglieder
  const getTotalTeamTime = (): string => {
    let totalMinutes = 0;
    
    Object.values(teamTimes).forEach(timeData => {
      totalMinutes += timeData.calculatedMinutes;
    });
    
    return formatMinutesAsTime(totalMinutes);
  };
  
  // Prüfe, ob alle erforderlichen Felder ausgefüllt sind
  const isTeamDataComplete = (): boolean => {
    if (!order || !order.assignedUsers) return false;
    
    return order.assignedUsers.every(user => {
      const timeData = teamTimes[user.id];
      // Prüfe, ob Zeitdaten existieren und die berechneten Minuten größer als 0 sind
      return timeData && timeData.calculatedMinutes > 0;
    });
  };
  
  // Erhalte Liste der Teammitglieder ohne Zeiterfassung
  const getMembersWithoutTime = (): string[] => {
    if (!order || !order.assignedUsers) return [];
    
    return order.assignedUsers
      .filter(user => {
        const timeData = teamTimes[user.id];
        return !timeData || timeData.calculatedMinutes <= 0;
      })
      .map(user => user.name);
  };
  
  // Prüfe, ob der Benutzer ein Teamleiter, Manager oder Admin ist
  const canManageTime = useMemo(() => {
    if (!user) return false;
    
    const isAdmin = user.role === "admin";
    const isManager = user.role === "manager";
    
    return isTeamLead || isAdmin || isManager;
  }, [user, isTeamLead]);
  
  if (!order) return null;
  
  // Wenn der Benutzer kein Teamleiter, Manager oder Admin ist, zeige eine Fehlermeldung an
  if (!canManageTime) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keine Berechtigung</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-700">
              Sie haben keine Berechtigung, Zeiten für diesen Auftrag zu erfassen oder zu bearbeiten.
            </p>
            <p className="text-sm text-gray-700 mt-2">
              <strong>Wichtig:</strong> Als normaler Mitarbeiter dürfen Sie keine Zeiten eintragen oder den Auftrag abschließen. Dies kann nur durch den Teamleiter, Manager oder Administrator erfolgen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="default" onClick={onClose}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Zeiterfassung: {order.title}</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="team">
              Team Zeiterfassung 
              {!isTeamDataComplete() && (
                <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
                  !
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          
          {/* Team Zeiterfassung (nur für Teamleiter) */}
          <TabsContent value="team" className="space-y-4">
            <div className="bg-secondary p-3 rounded-md mb-4">
              <p className="text-sm font-medium mb-1">Gesamtzeit: {getTotalTeamTime()}</p>
              <p className="text-xs text-gray-600">
                <strong>Wichtig:</strong> Als Teamleiter müssen Sie für alle Teammitglieder Zeiten eintragen, bevor Sie den Auftrag abschließen können.
              </p>
            </div>
            
            {/* Hinweisbox für den Statusübergang */}
            <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-md mb-4">
              <h3 className="font-medium mb-1">Statusänderung zu "Abgeschlossen"</h3>
              <p className="text-sm">
                Durch Abschließen des Auftrags wird der Status auf "Abgeschlossen" gesetzt und alle erfassten Zeiten 
                werden als Zeiteinträge im System gespeichert.
              </p>
            </div>

            <div className="space-y-6">
              {order.assignedUsers?.map((member) => {
                const timeData = teamTimes[member.id] || { 
                  startTime: "09:00", 
                  endTime: "17:00", 
                  notes: "",
                  calculatedMinutes: 480
                };
                const status = member.status || "pending";
                
                return (
                  <div key={member.id} className="border p-3 rounded-md">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{member.name}</p>
                          {member.isTeamLead && (
                            <span className="text-xs text-blue-500">Teamleiter</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center">
                        {status === "completed" ? (
                          <span className="flex items-center text-xs text-green-500 gap-1">
                            <CheckCircle size={14} />
                            Abgeschlossen
                          </span>
                        ) : status === "accepted" ? (
                          <span className="flex items-center text-xs text-blue-500 gap-1">
                            <Clock size={14} />
                            In Bearbeitung
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">Ausstehend</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <Label htmlFor={`startTime-${member.id}`}>Startzeit</Label>
                        <div className="relative">
                          <Clock className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                          <Input 
                            id={`startTime-${member.id}`} 
                            type="time" 
                            value={timeData.startTime}
                            onChange={(e) => handleTeamTimeChange(
                              member.id, 
                              'startTime', 
                              e.target.value
                            )}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`endTime-${member.id}`}>Endzeit</Label>
                        <div className="relative">
                          <AlarmClock className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
                          <Input 
                            id={`endTime-${member.id}`} 
                            type="time" 
                            value={timeData.endTime}
                            onChange={(e) => handleTeamTimeChange(
                              member.id, 
                              'endTime', 
                              e.target.value
                            )}
                            className="pl-10"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-gray-50 p-2 rounded mb-2">
                      <span className="text-xs font-medium">Berechnete Zeit:</span>
                      <span className="text-sm font-bold ml-2">
                        {formatMinutesAsTime(timeData.calculatedMinutes)}
                      </span>
                    </div>
                    
                    <div>
                      <Label htmlFor={`notes-${member.id}`}>Notizen</Label>
                      <Textarea 
                        id={`notes-${member.id}`} 
                        placeholder="Notizen zur Zeiterfassung..."
                        value={timeData.notes}
                        onChange={(e) => handleTeamTimeChange(
                          member.id, 
                          'notes', 
                          e.target.value
                        )}
                        className="text-sm"
                        rows={2}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mb-4">
              {!isTeamDataComplete() && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 rounded-md mb-4">
                  <h3 className="font-medium mb-1">Achtung: Nicht alle Zeiten erfasst</h3>
                  <p className="text-sm mb-2">
                    Sie müssen für alle Teammitglieder Zeiten erfassen, bevor Sie den Auftrag abschließen können.
                  </p>
                  {getMembersWithoutTime().length > 0 && (
                    <div className="text-sm">
                      <p className="font-medium">Fehlende Zeiterfassung für:</p>
                      <ul className="list-disc list-inside mt-1">
                        {getMembersWithoutTime().map((name, index) => (
                          <li key={index}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Abbrechen
          </Button>
          <Button
            variant="default"
            onClick={handleFinalizeAsTeamLead}
            disabled={isSubmitting || !isTeamDataComplete()}
            className="ml-auto gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Als abgeschlossen markieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}; 