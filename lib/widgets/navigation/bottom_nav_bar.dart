import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppBottomNavBar extends StatelessWidget {
  final int selectedIndex;
  final Function(int) onItemTapped;

  const AppBottomNavBar({
    super.key,
    required this.selectedIndex,
    required this.onItemTapped,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return BottomAppBar(
      height: 65,
      notchMargin: 8.0,
      shape: const CircularNotchedRectangle(),
      color: Colors.white,
      elevation: 12,
      shadowColor: Colors.black38,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildNavItem(
            context: context,
            index: 0,
            icon: Icons.dashboard_outlined,
            label: 'Dashboard',
          ),
          _buildNavItem(
            context: context,
            index: 1,
            icon: Icons.access_time,
            label: 'Zeit', // Kürzerer Text für "Zeiterfassung"
          ),
          const Expanded(child: SizedBox(width: 10)), // Platz für den FloatingActionButton
          _buildNavItem(
            context: context,
            index: 2,
            icon: Icons.assignment_outlined,
            label: 'Aufträge',
          ),
          _buildNavItem(
            context: context,
            index: 3,
            icon: Icons.person_outlined,
            label: 'Profil',
          ),
        ],
      ),
    );
  }

  Widget _buildNavItem({
    required BuildContext context,
    required int index,
    required IconData icon,
    required String label,
  }) {
    final theme = Theme.of(context);
    final isSelected = selectedIndex == index;
    
    return Expanded(
      child: InkWell(
        onTap: () => onItemTapped(index),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              color: isSelected ? theme.colorScheme.primary : Colors.grey,
              size: 24,
            ),
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 11,
                color: isSelected ? theme.colorScheme.primary : Colors.grey,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
} 