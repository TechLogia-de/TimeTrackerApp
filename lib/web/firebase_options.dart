import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Standardkonfiguration für Firebase in dieser App.
/// 
/// HINWEIS: Ersetzen Sie diese Werte mit Ihren tatsächlichen Firebase-Projektdaten
/// aus der Firebase Console unter https://console.firebase.google.com/
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      return web;
    }
    // Für verschiedene Plattformen unterschiedliche Optionen
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      case TargetPlatform.macOS:
        return macos;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions sind für diese Plattform nicht konfiguriert.',
        );
    }
  }

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'HIER_IHRE_API_KEY_EINFÜGEN',
    appId: 'HIER_IHRE_APP_ID_EINFÜGEN',
    messagingSenderId: 'IHRE_SENDER_ID',
    projectId: 'IHRE_PROJEKT_ID',
    authDomain: 'IHRE_AUTH_DOMAIN',
    storageBucket: 'IHRE_STORAGE_BUCKET',
  );

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'HIER_IHRE_API_KEY_EINFÜGEN',
    appId: 'HIER_IHRE_APP_ID_EINFÜGEN',
    messagingSenderId: 'IHRE_SENDER_ID',
    projectId: 'IHRE_PROJEKT_ID',
    storageBucket: 'IHRE_STORAGE_BUCKET',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'HIER_IHRE_API_KEY_EINFÜGEN',
    appId: 'HIER_IHRE_APP_ID_EINFÜGEN',
    messagingSenderId: 'IHRE_SENDER_ID',
    projectId: 'IHRE_PROJEKT_ID',
    storageBucket: 'IHRE_STORAGE_BUCKET',
    iosClientId: 'IHRE_IOS_CLIENT_ID',
    iosBundleId: 'com.example.timetrackerapp',
  );

  static const FirebaseOptions macos = FirebaseOptions(
    apiKey: 'HIER_IHRE_API_KEY_EINFÜGEN',
    appId: 'HIER_IHRE_APP_ID_EINFÜGEN',
    messagingSenderId: 'IHRE_SENDER_ID',
    projectId: 'IHRE_PROJEKT_ID',
    storageBucket: 'IHRE_STORAGE_BUCKET',
    iosClientId: 'IHRE_IOS_CLIENT_ID',
    iosBundleId: 'com.example.timetrackerapp',
  );
} 