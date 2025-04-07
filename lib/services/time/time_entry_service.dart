import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/time/time_entry_model.dart';

class TimeEntryService {
  static final TimeEntryService _instance = TimeEntryService._internal();
  factory TimeEntryService() => _instance;
  TimeEntryService._internal();

  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  
  // Cache für Zeiteinträge
  List<TimeEntry> _cachedTimeEntries = [];
  bool _isLoadingEntries = false;
  DateTime _lastCacheUpdate = DateTime(1970);
  
  // Active Timer Status
  TimeEntry? _activeTimer;
  
  // Getter und Setter für den aktiven Timer
  TimeEntry? get activeTimer => _activeTimer;
  set activeTimer(TimeEntry? timer) => _activeTimer = timer;

  // Zeiteinträge für einen Benutzer abrufen
  Future<List<TimeEntry>> getTimeEntriesForUser(String userId) async {
    // Wenn Daten im Cache sind und vor weniger als 5 Minuten geladen wurden, gib sie zurück
    if (_cachedTimeEntries.isNotEmpty &&
        DateTime.now().difference(_lastCacheUpdate).inMinutes < 5) {
      return _cachedTimeEntries.where((entry) => entry.userId == userId).toList();
    }

    // Sonst: Daten neu laden
    if (!_isLoadingEntries) {
      _isLoadingEntries = true;
      
      try {
        final QuerySnapshot snapshot = await _firestore
            .collection('timeEntries')
            .where('userId', isEqualTo: userId)
            .orderBy('startTime', descending: true)
            .get();

        final entries = snapshot.docs
            .map((doc) => TimeEntry.fromFirestore(doc))
            .toList();

        _cachedTimeEntries = entries;
        _lastCacheUpdate = DateTime.now();
        
        return entries;
      } catch (e) {
        print('Fehler beim Laden der Zeiteinträge: $e');
        throw Exception('Fehler beim Laden der Zeiteinträge');
      } finally {
        _isLoadingEntries = false;
      }
    }
    
    // Wenn gerade geladen wird, gib den aktuellen Cache zurück
    return _cachedTimeEntries.where((entry) => entry.userId == userId).toList();
  }

  // Zeiteinträge für einen Benutzer abrufen (mit Paginierung)
  Future<List<TimeEntry>> getTimeEntriesForUserPaginated(String userId, int limit, [int offset = 0]) async {
    try {
      // Konfiguriere die Query mit Paginierung
      final QuerySnapshot snapshot = await _firestore
          .collection('timeEntries')
          .where('userId', isEqualTo: userId)
          .orderBy('startTime', descending: true)
          .limit(limit)
          .get();

      final entries = snapshot.docs
          .map((doc) => TimeEntry.fromFirestore(doc))
          .toList();
      
      return entries;
    } catch (e) {
      print('Fehler beim Laden der paginierten Zeiteinträge: $e');
      throw Exception('Fehler beim Laden der paginierten Zeiteinträge');
    }
  }

  // Einen aktiven Timer für den Benutzer abrufen
  Future<TimeEntry?> getActiveTimerForUser(String userId) async {
    try {
      final QuerySnapshot snapshot = await _firestore
          .collection('timeEntries')
          .where('userId', isEqualTo: userId)
          .where('status', whereIn: ['running', 'paused'])
          .limit(1)
          .get();

      if (snapshot.docs.isNotEmpty) {
        final activeTimer = TimeEntry.fromFirestore(snapshot.docs.first);
        _activeTimer = activeTimer;
        return activeTimer;
      }
      
      _activeTimer = null;
      return null;
    } catch (e) {
      print('Fehler beim Abrufen des aktiven Timers: $e');
      throw Exception('Fehler beim Abrufen des aktiven Timers');
    }
  }

  // Timer starten
  Future<TimeEntry> startTimer({
    required String userId,
    required String userName,
    required String userEmail,
    required DateTime startTime,
    required String customerId,
    required String customerName,
    required String projectId,
    required String projectName,
    String note = '',
  }) async {
    try {
      // Prüfen, ob bereits ein aktiver Timer existiert
      final existingTimer = await getActiveTimerForUser(userId);
      if (existingTimer != null) {
        throw Exception('Es läuft bereits ein Timer');
      }

      // Datum aus der Startzeit extrahieren
      final date = DateTime(startTime.year, startTime.month, startTime.day);
      
      // Zeitzone und Sommerzeit bestimmen
      final DateTime now = DateTime.now();
      final int timezoneOffset = now.timeZoneOffset.inMinutes;
      final bool isDST = now.timeZoneOffset.inHours > 1; // Einfache Heuristik für Mitteleuropa
      
      // Zeiteintrags-Daten vorbereiten
      final timeEntryData = {
        'userId': userId,
        'userName': userName,
        'userEmail': userEmail,
        
        'startTime': startTime,
        'endTime': startTime, // Vorläufig gleich der Startzeit
        'date': date,
        
        'dateYear': date.year,
        'dateMonth': date.month - 1, // 0-basiert wie in JS
        'dateDay': date.day,
        'dateString': '${date.year}-${date.month}-${date.day}',
        
        'duration': 0, // Wird aktualisiert, wenn der Timer gestoppt wird
        'pauseMinutes': 0,
        
        'description': 'Zeiterfassung: $projectName',
        'note': note,
        
        'customerId': customerId,
        'customerName': customerName,
        'projectId': projectId,
        'projectName': projectName,
        
        'status': 'running',
        'timezone': 'Europe/Berlin', // Standardwert für deutsche Nutzer
        'isDST': isDST,
        'timezoneOffset': timezoneOffset,
        'isManualEntry': false,
        'fromOrders': false,
        
        'createdAt': DateTime.now(),
        'updatedAt': DateTime.now(),
      };

      // In Firestore speichern
      final DocumentReference docRef = await _firestore
          .collection('timeEntries')
          .add(timeEntryData);

      // Erstelle TimeEntry Objekt mit der neuen ID
      final timer = TimeEntry(
        id: docRef.id,
        userId: userId,
        userName: userName,
        userEmail: userEmail,
        startTime: startTime,
        endTime: startTime,
        date: date,
        dateYear: date.year,
        dateMonth: date.month - 1,
        dateDay: date.day,
        dateString: '${date.year}-${date.month}-${date.day}',
        duration: 0,
        pauseMinutes: 0,
        description: 'Zeiterfassung: $projectName',
        note: note,
        customerId: customerId,
        customerName: customerName,
        projectId: projectId,
        projectName: projectName,
        status: 'running',
        timezone: 'Europe/Berlin',
        isDST: isDST,
        timezoneOffset: timezoneOffset,
        isManualEntry: false,
        fromOrders: false,
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      // Setze den aktiven Timer
      _activeTimer = timer;
      
      return timer;
    } catch (e) {
      print('Fehler beim Starten des Timers: $e');
      throw Exception('Fehler beim Starten des Timers');
    }
  }

  // Timer pausieren
  Future<TimeEntry> pauseTimer(String timerId, int pauseMinutes, {DateTime? pauseStartTime}) async {
    try {
      final DocumentReference timerRef = _firestore.collection('timeEntries').doc(timerId);
      final timerDoc = await timerRef.get();
      
      if (!timerDoc.exists) {
        throw Exception('Timer nicht gefunden');
      }
      
      final timerData = timerDoc.data() as Map<String, dynamic>;
      
      if (timerData['status'] != 'running') {
        throw Exception('Timer ist nicht aktiv');
      }
      
      // Timer als pausiert markieren
      final now = pauseStartTime ?? DateTime.now();
      
      await timerRef.update({
        'status': 'paused',
        'pauseMinutes': pauseMinutes,
        'pauseStartTime': now,
        'updatedAt': now,
      });
      
      // Aktualisiere den aktiven Timer im Cache
      if (_activeTimer != null && _activeTimer!.id == timerId) {
        final updatedTimer = TimeEntry(
          id: _activeTimer!.id,
          userId: _activeTimer!.userId,
          userName: _activeTimer!.userName,
          userEmail: _activeTimer!.userEmail,
          startTime: _activeTimer!.startTime,
          endTime: _activeTimer!.endTime,
          date: _activeTimer!.date,
          dateYear: _activeTimer!.dateYear,
          dateMonth: _activeTimer!.dateMonth,
          dateDay: _activeTimer!.dateDay,
          dateString: _activeTimer!.dateString,
          duration: _activeTimer!.duration,
          pauseMinutes: pauseMinutes,
          description: _activeTimer!.description,
          note: _activeTimer!.note,
          customerId: _activeTimer!.customerId,
          customerName: _activeTimer!.customerName,
          projectId: _activeTimer!.projectId,
          projectName: _activeTimer!.projectName,
          status: 'paused',
          timezone: _activeTimer!.timezone,
          isDST: _activeTimer!.isDST,
          timezoneOffset: _activeTimer!.timezoneOffset,
          isManualEntry: _activeTimer!.isManualEntry,
          fromOrders: _activeTimer!.fromOrders,
          createdAt: _activeTimer!.createdAt,
          updatedAt: now,
        );
        
        _activeTimer = updatedTimer;
        return updatedTimer;
      }
      
      // Falls der Timer nicht im Cache ist, holen wir das aktualisierte Dokument
      final updatedDoc = await timerRef.get();
      final updatedTimer = TimeEntry.fromFirestore(updatedDoc);
      return updatedTimer;
    } catch (e) {
      print('Fehler beim Pausieren des Timers: $e');
      throw Exception('Fehler beim Pausieren des Timers');
    }
  }

  // Timer fortsetzen
  Future<TimeEntry> resumeTimer(String timerId, [int pauseMinutes = 0]) async {
    try {
      final DocumentReference timerRef = _firestore.collection('timeEntries').doc(timerId);
      final timerDoc = await timerRef.get();
      
      if (!timerDoc.exists) {
        throw Exception('Timer nicht gefunden');
      }
      
      final timerData = timerDoc.data() as Map<String, dynamic>;
      
      if (timerData['status'] != 'paused') {
        throw Exception('Timer ist nicht pausiert');
      }
      
      // Timer als aktiv markieren
      final now = DateTime.now();
      
      final Map<String, dynamic> updateData = {
        'status': 'running',
        'updatedAt': now,
        'pauseStartTime': null,
      };
      
      // Aktualisiere pauseMinutes, wenn ein neuer Wert übergeben wurde
      if (pauseMinutes > 0) {
        updateData['pauseMinutes'] = pauseMinutes;
      }
      
      await timerRef.update(updateData);
      
      // Aktualisiere den aktiven Timer im Cache
      if (_activeTimer != null && _activeTimer!.id == timerId) {
        final newPauseMinutes = pauseMinutes > 0 ? pauseMinutes : _activeTimer!.pauseMinutes;
        
        final updatedTimer = TimeEntry(
          id: _activeTimer!.id,
          userId: _activeTimer!.userId,
          userName: _activeTimer!.userName,
          userEmail: _activeTimer!.userEmail,
          startTime: _activeTimer!.startTime,
          endTime: _activeTimer!.endTime,
          date: _activeTimer!.date,
          dateYear: _activeTimer!.dateYear,
          dateMonth: _activeTimer!.dateMonth,
          dateDay: _activeTimer!.dateDay,
          dateString: _activeTimer!.dateString,
          duration: _activeTimer!.duration,
          pauseMinutes: newPauseMinutes,
          description: _activeTimer!.description,
          note: _activeTimer!.note,
          customerId: _activeTimer!.customerId,
          customerName: _activeTimer!.customerName,
          projectId: _activeTimer!.projectId,
          projectName: _activeTimer!.projectName,
          status: 'running',
          timezone: _activeTimer!.timezone,
          isDST: _activeTimer!.isDST,
          timezoneOffset: _activeTimer!.timezoneOffset,
          isManualEntry: _activeTimer!.isManualEntry,
          fromOrders: _activeTimer!.fromOrders,
          createdAt: _activeTimer!.createdAt,
          updatedAt: now,
        );
        
        _activeTimer = updatedTimer;
        return updatedTimer;
      }
      
      // Falls der Timer nicht im Cache ist, holen wir das aktualisierte Dokument
      final updatedDoc = await timerRef.get();
      final updatedTimer = TimeEntry.fromFirestore(updatedDoc);
      return updatedTimer;
    } catch (e) {
      print('Fehler beim Fortsetzen des Timers: $e');
      throw Exception('Fehler beim Fortsetzen des Timers');
    }
  }

  // Timer stoppen
  Future<TimeEntry> stopTimer(
    String timerId, 
    DateTime endTime, 
    int pauseMinutes, 
    {List<Map<String, dynamic>>? pauseHistory}
  ) async {
    try {
      final DocumentReference timerRef = _firestore.collection('timeEntries').doc(timerId);
      final timerDoc = await timerRef.get();
      
      if (!timerDoc.exists) {
        throw Exception('Timer nicht gefunden');
      }
      
      final timerData = timerDoc.data() as Map<String, dynamic>;
      final startTime = (timerData['startTime'] as Timestamp).toDate();
      
      // Gesamtdauer in Sekunden berechnen
      final int durationSeconds = endTime.difference(startTime).inSeconds;
      
      // Nettodauer nach Abzug der Pausenzeit
      final int netDurationSeconds = durationSeconds - (pauseMinutes * 60);
      
      // Daten für das Update vorbereiten
      final Map<String, dynamic> updateData = {
        'status': 'draft',
        'endTime': endTime,
        'duration': netDurationSeconds < 0 ? 0 : netDurationSeconds,
        'pauseMinutes': pauseMinutes,
        'updatedAt': DateTime.now(),
      };
      
      // Optional die Pausenhistorie hinzufügen
      if (pauseHistory != null && pauseHistory.isNotEmpty) {
        // Wir konvertieren die Pausenhistorie in ein Format, das in Firestore gespeichert werden kann
        // (DateTime-Objekte werden zu Timestamps)
        final List<Map<String, dynamic>> firebasePauseHistory = pauseHistory.map((pause) {
          return {
            'startTime': pause['startTime'],
            'endTime': pause['endTime'],
            'durationMinutes': pause['durationMinutes'],
            'durationSeconds': pause['durationSeconds'],
          };
        }).toList();
        
        updateData['pauseHistory'] = firebasePauseHistory;
      }
      
      // Timer als abgeschlossen markieren und Endzeit, Dauer sowie Pausenzeit aktualisieren
      await timerRef.update(updateData);
      
      // Cache leeren, um aktuelle Daten beim nächsten Laden zu erhalten
      _cachedTimeEntries = [];
      
      // Setze den aktiven Timer zurück
      _activeTimer = null;
      
      // Erstelle ein neues TimeEntry-Objekt mit den aktualisierten Daten
      final updatedEntry = TimeEntry.fromFirestore(await timerRef.get());
      
      return updatedEntry;
    } catch (e) {
      print('Fehler beim Stoppen des Timers: $e');
      throw Exception('Fehler beim Stoppen des Timers');
    }
  }

  // Manuellen Zeiteintrag erstellen
  Future<TimeEntry> createManualTimeEntry({
    required String userId,
    required String userName,
    required String userEmail,
    required DateTime date,
    required DateTime startTime,
    required DateTime endTime,
    required int pauseMinutes,
    required String customerId,
    required String customerName,
    required String projectId,
    required String projectName,
    String note = '',
  }) async {
    try {
      // Prüfen, ob die Endzeit nach der Startzeit liegt
      if (endTime.isBefore(startTime)) {
        throw Exception('Die Endzeit muss nach der Startzeit liegen');
      }
      
      // Prüfen, ob die Pausenzeit nicht länger als die gesamte Arbeitszeit ist
      final int totalMinutes = endTime.difference(startTime).inMinutes;
      if (pauseMinutes >= totalMinutes) {
        throw Exception('Die Pausenzeit darf nicht länger als die gesamte Arbeitszeit sein');
      }
      
      // Dauer in Sekunden berechnen (ohne Pausenzeit)
      final int durationSeconds = endTime.difference(startTime).inSeconds - (pauseMinutes * 60);
      
      // Zeitzone und Sommerzeit bestimmen
      final DateTime now = DateTime.now();
      final int timezoneOffset = now.timeZoneOffset.inMinutes;
      final bool isDST = now.timeZoneOffset.inHours > 1; // Einfache Heuristik für Mitteleuropa
      
      // Zeiteintrags-Daten vorbereiten
      final timeEntryData = {
        'userId': userId,
        'userName': userName,
        'userEmail': userEmail,
        
        'startTime': startTime,
        'endTime': endTime,
        'date': date,
        
        'dateYear': date.year,
        'dateMonth': date.month - 1, // 0-basiert wie in JS
        'dateDay': date.day,
        'dateString': '${date.year}-${date.month}-${date.day}',
        
        'duration': durationSeconds < 0 ? 0 : durationSeconds,
        'pauseMinutes': pauseMinutes,
        
        'description': 'Manuelle Zeiterfassung: $projectName',
        'note': note,
        
        'customerId': customerId,
        'customerName': customerName,
        'projectId': projectId,
        'projectName': projectName,
        
        'status': 'draft',
        'timezone': 'Europe/Berlin', // Standardwert für deutsche Nutzer
        'isDST': isDST,
        'timezoneOffset': timezoneOffset,
        'isManualEntry': true,
        'fromOrders': false,
        
        'createdAt': DateTime.now(),
        'updatedAt': DateTime.now(),
      };

      // In Firestore speichern
      final DocumentReference docRef = await _firestore
          .collection('timeEntries')
          .add(timeEntryData);

      // Cache leeren, um aktuelle Daten beim nächsten Laden zu erhalten
      _cachedTimeEntries = [];
      
      // Erstelle ein neues TimeEntry-Objekt mit den aktualisierten Daten
      final createdEntry = TimeEntry.fromFirestore(await docRef.get());
      
      return createdEntry;
    } catch (e) {
      print('Fehler beim Erstellen des manuellen Zeiteintrags: $e');
      throw Exception('Fehler beim Erstellen des manuellen Zeiteintrags: $e');
    }
  }

  // Zeiteintrag löschen
  Future<void> deleteTimeEntry(String entryId) async {
    try {
      await _firestore.collection('timeEntries').doc(entryId).delete();
      
      // Cache aktualisieren
      _cachedTimeEntries.removeWhere((entry) => entry.id == entryId);
      
      // Wenn der aktive Timer gelöscht wurde, zurücksetzen
      if (_activeTimer != null && _activeTimer!.id == entryId) {
        _activeTimer = null;
      }
    } catch (e) {
      print('Fehler beim Löschen des Zeiteintrags: $e');
      throw Exception('Fehler beim Löschen des Zeiteintrags');
    }
  }
  
  // Zeiteintrag zur Genehmigung einreichen
  Future<TimeEntry> submitForApproval(String entryId) async {
    try {
      final DocumentReference entryRef = _firestore.collection('timeEntries').doc(entryId);
      final entryDoc = await entryRef.get();
      
      if (!entryDoc.exists) {
        throw Exception('Zeiterfassung nicht gefunden');
      }
      
      // Status auf "pending" setzen (entspricht "eingereicht" in der Webanwendung)
      await entryRef.update({
        'status': 'pending',
        'submittedAt': DateTime.now(),
        'updatedAt': DateTime.now(),
      });
      
      // Cache leeren, um aktuelle Daten beim nächsten Laden zu erhalten
      _cachedTimeEntries = [];
      
      // Aktualisiertes Objekt zurückgeben
      return TimeEntry.fromFirestore(await entryRef.get());
    } catch (e) {
      print('Fehler beim Einreichen zur Genehmigung: $e');
      throw Exception('Fehler beim Einreichen zur Genehmigung');
    }
  }
  
  // Zeiteinträge, die zur Genehmigung anstehen, abrufen
  Future<List<TimeEntry>> getTimeEntriesToApprove(String userId) async {
    try {
      // Alle Zeiteinträge mit Status "pending" abrufen
      final QuerySnapshot snapshot = await _firestore
          .collection('timeEntries')
          .where('status', isEqualTo: 'pending')
          .orderBy('updatedAt', descending: true)
          .get();

      final entries = snapshot.docs
          .map((doc) => TimeEntry.fromFirestore(doc))
          .toList();
      
      return entries;
    } catch (e) {
      print('Fehler beim Laden der ausstehenden Zeiteinträge: $e');
      throw Exception('Fehler beim Laden der ausstehenden Zeiteinträge');
    }
  }
  
  // Zeiteintrag aktualisieren
  Future<TimeEntry> updateTimeEntry({
    required String entryId,
    required DateTime date,
    required DateTime startTime,
    required DateTime endTime,
    required int pauseMinutes,
    String? customerId,
    String? customerName,
    String? projectId,
    String? projectName,
    String? note,
  }) async {
    try {
      final DocumentReference entryRef = _firestore.collection('timeEntries').doc(entryId);
      final entryDoc = await entryRef.get();
      
      if (!entryDoc.exists) {
        throw Exception('Zeiterfassung nicht gefunden');
      }
      
      // Prüfen, ob die Endzeit nach der Startzeit liegt
      if (endTime.isBefore(startTime)) {
        throw Exception('Die Endzeit muss nach der Startzeit liegen');
      }
      
      // Prüfen, ob die Pausenzeit nicht länger als die gesamte Arbeitszeit ist
      final int totalMinutes = endTime.difference(startTime).inMinutes;
      if (pauseMinutes >= totalMinutes) {
        throw Exception('Die Pausenzeit darf nicht länger als die gesamte Arbeitszeit sein');
      }
      
      // Gesamtdauer in Sekunden berechnen
      final int durationSeconds = endTime.difference(startTime).inSeconds;
      
      // Nettodauer nach Abzug der Pausenzeit
      final int netDurationSeconds = durationSeconds - (pauseMinutes * 60);
      
      // Aktualisierungsdaten vorbereiten
      final Map<String, dynamic> updateData = {
        'startTime': startTime,
        'endTime': endTime,
        'date': date,
        'dateYear': date.year,
        'dateMonth': date.month - 1, // 0-basiert wie in JS
        'dateDay': date.day,
        'dateString': '${date.year}-${date.month}-${date.day}',
        'duration': netDurationSeconds < 0 ? 0 : netDurationSeconds,
        'pauseMinutes': pauseMinutes,
        'updatedAt': DateTime.now(),
      };
      
      // Optionale Parameter hinzufügen, falls vorhanden
      if (customerId != null) updateData['customerId'] = customerId;
      if (customerName != null) updateData['customerName'] = customerName;
      if (projectId != null) updateData['projectId'] = projectId;
      if (projectName != null) updateData['projectName'] = projectName;
      if (note != null) updateData['note'] = note;
      
      // Falls der Status 'pending' war, zurücksetzen auf 'draft'
      final currentData = entryDoc.data() as Map<String, dynamic>;
      if (currentData['status'] == 'pending') {
        updateData['status'] = 'draft';
      }
      
      // Zeiterfassung aktualisieren
      await entryRef.update(updateData);
      
      // Cache leeren, um aktuelle Daten beim nächsten Laden zu erhalten
      _cachedTimeEntries = [];
      
      // Aktualisiertes Objekt zurückgeben
      return TimeEntry.fromFirestore(await entryRef.get());
    } catch (e) {
      print('Fehler beim Aktualisieren der Zeiterfassung: $e');
      throw Exception('Fehler beim Aktualisieren der Zeiterfassung: $e');
    }
  }

  // Alle Zeiteinträge abrufen (für Admins und Manager)
  Future<List<TimeEntry>> getAllTimeEntries(String userId) async {
    try {
      // Alle Zeiteinträge abrufen, sortiert nach Aktualisierungsdatum
      final QuerySnapshot snapshot = await _firestore
          .collection('timeEntries')
          .orderBy('updatedAt', descending: true)
          .limit(100) // Begrenzung auf die neuesten 100 Einträge
          .get();

      final entries = snapshot.docs
          .map((doc) => TimeEntry.fromFirestore(doc))
          .toList();
      
      return entries;
    } catch (e) {
      print('Fehler beim Laden aller Zeiteinträge: $e');
      throw Exception('Fehler beim Laden aller Zeiteinträge');
    }
  }
  
  // Zeiterfassung genehmigen
  Future<TimeEntry> approveTimeEntry(String entryId, String approverId) async {
    try {
      final DocumentReference entryRef = _firestore.collection('timeEntries').doc(entryId);
      final entryDoc = await entryRef.get();
      
      if (!entryDoc.exists) {
        throw Exception('Zeiterfassung nicht gefunden');
      }
      
      // Status auf "approved" setzen
      await entryRef.update({
        'status': 'approved',
        'approvedBy': approverId,
        'approvedAt': DateTime.now(),
        'updatedAt': DateTime.now(),
      });
      
      // Cache leeren, um aktuelle Daten beim nächsten Laden zu erhalten
      _cachedTimeEntries = [];
      
      // Aktualisiertes Objekt zurückgeben
      return TimeEntry.fromFirestore(await entryRef.get());
    } catch (e) {
      print('Fehler bei der Genehmigung des Zeiteintrags: $e');
      throw Exception('Fehler bei der Genehmigung des Zeiteintrags');
    }
  }
  
  // Zeiterfassung ablehnen
  Future<TimeEntry> rejectTimeEntry(String entryId, String rejecterId) async {
    try {
      final DocumentReference entryRef = _firestore.collection('timeEntries').doc(entryId);
      final entryDoc = await entryRef.get();
      
      if (!entryDoc.exists) {
        throw Exception('Zeiterfassung nicht gefunden');
      }
      
      // Status auf "rejected" setzen
      await entryRef.update({
        'status': 'rejected',
        'rejectedBy': rejecterId,
        'rejectedAt': DateTime.now(),
        'updatedAt': DateTime.now(),
      });
      
      // Cache leeren, um aktuelle Daten beim nächsten Laden zu erhalten
      _cachedTimeEntries = [];
      
      // Aktualisiertes Objekt zurückgeben
      return TimeEntry.fromFirestore(await entryRef.get());
    } catch (e) {
      print('Fehler bei der Ablehnung des Zeiteintrags: $e');
      throw Exception('Fehler bei der Ablehnung des Zeiteintrags');
    }
  }
} 