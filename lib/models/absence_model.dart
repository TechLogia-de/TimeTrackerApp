import 'package:cloud_firestore/cloud_firestore.dart' as fb;

/// Enum für Abwesenheitstypen (muss mit der Webversion übereinstimmen)
enum AbsenceType {
  VACATION,   // Urlaub
  SICK,       // Krankheit
  SPECIAL,    // Sonderurlaub
  REMOTE,     // Homeoffice
  OTHER       // Sonstiges
}

/// Enum für Abwesenheitsstatus (muss mit der Webversion übereinstimmen)
enum AbsenceStatus {
  PENDING,    // Ausstehend
  APPROVED,   // Genehmigt
  REJECTED,   // Abgelehnt
  CANCELLED   // Storniert
}

/// Modell für Abwesenheiten
class Absence {
  final String? id;
  final String userId;
  final String userName;
  final String? userEmail;
  final AbsenceType type;
  final DateTime startDate;
  final DateTime endDate;
  final bool halfDayStart;
  final bool halfDayEnd;
  final double daysCount;
  final String? reason;
  final String? notes;
  final AbsenceStatus status;
  final DateTime createdAt;
  final DateTime? updatedAt;
  
  // Genehmigungs-Informationen
  final String? approvedBy;
  final String? approverName;
  final DateTime? approvedAt;
  
  // Ablehnungs-Informationen
  final String? rejectedBy;
  final String? rejectionReason;
  final DateTime? rejectedAt;
  
  // Stornierungs-Informationen
  final String? cancellationReason;
  final DateTime? cancelledAt;

  Absence({
    this.id,
    required this.userId,
    required this.userName,
    this.userEmail,
    required this.type,
    required this.startDate,
    required this.endDate,
    this.halfDayStart = false,
    this.halfDayEnd = false,
    required this.daysCount,
    this.reason,
    this.notes,
    required this.status,
    required this.createdAt,
    this.updatedAt,
    this.approvedBy,
    this.approverName,
    this.approvedAt,
    this.rejectedBy,
    this.rejectionReason,
    this.rejectedAt,
    this.cancellationReason,
    this.cancelledAt,
  });

  /// Konvertiert ein Firestore-Dokument in ein Absence-Objekt
  factory Absence.fromFirestore(fb.DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return Absence(
      id: doc.id,
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      userEmail: data['userEmail'],
      type: _parseAbsenceType(data['type']),
      startDate: (data['startDate'] as fb.Timestamp).toDate(),
      endDate: (data['endDate'] as fb.Timestamp).toDate(),
      halfDayStart: data['halfDayStart'] ?? false,
      halfDayEnd: data['halfDayEnd'] ?? false,
      daysCount: (data['daysCount'] is int) 
          ? (data['daysCount'] as int).toDouble() 
          : data['daysCount']?.toDouble() ?? 0.0,
      reason: data['reason'],
      notes: data['notes'],
      status: _parseAbsenceStatus(data['status']),
      createdAt: (data['createdAt'] as fb.Timestamp).toDate(),
      updatedAt: data['updatedAt'] != null 
          ? (data['updatedAt'] as fb.Timestamp).toDate() 
          : null,
      approvedBy: data['approvedBy'],
      approverName: data['approverName'],
      approvedAt: data['approvedAt'] != null 
          ? (data['approvedAt'] as fb.Timestamp).toDate() 
          : null,
      rejectedBy: data['rejectedBy'],
      rejectionReason: data['rejectionReason'],
      rejectedAt: data['rejectedAt'] != null 
          ? (data['rejectedAt'] as fb.Timestamp).toDate() 
          : null,
      cancellationReason: data['cancellationReason'],
      cancelledAt: data['cancelledAt'] != null 
          ? (data['cancelledAt'] as fb.Timestamp).toDate() 
          : null,
    );
  }

  /// Konvertiert das Objekt in ein Firestore-Dokument
  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'userName': userName,
      'userEmail': userEmail,
      'type': type.toString().split('.').last,
      'startDate': startDate,
      'endDate': endDate,
      'halfDayStart': halfDayStart,
      'halfDayEnd': halfDayEnd,
      'daysCount': daysCount,
      'reason': reason,
      'notes': notes,
      'status': status.toString().split('.').last,
      'createdAt': createdAt,
      'updatedAt': updatedAt ?? fb.FieldValue.serverTimestamp(),
      'approvedBy': approvedBy,
      'approverName': approverName,
      'approvedAt': approvedAt,
      'rejectedBy': rejectedBy,
      'rejectionReason': rejectionReason,
      'rejectedAt': rejectedAt,
      'cancellationReason': cancellationReason,
      'cancelledAt': cancelledAt,
    };
  }

  /// Kopiert das Objekt mit optionalen Änderungen
  Absence copyWith({
    String? id,
    String? userId,
    String? userName,
    String? userEmail,
    AbsenceType? type,
    DateTime? startDate,
    DateTime? endDate,
    bool? halfDayStart,
    bool? halfDayEnd,
    double? daysCount,
    String? reason,
    String? notes,
    AbsenceStatus? status,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? approvedBy,
    String? approverName,
    DateTime? approvedAt,
    String? rejectedBy,
    String? rejectionReason,
    DateTime? rejectedAt,
    String? cancellationReason,
    DateTime? cancelledAt,
  }) {
    return Absence(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      userEmail: userEmail ?? this.userEmail,
      type: type ?? this.type,
      startDate: startDate ?? this.startDate,
      endDate: endDate ?? this.endDate,
      halfDayStart: halfDayStart ?? this.halfDayStart,
      halfDayEnd: halfDayEnd ?? this.halfDayEnd,
      daysCount: daysCount ?? this.daysCount,
      reason: reason ?? this.reason,
      notes: notes ?? this.notes,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      approvedBy: approvedBy ?? this.approvedBy,
      approverName: approverName ?? this.approverName,
      approvedAt: approvedAt ?? this.approvedAt,
      rejectedBy: rejectedBy ?? this.rejectedBy,
      rejectionReason: rejectionReason ?? this.rejectionReason,
      rejectedAt: rejectedAt ?? this.rejectedAt,
      cancellationReason: cancellationReason ?? this.cancellationReason,
      cancelledAt: cancelledAt ?? this.cancelledAt,
    );
  }

  /// Hilfsunktion zum Parsen des AbsenceType aus einem String
  static AbsenceType _parseAbsenceType(String? typeString) {
    if (typeString == null) return AbsenceType.OTHER;
    
    switch (typeString) {
      case 'VACATION':
        return AbsenceType.VACATION;
      case 'SICK':
        return AbsenceType.SICK;
      case 'SPECIAL':
        return AbsenceType.SPECIAL;
      case 'REMOTE':
        return AbsenceType.REMOTE;
      case 'OTHER':
        return AbsenceType.OTHER;
      default:
        return AbsenceType.OTHER;
    }
  }

  /// Hilfsunktion zum Parsen des AbsenceStatus aus einem String
  static AbsenceStatus _parseAbsenceStatus(String? statusString) {
    if (statusString == null) return AbsenceStatus.PENDING;
    
    switch (statusString) {
      case 'PENDING':
        return AbsenceStatus.PENDING;
      case 'APPROVED':
        return AbsenceStatus.APPROVED;
      case 'REJECTED':
        return AbsenceStatus.REJECTED;
      case 'CANCELLED':
        return AbsenceStatus.CANCELLED;
      default:
        return AbsenceStatus.PENDING;
    }
  }
}

/// Modell für Urlaubskonto-Saldo
class AbsenceBalance {
  final String? id;
  final String userId;
  final String userName;
  final int year;
  final double totalDays;
  final double usedDays;
  final double pendingDays;
  final double remainingDays;
  final double? carryOverDays;
  final double? sickDays;
  final DateTime updatedAt;

  AbsenceBalance({
    this.id,
    required this.userId,
    required this.userName,
    required this.year,
    required this.totalDays,
    required this.usedDays,
    required this.pendingDays,
    required this.remainingDays,
    this.carryOverDays,
    this.sickDays,
    required this.updatedAt,
  });

  factory AbsenceBalance.fromFirestore(fb.DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return AbsenceBalance(
      id: doc.id,
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      year: data['year'] ?? DateTime.now().year,
      totalDays: (data['totalDays'] is int) 
          ? (data['totalDays'] as int).toDouble() 
          : data['totalDays']?.toDouble() ?? 0.0,
      usedDays: (data['usedDays'] is int) 
          ? (data['usedDays'] as int).toDouble() 
          : data['usedDays']?.toDouble() ?? 0.0,
      pendingDays: (data['pendingDays'] is int) 
          ? (data['pendingDays'] as int).toDouble() 
          : data['pendingDays']?.toDouble() ?? 0.0,
      remainingDays: (data['remainingDays'] is int) 
          ? (data['remainingDays'] as int).toDouble() 
          : data['remainingDays']?.toDouble() ?? 0.0,
      carryOverDays: (data['carryOverDays'] is int) 
          ? (data['carryOverDays'] as int).toDouble() 
          : data['carryOverDays']?.toDouble(),
      sickDays: (data['sickDays'] is int) 
          ? (data['sickDays'] as int).toDouble() 
          : data['sickDays']?.toDouble(),
      updatedAt: (data['updatedAt'] as fb.Timestamp).toDate(),
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'userName': userName,
      'year': year,
      'totalDays': totalDays,
      'usedDays': usedDays,
      'pendingDays': pendingDays,
      'remainingDays': remainingDays,
      'carryOverDays': carryOverDays,
      'sickDays': sickDays,
      'updatedAt': updatedAt,
    };
  }
  
  /// Kopiert das Objekt mit optionalen Änderungen
  AbsenceBalance copyWith({
    String? id,
    String? userId,
    String? userName,
    int? year,
    double? totalDays,
    double? usedDays,
    double? pendingDays,
    double? remainingDays,
    double? carryOverDays,
    double? sickDays,
    DateTime? updatedAt,
  }) {
    return AbsenceBalance(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      year: year ?? this.year,
      totalDays: totalDays ?? this.totalDays,
      usedDays: usedDays ?? this.usedDays,
      pendingDays: pendingDays ?? this.pendingDays,
      remainingDays: remainingDays ?? this.remainingDays,
      carryOverDays: carryOverDays ?? this.carryOverDays,
      sickDays: sickDays ?? this.sickDays,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
} 