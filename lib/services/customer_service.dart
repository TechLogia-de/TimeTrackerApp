import 'package:cloud_firestore/cloud_firestore.dart' as fb;

class Customer {
  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String? contactPerson;
  final bool active;

  Customer({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.contactPerson,
    this.active = true,
  });

  factory Customer.fromFirestore(fb.DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    if (data == null) {
      return Customer(id: doc.id, name: 'Unbekannter Kunde');
    }

    return Customer(
      id: doc.id,
      name: data['name'] ?? 'Unbenannter Kunde',
      email: data['email'],
      phone: data['phone'],
      contactPerson: data['contactPerson'],
      active: data['active'] ?? true,
    );
  }
}

class CustomerService {
  final fb.FirebaseFirestore _firestore = fb.FirebaseFirestore.instance;
  
  // Referenz auf die Kunden-Collection
  fb.CollectionReference get _customersCollection => _firestore.collection('customers');
  
  // Cache für Kunden, um wiederholte Datenbankabfragen zu vermeiden
  final Map<String, Customer> _customerCache = {};
  
  // Alle aktiven Kunden abrufen
  Future<List<Customer>> getActiveCustomers() async {
    try {
      final snapshot = await _customersCollection
          .where('active', isEqualTo: true)
          .get();
      
      final customers = snapshot.docs
          .map((doc) => Customer.fromFirestore(doc))
          .toList();
      
      // Cache aktualisieren
      for (var customer in customers) {
        _customerCache[customer.id] = customer;
      }
      
      return customers;
    } catch (e) {
      print('❌ Fehler beim Laden der Kunden: $e');
      return [];
    }
  }
  
  // Alle Kunden abrufen
  Future<List<Customer>> getAllCustomers() async {
    try {
      final snapshot = await _customersCollection.get();
      
      final customers = snapshot.docs
          .map((doc) => Customer.fromFirestore(doc))
          .toList();
      
      // Cache aktualisieren
      for (var customer in customers) {
        _customerCache[customer.id] = customer;
      }
      
      return customers;
    } catch (e) {
      print('❌ Fehler beim Laden der Kunden: $e');
      return [];
    }
  }
  
  // Einen Kunden nach ID abrufen
  Future<Customer?> getCustomerById(String customerId) async {
    // Zuerst im Cache nach dem Kunden suchen
    if (_customerCache.containsKey(customerId)) {
      print('✅ Kunde $customerId aus Cache geladen');
      return _customerCache[customerId];
    }
    
    try {
      print('🔍 Suche Kunde mit ID: $customerId in Firestore');
      final doc = await _customersCollection.doc(customerId).get();
      
      if (!doc.exists) {
        print('⚠️ Kunde mit ID $customerId nicht gefunden');
        return null;
      }
      
      final customer = Customer.fromFirestore(doc);
      
      // Customer im Cache speichern
      _customerCache[customerId] = customer;
      
      print('✅ Kunde geladen: ${customer.name} (ID: ${customer.id})');
      return customer;
    } catch (e) {
      print('❌ Fehler beim Laden des Kunden $customerId: $e');
      return null;
    }
  }
} 