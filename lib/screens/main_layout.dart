import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../widgets/navigation/bottom_nav_bar.dart';
import '../widgets/navigation/app_bar.dart';
import '../services/auth_service.dart';
import '../widgets/dialogs/timer_dialogs.dart';
import '../services/time/time_entry_service.dart';
import '../models/time/time_entry_model.dart';
import '../widgets/time/app_timer_widget.dart';
import 'time/time_screen.dart';
import 'orders_screen.dart';
import 'profile_screen.dart';
import 'dashboard_screen.dart';
import 'settings_screen.dart';
import '../main.dart';
import 'package:permission_handler/permission_handler.dart';

class MainLayout extends StatefulWidget {
  final User user;
  final int initialTab;
  
  const MainLayout({
    Key? key, 
    required this.user,
    this.initialTab = 0,
  }) : super(key: key);

  @override
  MainLayoutState createState() => MainLayoutState();
}

class MainLayoutState extends State<MainLayout> with SingleTickerProviderStateMixin {
  final AuthService _authService = AuthService();
  final TimeEntryService _timeEntryService = TimeEntryService();
  
  // Active Timer Status
  TimeEntry? _activeTimer;
  Timer? _timerPollingTimer;
  
  // Separate Keys für jede Hauptseite
  final GlobalKey _dashboardKey = GlobalKey();
  final GlobalKey _timeKey = GlobalKey();
  final GlobalKey _ordersKey = GlobalKey();
  final GlobalKey _profileKey = GlobalKey();
  
  // Aktiver Tab-Index
  late int _currentIndex;
  
  // PageController für den Seitenwechsel
  late PageController _pageController;
  
  // TabController für synchronisierte Animation
  late TabController _tabController;
  
  // Benachrichtigungen
  final FlutterLocalNotificationsPlugin _notificationsPlugin = FlutterLocalNotificationsPlugin();
  Timer? _approvalCheckTimer;
  
  @override
  void initState() {
    super.initState();
    
    // Initialisierung mit dem initialTab-Parameter
    _currentIndex = widget.initialTab;
    
    // PageController mit initialem Tab
    _pageController = PageController(
      initialPage: _currentIndex,
      keepPage: true, // Wichtig: Behält den Zustand bei
    );
    
    // TabController für synchronisierte Animation
    _tabController = TabController(
      length: 4,
      vsync: this,
      initialIndex: _currentIndex,
    );
    
    // TabController-Listener für synchronisierte Änderungen
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        _onTabChanged(_tabController.index);
      }
    });
    
    // Aktiven Timer laden und Polling-Timer starten
    _loadActiveTimer();
    _startTimerPolling();
    
    // Benachrichtigungsberechtigung anfordern, wenn die App startet
    _requestNotificationPermissionIfNeeded();
    
    // Benachrichtigungen initialisieren
    _initializeNotifications();
    
    // Timer für die Prüfung auf genehmigte Zeiteinträge starten
    _startApprovalCheckTimer();
  }
  
  @override
  void dispose() {
    _pageController.dispose();
    _tabController.dispose();
    _timerPollingTimer?.cancel();
    _approvalCheckTimer?.cancel();
    super.dispose();
  }
  
  // Lädt den aktiven Timer des Benutzers
  Future<void> _loadActiveTimer() async {
    try {
      final timer = await _timeEntryService.getActiveTimerForUser(widget.user.uid);
      setState(() {
        _activeTimer = timer;
      });
    } catch (e) {
      print('Fehler beim Laden des aktiven Timers: $e');
    }
  }
  
  // Startet einen Polling-Timer, der regelmäßig den aktiven Timer abruft
  void _startTimerPolling() {
    _timerPollingTimer = Timer.periodic(const Duration(minutes: 1), (timer) {
      _loadActiveTimer();
    });
  }
  
  // Pausiert oder setzt den Timer fort
  Future<void> _toggleTimerPauseResume() async {
    if (_activeTimer == null) return;
    
    try {
      final TimeScreenState? timeScreenState = _timeKey.currentState as TimeScreenState?;
      
      if (timeScreenState != null) {
        if (_activeTimer!.status == 'paused') {
          timeScreenState.resumeTimer();
        } else {
          timeScreenState.pauseTimer();
        }
      } else {
        // Fallback, wenn der TimeScreen nicht geladen ist
        if (_activeTimer!.status == 'paused') {
          await _timeEntryService.resumeTimer(_activeTimer!.id!);
        } else {
          await _timeEntryService.pauseTimer(_activeTimer!.id!, 0);
        }
        await _loadActiveTimer();
      }
    } catch (e) {
      print('Fehler beim Pausieren/Fortsetzen des Timers: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Pausieren/Fortsetzen des Timers: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
  
  // Stoppt den Timer
  Future<void> _stopTimer() async {
    if (_activeTimer == null) return;
    
    try {
      final TimeScreenState? timeScreenState = _timeKey.currentState as TimeScreenState?;
      
      if (timeScreenState != null) {
        timeScreenState.stopTimer();
      } else {
        // Fallback, wenn der TimeScreen nicht geladen ist
        final endTime = DateTime.now();
        await _timeEntryService.stopTimer(
          _activeTimer!.id!,
          endTime,
          _activeTimer!.pauseMinutes,
        );
        setState(() {
          _activeTimer = null;
        });
      }
    } catch (e) {
      print('Fehler beim Stoppen des Timers: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Stoppen des Timers: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
  
  // Wechselt zur angegebenen Seite
  void changeTab(int index) {
    if (mounted && _currentIndex != index) {
      // TabController und PageController synchron halten
      _tabController.animateTo(index);
      
      // UI aktualisieren
      setState(() {
        _currentIndex = index;
        // Ohne Animation wechseln
        if (_pageController.hasClients) {
          _pageController.jumpToPage(index);
        }
      });
    }
  }
  
  // Behandelt Tab-Änderungen (von TabController)
  void _onTabChanged(int index) {
    if (mounted && _currentIndex != index) {
      setState(() {
        _currentIndex = index;
        // PageController nachziehen, wenn der Tab über TabController geändert wurde
        if (_pageController.hasClients) {
          _pageController.jumpToPage(index);
        }
      });
    }
  }
  
  // Wechselt zur richtigen Seite mit Animation
  void _onTabTapped(int index) {
    // Verhindere doppelte State-Änderungen
    if (_currentIndex != index && mounted) {
      // TabController aktualisieren
      _tabController.animateTo(index);
      
      setState(() {
        _currentIndex = index;
        
        // PageController sicher verwenden
        if (_pageController.hasClients) {
          _pageController.animateToPage(
            index,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
          );
        }
      });
    }
  }
  
  // Diese Methode fragt nach der Benachrichtigungsberechtigung, wenn sie nicht zuvor erteilt wurde
  Future<void> _requestNotificationPermissionIfNeeded() async {
    try {
      // Überprüfe zuerst den tatsächlichen Berechtigungsstatus vom System
      final permissionStatus = await Permission.notification.status;
      
      // Wenn Benachrichtigungen bereits erlaubt sind, aktualisiere nur die Einstellungen
      if (permissionStatus.isGranted) {
        print('📱 Benachrichtigungen sind bereits vom System erlaubt');
        await settingsService.setNotificationsEnabled(true);
        await settingsService.setNotificationsPrompted(true);
        return;
      }
      
      // Wenn permanent abgelehnt, nicht erneut fragen
      if (permissionStatus.isPermanentlyDenied) {
        print('📱 Benachrichtigungen wurden dauerhaft abgelehnt');
        await settingsService.setNotificationsEnabled(false);
        await settingsService.setNotificationsPrompted(true);
        return;
      }
      
      // Prüfe, ob der Benutzer bereits in unserer App gefragt wurde
      final notificationsPrompted = await settingsService.shouldPromptForNotifications();
      
      // Nur einmal fragen - wenn die App den Benutzer bereits gefragt hat, nicht erneut fragen
      if (!notificationsPrompted) {
        print('📱 Zeige Benachrichtigungsdialog zum ersten Mal');
        
        // Verzögere die Anfrage leicht, damit die App vollständig geladen werden kann
        await Future.delayed(const Duration(seconds: 1));
        
        if (!mounted) return;
        
        // Zeige einen Dialog, der erklärt, warum wir Benachrichtigungen benötigen
        bool? result;
        try {
          result = await showDialog<bool>(
            context: context,
            barrierDismissible: false,
            builder: (BuildContext dialogContext) => AlertDialog(
              title: const Text('Benachrichtigungen'),
              content: const Text(
                'Möchten Sie Benachrichtigungen erhalten, wenn Ihre Zeiteinträge genehmigt werden?',
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop(false);
                  },
                  child: const Text('Nein, danke'),
                ),
                TextButton(
                  onPressed: () {
                    Navigator.of(dialogContext).pop(true);
                  },
                  child: const Text('Ja, benachrichtigen'),
                ),
              ],
            ),
          );
        } catch (e) {
          print('❌ Fehler beim Anzeigen des Benachrichtigungsdialogs: $e');
          result = false;
        }
        
        // Markiere als gefragt, unabhängig von der Entscheidung
        await settingsService.setNotificationsPrompted(true);
        
        if (result == true) {
          print('📱 Benutzer hat Benachrichtigungen zugestimmt');
          await settingsService.setNotificationsEnabled(true);
          
          // Verzögerung hinzufügen, um UI-Aktualisierungen abzuschließen
          await Future.delayed(const Duration(milliseconds: 300));
          
          // Systemdialog für Berechtigungen nur anzeigen, wenn Widget noch eingebunden ist
          if (mounted) {
            try {
              await settingsService.requestNotificationPermission();
            } catch (e) {
              print('❌ Fehler beim Anfordern der Benachrichtigungsberechtigung: $e');
            }
          }
        } else {
          print('📱 Benutzer hat Benachrichtigungen abgelehnt');
          await settingsService.setNotificationsEnabled(false);
        }
      } else {
        print('📱 Benutzer wurde bereits nach Benachrichtigungen gefragt');
      }
    } catch (e) {
      print('❌ Fehler beim Abfragen der Benachrichtigungsberechtigungen: $e');
    }
  }
  
  // Methode zum expliziten Anfordern von Benachrichtigungsberechtigungen
  Future<void> _requestNotificationPermissions() async {
    try {
      // Berechtigungen für iOS anfordern
      await _notificationsPlugin
          .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(
            alert: true,
            badge: true,
            sound: true,
          );
          
      // Für Android reicht es, den Kanal zu erstellen
      print('Benachrichtigungsberechtigungen angefordert');
    } catch (e) {
      print('Fehler beim Anfordern der Benachrichtigungsberechtigungen: $e');
    }
  }
  
  // Liefert den richtigen Titel für die aktuelle Seite
  String _getTitle() {
    switch (_currentIndex) {
      case 0: return 'Home';
      case 1: return 'Zeit';
      case 2: return 'Aufträge';
      case 3: return 'Profil';
      default: return 'TimeTracker';
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      // Verhindere unbeabsichtigtes Zurücknavigieren
      onWillPop: () async {
        if (_currentIndex != 0) {
          // Navigation zum Dashboard, wenn nicht bereits dort
          changeTab(0);
          return false;
        }
        return true; // App schließen
      },
      child: Scaffold(
        appBar: AppTopBar(
          user: widget.user,
          authService: _authService,
          title: _getTitle(),
          actions: [
            // Timer-Widget anzeigen, wenn aktiv
            if (_activeTimer != null)
              Padding(
                padding: const EdgeInsets.only(right: 4.0),
                child: AppTimerWidget(
                  activeTimer: _activeTimer,
                  onPauseResumePressed: _toggleTimerPauseResume,
                  onStopPressed: _stopTimer,
                ),
              ),
            ..._getActions(),
          ],
        ),
        drawer: Drawer(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              DrawerHeader(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CircleAvatar(
                      radius: 30,
                      backgroundColor: Colors.white,
                      child: Text(
                        widget.user.displayName?.substring(0, 1).toUpperCase() ?? 'U',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: 24,
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      widget.user.displayName ?? 'Benutzer',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      widget.user.email ?? '',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
              ListTile(
                leading: const Icon(Icons.dashboard),
                title: const Text('Dashboard'),
                onTap: () {
                  Navigator.pop(context); // Drawer schließen
                  _onTabTapped(0);
                },
              ),
              ListTile(
                leading: const Icon(Icons.timer),
                title: const Text('Zeiterfassung'),
                onTap: () {
                  Navigator.pop(context); // Drawer schließen
                  _onTabTapped(1);
                },
              ),
              ListTile(
                leading: const Icon(Icons.work),
                title: const Text('Aufträge'),
                onTap: () {
                  Navigator.pop(context); // Drawer schließen
                  _onTabTapped(2);
                },
              ),
              const Divider(),
              // Zeige Admin-Funktionen nur für bestimmte Email-Domänen
              if (_isAdmin())
                ListTile(
                  leading: const Icon(Icons.approval),
                  title: const Text('Zeitgenehmigung'),
                  onTap: () {
                    Navigator.pop(context); // Drawer schließen
                    GoRouter.of(context).go('/admin/time_approval');
                  },
                ),
              ListTile(
                leading: const Icon(Icons.settings),
                title: const Text('Einstellungen'),
                onTap: () {
                  Navigator.pop(context); // Drawer schließen
                  Navigator.push(
                    context, 
                    MaterialPageRoute(
                      builder: (context) => SettingsScreen(user: widget.user),
                    ),
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Abmelden'),
                onTap: () async {
                  // Drawer schließen
                  Navigator.pop(context);
                  
                  // Dialog anzeigen
                  final shouldLogout = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Abmelden'),
                      content: const Text('Möchten Sie sich wirklich abmelden?'),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Abbrechen'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Abmelden'),
                        ),
                      ],
                    ),
                  );
                  
                  // Wenn der Benutzer sich abmelden möchte
                  if (shouldLogout == true) {
                    await _authService.signOut();
                  }
                },
              ),
            ],
          ),
        ),
        body: PageView(
          controller: _pageController,
          physics: const NeverScrollableScrollPhysics(), // Deaktiviert Wischen
          onPageChanged: (index) {
            if (mounted && _currentIndex != index) {
              // TabController synchron halten
              _tabController.animateTo(index);
              
              setState(() {
                _currentIndex = index;
              });
            }
          },
          children: [
            DashboardScreen(key: _dashboardKey, user: widget.user),
            TimeScreen(
              key: _timeKey, 
              user: widget.user,
              onTimerStateChanged: (timer) {
                setState(() {
                  _activeTimer = timer;
                });
              },
            ),
            OrdersScreen(key: _ordersKey, user: widget.user),
            ProfileScreen(key: _profileKey, user: widget.user),
          ],
        ),
        floatingActionButton: FloatingActionButton(
          heroTag: 'main_layout_fab',
          onPressed: () {
            // Direkt zur Zeiterfassungs-Seite navigieren (Tab-Index 1)
            _onTabTapped(1);
          },
          backgroundColor: Theme.of(context).colorScheme.primary,
          child: const Icon(Icons.add, color: Colors.white),
        ),
        floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
        bottomNavigationBar: AppBottomNavBar(
          selectedIndex: _currentIndex,
          onItemTapped: _onTabTapped,
        ),
      ),
    );
  }
  
  // Liefert die richtigen Aktionsbuttons für die aktuelle Seite
  List<Widget> _getActions() {
    switch (_currentIndex) {
      case 2: // Auftragsmanagement
        return [];
      case 1: // Zeiterfassung
        return [];
      default:
        return [];
    }
  }
  
  // Prüft, ob der aktuelle Benutzer Admin-Rechte hat
  bool _isAdmin() {
    // Einfache Prüfung basierend auf der E-Mail-Adresse
    // In einer realen Anwendung würde man das über Firestore oder Firebase Auth Claims lösen
    final email = widget.user.email;
    if (email == null) return false;
    
    // Beispiel: Nur Benutzer mit E-Mails von bestimmten Domänen sind Admins
    return email.endsWith('@example.com') || 
           email.endsWith('@admin.com') || 
           email.endsWith('@firma.de') ||
           email == 'test@test.de';
  }
  
  // Diese Methode initialisiert die Benachrichtigungen
  Future<void> _initializeNotifications() async {
    try {
      // Android-Einstellungen
      const AndroidInitializationSettings initializationSettingsAndroid =
          AndroidInitializationSettings('@mipmap/ic_launcher');

      // iOS-Einstellungen
      const DarwinInitializationSettings initializationSettingsIOS =
          DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );

      // Initialisierungseinstellungen
      const InitializationSettings initializationSettings =
          InitializationSettings(
        android: initializationSettingsAndroid,
        iOS: initializationSettingsIOS,
      );

      // Plugin initialisieren
      await _notificationsPlugin.initialize(
        initializationSettings,
        onDidReceiveNotificationResponse: _onNotificationTapped,
      );
      
      print('Benachrichtigungen wurden initialisiert');
    } catch (e) {
      print('Fehler bei der Initialisierung der Benachrichtigungen: $e');
    }
  }
  
  // Wird aufgerufen, wenn der Benutzer auf eine Benachrichtigung tippt
  void _onNotificationTapped(NotificationResponse response) {
    // Navigation zur entsprechenden Seite, z.B. zur Zeiterfassungsseite
    _onTabTapped(1); // Index 1 ist die Zeiterfassungsseite
  }
  
  // Timer für die regelmäßige Prüfung auf genehmigte Zeiteinträge
  void _startApprovalCheckTimer() {
    // Prüfe alle 3 Minuten auf genehmigte Zeiteinträge (statt 15 Minuten)
    _approvalCheckTimer = Timer.periodic(const Duration(minutes: 3), (_) {
      _checkForApprovedEntries();
    });
    
    // Sofort eine erste Prüfung durchführen
    _checkForApprovedEntries();
  }
  
  // Prüft, ob es neue genehmigte Zeiteinträge gibt
  Future<void> _checkForApprovedEntries() async {
    try {
      if (widget.user != null) {
        await _timeEntryService.checkForApprovedEntries(widget.user.uid);
      }
    } catch (e) {
      print('Fehler bei der Prüfung auf genehmigte Zeiteinträge: $e');
    }
  }
} 