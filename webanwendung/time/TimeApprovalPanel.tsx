import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, XCircle, Trash2, Check, X, Edit2, Clock, Calendar, UserIcon, AlarmPlus, AlarmMinus } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { 
  getTimeEntriesToApprove, 
  approveTimeEntry, 
  rejectTimeEntry,
  getAllUsersTimeEntries,
  deleteTimeEntry
} from "@/lib/db/timeEntries";
import { getUsersForAdmin } from "@/lib/db/users";
import { TimeEntry, User } from "@/types/types";
import UserAvatar from "../UserAvatar";
import { useAuth } from "@/lib/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import AbsenceList from "../time/AbsenceList";

// Erweiterte Version des TimeEntry Types um "revision" als Status zu erlauben
type ExtendedTimeEntry = Omit<TimeEntry, 'status'> & {
  status: 'pending' | 'approved' | 'rejected' | 'revision';
};

// Temporärer Typ für UserAvatar
interface TempUser {
  id: string;
  displayName?: string;
  avatar?: string;
}

const TimeApprovalPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState<boolean>(true);
  const [timeEntries, setTimeEntries] = useState<ExtendedTimeEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [approvalType, setApprovalType] = useState<"time" | "vacation" | "personnel" | "overtime" | "deduction">("time");

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Liste aller Benutzer laden, die für den Admin/Manager relevant sind
        const usersList = await getUsersForAdmin(user?.uid || "");
        setUsers(usersList);

        // Zeiteinträge nur laden, wenn der approvalType "time" ist
        if (approvalType === "time") {
          let entries: any[] = [];
          if (activeTab === "pending") {
            entries = await getTimeEntriesToApprove(user?.uid || "", user?.role || "");
            console.log("Geladene ausstehende Einträge:", entries);
          } else {
            entries = await getAllUsersTimeEntries(user?.uid || "", user?.role || "");
            console.log("Geladene alle Einträge:", entries);
          }
          setTimeEntries(entries as ExtendedTimeEntry[]);
        }
      } catch (error) {
        console.error("Fehler beim Laden der Daten:", error);
        toast({
          title: "Fehler",
          description: "Die Daten konnten nicht geladen werden.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    if (user && (user.role === "admin" || user.role === "manager")) {
      loadData();
    }
  }, [user, activeTab, approvalType, toast]);

  const handleToggleSelect = (id: string) => {
    setSelectedEntries(prev => 
      prev.includes(id) 
        ? prev.filter(entryId => entryId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedEntries.length === timeEntries.length) {
      setSelectedEntries([]);
    } else {
      setSelectedEntries(timeEntries.map(entry => entry.id));
    }
  };

  const handleApprove = async (entryId: string) => {
    try {
      await approveTimeEntry(entryId, user?.uid || "");
      setTimeEntries(prev => 
        prev.map(entry => 
          entry.id === entryId 
            ? { ...entry, status: "approved", approvedBy: user?.uid, approvedAt: new Date().toISOString() }
            : entry
        )
      );
      toast({
        title: "Erfolg",
        description: "Der Zeiteintrag wurde genehmigt.",
      });
    } catch (error) {
      console.error("Fehler bei der Genehmigung:", error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht genehmigt werden.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (entryId: string) => {
    try {
      await rejectTimeEntry(entryId, user?.uid || "");
      setTimeEntries(prev => 
        prev.map(entry => 
          entry.id === entryId 
            ? { ...entry, status: "rejected", rejectedBy: user?.uid, rejectedAt: new Date().toISOString() }
            : entry
        )
      );
      toast({
        title: "Erfolg",
        description: "Der Zeiteintrag wurde abgelehnt.",
      });
    } catch (error) {
      console.error("Fehler bei der Ablehnung:", error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht abgelehnt werden.",
        variant: "destructive",
      });
    }
  };

  const handleBulkApprove = async () => {
    try {
      for (const entryId of selectedEntries) {
        await approveTimeEntry(entryId, user?.uid || "");
      }
      
      setTimeEntries(prev => 
        prev.map(entry => 
          selectedEntries.includes(entry.id) 
            ? { ...entry, status: "approved", approvedBy: user?.uid, approvedAt: new Date().toISOString() }
            : entry
        )
      );
      
      setSelectedEntries([]);
      
      toast({
        title: "Erfolg",
        description: `${selectedEntries.length} Zeiteinträge wurden genehmigt.`,
      });
    } catch (error) {
      console.error("Fehler bei der Massengenehmigung:", error);
      toast({
        title: "Fehler",
        description: "Die Zeiteinträge konnten nicht genehmigt werden.",
        variant: "destructive",
      });
    }
  };

  const handleBulkReject = async () => {
    try {
      for (const entryId of selectedEntries) {
        await rejectTimeEntry(entryId, user?.uid || "");
      }
      
      setTimeEntries(prev => 
        prev.map(entry => 
          selectedEntries.includes(entry.id) 
            ? { ...entry, status: "rejected", rejectedBy: user?.uid, rejectedAt: new Date().toISOString() }
            : entry
        )
      );
      
      setSelectedEntries([]);
      
      toast({
        title: "Erfolg",
        description: `${selectedEntries.length} Zeiteinträge wurden abgelehnt.`,
      });
    } catch (error) {
      console.error("Fehler bei der Massenablehnung:", error);
      toast({
        title: "Fehler",
        description: "Die Zeiteinträge konnten nicht abgelehnt werden.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!confirm("Möchten Sie diesen Zeiteintrag wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) {
      return;
    }
    
    try {
      await deleteTimeEntry(entryId);
      setTimeEntries(prev => prev.filter(entry => entry.id !== entryId));
      toast({
        title: "Erfolg",
        description: "Der Zeiteintrag wurde gelöscht.",
      });
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  const getUserName = (userId: string) => {
    const foundUser = users.find(u => u.id === userId);
    return foundUser ? foundUser.displayName || foundUser.email : "Unbekannter Benutzer";
  };

  // Erstelle temporäre Benutzer für Avatar
  const createTempUser = (userId: string): TempUser => {
    const userName = getUserName(userId);
    return {
      id: userId,
      displayName: userName
    };
  };

  const filteredEntries = activeTab === "pending" 
    ? timeEntries.filter(entry => entry.status === "pending")
    : timeEntries;
  
  console.log("Aktiver Tab:", activeTab);
  console.log("Alle Einträge:", timeEntries);
  console.log("Gefilterte Einträge:", filteredEntries);

  // Zeiteintrag zur Überarbeitung zurücksenden
  const handleRequestRevision = async (entryId: string) => {
    try {
      // Status auf "revision" setzen
      const timeEntryRef = doc(db, "timeEntries", entryId);
      await updateDoc(timeEntryRef, {
        status: "revision",
        revisedBy: user?.uid,
        revisedAt: new Date().toISOString()
      });
      
      // UI aktualisieren
      setTimeEntries(prev => 
        prev.map(entry => 
          entry.id === entryId 
            ? { 
                ...entry, 
                status: "revision" as const, 
                revisedBy: user?.uid, 
                revisedAt: new Date().toISOString() 
              } 
            : entry
        )
      );
      
      toast({
        title: "Erfolg",
        description: "Der Zeiteintrag wurde zur Überarbeitung zurückgesendet.",
      });
    } catch (error) {
      console.error("Fehler beim Zurücksenden zur Überarbeitung:", error);
      toast({
        title: "Fehler",
        description: "Der Zeiteintrag konnte nicht zur Überarbeitung zurückgesendet werden.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            Genehmigungsprozesse
          </div>
          
          <div className="flex items-center gap-2">
            <Tabs
              value={approvalType}
              onValueChange={(value) => setApprovalType(value as "time" | "vacation" | "personnel" | "overtime" | "deduction")}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger
                  value="time"
                  className="flex items-center gap-1"
                >
                  <Clock className="h-4 w-4" /> Zeiteinträge
                </TabsTrigger>
                <TabsTrigger
                  value="vacation"
                  className="flex items-center gap-1"
                >
                  <Calendar className="h-4 w-4" /> Urlaubsanträge
                </TabsTrigger>
                <TabsTrigger
                  value="personnel"
                  className="flex items-center gap-1"
                >
                  <UserIcon className="h-4 w-4" /> Personalanträge
                </TabsTrigger>
                <TabsTrigger
                  value="overtime"
                  className="flex items-center gap-1"
                >
                  <AlarmPlus className="h-4 w-4" /> Überstunden
                </TabsTrigger>
                <TabsTrigger
                  value="deduction"
                  className="flex items-center gap-1"
                >
                  <AlarmMinus className="h-4 w-4" /> Entziehen
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Zeiteinträge */}
        {approvalType === "time" && (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pending">Ausstehend</TabsTrigger>
                <TabsTrigger value="all">Alle</TabsTrigger>
              </TabsList>
              
              <TabsContent value="pending" className="mt-4">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-sm text-muted-foreground">
                    {filteredEntries.length} ausstehende Zeiteinträge
                  </div>
                  
                  {filteredEntries.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                      >
                        {selectedEntries.length === filteredEntries.length
                          ? "Alle abwählen"
                          : "Alle auswählen"}
                      </Button>
                      
                      {selectedEntries.length > 0 && (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleBulkApprove}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {selectedEntries.length} genehmigen
                          </Button>
                          
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleBulkReject}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            {selectedEntries.length} ablehnen
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                
                {filteredEntries.length > 0 ? (
                  <div className="border rounded-md overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={selectedEntries.length === filteredEntries.length && filteredEntries.length > 0}
                              onCheckedChange={handleSelectAll}
                            />
                          </TableHead>
                          <TableHead>Mitarbeiter</TableHead>
                          <TableHead>Datum</TableHead>
                          <TableHead>Dauer</TableHead>
                          <TableHead>Projekt</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Aktionen</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedEntries.includes(entry.id)}
                                onCheckedChange={() => handleToggleSelect(entry.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <UserAvatar
                                  user={createTempUser(entry.userId)}
                                />
                                <span>{getUserName(entry.userId)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatSafeDate(entry.createdAt)}
                            </TableCell>
                            <TableCell>
                              {entry.duration ? `${Math.round(entry.duration / 3600)} h` : "-"}
                            </TableCell>
                            <TableCell>
                              {entry.projectName || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  entry.status === "approved"
                                    ? "success"
                                    : entry.status === "rejected"
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {entry.status === "approved"
                                  ? "Genehmigt"
                                  : entry.status === "rejected"
                                  ? "Abgelehnt"
                                  : entry.status === "revision"
                                  ? "Überarbeitung"
                                  : "Ausstehend"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleApprove(entry.id)}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleReject(entry.id)}
                                >
                                  <X className="h-4 w-4 text-red-600" />
                                </Button>
                                
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRequestRevision(entry.id)}
                                >
                                  <Edit2 className="h-4 w-4 text-amber-600" />
                                </Button>
                                
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(entry.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-gray-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-10 border rounded-md bg-gray-50 dark:bg-gray-900">
                    <p className="text-muted-foreground">Keine ausstehenden Zeiteinträge vorhanden.</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="all" className="mt-4">
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mitarbeiter</TableHead>
                        <TableHead>Datum</TableHead>
                        <TableHead>Dauer</TableHead>
                        <TableHead>Projekt</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aktionen</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {timeEntries.length > 0 ? (
                        timeEntries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <UserAvatar
                                  user={createTempUser(entry.userId)}
                                />
                                <span>{getUserName(entry.userId)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {formatSafeDate(entry.createdAt)}
                            </TableCell>
                            <TableCell>
                              {entry.duration ? `${Math.round(entry.duration / 3600)} h` : "-"}
                            </TableCell>
                            <TableCell>
                              {entry.projectName || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  entry.status === "approved"
                                    ? "success"
                                    : entry.status === "rejected"
                                    ? "destructive"
                                    : "outline"
                                }
                              >
                                {entry.status === "approved"
                                  ? "Genehmigt"
                                  : entry.status === "rejected"
                                  ? "Abgelehnt"
                                  : entry.status === "revision"
                                  ? "Überarbeitung"
                                  : "Ausstehend"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {entry.status === "pending" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleApprove(entry.id)}
                                    >
                                      <Check className="h-4 w-4 text-green-600" />
                                    </Button>
                                    
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleReject(entry.id)}
                                    >
                                      <X className="h-4 w-4 text-red-600" />
                                    </Button>
                                    
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRequestRevision(entry.id)}
                                    >
                                      <Edit2 className="h-4 w-4 text-amber-600" />
                                    </Button>
                                  </>
                                )}
                                
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(entry.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-gray-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6">
                            <p className="text-muted-foreground">Keine Zeiteinträge vorhanden.</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
        
        {/* Urlaubsanträge */}
        {approvalType === "vacation" && (
          <div className="py-4">
            <h3 className="text-lg font-semibold mb-4">Urlaubsanträge</h3>
            <p className="text-muted-foreground mb-4">Alle ausstehenden Urlaubsanträge, die genehmigt werden müssen</p>
            
            <AbsenceList isAdmin={user?.role === "admin" || user?.role === "manager"} showUserColumn={true} />
          </div>
        )}
        
        {/* Personalanträge */}
        {approvalType === "personnel" && (
          <div className="py-4">
            <h3 className="text-lg font-semibold mb-4">Personalanträge</h3>
            <p className="text-muted-foreground mb-4">Anträge für Personalveränderungen und Anfragen</p>
            
            <div className="text-center py-10 border rounded-md bg-gray-50 dark:bg-gray-900">
              <p className="text-muted-foreground">Funktion für Personalanträge wird bald implementiert.</p>
            </div>
          </div>
        )}
        
        {/* Überstunden */}
        {approvalType === "overtime" && (
          <div className="py-4">
            <h3 className="text-lg font-semibold mb-4">Überstundenanträge</h3>
            <p className="text-muted-foreground mb-4">Beantragung und Genehmigung von Überstunden</p>
            
            <div className="text-center py-10 border rounded-md bg-gray-50 dark:bg-gray-900">
              <p className="text-muted-foreground">Funktion für Überstundenanträge wird bald implementiert.</p>
            </div>
          </div>
        )}
        
        {/* Entziehen */}
        {approvalType === "deduction" && (
          <div className="py-4">
            <h3 className="text-lg font-semibold mb-4">Arbeitszeitentziehungen</h3>
            <p className="text-muted-foreground mb-4">Anträge für Zeitentziehungen und Korrekturen</p>
            
            <div className="text-center py-10 border rounded-md bg-gray-50 dark:bg-gray-900">
              <p className="text-muted-foreground">Funktion für Zeitentziehungen wird bald implementiert.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const parseTimeValue = (timeValue: any) => {
  if (!timeValue) return "-";
  
  try {
    if (typeof timeValue === "string") {
      return timeValue;
    }
    
    if (timeValue.toDate) {
      return format(timeValue.toDate(), "HH:mm", { locale: de });
    }
    
    return "-";
  } catch (error) {
    return "-";
  }
};

const formatSafeDate = (dateValue: any, formatString: string = "dd.MM.yyyy") => {
  if (!dateValue) return "-";
  
  try {
    const date = new Date(dateValue);
    // Prüfen, ob das Datum gültig ist
    if (isNaN(date.getTime())) {
      return "-";
    }
    return format(date, formatString, { locale: de });
  } catch (error) {
    console.error("Fehler beim Formatieren des Datums:", error);
    return "-";
  }
};

export default TimeApprovalPanel; 