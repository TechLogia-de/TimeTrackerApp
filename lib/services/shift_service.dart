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
      
      final querySnapshot = await _firestore
          .collection('shifts')
          .where('date', isGreaterThanOrEqualTo: startDateStr)
          .where('date', isLessThanOrEqualTo: endDateStr)
          .orderBy('date')
          .get();
      
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
  
  // Eine Schicht akzeptieren
  Future<bool> acceptShift(String shiftId) async {
    try {
      // Aktuelle Benutzer-ID
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        return false;
      }
      
      // Schicht-Dokument abrufen
      final shiftDoc = await _firestore.collection('shifts').doc(shiftId).get();
      if (!shiftDoc.exists) {
        return false;
      }
      
      final shiftData = shiftDoc.data()!;
      final assignedUsers = List<Map<String, dynamic>>.from(
        shiftData['assignedUsers'] ?? []
      );
      
      // Index des aktuellen Benutzers in der Liste finden
      final userIndex = assignedUsers.indexWhere((user) => user['userId'] == currentUser.uid);
      
      if (userIndex >= 0) {
        // Benutzerstatus auf 'accepted' setzen
        assignedUsers[userIndex]['status'] = 'accepted';
        
        // Schicht aktualisieren
        await _firestore.collection('shifts').doc(shiftId).update({
          'assignedUsers': assignedUsers,
        });
        
        return true;
      }
      
      return false;
    } catch (e) {
      print('Fehler beim Akzeptieren der Schicht: $e');
      return false;
    }
  }
  
  // Eine Schicht ablehnen
  Future<bool> declineShift(String shiftId) async {
    try {
      // Aktuelle Benutzer-ID
      final currentUser = _auth.currentUser;
      if (currentUser == null) {
        return false;
      }
      
      // Schicht-Dokument abrufen
      final shiftDoc = await _firestore.collection('shifts').doc(shiftId).get();
      if (!shiftDoc.exists) {
        return false;
      }
      
      final shiftData = shiftDoc.data()!;
      final assignedUsers = List<Map<String, dynamic>>.from(
        shiftData['assignedUsers'] ?? []
      );
      
      // Index des aktuellen Benutzers in der Liste finden
      final userIndex = assignedUsers.indexWhere((user) => user['userId'] == currentUser.uid);
      
      if (userIndex >= 0) {
        // Benutzerstatus auf 'declined' setzen
        assignedUsers[userIndex]['status'] = 'declined';
        
        // Schicht aktualisieren
        await _firestore.collection('shifts').doc(shiftId).update({
          'assignedUsers': assignedUsers,
        });
        
        return true;
      }
      
      return false;
    } catch (e) {
      print('Fehler beim Ablehnen der Schicht: $e');
      return false;
    }
  }
  
  // Helfer-Methode zur Formatierung des Datums
  String _formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
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