import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../services/auth_service.dart';
import '../../screens/settings_screen.dart';
import '../../screens/main_layout.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:badges/badges.dart' as badges;
import '../../models/notification_model.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'dart:io' show Platform;

class AppTopBar extends StatefulWidget implements PreferredSizeWidget {
  final User user;
  final AuthService? authService;
  final String? title;
  final List<Widget>? actions;

  const AppTopBar({
    super.key,
    required this.user,
    this.authService,
    this.title,
    this.actions,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  State<AppTopBar> createState() => _AppTopBarState();
}

class _AppTopBarState extends State<AppTopBar> {
  int _unreadNotifications = 0;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  List<AppNotification> _notifications = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadNotifications();
  }

  // Lädt die Benachrichtigungen für den aktuellen Benutzer
  Future<void> _loadNotifications() async {
    if (_isLoading) return;
    
    setState(() {
      _isLoading = true;
    });
    
    try {
      // Nur ungelesene Benachrichtigungen laden
      final snapshot = await _firestore
          .collection('notifications')
          .where('userId', isEqualTo: widget.user.uid)
          .where('read', isEqualTo: false)
          .orderBy('createdAt', descending: true)
          .limit(10)
          .get();
      
      final notifications = snapshot.docs
          .map((doc) => AppNotification.fromFirestore(doc))
          .toList();
      
      setState(() {
        _notifications = notifications;
        _unreadNotifications = notifications.length;
        _isLoading = false;
      });

      // Badge-Zähler für iOS aktualisieren
      if (Platform.isIOS) {
        await _updateIOSBadge(_unreadNotifications);
      }
    } catch (e) {
      print('Fehler beim Laden der Benachrichtigungen: $e');
      setState(() {
        _isLoading = false;
      });
    }
  }

  // Aktualisiert den iOS-Badge-Zähler
  Future<void> _updateIOSBadge(int count) async {
    try {
      final FlutterLocalNotificationsPlugin plugin = FlutterLocalNotificationsPlugin();
      
      // Badge-Zähler setzen
      await plugin.show(
        0, // Einzigartige ID für den Badge-Update
        '', // Leerer Titel
        '', // Leerer Inhalt
        NotificationDetails(
          iOS: DarwinNotificationDetails(
            presentAlert: false,
            presentBadge: true,
            presentSound: false,
            badgeNumber: count,
          ),
        ),
      );
      
      print('🔢 iOS App-Badge-Zähler auf $count gesetzt');
    } catch (e) {
      print('❌ Fehler beim Aktualisieren des iOS-Badge-Zählers: $e');
    }
  }

  // Markiert eine Benachrichtigung als gelesen
  Future<void> _markAsRead(String notificationId) async {
    try {
      await _firestore
          .collection('notifications')
          .doc(notificationId)
          .update({'read': true, 'readAt': DateTime.now()});
      
      // Aktualisiere die lokale Liste
      setState(() {
        _notifications.removeWhere((notification) => notification.id == notificationId);
        _unreadNotifications = _notifications.length;
      });
    } catch (e) {
      print('Fehler beim Markieren der Benachrichtigung als gelesen: $e');
    }
  }

  // Markiert alle Benachrichtigungen als gelesen
  Future<void> _markAllAsRead() async {
    try {
      // Batch-Aktualisierung für bessere Performance
      final batch = _firestore.batch();
      
      for (final notification in _notifications) {
        final docRef = _firestore.collection('notifications').doc(notification.id);
        batch.update(docRef, {
          'read': true,
          'readAt': DateTime.now(),
        });
      }
      
      await batch.commit();
      
      // Aktualisiere die lokale Liste
      setState(() {
        _notifications = [];
        _unreadNotifications = 0;
      });
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Alle Benachrichtigungen wurden als gelesen markiert'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 2),
        ),
      );
    } catch (e) {
      print('Fehler beim Markieren aller Benachrichtigungen als gelesen: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Fehler beim Markieren der Benachrichtigungen'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }
  
  // Löscht alle Benachrichtigungen für den aktuellen Benutzer
  Future<void> _deleteAllNotifications() async {
    try {
      // Batch-Löschung für bessere Performance
      final batch = _firestore.batch();
      
      for (final notification in _notifications) {
        final docRef = _firestore.collection('notifications').doc(notification.id);
        batch.delete(docRef);
      }
      
      await batch.commit();
      
      // Aktualisiere die lokale Liste
      setState(() {
        _notifications = [];
        _unreadNotifications = 0;
      });
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Alle Benachrichtigungen wurden gelöscht'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 2),
        ),
      );
    } catch (e) {
      print('Fehler beim Löschen aller Benachrichtigungen: $e');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Fehler beim Löschen der Benachrichtigungen'),
          backgroundColor: Colors.red,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  // Löschbestätigungsdialog anzeigen
  void _showDeleteConfirmation(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text(
          'Alle Benachrichtigungen löschen',
          style: TextStyle(fontSize: 18),
        ),
        content: const Text(
          'Möchten Sie wirklich alle Benachrichtigungen löschen?',
          style: TextStyle(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
              _deleteAllNotifications();
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Löschen'),
          ),
        ],
      ),
    );
  }

  // Benachrichtigungen anzeigen
  void _showNotificationsDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Titel kleiner und mit Overflow-Handling
            Flexible(
              child: Text(
                'Benachrichtigungen',
                style: TextStyle(fontSize: 16),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (_notifications.isNotEmpty)
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    icon: const Icon(Icons.check_circle, size: 16),
                    tooltip: 'Alle als gelesen markieren',
                    constraints: BoxConstraints.tightFor(width: 28, height: 28),
                    padding: EdgeInsets.zero,
                    onPressed: () {
                      Navigator.pop(context);
                      _markAllAsRead();
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete, size: 16),
                    tooltip: 'Alle löschen',
                    constraints: BoxConstraints.tightFor(width: 28, height: 28),
                    padding: EdgeInsets.zero,
                    onPressed: () {
                      Navigator.pop(context);
                      // Sicherheitsabfrage vor dem Löschen
                      _showDeleteConfirmation(context);
                    },
                  ),
                ],
              ),
          ],
        ),
        contentPadding: EdgeInsets.fromLTRB(16, 16, 16, 0),
        content: SizedBox(
          width: double.maxFinite,
          height: MediaQuery.of(context).size.height * 0.5, // Höhe auf 50% der Bildschirmhöhe begrenzen
          child: _isLoading 
              ? const Center(child: CircularProgressIndicator())
              : _notifications.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.notifications_off, size: 48, color: Colors.grey),
                          SizedBox(height: 16),
                          Text(
                            'Keine ungelesenen Benachrichtigungen',
                            style: TextStyle(color: Colors.grey),
                          ),
                        ],
                      ),
                    )
                  : Column(
                      children: [
                        // Aktionsleiste hinzufügen
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8.0),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${_notifications.length} ${_notifications.length == 1 ? 'Benachrichtigung' : 'Benachrichtigungen'}',
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              TextButton.icon(
                                icon: Icon(Icons.delete_sweep, size: 14),
                                label: Text('Löschen', style: TextStyle(fontSize: 12)),
                                style: TextButton.styleFrom(
                                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  minimumSize: Size(10, 10),
                                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                ),
                                onPressed: () {
                                  Navigator.pop(context);
                                  _showDeleteConfirmation(context);
                                },
                              ),
                              SizedBox(width: 4),
                              TextButton.icon(
                                icon: Icon(Icons.done_all, size: 14),
                                label: Text('Gelesen', style: TextStyle(fontSize: 12)),
                                style: TextButton.styleFrom(
                                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  minimumSize: Size(10, 10),
                                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                ),
                                onPressed: () {
                                  Navigator.pop(context);
                                  _markAllAsRead();
                                },
                              ),
                            ],
                          ),
                        ),
                        Divider(height: 1),
                        Expanded(
                          child: ListView.separated(
                            shrinkWrap: true,
                            physics: const AlwaysScrollableScrollPhysics(),
                            itemCount: _notifications.length,
                            separatorBuilder: (context, index) => const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final notification = _notifications[index];
                              return Dismissible(
                                key: Key(notification.id),
                                background: Container(
                                  color: Colors.green,
                                  child: const Align(
                                    alignment: Alignment.centerLeft,
                                    child: Padding(
                                      padding: EdgeInsets.only(left: 16.0),
                                      child: Icon(Icons.check, color: Colors.white),
                                    ),
                                  ),
                                ),
                                secondaryBackground: Container(
                                  color: Colors.red,
                                  child: const Align(
                                    alignment: Alignment.centerRight,
                                    child: Padding(
                                      padding: EdgeInsets.only(right: 16.0),
                                      child: Icon(Icons.delete, color: Colors.white),
                                    ),
                                  ),
                                ),
                                confirmDismiss: (direction) async {
                                  if (direction == DismissDirection.endToStart) {
                                    // Löschbestätigung
                                    return await showDialog<bool>(
                                      context: context,
                                      builder: (context) => AlertDialog(
                                        title: const Text('Benachrichtigung löschen'),
                                        content: const Text('Möchten Sie diese Benachrichtigung wirklich löschen?'),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.of(context).pop(false),
                                            child: const Text('Abbrechen'),
                                          ),
                                          TextButton(
                                            onPressed: () => Navigator.of(context).pop(true),
                                            child: const Text('Löschen'),
                                          ),
                                        ],
                                      ),
                                    ) ?? false;
                                  }
                                  // Bei Links-Swipe einfach als gelesen markieren
                                  return true;
                                },
                                onDismissed: (direction) {
                                  if (direction == DismissDirection.endToStart) {
                                    // Löschen
                                    _deleteNotification(notification.id);
                                  } else {
                                    // Als gelesen markieren
                                    _markAsRead(notification.id);
                                  }
                                },
                                child: Container(
                                  color: Theme.of(context).colorScheme.surface,
                                  child: ListTile(
                                    contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                                    dense: true,
                                    leading: CircleAvatar(
                                      backgroundColor: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                                      radius: 20,
                                      child: Icon(
                                        notification.type == 'time_approval' 
                                            ? Icons.timer_outlined 
                                            : Icons.notifications_outlined,
                                        color: Theme.of(context).colorScheme.primary,
                                        size: 18,
                                      ),
                                    ),
                                    title: Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            notification.title,
                                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                        Text(
                                          _formatRelativeTime(notification.createdAt),
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Theme.of(context).colorScheme.onSurface.withOpacity(0.6),
                                          ),
                                        ),
                                      ],
                                    ),
                                    subtitle: Text(
                                      notification.body,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(fontSize: 12),
                                    ),
                                    onTap: () {
                                      _markAsRead(notification.id);
                                      Navigator.pop(context);
                                      // Optional: Navigation zur entsprechenden Seite
                                      if (notification.type == 'time_approval' && notification.relatedEntityId != null) {
                                        _navigateToTimeEntry(notification.relatedEntityId!);
                                      }
                                    },
                                    trailing: IconButton(
                                      icon: const Icon(Icons.check_circle_outline, size: 16),
                                      padding: EdgeInsets.zero,
                                      constraints: BoxConstraints.tightFor(width: 32, height: 32),
                                      onPressed: () => _markAsRead(notification.id),
                                      tooltip: 'Als gelesen markieren',
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Schließen'),
          ),
        ],
      ),
    );
  }

  // Löscht eine einzelne Benachrichtigung
  Future<void> _deleteNotification(String notificationId) async {
    try {
      await _firestore.collection('notifications').doc(notificationId).delete();
      
      // Aktualisiere die lokale Liste
      setState(() {
        _notifications.removeWhere((notification) => notification.id == notificationId);
        _unreadNotifications = _notifications.length;
      });
    } catch (e) {
      print('Fehler beim Löschen der Benachrichtigung: $e');
    }
  }
  
  // Formatiert einen relativen Zeitstempel (z.B. "vor 5 Minuten")
  String _formatRelativeTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);
    
    if (difference.inDays > 0) {
      return '${difference.inDays}d';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m';
    } else {
      return 'jetzt';
    }
  }
  
  // Zur Zeiterfassungsdetailseite navigieren
  void _navigateToTimeEntry(String entryId) {
    // Hier können Sie zur Detailseite des Zeiteintrags navigieren
    // Zum Beispiel: context.go('/time/$entryId');
    print('Navigation zum Zeiteintrag $entryId');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return AppBar(
      backgroundColor: theme.colorScheme.primary,
      elevation: 2,
      title: Row(
        children: [
          Icon(
            Icons.timer_outlined, 
            color: Colors.white,
            size: 20,
          ),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              widget.title ?? 'TimeTracker',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 18,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
      actions: [
        if (widget.actions != null) ...widget.actions!,
        // Benachrichtigungssymbol mit Badge - Layout-Problem behoben
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8.0),
          child: badges.Badge(
            position: badges.BadgePosition.topEnd(top: 0, end: 0),
            showBadge: _unreadNotifications > 0,
            badgeContent: Text(
              _unreadNotifications.toString(),
              style: const TextStyle(color: Colors.white, fontSize: 10),
            ),
            badgeStyle: const badges.BadgeStyle(
              badgeColor: Colors.red,
              padding: EdgeInsets.all(4),
            ),
            child: IconButton(
              icon: const Icon(Icons.notifications_outlined, color: Colors.white),
              onPressed: () {
                _loadNotifications(); // Aktualisiere Benachrichtigungen
                _showNotificationsDialog();
              },
              constraints: const BoxConstraints(
                minWidth: 40,
                minHeight: 40,
              ),
              padding: EdgeInsets.zero,
            ),
          ),
        ),
        _buildUserMenu(context, theme),
        const SizedBox(width: 4),
      ],
    );
  }

  Widget _buildUserMenu(BuildContext context, ThemeData theme) {
    return PopupMenuButton<String>(
      offset: const Offset(0, 40),
      icon: CircleAvatar(
        backgroundColor: theme.colorScheme.onPrimary,
        radius: 14,
        child: Text(
          (widget.user.displayName?.isNotEmpty == true)
              ? widget.user.displayName![0].toUpperCase()
              : (widget.user.email?.isNotEmpty == true)
                  ? widget.user.email![0].toUpperCase()
                  : '?',
          style: TextStyle(
            color: theme.colorScheme.primary,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      itemBuilder: (BuildContext context) {
        return [
          PopupMenuItem<String>(
            value: 'profile',
            child: Row(
              children: [
                Icon(Icons.person_outline, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                const Text('Profil anzeigen'),
              ],
            ),
          ),
          PopupMenuItem<String>(
            value: 'settings',
            child: Row(
              children: [
                Icon(Icons.settings_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                const Text('Einstellungen'),
              ],
            ),
          ),
          const PopupMenuDivider(),
          PopupMenuItem<String>(
            value: 'logout',
            child: Row(
              children: [
                Icon(Icons.logout_outlined, color: theme.colorScheme.error),
                const SizedBox(width: 8),
                Text(
                  'Abmelden',
                  style: TextStyle(color: theme.colorScheme.error),
                ),
              ],
            ),
          ),
        ];
      },
      onSelected: (String value) async {
        switch (value) {
          case 'profile':
            // Navigiere zur Profilseite (MainLayout mit Index 3)
            if (context.findAncestorWidgetOfExactType<MainLayout>() != null) {
              final mainLayoutState = context.findAncestorStateOfType<MainLayoutState>();
              if (mainLayoutState != null) {
                mainLayoutState.changeTab(3); // Index für den Profil-Tab
              }
            }
            break;
          case 'settings':
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => SettingsScreen(user: widget.user),
              ),
            );
            break;
          case 'logout':
            // Bestätigungsdialog anzeigen
            final bool? confirmLogout = await showDialog<bool>(
              context: context,
              builder: (context) => AlertDialog(
                title: const Text('Abmelden'),
                content: const Text('Möchten Sie sich wirklich abmelden?'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    child: const Text('Abbrechen'),
                  ),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: const Text('Abmelden'),
                  ),
                ],
              ),
            );
            
            if (confirmLogout == true && widget.authService != null) {
              await widget.authService!.signOut();
            }
            break;
        }
      },
    );
  }
} 