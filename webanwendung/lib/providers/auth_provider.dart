import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/firebase_service.dart';

class AuthProvider extends ChangeNotifier {
  User? _user;
  bool _isLoading = false;
  String _errorMessage = '';

  User? get user => _user;
  bool get isLoading => _isLoading;
  String get errorMessage => _errorMessage;
  bool get isAuthenticated => _user != null;

  AuthProvider() {
    try {
      _user = FirebaseService.getCurrentUser();
    } catch (e) {
      print('Firebase noch nicht initialisiert: $e');
      _errorMessage = 'Verbindungsfehler. Bitte versuchen Sie es später erneut.';
    }
  }

  // Anmeldung
  Future<bool> signIn(String email, String password) async {
    _setLoading(true);
    _clearError();

    try {
      final credential = await FirebaseService.signInWithEmailAndPassword(
          email, password);
      _user = credential?.user;
      _setLoading(false);
      notifyListeners();
      return true;
    } on FirebaseAuthException catch (e) {
      _handleAuthError(e);
      return false;
    }
  }

  // Registrierung
  Future<bool> register(String email, String password) async {
    _setLoading(true);
    _clearError();

    try {
      final credential = await FirebaseService.registerWithEmailAndPassword(
          email, password);
      _user = credential?.user;
      
      // Benutzerdaten in Firestore speichern
      if (_user != null) {
        await FirebaseService.saveUserData(_user!.uid, {
          'email': email,
          'createdAt': DateTime.now(),
        });
      }
      
      _setLoading(false);
      notifyListeners();
      return true;
    } on FirebaseAuthException catch (e) {
      _handleAuthError(e);
      return false;
    }
  }

  // Abmeldung
  Future<void> signOut() async {
    _setLoading(true);
    await FirebaseService.signOut();
    _user = null;
    _setLoading(false);
    notifyListeners();
  }

  // Fehlerbehandlung für Firebase Auth
  void _handleAuthError(FirebaseAuthException e) {
    String message;
    switch (e.code) {
      case 'user-not-found':
        message = 'Benutzer nicht gefunden.';
        break;
      case 'wrong-password':
        message = 'Falsches Passwort.';
        break;
      case 'email-already-in-use':
        message = 'E-Mail-Adresse wird bereits verwendet.';
        break;
      case 'weak-password':
        message = 'Das Passwort ist zu schwach.';
        break;
      case 'invalid-email':
        message = 'Ungültige E-Mail-Adresse.';
        break;
      default:
        message = 'Ein Fehler ist aufgetreten: ${e.message}';
    }
    _setError(message);
  }

  void _setLoading(bool loading) {
    _isLoading = loading;
    notifyListeners();
  }

  void _setError(String error) {
    _errorMessage = error;
    _isLoading = false;
    notifyListeners();
  }

  void _clearError() {
    _errorMessage = '';
    notifyListeners();
  }
} 