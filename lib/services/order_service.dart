import 'package:cloud_firestore/cloud_firestore.dart' as fb;
import 'package:firebase_auth/firebase_auth.dart';
import '../models/order_model.dart';
import 'customer_service.dart';
import 'project_service.dart';

class OrderService {
  final fb.FirebaseFirestore _firestore = fb.FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final CustomerService _customerService = CustomerService();
  final ProjectService _projectService = ProjectService();
  
  // Referenz auf die Aufträge-Collection
  fb.CollectionReference get _ordersCollection => _firestore.collection('orders');
  
  // Aktuelle Benutzer-ID abrufen
  String get _currentUserId => _auth.currentUser?.uid ?? '';
  
  // Aktuellen Benutzernamen abrufen
  String get _currentUserName => _auth.currentUser?.displayName ?? 'Unbekannter Benutzer';
  
  // Alle Aufträge abrufen mit verbesserter Fehlerbehandlung
  Stream<List<Order>> getOrders() {
    print("⏳ Starte Abfrage aller Aufträge...");
    print("🔍 Verwende Collection: 'orders'");
    
    try {
      // DirectDebug: Sammlung der Firebase-Collection anzeigen
      fb.FirebaseFirestore.instance.collection('orders').get().then((snapshot) {
        print("📊 DIREKTE Diagnose: 'orders' Collection enthält ${snapshot.docs.length} Dokumente");
        if (snapshot.docs.isEmpty) {
          print("⚠️ WARNUNG: 'orders' Collection ist leer! Überprüfe die Firebase-Datenbank.");
        } else {
          print("📄 Beispieldokument IDs: ${snapshot.docs.take(3).map((d) => d.id).join(', ')}");
          
          // Muster der ersten 3 Dokumente anzeigen
          for (var doc in snapshot.docs.take(3)) {
            final data = doc.data();
            print("📄 Dokument ${doc.id} enthält folgende Felder: ${data.keys.join(', ')}");
            
            // Wichtigste Felder überprüfen
            print("  - status: ${data['status']}, Typ: ${data['status']?.runtimeType}");
            print("  - client: ${data['client']}, Typ: ${data['client']?.runtimeType}");
            print("  - clientName: ${data['clientName']}, Typ: ${data['clientName']?.runtimeType}");
            print("  - customerId: ${data['customerId']}, Typ: ${data['customerId']?.runtimeType}");
            print("  - clientId: ${data['clientId']}, Typ: ${data['clientId']?.runtimeType}");
          }
        }
      }).catchError((error) {
        print("❌ FEHLER bei direktem Zugriff auf 'orders': $error");
      });
      
      // Wandle das Ergebnis in einen Stream um, der nicht sofort einen Fehler auslöst
      return fb.FirebaseFirestore.instance.collection('orders')
          .snapshots()
          .asyncMap((snapshot) async {
            try {
              print("📦 Snapshot erhalten mit ${snapshot.docs.length} Dokumenten");
              
              if (snapshot.docs.isEmpty) {
                print("⚠️ Keine Aufträge in der Datenbank gefunden");
                return <Order>[];
              }
              
              List<Order> orders = [];
              int errorCount = 0;
              
              for (var doc in snapshot.docs) {
                try {
                  // Überprüfe, ob das Dokument tatsächlich Daten enthält
                  if (!doc.exists) {
                    print("⚠️ Dokument ${doc.id} existiert nicht");
                    continue;
                  }

                  // Daten des Dokuments ausgeben
                  final rawData = doc.data() as Map<String, dynamic>?;
                  if (rawData == null) {
                    print("⚠️ Keine Daten für Dokument ${doc.id}");
                    continue;
                  }
                  
                  final orderId = doc.id;
                  
                  print("🔍 VERSUCHE KONVERTIERUNG für Dokument $orderId");
                  
                  // Alle verfügbaren Schlüssel ausgeben für bessere Diagnose
                  print("📑 Verfügbare Felder in Dokument $orderId: ${rawData.keys.join(', ')}");
                  
                  // Besonders wichtige Felder prüfen
                  print("📄 Auftrag $orderId - Kunden-/Projektdaten aus Rohquelle:");
                  print("  - client (Web): ${rawData['client']}");
                  print("  - customerId (Web): ${rawData['customerId']}");
                  print("  - clientId (App): ${rawData['clientId']}");
                  print("  - clientName (App): ${rawData['clientName']}");
                  print("  - project (Web): ${rawData['project']}");
                  print("  - projectId: ${rawData['projectId']}");
                  print("  - projectName: ${rawData['projectName']}");
                  print("  - status: ${rawData['status']}");
                  
                  try {
                    // Erstelle den Auftrag aus den Firestore-Daten
                    Order order = Order.fromFirestore(doc as fb.DocumentSnapshot);
                    
                    // Prüfen, ob Kunden- oder Projektdaten fehlen und ggf. nachladen
                    order = await _enrichOrderData(order);
                    
                    // Log Kunden- und Projektinformationen nach der Konvertierung
                    print("✅ Auftrag konvertiert: ID=${order.id}, Status=${order.status}");
                    print("  - Kunde: ID=${order.clientId}, Name=${order.clientName}");
                    print("  - Projekt: ID=${order.projectId}, Name=${order.projectName}");
                    
                    orders.add(order);
                  } catch (conversionError) {
                    print("❌ Fehler bei der Konvertierung für Dokument $orderId: $conversionError");
                    
                    // Versuche manuelle Konvertierung für dieses Dokument
                    print("🔄 Versuche manuelle Konvertierung als Fallback");
                    
                    try {
                      // Minimal notwendige Felder extrahieren
                      final String title = rawData['title'] as String? ?? "Unbenannter Auftrag";
                      final String description = rawData['description'] as String? ?? "";
                      final String clientName = rawData['clientName'] as String? ?? 
                                               rawData['client'] as String? ?? "Unbekannter Kunde";
                      final String clientId = rawData['clientId'] as String? ?? 
                                             rawData['customerId'] as String? ?? "";
                      
                      // Einfachen Auftrag erstellen
                      final Order fallbackOrder = Order(
                        id: orderId,
                        title: title,
                        description: description,
                        clientId: clientId,
                        clientName: clientName,
                        status: OrderStatus.draft, // Standardwert
                        createdAt: DateTime.now(),
                        createdBy: "",
                        createdByName: "",
                        priority: OrderPriority.medium,
                        type: OrderType.other,
                        estimatedHours: 0,
                        actualHours: 0,
                        paymentStatus: PaymentStatus.unpaid,
                        tasks: [],
                        attachments: [],
                        comments: [],
                        approvalSteps: [],
                        timeEntries: [],
                        tags: [],
                      );
                      
                      print("✅ Manuelle Konvertierung erfolgreich für Dokument $orderId");
                      orders.add(fallbackOrder);
                    } catch (fallbackError) {
                      print("❌ Auch manuelle Konvertierung fehlgeschlagen: $fallbackError");
                      errorCount++;
                    }
                  }
                } catch (docError, stackTrace) {
                  errorCount++;
                  print("❌ Fehler beim Parsen des Auftrags: $docError für Dokument ${doc.id}");
                  print("Stacktrace: $stackTrace");
                }
              }
              
              if (errorCount > 0) {
                print("⚠️ $errorCount Aufträge konnten nicht geladen werden");
              }
              
              print("✅ Erfolgreich ${orders.length} Aufträge geladen");
              return orders;
            } catch (e, stackTrace) {
              print("❌ Fehler beim Laden der Aufträge: $e");
              print("Stacktrace: $stackTrace");
              return <Order>[];
            }
          })
          .handleError((error, stackTrace) {
            print("❌ Stream-Fehler beim Laden der Aufträge: $error");
            print("Stacktrace: $stackTrace");
            // Bei einem Stream-Fehler leere Liste zurückgeben
            return <Order>[];
          });
    } catch (e, stackTrace) {
      print("❌ Unerwarteter Fehler beim Aufsetzen des Streams: $e");
      print("Stacktrace: $stackTrace");
      // Bei einem unerwarteten Fehler einen Stream mit leerer Liste zurückgeben
      return Stream.value(<Order>[]);
    }
  }
  
  // Aufträge mit Filter abrufen - verbesserte Fehlerbehandlung
  Stream<List<Order>> getFilteredOrders({OrderStatus? status}) {
    try {
      fb.Query query = _ordersCollection;
      
      if (status != null) {
        // Konvertiere den Enum-Wert in einen String für Debugging-Zwecke
        final statusString = status.toString().split('.').last;
        print("🔍 Suche nach Aufträgen mit Status: $statusString (${status.toString()})");
        
        // Bei Status-Suche verwenden wir lokale Filterung statt Firestore-Filter
        // Dadurch vermeiden wir Probleme mit unterschiedlichen Status-String-Formaten
        print("ℹ️ Verwende lokale Filterung für Status-Vergleich");
      }
      
      print("⏳ Lade alle Aufträge und filtere dann lokal...");
      
      // Wir holen alle Aufträge und filtern dann clientseitig
      return _ordersCollection
          .snapshots()
          .asyncMap((snapshot) async {
            try {
              print("📦 Snapshot erhalten mit ${snapshot.docs.length} Dokumenten");
              
              if (snapshot.docs.isEmpty) {
                print("⚠️ Keine Aufträge in der Datenbank gefunden");
                return <Order>[];
              }
              
              // Debug: Zeige alle vorhandenen Status-Werte
              print("📊 Status-Werte in der Datenbank:");
              for (var doc in snapshot.docs) {
                final data = doc.data() as Map<String, dynamic>?;
                if (data != null) {
                  print("  - Dokument ${doc.id}: Status='${data['status']}' (${data['status']?.runtimeType})");
                }
              }
              
              List<Order> orders = [];
              int errorCount = 0;
              
              for (var doc in snapshot.docs) {
                try {
                  // Überprüfe, ob das Dokument tatsächlich Daten enthält
                  if (!doc.exists) {
                    print("⚠️ Dokument ${doc.id} existiert nicht");
                    continue;
                  }

                  // Erstelle den Auftrag aus den Firestore-Daten
                  Order order = Order.fromFirestore(doc as fb.DocumentSnapshot);
                  
                  // Prüfen, ob Kunden- oder Projektdaten fehlen und ggf. nachladen
                  order = await _enrichOrderData(order);
                  
                  // Füge den Auftrag zur ungefilteren Liste hinzu
                  orders.add(order);
                  print("✅ Auftrag geladen: ID=${order.id}, Status=${order.status} (${order.status.toString()})");
                } catch (e, stackTrace) {
                  errorCount++;
                  print("❌ Fehler beim Parsen eines Auftrags: $e für Dokument ${doc.id}");
                  print("Stacktrace: $stackTrace");
                }
              }
              
              if (errorCount > 0) {
                print("⚠️ $errorCount Aufträge konnten nicht geladen werden");
              }
              
              // Lokale Filterung nach Status, wenn ein Filter angegeben wurde
              if (status != null) {
                final unfiltered = orders.length;
                print("🔍 Führe lokale Filterung für Status ${status.toString()} durch (${orders.length} Aufträge vor dem Filtern)");
                
                orders = orders.where((order) {
                  final orderStatus = order.status;
                  
                  // Führe Status-Vergleich durch
                  final bool matches = orderStatus == status;
                  
                  // Debug-Ausgabe
                  print("  - Prüfe Auftrag ${order.id}: ${orderStatus.toString()} == ${status.toString()}? $matches");
                  
                  return matches;
                }).toList();
                
                final filtered = orders.length;
                print("🔍 Filterung abgeschlossen: $filtered von $unfiltered Aufträgen haben den Status ${status.toString()}");
              }
              
              // Debug-Ausgabe
              print("✅ Ergebnis: ${orders.length} Aufträge gefunden, Status-Filter: ${status?.toString() ?? 'Alle'}");
              
              if (orders.isEmpty && status != null) {
                print("⚠️ ACHTUNG: Keine Aufträge mit Status ${status.toString()} gefunden!");
              }
              
              // Lokale Sortierung statt Firestore-Sortierung
              orders.sort((a, b) => (b.createdAt ?? DateTime.now()).compareTo(a.createdAt ?? DateTime.now()));
              
              return orders;
            } catch (e, stackTrace) {
              print("❌ Fehler beim Filtern der Aufträge: $e");
              print("Stacktrace: $stackTrace");
              return <Order>[];
            }
          })
          .handleError((error, stackTrace) {
            print("❌ Stream-Fehler beim Laden der gefilterten Aufträge: $error");
            print("Stacktrace: $stackTrace");
            // Bei einem Stream-Fehler leere Liste zurückgeben
            return <Order>[];
          });
    } catch (e, stackTrace) {
      print("❌ Unerwarteter Fehler beim Aufsetzen des Filter-Streams: $e");
      print("Stacktrace: $stackTrace");
      // Bei einem unerwarteten Fehler einen Stream mit leerer Liste zurückgeben
      return Stream.value(<Order>[]);
    }
  }
  
  // Einzelnen Auftrag abrufen
  Future<Order?> getOrder(String orderId) async {
    // Ausführlichere Debug-Ausgabe
    print("⏳ Lade Auftrag mit ID: $orderId");
    
    final docSnapshot = await _ordersCollection.doc(orderId).get();
    if (!docSnapshot.exists) {
      print("❌ Auftrag mit ID $orderId nicht gefunden");
      return null;
    }
    
    // Daten des Dokuments ausgeben
    final rawData = docSnapshot.data() as Map<String, dynamic>?;
    print("📄 Rohdaten aus Firestore: ${rawData?.keys.toList()}");
    
    // Besonders wichtige Felder prüfen
    print("👥 Kundendaten: clientId=${rawData?['clientId']}, clientName=${rawData?['clientName']}");
    print("📁 Projektdaten: projectId=${rawData?['projectId']}, projectName=${rawData?['projectName']}");
    
    Order order = Order.fromFirestore(docSnapshot);
    print("✅ Auftrag aus Firestore geladen: id=${order.id}, title=${order.title}");
    print("👥 Kundendaten nach Konvertierung: clientId=${order.clientId}, clientName=${order.clientName}");
    print("📁 Projektdaten nach Konvertierung: projectId=${order.projectId}, projectName=${order.projectName}");
    
    // Prüfen, ob Kunden- oder Projektdaten fehlen und ggf. nachladen
    order = await _enrichOrderData(order);
    
    // Zeiteinträge für diesen Auftrag laden
    final timeEntries = await getTimeEntriesForOrder(orderId);
    
    // Auftrag mit Zeiteinträgen zurückgeben
    return order.copyWith(timeEntries: timeEntries);
  }
  
  // Fügt fehlende Kunden- oder Projektdaten hinzu
  Future<Order> _enrichOrderData(Order order) async {
    Order enrichedOrder = order;
    bool orderChanged = false;
    
    // Ausgabe der aktuellen Daten
    print("📋 Versuche Daten anzureichern für Auftrag ${order.id}");
    print("   - Kunde: ID=${order.clientId}, Name='${order.clientName}'");
    print("   - Projekt: ID=${order.projectId}, Name='${order.projectName}'");
    
    // Prüfen, ob Kundenname fehlt, aber KundenID vorhanden ist
    if (order.clientName.isEmpty && order.clientId.isNotEmpty) {
      print("🔍 Kunde fehlt für Auftrag ${order.id} - Versuche nachzuladen mit ID: ${order.clientId}");
      final customer = await _customerService.getCustomerById(order.clientId);
      if (customer != null) {
        print("✅ Kunde gefunden: ${customer.name}");
        enrichedOrder = enrichedOrder.copyWith(
          clientName: customer.name,
          clientContactPerson: customer.contactPerson ?? enrichedOrder.clientContactPerson,
          clientContactEmail: customer.email ?? enrichedOrder.clientContactEmail,
          clientContactPhone: customer.phone ?? enrichedOrder.clientContactPhone,
        );
        orderChanged = true;
      } else {
        print("⚠️ Kunde mit ID ${order.clientId} nicht gefunden");
      }
    }
    
    // Prüfen, ob Projektname fehlt, aber ProjektID vorhanden ist
    if ((enrichedOrder.projectName == null || enrichedOrder.projectName!.isEmpty) && 
        enrichedOrder.projectId != null && 
        enrichedOrder.projectId!.isNotEmpty) {
      print("🔍 Projekt fehlt für Auftrag ${order.id} - Versuche nachzuladen mit ID: ${enrichedOrder.projectId}");
      final project = await _projectService.getProjectById(enrichedOrder.projectId!);
      if (project != null) {
        print("✅ Projekt gefunden: ${project.name}");
        enrichedOrder = enrichedOrder.copyWith(
          projectName: project.name,
          projectLocation: project.location ?? enrichedOrder.projectLocation,
          projectLatitude: project.latitude ?? enrichedOrder.projectLatitude,
          projectLongitude: project.longitude ?? enrichedOrder.projectLongitude,
        );
        orderChanged = true;
        
        // Wenn der Kunde noch fehlt, aber das Projekt einen Kunden hat
        if (enrichedOrder.clientName.isEmpty && project.customerName != null && project.customerName!.isNotEmpty) {
          enrichedOrder = enrichedOrder.copyWith(
            clientName: project.customerName,
            clientId: project.customerId ?? enrichedOrder.clientId,
          );
          print("✅ Kunde über Projekt gefunden: ${project.customerName}");
        }
      } else {
        print("⚠️ Projekt mit ID ${enrichedOrder.projectId} nicht gefunden");
      }
    }
    
    // Zusätzliche Prüfung für Web-App-Kompatibilität:
    // Manchmal werden in der Web-App die Felder 'client' und 'project' verwendet statt 'clientName' und 'projectName'
    try {
      if (order.id != null && (orderChanged || (enrichedOrder.clientName.isEmpty || enrichedOrder.projectName == null || enrichedOrder.projectName!.isEmpty))) {
        print("🔍 Prüfe auf Web-App-Felder im Firestore-Dokument");
        
        final docSnapshot = await _ordersCollection.doc(order.id).get();
        if (docSnapshot.exists) {
          final data = docSnapshot.data() as Map<String, dynamic>?;
          
          if (data != null) {
            bool webDataUsed = false;
            
            // Prüfe ob 'client' und 'customerId' existieren statt 'clientName' und 'clientId'
            if (enrichedOrder.clientName.isEmpty && data['client'] != null && data['client'] is String) {
              enrichedOrder = enrichedOrder.copyWith(clientName: data['client']);
              print("✅ Web-Feld 'client' für Kundennamen verwendet: ${data['client']}");
              webDataUsed = true;
            }
            
            if (enrichedOrder.clientId.isEmpty && data['customerId'] != null && data['customerId'] is String) {
              enrichedOrder = enrichedOrder.copyWith(clientId: data['customerId']);
              print("✅ Web-Feld 'customerId' für Kunden-ID verwendet: ${data['customerId']}");
              webDataUsed = true;
            }
            
            // Prüfe ob 'project' existiert statt 'projectName' 
            if ((enrichedOrder.projectName == null || enrichedOrder.projectName!.isEmpty) && 
                data['project'] != null && data['project'] is String) {
              enrichedOrder = enrichedOrder.copyWith(projectName: data['project']);
              print("✅ Web-Feld 'project' für Projektnamen verwendet: ${data['project']}");
              webDataUsed = true;
            }
            
            orderChanged = orderChanged || webDataUsed;
          }
        }
      }
    } catch (e) {
      print("⚠️ Fehler beim Prüfen auf Web-App-Felder: $e");
    }
    
    // Wenn Daten ergänzt wurden, speichern wir sie in Firestore für zukünftige Anfragen
    if (orderChanged && order.id != null) {
      print("💾 Aktualisiere Auftrag ${order.id} mit ergänzten Daten");
      final updateData = <String, dynamic>{};
      
      if (enrichedOrder.clientName.isNotEmpty) {
        updateData['clientName'] = enrichedOrder.clientName;
      }
      
      if (enrichedOrder.projectName != null && enrichedOrder.projectName!.isNotEmpty) {
        updateData['projectName'] = enrichedOrder.projectName;
      }
      
      if (enrichedOrder.clientContactPerson != null && enrichedOrder.clientContactPerson!.isNotEmpty) {
        updateData['clientContactPerson'] = enrichedOrder.clientContactPerson;
      }
      
      if (enrichedOrder.clientContactEmail != null && enrichedOrder.clientContactEmail!.isNotEmpty) {
        updateData['clientContactEmail'] = enrichedOrder.clientContactEmail;
      }
      
      if (enrichedOrder.clientContactPhone != null && enrichedOrder.clientContactPhone!.isNotEmpty) {
        updateData['clientContactPhone'] = enrichedOrder.clientContactPhone;
      }
      
      if (enrichedOrder.projectLocation != null && enrichedOrder.projectLocation!.isNotEmpty) {
        updateData['projectLocation'] = enrichedOrder.projectLocation;
      }
      
      if (enrichedOrder.projectLatitude != null) {
        updateData['projectLatitude'] = enrichedOrder.projectLatitude;
      }
      
      if (enrichedOrder.projectLongitude != null) {
        updateData['projectLongitude'] = enrichedOrder.projectLongitude;
      }
      
      if (updateData.isNotEmpty) {
        try {
          await _ordersCollection.doc(order.id).update(updateData);
          print("✅ Auftrag ${order.id} erfolgreich aktualisiert mit Feldern: ${updateData.keys.join(', ')}");
        } catch (e) {
          print("⚠️ Fehler beim Aktualisieren des Auftrags: $e");
        }
      }
    }
    
    print("📋 Fertig mit der Anreicherung: Kunde=${enrichedOrder.clientName}, Projekt=${enrichedOrder.projectName}");
    return enrichedOrder;
  }
  
  // Auftrag erstellen
  Future<String> createOrder(Order order) async {
    final docRef = await _ordersCollection.add(order.toFirestore());
    return docRef.id;
  }
  
  // Auftrag aktualisieren
  Future<void> updateOrder(Order order) async {
    if (order.id == null) throw Exception('Auftrag hat keine ID');
    
    await _ordersCollection.doc(order.id).update(order.toFirestore());
  }
  
  // Auftrag löschen
  Future<void> deleteOrder(String orderId) async {
    await _ordersCollection.doc(orderId).delete();
  }
  
  // Zeiterfassung für einen Auftrag abrufen
  Future<List<TimeEntry>> getTimeEntriesForOrder(String orderId) async {
    try {
      print("Lade Zeiteinträge für Auftrag: $orderId");
      
      // Entferne die orderBy-Klausel aus der Firestore-Abfrage, um keinen zusammengesetzten Index zu benötigen
      final snapshot = await _firestore
          .collection('timeEntries')
          .where('orderId', isEqualTo: orderId)
          .get();
      
      print("Erhaltene Zeiteinträge: ${snapshot.docs.length}");
      
      // Konvertiere die Dokumente in TimeEntry-Objekte
      final timeEntries = snapshot.docs.map((doc) {
        try {
          return TimeEntry.fromFirestore(doc as fb.DocumentSnapshot);
        } catch (e) {
          print("Fehler beim Konvertieren des Zeiteintrags ${doc.id}: $e");
          return null;
        }
      })
      .where((entry) => entry != null)
      .cast<TimeEntry>()
      .toList();
      
      // Sortiere die Zeiteinträge nach Datum (absteigend) im Client statt in Firestore
      timeEntries.sort((a, b) => b.date.compareTo(a.date));
      
      print("Erfolgreich konvertierte Zeiteinträge: ${timeEntries.length}");
      return timeEntries;
    } catch (e, stackTrace) {
      print("Fehler beim Laden der Zeiteinträge für Auftrag $orderId: $e");
      print("Stacktrace: $stackTrace");
      // Bei einem Fehler leere Liste zurückgeben statt Exception zu werfen
      return [];
    }
  }
  
  // Zeiterfassung hinzufügen
  Future<String> addTimeEntry(String orderId, TimeEntry timeEntry) async {
    final data = timeEntry.toFirestore();
    data['orderId'] = orderId;
    
    final docRef = await _firestore.collection('timeEntries').add(data);
    
    // Gesamtstunden im Auftrag aktualisieren
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (orderDoc.exists) {
      final order = Order.fromFirestore(orderDoc);
      final newActualHours = order.actualHours + timeEntry.hours;
      
      await _ordersCollection.doc(orderId).update({
        'actualHours': newActualHours,
        'updatedAt': fb.FieldValue.serverTimestamp(),
        'updatedBy': _currentUserId,
        'updatedByName': _currentUserName,
      });
    }
    
    return docRef.id;
  }
  
  // Zeiterfassung aktualisieren
  Future<void> updateTimeEntry(String orderId, TimeEntry timeEntry) async {
    if (timeEntry.id == null) throw Exception('Zeiteintrag hat keine ID');
    
    final oldEntryDoc = await _firestore.collection('timeEntries').doc(timeEntry.id).get();
    if (!oldEntryDoc.exists) throw Exception('Zeiteintrag nicht gefunden');
    
    final oldEntry = TimeEntry.fromFirestore(oldEntryDoc as fb.DocumentSnapshot);
    final hoursDifference = timeEntry.hours - oldEntry.hours;
    
    // Zeiteintrag aktualisieren
    await _firestore.collection('timeEntries').doc(timeEntry.id).update(timeEntry.toFirestore());
    
    // Gesamtstunden im Auftrag aktualisieren, wenn sich die Stunden geändert haben
    if (hoursDifference != 0) {
      final orderDoc = await _ordersCollection.doc(orderId).get();
      if (orderDoc.exists) {
        final order = Order.fromFirestore(orderDoc);
        final newActualHours = order.actualHours + hoursDifference;
        
        await _ordersCollection.doc(orderId).update({
          'actualHours': newActualHours,
          'updatedAt': fb.FieldValue.serverTimestamp(),
          'updatedBy': _currentUserId,
          'updatedByName': _currentUserName,
        });
      }
    }
  }
  
  // Zeiterfassung löschen
  Future<void> deleteTimeEntry(String orderId, String timeEntryId) async {
    final entryDoc = await _firestore.collection('timeEntries').doc(timeEntryId).get();
    if (!entryDoc.exists) throw Exception('Zeiteintrag nicht gefunden');
    
    final entry = TimeEntry.fromFirestore(entryDoc as fb.DocumentSnapshot);
    
    // Zeiteintrag löschen
    await _firestore.collection('timeEntries').doc(timeEntryId).delete();
    
    // Gesamtstunden im Auftrag aktualisieren
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (orderDoc.exists) {
      final order = Order.fromFirestore(orderDoc);
      final newActualHours = order.actualHours - entry.hours;
      
      await _ordersCollection.doc(orderId).update({
        'actualHours': newActualHours,
        'updatedAt': fb.FieldValue.serverTimestamp(),
        'updatedBy': _currentUserId,
        'updatedByName': _currentUserName,
      });
    }
  }
  
  // Aufgabe zu einem Auftrag hinzufügen
  Future<void> addTask(String orderId, OrderTask task) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    final tasks = List<OrderTask>.from(order.tasks);
    tasks.add(task);
    
    // Geschätzte Stunden aktualisieren
    final newEstimatedHours = order.estimatedHours + task.estimatedHours;
    
    await _ordersCollection.doc(orderId).update({
      'tasks': tasks.map((t) => t.toFirestore()).toList(),
      'estimatedHours': newEstimatedHours,
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Aufgabe in einem Auftrag aktualisieren
  Future<void> updateTask(String orderId, OrderTask task) async {
    if (task.id == null) throw Exception('Aufgabe hat keine ID');
    
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    final taskIndex = int.tryParse(task.id!);
    
    if (taskIndex == null || taskIndex < 0 || taskIndex >= order.tasks.length) {
      throw Exception('Ungültige Aufgaben-ID');
    }
    
    final tasks = List<OrderTask>.from(order.tasks);
    final oldTask = tasks[taskIndex];
    tasks[taskIndex] = task;
    
    // Geschätzte Stunden aktualisieren, wenn sie sich geändert haben
    final hoursDifference = task.estimatedHours - oldTask.estimatedHours;
    final newEstimatedHours = order.estimatedHours + hoursDifference;
    
    // Bei Statusänderung CompletedAt setzen
    final Map<String, dynamic> updates = {
      'tasks': tasks.map((t) => t.toFirestore()).toList(),
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    };
    
    if (hoursDifference != 0) {
      updates['estimatedHours'] = newEstimatedHours;
    }
    
    await _ordersCollection.doc(orderId).update(updates);
  }
  
  // Aufgabe in einem Auftrag löschen
  Future<void> deleteTask(String orderId, String taskId) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    final taskIndex = int.tryParse(taskId);
    
    if (taskIndex == null || taskIndex < 0 || taskIndex >= order.tasks.length) {
      throw Exception('Ungültige Aufgaben-ID');
    }
    
    final tasks = List<OrderTask>.from(order.tasks);
    final removedTask = tasks.removeAt(taskIndex);
    
    // Geschätzte Stunden aktualisieren
    final newEstimatedHours = order.estimatedHours - removedTask.estimatedHours;
    
    await _ordersCollection.doc(orderId).update({
      'tasks': tasks.map((t) => t.toFirestore()).toList(),
      'estimatedHours': newEstimatedHours,
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Kommentar zu einem Auftrag hinzufügen
  Future<void> addComment(String orderId, OrderComment comment) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    final comments = List<OrderComment>.from(order.comments);
    comments.add(comment);
    
    await _ordersCollection.doc(orderId).update({
      'comments': comments.map((c) => c.toFirestore()).toList(),
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Genehmigungsschritt hinzufügen
  Future<void> addApprovalStep(String orderId, ApprovalStep step) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    final steps = List<ApprovalStep>.from(order.approvalSteps);
    
    // Prüfen, ob die Sequenz bereits existiert
    if (steps.any((s) => s.sequence == step.sequence)) {
      throw Exception('Ein Genehmigungsschritt mit dieser Sequenz existiert bereits');
    }
    
    steps.add(step);
    
    // Nach Sequenz sortieren
    steps.sort((a, b) => a.sequence.compareTo(b.sequence));
    
    await _ordersCollection.doc(orderId).update({
      'approvalSteps': steps.map((s) => s.toFirestore()).toList(),
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Auftrag zur Genehmigung einreichen
  Future<void> submitForApproval(String orderId) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    
    if (order.status != OrderStatus.draft) {
      throw Exception('Nur Aufträge im Entwurfsstatus können zur Genehmigung eingereicht werden');
    }
    
    if (order.approvalSteps.isEmpty) {
      throw Exception('Der Auftrag hat keine Genehmigungsschritte');
    }
    
    await _ordersCollection.doc(orderId).update({
      'status': OrderStatus.pending.toString().split('.').last,
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Auftrag annehmen (für zugewiesene Mitarbeiter)
  Future<void> acceptOrder(String orderId) async {
    final userId = _currentUserId;
    final userName = _currentUserName;
    
    if (userId.isEmpty) throw Exception('Benutzer nicht angemeldet');
    
    try {
      print("Starte Annahme des Auftrags: $orderId durch Benutzer: $userId ($userName)");
      
      // Auftrag aus der Datenbank laden
      final orderDoc = await _ordersCollection.doc(orderId).get();
      if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
      
      // Daten vorsichtig parsen
      final data = orderDoc.data() as Map<String, dynamic>?;
      if (data == null) throw Exception('Fehlerhafte Auftragsdaten');
      
      print("Auftrag geladen: $orderId, Status: ${data['status']}");
      
      // assignedUsers-Array verarbeiten
      List<Map<String, dynamic>> assignedUsers = [];
      
      // Überprüfen, ob das assignedUsers-Array bereits existiert
      if (data.containsKey('assignedUsers') && data['assignedUsers'] is List) {
        assignedUsers = List<Map<String, dynamic>>.from(
          (data['assignedUsers'] as List).map((user) => Map<String, dynamic>.from(user))
        );
        print("Existierende assignedUsers geladen: ${assignedUsers.length}");
      } 
      // Falls nur assignedTo existiert, assignedUsers daraus erstellen
      else if (data.containsKey('assignedTo')) {
        var assignedTo = data['assignedTo'];
        var assignedToName = data['assignedToName'];
        
        if (assignedTo is String) {
          // Einzelner Benutzer im alten Format
          assignedUsers = [{
            'id': assignedTo,
            'name': assignedToName ?? 'Unbekannt',
            'status': 'pending',
            'isTeamLead': true,
            'timeSpent': 0,
          }];
        } else if (assignedTo is List) {
          // Liste von Benutzern im alten Format
          for (int i = 0; i < assignedTo.length; i++) {
            String name = 'Unbekannt';
            if (assignedToName is List && i < assignedToName.length) {
              name = assignedToName[i];
            }
            
            assignedUsers.add({
              'id': assignedTo[i],
              'name': name,
              'status': 'pending',
              'isTeamLead': data['teamLeadId'] == assignedTo[i],
              'timeSpent': 0,
            });
          }
        }
        print("AssignedUsers aus assignedTo erstellt: ${assignedUsers.length}");
      }
      
      // Prüfen, ob der Benutzer bereits akzeptiert hat
      bool isUserAlreadyAccepted = false;
      bool isUserAssigned = false;
      
      // Aktualisiere den Status des Benutzers
      for (int i = 0; i < assignedUsers.length; i++) {
        if (assignedUsers[i]['id'] == userId) {
          isUserAssigned = true;
          
          if (assignedUsers[i]['status'] == 'accepted') {
            isUserAlreadyAccepted = true;
            print("Benutzer $userId hat den Auftrag bereits akzeptiert");
          } else {
            assignedUsers[i]['status'] = 'accepted';
          }
        }
      }
      
      // Wenn Benutzer bereits akzeptiert hat, keine Änderung notwendig
      if (isUserAlreadyAccepted) {
        print("Keine Aktualisierung nötig, Benutzer $userId hat bereits akzeptiert");
        return;
      }
      
      // Wenn Benutzer nicht in assignedUsers ist, aber in assignedTo, hinzufügen
      if (!isUserAssigned) {
        var assignedTo = data['assignedTo'];
        
        bool isInAssignedTo = false;
        if (assignedTo is String) {
          isInAssignedTo = assignedTo == userId;
        } else if (assignedTo is List) {
          isInAssignedTo = assignedTo.contains(userId);
        }
        
        if (isInAssignedTo) {
          print("Benutzer $userId ist im alten Format zugewiesen, füge zum neuen Format hinzu");
          assignedUsers.add({
            'id': userId,
            'name': userName,
            'status': 'accepted',
            'timeSpent': 0,
          });
          isUserAssigned = true;
        }
      }
      
      if (!isUserAssigned) {
        throw Exception("Benutzer $userId ist diesem Auftrag nicht zugewiesen");
      }
      
      // Bestimme den Gesamtstatus des Auftrags
      String overallStatus = 'assigned';
      
      // Wenn mindestens ein Benutzer angenommen hat, ist der Status "accepted"
      if (assignedUsers.any((user) => user['status'] == 'accepted')) {
        overallStatus = 'accepted';
        print("Mindestens ein Benutzer hat akzeptiert, setze Status auf '$overallStatus'");
      }
      
      // Wenn alle Benutzer angenommen haben, ist der Status "in-progress"
      if (assignedUsers.isNotEmpty && assignedUsers.every((user) => user['status'] == 'accepted')) {
        overallStatus = 'in-progress';
        print("Alle Benutzer haben akzeptiert, setze Status auf '$overallStatus'");
      }
      
      // Änderungen vorbereiten
      Map<String, dynamic> updates = {
        'assignedUsers': assignedUsers,
        'status': overallStatus,
        'updatedAt': fb.FieldValue.serverTimestamp(),
        'updatedBy': userId,
        'updatedByName': userName,
      };
      
      print("Aktualisiere Auftrag mit Daten: $updates");
      
      // Status speichern, einfache und sichere Implementierung
      await _ordersCollection.doc(orderId).update(updates);
      
      print("Auftrag $orderId erfolgreich angenommen, neuer Status: $overallStatus");
      
    } catch (e) {
      print("Fehler beim Annehmen des Auftrags: $e");
      throw Exception('Fehler beim Annehmen des Auftrags: $e');
    }
  }
  
  // Auftrag ablehnen
  Future<void> rejectOrder(String orderId, String rejectionReason) async {
    final userId = _currentUserId;
    final userName = _currentUserName;
    
    if (userId.isEmpty) throw Exception('Benutzer nicht angemeldet');
    if (rejectionReason.trim().isEmpty) throw Exception('Bitte geben Sie einen Ablehnungsgrund an');
    
    try {
      print("Starte Ablehnung des Auftrags: $orderId durch Benutzer: $userId ($userName)");
      
      // Auftrag aus der Datenbank laden
      final orderDoc = await _ordersCollection.doc(orderId).get();
      if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
      
      // Daten vorsichtig parsen
      final data = orderDoc.data() as Map<String, dynamic>?;
      if (data == null) throw Exception('Fehlerhafte Auftragsdaten');
      
      print("Auftrag geladen: $orderId, Status: ${data['status']}");
      
      // assignedUsers-Array verarbeiten
      List<Map<String, dynamic>> assignedUsers = [];
      
      // Überprüfen, ob das assignedUsers-Array bereits existiert
      if (data.containsKey('assignedUsers') && data['assignedUsers'] is List) {
        assignedUsers = List<Map<String, dynamic>>.from(
          (data['assignedUsers'] as List).map((user) => Map<String, dynamic>.from(user))
        );
        print("Existierende assignedUsers geladen: ${assignedUsers.length}");
      } 
      // Falls nur assignedTo existiert, assignedUsers daraus erstellen
      else if (data.containsKey('assignedTo')) {
        var assignedTo = data['assignedTo'];
        var assignedToName = data['assignedToName'];
        
        if (assignedTo is String) {
          // Einzelner Benutzer im alten Format
          assignedUsers = [{
            'id': assignedTo,
            'name': assignedToName ?? 'Unbekannt',
            'status': 'pending',
            'isTeamLead': true,
            'timeSpent': 0,
          }];
        } else if (assignedTo is List) {
          // Liste von Benutzern im alten Format
          for (int i = 0; i < assignedTo.length; i++) {
            String name = 'Unbekannt';
            if (assignedToName is List && i < assignedToName.length) {
              name = assignedToName[i];
            }
            
            assignedUsers.add({
              'id': assignedTo[i],
              'name': name,
              'status': 'pending',
              'isTeamLead': data['teamLeadId'] == assignedTo[i],
              'timeSpent': 0,
            });
          }
        }
        print("AssignedUsers aus assignedTo erstellt: ${assignedUsers.length}");
      }
      
      // Aktualisiere den Status des entsprechenden Benutzers
      bool isUserAssigned = false;
      
      for (int i = 0; i < assignedUsers.length; i++) {
        if (assignedUsers[i]['id'] == userId) {
          assignedUsers[i]['status'] = 'rejected';
          assignedUsers[i]['rejectionReason'] = rejectionReason;
          isUserAssigned = true;
        }
      }
      
      // Wenn Benutzer nicht in assignedUsers ist, aber in assignedTo, hinzufügen
      if (!isUserAssigned) {
        var assignedTo = data['assignedTo'];
        
        bool isInAssignedTo = false;
        if (assignedTo is String) {
          isInAssignedTo = assignedTo == userId;
        } else if (assignedTo is List) {
          isInAssignedTo = assignedTo.contains(userId);
        }
        
        if (isInAssignedTo) {
          print("Benutzer $userId ist im alten Format zugewiesen, füge zum neuen Format hinzu");
          assignedUsers.add({
            'id': userId,
            'name': userName,
            'status': 'rejected',
            'rejectionReason': rejectionReason,
            'timeSpent': 0,
          });
          isUserAssigned = true;
        }
      }
      
      if (!isUserAssigned) {
        throw Exception("Benutzer $userId ist diesem Auftrag nicht zugewiesen");
      }
      
      // Bestimme den Gesamtstatus des Auftrags
      String overallStatus = 'assigned';
      
      // Wenn keine Benutzer zugewiesen sind oder alle abgelehnt haben, ist der Status "rejected"
      if (assignedUsers.isEmpty || assignedUsers.every((user) => user['status'] == 'rejected')) {
        overallStatus = 'rejected';
      }
      
      // Wenn mindestens ein Benutzer angenommen hat, ist der Status "accepted"
      if (assignedUsers.any((user) => user['status'] == 'accepted')) {
        overallStatus = 'accepted';
      }
      
      // Wenn alle verbleibenden (nicht ablehnenden) Benutzer angenommen haben, ist der Status "in-progress"
      final nonRejectedUsers = assignedUsers.where((user) => user['status'] != 'rejected').toList();
      if (nonRejectedUsers.isNotEmpty && nonRejectedUsers.every((user) => user['status'] == 'accepted')) {
        overallStatus = 'in-progress';
      }
      
      // Änderungen vorbereiten
      Map<String, dynamic> updates = {
        'assignedUsers': assignedUsers,
        'status': overallStatus,
        'rejectionReason': rejectionReason, // Für Abwärtskompatibilität
        'updatedAt': fb.FieldValue.serverTimestamp(),
        'updatedBy': userId,
        'updatedByName': userName,
      };
      
      print("Aktualisiere Auftrag mit Daten: $updates");
      
      // Status speichern, einfache und sichere Implementierung
      await _ordersCollection.doc(orderId).update(updates);
      
      print("Auftrag $orderId erfolgreich abgelehnt, neuer Status: $overallStatus");
      
    } catch (e) {
      print("Fehler beim Ablehnen des Auftrags: $e");
      throw Exception('Fehler beim Ablehnen des Auftrags: $e');
    }
  }
  
  // Auftrag genehmigen
  Future<void> approveOrder(String orderId, String comments) async {
    final userId = _currentUserId;
    if (userId.isEmpty) throw Exception('Benutzer nicht angemeldet');
    
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    
    if (order.status != OrderStatus.pending) {
      throw Exception('Nur Aufträge im Status "Warten auf Genehmigung" können genehmigt werden');
    }
    
    if (!order.canUserApprove(userId)) {
      throw Exception('Sie sind nicht berechtigt, diesen Auftrag zu genehmigen');
    }
    
    // Den aktuellen Genehmigungsschritt finden und aktualisieren
    final steps = List<ApprovalStep>.from(order.approvalSteps);
    final pendingSteps = steps.where((step) => step.isPending).toList();
    pendingSteps.sort((a, b) => a.sequence.compareTo(b.sequence));
    
    final currentStep = pendingSteps.first;
    final stepIndex = steps.indexWhere((step) => 
      step.userId == currentStep.userId && step.sequence == currentStep.sequence
    );
    
    if (stepIndex == -1) throw Exception('Genehmigungsschritt nicht gefunden');
    
    steps[stepIndex] = currentStep.copyWith(
      approvedAt: DateTime.now(),
      comments: comments,
    );
    
    // Prüfen, ob alle erforderlichen Schritte genehmigt wurden
    final allApproved = steps
      .where((step) => step.required)
      .every((step) => step.isApproved);
    
    // Status aktualisieren, wenn alle Schritte genehmigt wurden
    final newStatus = allApproved 
      ? OrderStatus.approved.toString().split('.').last 
      : OrderStatus.pending.toString().split('.').last;
    
    await _ordersCollection.doc(orderId).update({
      'approvalSteps': steps.map((s) => s.toFirestore()).toList(),
      'status': newStatus,
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Auftrag in Bearbeitung setzen
  Future<void> startOrder(String orderId) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    
    if (order.status != OrderStatus.approved) {
      throw Exception('Nur genehmigte Aufträge können in Bearbeitung gesetzt werden');
    }
    
    await _ordersCollection.doc(orderId).update({
      'status': OrderStatus.inProgress.toString().split('.').last,
      'startDate': fb.FieldValue.serverTimestamp(),
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Auftrag abschließen
  Future<void> completeOrder(String orderId, String completionNotes) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    
    if (order.status != OrderStatus.inProgress) {
      throw Exception('Nur Aufträge in Bearbeitung können abgeschlossen werden');
    }
    
    // Optional: Prüfen, ob alle Aufgaben abgeschlossen sind
    // if (!order.tasks.every((task) => task.completed)) {
    //   throw Exception('Es gibt noch unerledigte Aufgaben in diesem Auftrag');
    // }
    
    // Abschlusskommentar hinzufügen
    final comments = List<OrderComment>.from(order.comments);
    comments.add(OrderComment(
      userId: _currentUserId,
      userName: _currentUserName,
      content: completionNotes,
      createdAt: DateTime.now(),
      attachments: [],
      isInternal: true,
    ));
    
    await _ordersCollection.doc(orderId).update({
      'status': OrderStatus.completed.toString().split('.').last,
      'completedAt': fb.FieldValue.serverTimestamp(),
      'completedBy': _currentUserId,
      'completedByName': _currentUserName,
      'comments': comments.map((c) => c.toFirestore()).toList(),
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Auftrag stornieren
  Future<void> cancelOrder(String orderId, String cancellationReason) async {
    final orderDoc = await _ordersCollection.doc(orderId).get();
    if (!orderDoc.exists) throw Exception('Auftrag nicht gefunden');
    
    final order = Order.fromFirestore(orderDoc);
    
    if (order.status == OrderStatus.completed) {
      throw Exception('Abgeschlossene Aufträge können nicht storniert werden');
    }
    
    // Stornierungskommentar hinzufügen
    final comments = List<OrderComment>.from(order.comments);
    comments.add(OrderComment(
      userId: _currentUserId,
      userName: _currentUserName,
      content: cancellationReason,
      createdAt: DateTime.now(),
      attachments: [],
      isInternal: true,
    ));
    
    await _ordersCollection.doc(orderId).update({
      'status': OrderStatus.cancelled.toString().split('.').last,
      'comments': comments.map((c) => c.toFirestore()).toList(),
      'updatedAt': fb.FieldValue.serverTimestamp(),
      'updatedBy': _currentUserId,
      'updatedByName': _currentUserName,
    });
  }
  
  // Leeren Auftrag mit Standardwerten erstellen
  Order createEmptyOrder() {
    return Order(
      title: '',
      description: '',
      clientId: '',
      clientName: '',
      status: OrderStatus.draft,
      createdAt: DateTime.now(),
      createdBy: _currentUserId,
      createdByName: _currentUserName,
      priority: OrderPriority.medium,
      type: OrderType.other,
      estimatedHours: 0,
      actualHours: 0,
      paymentStatus: PaymentStatus.unpaid,
      tasks: [],
      attachments: [],
      comments: [],
      approvalSteps: [],
      timeEntries: [],
      tags: [],
    );
  }
  
  // Methode zum in Bearbeitung setzen eines Auftrags
  Future<void> startProcessingOrder(String orderId, String userId) async {
    try {
      // Referenz zum Auftrag
      fb.DocumentReference orderRef = _firestore.collection('orders').doc(orderId);
      
      // Aktuelle Auftragsdaten abrufen
      fb.DocumentSnapshot orderSnapshot = await orderRef.get();
      
      if (!orderSnapshot.exists) {
        throw Exception('Auftrag nicht gefunden');
      }
      
      Map<String, dynamic> orderData = orderSnapshot.data() as Map<String, dynamic>;
      
      // Prüfen, ob der Benutzer der Teamleiter ist
      bool isTeamLead = false;
      
      // Prüfen auf assignedUsers-Struktur
      List<dynamic> assignedUsers = orderData['assignedUsers'] ?? [];
      
      if (assignedUsers.isNotEmpty) {
        // Neue Struktur: Prüfen, ob Benutzer als Teamleiter markiert ist
        isTeamLead = assignedUsers.any((user) => 
          user['id'] == userId && user['isTeamLead'] == true
        );
      } else if (orderData['teamLeadId'] == userId) {
        // Alte Struktur: Prüfen auf teamLeadId
        isTeamLead = true;
      }
      
      if (!isTeamLead) {
        throw Exception('Nur der Teamleiter darf den Auftrag in Bearbeitung setzen');
      }
      
      // Status auf "in-progress" setzen
      await orderRef.update({
        'status': 'in-progress',
        'startedAt': fb.FieldValue.serverTimestamp(),
        'startedBy': userId
      });
      
      print('Auftrag $orderId wurde in Bearbeitung gesetzt');
    } catch (e) {
      print('Fehler beim in Bearbeitung setzen des Auftrags: $e');
      rethrow;
    }
  }
  
  // Methode zum Hinzufügen eines Zeiteintrags für einen Auftrag (als Teamleiter)
  Future<void> addTimeEntryAsTeamLead(
    String orderId, 
    String userId, 
    double hours, 
    String notes,
    bool isTeamLead
  ) async {
    try {
      // Sicherstellen, dass alle erforderlichen Parameter gültig sind
      if (orderId.isEmpty || userId.isEmpty || hours <= 0) {
        throw Exception('Ungültige Parameter für Zeiteintrag');
      }
      
      // Wenn der Benutzer kein Teamleiter ist, Berechtigungsprüfung durchführen
      if (!isTeamLead) {
        // Prüfen, ob der Benutzer berechtigt ist, Zeiten zu erfassen
        throw Exception('Nur der Teamleiter darf Zeiten für diesen Auftrag erfassen');
      }
      
      // Referenz zum Auftrag
      fb.DocumentReference orderRef = _firestore.collection('orders').doc(orderId);
      
      // Auftrag abrufen
      fb.DocumentSnapshot orderSnapshot = await orderRef.get();
      
      if (!orderSnapshot.exists) {
        throw Exception('Auftrag nicht gefunden');
      }
      
      Map<String, dynamic> orderData = orderSnapshot.data() as Map<String, dynamic>;
      
      // Auftragstitel für den Zeiteintrag
      String orderTitle = orderData['title'] ?? 'Unbekannter Auftrag';
      
      // assignedUsers aktualisieren, wenn vorhanden
      List<dynamic> assignedUsers = List<dynamic>.from(orderData['assignedUsers'] ?? []);
      bool userFound = false;
      
      // Aktualisiere die Zeit für den angegebenen Benutzer
      for (int i = 0; i < assignedUsers.length; i++) {
        if (assignedUsers[i]['id'] == userId) {
          assignedUsers[i]['timeSpent'] = hours;
          assignedUsers[i]['timeNotes'] = notes;
          userFound = true;
          break;
        }
      }
      
      // Wenn der Benutzer nicht in assignedUsers gefunden wurde, füge ihn hinzu
      if (!userFound) {
        // Benutzerinformationen abrufen
        fb.DocumentSnapshot userSnapshot = await _firestore.collection('users').doc(userId).get();
        String userName = 'Unbekannter Benutzer';
        
        if (userSnapshot.exists) {
          Map<String, dynamic> userData = userSnapshot.data() as Map<String, dynamic>;
          userName = userData['displayName'] ?? userData['email'] ?? 'Unbekannter Benutzer';
        }
        
        // Füge den Benutzer zu assignedUsers hinzu
        assignedUsers.add({
          'id': userId,
          'name': userName,
          'timeSpent': hours,
          'timeNotes': notes,
          'status': 'accepted',
          'isTeamLead': false
        });
      }
      
      // Aktualisiere den Auftrag
      await orderRef.update({
        'assignedUsers': assignedUsers,
        'lastModified': fb.FieldValue.serverTimestamp()
      });
      
      // Erstelle einen Zeiteintrag für die Zeiterfassung
      await _createTimeEntryFromOrder(
        userId,
        orderId,
        orderTitle,
        hours,
        notes
      );
      
      print('Zeiteintrag für Benutzer $userId in Auftrag $orderId hinzugefügt');
    } catch (e) {
      print('Fehler beim Hinzufügen des Zeiteintrags: $e');
      rethrow;
    }
  }
  
  // Hilfsmethode zum Erstellen eines Zeiteintrags für einen Auftrag
  Future<void> _createTimeEntryFromOrder(
    String userId,
    String orderId,
    String orderTitle,
    double hours,
    String notes
  ) async {
    try {
      // Zeitstempel für den Eintrag
      final now = DateTime.now();
      
      // Zeiteintrag erstellen
      await _firestore.collection('timeEntries').add({
        'userId': userId,
        'orderId': orderId,
        'orderTitle': orderTitle,
        'hours': hours,
        'notes': notes,
        'date': now,
        'createdAt': fb.FieldValue.serverTimestamp(),
        'status': 'completed'
      });
      
      print('Zeiteintrag für Auftrag $orderId erstellt');
    } catch (e) {
      print('Fehler beim Erstellen des Zeiteintrags: $e');
      rethrow;
    }
  }
  
  // Methode zum Abschließen eines Auftrags als Teamleiter
  Future<void> completeOrderAsTeamLead(
    String orderId,
    String userId,
    String completionNotes
  ) async {
    try {
      // Referenz zum Auftrag
      fb.DocumentReference orderRef = _firestore.collection('orders').doc(orderId);
      
      // Aktuelle Auftragsdaten abrufen
      fb.DocumentSnapshot orderSnapshot = await orderRef.get();
      
      if (!orderSnapshot.exists) {
        throw Exception('Auftrag nicht gefunden');
      }
      
      Map<String, dynamic> orderData = orderSnapshot.data() as Map<String, dynamic>;
      
      // Prüfen, ob der Benutzer der Teamleiter ist
      bool isTeamLead = false;
      
      // Prüfen auf assignedUsers-Struktur
      List<dynamic> assignedUsers = orderData['assignedUsers'] ?? [];
      
      if (assignedUsers.isNotEmpty) {
        // Neue Struktur: Prüfen, ob Benutzer als Teamleiter markiert ist
        isTeamLead = assignedUsers.any((user) => 
          user['id'] == userId && user['isTeamLead'] == true
        );
      } else if (orderData['teamLeadId'] == userId) {
        // Alte Struktur: Prüfen auf teamLeadId
        isTeamLead = true;
      }
      
      if (!isTeamLead) {
        throw Exception('Nur der Teamleiter darf den Auftrag abschließen');
      }
      
      // Prüfen, ob für alle Teammitglieder Zeiten erfasst wurden
      bool allTimesRecorded = true;
      for (var user in assignedUsers) {
        if (user['timeSpent'] == null || user['timeSpent'] == 0) {
          allTimesRecorded = false;
          break;
        }
      }
      
      if (!allTimesRecorded) {
        throw Exception('Vor dem Abschließen müssen Zeiten für alle Teammitglieder erfasst werden');
      }
      
      // Gesamtzeit berechnen
      double totalTimeSpent = 0;
      for (var user in assignedUsers) {
        totalTimeSpent += (user['timeSpent'] ?? 0);
      }
      
      // Alle Teammitglieder als abgeschlossen markieren
      for (int i = 0; i < assignedUsers.length; i++) {
        assignedUsers[i]['status'] = 'completed';
      }
      
      // Auftrag abschließen
      await orderRef.update({
        'status': 'completed',
        'assignedUsers': assignedUsers,
        'completedAt': fb.FieldValue.serverTimestamp(),
        'completedBy': userId,
        'completionNotes': completionNotes,
        'totalTimeSpent': totalTimeSpent
      });
      
      print('Auftrag $orderId wurde abgeschlossen');
    } catch (e) {
      print('Fehler beim Abschließen des Auftrags: $e');
      rethrow;
    }
  }
  
  // Diagnosemethode, um die Firebase-Verbindung zu prüfen
  Future<Map<String, dynamic>> diagnoseDatabaseConnection() async {
    final result = <String, dynamic>{
      'collectionExists': false,
      'documentCount': 0,
      'sampleDocumentIds': <String>[],
      'sampleDocumentFields': <String, dynamic>{},
      'error': null,
    };
    
    print("🔍 DIAGNOSE: Starte Firestore-Verbindungsprüfung...");
    
    try {
      // Prüfen, ob die orders-Collection existiert und Dokumente enthält
      final ordersSnapshot = await fb.FirebaseFirestore.instance.collection('orders').get();
      result['collectionExists'] = true;
      result['documentCount'] = ordersSnapshot.docs.length;
      
      print("📊 DIAGNOSE: 'orders' Collection enthält ${ordersSnapshot.docs.length} Dokumente");
      
      if (ordersSnapshot.docs.isNotEmpty) {
        // Sample-Dokument-IDs speichern
        result['sampleDocumentIds'] = ordersSnapshot.docs.take(5).map((doc) => doc.id).toList();
        
        // Erstes Dokument untersuchen
        final firstDoc = ordersSnapshot.docs.first;
        final data = firstDoc.data();
        result['sampleDocumentFields'] = data;
        
        print("📄 DIAGNOSE: Beispieldokument (${firstDoc.id}) enthält folgende Felder:");
        data.forEach((key, value) {
          final valueType = value?.runtimeType.toString() ?? "null";
          print("   - $key: $value ($valueType)");
        });
        
        // Wichtige Felder speziell hervorheben
        print("📑 DIAGNOSE: Wichtige Felder im ersten Dokument:");
        print("   - title: ${data['title']}");
        print("   - status: ${data['status']}");
        print("   - Web-Format (client/customerId): ${data['client']}/${data['customerId']}");
        print("   - App-Format (clientName/clientId): ${data['clientName']}/${data['clientId']}");
      } else {
        print("⚠️ DIAGNOSE: Keine Dokumente in der 'orders' Collection gefunden!");
      }
      
      // Prüfen der Firebase-Authentifizierung
      final currentUser = FirebaseAuth.instance.currentUser;
      result['userAuthenticated'] = currentUser != null;
      result['userId'] = currentUser?.uid;
      result['userEmail'] = currentUser?.email;
      
      print("👤 DIAGNOSE: Benutzer authentifiziert: ${currentUser != null}");
      if (currentUser != null) {
        print("   - User ID: ${currentUser.uid}");
        print("   - E-Mail: ${currentUser.email}");
      }
      
      // Erstelle zusätzlich einen Test-Dummy-Auftrag, um Schreibzugriff zu testen
      try {
        final docRef = await fb.FirebaseFirestore.instance.collection('firebase_test').add({
          'test': true,
          'timestamp': fb.FieldValue.serverTimestamp(),
          'message': 'Diagnose-Test von Flutter-App'
        });
        
        result['writeAccessSuccessful'] = true;
        print("✅ DIAGNOSE: Test-Schreibzugriff erfolgreich (Dokument-ID: ${docRef.id})");
        
        // Zum Aufräumen wieder löschen
        await docRef.delete();
      } catch (writeError) {
        result['writeAccessSuccessful'] = false;
        result['writeError'] = writeError.toString();
        print("❌ DIAGNOSE: Test-Schreibzugriff fehlgeschlagen: $writeError");
      }
      
    } catch (e) {
      result['error'] = e.toString();
      print("❌ DIAGNOSE: Fehler bei der Firestore-Verbindungsprüfung: $e");
    }
    
    print("🔍 DIAGNOSE: Firestore-Verbindungsprüfung abgeschlossen");
    return result;
  }

  // Alternative Methode zum direkten Laden von Aufträgen ohne Stream
  Future<List<Order>> getOrdersDirectly() async {
    print("⏳ Starte direkte Abfrage aller Aufträge ohne Stream...");
    
    try {
      // Direkte Abfrage der Firestore-Collection
      final snapshot = await fb.FirebaseFirestore.instance.collection('orders').get();
      
      print("📦 Snapshot direkt erhalten mit ${snapshot.docs.length} Dokumenten");
      
      if (snapshot.docs.isEmpty) {
        print("⚠️ Keine Aufträge in der Datenbank gefunden");
        return <Order>[];
      }
      
      List<Order> orders = [];
      int errorCount = 0;
      int successCount = 0;
      
      for (var doc in snapshot.docs) {
        try {
          final rawData = doc.data();
          final orderId = doc.id;
          
          print("🔍 Verarbeite Dokument $orderId direkt");
          
          // Wichtige Felder für die Diagnose ausgeben
          print("  - status: ${rawData['status']}");
          print("  - title: ${rawData['title']}");
          
          // Versuche zuerst die reguläre Konvertierungsmethode
          try {
            Order order = Order.fromFirestore(doc);
            order = await _enrichOrderData(order);
            
            print("✅ Dokument $orderId erfolgreich konvertiert");
            orders.add(order);
            successCount++;
          } catch (normalConversionError) {
            print("⚠️ Standardkonvertierung fehlgeschlagen für $orderId: $normalConversionError");
            
            // Fallback: Versuche manuelle/vereinfachte Konvertierung
            try {
              // Extrahiere die minimalen Felder
              final String title = rawData['title'] as String? ?? "Unbenannter Auftrag";
              final String description = rawData['description'] as String? ?? "";
              final String clientName = rawData['clientName'] as String? ?? 
                                        rawData['client'] as String? ?? "Unbekannter Kunde";
              final String clientId = rawData['clientId'] as String? ?? 
                                      rawData['customerId'] as String? ?? "";
              
              // Status als String extrahieren
              final String statusStr = rawData['status'] as String? ?? "draft";
              
              // Status manuell bestimmen
              OrderStatus status = OrderStatus.draft;
              switch(statusStr.toLowerCase()) {
                case 'pending': status = OrderStatus.pending; break;
                case 'approved': status = OrderStatus.approved; break;
                case 'assigned': status = OrderStatus.assigned; break;
                case 'in-progress': 
                case 'inprogress': status = OrderStatus.inProgress; break;
                case 'completed': status = OrderStatus.completed; break;
                case 'rejected': status = OrderStatus.rejected; break;
                case 'cancelled': status = OrderStatus.cancelled; break;
              }
              
              // Vereinfachten Auftrag erstellen
              final Order fallbackOrder = Order(
                id: orderId,
                title: title,
                description: description,
                clientId: clientId,
                clientName: clientName,
                status: status,
                createdAt: rawData['createdAt'] != null ? 
                          (rawData['createdAt'] as fb.Timestamp).toDate() : 
                          DateTime.now(),
                createdBy: rawData['createdBy'] as String? ?? "",
                createdByName: rawData['createdByName'] as String? ?? "",
                priority: OrderPriority.medium,
                type: OrderType.other,
                estimatedHours: rawData['estimatedHours'] != null ? 
                                (rawData['estimatedHours'] as num).toDouble() : 0.0,
                actualHours: rawData['actualHours'] != null ? 
                             (rawData['actualHours'] as num).toDouble() : 0.0,
                paymentStatus: PaymentStatus.unpaid,
                tasks: [],
                attachments: [],
                comments: [],
                approvalSteps: [],
                timeEntries: [],
                tags: [],
                projectId: rawData['projectId'] as String?,
                projectName: rawData['projectName'] as String? ?? rawData['project'] as String?,
              );
              
              print("✅ Dokument $orderId mit Fallback-Methode konvertiert");
              orders.add(fallbackOrder);
              successCount++;
            } catch (fallbackError) {
              print("❌ Auch Fallback-Konvertierung fehlgeschlagen für $orderId: $fallbackError");
              errorCount++;
            }
          }
        } catch (e) {
          print("❌ Fehler bei der Verarbeitung des Dokuments ${doc.id}: $e");
          errorCount++;
        }
      }
      
      print("📊 Verarbeitung abgeschlossen: $successCount Aufträge erfolgreich geladen, $errorCount fehlgeschlagen");
      return orders;
    } catch (e) {
      print("❌ Fehler beim direkten Laden der Aufträge: $e");
      return <Order>[];
    }
  }
} 