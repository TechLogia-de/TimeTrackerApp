import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class FirebaseService {
  static final FirebaseAuth _auth = FirebaseAuth.instance;
  static final FirebaseFirestore _db = FirebaseFirestore.instance;

  // Firebase initialisieren
  static Future<void> initializeFirebase() async {
    await Firebase.initializeApp();
  }

  // Anmeldung mit E-Mail und Passwort
  static Future<UserCredential?> signInWithEmailAndPassword(
      String email, String password) async {
    try {
      return await _auth.signInWithEmailAndPassword(
          email: email, password: password);
    } on FirebaseAuthException catch (e) {
      rethrow;
    }
  }

  // Registrierung mit E-Mail und Passwort
  static Future<UserCredential?> registerWithEmailAndPassword(
      String email, String password) async {
    try {
      return await _auth.createUserWithEmailAndPassword(
          email: email, password: password);
    } on FirebaseAuthException catch (e) {
      rethrow;
    }
  }

  // Abmeldung
  static Future<void> signOut() async {
    await _auth.signOut();
  }

  // Aktuellen Benutzer abrufen
  static User? getCurrentUser() {
    return _auth.currentUser;
  }

  // Benutzer in Firestore speichern
  static Future<void> saveUserData(String uid, Map<String, dynamic> data) async {
    await _db.collection('users').doc(uid).set(data, SetOptions(merge: true));
  }
} 