import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../models/time/time_entry_model.dart';
import '../../services/time/time_entry_service.dart';
import '../../widgets/app_loading_indicator.dart';

class TimeApprovalScreen extends StatefulWidget {
  const TimeApprovalScreen({Key? key}) : super(key: key);

  @override
  State<TimeApprovalScreen> createState() => _TimeApprovalScreenState();
}

class _TimeApprovalScreenState extends State<TimeApprovalScreen> with SingleTickerProviderStateMixin {
  final TimeEntryService _timeEntryService = TimeEntryService();
  final FirebaseAuth _auth = FirebaseAuth.instance;
  late TabController _tabController;
  
  List<TimeEntry> _timeEntries = [];
  List<String> _selectedEntries = [];
  bool _isLoading = true;
  bool _isProcessing = false;
  
  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(_handleTabChange);
    _loadTimeEntries();
  }
  
  @override
  void dispose() {
    _tabController.removeListener(_handleTabChange);
    _tabController.dispose();
    super.dispose();
  }
  
  void _handleTabChange() {
    if (_tabController.indexIsChanging) {
      return;
    }
    
    setState(() {
      _selectedEntries = [];
    });
    
    _loadTimeEntries();
  }
  
  Future<void> _loadTimeEntries() async {
    setState(() {
      _isLoading = true;
    });
    
    try {
      final User? user = _auth.currentUser;
      if (user == null) {
        throw Exception('Kein Benutzer angemeldet');
      }
      
      List<TimeEntry> entries = [];
      
      // Tab-abhängige Daten laden
      if (_tabController.index == 0) {
        // Ausstehende Genehmigungen
        entries = await _timeEntryService.getTimeEntriesToApprove(user.uid);
      } else {
        // Alle Zeiteinträge
        entries = await _timeEntryService.getAllTimeEntries(user.uid);
      }
      
      setState(() {
        _timeEntries = entries;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Laden der Zeiteinträge: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
  
  Future<void> _approveTimeEntry(String entryId) async {
    setState(() {
      _isProcessing = true;
    });
    
    try {
      final User? user = _auth.currentUser;
      if (user == null) {
        throw Exception('Kein Benutzer angemeldet');
      }
      
      await _timeEntryService.approveTimeEntry(entryId, user.uid);
      
      // Daten aktualisieren
      await _loadTimeEntries();
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Zeiteintrag genehmigt'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler bei der Genehmigung: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }
  
  Future<void> _rejectTimeEntry(String entryId) async {
    setState(() {
      _isProcessing = true;
    });
    
    try {
      final User? user = _auth.currentUser;
      if (user == null) {
        throw Exception('Kein Benutzer angemeldet');
      }
      
      await _timeEntryService.rejectTimeEntry(entryId, user.uid);
      
      // Daten aktualisieren
      await _loadTimeEntries();
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Zeiteintrag abgelehnt'),
          backgroundColor: Colors.orange,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler bei der Ablehnung: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }
  
  Future<void> _approveSelectedEntries() async {
    if (_selectedEntries.isEmpty) return;
    
    setState(() {
      _isProcessing = true;
    });
    
    try {
      final User? user = _auth.currentUser;
      if (user == null) {
        throw Exception('Kein Benutzer angemeldet');
      }
      
      // Alle ausgewählten Einträge genehmigen
      for (String entryId in _selectedEntries) {
        await _timeEntryService.approveTimeEntry(entryId, user.uid);
      }
      
      // Auswahl zurücksetzen und Daten aktualisieren
      setState(() {
        _selectedEntries = [];
      });
      
      await _loadTimeEntries();
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${_selectedEntries.length} Zeiteinträge genehmigt'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler bei der Massengenehmigung: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }
  
  Future<void> _rejectSelectedEntries() async {
    if (_selectedEntries.isEmpty) return;
    
    setState(() {
      _isProcessing = true;
    });
    
    try {
      final User? user = _auth.currentUser;
      if (user == null) {
        throw Exception('Kein Benutzer angemeldet');
      }
      
      // Alle ausgewählten Einträge ablehnen
      for (String entryId in _selectedEntries) {
        await _timeEntryService.rejectTimeEntry(entryId, user.uid);
      }
      
      // Auswahl zurücksetzen und Daten aktualisieren
      setState(() {
        _selectedEntries = [];
      });
      
      await _loadTimeEntries();
      
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${_selectedEntries.length} Zeiteinträge abgelehnt'),
          backgroundColor: Colors.orange,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler bei der Massenablehnung: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isProcessing = false;
      });
    }
  }
  
  void _toggleEntrySelection(String entryId) {
    setState(() {
      if (_selectedEntries.contains(entryId)) {
        _selectedEntries.remove(entryId);
      } else {
        _selectedEntries.add(entryId);
      }
    });
  }
  
  void _toggleSelectAll() {
    setState(() {
      if (_selectedEntries.length == _timeEntries.length) {
        // Alles abwählen
        _selectedEntries = [];
      } else {
        // Alles auswählen
        _selectedEntries = _timeEntries.map((e) => e.id!).toList();
      }
    });
  }
  
  // Erstellt ein Badge für den Status
  Widget _buildStatusBadge(String status) {
    Color color;
    String text;
    IconData icon;
    
    switch (status) {
      case 'pending':
        color = Colors.amber;
        text = 'Ausstehend';
        icon = Icons.hourglass_empty;
        break;
      case 'approved':
        color = Colors.green;
        text = 'Genehmigt';
        icon = Icons.check_circle;
        break;
      case 'rejected':
        color = Colors.red;
        text = 'Abgelehnt';
        icon = Icons.cancel;
        break;
      case 'draft':
        color = Colors.blue;
        text = 'Entwurf';
        icon = Icons.edit_note;
        break;
      default:
        color = Colors.grey;
        text = status;
        icon = Icons.help_outline;
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 12,
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
  
  String _formatDate(DateTime date) {
    return DateFormat('dd.MM.yyyy').format(date);
  }
  
  String _formatTime(DateTime time) {
    return DateFormat('HH:mm').format(time);
  }
  
  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    
    return '$hours h $minutes min';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Zeitgenehmigung'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Ausstehend'),
            Tab(text: 'Alle'),
          ],
        ),
      ),
      body: _isLoading
          ? const AppLoadingIndicator(message: 'Zeiteinträge werden geladen...')
          : TabBarView(
              controller: _tabController,
              children: [
                // Tab 1: Ausstehende Genehmigungen
                _buildTimeEntriesList(
                    _timeEntries.where((e) => e.status == 'pending').toList()),
                
                // Tab 2: Alle Zeiteinträge
                _buildTimeEntriesList(_timeEntries),
              ],
            ),
    );
  }
  
  Widget _buildTimeEntriesList(List<TimeEntry> entries) {
    if (entries.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.check_circle_outline,
              size: 64,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              'Keine Zeiteinträge vorhanden',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey.shade700,
              ),
            ),
          ],
        ),
      );
    }
    
    final hasSelectedEntries = _selectedEntries.isNotEmpty;
    final hasAnyPendingEntries = entries.any((e) => e.status == 'pending');
    
    return Column(
      children: [
        // Aktionen für mehrere ausgewählte Einträge
        if (hasAnyPendingEntries)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                TextButton.icon(
                  onPressed: () => _toggleSelectAll(),
                  icon: Icon(
                    _selectedEntries.length == entries.length
                        ? Icons.check_box
                        : Icons.check_box_outline_blank,
                  ),
                  label: Text(
                    _selectedEntries.length == entries.length
                        ? 'Alle abwählen'
                        : 'Alle auswählen',
                  ),
                ),
                const Spacer(),
                if (hasSelectedEntries) ...[
                  Text(
                    '${_selectedEntries.length} ausgewählt',
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    onPressed: _isProcessing ? null : _approveSelectedEntries,
                    icon: const Icon(Icons.check_circle, color: Colors.green),
                    label: const Text(
                      'Genehmigen',
                      style: TextStyle(color: Colors.green),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _isProcessing ? null : _rejectSelectedEntries,
                    icon: const Icon(Icons.cancel, color: Colors.red),
                    label: const Text(
                      'Ablehnen',
                      style: TextStyle(color: Colors.red),
                    ),
                  ),
                ],
              ],
            ),
          ),
        
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: entries.length,
            itemBuilder: (context, index) {
              final entry = entries[index];
              final isSelected = _selectedEntries.contains(entry.id);
              final isPending = entry.status == 'pending';
              
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () {
                    if (isPending) {
                      _toggleEntrySelection(entry.id!);
                    }
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if (isPending)
                              Checkbox(
                                value: isSelected,
                                onChanged: (value) {
                                  _toggleEntrySelection(entry.id!);
                                },
                              ),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        entry.userName,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      _buildStatusBadge(entry.status),
                                    ],
                                  ),
                                  Text(
                                    '${entry.projectName} - ${entry.customerName}',
                                    style: TextStyle(
                                      color: Colors.grey.shade700,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  _formatDuration(entry.duration),
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: Theme.of(context).primaryColor,
                                  ),
                                ),
                                if (entry.pauseMinutes > 0)
                                  Text(
                                    'Pause: ${entry.pauseMinutes} min',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey.shade600,
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Padding(
                          padding: EdgeInsets.only(left: isPending ? 40 : 0),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.calendar_today,
                                size: 14,
                                color: Colors.grey,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '${_formatDate(entry.date)} | ${_formatTime(entry.startTime)} - ${_formatTime(entry.endTime)}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey.shade700,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (entry.note.isNotEmpty)
                          Padding(
                            padding: EdgeInsets.only(left: isPending ? 40 : 0, top: 4),
                            child: Text(
                              entry.note,
                              style: TextStyle(
                                fontSize: 13,
                                fontStyle: FontStyle.italic,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ),
                        if (isPending)
                          Padding(
                            padding: const EdgeInsets.only(left: 40, top: 8),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                OutlinedButton.icon(
                                  onPressed: _isProcessing
                                      ? null
                                      : () => _rejectTimeEntry(entry.id!),
                                  icon: const Icon(
                                    Icons.cancel_outlined,
                                    size: 16,
                                    color: Colors.red,
                                  ),
                                  label: const Text(
                                    'Ablehnen',
                                    style: TextStyle(color: Colors.red),
                                  ),
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 0,
                                    ),
                                    visualDensity: VisualDensity.compact,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                ElevatedButton.icon(
                                  onPressed: _isProcessing
                                      ? null
                                      : () => _approveTimeEntry(entry.id!),
                                  icon: const Icon(
                                    Icons.check_circle_outline,
                                    size: 16,
                                  ),
                                  label: const Text('Genehmigen'),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: Colors.green,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 0,
                                    ),
                                    visualDensity: VisualDensity.compact,
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
      ],
    );
  }
} 