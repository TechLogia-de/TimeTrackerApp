import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Pencil, 
  Trash2, 
  Clock, 
  CalendarIcon,
  ClipboardCheck,
  FileText,
  ChevronDown,
  ChevronUp,
  Eye,
  Check,
  X,
  Send,
  MoreVertical,
  Filter,
  Settings,
  Search,
  UserIcon,
  List,
  LayoutGrid
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface TimeEntry {
  id: string;
  startTime: Date;
  endTime?: Date;
  pauseMinutes: number;
  note?: string;
  status: string;
  auftragId?: string;
  auftragTitle?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  orderReference?: boolean; // Flag, ob der Eintrag aus einem Auftrag stammt
  submittedAt?: Date; // Datum der Einreichung zur Genehmigung
  approvedBy?: string; // Benutzer-ID des Genehmigers
  approvedAt?: Date; // Datum der Genehmigung
  rejectedBy?: string; // Benutzer-ID des Ablehnenden
  rejectedAt?: Date; // Datum der Ablehnung
  fromOrders?: boolean;
  isManualEntry?: boolean;
  projectName?: string;
  customerName?: string;
}

interface TimeEntryListProps {
  entries: TimeEntry[];
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
  onApprove?: (entry: TimeEntry) => void;
  onReject?: (entry: TimeEntry) => void;
  onSubmit?: (entry: TimeEntry) => void;
  filters?: {
    startDate?: Date;
    endDate?: Date;
    orderOnly?: boolean;
  };
  userRole?: string;
  isLoading?: boolean;
}

const TimeEntryList: React.FC<TimeEntryListProps> = ({
  entries,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onSubmit,
  filters = {},
  userRole,
  isLoading = false
}) => {
  const { t } = useTranslation();
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  
  // Neue States für erweiterte Filterfunktionen
  const [activeTab, setActiveTab] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  
  const toggleEntryExpansion = (entryId: string) => {
    setExpandedEntryId(expandedEntryId === entryId ? null : entryId);
  };
  
  const openDetailDialog = (entry: TimeEntry) => {
    console.log("Dialog für Eintrag öffnen:", entry.id);
    setSelectedEntry(entry);
    setIsDetailOpen(true);
  };
  
  // Konstanten für Benutzerrollen definieren
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const canApprove = isAdmin || isManager;
  
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-36" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 mb-2">
            <Skeleton className="h-6 w-full mb-2" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    );
  }
  
  if (!entries || entries.length === 0) {
    return (
      <p className="text-center text-gray-500 my-8 py-8 border border-dashed rounded-lg">
        <Clock className="h-10 w-10 mx-auto mb-2 text-gray-400" />
        {t('timeTracking.noEntries', 'Keine Zeiteinträge vorhanden')}
      </p>
    );
  }

  // Erweiterte Filterlogik
  const filteredEntries = entries.filter(entry => {
    // Datumsfilterbedingungen
    const startDate = filters.startDate ? new Date(filters.startDate) : null;
    const endDate = filters.endDate ? new Date(filters.endDate) : null;
    
    let includeEntry = true;
    
    // Bestehende Datumsfilter
    if (startDate) {
      startDate.setHours(0, 0, 0, 0);
      const entryDate = new Date(entry.startTime);
      includeEntry = includeEntry && entryDate >= startDate;
    }
    
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
      const entryDate = new Date(entry.startTime);
      includeEntry = includeEntry && entryDate <= endDate;
    }
    
    // Filter für Auftragseinträge
    if (filters.orderOnly) {
      includeEntry = includeEntry && (!!entry.auftragId || !!entry.orderReference);
    }
    
    // Status-Tab-Filter
    if (activeTab !== "all") {
      switch (activeTab) {
        case "draft":
          includeEntry = includeEntry && entry.status === "Entwurf";
          break;
        case "submitted":
          includeEntry = includeEntry && entry.status === "Eingereicht";
          break;
        case "approved":
          includeEntry = includeEntry && entry.status === "Bestätigt";
          break;
        case "rejected":
          includeEntry = includeEntry && entry.status === "Abgelehnt";
          break;
      }
    }
    
    // Status Dropdown-Filter (genauer als Tabs)
    if (statusFilter !== "all") {
      includeEntry = includeEntry && entry.status.toLowerCase() === statusFilter.toLowerCase();
    }
    
    // Benutzer-Filter (für Admins/Manager)
    if (userFilter !== "all" && entry.userId) {
      includeEntry = includeEntry && entry.userId === userFilter;
    }
    
    // Suchbegriff-Filter
    if (searchTerm.trim() !== "") {
      const searchLower = searchTerm.toLowerCase();
      const noteMatches = entry.note?.toLowerCase().includes(searchLower) || false;
      const userMatches = entry.userName?.toLowerCase().includes(searchLower) || false;
      const projectMatches = entry.auftragTitle?.toLowerCase().includes(searchLower) || false;
      
      includeEntry = includeEntry && (noteMatches || userMatches || projectMatches);
    }
    
    return includeEntry;
  });

  // Berechne die Gesamtzeit aller gefilterten Einträge
  const totalMinutes = filteredEntries.reduce((total, entry) => {
    if (entry.endTime) {
      const start = new Date(entry.startTime).getTime();
      const end = new Date(entry.endTime).getTime();
      const durationInMinutes = (end - start) / (1000 * 60);
      return total + durationInMinutes - (entry.pauseMinutes || 0);
    }
    return total;
  }, 0);
  
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = Math.round(totalMinutes % 60);

  // Hilfsfunktion, um eindeutige Benutzer aus den Einträgen zu extrahieren (für Admin-Filter)
  const getUniqueUsers = () => {
    const userMap = new Map();
    entries.forEach(entry => {
      if (entry.userId && entry.userName) {
        userMap.set(entry.userId, entry.userName);
      }
    });
    return Array.from(userMap.entries()).map(([id, name]) => ({ id, name }));
  };
  
  const uniqueUsers = getUniqueUsers();

  // Funktion zur Berechnung der Dauer und Formatierung
  const getDurationText = (entry: TimeEntry) => {
        const isCompleted = entry.endTime != null;
        const startTime = new Date(entry.startTime);
        const endTime = entry.endTime ? new Date(entry.endTime) : null;
        
        let durationText = t('timeTracking.active', 'Aktiv');
        
        if (isCompleted && endTime) {
          const durationInMinutes = 
            (endTime.getTime() - startTime.getTime()) / (1000 * 60) - 
            (entry.pauseMinutes || 0);
          
          const hours = Math.floor(durationInMinutes / 60);
          const minutes = Math.round(durationInMinutes % 60);
          
          durationText = `${hours}h ${minutes}min`;
          if (entry.pauseMinutes && entry.pauseMinutes > 0) {
            const pauseHours = Math.floor(entry.pauseMinutes / 60);
            const pauseMinutes = entry.pauseMinutes % 60;
        durationText += ` (${t('timeTracking.pause', 'Pause')}: ${pauseHours > 0 ? `${pauseHours}h ` : ''}${pauseMinutes}min)`;
      }
    }
    
    return durationText;
  };

  // Neue Hilfsfunktion zur Prüfung, ob ein Eintrag bearbeitbar ist (nicht älter als 7 Tage)
  const isEntryEditable = (entry: TimeEntry, isAdminOrManager: boolean) => {
    const status = entry.status.toLowerCase();
    // Admins und Manager können alle Einträge bearbeiten
    if (isAdminOrManager) return true;
    
    // Mitarbeiter können nur Entwürfe oder abgelehnte Einträge bearbeiten
    return status === 'entwurf' || status === 'draft' || status === 'abgelehnt' || status === 'rejected';
  };

  // Füge eine neue Funktion hinzu, die eine Tooltip-Nachricht für nicht bearbeitbare Einträge zurückgibt
  const getEditabilityMessage = (entry: TimeEntry, isAdminOrManager: boolean) => {
    if (isEntryEditable(entry, isAdminOrManager)) {
      return "";
    }
    
    const status = entry.status.toLowerCase();
    if (status === 'eingereicht' || status === 'pending' || status === 'submitted') {
      return t('timeTracking.cannotEditSubmitted', 'Eingereichte Zeiteinträge können nicht bearbeitet werden');
    }
    if (status === 'bestätigt' || status === 'approved') {
      return t('timeTracking.cannotEditApproved', 'Genehmigte Zeiteinträge können nicht bearbeitet werden');
    }
    
    return t('timeTracking.cannotEdit', 'Dieser Zeiteintrag kann nicht bearbeitet werden');
  };

  // Funktion zum Bestimmen des Status-Badges
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'entwurf':
      case 'draft':
      case 'pending':
        return <Badge variant="secondary">Entwurf</Badge>;
      case 'eingereicht':
      case 'submitted':
        return <Badge variant="outline">Eingereicht</Badge>;
      case 'bestätigt':
      case 'confirmed':
      case 'approved':
      case 'completed':
        return <Badge variant="success">Bestätigt</Badge>;
      case 'abgelehnt':
      case 'rejected':
        return <Badge variant="destructive">Abgelehnt</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Neue Funktion für die Anzeige der Zeitquelle
  const getSourceBadge = (entry: TimeEntry) => {
    if (entry.fromOrders || entry.orderReference || entry.auftragId) {
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">Aus Auftrag</Badge>;
    } else if (entry.isManualEntry) {
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">Manuell</Badge>;
    } else {
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Automatisch</Badge>;
    }
  };

  // Aktionsbuttons für jeden Eintrag
  const renderActions = (entry: TimeEntry) => {
    const canEdit = isEntryEditable(entry, canApprove);
    const status = entry.status.toLowerCase();
    const showSubmit = (status === 'entwurf' || status === 'draft' || status === 'abgelehnt' || status === 'rejected') && !canApprove;
    const showApproveReject = canApprove && (status === 'eingereicht' || status === 'pending' || status === 'submitted');
    
    return (
      <div className="flex gap-2 justify-end items-center">
        {showSubmit && (
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-1 text-blue-600"
            onClick={() => onSubmit && onSubmit(entry)}
            title={t('timeTracking.submitForApproval', 'Zur Genehmigung einreichen')}
          >
            <Send className="h-3 w-3" />
            <span className="sr-only md:not-sr-only md:inline-block">
              {t('timeTracking.submit', 'Einreichen')}
            </span>
          </Button>
        )}
        
        {showApproveReject && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-green-600"
              onClick={() => onApprove && onApprove(entry)}
              title={t('timeTracking.approve', 'Genehmigen')}
            >
              <Check className="h-3 w-3" />
              <span className="sr-only md:not-sr-only md:inline-block">
                {t('timeTracking.approve', 'Genehmigen')}
              </span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-red-600"
              onClick={() => onReject && onReject(entry)}
              title={t('timeTracking.reject', 'Ablehnen')}
            >
              <X className="h-3 w-3" />
              <span className="sr-only md:not-sr-only md:inline-block">
                {t('timeTracking.reject', 'Ablehnen')}
              </span>
            </Button>
          </>
        )}
        
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(entry)}
            title={t('timeTracking.edit', 'Bearbeiten')}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(entry.id)}
          title={t('timeTracking.delete', 'Löschen')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
        <div className="flex items-center gap-2 mb-2 sm:mb-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList>
              <TabsTrigger value="all">Alle</TabsTrigger>
              <TabsTrigger value="draft">Entwurf</TabsTrigger>
              <TabsTrigger value="submitted">Eingereicht</TabsTrigger>
              <TabsTrigger value="approved">Bestätigt</TabsTrigger>
              <TabsTrigger value="rejected">Abgelehnt</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <Input 
            placeholder="Suchen..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-auto"
          />
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
          >
            {viewMode === "list" ? (
              <LayoutGrid className="h-4 w-4" />
            ) : (
              <List className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      
      {showFilters && (
        <Card className="mb-4">
          <CardContent className="pt-4 pb-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="status-filter">Status</Label>
                <Select 
                  value={statusFilter} 
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="Status auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    <SelectItem value="entwurf">Entwurf</SelectItem>
                    <SelectItem value="eingereicht">Eingereicht</SelectItem>
                    <SelectItem value="bestätigt">Bestätigt</SelectItem>
                    <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {canApprove && (
                <div>
                  <Label htmlFor="user-filter">Benutzer</Label>
                  <Select 
                    value={userFilter} 
                    onValueChange={setUserFilter}
                  >
                    <SelectTrigger id="user-filter">
                      <SelectValue placeholder="Benutzer auswählen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle Benutzer</SelectItem>
                      {getUniqueUsers().map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div>
                <Label htmlFor="source-filter">Quelle</Label>
                <Select 
                  value={sourceFilter || "all"} 
                  onValueChange={setSourceFilter}
                >
                  <SelectTrigger id="source-filter">
                    <SelectValue placeholder="Quelle auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Quellen</SelectItem>
                    <SelectItem value="manual">Manuell</SelectItem>
                    <SelectItem value="automatic">Automatisch</SelectItem>
                    <SelectItem value="order">Aus Aufträgen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="text-sm text-muted-foreground mb-2">
        Gesamt: {filteredEntries.length} Einträge ({totalHours}h {remainingMinutes}m)
      </div>
      
      {viewMode === "list" ? (
        <div className="space-y-2">
          {filteredEntries.map(entry => (
            <Card key={entry.id} className="mb-2">
              <div 
                className={cn(
                  "p-4 cursor-pointer",
                  expandedEntryId === entry.id ? "border-b" : ""
                )}
                onClick={() => toggleEntryExpansion(entry.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {format(new Date(entry.startTime), "dd.MM.yyyy")}
                      </p>
                      <div className="flex gap-2">
                        {getStatusBadge(entry.status)}
                        {getSourceBadge(entry)}
                      </div>
                    </div>
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {getDurationText(entry)}
                    </p>
                    {entry.auftragTitle && (
                      <p className="text-sm text-blue-600 flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {entry.auftragTitle}
                      </p>
                    )}
                    {entry.note && (
                      <p className="text-sm text-gray-700 line-clamp-1">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center">
                    <div className="mx-2 text-right">
                      <p className="text-sm font-medium">
                        {entry.projectName || "Kein Projekt"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {entry.customerName || "Kein Kunde"}
                      </p>
                    </div>
                    {expandedEntryId === entry.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </div>
              
              {expandedEntryId === entry.id && (
                <div className="p-4 bg-gray-50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500">Start</p>
                      <p className="text-sm">
                        {format(new Date(entry.startTime), "dd.MM.yyyy HH:mm")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Ende</p>
                      <p className="text-sm">
                        {entry.endTime 
                          ? format(new Date(entry.endTime), "dd.MM.yyyy HH:mm") 
                          : "Läuft noch"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Pause</p>
                      <p className="text-sm">{entry.pauseMinutes || 0} Min.</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Quelle</p>
                      <p className="text-sm">
                        {entry.fromOrders || entry.orderReference || entry.auftragId
                          ? "Auftrag"
                          : entry.isManualEntry
                            ? "Manuell"
                            : "Automatisch"}
                      </p>
                    </div>
                  </div>
                  
                  {entry.note && (
                    <div className="mb-4">
                      <p className="text-xs text-gray-500">Notiz</p>
                      <p className="text-sm whitespace-pre-line">{entry.note}</p>
                    </div>
                  )}
                  
                  {renderActions(entry)}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredEntries.map(entry => (
            <Card key={entry.id} className="overflow-hidden">
              <CardHeader className="p-4 pb-0">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium">
                    {format(new Date(entry.startTime), "dd.MM.yyyy")}
                  </p>
                  <div className="flex gap-1">
                    {getStatusBadge(entry.status)}
                    {getSourceBadge(entry)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{entry.projectName || "Kein Projekt"}</p>
                  <p className="text-xs text-gray-500">{entry.customerName || "Kein Kunde"}</p>
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {entry.note || "Keine Notiz"}
                  </p>
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {getDurationText(entry)}
                  </p>
                </div>
              </CardContent>
              <div className="p-4 pt-0 flex justify-end gap-2 border-t mt-2">
                <Button variant="ghost" size="sm" onClick={() => openDetailDialog(entry)}>
                  <Eye className="h-4 w-4 mr-1" />
                  Details
                </Button>
                {renderActions(entry)}
              </div>
            </Card>
          ))}
        </div>
      )}
      
      {/* Detail Dialog - direkt mit Dialog-Komponente statt Context-basiert */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 bg-black/50 z-[1000]" />
          <DialogContent className="fixed top-[5%] left-1/2 transform -translate-x-1/2 bg-background p-4 rounded-lg shadow-lg z-[1001] w-[95vw] max-w-md h-[90vh] overflow-y-auto -webkit-overflow-scrolling-touch">
            {selectedEntry && (
              <>
                <DialogHeader className="sticky top-0 bg-background z-10 pb-2">
                  <DialogTitle>{format(new Date(selectedEntry.startTime), "dd.MM.yyyy")}</DialogTitle>
                  <DialogDescription className="flex justify-between items-center">
                    <span>
                      {format(new Date(selectedEntry.startTime), "HH:mm")} - 
                      {selectedEntry.endTime 
                        ? format(new Date(selectedEntry.endTime), " HH:mm") 
                        : ` ${t('timeTracking.now', 'Jetzt')}`}
                    </span>
                    {getStatusBadge(selectedEntry.status)}
                  </DialogDescription>
                </DialogHeader>
                
                {/* Sperrhinweis für ältere Einträge */}
                {!isEntryEditable(selectedEntry, canApprove) && !canApprove && (
                  <div className="bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-3 py-2 rounded-md mb-3 flex items-center text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 mr-2 flex-shrink-0">
                      <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                    </svg>
                    {t('timeTracking.olderThanSevenDays', 'Dieser Eintrag ist älter als 7 Tage und kann nicht mehr bearbeitet werden.')}
                  </div>
                )}
                
                <div className="py-4 overflow-y-auto">
                  <div className="space-y-4">
                    {/* Dauer */}
                    <div className="flex items-start">
                      <Clock className="h-4 w-4 mr-2 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <span className="font-medium">{t('timeTracking.duration', 'Dauer')}:</span>{' '}
                        <span className="text-muted-foreground">{getDurationText(selectedEntry)}</span>
                      </div>
                    </div>
                    
                    {/* Notiz */}
                    {selectedEntry.note && (
                      <div className="flex items-start">
                        <FileText className="h-4 w-4 mr-2 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">{t('timeTracking.note', 'Notiz')}:</span>{' '}
                          <span className="text-muted-foreground">{selectedEntry.note}</span>
                  </div>
                </div>
              )}
              
                    {/* Projekt */}
                    {(selectedEntry.auftragTitle || selectedEntry.orderReference) && (
                      <div className="flex items-start">
                        <ClipboardCheck className="h-4 w-4 mr-2 text-blue-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">{t('timeTracking.project', 'Projekt')}:</span>{' '}
                          <a 
                            href={selectedEntry.auftragId ? `/orders?id=${selectedEntry.auftragId}` : "#"} 
                            className="text-blue-600 hover:underline hover:text-blue-800 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {selectedEntry.auftragTitle || selectedEntry.note?.replace('Zeit aus Auftrag: ', '')}
                    </a>
                  </div>
                </div>
              )}
              
                    {/* Benutzer */}
                    {(userRole === "admin" || userRole === "manager") && selectedEntry.userName && (
                      <div className="flex items-start">
                        <Eye className="h-4 w-4 mr-2 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">{t('common.user', 'Benutzer')}:</span>{' '}
                          <span className="text-muted-foreground">{selectedEntry.userName}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <DialogFooter className="flex-col sm:flex-row gap-2 sticky bottom-0 bg-background pt-2 pb-1 border-t mt-4">
                  {renderActions(selectedEntry)}
                  
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsDetailOpen(false)}
                    className="w-full sm:w-auto mt-2 sm:mt-0"
                  >
                    {t('common.close', 'Schließen')}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div>
  );
};

export default TimeEntryList; 