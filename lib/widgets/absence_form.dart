import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/absence_model.dart';
import '../providers/auth_provider.dart';
import '../services/absence_service.dart';
import '../utils/app_colors.dart';

class AbsenceForm extends StatefulWidget {
  final Absence? absence;
  final VoidCallback onSaved;
  final VoidCallback onCancel;

  const AbsenceForm({
    Key? key,
    this.absence,
    required this.onSaved,
    required this.onCancel,
  }) : super(key: key);

  @override
  _AbsenceFormState createState() => _AbsenceFormState();
}

class _AbsenceFormState extends State<AbsenceForm> {
  final _formKey = GlobalKey<FormState>();
  late AbsenceType _selectedType;
  late DateTime _startDate;
  late DateTime _endDate;
  late bool _halfDayStart;
  late bool _halfDayEnd;
  late TextEditingController _reasonController;
  late TextEditingController _notesController;
  
  bool _isLoading = false;
  double _workDays = 0.0;
  
  @override
  void initState() {
    super.initState();
    
    // Initialisieren mit Standardwerten oder Werten aus vorhandener Abwesenheit
    _selectedType = widget.absence?.type ?? AbsenceType.VACATION;
    _startDate = widget.absence?.startDate ?? DateTime.now();
    _endDate = widget.absence?.endDate ?? DateTime.now();
    _halfDayStart = widget.absence?.halfDayStart ?? false;
    _halfDayEnd = widget.absence?.halfDayEnd ?? false;
    _reasonController = TextEditingController(text: widget.absence?.reason ?? '');
    _notesController = TextEditingController(text: widget.absence?.notes ?? '');
    
    // Arbeitstage berechnen
    _calculateWorkDays();
  }

  @override
  void dispose() {
    _reasonController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _calculateWorkDays() {
    setState(() {
      _workDays = AbsenceService.calculateWorkdays(
        _startDate, 
        _endDate, 
        _halfDayStart, 
        _halfDayEnd
      );
    });
  }

  Future<void> _saveAbsence() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final authProvider = Provider.of<AuthProvider>(context, listen: false);
      final userId = authProvider.currentUser?.uid;
      final userName = authProvider.currentUser?.displayName ?? 'Unbekannter Benutzer';
      final userEmail = authProvider.currentUser?.email;
      
      if (userId == null) {
        throw Exception('Benutzer nicht angemeldet');
      }

      if (widget.absence != null) {
        // Bestehende Abwesenheit aktualisieren
        await AbsenceService.updateAbsence(
          absenceId: widget.absence!.id!,
          type: _selectedType,
          startDate: _startDate,
          endDate: _endDate,
          halfDayStart: _halfDayStart,
          halfDayEnd: _halfDayEnd,
          reason: _reasonController.text.isNotEmpty ? _reasonController.text : null,
          notes: _notesController.text.isNotEmpty ? _notesController.text : null,
        );
      } else {
        // Neue Abwesenheit erstellen
        await AbsenceService.createAbsence(
          type: _selectedType,
          startDate: _startDate,
          endDate: _endDate,
          halfDayStart: _halfDayStart,
          halfDayEnd: _halfDayEnd,
          reason: _reasonController.text.isNotEmpty ? _reasonController.text : null,
          notes: _notesController.text.isNotEmpty ? _notesController.text : null,
          userId: userId,
          userName: userName,
          userEmail: userEmail,
        );
      }

      widget.onSaved();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Fehler: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _selectDate(bool isStartDate) async {
    final DateTime initialDate = isStartDate ? _startDate : _endDate;
    final DateTime firstDate = isStartDate 
        ? DateTime.now() 
        : _startDate;
    
    final DateTime? selectedDate = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: firstDate,
      lastDate: DateTime(DateTime.now().year + 2),
      locale: const Locale('de', 'DE'),
    );

    if (selectedDate != null) {
      setState(() {
        if (isStartDate) {
          _startDate = selectedDate;
          // Wenn Enddatum vor neuem Startdatum liegt, setze Enddatum auf Startdatum
          if (_endDate.isBefore(_startDate)) {
            _endDate = _startDate;
          }
        } else {
          _endDate = selectedDate;
        }
        _calculateWorkDays();
      });
    }
  }

  String _getTypeDescription(AbsenceType type) {
    switch (type) {
      case AbsenceType.VACATION:
        return 'Urlaub wird vom Urlaubskonto abgebucht';
      case AbsenceType.SICK:
        return 'Krankheit (mit ärztlicher Bescheinigung)';
      case AbsenceType.SPECIAL:
        return 'Sonderurlaub (z.B. Hochzeit, Geburt, Todesfall)';
      case AbsenceType.REMOTE:
        return 'Homeoffice / Remote-Arbeit';
      case AbsenceType.OTHER:
        return 'Sonstige Abwesenheit';
      default:
        return 'Sonstige Abwesenheit';
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('dd.MM.yyyy');
    
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.absence != null 
            ? 'Abwesenheitsantrag bearbeiten' 
            : 'Neuen Abwesenheitsantrag stellen'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onCancel,
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Abwesenheitstyp
                    const Text(
                      'Abwesenheitstyp',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<AbsenceType>(
                      value: _selectedType,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                      ),
                      items: AbsenceType.values.map((type) {
                        return DropdownMenuItem<AbsenceType>(
                          value: type,
                          child: Text(_getTypeLabel(type)),
                        );
                      }).toList(),
                      onChanged: (value) {
                        if (value != null) {
                          setState(() {
                            _selectedType = value;
                          });
                        }
                      },
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _getTypeDescription(_selectedType),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Zeitraum
                    const Text(
                      'Zeitraum',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 16),
                    
                    // Startdatum und Enddatum
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Startdatum'),
                              const SizedBox(height: 8),
                              InkWell(
                                onTap: () => _selectDate(true),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12, 
                                    vertical: 16,
                                  ),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: Colors.grey[400]!),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(dateFormat.format(_startDate)),
                                      const Icon(Icons.calendar_today, size: 18),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Enddatum'),
                              const SizedBox(height: 8),
                              InkWell(
                                onTap: () => _selectDate(false),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 12, 
                                    vertical: 16,
                                  ),
                                  decoration: BoxDecoration(
                                    border: Border.all(color: Colors.grey[400]!),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(dateFormat.format(_endDate)),
                                      const Icon(Icons.calendar_today, size: 18),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Halbe Tage
                    const Text(
                      'Halbe Tage',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Column(
                      children: [
                        CheckboxListTile(
                          title: const Text('Halber erster Tag'),
                          subtitle: const Text('Nur halber Tag am Startdatum'),
                          value: _halfDayStart,
                          onChanged: (value) {
                            setState(() {
                              _halfDayStart = value ?? false;
                              _calculateWorkDays();
                            });
                          },
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        ),
                        CheckboxListTile(
                          title: const Text('Halber letzter Tag'),
                          subtitle: const Text('Nur halber Tag am Enddatum'),
                          value: _halfDayEnd,
                          onChanged: (value) {
                            setState(() {
                              _halfDayEnd = value ?? false;
                              _calculateWorkDays();
                            });
                          },
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Arbeitstage-Anzeige
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.grey[100],
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.calendar_month, color: AppColors.primary),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Arbeitstage:',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                Text(
                                  '$_workDays ${_workDays == 1.0 ? 'Tag' : 'Tage'}',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.primary,
                                  ),
                                ),
                                const Text(
                                  'Wochenenden werden automatisch ausgeschlossen',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Grund
                    const Text(
                      'Grund der Abwesenheit',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: _reasonController,
                      decoration: const InputDecoration(
                        hintText: 'Grund (optional)',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Geben Sie einen kurzen Grund für Ihre Abwesenheit an',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Notizen
                    const Text(
                      'Notizen',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: _notesController,
                      decoration: const InputDecoration(
                        hintText: 'Weitere Informationen (optional)',
                        border: OutlineInputBorder(),
                      ),
                      maxLines: 3,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Hinweise zur besseren Einordnung Ihrer Abwesenheit',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 32),

                    // Buttons
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        OutlinedButton(
                          onPressed: widget.onCancel,
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 12,
                            ),
                          ),
                          child: const Text('Abbrechen'),
                        ),
                        ElevatedButton(
                          onPressed: _saveAbsence,
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 24,
                              vertical: 12,
                            ),
                          ),
                          child: Text(
                            widget.absence != null ? 'Aktualisieren' : 'Absenden',
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
    );
  }

  String _getTypeLabel(AbsenceType type) {
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