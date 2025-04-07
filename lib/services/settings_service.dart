import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

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
  static const String _darkModeKey = 'dark_mode';
  
  // Standardwerte
  static const int _defaultThemeColorValue = 0xFF6200EE; // Deep Purple
  static const int _defaultAccentColorValue = 0xFFBB86FC; // Light Purple
  static const String _defaultLanguage = 'de'; // Deutsch
  static const bool _defaultNotificationsEnabled = true;
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
  String? _darkMode;
  
  // Shared Preferences Instance
  late SharedPreferences _prefs;
  
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
    _prefs = await SharedPreferences.getInstance();
    
    // Lade gespeicherte Einstellungen oder verwende Standardwerte
    final themeColorValue = _prefs.getInt(_themeColorKey) ?? _defaultThemeColorValue;
    final accentColorValue = _prefs.getInt(_accentColorKey) ?? _defaultAccentColorValue;
    
    _themeColor = Color(themeColorValue);
    _accentColor = Color(accentColorValue);
    _language = _prefs.getString(_languageKey) ?? _defaultLanguage;
    _notificationsEnabled = _prefs.getBool(_notificationsEnabledKey) ?? _defaultNotificationsEnabled;
    _darkMode = _prefs.getString(_darkModeKey) ?? _defaultDarkMode;
    
    // Initialisiere Benachrichtigungen
    await _initNotifications();
  }
  
  // Getter für die aktuellen Einstellungen
  Color get themeColor => _themeColor ?? Color(_defaultThemeColorValue);
  Color get accentColor => _accentColor ?? Color(_defaultAccentColorValue);
  String get language => _language ?? _defaultLanguage;
  bool get notificationsEnabled => _notificationsEnabled ?? _defaultNotificationsEnabled;
  String get darkMode => _darkMode ?? _defaultDarkMode;
  
  // Setter mit Speichern in SharedPreferences
  Future<void> setThemeColor(Color color) async {
    await _prefs.setInt(_themeColorKey, color.value);
    _themeColor = color;
  }
  
  Future<void> setAccentColor(Color color) async {
    await _prefs.setInt(_accentColorKey, color.value);
    _accentColor = color;
  }
  
  Future<void> setLanguage(String languageCode) async {
    await _prefs.setString(_languageKey, languageCode);
    _language = languageCode;
  }
  
  Future<void> setNotificationsEnabled(bool enabled) async {
    await _prefs.setBool(_notificationsEnabledKey, enabled);
    _notificationsEnabled = enabled;
  }
  
  Future<void> setDarkMode(String mode) async {
    await _prefs.setString(_darkModeKey, mode);
    _darkMode = mode;
  }
  
  // Zurücksetzen aller Einstellungen auf Standardwerte
  Future<void> resetSettings() async {
    await _prefs.remove(_themeColorKey);
    await _prefs.remove(_accentColorKey);
    await _prefs.remove(_languageKey);
    await _prefs.remove(_notificationsEnabledKey);
    await _prefs.remove(_darkModeKey);
    
    _themeColor = Color(_defaultThemeColorValue);
    _accentColor = Color(_defaultAccentColorValue);
    _language = _defaultLanguage;
    _notificationsEnabled = _defaultNotificationsEnabled;
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
    // iOS-Berechtigungen anfordern
    if (await Permission.notification.status.isDenied) {
      final PermissionStatus status = await Permission.notification.request();
      
      // Speichere den Status in den Einstellungen
      await setNotificationsEnabled(status.isGranted);
      
      // Bei iOS müssen wir auch die Berechtigungen in den Benachrichtigungseinstellungen anfordern
      if (status.isGranted) {
        await flutterLocalNotificationsPlugin
            .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
            ?.requestPermissions(
              alert: true,
              badge: true,
              sound: true,
            );
      }
      
      return status.isGranted;
    }
    
    // Die Berechtigung wurde bereits erteilt
    return true;
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
} 