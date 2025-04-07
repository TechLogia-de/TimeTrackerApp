import { doc, updateDoc, getDocs, query, collection, where, addDoc, Timestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Order, AssignedUser } from "../../lib/services/orderService";

const ordersCollection = "orders";
const timeEntriesCollection = "timeEntries";

/**
 * Erstellt einen Zeiteintrag für die in einem Auftrag erfasste Zeit
 * @param userId - Die ID des Benutzers
 * @param userName - Der Name des Benutzers
 * @param orderId - Die ID des Auftrags
 * @param orderTitle - Der Titel des Auftrags
 * @param timeSpent - Die aufgewendete Zeit in Minuten
 * @param notes - Optionale Notizen zur Zeiterfassung
 * @param orderData - Optionale zusätzliche Auftragsdaten
 */
export const createTimeEntryFromOrder = async (
  userId: string,
  userName: string,
  orderId: string,
  orderTitle: string,
  timeSpent: number,
  notes?: string,
  orderData?: Partial<Order>
): Promise<void> => {
  try {
    // Überprüfe, ob Mindestwerte vorhanden sind
    if (!userId || !orderId || timeSpent <= 0) {
      console.warn("Unzureichende Daten für Zeiteintrag", { userId, orderId, timeSpent });
      return;
    }

    // Konvertiere Zeit von Minuten in Stunden und Minuten zur Anzeige
    const hours = Math.floor(timeSpent / 60);
    const minutes = timeSpent % 60;
    const durationString = `${hours}h ${minutes}m`;

    // Erstelle Zeiteintrag mit Verweis auf den Auftrag
    const now = new Date();
    const endTime = now;
    const startTime = new Date(now.getTime() - timeSpent * 60 * 1000); // Rückrechnung der Startzeit

    // Sammle zusätzliche Auftragsinformationen, falls vorhanden
    const customerId = orderData?.customerId || '';
    const customerName = orderData?.client || '';
    const projectId = orderData?.projectId || '';
    const projectName = orderData?.project || '';
    
    // Ermittle den Benutzer für Email (falls vorhanden)
    const userEmail = orderData?.userEmail || '';
    
    // Erstelle einen detaillierten Zeiteintrag
    await addDoc(collection(db, timeEntriesCollection), {
      // Benutzerinformationen
      userId,
      userName,
      userEmail,
      
      // Zeitangaben
      date: Timestamp.now(),
      dateYear: now.getFullYear(),
      dateMonth: now.getMonth(),
      dateDay: now.getDate(),
      dateString: `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`,
      startTime: Timestamp.fromDate(startTime),
      endTime: Timestamp.fromDate(endTime),
      duration: timeSpent * 60, // Umrechnung in Sekunden für Konsistenz mit anderen Zeiteinträgen
      durationString,
      
      // Projekt- und Kundendaten
      customerId,
      customerName,
      projectId,
      projectName,
      
      // Beschreibung
      project: orderTitle,
      note: notes || `Zeit aus Auftrag: ${orderTitle}`,
      description: `Arbeit für Auftrag: ${orderTitle}`,
      
      // Status
      status: "Bestätigt", // Bereits bestätigt, da aus einem Auftrag
      
      // Referenz zum Auftrag
      orderId,
      orderTitle,
      orderReference: true, // Kennzeichnung, dass dieser Zeiteintrag aus einem Auftrag stammt
      auftragId: orderId, // Für Kompatibilität mit beiden Namenskonventionen
      auftragTitle: orderTitle,
      
      // Metadaten
      createdAt: Timestamp.now(),
      isManualEntry: false, // Nicht manuell erstellt
      fromOrders: true // Explizit als aus Aufträgen stammend kennzeichnen
    });

    console.log(`Zeiteintrag für Benutzer ${userId} für Auftrag ${orderId} erstellt (${timeSpent} Minuten)`);
  } catch (error) {
    console.error("Fehler beim Erstellen des Zeiteintrags:", error);
  }
};

/**
 * Aktualisiert die aufgewendete Zeit eines Benutzers für einen Auftrag.
 * @param orderId - Die ID des Auftrags
 * @param userId - Die ID des Benutzers
 * @param timeSpent - Die aufgewendete Zeit in Minuten
 * @param notes - Optionale Notizen zur Zeiterfassung
 * @returns Eine Promise, die aufgelöst wird, wenn die Zeit aktualisiert wurde
 */
export const updateUserTimeForOrder = async (
  orderId: string,
  userId: string,
  timeSpent: number,
  notes?: string
): Promise<void> => {
  try {
    // Hole den Auftrag
    const orderRef = doc(db, ordersCollection, orderId);
    const orderDoc = await getDocs(query(collection(db, ordersCollection), where('__name__', '==', orderId)));
    
    if (orderDoc.empty) {
      throw new Error(`Auftrag mit ID ${orderId} nicht gefunden`);
    }
    
    const orderData = orderDoc.docs[0].data();
    const assignedUsers = orderData.assignedUsers || [];
    
    if (!assignedUsers.length) {
      throw new Error(`Auftrag mit ID ${orderId} hat keine zugewiesenen Benutzer`);
    }
    
    // Prüfe, ob der Benutzer dem Auftrag zugewiesen ist
    const userIndex = assignedUsers.findIndex((user: any) => user.id === userId);
    
    if (userIndex === -1) {
      throw new Error(`Benutzer ${userId} ist diesem Auftrag nicht zugewiesen`);
    }
    
    // Aktualisiere die Zeiterfassung des Benutzers
    const updatedUsers = [...assignedUsers];
    updatedUsers[userIndex] = {
      ...updatedUsers[userIndex],
      timeSpent,
      timeNotes: notes
    };
    
    // Berechne die Gesamtzeit
    const totalTimeSpent = updatedUsers.reduce(
      (total: number, user: any) => total + (user.timeSpent || 0),
      0
    );
    
    // Aktualisiere den Auftrag
    await updateDoc(orderRef, {
      assignedUsers: updatedUsers,
      totalTimeSpent
    });

    // Erstelle einen Zeiteintrag für den Benutzer
    await createTimeEntryFromOrder(
      userId, 
      updatedUsers[userIndex].name, 
      orderId, 
      orderData.title, 
      timeSpent, 
      notes
    );
  } catch (error) {
    console.error("Fehler bei der Aktualisierung der Benutzerzeit:", error);
    throw error;
  }
};

/**
 * Schließt einen Auftrag als Teamleiter ab und aktualisiert die Zeiten aller Teammitglieder.
 * @param orderId - Die ID des Auftrags
 * @param teamLeadId - Die ID des Teamleiters
 * @param teamTimes - Ein Objekt mit Benutzer-IDs als Schlüssel und ihrer aufgewendeten Zeit als Wert
 * @param teamNotes - Ein Objekt mit Benutzer-IDs als Schlüssel und ihren Notizen als Wert
 * @returns Eine Promise, die aufgelöst wird, wenn der Auftrag abgeschlossen wurde
 */
export const finalizeOrderAsTeamLead = async (
  orderId: string,
  teamLeadId: string,
  teamTimes: Record<string, number>,
  teamNotes: Record<string, string>
): Promise<void> => {
  try {
    // Hole den Auftrag
    const orderRef = doc(db, ordersCollection, orderId);
    const orderDoc = await getDocs(query(collection(db, ordersCollection), where('__name__', '==', orderId)));
    
    if (orderDoc.empty) {
      throw new Error(`Auftrag mit ID ${orderId} nicht gefunden`);
    }
    
    const orderData = orderDoc.docs[0].data();
    const assignedUsers = orderData.assignedUsers || [];
    
    if (!assignedUsers.length) {
      throw new Error(`Auftrag mit ID ${orderId} hat keine zugewiesenen Benutzer`);
    }
    
    // Prüfe, ob der Benutzer der Teamleiter ist
    const teamLead = assignedUsers.find((user: any) => user.id === teamLeadId);
    
    if (!teamLead || !teamLead.isTeamLead) {
      throw new Error(`Benutzer ${teamLeadId} ist nicht der Teamleiter dieses Auftrags`);
    }
    
    // Aktualisiere die Zeiterfassung für alle Teammitglieder
    const updatedUsers = assignedUsers.map((user: any) => {
      // Wenn für diesen Benutzer eine Zeit angegeben wurde
      if (teamTimes[user.id] !== undefined) {
        return {
          ...user,
          timeSpent: teamTimes[user.id],
          timeNotes: teamNotes[user.id] || user.timeNotes || "",
          status: "completed" // Markiere alle Benutzer als abgeschlossen
        };
      }
      return user;
    });
    
    // Berechne die Gesamtzeit
    const totalTimeSpent = updatedUsers.reduce(
      (total: number, user: any) => total + (user.timeSpent || 0),
      0
    );
    
    // Aktualisiere den Auftrag
    await updateDoc(orderRef, {
      assignedUsers: updatedUsers,
      totalTimeSpent,
      status: "completed" // Markiere den gesamten Auftrag als abgeschlossen
    });

    // Erstelle Zeiteinträge für alle Benutzer mit erfassten Zeiten
    const orderTitle = orderData.title;
    const createTimeEntryPromises = updatedUsers
      .filter((user: AssignedUser) => user.timeSpent && user.timeSpent > 0)
      .map((user: AssignedUser) => createTimeEntryFromOrder(
        user.id,
        user.name,
        orderId,
        orderTitle,
        user.timeSpent || 0,
        user.timeNotes
      ));
    
    await Promise.all(createTimeEntryPromises);
  } catch (error) {
    console.error("Fehler beim Abschließen des Auftrags als Teamleiter:", error);
    throw error;
  }
};

/**
 * Öffnet einen abgeschlossenen Auftrag erneut für Bearbeitungen durch den Teamleiter.
 * @param orderId - Die ID des Auftrags
 * @param teamLeadId - Die ID des Teamleiters, der den Auftrag wiedereröffnet
 * @returns Eine Promise, die aufgelöst wird, wenn der Auftrag erfolgreich wiedereröffnet wurde
 */
export const reopenOrder = async (
  orderId: string,
  teamLeadId: string
): Promise<void> => {
  try {
    // Hole den Auftrag
    const orderRef = doc(db, ordersCollection, orderId);
    const orderDoc = await getDocs(query(collection(db, ordersCollection), where('__name__', '==', orderId)));
    
    if (orderDoc.empty) {
      throw new Error(`Auftrag mit ID ${orderId} nicht gefunden`);
    }
    
    const orderData = orderDoc.docs[0].data();
    
    // Prüfe, ob der Benutzer der Teamleiter ist
    const isTeamLead = 
      orderData.teamLeadId === teamLeadId || 
      (orderData.assignedUsers && orderData.assignedUsers.some((user: any) => 
        user.id === teamLeadId && user.isTeamLead
      ));
    
    if (!isTeamLead) {
      throw new Error(`Benutzer ${teamLeadId} ist nicht berechtigt, diesen Auftrag wiederzueröffnen`);
    }
    
    // Setze den Status des Auftrags auf "in-progress" zurück
    await updateDoc(orderRef, {
      status: "in-progress",
      // Aktionen protokollieren
      lastUpdated: new Date(),
      lastUpdatedBy: teamLeadId,
      reopenedAt: new Date(),
      reopenedBy: teamLeadId
    });
    
    console.log(`Auftrag ${orderId} wurde durch Teamleiter ${teamLeadId} wiedereröffnet`);
  } catch (error) {
    console.error("Fehler beim Wiedereröffnen des Auftrags:", error);
    throw error;
  }
}; 