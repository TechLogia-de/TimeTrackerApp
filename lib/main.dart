import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'firebase_options.dart';
import 'screens/auth_wrapper.dart';
import 'screens/main_layout.dart';
import 'screens/login_screen.dart';
import 'screens/admin/time_approval_screen.dart';
import 'services/customer_service.dart';
import 'services/project_service.dart';
import 'services/auth_service.dart';
import 'services/settings_service.dart';
import 'dart:io';


// Globale Instanzen für Services
final customerService = CustomerService();
final projectService = ProjectService();
final authService = AuthService();
final settingsService = SettingsService();

// Go Router Konfiguration
final _router = GoRouter(
  initialLocation: '/',
  redirect: (context, state) {
    // Überprüfe Authentifizierung
    final bool isLoggedIn = authService.currentUser != null;
    final bool isLoggingIn = state.fullPath == '/login';
    
    // Wenn nicht eingeloggt und nicht auf dem Login-Screen, zum Login
    if (!isLoggedIn && !isLoggingIn) {
      return '/login';
    }
    
    // Wenn eingeloggt und auf dem Login-Screen, zum Dashboard
    if (isLoggedIn && isLoggingIn) {
      return '/';
    }
    
    // Keine Umleitung notwendig
    return null;
  },
  routes: [
    GoRoute(
      path: '/',
      pageBuilder: (context, state) => NoTransitionPage<void>(
        key: state.pageKey,
        child: Builder(
          builder: (context) {
            final user = authService.currentUser;
            // Fallback zur AuthWrapper wenn kein Benutzer da ist
            if (user == null) return AuthWrapper();
            
            return MainLayout(
              user: user,
              initialTab: 0,
            );
          }
        ),
      ),
    ),
    GoRoute(
      path: '/time',
      pageBuilder: (context, state) => NoTransitionPage<void>(
        key: state.pageKey,
        child: Builder(
          builder: (context) {
            final user = authService.currentUser;
            // Fallback zur AuthWrapper wenn kein Benutzer da ist
            if (user == null) return AuthWrapper();
            
            return MainLayout(
              user: user,
              initialTab: 1,
            );
          }
        ),
      ),
    ),
    GoRoute(
      path: '/orders',
      pageBuilder: (context, state) => NoTransitionPage<void>(
        key: state.pageKey,
        child: Builder(
          builder: (context) {
            final user = authService.currentUser;
            // Fallback zur AuthWrapper wenn kein Benutzer da ist
            if (user == null) return AuthWrapper();
            
            return MainLayout(
              user: user,
              initialTab: 2,
            );
          }
        ),
      ),
    ),
    GoRoute(
      path: '/profile',
      pageBuilder: (context, state) => NoTransitionPage<void>(
        key: state.pageKey,
        child: Builder(
          builder: (context) {
            final user = authService.currentUser;
            // Fallback zur AuthWrapper wenn kein Benutzer da ist
            if (user == null) return AuthWrapper();
            
            return MainLayout(
              user: user,
              initialTab: 3,
            );
          }
        ),
      ),
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/admin/time_approval',
      pageBuilder: (context, state) => NoTransitionPage<void>(
        key: state.pageKey,
        child: Builder(
          builder: (context) {
            final user = authService.currentUser;
            // Fallback zur AuthWrapper wenn kein Benutzer da ist
            if (user == null) return AuthWrapper();
            
            // Der Zugriff auf den Bildschirm wird später im Bildschirm selbst geprüft
            return const TimeApprovalScreen();
          }
        ),
      ),
    ),
  ],
);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    print('🚀 App wird gestartet...');
    
    // Lokalisierungsdaten für Deutsch initialisieren
    await initializeDateFormatting('de_DE', null);
    print('✅ Lokalisierungsdaten initialisiert');
    
    // Firebase initialisieren
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    print('✅ Firebase initialisiert');
    
    // Services initialisieren
    await _initializeServices();
    
    // Prüfe Sitzungsgültigkeit
    await _checkSessionValidity();
    
    runApp(const MyApp());
    print('✅ App gestartet');
  } catch (e, stackTrace) {
    // Kritische Fehlerprotokollierung
    print('❌ KRITISCHER FEHLER BEIM APP-START: $e');
    print('Stacktrace: $stackTrace');
    
    // Trotzdem versuchen, die App zu starten
    runApp(const ErrorFallbackApp());
  }
}

// Fallback-App bei kritischen Fehlern
class ErrorFallbackApp extends StatelessWidget {
  const ErrorFallbackApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TimeTrackerApp - Fehler',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.red,
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.error_outline,
                  color: Colors.red,
                  size: 64,
                ),
                const SizedBox(height: 24),
                const Text(
                  'Es ist ein Fehler aufgetreten',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Die App konnte nicht korrekt gestartet werden. Bitte starten Sie die App neu oder kontaktieren Sie den Support.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () {
                    exit(0); // App beenden (erfordert dart:io import)
                  },
                  child: const Text('App neu starten'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// Initialisiert alle Services
Future<void> _initializeServices() async {
  try {
    // Lade Einstellungen
    await settingsService.init();
    print('✅ Einstellungen geladen');
    
    // Lade alle Kunden in den Cache
    await customerService.getAllCustomers();
    print('✅ Kundendaten geladen');
    
    // Lade alle Projekte in den Cache
    await projectService.getAllProjects();
    print('✅ Projektdaten geladen');
  } catch (e) {
    print('❌ Fehler beim Initialisieren der Services: $e');
  }
}

// Prüft, ob die aktuelle Sitzung noch gültig ist
Future<void> _checkSessionValidity() async {
  try {
    await authService.checkSessionValidity();
    print('✅ Sitzungsgültigkeit geprüft');
  } catch (e) {
    print('❌ Fehler bei der Sitzungsprüfung: $e');
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Dynamische Farben aus Settings verwenden
    final primaryColor = settingsService.themeColor;
    final accentColor = settingsService.accentColor;
    
    // Dunkelmodus-Einstellung auswerten
    final darkModeValue = settingsService.darkMode;
    ThemeMode themeMode;
    
    switch (darkModeValue) {
      case 'light':
        themeMode = ThemeMode.light;
        break;
      case 'dark':
        themeMode = ThemeMode.dark;
        break;
      default:
        themeMode = ThemeMode.system;
    }
    
    return MaterialApp.router(
      title: 'TimeTrackerApp',
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryColor,
          brightness: Brightness.light,
          primary: primaryColor,
          secondary: accentColor,
        ),
        textTheme: GoogleFonts.poppinsTextTheme(),
        useMaterial3: true,
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10.0),
          ),
          filled: true,
          fillColor: Colors.grey.shade100,
        ),
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryColor,
          brightness: Brightness.dark,
          primary: primaryColor,
          secondary: accentColor,
        ),
        textTheme: GoogleFonts.poppinsTextTheme(
          ThemeData.dark().textTheme,
        ),
        useMaterial3: true,
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10.0),
          ),
          filled: true,
          fillColor: Colors.grey.shade800,
        ),
      ),
      themeMode: themeMode,
    );
  }
}
