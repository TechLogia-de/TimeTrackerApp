import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/time/time_entry_model.dart';
import '../../services/time/time_entry_service.dart';

class TimeDetailScreen extends StatefulWidget {
  final TimeEntry timeEntry;
  
  const TimeDetailScreen({
    Key? key,
    required this.timeEntry,
  }) : super(key: key);

  @override
  State<TimeDetailScreen> createState() => _TimeDetailScreenState();
}

class _TimeDetailScreenState extends State<TimeDetailScreen> {
  late TimeEntryService _timeEntryService;
  bool _isLoading = false;
  bool _isSubmitting = false;
  bool _isEditing = false;
  
  // Controller für die Bearbeitung
  late TextEditingController _noteController;
  late DateTime _selectedDate;
  late TimeOfDay _startTime;
  late TimeOfDay _endTime;
  late int _pauseMinutes;
  
  @override
  void initState() {
    super.initState();
    _timeEntryService = TimeEntryService();
    
    // Initialisieren der Controller und Werte
    _noteController = TextEditingController(text: widget.timeEntry.note);
    _selectedDate = widget.timeEntry.date;
    _startTime = TimeOfDay.fromDateTime(widget.timeEntry.startTime);
    _endTime = TimeOfDay.fromDateTime(widget.timeEntry.endTime);
    _pauseMinutes = widget.timeEntry.pauseMinutes;
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }
  
  // Status-Badge erstellen
  Widget _buildStatusBadge(String status) {
    Color color;
    String text;
    IconData icon;
    
    switch (status) {
      case 'running':
        color = Colors.blue;
        text = 'Läuft';
        icon = Icons.play_arrow;
        break;
      case 'paused':
        color = Colors.orange;
        text = 'Pausiert';
        icon = Icons.pause;
        break;
      case 'draft':
        color = Colors.blue;
        text = 'Entwurf';
        icon = Icons.edit_note;
        break;
      case 'pending':
        color = Colors.amber;
        text = 'Genehmigung ausstehend';
        icon = Icons.hourglass_empty;
        break;
      case 'approved':
        color = Colors.green;
        text = 'Genehmigt';
        icon = Icons.verified;
        break;
      case 'rejected':
        color = Colors.red;
        text = 'Abgelehnt';
        icon = Icons.cancel_outlined;
        break;
      default:
        color = Colors.grey;
        text = status;
        icon = Icons.help_outline;
    }
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.2),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.5)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            text,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
  
  // Formatiere Datum
  String _formatDate(DateTime date) {
    return DateFormat('dd.MM.yyyy').format(date);
  }
  
  // Formatiere Zeit
  String _formatTime(TimeOfDay time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
  }
  
  // Formatiere Dauer
  String _formatDuration(int seconds) {
    final hours = seconds ~/ 3600;
    final minutes = (seconds % 3600) ~/ 60;
    
    return '$hours h $minutes min';
  }
  
  // Datum auswählen
  Future<void> _selectDate() async {
    if (_isEditing) {
      final DateTime? picked = await showDatePicker(
        context: context,
        initialDate: _selectedDate,
        firstDate: DateTime(2020),
        lastDate: DateTime.now(),
      );
      
      if (picked != null) {
        setState(() {
          _selectedDate = DateTime(
            picked.year,
            picked.month,
            picked.day,
            _selectedDate.hour,
            _selectedDate.minute,
          );
        });
      }
    }
  }
  
  // Startzeit auswählen
  Future<void> _selectStartTime() async {
    if (_isEditing) {
      final TimeOfDay? picked = await showTimePicker(
        context: context,
        initialTime: _startTime,
      );
      
      if (picked != null) {
        setState(() {
          _startTime = picked;
        });
      }
    }
  }
  
  // Endzeit auswählen
  Future<void> _selectEndTime() async {
    if (_isEditing) {
      final TimeOfDay? picked = await showTimePicker(
        context: context,
        initialTime: _endTime,
      );
      
      if (picked != null) {
        setState(() {
          _endTime = picked;
        });
      }
    }
  }
  
  // Pausendauer anpassen
  void _adjustPauseMinutes(int change) {
    if (_isEditing) {
      setState(() {
        _pauseMinutes = (_pauseMinutes + change).clamp(0, 480); // Max 8 Stunden Pause
      });
    }
  }
  
  // Zeiteintrag aktualisieren
  Future<void> _updateTimeEntry() async {
    if (!_isEditing) return;
    
    setState(() {
      _isLoading = true;
    });
    
    try {
      // Erstellung der DateTime-Objekte aus den ausgewählten Werten
      final startDateTime = DateTime(
        _selectedDate.year,
        _selectedDate.month,
        _selectedDate.day,
        _startTime.hour,
        _startTime.minute,
      );
      
      final endDateTime = DateTime(
        _selectedDate.year,
        _selectedDate.month,
        _selectedDate.day,
        _endTime.hour,
        _endTime.minute,
      );
      
      // Überprüfung, ob die Endzeit vor der Startzeit liegt
      if (endDateTime.isBefore(startDateTime)) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Die Endzeit muss nach der Startzeit liegen.'),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
      
      await _timeEntryService.updateTimeEntry(
        entryId: widget.timeEntry.id!,
        date: _selectedDate,
        startTime: startDateTime,
        endTime: endDateTime,
        pauseMinutes: _pauseMinutes,
        note: _noteController.text,
        customerId: widget.timeEntry.customerId,
        customerName: widget.timeEntry.customerName,
        projectId: widget.timeEntry.projectId,
        projectName: widget.timeEntry.projectName,
      );
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Zeiteintrag erfolgreich aktualisiert'),
          backgroundColor: Colors.green,
        ),
      );
      
      setState(() {
        _isEditing = false;
      });
      
      // Zurück zur vorherigen Seite
      Navigator.pop(context, true);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Aktualisieren: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
  
  // Zeiteintrag zur Genehmigung einreichen
  Future<void> _submitForApproval() async {
    setState(() {
      _isSubmitting = true;
    });
    
    try {
      await _timeEntryService.submitForApproval(widget.timeEntry.id!);
      
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Zeiteintrag zur Genehmigung eingereicht'),
          backgroundColor: Colors.green,
        ),
      );
      
      // Zurück zur vorherigen Seite
      Navigator.pop(context, true);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler beim Einreichen: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      setState(() {
        _isSubmitting = false;
      });
    }
  }
  
  // Zeiteintrag löschen
  Future<void> _deleteTimeEntry() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Zeiteintrag löschen'),
        content: const Text('Möchten Sie diesen Zeiteintrag wirklich löschen?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Abbrechen'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Löschen', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    
    if (confirmed == true) {
      setState(() {
        _isLoading = true;
      });
      
      try {
        await _timeEntryService.deleteTimeEntry(widget.timeEntry.id!);
        
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Zeiteintrag gelöscht'),
            backgroundColor: Colors.green,
          ),
        );
        
        // Zurück zur vorherigen Seite
        Navigator.pop(context, true);
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Fehler beim Löschen: $e'),
            backgroundColor: Colors.red,
          ),
        );
      } finally {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Prüfen, ob der Zeiteintrag zur Genehmigung eingereicht werden kann
    final bool canSubmit = widget.timeEntry.status == 'draft' || widget.timeEntry.status == 'rejected';
    
    // Prüfen, ob der Zeiteintrag bearbeitet werden kann
    final bool canEdit = widget.timeEntry.status == 'draft' || widget.timeEntry.status == 'rejected';
    
    return Scaffold(
      appBar: AppBar(
        title: const Text('Zeiterfassung Details'),
        actions: [
          if (canEdit && !_isEditing)
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () => setState(() => _isEditing = true),
              tooltip: 'Bearbeiten',
            ),
          if (_isEditing)
            IconButton(
              icon: const Icon(Icons.save),
              onPressed: _updateTimeEntry,
              tooltip: 'Speichern',
            ),
          IconButton(
            icon: const Icon(Icons.delete),
            onPressed: _deleteTimeEntry,
            tooltip: 'Löschen',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Status-Badge
                  Center(
                    child: _buildStatusBadge(widget.timeEntry.status),
                  ),
                  const SizedBox(height: 24),
                  
                  // Projekt und Kunde
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Projekt',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          Text(
                            widget.timeEntry.projectName,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 16),
                          const Text(
                            'Kunde',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          Text(
                            widget.timeEntry.customerName,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  
                  // Zeit-Informationen
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Datum
                          GestureDetector(
                            onTap: _selectDate,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Datum',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey,
                                      ),
                                    ),
                                    Text(
                                      _isEditing
                                          ? _formatDate(_selectedDate)
                                          : _formatDate(widget.timeEntry.date),
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: _isEditing ? Colors.blue : null,
                                      ),
                                    ),
                                  ],
                                ),
                                if (_isEditing)
                                  const Icon(Icons.calendar_today, size: 20),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          
                          // Startzeit
                          GestureDetector(
                            onTap: _selectStartTime,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Startzeit',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey,
                                      ),
                                    ),
                                    Text(
                                      _isEditing
                                          ? _formatTime(_startTime)
                                          : DateFormat('HH:mm').format(widget.timeEntry.startTime),
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: _isEditing ? Colors.blue : null,
                                      ),
                                    ),
                                  ],
                                ),
                                if (_isEditing)
                                  const Icon(Icons.access_time, size: 20),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          
                          // Endzeit
                          GestureDetector(
                            onTap: _selectEndTime,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'Endzeit',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey,
                                      ),
                                    ),
                                    Text(
                                      _isEditing
                                          ? _formatTime(_endTime)
                                          : DateFormat('HH:mm').format(widget.timeEntry.endTime),
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        color: _isEditing ? Colors.blue : null,
                                      ),
                                    ),
                                  ],
                                ),
                                if (_isEditing)
                                  const Icon(Icons.access_time, size: 20),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          
                          // Pausenzeit
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Pause',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey,
                                    ),
                                  ),
                                  Text(
                                    _isEditing
                                        ? '$_pauseMinutes Minuten'
                                        : '${widget.timeEntry.pauseMinutes} Minuten',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: _isEditing ? Colors.blue : null,
                                    ),
                                  ),
                                ],
                              ),
                              if (_isEditing)
                                Row(
                                  children: [
                                    IconButton(
                                      icon: const Icon(Icons.remove_circle_outline),
                                      onPressed: () => _adjustPauseMinutes(-5),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.add_circle_outline),
                                      onPressed: () => _adjustPauseMinutes(5),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          
                          // Gesamtdauer
                          Row(
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Gesamtdauer',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Colors.grey,
                                    ),
                                  ),
                                  Text(
                                    _formatDuration(widget.timeEntry.duration),
                                    style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.green,
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
                  const SizedBox(height: 16),
                  
                  // Notizen
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Notizen',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _isEditing
                              ? TextField(
                                  controller: _noteController,
                                  decoration: const InputDecoration(
                                    border: OutlineInputBorder(),
                                    hintText: 'Notizen eingeben...',
                                  ),
                                  maxLines: 3,
                                )
                              : Text(
                                  widget.timeEntry.note.isEmpty
                                      ? 'Keine Notizen'
                                      : widget.timeEntry.note,
                                  style: const TextStyle(fontSize: 16),
                                ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  
                  // Aktionsbuttons
                  if (canSubmit && !_isEditing)
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _isSubmitting ? null : _submitForApproval,
                        icon: _isSubmitting
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send),
                        label: Text(_isSubmitting
                            ? 'Wird eingereicht...'
                            : 'Zur Genehmigung einreichen'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.blue,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  
                  if (_isEditing)
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => setState(() => _isEditing = false),
                            child: const Text('Abbrechen'),
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: _updateTimeEntry,
                            child: const Text('Speichern'),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ),
    );
  }
} 