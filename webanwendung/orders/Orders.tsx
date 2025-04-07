import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import OrdersList from "./OrdersList";
import { getAllOrders, getManagerOrders, getUserOrders, subscribeToAllOrders, subscribeToManagerOrders, subscribeToUserOrders, completeOrder, getOrderById, enrichOrderWithReferences } from "./orderManagement";
import { useAuth } from "@/lib/hooks/useAuth";
import { Order } from "@/lib/services/orderService";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "@/components/ui/use-toast";
import { useNavigate, useParams } from "react-router-dom";
import OrderDetails from "./OrderDetails";
import OrderDialog from "./OrderDialog";

interface OrdersProps {
  userRole?: "admin" | "manager" | "employee";
  viewMode?: "list" | "detail" | "edit";
}

// Der ordersListProps Typ muss korrigiert werden, um mit der tatsächlichen Implementierung übereinzustimmen
type UserRole = "admin" | "manager" | "employee"; 

// Definiere einen Typ für die möglichen Tab-Werte
type OrderTabType = "all" | "assigned" | "accepted" | "rejected" | "in-progress" | "completed" | "pending";

const Orders = ({ userRole = "employee", viewMode = "list" }: OrdersProps) => {
  const { user } = useAuth();
  const { id: orderId } = useParams<{ id: string }>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableEmployees, setAvailableEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderTabType>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [hasNewUpdates, setHasNewUpdates] = useState(false);
  const navigate = useNavigate();

  // Lade alle verfügbaren Mitarbeiter aus der Datenbank
  const fetchEmployees = async () => {
    try {
      const employeesCollection = collection(db, "users");
      const snapshot = await getDocs(employeesCollection);
      const employees = snapshot.docs
        .map(doc => {
          const data = doc.data();
          // Nur Benutzer mit der Rolle "employee" oder "manager" zurückgeben (Manager können auch zugewiesen werden)
          if (data.role === "employee" || data.role === "manager") {
            return {
              id: doc.id,
              name: data.displayName || "Unbekannt"
            };
          }
          return null;
        })
        .filter(employee => employee !== null) as Array<{ id: string; name: string }>;
      
      setAvailableEmployees(employees);
    } catch (error) {
      console.error("Fehler beim Laden der Mitarbeiter:", error);
      // Fallback zu leerer Liste
      setAvailableEmployees([]);
    }
  };

  // Aufträge basierend auf der Benutzerrolle laden mit Echtzeit-Updates
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    let unsubscribe: (() => void) | null = null;
    let previousOrdersLength = 0;

    try {
      switch (userRole) {
        case "admin":
        case "manager": // Manager haben jetzt den gleichen Zugriff wie Admins
          unsubscribe = subscribeToAllOrders((updatedOrders) => {
            // Prüfen, ob neue Aufträge hinzugefügt wurden
            if (updatedOrders.length > previousOrdersLength) {
              setHasNewUpdates(true);
              // Benachrichtigung anzeigen
              toast({
                title: "Neue Aufträge verfügbar",
                description: "Die Auftragsliste wurde aktualisiert.",
                variant: "default",
              });
            }
            previousOrdersLength = updatedOrders.length;
            setOrders(updatedOrders);
            setLoading(false);
            setError(null);
            setLastUpdate(new Date());
          });
          break;
        case "employee":
          unsubscribe = subscribeToUserOrders(user.uid, (updatedOrders) => {
            // Prüfen, ob neue Aufträge hinzugefügt wurden
            if (updatedOrders.length > previousOrdersLength) {
              setHasNewUpdates(true);
              // Benachrichtigung anzeigen
              toast({
                title: "Neue Aufträge verfügbar",
                description: "Die Auftragsliste wurde aktualisiert.",
                variant: "default",
              });
            }
            previousOrdersLength = updatedOrders.length;
            setOrders(updatedOrders);
            setLoading(false);
            setError(null);
            setLastUpdate(new Date());
          });
          break;
      }
    } catch (error) {
      console.error("Fehler beim Laden der Aufträge:", error);
      setError("Die Aufträge konnten nicht geladen werden.");
      setOrders([]);
      setLoading(false);
    }

    // Aufruf von fetchEmployees wenn admin oder manager
    if (userRole === "admin" || userRole === "manager") {
      fetchEmployees();
    }

    // Abmelden vom Listener beim Komponentenabbau
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userRole, user]);

  // Lade den spezifischen Auftrag, wenn viewMode 'detail' oder 'edit' ist und eine orderId vorhanden ist
  useEffect(() => {
    if ((viewMode === 'detail' || viewMode === 'edit') && orderId) {
      setLoading(true);
      console.log(`Lade Auftragsdetails für ID: ${orderId} im Modus: ${viewMode}`);
      
      const fetchOrderDetails = async () => {
        try {
          // Hole den Auftrag anhand seiner ID
          let order = await getOrderById(orderId);
          
          if (order) {
            // Anreicherung mit Referenzdaten
            order = await enrichOrderWithReferences(order);
            setSelectedOrder(order);
            setError(null);
          } else {
            setError(`Auftrag mit ID ${orderId} wurde nicht gefunden`);
            toast({
              title: "Fehler",
              description: `Auftrag mit ID ${orderId} wurde nicht gefunden`,
              variant: "destructive"
            });
          }
        } catch (err) {
          console.error("Fehler beim Laden der Auftragsdetails:", err);
          setError("Die Auftragsdetails konnten nicht geladen werden.");
          toast({
            title: "Fehler",
            description: "Die Auftragsdetails konnten nicht geladen werden.",
            variant: "destructive"
          });
        } finally {
          setLoading(false);
        }
      };
      
      fetchOrderDetails();
    }
  }, [viewMode, orderId]);

  // Auftragsdetails anzeigen
  const handleViewOrderDetails = (orderId: string) => {
    console.log("Auftragsdetails anzeigen für:", orderId);
    navigate(`/orders/${orderId}`);
  };

  // Auftrag akzeptieren
  const handleAcceptOrder = (orderId: string) => {
    console.log("Auftrag akzeptiert:", orderId);
    toast({
      title: "Auftrag angenommen",
      description: "Der Auftrag wurde erfolgreich angenommen.",
    });
    // Keine manuelle Aktualisierung nötig - der Firestore-Listener aktualisiert die Daten automatisch
  };

  // Auftrag ablehnen
  const handleDeclineOrder = (orderId: string, reason?: string) => {
    console.log("Auftrag abgelehnt:", orderId, "Grund:", reason);
    toast({
      title: "Auftrag abgelehnt",
      description: "Der Auftrag wurde abgelehnt.",
    });
    // Keine manuelle Aktualisierung nötig - der Firestore-Listener aktualisiert die Daten automatisch
  };

  // Filter basierend auf Tab und individueller Sicht des Mitarbeiters
  const getFilteredOrders = () => {
    if (activeTab === "all") return orders;
    
    // Für Admins und Manager: Nach globalem Status filtern
    if (userRole === "admin" || userRole === "manager") {
      return orders.filter(order => order.status === activeTab);
    }
    
    // Für Mitarbeiter: Nach individuellem Status filtern
    return orders.filter(order => {
      // Prüfen, ob der Mitarbeiter in assignedUsers ist
      if (user?.uid && order.assignedUsers && Array.isArray(order.assignedUsers)) {
        const userAssignment = order.assignedUsers.find(u => u.id === user.uid);
        if (userAssignment) {
          // Nach dem individuellen Status des Mitarbeiters filtern
          return userAssignment.status === activeTab;
        }
      }
      
      // Fallback: Nach globalem Status filtern
      return order.status === activeTab;
    });
  };

  const handleCompleteOrder = async (id: string) => {
    try {
      if (!user) return;
      
      await completeOrder(id, user.uid, user.displayName || "", userRole);
      
      toast({
        title: "Auftrag abgeschlossen",
        description: "Der Auftrag wurde erfolgreich abgeschlossen."
      });
    } catch (error) {
      console.error("Error completing order:", error);
      
      toast({
        title: "Fehler",
        description: (error as Error)?.message || "Fehler beim Abschließen des Auftrags."
      });
    }
  };

  // Aktualisiere einen Auftrag in der lokalen Liste
  const handleOrderUpdate = (updatedOrder: Order) => {
    if (orders) {
      // Ersetze den Auftrag in der Liste
      const updatedOrders = orders.map((order) => 
        order.id === updatedOrder.id ? updatedOrder : order
      );
      setOrders(updatedOrders);
      
      // Wenn der ausgewählte Auftrag aktualisiert wurde, aktualisiere ihn auch
      if (selectedOrder?.id === updatedOrder.id) {
        setSelectedOrder(updatedOrder);
      }
      
      toast({
        title: "Auftrag aktualisiert",
        description: "Der Auftrag wurde erfolgreich aktualisiert.",
        variant: "default",
      });
      
      // Refresh the OrdersList component
      setLastUpdate(new Date());
    }
  };

  // Schließen der Detailansicht
  const handleCloseDetails = () => {
    navigate('/orders');
  };

  // Rendere die Bearbeitungsansicht, wenn im Edit-Modus
  if (viewMode === 'edit') {
    return (
      <div className="flex flex-col gap-6">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-12 w-12 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
            <p className="ml-3 text-gray-600">Auftragsdaten werden geladen...</p>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-500">{error}</div>
            </CardContent>
          </Card>
        ) : selectedOrder ? (
          <OrderDialog
            isOpen={true}
            onClose={handleCloseDetails}
            order={selectedOrder}
            onSubmit={(updatedOrderData) => {
              if (selectedOrder) {
                // Kombiniere die aktuelle Order mit den aktualisierten Daten
                handleOrderUpdate({ ...selectedOrder, ...updatedOrderData });
              }
              navigate('/orders');
            }}
            userRole={userRole as "admin" | "manager" | "employee"}
          />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">Kein Auftrag zum Bearbeiten ausgewählt</div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Rendere die Detailansicht, wenn im Detail-Modus
  if (viewMode === 'detail') {
    return (
      <div className="flex flex-col gap-6">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-12 w-12 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
            <p className="ml-3 text-gray-600">Auftragsdaten werden geladen...</p>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-500">{error}</div>
            </CardContent>
          </Card>
        ) : selectedOrder ? (
          <OrderDetails 
            order={selectedOrder}
            isOpen={true}
            onClose={handleCloseDetails}
            onAccept={() => handleAcceptOrder(selectedOrder.id)}
            onReject={() => handleDeclineOrder(selectedOrder.id)}
            onEdit={() => console.log("Auftrag bearbeiten", selectedOrder.id)}
            onComplete={() => handleCompleteOrder(selectedOrder.id)}
            userRole={userRole as "admin" | "manager" | "employee"}
            onUpdate={handleOrderUpdate}
          />
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="text-center">Kein Auftrag ausgewählt</div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Standardansicht (Liste)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Auftragsverwaltung</h1>
        <p className="text-muted-foreground">
          {userRole === "admin" && "Verwalten Sie alle Aufträge im System"}
          {userRole === "manager" && "Erstellen und verwalten Sie Aufträge für Ihr Team"}
          {userRole === "employee" && "Bearbeiten Sie Ihre zugewiesenen Aufträge"}
        </p>
        {hasNewUpdates && (
          <div className="bg-blue-50 text-blue-800 px-4 py-2 rounded-md text-sm flex items-center">
            <span className="animate-pulse mr-2">•</span>
            Neue Aktualisierungen verfügbar
          </div>
        )}
      </div>

      <Tabs 
        defaultValue="all" 
        value={activeTab} 
        onValueChange={(value) => {
          // Explizite Typkonvertierung
          setActiveTab(value as OrderTabType);
        }}
      >
        <TabsList className="grid grid-cols-4 sm:grid-cols-5">
          <TabsTrigger value="all">Alle</TabsTrigger>
          <TabsTrigger value="pending">Ausstehend</TabsTrigger>
          <TabsTrigger value="accepted">Angenommen</TabsTrigger>
          <TabsTrigger value="in-progress">In Bearbeitung</TabsTrigger>
          <TabsTrigger value="completed">Abgeschlossen</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab === "all" && "Alle Aufträge"}
                {activeTab === "pending" && "Ausstehende Aufträge"}
                {activeTab === "accepted" && "Angenommene Aufträge"}
                {activeTab === "in-progress" && "Aufträge in Bearbeitung"}
                {activeTab === "completed" && "Abgeschlossene Aufträge"}
              </CardTitle>
              <CardDescription>
                {loading 
                  ? "Aufträge werden geladen..." 
                  : `${getFilteredOrders().length} ${getFilteredOrders().length === 1 ? "Auftrag" : "Aufträge"} gefunden`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="p-4 text-center text-red-500">{error}</div>
              ) : (
                <OrdersList
                  orders={getFilteredOrders()}
                  userRole={userRole as UserRole}
                  onAcceptOrder={handleAcceptOrder}
                  onDeclineOrder={handleDeclineOrder}
                  onViewDetails={handleViewOrderDetails}
                  onOrdersChange={() => {}} // Nicht mehr benötigt, da Echtzeit-Updates aktiv sind
                  availableEmployees={availableEmployees}
                  onUpdate={handleOrderUpdate}
                  lastUpdated={lastUpdate}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Orders; 