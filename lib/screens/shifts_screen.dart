import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:go_router/go_router.dart';
import '../services/shift_service.dart';

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
      
      setState(() {
        _isLoading = false;
      });
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
    setState(() {
      _shifts = shiftsData.map((data) => Shift.fromMap(data)).toList();
    });
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Schichtplan').tr(),
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
              icon: const Icon(Icons.calendar_view_week),
              text: 'Wochenplan'.tr(),
            ),
            Tab(
              icon: const Icon(Icons.calendar_month),
              text: 'Monatsplan'.tr(),
            ),
            Tab(
              icon: const Icon(Icons.access_time),
              text: 'Meine Verfügbarkeit'.tr(),
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
                      'Keine Schichten in dieser Woche'.tr(),
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
        Color statusColor = Colors.blue;
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
              cardColor = Colors.green.shade50;
              statusColor = Colors.green;
              break;
            case 'declined':
              cardColor = Colors.red.shade50;
              statusColor = Colors.red;
              break;
            case 'pending':
              cardColor = Colors.amber.shade50;
              statusColor = Colors.amber;
              break;
            default:
              cardColor = Colors.blue.shade50;
              statusColor = Colors.blue;
          }
        }
        
        cards.add(
          Card(
            margin: const EdgeInsets.only(bottom: 12),
            color: cardColor,
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
                                  Colors.blue,
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
                    
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => _acceptShift(shift.id),
                            icon: const Icon(Icons.check_circle, color: Colors.green),
                            label: const Text('Akzeptieren'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.green,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => _declineShift(shift.id),
                            icon: const Icon(Icons.cancel, color: Colors.red),
                            label: const Text('Ablehnen'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.red,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Schicht konnte nicht akzeptiert werden'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      print('Fehler beim Akzeptieren der Schicht: $e');
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Akzeptieren der Schicht: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Schicht konnte nicht abgelehnt werden'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      print('Fehler beim Ablehnen der Schicht: $e');
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Ablehnen der Schicht: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  Widget _buildMonthlyView() {
    final now = DateTime.now();
    
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
                  // Vorheriger Monat anzeigen (später implementieren)
                },
              ),
              Text(
                DateFormat('MMMM yyyy', context.locale.languageCode).format(now),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              IconButton(
                icon: const Icon(Icons.arrow_forward),
                onPressed: () {
                  // Nächster Monat anzeigen (später implementieren)
                },
              ),
            ],
          ),
        ),
        Expanded(
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Platzhalter - später durch tatsächlichen Monatsplan ersetzen
                Icon(
                  Icons.calendar_month,
                  size: 64,
                  color: Colors.grey[400],
                ),
                const SizedBox(height: 16),
                Text(
                  'Monatsplan wird noch implementiert'.tr(),
                  style: TextStyle(
                    fontSize: 16,
                    color: Colors.grey[600],
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
  
  Widget _buildAvailabilityView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.access_time,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Verfügbarkeitseinstellungen werden noch implementiert'.tr(),
            style: TextStyle(
              fontSize: 16,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 32),
          ElevatedButton(
            onPressed: () {
              // Verfügbarkeiten bearbeiten (später implementieren)
            },
            child: const Text('Verfügbarkeit bearbeiten').tr(),
          ),
        ],
      ),
    );
  }
} 