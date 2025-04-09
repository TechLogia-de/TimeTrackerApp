import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../main.dart';

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    // Statt direktem Zugriff auf currentUser, nutze den Stream
    return StreamBuilder<User?>(
      stream: authService.authStateChanges,
      builder: (context, snapshot) {
        // Hier Ladeindikator anzeigen, wenn noch keine Daten verfügbar sind
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        
        // Wir verbinden den User mit der entsprechenden Screen-Route
        // Die Navigation erfolgt über den Router in main.dart
        return Container(); // Leerer Container, Navigation über den Router
      },
    );
  }
} 