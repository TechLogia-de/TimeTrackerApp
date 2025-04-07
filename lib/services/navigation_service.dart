import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:go_router/go_router.dart';

// Eine einfache Klasse zur zentralen Verwaltung der Navigation
class NavigationService {
  // Singleton-Muster für den Zugriff auf die Instanz
  static final NavigationService _instance = NavigationService._internal();
  
  factory NavigationService() => _instance;
  
  NavigationService._internal();
  
  // Der aktuelle ausgewählte Tab-Index
  int _selectedTabIndex = 0;
  
  // Getter für den aktuellen Tab-Index
  int get selectedTabIndex => _selectedTabIndex;
  
  // Setter für den Tab-Index
  set selectedTabIndex(int index) {
    _selectedTabIndex = index;
  }
  
  // Navigation basierend auf Tab-Index
  void navigateToTab(BuildContext context, int index, User user) {
    // Setze den Tab-Index
    _selectedTabIndex = index;
    
    // Navigation mit Go Router
    switch (index) {
      case 0:
        context.go('/');
        break;
      case 1:
        context.go('/time');
        break;
      case 2:
        context.go('/orders');
        break;
      case 3:
        context.go('/profile');
        break;
      default:
        context.go('/');
    }
  }
  
  // Navigation zur Zeiterfassung
  void navigateToTime(BuildContext context, User user) {
    // Navigiere zum Tab-Index 1 (Zeit)
    navigateToTab(context, 1, user);
  }
  
  // Navigation zum Auftragsmanagement
  void navigateToOrders(BuildContext context, User user) {
    // Navigiere zum Tab-Index 2 (Aufträge)
    navigateToTab(context, 2, user);
  }
} 