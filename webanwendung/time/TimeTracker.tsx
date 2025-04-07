import React, { useState, useRef, useEffect, ChangeEvent } from "react";
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
import { cn } from "@/lib/utils";
import { Play, Pause, Square, ChevronUp, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUser } from "@/context/UserContext";
import { doc, collection, onSnapshot, query, where, orderBy, getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Unsubscribe } from "firebase/auth";
import { useToast } from "@/components/ui/use-toast";
import { submitTimeEntryForApproval } from "@/lib/db/timeEntries";
import timeUtils from '@/lib/utils/timeUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ManualTimeEntry from "./ManualTimeEntry";

// Typdefinitionen für Customer und Project
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

// Typdefinition für einen Benutzer
interface UserData {
  uid: string;
  displayName?: string;
  email?: string;
  role?: string;
  // Weitere Benutzerfelder
}

// Hilfsfunktionen außerhalb der Komponente
// Arbeitsstunden berechnen
export function calculateWorkHours(start: Date, end: Date, pauseMinutes: number = 0): number {
  // Sicherstellen, dass wir mit gültigen Date-Objekten arbeiten
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error("Ungültige Datumsangaben für calculateWorkHours:", { start, end });
    return 0;
  }

  // Differenz in Millisekunden
  const diffMs = end.getTime() - start.getTime();
  
  // Überprüfung auf negative Differenz
  if (diffMs < 0) {
    console.warn("Endzeit liegt vor Startzeit:", { start, end });
    return 0;
  }
  
  // Differenz in Sekunden
  const diffSec = diffMs / 1000;
  
  // Pause in Sekunden umwandeln und abziehen
  const pauseSec = pauseMinutes * 60;
  
  // Netto-Sekunden (nach Abzug der Pause)
  const netSec = diffSec - pauseSec;
  
  // Sicherstellen, dass das Ergebnis nicht negativ ist
  return Math.max(0, netSec);
}

// Validierung für Zeiteinträge
export function validateTimeEntry(start: Date, end: Date, pauseMinutes: number = 0): { isValid: boolean; message: string } {
  // Prüfen, ob Endzeit nach Startzeit liegt
  if (end <= start) {
    return { isValid: false, message: "Die Endzeit muss nach der Startzeit liegen." };
  }
  
  // Prüfen, ob die Pause nicht länger als die gesamte Arbeitszeit ist
  const totalSeconds = (end.getTime() - start.getTime()) / 1000;
  const pauseSeconds = pauseMinutes * 60;
  
  if (pauseSeconds >= totalSeconds) {
    return { isValid: false, message: "Die Pausenzeit darf nicht länger als die gesamte Arbeitszeit sein." };
  }
  
  return { isValid: true, message: "" };
}

// TimeTracker-Komponente mit lokalem Zustand
export interface TimeTrackerProps {
  expanded?: boolean;
  onExpand?: () => void;
  onMinimize?: () => void;
  className?: string;
  mode?: string;
}

const TimeTracker = ({
  expanded = false,
  onExpand = () => {},
  onMinimize = () => {},
  className,
  mode
}: TimeTrackerProps) => {
  const { t } = useTranslation();
  const userData = useUser();
  const userId = userData.user?.uid || "";
  const firebaseOnline = userData.firebaseOnline;
  const { toast } = useToast();
  
  // Lokaler Zustand für den Timer
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0); // in seconds
  const [pauseTime, setPauseTime] = useState(0); // in minutes
  const [pauseSeconds, setPauseSeconds] = useState(0); // visuelle Sekundenanzeige für die Pause
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [projectName, setProjectName] = useState("");
  
  // Timer-Referenzen
  const timerRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<number | null>(null);

  // Lokaler UI Zustand
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [showConfirm, setShowConfirm] = useState(false);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  
  // Kunden und Projekte
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(true);
  
  // Filter für ausgeklappte Felder
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  
  // Ref für das Notizfeld
  const noteInputRef = useRef<HTMLInputElement>(null);
  
  // Listeners
  const savedEntriesListenerRef = useRef<Unsubscribe | null>(null);
  
  // Tab-Auswahl - Wir setzen automatisch "manual", wenn mode="new" ist
  const [activeTab, setActiveTab] = useState<string>(mode === "new" ? "manual" : "timer");
  
  // Helper-Funktion, um das lokale Datum für Input-Felder zu formatieren
  const formatLocalDateForInput = (date: Date): string => {
    // Prüfen, ob das Datum gültig ist
    if (!date || isNaN(date.getTime())) {
      console.error("Ungültiges Datum für formatLocalDateForInput:", date);
      const today = new Date();
      date = today; // Fallback auf heute
    }

    try {
      // Format YYYY-MM-DD für input[type="date"]
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error("Fehler beim Formatieren des Datums:", error);
      return "";
    }
  };

  // Aktuelles lokales Datum basierend auf Browser-Zeitzone
  const [currentLocalDate, setCurrentLocalDate] = useState<string>(
    formatLocalDateForInput(new Date())
  );

  // Aktuelles Datum vom Backend abrufen
  useEffect(() => {
    const fetchCurrentDate = async () => {
      try {
        // Sichere Variante mit Fallback-URL
        let apiUrl = 'http://localhost:3001/api/timezone/current';
        
        // Versuche, die Umgebungsvariable zu verwenden, falls verfügbar
        if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_URL) {
          apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/timezone/current`;
        }
        
        try {  
          console.log(`Versuche, Zeitdaten von ${apiUrl} abzurufen...`);
          const response = await fetch(apiUrl);
          
          if (response.ok) {
            const data = await response.json();
            console.log("Zeitzonendaten vom Backend erhalten:", data);
            
            // Formatiere das Datum für die Anzeige im UI
            if (data.dateYear && data.dateMonth !== undefined && data.dateDay !== undefined) {
              // Beachte: dateMonth ist 0-basiert, daher +1 für die Anzeige
              const formattedDate = `${data.dateYear}-${String(data.dateMonth + 1).padStart(2, '0')}-${String(data.dateDay).padStart(2, '0')}`;
              setCurrentLocalDate(formattedDate);
            }
          } else {
            console.warn(`Backend-Anfrage fehlgeschlagen (${response.status}), versuche Fallback...`);
            
            // Versuche den Debug-Endpunkt als Fallback
            const fallbackUrl = 'http://localhost:3001/api/time-debug';
            console.log(`Versuche Fallback: ${fallbackUrl}`);
            
            const fallbackResponse = await fetch(fallbackUrl);
            if (fallbackResponse.ok) {
              const debugData = await fallbackResponse.json();
              console.log("Debug-Zeitdaten erhalten:", debugData);
              
              // Verwende die aktuelle Serverzeit
              if (debugData.now) {
                const serverDate = new Date(debugData.now);
                setCurrentLocalDate(formatLocalDateForInput(serverDate));
              } else {
                // Letzter Fallback auf lokales Datum
                const localDate = new Date();
                setCurrentLocalDate(formatLocalDateForInput(localDate));
              }
            } else {
              console.warn("Auch Fallback fehlgeschlagen, verwende lokales Datum");
              // Bei Fehler das lokale Datum verwenden
              const localDate = new Date();
              setCurrentLocalDate(formatLocalDateForInput(localDate));
            }
          }
        } catch (fetchError) {
          console.error("API-Anfrage fehlgeschlagen:", fetchError);
          // Bei Netzwerkfehler lokales Datum verwenden
          const localDate = new Date();
          setCurrentLocalDate(formatLocalDateForInput(localDate));
        }
      } catch (error) {
        console.error("Fehler beim Abrufen des aktuellen Datums:", error);
        // Generischer Fallback
        const localDate = new Date();
        setCurrentLocalDate(formatLocalDateForInput(localDate));
      }
    };
    
    fetchCurrentDate();
  }, []);
  
  // Beim Laden der Komponente Kunden und Projekte laden
  useEffect(() => {
    loadCustomersAndProjects();
    return () => {
      if (savedEntriesListenerRef.current) {
        savedEntriesListenerRef.current();
      }
      
      // Timer aufräumen
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      if (pauseTimerRef.current) {
        window.clearInterval(pauseTimerRef.current);
      }
    };
  }, []);

  // Timer-Logik
  useEffect(() => {
    if (isRunning && !isPaused) {
      if (timerRef.current !== null) return;

      timerRef.current = window.setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current === null) return;

      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, isPaused]);
  
  // Timer-Logik für Pausenzeit in Sekunden
  useEffect(() => {
    if (isRunning && isPaused) {
      // Sekunden-Timer für visuelle Anzeige
      const secondsTimer = window.setInterval(() => {
        setPauseSeconds(prev => {
          const newSeconds = (prev + 1) % 60;
          // Wenn eine Minute voll ist, erhöhen wir pauseTime über die andere useEffect
          return newSeconds;
        });
      }, 1000);
      
      return () => {
        window.clearInterval(secondsTimer);
      };
    } else {
      // Wenn Pause beendet wird, setzen wir die Sekunden zurück
      setPauseSeconds(0);
    }
  }, [isRunning, isPaused]);
  
  // Neuer Effekt für die Pausenzeituhr (Minuten)
  useEffect(() => {
    if (isRunning && isPaused) {
      if (pauseTimerRef.current !== null) return;

      // Startet einen Timer für die Pausenzeit, der alle 60 Sekunden aktualisiert wird
      pauseTimerRef.current = window.setInterval(() => {
        setPauseTime(prevPauseTime => {
          const newPauseTime = prevPauseTime + 1;
          console.log('Pausenzeit erhöht auf:', newPauseTime, 'Minuten');
          // Pausenzeit in Firestore aktualisieren
          updateTimerStatus(true);
          return newPauseTime;
        });
      }, 60000); // Alle 60 Sekunden (1 Minute)
    } else {
      if (pauseTimerRef.current === null) return;

      window.clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    
    return () => {
      if (pauseTimerRef.current !== null) {
        window.clearInterval(pauseTimerRef.current);
        pauseTimerRef.current = null;
      }
    };
  }, [isRunning, isPaused]);
  
  // Wenn sich der ausgewählte Kunde ändert, Projekte filtern
  useEffect(() => {
    if (selectedCustomerId) {
      const filtered = projects.filter(p => p.customerId === selectedCustomerId);
      setFilteredProjects(filtered);
    } else {
      setFilteredProjects([]);
    }
  }, [selectedCustomerId, projects]);
  
  // Funktion zum Laden der Kunden und Projekte
  const loadCustomersAndProjects = async () => {
    if (!userId) {
      console.error("Kein Benutzer angemeldet");
      toast({
        title: "Fehler",
        description: "Sie müssen angemeldet sein, um Kunden und Projekte zu laden.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoadingCustomers(true);
      setLoadingProjects(true);
      
      console.log("Lade Kunden und Projekte für Benutzer:", userId);
      
      // Kunden laden - ohne Filter für bessere Erfolgschancen
      const customersQuery = query(
        collection(db, "customers")
      );
      
      console.log("Lade Kunden...");
      const customersSnapshot = await getDocs(customersQuery);
      console.log(`${customersSnapshot.docs.length} Kunden gefunden`);
      
      const customersData = customersSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(customer => (customer as any).active !== false) as Customer[];
      
      // Clientseitige Sortierung nach Name
      const sortedCustomers = customersData.sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      
      console.log("Sortierte Kunden:", sortedCustomers);
      setCustomers(sortedCustomers);
      setLoadingCustomers(false);
      
      // Projekte laden - ohne Filter für bessere Erfolgschancen
      const projectsQuery = query(
        collection(db, "projects")
      );
      
      console.log("Lade Projekte...");
      const projectsSnapshot = await getDocs(projectsQuery);
      console.log(`${projectsSnapshot.docs.length} Projekte gefunden`);
      
      const projectsData = projectsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(project => (project as any).active !== false) as Project[];
      
      // Clientseitige Sortierung nach Name
      const sortedProjects = projectsData.sort((a, b) => 
        a.name?.localeCompare(b.name || "") || 0
      );
      
      console.log("Sortierte Projekte:", sortedProjects);
      setProjects(sortedProjects);
      setLoadingProjects(false);
      
      // Wenn keine Kunden oder Projekte geladen wurden, zeige eine Warnung
      if (sortedCustomers.length === 0) {
        toast({
          title: "Keine Kunden gefunden",
          description: "Es wurden keine aktiven Kunden gefunden. Bitte kontaktieren Sie Ihren Administrator.",
          variant: "destructive"
        });
      }
      
      if (sortedProjects.length === 0) {
        toast({
          title: "Keine Projekte gefunden",
          description: "Es wurden keine aktiven Projekte gefunden. Bitte kontaktieren Sie Ihren Administrator.",
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error("Fehler beim Laden von Kunden und Projekten:", error);
      toast({
        title: "Fehler",
        description: "Fehler beim Laden von Kunden und Projekten. Bitte versuchen Sie es später erneut.",
        variant: "destructive"
      });
      
      // Setze Ladezustände zurück
      setLoadingCustomers(false);
      setLoadingProjects(false);
    }
  };
  
  // Timer starten
  const startTimer = async () => {
    // Prüfe, ob Kunde und Projekt ausgewählt sind
    if (!selectedCustomerId || !selectedProjectId) {
      toast({
        title: "Fehler",
        description: "Bitte wählen Sie einen Kunden und ein Projekt aus.",
        variant: "destructive",
      });
      return;
    }
    
    // Setze den Startzeitpunkt
    const now = new Date();
    const nowISO = formatDateToISOWithTZ(now);
    console.log("Timer wird gestartet:", nowISO);
    
    // Setze den Timer-Status
    setStartTime(now);
    setIsRunning(true);
    setIsPaused(false);
    setElapsedTime(0);
    setPauseTime(0);
    setPauseSeconds(0);
    
    toast({
      title: "Zeiterfassung gestartet",
      description: `Kunde: ${customerName}\nProjekt: ${projectName}`,
      variant: "default"
    });
    
    // Timer-Daten in Firestore speichern
    try {
      // Aktuelle Zeit als Timer-Startzeit festhalten
      const currentDate = new Date();
      
      // Kunde und Projekt ermitteln
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      
      if (userId && selectedCustomer && selectedProject) {
        // Dokument-Referenz
        const timerDocRef = doc(db, "users", userId, "activeTimers", "current");
        
        // Aktuelle Zeitdaten ermitteln und speichern
        const dateYear = currentDate.getFullYear();
        const dateMonth = currentDate.getMonth(); 
        const dateDay = currentDate.getDate();
        const dateString = `${dateYear}-${dateMonth+1}-${dateDay}`;
        
        // Speichern
        await setDoc(timerDocRef, {
          isRunning: true,
          isPaused: false,
          startTime: nowISO, // Als ISO-String speichern
          startedAt: Timestamp.now(),
          date: dateString,
          dateYear,
          dateMonth,
          dateDay,
          elapsedTime: 0,
          pauseStartTime: null,
          pauseTime: 0,
          customerId: selectedCustomerId,
          customerName: selectedCustomer.name,
          projectId: selectedProjectId,
          projectName: selectedProject.name,
          note: note || ""
        });
        
        console.log("Timer-Daten erfolgreich gespeichert!");
      } else {
        console.error("Fehler: Benutzer, Kunde oder Projekt nicht gefunden", {
          userId,
          selectedCustomerId,
          selectedProjectId
        });
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Timer-Daten:", error);
      toast({
        title: "Fehler",
        description: "Die Zeiterfassung konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };
  
  const pauseTimer = () => {
    if (!isRunning || isPaused) return;
    
    setIsPaused(true);
    setPauseSeconds(0); // Sekundenzähler zurücksetzen
    
    // Pausenzeit in Firestore aktualisieren
    updateTimerStatus(true);
  };
  
  const resumeTimer = () => {
    if (!isRunning || !isPaused) return;
    
    setIsPaused(false);
    setPauseSeconds(0); // Sekundenzähler zurücksetzen
    
    // Pausenzeit in Firestore aktualisieren
    updateTimerStatus(false);
  };
  
  const stopTimer = async () => {
    // Prüfen, ob der Timer überhaupt läuft
    if (!isRunning) {
      console.warn("Timer kann nicht gestoppt werden: Nicht gestartet");
      toast({
        title: "Fehler",
        description: "Die Zeiterfassung läuft nicht und kann daher nicht gestoppt werden.",
        variant: "destructive",
      });
      return;
    }
    
    // Prüfen, ob startTime gesetzt ist
    if (!startTime) {
      console.warn("Timer kann nicht gestoppt werden: Startzeit nicht gesetzt");
      toast({
        title: "Fehler",
        description: "Die Startzeit wurde nicht korrekt erfasst. Timer wird zurückgesetzt.",
        variant: "destructive",
      });
      resetTimer();
      return;
    }
    
    // Timer-Referenzen aufräumen
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (pauseTimerRef.current) {
      clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    
    try {
      // Aktuelles Datum/Uhrzeit als Endzeit
      const endTime = new Date();
      const endTimeISO = formatDateToISOWithTZ(endTime);
      const startTimeISO = formatDateToISOWithTZ(startTime);
      
      console.log("Timer wird gestoppt:", {
        startTime: startTimeISO,
        endTime: endTimeISO,
        elapsedTime,
        pauseTime
      });
      
      // Berechne die effektive Arbeitszeit mit timeUtils
      const totalSeconds = timeUtils.calculateEffectiveWorkTime(startTime, endTime, pauseTime);
      
      // Datumsformate für konsistente Speicherung erzeugen
      const dateFormats = timeUtils.createEntryDateFormats(startTime);
      
      // Zeiteintragsdaten zusammenstellen
      const timeEntryData = {
        // Nutzer-Informationen
        userId,
        userName: userData?.user?.displayName || "Unbekannter Benutzer",
        userEmail: userData?.user?.email || "",
        
        // Zeitdaten
        startTime,
        endTime,
        
        // Datumsformate (ohne date, da in dateFormats bereits enthalten)
        ...dateFormats,
        
        // Dauer und Pausenzeit
        duration: totalSeconds,
        pauseMinutes: pauseTime,
        
        // Beschreibung und Zuordnung
        description: note || "Zeiterfassung",
        note,
        customerId: selectedCustomerId,
        customerName,
        projectId: selectedProjectId,
        projectName,
        
        // Status und Metadaten
        status: "completed",
        isManualEntry: false,
        fromOrders: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Debug-Ausgabe
      const formattedDuration = timeUtils.formatDuration(totalSeconds);
      console.log("Zeitberechnung und Speicherung:", {
        startTimeObj: startTime,
        startTimeISO,
        endTimeObj: endTime,
        endTimeISO,
        totalSeconds,
        formattedDuration,
        pauseTime,
        dateInfo: dateFormats
      });
      
      // Speichere den Zeiteintrag in Firestore
      await addDoc(collection(db, "timeEntries"), timeEntryData);
      
      // Lösche den aktiven Timer
      if (userId) {
        const timerDocRef = doc(db, "users", userId, "activeTimers", "current");
        await deleteDoc(timerDocRef);
      }
      
      // Benachrichtigung anzeigen
      toast({
        title: "Zeiterfassung beendet",
        description: `Arbeitszeit: ${formattedDuration}`,
      });
      
      // Timer zurücksetzen
      resetTimer();
    } catch (error) {
      console.error("Fehler beim Stoppen des Timers:", error);
      toast({
        title: "Fehler",
        description: "Die Zeiterfassung konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    }
  };
  
  // Prüfen, ob ein aktiver Timer existiert
  const checkForActiveTimer = async () => {
    if (!userId) return;
    
    console.log("Prüfe auf aktiven Timer für Benutzer:", userId);
    
    try {
      const timerDocRef = doc(db, "users", userId, "activeTimers", "current");
      const timerDoc = await getDoc(timerDocRef);
      
      if (timerDoc.exists()) {
        console.log("Aktiven Timer gefunden:", timerDoc.data());
        const timerData = timerDoc.data();
        
        // Behandle den startTime-Wert basierend auf dem Format
        let startDate: Date | null = null;
        
        try {
          if (timerData.startTime) {
            if (typeof timerData.startTime === 'string') {
              // ISO-String direkt in Date umwandeln
              startDate = new Date(timerData.startTime);
              if (!isNaN(startDate.getTime())) {
                console.log("Timer startTime aus ISO-String:", startDate.toISOString());
              } else {
                console.error("Ungültiger ISO-String für startTime:", timerData.startTime);
                startDate = null;
              }
            } else if (timerData.startTime.toDate) {
              // Firebase Timestamp-Objekt
              startDate = timerData.startTime.toDate();
              if (startDate && !isNaN(startDate.getTime())) {
                console.log("Timer startTime aus Timestamp:", startDate.toISOString());
              } else {
                console.error("Ungültiger Timestamp für startTime:", timerData.startTime);
                startDate = null;
              }
            }
          } else if (timerData.startedAt) {
            // Fallback auf startedAt wenn verfügbar
            try {
              if (timerData.startedAt instanceof Timestamp) {
                startDate = timerData.startedAt.toDate();
              } else {
                startDate = new Date(timerData.startedAt);
              }
              
              if (!isNaN(startDate.getTime())) {
                console.log("Timer startTime aus startedAt:", startDate.toISOString());
              } else {
                console.error("Ungültiges Datum aus startedAt:", timerData.startedAt);
                startDate = null;
              }
            } catch (innerError) {
              console.error("Fehler beim Extrahieren von startedAt:", innerError);
              startDate = null;
            }
          }
        } catch (error) {
          console.error("Fehler beim Parsen der Startzeit:", error);
          startDate = null;
        }
        
        // Prüfe, ob startDate gültig ist und setze den Timer-Zustand
        if (startDate && !isNaN(startDate.getTime())) {
          console.log("Setze Timer-Zustand mit startDate:", startDate.toISOString());
          
          // Timer-Zustand wiederherstellen
          setStartTime(startDate);
          setIsRunning(true);
          setIsPaused(timerData.isPaused || false);
          setNote(timerData.note || "");
          setSelectedCustomerId(timerData.customerId || "");
          setCustomerName(timerData.customerName || "");
          setSelectedProjectId(timerData.projectId || "");
          setProjectName(timerData.projectName || "");
          
          // Verstrichene Zeit berechnen
          const now = new Date();
          let diffInSeconds = Math.floor((now.getTime() - startDate.getTime()) / 1000);
          
          // Verwende gespeicherte elapsed time, wenn vorhanden und größer
          if (timerData.elapsedTime && typeof timerData.elapsedTime === 'number' && timerData.elapsedTime > diffInSeconds) {
            diffInSeconds = timerData.elapsedTime;
          }
          
          // Setze die Werte mit zusätzlicher Validierung
          setElapsedTime(diffInSeconds >= 0 ? diffInSeconds : 0);
          setPauseTime(timerData.pauseTime && typeof timerData.pauseTime === 'number' ? timerData.pauseTime : 0);
          
          console.log("Timer erfolgreich wiederhergestellt mit Zeit:", diffInSeconds, "Sekunden");
        } else {
          console.error("Ungültiges startTime-Format oder ungültiges Datum:", timerData.startTime);
          
          // Timer zurücksetzen, da kein gültiges Startdatum gefunden wurde
          resetTimer();
        }
      } else {
        console.log("Kein aktiver Timer gefunden.");
        resetTimer();
      }
    } catch (error) {
      console.error("Fehler beim Prüfen auf aktiven Timer:", error);
      
      // Bei einem Fehler lieber den Timer zurücksetzen
      resetTimer();
    }
  };
  
  // Beim Laden der Komponente prüfen, ob ein aktiver Timer existiert
  useEffect(() => {
    if (userId) {
      console.log("useEffect: Prüfe auf aktiven Timer für User:", userId);
      checkForActiveTimer();
    } else {
      console.log("useEffect: Kein User vorhanden, setze Timer zurück");
      resetTimer();
    }
  }, [userId]);

  // Regelmäßig Timer-Daten aktualisieren, wenn Timer läuft
  useEffect(() => {
    if (isRunning && startTime && userId) {
      // Bei laufendem Timer jede Minute aktualisieren
      const updateInterval = setInterval(() => {
        console.log("Aktualisiere Timer-Status in Firebase:", {
          isRunning, 
          isPaused, 
          elapsedTime
        });
        
        updateTimerStatus(isPaused);
      }, 60000); // Jede Minute aktualisieren
      
      return () => clearInterval(updateInterval);
    }
  }, [isRunning, isPaused, elapsedTime, userId, startTime]);

  // Timer-Status in Firestore aktualisieren
  const updateTimerStatus = async (paused: boolean) => {
    if (!userId || !startTime) {
      console.warn("Timer-Status kann nicht aktualisiert werden: Kein Benutzer oder Startzeit");
      return;
    }
    
    try {
      const timerDocRef = doc(db, "users", userId, "activeTimers", "current");
      
      // Aktuelle Daten des Timers lesen
      const timerDoc = await getDoc(timerDocRef);
      if (!timerDoc.exists()) {
        console.warn("Timer existiert nicht mehr in Firebase, setze zurück");
        resetTimer();
        return;
      }
      
      const now = new Date();
      
      // Nur aktualisieren, wenn Timer noch läuft
      await updateDoc(timerDocRef, {
        isPaused: paused,
        elapsedTime: elapsedTime,
        pauseTime: paused ? pauseTime + 1 : pauseTime,
        lastUpdate: now.toISOString(),
        // Updates für andere wichtige Felder
        note: note || "",
        customerId: selectedCustomerId,
        customerName: customerName,
        projectId: selectedProjectId,
        projectName: projectName
      });
      
      console.log("Timer-Status erfolgreich aktualisiert:", {
        isPaused: paused,
        elapsedTime: elapsedTime,
        pauseTime: paused ? pauseTime + 1 : pauseTime
      });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Timer-Status:", error);
    }
  };
  
  // Formatierung der verstrichenen Zeit
  const formatElapsedTime = () => {
    const hours = Math.floor(elapsedTime / 3600);
    const minutes = Math.floor((elapsedTime % 3600) / 60);
    const seconds = elapsedTime % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Formatierung der Pausenzeit (mit Sekunden)
  const formatPauseTime = () => {
    const hours = Math.floor(pauseTime / 60);
    const minutes = pauseTime % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${pauseSeconds.toString().padStart(2, '0')}`;
  };
  
  // Kundenauswahl
  const handleCustomerChange = (customerId: string) => {
    if (customerId === 'none') {
      setSelectedCustomerId("");
      setCustomerName("");
      return;
    }
    
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setSelectedCustomerId(customerId);
      setCustomerName(customer.name);
      
      // Projekte filtern
      const filtered = projects.filter(p => p.customerId === customerId);
      setFilteredProjects(filtered);
      
      // Wenn es keine Projekte gibt oder das ausgewählte Projekt nicht dem Kunden gehört, Projekt zurücksetzen
      if (filtered.length === 0 || !filtered.some(p => p.id === selectedProjectId)) {
        setSelectedProjectId("");
        setProjectName("");
      }
    } else {
      setSelectedCustomerId("");
      setCustomerName("");
    }
  };
  
  // Projektauswahl
  const handleProjectChange = (projectId: string) => {
    if (projectId === 'none') {
      setSelectedProjectId("");
      setProjectName("");
      return;
    }
    
    const project = projects.find(p => p.id === projectId);
    if (project) {
      setSelectedProjectId(projectId);
      setProjectName(project.name);
    } else {
      setSelectedProjectId("");
      setProjectName("");
    }
  };
  
  // UI-Funktionen
  const handleExpandCollapse = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      onExpand();
      } else {
      setIsExpanded(false);
      onMinimize();
    }
  };
  
  // Timer stoppen mit Bestätigung
  const handleStopTimerWithConfirm = () => {
    setShowConfirm(true);
  };
  
  // Timer-Stopp bestätigen
  const confirmStopTimer = async () => {
    await stopTimer();
    setShowConfirm(false);
  };
  
  // Timer-Stopp abbrechen
  const cancelStopTimer = () => {
    setShowConfirm(false);
  };
  
  // Timer-Daten in Firestore speichern
  const saveTimer = async () => {
    if (!startTime || !isRunning) {
      console.warn("Timer kann nicht gespeichert werden: Nicht gestartet oder schon pausiert");
      return;
    }

    try {
      const now = new Date();
      const endTimeObj = now;
      
      // ISO-Strings für Debugging und Konsistenz
      const startTimeISO = startTime.toISOString();
      const endTimeISO = endTimeObj.toISOString();

      // Berechnung der Gesamtzeit in Sekunden (mit Pause)
      const totalSeconds = calculateWorkHours(startTime, endTimeObj, pauseTime);
      
      // Lokales Datum für den Eintrag - Stellen Sie sicher, dass dies das tatsächliche lokale Datum ist
      const localDate = new Date(startTime);
      const dateYear = localDate.getFullYear();
      const dateMonth = localDate.getMonth();
      const dateDay = localDate.getDate();
      const dateString = `${dateYear}-${dateMonth+1}-${dateDay}`;
      
      // Bestimme die richtige Zeitzone und DST-Status
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
      const isDST = now.getTimezoneOffset() < new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
      
      // Datum für den Eintrag - Wir verwenden den Anfang des Tages in der lokalen Zeitzone
      const dateForEntry = new Date(dateYear, dateMonth, dateDay);

      // Debug-Informationen
      console.log("Timer-Daten gespeichert:", {
        dateObject: startTime,
        dateString: dateString,
        startTimeISO: startTimeISO
      });
      
      console.log("Datums- und Zeitzonendiagnose:", {
        localDate: new Date().toISOString(),
        localTimestamp: Date.now(),
        localYear: dateYear,
        localMonth: dateMonth,
        localDay: dateDay,
        localDateString: `${dateDay}.${dateMonth+1}.${dateYear}`,
        dateForEntry: dateForEntry.toISOString(),
        dateTimestamp: dateForEntry.getTime(),
        dateForEntryString: `${dateDay}.${dateMonth+1}.${dateYear}`,
        dateForEntryLocal: `${dateYear}-${dateMonth+1}-${dateDay}`,
        timezone,
        isDST,
        timezoneOffset: now.getTimezoneOffset()
      });
      
      console.log("Zeitberechnung und Speicherung:", {
        startTimeObj: startTime,
        startTimeISO: startTimeISO,
        endTimeObj: endTimeObj,
        endTimeISO: endTimeISO,
        entryDate: dateForEntry.toISOString(),
        entryDateLocal: `${dateYear}-${dateMonth+1}-${dateDay}`,
        timezone: timezone
      });

      // Erstelle den Zeiteintrag mit konsistenten Zeitangaben
      const timeEntryData = {
        // Nutzer- und Metadaten
        userId: userId,
        userName: userData?.user?.displayName || 'Unbekannter Benutzer',
        userEmail: userData?.user?.email || '',
        
        // Zeitdaten
        startTime: startTime,          // Startzeit als Date-Objekt
        endTime: endTimeObj,           // Endzeit als Date-Objekt
        date: dateForEntry,            // Datum als Date-Objekt für den Tag des Eintrags
        dateYear,                      // Jahr (numerisch)
        dateMonth,                     // Monat (0-11)
        dateDay,                       // Tag des Monats
        dateString,                    // YYYY-MM-DD String
        
        // Dauer und Pausen
        duration: totalSeconds,        // Berechnete Netto-Dauer in Sekunden (nach Abzug der Pause)
        pauseMinutes: pauseTime,       // Pausenzeit in Minuten
        
        // Beschreibung und Zuordnung
        description: note || "Zeiterfassung",
        note: note,
        customerId: selectedCustomerId,
        customerName: customerName,
        projectId: selectedProjectId,
        projectName: projectName,
        
        // Status und Typ
        status: "completed",           // Status des Eintrags
        isManualEntry: false,          // Kein manueller Eintrag
        fromOrders: false,             // Nicht aus Aufträgen
        
        // Zeitzonendaten für spätere Berechnungen
        timezone,                      // Zeitzone (z.B. "Europe/Berlin")
        isDST,                         // Sommerzeit aktiv?
        timezoneOffset: now.getTimezoneOffset() * -1, // Zeitzonenversatz in Minuten (positiv für Zeitzonen östlich von UTC)
        
        // Metadaten
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await addDoc(collection(db, "timeEntries"), timeEntryData);

      toast({
        title: "Erfolgreich",
        description: "Zeiteintrag wurde gespeichert.",
      });
      
      // Zurücksetzen des Timers
      resetTimer();
    } catch (error) {
      console.error("Fehler beim Speichern des Zeiteintrags:", error);
      toast({
        title: "Fehler",
        description: "Beim Speichern des Zeiteintrags ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    }
  };

  // Timer-Daten aus Firestore löschen
  const deleteTimerData = async () => {
    if (!userId) return;
    
    try {
      // Korrekte Referenz mit 4 Segmenten: collection/document/collection/document
      const timerDocRef = doc(db, "users", userId, "activeTimers", "current");
      
      await deleteDoc(timerDocRef);
      
      console.log("Timer-Daten gelöscht");
    } catch (error) {
      console.error("Fehler beim Löschen der Timer-Daten:", error);
    }
  };
  
  // Zeiteintrag erstellen
  const createTimeEntry = async (): Promise<string | null> => {
    if (!startTime) return null;
    
    try {
      const endTime = new Date();
      
      // Hole aktuelle Zeit und Datum vom Backend
      let timeData;
      try {
        // Sichere Variante mit Fallback-URL
        let apiUrl = 'http://localhost:3001/api/timezone/current';
        
        // Versuche, die Umgebungsvariable zu verwenden, falls verfügbar
        if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_API_URL) {
          apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/api/timezone/current`;
        }
        
        console.log(`Versuche, Zeitdaten für Eintrag von ${apiUrl} abzurufen...`);
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          timeData = await response.json();
          console.log("Zeitzonendaten vom Backend erhalten:", timeData);
        } else {
          console.warn(`Fehler beim Abrufen der Zeitzonendaten (${response.status}), versuche Fallback...`);
          
          // Versuche den Debug-Endpunkt als Fallback
          const fallbackUrl = 'http://localhost:3001/api/time-debug';
          console.log(`Versuche Fallback für Zeiteintrag: ${fallbackUrl}`);
          
          const fallbackResponse = await fetch(fallbackUrl);
          if (fallbackResponse.ok) {
            const debugData = await fallbackResponse.json();
            console.log("Debug-Zeitdaten für Zeiteintrag erhalten:", debugData);
            
            // Erstelle minimales timeData-Objekt aus Debug-Daten
            if (debugData.now) {
              const serverDate = new Date(debugData.now);
              timeData = {
                date: new Date(serverDate.getFullYear(), serverDate.getMonth(), serverDate.getDate()),
                dateYear: serverDate.getFullYear(),
                dateMonth: serverDate.getMonth(),
                dateDay: serverDate.getDate(),
                dateString: `${serverDate.getFullYear()}-${serverDate.getMonth()+1}-${serverDate.getDate()}`,
                timezone: debugData.timezone || 'Europe/Berlin',
                isDST: true // Vereinfachte Annahme
              };
            }
          }
        }
      } catch (error) {
        console.error("Fehler beim Abrufen der Zeitzonendaten:", error);
      }
      
      // Bestimme die korrekte Zeitzone
      const timezone = timeData?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
      
      // Lokales Datum unter Berücksichtigung der Zeitzone
      const localDate = new Date();
      
      // Explizit ein Date-Objekt für den Anfang des lokalen Tages erstellen
      // Wir verwenden Jahr, Monat, Tag aus lokalem Datum und setzen Uhrzeit auf 0
      const year = timeData?.dateYear || localDate.getFullYear();
      const month = timeData?.dateMonth || localDate.getMonth();
      const day = timeData?.dateDay || localDate.getDate();
      
      // WICHTIG: Wir erstellen ein Date-Objekt mit lokaler Zeit (nicht UTC)
      // und müssen den Browser-Zeitzonenoffset berücksichtigen
      const timezoneOffsetMs = localDate.getTimezoneOffset() * 60 * 1000;
      const dateForEntry = new Date(Date.UTC(year, month, day));
      // Offset anwenden, um ein Date-Objekt zu erhalten, das in UTC dem lokalen Tag entspricht
      dateForEntry.setTime(dateForEntry.getTime() - timezoneOffsetMs);
      
      // Verwende Zeitzoneninformationen vom Backend wenn verfügbar
      const isDST = timeData?.isDST !== undefined 
        ? timeData.isDST 
        : (timezone.includes("Europe") && 
           localDate.getTimezoneOffset() < new Date(localDate.getFullYear(), 0, 1).getTimezoneOffset());
      
      // Debug-Ausgabe zu Datums- und Zeitzonenproblemen
      console.log('Datums- und Zeitzonendiagnose:', {
        localDate: localDate.toISOString(),
        localTimestamp: localDate.getTime(),
        localYear: year,
        localMonth: month,
        localDay: day,
        localDateString: localDate.toLocaleDateString(),
        dateForEntry: dateForEntry.toISOString(),
        dateTimestamp: dateForEntry.getTime(),
        dateForEntryString: dateForEntry.toLocaleDateString(),
        dateForEntryLocal: `${year}-${month+1}-${day}`,
        timezone,
        isDST,
        timezoneOffset: localDate.getTimezoneOffset(),
        standardTimezoneOffset: new Date(localDate.getFullYear(), 0, 1).getTimezoneOffset(),
        backendTimeData: timeData || 'Nicht verfügbar'
      });
      
      // Berechne die Dauer in Sekunden
      const durationInSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      
      // Speichere zusätzlich die Jahreszahl, den Monat und den Tag als separate Felder
      // Dies hilft bei Datenbankabfragen und vermeidet Probleme mit Zeitzonen
      
      // Zeiteintrag-Daten vorbereiten
      const timeEntryData = {
        userId: userId,
        userName: userData?.user?.displayName || '',
        userEmail: userData?.user?.email || '',
        startTime: startTime.toISOString(), // Als ISO-String speichern
        endTime: endTime.toISOString(),     // Als ISO-String speichern
        date: dateForEntry.toISOString().split('T')[0],
        year: year,
        month: month + 1, // JavaScript Monate sind 0-basiert, für Firestore korrigieren
        day: day,
        duration: durationInSeconds - (pauseTime * 60),
        pauseMinutes: pauseTime,
        status: 'draft', // Als Entwurf speichern, nicht als 'pending'
        note: note || '',
        customerId: selectedCustomerId || '',
        customerName: customerName || '',
        projectId: selectedProjectId || '',
        projectName: projectName || '',
        timezone: timezone,
        isDST: isDST,
        timezoneOffset: timeData?.timezoneOffset || localDate.getTimezoneOffset() * -1
      };
      
      // Debug-Log für die Zeit- und Datumsüberprüfung
      console.log('Zeitberechnung und Speicherung:', {
        startTimeObj: startTime,
        startTimeISO: startTime.toISOString(),
        endTimeObj: endTime,
        endTimeISO: endTime.toISOString(),
        entryDate: dateForEntry.toISOString(),
        entryDateLocal: `${year}-${month+1}-${day}`,
        timezone: timezone
      });
      
      // Speichern in Firestore
      const docRef = await addDoc(collection(db, "timeEntries"), timeEntryData);
      console.log("Zeiteintrag erstellt mit ID:", docRef.id);
      
      // Bestätigung anzeigen
      toast({
        title: "Erfolg",
        description: "Zeiteintrag wurde erfolgreich gespeichert.",
      });
      
      // Nachfragen, ob sofort zur Genehmigung eingereicht werden soll
      showSubmitForApprovalConfirmation(docRef.id);
      
      return docRef.id;
    } catch (error) {
      console.error('Fehler beim Erstellen des Zeiteintrags:', error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
      return null;
    }
  };

  // Anfrage zur sofortigen Einreichung anzeigen
  const showSubmitForApprovalConfirmation = (entryId: string) => {
    // Nur für Mitarbeiter sinnvoll, nicht für Admins/Manager
    if (userData.role === "admin" || userData.role === "manager") {
      return;
    }
    
    // Pauseninfo formatieren
    const pauseInfo = pauseTime > 0 ? ` (inkl. ${pauseTime} Min. Pause)` : "";
    
    // Dauer formatieren
    const formatDurationString = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    };
    
    toast({
      title: "Zeiteintrag gespeichert",
      description: (
        <div className="mt-2">
          <p>Zeiteintrag: {formatDurationString(elapsedTime)}{pauseInfo}</p>
          <p>Möchten Sie den Zeiteintrag zur Genehmigung einreichen?</p>
          <div className="flex gap-2 mt-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => submitForApproval(entryId)}
              className="flex-1"
            >
              Ja, einreichen
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {}}
              className="flex-1"
            >
              Später
            </Button>
          </div>
        </div>
      ),
      duration: 10000, // 10 Sekunden anzeigen
    });
  };

  // Zeiteintrag zur Genehmigung einreichen
  const submitForApproval = async (entryId: string) => {
    try {
      await submitTimeEntryForApproval(entryId);
      
      toast({
        title: "Erfolg",
        description: "Zeiteintrag wurde zur Genehmigung eingereicht.",
      });
    } catch (error) {
      console.error("Fehler beim Einreichen des Zeiteintrags:", error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht eingereicht werden.",
        variant: "destructive"
      });
    }
  };
  
  // Zurücksetzen des Timers nach dem Speichern
  const resetTimer = () => {
    // Timer-Zustand zurücksetzen
    setIsRunning(false);
    setIsPaused(false);
    setElapsedTime(0);
    setPauseTime(0);
    setPauseSeconds(0);
    setStartTime(null);
    
    // Notiz und Projektzuordnung zurücksetzen, wenn gewünscht
    setNote("");
    
    // Timer-Referenzen aufräumen
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (pauseTimerRef.current) {
      clearInterval(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    
    // Aktiven Timer aus Firestore entfernen
    if (userId) {
      const timerDocRef = doc(db, "users", userId, "activeTimers", "current");
      deleteDoc(timerDocRef).catch(error => {
        console.error("Fehler beim Löschen des aktiven Timers:", error);
      });
    }
  };

  // Funktion zum Konvertieren eines Datums von lokalem Format nach ISO-String mit Zeitzone
  const formatDateToISOWithTZ = (date: Date): string => {
    try {
      // ISO-String enthält immer die Zeit in UTC (Z)
      const isoString = date.toISOString();
      
      // Debug-Info zur Zeitzonenbehandlung
      console.log("Zeitzonendaten beim Formatieren:", {
        originalDate: date.toString(),
        localTimeString: date.toLocaleString(),
        isoString: isoString,
        timezoneOffset: date.getTimezoneOffset()
      });
      
      return isoString;
    } catch (error) {
      console.error("Fehler beim Formatieren des Datums zu ISO:", error);
      // Fallback: Aktuelles Datum
      return new Date().toISOString();
    }
  };

  // Debug-Funktion für Zeitzonenprobleme
  const debugTimezonesAndDates = () => {
    const now = new Date();
    
    // Zeitzonendaten sammeln
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
    const isDST = now.getTimezoneOffset() < new Date(now.getFullYear(), 0, 1).getTimezoneOffset();
    const utcOffset = now.getTimezoneOffset() * -1; // Umkehren für bessere Lesbarkeit
    
    // Formatierung in verschiedenen Formaten
    const localDate = now.toLocaleDateString();
    const localTime = now.toLocaleTimeString();
    const isoString = now.toISOString();
    
    // Zeitrechnungen für den aktuellen Tag
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    
    // Sicherstellen, dass keine NaN-Werte vorhanden sind
    const validDates = {
      now: !isNaN(now.getTime()),
      startOfDay: !isNaN(startOfDay.getTime()),
      endOfDay: !isNaN(endOfDay.getTime())
    };
    
    // Zeitberechnungen
    let elapsedTimeObj = null;
    if (startTime) {
      const diffMs = now.getTime() - startTime.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const pauseSec = pauseTime * 60;
      const netSeconds = diffSec - pauseSec;
      
      elapsedTimeObj = {
        diffMs,
        diffSec,
        pauseSec,
        netSeconds,
        formattedNet: timeUtils.formatDuration(netSeconds, true)
      };
    }
    
    // Zeitzonenüberprüfung mit timeUtils
    const timeUtilsInfo = {
      defaultTimezone: timeUtils.getDefaultTimezone(),
      timezoneInfo: timeUtils.getTimezoneInfo(),
      nowMoment: timeUtils.getNow().format(),
      debugInfo: startTime ? timeUtils.debugTimeCalculation(startTime, now, pauseTime) : null
    };
    
    // Ergebnis ausgeben
    console.log("=== ZEITDEBUG ===");
    console.log("Zeitzonendaten:", {
      timezone,
      isDST,
      utcOffset: `${utcOffset >= 0 ? "+" : ""}${Math.floor(utcOffset / 60)}:${String(utcOffset % 60).padStart(2, "0")}`,
      timezoneInfo: timeUtilsInfo.timezoneInfo
    });
    console.log("Aktuelles Datum/Zeit:", {
      jsDate: now.toString(),
      localDate,
      localTime,
      isoString,
      validDates
    });
    console.log("Timer-Status:", {
      isRunning,
      isPaused,
      startTime: startTime ? startTime.toISOString() : null,
      elapsedTime,
      pauseTime,
      elapsedTimeCalculation: elapsedTimeObj
    });
    console.log("TimeUtils Debug:", timeUtilsInfo);
    console.log("=================");
    
    // Auch als Toast anzeigen für UI-Feedback
    toast({
      title: "Debug-Info",
      description: `Timezone: ${timezone} (${isDST ? "Sommerzeit" : "Winterzeit"}), Offset: ${utcOffset} Min.`,
      duration: 5000,
    });
    
    return {
      timezone,
      isDST,
      utcOffset,
      now,
      localDate,
      localTime,
      isoString,
      startTime: startTime ? startTime.toISOString() : null,
      validDates,
      elapsedTimeObj,
      timeUtilsInfo
    };
  };

  // Start des Renders
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">
          {t('timeTracking.title', 'Zeiterfassung')}
        </h2>
        
        <Card>
          <Tabs defaultValue="timer" value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-3">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="timer">
                  {t('timeTracking.automaticTracker', 'Automatisch')}
                </TabsTrigger>
                <TabsTrigger value="manual">
                  {t('timeTracking.manualEntry', 'Manuell')}
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            
            <CardContent>
              <TabsContent value="timer" className="space-y-4">
                {/* Original-Timer-Inhalte */}
                <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
                  <div className="p-6 space-y-4">
                    {/* Header mit Aufklappen/Zuklappen */}
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold leading-none tracking-tight">
                        Zeiterfassung
                      </h3>
                      <div className="flex space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={handleExpandCollapse}
                        >
                          {isExpanded ? <ChevronUp /> : <ChevronDown />}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Datumsauswahl - immer sichtbar, aber nicht mehr änderbar */}
                    <div className="space-y-2">
                      <Label htmlFor="date">
                        {t('timeTracking.date', 'Datum')}
                      </Label>
                      <Input
                        type="date"
                        value={currentLocalDate}
                        disabled={true}
                        id="date"
                      />
                    </div>

                    {/* Kundenauswahl - immer sichtbar */}
                    <div className="space-y-2">
                      <Label htmlFor="customer">
                        {t('timeTracking.customer', 'Kunde')} <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={selectedCustomerId}
                        onValueChange={handleCustomerChange}
                        disabled={isRunning || loadingCustomers}
                      >
                        <SelectTrigger id="customer">
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
                    
                    {/* Projektauswahl - immer sichtbar */}
                    <div className="space-y-2">
                      <Label htmlFor="project">
                        {t('timeTracking.project', 'Projekt')} <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={selectedProjectId}
                        onValueChange={handleProjectChange}
                        disabled={isRunning || loadingProjects || !selectedCustomerId}
                      >
                        <SelectTrigger id="project">
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
                    
                    {/* Timer-Anzeige */}
                    <div className="flex flex-col space-y-2">
                      <div className="text-3xl font-bold text-center">
                        {formatElapsedTime()}
                      </div>
                      
                      {/* Pausenanzeige */}
                      {isRunning && (
                        <div className="flex justify-between items-center">
                          <div className="text-sm">
                            <span className="font-medium">Status:</span> {isPaused ? 
                              <span className="text-amber-500 font-medium">Pausiert</span> : 
                              <span className="text-green-500 font-medium">Aktiv</span>}
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">Pause:</span> <span className={isPaused ? "text-amber-500 font-medium" : ""}>
                              {formatPauseTime()}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Start/Pause/Resume Buttons */}
                      <div className="flex justify-center space-x-2 pt-4">
                        {!isRunning ? (
                          <Button
                            onClick={startTimer}
                            size="sm"
                            className="px-4"
                            disabled={!selectedCustomerId || !selectedProjectId}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            {t('timeTracking.start', 'Start')}
                          </Button>
                        ) : (
                          <>
                            {isPaused ? (
                              <Button
                                onClick={resumeTimer}
                                size="sm"
                                variant="default"
                              >
                                <Play className="mr-2 h-4 w-4" />
                                {t('timeTracking.resume', 'Fortsetzen')}
                              </Button>
                            ) : (
                              <Button
                                onClick={pauseTimer}
                                size="sm"
                                variant="secondary"
                              >
                                <Pause className="mr-2 h-4 w-4" />
                                {t('timeTracking.pause', 'Pause')}
                              </Button>
                            )}
                            <Button
                              onClick={() => setShowConfirm(true)}
                              size="sm"
                              variant="destructive"
                            >
                              <Square className="mr-2 h-4 w-4" />
                              {t('timeTracking.stop', 'Stop')}
                            </Button>
                          </>
                        )}
                      </div>
                      
                      {/* Erweiterte Eingabefelder */}
                      {isExpanded && (
                        <div className="mt-4 space-y-4">
                          {/* Notizen */}
                          <div className="space-y-2">
                            <Label htmlFor="note" className="block text-sm font-medium">
                              {t('timeTracking.note', 'Notiz')}
                            </Label>
                            <Input
                              id="note"
                              ref={noteInputRef}
                              value={note}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
                              placeholder={t('timeTracking.notePlaceholder', 'Notizen zur Tätigkeit')}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="manual" className="space-y-4">
                {/* Manuelle Zeiterfassung über die neue Komponente */}
                <ManualTimeEntry 
                  customers={customers}
                  projects={projects}
                  formatLocalDateForInput={formatLocalDateForInput}
                  onEntryCreated={(entryId) => {
                    // Aktualisieren der Zeiteinträge oder andere Aktionen nach Erstellung
                    console.log("Manueller Zeiteintrag erstellt:", entryId);
                    // Optional: Dialog zur Genehmigung anzeigen
                    if (entryId) {
                      showSubmitForApprovalConfirmation(entryId);
                    }
                  }}
                />
              </TabsContent>
            </CardContent>
          </Tabs>
                  
          {/* Bestätigungsdialog für das Stoppen des Timers */}
          {showConfirm && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
                <h3 className="text-lg font-semibold mb-4">
                  {t('timeTracking.stopConfirmation', 'Timer stoppen')}
                </h3>
                <p className="mb-4">
                  {t('timeTracking.stopConfirmationText', 'Möchten Sie den Timer wirklich stoppen?')}
                </p>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={cancelStopTimer}>
                    {t('timeTracking.cancel', 'Abbrechen')}
                  </Button>
                  <Button onClick={confirmStopTimer}>
                    {t('timeTracking.confirm', 'Bestätigen')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Debug-Button für Entwickler hinzufügen */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-3 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={debugTimezonesAndDates}
          >
            Debug Zeitzonen
          </Button>
          
          {startTime && (
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <div>Start: {startTime.toLocaleString()}</div>
              <div>ISO: {startTime.toISOString()}</div>
              <div>Offset: {startTime.getTimezoneOffset() * -1} Min.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TimeTracker;
