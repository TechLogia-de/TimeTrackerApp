# TimeTrackerApp

Eine moderne Zeiterfassungs- und Projektmanagement-Anwendung für Unternehmen und Freiberufler, entwickelt mit Flutter.

## Beschreibung

TimeTrackerApp ist eine umfassende Lösung zur Erfassung von Arbeitszeiten, Verwaltung von Projekten und Aufträgen sowie zur Analyse der Arbeitseffizienz. Die App ermöglicht es Benutzern, ihre Arbeitszeit zu verfolgen, Pausen zu dokumentieren und detaillierte Berichte zu erstellen.

### Hauptfunktionen

- **Zeiterfassung**: Einfaches Starten, Pausieren und Stoppen von Zeitmessungen
- **Projektbasierte Organisation**: Zuordnung von Zeiten zu spezifischen Projekten und Aufgaben
- **Dashboard mit Statistiken**: Übersichtliche Darstellung der geleisteten Arbeitsstunden pro Tag, Woche und Monat
- **Auftragsmanagement**: Verwaltung und Verfolgung von Kundenaufträgen
- **Benutzerprofile**: Individuelle Einstellungen und Präferenzen
- **Synchronisation**: Cloud-basierte Datenspeicherung für den Zugriff von verschiedenen Geräten

## Technische Details

- Entwickelt mit **Flutter** und **Dart**
- Datenbank und Authentifizierung über **Firebase**
- **Material Design 3** für moderne und responsive Benutzeroberfläche
- Unterstützung für **iOS** und **Android**
- Implementierung von **State Management** mit Provider und GoRouter
- Datenvisualisierung mit **FL Chart**

## Installation

### Voraussetzungen

- Flutter SDK (Version ^3.7.2)
- Dart SDK
- Android Studio oder Xcode (je nach Zielplattform)
- Firebase-Projekt (für Backend-Funktionalität)

### Einrichtung

1. Repository klonen:
   ```
   git clone https://github.com/TechLogia-de/TimeTrackerApp.git
   ```

2. Ins Projektverzeichnis wechseln:
   ```
   cd TimeTrackerApp
   ```

3. Abhängigkeiten installieren:
   ```
   flutter pub get
   ```

4. Firebase konfigurieren:
   - Erstellen Sie ein Projekt in der Firebase Console
   - Fügen Sie iOS/Android-Apps zum Firebase-Projekt hinzu
   - Laden Sie die entsprechenden Konfigurationsdateien herunter
   - Platzieren Sie die Dateien im Projekt wie in der Firebase-Dokumentation beschrieben

5. App ausführen:
   ```
   flutter run
   ```

## Projektstruktur

```
lib/
├── main.dart              # App-Einstiegspunkt und Konfiguration
├── firebase_options.dart  # Firebase-Konfiguration
├── models/               # Datenmodelle
├── screens/              # UI-Screens
│   ├── dashboard_screen.dart
│   ├── time/
│   ├── orders_screen.dart
│   └── profile_screen.dart
├── services/             # Business Logic und API-Dienste
├── widgets/              # Wiederverwendbare UI-Komponenten
└── utils/               # Hilfsfunktionen und Konstanten
```

## Mitwirken

Beiträge zum Projekt sind willkommen! Bitte folgen Sie diesen Schritten:

1. Repository forken
2. Feature-Branch erstellen (`git checkout -b feature/AmazingFeature`)
3. Änderungen committen (`git commit -m 'Add some AmazingFeature'`)
4. Branch pushen (`git push origin feature/AmazingFeature`)
5. Pull Request öffnen

## Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe [LICENSE](LICENSE) für Details.

## Kontakt

TechLogia - [info@techlogia.de](mailto:info@techlogia.de)

Projektlink: [https://github.com/TechLogia-de/TimeTrackerApp](https://github.com/TechLogia-de/TimeTrackerApp)
