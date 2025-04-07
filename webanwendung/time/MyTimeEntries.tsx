import React, { FC, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pencil,
  Trash2,
  Clock,
  Send,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { getTimeEntriesByUserId, deleteTimeEntry } from "@/lib/db/timeEntries";
import { submitTimeEntryForApproval } from "@/lib/services/timeEntryService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Lokale Typdefinition für TimeEntry
interface TimeEntry {
  id: string;
  userId: string;
  startTime: string | Date;
  endTime?: string | Date;
  duration?: number;
  pauseMinutes?: number;
  status: string;
  note?: string;
  projectName?: string;
  customerName?: string;
  [key: string]: any;
}

const MyTimeEntries: FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  
  useEffect(() => {
    loadTimeEntries();
  }, [user]);
  
  const loadTimeEntries = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const entries = await getTimeEntriesByUserId(user.uid);
      setTimeEntries(entries as unknown as TimeEntry[]);
    } catch (error) {
      console.error("Fehler beim Laden der Zeiteinträge:", error);
      toast({
        title: "Fehler",
        description: "Die Zeiteinträge konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async (id: string) => {
    try {
      await deleteTimeEntry(id);
      setTimeEntries(prev => prev.filter(entry => entry.id !== id));
      toast({
        title: "Erfolg",
        description: "Der Zeiteintrag wurde gelöscht.",
      });
    } catch (error) {
      console.error("Fehler beim Löschen des Zeiteintrags:", error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };
  
  const handleEdit = (entry: TimeEntry) => {
    navigate(`/time-tracking/edit/${entry.id}`);
  };
  
  const handleSubmit = async (entry: TimeEntry) => {
    try {
      await submitTimeEntryForApproval(entry.id);
      
      // Lokalen Zustand aktualisieren
      setTimeEntries(prev => 
        prev.map(item => 
          item.id === entry.id 
            ? { ...item, status: "pending", submittedAt: new Date().toISOString() }
            : item
        )
      );
      
      toast({
        title: "Erfolg",
        description: "Der Zeiteintrag wurde zur Genehmigung eingereicht.",
      });
    } catch (error) {
      console.error("Fehler beim Einreichen des Zeiteintrags:", error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht eingereicht werden.",
        variant: "destructive",
      });
    }
  };
  
  const openDetailDialog = (entry: TimeEntry) => {
    setSelectedEntry(entry);
    setDetailDialogOpen(true);
  };
  
  // Hilfsfunktion für Status-Badge
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'entwurf':
      case 'draft':
        return <Badge variant="outline" className="bg-gray-100">Entwurf</Badge>;
      case 'eingereicht':
      case 'pending':
      case 'submitted':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800">Eingereicht</Badge>;
      case 'bestätigt':
      case 'approved':
        return <Badge variant="outline" className="bg-green-100 text-green-800">Genehmigt</Badge>;
      case 'abgelehnt':
      case 'rejected':
        return <Badge variant="outline" className="bg-red-100 text-red-800">Abgelehnt</Badge>;
      case 'überarbeitung':
      case 'revision':
        return <Badge variant="outline" className="bg-amber-100 text-amber-800">Zur Überarbeitung</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  // Hilfsfunktion zur Prüfung, ob ein Eintrag bearbeitet werden kann
  const isEntryEditable = (status: string) => {
    return status.toLowerCase() === 'entwurf' || 
           status.toLowerCase() === 'draft' || 
           status.toLowerCase() === 'abgelehnt' || 
           status.toLowerCase() === 'rejected' ||
           status.toLowerCase() === 'revision' ||
           status.toLowerCase() === 'überarbeitung';
  };
  
  // Hilfsfunktion zur Prüfung, ob ein Eintrag eingereicht werden kann
  const isEntrySubmittable = (status: string) => {
    return status.toLowerCase() === 'entwurf' || 
           status.toLowerCase() === 'draft' || 
           status.toLowerCase() === 'abgelehnt' || 
           status.toLowerCase() === 'rejected' ||
           status.toLowerCase() === 'revision' ||
           status.toLowerCase() === 'überarbeitung' ||
           status.toLowerCase() === 'completed';
  };
  
  // Berechne die Dauer des Zeiteintrags
  const formatDuration = (entry: TimeEntry) => {
    if (!entry.duration && (!entry.startTime || !entry.endTime)) {
      return "Unbekannt";
    }
    
    // Falls die Dauer direkt vorhanden ist
    if (entry.duration) {
      const hours = Math.floor(entry.duration / 3600);
      const minutes = Math.floor((entry.duration % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
    
    // Überprüfe, ob die Datumswerte gültig sind
    const startTime = new Date(entry.startTime);
    const endTime = new Date(entry.endTime!);
    
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return "Ungültiger Zeitraum";
    }
    
    // Ansonsten aus Start- und Endzeit berechnen
    const diffInMs = endTime.getTime() - startTime.getTime();
    const diffInMinutes = diffInMs / (1000 * 60);
    const pauseMinutes = entry.pauseMinutes || 0;
    
    const netMinutes = diffInMinutes - pauseMinutes;
    const hours = Math.floor(netMinutes / 60);
    const minutes = Math.floor(netMinutes % 60);
    
    return `${hours}h ${minutes}m`;
  };
  
  // Neue Hilfsfunktion zur sicheren Konvertierung von Datums- und Zeitwerten
  const safeParseDate = (dateValue: any): Date | null => {
    if (!dateValue) return null;
    
    try {
      // Wenn es bereits ein Date-Objekt ist
      if (dateValue instanceof Date) {
        return isNaN(dateValue.getTime()) ? null : dateValue;
      }
      
      // Wenn es ein Firebase Timestamp ist (hat toDate Methode)
      if (typeof dateValue === 'object' && dateValue.toDate && typeof dateValue.toDate === 'function') {
        const convertedDate = dateValue.toDate();
        return isNaN(convertedDate.getTime()) ? null : convertedDate;
      }
      
      // Wenn es ein String oder Number ist
      if (typeof dateValue === 'string' || typeof dateValue === 'number') {
        // Versuche als ISO-String zu parsen
        const parsedDate = new Date(dateValue);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
        
        // Weitere Parsing-Versuche für bekannte Formate könnten hier hinzugefügt werden
      }
      
      // Alle Versuche fehlgeschlagen
      console.warn('Ungültiges Datumsformat:', dateValue);
      return null;
    } catch (error) {
      console.error('Fehler beim Parsen des Datums:', error, dateValue);
      return null;
    }
  };
  
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  
  if (timeEntries.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <Clock className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Keine Zeiteinträge gefunden</h3>
          <p className="text-muted-foreground mb-4">Sie haben noch keine Arbeitszeiten erfasst</p>
          <Button onClick={() => navigate("/time-tracking")}>
            Zeit erfassen
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-semibold">Meine Zeiteinträge</h2>
        <Button onClick={() => navigate("/time-tracking")}>
          Neue Zeit erfassen
        </Button>
      </div>
      
      <Separator className="mb-4" />
      
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Zeitraum</TableHead>
                <TableHead>Projekt</TableHead>
                <TableHead>Dauer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timeEntries.map((entry) => {
                // Daten mit der neuen sicheren Methode parsen
                const startTime = safeParseDate(entry.startTime);
                const endTime = safeParseDate(entry.endTime);
                const entryDate = safeParseDate(entry.date);
                
                // Debug-Ausgabe
                console.log("Zeiteintrag:", entry.id, {
                  startTime: entry.startTime,
                  startTimeType: typeof entry.startTime,
                  startTimeObj: startTime ? startTime.toString() : "Invalid Date",
                  startTimeValid: startTime !== null,
                  endTime: entry.endTime,
                  endTimeType: typeof entry.endTime,
                  endTimeObj: endTime ? endTime.toString() : "Invalid Date",
                  endTimeValid: endTime !== null,
                  date: entry.date
                });
                
                // Überprüfungen vereinfacht durch Nutzung der safeParseDate Funktion
                const isValidStartTime = startTime !== null;
                const isValidEndTime = endTime !== null;
                const isValidDate = entryDate !== null;
                
                return (
                  <TableRow key={entry.id} onClick={() => openDetailDialog(entry)} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      {isValidDate
                        ? format(entryDate!, "dd.MM.yyyy", { locale: de })
                        : isValidStartTime 
                          ? format(startTime!, "dd.MM.yyyy", { locale: de })
                          : "Unbekannt"
                      }
                    </TableCell>
                    <TableCell>
                      {isValidStartTime && isValidEndTime
                        ? `${format(startTime!, "HH:mm", { locale: de })} - ${format(endTime!, "HH:mm", { locale: de })}`
                        : isValidStartTime
                          ? `${format(startTime!, "HH:mm", { locale: de })} - ?`
                          : isValidEndTime
                            ? `? - ${format(endTime!, "HH:mm", { locale: de })}`
                            : "Keine Zeit"
                      }
                    </TableCell>
                    <TableCell>{entry.projectName || "Kein Projekt"}</TableCell>
                    <TableCell>
                      {formatDuration(entry)}
                      {entry.pauseMinutes && entry.pauseMinutes > 0 && (
                        <span className="text-xs text-muted-foreground block">
                          ({entry.pauseMinutes} Min. Pause)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {isEntrySubmittable(entry.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSubmit(entry);
                            }}
                          >
                            <Send className="h-4 w-4 mr-1" />
                            <span className="sr-only md:not-sr-only">Einreichen</span>
                          </Button>
                        )}
                        
                        {isEntryEditable(entry.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(entry);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            <span className="sr-only md:not-sr-only">Bearbeiten</span>
                          </Button>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(entry.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          <span className="sr-only md:not-sr-only">Löschen</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Detail Dialog */}
      {selectedEntry && (
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex justify-between items-center">
                Zeiteintrag Details
                {getStatusBadge(selectedEntry.status)}
              </DialogTitle>
              <DialogDescription>
                Details zum Zeiteintrag vom {
                  (() => {
                    const entryDate = safeParseDate(selectedEntry.date);
                    const startTime = safeParseDate(selectedEntry.startTime);
                    
                    if (entryDate) {
                      return format(entryDate, "dd.MM.yyyy", { locale: de });
                    } else if (startTime) {
                      return format(startTime, "dd.MM.yyyy", { locale: de });
                    } else {
                      return "Unbekanntes Datum";
                    }
                  })()
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-4 py-4">
              <div>
                <h4 className="text-sm font-medium mb-1">Projekt</h4>
                <p className="text-sm text-muted-foreground">{selectedEntry.projectName || "Kein Projekt"}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-1">Kunde</h4>
                <p className="text-sm text-muted-foreground">{selectedEntry.customerName || "Kein Kunde"}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-1">Zeitraum</h4>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const startTime = safeParseDate(selectedEntry.startTime);
                    const endTime = safeParseDate(selectedEntry.endTime);
                    
                    const startValid = startTime !== null;
                    const endValid = endTime !== null;
                    
                    if (startValid && endValid) {
                      return `${format(startTime, "HH:mm", { locale: de })} - ${format(endTime, "HH:mm", { locale: de })}`;
                    } else if (startValid) {
                      return `${format(startTime, "HH:mm", { locale: de })} - ?`;
                    } else if (endValid) {
                      return `? - ${format(endTime, "HH:mm", { locale: de })}`;
                    } else {
                      return "Keine Zeit";
                    }
                  })()}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-1">Dauer</h4>
                <p className="text-sm text-muted-foreground">{formatDuration(selectedEntry)}</p>
              </div>
              {selectedEntry.pauseMinutes && selectedEntry.pauseMinutes > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Pause</h4>
                  <p className="text-sm text-muted-foreground">{selectedEntry.pauseMinutes} Minuten</p>
                </div>
              )}
              {selectedEntry.note && (
                <div className="col-span-2">
                  <h4 className="text-sm font-medium mb-1">Notiz</h4>
                  <p className="text-sm text-muted-foreground">{selectedEntry.note}</p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <div className="flex gap-2 w-full">
                {isEntrySubmittable(selectedEntry.status) && (
                  <Button
                    variant="outline"
                    className="flex-1 text-blue-600"
                    onClick={() => {
                      handleSubmit(selectedEntry);
                      setDetailDialogOpen(false);
                    }}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Zur Genehmigung einreichen
                  </Button>
                )}
                
                {isEntryEditable(selectedEntry.status) && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      handleEdit(selectedEntry);
                      setDetailDialogOpen(false);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Bearbeiten
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  className="flex-1 text-destructive"
                  onClick={() => {
                    handleDelete(selectedEntry.id);
                    setDetailDialogOpen(false);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Löschen
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default MyTimeEntries; 