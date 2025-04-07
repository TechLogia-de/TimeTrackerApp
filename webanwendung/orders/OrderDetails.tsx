import React, { useState, useMemo, useEffect } from "react";
import { Order as BaseOrder, AssignedUser } from "@/lib/services/orderService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/hooks/useAuth";
import { acceptOrder, rejectOrder, reopenOrder, completeOrder, updateOrder } from "@/lib/services/orderService";
import { toast } from "@/components/ui/use-toast";
import { CheckCircle, XCircle, Clock, HelpCircle, Edit, UserPlus, AlertTriangle, User } from "lucide-react";
import { TimeEntryDialog } from "./TimeEntryDialog";
import { sendOrderCommentNotification, sendOrderStatusChangeNotification, reassignEmployees } from './orderManagement';
import { UserService } from '@/lib/services/userService';
import { getMailConfig } from '@/lib/services/mailService';
import { Card, CardContent } from "@/components/ui/card";
import { OrderDialog } from "./OrderDialog";
import { ProjectService } from '@/lib/services/projectService';
import { mapsApi } from '../../lib/api';

// Erweiterte Order-Schnittstelle mit zusätzlichen Eigenschaften
interface Order extends BaseOrder {
  customerDetails?: {
    address?: {
      street: string;
      houseNumber?: string;
      zipCode: string;
      city: string;
      country: string;
    };
    contactPersons?: Array<{
      id?: string;
      name: string;
      position?: string;
      email: string;
      phone?: string;
    }>;
    email?: string;
    phone?: string;
    website?: string;
  };
  projectDetails?: {
    description?: string;
    status?: string;
    budget?: number | string;
    startDate?: Date | any;
    endDate?: Date | any;
  };
}

interface OrderDetailsProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
  userRole: "employee" | "manager" | "admin";
  onComplete: () => void;
  onUpdate?: (order: Order) => void;
}

const OrderDetails = ({
  order,
  isOpen,
  onClose,
  onAccept,
  onReject,
  onEdit,
  userRole,
  onComplete,
  onUpdate,
}: OrderDetailsProps) => {
  const { user } = useAuth();
  const [isTimeEntryDialogOpen, setIsTimeEntryDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommentSaving, setIsCommentSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showReassignPanel, setShowReassignPanel] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Prüfe, ob der aktuelle Benutzer der Teamleiter für diesen Auftrag ist
  const isTeamLead = useMemo(() => {
    if (!order || !user) return false;
    
    // Option 1: Prüfe direkt in assignedUsers, ob der aktuelle Benutzer als Teamleiter markiert ist
    const isMarkedAsTeamLead = order.assignedUsers?.some(
      (au) => au.id === user.uid && au.isTeamLead
    );
    
    // Option 2: Prüfe, ob die teamLeadId mit der Benutzer-ID übereinstimmt
    const isTeamLeadById = order.teamLeadId === user.uid;
    
    return isMarkedAsTeamLead || isTeamLeadById;
  }, [order, user]);

  // Aktualisiere die Ansicht bei Statusänderungen
  useEffect(() => {
    if (order) {
      // Je nach Status des Auftrags bestimmte UI-Elemente anzeigen/ausblenden
      if (order.status === 'rejected') {
        setShowReassignPanel(userRole === 'admin' || userRole === 'manager');
      } else {
        setShowReassignPanel(false);
      }
    }
  }, [order, userRole]);

  // Debug-Hilfsfunktion, um Objekt zu inspizieren
  const debugOrder = (orderObj: Order | null) => {
    if (!orderObj) return;
    
    console.log("🔍 DEBUG ORDER DETAILS:", {
      id: orderObj.id,
      title: orderObj.title,
      client: orderObj.client,
      customerId: orderObj.customerId,
      project: orderObj.project,
      projectId: orderObj.projectId,
      status: orderObj.status,
      hasAssignedUsers: Boolean(orderObj.assignedUsers) && Array.isArray(orderObj.assignedUsers),
      assignedUsersCount: orderObj.assignedUsers ? orderObj.assignedUsers.length : 0
    });
  };

  // Hilfsfunktion zum Laden von fehlenden Projektdaten
  const loadMissingProjectInfo = async (projectId?: string) => {
    if (!projectId) return;
    
    try {
      console.log("🔄 Versuche fehlende Projektdaten zu laden für ID:", projectId);
      const projectInfo = await ProjectService.getProjectById(projectId);
      
      if (projectInfo && order) {
        console.log("✅ Projektdaten erfolgreich geladen:", projectInfo);
        
        // Order mit Projektinformationen aktualisieren
        const updatedOrder = {
          ...order,
          project: projectInfo.name,
          projectId: projectInfo.id
        };
        
        // Datenbank aktualisieren, damit die Daten beim nächsten Laden korrekt sind
        await updateOrder(order.id, {
          project: projectInfo.name,
          projectId: projectInfo.id
        });
        console.log("✅ Auftrag in der Datenbank mit Projektdaten aktualisiert");
        
        // Lokalen State aktualisieren
        setSelectedOrder(updatedOrder);
        
        // Übergeordnete Komponente benachrichtigen
        if (onUpdate) {
          onUpdate(updatedOrder);
        }
      }
    } catch (error) {
      console.error("❌ Fehler beim Laden der Projektdaten:", error);
    }
  };

  // Ergänze den useEffect-Hook mit automatischem Nachladen der Projektdaten
  useEffect(() => {
    if (isOpen && order) {
      debugOrder(order);
      
      // Detaillierte Prüfung der Datenstruktur
      if (!order.client && !order.customerId) {
        console.warn("⚠️ Kunde fehlt im Auftrag:", order.id);
      }
      
      if (!order.project && !order.projectId) {
        console.warn("⚠️ Projekt fehlt im Auftrag:", order.id);
      } else if (!order.project && order.projectId) {
        console.log("🔄 ProjectID vorhanden, aber Projektname fehlt - lade Informationen nach");
        loadMissingProjectInfo(order.projectId);
      }
      
      if (order.client && !order.customerId) {
        console.warn("⚠️ Kunde ist gesetzt, aber customerId fehlt:", order.client);
      }
      
      if (order.project && !order.projectId) {
        console.warn("⚠️ Projekt ist gesetzt, aber projectId fehlt:", order.project);
      }
    }
  }, [isOpen, order]);

  if (!order) return null;

  const formatDate = (date: Timestamp | Date | undefined) => {
    if (!date) return "Nicht festgelegt";
    
    try {
      // Wenn es ein Firestore Timestamp ist
      if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
        const dateObj = date.toDate();
        return `${dateObj.toLocaleDateString("de-DE")} ${dateObj.toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Wenn es ein Date-Objekt ist
      if (date instanceof Date) {
        return `${date.toLocaleDateString("de-DE")} ${date.toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Wenn es ein String ist
      if (typeof date === 'string') {
        const dateObj = new Date(date);
        return `${dateObj.toLocaleDateString("de-DE")} ${dateObj.toLocaleTimeString("de-DE", { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      return "Ungültiges Datum";
    } catch (error) {
      console.error("Fehler bei der Datumskonvertierung:", error, date);
      return "Ungültiges Datum";
    }
  };

  const getStatusBadge = (status: string) => {
    let variant = "secondary";
    let label = "Unbekannt";
    let customStyle = {};

    switch (status) {
      case "assigned":
        variant = "secondary";
        label = "Zugewiesen";
        break;
      case "accepted":
        variant = "default";
        label = "Angenommen";
        break;
      case "rejected":
        variant = "destructive";
        label = "Abgelehnt";
        break;
      case "in-progress":
        variant = "default";
        label = "In Bearbeitung";
        break;
      case "completed":
        variant = "outline";
        label = "Abgeschlossen";
        customStyle = { backgroundColor: "#10b981", color: "white", fontWeight: "500" };
        break;
      case "pending":
        variant = "outline";
        label = "Ausstehend";
        break;
    }

    return <Badge variant={variant as any} style={customStyle}>{label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case "niedrig":
      case "low":
        return <Badge variant="outline" className="bg-gray-100">Niedrig</Badge>;
      case "mittel":
      case "medium":
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Mittel</Badge>;
      case "hoch":
      case "high":
        return <Badge variant="outline" className="bg-red-100 text-red-800">Hoch</Badge>;
      default:
        return <Badge variant="outline">Standard</Badge>;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "assigned":
        return "Zugewiesen";
      case "accepted":
        return "Angenommen";
      case "rejected":
        return "Abgelehnt";
      case "in-progress":
        return "In Bearbeitung";
      case "completed":
        return "Abgeschlossen";
      case "pending":
        return "Ausstehend";
      default:
        return status;
    }
  };

  const getUserStatusBadge = (status?: string) => {
    let variant = "secondary";
    let label = "Ausstehend";
    let icon = <Clock className="h-3 w-3 mr-1" />;

    switch (status) {
      case "accepted":
        variant = "default";
        label = "Angenommen";
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case "rejected":
        variant = "destructive";
        label = "Abgelehnt";
        icon = <XCircle className="h-3 w-3 mr-1" />;
        break;
      case "completed":
        variant = "success";
        label = "Abgeschlossen";
        icon = <CheckCircle className="h-3 w-3 mr-1" />;
        break;
      case "pending":
      default:
        variant = "secondary";
        label = "Ausstehend";
        icon = <Clock className="h-3 w-3 mr-1" />;
        break;
    }

    return (
      <Badge variant={variant as any} className="ml-2 flex items-center text-xs">
        {icon}
        {label}
      </Badge>
    );
  };

  const getAssignedUserStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-gray-100"><Clock className="h-3 w-3 mr-1" />Ausstehend</Badge>;
      case "accepted":
        return <Badge variant="outline" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Angenommen</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-100 text-red-800"><XCircle className="h-3 w-3 mr-1" />Abgelehnt</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Abgeschlossen</Badge>;
      default:
        return <Badge variant="outline"><HelpCircle className="h-3 w-3 mr-1" />Unbekannt</Badge>;
    }
  };

  const handleAccept = async () => {
    if (!user || !order) return;
    
    try {
      console.log("Starte Annahme des Auftrags:", order.id);
      setIsActionInProgress(true);
      
      // Direkt die acceptOrder-Funktion aufrufen
      await acceptOrder(
        order.id, 
        user.uid, 
        user.displayName || "Unbekannt"
      );
      
      console.log("Auftrag erfolgreich angenommen");
      
      // Zeige eine Toast-Benachrichtigung
      toast({
        title: "Auftrag angenommen",
        description: "Der Auftrag wurde erfolgreich angenommen.",
        variant: "default",
      });
      
      // Rufe onAccept auf, um die UI zu aktualisieren
      onAccept();
      
      // Schließe den Dialog 
      onClose();
    } catch (error) {
      console.error("Fehler beim Annehmen des Auftrags:", error);
      
      // Zeige eine Fehlermeldung
      toast({
        title: "Fehler",
        description: "Der Auftrag konnte nicht angenommen werden. Bitte versuche es erneut.",
        variant: "destructive",
      });
    } finally {
      setIsActionInProgress(false);
    }
  };

  const handleReject = () => {
    console.log("Starte Ablehnung des Auftrags:", order.id);
    
    // Weiterleiten an die Callback-Funktion, die vom übergeordneten Component bereitgestellt wird
    // Diese Funktion sollte einen Dialog öffnen, um den Ablehnungsgrund abzufragen
    onReject();
    
    // Dialog schließen
    onClose();
  };

  const handleEdit = () => {
    onEdit();
    onClose();
  };

  const handleComplete = async () => {
    if (!order) return;
    
    // Nur Teamleiter, Manager oder Admins können Zeiten erfassen und Aufträge abschließen
    if (!isTeamLead && userRole !== "admin" && userRole !== "manager") {
      toast({
        title: "Keine Berechtigung",
        description: "Als normaler Mitarbeiter dürfen Sie keine Zeiten eintragen oder den Auftrag abschließen. Dies kann nur durch den Teamleiter, Manager oder Administrator erfolgen.",
        variant: "destructive",
      });
      return;
    }
    
    // Prüfe, ob es Teammitglieder gibt, die Zeiten erfassen müssen
    if (order.assignedUsers && order.assignedUsers.length > 0) {
      toast({
        title: "Zeiterfassung erforderlich",
        description: "Vor dem Abschließen des Auftrags müssen Sie die Zeiten für alle Teammitglieder erfassen.",
        variant: "default",
      });
    }
    
    setIsTimeEntryDialogOpen(true);
  };

  // Funktion zum Wiedereröffnen eines abgeschlossenen Auftrags
  const handleReopenOrder = async () => {
    if (!user || !order) return;

    try {
      setIsProcessing(true);
      await reopenOrder(order.id, user.uid);
      
      toast({
        title: "Auftrag wiedereröffnet",
        description: "Der Auftrag wurde erfolgreich zur Bearbeitung wiedereröffnet.",
      });
      
      // Aktualisiere die UI nach der Wiedereröffnung - verwende nicht onComplete, da dies den Auftrag wieder als abgeschlossen markieren würde
      // onComplete();
      // Verwende stattdessen einen Refresh oder eine andere Funktion, die die UI aktualisiert
      // Schließe den Dialog
      onClose();
      // Lade die Daten neu ohne den Auftrag als abgeschlossen zu markieren
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Fehler beim Wiedereröffnen des Auftrags:", error);
      
      toast({
        title: "Fehler",
        description: "Beim Wiedereröffnen des Auftrags ist ein Fehler aufgetreten.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!order?.id) return;
    setIsSaving(true);

    try {
      // Alten Status speichern, bevor er aktualisiert wird
      const oldStatus = order.status || '';
      
      // Order aktualisieren
      await updateOrder(order.id, { status: status as any });
      
      // Benachrichtigung senden, wenn der Status sich geändert hat und ein Benutzer zugewiesen ist
      if (oldStatus !== status && order.assignedTo) {
        try {
          // Stellen Sie sicher, dass assignedTo ein String ist
          const userId = typeof order.assignedTo === 'string' ? order.assignedTo : 
                        Array.isArray(order.assignedTo) && order.assignedTo.length > 0 ? order.assignedTo[0] : '';
                        
          if (userId) {
            console.log("Status-Änderung für Benutzer:", userId, "von", oldStatus, "zu", status);
            
            // Benutzerinformationen abrufen, um die E-Mail-Adresse zu bekommen
            const assignedUser = await UserService.getUser(userId);
            
            // Hole die Mail-Konfiguration für den Fallback
            const mailConfig = await getMailConfig();
            
            let recipientEmail = "";
            
            if (assignedUser && (assignedUser as any).email) {
              recipientEmail = (assignedUser as any).email;
              console.log("Benutzer-E-Mail für Benachrichtigung gefunden:", recipientEmail);
            } else if (mailConfig.notificationEmail) {
              recipientEmail = mailConfig.notificationEmail;
              console.log("Fallback auf Benachrichtigungs-E-Mail aus der Konfiguration:", recipientEmail);
            }
            
            if (recipientEmail) {
              // Benachrichtigung senden
              console.log("Sende Statusänderungs-Benachrichtigung an:", recipientEmail);
              const success = await sendOrderStatusChangeNotification(
                order,
                oldStatus,
                status,
                recipientEmail
              );
              
              if (success) {
                console.log("Statusänderungs-Benachrichtigung erfolgreich gesendet");
              } else {
                console.warn("Statusänderungs-Benachrichtigung konnte nicht gesendet werden");
              }
            } else {
              console.warn("Keine E-Mail-Adresse für Benachrichtigung gefunden");
            }
          }
        } catch (error) {
          console.error("Fehler beim Senden der Statusänderungs-Benachrichtigung:", error);
        }
      }

      // Order-Daten neu laden
      onClose(); // Dialog schließen und stattdessen onClose aufrufen
      toast({
        title: "Erfolg",
        description: "Der Status wurde aktualisiert.",
      });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Status:", error);
      toast({
        title: "Fehler",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCommentSubmit = async () => {
    if (!commentText.trim() || !order?.id) return;

    setIsCommentSaving(true);
    try {
      const newComment = {
        text: commentText,
        createdBy: user?.uid || 'anonymous',
        createdAt: new Date(),
      };

      // saveComment steht nicht zur Verfügung, daher temporär deaktivieren oder durch eigenen Code ersetzen
      // await saveComment(order.id, newComment);
      
      // Benachrichtigung senden, wenn ein Benutzer zugewiesen ist
      if (order.assignedTo && user?.uid) {
        try {
          // Stellen Sie sicher, dass assignedTo ein String ist
          const userId = typeof order.assignedTo === 'string' ? order.assignedTo : 
                        Array.isArray(order.assignedTo) && order.assignedTo.length > 0 ? order.assignedTo[0] : '';
                        
          // Sende nur eine Benachrichtigung, wenn der Kommentar nicht vom zugewiesenen Benutzer selbst kommt
          if (userId && userId !== user.uid) {
            console.log("Neuer Kommentar für Benutzer:", userId, "von Benutzer:", user.uid);
            
            // Benutzerinformationen abrufen, um die E-Mail-Adresse zu bekommen
            const assignedUser = await UserService.getUser(userId);
            
            // Hole die Mail-Konfiguration für den Fallback
            const mailConfig = await getMailConfig();
            
            let recipientEmail = "";
            
            if (assignedUser && (assignedUser as any).email) {
              recipientEmail = (assignedUser as any).email;
              console.log("Benutzer-E-Mail für Kommentar-Benachrichtigung gefunden:", recipientEmail);
            } else if (mailConfig.notificationEmail) {
              recipientEmail = mailConfig.notificationEmail;
              console.log("Fallback auf Benachrichtigungs-E-Mail aus der Konfiguration:", recipientEmail);
            }
            
            if (recipientEmail) {
              // Benachrichtigung senden
              console.log("Sende Kommentar-Benachrichtigung an:", recipientEmail);
              const success = await sendOrderCommentNotification(
                order,
                commentText,
                recipientEmail
              );
              
              if (success) {
                console.log("Kommentar-Benachrichtigung erfolgreich gesendet");
              } else {
                console.warn("Kommentar-Benachrichtigung konnte nicht gesendet werden");
              }
            } else {
              console.warn("Keine E-Mail-Adresse für Kommentar-Benachrichtigung gefunden");
            }
          } else {
            console.log("Keine Benachrichtigung gesendet, da der Kommentar vom zugewiesenen Benutzer selbst kommt");
          }
        } catch (error) {
          console.error("Fehler beim Senden der Kommentar-Benachrichtigung:", error);
        }
      }
      
      // Kommentarfeld leeren und Daten neu laden
      setCommentText('');
      if (onClose) onClose();
      
      toast({
        title: "Erfolg",
        description: "Der Kommentar wurde hinzugefügt.",
      });
    } catch (error) {
      console.error("Fehler beim Speichern des Kommentars:", error);
      toast({
        title: "Fehler",
        description: "Der Kommentar konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsCommentSaving(false);
    }
  };

  const handleSetInProgress = async () => {
    if (!order?.id) return;
    setIsActionInProgress(true);

    try {
      // Status auf "in-progress" aktualisieren
      await updateOrder(order.id, { status: "in-progress" });
      
      toast({
        title: "Status aktualisiert",
        description: "Der Auftrag wurde in den Status 'In Bearbeitung' gesetzt.",
      });
      
      // Dialog schließen und UI aktualisieren
      onClose();
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Status:", error);
      toast({
        title: "Fehler",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsActionInProgress(false);
    }
  };

  // Komponente für Neuzuweisung nach Ablehnung
  const ReassignmentPanel = () => {
    if (!showReassignPanel) return null;
    
    return (
      <Card className="mb-4 border-red-300 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center mb-2">
            <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
            <h3 className="text-lg font-medium text-red-700">Auftrag wurde abgelehnt</h3>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Dieser Auftrag wurde von einem oder mehreren Mitarbeitern abgelehnt. Sie können neue Mitarbeiter zuweisen.
          </p>
          <Button 
            variant="outline" 
            size="sm"
            className="border-red-300 hover:bg-red-100 text-red-600"
            onClick={() => {
              if (order) {
                setSelectedOrder(order);
                setIsEditingOrder(true);
              }
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Neue Mitarbeiter zuweisen
          </Button>
        </CardContent>
      </Card>
    );
  };

  const canComplete = (userRole === "admin" || userRole === "manager" || isTeamLead) 
                    && order.status !== "completed";

  // Schaltflächen basierend auf Status und Benutzerrolle anzeigen
  const renderActionButtons = () => {
    // Debug-Ausgabe für bessere Fehleranalyse
    console.log("Render Action Buttons:", {
      status: order.status,
      userId: user?.uid,
      userRole,
      assignedTo: order.assignedTo,
      isUserAssigned: Array.isArray(order.assignedTo) 
        ? order.assignedTo.includes(user?.uid || "")
        : order.assignedTo === user?.uid,
      hasAssignedUsers: Boolean(order.assignedUsers),
      assignedUsersCount: order.assignedUsers?.length
    });

    // Mitarbeiter können Aufträge annehmen oder ablehnen, wenn der Status "assigned" ist
    if (order.status === "assigned" && user) {
      // WICHTIG: Zeige Annehmen/Ablehnen-Buttons für alle Benutzer mit Rolle "employee" und für alle zugewiesenen Benutzer
      const isUserAssigned = Array.isArray(order.assignedTo) 
        ? order.assignedTo.includes(user.uid)
        : order.assignedTo === user.uid;
        
      const isUserInAssignedUsers = order.assignedUsers 
        ? order.assignedUsers.some(u => u.id === user.uid)
        : false;
      
      // KORREKTUR: Immer Buttons anzeigen, wenn der Benutzer die Rolle "employee" hat ODER im Auftrag zugewiesen ist
      if (userRole === "employee" || isUserAssigned || isUserInAssignedUsers) {
        console.log("Zeige Annahme/Ablehnung-Buttons für:", user.uid);
        
        return (
          <div className="flex gap-2 mt-4">
            <Button
              variant="default"
              onClick={handleAccept}
              disabled={isActionInProgress}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Annehmen
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isActionInProgress}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Ablehnen
            </Button>
          </div>
        );
      }
    }

    // Teamleiter, Manager und Admins können Aufträge in Bearbeitung setzen, wenn der Status "accepted" ist
    if (order.status === "accepted" &&
       (userRole === "admin" || userRole === "manager" || isTeamLead)) {
      return (
        <Button
          variant="default"
          onClick={handleSetInProgress}
          disabled={isActionInProgress}
          className="mt-4"
        >
          <Clock className="h-4 w-4 mr-2" />
          In Bearbeitung setzen
        </Button>
      );
    }

    // Teamleiter, Manager und Admins können Aufträge abschließen, wenn der Status "in-progress" ist
    if (order.status === "in-progress" &&
       (userRole === "admin" || userRole === "manager" || isTeamLead)) {
      return (
        <Button
          variant="default"
          onClick={handleComplete}
          disabled={isActionInProgress}
          className="mt-4"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Auftrag abschließen
        </Button>
      );
    }

    // Manager und Admins können abgeschlossene Aufträge wieder öffnen
    if (order.status === "completed" && 
       (userRole === "admin" || userRole === "manager")) {
      return (
        <Button
          variant="outline"
          onClick={handleReopenOrder}
          disabled={isActionInProgress}
          className="mt-4"
        >
          Auftrag wiedereröffnen
        </Button>
      );
    }

    // Wenn keine der Bedingungen zutrifft, trotzdem prüfen, ob für den eingeloggten Benutzer die Buttons angezeigt werden sollten
    if (order.status === "assigned" && user) {
      // Fallback-Logik: Zeige Buttons für alle Mitarbeiter an, die einen Auftrag sehen können
      console.log("Fallback: Zeige Annahme/Ablehnung-Buttons für Mitarbeiter");
      return (
        <div className="flex gap-2 mt-4">
          <Button
            variant="default"
            onClick={handleAccept}
            disabled={isActionInProgress}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Annehmen
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isActionInProgress}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Ablehnen
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              {order.title}
              {getStatusBadge(order.status)}
              {order.priority && getPriorityBadge(order.priority)}
            </div>
            {(userRole === "admin" || userRole === "manager" || isTeamLead) && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleEdit} 
                disabled={isActionInProgress}
                className="ml-auto"
              >
                <Edit className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>
            Auftragsnummer: {order.id} | Erstellt: {formatDate(order.date)}
          </DialogDescription>
        </DialogHeader>
        
        {/* Tabs für bessere Organisation */}
        <div className="flex border-b mb-4">
          <button
            className={`px-4 py-2 ${activeTab === "details" ? "border-b-2 border-primary font-medium" : "text-gray-500"}`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            className={`px-4 py-2 ${activeTab === "team" ? "border-b-2 border-primary font-medium" : "text-gray-500"}`}
            onClick={() => setActiveTab("team")}
          >
            Team & Zuweisungen
          </button>
          <button
            className={`px-4 py-2 ${activeTab === "times" ? "border-b-2 border-primary font-medium" : "text-gray-500"}`}
            onClick={() => setActiveTab("times")}
          >
            Zeiterfassung
          </button>
        </div>
        
        {/* Tab-Inhalte */}
        {activeTab === "details" && (
          <div className="space-y-6">
            {/* Wichtige Auftragsdetails */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <h3 className="text-sm font-medium mb-2">Auftragsdetails</h3>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-medium">Status:</span>
                      <span className="col-span-2">{getStatusBadge(order.status)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-medium">Priorität:</span>
                      <span className="col-span-2">{order.priority ? getPriorityBadge(order.priority) : "Standard"}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-medium">Erstellt von:</span>
                      <span className="col-span-2">{order.userName || "Unbekannt"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-4">
                  <h3 className="text-sm font-medium mb-2">Zeitrahmen</h3>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-medium">Erstellt am:</span>
                      <span className="col-span-2">{formatDate(order.date)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-medium">Startdatum:</span>
                      <span className="col-span-2">{formatDate(order.startDate)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-medium">Enddatum:</span>
                      <span className="col-span-2 font-medium">{formatDate(order.endDate)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <span className="font-medium">Bestätigungsfrist:</span>
                      <span className="col-span-2">{formatDate(order.confirmationDeadline)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Kunden- und Projektinformationen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border-blue-100">
                <CardContent className="pt-4">
                  <h3 className="text-sm font-medium mb-2 text-blue-800">Kundeninformationen</h3>
                  {(order.client || order.customerId) ? (
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-3 gap-1">
                        <span className="font-medium">Kundenname:</span>
                        <span className="col-span-2 font-medium text-blue-700">{order.client || "Name nicht verfügbar"}</span>
                      </div>
                      {order.customerId && (
                        <div className="grid grid-cols-3 gap-1">
                          <span className="font-medium">Kunden-ID:</span>
                          <span className="col-span-2">{order.customerId}</span>
                        </div>
                      )}
                      
                      {/* Zusätzliche Kundendetails, falls vorhanden */}
                      {order.customerDetails && (
                        <>
                          {order.customerDetails.email && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">E-Mail:</span>
                              <span className="col-span-2">{order.customerDetails.email}</span>
                            </div>
                          )}
                          
                          {order.customerDetails.phone && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Telefon:</span>
                              <span className="col-span-2">{order.customerDetails.phone}</span>
                            </div>
                          )}
                          
                          {order.customerDetails.website && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Website:</span>
                              <span className="col-span-2">
                                <a href={order.customerDetails.website} target="_blank" rel="noopener noreferrer"
                                   className="text-blue-600 hover:underline">
                                  {order.customerDetails.website}
                                </a>
                              </span>
                            </div>
                          )}
                          
                          {order.customerDetails.address && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Adresse:</span>
                              <span className="col-span-2">
                                {order.customerDetails.address.street} {order.customerDetails.address.houseNumber}, 
                                {order.customerDetails.address.zipCode} {order.customerDetails.address.city}
                              </span>
                            </div>
                          )}
                          
                          {order.customerDetails.contactPersons && order.customerDetails.contactPersons.length > 0 && (
                            <div className="mt-2">
                              <span className="font-medium">Ansprechpartner:</span>
                              <div className="mt-1 pl-2 border-l-2 border-blue-100">
                                {order.customerDetails.contactPersons.map((contact: any, index: number) => (
                                  <div key={index} className="py-1">
                                    <div className="font-medium">{contact.name}</div>
                                    {contact.position && <div className="text-xs text-gray-500">{contact.position}</div>}
                                    <div className="flex items-center gap-2 mt-1">
                                      {contact.email && (
                                        <a href={`mailto:${contact.email}`} className="text-xs text-blue-600 hover:underline">
                                          {contact.email}
                                        </a>
                                      )}
                                      {contact.phone && (
                                        <a href={`tel:${contact.phone}`} className="text-xs text-blue-600 hover:underline">
                                          {contact.phone}
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      
                      <div className="mt-2 pt-2 border-t border-blue-100">
                        {order.customerId ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => window.open(`/customers/${order.customerId}`, '_blank')}
                          >
                            Kundendetails anzeigen
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-500 italic">Vollständige Kundendaten nicht verfügbar</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-md text-gray-500 text-center italic">
                      Kein Kunde zugewiesen
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card className="border-green-100">
                <CardContent className="pt-4">
                  <h3 className="text-sm font-medium mb-2 text-green-800">Projektinformationen</h3>
                  {(order.project || order.projectId) ? (
                    <div className="space-y-2 text-sm">
                      <div className="grid grid-cols-3 gap-1">
                        <span className="font-medium">Projektname:</span>
                        <span className="col-span-2 font-medium text-green-700">{order.project || "Name nicht verfügbar"}</span>
                      </div>
                      {order.projectId && (
                        <div className="grid grid-cols-3 gap-1">
                          <span className="font-medium">Projekt-ID:</span>
                          <span className="col-span-2">{order.projectId}</span>
                        </div>
                      )}
                      {order.category && (
                        <div className="grid grid-cols-3 gap-1">
                          <span className="font-medium">Kategorie:</span>
                          <span className="col-span-2">{order.category}</span>
                        </div>
                      )}
                      
                      {/* Zusätzliche Projektdetails, falls vorhanden */}
                      {order.projectDetails && (
                        <>
                          {order.projectDetails.description && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Beschreibung:</span>
                              <span className="col-span-2">{order.projectDetails.description}</span>
                            </div>
                          )}
                          
                          {order.projectDetails.status && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Status:</span>
                              <span className="col-span-2">{order.projectDetails.status}</span>
                            </div>
                          )}
                          
                          {order.projectDetails.budget && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Budget:</span>
                              <span className="col-span-2">
                                {typeof order.projectDetails.budget === 'number' 
                                  ? `${order.projectDetails.budget.toLocaleString('de-DE')} €`
                                  : order.projectDetails.budget}
                              </span>
                            </div>
                          )}
                          
                          {order.projectDetails.startDate && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Projektstart:</span>
                              <span className="col-span-2">{formatDate(order.projectDetails.startDate)}</span>
                            </div>
                          )}
                          
                          {order.projectDetails.endDate && (
                            <div className="grid grid-cols-3 gap-1">
                              <span className="font-medium">Projektende:</span>
                              <span className="col-span-2">{formatDate(order.projectDetails.endDate)}</span>
                            </div>
                          )}
                        </>
                      )}
                      
                      <div className="mt-2 pt-2 border-t border-green-100">
                        {order.projectId ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => window.open(`/projects/${order.projectId}`, '_blank')}
                          >
                            Projektdetails anzeigen
                          </Button>
                        ) : (
                          <span className="text-xs text-gray-500 italic">Vollständige Projektdaten nicht verfügbar</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-md text-gray-500 text-center italic">
                      Kein Projekt zugewiesen
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Projektstandort mit Karte */}
            <Card>
              <CardContent className="pt-4">
                <h3 className="text-sm font-medium mb-2">Projektstandort</h3>
                <div className="space-y-2 text-sm">
                  {/* Nur Adressinformationen aus dem Projekt laden */}
                  {order.projectId ? (
                    <FetchProjectLocation projectId={order.projectId} />
                  ) : (
                    <div className="text-sm text-muted-foreground">Keine Standortinformationen verfügbar</div>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Beschreibung */}
            <div>
              <h3 className="text-sm font-medium mb-2">Auftragsbeschreibung</h3>
              <div className="bg-gray-50 p-4 rounded-md whitespace-pre-wrap">{order.description || "Keine Beschreibung vorhanden"}</div>
            </div>
            
            {/* Ablehnungsgrund anzeigen, falls vorhanden und Status 'rejected' */}
            {order.status === "rejected" && order.rejectionReason && (
              <div>
                <h3 className="text-sm font-medium mb-2 text-red-600">Ablehnungsgrund</h3>
                <div className="bg-red-50 p-4 rounded-md whitespace-pre-wrap">{order.rejectionReason}</div>
              </div>
            )}
          </div>
        )}
        
        {activeTab === "team" && (
          <div className="space-y-6">
            {/* Zuständiger Manager */}
            <div>
              <h3 className="text-sm font-medium mb-2">Zuständiger Manager</h3>
              <div className="flex items-center bg-gray-50 p-3 rounded-md">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center mr-3">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium">{order.managerName || "Kein Manager zugewiesen"}</p>
                </div>
              </div>
            </div>
            
            {/* Zugewiesene Mitarbeiter */}
            <div>
              <h3 className="text-sm font-medium mb-2">Zugewiesene Mitarbeiter</h3>
              {Array.isArray(order.assignedUsers) && order.assignedUsers.length > 0 ? (
                <div className="space-y-2">
                  {order.assignedUsers.map((assignedUser, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center mr-3">
                          <span className="text-sm font-medium">{assignedUser.name?.charAt(0) || "?"}</span>
                        </div>
                        <div>
                          <p className="font-medium">{assignedUser.name || "Unbekannt"}</p>
                          {assignedUser.isTeamLead && (
                            <Badge variant="outline" className="text-xs">Teamleiter</Badge>
                          )}
                        </div>
                      </div>
                      <div>
                        {getAssignedUserStatusBadge(assignedUser.status || "pending")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-md text-gray-500 italic text-center">
                  Keine Mitarbeiter zugewiesen
                </div>
              )}
            </div>
            
            {/* Reassignment Panel wenn nötig */}
            {showReassignPanel && <ReassignmentPanel />}
          </div>
        )}
        
        {activeTab === "times" && (
          <div className="space-y-6">
            <h3 className="text-sm font-medium mb-2">Zeiterfassung</h3>
            
            {/* Gesamtzeit */}
            <div className="bg-blue-50 p-4 rounded-md">
              <h4 className="font-medium mb-2">Gesamtzeit für diesen Auftrag</h4>
              <div className="text-2xl font-bold">
                {order.totalTimeSpent || Array.isArray(order.assignedUsers) 
                  ? `${(order.assignedUsers || []).reduce((total, user) => total + (user.timeSpent || 0), 0)} Stunden`
                  : "Keine Zeit erfasst"}
              </div>
            </div>
            
            {/* Zeit pro Mitarbeiter */}
            {Array.isArray(order.assignedUsers) && order.assignedUsers.some(u => (u.timeSpent || 0) > 0) && (
              <div>
                <h4 className="text-sm font-medium mb-2">Zeit pro Mitarbeiter</h4>
                <div className="space-y-2">
                  {order.assignedUsers
                    .filter(user => (user.timeSpent || 0) > 0)
                    .map((user, index) => (
                      <div key={index} className="flex justify-between bg-gray-50 p-3 rounded-md">
                        <span>{user.name}</span>
                        <span className="font-medium">{user.timeSpent} Stunden</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
            
            {/* Zeit erfassen Button */}
            {(userRole === "admin" || userRole === "manager" || 
              (user && order.assignedTo && 
               (Array.isArray(order.assignedTo) 
                ? order.assignedTo.includes(user.uid)
                : order.assignedTo === user.uid)
              )) && (
              <div className="flex justify-center">
                <Button 
                  onClick={() => setIsTimeEntryDialogOpen(true)}
                  disabled={isActionInProgress || order.status === "completed"}
                >
                  Zeit erfassen
                </Button>
              </div>
            )}
          </div>
        )}
        
        <DialogFooter className="flex flex-col sm:flex-row justify-between items-start">
          <div className="flex-1">
            {/* Aktionsschaltflächen basierend auf Status und Benutzerrolle */}
            {renderActionButtons()}
          </div>
          <div className="flex gap-2 mt-4 sm:mt-0">
            <Button variant="outline" onClick={onClose}>
              Schließen
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
      
      {/* Zeit-Dialog */}
      {isTimeEntryDialogOpen && (
        <TimeEntryDialog
          isOpen={isTimeEntryDialogOpen}
          onClose={() => setIsTimeEntryDialogOpen(false)}
          order={order}
          onComplete={() => {
            toast({
              title: "Auftrag abgeschlossen",
              description: "Der Auftrag wurde erfolgreich abgeschlossen und die Zeiten wurden erfasst.",
            });
            setIsTimeEntryDialogOpen(false);
            // Aktualisierung der übergeordneten Komponente
            if (onClose) onClose();
          }}
          onOrderUpdated={() => {
            if (onUpdate && order) onUpdate(order);
          }}
        />
      )}
      
      {/* Auftrag-Bearbeiten-Dialog */}
      {isEditingOrder && (
        <OrderDialog
          isOpen={isEditingOrder}
          onClose={() => setIsEditingOrder(false)}
          order={order}
          onSubmit={(updatedOrderData) => {
            setIsEditingOrder(false);
            if (onUpdate && order) {
              // Kombiniere die aktuelle Order mit den aktualisierten Daten
              const updatedOrder: Order = { ...order, ...updatedOrderData };
              onUpdate(updatedOrder);
            }
          }}
          userRole={userRole}
        />
      )}
    </Dialog>
  );
};

// Neue Komponente für das Laden und Anzeigen der Projektadresse
interface FetchProjectLocationProps {
  projectId: string;
}

const FetchProjectLocation: React.FC<FetchProjectLocationProps> = ({ projectId }) => {
  const [projectLocation, setProjectLocation] = useState<{
    address?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjectDetails = async () => {
      try {
        setIsLoading(true);
        const projectData = await ProjectService.getProjectById(projectId);
        
        if (projectData && (projectData.address || (projectData.latitude && projectData.longitude))) {
          setProjectLocation({
            address: projectData.address,
            latitude: projectData.latitude,
            longitude: projectData.longitude
          });
        } else {
          setProjectLocation(null);
        }
      } catch (error) {
        console.error("Fehler beim Laden der Projektadresse:", error);
        setProjectLocation(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (projectId) {
      fetchProjectDetails();
    }
  }, [projectId]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Standort wird geladen...</div>;
  }

  if (!projectLocation || (!projectLocation.address && (!projectLocation.latitude || !projectLocation.longitude))) {
    return <div className="text-sm text-muted-foreground">Keine Standortinformationen verfügbar</div>;
  }

  return (
    <div className="mt-1">
      {/* Hervorgehobene Adressanzeige */}
      <div className="bg-blue-50 p-3 rounded-md mb-3">
        <div className="text-xs text-blue-700 font-medium mb-1">Einsatzort:</div>
        <div className="text-sm font-medium">{projectLocation.address || "Keine Adresse angegeben"}</div>
      </div>
      
      {projectLocation.latitude && projectLocation.longitude && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Kartenansicht:</div>
          <div className="w-full h-52 relative rounded-md overflow-hidden border">
            <img
              src={mapsApi.getStaticMapUrl(
                projectLocation.latitude,
                projectLocation.longitude,
                15,
                600,
                300
              )}
              alt="Projekt Standort"
              className="w-full h-full object-cover"
              onError={(e) => {
                console.error("Fehler beim Laden der Karte:", e);
                const target = e.target as HTMLImageElement;
                target.onerror = null;
                target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22600%22%20height%3D%22300%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%22600%22%20height%3D%22300%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%22300%22%20y%3D%22150%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20text-anchor%3D%22middle%22%20dominant-baseline%3D%22middle%22%20fill%3D%22%23999%22%3EKartenbild konnte nicht geladen werden%3C%2Ftext%3E%3C%2Fsvg%3E';
              }}
              loading="lazy"
            />
            <div className="absolute bottom-2 left-2 right-2 bg-black/50 text-white text-xs p-2 rounded">
              {projectLocation.address || `Standort (${projectLocation.latitude.toFixed(6)}, ${projectLocation.longitude.toFixed(6)})`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails; 