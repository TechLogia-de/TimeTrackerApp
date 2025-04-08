import 'package:cloud_firestore/cloud_firestore.dart';

class AppNotification {
  final String id;
  final String userId;
  final String title;
  final String body;
  final String? type;
  final String? relatedEntityId;
  final bool read;
  final DateTime createdAt;
  final DateTime? readAt;

  AppNotification({
    required this.id,
    required this.userId,
    required this.title,
    required this.body,
    this.type,
    this.relatedEntityId,
    required this.read,
    required this.createdAt,
    this.readAt,
  });

  // Factory-Methode zum Erstellen aus Firestore
  factory AppNotification.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return AppNotification(
      id: doc.id,
      userId: data['userId'] ?? '',
      title: data['title'] ?? '',
      body: data['body'] ?? '',
      type: data['type'],
      relatedEntityId: data['relatedEntityId'],
      read: data['read'] ?? false,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      readAt: (data['readAt'] as Timestamp?)?.toDate(),
    );
  }

  // Konvertiert zu einer Map für Firestore
  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'title': title,
      'body': body,
      'type': type,
      'relatedEntityId': relatedEntityId,
      'read': read,
      'createdAt': Timestamp.fromDate(createdAt),
      'readAt': readAt != null ? Timestamp.fromDate(readAt!) : null,
    };
  }

  // Erstellt eine Kopie mit aktualisierten Werten
  AppNotification copyWith({
    String? id,
    String? userId,
    String? title,
    String? body,
    String? type,
    String? relatedEntityId,
    bool? read,
    DateTime? createdAt,
    DateTime? readAt,
  }) {
    return AppNotification(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      title: title ?? this.title,
      body: body ?? this.body,
      type: type ?? this.type,
      relatedEntityId: relatedEntityId ?? this.relatedEntityId,
      read: read ?? this.read,
      createdAt: createdAt ?? this.createdAt,
      readAt: readAt ?? this.readAt,
    );
  }
} 