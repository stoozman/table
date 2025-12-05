class Room {
  final String id;
  final String name;
  final String createdBy;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final int memberCount;
  final String? lastMessageText;
  final DateTime? lastMessageTime;
  final int unreadCount;

  Room({
    required this.id,
    required this.name,
    required this.createdBy,
    required this.createdAt,
    this.updatedAt,
    this.memberCount = 0,
    this.lastMessageText,
    this.lastMessageTime,
    this.unreadCount = 0,
  });

  factory Room.fromJson(Map<String, dynamic> json) {
    return Room(
      id: json['id'] as String,
      name: json['name'] as String,
      createdBy: json['created_by'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: json['updated_at'] != null 
          ? DateTime.parse(json['updated_at'] as String)
          : null,
      memberCount: json['member_count'] as int? ?? 0,
      lastMessageText: json['last_message_text'] as String?,
      lastMessageTime: json['last_message_time'] != null
          ? DateTime.parse(json['last_message_time'] as String)
          : null,
      unreadCount: json['unread_count'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'created_by': createdBy,
  };

  Room copyWith({
    String? id,
    String? name,
    String? createdBy,
    DateTime? createdAt,
    DateTime? updatedAt,
    int? memberCount,
    String? lastMessageText,
    DateTime? lastMessageTime,
    int? unreadCount,
  }) {
    return Room(
      id: id ?? this.id,
      name: name ?? this.name,
      createdBy: createdBy ?? this.createdBy,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      memberCount: memberCount ?? this.memberCount,
      lastMessageText: lastMessageText ?? this.lastMessageText,
      lastMessageTime: lastMessageTime ?? this.lastMessageTime,
      unreadCount: unreadCount ?? this.unreadCount,
    );
  }
}
