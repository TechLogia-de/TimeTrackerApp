import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class TimerDialogs {
  static void showStartTimerDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SingleChildScrollView(
          child: Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom + 24,
              left: 16,
              right: 16,
              top: 16,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Zeit erfassen',
                  style: GoogleFonts.poppins(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'Auftrag auswählen',
                    prefixIcon: Icon(Icons.assignment),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  decoration: const InputDecoration(
                    labelText: 'Beschreibung (optional)',
                    prefixIcon: Icon(Icons.description),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      Navigator.pop(context);
                      // Timer starten
                    },
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('Timer starten'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  static void showAddOptionsDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ListTile(
                    leading: Icon(
                      Icons.access_time,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    title: Text(
                      'Zeit erfassen',
                      style: GoogleFonts.poppins(),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      showStartTimerDialog(context);
                    },
                  ),
                  ListTile(
                    leading: Icon(
                      Icons.assignment_add,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    title: Text(
                      'Neuer Auftrag',
                      style: GoogleFonts.poppins(),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      // Formular für neuen Auftrag anzeigen
                    },
                  ),
                  ListTile(
                    leading: Icon(
                      Icons.note_add,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    title: Text(
                      'Notiz hinzufügen',
                      style: GoogleFonts.poppins(),
                    ),
                    onTap: () {
                      Navigator.pop(context);
                      // Formular für neue Notiz anzeigen
                    },
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
} 