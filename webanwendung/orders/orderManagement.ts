import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  onSnapshot,
  serverTimestamp,
  getDoc,
  or,
  getFirestore,
  orderBy,
  increment,
  setDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Order, AssignedUser } from "../../lib/services/orderService";
import { reopenOrder, createTimeEntryFromOrder } from './completeOrder';
import { getMailConfig, sendMail } from '../../lib/services/mailService';
import { Order as BaseOrder } from "@/lib/services/orderService";
import { UserService } from '../../lib/services/userService';
import { sendNotification } from "@/lib/utils";

const ordersCollection = "orders";
const notificationsCollection = "notifications";

// Erweiterte Order-Schnittstelle mit zusätzlichen Properties für E-Mail-Benachrichtigungen
interface EnhancedOrder extends BaseOrder {
  customer?: {
    name?: string;
    [key: string]: any;
  };
  deadline?: Date | string;
}

// Funktion zum Erstellen einer Benachrichtigung
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: string = "info",
  link?: string
) => {
  try {
    // Erstelle Firestore-Benachrichtigung wie bisher
    await addDoc(collection(db, notificationsCollection), {
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: new Date(),
      link,
    });

    // Verwende auch die neue browserübergreifende Benachrichtigungsfunktion
    sendNotification(title, {
      body: message,
      type: type as "info" | "success" | "warning" | "error",
      autoClose: true,
      duration: 6000,
    });

    console.log("Notification created for user:", userId);
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

// Helper-Funktion zur Konvertierung der Zuweisungsdaten
const processAssignmentData = (data: any) => {
  // Extrahiere die Zuweisungsdaten aus den Firestore-Dokumenten
  // Unterstützt sowohl das alte Format (String) als auch das neue Format (Array)
  const assignedTo = data.assignedTo;
  const assignedToName = data.assignedToName;
  const assignedUsers = data.assignedUsers;
  const teamLeadId = data.teamLeadId;

  // Strukturiertes Format hat Vorrang
  if (assignedUsers) {
    return {
      assignedUsers,
      // Die anderen Felder für Abwärtskompatibilität beifügen
      assignedTo: assignedUsers.map((u: { id: string }) => u.id),
      assignedToName: assignedUsers.map((u: { name: string }) => u.name),
      teamLeadId: teamLeadId || assignedUsers.find((u: { isTeamLead: boolean }) => u.isTeamLead)?.id
    };
  }

  // Wenn assignedTo und assignedToName Arrays sind, verwende sie direkt
  if (Array.isArray(assignedTo) && Array.isArray(assignedToName)) {
    // Konstruiere ein assignedUsers Array für bessere Struktur
    const users = assignedTo.map((id, index) => ({
      id,
      name: index < assignedToName.length ? assignedToName[index] : "Unbekannt",
      status: "pending", // Standardstatus für Mitarbeiter
      isTeamLead: teamLeadId ? id === teamLeadId : false, // Wenn eine teamLeadId existiert, prüfe, ob dieser Benutzer der Teamleiter ist
      timeSpent: 0, // Standardwert für die aufgewendete Zeit
    }));

    return {
      assignedTo,
      assignedToName,
      assignedUsers: users,
      teamLeadId
    };
  }

  // Alte Format: Einzelne Zuweisung
  if (assignedTo && assignedToName) {
    return {
      assignedTo: [assignedTo],
      assignedToName: [assignedToName],
      assignedUsers: [{ 
        id: assignedTo, 
        name: assignedToName,
        status: "pending", // Standardstatus für Mitarbeiter
        isTeamLead: true, // Im alten Format ist der einzige Benutzer automatisch Teamleiter
        timeSpent: 0 // Standardwert für die aufgewendete Zeit
      }],
      teamLeadId: assignedTo // Im alten Format ist der einzige Benutzer automatisch Teamleiter
    };
  }

  // Keine Zuweisung
  return {
    assignedTo: undefined,
    assignedToName: undefined,
    assignedUsers: undefined,
    teamLeadId: undefined
  };
};

// Funktion zum Verarbeiten der Dokumentdaten und Konvertieren von Timestamps
const processDocData = (docOrData: any): Order => {
  // Prüfe, ob es ein Firestore-Dokument mit data()-Funktion ist, oder bereits die Daten
  const data = typeof docOrData.data === 'function' ? docOrData.data() : docOrData;
  const id = docOrData.id; // ID ist entweder direkt im Objekt oder im Firestore-Dokument

  const assignmentData = processAssignmentData(data);
  
  return {
    id,
    date: data.date ? (data.date instanceof Timestamp ? data.date.toDate() : data.date) : null,
    title: data.title,
    description: data.description,
    status: data.status,
    client: data.client,
    customerId: data.customerId, // Wichtig: Customer ID explizit übernehmen
    project: data.project, // Wichtig: Project explizit übernehmen
    projectId: data.projectId, // Wichtig: Project ID explizit übernehmen
    userId: data.userId,
    userName: data.userName,
    ...assignmentData,
    managerId: data.managerId,
    managerName: data.managerName,
    startDate: data.startDate ? (data.startDate instanceof Timestamp ? data.startDate.toDate() : data.startDate) : null,
    endDate: data.endDate ? (data.endDate instanceof Timestamp ? data.endDate.toDate() : data.endDate) : null,
    confirmationDeadline: data.confirmationDeadline ? (data.confirmationDeadline instanceof Timestamp ? data.confirmationDeadline.toDate() : data.confirmationDeadline) : null,
    priority: data.priority,
    rejectionReason: data.rejectionReason,
    category: data.category,
    estimatedTime: data.estimatedTime,
    // Übernehme die detaillierten Daten, wenn vorhanden
    customerDetails: data.customerDetails,
    projectDetails: data.projectDetails,
  };
};

// Füge diese neue Funktion nach der getOrderById-Funktion hinzu, um fehlende Referenzdaten zu ergänzen
export const enrichOrderWithReferences = async (order: Order): Promise<Order> => {
  if (!order) return order;
  
  console.log("🔍 Anreicherung des Auftrags mit Referenzdaten:", order.id);
  let enrichedOrder = { ...order };

  try {
    // Wenn customerId vorhanden ist, aber client fehlt
    if (order.customerId && !order.client) {
      console.log("📋 Kunde fehlt, wird aus der Datenbank geladen:", order.customerId);
      // Versuche, die Kundeninformationen aus der Datenbank zu laden
      const customerRef = doc(db, 'customers', order.customerId);
      const customerDoc = await getDoc(customerRef);
      
      if (customerDoc.exists()) {
        const customerData = customerDoc.data();
        enrichedOrder.client = customerData.name || customerData.company || customerData.companyName || "Kunde " + order.customerId;
        console.log("✅ Kundenname gefunden:", enrichedOrder.client);
      } else {
        console.warn("⚠️ Kunde nicht gefunden für ID:", order.customerId);
      }
    }
    
    // Wenn projectId vorhanden ist, aber project fehlt
    if (order.projectId && !order.project) {
      console.log("📋 Projekt fehlt, wird aus der Datenbank geladen:", order.projectId);
      // Versuche, die Projektinformationen aus der Datenbank zu laden
      const projectRef = doc(db, 'projects', order.projectId);
      const projectDoc = await getDoc(projectRef);
      
      if (projectDoc.exists()) {
        const projectData = projectDoc.data();
        enrichedOrder.project = projectData.name || projectData.title || "Projekt " + order.projectId;
        
        // Füge die Projektkategorie hinzu, wenn sie fehlt
        if (!enrichedOrder.category && projectData.category) {
          enrichedOrder.category = projectData.category;
        }
        
        console.log("✅ Projektname gefunden:", enrichedOrder.project);
      } else {
        console.warn("⚠️ Projekt nicht gefunden für ID:", order.projectId);
      }
    }
    
    return enrichedOrder;
  } catch (error) {
    console.error("❌ Fehler beim Anreichern der Referenzdaten:", error);
    return order; // Bei Fehler den ursprünglichen Auftrag zurückgeben
  }
};

// Echtzeit-Listener für alle Aufträge (für admins)
export const subscribeToAllOrders = (callback: (orders: Order[]) => void) => {
  const q = query(collection(db, ordersCollection));
  
  return onSnapshot(q, async (querySnapshot) => {
    const orders: Order[] = [];
    const enrichPromises: Promise<Order>[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const order = processDocData({
        id: doc.id,
        ...data,
      });
      
      // Bereiten wir die Anreicherung vor
      enrichPromises.push(enrichOrderWithReferences(order));
    });
    
    // Warten auf alle Anreicherungen
    const enrichedOrders = await Promise.all(enrichPromises);
    
    callback(enrichedOrders);
  });
};

// Echtzeit-Listener für Aufträge eines Managers
export const subscribeToManagerOrders = (managerId: string, callback: (orders: Order[]) => void) => {
  const q = query(
    collection(db, ordersCollection),
    where("managerId", "==", managerId)
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const orders = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      const assignmentData = processAssignmentData(data);
      
      return {
        id: doc.id,
        date: data.date ? (data.date instanceof Timestamp ? data.date.toDate() : data.date) : null,
        title: data.title,
        description: data.description,
        status: data.status,
        client: data.client,
        userId: data.userId,
        userName: data.userName,
        ...assignmentData,
        managerId: data.managerId,
        managerName: data.managerName,
        startDate: data.startDate ? (data.startDate instanceof Timestamp ? data.startDate.toDate() : data.startDate) : null,
        endDate: data.endDate ? (data.endDate instanceof Timestamp ? data.endDate.toDate() : data.endDate) : null,
        confirmationDeadline: data.confirmationDeadline ? (data.confirmationDeadline instanceof Timestamp ? data.confirmationDeadline.toDate() : data.confirmationDeadline) : null,
        priority: data.priority,
        rejectionReason: data.rejectionReason,
      };
    });
    
    callback(orders);
  });
};

// Echtzeit-Listener für die Aufträge eines Mitarbeiters
export const subscribeToUserOrders = (userId: string, callback: (orders: Order[]) => void) => {
  // Eine einzige Abfrage für alle Aufträge verwenden und clientseitig filtern
  const q = query(collection(db, ordersCollection));
  
  return onSnapshot(q, async (querySnapshot) => {
    const orders: Order[] = [];
    const enrichPromises: Promise<Order>[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Prüfen, ob der Auftrag diesem Benutzer zugewiesen ist
      const assignedTo = data.assignedTo;
      
      // Prüfe ob der Benutzer in assignedTo ist (kann String oder Array sein)
      const isAssigned = Array.isArray(assignedTo) 
        ? assignedTo.includes(userId)
        : assignedTo === userId;
        
      // Prüfe auch in der neuen assignedUsers Struktur
      const isInAssignedUsers = Array.isArray(data.assignedUsers) && 
        data.assignedUsers.some((user: any) => user.id === userId);
      
      // Oder ob der Benutzer der Ersteller ist
      const isCreator = data.userId === userId;
      
      if (isAssigned || isInAssignedUsers || isCreator) {
        const order = processDocData({
          id: doc.id,
          ...data,
        });
        
        // Bereiten wir die Anreicherung vor
        enrichPromises.push(enrichOrderWithReferences(order));
      }
    });
    
    // Warten auf alle Anreicherungen
    const enrichedOrders = await Promise.all(enrichPromises);
    
    callback(enrichedOrders);
  });
};

// Get all orders for a specific user (assigned to them)
export const getUserOrders = async (userId: string): Promise<Order[]> => {
  try {
    const q = query(
      collection(db, ordersCollection),
      or(
        where("assignedTo", "array-contains", userId),
        where("assignedTo", "==", userId),
        where("userId", "==", userId)
      )
    );

    const querySnapshot = await getDocs(q);
    
    const orders: Order[] = [];
    const enrichPromises: Promise<Order>[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const order = processDocData({
        id: doc.id,
        ...data,
      });
      
      // Bereiten wir die Anreicherung vor
      enrichPromises.push(enrichOrderWithReferences(order));
    });
    
    // Warten auf alle Anreicherungen
    const enrichedOrders = await Promise.all(enrichPromises);
    
    return enrichedOrders;
  } catch (error) {
    console.error("Error getting user orders:", error);
    return [];
  }
};

// Get all orders (for managers/admins)
export const getAllOrders = async (): Promise<Order[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, ordersCollection));
    
    const enrichPromises: Promise<Order>[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const order = processDocData({
        id: doc.id,
        ...data,
      });
      
      // Bereiten wir die Anreicherung vor
      enrichPromises.push(enrichOrderWithReferences(order));
    });
    
    // Warten auf alle Anreicherungen
    const enrichedOrders = await Promise.all(enrichPromises);
    
    return enrichedOrders;
  } catch (error) {
    console.error("Error getting all orders:", error);
    return [];
  }
};

// Helper-Funktion zum Benachrichtigen aller Manager über Auftragsänderungen
const notifyAllManagers = async (title: string, message: string, link?: string) => {
  try {
    // Alle User mit Manager-Rolle abrufen
    const usersCollection = collection(db, "users");
    const q = query(usersCollection, where("role", "==", "manager"));
    const managersSnapshot = await getDocs(q);
    
    if (managersSnapshot.empty) {
      console.log("Keine Manager gefunden für Benachrichtigungen");
      return;
    }
    
    // Jeden Manager benachrichtigen
    const notificationPromises = managersSnapshot.docs.map(async (managerDoc) => {
      const managerId = managerDoc.id;
      await createNotification(
        managerId,
        title,
        message,
        "order",
        link
      );
      
      // Auch E-Mail-Benachrichtigung senden, falls konfiguriert
      try {
        const managerData = managerDoc.data();
        if (managerData && managerData.email) {
          console.log(`Sende E-Mail-Benachrichtigung an Manager ${managerData.displayName || managerId}:`, managerData.email);
          // E-Mail-Logik hier implementieren
        }
      } catch (emailError) {
        console.error("Fehler beim Senden der E-Mail an Manager:", emailError);
      }
    });
    
    await Promise.all(notificationPromises);
    console.log(`${managersSnapshot.size} Manager wurden benachrichtigt`);
  } catch (error) {
    console.error("Fehler beim Benachrichtigen der Manager:", error);
  }
};

// Add a new order
export const addOrder = async (order: Omit<Order, "id">): Promise<string> => {
  try {
    const orderData = { ...order };
    
    // Debug-Überprüfung der Projektdaten
    console.log("🔍 Projektdaten beim Hinzufügen des Auftrags:", {
      project: orderData.project,
      projectId: orderData.projectId,
      client: orderData.client,
      customerId: orderData.customerId
    });

    // Sichere Konvertierung von Datumsobjekten zu Timestamps
    const safelyConvertToTimestamp = (date: any): Timestamp => {
      if (!date) return Timestamp.now(); // Standardwert statt null
      
      try {
        // Wenn es bereits ein Timestamp ist
        if (date instanceof Timestamp) {
          return date;
        }

        // Wenn es eine toDate-Funktion hat (wie Timestamps)
        if (date && typeof date === 'object' && 'toDate' in date && typeof date.toDate === 'function') {
          return Timestamp.fromDate(date.toDate());
        }
        
        // Wenn es ein Date-Objekt ist
        if (date instanceof Date) {
          return Timestamp.fromDate(date);
        }
        
        // Wenn es ein String ist
        if (typeof date === 'string') {
          return Timestamp.fromDate(new Date(date));
        }
        
        return Timestamp.now(); // Fallback
      } catch (error) {
        console.error("Fehler bei der Timestamp-Konvertierung:", error);
        return Timestamp.fromDate(new Date());
      }
    };

    // Convert all Date objects to Timestamps
    if (orderData.date) orderData.date = safelyConvertToTimestamp(orderData.date);
    if (orderData.startDate) orderData.startDate = safelyConvertToTimestamp(orderData.startDate);
    if (orderData.endDate) orderData.endDate = safelyConvertToTimestamp(orderData.endDate);
    if (orderData.confirmationDeadline) 
      orderData.confirmationDeadline = safelyConvertToTimestamp(orderData.confirmationDeadline);

    // Speichere lastModified für Änderungsverfolgung
    orderData.lastModified = Timestamp.now();

    const docRef = await addDoc(collection(db, ordersCollection), orderData);
    
    // Für E-Mail-Benachrichtigungen
    const enhancedOrder: EnhancedOrder = {
      ...orderData,
      id: docRef.id,
      customer: {
        name: orderData.client || 'Kein Kunde'
      },
      deadline: orderData.endDate 
        ? (orderData.endDate instanceof Timestamp ? orderData.endDate.toDate() : orderData.endDate) 
        : orderData.confirmationDeadline 
          ? (orderData.confirmationDeadline instanceof Timestamp ? orderData.confirmationDeadline.toDate() : orderData.confirmationDeadline)
          : undefined
    };
    
    // Hole die Mail-Konfiguration für die zentrale Benachrichtigungs-E-Mail
    const mailConfig = await getMailConfig();
    
    // Erstelle Benachrichtigungen für Manager
    if (orderData.managerId) {
      await createNotification(
        orderData.managerId,
        "Neuer Auftrag erstellt",
        `Ein neuer Auftrag "${orderData.title}" wurde erstellt.`,
        "order",
        `/orders?id=${docRef.id}`
      );
      
      try {
        // Versuche, die E-Mail-Adresse des Managers zu finden
        const managerData = await UserService.getUser(orderData.managerId);
        if (managerData && typeof managerData === 'object' && 'email' in managerData && managerData.email) {
          console.log('Sende E-Mail-Benachrichtigung über neuen Auftrag an Manager:', managerData.email);
          await sendNewOrderNotification(enhancedOrder, managerData.email as string);
        }
      } catch (error) {
        console.error('Fehler beim Senden der E-Mail-Benachrichtigung an den Manager:', error);
      }
    }

    // Benachrichtige alle Manager über den neuen Auftrag (zusätzlich zum zugewiesenen Manager)
    await notifyAllManagers(
      "Neuer Auftrag im System",
      `Ein neuer Auftrag "${orderData.title}" wurde erstellt.`,
      `/orders?id=${docRef.id}`
    );

    // Sende Benachrichtigungen nur an ausgewählte Benutzer
    if (orderData.assignedUsers && orderData.assignedUsers.length > 0) {
      // Filtere Benutzer, die benachrichtigt werden sollen
      const usersToNotify = orderData.assignedUsers.filter(user => user.notify !== false);
      
      for (const user of usersToNotify) {
        if (user.id) {
          await createNotification(
            user.id,
            "Neuer Auftrag zugewiesen",
            `Dir wurde ein neuer Auftrag "${orderData.title}" zugewiesen.`,
            "order",
            `/orders?id=${docRef.id}`
          );
          
          try {
            // Versuche, die E-Mail-Adresse des Benutzers zu finden
            const userData = await UserService.getUser(user.id);
            if (userData && typeof userData === 'object' && 'email' in userData && userData.email) {
              console.log('Sende E-Mail-Benachrichtigung über neuen Auftrag an Benutzer:', userData.email);
              await sendNewOrderNotification(enhancedOrder, userData.email as string);
            }
          } catch (error) {
            console.error('Fehler beim Senden der E-Mail-Benachrichtigung an den Benutzer:', error);
          }
        }
      }
    } else if (orderData.assignedTo && Array.isArray(orderData.assignedTo)) {
      // Für den Fall, dass wir nur die IDs haben (älteres Format)
      for (const userId of orderData.assignedTo) {
        await createNotification(
          userId,
          "Neuer Auftrag zugewiesen",
          `Dir wurde ein neuer Auftrag "${orderData.title}" zugewiesen.`,
          "order",
          `/orders?id=${docRef.id}`
        );
        
        try {
          // Versuche, die E-Mail-Adresse des Benutzers zu finden
          const userData = await UserService.getUser(userId);
          if (userData && typeof userData === 'object' && 'email' in userData && userData.email) {
            console.log('Sende E-Mail-Benachrichtigung über neuen Auftrag an Benutzer:', userData.email);
            await sendNewOrderNotification(enhancedOrder, userData.email as string);
          }
        } catch (error) {
          console.error('Fehler beim Senden der E-Mail-Benachrichtigung an den Benutzer:', error);
        }
      }
    }
    
    // Sende auch eine Benachrichtigung an die zentrale Benachrichtigungs-E-Mail, falls konfiguriert
    if (mailConfig.notificationEmail) {
      console.log('Sende E-Mail-Benachrichtigung über neuen Auftrag an zentrale Adresse:', mailConfig.notificationEmail);
      await sendNewOrderNotification(enhancedOrder, mailConfig.notificationEmail);
    }

    return docRef.id;
  } catch (error) {
    console.error("Error adding order:", error);
    throw error;
  }
};

/**
 * Konvertiert Date-Objekte in Firestore Timestamps
 */
const convertDatesToTimestamps = (data: any): any => {
  if (!data) return data;
  
  const processed = { ...data };
  
  // Konvertiere bekannte Datumsfelder
  if (processed.date && !(processed.date instanceof Timestamp)) {
    processed.date = Timestamp.fromDate(new Date(processed.date));
  }
  
  if (processed.startDate && !(processed.startDate instanceof Timestamp)) {
    processed.startDate = Timestamp.fromDate(new Date(processed.startDate));
  }
  
  if (processed.endDate && !(processed.endDate instanceof Timestamp)) {
    processed.endDate = Timestamp.fromDate(new Date(processed.endDate));
  }
  
  if (processed.confirmationDeadline && !(processed.confirmationDeadline instanceof Timestamp)) {
    processed.confirmationDeadline = Timestamp.fromDate(new Date(processed.confirmationDeadline));
  }
  
  // Immer lastModified für Änderungsverfolgung setzen
  processed.lastModified = Timestamp.now();
  
  return processed;
};

/**
 * Lädt einen Auftrag anhand seiner ID
 */
export const getOrderById = async (orderId: string): Promise<Order | null> => {
  try {
    const db = getFirestore();
    const orderRef = doc(db, 'orders', orderId);
    const orderSnapshot = await getDoc(orderRef);
    
    if (!orderSnapshot.exists()) {
      console.log(`Auftrag mit ID ${orderId} nicht gefunden`);
      return null;
    }
    
    const orderData = orderSnapshot.data() as Order;
    return { ...orderData, id: orderId };
  } catch (error) {
    console.error("Fehler beim Laden des Auftrags:", error);
    return null;
  }
};

/**
 * Aktualisiert einen bestehenden Auftrag
 */
export const updateOrder = async (orderId: string, orderData: Partial<Order>): Promise<void> => {
  try {
    console.log(`Aktualisiere Auftrag ${orderId} mit Daten:`, orderData);
    
    // Sicherstellen, dass die Projektdaten vorhanden bleiben
    if (!orderData.project && !orderData.projectId) {
      const existingOrder = await getOrderById(orderId);
      if (existingOrder) {
        if (existingOrder.project) orderData.project = existingOrder.project;
        if (existingOrder.projectId) orderData.projectId = existingOrder.projectId;
        console.log("Bestehende Projektdaten beibehalten:", {
          project: orderData.project,
          projectId: orderData.projectId
        });
      }
    }
    
    const db = getFirestore();
    const orderRef = doc(db, 'orders', orderId);
    
    // Bereinige die Daten, indem leere Felder entfernt werden
    const cleanOrderData = { ...orderData };
    
    // Entferne leere ID-Felder, AUSSER projectId und customerId
    Object.keys(cleanOrderData).forEach(key => {
      const value = cleanOrderData[key as keyof typeof cleanOrderData];
      if (
        (key.endsWith('Id') && key !== 'projectId' && key !== 'customerId') && 
        (value === "" || value === null || value === undefined)
      ) {
        console.log(`Entferne leeres ID-Feld: ${key}`);
        delete cleanOrderData[key as keyof typeof cleanOrderData];
      }
    });
    
    // Konvertiere Datumsobjekte in Firestore-Timestamps
    const processedOrderData = convertDatesToTimestamps(cleanOrderData);
    
    console.log("Finaler Update-Auftrag mit Projektdaten:", {
      project: processedOrderData.project,
      projectId: processedOrderData.projectId,
      client: processedOrderData.client,
      customerId: processedOrderData.customerId
    });
    
    // Führe das Update in Firestore durch
    await updateDoc(orderRef, processedOrderData);
    
    console.log(`Auftrag ${orderId} erfolgreich aktualisiert`);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Auftrags:", error);
    throw error;
  }
};

// Delete an order
export const deleteOrder = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, ordersCollection, id));
  } catch (error) {
    console.error("Error deleting order:", error);
    throw error;
  }
};

// Get orders created by a specific manager
export const getManagerOrders = async (managerId: string): Promise<Order[]> => {
  try {
    const q = query(
      collection(db, ordersCollection),
      or(
        where("managerId", "==", managerId),
        where("managerId", "array-contains", managerId)
      )
    );

    const querySnapshot = await getDocs(q);
    
    const enrichPromises: Promise<Order>[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const order = processDocData({
        id: doc.id,
        ...data,
      });
      
      // Bereiten wir die Anreicherung vor
      enrichPromises.push(enrichOrderWithReferences(order));
    });
    
    // Warten auf alle Anreicherungen
    const enrichedOrders = await Promise.all(enrichPromises);
    
    return enrichedOrders;
  } catch (error) {
    console.error("Error getting manager orders:", error);
    return [];
  }
};

// Accept an order
export const acceptOrder = async (
  id: string,
  userId: string,
  userName: string,
): Promise<void> => {
  try {
    console.log(`Starte Annahme des Auftrags ${id} durch Benutzer ${userId} (${userName})`);
    
    // Hole den Auftrag, um die aktuelle Liste der zugewiesenen Benutzer zu erhalten
    const orderRef = doc(db, ordersCollection, id);
    const orderSnap = await getDoc(orderRef);
    
    if (!orderSnap.exists()) {
      throw new Error(`Auftrag mit ID ${id} nicht gefunden`);
    }
    
    const orderData = orderSnap.data();
    let assignedUsers = orderData.assignedUsers || [];
    
    console.log(`Aktuelle zugewiesene Benutzer:`, JSON.stringify(assignedUsers));
    
    // Wenn es keine strukturierten Benutzerinformationen gibt, erstelle sie
    if (!assignedUsers.length && orderData.assignedTo) {
      console.log(`Keine strukturierten Benutzerinformationen gefunden, verarbeite assignedTo: ${JSON.stringify(orderData.assignedTo)}`);
      const processedData = processAssignmentData(orderData);
      assignedUsers = processedData.assignedUsers || [];
      console.log(`Verarbeitete Benutzerdaten:`, JSON.stringify(assignedUsers));
    }
    
    // Prüfe, ob der Benutzer bereits in den zugewiesenen Benutzern ist
    let isUserAlreadyAccepted = false;
    
    // Aktualisiere den Status des entsprechenden Benutzers
    const updatedUsers = assignedUsers.map((user: any) => {
      if (user.id === userId) {
        if (user.status === "accepted") {
          isUserAlreadyAccepted = true;
          console.log(`Benutzer ${userId} hat den Auftrag bereits akzeptiert`);
        }
        return {
          ...user,
          status: "accepted"
        };
      }
      return user;
    });
    
    // Wenn der Benutzer bereits akzeptiert hat, keine weitere Aktion notwendig
    if (isUserAlreadyAccepted) {
      console.log(`Keine Aktualisierung nötig, Benutzer ${userId} hat bereits akzeptiert`);
      return;
    }
    
    // Überprüfe, ob dieser Benutzer dem Auftrag zugewiesen ist
    const isUserAssigned = updatedUsers.some((user: any) => user.id === userId);
    
    // Falls der Benutzer nicht in updatedUsers ist, aber in assignedTo, füge ihn hinzu
    if (!isUserAssigned && Array.isArray(orderData.assignedTo) && orderData.assignedTo.includes(userId)) {
      console.log(`Benutzer ${userId} ist im alten Format zugewiesen, füge ihn zum neuen Format hinzu`);
      updatedUsers.push({
        id: userId,
        name: userName,
        status: "accepted"
      });
    } else if (!isUserAssigned) {
      console.error(`Benutzer ${userId} ist diesem Auftrag nicht zugewiesen`);
      throw new Error(`Benutzer ${userId} ist diesem Auftrag nicht zugewiesen`);
    }
    
    // Bestimme den Gesamtstatus des Auftrags
    let overallStatus = "assigned";
    
    // Wenn mindestens ein Benutzer angenommen hat, ist der Status "accepted"
    if (updatedUsers.some((user: any) => user.status === "accepted")) {
      overallStatus = "accepted";
      console.log(`Mindestens ein Benutzer hat akzeptiert, setze Status auf "${overallStatus}"`);
    }
    
    // Wenn alle Benutzer angenommen haben, ist der Status "in-progress"
    if (updatedUsers.length > 0 && updatedUsers.every((user: any) => user.status === "accepted")) {
      overallStatus = "in-progress";
      console.log(`Alle Benutzer haben akzeptiert, setze Status auf "${overallStatus}"`);
    }
    
    // Aktualisiere den Auftrag
    const updateData = {
      assignedUsers: updatedUsers,
      status: overallStatus
    };
    
    console.log(`Aktualisiere Auftrag mit Daten:`, JSON.stringify(updateData));
    await updateDoc(orderRef, updateData);
    console.log(`Auftrag ${id} erfolgreich aktualisiert, neuer Status: ${overallStatus}`);
    
    // Erstelle eine Benachrichtigung für den Manager oder Admin
    if (orderData.managerId) {
      await createNotification(
        orderData.managerId,
        "Auftrag angenommen",
        `Der Auftrag "${orderData.title}" wurde von ${userName} angenommen.`,
        "order",
        `/orders?id=${id}`
      );
    }
    
  } catch (error) {
    console.error("Error accepting order:", error);
    throw error;
  }
};

// Reject an order
export const rejectOrder = async (
  id: string,
  userId: string,
  userName: string,
  rejectionReason: string,
): Promise<void> => {
  try {
    // Hole den Auftrag, um die aktuelle Liste der zugewiesenen Benutzer zu erhalten
    const orderRef = doc(db, ordersCollection, id);
    const orderDoc = await getDocs(query(collection(db, ordersCollection), where('__name__', '==', id)));
    
    if (orderDoc.empty) {
      throw new Error(`Auftrag mit ID ${id} nicht gefunden`);
    }
    
    const orderData = orderDoc.docs[0].data();
    let assignedUsers = orderData.assignedUsers || [];
    
    // Wenn es keine strukturierten Benutzerinformationen gibt, erstelle sie
    if (!assignedUsers.length && orderData.assignedTo) {
      const processedData = processAssignmentData(orderData);
      assignedUsers = processedData.assignedUsers || [];
    }
    
    // Aktualisiere den Status des entsprechenden Benutzers
    const updatedUsers = assignedUsers.map((user: any) => {
      if (user.id === userId) {
        return {
          ...user,
          status: "rejected",
          rejectionReason: rejectionReason
        };
      }
      return user;
    });
    
    // Überprüfe, ob dieser Benutzer dem Auftrag zugewiesen ist
    const isUserAssigned = updatedUsers.some((user: any) => user.id === userId);
    
    if (!isUserAssigned && Array.isArray(orderData.assignedTo) && orderData.assignedTo.includes(userId)) {
      // Der Benutzer ist im alten Format zugewiesen, aber nicht im neuen Format
      updatedUsers.push({
        id: userId,
        name: userName,
        status: "rejected",
        rejectionReason: rejectionReason
      });
    } else if (!isUserAssigned) {
      throw new Error(`Benutzer ${userId} ist diesem Auftrag nicht zugewiesen`);
    }
    
    // Bestimme den Gesamtstatus des Auftrags
    // Der Gesamtstatus bleibt "assigned", solange noch Mitarbeiter zugewiesen sind, die nicht abgelehnt haben
    let overallStatus = "assigned";
    
    // Wenn keine Benutzer zugewiesen sind oder alle abgelehnt haben, ist der Status "rejected"
    if (updatedUsers.length === 0 || updatedUsers.every((user: any) => user.status === "rejected")) {
      overallStatus = "rejected";
    }
    
    // Wenn mindestens ein Benutzer angenommen hat, bleibt der Status "accepted"
    if (updatedUsers.some((user: any) => user.status === "accepted")) {
      overallStatus = "accepted";
    }
    
    // Wenn alle verbleibenden (nicht ablehnenden) Benutzer angenommen haben, ist der Status "in-progress"
    const nonRejectedUsers = updatedUsers.filter((user: any) => user.status !== "rejected");
    if (nonRejectedUsers.length > 0 && nonRejectedUsers.every((user: any) => user.status === "accepted")) {
      overallStatus = "in-progress";
    }
    
    // Aktualisiere den Auftrag
    await updateDoc(orderRef, {
      assignedUsers: updatedUsers,
      status: overallStatus,
      // Behalte den globalen Ablehnungsgrund für Abwärtskompatibilität bei
      rejectionReason: rejectionReason
    });
  } catch (error) {
    console.error("Error rejecting order:", error);
    throw error;
  }
};

// Complete an order
export const completeOrder = async (
  id: string,
  userId: string,
  userName: string,
  userRole?: string
): Promise<void> => {
  try {
    // Hole den Auftrag, um die aktuelle Liste der zugewiesenen Benutzer zu erhalten
    const orderRef = doc(db, ordersCollection, id);
    const orderDoc = await getDocs(query(collection(db, ordersCollection), where('__name__', '==', id)));
    
    if (orderDoc.empty) {
      throw new Error(`Auftrag mit ID ${id} nicht gefunden`);
    }
    
    const orderData = orderDoc.docs[0].data();
    let assignedUsers = orderData.assignedUsers || [];
    
    // Wenn es keine strukturierten Benutzerinformationen gibt, erstelle sie
    if (!assignedUsers.length && orderData.assignedTo) {
      const processedData = processAssignmentData(orderData);
      assignedUsers = processedData.assignedUsers || [];
    }
    
    // Überprüfe Berechtigungen
    const isAdmin = userRole === "admin";
    const isManager = userRole === "manager" || userId === orderData.managerId;
    const isTeamLead = assignedUsers.some((user: AssignedUser) => user.id === userId && user.isTeamLead === true);
    
    if (!isAdmin && !isManager && !isTeamLead) {
      throw new Error("Nur Teamleiter, Manager oder Administratoren können einen Auftrag abschließen");
    }
    
    // Wenn ein Teamleiter, Manager oder Admin den Auftrag abschließt, wird der Status aller Benutzer auf "completed" gesetzt
    const updatedUsers = assignedUsers.map((user: any) => {
      return {
        ...user,
        status: "completed"
      };
    });
    
    // Aktualisiere den Auftrag als abgeschlossen
    await updateDoc(orderRef, {
      assignedUsers: updatedUsers,
      status: "completed",
      endDate: Timestamp.now() // Setze das Enddatum auf jetzt
    });

    // Erstelle Zeiteinträge für alle Benutzer mit erfassten Zeiten
    const orderTitle = orderData.title;
    const createTimeEntryPromises = updatedUsers
      .filter((user: AssignedUser) => user.timeSpent && user.timeSpent > 0)
      .map((user: AssignedUser) => createTimeEntryFromOrder(
        user.id,
        user.name,
        id,
        orderTitle,
        user.timeSpent || 0,
        user.timeNotes
      ));
    
    if (createTimeEntryPromises.length > 0) {
      await Promise.all(createTimeEntryPromises);
      console.log(`${createTimeEntryPromises.length} Zeiteinträge für den abgeschlossenen Auftrag erstellt.`);
    } else {
      console.log(`Keine Zeiteinträge für den abgeschlossenen Auftrag erstellt, da keine Zeiten erfasst wurden.`);
    }

    // Erstelle Benachrichtigungen für die Teammitglieder
    for (const user of updatedUsers) {
      if (user.id !== userId) { // Nicht für den Ausführenden selbst
        createNotification(
          user.id,
          "Auftrag abgeschlossen",
          `Der Auftrag "${orderTitle}" wurde von ${userName} als abgeschlossen markiert.`,
          "order",
          `/orders/${id}`
        );
      }
    }

    // Benachrichtige alle Manager über den abgeschlossenen Auftrag
    await notifyAllManagers(
      "Auftrag abgeschlossen",
      `Der Auftrag "${orderData.title}" wurde von ${userName} als abgeschlossen markiert.`,
      `/orders/${id}`
    );
  } catch (error) {
    console.error("Error completing order:", error);
    throw error;
  }
};

// Exportiere reopenOrder direkt hier
export { reopenOrder };

/**
 * Prüft, ob Benachrichtigungen für einen bestimmten Ereignistyp gesendet werden sollen
 * @param eventType Art des Ereignisses ('newOrders', 'orderComments', etc.)
 * @returns Promise<boolean> True, wenn Benachrichtigungen aktiviert sind
 */
export const shouldSendNotification = async (eventType: keyof typeof notificationTypes): Promise<boolean> => {
  try {
    const config = await getMailConfig();
    return config.enabled && 
           config.notifications.enabled && 
           config.notifications[eventType];
  } catch (error) {
    console.error('Fehler beim Prüfen der Benachrichtigungseinstellungen:', error);
    return false;
  }
};

// Typen von Benachrichtigungen
const notificationTypes = {
  newOrders: 'Neuer Auftrag',
  orderComments: 'Neuer Kommentar',
  orderStatusChanges: 'Statusänderung',
  timeEntryReminders: 'Zeiteintragserinnerung',
  systemNotifications: 'Systembenachrichtigung'
};

/**
 * Sendet eine E-Mail-Benachrichtigung über einen neuen Auftrag
 * @param order Auftragsdaten
 * @param recipientEmail E-Mail-Adresse des Empfängers
 */
export const sendNewOrderNotification = async (order: EnhancedOrder, recipientEmail?: string): Promise<boolean> => {
  try {
    if (!await shouldSendNotification('newOrders')) {
      console.log('E-Mail-Benachrichtigungen für neue Aufträge sind deaktiviert');
      return false;
    }

    // Hole die Mail-Konfiguration
    const mailConfig = await getMailConfig();
    
    // Verwende entweder die angegebene E-Mail oder die Benachrichtigungs-E-Mail aus der Konfiguration
    const to = recipientEmail || mailConfig.notificationEmail;
    
    if (!to) {
      console.log('Keine Empfänger-E-Mail-Adresse angegeben oder konfiguriert');
      return false;
    }

    console.log('Sende Benachrichtigung über neuen Auftrag an:', to);

    const subject = `TimeTracker - Neuer Auftrag: ${order.title}`;
    const text = `
      Ihnen wurde ein neuer Auftrag zugewiesen:
      
      Titel: ${order.title}
      Beschreibung: ${order.description || 'Keine Beschreibung'}
      Kunde: ${order.customer?.name || 'Kein Kunde'}
      Deadline: ${order.deadline ? new Date(order.deadline).toLocaleDateString() : 'Keine Deadline'}
      
      Bitte melden Sie sich im TimeTracker-System an, um weitere Details zu sehen.
    `;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">TimeTracker - Neuer Auftrag</h2>
        <h3 style="color: #555;">${order.title}</h3>
        <p><strong>Beschreibung:</strong> ${order.description || 'Keine Beschreibung'}</p>
        <p><strong>Kunde:</strong> ${order.customer?.name || 'Kein Kunde'}</p>
        <p><strong>Deadline:</strong> ${order.deadline ? new Date(order.deadline).toLocaleDateString() : 'Keine Deadline'}</p>
        <p><a href="${window.location.origin}/orders/${order.id}" style="display: inline-block; padding: 10px 20px; background-color: #4a6cf7; color: white; text-decoration: none; border-radius: 5px;">Auftrag ansehen</a></p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="color: #777; font-size: 12px;">Diese Nachricht wurde automatisch vom TimeTracker-System gesendet.</p>
      </div>
    `;

    const success = await sendMail(to, subject, text, html);
    
    if (success) {
      console.log('Benachrichtigung über neuen Auftrag erfolgreich gesendet an:', to);
      return true;
    } else {
      console.warn('Benachrichtigung über neuen Auftrag konnte nicht gesendet werden');
      return false;
    }
  } catch (error) {
    console.error('Fehler beim Senden der Auftrags-Benachrichtigung:', error);
    return false;
  }
};

/**
 * Sendet eine E-Mail-Benachrichtigung über einen Kommentar zu einem Auftrag
 * @param order Der Auftrag
 * @param comment Der Kommentar
 * @param recipientEmail Die E-Mail-Adresse des Empfängers (optional)
 */
export async function sendOrderCommentNotification(
  order: any, 
  comment: string, 
  recipientEmail?: string
): Promise<boolean> {
  try {
    // Holen der E-Mail-Konfiguration
    const mailConfig = await getMailConfig();
    
    if (!mailConfig.enabled || !mailConfig.notifications.enabled || !mailConfig.notifications.orderComments) {
      console.log('E-Mail-Benachrichtigungen für Kommentare sind deaktiviert');
      return false;
    }
    
    // Verwende entweder die angegebene E-Mail oder die Benachrichtigungs-E-Mail aus der Konfiguration
    const to = recipientEmail || mailConfig.notificationEmail;
    
    if (!to) {
      console.log('Keine Empfänger-E-Mail-Adresse angegeben oder konfiguriert');
      return false;
    }
    
    const subject = `Neuer Kommentar zu Auftrag: ${order.title || 'Kein Titel'}`;
    const text = `
      Neuer Kommentar zu Auftrag #${order.id}
      
      Titel: ${order.title || 'Kein Titel'}
      Kommentar: ${comment}
      
      Öffnen Sie die Anwendung, um auf diesen Auftrag zu antworten.
    `;
    
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">Neuer Kommentar zu Auftrag #${order.id}</h2>
        <h3 style="color: #555;">Titel: ${order.title || 'Kein Titel'}</h3>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
          <p style="margin: 0;"><strong>Kommentar:</strong></p>
          <p style="margin: 10px 0 0;">${comment}</p>
        </div>
        <p>Öffnen Sie die Anwendung, um auf diesen Auftrag zu antworten.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="color: #777; font-size: 12px;">Diese Nachricht wurde automatisch vom TimeTracker-System gesendet.</p>
      </div>
    `;
    
    return await sendMail(to, subject, text, html);
  } catch (error) {
    console.error('Fehler beim Senden der Kommentar-Benachrichtigung:', error);
    return false;
  }
}

/**
 * Sendet eine E-Mail-Benachrichtigung über eine Statusänderung eines Auftrags
 * @param order Der Auftrag
 * @param oldStatus Der alte Status
 * @param newStatus Der neue Status
 * @param recipientEmail Die E-Mail-Adresse des Empfängers (optional)
 */
export async function sendOrderStatusChangeNotification(
  order: any, 
  oldStatus: string, 
  newStatus: string, 
  recipientEmail?: string
): Promise<boolean> {
  try {
    // Holen der E-Mail-Konfiguration
    const mailConfig = await getMailConfig();
    
    if (!mailConfig.enabled || !mailConfig.notifications.enabled || !mailConfig.notifications.orderStatusChanges) {
      console.log('E-Mail-Benachrichtigungen für Statusänderungen sind deaktiviert');
      return false;
    }
    
    // Verwende entweder die angegebene E-Mail oder die Benachrichtigungs-E-Mail aus der Konfiguration
    const to = recipientEmail || mailConfig.notificationEmail;
    
    if (!to) {
      console.log('Keine Empfänger-E-Mail-Adresse angegeben oder konfiguriert');
      return false;
    }
    
    // Übersetze Status in lesbare Namen
    const getStatusLabel = (status: string) => {
      switch (status) {
        case 'assigned': return 'Zugewiesen';
        case 'accepted': return 'Angenommen';
        case 'rejected': return 'Abgelehnt';
        case 'in-progress': return 'In Bearbeitung';
        case 'completed': return 'Abgeschlossen';
        case 'pending': return 'Ausstehend';
        default: return status;
      }
    };
    
    const subject = `Statusänderung bei Auftrag: ${order.title || 'Kein Titel'}`;
    const text = `
      Statusänderung bei Auftrag #${order.id}
      
      Titel: ${order.title || 'Kein Titel'}
      Alter Status: ${getStatusLabel(oldStatus)}
      Neuer Status: ${getStatusLabel(newStatus)}
      
      Öffnen Sie die Anwendung, um Details zu diesem Auftrag zu sehen.
    `;
    
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">Statusänderung bei Auftrag #${order.id}</h2>
        <h3 style="color: #555;">Titel: ${order.title || 'Kein Titel'}</h3>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0;">
          <p style="margin: 0;"><strong>Status geändert:</strong></p>
          <p style="margin: 10px 0;"><span style="color: #888;">${getStatusLabel(oldStatus)}</span> → <span style="color: #0070f3; font-weight: bold;">${getStatusLabel(newStatus)}</span></p>
        </div>
        <p>Öffnen Sie die Anwendung, um Details zu diesem Auftrag zu sehen.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="color: #777; font-size: 12px;">Diese Nachricht wurde automatisch vom TimeTracker-System gesendet.</p>
      </div>
    `;
    
    return await sendMail(to, subject, text, html);
  } catch (error) {
    console.error('Fehler beim Senden der Statusänderung-Benachrichtigung:', error);
    return false;
  }
}

/**
 * Prüft, ob das System korrekt für E-Mail-Benachrichtigungen konfiguriert ist
 * @returns {Promise<{isConfigured: boolean, emailAddress: string | null, enabled: boolean}>} 
 * Objekt mit Informationen über die Konfiguration
 */
export const checkNotificationConfiguration = async (): Promise<{
  isConfigured: boolean, 
  emailAddress: string | null,
  enabled: boolean
}> => {
  try {
    // Mail-Konfiguration laden
    const config = await getMailConfig();
    
    // Überprüfen, ob E-Mails aktiviert sind
    const emailsEnabled = config.enabled;
    
    // Überprüfen, ob Benachrichtigungen aktiviert sind
    const notificationsEnabled = config.notifications.enabled;
    
    // Überprüfen, ob eine Benachrichtigungs-E-Mail konfiguriert ist
    const hasNotificationEmail = !!config.notificationEmail;
    
    console.log("Benachrichtigungskonfiguration:", {
      emailsEnabled,
      notificationsEnabled,
      hasNotificationEmail,
      notificationEmail: config.notificationEmail || "nicht konfiguriert"
    });
    
    return {
      isConfigured: emailsEnabled && notificationsEnabled && hasNotificationEmail,
      emailAddress: config.notificationEmail || null,
      enabled: emailsEnabled && notificationsEnabled
    };
  } catch (error) {
    console.error("Fehler beim Prüfen der Benachrichtigungskonfiguration:", error);
    return {
      isConfigured: false,
      emailAddress: null,
      enabled: false
    };
  }
};

// Neue Mitarbeiter einem Auftrag zuweisen, nachdem jemand abgelehnt hat
export const reassignEmployees = async (
  id: string,
  newUsers: AssignedUser[]
): Promise<void> => {
  try {
    // Hole den aktuellen Auftrag, um die vorhandenen Daten zu erhalten
    const orderRef = doc(db, ordersCollection, id);
    const orderSnapshot = await getDoc(orderRef);
    
    if (!orderSnapshot.exists()) {
      throw new Error(`Auftrag mit ID ${id} nicht gefunden`);
    }
    
    const orderData = orderSnapshot.data();
    
    // Aktualisiere die AssignedUsers-Liste
    let currentAssignedUsers = orderData.assignedUsers || [];
    
    // Wenn keine strukturierten Benutzerinformationen vorhanden sind, erstelle sie
    if (!currentAssignedUsers.length && orderData.assignedTo) {
      const processedData = processAssignmentData(orderData);
      currentAssignedUsers = processedData.assignedUsers || [];
    }
    
    // Behalte die nicht abgelehnten Benutzer
    const nonRejectedUsers = currentAssignedUsers.filter(
      (user: AssignedUser) => user.status !== "rejected"
    );
    
    // Filtere neue Benutzer, um Duplikate zu vermeiden
    const existingUserIds = nonRejectedUsers.map((user: AssignedUser) => user.id);
    const filteredNewUsers = newUsers.filter(
      (user) => !existingUserIds.includes(user.id)
    );
    
    // Kombiniere die Listen
    const updatedUsers = [...nonRejectedUsers, ...filteredNewUsers];
    
    // Aktualisiere auch die alten Felder für Abwärtskompatibilität
    const userIds = updatedUsers.map((user) => user.id);
    const userNames = updatedUsers.map((user) => user.name);
    
    // Finde den Teamleiter
    const teamLead = updatedUsers.find((user) => user.isTeamLead);
    
    // Bestimme den neuen Status basierend auf den Benutzern
    let newStatus = orderData.status;
    
    // Wenn alle Benutzer abgelehnt haben und keine neuen hinzugefügt wurden
    if (updatedUsers.length === 0) {
      newStatus = "rejected";
    } 
    // Wenn alle neuen Benutzer den Status "accepted" haben
    else if (updatedUsers.every((user) => user.status === "accepted")) {
      newStatus = "in-progress";
    }
    // Wenn mindestens ein Benutzer den Status "accepted" hat
    else if (updatedUsers.some((user) => user.status === "accepted")) {
      newStatus = "accepted";
    }
    // Wenn es neue Benutzer gibt, aber keiner akzeptiert hat
    else {
      newStatus = "assigned";
    }
    
    // Aktualisiere den Auftrag mit den neuen Daten
    await updateDoc(orderRef, {
      assignedUsers: updatedUsers,
      assignedTo: userIds,
      assignedToName: userNames,
      teamLeadId: teamLead?.id || null,
      status: newStatus,
      lastModified: Timestamp.now()
    });
    
    // Sende Benachrichtigungen an neu zugewiesene Benutzer
    for (const user of filteredNewUsers) {
      if (user.id) {
        // Firestore-Benachrichtigung
        await createNotification(
          user.id,
          "Neuer Auftrag zugewiesen",
          `Dir wurde der Auftrag "${orderData.title}" zugewiesen.`,
          "order",
          `/orders?id=${id}`
        );
        
        // E-Mail-Benachrichtigung, falls konfiguriert
        try {
          const userData = await UserService.getUser(user.id);
          if (userData && typeof userData === 'object' && 'email' in userData && userData.email && user.notify !== false) {
            console.log('Sende E-Mail-Benachrichtigung über neue Zuweisung an:', userData.email);
            
            // Erweitere Order um die fehlenden Eigenschaften für die E-Mail-Benachrichtigung
            const enhancedOrder: EnhancedOrder = {
              ...orderData,
              id,
              title: orderData.title || 'Unbekannter Auftrag',
              description: orderData.description || '',
              status: orderData.status || 'assigned',
              userId: orderData.userId || '',
              date: orderData.date || new Date(),
              customer: {
                name: orderData.client || 'Kein Kunde'
              },
              deadline: orderData.endDate 
                ? (orderData.endDate instanceof Timestamp ? orderData.endDate.toDate() : orderData.endDate) 
                : orderData.confirmationDeadline 
                  ? (orderData.confirmationDeadline instanceof Timestamp ? orderData.confirmationDeadline.toDate() : orderData.confirmationDeadline)
                  : undefined
            };
            
            await sendNewOrderNotification(enhancedOrder, userData.email as string);
          }
        } catch (error) {
          console.error('Fehler beim Senden der E-Mail-Benachrichtigung an den Benutzer:', error);
        }
      }
    }
  } catch (error) {
    console.error("Fehler bei der Neuzuweisung von Mitarbeitern:", error);
    throw error;
  }
}; 