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
      // Aktuelle Benutzer-ID
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        print('Fehler: Kein aktueller Benutzer angemeldet');
        return false;
      }
      
      print('Versuche Schicht $shiftId zu akzeptieren für Benutzer ${currentUser.uid}');
      
      // Schicht-Dokument abrufen
      final shiftDoc = await _firestore.collection('shifts').doc(shiftId).get();
      if (!shiftDoc.exists) {
        print('Fehler: Schicht mit ID $shiftId existiert nicht');
        return false;
      }
      
      print('Schicht gefunden: ${shiftDoc.id}');
      
      final shiftData = shiftDoc.data()!;
      
      // Vollständige Debug-Informationen zur Schicht
      print('VOLLSTÄNDIGE SCHICHTDATEN: ${shiftData.toString()}');
      
      // Prüfen, ob das assignedUsers-Feld existiert und eine Liste ist
      if (!shiftData.containsKey('assignedUsers')) {
        print('Fehler: Das Feld "assignedUsers" existiert nicht in der Schicht');
        return false;
      }
      
      // Die assignedUsers als Liste extrahieren und Typ prüfen
      final assignedUsersRaw = shiftData['assignedUsers'];
      print('ASSIGNED USERS RAW TYPE: ${assignedUsersRaw.runtimeType}');
      print('ASSIGNED USERS RAW: $assignedUsersRaw');
      
      List<dynamic> rawAssignedUsers;
      
      if (assignedUsersRaw is List) {
        rawAssignedUsers = assignedUsersRaw;
      } else {
        print('Fehler: assignedUsers ist keine Liste, sondern ${assignedUsersRaw.runtimeType}');
        return false;
      }
      
      print('Anzahl zugewiesener Benutzer: ${rawAssignedUsers.length}');
      
      // Debug: Ersten Eintrag ausgeben, wenn vorhanden
      if (rawAssignedUsers.isNotEmpty) {
        print('Erster zugewiesener Benutzer: ${rawAssignedUsers[0]}');
        print('Erster zugewiesener Benutzer Typ: ${rawAssignedUsers[0].runtimeType}');
      }
      
      // Kopie der Liste erstellen und in Maps umwandeln
      final List<Map<String, dynamic>> assignedUsers = [];
      
      // Iteriere über alle Benutzer und sammle sie korrekt
      for (var user in rawAssignedUsers) {
        try {
          if (user is Map) {
            // Konvertiere Map<dynamic, dynamic> zu Map<String, dynamic>
            final Map<String, dynamic> userMap = {};
            user.forEach((key, value) {
              if (key is String) {
                userMap[key] = value;
              } else {
                userMap[key.toString()] = value;
              }
            });
            assignedUsers.add(userMap);
          } else {
            print('Warnung: Benutzer ist kein Map, sondern ${user.runtimeType}');
          }
        } catch (e) {
          print('Fehler bei der Konvertierung eines Benutzers: $e');
        }
      }
      
      // Debug: Konvertierte Liste ausgeben
      print('KONVERTIERTE LISTE: $assignedUsers');
      
      // Index des aktuellen Benutzers in der Liste finden
      final userIndex = assignedUsers.indexWhere((user) {
        final userId = user['userId'];
        print('Vergleiche Benutzer-ID: $userId mit ${currentUser.uid}, sind gleich? ${userId == currentUser.uid}');
        return userId == currentUser.uid;
      });
      
      print('Benutzerindex in der Liste: $userIndex');
      
      if (userIndex >= 0) {
        print('Benutzer an Index $userIndex gefunden, aktueller Status: ${assignedUsers[userIndex]['status']}');
        
        // Benutzerstatus auf 'accepted' setzen - exakt wie in der Webanwendung
        assignedUsers[userIndex]['status'] = 'accepted';
        
        // Schicht aktualisieren - genau die gleiche Struktur wie vorher verwenden
        try {
          await _firestore.collection('shifts').doc(shiftId).update({
            'assignedUsers': assignedUsers,
          });
          
          print('Schicht erfolgreich aktualisiert');
          return true;
        } catch (updateError) {
          print('Fehler beim Aktualisieren der Schicht: $updateError');
          return false;
        }
      } else {
        print('Fehler: Benutzer ${currentUser.uid} ist nicht in dieser Schicht zugewiesen');
        
        // Debug: alle Benutzer-IDs in der Schicht ausgeben
        print('Alle zugewiesenen Benutzer:');
        for (var user in assignedUsers) {
          print('Zugewiesener Benutzer ID: ${user['userId']}, Name: ${user['userName']}');
        }
        
        // Möglicherweise müssen wir eine neue Zuweisung hinzufügen?
        print('Versuche, eine neue Zuweisung zu erstellen...');
        assignedUsers.add({
          'userId': currentUser.uid,
          'userName': currentUser.displayName ?? 'Unbekannter Benutzer',
          'status': 'accepted',
        });
        
        try {
          await _firestore.collection('shifts').doc(shiftId).update({
            'assignedUsers': assignedUsers,
          });
          
          print('Schicht erfolgreich mit neuer Benutzerzuweisung aktualisiert');
          return true;
        } catch (updateError) {
          print('Fehler beim Aktualisieren der Schicht mit neuer Zuweisung: $updateError');
          return false;
        }
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
      // Aktuelle Benutzer-ID
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        print('Fehler: Kein aktueller Benutzer angemeldet');
        return false;
      }
      
      print('Versuche Schicht $shiftId abzulehnen für Benutzer ${currentUser.uid}');
      
      // Schicht-Dokument abrufen
      final shiftDoc = await _firestore.collection('shifts').doc(shiftId).get();
      if (!shiftDoc.exists) {
        print('Fehler: Schicht mit ID $shiftId existiert nicht');
        return false;
      }
      
      final shiftData = shiftDoc.data()!;
      
      // Vollständige Debug-Informationen zur Schicht
      print('VOLLSTÄNDIGE SCHICHTDATEN: ${shiftData.toString()}');
      
      // Prüfen, ob das assignedUsers-Feld existiert und eine Liste ist
      if (!shiftData.containsKey('assignedUsers')) {
        print('Fehler: Das Feld "assignedUsers" existiert nicht in der Schicht');
        return false;
      }
      
      // Die assignedUsers als Liste extrahieren und Typ prüfen
      final assignedUsersRaw = shiftData['assignedUsers'];
      print('ASSIGNED USERS RAW TYPE: ${assignedUsersRaw.runtimeType}');
      print('ASSIGNED USERS RAW: $assignedUsersRaw');
      
      List<dynamic> rawAssignedUsers;
      
      if (assignedUsersRaw is List) {
        rawAssignedUsers = assignedUsersRaw;
      } else {
        print('Fehler: assignedUsers ist keine Liste, sondern ${assignedUsersRaw.runtimeType}');
        return false;
      }
      
      print('Anzahl zugewiesener Benutzer: ${rawAssignedUsers.length}');
      
      // Debug: Ersten Eintrag ausgeben, wenn vorhanden
      if (rawAssignedUsers.isNotEmpty) {
        print('Erster zugewiesener Benutzer: ${rawAssignedUsers[0]}');
        print('Erster zugewiesener Benutzer Typ: ${rawAssignedUsers[0].runtimeType}');
      }
      
      // Kopie der Liste erstellen und in Maps umwandeln
      final List<Map<String, dynamic>> assignedUsers = [];
      
      // Iteriere über alle Benutzer und sammle sie korrekt
      for (var user in rawAssignedUsers) {
        try {
          if (user is Map) {
            // Konvertiere Map<dynamic, dynamic> zu Map<String, dynamic>
            final Map<String, dynamic> userMap = {};
            user.forEach((key, value) {
              if (key is String) {
                userMap[key] = value;
              } else {
                userMap[key.toString()] = value;
              }
            });
            assignedUsers.add(userMap);
          } else {
            print('Warnung: Benutzer ist kein Map, sondern ${user.runtimeType}');
          }
        } catch (e) {
          print('Fehler bei der Konvertierung eines Benutzers: $e');
        }
      }
      
      // Debug: Konvertierte Liste ausgeben
      print('KONVERTIERTE LISTE: $assignedUsers');
      
      // Index des aktuellen Benutzers in der Liste finden
      final userIndex = assignedUsers.indexWhere((user) {
        final userId = user['userId'];
        print('Vergleiche Benutzer-ID: $userId mit ${currentUser.uid}, sind gleich? ${userId == currentUser.uid}');
        return userId == currentUser.uid;
      });
      
      print('Benutzerindex in der Liste: $userIndex');
      
      if (userIndex >= 0) {
        print('Benutzer an Index $userIndex gefunden, aktueller Status: ${assignedUsers[userIndex]['status']}');
        
        // Benutzerstatus auf 'declined' setzen - exakt wie in der Webanwendung
        assignedUsers[userIndex]['status'] = 'declined';
        
        // Schicht aktualisieren
        try {
          await _firestore.collection('shifts').doc(shiftId).update({
            'assignedUsers': assignedUsers,
          });
          
          print('Schicht erfolgreich aktualisiert');
          return true;
        } catch (updateError) {
          print('Fehler beim Aktualisieren der Schicht: $updateError');
          return false;
        }
      } else {
        print('Fehler: Benutzer ${currentUser.uid} ist nicht in dieser Schicht zugewiesen');
        
        // Debug: alle Benutzer-IDs in der Schicht ausgeben
        print('Alle zugewiesenen Benutzer:');
        for (var user in assignedUsers) {
          print('Zugewiesener Benutzer ID: ${user['userId']}, Name: ${user['userName']}');
        }
        
        // Möglicherweise müssen wir eine neue Zuweisung hinzufügen?
        print('Versuche, eine neue Zuweisung zu erstellen...');
        assignedUsers.add({
          'userId': currentUser.uid,
          'userName': currentUser.displayName ?? 'Unbekannter Benutzer',
          'status': 'declined',
        });
        
        try {
          await _firestore.collection('shifts').doc(shiftId).update({
            'assignedUsers': assignedUsers,
          });
          
          print('Schicht erfolgreich mit neuer Benutzerzuweisung (abgelehnt) aktualisiert');
          return true;
        } catch (updateError) {
          print('Fehler beim Aktualisieren der Schicht mit neuer Zuweisung: $updateError');
          return false;
        }
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