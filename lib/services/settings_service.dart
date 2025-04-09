import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'dart:io';

class SettingsService {
  // Singleton-Pattern
  static final SettingsService _instance = SettingsService._internal();
  
  factory SettingsService() => _instance;
  
  SettingsService._internal();
  
  // Schlüssel für SharedPreferences
  static const String _themeColorKey = 'theme_color';
  static const String _accentColorKey = 'accent_color';
  static const String _languageKey = 'app_language';
  static const String _notificationsEnabledKey = 'notifications_enabled';
  static const String _notificationsPromptedKey = 'notifications_prompted'; // Neuer Schlüssel für Benachrichtigungsaufforderung
  static const String _darkModeKey = 'dark_mode';
  
  // Standardwerte
  static const int _defaultThemeColorValue = 0xFF6200EE; // Deep Purple
  static const int _defaultAccentColorValue = 0xFFBB86FC; // Light Purple
  static const String _defaultLanguage = 'de'; // Deutsch
  static const bool _defaultNotificationsEnabled = false; // Standardmäßig deaktiviert
  static const bool _defaultNotificationsPrompted = false; // Standardmäßig noch nicht abgefragt
  static const String _defaultDarkMode = 'system'; // System, light, dark
  
  // Für GUI-Anzeige
  final List<Map<String, dynamic>> availableThemeColors = [
    {'name': 'Lila', 'value': 0xFF6200EE},
    {'name': 'Blau', 'value': 0xFF2196F3},
    {'name': 'Grün', 'value': 0xFF4CAF50},
    {'name': 'Orange', 'value': 0xFFFF9800},
    {'name': 'Rot', 'value': 0xFFE91E63},
    {'name': 'Cyan', 'value': 0xFF00BCD4},
  ];
  
  final List<Map<String, dynamic>> availableLanguages = [
    {'name': 'Deutsch', 'code': 'de'},
    {'name': 'Englisch', 'code': 'en'},
  ];
  
  final List<Map<String, dynamic>> availableDarkModes = [
    {'name': 'System', 'value': 'system'},
    {'name': 'Hell', 'value': 'light'},
    {'name': 'Dunkel', 'value': 'dark'},
  ];
  
  // Aktuelle Werte (werden bei init() geladen)
  Color? _themeColor;
  Color? _accentColor;
  String? _language;
  bool? _notificationsEnabled;
  bool? _notificationsPrompted; // Wurde der Benutzer bereits zu Benachrichtigungen aufgefordert
  String? _darkMode;
  
  // Shared Preferences Instance
  SharedPreferences? _prefs;
  
  // Standardwerte
  static const String _themePreference = 'theme_preference';
  static const String _themeColorPreference = 'theme_color_preference';
  static const String _accentColorPreference = 'accent_color_preference';
  static const String _notificationsEnabledPreference = 'notifications_enabled_preference';
  
  // Lokale Benachrichtigungen
  final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin = 
      FlutterLocalNotificationsPlugin();
  
  // Initialisieren der Einstellungen
  Future<void> init() async {
    try {
      print('📱 Initialisiere Settings Service...');
      _prefs = await SharedPreferences.getInstance();
      
      if (_prefs == null) {
        print('⚠️ Fehler: SharedPreferences konnte nicht initialisiert werden');
        // Fallback-Werte verwenden
        _themeColor = Color(_defaultThemeColorValue);
        _accentColor = Color(_defaultAccentColorValue);
        _language = _defaultLanguage;
        _notificationsEnabled = _defaultNotificationsEnabled;
        _notificationsPrompted = _defaultNotificationsPrompted;
        _darkMode = _defaultDarkMode;
      } else {
        // Lade gespeicherte Einstellungen oder verwende Standardwerte
        final themeColorValue = _prefs!.getInt(_themeColorKey) ?? _defaultThemeColorValue;
        final accentColorValue = _prefs!.getInt(_accentColorKey) ?? _defaultAccentColorValue;
        
        _themeColor = Color(themeColorValue);
        _accentColor = Color(accentColorValue);
        _language = _prefs!.getString(_languageKey) ?? _defaultLanguage;
        _notificationsEnabled = _prefs!.getBool(_notificationsEnabledKey) ?? _defaultNotificationsEnabled;
        _notificationsPrompted = _prefs!.getBool(_notificationsPromptedKey) ?? _defaultNotificationsPrompted;
        _darkMode = _prefs!.getString(_darkModeKey) ?? _defaultDarkMode;
      }
      
      // Initialisiere Benachrichtigungen
      await _initNotifications();
      print('✅ Settings Service initialisiert');
    } catch (e) {
      print('❌ Fehler bei der Initialisierung des Settings Service: $e');
      // Fallback-Werte setzen, um Abstürze zu vermeiden
      _themeColor = Color(_defaultThemeColorValue);
      _accentColor = Color(_defaultAccentColorValue);
      _language = _defaultLanguage;
      _notificationsEnabled = _defaultNotificationsEnabled;
      _notificationsPrompted = _defaultNotificationsPrompted;
      _darkMode = _defaultDarkMode;
    }
  }
  
  // Getter für die aktuellen Einstellungen
  Color get themeColor => _themeColor ?? Color(_defaultThemeColorValue);
  Color get accentColor => _accentColor ?? Color(_defaultAccentColorValue);
  String get language => _language ?? _defaultLanguage;
  bool get notificationsEnabled => _notificationsEnabled ?? _defaultNotificationsEnabled;
  bool get notificationsPrompted => _notificationsPrompted ?? _defaultNotificationsPrompted;
  String get darkMode => _darkMode ?? _defaultDarkMode;
  
  // Setter mit Speichern in SharedPreferences
  Future<void> setThemeColor(Color color) async {
    if (_prefs == null) {
      _themeColor = color;
      return;
    }
    await _prefs!.setInt(_themeColorKey, color.value);
    _themeColor = color;
  }
  
  Future<void> setAccentColor(Color color) async {
    if (_prefs == null) {
      _accentColor = color;
      return;
    }
    await _prefs!.setInt(_accentColorKey, color.value);
    _accentColor = color;
  }
  
  Future<void> setLanguage(String languageCode) async {
    if (_prefs == null) {
      _language = languageCode;
      return;
    }
    await _prefs!.setString(_languageKey, languageCode);
    _language = languageCode;
  }
  
  Future<void> setNotificationsEnabled(bool enabled) async {
    if (_prefs == null) {
      _notificationsEnabled = enabled;
      return;
    }
    await _prefs!.setBool(_notificationsEnabledKey, enabled);
    _notificationsEnabled = enabled;
  }
  
  Future<void> setNotificationsPrompted(bool prompted) async {
    if (_prefs == null) {
      _notificationsPrompted = prompted;
      return;
    }
    await _prefs!.setBool(_notificationsPromptedKey, prompted);
    _notificationsPrompted = prompted;
  }
  
  Future<void> setDarkMode(String mode) async {
    if (_prefs == null) {
      _darkMode = mode;
      return;
    }
    await _prefs!.setString(_darkModeKey, mode);
    _darkMode = mode;
  }
  
  // Zurücksetzen aller Einstellungen auf Standardwerte
  Future<void> resetSettings() async {
    if (_prefs == null) {
      _themeColor = Color(_defaultThemeColorValue);
      _accentColor = Color(_defaultAccentColorValue);
      _language = _defaultLanguage;
      _notificationsEnabled = _defaultNotificationsEnabled;
      _notificationsPrompted = _defaultNotificationsPrompted;
      _darkMode = _defaultDarkMode;
      return;
    }
    
    await _prefs!.remove(_themeColorKey);
    await _prefs!.remove(_accentColorKey);
    await _prefs!.remove(_languageKey);
    await _prefs!.remove(_notificationsEnabledKey);
    await _prefs!.remove(_notificationsPromptedKey);
    await _prefs!.remove(_darkModeKey);
    
    _themeColor = Color(_defaultThemeColorValue);
    _accentColor = Color(_defaultAccentColorValue);
    _language = _defaultLanguage;
    _notificationsEnabled = _defaultNotificationsEnabled;
    _notificationsPrompted = _defaultNotificationsPrompted;
    _darkMode = _defaultDarkMode;
  }
  
  // Initialisiert die lokalen Benachrichtigungen
  Future<void> _initNotifications() async {
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');
        
    final DarwinInitializationSettings initializationSettingsIOS =
        DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        );
        
    final InitializationSettings initializationSettings = InitializationSettings(
      android: initializationSettingsAndroid,
      iOS: initializationSettingsIOS,
    );
    
    await flutterLocalNotificationsPlugin.initialize(
      initializationSettings,
    );
  }
  
  // Fragt die Berechtigung für Benachrichtigungen ab
  Future<bool> requestNotificationPermission() async {
    try {
      print('🔍 Überprüfe Benachrichtigungsberechtigung...');
      
      // Prüfe zuerst den aktuellen Status
      final status = await Permission.notification.status;
      
      // Wenn Berechtigungen bereits erteilt wurden, nichts weiter tun
      if (status.isGranted) {
        print('✅ Benachrichtigungsberechtigungen bereits erteilt');
        await setNotificationsEnabled(true);
        await setNotificationsPrompted(true);
        return true;
      }
      
      // Wenn dauerhaft abgelehnt, können wir nichts tun außer den Benutzer zu informieren
      if (status.isPermanentlyDenied) {
        print('❌ Benachrichtigungen dauerhaft abgelehnt');
        await setNotificationsEnabled(false);
        await setNotificationsPrompted(true);
        return false;
      }
      
      // Anfrage wurde noch nicht permanent abgelehnt, also jetzt anfordern
      print('🔔 Fordere Benachrichtigungsberechtigungen an...');
      final PermissionStatus newStatus = await Permission.notification.request();
      
      // Status nach der Anfrage speichern
      final bool isGranted = newStatus.isGranted;
      await setNotificationsEnabled(isGranted);
      await setNotificationsPrompted(true);
      
      // Bei iOS müssen wir zusätzlich die detaillierten Berechtigungen anfordern
      if (isGranted && Platform.isIOS) {
        print('🍎 Fordere iOS-spezifische Benachrichtigungsberechtigungen an...');
        await flutterLocalNotificationsPlugin
            .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(
              alert: true,
              badge: true,
              sound: true,
            );
      }
      
      print(isGranted 
          ? '✅ Benachrichtigungsberechtigungen gewährt' 
          : '❌ Benachrichtigungsberechtigungen abgelehnt');
      
      return isGranted;
    } catch (e) {
      print('❌ Fehler bei der Anforderung von Benachrichtigungsberechtigungen: $e');
      // Markiere als aufgefordert, um wiederholte Fehler zu vermeiden
      await setNotificationsPrompted(true);
      return false;
    }
  }
  
  // Prüft, ob der Benutzer bereits zur Benachrichtigungsberechtigung aufgefordert wurde
  Future<bool> shouldPromptForNotifications() async {
    try {
      // Prüfe zuerst den in-Memory-Wert
      if (_notificationsPrompted != null && _notificationsPrompted!) {
        print('🔔 Benutzer wurde bereits nach Benachrichtigungen gefragt (Memory-Cache)');
        return false;
      }
      
      // Dann prüfe den in SharedPreferences gespeicherten Wert
      if (_prefs != null && _prefs!.getBool(_notificationsPromptedKey) == true) {
        print('🔔 Benutzer wurde bereits nach Benachrichtigungen gefragt (SharedPreferences)');
        // Synchronisiere den Memory-Cache
        _notificationsPrompted = true;
        return false;
      }
      
      // Prüfe den tatsächlichen Berechtigungsstatus
      final permissionStatus = await Permission.notification.status;
      
      // Wenn Berechtigung bereits erteilt wurde, sollten wir nicht mehr fragen
      if (permissionStatus.isGranted) {
        print('🔔 Benachrichtigungsberechtigungen bereits erteilt');
        await setNotificationsPrompted(true);
        await setNotificationsEnabled(true);
        return false;
      }
      
      // Wenn Berechtigung bereits dauerhaft verweigert wurde, sollten wir nicht mehr fragen
      if (permissionStatus.isPermanentlyDenied) {
        print('🔔 Benachrichtigungsberechtigungen dauerhaft verweigert');
        await setNotificationsPrompted(true);
        await setNotificationsEnabled(false);
        return false;
      }
      
      // Ansonsten: Noch nie gefragt, sollte fragen
      print('🔔 Benutzer wurde noch nicht nach Benachrichtigungen gefragt');
      return true;
    } catch (e) {
      print('❌ Fehler bei shouldPromptForNotifications: $e');
      // Sicherheitshalber nicht erneut fragen, wenn Fehler auftreten
      return false;
    }
  }
  
  // Prüft, ob die Benachrichtigungsberechtigung erteilt wurde
  Future<bool> checkNotificationPermission() async {
    return await Permission.notification.isGranted;
  }
  
  // Sendet eine Testbenachrichtigung
  Future<void> sendTestNotification() async {
    if (!await checkNotificationPermission()) {
      return;
    }
    
    const AndroidNotificationDetails androidNotificationDetails =
        AndroidNotificationDetails(
      'time_tracker_channel',
      'Zeiterfassung',
      channelDescription: 'Benachrichtigungen für die Zeiterfassung',
      importance: Importance.max,
      priority: Priority.high,
    );
    
    const DarwinNotificationDetails iosNotificationDetails =
        DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );
    
    const NotificationDetails notificationDetails = NotificationDetails(
      android: androidNotificationDetails,
      iOS: iosNotificationDetails,
    );
    
    await flutterLocalNotificationsPlugin.show(
      0,
      'Zeiterfassung',
      'Ihre Zeiterfassung läuft seit 4 Stunden',
      notificationDetails,
    );
  }
  
  // Abrufen, ob Benachrichtigungen aktiviert sind
  Future<bool> getNotificationsEnabled() async {
    try {
      // Wenn der Wert bereits im Speicher ist, gib ihn zurück
      if (_notificationsEnabled != null) {
        return _notificationsEnabled!;
      }
      
      // Versuche aus SharedPreferences zu laden
      final prefs = await SharedPreferences.getInstance();
      return prefs.getBool(_notificationsEnabledKey) ?? false;
    } catch (e) {
      print('Fehler beim Abrufen der Benachrichtigungseinstellungen: $e');
      // Fallback: Standardwert zurückgeben
      return _defaultNotificationsEnabled;
    }
  }
  
  // Sendet eine Direktbenachrichtigung für Debugging
  Future<void> sendDebugNotification() async {
    try {
      // Einfache Test-Benachrichtigung für Debugging
      final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin = 
          FlutterLocalNotificationsPlugin();
      
      // Android-Details
      const AndroidNotificationDetails androidDetails = AndroidNotificationDetails(
        'time_approval_channel',
        'Zeitgenehmigungen',
        channelDescription: 'Benachrichtigungen über genehmigte Zeiteinträge',
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        largeIcon: DrawableResourceAndroidBitmap('@mipmap/ic_launcher'),
        enableLights: true,
        enableVibration: true,
        playSound: true,
        fullScreenIntent: true,
      );
      
      // iOS-Details
      const DarwinNotificationDetails iosDetails = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        threadIdentifier: 'time_approvals',
      );
      
      // Kombinierte Details
      const NotificationDetails details = NotificationDetails(
        android: androidDetails,
        iOS: iosDetails,
      );
      
      // Test-Benachrichtigung senden
      await flutterLocalNotificationsPlugin.show(
        100, // Feste ID für Debug-Benachrichtigung
        '🔔 Debug-Benachrichtigung',
        'Dies ist eine direkte Test-Benachrichtigung. Die Zeit ist: ${DateTime.now().toString()}',
        details,
      );
      
      print('Debug-Benachrichtigung wurde gesendet');
    } catch (e, stackTrace) {
      print('Fehler beim Senden der Debug-Benachrichtigung: $e');
      print('Stacktrace: $stackTrace');
    }
  }
} 