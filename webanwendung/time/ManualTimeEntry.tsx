import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { useUser } from "@/context/UserContext";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/use-toast";

// Lokale Typendefinitionen, die zu den in TimeTracker.tsx definierten passen
interface Customer {
  id: string;
  name: string;
  active?: boolean;
  [key: string]: any;
}

interface Project {
  id: string;
  name: string;
  customerId: string;
  active?: boolean;
  [key: string]: any;
}

interface ManualTimeEntryProps {
  customers: Customer[];
  projects: Project[];
  formatLocalDateForInput: (date: Date) => string;
  onEntryCreated?: (entryId: string | null) => void;
}

const ManualTimeEntry: React.FC<ManualTimeEntryProps> = ({
  customers,
  projects,
  formatLocalDateForInput,
  onEntryCreated
}) => {
  const { t } = useTranslation();
  const userContext = useUser();
  const userId = userContext.user?.uid || "";
  const { toast } = useToast();

  // Zustand für manuelle Zeiterfassung
  const [manualEntry, setManualEntry] = useState({
    date: formatLocalDateForInput(new Date()),
    startTime: "",
    endTime: "",
    pauseMinutes: "0",
    customerId: "",
    projectId: "",
    note: ""
  });

  // Gefilterte Projekte basierend auf ausgewähltem Kunden
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);

  // Wenn sich der ausgewählte Kunde ändert, aktualisiere die gefilterten Projekte
  useEffect(() => {
    if (manualEntry.customerId) {
      const filtered = projects.filter(p => p.customerId === manualEntry.customerId);
      setFilteredProjects(filtered);
    } else {
      setFilteredProjects([]);
    }
  }, [manualEntry.customerId, projects]);

  // Validierung der manuellen Eingabe
  const isManualEntryValid = (): boolean => {
    // Prüfe, ob alle benötigten Felder ausgefüllt sind
    if (!manualEntry.date || !manualEntry.startTime || !manualEntry.endTime || 
        !manualEntry.customerId || !manualEntry.projectId) {
      return false;
    }
    
    // Prüfe, ob die Startzeit vor der Endzeit liegt
    const startDateTime = new Date(`${manualEntry.date}T${manualEntry.startTime}`);
    const endDateTime = new Date(`${manualEntry.date}T${manualEntry.endTime}`);
    
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return false;
    }
    
    if (endDateTime <= startDateTime) {
      return false;
    }
    
    // Prüfe, ob die Pausenzeit gültig ist
    const pauseMinutes = parseInt(manualEntry.pauseMinutes);
    if (isNaN(pauseMinutes) || pauseMinutes < 0) {
      return false;
    }
    
    // Prüfe, ob die Pausenzeit nicht länger als die Gesamtarbeitszeit ist
    const totalMinutes = (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60);
    if (pauseMinutes >= totalMinutes) {
      return false;
    }
    
    return true;
  };

  // Funktion zum Speichern der manuellen Zeiterfassung
  const saveManualTimeEntry = async () => {
    try {
      // Prüfe, ob alle Eingaben gültig sind
      if (!isManualEntryValid()) {
        toast({
          title: "Fehler",
          description: "Bitte füllen Sie alle Pflichtfelder korrekt aus.",
          variant: "destructive",
        });
        return;
      }
      
      // Erstelle Date-Objekte aus den Eingabefeldern
      const dateParts = manualEntry.date.split("-");
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // Monate in JS sind 0-basiert
      const day = parseInt(dateParts[2]);
      
      const startTimeParts = manualEntry.startTime.split(":");
      const startHour = parseInt(startTimeParts[0]);
      const startMinute = parseInt(startTimeParts[1]);
      
      const endTimeParts = manualEntry.endTime.split(":");
      const endHour = parseInt(endTimeParts[0]);
      const endMinute = parseInt(endTimeParts[1]);
      
      const startDateTime = new Date(year, month, day, startHour, startMinute);
      const endDateTime = new Date(year, month, day, endHour, endMinute);
      
      // Wenn Endzeit vor Startzeit ist und beide am selben Tag sein sollen, 
      // kann es sein, dass die Endzeit am nächsten Tag ist
      if (endDateTime < startDateTime) {
        endDateTime.setDate(endDateTime.getDate() + 1);
      }
      
      // Berechne die Dauer in Sekunden
      const durationInSeconds = Math.floor((endDateTime.getTime() - startDateTime.getTime()) / 1000);
      
      // Pausenzeit in Minuten
      const pauseMinutes = parseInt(manualEntry.pauseMinutes) || 0;
      
      // Erhalte die Kundendaten und Projektdaten
      const selectedCustomer = customers.find(c => c.id === manualEntry.customerId);
      const selectedProject = projects.find(p => p.id === manualEntry.projectId);
      
      if (!selectedCustomer || !selectedProject) {
        toast({
          title: "Fehler",
          description: "Kunde oder Projekt konnte nicht gefunden werden.",
          variant: "destructive",
        });
        return;
      }
      
      // Lokales Datum unter Berücksichtigung der Zeitzone
      const localDate = new Date(year, month, day);
      
      // WICHTIG: Wir erstellen ein Date-Objekt mit lokaler Zeit (nicht UTC)
      // und müssen den Browser-Zeitzonenoffset berücksichtigen
      const timezoneOffsetMs = localDate.getTimezoneOffset() * 60 * 1000;
      const dateForEntry = new Date(Date.UTC(year, month, day));
      // Offset anwenden, um ein Date-Objekt zu erhalten, das in UTC dem lokalen Tag entspricht
      dateForEntry.setTime(dateForEntry.getTime() - timezoneOffsetMs);
      
      // Bestimme die Zeitzone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
      const isDST = localDate.getTimezoneOffset() < new Date(localDate.getFullYear(), 0, 1).getTimezoneOffset();
      
      // Zeiteintrag-Daten vorbereiten
      const timeEntryData = {
        // Benutzerdaten
        userId: userId,
        userName: userContext.user?.displayName || '',
        userEmail: userContext.user?.email || '',
        
        // Zeitdaten
        startTime: startDateTime,
        endTime: endDateTime,
        date: dateForEntry,
        
        // Zusätzliche Datums-Felder für Klarheit
        dateYear: year,
        dateMonth: month, 
        dateDay: day,
        dateString: `${year}-${month+1}-${day}`,
        
        // Dauer in Sekunden (exklusive Pausenzeit)
        duration: durationInSeconds - (pauseMinutes * 60),
        pauseMinutes,
        
        // Beschreibungen
        description: `Manuelle Zeiterfassung: ${selectedProject.name}`,
        note: manualEntry.note || '',
        
        // Kunden- und Projektdaten
        customerId: manualEntry.customerId,
        customerName: selectedCustomer.name,
        projectId: manualEntry.projectId,
        projectName: selectedProject.name,
        
        // Status und Metadaten
        status: 'completed',
        timezone,
        isDST,
        timezoneOffset: localDate.getTimezoneOffset() * -1,
        isManualEntry: true, // Explizit als manuelle Eingabe markieren
        fromOrders: false, // Nicht aus Aufträgen
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Debug-Output
      console.log('Manuelle Zeiterfassung:', {
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        durationInSeconds,
        pauseMinutes,
        netDuration: durationInSeconds - (pauseMinutes * 60),
        date: dateForEntry.toISOString(),
      });
      
      // Speichern in Firestore mit Fehlerbehandlung
      try {
        const docRef = await addDoc(collection(db, "timeEntries"), timeEntryData);
        console.log("Manueller Zeiteintrag erstellt mit ID:", docRef.id);
        
        // Bestätigung anzeigen
        toast({
          title: "Erfolg",
          description: "Zeiteintrag wurde erfolgreich gespeichert.",
        });
        
        // Zurücksetzen des Formulars
        setManualEntry({
          date: formatLocalDateForInput(new Date()),
          startTime: "",
          endTime: "",
          pauseMinutes: "0",
          customerId: "",
          projectId: "",
          note: ""
        });
        
        // Callback ausführen, wenn vorhanden
        if (onEntryCreated) {
          onEntryCreated(docRef.id);
        }
        
        return docRef.id;
      } catch (dbError) {
        console.error('Fehler beim Speichern in Firestore:', dbError);
        toast({
          title: "Datenbankfehler",
          description: "Der Zeiteintrag konnte nicht in der Datenbank gespeichert werden. Bitte versuchen Sie es später erneut.",
          variant: "destructive",
        });
        return null;
      }
    } catch (error) {
      console.error('Fehler beim Erstellen des manuellen Zeiteintrags:', error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
      return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Datum */}
      <div className="space-y-2">
        <Label htmlFor="manual-date">
          {t('timeTracking.date', 'Datum')} <span className="text-red-500">*</span>
        </Label>
        <Input 
          id="manual-date"
          type="date" 
          value={manualEntry.date}
          onChange={(e) => setManualEntry({...manualEntry, date: e.target.value})}
          className="w-full"
        />
      </div>
      
      {/* Startzeit und Endzeit */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="manual-start-time">
            {t('timeTracking.startTime', 'Startzeit')} <span className="text-red-500">*</span>
          </Label>
          <Input 
            id="manual-start-time"
            type="time" 
            value={manualEntry.startTime}
            onChange={(e) => setManualEntry({...manualEntry, startTime: e.target.value})}
            className="w-full"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manual-end-time">
            {t('timeTracking.endTime', 'Endzeit')} <span className="text-red-500">*</span>
          </Label>
          <Input 
            id="manual-end-time"
            type="time" 
            value={manualEntry.endTime}
            onChange={(e) => setManualEntry({...manualEntry, endTime: e.target.value})}
            className="w-full"
          />
        </div>
      </div>
      
      {/* Pausenzeit */}
      <div className="space-y-2">
        <Label htmlFor="manual-pause">
          {t('timeTracking.pauseTime', 'Pausenzeit (Minuten)')}
        </Label>
        <Input 
          id="manual-pause"
          type="number" 
          value={manualEntry.pauseMinutes}
          onChange={(e) => setManualEntry({...manualEntry, pauseMinutes: e.target.value})}
          min="0"
          className="w-full"
        />
      </div>
      
      {/* Kundenauswahl */}
      <div className="space-y-2">
        <Label htmlFor="manual-customer">
          {t('timeTracking.customer', 'Kunde')} <span className="text-red-500">*</span>
        </Label>
        <Select
          value={manualEntry.customerId}
          onValueChange={(value) => {
            setManualEntry({
              ...manualEntry, 
              customerId: value === "none" ? "" : value,
              projectId: "" // Reset project when customer changes
            });
          }}
        >
          <SelectTrigger id="manual-customer">
            <SelectValue placeholder={t('timeTracking.selectCustomer', 'Kunde auswählen')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {t('timeTracking.noCustomer', 'Kein Kunde')}
            </SelectItem>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Projektauswahl */}
      <div className="space-y-2">
        <Label htmlFor="manual-project">
          {t('timeTracking.project', 'Projekt')} <span className="text-red-500">*</span>
        </Label>
        <Select
          value={manualEntry.projectId}
          onValueChange={(value) => {
            setManualEntry({
              ...manualEntry, 
              projectId: value === "none" ? "" : value
            });
          }}
          disabled={!manualEntry.customerId}
        >
          <SelectTrigger id="manual-project">
            <SelectValue placeholder={t('timeTracking.selectProject', 'Projekt auswählen')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              {t('timeTracking.noProject', 'Kein Projekt')}
            </SelectItem>
            {filteredProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {/* Notiz */}
      <div className="space-y-2">
        <Label htmlFor="manual-note">
          {t('timeTracking.note', 'Notiz')}
        </Label>
        <Input 
          id="manual-note"
          value={manualEntry.note}
          onChange={(e) => setManualEntry({...manualEntry, note: e.target.value})}
          placeholder={t('timeTracking.notePlaceholder', 'Notizen zur Tätigkeit')}
          className="w-full"
        />
      </div>
      
      {/* Speichern-Button */}
      <div className="flex justify-end pt-4">
        <Button 
          onClick={saveManualTimeEntry}
          disabled={!isManualEntryValid()}
        >
          {t('timeTracking.save', 'Speichern')}
        </Button>
      </div>
    </div>
  );
};

export default ManualTimeEntry; 