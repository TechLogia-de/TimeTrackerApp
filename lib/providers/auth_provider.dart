import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Provider für die Authentifizierung
class AuthProvider extends ChangeNotifier {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  
  /// Der aktuelle Benutzer
  User? get currentUser => _auth.currentUser;
  
  /// Prüft, ob ein Benutzer angemeldet ist
  bool get isAuthenticated => _auth.currentUser != null;
  
  /// Stream der Authentifizierungsänderungen
  Stream<User?> get authStateChanges => _auth.authStateChanges();
  
  /// Initialisiert den Provider und hört auf Authentifizierungsänderungen
  AuthProvider() {
    _auth.authStateChanges().listen((User? user) {
      notifyListeners();
    });
  }
} 