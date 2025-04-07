import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, Timer, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface TimeCompactDisplayProps {
  currentHours: number;
  targetHours: number;
  hoursLastWeek: number;
  loading?: boolean;
  onStartTracking?: () => void;
  isTracking?: boolean;
  trackingStartTime?: Date;
  currentProject?: string;
  currentCustomer?: string;
}

const TimeCompactDisplay = ({
  currentHours,
  targetHours,
  hoursLastWeek,
  loading = false,
  onStartTracking,
  isTracking = false,
  trackingStartTime,
  currentProject,
  currentCustomer,
}: TimeCompactDisplayProps) => {
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [progress, setProgress] = useState(0);
  
  // Berechnet den Fortschritt in Prozent
  useEffect(() => {
    if (targetHours > 0) {
      setProgress(Math.min(100, Math.round((currentHours / targetHours) * 100)));
    } else {
      setProgress(0);
    }
  }, [currentHours, targetHours]);
  
  // Aktualisiert die verstrichene Zeit, wenn Zeiterfassung aktiv ist
  useEffect(() => {
    if (!isTracking || !trackingStartTime) {
      return;
    }
    
    const timer = setInterval(() => {
      const now = new Date();
      const diffMs = now.getTime() - trackingStartTime.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      
      setElapsedTime(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isTracking, trackingStartTime]);
  
  return (
    <Card className="w-full shadow-sm">
      <CardContent className="pt-6">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-3/4 mx-auto" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3 mx-auto" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Aktuelle Zeiterfassung (wenn aktiv) */}
            {isTracking && (
              <div className="bg-green-50 border border-green-100 rounded-md p-3 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <Clock className="h-5 w-5 text-green-600 animate-pulse mr-2" />
                    <div>
                      <div className="text-sm text-green-800 font-medium">Zeiterfassung läuft</div>
                      <div className="text-xs text-green-600">
                        Seit {trackingStartTime && format(trackingStartTime, 'HH:mm', { locale: de })} Uhr
                      </div>
                    </div>
                  </div>
                  <div className="font-mono text-lg font-bold text-green-700">
                    {elapsedTime}
                  </div>
                </div>
                
                {/* Projekt- und Kundeninformationen */}
                {(currentProject || currentCustomer) && (
                  <div className="text-xs text-green-700 border-t border-green-100 pt-2 mt-1">
                    {currentCustomer && <div><span className="font-medium">Kunde:</span> {currentCustomer}</div>}
                    {currentProject && <div><span className="font-medium">Projekt:</span> {currentProject}</div>}
                  </div>
                )}
              </div>
            )}
            
            {/* Wochenstatus */}
            <div className="text-center">
              <div className="flex justify-center items-center gap-2 mb-1">
                <Timer className="h-5 w-5 text-primary" />
                <h3 className="font-medium">Wochenstatus</h3>
              </div>
              <div className="flex justify-center items-baseline gap-1 mb-3">
                <span className="text-3xl font-bold">{currentHours.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">/ {targetHours.toFixed(1)} Stunden</span>
              </div>
              
              <div className="space-y-1.5 mb-3">
                <Progress 
                  value={progress} 
                  className={`h-2 ${progress > 90 ? 'bg-green-200' : ''}`}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0h</span>
                  <span>{targetHours}h</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-left text-muted-foreground">Letzte Woche:</div>
                <div className="text-right font-medium">{hoursLastWeek.toFixed(1)} Stunden</div>
                
                <div className="text-left text-muted-foreground">Status:</div>
                <div className="text-right">
                  {currentHours >= targetHours ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Erfüllt</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      {(targetHours - currentHours).toFixed(1)}h offen
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            
            {/* Zeiterfassung starten Button (wenn nicht aktiv) */}
            {!isTracking && onStartTracking && (
              <Button 
                onClick={onStartTracking} 
                className="w-full" 
                variant="outline"
              >
                <Clock className="mr-2 h-4 w-4" />
                Zeiterfassung starten
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TimeCompactDisplay; 