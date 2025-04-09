import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'dart:math' as math;
import 'package:go_router/go_router.dart';
import '../services/auth_service.dart';
import '../services/navigation_service.dart';
import '../services/time/time_entry_service.dart';
import '../models/time/time_entry_model.dart';
import 'package:intl/intl.dart';
import 'package:fl_chart/fl_chart.dart';

class DashboardScreen extends StatefulWidget {
  final User user;
  
  const DashboardScreen({super.key, required this.user});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> with TickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  final AuthService _authService = AuthService();
  final NavigationService _navigationService = NavigationService();
  final TimeEntryService _timeEntryService = TimeEntryService();
  
  late TabController _tabController;
  late AnimationController _animationController;
  late AnimationController _pulseController;
  
  bool _isLoading = true;
  
  // Daten aus der Zeiterfassung
  List<TimeEntry> _timeEntries = [];
  TimeEntry? _activeTimer;
  
  // Berechnete Statistiken
  Map<String, dynamic> _weekStats = {'hours': 0.0};
  Map<String, dynamic> _monthStats = {'hours': 0.0};
  Map<String, dynamic> _projectsStats = {'count': 0};
  
  // Daten für die Charts
  List<double> _weekHours = [];
  List<String> _weekLabels = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
    
    _loadDashboardData();
    
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _animationController.forward();
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _animationController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    
    if (_isLoading) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 60, height: 60,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(
                  Theme.of(context).colorScheme.primary
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Daten werden geladen...',
              style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
                fontWeight: FontWeight.w500
              ),
            ),
          ],
        ),
      );
    }
    
    final theme = Theme.of(context);
    final size = MediaQuery.of(context).size;
    
    return RefreshIndicator(
      color: theme.colorScheme.primary,
      backgroundColor: theme.colorScheme.surface,
      onRefresh: () async {
        await _loadDashboardData();
      },
      child: Scaffold(
        body: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                theme.colorScheme.surface,
                theme.colorScheme.surface.withOpacity(0.95),
              ],
            ),
          ),
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 12),
                    _buildHeader(),
                    const SizedBox(height: 16),
                    if (_activeTimer != null) 
                      _buildActiveTimer(theme),
                    if (_activeTimer != null)
                      const SizedBox(height: 16),
                    _buildStatisticsRow(),
                    const SizedBox(height: 16),
                    _buildTodayTimeline(),
                    const SizedBox(height: 16),
                    _buildWeeklyChart(theme),
                    const SizedBox(height: 16),
                    _buildRecentEntries(),
                    const SizedBox(height: 80),
                  ].animate(
                    interval: 50.ms,
                    effects: [
                      FadeEffect(duration: 400.ms),
                      SlideEffect(
                        begin: Offset(0, 15), 
                        end: Offset.zero,
                        duration: 400.ms,
                        curve: Curves.easeOutQuad
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    final theme = Theme.of(context);
    final DateTime now = DateTime.now();
    String greeting;
    IconData timeIcon;
    
    if (now.hour < 12) {
      greeting = 'Guten Morgen';
      timeIcon = Icons.wb_sunny_outlined;
    } else if (now.hour < 18) {
      greeting = 'Guten Tag';
      timeIcon = Icons.wb_cloudy_outlined;
    } else {
      greeting = 'Guten Abend';
      timeIcon = Icons.nightlight_outlined;
    }
    
    final String name = widget.user.displayName ?? widget.user.email?.split('@').first ?? 'Nutzer';
    
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              DateFormat('EEEE, d. MMMM', 'de_DE').format(now),
              style: TextStyle(
                color: theme.colorScheme.onSurface.withOpacity(0.6),
                fontSize: 14,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Text(
                  '$greeting, ',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  name,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ],
            ),
          ],
        ),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withOpacity(0.1),
            borderRadius: BorderRadius.circular(16),
          ),
          child: AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              return Icon(
                timeIcon,
                color: theme.colorScheme.primary,
                size: 24 + _pulseController.value * 2,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildStatisticsRow() {
    final theme = Theme.of(context);
    
    return SizedBox(
      height: 100,
      child: ListView(
        scrollDirection: Axis.horizontal,
        physics: BouncingScrollPhysics(),
        children: [
          _buildStatCard(
            title: 'Gesamt diese Woche',
            value: '${_weekStats['hours'].toStringAsFixed(1)}h',
            icon: Icons.calendar_view_week_rounded,
            gradient: [
              theme.colorScheme.primary.withOpacity(0.7), 
              theme.colorScheme.primary
            ],
            delay: 100,
          ),
          _buildStatCard(
            title: 'Gesamt diesen Monat',
            value: '${_monthStats['hours'].toStringAsFixed(1)}h',
            icon: Icons.calendar_month_rounded,
            gradient: [
              theme.colorScheme.secondary.withOpacity(0.7), 
              theme.colorScheme.secondary
            ],
            delay: 200,
          ),
          _buildStatCard(
            title: 'Aktive Projekte',
            value: '${_projectsStats['count']}',
            icon: Icons.folder_special_rounded,
            gradient: [
              Colors.orange.withOpacity(0.7), 
              Colors.orange
            ],
            delay: 300,
          ),
        ],
      ),
    );
  }

  Widget _buildStatCard({
    required String title,
    required String value,
    required IconData icon,
    required List<Color> gradient,
    required int delay,
  }) {
    return Container(
      width: 145,
      margin: const EdgeInsets.only(right: 10),
      child: Card(
        elevation: 4,
        shadowColor: gradient[1].withOpacity(0.3),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: gradient,
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 10.0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    icon,
                    color: Colors.white,
                    size: 16,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        value,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ).animate(delay: delay.ms)
      .fadeIn(duration: 500.ms)
      .move(begin: Offset(20, 0), end: Offset.zero, duration: 500.ms, curve: Curves.easeOutQuad);
  }

  Widget _buildActiveTimer(ThemeData theme) {
    if (_activeTimer == null) return const SizedBox.shrink();
    
    final now = DateTime.now();
    final elapsed = _activeTimer!.status == 'paused'
        ? Duration(seconds: _activeTimer!.duration) 
        : now.difference(_activeTimer!.startTime);
    
    final String formattedTime = _formatDuration(elapsed.inSeconds);
    final String formattedStart = DateFormat('HH:mm').format(_activeTimer!.startTime);
    
    return Card(
      elevation: 6,
      shadowColor: theme.colorScheme.primary.withOpacity(0.3),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              _activeTimer!.status == 'paused' 
                  ? Colors.amber.withOpacity(0.05)
                  : theme.colorScheme.primary.withOpacity(0.05),
              _activeTimer!.status == 'paused'
                  ? Colors.amber.withOpacity(0.15)
                  : theme.colorScheme.primary.withOpacity(0.15),
            ],
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _activeTimer!.status == 'paused'
                          ? Colors.amber.withOpacity(0.2)
                          : theme.colorScheme.primary.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(30),
                    ),
                    child: Row(
                      children: [
                        AnimatedBuilder(
                          animation: _pulseController,
                          builder: (context, child) {
                            return Icon(
                              _activeTimer!.status == 'paused'
                                  ? Icons.pause
                                  : Icons.play_arrow,
                              color: _activeTimer!.status == 'paused'
                                  ? Colors.amber
                                  : theme.colorScheme.primary,
                              size: 14 + _pulseController.value * 1.5,
                            );
                          }
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _activeTimer!.status == 'paused'
                              ? 'Pausiert'
                              : 'Läuft',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _activeTimer!.status == 'paused'
                                ? Colors.amber
                                : theme.colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Spacer(),
                  Text(
                    'Seit $formattedStart',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: theme.colorScheme.onSurface.withOpacity(0.5),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Aktuelle Zeiterfassung',
                          style: TextStyle(
                            fontSize: 13,
                            color: theme.colorScheme.onSurface.withOpacity(0.6),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _activeTimer!.projectName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      AnimatedBuilder(
                        animation: _pulseController,
                        builder: (context, child) {
                          final timerColor = _activeTimer!.status == 'paused'
                              ? Colors.amber
                              : theme.colorScheme.primary;
                          
                          return Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: timerColor.withOpacity(0.1 + (_pulseController.value * 0.05)),
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: timerColor.withOpacity(0.2 * _pulseController.value),
                                  blurRadius: 8 * _pulseController.value,
                                  spreadRadius: 1.5 * _pulseController.value,
                                ),
                              ],
                            ),
                            child: Center(
                              child: Icon(
                                Icons.timer,
                                color: timerColor,
                                size: 20,
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(width: 12),
                      Text(
                        formattedTime,
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: _activeTimer!.status == 'paused'
                              ? Colors.amber
                              : theme.colorScheme.primary,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      if (_activeTimer!.status == 'running')
                        ElevatedButton.icon(
                          onPressed: () => _pauseTimer(),
                          icon: const Icon(Icons.pause, size: 16),
                          label: const Text('Pause', style: TextStyle(fontSize: 13)),
                          style: ElevatedButton.styleFrom(
                            elevation: 0,
                            backgroundColor: Colors.amber,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(30),
                            ),
                          ),
                        )
                      else
                        ElevatedButton.icon(
                          onPressed: () => _resumeTimer(),
                          icon: const Icon(Icons.play_arrow, size: 16),
                          label: const Text('Fortsetzen', style: TextStyle(fontSize: 13)),
                          style: ElevatedButton.styleFrom(
                            elevation: 0,
                            backgroundColor: Colors.green,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(30),
                            ),
                          ),
                        ),
                      const SizedBox(width: 6),
                      ElevatedButton.icon(
                        onPressed: () => _stopTimer(),
                        icon: const Icon(Icons.stop, size: 16),
                        label: const Text('Beenden', style: TextStyle(fontSize: 13)),
                        style: ElevatedButton.styleFrom(
                          elevation: 0,
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(30),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ).animate()
      .fadeIn(duration: 600.ms)
      .scale(
        begin: const Offset(0.95, 0.95), 
        end: const Offset(1, 1),
        duration: 700.ms,
        curve: Curves.easeOutQuint
      );
  }
  
  Widget _buildTodayTimeline() {
    final theme = Theme.of(context);
    final stats = _calculateTodayStats();
    final totalHours = stats['totalHours'] ?? 0.0;
    final entriesCount = stats['entriesCount'] ?? 0;
    final pauseMinutes = stats['pauseMinutes'] ?? 0;
    
    // Konvertierung in Stunden:Minuten
    final totalMinutes = (totalHours * 60).round();
    final hours = totalMinutes ~/ 60;
    final minutes = totalMinutes % 60;
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Heute',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Card(
          elevation: 3,
          shadowColor: theme.colorScheme.shadow.withOpacity(0.2),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildTodayStatTile(
                  theme, 
                  value: '$hours:${minutes.toString().padLeft(2, '0')}',
                  label: 'Stunden',
                  icon: Icons.access_time_rounded,
                  iconColor: theme.colorScheme.primary,
                  delay: 200,
                ),
                _buildDivider(),
                _buildTodayStatTile(
                  theme, 
                  value: '$entriesCount', 
                  label: 'Einträge',
                  icon: Icons.format_list_bulleted_rounded,
                  iconColor: Colors.blue,
                  delay: 300,
                ),
                _buildDivider(),
                _buildTodayStatTile(
                  theme, 
                  value: '$pauseMinutes', 
                  label: 'Pausenminuten',
                  icon: Icons.free_breakfast_rounded,
                  iconColor: Colors.amber,
                  delay: 400,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
  
  Widget _buildDivider() {
    return Container(
      height: 25,
      width: 1,
      color: Colors.grey.withOpacity(0.2),
    );
  }
  
  Widget _buildTodayStatTile(ThemeData theme, {
    required String value,
    required String label,
    required IconData icon,
    required Color iconColor,
    required int delay,
  }) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(
            icon,
            color: iconColor,
            size: 18,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          value,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: theme.colorScheme.onSurface.withOpacity(0.6),
          ),
        ),
      ],
    ).animate(delay: delay.ms)
      .fadeIn(duration: 500.ms)
      .slideY(begin: 8, end: 0, duration: 500.ms, curve: Curves.easeOutQuad);
  }
  
  Widget _buildWeeklyChart(ThemeData theme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Wochenübersicht',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 16),
        AspectRatio(
          aspectRatio: 1.6,
          child: Card(
            elevation: 4,
            shadowColor: theme.colorScheme.shadow.withOpacity(0.2),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Stunden pro Tag',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: BarChart(
                      BarChartData(
                        titlesData: FlTitlesData(
                          leftTitles: AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                          rightTitles: AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                          topTitles: AxisTitles(
                            sideTitles: SideTitles(showTitles: false),
                          ),
                          bottomTitles: AxisTitles(
                            sideTitles: SideTitles(
                              showTitles: true,
                              getTitlesWidget: (value, meta) {
                                final index = value.toInt();
                                if (index < 0 || index >= _weekLabels.length) {
                                  return const SizedBox(); // Leeres Widget für ungültige Indizes
                                }
                                return Padding(
                                  padding: const EdgeInsets.only(top: 8.0),
                                  child: Text(
                                    _weekLabels[index],
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: theme.colorScheme.onSurface.withOpacity(0.6),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                        gridData: FlGridData(
                          show: false,
                        ),
                        borderData: FlBorderData(
                          show: false,
                        ),
                        barGroups: List.generate(
                          _weekHours.length,
                          (index) => BarChartGroupData(
                            x: index,
                            barRods: [
                              BarChartRodData(
                                toY: _weekHours[index] * _animationController.value,
                                width: 20,
                                borderRadius: BorderRadius.circular(4),
                                gradient: LinearGradient(
                                  colors: [
                                    theme.colorScheme.primary.withOpacity(0.7),
                                    theme.colorScheme.primary,
                                  ],
                                  begin: Alignment.bottomCenter,
                                  end: Alignment.topCenter,
                                ),
                                backDrawRodData: BackgroundBarChartRodData(
                                  show: true,
                                  toY: _getMaxChartValue(),
                                  color: theme.colorScheme.primary.withOpacity(0.1),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      swapAnimationDuration: Duration(milliseconds: 800),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ).animate()
      .fadeIn(duration: 800.ms)
      .slideY(begin: 30, end: 0, duration: 700.ms, curve: Curves.easeOutQuint);
  }

  Widget _buildRecentEntries() {
    final theme = Theme.of(context);
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Letzte Aktivitäten',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            TextButton.icon(
              onPressed: () => context.go('/time'),
              icon: const Icon(Icons.arrow_forward, size: 18),
              label: const Text('Alle'),
              style: TextButton.styleFrom(
                foregroundColor: theme.colorScheme.primary,
                visualDensity: VisualDensity.compact,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        
        if (_timeEntries.isEmpty)
          SizedBox(
            height: 100,
            child: Center(
              child: Text(
                'Keine Zeiteinträge vorhanden',
                style: TextStyle(color: Colors.grey),
              ),
            ),
          )
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: math.min(3, _timeEntries.length),
            itemBuilder: (context, index) {
              final entry = _timeEntries[index];
              final DateTime today = DateTime.now();
              final bool isToday = entry.date.day == today.day && 
                                   entry.date.month == today.month &&
                                   entry.date.year == today.year;
              
              return Padding(
                padding: const EdgeInsets.only(bottom: 8.0),
                child: Card(
                  elevation: 2,
                  shadowColor: theme.colorScheme.shadow.withOpacity(0.1),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: ListTile(
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    leading: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: isToday
                            ? theme.colorScheme.primary.withOpacity(0.1)
                            : theme.colorScheme.onSurface.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Icon(
                          isToday ? Icons.today : Icons.history,
                          color: isToday
                              ? theme.colorScheme.primary
                              : theme.colorScheme.onSurface.withOpacity(0.6),
                          size: 24,
                        ),
                      ),
                    ),
                    title: Text(
                      entry.projectName,
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Row(
                      children: [
                        Text(
                          isToday
                              ? 'Heute'
                              : DateFormat('dd.MM.yyyy').format(entry.date),
                          style: TextStyle(
                            color: isToday
                                ? theme.colorScheme.primary
                                : theme.colorScheme.onSurface.withOpacity(0.6),
                            fontWeight: isToday ? FontWeight.w500 : FontWeight.normal,
                          ),
                        ),
                        const Text(' · '),
                        Text(
                          '${DateFormat('HH:mm').format(entry.startTime)} - ${DateFormat('HH:mm').format(entry.endTime)}',
                          style: TextStyle(fontSize: 13),
                        ),
                      ],
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        _formatDuration(entry.duration),
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ),
                  ),
                ),
              ).animate(delay: (100 * index).ms)
                .fadeIn(duration: 500.ms)
                .slideY(begin: 20, end: 0, duration: 600.ms, curve: Curves.easeOutQuad);
            },
          ),
      ],
    );
  }
  
  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    return '$hours:${minutes.toString().padLeft(2, '0')}';
  }
  
  // Timer-Steuerungsmethoden
  void _pauseTimer() async {
    if (_activeTimer != null) {
      try {
        await _timeEntryService.pauseTimer(_activeTimer!.id!, _activeTimer!.pauseMinutes);
        await _loadDashboardData();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fehler: $e')),
        );
      }
    }
  }
  
  void _resumeTimer() async {
    if (_activeTimer != null) {
      try {
        await _timeEntryService.resumeTimer(_activeTimer!.id!, _activeTimer!.pauseMinutes);
        await _loadDashboardData();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fehler: $e')),
        );
      }
    }
  }
  
  void _stopTimer() async {
    if (_activeTimer != null) {
      try {
        await _timeEntryService.stopTimer(
          _activeTimer!.id!, 
          DateTime.now(), 
          _activeTimer!.pauseMinutes
        );
        await _loadDashboardData();
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fehler: $e')),
        );
      }
    }
  }

  // Berechnet die Statistiken für heute
  Map<String, dynamic> _calculateTodayStats() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    
    final todayEntries = _timeEntries.where((entry) {
      final entryDate = DateTime(entry.date.year, entry.date.month, entry.date.day);
      return entryDate.isAtSameMomentAs(today);
    }).toList();
    
    final double totalHours = todayEntries.fold(0, (sum, entry) => sum + entry.duration) / 3600;
    final int pauseMinutes = todayEntries.fold(0, (sum, entry) => sum + entry.pauseMinutes);
    
    return {
      'totalHours': totalHours,
      'entriesCount': todayEntries.length,
      'pauseMinutes': pauseMinutes,
    };
  }

  // Bereitet die Daten für das Wochendiagramm vor
  void _prepareWeekChartData(List<TimeEntry> entries) {
    final now = DateTime.now();
    final startOfWeek = now.subtract(Duration(days: now.weekday - 1));
    
    _weekHours = [];
    _weekLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    
    // Initialisiere Wochendaten mit 0
    for (int i = 0; i < 7; i++) {
      _weekHours.add(0);
    }
    
    // Fülle die Daten
    for (var entry in entries) {
      final entryDate = DateTime(entry.date.year, entry.date.month, entry.date.day);
      final startOfEntryWeek = entryDate.subtract(Duration(days: entryDate.weekday - 1));
      
      // Überprüfe, ob der Eintrag aus dieser Woche ist
      if (startOfEntryWeek.isAtSameMomentAs(startOfWeek)) {
        final weekday = entry.date.weekday - 1; // 0 für Montag, 6 für Sonntag
        if (weekday >= 0 && weekday < 7) { // Sicherheitscheck für gültigen Index
          _weekHours[weekday] += entry.duration / 3600; // Sekunden in Stunden umrechnen
        }
      }
    }
  }

  // Berechnet die Statistiken aus den Zeiteinträgen
  Map<String, dynamic> _calculateStatistics(List<TimeEntry> entries) {
    final now = DateTime.now();
    final currentWeekStart = now.subtract(Duration(days: now.weekday - 1));
    final currentMonthStart = DateTime(now.year, now.month, 1);
    
    // Wochenstatistik
    final weekEntries = entries.where((entry) {
      return entry.date.isAfter(currentWeekStart.subtract(Duration(days: 1)));
    }).toList();
    
    final double weekHours = weekEntries.fold(0, (sum, entry) => sum + entry.duration) / 3600;
    
    // Monatsstatistik
    final monthEntries = entries.where((entry) {
      return entry.date.isAfter(currentMonthStart.subtract(Duration(days: 1)));
    }).toList();
    
    final double monthHours = monthEntries.fold(0, (sum, entry) => sum + entry.duration) / 3600;
    
    // Arbeitstage im Monat berechnen
    final Set<String> workDays = {};
    for (var entry in monthEntries) {
      workDays.add(DateFormat('yyyy-MM-dd').format(entry.date));
    }
    
    // Projektstatistik
    final Set<String> projectIds = {};
    for (var entry in entries) {
      if (entry.projectId.isNotEmpty) {
        projectIds.add(entry.projectId);
      }
    }
    
    return {
      'week': {
        'hours': weekHours,
        'entriesCount': weekEntries.length,
      },
      'month': {
        'hours': monthHours,
        'entriesCount': monthEntries.length,
        'workDays': workDays.length,
        'avgPerDay': workDays.isEmpty ? 0 : monthHours / workDays.length,
      },
      'projects': {
        'count': projectIds.length,
      }
    };
  }

  // Sichere Methode, um den maximalen Wert für das Diagramm zu ermitteln
  double _getMaxChartValue() {
    if (_weekHours.isEmpty) {
      return 1.0; // Standardwert, wenn keine Daten vorhanden sind
    }
    
    try {
      final max = _weekHours.reduce((a, b) => math.max(a, b));
      // Wenn max 0 oder NaN ist, gib einen sicheren Wert zurück
      return max <= 0 || max.isNaN ? 1.0 : max;
    } catch (e) {
      // Fallback bei Fehlern
      return 1.0;
    }
  }

  // Dashboard-Daten laden
  Future<void> _loadDashboardData() async {
    setState(() {
      _isLoading = true;
    });

    try {
      // Lade Zeiteinträge und aktiven Timer
      final timeEntries = await _timeEntryService.getTimeEntriesForUser(widget.user.uid);
      final activeTimer = await _timeEntryService.getActiveTimerForUser(widget.user.uid);
      
      // Berechne Statistiken
      final stats = _calculateStatistics(timeEntries);
      
      if (mounted) {
        setState(() {
          _timeEntries = timeEntries;
          _activeTimer = activeTimer;
          _weekStats = stats['week'];
          _monthStats = stats['month'];
          _projectsStats = stats['projects'];
          
          // Daten für Wochenchart aufbereiten
          _prepareWeekChartData(timeEntries);
          
          _isLoading = false;
        });
        
        // AnimationController zurücksetzen und neu starten
        _animationController.reset();
        _animationController.forward();
      }
    } catch (e) {
      print('Fehler beim Laden der Dashboard-Daten: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Fehler beim Laden der Daten')),
        );
      }
    }
  }

  @override
  bool get wantKeepAlive => true;
} 