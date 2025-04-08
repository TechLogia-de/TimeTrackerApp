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
  
  // Alle Aufträge abrufen
  Stream<List<Order>> getOrders() {
    print("⏳ Starte Abfrage aller Aufträge...");
    return _ordersCollection
        .orderBy('createdAt', descending: true)
        .snapshots()
        .asyncMap((snapshot) async {
          try {
            print("📦 Snapshot erhalten mit ${snapshot.docs.length} Dokumenten");
            
            List<Order> orders = [];
            int errorCount = 0;
            
            for (var doc in snapshot.docs) {
              try {
                // Daten des Dokuments ausgeben
                final rawData = doc.data() as Map<String, dynamic>?;
                final orderId = doc.id;
                
                // Besonders wichtige Felder prüfen
                print("📄 Auftrag $orderId - Kunden-/Projektdaten aus Rohquelle:");
                print("  - clientId: ${rawData?['clientId']}, clientName: ${rawData?['clientName']}");
                print("  - projectId: ${rawData?['projectId']}, projectName: ${rawData?['projectName']}");
                
                // Erstelle den Auftrag aus den Firestore-Daten
                Order order = Order.fromFirestore(doc as fb.DocumentSnapshot);
                
                // Prüfen, ob Kunden- oder Projektdaten fehlen und ggf. nachladen
                order = await _enrichOrderData(order);
                
                // Log Kunden- und Projektinformationen nach der Konvertierung
                print("✅ Auftrag konvertiert: ID=${order.id}, Status=${order.status}");
                print("  - Kunde: ID=${order.clientId}, Name=${order.clientName}");
                print("  - Projekt: ID=${order.projectId}, Name=${order.projectName}");
                
                orders.add(order);
              } catch (e) {
                errorCount++;
                print("❌ Fehler beim Parsen des Auftrags: $e für Dokument ${doc.id}");
              }
            }
            
            if (errorCount > 0) {
              print("⚠️ $errorCount Aufträge konnten nicht geladen werden");
            }
            
            print("✅ Erfolgreich ${orders.length} Aufträge geladen");
            return orders;
          } catch (e) {
            print("❌ Fehler beim Laden der Aufträge: $e");
            return <Order>[];
          }
        });
  }
  
  // Aufträge mit Filter abrufen
  Stream<List<Order>> getFilteredOrders({OrderStatus? status}) {
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
    return _ordersCollection.snapshots().asyncMap((snapshot) async {
      try {
        print("📦 Snapshot erhalten mit ${snapshot.docs.length} Dokumenten");
        
        // Debug: Zeige alle vorhandenen Status-Werte
        print("📊 Status-Werte in der Datenbank:");
        for (var doc in snapshot.docs) {
          final data = doc.data() as Map<String, dynamic>?;
          print("  - Dokument ${doc.id}: Status='${data?['status']}' (${data?['status'].runtimeType})");
        }
        
        List<Order> orders = [];
        int errorCount = 0;
        
        for (var doc in snapshot.docs) {
          try {
            // Erstelle den Auftrag aus den Firestore-Daten
            Order order = Order.fromFirestore(doc as fb.DocumentSnapshot);
            
            // Prüfen, ob Kunden- oder Projektdaten fehlen und ggf. nachladen
            order = await _enrichOrderData(order);
            
            // Füge den Auftrag zur ungefilteren Liste hinzu
            orders.add(order);
            print("✅ Auftrag geladen: ID=${order.id}, Status=${order.status} (${order.status.toString()})");
          } catch (e) {
            errorCount++;
            print("❌ Fehler beim Parsen eines Auftrags: $e für Dokument ${doc.id}");
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
    });
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
    
    Order order = Order.fromFirestore(docSnapshot as fb.DocumentSnapshot);
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
      }
    }
    
    // Wenn Daten ergänzt wurden, speichern wir sie in Firestore für zukünftige Anfragen
    if (orderChanged && order.id != null) {
      print("💾 Aktualisiere Auftrag ${order.id} mit ergänzten Daten");
      await _ordersCollection.doc(order.id).update({
        'clientName': enrichedOrder.clientName,
        'projectName': enrichedOrder.projectName,
        'clientContactPerson': enrichedOrder.clientContactPerson,
        'clientContactEmail': enrichedOrder.clientContactEmail,
        'clientContactPhone': enrichedOrder.clientContactPhone,
        'projectLocation': enrichedOrder.projectLocation,
        'projectLatitude': enrichedOrder.projectLatitude,
        'projectLongitude': enrichedOrder.projectLongitude,
      });
    }
    
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
      final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
        final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
      final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
    
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
    
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
    
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
    
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
    
    final order = Order.fromFirestore(orderDoc as fb.DocumentSnapshot);
    
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
} 