import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Clock, Play, Pause } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { onSnapshot, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getDatabase, ref, onValue } from "firebase/database";
import { database } from "@/lib/firebase";

// Interface für Timer-Daten
interface TimerData {
  isRunning?: boolean;
  isPaused?: boolean;
  startTime?: any;
  elapsedTime?: number;
  pauseTime?: number;        // Gesamtpausenzeit in Minuten (vom Server)
  currentPauseStart?: any;   // Wann wurde die aktuelle Pause gestartet
  customerId?: string;
  customerName?: string;
  projectId?: string;
  projectName?: string;
}

interface TimeTrackerStatusProps {
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

const TimeTrackerStatus: React.FC<TimeTrackerStatusProps> = ({ 
  onClick, 
  className,
  children 
}) => {
  const userData = useUser();
  const userId = userData.user?.uid || "";
  
  // Timer-Status
  const [timerData, setTimerData] = useState<TimerData | null>(null);
  const [displayTime, setDisplayTime] = useState<string>("00:00:00");
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pauseStartTime, setPauseStartTime] = useState<Date | null>(null);
  const [pauseSeconds, setPauseSeconds] = useState(0);

  // Referenz für die letzte verstrichene Zeit, um Neustart zu vermeiden
  const lastTimerStateRef = useRef<{
    elapsedTime: number;
    startTime: Date | null;
    lastSyncTime: number;
  } | null>(null);
  
  // Beim ersten Laden den gespeicherten Timer-Status abrufen
  useEffect(() => {
    const savedTimerState = localStorage.getItem('lastTimerStatus');
    if (savedTimerState) {
      try {
        const parsedState = JSON.parse(savedTimerState);
        if (parsedState && parsedState.active) {
          lastTimerStateRef.current = {
            elapsedTime: parsedState.elapsedTime || 0,
            startTime: parsedState.startTime ? new Date(parsedState.startTime) : null,
            lastSyncTime: parsedState.lastSyncTime || Date.now()
          };
          console.log("Gespeicherter Timer-Status geladen:", lastTimerStateRef.current);
        }
      } catch (err) {
        console.error("Fehler beim Parsen des gespeicherten Timer-Status:", err);
      }
    }
  }, []);
  
  // Abonniere Änderungen am aktiven Timer
  useEffect(() => {
    if (!userId) return;
    
    // Firebase-Dokument-Referenz für den aktiven Timer
    const timerDocRef = doc(db, "users", userId, "activeTimers", "current");
    
    const unsubscribe = onSnapshot(timerDocRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data() as TimerData;
        setTimerData(data);
        setIsRunning(true);
        
        // Prüfen, ob der Pausenstatus sich geändert hat
        const wasPaused = isPaused;
        const isPausedNow = data.isPaused || false;
        setIsPaused(isPausedNow);
        
        // Pausenzeit-Tracking - hier nur tracken, wann die aktuelle Pause startete
        if (!wasPaused && isPausedNow) {
          // Aktuelle Pausenstartzeit vom Server verwenden, wenn vorhanden
          let pauseStart: Date;
          if (data.currentPauseStart) {
            if (typeof data.currentPauseStart === 'string') {
              pauseStart = new Date(data.currentPauseStart);
            } else if (data.currentPauseStart.toDate) {
              pauseStart = data.currentPauseStart.toDate();
            } else {
              pauseStart = new Date();
            }
          } else {
            pauseStart = new Date();
          }
          
          setPauseStartTime(pauseStart);
          // Die Pausensekunden auf 0 setzen, aber nur für die aktuelle Pausenanzeige
          setPauseSeconds(0);
          
          console.log('Pause gestartet - Server-Pausenzeit:', data.pauseTime || 0, 'Minuten');
        } else if (wasPaused && !isPausedNow) {
          // Pause beendet - Pausentimer zurücksetzen
          setPauseStartTime(null);
          console.log('Pause beendet - Server-Pausenzeit:', data.pauseTime || 0, 'Minuten');
        }
        
        // WICHTIG: Auch die Realtime Database für den Status prüfen
        const realtimeRef = ref(database, `activeTimers/${userId}`);
        onValue(realtimeRef, (snapshot) => {
          const realtimeData = snapshot.val();
          if (realtimeData && realtimeData.active) {
            // Realtime-Daten mit Firestore synchronisieren
            if (realtimeData.elapsedTime && typeof realtimeData.elapsedTime === 'number') {
              // Status im localStorage für Neuladen speichern
              localStorage.setItem('lastTimerStatus', JSON.stringify({
                ...realtimeData,
                lastSyncTime: Date.now()
              }));
            }
          }
        }, { onlyOnce: true });
        
        // Immer die vom Server gelieferten Werte für die verstrichene Zeit verwenden
        if (typeof data.elapsedTime === 'number') {
          // Hier findet der Hauptfix statt, um zu verhindern, dass der Timer zurückgesetzt wird
          // Wir kalkulieren die tatsächliche verstrichene Zeit unter Berücksichtigung der Zeit seit dem letzten Sync
          
          // 1. Speichere den aktuellen Wert als Referenz
          const serverElapsedSeconds = data.elapsedTime;
          
          // 2. Prüfe, ob wir bereits einen Timer-Zustand haben
          if (lastTimerStateRef.current) {
            // 3. Berechne, wie viel Zeit seit dem letzten Sync vergangen ist
            const timeSinceLastSync = (Date.now() - lastTimerStateRef.current.lastSyncTime) / 1000;
            
            // 4. Vergleiche den Server-Wert mit unserem letzten gespeicherten Wert plus der Zeit seit dem letzten Sync
            const calculatedElapsedTime = lastTimerStateRef.current.elapsedTime + timeSinceLastSync;
            
            // 5. Wenn der Server-Wert größer ist, verwende ihn, sonst unsere Berechnung
            const bestEstimateElapsedTime = Math.max(serverElapsedSeconds, calculatedElapsedTime);
            
            console.log("Timer-Synchronisierung:", {
              server: serverElapsedSeconds,
              calculated: calculatedElapsedTime,
              used: bestEstimateElapsedTime
            });
            
            setElapsedSeconds(Math.round(bestEstimateElapsedTime));
          } else {
            // Kein vorheriger Zustand, verwende Server-Wert direkt
            setElapsedSeconds(serverElapsedSeconds);
          }
          
          // Aktualisiere unsere Referenz
          lastTimerStateRef.current = {
            elapsedTime: serverElapsedSeconds,
            startTime: data.startTime ? new Date(data.startTime) : null,
            lastSyncTime: Date.now()
          };
        } else if (data.startTime) {
          // Fallback, nur wenn elapsedTime nicht vorhanden
          let startDate: Date;
          
          if (typeof data.startTime === 'string') {
            startDate = new Date(data.startTime);
          } else if (data.startTime.toDate) {
            startDate = data.startTime.toDate();
          } else {
            startDate = new Date();
          }
          
          const now = new Date();
          const diffInSeconds = Math.floor((now.getTime() - startDate.getTime()) / 1000);
          setElapsedSeconds(diffInSeconds);
          
          // Aktualisiere unsere Referenz
          lastTimerStateRef.current = {
            elapsedTime: diffInSeconds,
            startTime: startDate,
            lastSyncTime: Date.now()
          };
        }
      } else {
        // Kein aktiver Timer
        setTimerData(null);
        setIsRunning(false);
        setIsPaused(false);
        setElapsedSeconds(0);
        setPauseStartTime(null);
        setPauseSeconds(0);
        
        // Referenz zurücksetzen und localStorage löschen
        lastTimerStateRef.current = null;
        localStorage.removeItem('lastTimerStatus');
      }
    });
    
    return () => {
      unsubscribe();
      
      // Beim Unmount der Komponente den aktuellen Zustand speichern
      if (isRunning && lastTimerStateRef.current) {
        lastTimerStateRef.current.lastSyncTime = Date.now();
        localStorage.setItem('lastTimerStatus', JSON.stringify({
          active: true,
          elapsedTime: elapsedSeconds,
          startTime: lastTimerStateRef.current.startTime,
          lastSyncTime: lastTimerStateRef.current.lastSyncTime
        }));
      }
    };
  }, [userId]);
  
  // Aktualisiere die angezeigte Zeit jede Sekunde, wenn der Timer läuft
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isRunning && !isPaused) {
      interval = setInterval(() => {
        setElapsedSeconds(prev => {
          const newValue = prev + 1;
          // Aktualisiere auch unsere Referenz
          if (lastTimerStateRef.current) {
            lastTimerStateRef.current.elapsedTime = newValue;
          }
          return newValue;
        });
      }, 1000);
    } else if (isRunning && isPaused && pauseStartTime) {
      // Wenn der Timer pausiert ist, aktualisiere die Pausenzeit
      interval = setInterval(() => {
        const now = new Date();
        const pauseDuration = Math.floor((now.getTime() - pauseStartTime.getTime()) / 1000);
        setPauseSeconds(pauseDuration);
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, isPaused, pauseStartTime]);
  
  // Formatiere die verstrichene Zeit für die Anzeige
  useEffect(() => {
    if (isRunning && !isPaused) {
      // Normale Zeitmessung während der Timer läuft
      // Die gespeicherte Pausenzeit aus timerData verwenden (in Minuten gespeichert)
      const totalPauseSeconds = (timerData?.pauseTime || 0) * 60;
      
      // Bei laufendem Timer nutzen wir elapsedSeconds, welches lokal weiterläuft
      // von dem auf dem Server gespeicherten Wert aus
      const effectiveTime = Math.max(0, elapsedSeconds - totalPauseSeconds);
      const hours = Math.floor(effectiveTime / 3600);
      const minutes = Math.floor((effectiveTime % 3600) / 60);
      const seconds = effectiveTime % 60;
      
      setDisplayTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    } else if (isRunning && isPaused) {
      // Formatiere die laufende Pausenzeit - aktuelle Pause wird angezeigt
      const hours = Math.floor(pauseSeconds / 3600);
      const minutes = Math.floor((pauseSeconds % 3600) / 60);
      const seconds = pauseSeconds % 60;
      
      setDisplayTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }
  }, [elapsedSeconds, timerData?.pauseTime, isPaused, pauseSeconds, isRunning]);
  
  // Formatiere die Gesamtpausenzeit für die Anzeige (alle bisherigen Pausen + aktuelle)
  const formatTotalPauseTime = () => {
    if (!timerData) return "0m";
    
    // Gespeicherte Pausenzeit vom Server in Sekunden
    const storedPauseMinutes = timerData.pauseTime || 0;
    const storedPauseSeconds = storedPauseMinutes * 60;
    
    // Aktuelle Pausensekunden hinzufügen, wenn gerade eine Pause läuft
    const currentPauseSeconds = isPaused && pauseStartTime ? pauseSeconds : 0;
    
    // Gesamtpausenzeit berechnen
    const totalPauseSeconds = storedPauseSeconds + currentPauseSeconds;
    
    // Formatierung - kompaktere Version für den Header
    const hours = Math.floor(totalPauseSeconds / 3600);
    const minutes = Math.floor((totalPauseSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      // Zeige Sekunden nur an, wenn weniger als eine Minute
      return `${Math.floor(totalPauseSeconds)}s`;
    }
  };
  
  // Wenn children vorhanden sind (benutzerdefinierte Inhalte)
  if (children) {
    return (
      <div 
        className={cn(className)} 
        onClick={onClick}
      >
        {children}
      </div>
    );
  }

  // Wenn kein Timer läuft, zeige den "Zeit erfassen" Button
  if (!isRunning) {
    return (
      <div 
        className={cn(
          "flex items-center cursor-pointer px-2 py-1 rounded-md hover:bg-primary/10", 
          className
        )} 
        onClick={onClick}
      >
        <Badge 
          variant="outline" 
          className="flex items-center text-xs bg-background hover:bg-background"
        >
          <Play className="h-3 w-3 text-primary mr-1" />
          <span className="font-medium">Zeit erfassen</span>
        </Badge>
      </div>
    );
  }

  // Anzeige für laufenden Timer verbessern
  return (
    <div 
      className={cn(
        "flex items-center cursor-pointer px-2 py-1 rounded-md hover:bg-primary/10", 
        className
      )} 
      onClick={onClick}
    >
      <Badge 
        variant={isPaused ? "outline" : "default"} 
        className={cn(
          "flex items-center text-xs font-medium whitespace-nowrap",
          isPaused 
            ? "bg-amber-100 text-amber-900 hover:bg-amber-200 border-amber-300" 
            : "bg-green-100 text-green-900 hover:bg-green-200 border-green-300"
        )}
      >
        {isPaused ? (
          <>
            <Pause className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="font-medium mr-1">Pause:</span> 
            <span>{displayTime}</span>
            {(timerData?.pauseTime || 0) > 0 && (
              <span className="text-xs opacity-80 ml-1 hidden sm:inline-block">(Σ: {formatTotalPauseTime()})</span>
            )}
          </>
        ) : (
          <>
            <Play className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="font-medium">{displayTime}</span>
            {(timerData?.pauseTime || 0) > 0 && (
              <span className="text-xs opacity-80 ml-1 hidden sm:inline-block">(P: {formatTotalPauseTime()})</span>
            )}
          </>
        )}
        {timerData?.projectName && !isPaused && (
          <span className="ml-1 max-w-[80px] truncate text-xs opacity-80 hidden md:inline-block border-l border-green-300 pl-1">
            {timerData.projectName}
          </span>
        )}
      </Badge>
    </div>
  );
};

export default TimeTrackerStatus; 