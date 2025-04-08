import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:provider/provider.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'providers/auth_provider.dart';
import 'services/firebase_service.dart';

export 'package:timetrackerapp/main.dart' show AuthWrapper;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    // Versuche zuerst ohne Optionen zu initialisieren
    await Firebase.initializeApp();
    
    // App Check für zusätzliche Sicherheit aktivieren
    await FirebaseAppCheck.instance.activate(
      // Für die Entwicklung Debug-Provider verwenden
      // Im Produktivbetrieb sollten Sie einen echten Provider verwenden
      webProvider: ReCaptchaV3Provider('recaptcha-v3-site-key'),
      androidProvider: AndroidProvider.debug,
      appleProvider: AppleProvider.debug,
    );
  } catch (e) {
    print('Firebase-Initialisierung fehlgeschlagen: $e');
    // Falls nötig, können Sie hier Firebase-Optionen hinzufügen
    // oder andere Initialisierungsstrategien implementieren
  }
  
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (context) => AuthProvider(),
      child: MaterialApp(
        title: 'Zeiterfassung App',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
          useMaterial3: true,
        ),
        home: const AuthWrapper(),
      ),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    
    // Überprüfen Sie, ob der Benutzer angemeldet ist
    return authProvider.isAuthenticated
        ? const HomeScreen()
        : const LoginScreen();
  }
}
