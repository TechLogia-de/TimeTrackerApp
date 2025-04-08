import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:easy_localization/easy_localization.dart';
import 'firebase_options.dart';
import 'screens/auth_wrapper.dart';
import 'screens/main_layout.dart';
import 'screens/login_screen.dart';
import 'screens/admin/time_approval_screen.dart';
import 'services/customer_service.dart';
import 'services/project_service.dart';
import 'services/auth_service.dart';
import 'services/settings_service.dart';
import 'services/time/time_entry_service.dart';
import 'dart:io';
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

// GoRouterRefreshStream Klasse zur Reaktion auf Auth-Änderungen
class GoRouterRefreshStream extends ChangeNotifier {
  late final StreamSubscription<dynamic> _subscription;
  
  GoRouterRefreshStream(Stream<dynamic> stream) {
    _subscription = stream.asBroadcastStream().listen(
      (dynamic _) {
        // Benachrichtige Hörer über Änderungen am Authentifizierungsstatus,
        // damit der Router entsprechend reagieren kann
        notifyListeners();
      },
    );
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

// Globale Instanzen für Services
final customerService = CustomerService();
final projectService = ProjectService();
final authService = AuthService();
final settingsService = SettingsService();
final timeEntryService = TimeEntryService();

// Hintergrund-Handler für FCM-Nachrichten, wenn die App geschlossen ist
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Stelle sicher, dass Firebase initialisiert ist
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  
  print("📱 Hintergrund-Nachricht empfangen: ${message.messageId}");
  
  // Du kannst hier keine UI-Aktionen ausführen, aber Daten speichern oder lokale Benachrichtigungen anzeigen
  await initNotifications();
  
  final flutterLocalNotificationsPlugin = FlutterLocalNotificationsPlugin();
  
  await flutterLocalNotificationsPlugin.show(
    message.hashCode,
    message.notification?.title ?? 'Neue Benachrichtigung',
    message.notification?.body ?? 'Tippen zum Anzeigen',
    const NotificationDetails(
      android: AndroidNotificationDetails(
        'time_approval_channel',
        'Zeitgenehmigungen',
        channelDescription: 'Benachrichtigungen über genehmigte Zeiteinträge',
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        sound: 'default',
      ),
    ),
    payload: message.data['entry_id'],
  );
}

// Go Router Konfiguration
final _router = GoRouter(
  initialLocation: '/',
  // refreshListenable hier, damit Router auf Auth-Änderungen reagiert
  refreshListenable: GoRouterRefreshStream(authService.authStateChanges),
  debugLogDiagnostics: true, // Hilft bei der Fehlersuche
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
  try {
    WidgetsFlutterBinding.ensureInitialized();
    
    // Initialisieren von EasyLocalization
    try {
      await EasyLocalization.ensureInitialized();
      print('✅ EasyLocalization erfolgreich initialisiert');
    } catch (e) {
      print('⚠️ Fehler bei der Initialisierung von EasyLocalization: $e');
      // Fahre trotzdem fort, um andere Funktionen zu ermöglichen
    }
    
    // Firebase initialisieren
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform
    );
    
    // FCM-Hintergrund-Handler registrieren
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
    
    // Initialisiere FCM
    await initFirebaseMessaging();
    
    // Initialisiere lokale Benachrichtigungen
    await initNotifications();
    
    // Initialisiere das Datum-Format für die deutsche Lokalisierung
    await initializeDateFormatting('de_DE', null);
    // Initialisiere auch die englische Lokalisierung
    await initializeDateFormatting('en_US', null);
    
    // Starte die App mit EasyLocalization
    runApp(
      EasyLocalization(
        supportedLocales: const [
          Locale('de'),
          Locale('en'),
        ],
        path: 'assets/translations',
        fallbackLocale: const Locale('de'),
        child: const MyApp(),
      ),
    );
  } catch (e, stackTrace) {
    print('❌ Kritischer Fehler beim Starten der App: $e');
    print('Stacktrace: $stackTrace');
    
    // Fallback-App bei kritischen Fehlern anzeigen
    runApp(const ErrorFallbackApp());
  }
}

// Initialisiert Firebase Cloud Messaging
Future<void> initFirebaseMessaging() async {
  try {
    final messaging = FirebaseMessaging.instance;
    
    // Berechtigungen anfordern
    NotificationSettings settings = await messaging.requestPermission(
      alert: true,
      announcement: false,
      badge: true,
      carPlay: false,
      criticalAlert: true,
      provisional: true,
      sound: true,
    );
    
    print('⚙️ FCM-Benachrichtigungseinstellungen: ${settings.authorizationStatus}');
    
    // iOS Vordergrund-Benachrichtigungen aktivieren
    await messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );
    
    // Aktuelles FCM-Token abrufen - mit Fehlerbehandlung
    try {
      // Plattformspezifische Behandlung für iOS
      if (Platform.isIOS) {
        // Für iOS: Warten auf APNS-Token
        try {
          final apnsToken = await messaging.getAPNSToken();
          if (apnsToken == null) {
            print('⚠️ APNS-Token ist nicht verfügbar, warte auf nächsten App-Start');
            // Fahre fort ohne FCM-Token zu setzen
            return;
          }
          print('✅ APNS-Token erfolgreich abgerufen');
        } catch (e) {
          print('⚠️ Fehler beim Abrufen des APNS-Tokens: $e');
          // Fahre fort ohne FCM-Token zu setzen
          return;
        }
      }
      
      String? token = await messaging.getToken();
      if (token != null) {
        print('📱 FCM-Token: ${token.substring(0, 20)}...');
        
        // Wenn ein Benutzer angemeldet ist, Token mit der Benutzer-ID speichern
        final currentUser = authService.currentUser;
        if (currentUser != null) {
          await timeEntryService.saveFCMToken(currentUser.uid, token);
        }
      } else {
        print('⚠️ FCM-Token konnte nicht abgerufen werden');
      }
    } catch (e, stackTrace) {
      print('⚠️ Fehler beim Abrufen des FCM-Tokens: $e');
      print('Stacktrace: $stackTrace');
      // Fahre mit der App-Initialisierung fort, auch wenn das Token nicht abgerufen werden konnte
    }
    
    // Auf Token-Aktualisierungen reagieren
    messaging.onTokenRefresh.listen((String newToken) {
      print('📱 FCM-Token aktualisiert');
      final currentUser = authService.currentUser;
      if (currentUser != null) {
        timeEntryService.saveFCMToken(currentUser.uid, newToken);
      }
    });
    
    // Auf Nachrichten reagieren, wenn die App im Vordergrund läuft
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('📩 Vordergrund-Nachricht empfangen: ${message.messageId}');
      
      // Zeige eine lokale Benachrichtigung an
      FlutterLocalNotificationsPlugin().show(
        message.hashCode,
        message.notification?.title ?? 'Neue Benachrichtigung',
        message.notification?.body ?? 'Tippen zum Anzeigen',
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'time_approval_channel',
            'Zeitgenehmigungen',
            channelDescription: 'Benachrichtigungen über genehmigte Zeiteinträge',
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: DarwinNotificationDetails(
            presentAlert: true,
            presentBadge: true,
            presentSound: true,
            sound: 'default',
          ),
        ),
        payload: message.data['entry_id'],
      );
    });
    
    // Auf Benachrichtigungen reagieren, wenn die App im Hintergrund läuft
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('🔔 App durch Benachrichtigung geöffnet: ${message.messageId}');
      
      // Hier kannst du zur entsprechenden Seite navigieren
      // Beispiel: _router.go('/time/${message.data['entry_id']}');
    });
    
    print('✅ Firebase Cloud Messaging erfolgreich initialisiert');
  } catch (e, stackTrace) {
    print('❌ Fehler bei der Initialisierung von Firebase Cloud Messaging: $e');
    print('Stacktrace: $stackTrace');
  }
}

// Benachrichtigungskanäle initialisieren
Future<void> initNotifications() async {
  try {
    print("🔔 Initialisiere Benachrichtigungssystem...");
    
    final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
        FlutterLocalNotificationsPlugin();
    
    // Android-Konfiguration
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    
    // iOS-Konfiguration
    const DarwinInitializationSettings initializationSettingsDarwin =
        DarwinInitializationSettings(
      requestAlertPermission: true,  // Bei Initialisierung Berechtigungen anfordern
      requestBadgePermission: true,
      requestSoundPermission: true,
      defaultPresentAlert: true,     // Standardmäßig Benachrichtigungen anzeigen
      defaultPresentBadge: true,
      defaultPresentSound: true,
    );
    
    // Initialisierungseinstellungen
    const InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
      iOS: initializationSettingsDarwin,
    );
    
    // Plugin initialisieren mit Callback für Interaktionen
    await flutterLocalNotificationsPlugin.initialize(
      initializationSettings,
      onDidReceiveNotificationResponse: (NotificationResponse response) {
        print("👆 Benutzer hat auf Benachrichtigung getippt: ${response.payload}");
        // Hier könnte Navigation zur entsprechenden Seite erfolgen
      },
    );
    
    // Android-Benachrichtigungskanäle erstellen
    await _createNotificationChannels(flutterLocalNotificationsPlugin);
    
    print("✅ Benachrichtigungssystem erfolgreich initialisiert");
  } catch (e, stackTrace) {
    print("❌ Fehler bei der Initialisierung der Benachrichtigungen: $e");
    print("Stacktrace: $stackTrace");
  }
}

// Erstellt alle benötigten Benachrichtigungskanäle für Android
Future<void> _createNotificationChannels(FlutterLocalNotificationsPlugin plugin) async {
  try {
    final android = plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
        
    if (android != null) {
      // Hauptkanal für Zeitgenehmigungen
      await android.createNotificationChannel(
        const AndroidNotificationChannel(
          'time_approval_channel',
          'Zeitgenehmigungen',
          description: 'Benachrichtigungen über genehmigte Zeiteinträge',
          importance: Importance.high,
          enableVibration: true,
          enableLights: true,
          showBadge: true,
        ),
      );
      
      // Test-Kanal für direkte Benachrichtigungen
      await android.createNotificationChannel(
        const AndroidNotificationChannel(
          'time_approval_test_channel',
          'Test Benachrichtigungen',
          description: 'Testkanalbenachrichtigungen',
          importance: Importance.max,
          enableVibration: true,
          enableLights: true,
          showBadge: true,
        ),
      );
      
      print("📢 Android-Benachrichtigungskanäle erfolgreich erstellt");
    }
  } catch (e) {
    print("⚠️ Fehler beim Erstellen von Android-Benachrichtigungskanälen: $e");
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
    
    // Aktuelle Sprache aus den Einstellungen
    final currentLanguage = settingsService.language;
    
    // Setze die Sprache basierend auf den gespeicherten Einstellungen
    try {
      if (context.locale.languageCode != currentLanguage) {
        Future.microtask(() {
          try {
            context.setLocale(Locale(currentLanguage));
          } catch (e) {
            print('⚠️ Fehler beim Setzen der Sprache: $e');
          }
        });
      }
    } catch (e) {
      print('⚠️ Fehler beim Zugriff auf die Locale: $e');
    }
    
    return MaterialApp.router(
      title: 'TimeTrackerApp',
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
      
      // Lokalisierung mit EasyLocalization konfigurieren
      localizationsDelegates: [
        ...context.localizationDelegates,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: context.supportedLocales,
      locale: context.locale,
      
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
