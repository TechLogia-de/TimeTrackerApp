import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../services/settings_service.dart';
import '../services/time/time_entry_service.dart';

class SettingsScreen extends StatefulWidget {
  final User user;
  
  const SettingsScreen({
    super.key,
    required this.user,
  });

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final SettingsService _settingsService = SettingsService();
  final TimeEntryService _timeEntryService = TimeEntryService();
  bool _isLoading = true;
  late Color _selectedThemeColor;
  late Color _selectedAccentColor;
  late String _selectedLanguage;
  late bool _notificationsEnabled;
  late String _darkMode;
  
  // Liste der verfügbaren Themenfarben
  final List<Color> _themeColors = [
    const Color(0xFF4A6572),
    Colors.blue,
    Colors.teal,
    Colors.green,
    Colors.purple,
    Colors.deepPurple,
    Colors.indigo,
    Colors.red,
  ];
  
  // Liste der verfügbaren Akzentfarben
  final List<Color> _accentColors = [
    const Color(0xFFF9AA33),
    Colors.amber,
    Colors.orange,
    Colors.deepOrange,
    Colors.pink,
    Colors.red,
    Colors.lightBlue,
    Colors.lightGreen,
  ];
  
  // Liste der verfügbaren Sprachen
  final List<Map<String, String>> _languages = [
    {'code': 'de', 'name': 'Deutsch'},
    {'code': 'en', 'name': 'English'},
    {'code': 'fr', 'name': 'Français'},
    {'code': 'es', 'name': 'Español'},
    {'code': 'it', 'name': 'Italiano'},
  ];

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() {
      _isLoading = true;
    });
    
    // Einstellungen laden
    await _settingsService.init();
    
    setState(() {
      _isLoading = false;
      _selectedThemeColor = _settingsService.themeColor;
      _selectedAccentColor = _settingsService.accentColor;
      _selectedLanguage = _settingsService.language;
      _notificationsEnabled = _settingsService.notificationsEnabled;
      _darkMode = _settingsService.darkMode;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(
          title: Text(
            'Einstellungen',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.bold,
            ),
          ),
          backgroundColor: theme.colorScheme.primary,
        ),
        body: const Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Einstellungen',
          style: GoogleFonts.poppins(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        backgroundColor: theme.colorScheme.primary,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.restore),
            tooltip: 'Einstellungen zurücksetzen',
            onPressed: _showResetDialog,
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Einstellungen',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 24),
            
            // Abschnitt: Thema
            _buildSectionHeader('Thema'),
            const SizedBox(height: 16),
            
            // Primäre Themenfarbe
            const Text('Primäre Farbe'),
            const SizedBox(height: 8),
            _buildColorSelector(
              colors: _themeColors,
              selectedColor: _selectedThemeColor,
              onColorSelected: (color) async {
                await _settingsService.setThemeColor(color);
                setState(() {
                  _selectedThemeColor = color;
                });
              },
            ),
            const SizedBox(height: 16),
            
            // Akzentfarbe
            const Text('Akzentfarbe'),
            const SizedBox(height: 8),
            _buildColorSelector(
              colors: _accentColors,
              selectedColor: _selectedAccentColor,
              onColorSelected: (color) async {
                await _settingsService.setAccentColor(color);
                setState(() {
                  _selectedAccentColor = color;
                });
              },
            ),
            const SizedBox(height: 16),
            
            // Dunkelmodus
            const Text('Dunkelmodus'),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'light',
                  label: Text('Hell'),
                  icon: Icon(Icons.light_mode),
                ),
                ButtonSegment(
                  value: 'system',
                  label: Text('System'),
                  icon: Icon(Icons.smartphone),
                ),
                ButtonSegment(
                  value: 'dark',
                  label: Text('Dunkel'),
                  icon: Icon(Icons.dark_mode),
                ),
              ],
              selected: {_darkMode},
              onSelectionChanged: (newSelection) async {
                final mode = newSelection.first;
                await _settingsService.setDarkMode(mode);
                setState(() {
                  _darkMode = mode;
                });
              },
            ),
            const SizedBox(height: 32),
            
            // Abschnitt: Sprache
            _buildSectionHeader('Sprache'),
            const SizedBox(height: 16),
            
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(
                labelText: 'Sprache auswählen',
                border: OutlineInputBorder(),
              ),
              value: _selectedLanguage,
              items: _languages.map((language) {
                return DropdownMenuItem<String>(
                  value: language['code'],
                  child: Text(language['name']!),
                );
              }).toList(),
              onChanged: (value) async {
                if (value != null) {
                  await _settingsService.setLanguage(value);
                  setState(() {
                    _selectedLanguage = value;
                  });
                }
              },
            ),
            const SizedBox(height: 32),
            
            // Abschnitt: Benachrichtigungen
            _buildSectionHeader('Benachrichtigungen'),
            const SizedBox(height: 16),
            
            SwitchListTile(
              title: const Text('Benachrichtigungen aktivieren'),
              subtitle: const Text('Erhalte Erinnerungen und Timer-Updates'),
              value: _notificationsEnabled,
              onChanged: (value) async {
                if (value) {
                  // Wenn Benachrichtigungen aktiviert werden sollen, erst Berechtigung anfordern
                  final permissionGranted = await _settingsService.requestNotificationPermission();
                  setState(() {
                    _notificationsEnabled = permissionGranted;
                  });
                } else {
                  // Wenn Benachrichtigungen deaktiviert werden sollen
                  await _settingsService.setNotificationsEnabled(false);
                  setState(() {
                    _notificationsEnabled = false;
                  });
                }
              },
            ),
            
            if (_notificationsEnabled) ...[
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _testNotification,
                icon: const Icon(Icons.notifications_active),
                label: const Text('Test-Benachrichtigung senden'),
              ),
              const SizedBox(height: 8),
              // Debug-Test-Button für direkte Benachrichtigung
              OutlinedButton.icon(
                onPressed: _sendDebugNotification,
                icon: const Icon(Icons.bug_report),
                label: const Text('Direkte Test-Benachrichtigung'),
              ),
            ],
            
            const SizedBox(height: 32),
            
            // Zurücksetzen aller Einstellungen
            OutlinedButton.icon(
              onPressed: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (context) => AlertDialog(
                    title: const Text('Einstellungen zurücksetzen'),
                    content: const Text('Möchten Sie alle Einstellungen auf die Standardwerte zurücksetzen?'),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.of(context).pop(false),
                        child: const Text('Abbrechen'),
                      ),
                      FilledButton(
                        onPressed: () => Navigator.of(context).pop(true),
                        child: const Text('Zurücksetzen'),
                      ),
                    ],
                  ),
                );
                
                if (confirm == true) {
                  await _settingsService.resetSettings();
                  await _loadSettings();
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Einstellungen zurückgesetzt')),
                    );
                  }
                }
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Einstellungen zurücksetzen'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  // Widget für die Überschrift eines Abschnitts
  Widget _buildSectionHeader(String title) {
    return Row(
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(width: 8),
        const Expanded(
          child: Divider(),
        ),
      ],
    );
  }
  
  // Widget für die Farbauswahl
  Widget _buildColorSelector({
    required List<Color> colors,
    required Color selectedColor,
    required Function(Color) onColorSelected,
  }) {
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: colors.map((color) {
        final isSelected = color.value == selectedColor.value;
        return GestureDetector(
          onTap: () => onColorSelected(color),
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              border: Border.all(
                color: isSelected ? Colors.white : Colors.transparent,
                width: 3,
              ),
              boxShadow: [
                BoxShadow(
                  color: isSelected ? color.withOpacity(0.8) : Colors.black12,
                  blurRadius: 4,
                  spreadRadius: isSelected ? 1 : 0,
                ),
              ],
            ),
            child: isSelected
                ? const Icon(
                    Icons.check,
                    color: Colors.white,
                  )
                : null,
          ),
        );
      }).toList(),
    );
  }
  
  // Dialog zum Zurücksetzen der Einstellungen
  void _showResetDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          'Einstellungen zurücksetzen',
          style: GoogleFonts.poppins(
            fontWeight: FontWeight.bold,
          ),
        ),
        content: Text(
          'Möchtest du alle Einstellungen auf die Standardwerte zurücksetzen?',
          style: GoogleFonts.poppins(),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(
              'Abbrechen',
              style: GoogleFonts.poppins(),
            ),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await _settingsService.resetSettings();
              setState(() {});
              
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Einstellungen zurückgesetzt.'),
                    duration: const Duration(seconds: 2),
                  ),
                );
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: Text(
              'Zurücksetzen',
              style: GoogleFonts.poppins(),
            ),
          ),
        ],
      ),
    );
  }
  
  // Benachrichtigungen testen
  Future<void> _testNotification() async {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Sende Test-Benachrichtigung...'),
        duration: Duration(seconds: 1),
      ),
    );
    
    final entry = await _timeEntryService.getMostRecentTimeEntry(widget.user.uid);
    
    if (entry != null) {
      await _timeEntryService.sendApprovalNotification(entry);
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Test-Benachrichtigung wurde gesendet'),
          backgroundColor: Colors.green,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Kein Zeiteintrag gefunden für den Test'),
          backgroundColor: Colors.orange,
        ),
      );
    }
  }

  // Debug-Test-Button für direkte Benachrichtigung
  Future<void> _sendDebugNotification() async {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Sende direkte Test-Benachrichtigung...'),
        duration: Duration(seconds: 1),
      ),
    );
    
    await _settingsService.sendDebugNotification();
    
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Direkte Test-Benachrichtigung wurde gesendet'),
        backgroundColor: Colors.green,
      ),
    );
  }
} 