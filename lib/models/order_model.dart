import 'package:cloud_firestore/cloud_firestore.dart' as fb;

/// Status eines Auftrags
enum OrderStatus {
  draft,        // Entwurf
  pending,      // Warten auf Genehmigung
  approved,     // Genehmigt
  assigned,     // Zugewiesen
  inProgress,   // In Bearbeitung
  completed,    // Abgeschlossen
  rejected,     // Abgelehnt
  cancelled,    // Storniert
}

/// Priorität eines Auftrags
enum OrderPriority {
  low,          // Niedrig
  medium,       // Mittel
  high,         // Hoch
  urgent,       // Dringend
}

/// Typ eines Auftrags
enum OrderType {
  internal,     // Intern
  external,     // Extern
  maintenance,  // Wartung
  development,  // Entwicklung
  support,      // Support
  consulting,   // Beratung
  other,        // Sonstiges
}

/// Zahlungsstatus eines Auftrags
enum PaymentStatus {
  unpaid,       // Unbezahlt
  partiallyPaid,// Teilweise bezahlt
  paid,         // Bezahlt
  overdue,      // Überfällig
  cancelled,    // Storniert
}

/// Zeiterfassung für Aufträge
class TimeEntry {
  final String? id;
  final String userId;
  final String userName;
  final DateTime date;
  final double hours;
  final String description;
  final String? taskId;
  final String? taskName;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final bool billable;
  final double? hourlyRate;
  final Map<String, dynamic>? metadata;

  TimeEntry({
    this.id,
    required this.userId,
    required this.userName,
    required this.date,
    required this.hours,
    required this.description,
    this.taskId,
    this.taskName,
    required this.createdAt,
    this.updatedAt,
    required this.billable,
    this.hourlyRate,
    this.metadata,
  });

  factory TimeEntry.fromFirestore(fb.DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return TimeEntry(
      id: doc.id,
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      date: (data['date'] as fb.Timestamp).toDate(),
      hours: (data['hours'] is int) ? (data['hours'] as int).toDouble() : data['hours'] ?? 0.0,
      description: data['description'] ?? '',
      taskId: data['taskId'],
      taskName: data['taskName'],
      createdAt: (data['createdAt'] as fb.Timestamp).toDate(),
      updatedAt: data['updatedAt'] != null ? (data['updatedAt'] as fb.Timestamp).toDate() : null,
      billable: data['billable'] ?? false,
      hourlyRate: data['hourlyRate']?.toDouble(),
      metadata: data['metadata'],
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'userName': userName,
      'date': date,
      'hours': hours,
      'description': description,
      'taskId': taskId,
      'taskName': taskName,
      'createdAt': createdAt,
      'updatedAt': updatedAt ?? fb.FieldValue.serverTimestamp(),
      'billable': billable,
      'hourlyRate': hourlyRate,
      'metadata': metadata ?? {},
    };
  }

  TimeEntry copyWith({
    String? id,
    String? userId,
    String? userName,
    DateTime? date,
    double? hours,
    String? description,
    String? taskId,
    String? taskName,
    DateTime? createdAt,
    DateTime? updatedAt,
    bool? billable,
    double? hourlyRate,
    Map<String, dynamic>? metadata,
  }) {
    return TimeEntry(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      date: date ?? this.date,
      hours: hours ?? this.hours,
      description: description ?? this.description,
      taskId: taskId ?? this.taskId,
      taskName: taskName ?? this.taskName,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      billable: billable ?? this.billable,
      hourlyRate: hourlyRate ?? this.hourlyRate,
      metadata: metadata ?? this.metadata,
    );
  }
}

/// Aufgabe in einem Auftrag
class OrderTask {
  final String? id;
  final String title;
  final String description;
  final DateTime? dueDate;
  final bool completed;
  final String? assignedTo;
  final String? assignedToName;
  final double estimatedHours;
  final double actualHours;
  final DateTime? completedAt;
  final Map<String, dynamic>? metadata;

  OrderTask({
    this.id,
    required this.title,
    required this.description,
    this.dueDate,
    required this.completed,
    this.assignedTo,
    this.assignedToName,
    required this.estimatedHours,
    required this.actualHours,
    this.completedAt,
    this.metadata,
  });

  factory OrderTask.fromFirestore(Map<String, dynamic> data, String docId) {
    return OrderTask(
      id: docId,
      title: data['title'] ?? '',
      description: data['description'] ?? '',
      dueDate: data['dueDate'] != null ? (data['dueDate'] as fb.Timestamp).toDate() : null,
      completed: data['completed'] ?? false,
      assignedTo: data['assignedTo'],
      assignedToName: data['assignedToName'],
      estimatedHours: (data['estimatedHours'] is int) 
          ? (data['estimatedHours'] as int).toDouble() 
          : data['estimatedHours'] ?? 0.0,
      actualHours: (data['actualHours'] is int) 
          ? (data['actualHours'] as int).toDouble() 
          : data['actualHours'] ?? 0.0,
      completedAt: data['completedAt'] != null ? (data['completedAt'] as fb.Timestamp).toDate() : null,
      metadata: data['metadata'],
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'title': title,
      'description': description,
      'dueDate': dueDate,
      'completed': completed,
      'assignedTo': assignedTo,
      'assignedToName': assignedToName,
      'estimatedHours': estimatedHours,
      'actualHours': actualHours,
      'completedAt': completedAt,
      'metadata': metadata ?? {},
    };
  }

  OrderTask copyWith({
    String? id,
    String? title,
    String? description,
    DateTime? dueDate,
    bool? completed,
    String? assignedTo,
    String? assignedToName,
    double? estimatedHours,
    double? actualHours,
    DateTime? completedAt,
    Map<String, dynamic>? metadata,
  }) {
    return OrderTask(
      id: id ?? this.id,
      title: title ?? this.title,
      description: description ?? this.description,
      dueDate: dueDate ?? this.dueDate,
      completed: completed ?? this.completed,
      assignedTo: assignedTo ?? this.assignedTo,
      assignedToName: assignedToName ?? this.assignedToName,
      estimatedHours: estimatedHours ?? this.estimatedHours,
      actualHours: actualHours ?? this.actualHours,
      completedAt: completedAt ?? this.completedAt,
      metadata: metadata ?? this.metadata,
    );
  }
}

/// Anlage zu einem Auftrag
class OrderAttachment {
  final String? id;
  final String fileName;
  final String fileType;
  final String fileUrl;
  final int fileSize;
  final String uploadedBy;
  final String uploadedByName;
  final DateTime uploadedAt;
  final String? description;

  OrderAttachment({
    this.id,
    required this.fileName,
    required this.fileType,
    required this.fileUrl,
    required this.fileSize,
    required this.uploadedBy,
    required this.uploadedByName,
    required this.uploadedAt,
    this.description,
  });

  factory OrderAttachment.fromFirestore(Map<String, dynamic> data, String docId) {
    return OrderAttachment(
      id: docId,
      fileName: data['fileName'] ?? '',
      fileType: data['fileType'] ?? '',
      fileUrl: data['fileUrl'] ?? '',
      fileSize: data['fileSize'] ?? 0,
      uploadedBy: data['uploadedBy'] ?? '',
      uploadedByName: data['uploadedByName'] ?? '',
      uploadedAt: (data['uploadedAt'] as fb.Timestamp).toDate(),
      description: data['description'],
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'fileName': fileName,
      'fileType': fileType,
      'fileUrl': fileUrl,
      'fileSize': fileSize,
      'uploadedBy': uploadedBy,
      'uploadedByName': uploadedByName,
      'uploadedAt': uploadedAt,
      'description': description,
    };
  }
}

/// Kommentar zu einem Auftrag
class OrderComment {
  final String? id;
  final String userId;
  final String userName;
  final String content;
  final DateTime createdAt;
  final List<String> attachments;
  final bool isInternal;

  OrderComment({
    this.id,
    required this.userId,
    required this.userName,
    required this.content,
    required this.createdAt,
    required this.attachments,
    required this.isInternal,
  });

  factory OrderComment.fromFirestore(Map<String, dynamic> data, String docId) {
    return OrderComment(
      id: docId,
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      content: data['content'] ?? '',
      createdAt: (data['createdAt'] as fb.Timestamp).toDate(),
      attachments: List<String>.from(data['attachments'] ?? []),
      isInternal: data['isInternal'] ?? false,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'userName': userName,
      'content': content,
      'createdAt': createdAt,
      'attachments': attachments,
      'isInternal': isInternal,
    };
  }
}

/// Genehmigungsschritt für einen Auftrag
class ApprovalStep {
  final String? id;
  final String userId;
  final String userName;
  final String role;
  final DateTime? approvedAt;
  final DateTime? rejectedAt;
  final String? comments;
  final int sequence;
  final bool required;

  ApprovalStep({
    this.id,
    required this.userId,
    required this.userName,
    required this.role,
    this.approvedAt,
    this.rejectedAt,
    this.comments,
    required this.sequence,
    required this.required,
  });

  factory ApprovalStep.fromFirestore(Map<String, dynamic> data, String docId) {
    return ApprovalStep(
      id: docId,
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      role: data['role'] ?? '',
      approvedAt: data['approvedAt'] != null ? (data['approvedAt'] as fb.Timestamp).toDate() : null,
      rejectedAt: data['rejectedAt'] != null ? (data['rejectedAt'] as fb.Timestamp).toDate() : null,
      comments: data['comments'],
      sequence: data['sequence'] ?? 0,
      required: data['required'] ?? true,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'userName': userName,
      'role': role,
      'approvedAt': approvedAt,
      'rejectedAt': rejectedAt,
      'comments': comments,
      'sequence': sequence,
      'required': required,
    };
  }

  ApprovalStep copyWith({
    String? id,
    String? userId,
    String? userName,
    String? role,
    DateTime? approvedAt,
    DateTime? rejectedAt,
    String? comments,
    int? sequence,
    bool? required,
  }) {
    return ApprovalStep(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      role: role ?? this.role,
      approvedAt: approvedAt ?? this.approvedAt,
      rejectedAt: rejectedAt ?? this.rejectedAt,
      comments: comments ?? this.comments,
      sequence: sequence ?? this.sequence,
      required: required ?? this.required,
    );
  }

  bool get isPending => approvedAt == null && rejectedAt == null;
  bool get isApproved => approvedAt != null;
  bool get isRejected => rejectedAt != null;
}

/// Hauptmodell für einen Auftrag
class Order {
  final String? id;
  final String title;
  final String description;
  final String clientId;
  final String clientName;
  final OrderStatus status;
  final DateTime? createdAt;
  final String createdBy;
  final String createdByName;
  final DateTime? updatedAt;
  final String? updatedBy;
  final String? updatedByName;
  final DateTime? startDate;
  final DateTime? dueDate;
  final DateTime? completedAt;
  final String? completedBy;
  final String? completedByName;
  final OrderPriority priority;
  final OrderType type;
  final double? budget;
  final String? currency;
  final double? hourlyRate;
  final double estimatedHours;
  final double actualHours;
  final PaymentStatus paymentStatus;
  final List<OrderTask> tasks;
  final List<OrderAttachment> attachments;
  final List<OrderComment> comments;
  final List<ApprovalStep> approvalSteps;
  final String? assignedTo;
  final String? assignedToName;
  final Map<String, dynamic>? metadata;
  final List<TimeEntry> timeEntries;
  final String? departmentId;
  final String? departmentName;
  final String? projectId;
  final String? projectName;
  final List<String> tags;
  // Neue Eigenschaften aus der Webanwendung
  final String? teamLeadId;
  final String? teamLeadName;
  final List<AssignedUser>? assignedUsers;
  final DateTime? confirmationDeadline;
  final String? clientContactPerson;
  final String? clientContactEmail;
  final String? clientContactPhone;
  final String? projectLocation;
  final double? projectLatitude;
  final double? projectLongitude;
  final bool isUrgent;
  final String? rejectionReason;
  final DateTime? reminderDate;

  Order({
    this.id,
    required this.title,
    required this.description,
    required this.clientId,
    required this.clientName,
    required this.status,
    required this.createdAt,
    required this.createdBy,
    required this.createdByName,
    this.updatedAt,
    this.updatedBy,
    this.updatedByName,
    this.startDate,
    this.dueDate,
    this.completedAt,
    this.completedBy,
    this.completedByName,
    required this.priority,
    required this.type,
    this.budget,
    this.currency,
    this.hourlyRate,
    required this.estimatedHours,
    required this.actualHours,
    required this.paymentStatus,
    required this.tasks,
    required this.attachments,
    required this.comments,
    required this.approvalSteps,
    this.assignedTo,
    this.assignedToName,
    this.metadata,
    required this.timeEntries,
    this.departmentId,
    this.departmentName,
    this.projectId,
    this.projectName,
    required this.tags,
    // Neue Eigenschaften aus der Webanwendung
    this.teamLeadId,
    this.teamLeadName,
    this.assignedUsers,
    this.confirmationDeadline,
    this.clientContactPerson,
    this.clientContactEmail,
    this.clientContactPhone,
    this.projectLocation,
    this.projectLatitude,
    this.projectLongitude,
    this.isUrgent = false,
    this.rejectionReason,
    this.reminderDate,
  });

  factory Order.fromFirestore(fb.DocumentSnapshot doc) {
    try {
      final data = doc.data() as Map<String, dynamic>;
      
      // Sichere Konvertierung von Feldwerten mit Typprüfung
      String safeString(dynamic value, String fieldName) {
        if (value == null) {
          print("⚠️ Feld '$fieldName' ist null in Dokument ${doc.id}");
          return '';
        }
        
        if (value is String) {
          if (value.isEmpty) {
            print("⚠️ Feld '$fieldName' ist leer (String) in Dokument ${doc.id}");
          }
          return value;
        }
        
        if (value is List) {
          print("⚠️ Unerwarteter Typ für Feld '$fieldName': List (erwartet: String) in Dokument ${doc.id}");
          return value.isNotEmpty ? value.first.toString() : '';
        }
        
        print("⚠️ Unerwarteter Typ für Feld '$fieldName': ${value.runtimeType} (erwartet: String) in Dokument ${doc.id}");
        return value.toString();
      }
      
      // Debug-Ausgabe für wichtige Felder
      print("📄 Konvertiere Dokument ${doc.id} - Prüfe wichtige Felder:");
      print("  - Kundendaten: clientId=${data['clientId']}, clientName=${data['clientName']}");
      print("  - Projektdaten: projectId=${data['projectId']}, projectName=${data['projectName']}");
      
      // Konvertierung von Aufgaben
      List<OrderTask> tasks = [];
      if (data['tasks'] != null && data['tasks'] is List) {
        for (var i = 0; i < (data['tasks'] as List).length; i++) {
          try {
            tasks.add(OrderTask.fromFirestore(
              data['tasks'][i] as Map<String, dynamic>, 
              i.toString()
            ));
          } catch (e) {
            print("Fehler beim Parsen der Aufgabe $i: $e");
          }
        }
      }
      
      // Konvertierung von Anhängen
      List<OrderAttachment> attachments = [];
      if (data['attachments'] != null && data['attachments'] is List) {
        for (var i = 0; i < (data['attachments'] as List).length; i++) {
          try {
            attachments.add(OrderAttachment.fromFirestore(
              data['attachments'][i] as Map<String, dynamic>, 
              i.toString()
            ));
          } catch (e) {
            print("Fehler beim Parsen des Anhangs $i: $e");
          }
        }
      }
      
      // Konvertierung von Kommentaren
      List<OrderComment> comments = [];
      if (data['comments'] != null && data['comments'] is List) {
        for (var i = 0; i < (data['comments'] as List).length; i++) {
          try {
            comments.add(OrderComment.fromFirestore(
              data['comments'][i] as Map<String, dynamic>, 
              i.toString()
            ));
          } catch (e) {
            print("Fehler beim Parsen des Kommentars $i: $e");
          }
        }
      }
      
      // Konvertierung von Genehmigungsschritten
      List<ApprovalStep> approvalSteps = [];
      if (data['approvalSteps'] != null && data['approvalSteps'] is List) {
        for (var i = 0; i < (data['approvalSteps'] as List).length; i++) {
          try {
            approvalSteps.add(ApprovalStep.fromFirestore(
              data['approvalSteps'][i] as Map<String, dynamic>, 
              i.toString()
            ));
          } catch (e) {
            print("Fehler beim Parsen des Genehmigungsschritts $i: $e");
          }
        }
      }
      
      // Konvertierung von Zugewiesenen Benutzern
      List<AssignedUser>? assignedUsers;
      if (data['assignedUsers'] != null && data['assignedUsers'] is List) {
        assignedUsers = [];
        for (var i = 0; i < (data['assignedUsers'] as List).length; i++) {
          try {
            assignedUsers.add(AssignedUser.fromFirestore(
              data['assignedUsers'][i] as Map<String, dynamic>, 
              i.toString()
            ));
          } catch (e) {
            print("Fehler beim Parsen des Zugewiesenen Benutzers $i: $e");
          }
        }
      }
      
      // Tags konvertieren
      List<String> tags = [];
      if (data['tags'] != null) {
        if (data['tags'] is List) {
          tags = (data['tags'] as List).map((item) => item.toString()).toList();
        } else if (data['tags'] is String) {
          tags = [data['tags'] as String];
        }
      }
      
      // Zeiteinträge werden separat geladen
      
      return Order(
        id: doc.id,
        title: safeString(data['title'], 'title'),
        description: safeString(data['description'], 'description'),
        clientId: safeString(data['clientId'], 'clientId'),
        clientName: safeString(data['clientName'], 'clientName'),
        status: _parseOrderStatus(safeString(data['status'], 'status')),
        createdAt: data['createdAt'] != null ? (data['createdAt'] as fb.Timestamp).toDate() : DateTime.now(),
        createdBy: safeString(data['createdBy'], 'createdBy'),
        createdByName: safeString(data['createdByName'], 'createdByName'),
        updatedAt: data['updatedAt'] != null ? (data['updatedAt'] as fb.Timestamp).toDate() : null,
        updatedBy: safeString(data['updatedBy'], 'updatedBy'),
        updatedByName: safeString(data['updatedByName'], 'updatedByName'),
        startDate: data['startDate'] != null ? (data['startDate'] as fb.Timestamp).toDate() : null,
        dueDate: data['dueDate'] != null ? (data['dueDate'] as fb.Timestamp).toDate() : null,
        completedAt: data['completedAt'] != null ? (data['completedAt'] as fb.Timestamp).toDate() : null,
        completedBy: safeString(data['completedBy'], 'completedBy'),
        completedByName: safeString(data['completedByName'], 'completedByName'),
        priority: _parseOrderPriority(safeString(data['priority'], 'priority')),
        type: _parseOrderType(safeString(data['type'], 'type')),
        budget: data['budget']?.toDouble(),
        currency: safeString(data['currency'], 'currency'),
        hourlyRate: data['hourlyRate']?.toDouble(),
        estimatedHours: (data['estimatedHours'] is int) 
            ? (data['estimatedHours'] as int).toDouble() 
            : data['estimatedHours']?.toDouble() ?? 0.0,
        actualHours: (data['actualHours'] is int) 
            ? (data['actualHours'] as int).toDouble() 
            : data['actualHours']?.toDouble() ?? 0.0,
        paymentStatus: _parsePaymentStatus(safeString(data['paymentStatus'], 'paymentStatus')),
        tasks: tasks,
        attachments: attachments,
        comments: comments,
        approvalSteps: approvalSteps,
        assignedTo: safeString(data['assignedTo'], 'assignedTo'),
        assignedToName: safeString(data['assignedToName'], 'assignedToName'),
        metadata: data['metadata'] as Map<String, dynamic>?,
        timeEntries: [], // Wird separat geladen
        departmentId: safeString(data['departmentId'], 'departmentId'),
        departmentName: safeString(data['departmentName'], 'departmentName'),
        projectId: safeString(data['projectId'], 'projectId'),
        projectName: safeString(data['projectName'], 'projectName'),
        tags: tags,
        // Neue Eigenschaften aus der Webanwendung
        teamLeadId: safeString(data['teamLeadId'], 'teamLeadId'),
        teamLeadName: safeString(data['teamLeadName'], 'teamLeadName'),
        assignedUsers: assignedUsers,
        confirmationDeadline: data['confirmationDeadline'] != null ? (data['confirmationDeadline'] as fb.Timestamp).toDate() : null,
        clientContactPerson: safeString(data['clientContactPerson'], 'clientContactPerson'),
        clientContactEmail: safeString(data['clientContactEmail'], 'clientContactEmail'),
        clientContactPhone: safeString(data['clientContactPhone'], 'clientContactPhone'),
        projectLocation: safeString(data['projectLocation'], 'projectLocation'),
        projectLatitude: data['projectLatitude']?.toDouble(),
        projectLongitude: data['projectLongitude']?.toDouble(),
        isUrgent: data['isUrgent'] == true,
        rejectionReason: safeString(data['rejectionReason'], 'rejectionReason'),
        reminderDate: data['reminderDate'] != null ? (data['reminderDate'] as fb.Timestamp).toDate() : null,
      );
    } catch (e, stackTrace) {
      print("Fehler beim Parsen des Auftrags ${doc.id}: $e");
      print("Stacktrace: $stackTrace");
      rethrow;
    }
  }

  Map<String, dynamic> toFirestore() {
    // Aufgaben konvertieren
    final List<Map<String, dynamic>> tasksMap = tasks.map((task) => task.toFirestore()).toList();
    
    // Anhänge konvertieren
    final List<Map<String, dynamic>> attachmentsMap = attachments.map((attachment) => attachment.toFirestore()).toList();
    
    // Kommentare konvertieren
    final List<Map<String, dynamic>> commentsMap = comments.map((comment) => comment.toFirestore()).toList();
    
    // Genehmigungsschritte konvertieren
    final List<Map<String, dynamic>> approvalStepsMap = approvalSteps.map((step) => step.toFirestore()).toList();
    
    // Zugewiesene Benutzer konvertieren
    final List<Map<String, dynamic>>? assignedUsersMap = assignedUsers?.map((user) => user.toFirestore()).toList();
    
    return {
      'title': title,
      'description': description,
      'clientId': clientId,
      'clientName': clientName,
      'status': status.toString().split('.').last,
      'createdAt': createdAt,
      'createdBy': createdBy,
      'createdByName': createdByName,
      'updatedAt': updatedAt ?? fb.FieldValue.serverTimestamp(),
      'updatedBy': updatedBy,
      'updatedByName': updatedByName,
      'startDate': startDate,
      'dueDate': dueDate,
      'completedAt': completedAt,
      'completedBy': completedBy,
      'completedByName': completedByName,
      'priority': priority.toString().split('.').last,
      'type': type.toString().split('.').last,
      'budget': budget,
      'currency': currency,
      'hourlyRate': hourlyRate,
      'estimatedHours': estimatedHours,
      'actualHours': actualHours,
      'paymentStatus': paymentStatus.toString().split('.').last,
      'tasks': tasksMap,
      'attachments': attachmentsMap,
      'comments': commentsMap,
      'approvalSteps': approvalStepsMap,
      'assignedTo': assignedTo,
      'assignedToName': assignedToName,
      'metadata': metadata ?? {},
      // TimeEntries werden separat gespeichert
      'departmentId': departmentId,
      'departmentName': departmentName,
      'projectId': projectId,
      'projectName': projectName,
      'tags': tags,
      // Neue Eigenschaften aus der Webanwendung
      'teamLeadId': teamLeadId,
      'teamLeadName': teamLeadName,
      'assignedUsers': assignedUsersMap,
      'confirmationDeadline': confirmationDeadline,
      'clientContactPerson': clientContactPerson,
      'clientContactEmail': clientContactEmail,
      'clientContactPhone': clientContactPhone,
      'projectLocation': projectLocation,
      'projectLatitude': projectLatitude,
      'projectLongitude': projectLongitude,
      'isUrgent': isUrgent,
      'rejectionReason': rejectionReason,
      'reminderDate': reminderDate,
    };
  }

  Order copyWith({
    String? id,
    String? title,
    String? description,
    String? clientId,
    String? clientName,
    OrderStatus? status,
    DateTime? createdAt,
    String? createdBy,
    String? createdByName,
    DateTime? updatedAt,
    String? updatedBy,
    String? updatedByName,
    DateTime? startDate,
    DateTime? dueDate,
    DateTime? completedAt,
    String? completedBy,
    String? completedByName,
    OrderPriority? priority,
    OrderType? type,
    double? budget,
    String? currency,
    double? hourlyRate,
    double? estimatedHours,
    double? actualHours,
    PaymentStatus? paymentStatus,
    List<OrderTask>? tasks,
    List<OrderAttachment>? attachments,
    List<OrderComment>? comments,
    List<ApprovalStep>? approvalSteps,
    String? assignedTo,
    String? assignedToName,
    Map<String, dynamic>? metadata,
    List<TimeEntry>? timeEntries,
    String? departmentId,
    String? departmentName,
    String? projectId,
    String? projectName,
    List<String>? tags,
    // Neue Eigenschaften aus der Webanwendung
    String? teamLeadId,
    String? teamLeadName,
    List<AssignedUser>? assignedUsers,
    DateTime? confirmationDeadline,
    String? clientContactPerson,
    String? clientContactEmail,
    String? clientContactPhone,
    String? projectLocation,
    double? projectLatitude,
    double? projectLongitude,
    bool? isUrgent,
    String? rejectionReason,
    DateTime? reminderDate,
  }) {
    return Order(
      id: id ?? this.id,
      title: title ?? this.title,
      description: description ?? this.description,
      clientId: clientId ?? this.clientId,
      clientName: clientName ?? this.clientName,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      createdBy: createdBy ?? this.createdBy,
      createdByName: createdByName ?? this.createdByName,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
      updatedByName: updatedByName ?? this.updatedByName,
      startDate: startDate ?? this.startDate,
      dueDate: dueDate ?? this.dueDate,
      completedAt: completedAt ?? this.completedAt,
      completedBy: completedBy ?? this.completedBy,
      completedByName: completedByName ?? this.completedByName,
      priority: priority ?? this.priority,
      type: type ?? this.type,
      budget: budget ?? this.budget,
      currency: currency ?? this.currency,
      hourlyRate: hourlyRate ?? this.hourlyRate,
      estimatedHours: estimatedHours ?? this.estimatedHours,
      actualHours: actualHours ?? this.actualHours,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      tasks: tasks ?? this.tasks,
      attachments: attachments ?? this.attachments,
      comments: comments ?? this.comments,
      approvalSteps: approvalSteps ?? this.approvalSteps,
      assignedTo: assignedTo ?? this.assignedTo,
      assignedToName: assignedToName ?? this.assignedToName,
      metadata: metadata ?? this.metadata,
      timeEntries: timeEntries ?? this.timeEntries,
      departmentId: departmentId ?? this.departmentId,
      departmentName: departmentName ?? this.departmentName,
      projectId: projectId ?? this.projectId,
      projectName: projectName ?? this.projectName,
      tags: tags ?? this.tags,
      // Neue Eigenschaften aus der Webanwendung
      teamLeadId: teamLeadId ?? this.teamLeadId,
      teamLeadName: teamLeadName ?? this.teamLeadName,
      assignedUsers: assignedUsers ?? this.assignedUsers,
      confirmationDeadline: confirmationDeadline ?? this.confirmationDeadline,
      clientContactPerson: clientContactPerson ?? this.clientContactPerson,
      clientContactEmail: clientContactEmail ?? this.clientContactEmail,
      clientContactPhone: clientContactPhone ?? this.clientContactPhone,
      projectLocation: projectLocation ?? this.projectLocation,
      projectLatitude: projectLatitude ?? this.projectLatitude,
      projectLongitude: projectLongitude ?? this.projectLongitude,
      isUrgent: isUrgent ?? this.isUrgent,
      rejectionReason: rejectionReason ?? this.rejectionReason,
      reminderDate: reminderDate ?? this.reminderDate,
    );
  }

  // Hilfsfunktionen zum Parsen von Enum-Werten
  static OrderStatus _parseOrderStatus(String? value) {
    if (value == null) {
      print("⚠️ Status-Wert ist null, verwende 'draft' als Standardwert");
      return OrderStatus.draft;
    }
    
    print("🔍 Analysiere Status-Wert: '$value'");
    
    // Normalisiere den String für besseren Vergleich
    final normalizedValue = value.toLowerCase().trim().replaceAll('-', '').replaceAll('_', '');
    
    switch (normalizedValue) {
      case 'pending':
      case 'wartenaufgenehmigung':
      case 'ausstehend':
      case 'wartet':
      case 'offen':
        print("✅ Status '$value' als OrderStatus.pending erkannt");
        return OrderStatus.pending;
        
      case 'approved':
      case 'genehmigt':
      case 'accepted':
      case 'akzeptiert':
        print("✅ Status '$value' als OrderStatus.approved erkannt");
        return OrderStatus.approved;
        
      case 'inprogress':
      case 'progress':
      case 'inbearbeitung':
      case 'bearbeitung':
        print("✅ Status '$value' als OrderStatus.inProgress erkannt");
        return OrderStatus.inProgress;
        
      case 'completed':
      case 'abgeschlossen':
      case 'fertig':
      case 'done':
        print("✅ Status '$value' als OrderStatus.completed erkannt");
        return OrderStatus.completed;
        
      case 'rejected':
      case 'abgelehnt':
        print("✅ Status '$value' als OrderStatus.rejected erkannt");
        return OrderStatus.rejected;
        
      case 'cancelled':
      case 'storniert':
      case 'abgebrochen':
        print("✅ Status '$value' als OrderStatus.cancelled erkannt");
        return OrderStatus.cancelled;
        
      case 'assigned':
      case 'zugewiesen':
        print("✅ Status '$value' als OrderStatus.assigned erkannt");
        return OrderStatus.assigned;
        
      case 'draft':
      case 'entwurf':
        print("✅ Status '$value' als OrderStatus.draft erkannt");
        return OrderStatus.draft;
        
      default:
        print("⚠️ Unbekannter Status: '$value', versuche Teilabgleich...");
        
        // Prüfe, ob der String einen der bekannten Status enthält
        if (normalizedValue.contains('pend') || normalizedValue.contains('wart') || normalizedValue.contains('ausst')) {
          print("✅ Status enthält Teile von 'pending' - verwende OrderStatus.pending");
          return OrderStatus.pending;
        } else if (normalizedValue.contains('approv') || normalizedValue.contains('genehm') || normalizedValue.contains('akzept')) {
          print("✅ Status enthält Teile von 'approved' - verwende OrderStatus.approved");
          return OrderStatus.approved;
        } else if (normalizedValue.contains('progress') || normalizedValue.contains('bearbeit')) {
          print("✅ Status enthält Teile von 'inProgress' - verwende OrderStatus.inProgress");
          return OrderStatus.inProgress;
        } else if (normalizedValue.contains('complet') || normalizedValue.contains('abgeschl') || normalizedValue.contains('fertig') || normalizedValue.contains('done')) {
          print("✅ Status enthält Teile von 'completed' - verwende OrderStatus.completed");
          return OrderStatus.completed;
        } else if (normalizedValue.contains('reject') || normalizedValue.contains('ablehn')) {
          print("✅ Status enthält Teile von 'rejected' - verwende OrderStatus.rejected");
          return OrderStatus.rejected;
        } else if (normalizedValue.contains('cancel') || normalizedValue.contains('stornier') || normalizedValue.contains('abbrech')) {
          print("✅ Status enthält Teile von 'cancelled' - verwende OrderStatus.cancelled");
          return OrderStatus.cancelled;
        } else if (normalizedValue.contains('assign') || normalizedValue.contains('zugewiesen')) {
          print("✅ Status enthält Teile von 'assigned' - verwende OrderStatus.assigned");
          return OrderStatus.assigned;
        }
        
        print("⚠️ Keine Übereinstimmung gefunden, verwende OrderStatus.draft als Fallback");
        return OrderStatus.draft;
    }
  }

  static OrderPriority _parseOrderPriority(String? value) {
    if (value == null) return OrderPriority.medium;
    
    switch (value) {
      case 'low': return OrderPriority.low;
      case 'high': return OrderPriority.high;
      case 'urgent': return OrderPriority.urgent;
      default: return OrderPriority.medium;
    }
  }

  static OrderType _parseOrderType(String? value) {
    if (value == null) return OrderType.other;
    
    switch (value) {
      case 'internal': return OrderType.internal;
      case 'external': return OrderType.external;
      case 'maintenance': return OrderType.maintenance;
      case 'development': return OrderType.development;
      case 'support': return OrderType.support;
      case 'consulting': return OrderType.consulting;
      default: return OrderType.other;
    }
  }

  static PaymentStatus _parsePaymentStatus(String? value) {
    if (value == null) return PaymentStatus.unpaid;
    
    switch (value) {
      case 'partiallyPaid': return PaymentStatus.partiallyPaid;
      case 'paid': return PaymentStatus.paid;
      case 'overdue': return PaymentStatus.overdue;
      case 'cancelled': return PaymentStatus.cancelled;
      default: return PaymentStatus.unpaid;
    }
  }

  bool canUserApprove(String userId) {
    if (status != OrderStatus.pending) return false;
    
    // Finde den nächsten ausstehenden Genehmigungsschritt
    final pendingSteps = approvalSteps.where((step) => step.isPending).toList();
    if (pendingSteps.isEmpty) return false;
    
    // Sortiere nach Sequenz
    pendingSteps.sort((a, b) => a.sequence.compareTo(b.sequence));
    
    // Prüfe, ob der Benutzer der Genehmiger des nächsten Schritts ist
    return pendingSteps.first.userId == userId;
  }

  bool isFullyApproved() {
    // Prüfe, ob alle erforderlichen Genehmigungsschritte genehmigt wurden
    final requiredSteps = approvalSteps.where((step) => step.required).toList();
    if (requiredSteps.isEmpty) return true;
    
    return requiredSteps.every((step) => step.isApproved);
  }

  bool isRejected() {
    // Prüfe, ob mindestens ein erforderlicher Genehmigungsschritt abgelehnt wurde
    final requiredSteps = approvalSteps.where((step) => step.required).toList();
    if (requiredSteps.isEmpty) return false;
    
    return requiredSteps.any((step) => step.isRejected);
  }

  double get progress {
    if (tasks.isEmpty) return 0.0;
    
    final completedTasks = tasks.where((task) => task.completed).length;
    return completedTasks / tasks.length;
  }

  double get budgetUsed {
    if (budget == null || budget == 0) return 0.0;
    
    return actualHours * (hourlyRate ?? 0.0) / (budget ?? 1.0);
  }

  double get timeUsed {
    if (estimatedHours == 0) return 0.0;
    
    return actualHours / estimatedHours;
  }
}

/// Zugewiesener Benutzer für einen Auftrag
class AssignedUser {
  final String? id;
  final String userId;
  final String userName;
  final String? role;
  final String? status;
  final bool isTeamLead;
  final DateTime? assignedAt;
  final DateTime? acceptedAt;
  final DateTime? rejectedAt;
  final String? rejectionReason;

  AssignedUser({
    this.id,
    required this.userId,
    required this.userName,
    this.role,
    this.status = 'pending',
    this.isTeamLead = false,
    this.assignedAt,
    this.acceptedAt,
    this.rejectedAt,
    this.rejectionReason,
  });

  factory AssignedUser.fromFirestore(Map<String, dynamic> data, String docId) {
    return AssignedUser(
      id: docId,
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      role: data['role'],
      status: data['status'] ?? 'pending',
      isTeamLead: data['isTeamLead'] ?? false,
      assignedAt: data['assignedAt'] != null ? (data['assignedAt'] as fb.Timestamp).toDate() : null,
      acceptedAt: data['acceptedAt'] != null ? (data['acceptedAt'] as fb.Timestamp).toDate() : null,
      rejectedAt: data['rejectedAt'] != null ? (data['rejectedAt'] as fb.Timestamp).toDate() : null,
      rejectionReason: data['rejectionReason'],
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'userId': userId,
      'userName': userName,
      'role': role,
      'status': status,
      'isTeamLead': isTeamLead,
      'assignedAt': assignedAt,
      'acceptedAt': acceptedAt,
      'rejectedAt': rejectedAt,
      'rejectionReason': rejectionReason,
    };
  }

  AssignedUser copyWith({
    String? id,
    String? userId,
    String? userName,
    String? role,
    String? status,
    bool? isTeamLead,
    DateTime? assignedAt,
    DateTime? acceptedAt,
    DateTime? rejectedAt,
    String? rejectionReason,
  }) {
    return AssignedUser(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      role: role ?? this.role,
      status: status ?? this.status,
      isTeamLead: isTeamLead ?? this.isTeamLead,
      assignedAt: assignedAt ?? this.assignedAt,
      acceptedAt: acceptedAt ?? this.acceptedAt,
      rejectedAt: rejectedAt ?? this.rejectedAt,
      rejectionReason: rejectionReason ?? this.rejectionReason,
    );
  }
} 