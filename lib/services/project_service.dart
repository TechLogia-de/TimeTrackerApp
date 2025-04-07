import 'package:cloud_firestore/cloud_firestore.dart' as fb;

class Project {
  final String id;
  final String name;
  final String? description;
  final String? customerId;
  final String? customerName;
  final String? location;
  final double? latitude;
  final double? longitude;
  final DateTime? startDate;
  final DateTime? endDate;
  final bool active;

  Project({
    required this.id,
    required this.name,
    this.description,
    this.customerId,
    this.customerName,
    this.location,
    this.latitude,
    this.longitude,
    this.startDate,
    this.endDate,
    this.active = true,
  });

  factory Project.fromFirestore(fb.DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>?;
    if (data == null) {
      return Project(id: doc.id, name: 'Unbekanntes Projekt');
    }

    return Project(
      id: doc.id,
      name: data['name'] ?? 'Unbenanntes Projekt',
      description: data['description'],
      customerId: data['customerId'],
      customerName: data['customerName'],
      location: data['location'] ?? data['address'],
      latitude: data['latitude']?.toDouble(),
      longitude: data['longitude']?.toDouble(),
      startDate: data['startDate'] != null 
        ? (data['startDate'] as fb.Timestamp).toDate() 
        : null,
      endDate: data['endDate'] != null 
        ? (data['endDate'] as fb.Timestamp).toDate() 
        : null,
      active: data['active'] ?? true,
    );
  }
}

class ProjectService {
  final fb.FirebaseFirestore _firestore = fb.FirebaseFirestore.instance;
  
  // Referenz auf die Projekte-Collection
  fb.CollectionReference get _projectsCollection => _firestore.collection('projects');
  
  // Cache für Projekte, um wiederholte Datenbankabfragen zu vermeiden
  final Map<String, Project> _projectCache = {};
  
  // Alle aktiven Projekte abrufen
  Future<List<Project>> getActiveProjects() async {
    try {
      final snapshot = await _projectsCollection
          .where('active', isEqualTo: true)
          .get();
      
      final projects = snapshot.docs
          .map((doc) => Project.fromFirestore(doc))
          .toList();
      
      // Cache aktualisieren
      for (var project in projects) {
        _projectCache[project.id] = project;
      }
      
      return projects;
    } catch (e) {
      print('❌ Fehler beim Laden der Projekte: $e');
      return [];
    }
  }
  
  // Alle Projekte abrufen
  Future<List<Project>> getAllProjects() async {
    try {
      final snapshot = await _projectsCollection.get();
      
      final projects = snapshot.docs
          .map((doc) => Project.fromFirestore(doc))
          .toList();
      
      // Cache aktualisieren
      for (var project in projects) {
        _projectCache[project.id] = project;
      }
      
      return projects;
    } catch (e) {
      print('❌ Fehler beim Laden der Projekte: $e');
      return [];
    }
  }
  
  // Projekte eines Kunden abrufen
  Future<List<Project>> getProjectsByCustomerId(String customerId) async {
    try {
      final snapshot = await _projectsCollection
          .where('customerId', isEqualTo: customerId)
          .get();
      
      final projects = snapshot.docs
          .map((doc) => Project.fromFirestore(doc))
          .toList();
      
      // Cache aktualisieren
      for (var project in projects) {
        _projectCache[project.id] = project;
      }
      
      return projects;
    } catch (e) {
      print('❌ Fehler beim Laden der Projekte für Kunde $customerId: $e');
      return [];
    }
  }
  
  // Ein Projekt nach ID abrufen
  Future<Project?> getProjectById(String projectId) async {
    // Zuerst im Cache nach dem Projekt suchen
    if (_projectCache.containsKey(projectId)) {
      print('✅ Projekt $projectId aus Cache geladen');
      return _projectCache[projectId];
    }
    
    try {
      print('🔍 Suche Projekt mit ID: $projectId in Firestore');
      final doc = await _projectsCollection.doc(projectId).get();
      
      if (!doc.exists) {
        print('⚠️ Projekt mit ID $projectId nicht gefunden');
        return null;
      }
      
      final project = Project.fromFirestore(doc);
      
      // Project im Cache speichern
      _projectCache[projectId] = project;
      
      print('✅ Projekt geladen: ${project.name} (ID: ${project.id})');
      return project;
    } catch (e) {
      print('❌ Fehler beim Laden des Projekts $projectId: $e');
      return null;
    }
  }
} 