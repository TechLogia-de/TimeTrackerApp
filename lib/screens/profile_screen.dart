import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../services/auth_service.dart';

class ProfileScreen extends StatefulWidget {
  final User user;
  
  const ProfileScreen({
    super.key, 
    required this.user,
  });

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with AutomaticKeepAliveClientMixin {
  final AuthService _authService = AuthService();
  
  // AutomaticKeepAliveClientMixin-Implementierung
  @override
  bool get wantKeepAlive => true;
  
  // Laden-Status
  bool _isLoading = true;
  String? _errorMessage;
  
  // Benutzerdaten
  Map<String, dynamic> _userData = {};
  
  @override
  void initState() {
    super.initState();
    _loadUserData();
  }
  
  // Benutzerdaten aus Firebase laden
  Future<void> _loadUserData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    
    try {
      // Benutzerdaten aus Firestore abrufen
      final docRef = FirebaseFirestore.instance.collection('users').doc(widget.user.uid);
      final docSnapshot = await docRef.get();
      
      if (docSnapshot.exists) {
        final userData = docSnapshot.data() ?? {};
        
        // Stellen Sie sicher, dass eine gültige Avatar-URL vorhanden ist
        if (userData['avatar'] == null || userData['avatar'].toString().isEmpty) {
          // Verwende als Fallback eine PNG statt SVG
          userData['avatar'] = 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(userData['displayName'] ?? widget.user.email ?? 'User')}&background=random';
        }
        
        setState(() {
          _userData = userData;
          _isLoading = false;
        });
      } else {
        // Wenn keine Daten gefunden wurden, ein Standardprofil erstellen
        final displayName = widget.user.displayName ?? 'Unbekannt';
        final email = widget.user.email ?? '';
        
        setState(() {
          _userData = {
            'displayName': displayName,
            'email': email,
            'role': 'employee',
            'department': 'IT',
            'status': 'active',
            'lastActive': 'Jetzt',
            // Verwende als Fallback eine PNG statt SVG
            'avatar': widget.user.photoURL ?? 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(displayName)}&background=random',
            'skills': [],
            'experience': 0,
            'preferences': [],
            'position': '',
            'bio': '',
            'phone': '',
            'languages': [],
          };
          _isLoading = false;
        });
      }
    } catch (error) {
      setState(() {
        _errorMessage = 'Fehler beim Laden der Benutzerdaten: $error';
        _isLoading = false;
      });
    }
  }
  
  @override
  Widget build(BuildContext context) {
    // AutomaticKeepAliveClientMixin erfordert diesen Aufruf
    super.build(context);
    
    final theme = Theme.of(context);
    final size = MediaQuery.of(context).size;
    
    if (_isLoading) {
      return Center(
        child: CircularProgressIndicator(
          color: theme.colorScheme.primary,
        ),
      );
    }
      
    if (_errorMessage != null) {
      return _buildErrorView(theme);
    }
      
    return _buildProfileContent(theme, size);
  }
  
  Widget _buildErrorView(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 80,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              'Es ist ein Fehler aufgetreten',
              style: GoogleFonts.poppins(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              _errorMessage ?? 'Unbekannter Fehler',
              style: GoogleFonts.poppins(
                color: Colors.grey.shade700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadUserData,
              icon: const Icon(Icons.refresh),
              label: const Text('Erneut versuchen'),
              style: ElevatedButton.styleFrom(
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildProfileContent(ThemeData theme, Size size) {
    return RefreshIndicator(
      onRefresh: _loadUserData,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildProfileHeader(theme),
            const SizedBox(height: 24),
            _buildProfileDetails(theme),
            const SizedBox(height: 24),
            _buildSkillsSection(theme),
            const SizedBox(height: 24),
            _buildPreferencesSection(theme),
            const SizedBox(height: 40),
            
            // Abmelden-Button
            Center(
              child: ElevatedButton.icon(
                onPressed: () async {
                  try {
                    await _authService.signOut();
                  } catch (e) {
                    print('Fehler beim Abmelden: $e');
                    
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Fehler beim Abmelden: $e')),
                      );
                    }
                  }
                },
                icon: const Icon(Icons.logout),
                label: const Text('Abmelden'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(200, 45),
                ),
              ),
            ),
            
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
  
  Widget _buildProfileHeader(ThemeData theme) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Avatar
            CircleAvatar(
              radius: 60,
              backgroundColor: theme.colorScheme.primary.withOpacity(0.1),
              child: _userData['avatar'] == null || _userData['avatar'].isEmpty
                  ? Text(
                      _getInitials(_userData['displayName'] ?? ''),
                      style: GoogleFonts.poppins(
                        fontSize: 40,
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary,
                      ),
                    )
                  : ClipOval(
                      child: Image.network(
                        _userData['avatar'],
                        width: 120,
                        height: 120,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) {
                          // Fallback für Fehler beim Laden des Bildes
                          return Text(
                            _getInitials(_userData['displayName'] ?? ''),
                            style: GoogleFonts.poppins(
                              fontSize: 40,
                              fontWeight: FontWeight.bold,
                              color: theme.colorScheme.primary,
                            ),
                          );
                        },
                      ),
                    ),
            ),
            const SizedBox(height: 16),
            
            // Name
            Text(
              _userData['displayName'] ?? 'Unbekannter Benutzer',
              style: GoogleFonts.poppins(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            
            // Position
            if (_userData['position'] != null && _userData['position'].isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  _userData['position'],
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    color: Colors.grey.shade600,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            
            const SizedBox(height: 8),
            
            // Rolle und Abteilung als Badges
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _buildRoleBadge(theme),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.blue.shade100,
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: Text(
                    _userData['department'] ?? 'IT',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: Colors.blue.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Status-Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _userData['status'] == 'active' 
                        ? Colors.green.shade100 
                        : Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: Text(
                    _userData['status'] == 'active' ? 'Aktiv' : 'Inaktiv',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: _userData['status'] == 'active' 
                          ? Colors.green.shade700 
                          : Colors.grey.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            
            // Kurze Bio
            if (_userData['bio'] != null && _userData['bio'].isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  _userData['bio'],
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey.shade700,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildRoleBadge(ThemeData theme) {
    final role = _userData['role'] ?? 'employee';
    
    Color backgroundColor;
    Color textColor;
    String roleText;
    
    switch (role) {
      case 'admin':
        backgroundColor = Colors.purple.shade100;
        textColor = Colors.purple.shade700;
        roleText = 'Administrator';
        break;
      case 'manager':
        backgroundColor = Colors.blue.shade100;
        textColor = Colors.blue.shade700;
        roleText = 'Manager';
        break;
      default:
        backgroundColor = Colors.grey.shade200;
        textColor = Colors.grey.shade700;
        roleText = 'Mitarbeiter';
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(30),
      ),
      child: Text(
        roleText,
        style: GoogleFonts.poppins(
          fontSize: 12,
          color: textColor,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
  
  Widget _buildProfileDetails(ThemeData theme) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Kontaktinformationen',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            
            // E-Mail
            _buildDetailRow(
              icon: Icons.email_outlined,
              title: 'E-Mail',
              value: _userData['email'] ?? 'Keine E-Mail-Adresse',
              iconColor: Colors.blue,
            ),
            
            // Telefon
            if (_userData['phone'] != null && _userData['phone'].isNotEmpty)
              _buildDetailRow(
                icon: Icons.phone_outlined,
                title: 'Telefon',
                value: _userData['phone'],
                iconColor: Colors.green,
              ),
            
            // Sprachen
            if (_userData['languages'] != null && (_userData['languages'] as List).isNotEmpty)
              _buildDetailRow(
                icon: Icons.language_outlined,
                title: 'Sprachen',
                value: (_userData['languages'] as List).join(', '),
                iconColor: Colors.orange,
              ),
            
            // Erfahrung
            if (_userData['experience'] != null)
              _buildDetailRow(
                icon: Icons.work_outline,
                title: 'Erfahrung',
                value: '${_userData['experience']} Jahre',
                iconColor: Colors.purple,
              ),
            
            // Letzte Aktivität
            _buildDetailRow(
              icon: Icons.access_time,
              title: 'Letzte Aktivität',
              value: _userData['lastActive'] ?? 'Unbekannt',
              iconColor: Colors.grey,
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildDetailRow({
    required IconData icon,
    required String title,
    required String value,
    required Color iconColor,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              icon,
              size: 20,
              color: iconColor,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.grey.shade600,
                  ),
                ),
                Text(
                  value,
                  style: GoogleFonts.poppins(
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
  
  Widget _buildSkillsSection(ThemeData theme) {
    final skills = _userData['skills'] as List? ?? [];
    
    if (skills.isEmpty) return const SizedBox();
    
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Fähigkeiten',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: skills.map<Widget>((skill) {
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(
                      color: theme.colorScheme.primary.withOpacity(0.2),
                    ),
                  ),
                  child: Text(
                    skill.toString(),
                    style: GoogleFonts.poppins(
                      fontSize: 14,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
  
  Widget _buildPreferencesSection(ThemeData theme) {
    final preferences = _userData['preferences'] as List? ?? [];
    
    if (preferences.isEmpty) return const SizedBox();
    
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Präferenzen',
              style: GoogleFonts.poppins(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),
            ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: preferences.length,
              itemBuilder: (context, index) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Icon(
                        Icons.check_circle_outline,
                        color: theme.colorScheme.primary,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          preferences[index].toString(),
                          style: GoogleFonts.poppins(
                            fontSize: 15,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
  
  // Hilfsfunktion, um Initialen aus dem Namen zu extrahieren
  String _getInitials(String name) {
    if (name.isEmpty) return '??';
    
    final nameParts = name.split(' ');
    if (nameParts.length >= 2) {
      return '${nameParts[0][0]}${nameParts[1][0]}'.toUpperCase();
    } else if (nameParts.length == 1) {
      return nameParts[0].substring(0, min(2, nameParts[0].length)).toUpperCase();
    }
    
    return '??';
  }
  
  int min(int a, int b) => a < b ? a : b;
} 