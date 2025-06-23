class Task {
  final int id;
  final String productName;
  final String? comment;
  final String? commentColor;
  bool completed;
  final DateTime date;
  final bool isImportant;
  final String repeatType;
  final Map<String, dynamic>? repeatConfig;
  final DateTime? nextDueDate;

  Task({
    required this.id,
    required this.productName,
    this.comment,
    this.commentColor,
    this.completed = false,
    required this.date,
    this.isImportant = false,
    this.repeatType = 'none',
    this.repeatConfig,
    this.nextDueDate,
  });

  Task copyWith({
    int? id,
    String? productName,
    String? comment,
    String? commentColor,
    bool? completed,
    DateTime? date,
    bool? isImportant,
    String? repeatType,
    Map<String, dynamic>? repeatConfig,
    DateTime? nextDueDate,
  }) {
    return Task(
      id: id ?? this.id,
      productName: productName ?? this.productName,
      comment: comment ?? this.comment,
      commentColor: commentColor ?? this.commentColor,
      completed: completed ?? this.completed,
      date: date ?? this.date,
      isImportant: isImportant ?? this.isImportant,
      repeatType: repeatType ?? this.repeatType,
      repeatConfig: repeatConfig ?? this.repeatConfig,
      nextDueDate: nextDueDate ?? this.nextDueDate,
    );
  }

  factory Task.fromJson(Map<String, dynamic> json) {
    return Task(
      id: json['id'],
      productName: json['product_name'],
      comment: json['comment'],
      commentColor: json['comment_color'],
      completed: json['completed'] ?? false,
      date: DateTime.parse(json['date']),
      isImportant: json['is_important'] ?? false,
      repeatType: json['repeat_type'] ?? 'none',
      repeatConfig: json['repeat_config'],
      nextDueDate: json['next_due_date'] != null 
          ? DateTime.parse(json['next_due_date'])
          : null,
    );
  }
}