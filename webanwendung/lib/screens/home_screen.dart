import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import 'login_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final user = authProvider.user;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Zeiterfassung'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await authProvider.signOut();
              if (context.mounted) {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (context) => const LoginScreen()),
                );
              }
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Begrüßung
              Card(
                elevation: 2,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Willkommen, ${user?.email?.split('@').first ?? 'Benutzer'}!',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Erfassen Sie Ihre Arbeitszeiten und behalten Sie den Überblick.',
                        style: TextStyle(fontSize: 16),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // Schnellzugriff auf Funktionen
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
                children: [
                  // Zeit starten
                  _buildFeatureCard(
                    context,
                    'Zeit starten',
                    Icons.play_circle_outline,
                    Colors.green,
                    () {
                      _showMessage(context, 'Zeiterfassung gestartet');
                    },
                  ),
                  
                  // Zeit beenden
                  _buildFeatureCard(
                    context,
                    'Zeit stoppen',
                    Icons.stop_circle_outlined,
                    Colors.red,
                    () {
                      _showMessage(context, 'Zeiterfassung gestoppt');
                    },
                  ),
                  
                  // Bericht anzeigen
                  _buildFeatureCard(
                    context,
                    'Berichte',
                    Icons.bar_chart,
                    Colors.blue,
                    () {
                      _showMessage(context, 'Berichte werden geladen...');
                    },
                  ),
                  
                  // Einstellungen
                  _buildFeatureCard(
                    context,
                    'Einstellungen',
                    Icons.settings,
                    Colors.grey,
                    () {
                      _showMessage(context, 'Einstellungen');
                    },
                  ),
                ],
              ),
              
              const SizedBox(height: 24),
              
              // Aktuelle Aktivität
              const Text(
                'Aktuelle Aktivität',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              
              // Beispiel für aktuelle Aktivität
              const Card(
                child: ListTile(
                  leading: Icon(Icons.access_time),
                  title: Text('Keine aktive Zeiterfassung'),
                  subtitle: Text('Starten Sie eine neue Zeiterfassung'),
                ),
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          _showMessage(context, 'Neue Zeiterfassung');
        },
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildFeatureCard(BuildContext context, String title, IconData icon,
      Color color, VoidCallback onTap) {
    return Card(
      elevation: 2,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 40,
                color: color,
              ),
              const SizedBox(height: 12),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showMessage(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        duration: const Duration(seconds: 2),
      ),
    );
  }
} 