import 'dart:async';
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:intl/intl.dart';
import '../../services/customer_service.dart';
import '../../services/project_service.dart';
import '../../services/time/time_entry_service.dart';
import '../../models/time/time_entry_model.dart';
import '../../widgets/dialogs/timer_dialogs.dart';
import 'time_detail_screen.dart';

class TimeScreen extends StatefulWidget {
  final User user;
  // Callback für Timer-Zustandsänderungen
  final Function(TimeEntry?)? onTimerStateChanged;

  const TimeScreen({
    Key? key, 
    required this.user,
    this.onTimerStateChanged,
  }) : super(key: key);

  @override
  TimeScreenState createState() => TimeScreenState();
}

class TimeScreenState extends State<TimeScreen> with AutomaticKeepAliveClientMixin, TickerProviderStateMixin {
  final TimeEntryService _timeEntryService = TimeEntryService();
  final CustomerService _customerService = CustomerService();
  final ProjectService _projectService = ProjectService();
  
  // Keep Alive Mixin überschreiben
  @override
  bool get wantKeepAlive => true;
  
  // Tab Controller
  late TabController _tabController;
  
  // Key für das Formular (für das Scrollen)
  final GlobalKey _timeFormKey = GlobalKey();
  
  // Timer-Zustände
  bool _isRunning = false;
  bool _isPaused = false;
  int _elapsedSeconds = 0;
  int _pauseMinutes = 0;
  Timer? _timer;
  DateTime? _startTime;
  
  // Pausentimer
  Timer? _pauseTimerInstance;
  DateTime? _pauseStartTime;
  int _currentPauseSeconds = 0;
  
  // Pausen-Historie
  List<Map<String, dynamic>> _pauseHistory = [];
  
  // Formular-Zustände
  String _selectedCustomerId = '';
  String _selectedProjectId = '';
  String _note = '';
  final TextEditingController _noteController = TextEditingController();
  List<Customer> _customers = [];
  List<Project> _projects = [];
  List<Project> _filteredProjects = [];
  List<TimeEntry> _timeEntries = [];

  // Lade-Zustände
  bool _isLoading = true;
  bool _isLoadingEntries = true;
  
  // Aktiver Timer
  TimeEntry? _activeTimer;
  
  // Paginierung für alle Zeiteinträge
  int _pageSize = 50;
  int _currentPage = 0;
  bool _hasMoreEntries = true;
  bool _isLoadingMoreEntries = false;
  ScrollController _entriesScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _entriesScrollController.addListener(_scrollListener);
    _loadData();
  }

  void _scrollListener() {
    if (_entriesScrollController.position.pixels >= 
        _entriesScrollController.position.maxScrollExtent - 200 &&
        !_isLoadingMoreEntries && 
        _hasMoreEntries) {
      _loadMoreTimeEntries();
    }
  }

  @override
  void dispose() {
    _stopTimer(cancel: true);
    _pauseTimerInstance?.cancel();
    _noteController.dispose();
    _tabController.dispose();
    _entriesScrollController.removeListener(_scrollListener);
    _entriesScrollController.dispose();
    super.dispose();
  }

  // Öffentliche Methode zum Neuladen der Daten
  void refreshData() {
    _loadData();
  }

  // Öffentliche Methode zum Pausieren des Timers
  void pauseTimer() {
    _pauseTimer();
  }
  
  // Öffentliche Methode zum Fortsetzen des Timers
  void resumeTimer() {
    _resumeTimer();
  }
  
  // Öffentliche Methode zum Stoppen des Timers
  void stopTimer() {
    _stopTimer();
  }

  // Daten laden
  Future<void> _loadData() async {
    if (!mounted) return;
    
    setState(() {
      _isLoading = true;
      _isLoadingEntries = true;
    });

    try {
      // Kunden laden
      final customers = await _customerService.getAllCustomers();
      
      // Projekte laden
      final projects = await _projectService.getAllProjects();
      
      // Zeiteinträge laden
      final timeEntries = await _timeEntryService.getTimeEntriesForUser(widget.user.uid);
      
      // Aktiven Timer prüfen
      final activeTimer = await _timeEntryService.getActiveTimerForUser(widget.user.uid);
      
      if (mounted) {
        setState(() {
          _customers = customers;
          _projects = projects;
          _timeEntries = timeEntries;
          
          // Timer-Status aus aktivem Timer setzen
          if (activeTimer != null) {
            _activeTimer = activeTimer;
            _isRunning = true;
            _isPaused = activeTimer.status == 'paused';
            _selectedCustomerId = activeTimer.customerId;
            _selectedProjectId = activeTimer.projectId;
            _note = activeTimer.note;
            _noteController.text = activeTimer.note;
            _pauseMinutes = activeTimer.pauseMinutes;
            _startTime = activeTimer.startTime;
            
            // Projekte filtern
            _filteredProjects = _projects.where((p) => p.customerId == _selectedCustomerId).toList();
            
            // Verstrichene Zeit berechnen
            if (!_isPaused) {
              // Bei laufendem Timer die vergangene Zeit berechnen
              final now = DateTime.now();
              _elapsedSeconds = now.difference(_startTime!).inSeconds;
              
              // Stoppe zuerst vorhandene Timer, falls sie laufen
              _timer?.cancel();
              _timer = null;
              
              // Starte den Timer neu
              _startTimer(false); // false = kein neuer Timer in Firestore
            } else {
              // Bei pausiertem Timer verwenden wir die gespeicherte Dauer
              _elapsedSeconds = activeTimer.duration;
              
              // Pausentimer starten
              _pauseTimerInstance?.cancel();
              _pauseTimerInstance = null;
              
              _pauseStartTime = DateTime.now().subtract(const Duration(minutes: 1));
              _currentPauseSeconds = 60; // Starte mit 1 Minute vergangene Pausenzeit
              
              // Starte Pausentimer
              _pauseTimerInstance = Timer.periodic(const Duration(seconds: 1), (timer) {
                if (mounted) {
                  setState(() {
                    _currentPauseSeconds++;
                  });
                }
              });
            }

            // Benachrichtige Parent über Timer-Änderung
            if (widget.onTimerStateChanged != null) {
              widget.onTimerStateChanged!(activeTimer);
            }
          }
          
          _isLoading = false;
          _isLoadingEntries = false;
        });
      }
    } catch (e) {
      print('Fehler beim Laden der Daten: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _isLoadingEntries = false;
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Fehler beim Laden der Daten. Bitte versuche es später erneut.'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  // Timer starten
  void _startTimer([bool saveToFirestore = true]) {
    if (_isRunning) return;
    
    setState(() {
      _isRunning = true;
      _isPaused = false;
      if (_startTime == null) {
        _startTime = DateTime.now(); // Nur setzen, wenn nicht bereits vorhanden
      }
    });
    
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _elapsedSeconds++;
        });
      }
    });
    
    if (saveToFirestore) {
      _saveTimer();
    }
  }
  
  // Timer in Firestore speichern
  Future<void> _saveTimer() async {
    try {
      final customer = _customers.firstWhere((c) => c.id == _selectedCustomerId);
      final project = _projects.firstWhere((p) => p.id == _selectedProjectId);
      
      final activeTimer = await _timeEntryService.startTimer(
        userId: widget.user.uid,
        userName: widget.user.displayName ?? '',
        userEmail: widget.user.email ?? '',
        startTime: _startTime!,
        customerId: _selectedCustomerId,
        customerName: customer.name,
        projectId: _selectedProjectId,
        projectName: project.name,
        note: _note,
      );
      
      if (mounted) {
        setState(() {
          _activeTimer = activeTimer;
        });
        
        // Benachrichtige Parent über Timer-Änderung
        if (widget.onTimerStateChanged != null) {
          widget.onTimerStateChanged!(activeTimer);
        }
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Timer wurde gestartet'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      print('Fehler beim Speichern des Timers: $e');
      
      // Timer-Zustände zurücksetzen
      if (mounted) {
        setState(() {
          _isRunning = false;
          _isPaused = false;
          if (_timer != null) {
            _timer!.cancel();
            _timer = null;
          }
        });
        
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim Starten des Timers: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
  
  // Timer pausieren
  void _pauseTimer() {
    if (!_isRunning || _isPaused || _activeTimer == null) return;
    
    _timer?.cancel();
    _timer = null;
    
    final now = DateTime.now();
    
    setState(() {
      _isPaused = true;
      _pauseStartTime = now;
      _currentPauseSeconds = 0;
    });
    
    // Starte den Pausentimer
    _pauseTimerInstance = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _currentPauseSeconds++;
        });
      }
    });
    
    _updateTimerStatus(true, now);
  }
  
  // Timer fortsetzen
  void _resumeTimer() {
    if (!_isRunning || !_isPaused || _activeTimer == null) return;
    
    // Pausentimer stoppen
    _pauseTimerInstance?.cancel();
    _pauseTimerInstance = null;
    
    final now = DateTime.now();
    
    // Berechne die verstrichene Pausenzeit in Minuten
    if (_pauseStartTime != null) {
      final pauseDuration = now.difference(_pauseStartTime!);
      final pauseMinutesThisSession = (pauseDuration.inSeconds / 60).ceil();
      
      // Addiere die neue Pausenzeit zu bereits vorhandenen Pausenminuten
      _pauseMinutes += pauseMinutesThisSession;
      
      // Speichere diese Pause in der Historie
      _pauseHistory.add({
        'startTime': _pauseStartTime!,
        'endTime': now,
        'durationMinutes': pauseMinutesThisSession,
        'durationSeconds': pauseDuration.inSeconds,
      });
      
      print('Pause beendet: ${pauseMinutesThisSession}min, Gesamtpause: ${_pauseMinutes}min');
      print('Pausenhistorie: $_pauseHistory');
    }
    
    setState(() {
      _isPaused = false;
      _pauseStartTime = null;
      _currentPauseSeconds = 0;
    });
    
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _elapsedSeconds++;
        });
      }
    });
    
    _updateTimerStatus(false, now);
  }
  
  // Timer-Status aktualisieren
  Future<void> _updateTimerStatus(bool paused, [DateTime? timestamp]) async {
    try {
      if (_activeTimer == null) return;
      
      final now = timestamp ?? DateTime.now();
      
      if (paused) {
        await _timeEntryService.pauseTimer(
          _activeTimer!.id!,
          _pauseMinutes,
          pauseStartTime: now,
        );
      } else {
        await _timeEntryService.resumeTimer(
          _activeTimer!.id!,
          _pauseMinutes,
        );
      }

      // Aktiven Timer neu laden und Parent benachrichtigen
      final updatedTimer = await _timeEntryService.getActiveTimerForUser(widget.user.uid);
      
      if (mounted) {
        setState(() {
          _activeTimer = updatedTimer;
        });
        
        if (widget.onTimerStateChanged != null) {
          widget.onTimerStateChanged!(updatedTimer);
        }
      }
    } catch (e) {
      print('Fehler beim Aktualisieren des Timer-Status: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim ${paused ? 'Pausieren' : 'Fortsetzen'} des Timers: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
  
  // Timer stoppen
  void _stopTimer({bool cancel = false}) {
    if (_timer != null) {
      _timer!.cancel();
      _timer = null;
    }
    
    // Pausentimer auch beenden und letzte Pausenzeit addieren
    if (_pauseTimerInstance != null) {
      _pauseTimerInstance!.cancel();
      _pauseTimerInstance = null;
      
      // Letzte Pausenzeit hinzufügen, falls pausiert
      if (_isPaused && _pauseStartTime != null) {
        final pauseDuration = DateTime.now().difference(_pauseStartTime!);
        final pauseMinutesThisSession = (pauseDuration.inSeconds / 60).ceil();
        
        _pauseMinutes += pauseMinutesThisSession;
        
        // Letzte Pause in Historie aufnehmen
        _pauseHistory.add({
          'startTime': _pauseStartTime!,
          'endTime': DateTime.now(),
          'durationMinutes': pauseMinutesThisSession,
          'durationSeconds': pauseDuration.inSeconds,
        });
      }
    }
    
    if (!cancel && _activeTimer != null) {
      _saveEndedTimer();
    }
    
    setState(() {
      _isRunning = false;
      _isPaused = false;
      _elapsedSeconds = 0;
      _pauseMinutes = 0;
      _pauseStartTime = null;
      _currentPauseSeconds = 0;
      _startTime = null;
      _pauseHistory = [];
      
      if (cancel) {
        _activeTimer = null;
        // Benachrichtige Parent über Timer-Stopp
        if (widget.onTimerStateChanged != null) {
          widget.onTimerStateChanged!(null);
        }
      }
    });
  }
  
  // Beendeten Timer speichern
  Future<void> _saveEndedTimer() async {
    try {
      if (_activeTimer == null) return;
      
      final endTime = DateTime.now();
      
      // Pausenhistorie ins Log schreiben
      if (_pauseHistory.isNotEmpty) {
        print('Pausenhistorie zum Speichern: $_pauseHistory');
        print('Gesamtpause: $_pauseMinutes Minuten');
      }
      
      await _timeEntryService.stopTimer(
        _activeTimer!.id!,
        endTime,
        _pauseMinutes,
        pauseHistory: _pauseHistory,
      );
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Zeitmessung beendet und gespeichert'),
            backgroundColor: Colors.green,
          ),
        );
        
        setState(() {
          _activeTimer = null;
          _pauseHistory = [];
        });
        
        // Benachrichtige Parent über Timer-Stopp
        if (widget.onTimerStateChanged != null) {
          widget.onTimerStateChanged!(null);
        }
        
        // Zeiteinträge neu laden
        _loadTimeEntries();
      }
    } catch (e) {
      print('Fehler beim Speichern des beendeten Timers: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim Speichern des beendeten Timers: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }
  
  // Zeiteinträge neu laden
  Future<void> _loadTimeEntries() async {
    setState(() {
      _isLoadingEntries = true;
    });
    
    try {
      // Verwende die paginierte Methode mit anfänglichem Limit
      final timeEntries = await _timeEntryService.getTimeEntriesForUserPaginated(widget.user.uid, _pageSize);
      
      if (mounted) {
        setState(() {
          _timeEntries = timeEntries;
          _isLoadingEntries = false;
          _currentPage = 0;
          _hasMoreEntries = timeEntries.length >= _pageSize;
        });
      }
    } catch (e) {
      print('Fehler beim Laden der Zeiteinträge: $e');
      if (mounted) {
        setState(() {
          _isLoadingEntries = false;
        });
      }
    }
  }
  
  // Mehr Zeiteinträge laden (Paginierung)
  Future<void> _loadMoreTimeEntries() async {
    if (_isLoadingMoreEntries || !_hasMoreEntries) return;
    
    setState(() {
      _isLoadingMoreEntries = true;
    });
    
    try {
      final nextPage = _currentPage + 1;
      final offset = nextPage * _pageSize;
      
      // Verwende die dedizierte Paginierungs-Methode
      final moreEntries = await _timeEntryService.getTimeEntriesForUserPaginated(
        widget.user.uid, 
        _pageSize, 
        offset
      );
      
      // Filtere Duplikate heraus (für den Fall, dass sich Daten geändert haben)
      final uniqueEntries = moreEntries
          .where((entry) => !_timeEntries.any((e) => e.id == entry.id))
          .toList();
      
      if (mounted) {
        setState(() {
          if (uniqueEntries.isNotEmpty) {
            _timeEntries.addAll(uniqueEntries);
            _currentPage = nextPage;
            _hasMoreEntries = moreEntries.length >= _pageSize;
          } else {
            _hasMoreEntries = false;
          }
          _isLoadingMoreEntries = false;
        });
      }
    } catch (e) {
      print('Fehler beim Laden weiterer Zeiteinträge: $e');
      if (mounted) {
        setState(() {
          _isLoadingMoreEntries = false;
        });
      }
    }
  }
  
  // Formatiert die verstrichene Zeit als HH:MM:SS
  String _formatElapsedTime() {
    final hours = _elapsedSeconds ~/ 3600;
    final minutes = (_elapsedSeconds % 3600) ~/ 60;
    final seconds = _elapsedSeconds % 60;
    
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
  
  // Formatiert ein Datum
  String _formatDate(DateTime date) {
    return DateFormat('dd.MM.yyyy').format(date);
  }
  
  // Formatiert eine Uhrzeit
  String _formatTime(DateTime time) {
    return DateFormat('HH:mm').format(time);
  }
  
  // Formatiert die Dauer in Sekunden als Stunden:Minuten
  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    
    return '${hours}h ${minutes}m';
  }
  
  // Formatiert die aktuelle Pausenzeit
  String _formatPauseTime() {
    final hours = _currentPauseSeconds ~/ 3600;
    final minutes = (_currentPauseSeconds % 3600) ~/ 60;
    final seconds = _currentPauseSeconds % 60;
    
    return '${hours > 0 ? "${hours}h " : ""}${minutes > 0 ? "${minutes}m " : ""}${seconds}s';
  }
  
  @override
  Widget build(BuildContext context) {
    // AutomaticKeepAliveClientMixin erfordert diesen Aufruf
    super.build(context);
    
    // Keine AppBar oder BottomNavigationBar mehr, da diese vom MainLayout bereitgestellt werden
    return _isLoading 
      ? const Center(child: CircularProgressIndicator())
      : _buildBody();
  }
  
  Widget _buildBody() {
    final theme = Theme.of(context);
    
    return Column(
      children: [
        // Tab Bar - moderneres Design
        Container(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
            child: TabBar(
              controller: _tabController,
              labelColor: theme.colorScheme.primary,
              unselectedLabelColor: theme.colorScheme.onSurface.withOpacity(0.7),
              indicatorSize: TabBarIndicatorSize.tab,
              indicator: BoxDecoration(
                borderRadius: BorderRadius.circular(50),
                color: theme.colorScheme.primaryContainer,
              ),
              dividerColor: Colors.transparent,
              labelStyle: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13,
              ),
              unselectedLabelStyle: TextStyle(
                fontWeight: FontWeight.w500,
                fontSize: 13,
              ),
              padding: EdgeInsets.zero,
              tabs: [
                Tab(
                  icon: Icon(Icons.timer, size: 20),
                  text: 'Timer',
                ),
                Tab(
                  icon: Icon(Icons.history, size: 20),
                  text: 'Einträge',
                ),
                Tab(
                  icon: Icon(Icons.account_balance_wallet, size: 20),
                  text: 'Zeitkonto',
                ),
              ],
            ),
          ),
        ),
        // Tab Content
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildTimerTab(),
              _buildTimeEntriesTab(),
              _buildTimeAccountTab(),
            ],
          ),
        ),
      ],
    );
  }
  
  Widget _buildTimerTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Kundenauswahl und Projektauswahl zuerst anzeigen
          if (!_isRunning)
            _buildNewTimerForm(),
            
          const SizedBox(height: 16),
          
          // Timer-Anzeige danach
          _buildTimerCard(),
          
          const SizedBox(height: 16),
          
          // Timer-Details (falls aktiv)
          if (_isRunning)
            _buildActiveTimerControls(),
            
          const SizedBox(height: 24),
          
          // Liste der letzten Einträge
          _buildRecentTimeEntriesList(),
        ],
      ),
    );
  }
  
  Widget _buildTimeEntriesTab() {
    return Column(
      children: [
        // Kopfzeile mit Filteroption und Neuladung
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Alle Zeiterfassungen',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: _loadTimeEntries,
                tooltip: 'Zeiteinträge aktualisieren',
              ),
            ],
          ),
        ),
        // Liste mit allen Zeiteinträgen
        Expanded(
          child: _isLoadingEntries && _timeEntries.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _timeEntries.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(16.0),
                        child: Text('Keine Zeiteinträge vorhanden'),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadTimeEntries,
                      child: ListView.builder(
                        controller: _entriesScrollController,
                        itemCount: _timeEntries.length + (_hasMoreEntries ? 1 : 0),
                        padding: const EdgeInsets.symmetric(horizontal: 16.0),
                        itemBuilder: (context, index) {
                          if (index == _timeEntries.length) {
                            return _isLoadingMoreEntries
                                ? Center(
                                    child: Padding(
                                      padding: const EdgeInsets.all(16.0),
                                      child: CircularProgressIndicator(),
                                    ),
                                  )
                                : SizedBox.shrink();
                          }
                          
                          final entry = _timeEntries[index];
                          return _buildTimeEntryCard(entry);
                        },
                      ),
                    ),
        ),
      ],
    );
  }
  
  // Neuer Tab für das Zeitkonto
  Widget _buildTimeAccountTab() {
    try {
      final totalDuration = _calculateTotalDuration();
      final thisMonth = _calculateMonthDuration();
      final theme = Theme.of(context);
      
      // Berechne monatliche Statistiken
      final monthlyStats = _calculateMonthlyStats();
      
      // Berechne Zeitverteilung nach Projekten
      final projectTimes = _calculateTimeByProject();
      
      // Berechne Pausenstatistiken
      final pauseStats = _calculatePauseStats();
      
      return DefaultTabController(
        length: 3,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Tab Bar für die Unterkategorien
            TabBar(
              labelColor: theme.colorScheme.primary,
              unselectedLabelColor: theme.colorScheme.onSurface.withOpacity(0.7),
              indicatorSize: TabBarIndicatorSize.tab,
              tabs: [
                Tab(
                  icon: Icon(Icons.dashboard_outlined, size: 20),
                  text: 'Übersicht',
                ),
                Tab(
                  icon: Icon(Icons.bar_chart, size: 20),
                  text: 'Projekte',
                ),
                Tab(
                  icon: Icon(Icons.calendar_today, size: 20),
                  text: 'Monat',
                ),
              ],
            ),
            
            Expanded(
              child: TabBarView(
                children: [
                  // Tab 1: Übersicht
                  _buildTimeAccountOverviewTab(totalDuration, thisMonth, monthlyStats, pauseStats, theme),
                  
                  // Tab 2: Projekte
                  _buildTimeAccountProjectsTab(projectTimes, theme),
                  
                  // Tab 3: Monatsdetails
                  _buildTimeAccountMonthTab(thisMonth, theme),
                ],
              ),
            ),
          ],
        ),
      );
    } catch (e) {
      print('Fehler beim Rendern des Zeitkonto-Tabs: $e');
      // Zeige einen Fallback-Bildschirm bei Fehlern
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              color: Colors.red,
              size: 64,
            ),
            SizedBox(height: 16),
            Text(
              'Zeitkonto konnte nicht geladen werden',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 8),
            Text(
              'Bitte versuchen Sie es später erneut oder kontaktieren Sie den Support.',
              textAlign: TextAlign.center,
            ),
            SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                _loadData(); // Versuche, die Daten neu zu laden
              },
              icon: Icon(Icons.refresh),
              label: Text('Neu laden'),
            ),
          ],
        ),
      );
    }
  }
  
  // Tab 1: Übersicht
  Widget _buildTimeAccountOverviewTab(int totalDuration, int thisMonth, MonthlyStats monthlyStats, PauseStats pauseStats, ThemeData theme) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Überschrift
          Text(
            'Zeitkonto',
            style: theme.textTheme.titleLarge,
          ),
          
          const SizedBox(height: 16),
          
          // Übersichtskarten mit Gesamtzeiten
          Row(
            children: [
              Expanded(
                child: _buildTimeAccountCard(
                  title: 'Gesamte Zeit',
                  time: _formatDuration(totalDuration),
                  icon: Icons.access_time,
                  color: theme.colorScheme.primary,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _buildTimeAccountCard(
                  title: 'Dieser Monat',
                  time: _formatDuration(thisMonth),
                  icon: Icons.calendar_today,
                  color: theme.colorScheme.secondary,
                ),
              ),
            ],
          ),
          
          const SizedBox(height: 24),
          
          // Zeiterfassung nach Quelle
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(
                color: theme.colorScheme.outline.withOpacity(0.3),
                width: 1,
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.timer,
                        color: theme.colorScheme.primary,
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Zeiterfassung diesen Monat',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  
                  // Statistische Zahlen
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16.0),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Arbeitstage',
                                style: TextStyle(
                                  color: Colors.grey.shade600,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${monthlyStats.daysWorked}',
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Ø Stunden/Tag',
                                style: TextStyle(
                                  color: Colors.grey.shade600,
                                  fontSize: 13,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                monthlyStats.avgHoursPerDay.toStringAsFixed(1),
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  
                  // Pausenstatistik
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Gesamtpausen',
                              style: TextStyle(
                                color: Colors.grey.shade600,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${pauseStats.totalPauseMinutes} min',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Ø Pause/Tag',
                              style: TextStyle(
                                color: Colors.grey.shade600,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${pauseStats.avgPauseMinutes.toStringAsFixed(0)} min',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
  
  // Tab 2: Projekte
  Widget _buildTimeAccountProjectsTab(List<ProjectTimeData> projectTimes, ThemeData theme) {
    try {
      // Sicherstellen, dass die Liste nicht null ist
      final safeProjectTimes = projectTimes.isNotEmpty ? projectTimes : <ProjectTimeData>[];
      
      return LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(), // Wichtig, um Scrolling zu erzwingen
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxHeight,
                maxWidth: constraints.maxWidth,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text(
                      'Zeit nach Projekten',
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                  
                  if (safeProjectTimes.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Card(
                        elevation: 0,
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Center(
                            child: Text(
                              'Keine Projektdaten vorhanden',
                              style: TextStyle(
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ),
                        ),
                      ),
                    )
                  else
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Card(
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                          side: BorderSide(
                            color: theme.colorScheme.outline.withOpacity(0.3),
                            width: 1,
                          ),
                        ),
                        child: ListView.separated(
                          shrinkWrap: true,
                          physics: NeverScrollableScrollPhysics(), // Wichtig, um in ScrollView zu arbeiten
                          itemCount: safeProjectTimes.length,
                          separatorBuilder: (context, index) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final project = safeProjectTimes[index];
                            // Berechne sicheren Prozentsatz
                            double safeWidthFactor = 0.0;
                            try {
                              // Stelle sicher, dass percentage ein gültiger Wert zwischen 0 und 100 ist
                              safeWidthFactor = project.percentage.isNaN || project.percentage <= 0
                                  ? 0.0
                                  : (project.percentage > 100 ? 1.0 : project.percentage / 100);
                            } catch (e) {
                              print('Fehler bei Berechnung des WidthFactors: $e');
                              safeWidthFactor = 0.0;
                            }
                            
                            final percentageText = project.percentage.isNaN 
                                ? "0.0" 
                                : project.percentage.toStringAsFixed(1);
                            
                            return Material(
                              color: Colors.transparent,
                              child: InkWell(
                                onTap: () {
                                  // Optionale Navigation zu Projektdetails hier implementieren
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('Projektdetails für ${project.projectName}'),
                                      duration: const Duration(seconds: 1),
                                    ),
                                  );
                                },
                                child: Padding(
                                  padding: const EdgeInsets.all(16.0),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    mainAxisSize: MainAxisSize.min, // Wichtig für Layout
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Expanded(
                                            child: Text(
                                              project.projectName,
                                              style: const TextStyle(
                                                fontWeight: FontWeight.w500,
                                                fontSize: 14,
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          Text(
                                            '${_formatDuration(project.time)} ($percentageText%)',
                                            style: TextStyle(
                                              fontWeight: FontWeight.w500,
                                              fontSize: 14,
                                              color: theme.colorScheme.primary,
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      SizedBox(
                                        height: 8, // Wichtig: Feste Höhe
                                        width: double.infinity,
                                        child: Stack(
                                          children: [
                                            // Hintergrund
                                            Container(
                                              decoration: BoxDecoration(
                                                borderRadius: BorderRadius.circular(4),
                                                color: theme.colorScheme.surface,
                                                border: Border.all(
                                                  color: theme.colorScheme.outline.withOpacity(0.2),
                                                  width: 1,
                                                ),
                                              ),
                                            ),
                                            // Vordergrund (Fortschritt)
                                            FractionallySizedBox(
                                              widthFactor: safeWidthFactor,
                                              child: Container(
                                                decoration: BoxDecoration(
                                                  borderRadius: BorderRadius.circular(4),
                                                  color: theme.colorScheme.primary,
                                                ),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      );
    } catch (e) {
      print('Fehler beim Rendern des Projekte-Tabs: $e');
      // Fallback bei Fehler
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.bar_chart_outlined,
              color: Colors.orange,
              size: 64,
            ),
            const SizedBox(height: 16),
            const Text(
              'Projektdaten konnten nicht geladen werden',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ElevatedButton.icon(
              onPressed: () {
                _loadData(); // Versuche erneut zu laden
              },
              icon: const Icon(Icons.refresh),
              label: const Text('Neu laden'),
            ),
          ],
        ),
      );
    }
  }
  
  // Tab 3: Monatsdetails
  Widget _buildTimeAccountMonthTab(int thisMonth, ThemeData theme) {
    try {
      // Sicher Zeiteinträge für den aktuellen Monat holen
      final entries = _getTimeEntriesInCurrentMonth();
      
      // Arbeitstage im Monat berechnen (für den Monatsbalken)
      final now = DateTime.now();
      final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
      final currentDay = now.day;
      
      // Fortschrittsbalken für den Monat
      final monthProgress = (currentDay / daysInMonth) * 100;
      
      return LayoutBuilder(
        builder: (context, constraints) {
          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(
                minHeight: constraints.maxHeight,
                maxWidth: constraints.maxWidth,
              ),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Monatsdetails',
                      style: theme.textTheme.titleLarge,
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Monatsfortschritt
                    Card(
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: BorderSide(
                          color: theme.colorScheme.outline.withOpacity(0.3),
                          width: 1,
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Monatsfortschritt',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: SizedBox(
                                    height: 6,
                                    child: Stack(
                                      children: [
                                        Container(
                                          decoration: BoxDecoration(
                                            color: Colors.grey.shade200,
                                            borderRadius: BorderRadius.circular(3),
                                          ),
                                        ),
                                        FractionallySizedBox(
                                          widthFactor: monthProgress / 100,
                                          child: Container(
                                            decoration: BoxDecoration(
                                              color: theme.colorScheme.primary,
                                              borderRadius: BorderRadius.circular(3),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  '${monthProgress.toStringAsFixed(0)}%',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Tag $currentDay von $daysInMonth',
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Monatliche Übersichtsstatistik
                    Card(
                      elevation: 0,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                        side: BorderSide(
                          color: theme.colorScheme.outline.withOpacity(0.3),
                          width: 1,
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Monatliche Übersichtsstatistik
                            Padding(
                              padding: const EdgeInsets.only(bottom: 16.0),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Sollstunden',
                                          style: TextStyle(
                                            color: Colors.grey.shade600,
                                            fontSize: 13,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          _formatDuration(160 * 60), // Beispiel für Sollstunden
                                          style: TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Iststunden',
                                          style: TextStyle(
                                            color: Colors.grey.shade600,
                                            fontSize: 13,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          _formatDuration(thisMonth),
                                          style: TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                            color: thisMonth > 160 * 60 ? Colors.green : Colors.orange,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Saldo',
                                          style: TextStyle(
                                            color: Colors.grey.shade600,
                                            fontSize: 13,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          _formatDuration(thisMonth - 160 * 60),
                                          style: TextStyle(
                                            fontSize: 18,
                                            fontWeight: FontWeight.bold,
                                            color: thisMonth > 160 * 60 ? Colors.green : Colors.red,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            
                            const Divider(),
                            
                            // Liste der Tage im Monat
                            if (entries.isEmpty)
                              Padding(
                                padding: const EdgeInsets.all(16.0),
                                child: Center(
                                  child: Text(
                                    'Keine Zeiteinträge in diesem Monat',
                                    style: TextStyle(
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                                ),
                              )
                            else
                              SizedBox(
                                // Feste Höhe für ListView verbessert das Rendering
                                height: entries.length * 72.0, // Ungefähre Höhe pro Eintrag
                                child: ListView.builder(
                                  shrinkWrap: true,
                                  physics: const NeverScrollableScrollPhysics(),
                                  itemCount: entries.length,
                                  itemBuilder: (context, index) {
                                    try {
                                      final entry = entries[index];
                                      
                                      return Material(
                                        color: Colors.transparent,
                                        child: InkWell(
                                          onTap: () {
                                            // Hier könnte eine Navigation zur Detailansicht sein
                                            ScaffoldMessenger.of(context).showSnackBar(
                                              SnackBar(
                                                content: Text('Zeiteintrag vom ${_formatDate(entry.date)}'),
                                                duration: const Duration(seconds: 1),
                                              ),
                                            );
                                          },
                                          child: ListTile(
                                            leading: Container(
                                              width: 40,
                                              height: 40,
                                              decoration: BoxDecoration(
                                                color: theme.colorScheme.primaryContainer,
                                                shape: BoxShape.circle,
                                              ),
                                              child: Center(
                                                child: Text(
                                                  entry.date.day.toString(),
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    color: theme.colorScheme.onPrimaryContainer,
                                                  ),
                                                ),
                                              ),
                                            ),
                                            title: Text(
                                              '${_formatDate(entry.date)} - ${entry.projectName}',
                                              style: TextStyle(fontWeight: FontWeight.w500),
                                            ),
                                            subtitle: Text(
                                              '${_formatTime(entry.startTime)} - ${_formatTime(entry.endTime)}',
                                              style: TextStyle(fontSize: 12),
                                            ),
                                            trailing: Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Text(
                                                  _formatDuration(entry.duration),
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    color: theme.colorScheme.primary,
                                                  ),
                                                ),
                                                if (entry.pauseMinutes > 0)
                                                  Padding(
                                                    padding: const EdgeInsets.only(left: 4.0),
                                                    child: Text(
                                                      '(P: ${entry.pauseMinutes}min)',
                                                      style: TextStyle(
                                                        fontSize: 12,
                                                        color: Colors.grey.shade600,
                                                      ),
                                                    ),
                                                  ),
                                              ],
                                            ),
                                            dense: true,
                                          ),
                                        ),
                                      );
                                    } catch (e) {
                                      print('Fehler beim Rendern des Zeiteintrags: $e');
                                      return ListTile(
                                        title: Text('Fehlerhafter Eintrag'),
                                        subtitle: Text('Konnte nicht geladen werden'),
                                        dense: true,
                                      );
                                    }
                                  },
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );
    } catch (e) {
      print('Fehler beim Rendern des Monats-Tabs: $e');
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              color: Colors.orange,
              size: 48,
            ),
            SizedBox(height: 16),
            Text(
              'Daten konnten nicht geladen werden',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 8),
            ElevatedButton(
              onPressed: () {
                _loadTimeEntries();
              },
              child: Text('Neu laden'),
            ),
          ],
        ),
      );
    }
  }
  
  // Berechne Statistiken für den aktuellen Monat
  MonthlyStats _calculateMonthlyStats() {
    try {
      final entries = _getTimeEntriesInCurrentMonth();
      
      if (entries.isEmpty) {
        return MonthlyStats(
          daysWorked: 0,
          totalSeconds: 0,
          avgHoursPerDay: 0.0,
        );
      }
      
      final daysWorked = _calculateDaysWorked(entries);
      
      final totalSeconds = entries.fold(0, (sum, entry) => sum + entry.duration);
      final avgHoursPerDay = daysWorked > 0 
          ? totalSeconds / (3600 * daysWorked) 
          : 0.0;
      
      return MonthlyStats(
        daysWorked: daysWorked,
        totalSeconds: totalSeconds,
        avgHoursPerDay: avgHoursPerDay,
      );
    } catch (e) {
      print('Fehler beim Berechnen der Monatsstatistiken: $e');
      return MonthlyStats(
        daysWorked: 0,
        totalSeconds: 0,
        avgHoursPerDay: 0.0,
      );
    }
  }
  
  // Berechne Pausenstatistiken
  PauseStats _calculatePauseStats() {
    try {
      final entries = _getTimeEntriesInCurrentMonth();
      
      if (entries.isEmpty) {
        return PauseStats(
          totalPauseMinutes: 0,
          avgPauseMinutes: 0.0,
          entriesWithPause: 0,
          maxPause: 0,
        );
      }
      
      final entriesWithPause = entries.where((e) => e.pauseMinutes > 0).toList();
      
      final totalPauseMinutes = entries.fold(0, (sum, entry) => sum + entry.pauseMinutes);
      final avgPauseMinutes = entriesWithPause.isNotEmpty
          ? totalPauseMinutes / entriesWithPause.length
          : 0.0;
      
      int maxPause = 0;
      if (entriesWithPause.isNotEmpty) {
        maxPause = entriesWithPause.map((e) => e.pauseMinutes).reduce((a, b) => a > b ? a : b);
      }
      
      return PauseStats(
        totalPauseMinutes: totalPauseMinutes,
        avgPauseMinutes: avgPauseMinutes,
        entriesWithPause: entriesWithPause.length,
        maxPause: maxPause,
      );
    } catch (e) {
      print('Fehler beim Berechnen der Pausenstatistiken: $e');
      return PauseStats(
        totalPauseMinutes: 0,
        avgPauseMinutes: 0.0,
        entriesWithPause: 0,
        maxPause: 0,
      );
    }
  }
  
  // Berechne die Anzahl der gearbeiteten Tage
  int _calculateDaysWorked(List<TimeEntry> entries) {
    final daysSet = <String>{};
    
    for (final entry in entries) {
      final dateStr = _formatDate(entry.date);
      daysSet.add(dateStr);
    }
    
    return daysSet.length;
  }
  
  // Berechne die Zeitverteilung nach Projekten
  List<ProjectTimeData> _calculateTimeByProject() {
    try {
      final map = <String, ProjectTimeData>{};
      final entries = _getTimeEntriesInCurrentMonth();
      
      if (entries.isEmpty) {
        return []; // Bei leerer Liste sofort leere Liste zurückgeben
      }
      
      int totalTime = 0;
      
      // Summiere die Zeit pro Projekt
      for (final entry in entries) {
        if (entry.projectId == null || entry.projectId.isEmpty) {
          continue; // Überspringe Einträge ohne gültige Projekt-ID
        }
        
        totalTime += entry.duration;
        
        if (!map.containsKey(entry.projectId)) {
          map[entry.projectId] = ProjectTimeData(
            projectId: entry.projectId,
            projectName: entry.projectName.isEmpty ? 'Unbekannt' : entry.projectName,
            time: 0,
            percentage: 0.0,
          );
        }
        
        map[entry.projectId]!.time += entry.duration;
      }
      
      // Berechne Prozentsätze und sortiere nach Zeit (absteigend)
      final projectTimes = map.values.toList();
      
      if (totalTime > 0) {
        for (final project in projectTimes) {
          project.percentage = (project.time / totalTime) * 100;
        }
      }
      
      projectTimes.sort((a, b) => b.time.compareTo(a.time));
      
      return projectTimes;
    } catch (e) {
      print('Fehler beim Berechnen der Zeitverteilung nach Projekten: $e');
      return []; // Bei Fehler leere Liste zurückgeben
    }
  }
  
  // Filtere Zeiteinträge für den aktuellen Monat
  List<TimeEntry> _getTimeEntriesInCurrentMonth() {
    try {
      final now = DateTime.now();
      final currentMonth = now.month;
      final currentYear = now.year;
      
      if (_timeEntries.isEmpty) {
        return []; // Leere Liste zurückgeben, wenn keine Einträge vorhanden sind
      }
      
      return _timeEntries.where((entry) => 
        entry.dateMonth + 1 == currentMonth && entry.dateYear == currentYear
      ).toList();
    } catch (e) {
      print('Fehler beim Filtern der Zeiteinträge: $e');
      return []; // Bei Fehler leere Liste zurückgeben
    }
  }
  
  // Karte für das Zeitkonto
  Widget _buildTimeAccountCard({
    required String title,
    required String time,
    required IconData icon,
    required Color color,
  }) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: color.withOpacity(0.3),
          width: 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  icon,
                  color: color,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.w500,
                    fontSize: 14,
                    color: Colors.grey.shade700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              time,
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
  
  // Berechnet die Gesamtdauer aller Zeiteinträge
  int _calculateTotalDuration() {
    return _timeEntries.fold(0, (sum, entry) => sum + entry.duration);
  }
  
  // Berechnet die Dauer für den aktuellen Monat
  int _calculateMonthDuration() {
    final now = DateTime.now();
    final currentMonth = now.month;
    final currentYear = now.year;
    
    return _timeEntries.fold(0, (sum, entry) {
      if (entry.dateMonth + 1 == currentMonth && entry.dateYear == currentYear) {
        return sum + entry.duration;
      }
      return sum;
    });
  }
  
  // Neu gestaltetes Formular für die Timer-Erstellung
  Widget _buildNewTimerForm() {
    final theme = Theme.of(context);
    
    return Card(
      key: _timeFormKey,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: theme.colorScheme.outline.withOpacity(0.3),
          width: 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.playlist_add_check,
                  color: theme.colorScheme.primary,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  'Neue Zeiterfassung',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            
            DropdownButtonFormField<String>(
              decoration: InputDecoration(
                labelText: 'Kunde',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                prefixIcon: Icon(Icons.business, color: theme.colorScheme.primary),
              ),
              value: _selectedCustomerId.isEmpty ? null : _selectedCustomerId,
              hint: const Text('Kunde auswählen'),
              items: _customers.map((customer) {
                return DropdownMenuItem<String>(
                  value: customer.id,
                  child: Text(customer.name),
                );
              }).toList(),
              onChanged: (value) {
                setState(() {
                  _selectedCustomerId = value ?? '';
                  _selectedProjectId = '';
                  _filteredProjects = _projects.where((p) => p.customerId == _selectedCustomerId).toList();
                });
              },
            ),
            const SizedBox(height: 16),
            
            DropdownButtonFormField<String>(
              decoration: InputDecoration(
                labelText: 'Projekt',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                prefixIcon: Icon(Icons.folder_open, color: theme.colorScheme.primary),
              ),
              value: _selectedProjectId.isEmpty ? null : _selectedProjectId,
              hint: const Text('Projekt auswählen'),
              items: _filteredProjects.map((project) {
                return DropdownMenuItem<String>(
                  value: project.id,
                  child: Text(project.name),
                );
              }).toList(),
              onChanged: _selectedCustomerId.isEmpty 
                ? null 
                : (value) {
                    setState(() {
                      _selectedProjectId = value ?? '';
                    });
                  },
            ),
            const SizedBox(height: 16),
            
            TextField(
              decoration: InputDecoration(
                labelText: 'Notiz',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                prefixIcon: Icon(Icons.note, color: theme.colorScheme.primary),
                hintText: 'Optional: Notiz zur Zeiterfassung',
              ),
              controller: _noteController,
              onChanged: (value) {
                setState(() {
                  _note = value;
                });
              },
            ),
          ],
        ),
      ),
    );
  }
  
  // Timer-Karte
  Widget _buildTimerCard() {
    final theme = Theme.of(context);
    
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: theme.colorScheme.outline.withOpacity(0.3),
          width: 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  _isPaused ? Icons.pause_circle : Icons.timer,
                  color: _isPaused ? Colors.orange : theme.colorScheme.primary,
                  size: 24,
                ),
                const SizedBox(width: 8),
                Text(
                  'Zeiterfassung',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: _isPaused ? Colors.orange : theme.colorScheme.onSurface,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            
            Text(
              _formatElapsedTime(),
              style: TextStyle(
                fontSize: 42,
                fontWeight: FontWeight.w300,
                color: theme.colorScheme.onSurface,
                letterSpacing: 2,
              ),
            ),
            
            if (_isPaused && _currentPauseSeconds > 0)
              Padding(
                padding: const EdgeInsets.only(top: 8.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.hourglass_bottom,
                      color: Colors.orange,
                      size: 16,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      'Pause: ${_formatPauseTime()}',
                      style: const TextStyle(
                        color: Colors.orange,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ),
            
            const SizedBox(height: 8),
            
            if (_isRunning && _activeTimer != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '${_activeTimer!.customerName} - ${_activeTimer!.projectName}',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            
            const SizedBox(height: 24),
            
            if (!_isRunning)
              ElevatedButton.icon(
                onPressed: _selectedCustomerId.isEmpty || _selectedProjectId.isEmpty
                    ? null
                    : () => _startTimer(),
                icon: const Icon(Icons.play_arrow),
                label: const Text('Zeiterfassung starten'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  foregroundColor: theme.colorScheme.onPrimary,
                  padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(30),
                  ),
                  minimumSize: const Size(double.infinity, 48),
                ),
              )
            else
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (!_isPaused)
                    ElevatedButton.icon(
                      onPressed: _pauseTimer,
                      icon: const Icon(Icons.pause),
                      label: const Text('Pausieren'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.amber,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      ),
                    )
                  else
                    ElevatedButton.icon(
                      onPressed: _resumeTimer,
                      icon: const Icon(Icons.play_arrow),
                      label: const Text('Fortsetzen'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      ),
                    ),
                  const SizedBox(width: 16),
                  ElevatedButton.icon(
                    onPressed: () => _stopTimer(),
                    icon: const Icon(Icons.stop),
                    label: const Text('Beenden'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(30),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
  
  // Timer-Details
  Widget _buildActiveTimerControls() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Timer-Details',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            TextField(
              decoration: const InputDecoration(
                labelText: 'Notiz',
                hintText: 'Optional: Notiz zur Zeiterfassung',
              ),
              controller: _noteController,
              onChanged: (value) {
                setState(() {
                  _note = value;
                });
              },
            ),
          ],
        ),
      ),
    );
  }
  
  // Liste der letzten Einträge
  Widget _buildRecentTimeEntriesList() {
    final theme = Theme.of(context);
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                'Letzte Zeiterfassungen',
                style: theme.textTheme.titleLarge,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            TextButton(
              onPressed: () {
                _tabController.animateTo(1);
              },
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Alle anzeigen',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(width: 2),
                  const Icon(Icons.arrow_forward, size: 14),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        _isLoadingEntries
            ? const Center(child: CircularProgressIndicator())
            : _timeEntries.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(16.0),
                      child: Text('Keine Zeiteinträge vorhanden'),
                    ),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _timeEntries.length > 5 ? 5 : _timeEntries.length,
                    itemBuilder: (context, index) {
                      final entry = _timeEntries[index];
                      return _buildTimeEntryCard(entry);
                    },
                  ),
      ],
    );
  }
  
  // Zeiteintragskarte
  Widget _buildTimeEntryCard(TimeEntry entry) {
    final theme = Theme.of(context);
    
    // Status des Zeiteintrags visualisieren
    final bool isDraft = entry.status == 'draft';
    final bool isPending = entry.status == 'pending';
    final bool isRejected = entry.status == 'rejected';
    final bool isApproved = entry.status == 'approved';
    
    Color statusColor = Colors.green;
    String statusText = 'Abgeschlossen';
    IconData statusIcon = Icons.check_circle_outline;
    
    if (isPending) {
      statusColor = Colors.orange;
      statusText = 'Genehmigung ausstehend';
      statusIcon = Icons.hourglass_empty;
    } else if (isRejected) {
      statusColor = Colors.red;
      statusText = 'Abgelehnt';
      statusIcon = Icons.cancel_outlined;
    } else if (isApproved) {
      statusColor = Colors.green;
      statusText = 'Genehmigt';
      statusIcon = Icons.check_circle_outline;
    } else if (isDraft) {
      statusColor = Colors.blue;
      statusText = 'Entwurf';
      statusIcon = Icons.edit_note;
    } else if (entry.status == 'running') {
      statusColor = Colors.blue;
      statusText = 'Läuft';
      statusIcon = Icons.play_arrow;
    } else if (entry.status == 'paused') {
      statusColor = Colors.blue;
      statusText = 'Pausiert';
      statusIcon = Icons.pause;
    }
    
    // Prüfen, ob der Eintrag bearbeitet werden kann
    bool canEdit = entry.status == 'draft' || entry.status == 'rejected';
    bool canSubmit = entry.status == 'draft' || entry.status == 'rejected';
    
    return Card(
      margin: const EdgeInsets.only(bottom: 8.0),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8.0),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            title: Text(
              '${entry.customerName} - ${entry.projectName}',
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '${_formatDate(entry.date)} | ${_formatTime(entry.startTime)} - ${_formatTime(entry.endTime)}',
                  style: const TextStyle(fontSize: 12),
                ),
                if (entry.note.isNotEmpty)
                  Text(
                    entry.note,
                    style: const TextStyle(fontStyle: FontStyle.italic, fontSize: 12),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                const SizedBox(height: 2),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        statusIcon,
                        size: 10,
                        color: statusColor,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        statusText,
                        style: TextStyle(
                          fontSize: 10,
                          color: statusColor,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            dense: true,
            visualDensity: VisualDensity.compact,
            trailing: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _formatDuration(entry.duration),
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
                if (entry.pauseMinutes > 0)
                  Text(
                    'Pause: ${entry.pauseMinutes}min',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 10),
                  ),
              ],
            ),
            onTap: () => _editTimeEntry(entry),
          ),
          
          // Aktionen für den Zeiteintrag
          if (canEdit || canSubmit)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (canEdit)
                    TextButton.icon(
                      onPressed: () => _editTimeEntry(entry),
                      icon: const Icon(Icons.edit, size: 16),
                      label: const Text('Bearbeiten'),
                      style: TextButton.styleFrom(
                        foregroundColor: theme.colorScheme.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                  if (canSubmit)
                    TextButton.icon(
                      onPressed: () => _submitTimeEntry(entry),
                      icon: const Icon(Icons.send, size: 16),
                      label: const Text('Einreichen'),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.blue,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        visualDensity: VisualDensity.compact,
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
  
  // Zeiteintrag bearbeiten
  Future<void> _editTimeEntry(TimeEntry entry) async {
    // Navigiere zum Detailbildschirm
    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => TimeDetailScreen(timeEntry: entry),
      ),
    );
    
    // Wenn Änderungen vorgenommen wurden, aktualisiere die Liste
    if (result == true) {
      _loadTimeEntries();
    }
  }
  
  // Zeiteintrag zur Genehmigung einreichen
  Future<void> _submitTimeEntry(TimeEntry entry) async {
    try {
      // SnackBar anzeigen, um den Benutzer über den Einreichungsprozess zu informieren
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Zeiteintrag wird eingereicht...'),
          duration: Duration(seconds: 1),
        ),
      );
      
      // Zur Genehmigung einreichen
      await _timeEntryService.submitForApproval(entry.id!);
      
      // Erfolg anzeigen
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Zeiteintrag zur Genehmigung eingereicht'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 2),
        ),
      );
      
      // Daten neu laden
      _loadTimeEntries();
    } catch (e) {
      // Fehler anzeigen
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Einreichen: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}

// Hilfsklassen für die Zeitkontostatistik
class MonthlyStats {
  final int daysWorked;
  final int totalSeconds;
  final double avgHoursPerDay;
  
  MonthlyStats({
    required this.daysWorked,
    required this.totalSeconds,
    required this.avgHoursPerDay,
  });
}

class PauseStats {
  final int totalPauseMinutes;
  final double avgPauseMinutes;
  final int entriesWithPause;
  final int maxPause;
  
  PauseStats({
    required this.totalPauseMinutes,
    required this.avgPauseMinutes,
    required this.entriesWithPause,
    required this.maxPause,
  });
}

class ProjectTimeData {
  final String projectId;
  final String projectName;
  int time;
  double percentage;
  
  ProjectTimeData({
    required this.projectId,
    required this.projectName,
    required this.time,
    required this.percentage,
  });
} 