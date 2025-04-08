import 'package:cloud_firestore/cloud_firestore.dart';

class TimeEntry {
  final String? id;
  final String userId;
  final String userName;
  final String userEmail;
  
  final DateTime startTime;
  final DateTime endTime;
  final DateTime date;
  
  final int dateYear;
  final int dateMonth;
  final int dateDay;
  final String dateString;
  
  final int duration; // Dauer in Sekunden (exklusive Pausenzeit)
  final int pauseMinutes;
  
  final String description;
  final String note;
  
  final String customerId;
  final String customerName;
  final String projectId;
  final String projectName;
  
  final String status; // 'running', 'paused', 'completed'
  final String timezone;
  final bool isDST;
  final int timezoneOffset;
  final bool isManualEntry;
  final bool fromOrders;
  
  final DateTime createdAt;
  final DateTime updatedAt;

  TimeEntry({
    this.id,
    required this.userId,
    required this.userName,
    required this.userEmail,
    required this.startTime,
    required this.endTime,
    required this.date,
    required this.dateYear,
    required this.dateMonth,
    required this.dateDay,
    required this.dateString,
    required this.duration,
    required this.pauseMinutes,
    required this.description,
    required this.note,
    required this.customerId,
    required this.customerName,
    required this.projectId,
    required this.projectName,
    required this.status,
    required this.timezone,
    required this.isDST,
    required this.timezoneOffset,
    required this.isManualEntry,
    required this.fromOrders,
    required this.createdAt,
    required this.updatedAt,
  });

  // Factory-Methode zum Erstellen eines TimeEntry-Objekts aus einem Firestore-Dokument
  factory TimeEntry.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    // Für Zeitstempel: Falls als Timestamp oder String gespeichert
    DateTime parseDateTime(dynamic value) {
      if (value is Timestamp) {
        return value.toDate();
      } else if (value is String) {
        return DateTime.parse(value);
      }
      return DateTime.now(); // Fallback
    }
    
    // Hilfsfunktion zur sicheren Konvertierung in int
    int parseInteger(dynamic value) {
      if (value == null) return 0;
      if (value is int) return value;
      if (value is double) return value.toInt();
      if (value is String) {
        try {
          return int.parse(value);
        } catch (_) {
          return 0;
        }
      }
      return 0;
    }

    return TimeEntry(
      id: doc.id,
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      userEmail: data['userEmail'] ?? '',
      
      startTime: parseDateTime(data['startTime']),
      endTime: parseDateTime(data['endTime']),
      date: parseDateTime(data['date']),
      
      dateYear: parseInteger(data['dateYear']),
      dateMonth: parseInteger(data['dateMonth']),
      dateDay: parseInteger(data['dateDay']),
      dateString: data['dateString'] ?? '',
      
      duration: parseInteger(data['duration']),
      pauseMinutes: parseInteger(data['pauseMinutes']),
      
      description: data['description'] ?? '',
      note: data['note'] ?? '',
      
      customerId: data['customerId'] ?? '',
      customerName: data['customerName'] ?? '',
      projectId: data['projectId'] ?? '',
      projectName: data['projectName'] ?? '',
      
      status: data['status'] ?? 'completed',
      timezone: data['timezone'] ?? 'Europe/Berlin',
      isDST: data['isDST'] ?? false,
      timezoneOffset: parseInteger(data['timezoneOffset']),
      isManualEntry: data['isManualEntry'] ?? false,
      fromOrders: data['fromOrders'] ?? false,
      
      createdAt: parseDateTime(data['createdAt']),
      updatedAt: parseDateTime(data['updatedAt']),
    );
  }

  // Methode zur Umwandlung des Modells in eine Map für Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'userName': userName,
      'userEmail': userEmail,
      
      'startTime': startTime,
      'endTime': endTime,
      'date': date,
      
      'dateYear': dateYear,
      'dateMonth': dateMonth,
      'dateDay': dateDay,
      'dateString': dateString,
      
      'duration': duration,
      'pauseMinutes': pauseMinutes,
      
      'description': description,
      'note': note,
      
      'customerId': customerId,
      'customerName': customerName,
      'projectId': projectId,
      'projectName': projectName,
      
      'status': status,
      'timezone': timezone,
      'isDST': isDST,
      'timezoneOffset': timezoneOffset,
      'isManualEntry': isManualEntry,
      'fromOrders': fromOrders,
      
      'createdAt': createdAt,
      'updatedAt': updatedAt,
    };
  }
} 