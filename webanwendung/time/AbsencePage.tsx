import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { AbsenceService } from "@/lib/services/absenceService";
import { Absence, AbsenceBalance, AbsenceType, AbsenceStatus, AbsenceFormData } from "@/types/absence";
import { Check, X, Clock, AlertCircle, Edit2 } from "lucide-react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CalendarDays, PlusCircle, Plus } from "lucide-react";
import AbsenceForm from "./AbsenceForm";
import AbsenceList from "./AbsenceList";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Schema für das Absenz-Formular
const absenceFormSchema = z.object({
  type: z.nativeEnum(AbsenceType),
  startDate: z.date(),
  endDate: z.date(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

const AbsencePage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || false; // Prüfe die Benutzerrolle oder setze auf false wenn nicht vorhanden
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  // State
  const [showForm, setShowForm] = useState(false);
  const [editAbsence, setEditAbsence] = useState<Absence | null>(null);
  const [balances, setBalances] = useState<{
    current: AbsenceBalance | null;
    next: AbsenceBalance | null;
  }>({
    current: null,
    next: null,
  });
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const form = useForm<z.infer<typeof absenceFormSchema>>({
    resolver: zodResolver(absenceFormSchema),
    defaultValues: {
      type: AbsenceType.VACATION,
      startDate: new Date(),
      endDate: new Date(),
      reason: "",
      notes: "",
    },
  });

  // Urlaubskonto laden
  const loadBalance = async () => {
    if (!user) return;
    
    setLoadingBalance(true);
    
    try {
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      
      // Urlaubskonten laden
      const [currentBalance, nextBalance] = await Promise.all([
        AbsenceService.getAbsenceBalance(user.uid, currentYear),
        AbsenceService.getAbsenceBalance(user.uid, nextYear),
      ]);
      
      setBalances({
        current: currentBalance,
        next: nextBalance,
      });
      
      // Setze Zeitpunkt der letzten Synchronisation
      setLastSync(new Date());
    } catch (error) {
      console.error("Fehler beim Laden des Urlaubskontos:", error);
      toast({
        title: "Fehler",
        description: "Beim Laden des Urlaubskontos ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setLoadingBalance(false);
    }
  };
  
  // Initialer Load
  useEffect(() => {
    if (user) {
      loadBalance();
      loadUserAbsences();
    }
    
    // Wenn eine ID übergeben wurde, Abwesenheit zum Bearbeiten laden
    if (id) {
      loadAbsenceForEdit(id);
    }
  }, [user, id]);
  
  // Abwesenheit zum Bearbeiten laden
  const loadAbsenceForEdit = async (absenceId: string) => {
    try {
      const absence = await AbsenceService.getAbsenceById(absenceId);
      
      if (!absence) {
        toast({
          title: "Fehler",
          description: "Die angeforderte Abwesenheit wurde nicht gefunden",
          variant: "destructive",
        });
        navigate("/absences");
        return;
      }
      
      // Prüfen, ob der Benutzer berechtigt ist
      if (!isAdmin && user?.uid !== absence.userId) {
        toast({
          title: "Zugriff verweigert",
          description: "Sie sind nicht berechtigt, diese Abwesenheit zu bearbeiten",
          variant: "destructive",
        });
        navigate("/absences");
        return;
      }
      
      setEditAbsence(absence);
      setShowForm(true);
    } catch (error) {
      console.error("Fehler beim Laden der Abwesenheit:", error);
      toast({
        title: "Fehler",
        description: "Beim Laden der Abwesenheit ist ein Fehler aufgetreten",
        variant: "destructive",
      });
      navigate("/absences");
    }
  };
  
  // Formular erfolgreich abgeschlossen
  const handleFormSuccess = () => {
    setShowForm(false);
    setEditAbsence(null);
    loadBalance();
    
    // Wenn wir im Edit-Modus waren, zurück zur Übersicht
    if (id) {
      navigate("/absences");
    }
  };
  
  // Formular abbrechen
  const handleFormCancel = () => {
    setShowForm(false);
    setEditAbsence(null);
    
    // Wenn wir im Edit-Modus waren, zurück zur Übersicht
    if (id) {
      navigate("/absences");
    }
  };
  
  // Bearbeiten einer Abwesenheit
  const handleEdit = (absence: Absence) => {
    navigate(`/absences/edit/${absence.id}`);
  };
  
  // Berechnen des Fortschritts für die Progress-Bar
  const calculateProgress = (balance: AbsenceBalance | null) => {
    if (!balance) return 0;
    const total = balance.totalDays + (balance.carryOverDays || 0);
    if (total === 0) return 0; // Vermeide Division durch Null
    const used = balance.usedDays + balance.pendingDays;
    return Math.min(100, Math.round((used / total) * 100));
  };

  const loadUserAbsences = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      const userAbsences = await AbsenceService.getUserAbsences(user.uid);
      setAbsences(userAbsences);
    } catch (error) {
      console.error("Fehler beim Laden der Abwesenheiten:", error);
      toast({
        title: "Fehler",
        description: "Abwesenheiten konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Aktualisiert sowohl das Urlaubskonto als auch die Abwesenheiten
  const refreshAll = async () => {
    await Promise.all([
      loadBalance(),
      loadUserAbsences()
    ]);
    toast({
      title: "Aktualisiert",
      description: "Alle Daten wurden erfolgreich aktualisiert."
    });
  };

  const onSubmit = async (data: z.infer<typeof absenceFormSchema>) => {
    if (!user) return;
    
    try {
      // Einfaches FormData ohne die zusätzlichen Felder erstellen
      const formData: AbsenceFormData = {
        type: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        notes: data.notes
      };
      
      // Aufruf mit den 4 erwarteten Parametern
      await AbsenceService.createAbsence(
        formData,
        user.uid,
        user.displayName || "Unbekannter Benutzer",
        user.email || "Keine E-Mail"
      );
      
      toast({
        title: "Abwesenheitsantrag eingereicht",
        description: "Ihr Antrag wurde erfolgreich eingereicht und wird geprüft.",
      });
      
      form.reset();
      setOpen(false);
      loadUserAbsences();
    } catch (error) {
      console.error("Fehler beim Erstellen der Abwesenheit:", error);
      toast({
        title: "Fehler",
        description: "Abwesenheitsantrag konnte nicht erstellt werden.",
        variant: "destructive",
      });
    }
  };

  // Filter für aktuelle, ausstehende und vergangene Abwesenheiten
  const currentAbsences = absences.filter(absence => 
    new Date(absence.endDate) >= new Date() && 
    (absence.status === AbsenceStatus.APPROVED || absence.status === AbsenceStatus.PENDING)
  );
  
  const pendingAbsences = absences.filter(absence => 
    absence.status === AbsenceStatus.PENDING
  );
  
  const pastAbsences = absences.filter(absence => 
    new Date(absence.endDate) < new Date() || 
    (absence.status === AbsenceStatus.REJECTED || absence.status === AbsenceStatus.CANCELLED)
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Abwesenheiten</h1>
        
        <div className="flex gap-2">
          {!showForm && (
            <>
              <Button 
                variant="outline" 
                onClick={refreshAll} 
                disabled={loading || loadingBalance}
                title="Daten aktualisieren"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-4 w-4 ${loading || loadingBalance ? 'animate-spin' : ''}`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                  />
                </svg>
                <span className="sr-only">Aktualisieren</span>
              </Button>
              
              <Button onClick={() => setShowForm(true)} className="bg-primary hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" />
                Neue Abwesenheit
              </Button>
            </>
          )}
        </div>
      </div>
      
      <Separator />
      
      {/* Info-Banner für letzte Synchronisation */}
      {lastSync && !showForm && (
        <div className="text-xs text-muted-foreground text-right">
          Letzte Aktualisierung: {format(lastSync, "dd.MM.yyyy, HH:mm:ss", { locale: de })}
        </div>
      )}
      
      {/* Urlaubskonto Karten in einem verbesserten, kompakteren Layout */}
      {!showForm && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Aktuelle Übersicht */}
          <Card className="border-l-4 border-l-primary shadow-sm hover:shadow transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <CalendarDays className="mr-2 h-5 w-5 text-primary" />
                Übersicht {new Date().getFullYear()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBalance ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : balances.current ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Urlaubstage insgesamt:</span>
                    <span className="font-medium">{balances.current.totalDays + (balances.current.carryOverDays || 0)} Tage</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Verbleibend:</span>
                    <span className={`font-bold text-lg ${balances.current.remainingDays < 5 ? 'text-orange-600' : ''}`}>
                      {balances.current.remainingDays} Tage
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <Progress 
                      value={calculateProgress(balances.current)} 
                      className={`h-2 ${calculateProgress(balances.current) > 90 ? 'bg-orange-200' : ''}`}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0</span>
                      <span>{balances.current.totalDays + (balances.current.carryOverDays || 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-muted-foreground text-sm">
                  Kein Urlaubskonto gefunden.
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Genommen & Offen */}
          <Card className="shadow-sm hover:shadow transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <Check className="mr-2 h-5 w-5 text-green-500" />
                Genommen & Anstehend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBalance ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : balances.current ? (
                <div className="grid grid-cols-2 gap-y-2">
                  <div className="text-sm">Genommen:</div>
                  <div className="text-sm font-medium">{balances.current.usedDays} Tage</div>
                  
                  <div className="text-sm">Beantragt:</div>
                  <div className="text-sm font-medium flex items-center">
                    {balances.current.pendingDays} Tage
                    {balances.current.pendingDays > 0 && (
                      <Badge variant="outline" className="ml-1 bg-amber-50">Ausstehend</Badge>
                    )}
                  </div>
                  
                  <div className="text-sm">Übertrag:</div>
                  <div className="text-sm font-medium">
                    {balances.current.carryOverDays || 0} Tage
                  </div>
                  
                  <div className="text-sm font-medium">Krankheitstage:</div>
                  <div className="text-sm font-medium">
                    {balances.current.sickDays || 0} Tage
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-muted-foreground text-sm">
                  Keine Daten verfügbar.
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Nächstes Jahr - Vorplanung */}
          <Card className="border-r-4 border-r-blue-400 shadow-sm hover:shadow transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center">
                <CalendarClock className="mr-2 h-5 w-5 text-blue-500" />
                Planung {new Date().getFullYear() + 1}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBalance ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : balances.next ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Jahresanspruch:</span>
                    <span className="font-medium">{balances.next.totalDays} Tage</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Bereits vorgemerkt:</span>
                    <span className="font-medium">{balances.next.pendingDays} Tage</span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Verfügbar:</span>
                    <span className="font-bold text-lg">{balances.next.totalDays - balances.next.pendingDays} Tage</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 text-muted-foreground text-sm">
                  Kein Urlaubskonto für nächstes Jahr.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Hauptbereich: Formular oder Liste */}
      {showForm ? (
        <AbsenceForm
          initialData={editAbsence ? {
            type: editAbsence.type,
            startDate: editAbsence.startDate,
            endDate: editAbsence.endDate,
            halfDayStart: editAbsence.halfDayStart,
            halfDayEnd: editAbsence.halfDayEnd,
            reason: editAbsence.reason,
            notes: editAbsence.notes,
            documents: [] // Leeres Array für Dokumente
          } : undefined}
          absenceId={editAbsence?.id}
          isEdit={!!editAbsence}
          onSuccess={handleFormSuccess}
          onCancel={handleFormCancel}
        />
      ) : (
        <div className="bg-white rounded-lg border shadow-sm">
          <Tabs defaultValue="current" className="w-full p-1">
            <div className="px-4 pt-4">
              <TabsList className="grid grid-cols-3 mb-4">
                <TabsTrigger value="current" className="text-sm">Aktuelle</TabsTrigger>
                <TabsTrigger value="pending" className="text-sm">Anträge {pendingAbsences.length > 0 && <Badge className="ml-1 bg-amber-500 text-white">{pendingAbsences.length}</Badge>}</TabsTrigger>
                <TabsTrigger value="past" className="text-sm">Archiv</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="current" className="p-4">
              {loading ? (
                <div className="text-center p-4">
                  <Skeleton className="h-8 w-8 rounded-full mx-auto mb-2" />
                  <Skeleton className="h-4 w-40 mx-auto" />
                </div>
              ) : currentAbsences.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between text-sm text-muted-foreground pb-2 border-b">
                    <span>{currentAbsences.length} aktuelle Abwesenheiten</span>
                    <span>Gesamttage: {currentAbsences.reduce((sum, absence) => sum + absence.daysCount, 0)}</span>
                  </div>
                  <AbsenceTable absences={currentAbsences} />
                </div>
              ) : (
                <div className="text-center p-6 my-4">
                  <CalendarDays className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Keine aktuellen Abwesenheiten geplant.</p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setShowForm(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Neue Abwesenheit planen
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="pending" className="p-4">
              {loading ? (
                <div className="text-center p-4">
                  <Skeleton className="h-8 w-8 rounded-full mx-auto mb-2" />
                  <Skeleton className="h-4 w-40 mx-auto" />
                </div>
              ) : pendingAbsences.length > 0 ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 p-3 rounded-md dark:bg-amber-950/30 dark:border-amber-800/50">
                    <div className="flex items-start">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mr-2 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-800 dark:text-amber-300">Ausstehende Anträge</p>
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          Sie haben {pendingAbsences.length} Anträge, die auf Genehmigung warten.
                        </p>
                      </div>
                    </div>
                  </div>
                  <AbsenceTable absences={pendingAbsences} />
                </div>
              ) : (
                <div className="text-center p-6 my-4">
                  <Check className="h-12 w-12 text-green-500/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Keine ausstehenden Anträge vorhanden.</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="past" className="p-4">
              {loading ? (
                <div className="text-center p-4">
                  <Skeleton className="h-8 w-8 rounded-full mx-auto mb-2" />
                  <Skeleton className="h-4 w-40 mx-auto" />
                </div>
              ) : pastAbsences.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex justify-between text-sm text-muted-foreground pb-2 border-b">
                    <span>{pastAbsences.length} vergangene Abwesenheiten</span>
                    <span>Gesamttage: {pastAbsences.reduce((sum, absence) => sum + absence.daysCount, 0)}</span>
                  </div>
                  <AbsenceTable absences={pastAbsences} />
                </div>
              ) : (
                <div className="text-center p-6 my-4">
                  <CalendarDays className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Keine vergangenen Abwesenheiten gefunden.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

// Hilfkomponente für die Tabelle
interface AbsenceTableProps {
  absences: Absence[];
}

const AbsenceTable: React.FC<AbsenceTableProps> = ({ absences }) => {
  const navigate = useNavigate();
  
  const handleEdit = (absence: Absence) => {
    navigate(`/absences/edit/${absence.id}`);
  };
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 px-2 text-left font-medium">Art</th>
            <th className="py-2 px-2 text-left font-medium">Von</th>
            <th className="py-2 px-2 text-left font-medium">Bis</th>
            <th className="py-2 px-2 text-left font-medium">Dauer</th>
            <th className="py-2 px-2 text-left font-medium">Status</th>
            <th className="py-2 px-2 text-left font-medium">Grund</th>
            <th className="py-2 px-2 text-right font-medium">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {absences.map((absence) => (
            <tr key={absence.id} className="border-b hover:bg-muted/50">
              <td className="py-2 px-2">
                {absence.type === AbsenceType.VACATION && "Urlaub"}
                {absence.type === AbsenceType.SICK && "Krankheit"}
                {absence.type === AbsenceType.SPECIAL && "Sonderurlaub"}
                {absence.type === AbsenceType.REMOTE && "Homeoffice"}
                {absence.type === AbsenceType.OTHER && "Sonstiges"}
              </td>
              <td className="py-2 px-2">
                {format(absence.startDate, "dd.MM.yyyy")}
                {absence.halfDayStart && " (½)"}
              </td>
              <td className="py-2 px-2">
                {format(absence.endDate, "dd.MM.yyyy")}
                {absence.halfDayEnd && " (½)"}
              </td>
              <td className="py-2 px-2">{absence.daysCount} Tage</td>
              <td className="py-2 px-2">
                <Badge
                  variant={
                    absence.status === AbsenceStatus.APPROVED
                      ? "default"
                      : absence.status === AbsenceStatus.REJECTED
                      ? "destructive"
                      : absence.status === AbsenceStatus.PENDING
                      ? "secondary"
                      : "outline"
                  }
                >
                  {absence.status === AbsenceStatus.APPROVED && "Genehmigt"}
                  {absence.status === AbsenceStatus.PENDING && "Ausstehend"}
                  {absence.status === AbsenceStatus.REJECTED && "Abgelehnt"}
                  {absence.status === AbsenceStatus.CANCELLED && "Storniert"}
                </Badge>
              </td>
              <td className="py-2 px-2 max-w-[200px] truncate" title={absence.reason || "-"}>
                {absence.reason || "-"}
              </td>
              <td className="py-2 px-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(absence)}>
                  <Edit2 className="h-4 w-4" />
                  <span className="sr-only">Bearbeiten</span>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AbsencePage; 