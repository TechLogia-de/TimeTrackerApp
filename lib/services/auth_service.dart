import 'package:firebase_auth/firebase_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  
  // Key für das Speichern des Login-Ablaufdatums in SharedPreferences
  static const String _loginExpiryKey = 'login_expiry_date';
  
  // Standarddauer für die Persistenz (30 Tage in Millisekunden)
  static const int _sessionDuration = 30 * 24 * 60 * 60 * 1000; // 30 Tage in ms

  // Stream, der den aktuellen Authentifizierungsstatus zurückgibt
  Stream<User?> get authStateChanges => _auth.authStateChanges();
  
  // Getter für den aktuell angemeldeten Benutzer
  User? get currentUser => _auth.currentUser;
  
  // Separate Methode zur Überprüfung der Sitzungsablaufzeit
  Future<void> checkSessionValidity() async {
    final user = _auth.currentUser;
    if (user == null) return;
    
    final isExpired = await _checkSessionExpiry();
    if (isExpired) {
      await signOut();
    }
  }

  // Mit E-Mail und Passwort anmelden
  Future<User?> signInWithEmailAndPassword(String email, String password) async {
    try {
      // Der direkte Aufruf von setPersistence kann zu Problemen führen
      // Stattdessen mit den Standard-Persistenzeinstellungen anmelden
      
      final result = await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      // Nach erfolgreicher Anmeldung das Ablaufdatum speichern
      await _setLoginExpiryDate();
      
      return result.user;
    } on FirebaseAuthException catch (e) {
      print('Login-Fehler: ${e.code}: ${e.message}');
      throw _handleAuthException(e);
    } catch (e) {
      print('Unerwarteter Login-Fehler: $e');
      throw Exception('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    }
  }

  // Neuen Benutzer mit E-Mail und Passwort registrieren
  Future<User?> registerWithEmailAndPassword(String email, String password) async {
    try {
      final result = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      // Nach erfolgreicher Registrierung das Ablaufdatum speichern
      await _setLoginExpiryDate();
      
      return result.user;
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // Passwort zurücksetzen
  Future<void> resetPassword(String email) async {
    try {
      await _auth.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  // Abmelden
  Future<void> signOut() async {
    // Ablaufdatum aus SharedPreferences löschen
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_loginExpiryKey);
    
    // Von Firebase abmelden
    await _auth.signOut();
  }
  
  // Speichert das Ablaufdatum der Anmeldung in SharedPreferences
  Future<void> _setLoginExpiryDate() async {
    final prefs = await SharedPreferences.getInstance();
    
    // Aktuelles Datum + 30 Tage
    final expiryDate = DateTime.now().add(const Duration(days: 30)).millisecondsSinceEpoch;
    
    await prefs.setInt(_loginExpiryKey, expiryDate);
  }
  
  // Prüft, ob die Anmeldung abgelaufen ist
  Future<bool> _checkSessionExpiry() async {
    final prefs = await SharedPreferences.getInstance();
    
    // Das gespeicherte Ablaufdatum abrufen
    final expiryTimestamp = prefs.getInt(_loginExpiryKey);
    
    // Wenn kein Ablaufdatum vorhanden ist, ist die Sitzung abgelaufen
    if (expiryTimestamp == null) return true;
    
    // Aktuelles Datum mit dem Ablaufdatum vergleichen
    final currentTime = DateTime.now().millisecondsSinceEpoch;
    
    return currentTime > expiryTimestamp;
  }

  // Fehlerbehandlung
  Exception _handleAuthException(FirebaseAuthException e) {
    print('Firebase Fehler: ${e.code}: ${e.message}');
    
    switch (e.code) {
      case 'user-not-found':
        return Exception('Kein Benutzer mit dieser E-Mail gefunden.');
      case 'wrong-password':
        return Exception('Falsches Passwort.');
      case 'email-already-in-use':
        return Exception('Diese E-Mail wird bereits verwendet.');
      case 'weak-password':
        return Exception('Das Passwort ist zu schwach.');
      case 'invalid-email':
        return Exception('Die E-Mail-Adresse ist ungültig.');
      case 'operation-not-allowed':
        return Exception('Die Operation ist nicht erlaubt.');
      case 'too-many-requests':
        return Exception('Zu viele Anfragen. Bitte versuchen Sie es später erneut.');
      default:
        return Exception('Ein Fehler ist aufgetreten: ${e.message}');
    }
  }
} 