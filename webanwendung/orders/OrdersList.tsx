import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronsUpDown,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Plus,
  Filter,
  MoreVertical,
  Check,
  X,
  User,
  CheckSquare,
  Trash2,
  Loader2
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Order, AssignedUser } from "@/lib/services/orderService";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  getAllOrders,
  getUserOrders,
  acceptOrder,
  rejectOrder,
  deleteOrder,
  addOrder,
  updateOrder,
  completeOrder
} from "@/lib/services/orderService";
import OrderDialog from "./OrderDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomerService } from "@/lib/services/customerService";
import { ProjectService } from "@/lib/services/projectService";
import { Timestamp } from "firebase/firestore";
import OrderDetails from "./OrderDetails";

// Interface für Kunden
interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  active?: boolean;
}

// Interface für Projekte
interface Project {
  id: string;
  name: string;
  customerId?: string;
  active?: boolean;
}

// Definiere UserRole, falls noch nicht geschehen
type UserRole = "employee" | "manager" | "admin";

interface OrdersListProps {
  orders: Order[];
  isLoading?: boolean;
  onRefresh?: () => void;
  userRole: UserRole;
  onOrderSelected?: (order: Order) => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  onUpdate?: (order: Order) => void;
  lastUpdated?: Date | null;
  onAcceptOrder?: (orderId: string) => void;
  onDeclineOrder?: (orderId: string, reason?: string) => void;
  onViewDetails?: (orderId: string) => void;
  onOrdersChange?: () => void;
  availableEmployees?: Array<{ id: string; name: string }>;
}

const OrdersList = ({
  orders = [],
  userRole = "employee",
  onAcceptOrder = () => {},
  onDeclineOrder = () => {},
  onViewDetails = () => {},
  onOrdersChange = () => {},
  availableEmployees = [],
  onRefresh = () => {},
}: OrdersListProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<
    | "Alle"
    | "assigned"
    | "accepted"
    | "rejected"
    | "in-progress"
    | "completed"
    | "pending"
  >("Alle");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | undefined>(undefined);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [processingOrderId, setProcessingOrderId] = useState("");
  const navigate = useNavigate();

  const filteredOrders = orders.filter((order) => {
    // Apply status filter
    if (filter !== "Alle") {
      // Für normale Status-Filter
      if (userRole === "admin" || userRole === "manager") {
        // Manager und Admins sehen den globalen Status
        if (filter !== order.status) return false;
      } else if (userRole === "employee" && user?.uid) {
        // Für Mitarbeiter: Status basierend auf ihrem eigenen Status im Auftrag filtern
        
        // Prüfen, ob der Benutzer in assignedUsers ist und seinen Status abrufen
        if (order.assignedUsers && Array.isArray(order.assignedUsers)) {
          const userAssignment = order.assignedUsers.find(u => u.id === user.uid);
          
          // Wenn der Benutzer zugewiesen ist, seinen individuellen Status verwenden
          if (userAssignment) {
            // Wenn der Filter nicht mit dem individuellen Status übereinstimmt, ausfiltern
            if (filter !== userAssignment.status) return false;
          } else {
            // Wenn der Benutzer nicht in assignedUsers ist, aber der Auftrag ihm zugewiesen ist
            // (ältere Datenstruktur), dann den globalen Status verwenden
            if (filter !== order.status) return false;
          }
        } else {
          // Fallback auf globalen Status, wenn keine assignedUsers vorhanden sind
          if (filter !== order.status) return false;
        }
      }
    }

    // Apply search filter
    if (
      searchTerm &&
      !order.title.toLowerCase().includes(searchTerm.toLowerCase())
    )
      return false;

    return true;
  });

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "assigned":
        return "secondary";
      case "accepted":
        return "default";
      case "rejected":
        return "destructive";
      case "in-progress":
        return "default";
      case "completed":
        return "outline";
      case "pending":
        return "outline";
      default:
        return "secondary";
    }
  };

  // CSS-Stil für den Status "completed" (abgeschlossen)
  const getStatusBadgeStyle = (status: string) => {
    if (status === "completed") {
      return { backgroundColor: "#10b981", color: "white", fontWeight: "500" };
    }
    return {}; // Leeres Objekt für alle anderen Status
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

  const getPriorityBadgeVariant = (priority?: string) => {
    switch (priority) {
      case "Niedrig":
        return "outline";
      case "Mittel":
        return "secondary";
      case "Hoch":
        return "destructive";
      default:
        return "outline";
    }
  };

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) return;

    try {
      console.log("Starte Annahme des Auftrags:", orderId);
      
      // UI-Status auf "Verarbeitung..." setzen
      setProcessingOrderId(orderId);
      
      // Direkt die acceptOrder-Funktion aufrufen
      await acceptOrder(
        orderId, 
        user.uid, 
        user.displayName || "Unknown User"
      );
      
      console.log("Auftrag erfolgreich angenommen");
      
      // Callback aufrufen, der von Orders.tsx bereitgestellt wird
      onAcceptOrder(orderId);
      
      // Toast-Benachrichtigung anzeigen
      toast({
        title: "Auftrag angenommen",
        description: "Der Auftrag wurde erfolgreich angenommen.",
        variant: "default"
      });
    } catch (error) {
      console.error("Fehler beim Annehmen des Auftrags:", error);
      
      toast({
        title: "Fehler",
        description: "Beim Akzeptieren des Auftrags ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    } finally {
      // UI-Status zurücksetzen
      setProcessingOrderId("");
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowRejectionDialog(true);
  };

  const confirmRejectOrder = async () => {
    if (!user || !selectedOrderId) return;

    try {
      await rejectOrder(
        selectedOrderId,
        user.uid,
        user.displayName || "Unknown User",
        rejectionReason,
      );
      onDeclineOrder(selectedOrderId, rejectionReason);
      setShowRejectionDialog(false);
      setRejectionReason("");
      setSelectedOrderId("");
    } catch (error) {
      console.error("Error rejecting order:", error);
      toast({
        title: "Fehler",
        description: "Beim Ablehnen des Auftrags ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      await deleteOrder(orderId);
      toast({
        title: "Auftrag gelöscht",
        description: "Der Auftrag wurde erfolgreich gelöscht.",
      });
    } catch (error) {
      console.error("Error deleting order:", error);
      toast({
        title: "Fehler",
        description: "Beim Löschen des Auftrags ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    }
  };

  const handleEditOrder = (order: Order) => {
    // Zur Bearbeitungsansicht navigieren
    navigate(`/orders/edit/${order.id}`);
  };

  const handleCreateOrder = () => {
    // Erstelle einen Standardauftrag mit Grundwerten
    const defaultOrder: Partial<Order> = {
      title: "",
      description: "",
      client: "",
      status: "pending",
      priority: "Mittel",
      date: new Date(),
      startDate: new Date(),
      endDate: new Date(new Date().setDate(new Date().getDate() + 7)), // 1 Woche in der Zukunft
      confirmationDeadline: new Date(new Date().setDate(new Date().getDate() + 1)), // 1 Tag in der Zukunft
    };
    
    setCurrentOrder(defaultOrder as Order);
    setIsCreatingOrder(true);
  };

  const handleOrderSubmit = async (orderData: Partial<Order>) => {
    try {
      console.log("🔄 Starte OrderSubmit mit Daten:", JSON.stringify(orderData, null, 2).substring(0, 500) + "...");
      
      // Sichere Bereinigung der Daten, um Fehler bei leeren IDs zu vermeiden
      // Tiefe Reinigung: Alle Felder durchgehen und prüfen
      const cleanupProperties = (obj: any): any => {
        // Wenn es kein Objekt ist oder null ist, direkt zurückgeben
        if (!obj || typeof obj !== 'object' || obj instanceof Date || obj instanceof Timestamp) {
          return obj;
        }

        // Wenn es ein Array ist, jedes Element bereinigen
        if (Array.isArray(obj)) {
          return obj.map(item => cleanupProperties(item)).filter(item => item !== undefined);
        }

        // Für Objekte: Leere ID-Felder entfernen
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          // Project und ProjectId explizit beibehalten
          if (key === 'project' || key === 'projectId' || key === 'client' || key === 'customerId') {
            result[key] = value;
            continue;
          }
          
          // ID-Felder mit leeren Strings überspringen, außer project und customer IDs
          if (key.endsWith('Id') && key !== 'projectId' && key !== 'customerId' && 
             (value === "" || value === null || value === undefined)) {
            console.log(`🔍 Überspringe leeres ID-Feld in OrdersList: ${key}`);
            continue;
          }
          
          // Recursive Bereinigung für verschachtelte Objekte
          const cleanedValue = cleanupProperties(value);
          
          // Nur definierte Werte übernehmen
          if (cleanedValue !== undefined) {
            result[key] = cleanedValue;
          }
        }
        return result;
      };

      // Bereinige alle Eigenschaften des Auftrags
      const cleanOrderData = cleanupProperties(orderData);
      
      console.log("🧹 Bereinigte Daten für OrderSubmit:", JSON.stringify(cleanOrderData, null, 2).substring(0, 500) + "...");
      
      // Prüfe, ob wir einen neuen Auftrag erstellen oder einen bestehenden bearbeiten
      if (isEditingOrder && currentOrder && currentOrder.id) {
        // Bearbeitung eines bestehenden Auftrags
        await updateOrder(currentOrder.id, cleanOrderData);
      } else {
        // Erstellung eines neuen Auftrags
        await addOrder(cleanOrderData as Omit<Order, "id">);
      }
      // Erfolgsbenachrichtigung anzeigen
      toast({
        title: currentOrder ? "Auftrag aktualisiert" : "Auftrag erstellt",
        description: currentOrder ? "Der Auftrag wurde erfolgreich aktualisiert." : "Der Auftrag wurde erfolgreich erstellt.",
      });
      
      // Dialog schließen
      setIsCreatingOrder(false);
      setIsEditingOrder(false);
    } catch (error) {
      console.error("Fehler beim Speichern des Auftrags:", error);
      // Fehlerbenachrichtigung anzeigen
      toast({
        title: "Fehler",
        description: "Beim Speichern des Auftrags ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    }
  };

  const formatDate = (date: Timestamp | Date | undefined) => {
    if (!date) return "";
    
    try {
      // Wenn es ein Firestore Timestamp ist
      if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
        const dateObj = date.toDate();
        return `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Wenn es ein Date-Objekt ist
      if (date instanceof Date) {
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // Wenn es ein String ist
      if (typeof date === 'string') {
        const dateObj = new Date(date);
        return `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      return "";
    } catch (error) {
      console.error("Fehler bei der Datumskonvertierung:", error, date);
      return "";
    }
  };

  const handleViewDetails = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      setSelectedOrder(order);
      setIsOrderDetailsOpen(true);
    }
    onViewDetails(orderId);
  };

  const handleCompleteOrder = async (orderId: string) => {
    if (!user) return;

    try {
      await completeOrder(orderId, user.uid, user.displayName || "Unknown User", userRole);
      toast({
        title: "Auftrag abgeschlossen",
        description: "Der Auftrag wurde erfolgreich als abgeschlossen markiert.",
      });
    } catch (error) {
      console.error("Error completing order:", error);
      toast({
        title: "Fehler",
        description: "Beim Abschließen des Auftrags ist ein Fehler aufgetreten.",
        variant: "destructive"
      });
    }
  };

  // Lade Kunden- und Projektdaten
  useEffect(() => {
    const loadCustomersAndProjects = async () => {
      try {
        setCustomersLoading(true);
        setProjectsLoading(true);
        
        // Kunden laden mit dem CustomerService
        const customersData = await CustomerService.getActiveCustomers();
        setCustomers(customersData);
        
        // Projekte laden mit dem ProjectService
        const projectsData = await ProjectService.getActiveProjects();
        setProjects(projectsData);
      } catch (error) {
        console.error("Fehler beim Laden der Kunden- und Projektdaten:", error);
        toast({
          title: "Fehler",
          description: "Die Kunden- und Projektdaten konnten nicht geladen werden.",
          variant: "destructive",
        });
      } finally {
        setCustomersLoading(false);
        setProjectsLoading(false);
      }
    };
    
    loadCustomersAndProjects();
  }, [toast]);

  useEffect(() => {
    // Manuelles Neuladen der Daten alle 10 Sekunden
    const interval = setInterval(() => {
      if (onRefresh) onRefresh();
    }, 10000);
    return () => clearInterval(interval);
  }, [onRefresh]);

  // Hilfsfunktion für die Anzeige des Filternamens
  const getFilterDisplayName = (filterName: string): string => {
    switch (filterName) {
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
      case "Alle":
        return "Alle";
      default:
        return filterName;
    }
  };

  // Helper-Funktion, um den korrekten Status für den aktuellen Benutzer zu bestimmen
  const getUserSpecificStatus = (order: Order): string => {
    // Für Manager und Admins: den globalen Status zurückgeben
    if (userRole === "admin" || userRole === "manager") {
      return order.status || "assigned"; // Fallback, falls status undefined ist
    }
    
    // Für Mitarbeiter: individuellen Status zurückgeben
    if (user?.uid && order.assignedUsers && Array.isArray(order.assignedUsers)) {
      const userAssignment = order.assignedUsers.find(u => u.id === user.uid);
      
      // Wenn der Benutzer in assignedUsers gefunden wurde, seinen Status zurückgeben
      if (userAssignment && userAssignment.status) {
        return userAssignment.status;
      }
    }
    
    // Fallback: globalen Status zurückgeben oder "assigned" als Default
    return order.status || "assigned";
  };

  // Funktion zum Prüfen, ob Aktionsbuttons angezeigt werden sollen
  const shouldShowActionButtons = (order: Order): boolean => {
    // Prüfen, ob der Benutzer ein Mitarbeiter ist und eingeloggt ist
    if (!user?.uid) return false;
    
    // Für Mitarbeiter: Prüfen des individuellen Status
    if (userRole === "employee") {
      // Prüfen, ob der Benutzer in assignedUsers ist
      if (order.assignedUsers && Array.isArray(order.assignedUsers)) {
        const userAssignment = order.assignedUsers.find(u => u.id === user.uid);
        if (userAssignment) {
          // Buttons anzeigen, wenn der Status "assigned" oder "pending" ist
          return userAssignment.status === "assigned" || userAssignment.status === "pending";
        }
      }
      
      // Fallback: Globalen Status verwenden
      return order.status === "assigned" || order.status === "pending";
    }
    
    // Für Manager und Admins: Aufträge mit Status "assigned" oder "pending" erlauben
    return order.status === "assigned" || order.status === "pending";
  };

  return (
    <div className="w-full bg-background rounded-lg shadow-sm border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-semibold text-foreground">Aufträge</h2>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {(userRole === "manager" || userRole === "admin") && (
              <Button
                variant="default"
                size="sm"
                onClick={handleCreateOrder}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                <span className="sm:inline">Neuer Auftrag</span>
              </Button>
            )}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Suchen..."
                className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filter:</span> {getFilterDisplayName(filter)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Nach Status filtern</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => setFilter("Alle")}>
                    {filter === "Alle" && <Check className="mr-2 h-4 w-4" />}
                    Alle
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("assigned")}>
                    {filter === "assigned" && (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Zugewiesen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("accepted")}>
                    {filter === "accepted" && (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Angenommen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("rejected")}>
                    {filter === "rejected" && (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Abgelehnt
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("in-progress")}>
                    {filter === "in-progress" && (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    In Bearbeitung
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("completed")}>
                    {filter === "completed" && (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Abgeschlossen
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("pending")}>
                    {filter === "pending" && (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    Ausstehend
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <p>Keine Aufträge gefunden.</p>
        </div>
      ) : (
        <>
          {/* Desktop Tabelle - nur auf größeren Bildschirmen anzeigen */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Auftrag
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Kunde / Projekt
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Zeitraum
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Priorität
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Zugewiesen an
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Aktionen
                  </th>
                </tr>
              </thead>
              <tbody className="bg-background divide-y divide-border">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900">
                          {order.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {order.description}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        {order.client && (
                          <div className="flex items-center">
                            <Badge variant="outline" className="mr-1 bg-blue-50 text-blue-700 border-blue-200">
                              Kunde
                            </Badge>
                            <span className="text-sm text-blue-800">{order.client}</span>
                          </div>
                        )}
                        {order.project && (
                          <div className="flex items-center mt-1">
                            <Badge variant="outline" className="mr-1 bg-green-50 text-green-700 border-green-200">
                              Projekt
                            </Badge>
                            <span className="text-sm text-green-800">{order.project}</span>
                          </div>
                        )}
                        {!order.client && !order.project && (
                          <span className="text-sm text-gray-500 italic">Keine Zuordnung</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatDate(order.startDate || new Date())} -{" "}
                        {formatDate(order.endDate || new Date())}
                      </div>
                      <div className="text-xs text-gray-500">
                        <Clock className="inline-block h-3 w-3 mr-1" />
                        Bestätigung bis: {formatDate(order.confirmationDeadline || new Date())}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Badge 
                        variant={getStatusBadgeVariant(getUserSpecificStatus(order))}
                        style={getStatusBadgeStyle(getUserSpecificStatus(order))}
                      >
                        {getStatusLabel(getUserSpecificStatus(order))}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {order.priority && (
                        <Badge variant={getPriorityBadgeVariant(order.priority)}>
                          {order.priority}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {/* Einzelner Mitarbeiter (alte Version) */}
                      {order.assignedToName && !Array.isArray(order.assignedToName) && (
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full overflow-hidden bg-gray-100 mr-2">
                            <User className="h-5 w-5 m-1.5" />
                          </div>
                          <span className="text-sm text-gray-900">{order.assignedToName}</span>
                        </div>
                      )}
                      
                      {/* Mehrere Mitarbeiter (neue Version) */}
                      {Array.isArray(order.assignedToName) && (
                        <div className="flex flex-col space-y-1">
                          {order.assignedToName.length > 0 ? (
                            <>
                              <div className="flex items-center flex-wrap gap-1">
                                {order.assignedToName.slice(0, 2).map((name, index) => (
                                  <div key={index} className="flex items-center mr-1">
                                    <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center mr-1">
                                      <span className="text-xs">{name.charAt(0)}</span>
                                    </div>
                                    <span className="text-xs">{name.split(' ')[0]}</span>
                                  </div>
                                ))}
                                {order.assignedToName.length > 2 && (
                                  <span className="text-xs text-gray-500">
                                    +{order.assignedToName.length - 2} weitere
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {order.assignedToName.length} {order.assignedToName.length === 1 ? 'Person' : 'Personen'}
                              </span>
                            </>
                          ) : (
                            <span className="text-sm text-gray-500">Nicht zugewiesen</span>
                          )}
                        </div>
                      )}
                      
                      {/* Neue strukturierte Zuweisung mit Statusanzeige */}
                      {order.assignedUsers && (
                        <div className="flex flex-col space-y-1">
                          {order.assignedUsers.length > 0 ? (
                            <>
                              <div className="flex flex-col gap-1">
                                {order.assignedUsers.map((user, index) => {
                                  // Begrenzen auf 3 sichtbare Einträge
                                  if (index >= 3) return null;
                                  
                                  // Status-Symbol festlegen
                                  let statusIcon = null;
                                  let statusColor = "bg-gray-200";
                                  
                                  switch (user.status) {
                                    case "accepted":
                                      statusIcon = <CheckCircle className="h-3 w-3 text-green-500" />;
                                      statusColor = "bg-green-100";
                                      break;
                                    case "rejected":
                                      statusIcon = <XCircle className="h-3 w-3 text-red-500" />;
                                      statusColor = "bg-red-100";
                                      break;
                                    case "completed":
                                      statusIcon = <CheckSquare className="h-3 w-3 text-blue-500" />;
                                      statusColor = "bg-blue-100";
                                      break;
                                    default:
                                      statusIcon = <Clock className="h-3 w-3 text-gray-500" />;
                                      statusColor = "bg-gray-100";
                                  }
                                  
                                  return (
                                    <div key={user.id} className="flex items-center justify-between">
                                      <div className="flex items-center">
                                        <div className={`h-5 w-5 rounded-full flex items-center justify-center mr-1 ${statusColor}`}>
                                          {statusIcon}
                                        </div>
                                        <span className="text-xs">
                                          {user.name.split(' ')[0]}
                                          {user.isTeamLead && (
                                            <span className="ml-1 text-blue-600">👑</span>
                                          )}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                                
                                {order.assignedUsers.length > 3 && (
                                  <div className="flex items-center">
                                    <div className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center mr-1">
                                      <span className="text-xs">+{order.assignedUsers.length - 3}</span>
                                    </div>
                                    <span className="text-xs text-gray-500">weitere</span>
                                  </div>
                                )}
                              </div>
                              
                              {/* Teamleiter Info */}
                              {order.assignedUsers.find(u => u.isTeamLead) && (
                                <div className="text-xs text-gray-600 italic">
                                  Teamleiter: {order.assignedUsers.find(u => u.isTeamLead)?.name.split(' ')[0]}
                                </div>
                              )}
                              
                              {/* Zeige Fortschritt an */}
                              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                <div 
                                  className="bg-green-500 h-1.5 rounded-full" 
                                  style={{ 
                                    width: `${Math.round(
                                      (order.assignedUsers.filter(
                                        u => u.status === "completed" || u.status === "accepted"
                                      ).length / order.assignedUsers.length) * 100
                                    )}%` 
                                  }}
                                />
                              </div>
                              
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>
                                  {order.assignedUsers.filter(u => u.status === "completed").length} abgeschlossen
                                </span>
                                <span>
                                  {order.assignedUsers.filter(u => u.status === "rejected").length} abgelehnt
                                </span>
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-gray-500">Nicht zugewiesen</span>
                          )}
                        </div>
                      )}
                      
                      {/* Fallback, wenn keine Zuweisungsinformationen vorhanden sind */}
                      {!order.assignedToName && !order.assignedUsers && (
                        <span className="text-sm text-gray-500">Nicht zugewiesen</span>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <span className="sr-only">Menü öffnen</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => handleViewDetails(order.id)}
                          >
                            Details anzeigen
                          </DropdownMenuItem>
                          {shouldShowActionButtons(order) && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleAcceptOrder(order.id)}
                                disabled={processingOrderId === order.id}
                                className={processingOrderId === order.id ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                {processingOrderId === order.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                )}
                                {processingOrderId === order.id ? "Wird angenommen..." : "Annehmen"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRejectOrder(order.id)}
                                disabled={processingOrderId === order.id}
                                className={processingOrderId === order.id ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                Ablehnen
                              </DropdownMenuItem>
                            </>
                          )}
                          {(userRole === "manager" || userRole === "admin") && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleEditOrder(order)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Bearbeiten
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteOrder(order.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Löschen
                              </DropdownMenuItem>
                            </>
                          )}
                          {(order.status === "accepted" || order.status === "in-progress") && 
                           (userRole === "manager" || userRole === "admin" || 
                            (user?.uid && order.assignedTo && order.assignedTo.includes(user.uid))) && (
                            <DropdownMenuItem
                              onClick={() => handleCompleteOrder(order.id)}
                            >
                              <CheckSquare className="mr-2 h-4 w-4 text-green-500" />
                              Als erledigt markieren
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Karten-Ansicht - nur auf kleineren Bildschirmen anzeigen */}
          <div className="md:hidden">
            <div className="grid grid-cols-1 gap-4 p-4">
              {filteredOrders.map((order) => (
                <div 
                  key={order.id} 
                  className="bg-white border rounded-lg shadow-sm overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-base font-medium text-gray-900 mb-1 truncate">{order.title}</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <span className="sr-only">Menü öffnen</span>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => handleViewDetails(order.id)}
                          >
                            Details anzeigen
                          </DropdownMenuItem>
                          {shouldShowActionButtons(order) && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleAcceptOrder(order.id)}
                                disabled={processingOrderId === order.id}
                                className={processingOrderId === order.id ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                {processingOrderId === order.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                                )}
                                {processingOrderId === order.id ? "Wird angenommen..." : "Annehmen"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRejectOrder(order.id)}
                                disabled={processingOrderId === order.id}
                                className={processingOrderId === order.id ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                <XCircle className="mr-2 h-4 w-4 text-red-500" />
                                Ablehnen
                              </DropdownMenuItem>
                            </>
                          )}
                          {(userRole === "manager" || userRole === "admin") && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleEditOrder(order)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Bearbeiten
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDeleteOrder(order.id)}
                                className="text-red-600"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Löschen
                              </DropdownMenuItem>
                            </>
                          )}
                          {(order.status === "accepted" || order.status === "in-progress") && 
                           (userRole === "manager" || userRole === "admin" || 
                            (user?.uid && order.assignedTo && order.assignedTo.includes(user.uid))) && (
                            <DropdownMenuItem
                              onClick={() => handleCompleteOrder(order.id)}
                            >
                              <CheckSquare className="mr-2 h-4 w-4 text-green-500" />
                              Als erledigt markieren
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">{order.description}</p>
                    
                    {/* Kunden- und Projektinformationen für Mobile */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {order.client && (
                        <div className="bg-blue-50 text-blue-700 text-xs rounded-full px-2 py-1 flex items-center">
                          <span className="font-medium mr-1">Kunde:</span>
                          {order.client}
                        </div>
                      )}
                      {order.project && (
                        <div className="bg-green-50 text-green-700 text-xs rounded-full px-2 py-1 flex items-center">
                          <span className="font-medium mr-1">Projekt:</span>
                          {order.project}
                        </div>
                      )}
                    </div>
                    
                    {/* Status- und Prioritätsbadges */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge 
                        variant={getStatusBadgeVariant(getUserSpecificStatus(order))}
                        style={getStatusBadgeStyle(getUserSpecificStatus(order))}
                      >
                        {getStatusLabel(getUserSpecificStatus(order))}
                      </Badge>
                      
                      {order.priority && (
                        <Badge variant={getPriorityBadgeVariant(order.priority)}>
                          {order.priority}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div>
                        <p className="font-medium">Zeitraum:</p>
                        <p>{formatDate(order.startDate || new Date())} - {formatDate(order.endDate || new Date())}</p>
                      </div>
                      <div>
                        <p className="font-medium">Bestätigung bis:</p>
                        <p>{formatDate(order.confirmationDeadline || new Date())}</p>
                      </div>
                    </div>
                    
                    {/* Kompakte Anzeige zugewiesener Personen für mobile Ansicht */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-500 mb-1">Zugewiesen an:</p>
                      <div className="flex flex-wrap gap-1">
                        {order.assignedToName && Array.isArray(order.assignedToName) && order.assignedToName.length > 0 ? (
                          order.assignedToName.map((name, index) => (
                            <div key={index} className="flex items-center bg-gray-100 rounded-full px-2 py-1">
                              <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center mr-1">
                                <span className="text-xs">{name.charAt(0)}</span>
                              </div>
                              <span className="text-xs">{name.split(' ')[0]}</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-gray-500">Nicht zugewiesen</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Aktionsbuttons für die häufigsten Aktionen direkt auf der Karte anzeigen */}
                    {shouldShowActionButtons(order) && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1" 
                          onClick={() => handleAcceptOrder(order.id)}
                          disabled={processingOrderId === order.id}
                        >
                          {processingOrderId === order.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3 w-3" />
                          )}
                          {processingOrderId === order.id ? "Wird angenommen..." : "Annehmen"}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1" 
                          onClick={() => handleRejectOrder(order.id)}
                          disabled={processingOrderId === order.id}
                        >
                          <X className="mr-1 h-3 w-3" /> Ablehnen
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Order Creation/Editing Dialog */}
      {isCreatingOrder || isEditingOrder ? (
        <OrderDialog
          isOpen={isCreatingOrder || isEditingOrder}
          onClose={() => {
            setIsCreatingOrder(false);
            setIsEditingOrder(false);
          }}
          order={currentOrder || undefined}
          onSubmit={handleOrderSubmit}
          availableCustomers={customers}
          availableProjects={projects}
          availableEmployees={availableEmployees}
          userRole={userRole}
        />
      ) : null}

      {/* Rejection Dialog */}
      <RejectionDialog
        isOpen={showRejectionDialog}
        onClose={() => setShowRejectionDialog(false)}
        onConfirm={confirmRejectOrder}
        reason={rejectionReason}
        setReason={setRejectionReason}
      />

      {/* Order Details Dialog */}
      <OrderDetails
        order={selectedOrder}
        isOpen={isOrderDetailsOpen}
        onClose={() => setIsOrderDetailsOpen(false)}
        onAccept={() => {
          if (selectedOrder) {
            handleAcceptOrder(selectedOrder.id);
          }
        }}
        onReject={() => {
          if (selectedOrder) {
            handleRejectOrder(selectedOrder.id);
          }
        }}
        onEdit={() => {
          if (selectedOrder) {
            handleEditOrder(selectedOrder);
          }
        }}
        onComplete={() => {
          if (selectedOrder) {
            handleCompleteOrder(selectedOrder.id);
          }
        }}
        userRole={userRole}
      />
    </div>
  );
};

// Rejection Dialog
const RejectionDialog = ({
  isOpen,
  onClose,
  onConfirm,
  reason,
  setReason,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  reason: string;
  setReason: (reason: string) => void;
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Auftrag ablehnen</DialogTitle>
          <DialogDescription>
            Bitte geben Sie einen Grund für die Ablehnung an.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="reason" className="text-right">
              Grund
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="col-span-3"
              placeholder="Grund für die Ablehnung..."
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!reason.trim()}
          >
            Ablehnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrdersList;
