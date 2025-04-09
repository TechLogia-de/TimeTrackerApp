import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/absence_model.dart';
import '../providers/auth_provider.dart';
import '../services/absence_service.dart';
import '../widgets/absence_form.dart';
import '../utils/app_colors.dart';

class AvailabilityScreen extends StatefulWidget {
  const AvailabilityScreen({Key? key}) : super(key: key);

  @override
  _AvailabilityScreenState createState() => _AvailabilityScreenState();
}

class _AvailabilityScreenState extends State<AvailabilityScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  List<Absence> _absences = [];
  AbsenceBalance? _currentBalance;
  AbsenceBalance? _nextYearBalance;
  bool _showForm = false;
  Absence? _absenceToEdit;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final userId = authProvider.currentUser?.uid;
      
      if (userId != null) {
        // Abwesenheiten laden
        final absences = await AbsenceService.getUserAbsences(userId);
        
        // Urlaubskonten laden
        final currentYear = DateTime.now().year;
        final currentBalance = await AbsenceService.getAbsenceBalance(userId, currentYear);
        final nextYearBalance = await AbsenceService.getAbsenceBalance(userId, currentYear + 1);
        
        setState(() {
          _absences = absences;
          _currentBalance = currentBalance;
          _nextYearBalance = nextYearBalance;
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      _showErrorSnackbar('Fehler beim Laden der Daten: $e');
    }
  }

  void _showErrorSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
      ),
    );
  }

  void _showSuccessSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
      ),
    );
  }

  void _createNewAbsence() {
    setState(() {
      _showForm = true;
      _absenceToEdit = null;
    });
  }

  void _editAbsence(Absence absence) {
    setState(() {
      _showForm = true;
      _absenceToEdit = absence;
    });
  }

  void _cancelForm() {
    setState(() {
      _showForm = false;
      _absenceToEdit = null;
    });
  }

  Future<void> _deleteAbsence(Absence absence) async {
    final bool confirmed = await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Abwesenheit löschen'),
        content: const Text('Möchten Sie diese Abwesenheit wirklich löschen?'),
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

    if (confirmed) {
      try {
        await AbsenceService.deleteAbsence(absence.id!);
        _showSuccessSnackbar('Abwesenheit erfolgreich gelöscht');
        _loadData();
      } catch (e) {
        _showErrorSnackbar('Fehler beim Löschen der Abwesenheit: $e');
      }
    }
  }

  Future<void> _cancelAbsence(Absence absence) async {
    final TextEditingController reasonController = TextEditingController();
    
    final bool confirmed = await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Abwesenheit stornieren'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Möchten Sie diese Abwesenheit wirklich stornieren?'),
            const SizedBox(height: 16),
            TextField(
              controller: reasonController,
              decoration: const InputDecoration(
                labelText: 'Grund (optional)',
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Stornieren'),
          ),
        ],
      ),
    ) ?? false;

    if (confirmed) {
      try {
        await AbsenceService.cancelAbsence(
          absenceId: absence.id!,
          cancellationReason: reasonController.text.isNotEmpty ? reasonController.text : null,
        );
        _showSuccessSnackbar('Abwesenheit erfolgreich storniert');
        _loadData();
      } catch (e) {
        _showErrorSnackbar('Fehler beim Stornieren der Abwesenheit: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_showForm) {
      return AbsenceForm(
        absence: _absenceToEdit,
        onSaved: () {
          setState(() {
            _showForm = false;
            _absenceToEdit = null;
          });
          _loadData();
          _showSuccessSnackbar(_absenceToEdit != null
              ? 'Abwesenheit erfolgreich aktualisiert'
              : 'Abwesenheit erfolgreich erstellt');
        },
        onCancel: _cancelForm,
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Meine Verfügbarkeit'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
            tooltip: 'Aktualisieren',
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Aktuelle'),
            Tab(text: 'Anträge'),
            Tab(text: 'Archiv'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                _buildBalanceCards(),
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildCurrentAbsencesList(),
                      _buildPendingAbsencesList(),
                      _buildPastAbsencesList(),
                    ],
                  ),
                ),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _createNewAbsence,
        child: const Icon(Icons.add),
        tooltip: 'Neue Abwesenheit',
      ),
    );
  }

  Widget _buildBalanceCards() {
    final currentYear = DateTime.now().year;
    
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _buildBalanceCard(
              title: 'Übersicht $currentYear',
              icon: Icons.calendar_today,
              iconColor: AppColors.primary,
              balance: _currentBalance,
            ),
            const SizedBox(width: 12),
            _buildUsageCard(_currentBalance),
            const SizedBox(width: 12),
            _buildBalanceCard(
              title: 'Planung ${currentYear + 1}',
              icon: Icons.calendar_month,
              iconColor: Colors.blue,
              balance: _nextYearBalance,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBalanceCard({
    required String title,
    required IconData icon,
    required Color iconColor,
    required AbsenceBalance? balance,
  }) {
    return Card(
      elevation: 2,
      child: Container(
        width: 180,
        padding: const EdgeInsets.all(12),
        child: balance == null
            ? const Center(
                child: Text('Kein Urlaubskonto gefunden.'),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Icon(icon, color: iconColor, size: 16),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _buildInfoRow('Gesamt:', '${balance.totalDays} Tage'),
                  const SizedBox(height: 6),
                  _buildInfoRow('Verbleibend:', '${balance.remainingDays} T',
                      highlight: balance.remainingDays < 5),
                  const SizedBox(height: 6),
                  LinearProgressIndicator(
                    value: _calculateProgress(balance),
                    backgroundColor: Colors.grey[200],
                    valueColor: AlwaysStoppedAnimation<Color>(
                      _calculateProgress(balance) > 0.9
                          ? Colors.orange
                          : AppColors.primary,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  Widget _buildUsageCard(AbsenceBalance? balance) {
    if (balance == null) {
      return const SizedBox.shrink();
    }

    return Card(
      elevation: 2,
      child: Container(
        width: 180,
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(Icons.check_circle_outline, color: Colors.green[700], size: 16),
                const SizedBox(width: 4),
                const Flexible(
                  child: Text(
                    'Übersicht',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _buildInfoRowWithIcon(
              Icons.check_circle, 
              'Genommen:', 
              '${balance.usedDays} T',
              iconColor: Colors.green[700]!,
            ),
            const SizedBox(height: 6),
            _buildInfoRowWithIcon(
              Icons.pending_actions, 
              'Beantragt:', 
              '${balance.pendingDays} T',
              iconColor: Colors.amber[700]!,
              trailing: balance.pendingDays > 0
                  ? Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.amber[50],
                        borderRadius: BorderRadius.circular(2),
                        border: Border.all(color: Colors.amber[200]!),
                      ),
                      child: const Text(
                        'Offen',
                        style: TextStyle(fontSize: 9),
                      ),
                    )
                  : null,
            ),
            const SizedBox(height: 6),
            _buildInfoRowWithIcon(
              Icons.history, 
              'Übertrag:', 
              '${balance.carryOverDays ?? 0} T',
              iconColor: Colors.blue[700]!,
            ),
            const SizedBox(height: 6),
            _buildInfoRowWithIcon(
              Icons.healing, 
              'Krank:', 
              '${balance.sickDays ?? 0} T',
              iconColor: Colors.red[700]!,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(String label, String value,
      {bool highlight = false, Widget? trailing}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Flexible(
          flex: 3,
          child: Text(
            label, 
            style: TextStyle(fontSize: 12, color: Colors.grey[700]),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        Flexible(
          flex: 2,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Flexible(
                child: Text(
                  value,
                  style: TextStyle(
                    fontWeight: highlight ? FontWeight.bold : FontWeight.normal,
                    color: highlight ? Colors.orange[800] : null,
                    fontSize: highlight ? 13 : 12,
                  ),
                  textAlign: TextAlign.right,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 2), trailing],
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInfoRowWithIcon(
    IconData iconData,
    String label,
    String value, {
    required Color iconColor,
    bool highlight = false,
    Widget? trailing,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.start,
      children: [
        Icon(iconData, size: 12, color: iconColor),
        const SizedBox(width: 4),
        Flexible(
          flex: 3,
          child: Text(
            label, 
            style: TextStyle(fontSize: 11, color: Colors.grey[700]),
            overflow: TextOverflow.ellipsis,
          ),
        ),
        Flexible(
          flex: 2,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Flexible(
                child: Text(
                  value,
                  style: TextStyle(
                    fontWeight: highlight ? FontWeight.bold : FontWeight.normal,
                    color: highlight ? Colors.orange[800] : null,
                    fontSize: highlight ? 12 : 11,
                  ),
                  textAlign: TextAlign.right,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 2), trailing],
            ],
          ),
        ),
      ],
    );
  }

  double _calculateProgress(AbsenceBalance balance) {
    final total = balance.totalDays + (balance.carryOverDays ?? 0);
    if (total == 0) return 0.0;
    
    final used = balance.usedDays + balance.pendingDays;
    return (used / total).clamp(0.0, 1.0);
  }

  Widget _buildCurrentAbsencesList() {
    final currentAbsences = _absences.where((absence) {
      final now = DateTime.now();
      final isEnded = absence.endDate.isBefore(now);
      final isActiveStatus = absence.status == AbsenceStatus.APPROVED || 
                             absence.status == AbsenceStatus.PENDING;
      return !isEnded && isActiveStatus;
    }).toList();

    if (currentAbsences.isEmpty) {
      return _buildEmptyState(
        icon: Icons.calendar_today,
        message: 'Keine aktuellen Abwesenheiten geplant.',
      );
    }

    return _buildAbsencesList(currentAbsences);
  }

  Widget _buildPendingAbsencesList() {
    final pendingAbsences = _absences
        .where((absence) => absence.status == AbsenceStatus.PENDING)
        .toList();

    if (pendingAbsences.isEmpty) {
      return _buildEmptyState(
        icon: Icons.check_circle_outline,
        message: 'Keine ausstehenden Anträge vorhanden.',
      );
    }

    // Infobox für ausstehende Anträge
    return Column(
      children: [
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.amber[50],
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: Colors.amber[200]!),
          ),
          child: Row(
            children: [
              Icon(Icons.access_time, color: Colors.amber[800], size: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Ausstehende Anträge',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.amber[800],
                      ),
                    ),
                    Text(
                      'Sie haben ${pendingAbsences.length} Anträge, die auf Genehmigung warten.',
                      style: TextStyle(color: Colors.amber[900]),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(child: _buildAbsencesList(pendingAbsences)),
      ],
    );
  }

  Widget _buildPastAbsencesList() {
    final pastAbsences = _absences.where((absence) {
      final now = DateTime.now();
      final isEnded = absence.endDate.isBefore(now);
      final isCancelledOrRejected = absence.status == AbsenceStatus.REJECTED || 
                                   absence.status == AbsenceStatus.CANCELLED;
      return isEnded || isCancelledOrRejected;
    }).toList();

    if (pastAbsences.isEmpty) {
      return _buildEmptyState(
        icon: Icons.history,
        message: 'Keine vergangenen Abwesenheiten gefunden.',
      );
    }

    return _buildAbsencesList(pastAbsences);
  }

  Widget _buildEmptyState({required IconData icon, required String message}) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            message,
            style: TextStyle(color: Colors.grey[600]),
          ),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            onPressed: _createNewAbsence,
            icon: const Icon(Icons.add),
            label: const Text('Neue Abwesenheit planen'),
          ),
        ],
      ),
    );
  }

  Widget _buildAbsencesList(List<Absence> absences) {
    final dateFormat = DateFormat('dd.MM.yyyy');

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: absences.length,
      itemBuilder: (context, index) {
        final absence = absences[index];
        
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: Padding(
            padding: const EdgeInsets.all(12.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _buildAbsenceTypeIcon(absence.type),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _getAbsenceTypeLabel(absence.type),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    _buildStatusBadge(absence.status),
                  ],
                ),
                const Divider(),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Zeitraum',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          Text(
                            '${dateFormat.format(absence.startDate)}${absence.halfDayStart ? ' (½)' : ''} - '
                            '${dateFormat.format(absence.endDate)}${absence.halfDayEnd ? ' (½)' : ''}',
                            style: const TextStyle(
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Dauer',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          Text(
                            '${absence.daysCount} ${absence.daysCount == 1 ? 'Tag' : 'Tage'}',
                            style: const TextStyle(
                              fontSize: 15,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (absence.reason != null && absence.reason!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Text(
                    'Grund',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey,
                    ),
                  ),
                  Text(
                    absence.reason!,
                    style: const TextStyle(fontSize: 15),
                  ),
                ],
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    // Bearbeiten-Button (nur für ausstehende/genehmigte Anträge)
                    if (absence.status == AbsenceStatus.PENDING ||
                        absence.status == AbsenceStatus.APPROVED) ...[
                      TextButton.icon(
                        onPressed: () => _editAbsence(absence),
                        icon: const Icon(Icons.edit, size: 18),
                        label: const Text('Bearbeiten'),
                      ),
                      const SizedBox(width: 8),
                    ],
                    
                    // Stornieren-Button (nur für ausstehende/genehmigte Anträge)
                    if (absence.status == AbsenceStatus.PENDING ||
                        absence.status == AbsenceStatus.APPROVED) ...[
                      TextButton.icon(
                        onPressed: () => _cancelAbsence(absence),
                        icon: const Icon(Icons.cancel_outlined, size: 18),
                        label: const Text('Stornieren'),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.red,
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                    
                    // Löschen-Button (nur für eigene Anträge)
                    IconButton(
                      onPressed: () => _deleteAbsence(absence),
                      icon: const Icon(Icons.delete_outline),
                      tooltip: 'Löschen',
                      color: Colors.red,
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildAbsenceTypeIcon(AbsenceType type) {
    switch (type) {
      case AbsenceType.VACATION:
        return Icon(Icons.beach_access, color: Colors.blue[600]);
      case AbsenceType.SICK:
        return Icon(Icons.healing, color: Colors.red[600]);
      case AbsenceType.SPECIAL:
        return Icon(Icons.card_giftcard, color: Colors.purple[600]);
      case AbsenceType.REMOTE:
        return Icon(Icons.home_work, color: Colors.green[600]);
      case AbsenceType.OTHER:
        return Icon(Icons.event_note, color: Colors.orange[600]);
      default:
        return Icon(Icons.help_outline, color: Colors.grey[600]);
    }
  }

  Widget _buildStatusBadge(AbsenceStatus status) {
    Color backgroundColor;
    Color textColor;
    String label;
    IconData iconData;

    switch (status) {
      case AbsenceStatus.APPROVED:
        backgroundColor = Colors.green[100]!;
        textColor = Colors.green[800]!;
        label = 'OK';
        iconData = Icons.check;
        break;
      case AbsenceStatus.PENDING:
        backgroundColor = Colors.amber[100]!;
        textColor = Colors.amber[800]!;
        label = 'Offen';
        iconData = Icons.schedule;
        break;
      case AbsenceStatus.REJECTED:
        backgroundColor = Colors.red[100]!;
        textColor = Colors.red[800]!;
        label = 'Abgelehnt';
        iconData = Icons.close;
        break;
      case AbsenceStatus.CANCELLED:
        backgroundColor = Colors.grey[200]!;
        textColor = Colors.grey[800]!;
        label = 'Storniert';
        iconData = Icons.cancel_outlined;
        break;
      default:
        backgroundColor = Colors.grey[200]!;
        textColor = Colors.grey[800]!;
        label = '?';
        iconData = Icons.help_outline;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(iconData, size: 10, color: textColor),
          const SizedBox(width: 2),
          Text(
            label,
            style: TextStyle(
              color: textColor,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  String _getAbsenceTypeLabel(AbsenceType type) {
    switch (type) {
      case AbsenceType.VACATION:
        return 'Urlaub';
      case AbsenceType.SICK:
        return 'Krankheit';
      case AbsenceType.SPECIAL:
        return 'Sonderurlaub';
      case AbsenceType.REMOTE:
        return 'Homeoffice';
      case AbsenceType.OTHER:
        return 'Sonstiges';
      default:
        return 'Unbekannt';
    }
  }
} 