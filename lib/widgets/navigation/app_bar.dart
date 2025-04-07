import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../services/auth_service.dart';
import '../../screens/settings_screen.dart';
import '../../screens/main_layout.dart';

class AppTopBar extends StatelessWidget implements PreferredSizeWidget {
  final User user;
  final AuthService? authService;
  final String? title;
  final List<Widget>? actions;

  const AppTopBar({
    Key? key,
    required this.user,
    this.authService,
    this.title,
    this.actions,
  }) : super(key: key);

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
              title ?? 'TimeTracker',
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
        if (actions != null) ...actions!,
        IconButton(
          icon: const Icon(Icons.notifications_outlined, color: Colors.white),
          onPressed: () {
            // Benachrichtigungen anzeigen
          },
          constraints: const BoxConstraints(
            minWidth: 36,
            minHeight: 36,
          ),
          padding: EdgeInsets.zero,
        ),
        _buildUserMenu(context, theme),
        const SizedBox(width: 4),
      ],
    );
  }

  Widget _buildUserMenu(BuildContext context, ThemeData theme) {
    final AuthService localAuthService = authService ?? AuthService();
    
    return PopupMenuButton<String>(
      offset: const Offset(0, 45),
      icon: CircleAvatar(
        radius: 14,
        backgroundColor: Colors.white,
        child: Text(
          user.email?.substring(0, 1).toUpperCase() ?? 'U',
          style: GoogleFonts.poppins(
            color: theme.colorScheme.primary,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      onSelected: (value) {
        switch (value) {
          case 'profile':
            // Zum Profil navigieren
            final parent = context.findAncestorStateOfType<MainLayoutState>();
            if (parent != null) {
              parent.changeTab(3); // 3 ist der Index für den Profil-Tab
            }
            break;
          case 'settings':
            // Zu den Einstellungen navigieren
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => SettingsScreen(user: user),
              ),
            );
            break;
          case 'logout':
            localAuthService.signOut();
            break;
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          value: 'profile',
          child: Row(
            children: [
              const Icon(Icons.person, size: 20),
              const SizedBox(width: 8),
              Text('Profil', style: GoogleFonts.poppins()),
            ],
          ),
        ),
        PopupMenuItem<String>(
          value: 'settings',
          child: Row(
            children: [
              const Icon(Icons.settings, size: 20),
              const SizedBox(width: 8),
              Text('Einstellungen', style: GoogleFonts.poppins()),
            ],
          ),
        ),
        const PopupMenuDivider(),
        PopupMenuItem<String>(
          value: 'logout',
          child: Row(
            children: [
              const Icon(Icons.logout, color: Colors.red, size: 20),
              const SizedBox(width: 8),
              Text('Abmelden', 
                style: GoogleFonts.poppins(
                  color: Colors.red,
                )
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
} 