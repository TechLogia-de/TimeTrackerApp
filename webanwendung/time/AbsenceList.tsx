import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { AbsenceService } from "@/lib/services/absenceService";
import {
  Absence,
  AbsenceType,
  AbsenceStatus,
  AbsenceFilter
} from "@/types/absence";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight, Filter, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentData } from "firebase/firestore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ExternalLink, Edit, XCircle, Trash, ThumbsUp, ThumbsDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

const ITEMS_PER_PAGE = 10;

// Helfer-Funktionen für die Anzeige
const getAbsenceTypeLabel = (type: AbsenceType): string => {
  switch (type) {
    case AbsenceType.VACATION:
      return "Urlaub";
    case AbsenceType.SICK:
      return "Krankheit";
    case AbsenceType.SPECIAL:
      return "Sonderurlaub";
    case AbsenceType.REMOTE:
      return "Homeoffice";
    case AbsenceType.OTHER:
      return "Sonstiges";
    default:
      return "Unbekannt";
  }
};

const getStatusVariant = (status: AbsenceStatus): "default" | "outline" | "secondary" | "destructive" => {
  switch (status) {
    case AbsenceStatus.APPROVED:
      return "default";
    case AbsenceStatus.PENDING:
      return "secondary";
    case AbsenceStatus.REJECTED:
      return "destructive";
    case AbsenceStatus.CANCELLED:
      return "outline";
    default:
      return "outline";
  }
};

const getStatusLabel = (status: AbsenceStatus): string => {
  switch (status) {
    case AbsenceStatus.APPROVED:
      return "Genehmigt";
    case AbsenceStatus.PENDING:
      return "Ausstehend";
    case AbsenceStatus.REJECTED:
      return "Abgelehnt";
    case AbsenceStatus.CANCELLED:
      return "Storniert";
    default:
      return "Unbekannt";
  }
};

type AbsenceListProps = {
  userId?: string;
  showUserColumn?: boolean;
  isAdmin?: boolean;
  onViewDetails?: (absence: Absence) => void;
  onEdit?: (absence: Absence) => void;
};

const AbsenceList = ({
  userId,
  showUserColumn = false,
  isAdmin = false,
  onViewDetails,
  onEdit,
}: AbsenceListProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<DocumentData | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<AbsenceFilter>({
    year: new Date().getFullYear(),
  });
  
  // Dialoge
  const [selectedAbsence, setSelectedAbsence] = useState<Absence | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  
  // Pagination
  const [page, setPage] = useState(1);
  
  // Laden der Abwesenheiten
  const loadAbsences = async (reset: boolean = true) => {
    try {
      setLoading(true);
      const filterCopy: AbsenceFilter = { ...filter };
      
      // UserId anwenden, falls vorhanden
      if (userId) {
        filterCopy.userId = userId;
      }
      
      // Bei Reset wieder von vorne beginnen
      let lastDoc = reset ? undefined : lastVisible;
      
      // Sicherstellen, dass lastDoc nicht null ist
      const result = await AbsenceService.getAllAbsences(
        filterCopy,
        lastDoc || undefined,
        ITEMS_PER_PAGE
      );
      
      if (reset) {
        setAbsences(result.absences);
      } else {
        setAbsences((prevAbsences) => [...prevAbsences, ...result.absences]);
      }
      
      setLastVisible(result.lastVisible);
      setHasMore(result.absences.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Fehler beim Laden der Abwesenheiten:", error);
      toast({
        title: "Fehler",
        description: "Beim Laden der Abwesenheiten ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Initial laden
  useEffect(() => {
    loadAbsences();
  }, [filter, userId]);
  
  // Filter zurücksetzen
  const resetFilter = () => {
    setFilter({
      year: new Date().getFullYear(),
    });
  };
  
  // Weitere Abwesenheiten laden
  const loadMore = () => {
    if (hasMore && !loading) {
      setPage(page + 1);
      loadAbsences(false);
    }
  };
  
  // Details anzeigen
  const handleViewDetails = (absence: Absence) => {
    if (onViewDetails) {
      onViewDetails(absence);
    } else {
      setSelectedAbsence(absence);
      setShowDetailsDialog(true);
    }
  };
  
  // Bearbeiten
  const handleEdit = (absence: Absence) => {
    if (onEdit) {
      onEdit(absence);
    } else {
      // Wenn der Abwesenheitsantrag bereits genehmigt ist, setze Status zurück
      if (absence.status === AbsenceStatus.APPROVED) {
        handleEditApproved(absence);
      } else {
        // Direkt zur Bearbeitungsseite navigieren
        navigate(`/absences/edit/${absence.id}`);
      }
    }
  };
  
  // Genehmigten Antrag bearbeiten - Status zurücksetzen
  const handleEditApproved = async (absence: Absence) => {
    if (!confirm("Dieser Antrag wurde bereits genehmigt. Wenn Sie ihn bearbeiten, muss er erneut zur Genehmigung eingereicht werden. Möchten Sie fortfahren?")) {
      return;
    }
    
    setActionLoading(true);
    
    try {
      // Status auf PENDING zurücksetzen
      await AbsenceService.resetApprovedAbsence(absence.id);
      
      toast({
        title: "Status zurückgesetzt",
        description: "Der Antrag wurde auf 'Ausstehend' zurückgesetzt und kann nun bearbeitet werden.",
      });
      
      // Liste aktualisieren
      setAbsences(absences.map(a => 
        a.id === absence.id 
          ? { ...a, status: AbsenceStatus.PENDING } 
          : a
      ));
      
      // Zur Bearbeitungsseite navigieren
      navigate(`/absences/edit/${absence.id}`);
    } catch (error) {
      console.error("Fehler beim Zurücksetzen des Antrags:", error);
      toast({
        title: "Fehler",
        description: "Beim Zurücksetzen des Antrags ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };
  
  // Stornieren Dialog anzeigen
  const handleCancelClick = (absence: Absence) => {
    setSelectedAbsence(absence);
    setCancellationReason("");
    setShowCancelDialog(true);
  };
  
  // Löschen Dialog anzeigen
  const handleDeleteClick = (absence: Absence) => {
    setSelectedAbsence(absence);
    setShowDeleteDialog(true);
  };
  
  // Genehmigen Dialog anzeigen
  const handleApproveClick = (absence: Absence) => {
    setSelectedAbsence(absence);
    setShowApproveDialog(true);
  };
  
  // Ablehnen Dialog anzeigen
  const handleRejectClick = (absence: Absence) => {
    setSelectedAbsence(absence);
    setRejectionReason("");
    setShowRejectDialog(true);
  };
  
  // Abwesenheit stornieren
  const handleCancelAbsence = async () => {
    if (!selectedAbsence) return;
    
    setActionLoading(true);
    
    try {
      await AbsenceService.cancelAbsence(selectedAbsence.id, cancellationReason);
      
      toast({
        title: "Abwesenheit storniert",
        description: "Die Abwesenheit wurde erfolgreich storniert",
      });
      
      // Liste aktualisieren
      setAbsences(absences.map(a => 
        a.id === selectedAbsence.id 
          ? { ...a, status: AbsenceStatus.CANCELLED, cancellationReason } 
          : a
      ));
      
      setShowCancelDialog(false);
    } catch (error) {
      console.error("Fehler beim Stornieren der Abwesenheit:", error);
      toast({
        title: "Fehler",
        description: "Beim Stornieren der Abwesenheit ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };
  
  // Abwesenheit löschen
  const handleDeleteAbsence = async () => {
    if (!selectedAbsence) return;
    
    setActionLoading(true);
    
    try {
      await AbsenceService.deleteAbsence(selectedAbsence.id);
      
      toast({
        title: "Abwesenheit gelöscht",
        description: "Die Abwesenheit wurde erfolgreich gelöscht",
      });
      
      // Aus Liste entfernen
      setAbsences(absences.filter(a => a.id !== selectedAbsence.id));
      
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Fehler beim Löschen der Abwesenheit:", error);
      toast({
        title: "Fehler",
        description: "Beim Löschen der Abwesenheit ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };
  
  // Abwesenheit genehmigen
  const handleApproveAbsence = async () => {
    if (!selectedAbsence || !user) return;
    
    setActionLoading(true);
    
    try {
      // Übergebe alle erforderlichen Parameter: ID, Benutzer-ID und Benutzername
      await AbsenceService.approveAbsence(
        selectedAbsence.id,
        user.uid,
        user.displayName || user.email || "Admin"
      );
      
      toast({
        title: "Abwesenheit genehmigt",
        description: "Die Abwesenheit wurde erfolgreich genehmigt",
      });
      
      // Liste aktualisieren
      setAbsences(absences.map(a => 
        a.id === selectedAbsence.id 
          ? { 
              ...a, 
              status: AbsenceStatus.APPROVED, 
              approvedBy: user.uid, 
              approverName: user.displayName || user.email || "Admin",
              approvedAt: new Date().toISOString()
            } 
          : a
      ));
      
      setShowApproveDialog(false);
    } catch (error) {
      console.error("Fehler beim Genehmigen der Abwesenheit:", error);
      toast({
        title: "Fehler",
        description: "Beim Genehmigen der Abwesenheit ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };
  
  // Abwesenheit ablehnen
  const handleRejectAbsence = async () => {
    if (!selectedAbsence || !user || !rejectionReason.trim()) return;
    
    setActionLoading(true);
    
    try {
      // Übergebe alle erforderlichen Parameter in der richtigen Reihenfolge:
      // ID, Benutzer-ID, Benutzername, Ablehnungsgrund
      await AbsenceService.rejectAbsence(
        selectedAbsence.id,
        user.uid,
        user.displayName || user.email || "Admin",
        rejectionReason
      );
      
      toast({
        title: "Abwesenheit abgelehnt",
        description: "Die Abwesenheit wurde abgelehnt",
      });
      
      // Liste aktualisieren
      setAbsences(absences.map(a => 
        a.id === selectedAbsence.id 
          ? { 
              ...a, 
              status: AbsenceStatus.REJECTED, 
              rejectedBy: user.uid, 
              rejectedAt: new Date().toISOString(),
              rejectionReason 
            } 
          : a
      ));
      
      setShowRejectDialog(false);
    } catch (error) {
      console.error("Fehler beim Ablehnen der Abwesenheit:", error);
      toast({
        title: "Fehler",
        description: "Beim Ablehnen der Abwesenheit ist ein Fehler aufgetreten",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };
  
  // Prüfen, ob Aktionen möglich sind
  const canCancel = (absence: Absence) => {
    return (
      absence.status === AbsenceStatus.PENDING || 
      absence.status === AbsenceStatus.APPROVED
    ) && (
      isAdmin || 
      (user && user.uid === absence.userId)
    );
  };
  
  const canEdit = (absence: Absence) => {
    return (
      // Sowohl ausstehende als auch genehmigte Anträge können bearbeitet werden
      (absence.status === AbsenceStatus.PENDING || 
       absence.status === AbsenceStatus.APPROVED)
    ) && (
      isAdmin || 
      (user && user.uid === absence.userId)
    );
  };
  
  const canDelete = (absence: Absence) => {
    return (
      isAdmin || 
      (user && 
       user.uid === absence.userId && 
       (absence.status === AbsenceStatus.PENDING || 
        absence.status === AbsenceStatus.APPROVED))
    );
  };
  
  const canApprove = (absence: Absence) => {
    return (
      isAdmin && 
      absence.status === AbsenceStatus.PENDING
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Abwesenheiten</CardTitle>
            <CardDescription>Übersicht aller {userId ? "Ihrer " : ""}Abwesenheiten</CardDescription>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={resetFilter}
            >
              <RefreshCcw className="h-4 w-4 mr-2" />
              Zurücksetzen
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => loadAbsences()}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtern
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Jahr */}
          <div className="flex-1 min-w-[120px]">
            <Label htmlFor="year">Jahr</Label>
            <Select
              value={filter.year?.toString()}
              onValueChange={(value) => 
                setFilter({ ...filter, year: parseInt(value) })
              }
            >
              <SelectTrigger id="year">
                <SelectValue placeholder="Jahr auswählen" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Typ */}
          <div className="flex-1 min-w-[150px]">
            <Label htmlFor="type">Typ</Label>
            <Select
              value={filter.type === undefined ? "" : filter.type}
              onValueChange={(value) => 
                setFilter({ ...filter, type: value === "" ? undefined : value as AbsenceType })
              }
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Alle Typen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                <SelectItem value={AbsenceType.VACATION}>Urlaub</SelectItem>
                <SelectItem value={AbsenceType.SICK}>Krankheit</SelectItem>
                <SelectItem value={AbsenceType.SPECIAL}>Sonderurlaub</SelectItem>
                <SelectItem value={AbsenceType.REMOTE}>Homeoffice</SelectItem>
                <SelectItem value={AbsenceType.OTHER}>Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Status */}
          <div className="flex-1 min-w-[150px]">
            <Label htmlFor="status">Status</Label>
            <Select
              value={filter.status === undefined ? "" : filter.status}
              onValueChange={(value) => 
                setFilter({ ...filter, status: value === "" ? undefined : value as AbsenceStatus })
              }
            >
              <SelectTrigger id="status">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value={AbsenceStatus.PENDING}>Ausstehend</SelectItem>
                <SelectItem value={AbsenceStatus.APPROVED}>Genehmigt</SelectItem>
                <SelectItem value={AbsenceStatus.REJECTED}>Abgelehnt</SelectItem>
                <SelectItem value={AbsenceStatus.CANCELLED}>Storniert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Zeitraum */}
          <div className="flex-1 min-w-[200px]">
            <Label>Zeitraum</Label>
            <div className="flex space-x-2">
              {/* Startdatum */}
              <div className="flex-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filter.startDate && "text-muted-foreground"
                      )}
                    >
                      {filter.startDate ? (
                        format(filter.startDate, "dd.MM.yyyy")
                      ) : (
                        <span>Von</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filter.startDate}
                      onSelect={(date) => 
                        setFilter({ ...filter, startDate: date || undefined })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* Enddatum */}
              <div className="flex-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !filter.endDate && "text-muted-foreground"
                      )}
                    >
                      {filter.endDate ? (
                        format(filter.endDate, "dd.MM.yyyy")
                      ) : (
                        <span>Bis</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={filter.endDate}
                      onSelect={(date) =>
                        setFilter({ ...filter, endDate: date || undefined })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tabelle */}
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                {showUserColumn && (
                  <TableHead>Mitarbeiter</TableHead>
                )}
                <TableHead>Art</TableHead>
                <TableHead>Von</TableHead>
                <TableHead>Bis</TableHead>
                <TableHead>Tage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Grund</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && absences.length === 0 ? (
                // Skeleton Loader
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    {showUserColumn && (
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    )}
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : absences.length === 0 ? (
                <TableRow>
                  <TableCell 
                    colSpan={showUserColumn ? 8 : 7} 
                    className="h-24 text-center"
                  >
                    Keine Abwesenheiten gefunden
                  </TableCell>
                </TableRow>
              ) : (
                // Abwesenheiten anzeigen
                absences.map((absence) => (
                  <TableRow key={absence.id}>
                    {showUserColumn && (
                      <TableCell className="font-medium">
                        {absence.userName || absence.userEmail}
                      </TableCell>
                    )}
                    <TableCell>
                      {getAbsenceTypeLabel(absence.type)}
                    </TableCell>
                    <TableCell>
                      {format(absence.startDate, "dd.MM.yyyy")}
                      {absence.halfDayStart && " (½)"}
                    </TableCell>
                    <TableCell>
                      {format(absence.endDate, "dd.MM.yyyy")}
                      {absence.halfDayEnd && " (½)"}
                    </TableCell>
                    <TableCell>
                      {absence.daysCount}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(absence.status)}>
                        {getStatusLabel(absence.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={absence.reason}>
                      {absence.reason || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Menü öffnen</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Aktionen</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleViewDetails(absence)}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Details
                          </DropdownMenuItem>
                          {canApprove(absence) && (
                            <>
                              <DropdownMenuItem onClick={() => handleApproveClick(absence)}>
                                <ThumbsUp className="mr-2 h-4 w-4" />
                                Genehmigen
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRejectClick(absence)}>
                                <ThumbsDown className="mr-2 h-4 w-4" />
                                Ablehnen
                              </DropdownMenuItem>
                            </>
                          )}
                          {canEdit(absence) && (
                            <DropdownMenuItem onClick={() => handleEdit(absence)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Bearbeiten
                            </DropdownMenuItem>
                          )}
                          {canCancel(absence) && (
                            <DropdownMenuItem onClick={() => handleCancelClick(absence)}>
                              <XCircle className="mr-2 h-4 w-4" />
                              Stornieren
                            </DropdownMenuItem>
                          )}
                          {canDelete(absence) && (
                            <DropdownMenuItem onClick={() => handleDeleteClick(absence)}>
                              <Trash className="mr-2 h-4 w-4" />
                              Löschen
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      
      {/* Pagination */}
      {(hasMore || page > 1) && (
        <CardFooter className="flex justify-between">
          <Button 
            variant="outline"
            onClick={() => loadAbsences()} 
            disabled={page === 1 || loading}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <span className="flex items-center text-sm">
            Seite {page}
          </span>
          <Button 
            variant="outline"
            onClick={loadMore} 
            disabled={!hasMore || loading}
          >
            Weiter
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      )}
      
      {/* Details Dialog */}
      {selectedAbsence && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Abwesenheitsdetails</DialogTitle>
              <DialogDescription>
                Details zur Abwesenheit
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="max-h-[60vh]">
              <div className="grid grid-cols-2 gap-4 py-4">
                {showUserColumn && (
                  <>
                    <div className="text-sm font-medium">Mitarbeiter:</div>
                    <div className="text-sm">{selectedAbsence.userName || selectedAbsence.userEmail}</div>
                  </>
                )}
                
                <div className="text-sm font-medium">Typ:</div>
                <div className="text-sm">{getAbsenceTypeLabel(selectedAbsence.type)}</div>
                
                <div className="text-sm font-medium">Status:</div>
                <div className="text-sm">
                  <Badge variant={getStatusVariant(selectedAbsence.status)}>
                    {getStatusLabel(selectedAbsence.status)}
                  </Badge>
                </div>
                
                <div className="text-sm font-medium">Zeitraum:</div>
                <div className="text-sm">
                  {format(selectedAbsence.startDate, "dd.MM.yyyy")}
                  {" - "}
                  {format(selectedAbsence.endDate, "dd.MM.yyyy")}
                </div>
                
                <div className="text-sm font-medium">Halbe Tage:</div>
                <div className="text-sm">
                  {selectedAbsence.halfDayStart && "Erster Tag (halber Tag)"}
                  {selectedAbsence.halfDayStart && selectedAbsence.halfDayEnd && ", "}
                  {selectedAbsence.halfDayEnd && "Letzter Tag (halber Tag)"}
                  {!selectedAbsence.halfDayStart && !selectedAbsence.halfDayEnd && "Nein"}
                </div>
                
                <div className="text-sm font-medium">Arbeitstage:</div>
                <div className="text-sm">{selectedAbsence.daysCount}</div>
                
                {selectedAbsence.reason && (
                  <>
                    <div className="text-sm font-medium">Grund:</div>
                    <div className="text-sm">{selectedAbsence.reason}</div>
                  </>
                )}
                
                {selectedAbsence.notes && (
                  <>
                    <div className="text-sm font-medium">Notizen:</div>
                    <div className="text-sm">{selectedAbsence.notes}</div>
                  </>
                )}
                
                {selectedAbsence.status === AbsenceStatus.APPROVED && (
                  <>
                    <div className="text-sm font-medium">Genehmigt von:</div>
                    <div className="text-sm">{selectedAbsence.approverName || selectedAbsence.approvedBy}</div>
                  </>
                )}
                
                {selectedAbsence.status === AbsenceStatus.REJECTED && selectedAbsence.rejectionReason && (
                  <>
                    <div className="text-sm font-medium">Ablehnungsgrund:</div>
                    <div className="text-sm">{selectedAbsence.rejectionReason}</div>
                  </>
                )}
                
                {selectedAbsence.status === AbsenceStatus.CANCELLED && selectedAbsence.cancellationReason && (
                  <>
                    <div className="text-sm font-medium">Stornierungsgrund:</div>
                    <div className="text-sm">{selectedAbsence.cancellationReason}</div>
                  </>
                )}
                
                <div className="text-sm font-medium">Erstellt am:</div>
                <div className="text-sm">{format(selectedAbsence.createdAt, "dd.MM.yyyy HH:mm")}</div>
                
                <div className="text-sm font-medium">Aktualisiert am:</div>
                <div className="text-sm">{format(selectedAbsence.updatedAt, "dd.MM.yyyy HH:mm")}</div>
              </div>
            </ScrollArea>
            
            <DialogFooter className="sm:justify-end">
              {canEdit(selectedAbsence) && (
                <Button
                  variant="default"
                  onClick={() => {
                    setShowDetailsDialog(false);
                    handleEdit(selectedAbsence);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Bearbeiten
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                Schließen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Stornieren Dialog */}
      {selectedAbsence && (
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit stornieren</DialogTitle>
              <DialogDescription>
                Möchten Sie diese Abwesenheit wirklich stornieren?
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cancellation-reason">Grund für Stornierung</Label>
                <Textarea
                  id="cancellation-reason"
                  placeholder="Bitte geben Sie einen Grund für die Stornierung an"
                  rows={3}
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowCancelDialog(false)}
                disabled={actionLoading}
              >
                Abbrechen
              </Button>
              <Button 
                variant="default"
                onClick={handleCancelAbsence}
                disabled={actionLoading}
              >
                {actionLoading ? "Wird storniert..." : "Stornieren"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Löschen Dialog */}
      {selectedAbsence && (
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit löschen</DialogTitle>
              <DialogDescription>
                Möchten Sie diese Abwesenheit wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </DialogDescription>
            </DialogHeader>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowDeleteDialog(false)}
                disabled={actionLoading}
              >
                Abbrechen
              </Button>
              <Button 
                variant="destructive"
                onClick={handleDeleteAbsence}
                disabled={actionLoading}
              >
                {actionLoading ? "Wird gelöscht..." : "Löschen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Genehmigen Dialog */}
      {selectedAbsence && (
        <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit genehmigen</DialogTitle>
              <DialogDescription>
                Möchten Sie diese Abwesenheit wirklich genehmigen?
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2 text-sm">
                <div className="font-medium">Typ:</div>
                <div>{getAbsenceTypeLabel(selectedAbsence.type)}</div>
                <div className="font-medium">Zeitraum:</div>
                <div>
                  {format(selectedAbsence.startDate, "dd.MM.yyyy")} - {format(selectedAbsence.endDate, "dd.MM.yyyy")}
                </div>
                <div className="font-medium">Arbeitstage:</div>
                <div>{selectedAbsence.daysCount}</div>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowApproveDialog(false)}
                disabled={actionLoading}
              >
                Abbrechen
              </Button>
              <Button 
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleApproveAbsence}
                disabled={actionLoading}
              >
                {actionLoading ? "Wird genehmigt..." : "Genehmigen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Ablehnen Dialog */}
      {selectedAbsence && (
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abwesenheit ablehnen</DialogTitle>
              <DialogDescription>
                Bitte geben Sie einen Grund für die Ablehnung an.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2 text-sm">
                <div className="font-medium">Typ:</div>
                <div>{getAbsenceTypeLabel(selectedAbsence.type)}</div>
                <div className="font-medium">Zeitraum:</div>
                <div>
                  {format(selectedAbsence.startDate, "dd.MM.yyyy")} - {format(selectedAbsence.endDate, "dd.MM.yyyy")}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rejection-reason">Ablehnungsgrund</Label>
                <Textarea
                  id="rejection-reason"
                  placeholder="Bitte geben Sie einen Grund für die Ablehnung an"
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowRejectDialog(false)}
                disabled={actionLoading}
              >
                Abbrechen
              </Button>
              <Button 
                variant="destructive"
                onClick={handleRejectAbsence}
                disabled={actionLoading || !rejectionReason.trim()}
              >
                {actionLoading ? "Wird abgelehnt..." : "Ablehnen"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
};

export default AbsenceList; 