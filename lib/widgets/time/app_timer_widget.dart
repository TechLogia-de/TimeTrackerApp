import 'dart:async';
import 'package:flutter/material.dart';
import '../../models/time/time_entry_model.dart';
import '../../services/time/time_entry_service.dart';

class AppTimerWidget extends StatefulWidget {
  final TimeEntry? activeTimer;
  final VoidCallback? onStopPressed;
  final VoidCallback? onPauseResumePressed;
  
  const AppTimerWidget({
    super.key,
    this.activeTimer,
    this.onStopPressed,
    this.onPauseResumePressed,
  });

  @override
  State<AppTimerWidget> createState() => _AppTimerWidgetState();
}

class _AppTimerWidgetState extends State<AppTimerWidget> {
  final TimeEntryService _timeEntryService = TimeEntryService();
  Timer? _timer;
  int _elapsedSeconds = 0;
  bool _isPaused = false;
  DateTime? _startTime;
  
  // Pausentimer-Variablen
  Timer? _pauseTimer;
  DateTime? _pauseStartTime;
  int _pauseSeconds = 0;
  
  @override
  void initState() {
    super.initState();
    _initializeTimer();
  }
  
  @override
  void didUpdateWidget(AppTimerWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.activeTimer?.id != widget.activeTimer?.id ||
        oldWidget.activeTimer?.status != widget.activeTimer?.status) {
      _initializeTimer();
    }
  }
  
  @override
  void dispose() {
    _timer?.cancel();
    _pauseTimer?.cancel();
    super.dispose();
  }
  
  void _initializeTimer() {
    _timer?.cancel();
    _pauseTimer?.cancel();
    
    if (widget.activeTimer == null) {
      setState(() {
        _elapsedSeconds = 0;
        _isPaused = false;
        _startTime = null;
        _pauseStartTime = null;
        _pauseSeconds = 0;
      });
      return;
    }
    
    setState(() {
      _startTime = widget.activeTimer!.startTime;
      _isPaused = widget.activeTimer!.status == 'paused';
      
      if (_isPaused) {
        _elapsedSeconds = widget.activeTimer!.duration;
        // Pausentimer starten
        _pauseStartTime = DateTime.now().subtract(const Duration(seconds: 1));
        _pauseSeconds = 1;
        _startPauseTimer();
      } else {
        // Berechne die verstrichene Zeit seit dem Start
        final now = DateTime.now();
        _elapsedSeconds = now.difference(_startTime!).inSeconds;
        
        // Starte den Timer
        _startTimerUpdates();
      }
    });
  }
  
  void _startTimerUpdates() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _elapsedSeconds++;
        });
      }
    });
  }
  
  void _startPauseTimer() {
    _pauseTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _pauseSeconds++;
        });
      }
    });
  }
  
  String _formatElapsedTime() {
    final hours = _elapsedSeconds ~/ 3600;
    final minutes = (_elapsedSeconds % 3600) ~/ 60;
    final seconds = _elapsedSeconds % 60;
    
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
  
  String _formatPauseTime() {
    if (_pauseSeconds < 60) {
      return '${_pauseSeconds}s';
    } else if (_pauseSeconds < 3600) {
      final minutes = _pauseSeconds ~/ 60;
      final seconds = _pauseSeconds % 60;
      return '${minutes}m ${seconds}s';
    } else {
      final hours = _pauseSeconds ~/ 3600;
      final minutes = (_pauseSeconds % 3600) ~/ 60;
      return '${hours}h ${minutes}m';
    }
  }
  
  @override
  Widget build(BuildContext context) {
    // Wenn kein aktiver Timer vorhanden ist, zeige nichts an
    if (widget.activeTimer == null) {
      return const SizedBox.shrink();
    }
    
    // Helle Textfarbe für die dunkle AppBar
    const textColor = Colors.white;
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5.0, vertical: 1.0),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.25),
        borderRadius: BorderRadius.circular(14.0),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            _isPaused ? Icons.hourglass_empty : Icons.timer, 
            color: _isPaused ? Colors.orange : textColor, 
            size: 12
          ),
          const SizedBox(width: 2),
          Text(
            _isPaused 
                ? 'P: ${_formatPauseTime()}' 
                : _formatElapsedTime(),
            style: TextStyle(
              color: _isPaused ? Colors.orange : textColor,
              fontWeight: FontWeight.w400,
              fontSize: 12.0,
            ),
          ),
          // Pause/Fortsetzen-Knopf
          _buildIconButton(
            icon: _isPaused ? Icons.play_arrow : Icons.pause,
            onTap: widget.onPauseResumePressed,
          ),
          // Stopp-Knopf
          _buildIconButton(
            icon: Icons.stop,
            onTap: widget.onStopPressed,
          ),
        ],
      ),
    );
  }
  
  Widget _buildIconButton({
    required IconData icon,
    required VoidCallback? onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.all(2.0),
        child: Icon(
          icon,
          color: Colors.white,
          size: 12,
        ),
      ),
    );
  }
} 