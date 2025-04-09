import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs, 
  getDoc,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  QuerySnapshot,
  DocumentData
} from "firebase/firestore";
import { db } from "../firebase";
import { Shift, ShiftTemplate, Availability, ShiftSwapRequest, WeeklySchedule, MonthlySchedule } from "@/types/shifts";
import { Absence } from "@/types/absence";
import { sendNotification } from "@/lib/utils";

// Collection-Namen
const SHIFTS_COLLECTION = "shifts";
const SHIFT_TEMPLATES_COLLECTION = "shiftTemplates";
const AVAILABILITIES_COLLECTION = "availabilities";
const SHIFT_SWAP_REQUESTS_COLLECTION = "shiftSwapRequests";
const WEEKLY_SCHEDULES_COLLECTION = "weeklySchedules";
const MONTHLY_SCHEDULES_COLLECTION = "monthlySchedules";

/**
 * Schicht-Service für die Verwaltung von Schichtdaten
 */
export class ShiftService {
  /**
   * Alle Schichten laden
   */
  static async getAllShifts(): Promise<Shift[]> {
    try {
      const shiftsCollection = collection(db, SHIFTS_COLLECTION);
      const querySnapshot = await getDocs(shiftsCollection);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() 
            ? data.createdAt.toDate().toISOString() 
            : data.createdAt || new Date().toISOString()
        } as Shift;
      });
    } catch (error) {
      console.error("Fehler beim Laden aller Schichten:", error);
      throw error;
    }
  }

  /**
   * Schichten für einen bestimmten Zeitraum laden
   */
  static async getShiftsByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    try {
      const shiftsCollection = collection(db, SHIFTS_COLLECTION);
      const q = query(
        shiftsCollection,
        where("date", ">=", startDate),
        where("date", "<=", endDate),
        orderBy("date")
      );
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() 
            ? data.createdAt.toDate().toISOString() 
            : data.createdAt || new Date().toISOString()
        } as Shift;
      });
    } catch (error) {
      console.error("Fehler beim Laden der Schichten für den Zeitraum:", error);
      throw error;
    }
  }

  /**
   * Schichten für einen bestimmten Benutzer laden
   */
  static async getShiftsByUser(userId: string): Promise<Shift[]> {
    try {
      const shifts = await this.getAllShifts();
      return shifts.filter(shift => 
        shift.assignedUsers.some(assignment => assignment.userId === userId)
      );
    } catch (error) {
      console.error("Fehler beim Laden der Schichten für den Benutzer:", error);
      throw error;
    }
  }

  /**
   * Schicht speichern (neu erstellen oder aktualisieren)
   */
  static async saveShift(shift: Shift): Promise<string> {
    try {
      // Erstelle ein bereinigtes Objekt ohne undefined-Werte
      const cleanShift = Object.fromEntries(
        Object.entries(shift).filter(([_, value]) => value !== undefined)
      ) as Shift;

      if (cleanShift.id && cleanShift.id !== 'new') {
        // Prüfen, ob das Dokument existiert
        try {
          const shiftRef = doc(db, SHIFTS_COLLECTION, cleanShift.id);
          const docSnap = await getDoc(shiftRef);
          
          if (docSnap.exists()) {
            // Vorhandene Schicht aktualisieren
            const { id, ...updateData } = cleanShift;
            await updateDoc(shiftRef, {
              ...updateData,
              updatedAt: serverTimestamp()
            });
            return cleanShift.id;
          } else {
            // Dokument existiert nicht, also ein neues erstellen
            const { id, ...newShiftData } = cleanShift;
            const docRef = await addDoc(collection(db, SHIFTS_COLLECTION), {
              ...newShiftData,
              createdAt: serverTimestamp()
            });
            
            // Aktualisiere die Schicht mit einem spezifischen Präfix, um sie als reale Schicht zu kennzeichnen
            const realShiftRef = doc(db, SHIFTS_COLLECTION, docRef.id);
            await updateDoc(realShiftRef, {
              id: `real_${docRef.id}`
            });
            
            return `real_${docRef.id}`;
          }
        } catch (error) {
          console.error("Fehler beim Prüfen des Dokuments:", error);
          // Fallback: Neues Dokument erstellen
          const { id, ...newShiftData } = cleanShift;
          const docRef = await addDoc(collection(db, SHIFTS_COLLECTION), {
            ...newShiftData,
            createdAt: serverTimestamp()
          });
          
          // Aktualisiere die Schicht mit einem spezifischen Präfix, um sie als reale Schicht zu kennzeichnen
          const realShiftRef = doc(db, SHIFTS_COLLECTION, docRef.id);
          await updateDoc(realShiftRef, {
            id: `real_${docRef.id}`
          });
          
          return `real_${docRef.id}`;
        }
      } else {
        // Neue Schicht erstellen
        // ID aus dem Objekt entfernen
        const { id, ...shiftData } = cleanShift;
        const docRef = await addDoc(collection(db, SHIFTS_COLLECTION), {
          ...shiftData,
          createdAt: serverTimestamp()
        });
        
        // Aktualisiere die Schicht mit einem spezifischen Präfix, um sie als reale Schicht zu kennzeichnen
        const realShiftRef = doc(db, SHIFTS_COLLECTION, docRef.id);
        await updateDoc(realShiftRef, {
          id: `real_${docRef.id}`
        });
        
        return `real_${docRef.id}`;
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Schicht:", error);
      throw error;
    }
  }

  /**
   * Schicht löschen und alle betroffenen Benutzer benachrichtigen
   */
  static async deleteShift(shiftId: string): Promise<void> {
    try {
      // Zuerst die Schicht abrufen, um Benutzerinformationen zu sammeln
      const shiftRef = doc(db, SHIFTS_COLLECTION, shiftId);
      const shiftDoc = await getDoc(shiftRef);
      
      if (shiftDoc.exists()) {
        const shiftData = shiftDoc.data() as Shift;
        
        // Benachrichtigungen an alle zugewiesenen Benutzer senden
        if (shiftData.assignedUsers && shiftData.assignedUsers.length > 0) {
          for (const assignedUser of shiftData.assignedUsers) {
            // Benachrichtigung in Firestore speichern
            await addDoc(collection(db, "notifications"), {
              userId: assignedUser.userId,
              title: "Schicht gelöscht",
              message: `Die Schicht "${shiftData.title}" am ${shiftData.date} (${shiftData.startTime} - ${shiftData.endTime}) wurde gelöscht.`,
              type: "shift_deleted",
              read: false,
              createdAt: serverTimestamp(),
              link: `/shifts`
            });
            
            // Zusätzlich Browser-Benachrichtigung senden
            sendNotification("Schicht gelöscht", {
              body: `Die Schicht "${shiftData.title}" am ${shiftData.date} (${shiftData.startTime} - ${shiftData.endTime}) wurde gelöscht.`,
              icon: "/icon-192x192.png",
              type: "warning"
            });
          }
        }
      }
      
      // Nun die Schicht aus der Datenbank löschen
      await deleteDoc(shiftRef);
    } catch (error) {
      console.error("Fehler beim Löschen der Schicht:", error);
      throw error;
    }
  }

  /**
   * Alle Schicht-Vorlagen laden
   */
  static async getAllShiftTemplates(): Promise<ShiftTemplate[]> {
    try {
      const templatesCollection = collection(db, SHIFT_TEMPLATES_COLLECTION);
      const querySnapshot = await getDocs(templatesCollection);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id
        } as ShiftTemplate;
      });
    } catch (error) {
      console.error("Fehler beim Laden aller Schicht-Vorlagen:", error);
      throw error;
    }
  }

  /**
   * Schicht-Vorlage speichern
   */
  static async saveShiftTemplate(template: ShiftTemplate): Promise<string> {
    try {
      // Prüfen, ob ID existiert und kein temporärer Wert ist (beginnt nicht mit 'template_')
      if (template.id && template.id !== 'new' && !template.id.startsWith('template_')) {
        // Vorhandene Vorlage aktualisieren
        const templateRef = doc(db, SHIFT_TEMPLATES_COLLECTION, template.id);
        await updateDoc(templateRef, {
          ...template,
          updatedAt: serverTimestamp()
        });
        return template.id;
      } else {
        // Neue Vorlage erstellen - ID vollständig entfernen anstatt auf undefined zu setzen
        const { id, ...templateDataWithoutId } = template;
        const templateData = {
          ...templateDataWithoutId,
          createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, SHIFT_TEMPLATES_COLLECTION), templateData);
        return docRef.id;
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Schicht-Vorlage:", error);
      throw error;
    }
  }

  /**
   * Verfügbarkeiten für einen Benutzer laden
   */
  static async getUserAvailabilities(userId: string): Promise<Availability[]> {
    try {
      const availabilitiesCollection = collection(db, AVAILABILITIES_COLLECTION);
      const q = query(
        availabilitiesCollection,
        where("userId", "==", userId)
      );
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id
        } as Availability;
      });
    } catch (error) {
      console.error("Fehler beim Laden der Verfügbarkeiten für den Benutzer:", error);
      throw error;
    }
  }

  /**
   * Verfügbarkeit speichern
   */
  static async saveAvailability(availability: Availability): Promise<string> {
    try {
      if (availability.id && availability.id !== 'new') {
        // Vorhandene Verfügbarkeit aktualisieren
        const availabilityRef = doc(db, AVAILABILITIES_COLLECTION, availability.id);
        await updateDoc(availabilityRef, {
          ...availability,
          updatedAt: serverTimestamp()
        });
        return availability.id;
      } else {
        // Neue Verfügbarkeit erstellen
        const availabilityData = {
          ...availability,
          id: undefined,
          createdAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, AVAILABILITIES_COLLECTION), availabilityData);
        return docRef.id;
      }
    } catch (error) {
      console.error("Fehler beim Speichern der Verfügbarkeit:", error);
      throw error;
    }
  }

  /**
   * Mehrere Verfügbarkeiten für einen Benutzer speichern
   */
  static async saveUserAvailabilities(userId: string, availabilities: Availability[]): Promise<void> {
    try {
      // Batch für mehrere Operationen
      const batch = writeBatch(db);
      
      // Zuerst alle vorhandenen Verfügbarkeiten des Benutzers löschen
      const existingAvailabilities = await this.getUserAvailabilities(userId);
      for (const avail of existingAvailabilities) {
        batch.delete(doc(db, AVAILABILITIES_COLLECTION, avail.id));
      }
      
      // Dann neue Verfügbarkeiten hinzufügen
      for (const avail of availabilities) {
        const newAvailRef = doc(collection(db, AVAILABILITIES_COLLECTION));
        const availData = {
          ...avail,
          id: undefined,
          userId,
          createdAt: serverTimestamp()
        };
        batch.set(newAvailRef, availData);
      }
      
      // Batch ausführen
      await batch.commit();
    } catch (error) {
      console.error("Fehler beim Speichern der Benutzerverfügbarkeiten:", error);
      throw error;
    }
  }

  /**
   * Schichttausch-Anfragen für einen Benutzer laden
   */
  static async getSwapRequestsForUser(userId: string): Promise<ShiftSwapRequest[]> {
    try {
      const requestsCollection = collection(db, SHIFT_SWAP_REQUESTS_COLLECTION);
      const q = query(
        requestsCollection,
        where("requesterId", "==", userId),
        orderBy("createdAt", "desc")
      );
      
      const querySnapshot = await getDocs(q);
      
      const outgoingRequests = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() 
            ? data.createdAt.toDate().toISOString() 
            : data.createdAt || new Date().toISOString(),
          respondedAt: data.respondedAt?.toDate?.()
            ? data.respondedAt.toDate().toISOString()
            : data.respondedAt || undefined
        } as ShiftSwapRequest;
      });
      
      // Auch eingehende Anfragen laden
      const incomingQ = query(
        requestsCollection,
        where("recipientId", "==", userId),
        orderBy("createdAt", "desc")
      );
      
      const incomingSnapshot = await getDocs(incomingQ);
      
      const incomingRequests = incomingSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate?.() 
            ? data.createdAt.toDate().toISOString() 
            : data.createdAt || new Date().toISOString(),
          respondedAt: data.respondedAt?.toDate?.()
            ? data.respondedAt.toDate().toISOString()
            : data.respondedAt || undefined
        } as ShiftSwapRequest;
      });
      
      // Alle Anfragen kombinieren und nach Datum sortieren
      const allRequests = [...outgoingRequests, ...incomingRequests];
      return allRequests.sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } catch (error) {
      console.error("Fehler beim Laden der Schichttausch-Anfragen:", error);
      throw error;
    }
  }

  /**
   * Schichttausch-Anfrage erstellen
   */
  static async createSwapRequest(request: ShiftSwapRequest): Promise<string> {
    try {
      const requestData = {
        ...request,
        id: undefined,
        status: 'pending',
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, SHIFT_SWAP_REQUESTS_COLLECTION), requestData);
      return docRef.id;
    } catch (error) {
      console.error("Fehler beim Erstellen der Schichttausch-Anfrage:", error);
      throw error;
    }
  }

  /**
   * Schichttausch-Anfrage beantworten
   */
  static async respondToSwapRequest(
    requestId: string, 
    status: 'approved' | 'rejected', 
    responseNotes: string,
    respondedBy: string
  ): Promise<void> {
    try {
      const requestRef = doc(db, SHIFT_SWAP_REQUESTS_COLLECTION, requestId);
      await updateDoc(requestRef, {
        status,
        responseNotes,
        respondedBy,
        respondedAt: serverTimestamp()
      });
      
      // Wenn akzeptiert, die Schichten tauschen
      if (status === 'approved') {
        const requestDoc = await getDoc(requestRef);
        if (!requestDoc.exists()) {
          throw new Error("Anfrage nicht gefunden");
        }
        
        const requestData = requestDoc.data() as ShiftSwapRequest;
        await this.swapShifts(requestData.shiftId, requestData.requesterId, requestData.recipientId);
      }
    } catch (error) {
      console.error("Fehler beim Beantworten der Schichttausch-Anfrage:", error);
      throw error;
    }
  }

  /**
   * Schichten zwischen zwei Benutzern tauschen
   * @private
   */
  private static async swapShifts(
    shiftId: string, 
    requesterId: string, 
    recipientId: string
  ): Promise<void> {
    try {
      const shiftRef = doc(db, SHIFTS_COLLECTION, shiftId);
      const shiftDoc = await getDoc(shiftRef);
      
      if (!shiftDoc.exists()) {
        throw new Error("Schicht nicht gefunden");
      }
      
      const shiftData = shiftDoc.data() as Shift;
      const assignedUsers = [...shiftData.assignedUsers];
      
      // Benutzer in der Zuweisung finden und tauschen
      const requesterIndex = assignedUsers.findIndex(u => u.userId === requesterId);
      const recipientIndex = assignedUsers.findIndex(u => u.userId === recipientId);
      
      if (requesterIndex === -1) {
        throw new Error("Anfragender Benutzer nicht in der Schicht gefunden");
      }
      
      if (recipientIndex === -1) {
        // Wenn der Empfänger noch nicht zugewiesen ist, füge ihn hinzu
        const requesterAssignment = assignedUsers[requesterIndex];
        assignedUsers.push({
          userId: recipientId,
          userName: recipientId, // Idealerweise sollte hier der richtige Name gesetzt werden
          status: 'accepted',
          notes: `Übernommen von ${requesterAssignment.userName}`
        });
        
        // Und entferne den Anfrager
        assignedUsers.splice(requesterIndex, 1);
      } else {
        // Beide tauschen
        [assignedUsers[requesterIndex], assignedUsers[recipientIndex]] = 
        [assignedUsers[recipientIndex], assignedUsers[requesterIndex]];
        
        // Status aktualisieren
        assignedUsers[requesterIndex].status = 'accepted';
        assignedUsers[recipientIndex].status = 'accepted';
      }
      
      // Schicht aktualisieren
      await updateDoc(shiftRef, {
        assignedUsers,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Fehler beim Tauschen der Schichten:", error);
      throw error;
    }
  }

  /**
   * Standard-Schichtvorlagen für die Gastronomie erstellen
   */
  static async createDefaultGastroTemplates(): Promise<ShiftTemplate[]> {
    try {
      // Erst prüfen, ob bereits Vorlagen existieren
      const existingTemplates = await this.getAllShiftTemplates();
      if (existingTemplates.length > 0) {
        console.log("Es existieren bereits Schichtvorlagen:", existingTemplates.length);
        return existingTemplates;
      }

      // Gastronomie-spezifische Schichtvorlagen
      const gastroTemplates: Partial<ShiftTemplate>[] = [
        { 
          title: "Frühschicht Küche", 
          startTime: "06:00", 
          endTime: "14:00", 
          color: "#e3f2fd",
          description: "Vorbereitung Frühstück und Mittagessen, Mise en Place"
        },
        { 
          title: "Mittagsschicht Küche", 
          startTime: "10:00", 
          endTime: "18:00", 
          color: "#bbdefb",
          description: "Mittagsservice und Vorbereitung Abendessen"
        },
        { 
          title: "Abendschicht Küche", 
          startTime: "16:00", 
          endTime: "00:00", 
          color: "#90caf9",
          description: "Abendservice und Küchenreinigung"
        },
        { 
          title: "Spätschicht Küche", 
          startTime: "18:00", 
          endTime: "02:00", 
          color: "#64b5f6",
          description: "Abendservice und Nachtreinigung"
        },
        { 
          title: "Frühschicht Service", 
          startTime: "07:00", 
          endTime: "15:00", 
          color: "#e8f5e9",
          description: "Frühstücks- und Mittagsservice"
        },
        { 
          title: "Mittagsschicht Service", 
          startTime: "11:00", 
          endTime: "19:00", 
          color: "#c8e6c9",
          description: "Mittags- und früher Abendservice"
        },
        { 
          title: "Abendschicht Service", 
          startTime: "17:00", 
          endTime: "01:00", 
          color: "#a5d6a7",
          description: "Abendservice und Abschluss"
        },
        { 
          title: "Bar Frühschicht", 
          startTime: "10:00", 
          endTime: "18:00", 
          color: "#fff8e1",
          description: "Barvorbereitung und Mittagsgetränke"
        },
        { 
          title: "Bar Spätschicht", 
          startTime: "18:00", 
          endTime: "02:00", 
          color: "#ffecb3",
          description: "Abendservice und Cocktails"
        },
        { 
          title: "Wochenendschicht", 
          startTime: "12:00", 
          endTime: "22:00", 
          color: "#f3e5f5",
          description: "Durchgehender Service am Wochenende"
        }
      ];

      // Vorlagen in der Datenbank speichern
      const createdTemplates: ShiftTemplate[] = [];
      
      for (const template of gastroTemplates) {
        const { id, ...templateData } = template as ShiftTemplate;
        const docRef = await addDoc(collection(db, SHIFT_TEMPLATES_COLLECTION), {
          ...templateData,
          createdAt: serverTimestamp()
        });
        
        // Zurückgeben mit der generierten ID
        createdTemplates.push({
          ...templateData,
          id: docRef.id
        } as ShiftTemplate);
      }
      
      console.log(`${createdTemplates.length} Gastronomie-Schichtvorlagen erstellt`);
      return createdTemplates;
    } catch (error) {
      console.error("Fehler beim Erstellen der Gastronomie-Schichtvorlagen:", error);
      throw error;
    }
  }

  /**
   * Echtzeit-Listener für Schichtänderungen erstellen
   * @param callback Funktion, die bei Änderungen aufgerufen wird
   * @returns Eine Funktion zum Abmelden des Listeners
   */
  static subscribeToShifts(callback: (shifts: Shift[]) => void): () => void {
    try {
      const shiftsCollection = collection(db, SHIFTS_COLLECTION);
      
      // Firestore onSnapshot-Listener erstellen
      const unsubscribe = onSnapshot(
        shiftsCollection,
        (querySnapshot: QuerySnapshot<DocumentData>) => {
          // Schichten aus den Dokumenten extrahieren
          const shifts = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              ...data,
              id: doc.id,
              createdAt: data.createdAt?.toDate?.() 
                ? data.createdAt.toDate().toISOString() 
                : data.createdAt || new Date().toISOString()
            } as Shift;
          });
          
          // Callback mit den aktuellen Schichten aufrufen
          callback(shifts);
        },
        (error) => {
          console.error("Fehler beim Abonnieren der Schichten:", error);
        }
      );
      
      // Funktion zum Abmelden zurückgeben
      return unsubscribe;
    } catch (error) {
      console.error("Fehler beim Erstellen des Schicht-Listeners:", error);
      // Dummy-Funktion zurückgeben, falls etwas schiefgeht
      return () => {};
    }
  }
  
  /**
   * Echtzeit-Listener für Schichttausch-Anfragen eines Benutzers erstellen
   * @param userId ID des Benutzers
   * @param callback Funktion, die bei Änderungen aufgerufen wird
   * @returns Eine Funktion zum Abmelden des Listeners
   */
  static subscribeToSwapRequests(userId: string, callback: (requests: ShiftSwapRequest[]) => void): () => void {
    try {
      const requestsCollection = collection(db, SHIFT_SWAP_REQUESTS_COLLECTION);
      
      // Query für ausgehende Anfragen
      const outgoingQuery = query(
        requestsCollection,
        where("requesterId", "==", userId),
        orderBy("createdAt", "desc")
      );
      
      // Query für eingehende Anfragen
      const incomingQuery = query(
        requestsCollection,
        where("recipientId", "==", userId),
        orderBy("createdAt", "desc")
      );
      
      // Listeners für beide Queries
      const unsubscribeOutgoing = onSnapshot(
        outgoingQuery,
        (outgoingSnapshot) => {
          // Eingehende Anfragen in einem separaten Snapshot abrufen
          const unsubscribeIncoming = onSnapshot(
            incomingQuery,
            (incomingSnapshot) => {
              // Ausgehende Anfragen verarbeiten
              const outgoingRequests = outgoingSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                  ...data,
                  id: doc.id,
                  createdAt: data.createdAt?.toDate?.() 
                    ? data.createdAt.toDate().toISOString() 
                    : data.createdAt || new Date().toISOString(),
                  respondedAt: data.respondedAt?.toDate?.()
                    ? data.respondedAt.toDate().toISOString()
                    : data.respondedAt || undefined
                } as ShiftSwapRequest;
              });
              
              // Eingehende Anfragen verarbeiten
              const incomingRequests = incomingSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                  ...data,
                  id: doc.id,
                  createdAt: data.createdAt?.toDate?.() 
                    ? data.createdAt.toDate().toISOString() 
                    : data.createdAt || new Date().toISOString(),
                  respondedAt: data.respondedAt?.toDate?.()
                    ? data.respondedAt.toDate().toISOString()
                    : data.respondedAt || undefined
                } as ShiftSwapRequest;
              });
              
              // Alle Anfragen kombinieren und nach Datum sortieren
              const allRequests = [...outgoingRequests, ...incomingRequests];
              const sortedRequests = allRequests.sort((a, b) => {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              });
              
              // Callback mit den aktuellen Anfragen aufrufen
              callback(sortedRequests);
            },
            (error) => {
              console.error("Fehler beim Abonnieren der eingehenden Anfragen:", error);
            }
          );
          
          // Ursprünglichen Listener aufräumen, wenn der äußere Listener abgemeldet wird
          unsubscribeCallbacks.push(unsubscribeIncoming);
        },
        (error) => {
          console.error("Fehler beim Abonnieren der ausgehenden Anfragen:", error);
        }
      );
      
      // Alle Unsubscribe-Funktionen in einem Array speichern
      const unsubscribeCallbacks: (() => void)[] = [unsubscribeOutgoing];
      
      // Funktion zum Abmelden aller Listener zurückgeben
      return () => {
        unsubscribeCallbacks.forEach(unsub => unsub());
      };
    } catch (error) {
      console.error("Fehler beim Erstellen des Anfragen-Listeners:", error);
      return () => {};
    }
  }

  /**
   * Echtzeit-Listener für Abwesenheiten eines Teams erstellen
   * @param callback Funktion, die bei Änderungen aufgerufen wird
   * @returns Eine Funktion zum Abmelden des Listeners
   */
  static subscribeToTeamAbsences(callback: (absences: Absence[]) => void): () => void {
    try {
      const absencesCollection = collection(db, 'absences');
      
      // Firestore onSnapshot-Listener erstellen
      const unsubscribe = onSnapshot(
        absencesCollection,
        (querySnapshot) => {
          // Abwesenheiten aus den Dokumenten extrahieren
          const absences = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              ...data,
              id: doc.id,
              startDate: data.startDate || '',
              endDate: data.endDate || '',
              type: data.type || '',
              status: data.status || '',
              userId: data.userId || '',
              userName: data.userName || '',
              createdAt: data.createdAt?.toDate?.() 
                ? data.createdAt.toDate().toISOString() 
                : data.createdAt || new Date().toISOString()
            } as Absence;
          });
          
          // Callback mit den aktuellen Abwesenheiten aufrufen
          callback(absences);
        },
        (error) => {
          console.error("Fehler beim Abonnieren der Abwesenheiten:", error);
        }
      );
      
      // Funktion zum Abmelden zurückgeben
      return unsubscribe;
    } catch (error) {
      console.error("Fehler beim Erstellen des Abwesenheiten-Listeners:", error);
      return () => {}; // Dummy-Funktion zurückgeben
    }
  }

  /**
   * Benachrichtigung für Schichtzuweisungen erstellen
   */
  static async createShiftAssignmentNotification(
    shift: Shift, 
    userId: string, 
    userName: string
  ): Promise<void> {
    try {
      // Benachrichtigung in Firestore speichern
      await addDoc(collection(db, "notifications"), {
        userId: userId,
        title: "Neue Schichtzuweisung",
        message: `Sie wurden der Schicht "${shift.title}" am ${shift.date} (${shift.startTime} - ${shift.endTime}) zugewiesen.`,
        type: "shift_assignment",
        read: false,
        createdAt: serverTimestamp(),
        link: `/shifts?date=${shift.date}`
      });
    } catch (error) {
      console.error("Fehler beim Erstellen der Schichtzuweisungs-Benachrichtigung:", error);
    }
  }

  /**
   * Benachrichtigung für Schichtänderungen erstellen
   */
  static async createShiftUpdateNotification(
    shift: Shift,
    oldShift: Shift | null,
    userId: string
  ): Promise<void> {
    try {
      // Bei neuen Zuteilungen einen anderen Text verwenden
      const isNewAssignment = !oldShift?.assignedUsers.some(u => u.userId === userId);
      
      let title = "";
      let message = "";
      let type = "shift_update";
      
      if (isNewAssignment) {
        title = "Neue Schichtzuweisung";
        message = `Sie wurden der Schicht "${shift.title}" am ${shift.date} (${shift.startTime} - ${shift.endTime}) zugewiesen.`;
        type = "shift_assignment";
      } else if (
        oldShift && 
        (oldShift.startTime !== shift.startTime || 
          oldShift.endTime !== shift.endTime || 
          oldShift.date !== shift.date || 
          oldShift.title !== shift.title)
      ) {
        title = "Schicht aktualisiert";
        message = `Die Schicht "${shift.title}" am ${shift.date} (${shift.startTime} - ${shift.endTime}) wurde aktualisiert.`;
      } else {
        title = "Schichtinformation";
        message = `Es gibt Neuigkeiten zur Schicht "${shift.title}" am ${shift.date} (${shift.startTime} - ${shift.endTime}).`;
      }
      
      // Benachrichtigung in Firestore speichern
      await addDoc(collection(db, "notifications"), {
        userId: userId,
        title: title,
        message: message,
        type: type,
        read: false,
        createdAt: serverTimestamp(),
        link: `/shifts?date=${shift.date}`
      });
      
      // Zusätzlich Browser-Benachrichtigung senden, falls verfügbar
      sendNotification(title, {
        body: message,
        icon: "/icon-192x192.png",
        type: isNewAssignment ? "info" : "warning"
      });
      
    } catch (error) {
      console.error("Fehler beim Erstellen der Schichtänderungs-Benachrichtigung:", error);
    }
  }

  /**
   * Schicht speichern und alle zugewiesenen Benutzer benachrichtigen
   */
  static async saveShiftWithNotifications(shift: Shift, oldShift?: Shift): Promise<string> {
    // Zuerst die Schicht speichern
    const shiftId = await this.saveShift(shift);
    
    // Dann Benachrichtigungen für alle zugewiesenen Benutzer erstellen
    if (shift.assignedUsers && shift.assignedUsers.length > 0) {
      for (const assignedUser of shift.assignedUsers) {
        // Finde den Benutzer im alten Schichtobjekt, falls vorhanden
        const oldAssignment = oldShift?.assignedUsers?.find(u => u.userId === assignedUser.userId);
        
        // Nur benachrichtigen, wenn sich etwas geändert hat oder es eine neue Zuweisung ist
        if (!oldAssignment || 
            oldAssignment.status !== assignedUser.status ||
            !oldShift ||
            oldShift.startTime !== shift.startTime ||
            oldShift.endTime !== shift.endTime ||
            oldShift.date !== shift.date ||
            oldShift.title !== shift.title) {
          
          await this.createShiftUpdateNotification(
            shift,
            oldShift || null,
            assignedUser.userId
          );
        }
      }
    }
    
    return shiftId;
  }

  /**
   * Schicht-Vorlage löschen
   */
  static async deleteShiftTemplate(templateId: string): Promise<void> {
    try {
      const templateRef = doc(db, SHIFT_TEMPLATES_COLLECTION, templateId);
      await deleteDoc(templateRef);
    } catch (error) {
      console.error("Fehler beim Löschen der Schicht-Vorlage:", error);
      throw error;
    }
  }
} 