class Message {
  final String id;
  final String roomId;
  final DateTime createdAt;
  final String userId;
  final String userName;
  final String? textContent;
  final String? mediaType; // 'photo', 'video'
  final String? mediaUrl;
  final String? fileName;
  final DateTime? editedAt;
  final bool deleted;

  Message({
    required this.id,
    required this.roomId,
    required this.createdAt,
    required this.userId,
    required this.userName,
    this.textContent,
    this.mediaType,
    this.mediaUrl,
    this.fileName,
    this.editedAt,
    this.deleted = false,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    return Message(
      id: json['id'] as String,
      roomId: json['room_id'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
      userId: json['user_id'] as String,
      userName: json['user_name'] as String,
      textContent: json['text_content'] as String?,
      mediaType: json['media_type'] as String?,
      mediaUrl: json['media_url'] as String?,
      fileName: json['file_name'] as String?,
      editedAt: json['edited_at'] != null 
          ? DateTime.parse(json['edited_at'] as String)
          : null,
      deleted: json['deleted'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'room_id': roomId,
    'user_id': userId,
    'user_name': userName,
    'text_content': textContent,
    'media_type': mediaType,
    'media_url': mediaUrl,
    'file_name': fileName,
  };

  Message copyWith({
    String? id,
    String? roomId,
    DateTime? createdAt,
    String? userId,
    String? userName,
    String? textContent,
    String? mediaType,
    String? mediaUrl,
    String? fileName,
    DateTime? editedAt,
    bool? deleted,
  }) {
    return Message(
      id: id ?? this.id,
      roomId: roomId ?? this.roomId,
      createdAt: createdAt ?? this.createdAt,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      textContent: textContent ?? this.textContent,
      mediaType: mediaType ?? this.mediaType,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      fileName: fileName ?? this.fileName,
      editedAt: editedAt ?? this.editedAt,
      deleted: deleted ?? this.deleted,
    );
  }
}
