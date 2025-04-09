import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:go_router/go_router.dart';
import '../services/shift_service.dart';
import './availability_screen.dart';

// Schicht-Modell
class Shift {
  final String id;
  final String title;
  final String date;
  final String startTime;
  final String endTime;
  final List<ShiftAssignment> assignedUsers;
  final String? notes;
  final String? approvalDeadline;
  
  Shift({
    required this.id,
    required this.title,
    required this.date,
    required this.startTime,
    required this.endTime,
    required this.assignedUsers,
    this.notes,
    this.approvalDeadline,
  });
  
  // Factory-Methode zum Erstellen aus Firestore-Daten
  factory Shift.fromMap(Map<String, dynamic> map) {
    return Shift(
      id: map['id'],
      title: map['title'],
      date: map['date'],
      startTime: map['startTime'],
      endTime: map['endTime'],
      assignedUsers: (map['assignedUsers'] as List<dynamic>?)
          ?.map((user) => ShiftAssignment.fromMap(user))
          .toList() ?? [],
      notes: map['notes'],
      approvalDeadline: map['approvalDeadline'],
    );
  }
}

// Schichtzuweisung-Modell
class ShiftAssignment {
  final String userId;
  final String userName;
  final String status; // 'accepted', 'declined', 'pending', 'assigned'
  final String? notes;
  
  ShiftAssignment({
    required this.userId,
    required this.userName,
    required this.status,
    this.notes,
  });
  
  // Factory-Methode zum Erstellen aus Firestore-Daten
  factory ShiftAssignment.fromMap(Map<String, dynamic> map) {
    return ShiftAssignment(
      userId: map['userId'],
      userName: map['userName'],
      status: map['status'],
      notes: map['notes'],
    );
  }
}

class ShiftsScreen extends StatefulWidget {
  final User user;
  
  const ShiftsScreen({
    Key? key,
    required this.user,
  }) : super(key: key);

  @override
  ShiftsScreenState createState() => ShiftsScreenState();
}

class ShiftsScreenState extends State<ShiftsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  String _view = 'week'; // 'week', 'month', 'availability', 'templates'
  
  // ShiftService für Datenbankzugriff
  final ShiftService _shiftService = ShiftService();
  
  // Schichten aus der Datenbank
  List<Shift> _shifts = [];
  DateTime _weekStart = DateTime.now().subtract(Duration(days: DateTime.now().weekday - 1));
  
  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(_handleTabSelection);
    
    // Daten laden
    _loadInitialData();
  }
  
  @override
  void dispose() {
    _tabController.removeListener(_handleTabSelection);
    _tabController.dispose();
    super.dispose();
  }
  
  void _handleTabSelection() {
    if (_tabController.indexIsChanging) {
      setState(() {
        switch (_tabController.index) {
          case 0:
            _view = 'week';
            break;
          case 1:
            _view = 'month';
            break;
          case 2:
            _view = 'availability';
            break;
        }
      });
    }
  }
  
  Future<void> _loadInitialData() async {
    try {
      setState(() {
        _isLoading = true;
      });
      
      // Laden der aktuellen Wochenschichten aus der Datenbank
      await _loadShiftsForCurrentWeek();
      
      // Wichtig: Prüfe, ob das Widget noch eingebunden ist, bevor setState aufgerufen wird
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    } catch (e) {
      print('Fehler beim Laden der Schichtplan-Daten: $e');
      
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim Laden der Daten: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
  
  // Lädt Schichten für die aktuelle Woche
  Future<void> _loadShiftsForCurrentWeek() async {
    final endOfWeek = _weekStart.add(const Duration(days: 6));
    
    // Daten aus Firestore laden
    final shiftsData = await _shiftService.getShiftsForDateRange(_weekStart, endOfWeek);
    
    // Schichten aus den Daten erstellen
    // Wichtig: Prüfe, ob das Widget noch eingebunden ist, bevor setState aufgerufen wird
    if (mounted) {
      setState(() {
        _shifts = shiftsData.map((data) => Shift.fromMap(data)).toList();
      });
    }
  }
  
  @override
  Widget build(BuildContext context) {
    // Zähle ausstehende Schichten
    final pendingShifts = _shifts.where((shift) {
      return shift.assignedUsers.any((user) => 
        user.userId == widget.user.uid && user.status == 'pending');
    }).length;
    
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            const Text('Schichtplan'),
            if (pendingShifts > 0)
              Container(
                margin: const EdgeInsets.only(left: 8),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '$pendingShifts',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            GoRouter.of(context).go('/');
          },
        ),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              icon: Stack(
                clipBehavior: Clip.none,
                children: [
                  const Icon(Icons.calendar_view_week),
                  if (pendingShifts > 0)
                    Positioned(
                      right: -8,
                      top: -8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                        ),
                        constraints: const BoxConstraints(
                          minWidth: 16,
                          minHeight: 16,
                        ),
                        child: Text(
                          '$pendingShifts',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                ],
              ),
              text: 'Wochenplan',
            ),
            Tab(
              icon: const Icon(Icons.calendar_month),
              text: 'Monatsplan',
            ),
            Tab(
              icon: const Icon(Icons.access_time),
              text: 'Meine Verfügbarkeit',
            ),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                // Wochenplan
                _buildWeeklyView(),
                
                // Monatsplan
                _buildMonthlyView(),
                
                // Verfügbarkeit
                _buildAvailabilityView(),
              ],
            ),
    );
  }
  
  Widget _buildWeeklyView() {
    // Startdatum (Montag dieser Woche)
    final startOfWeek = _weekStart;
    
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  setState(() {
                    _weekStart = _weekStart.subtract(const Duration(days: 7));
                    _loadShiftsForCurrentWeek(); // Lade Daten für die neue Woche
                  });
                },
              ),
              Text(
                '${DateFormat('d. MMMM', context.locale.languageCode).format(startOfWeek)} - ${DateFormat('d. MMMM', context.locale.languageCode).format(startOfWeek.add(const Duration(days: 6)))}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.arrow_forward),
                onPressed: () {
                  setState(() {
                    _weekStart = _weekStart.add(const Duration(days: 7));
                    _loadShiftsForCurrentWeek(); // Lade Daten für die neue Woche
                  });
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: _shifts.isEmpty 
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.calendar_view_week,
                      size: 64,
                      color: Colors.grey[400],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Keine Schichten in dieser Woche',
                      style: TextStyle(
                        fontSize: 16,
                        color: Colors.grey[600],
                      ),
                    ),
                  ],
                ),
              )
            : ListView(
                padding: const EdgeInsets.all(16),
                children: _buildShiftCards(),
              ),
        ),
      ],
    );
  }
  
  List<Widget> _buildShiftCards() {
    // Nach Tagen gruppieren
    final Map<String, List<Shift>> shiftsByDay = {};
    
    // Filter nur Schichten aus aktueller Woche
    final filteredShifts = _shifts.where((shift) {
      final shiftDate = DateTime.parse(shift.date);
      return shiftDate.isAfter(_weekStart.subtract(const Duration(days: 1))) && 
            shiftDate.isBefore(_weekStart.add(const Duration(days: 7)));
    }).toList();
    
    for (var shift in filteredShifts) {
      if (!shiftsByDay.containsKey(shift.date)) {
        shiftsByDay[shift.date] = [];
      }
      shiftsByDay[shift.date]!.add(shift);
    }
    
    // Sortiere die Tage
    final sortedDays = shiftsByDay.keys.toList()..sort();
    
    // Erstelle Karten für jeden Tag mit seinen Schichten
    final List<Widget> cards = [];
    
    for (var day in sortedDays) {
      final shifts = shiftsByDay[day]!;
      final dayDate = DateTime.parse(day);
      
      // Datumsheader
      cards.add(
        Padding(
          padding: const EdgeInsets.only(top: 16, bottom: 8),
          child: Text(
            DateFormat('EEEE, d. MMMM', context.locale.languageCode).format(dayDate),
            style: const TextStyle(
              fontSize: 18, 
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      );
      
      // Schichten des Tages
      for (var shift in shifts) {
        // Finde die Zuweisung für den aktuellen Benutzer
        final userAssignment = shift.assignedUsers.firstWhere(
          (a) => a.userId == widget.user.uid,
          orElse: () => ShiftAssignment(
            userId: '', 
            userName: '', 
            status: '',
          ),
        );
        
        // Bestimme Farbe und Icons basierend auf Schichttyp und Status
        Color cardColor = Colors.grey.shade100;
        Color statusColor = Colors.green;
        IconData shiftIcon = Icons.access_time;
        
        // Setze Schicht-Icon basierend auf Titel
        if (shift.title.contains('Früh')) {
          shiftIcon = Icons.wb_sunny_outlined;
        } else if (shift.title.contains('Spät')) {
          shiftIcon = Icons.wb_twilight;
        } else if (shift.title.contains('Nacht')) {
          shiftIcon = Icons.nightlight_round;
        }
        
        // Setze Farbe basierend auf Zuweisungsstatus
        if (userAssignment.userId.isNotEmpty) {
          switch (userAssignment.status) {
            case 'accepted':
              cardColor = Colors.red.shade50;
              statusColor = Colors.red;
              break;
            case 'declined':
              cardColor = Colors.blue.shade50;
              statusColor = Colors.blue;
              break;
            case 'pending':
              cardColor = Colors.amber.shade50;
              statusColor = Colors.amber;
              break;
            default:
              cardColor = Colors.green.shade50;
              statusColor = Colors.green;
          }
        }
        
        cards.add(
          Card(
            margin: const EdgeInsets.only(bottom: 12),
            color: cardColor,
            child: InkWell(
              onTap: () {
                if (userAssignment.userId.isNotEmpty && 
                    (userAssignment.status == 'pending' || userAssignment.status == 'assigned')) {
                  _showShiftApprovalDialog(shift);
                }
              },
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(shiftIcon, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              shift.title,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        if (userAssignment.userId.isNotEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: statusColor,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              userAssignment.status == 'accepted' ? 'Akzeptiert' :
                              userAssignment.status == 'declined' ? 'Abgelehnt' :
                              userAssignment.status == 'pending' ? 'Ausstehend' :
                              'Zugewiesen',
                              style: const TextStyle(color: Colors.white, fontSize: 12),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.schedule, size: 16, color: Colors.grey),
                        const SizedBox(width: 4),
                        Text('${shift.startTime} - ${shift.endTime}'),
                      ],
                    ),
                    
                    if (shift.notes != null && shift.notes!.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          shift.notes!,
                          style: TextStyle(
                            fontSize: 14,
                            color: Colors.grey[700],
                          ),
                        ),
                      ),
                    ],
                    
                    const SizedBox(height: 12),
                    const Divider(),
                    const SizedBox(height: 4),
                    
                    Text(
                      'Zugewiesene Mitarbeiter:',
                      style: TextStyle(
                        fontSize: 14, 
                        fontWeight: FontWeight.bold,
                        color: Colors.grey[700],
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...shift.assignedUsers.map((user) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              CircleAvatar(
                                radius: 12,
                                backgroundColor: Colors.grey.shade300,
                                child: Text(
                                  user.userName.substring(0, 1).toUpperCase(),
                                  style: const TextStyle(fontSize: 12),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(user.userName),
                            ],
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: user.status == 'accepted' ? Colors.green : 
                                    user.status == 'declined' ? Colors.red :
                                    user.status == 'pending' ? Colors.amber : 
                                    Colors.green,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              user.status == 'accepted' ? 'Akzeptiert' :
                              user.status == 'declined' ? 'Abgelehnt' :
                              user.status == 'pending' ? 'Ausstehend' :
                              'Zugewiesen',
                              style: const TextStyle(color: Colors.white, fontSize: 10),
                            ),
                          ),
                        ],
                      ),
                    )).toList(),
                    
                    if (userAssignment.userId.isNotEmpty && userAssignment.status == 'pending') ...[
                      const SizedBox(height: 12),
                      const Divider(),
                      const SizedBox(height: 8),
                      
                      if (shift.approvalDeadline != null) ...[
                        Container(
                          padding: const EdgeInsets.all(8),
                          margin: const EdgeInsets.only(bottom: 8),
                          decoration: BoxDecoration(
                            color: DateTime.parse(shift.approvalDeadline!).isBefore(
                              DateTime.now().add(const Duration(days: 2))
                            ) ? Colors.red.shade50 : Colors.amber.shade50,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(
                              color: DateTime.parse(shift.approvalDeadline!).isBefore(
                                DateTime.now().add(const Duration(days: 2))
                              ) ? Colors.red.shade200 : Colors.amber.shade200,
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.warning_amber_rounded, 
                                size: 16, 
                                color: DateTime.parse(shift.approvalDeadline!).isBefore(
                                  DateTime.now().add(const Duration(days: 2))
                                ) ? Colors.red.shade700 : Colors.amber.shade700,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Antwort bis: ${DateFormat('dd.MM.yyyy', context.locale.languageCode).format(DateTime.parse(shift.approvalDeadline!))}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: DateTime.parse(shift.approvalDeadline!).isBefore(
                                    DateTime.now().add(const Duration(days: 2))
                                  ) ? Colors.red.shade700 : Colors.amber.shade700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              child: Text(
                                'Diese Schicht benötigt Ihre Antwort:',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            const SizedBox(height: 4),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: ElevatedButton.icon(
                                      onPressed: () => _acceptShift(shift.id),
                                      icon: const Icon(Icons.check_circle, color: Colors.white),
                                      label: const Text('Akzeptieren'),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.green,
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: ElevatedButton.icon(
                                      onPressed: () => _declineShift(shift.id),
                                      icon: const Icon(Icons.cancel, color: Colors.white),
                                      label: const Text('Ablehnen'),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: Colors.red,
                                        foregroundColor: Colors.white,
                                        padding: const EdgeInsets.symmetric(vertical: 12),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        );
      }
    }
    
    return cards;
  }
  
  // Methode zum Akzeptieren einer Schicht
  Future<void> _acceptShift(String shiftId) async {
    try {
      setState(() {
        _isLoading = true;
      });
      
      // Verwende ShiftService, um die Schicht in Firestore zu akzeptieren
      final success = await _shiftService.acceptShift(shiftId);
      
      // Wichtig: Prüfe, ob das Widget noch eingebunden ist, bevor setState aufgerufen wird
      if (!mounted) return;
      
      if (success) {
        // Aktualisiere die lokalen Daten
        final updatedShifts = _shifts.map((shift) {
          if (shift.id == shiftId) {
            final updatedAssignedUsers = shift.assignedUsers.map((user) {
              if (user.userId == widget.user.uid) {
                return ShiftAssignment(
                  userId: user.userId,
                  userName: user.userName,
                  status: 'accepted',
                  notes: user.notes,
                );
              }
              return user;
            }).toList();
            
            return Shift(
              id: shift.id,
              title: shift.title,
              date: shift.date,
              startTime: shift.startTime,
              endTime: shift.endTime,
              assignedUsers: updatedAssignedUsers,
              notes: shift.notes,
              approvalDeadline: shift.approvalDeadline,
            );
          }
          return shift;
        }).toList();
        
        setState(() {
          _shifts = updatedShifts;
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Schicht erfolgreich akzeptiert'),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        // Nur SnackBar anzeigen, wenn das Widget noch eingebunden ist
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Schicht konnte nicht akzeptiert werden'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      print('Fehler beim Akzeptieren der Schicht: $e');
      
      // Nur SnackBar anzeigen, wenn das Widget noch eingebunden ist
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim Akzeptieren der Schicht: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      // Nur setState aufrufen, wenn das Widget noch eingebunden ist
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
  
  // Methode zum Ablehnen einer Schicht
  Future<void> _declineShift(String shiftId) async {
    try {
      setState(() {
        _isLoading = true;
      });
      
      // Verwende ShiftService, um die Schicht in Firestore abzulehnen
      final success = await _shiftService.declineShift(shiftId);
      
      // Wichtig: Prüfe, ob das Widget noch eingebunden ist, bevor setState aufgerufen wird
      if (!mounted) return;
      
      if (success) {
        // Aktualisiere die lokalen Daten
        final updatedShifts = _shifts.map((shift) {
          if (shift.id == shiftId) {
            final updatedAssignedUsers = shift.assignedUsers.map((user) {
              if (user.userId == widget.user.uid) {
                return ShiftAssignment(
                  userId: user.userId,
                  userName: user.userName,
                  status: 'declined',
                  notes: user.notes,
                );
              }
              return user;
            }).toList();
            
            return Shift(
              id: shift.id,
              title: shift.title,
              date: shift.date,
              startTime: shift.startTime,
              endTime: shift.endTime,
              assignedUsers: updatedAssignedUsers,
              notes: shift.notes,
              approvalDeadline: shift.approvalDeadline,
            );
          }
          return shift;
        }).toList();
        
        setState(() {
          _shifts = updatedShifts;
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Schicht erfolgreich abgelehnt'),
            backgroundColor: Colors.blue,
          ),
        );
      } else {
        // Nur SnackBar anzeigen, wenn das Widget noch eingebunden ist
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Schicht konnte nicht abgelehnt werden'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      print('Fehler beim Ablehnen der Schicht: $e');
      
      // Nur SnackBar anzeigen, wenn das Widget noch eingebunden ist
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim Ablehnen der Schicht: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      // Nur setState aufrufen, wenn das Widget noch eingebunden ist
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }
  
  void _showShiftApprovalDialog(Shift shift) {
    // Finde die Zuweisung für den aktuellen Benutzer
    final userAssignment = shift.assignedUsers.firstWhere(
      (a) => a.userId == widget.user.uid,
      orElse: () => ShiftAssignment(
        userId: '', 
        userName: '', 
        status: '',
      ),
    );
    
    if (userAssignment.userId.isEmpty) return;
    
    // Prüfe, ob das Widget noch eingebunden ist, bevor showDialog aufgerufen wird
    if (!mounted) return;
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Schichtzuweisung'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              shift.title,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.calendar_today, size: 16, color: Colors.grey),
                const SizedBox(width: 4),
                Text(
                  DateFormat('EEEE, d. MMMM yyyy', context.locale.languageCode)
                      .format(DateTime.parse(shift.date)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.access_time, size: 16, color: Colors.grey),
                const SizedBox(width: 4),
                Text('${shift.startTime} - ${shift.endTime}'),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Möchten Sie diese Schicht annehmen oder ablehnen?',
              style: TextStyle(fontWeight: FontWeight.w500),
            ),
            
            if (shift.approvalDeadline != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: DateTime.parse(shift.approvalDeadline!).isBefore(
                    DateTime.now().add(const Duration(days: 2))
                  ) ? Colors.red.shade50 : Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(
                    color: DateTime.parse(shift.approvalDeadline!).isBefore(
                      DateTime.now().add(const Duration(days: 2))
                    ) ? Colors.red.shade200 : Colors.amber.shade200,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.warning_amber_rounded, 
                      size: 16, 
                      color: DateTime.parse(shift.approvalDeadline!).isBefore(
                        DateTime.now().add(const Duration(days: 2))
                      ) ? Colors.red.shade700 : Colors.amber.shade700,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Antwort bis: ${DateFormat('dd.MM.yyyy', context.locale.languageCode).format(DateTime.parse(shift.approvalDeadline!))}',
                        style: TextStyle(
                          fontSize: 12,
                          color: DateTime.parse(shift.approvalDeadline!).isBefore(
                            DateTime.now().add(const Duration(days: 2))
                          ) ? Colors.red.shade700 : Colors.amber.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(context).pop();
            },
            child: const Text('Abbrechen'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              _declineShift(shift.id);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Ablehnen'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              _acceptShift(shift.id);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green,
              foregroundColor: Colors.white,
            ),
            child: const Text('Annehmen'),
          ),
        ],
      ),
    );
  }
  
  Widget _buildMonthlyView() {
    // Aktueller Monat und Jahr
    DateTime currentMonth = DateTime.now();
    
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () {
                  setState(() {
                    // Einen Monat zurück
                    currentMonth = DateTime(currentMonth.year, currentMonth.month - 1);
                    // Hier könnte man später Daten für den neuen Monat laden
                  });
                },
              ),
              Text(
                DateFormat('MMMM yyyy', context.locale.languageCode).format(currentMonth),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.arrow_forward),
                onPressed: () {
                  setState(() {
                    // Einen Monat vor
                    currentMonth = DateTime(currentMonth.year, currentMonth.month + 1);
                    // Hier könnte man später Daten für den neuen Monat laden
                  });
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: _buildMonthCalendar(currentMonth),
        ),
      ],
    );
  }
  
  Widget _buildMonthCalendar(DateTime month) {
    // Startdatum des Monats
    final firstDayOfMonth = DateTime(month.year, month.month, 1);
    
    // Endtag des Monats
    final lastDayOfMonth = DateTime(month.year, month.month + 1, 0);
    
    // Wochentag des ersten Tags (0 = Montag, 6 = Sonntag in lokalem Format)
    int firstWeekday = firstDayOfMonth.weekday - 1;
    
    // Anzahl der Tage im Monat
    int daysInMonth = lastDayOfMonth.day;
    
    // Anzahl der Wochen im Monatskalender (inkl. angebrochene Wochen)
    int weeksInMonth = ((daysInMonth + firstWeekday) / 7).ceil();
    
    // Filtere Schichten für diesen Monat
    final shiftsForMonth = _shifts.where((shift) {
      final shiftDate = DateTime.parse(shift.date);
      return shiftDate.year == month.year && shiftDate.month == month.month;
    }).toList();
    
    return Column(
      children: [
        // Wochentags-Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          child: Row(
            children: List.generate(7, (index) {
              // Wochentage: Mo, Di, Mi, Do, Fr, Sa, So
              final weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
              return Expanded(
                child: Container(
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    weekdays[index],
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
        const SizedBox(height: 8),
        // Kalender-Grid
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 0.8,
              crossAxisSpacing: 4,
              mainAxisSpacing: 4,
            ),
            itemCount: weeksInMonth * 7,
            itemBuilder: (context, index) {
              // Kalkuliere Tag des Monats
              int adjustedIndex = index - firstWeekday;
              
              // Prüfe, ob der Tag zum aktuellen Monat gehört
              if (adjustedIndex < 0 || adjustedIndex >= daysInMonth) {
                return Container(); // Leere Zelle für Tage außerhalb des Monats
              }
              
              // Aktueller Tag
              int dayOfMonth = adjustedIndex + 1;
              DateTime currentDate = DateTime(month.year, month.month, dayOfMonth);
              
              // Finde Schichten für diesen Tag
              final shiftsForDay = shiftsForMonth.where((shift) => 
                DateTime.parse(shift.date).day == dayOfMonth
              ).toList();
              
              // Prüfe, ob es zugewiesene oder angenommene Schichten gibt
              bool hasAssignedShifts = shiftsForDay.any((shift) => 
                shift.assignedUsers.any((user) => 
                  user.userId == widget.user.uid && 
                  (user.status == 'assigned' || user.status == 'pending')
                )
              );
              
              bool hasAcceptedShifts = shiftsForDay.any((shift) => 
                shift.assignedUsers.any((user) => 
                  user.userId == widget.user.uid && user.status == 'accepted'
                )
              );
              
              bool hasDeclinedShifts = shiftsForDay.any((shift) => 
                shift.assignedUsers.any((user) => 
                  user.userId == widget.user.uid && user.status == 'declined'
                )
              );
              
              // Hintergrundfarbe basierend auf Schichtstatus
              Color backgroundColor = Colors.white;
              if (hasAcceptedShifts) {
                backgroundColor = Colors.red.shade50;
              } else if (hasAssignedShifts) {
                backgroundColor = Colors.amber.shade50;
              } else if (hasDeclinedShifts) {
                backgroundColor = Colors.blue.shade50;
              }
              
              // Überprüfe, ob es der heutige Tag ist
              bool isToday = DateTime.now().year == currentDate.year &&
                            DateTime.now().month == currentDate.month &&
                            DateTime.now().day == currentDate.day;
              
              return InkWell(
                onTap: () {
                  if (shiftsForDay.isNotEmpty) {
                    _showDayDetailDialog(shiftsForDay, currentDate);
                  }
                },
                child: Container(
                  decoration: BoxDecoration(
                    color: backgroundColor,
                    border: isToday 
                      ? Border.all(color: Colors.green, width: 2)
                      : Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Column(
                    children: [
                      // Tag des Monats
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        decoration: BoxDecoration(
                          color: isToday ? Colors.green : Colors.grey.shade100,
                          borderRadius: const BorderRadius.only(
                            topLeft: Radius.circular(3),
                            topRight: Radius.circular(3),
                          ),
                        ),
                        child: Text(
                          '$dayOfMonth',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                            color: isToday ? Colors.white : Colors.black,
                          ),
                        ),
                      ),
                      // Schicht-Indikatoren
                      if (shiftsForDay.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        ...shiftsForDay.take(2).map((shift) {
                          // Finde die Zuweisung für den aktuellen Benutzer
                          final userAssignment = shift.assignedUsers.firstWhere(
                            (a) => a.userId == widget.user.uid,
                            orElse: () => ShiftAssignment(
                              userId: '', 
                              userName: '', 
                              status: '',
                            ),
                          );
                          
                          // Farbe basierend auf Status
                          Color statusColor = Colors.green;
                          if (userAssignment.userId.isNotEmpty) {
                            switch (userAssignment.status) {
                              case 'accepted':
                                statusColor = Colors.red;
                                break;
                              case 'declined':
                                statusColor = Colors.blue;
                                break;
                              case 'pending':
                                statusColor = Colors.amber;
                                break;
                            }
                          }
                          
                          return Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4, 
                              vertical: 2,
                            ),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 4, 
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: statusColor,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '${shift.startTime} ${shift.title}',
                                style: const TextStyle(
                                  fontSize: 10,
                                  color: Colors.white,
                                ),
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                          );
                        }).toList(),
                        
                        // Zeige "mehr" an, wenn es mehr als 2 Schichten gibt
                        if (shiftsForDay.length > 2)
                          Text(
                            '+${shiftsForDay.length - 2} mehr',
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.grey.shade700,
                            ),
                          ),
                      ],
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        // Legende
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildLegendItem(Colors.amber, 'Ausstehend'),
              const SizedBox(width: 16),
              _buildLegendItem(Colors.red, 'Akzeptiert'),
              const SizedBox(width: 16),
              _buildLegendItem(Colors.blue, 'Abgelehnt'),
            ],
          ),
        ),
      ],
    );
  }
  
  Widget _buildLegendItem(Color color, String label) {
    return Row(
      children: [
        Container(
          width: 16,
          height: 16,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4),
          ),
        ),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }
  
  void _showDayDetailDialog(List<Shift> shiftsForDay, DateTime date) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          DateFormat('EEEE, d. MMMM', context.locale.languageCode).format(date),
          style: const TextStyle(fontSize: 18),
        ),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: shiftsForDay.length,
            itemBuilder: (context, index) {
              final shift = shiftsForDay[index];
              
              // Finde die Zuweisung für den aktuellen Benutzer
              final userAssignment = shift.assignedUsers.firstWhere(
                (a) => a.userId == widget.user.uid,
                orElse: () => ShiftAssignment(
                  userId: '', 
                  userName: '', 
                  status: '',
                ),
              );
              
              // Bestimme Farbe basierend auf Status
              Color statusColor = Colors.green;
              String statusText = 'Zugewiesen';
              
              if (userAssignment.userId.isNotEmpty) {
                switch (userAssignment.status) {
                  case 'accepted':
                    statusColor = Colors.red;
                    statusText = 'Akzeptiert';
                    break;
                  case 'declined':
                    statusColor = Colors.blue;
                    statusText = 'Abgelehnt';
                    break;
                  case 'pending':
                    statusColor = Colors.amber;
                    statusText = 'Ausstehend';
                    break;
                }
              }
              
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(
                    shift.title,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text('${shift.startTime} - ${shift.endTime}'),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8, 
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      statusText,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  onTap: () {
                    Navigator.of(context).pop();
                    if (userAssignment.userId.isNotEmpty && 
                        (userAssignment.status == 'pending' || userAssignment.status == 'assigned')) {
                      _showShiftApprovalDialog(shift);
                    }
                  },
                ),
              );
            },
          ),
        ),
        actions: [
          if (shiftsForDay.any((shift) => 
              shift.assignedUsers.any((user) => 
                user.userId == widget.user.uid && 
                (user.status == 'pending' || user.status == 'assigned')
              )
            )) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                ElevatedButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    // Finde die erste ausstehende Schicht für diesen Tag
                    final pendingShift = shiftsForDay.firstWhere(
                      (shift) => shift.assignedUsers.any((user) => 
                        user.userId == widget.user.uid && 
                        (user.status == 'pending' || user.status == 'assigned')
                      )
                    );
                    _acceptShift(pendingShift.id);
                  },
                  icon: const Icon(Icons.check_circle, color: Colors.white),
                  label: const Text('Alle akzeptieren'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                ),
                ElevatedButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    // Finde die erste ausstehende Schicht für diesen Tag
                    final pendingShift = shiftsForDay.firstWhere(
                      (shift) => shift.assignedUsers.any((user) => 
                        user.userId == widget.user.uid && 
                        (user.status == 'pending' || user.status == 'assigned')
                      )
                    );
                    _declineShift(pendingShift.id);
                  },
                  icon: const Icon(Icons.cancel, color: Colors.white),
                  label: const Text('Alle ablehnen'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Schließen'),
          ),
        ],
      ),
    );
  }
  
  Widget _buildAvailabilityView() {
    return const AvailabilityScreen();
  }
} 