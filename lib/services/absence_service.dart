import 'package:cloud_firestore/cloud_firestore.dart' as fb;
import 'package:intl/intl.dart';
import '../models/absence_model.dart';

/// Service für die Verwaltung von Abwesenheiten
class AbsenceService {
  static final fb.FirebaseFirestore _firestore = fb.FirebaseFirestore.instance;
  static final fb.CollectionReference _absencesCollection = _firestore.collection('absences');
  static final fb.CollectionReference _balancesCollection = _firestore.collection('absenceBalances');

  /// Holt alle Abwesenheiten eines Benutzers
  static Future<List<Absence>> getUserAbsences(String userId) async {
    try {
      final snapshot = await _absencesCollection
          .where('userId', isEqualTo: userId)
          .orderBy('startDate', descending: true)
          .get();

      return snapshot.docs
          .map((doc) => Absence.fromFirestore(doc as fb.DocumentSnapshot<Map<String, dynamic>>))
          .toList();
    } catch (e) {
      print('Fehler beim Laden der Abwesenheiten: $e');
      return [];
    }
  }

  /// Holt eine bestimmte Abwesenheit anhand der ID
  static Future<Absence?> getAbsenceById(String absenceId) async {
    try {
      final doc = await _absencesCollection.doc(absenceId).get();
      if (!doc.exists) return null;
      return Absence.fromFirestore(doc as fb.DocumentSnapshot<Map<String, dynamic>>);
    } catch (e) {
      print('Fehler beim Laden der Abwesenheit: $e');
      return null;
    }
  }

  /// Berechnet die Anzahl der Arbeitstage zwischen zwei Daten
  /// Berücksichtigt Wochenenden und halbe Tage
  static double calculateWorkdays(
    DateTime startDate,
    DateTime endDate,
    bool halfDayStart,
    bool halfDayEnd,
  ) {
    // Stelle sicher, dass Startdatum vor Enddatum liegt
    if (startDate.isAfter(endDate)) {
      return 0.0;
    }

    double days = 0.0;
    DateTime currentDate = DateTime(startDate.year, startDate.month, startDate.day);
    final lastDate = DateTime(endDate.year, endDate.month, endDate.day);

    while (!currentDate.isAfter(lastDate)) {
      // Wochenende ausschließen (6 = Samstag, 7 = Sonntag)
      final weekday = currentDate.weekday;
      if (weekday != 6 && weekday != 7) {
        days += 1.0;
      }
      currentDate = currentDate.add(const Duration(days: 1));
    }

    // Abzug für halbe Tage
    if (halfDayStart) days -= 0.5;
    if (halfDayEnd) days -= 0.5;

    return days > 0.0 ? days : 0.0;
  }

  /// Erstellt eine neue Abwesenheit
  static Future<String?> createAbsence({
    required AbsenceType type,
    required DateTime startDate,
    required DateTime endDate,
    bool halfDayStart = false,
    bool halfDayEnd = false,
    String? reason,
    String? notes,
    required String userId,
    required String userName,
    String? userEmail,
  }) async {
    try {
      // Überprüfen auf überlappende Abwesenheiten
      final existingAbsences = await getUserAbsences(userId);
      final overlappingAbsence = existingAbsences.where((absence) {
        // Nur aktive Abwesenheiten berücksichtigen
        if (absence.status == AbsenceStatus.REJECTED || 
            absence.status == AbsenceStatus.CANCELLED) {
          return false;
        }
        
        // Auf Überlappung prüfen
        return (startDate.isBefore(absence.endDate) || 
                startDate.isAtSameMomentAs(absence.endDate)) && 
               (endDate.isAfter(absence.startDate) || 
                endDate.isAtSameMomentAs(absence.startDate));
      }).firstOrNull;

      if (overlappingAbsence != null) {
        throw Exception('Es existiert bereits eine Abwesenheit in diesem Zeitraum');
      }

      // Arbeitstage berechnen
      final daysCount = calculateWorkdays(startDate, endDate, halfDayStart, halfDayEnd);

      // Neue Abwesenheit erstellen
      final absence = Absence(
        userId: userId,
        userName: userName,
        userEmail: userEmail,
        type: type,
        startDate: startDate,
        endDate: endDate,
        halfDayStart: halfDayStart,
        halfDayEnd: halfDayEnd,
        daysCount: daysCount,
        reason: reason,
        notes: notes,
        status: AbsenceStatus.PENDING,
        createdAt: DateTime.now(),
      );

      // In Firestore speichern
      final docRef = await _absencesCollection.add(absence.toFirestore());

      // Saldo aktualisieren, wenn es sich um einen Urlaubsantrag handelt
      if (type == AbsenceType.VACATION) {
        await _updateUserBalanceForPendingAbsence(userId, userName, startDate.year, daysCount);
      }

      return docRef.id;
    } catch (e) {
      print('Fehler beim Erstellen der Abwesenheit: $e');
      rethrow;
    }
  }

  /// Aktualisiert eine bestehende Abwesenheit
  static Future<void> updateAbsence({
    required String absenceId,
    required AbsenceType type,
    required DateTime startDate,
    required DateTime endDate,
    bool halfDayStart = false,
    bool halfDayEnd = false,
    String? reason,
    String? notes,
  }) async {
    try {
      // Aktuelle Abwesenheit laden
      final currentAbsence = await getAbsenceById(absenceId);
      if (currentAbsence == null) {
        throw Exception('Abwesenheit nicht gefunden');
      }

      // Wenn nicht mehr ausstehend, kann nicht bearbeitet werden
      if (currentAbsence.status != AbsenceStatus.PENDING && 
          currentAbsence.status != AbsenceStatus.APPROVED) {
        throw Exception('Diese Abwesenheit kann nicht mehr bearbeitet werden');
      }

      // Arbeitstage berechnen
      final daysCount = calculateWorkdays(startDate, endDate, halfDayStart, halfDayEnd);

      // Aktualisiertes Objekt erstellen
      final updatedAbsence = currentAbsence.copyWith(
        type: type,
        startDate: startDate,
        endDate: endDate,
        halfDayStart: halfDayStart,
        halfDayEnd: halfDayEnd,
        daysCount: daysCount,
        reason: reason,
        notes: notes,
        updatedAt: DateTime.now(),
        // Wenn genehmigt, setze auf ausstehend zurück
        status: currentAbsence.status == AbsenceStatus.APPROVED 
            ? AbsenceStatus.PENDING 
            : currentAbsence.status,
      );

      // In Firestore aktualisieren
      await _absencesCollection.doc(absenceId).update(updatedAbsence.toFirestore());

      // Saldo aktualisieren, wenn nötig
      if (type == AbsenceType.VACATION || currentAbsence.type == AbsenceType.VACATION) {
        final year = startDate.year;
        
        // Alte Tage entfernen
        if (currentAbsence.type == AbsenceType.VACATION) {
          await _updateUserBalanceForCancelledAbsence(
            currentAbsence.userId, 
            currentAbsence.userName, 
            currentAbsence.startDate.year, 
            currentAbsence.daysCount,
            currentAbsence.status,
          );
        }
        
        // Neue Tage hinzufügen
        if (type == AbsenceType.VACATION) {
          await _updateUserBalanceForPendingAbsence(
            currentAbsence.userId, 
            currentAbsence.userName, 
            year, 
            daysCount,
          );
        }
      }
    } catch (e) {
      print('Fehler beim Aktualisieren der Abwesenheit: $e');
      rethrow;
    }
  }

  /// Genehmigt eine Abwesenheit
  static Future<void> approveAbsence({
    required String absenceId,
    required String approverId,
    required String approverName,
  }) async {
    try {
      // Aktuelle Abwesenheit laden
      final currentAbsence = await getAbsenceById(absenceId);
      if (currentAbsence == null) {
        throw Exception('Abwesenheit nicht gefunden');
      }

      // Nur ausstehende Anträge können genehmigt werden
      if (currentAbsence.status != AbsenceStatus.PENDING) {
        throw Exception('Dieser Antrag kann nicht genehmigt werden');
      }

      // Aktualisiertes Objekt erstellen
      final updatedAbsence = currentAbsence.copyWith(
        status: AbsenceStatus.APPROVED,
        approvedBy: approverId,
        approverName: approverName,
        approvedAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      // In Firestore aktualisieren
      await _absencesCollection.doc(absenceId).update(updatedAbsence.toFirestore());

      // Saldo aktualisieren, wenn es sich um einen Urlaubsantrag handelt
      if (currentAbsence.type == AbsenceType.VACATION) {
        await _updateUserBalanceForApprovedAbsence(
          currentAbsence.userId,
          currentAbsence.userName,
          currentAbsence.startDate.year,
          currentAbsence.daysCount,
        );
      }
    } catch (e) {
      print('Fehler beim Genehmigen der Abwesenheit: $e');
      rethrow;
    }
  }

  /// Lehnt eine Abwesenheit ab
  static Future<void> rejectAbsence({
    required String absenceId,
    required String rejectorId,
    required String rejectorName,
    required String rejectionReason,
  }) async {
    try {
      // Aktuelle Abwesenheit laden
      final currentAbsence = await getAbsenceById(absenceId);
      if (currentAbsence == null) {
        throw Exception('Abwesenheit nicht gefunden');
      }

      // Nur ausstehende Anträge können abgelehnt werden
      if (currentAbsence.status != AbsenceStatus.PENDING) {
        throw Exception('Dieser Antrag kann nicht abgelehnt werden');
      }

      // Aktualisiertes Objekt erstellen
      final updatedAbsence = currentAbsence.copyWith(
        status: AbsenceStatus.REJECTED,
        rejectedBy: rejectorId,
        rejectionReason: rejectionReason,
        rejectedAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      // In Firestore aktualisieren
      await _absencesCollection.doc(absenceId).update(updatedAbsence.toFirestore());

      // Saldo aktualisieren, wenn es sich um einen Urlaubsantrag handelt
      if (currentAbsence.type == AbsenceType.VACATION) {
        await _updateUserBalanceForRejectedAbsence(
          currentAbsence.userId,
          currentAbsence.userName,
          currentAbsence.startDate.year,
          currentAbsence.daysCount,
        );
      }
    } catch (e) {
      print('Fehler beim Ablehnen der Abwesenheit: $e');
      rethrow;
    }
  }

  /// Storniert eine Abwesenheit
  static Future<void> cancelAbsence({
    required String absenceId,
    String? cancellationReason,
  }) async {
    try {
      // Aktuelle Abwesenheit laden
      final currentAbsence = await getAbsenceById(absenceId);
      if (currentAbsence == null) {
        throw Exception('Abwesenheit nicht gefunden');
      }

      // Nur ausstehende oder genehmigte Anträge können storniert werden
      if (currentAbsence.status != AbsenceStatus.PENDING && 
          currentAbsence.status != AbsenceStatus.APPROVED) {
        throw Exception('Dieser Antrag kann nicht storniert werden');
      }

      // Aktualisiertes Objekt erstellen
      final updatedAbsence = currentAbsence.copyWith(
        status: AbsenceStatus.CANCELLED,
        cancellationReason: cancellationReason,
        cancelledAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      // In Firestore aktualisieren
      await _absencesCollection.doc(absenceId).update(updatedAbsence.toFirestore());

      // Saldo aktualisieren, wenn es sich um einen Urlaubsantrag handelt
      if (currentAbsence.type == AbsenceType.VACATION) {
        await _updateUserBalanceForCancelledAbsence(
          currentAbsence.userId,
          currentAbsence.userName,
          currentAbsence.startDate.year,
          currentAbsence.daysCount,
          currentAbsence.status,
        );
      }
    } catch (e) {
      print('Fehler beim Stornieren der Abwesenheit: $e');
      rethrow;
    }
  }

  /// Löscht eine Abwesenheit
  static Future<void> deleteAbsence(String absenceId) async {
    try {
      // Aktuelle Abwesenheit laden
      final currentAbsence = await getAbsenceById(absenceId);
      if (currentAbsence == null) {
        throw Exception('Abwesenheit nicht gefunden');
      }

      // In Firestore löschen
      await _absencesCollection.doc(absenceId).delete();

      // Saldo aktualisieren, wenn es sich um einen Urlaubsantrag handelt
      if (currentAbsence.type == AbsenceType.VACATION) {
        await _updateUserBalanceForCancelledAbsence(
          currentAbsence.userId,
          currentAbsence.userName,
          currentAbsence.startDate.year,
          currentAbsence.daysCount,
          currentAbsence.status,
        );
      }
    } catch (e) {
      print('Fehler beim Löschen der Abwesenheit: $e');
      rethrow;
    }
  }

  /// Holt das Urlaubskonto eines Benutzers für ein bestimmtes Jahr
  static Future<AbsenceBalance?> getAbsenceBalance(String userId, int year) async {
    try {
      final snapshot = await _balancesCollection
          .where('userId', isEqualTo: userId)
          .where('year', isEqualTo: year)
          .limit(1)
          .get();

      if (snapshot.docs.isEmpty) {
        return null;
      }

      return AbsenceBalance.fromFirestore(
          snapshot.docs.first as fb.DocumentSnapshot<Map<String, dynamic>>);
    } catch (e) {
      print('Fehler beim Laden des Urlaubskontos: $e');
      return null;
    }
  }

  /// Hilfsmethode: Aktualisiert das Urlaubskonto für eine ausstehende Abwesenheit
  static Future<void> _updateUserBalanceForPendingAbsence(
    String userId,
    String userName,
    int year,
    double daysCount,
  ) async {
    final balanceRef = _getBalanceRef(userId, year);
    
    try {
      final docSnapshot = await balanceRef.get();
      
      if (docSnapshot.exists) {
        // Bestehendes Konto aktualisieren
        final balance = AbsenceBalance.fromFirestore(
            docSnapshot as fb.DocumentSnapshot<Map<String, dynamic>>);
        
        final updatedBalance = balance.copyWith(
          pendingDays: balance.pendingDays + daysCount,
          remainingDays: balance.remainingDays - daysCount,
          updatedAt: DateTime.now(),
        );
        
        await balanceRef.update(updatedBalance.toFirestore());
      } else {
        // Neues Konto erstellen (Standard: 30 Tage)
        final defaultDays = 30.0;
        
        final newBalance = AbsenceBalance(
          userId: userId,
          userName: userName,
          year: year,
          totalDays: defaultDays,
          usedDays: 0.0,
          pendingDays: daysCount,
          remainingDays: defaultDays - daysCount,
          carryOverDays: 0.0,
          sickDays: 0.0,
          updatedAt: DateTime.now(),
        );
        
        await balanceRef.set(newBalance.toFirestore());
      }
    } catch (e) {
      print('Fehler beim Aktualisieren des Urlaubskontos: $e');
      rethrow;
    }
  }

  /// Hilfsmethode: Aktualisiert das Urlaubskonto für eine genehmigte Abwesenheit
  static Future<void> _updateUserBalanceForApprovedAbsence(
    String userId,
    String userName,
    int year,
    double daysCount,
  ) async {
    final balanceRef = _getBalanceRef(userId, year);
    
    try {
      final docSnapshot = await balanceRef.get();
      
      if (docSnapshot.exists) {
        // Bestehendes Konto aktualisieren
        final balance = AbsenceBalance.fromFirestore(
            docSnapshot as fb.DocumentSnapshot<Map<String, dynamic>>);
        
        final updatedBalance = balance.copyWith(
          pendingDays: balance.pendingDays - daysCount,
          usedDays: balance.usedDays + daysCount,
          updatedAt: DateTime.now(),
        );
        
        await balanceRef.update(updatedBalance.toFirestore());
      } else {
        // Neues Konto erstellen (Standard: 30 Tage)
        final defaultDays = 30.0;
        
        final newBalance = AbsenceBalance(
          userId: userId,
          userName: userName,
          year: year,
          totalDays: defaultDays,
          usedDays: daysCount,
          pendingDays: 0.0,
          remainingDays: defaultDays - daysCount,
          carryOverDays: 0.0,
          sickDays: 0.0,
          updatedAt: DateTime.now(),
        );
        
        await balanceRef.set(newBalance.toFirestore());
      }
    } catch (e) {
      print('Fehler beim Aktualisieren des Urlaubskontos: $e');
      rethrow;
    }
  }

  /// Hilfsmethode: Aktualisiert das Urlaubskonto für eine abgelehnte Abwesenheit
  static Future<void> _updateUserBalanceForRejectedAbsence(
    String userId,
    String userName,
    int year,
    double daysCount,
  ) async {
    final balanceRef = _getBalanceRef(userId, year);
    
    try {
      final docSnapshot = await balanceRef.get();
      
      if (docSnapshot.exists) {
        // Bestehendes Konto aktualisieren
        final balance = AbsenceBalance.fromFirestore(
            docSnapshot as fb.DocumentSnapshot<Map<String, dynamic>>);
        
        final updatedBalance = balance.copyWith(
          pendingDays: balance.pendingDays - daysCount,
          remainingDays: balance.remainingDays + daysCount,
          updatedAt: DateTime.now(),
        );
        
        await balanceRef.update(updatedBalance.toFirestore());
      }
    } catch (e) {
      print('Fehler beim Aktualisieren des Urlaubskontos: $e');
      rethrow;
    }
  }

  /// Hilfsmethode: Aktualisiert das Urlaubskonto für eine stornierte Abwesenheit
  static Future<void> _updateUserBalanceForCancelledAbsence(
    String userId,
    String userName,
    int year,
    double daysCount,
    AbsenceStatus previousStatus,
  ) async {
    final balanceRef = _getBalanceRef(userId, year);
    
    try {
      final docSnapshot = await balanceRef.get();
      
      if (docSnapshot.exists) {
        // Bestehendes Konto aktualisieren
        final balance = AbsenceBalance.fromFirestore(
            docSnapshot as fb.DocumentSnapshot<Map<String, dynamic>>);
        
        final updatedBalance = previousStatus == AbsenceStatus.APPROVED
            ? balance.copyWith(
                usedDays: balance.usedDays - daysCount,
                remainingDays: balance.remainingDays + daysCount,
                updatedAt: DateTime.now(),
              )
            : balance.copyWith(
                pendingDays: balance.pendingDays - daysCount,
                remainingDays: balance.remainingDays + daysCount,
                updatedAt: DateTime.now(),
              );
        
        await balanceRef.update(updatedBalance.toFirestore());
      }
    } catch (e) {
      print('Fehler beim Aktualisieren des Urlaubskontos: $e');
      rethrow;
    }
  }

  /// Hilfsmethode: Erzeugt eine Referenz auf das Urlaubskonto
  static fb.DocumentReference _getBalanceRef(String userId, int year) {
    return _balancesCollection.doc('${userId}_$year');
  }
} 