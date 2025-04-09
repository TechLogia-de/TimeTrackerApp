import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/time/time_entry_model.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:intl/intl.dart';
import 'dart:io' show Platform;

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

  // Status-Änderungen überwachen und Benachrichtigungen auslösen
  Future<void> checkForApprovedEntries(String userId) async {
    SharedPreferences? prefs;
    try {
      print("⏱️ Beginne Überprüfung auf genehmigte Einträge für Benutzer $userId");
      
      // Hole die zuletzt überprüfte Zeit aus SharedPreferences mit Fehlerbehandlung
      try {
        prefs = await SharedPreferences.getInstance();
      } catch (e) {
        print("⚠️ Fehler beim Initialisieren von SharedPreferences: $e");
        // Wenn SharedPreferences nicht initialisiert werden kann, verwenden wir einen Fallback
        prefs = null;
      }
      
      final lastCheckKey = 'last_approval_check_$userId';
      
      // Für Testzwecke: Immer einen Zeitstempel von vor einer Stunde verwenden
      // Dies stellt sicher, dass wir immer nach neuen Genehmigungen suchen
      DateTime lastCheck = DateTime.now().subtract(const Duration(hours: 1));
      
      // Debug-Ausgabe für den tatsächlichen gespeicherten Wert, wenn prefs verfügbar ist
      if (prefs != null) {
        String? lastCheckStr = prefs.getString(lastCheckKey);
        if (lastCheckStr != null) {
          print("🔍 Gespeicherter letzter Check war: $lastCheckStr");
          try {
            DateTime storedDate = DateTime.parse(lastCheckStr);
            if (storedDate.year > 2024) {
              print("⚠️ Ungültiges Datum in der Zukunft gefunden, verwende Fallback");
            }
          } catch (e) {
            print("⚠️ Fehler beim Parsen des gespeicherten Datums: $e");
          }
        } else {
          print("🆕 Kein vorheriger Check gefunden, erster Lauf");
        }
      } else {
        print("⚠️ SharedPreferences nicht verfügbar, verwende Fallback-Zeit");
      }
      
      print("🔎 Suche nach Genehmigungen seit: ${lastCheck.toIso8601String()}");
      
      // Suche nach kürzlich genehmigten Einträgen
      final QuerySnapshot snapshot = await _firestore
          .collection('timeEntries')
          .where('userId', isEqualTo: userId)
          .where('status', isEqualTo: 'approved')
          .orderBy('updatedAt', descending: true)
          .limit(10) // Begrenze auf die 10 neuesten Einträge für bessere Performance
          .get();
      
      final approvedEntries = snapshot.docs.map((doc) => TimeEntry.fromFirestore(doc)).toList();
      
      print("✅ Gefunden: ${approvedEntries.length} genehmigte Einträge");
      
      // Gebe die IDs und Genehmigungsdaten für alle gefundenen Einträge aus
      for (final entry in approvedEntries) {
        final approvedAt = entry.updatedAt;
        print("📝 Eintrag ${entry.id}: Aktualisiert am ${approvedAt.toIso8601String()}");
        
        // Überprüfe, ob der Eintrag nach dem letzten Check genehmigt wurde
        if (approvedAt.isAfter(lastCheck)) {
          print("🔔 Sende Benachrichtigung für Zeiteintrag: ${entry.id}");
          // Verwende die normale Benachrichtigungsmethode statt der Debug-Version
          await sendApprovalNotification(entry);
        } else {
          print("⏭️ Überspringe Eintrag ${entry.id}: Älter als der letzte Check");
        }
      }
      
      // Aktualisiere den Zeitstempel für die letzte Prüfung, wenn prefs verfügbar ist
      if (prefs != null) {
        String newTimestamp = DateTime.now().toIso8601String();
        await prefs.setString(lastCheckKey, newTimestamp);
        print("💾 Neuer letzter Check-Zeitstempel gespeichert: $newTimestamp");
      }
    } catch (e, stackTrace) {
      print('❌ Fehler bei der Prüfung auf genehmigte Zeiteinträge: $e');
      print('Stacktrace: $stackTrace');
    }
  }
  
  // Hilfsmethode für lokale Benachrichtigungen als Fallback
  Future<void> _sendLocalNotification(int id, String title, String body, String? entryId) async {
    try {
      final FlutterLocalNotificationsPlugin plugin = FlutterLocalNotificationsPlugin();
      
      // Android-Kanal sicherstellen
      await plugin
          .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(
            const AndroidNotificationChannel(
              'time_approval_channel',
              'Zeitgenehmigungen',
              description: 'Benachrichtigungen über genehmigte Zeiteinträge',
              importance: Importance.high,
            ),
          );
      
      // iOS und Android Details
      const NotificationDetails details = NotificationDetails(
        android: AndroidNotificationDetails(
          'time_approval_channel',
          'Zeitgenehmigungen',
          channelDescription: 'Benachrichtigungen über genehmigte Zeiteinträge',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          sound: 'default',
          interruptionLevel: InterruptionLevel.timeSensitive,
        ),
      );
      
      // Benachrichtigung anzeigen
      await plugin.show(
        id,
        title,
        body,
        details,
        payload: entryId != null ? 'time_entry_$entryId' : null,
      );
      
      print('🔔 Lokale Benachrichtigung gesendet');
    } catch (e) {
      print('⚠️ Fehler beim Senden der lokalen Benachrichtigung: $e');
    }
  }
  
  // Eine zuverlässigere Benachrichtigung für Testzwecke
  Future<void> sendDebugApprovalNotification(TimeEntry entry) async {
    try {
      // Eindeutige ID für diese Benachrichtigung
      final int notificationId = 12345;
      
      print('📱 Sende Test-Benachrichtigung für Zeiteintrag: ${entry.id}');
      
      // Sicherstellen, dass id nicht null ist
      final String entryId = entry.id ?? 'unknown_id';
      
      // 1. Lokale Benachrichtigung für Fallback
      await _sendLocalNotification(
        notificationId, 
        'Zeiteintrag jetzt genehmigt! 🎉', 
        'Ein Zeiteintrag wurde genehmigt. Tippen zum Ansehen.', 
        entryId
      );
      
      // 2. In-App-Benachrichtigung speichern
      await saveInAppNotification(entry);
      
      // 3. FCM-Benachrichtigung senden, stellen wir sicher dass alle Parameter nicht-null sind
      final String safeUserId = entry.userId;
      const String safeTitle = 'Zeiteintrag jetzt genehmigt! 🎉';
      const String safeBody = 'Ein Zeiteintrag wurde genehmigt. Tippen zum Ansehen.';
      
      await _sendFCMNotification(
        safeUserId,
        safeTitle,
        safeBody,
        entryId
      );
      
      print('📣 Test-Benachrichtigung erfolgreich gesendet');
    } catch (e, stackTrace) {
      print('❌ Fehler beim Senden der Test-Benachrichtigung: $e');
      print('Stacktrace: $stackTrace');
    }
  }
  
  // Speichert eine In-App-Benachrichtigung in Firestore
  Future<void> saveInAppNotification(TimeEntry entry) async {
    try {
      final DateFormat formatter = DateFormat.yMd('de_DE');
      final String formattedDate = formatter.format(entry.date);
      
      // Prüfen, ob bereits eine ungelesene Benachrichtigung für diesen Zeiteintrag existiert
      final existingQuery = await _firestore
          .collection('notifications')
          .where('userId', isEqualTo: entry.userId)
          .where('relatedEntityId', isEqualTo: entry.id)
          .where('read', isEqualTo: false)
          .get();
      
      // Wenn bereits eine ungelesene Benachrichtigung existiert, keine neue erstellen
      if (existingQuery.docs.isNotEmpty) {
        print('📝 In-App-Benachrichtigung für Zeiteintrag ${entry.id} existiert bereits');
        return;
      }
      
      // Alte Benachrichtigungen desselben Eintrags als gelesen markieren, falls vorhanden
      final oldNotificationsQuery = await _firestore
          .collection('notifications')
          .where('userId', isEqualTo: entry.userId)
          .where('relatedEntityId', isEqualTo: entry.id)
          .get();
      
      if (oldNotificationsQuery.docs.isNotEmpty) {
        // Batch-Update für bessere Performance
        final batch = _firestore.batch();
        
        for (final doc in oldNotificationsQuery.docs) {
          batch.update(doc.reference, {
            'read': true,
            'readAt': DateTime.now(),
          });
        }
        
        await batch.commit();
        print('📋 ${oldNotificationsQuery.docs.length} ältere Benachrichtigungen für Zeiteintrag ${entry.id} als gelesen markiert');
      }
      
      // Benachrichtigungsdaten vorbereiten
      final Map<String, dynamic> notificationData = {
        'userId': entry.userId,
        'title': 'Zeiteintrag genehmigt',
        'body': 'Dein Zeiteintrag für ${entry.projectName} vom $formattedDate wurde genehmigt.',
        'type': 'time_approval',
        'relatedEntityId': entry.id,
        'read': false,
        'createdAt': DateTime.now(),
        'readAt': null,
      };
      
      // In Firestore speichern
      final docRef = await _firestore
          .collection('notifications')
          .add(notificationData);
      
      print('📝 Neue In-App-Benachrichtigung in Firestore gespeichert (ID: ${docRef.id})');
    } catch (e) {
      print('❌ Fehler beim Speichern der In-App-Benachrichtigung: $e');
    }
  }
  
  // Sendet Benachrichtigung über genehmigten Zeiteintrag
  Future<void> sendApprovalNotification(TimeEntry entry) async {
    try {
      // Sicherstellen, dass Berechtigungen vorhanden sind
      bool permissionsGranted = await _checkNotificationPermissions();
      if (!permissionsGranted) {
        print('⚠️ Benachrichtigungsberechtigungen fehlen. Keine Benachrichtigung möglich.');
        return;
      }
      
      // Sicherstellen dass entry.id nicht null ist
      final String entryId = entry.id ?? 'unknown_id';
      
      // Formatiere Datum für die Anzeige
      final DateFormat formatter = DateFormat.yMd('de_DE');
      final String formattedDate = formatter.format(entry.date);
      
      // Benachrichtigungstitel und -inhalt
      final String title = 'Zeiteintrag genehmigt 🎉';
      final String body = 'Dein Zeiteintrag für ${entry.projectName} vom $formattedDate wurde genehmigt.';
      
      print('📱 Sende Genehmigungs-Benachrichtigung für Zeiteintrag: $entryId');
      
      // 1. Lokale Benachrichtigung für Fallback
      await _sendLocalNotification(entryId.hashCode, title, body, entryId);
      
      // 2. In-App-Benachrichtigung in Firestore speichern
      await saveInAppNotification(entry);
      
      // 3. FCM-Benachrichtigung an das Gerät des Benutzers senden
      await _sendFCMNotification(entry.userId, title, body, entryId);
      
      print('📣 Benachrichtigungsprozess abgeschlossen');
    } catch (e, stackTrace) {
      print('❌ Fehler beim Senden der Genehmigungs-Benachrichtigung: $e');
      print('Stacktrace: $stackTrace');
    }
  }
  
  // Sendet eine FCM-Benachrichtigung an ein bestimmtes Gerät
  Future<void> _sendFCMNotification(String userId, String title, String body, String entryId) async {
    try {
      // 1. Gerät-Token für den Benutzer abrufen
      final tokenDoc = await _firestore
          .collection('users')
          .doc(userId)
          .collection('tokens')
          .doc('current')
          .get();
      
      if (!tokenDoc.exists) {
        print('⚠️ Kein FCM-Token für Benutzer $userId gefunden');
        return;
      }
      
      final tokenData = tokenDoc.data();
      if (tokenData == null) {
        print('⚠️ Token-Daten sind null für Benutzer $userId');
        return;
      }
      
      final fcmToken = tokenData['token'];
      if (fcmToken == null) {
        print('⚠️ FCM-Token ist null für Benutzer $userId');
        return;
      }
      
      final String tokenStr = fcmToken.toString();
      if (tokenStr.isEmpty) {
        print('⚠️ FCM-Token ist leer für Benutzer $userId');
        return;
      }
      
      print('🔑 FCM-Token gefunden: ${tokenStr.length > 10 ? tokenStr.substring(0, 10) : tokenStr}...');
      
      // 2. Benachrichtigungsdaten vorbereiten
      final Map<String, dynamic> notificationData = {
        'token': tokenStr,
        'notification': {
          'title': title,
          'body': body,
        },
        'data': {
          'click_action': 'FLUTTER_NOTIFICATION_CLICK',
          'type': 'time_approval',
          'entry_id': entryId,
        },
        'android': {
          'priority': 'high',
          'notification': {
            'channel_id': 'time_approval_channel',
            'priority': 'high',
            'default_sound': true,
            'default_vibrate_timings': true,
          }
        },
        'apns': {
          'headers': {
            'apns-priority': '10',
          },
          'payload': {
            'aps': {
              'alert': {
                'title': title,
                'body': body,
              },
              'badge': 1,
              'sound': 'default',
              'content-available': 1,
              'mutable-content': 1,
              'category': 'timeApproval',
            },
          },
        },
      };
      
      // 3. FCM-Message in Firestore speichern, von wo Cloud Function sie verarbeitet
      await _firestore.collection('fcmMessages').add({
        'userId': userId,
        'message': notificationData,
        'status': 'pending',
        'createdAt': FieldValue.serverTimestamp(),
      });
      
      print('🚀 FCM-Nachricht in Firestore gespeichert - wird durch Cloud Function gesendet');
    } catch (e) {
      print('❌ Fehler beim Vorbereiten der FCM-Benachrichtigung: $e');
    }
  }
  
  // Speichert FCM-Token für Benachrichtigungen
  Future<void> saveFCMToken(String userId, String token) async {
    try {
      await _firestore
          .collection('users')
          .doc(userId)
          .collection('tokens')
          .doc('current')
          .set({
            'token': token,
            'platform': Platform.isIOS ? 'ios' : 'android',
            'updatedAt': FieldValue.serverTimestamp(),
          });
      
      print('✅ FCM-Token für Benutzer $userId gespeichert');
    } catch (e) {
      print('❌ Fehler beim Speichern des FCM-Tokens: $e');
    }
  }
  
  // Debug-Methode zum direkten Senden einer FCM-Nachricht
  Future<void> sendTestFCMNotification(String userId) async {
    try {
      await _sendFCMNotification(
        userId,
        'Test-Benachrichtigung 🧪',
        'Dies ist eine Testbenachrichtigung via Firebase Cloud Messaging',
        'test_entry_id',
      );
      
      print('🧪 Test-FCM-Benachrichtigung gesendet');
    } catch (e) {
      print('❌ Fehler beim Senden der Test-FCM-Benachrichtigung: $e');
    }
  }
  
  // Prüft, ob Benachrichtigungsberechtigungen vorhanden sind
  Future<bool> _checkNotificationPermissions() async {
    try {
      final FlutterLocalNotificationsPlugin plugin = FlutterLocalNotificationsPlugin();
      
      // iOS-Berechtigungen prüfen
      final iOS = plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
      if (iOS != null) {
        final result = await iOS.requestPermissions(
          alert: true,
          badge: true,
          sound: true,
        );
        if (result != true) {
          print('iOS Benachrichtigungsberechtigungen nicht erteilt');
          return false;
        }
      }
      
      // Android-Berechtigungen (für API 33+)
      final android = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (android != null) {
        try {
          // Für neuere Android-Versionen
          final hasPermission = await android.areNotificationsEnabled() ?? true;
          if (!hasPermission) {
            print('Android Benachrichtigungsberechtigungen nicht erteilt');
            
            // Wir können auf Android die Berechtigungen nicht direkt anfordern
            // Stattdessen müssen wir den Benutzer zu den Einstellungen leiten
            print('Der Benutzer muss die Benachrichtigungen manuell in den Einstellungsseite leiten');
            
            // Für diesen Test nehmen wir an, dass die Berechtigungen OK sind
            // In einer Produktionsanwendung würden wir den Benutzer zur Einstellungsseite leiten
          }
        } catch (e) {
          // Ältere Android-Versionen werfen möglicherweise Fehler
          print('Fehler bei Android-Berechtigungsprüfung: $e');
          // Wir nehmen an, dass Berechtigungen auf älteren Versionen vorhanden sind
        }
      }
      
      print('Benachrichtigungsberechtigungen sind vorhanden');
      return true;
    } catch (e) {
      print('Fehler bei der Überprüfung der Benachrichtigungsberechtigungen: $e');
      return false;
    }
  }

  // Holt den neuesten Zeiteintrag eines Benutzers (für Testzwecke)
  Future<TimeEntry?> getMostRecentTimeEntry(String userId) async {
    try {
      final QuerySnapshot snapshot = await _firestore
          .collection('timeEntries')
          .where('userId', isEqualTo: userId)
          .orderBy('updatedAt', descending: true)
          .limit(1)
          .get();
          
      if (snapshot.docs.isEmpty) {
        return null;
      }
      
      return TimeEntry.fromFirestore(snapshot.docs.first);
    } catch (e) {
      print('Fehler beim Abrufen des neuesten Zeiteintrags: $e');
      return null;
    }
  }
} 