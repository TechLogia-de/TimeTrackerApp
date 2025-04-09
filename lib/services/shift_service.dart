import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

// Schichtdienst für Firestore-Interaktionen
class ShiftService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseAuth _auth = FirebaseAuth.instance;

  // Singleton-Implementierung
  static final ShiftService _instance = ShiftService._internal();
  
  factory ShiftService() {
    return _instance;
  }
  
  ShiftService._internal();

  // Alle Schichten abrufen
  Future<List<Map<String, dynamic>>> getAllShifts() async {
    try {
      final querySnapshot = await _firestore
          .collection('shifts')
          .orderBy('date')
          .get();
      
      return querySnapshot.docs
          .map((doc) => {
                'id': doc.id,
                ...doc.data(),
              })
          .toList();
    } catch (e) {
      print('Fehler beim Abrufen aller Schichten: $e');
      return [];
    }
  }
  
  // Schichten für einen bestimmten Zeitraum abrufen
  Future<List<Map<String, dynamic>>> getShiftsForDateRange(DateTime start, DateTime end) async {
    try {
      // Konvertiere Datum in String-Format für Firestore-Query
      final startDateStr = _formatDate(start);
      final endDateStr = _formatDate(end);
      
      print('Suche Schichten zwischen $startDateStr und $endDateStr');
      
      final querySnapshot = await _firestore
          .collection('shifts')
          .where('date', isGreaterThanOrEqualTo: startDateStr)
          .where('date', isLessThanOrEqualTo: endDateStr)
          .orderBy('date')
          .get();
      
      print('Gefundene Schichten: ${querySnapshot.docs.length}');
      
      // Debug: Ausgabe einer beispielhaften Schicht, wenn vorhanden
      if (querySnapshot.docs.isNotEmpty) {
        print('Beispiel-Schicht: ${querySnapshot.docs.first.data()}');
      }
      
      return querySnapshot.docs
          .map((doc) => {
                'id': doc.id,
                ...doc.data(),
              })
          .toList();
    } catch (e) {
      print('Fehler beim Abrufen der Schichten für Zeitraum: $e');
      return [];
    }
  }
  
  // Schichten für einen bestimmten Benutzer abrufen
  Future<List<Map<String, dynamic>>> getShiftsForUser(String userId) async {
    try {
      final querySnapshot = await _firestore
          .collection('shifts')
          .get();
      
      // Filtere Schichten, bei denen der Benutzer zugewiesen ist
      final userShifts = querySnapshot.docs
          .where((doc) {
            final data = doc.data();
            final assignedUsers = data['assignedUsers'] as List<dynamic>?;
            return assignedUsers != null && 
                  assignedUsers.any((assignment) => assignment['userId'] == userId);
          })
          .map((doc) => {
                'id': doc.id,
                ...doc.data(),
              })
          .toList();
      
      return userShifts;
    } catch (e) {
      print('Fehler beim Abrufen der Schichten für Benutzer: $e');
      return [];
    }
  }
  
  // Eine Schicht akzeptieren - angepasst an die Webanwendung
  Future<bool> acceptShift(String shiftId) async {
    try {
      // Wenn die ID mit "real_" beginnt, entferne es für den Firestore-Zugriff
      String firestoreDocId = shiftId;
      if (shiftId.startsWith("real_")) {
        firestoreDocId = shiftId.substring(5); // Entferne "real_"
        print('Verwende Firestore Dokument-ID: $firestoreDocId');
      }
      
      // Aktuelle Benutzer-ID
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        print('Fehler: Kein aktueller Benutzer angemeldet');
        return false;
      }
      
      print('Versuche Schicht $firestoreDocId zu akzeptieren für Benutzer ${currentUser.uid}');
      
      // Schicht-Dokument mit der korrekten ID abrufen
      final shiftDoc = await _firestore.collection('shifts').doc(firestoreDocId).get();
      if (!shiftDoc.exists) {
        print('Fehler: Schicht mit ID $firestoreDocId existiert nicht');
        return false;
      }
      
      print('Schicht gefunden: ${shiftDoc.id}');
      
      final shiftData = shiftDoc.data()!;
      
      // Prüfen, ob das assignedUsers-Feld existiert
      if (!shiftData.containsKey('assignedUsers')) {
        print('Fehler: Das Feld "assignedUsers" existiert nicht in der Schicht');
        return false;
      }
      
      // Die zugewiesenen Benutzer extrahieren
      final assignedUsersRaw = shiftData['assignedUsers'];
      print('ASSIGNED USERS TYPE: ${assignedUsersRaw.runtimeType}');
      
      // Sicherstellen, dass wir mit einer Liste arbeiten
      if (!(assignedUsersRaw is List)) {
        print('Fehler: assignedUsers ist keine Liste, sondern ${assignedUsersRaw.runtimeType}');
        return false;
      }
      
      List<dynamic> rawAssignedUsers = assignedUsersRaw;
      print('Anzahl zugewiesener Benutzer: ${rawAssignedUsers.length}');
      
      // Liste für das Update vorbereiten
      List<Map<String, dynamic>> assignedUsers = [];
      
      // Alle Benutzer in der Liste durchgehen und korrekte Maps erstellen
      for (var user in rawAssignedUsers) {
        if (user is Map) {
          Map<String, dynamic> userMap = {};
          user.forEach((key, value) {
            if (key is String) {
              userMap[key] = value;
            } else {
              userMap[key.toString()] = value;
            }
          });
          assignedUsers.add(userMap);
        } else {
          print('Warnung: Ein Benutzer ist kein Map: $user');
        }
      }
      
      // Bestehenden Benutzer finden oder neuen hinzufügen
      int userIndex = -1;
      for (int i = 0; i < assignedUsers.length; i++) {
        if (assignedUsers[i]['userId'] == currentUser.uid) {
          userIndex = i;
          break;
        }
      }
      
      if (userIndex >= 0) {
        print('Benutzer gefunden, aktualisiere Status von "${assignedUsers[userIndex]['status']}" zu "accepted"');
        // Status auf 'accepted' setzen
        assignedUsers[userIndex]['status'] = 'accepted';
      } else {
        print('Benutzer nicht gefunden. Füge neue Zuweisung hinzu.');
        // Neuen Benutzer hinzufügen
        assignedUsers.add({
          'userId': currentUser.uid,
          'userName': currentUser.displayName ?? 'Unbekannter Benutzer',
          'status': 'accepted',
        });
      }
      
      // Schicht aktualisieren
      try {
        print('Aktualisiere Schicht $firestoreDocId mit ${assignedUsers.length} Zuweisungen');
        print('Update-Daten: ${assignedUsers.toString()}');
        
        await _firestore.collection('shifts').doc(firestoreDocId).update({
          'assignedUsers': assignedUsers,
        });
        
        print('Schicht erfolgreich akzeptiert');
        return true;
      } catch (updateError) {
        print('Fehler beim Aktualisieren der Schicht: $updateError');
        return false;
      }
    } catch (e, stack) {
      print('Fehler beim Akzeptieren der Schicht: $e');
      print('Stack trace: $stack');
      return false;
    }
  }
  
  // Eine Schicht ablehnen - angepasst an die Webanwendung
  Future<bool> declineShift(String shiftId) async {
    try {
      // Wenn die ID mit "real_" beginnt, entferne es für den Firestore-Zugriff
      String firestoreDocId = shiftId;
      if (shiftId.startsWith("real_")) {
        firestoreDocId = shiftId.substring(5); // Entferne "real_"
        print('Verwende Firestore Dokument-ID: $firestoreDocId');
      }
      
      // Aktuelle Benutzer-ID
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        print('Fehler: Kein aktueller Benutzer angemeldet');
        return false;
      }
      
      print('Versuche Schicht $firestoreDocId abzulehnen für Benutzer ${currentUser.uid}');
      
      // Schicht-Dokument mit der korrekten ID abrufen
      final shiftDoc = await _firestore.collection('shifts').doc(firestoreDocId).get();
      if (!shiftDoc.exists) {
        print('Fehler: Schicht mit ID $firestoreDocId existiert nicht');
        return false;
      }
      
      final shiftData = shiftDoc.data()!;
      
      // Prüfen, ob das assignedUsers-Feld existiert
      if (!shiftData.containsKey('assignedUsers')) {
        print('Fehler: Das Feld "assignedUsers" existiert nicht in der Schicht');
        return false;
      }
      
      // Die zugewiesenen Benutzer extrahieren
      final assignedUsersRaw = shiftData['assignedUsers'];
      print('ASSIGNED USERS TYPE: ${assignedUsersRaw.runtimeType}');
      
      // Sicherstellen, dass wir mit einer Liste arbeiten
      if (!(assignedUsersRaw is List)) {
        print('Fehler: assignedUsers ist keine Liste, sondern ${assignedUsersRaw.runtimeType}');
        return false;
      }
      
      List<dynamic> rawAssignedUsers = assignedUsersRaw;
      print('Anzahl zugewiesener Benutzer: ${rawAssignedUsers.length}');
      
      // Liste für das Update vorbereiten
      List<Map<String, dynamic>> assignedUsers = [];
      
      // Alle Benutzer in der Liste durchgehen und korrekte Maps erstellen
      for (var user in rawAssignedUsers) {
        if (user is Map) {
          Map<String, dynamic> userMap = {};
          user.forEach((key, value) {
            if (key is String) {
              userMap[key] = value;
            } else {
              userMap[key.toString()] = value;
            }
          });
          assignedUsers.add(userMap);
        } else {
          print('Warnung: Ein Benutzer ist kein Map: $user');
        }
      }
      
      // Bestehenden Benutzer finden oder neuen hinzufügen
      int userIndex = -1;
      for (int i = 0; i < assignedUsers.length; i++) {
        if (assignedUsers[i]['userId'] == currentUser.uid) {
          userIndex = i;
          break;
        }
      }
      
      if (userIndex >= 0) {
        print('Benutzer gefunden, aktualisiere Status von "${assignedUsers[userIndex]['status']}" zu "declined"');
        // Status auf 'declined' setzen
        assignedUsers[userIndex]['status'] = 'declined';
      } else {
        print('Benutzer nicht gefunden. Füge neue Zuweisung hinzu.');
        // Neuen Benutzer hinzufügen
        assignedUsers.add({
          'userId': currentUser.uid,
          'userName': currentUser.displayName ?? 'Unbekannter Benutzer',
          'status': 'declined',
        });
      }
      
      // Schicht aktualisieren
      try {
        print('Aktualisiere Schicht $firestoreDocId mit ${assignedUsers.length} Zuweisungen');
        print('Update-Daten: ${assignedUsers.toString()}');
        
        await _firestore.collection('shifts').doc(firestoreDocId).update({
          'assignedUsers': assignedUsers,
        });
        
        print('Schicht erfolgreich abgelehnt');
        return true;
      } catch (updateError) {
        print('Fehler beim Aktualisieren der Schicht: $updateError');
        return false;
      }
    } catch (e, stack) {
      print('Fehler beim Ablehnen der Schicht: $e');
      print('Stack trace: $stack');
      return false;
    }
  }
  
  // Speichert eine komplette Schicht mit allen Daten
  Future<bool> saveShift(Map<String, dynamic> shiftData) async {
    try {
      final String? shiftId = shiftData['id'];
      
      // ID aus den Daten entfernen, da diese separat als Dokument-ID verwendet wird
      final Map<String, dynamic> dataToSave = Map<String, dynamic>.from(shiftData);
      dataToSave.remove('id');
      
      if (shiftId != null && shiftId != 'new') {
        // Bestehende Schicht aktualisieren
        await _firestore.collection('shifts').doc(shiftId).update(dataToSave);
      } else {
        // Neue Schicht erstellen
        await _firestore.collection('shifts').add(dataToSave);
      }
      
      return true;
    } catch (e) {
      print('Fehler beim Speichern der Schicht: $e');
      return false;
    }
  }
  
  // Helfer-Methode zur Formatierung des Datums
  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }
  
  // Min-Funktion, um die Substring-Länge zu begrenzen
  int min(int a, int b) {
    return a < b ? a : b;
  }
  
  // Verfügbarkeiten für einen Benutzer abrufen
  Future<List<Map<String, dynamic>>> getUserAvailabilities(String userId) async {
    try {
      final querySnapshot = await _firestore
          .collection('availabilities')
          .where('userId', isEqualTo: userId)
          .get();
      
      return querySnapshot.docs
          .map((doc) => {
                'id': doc.id,
                ...doc.data(),
              })
          .toList();
    } catch (e) {
      print('Fehler beim Abrufen der Verfügbarkeiten: $e');
      return [];
    }
  }
} 