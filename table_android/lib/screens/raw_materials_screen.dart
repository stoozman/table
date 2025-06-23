import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/task.dart';
import 'package:intl/intl.dart';

class RawMaterialsScreen extends StatefulWidget {
  const RawMaterialsScreen({super.key});

  @override
  State<RawMaterialsScreen> createState() => _RawMaterialsScreenState();
}

class _RawMaterialsScreenState extends State<RawMaterialsScreen> {
  List<Task> tasks = [];
  bool isLoading = true;
  String? error;
  DateTime selectedDate = DateTime.now();
  final dateFormat = DateFormat('dd.MM.yyyy');
  
  String viewMode = 'day'; // 'day', 'week', 'month'
  late RealtimeChannel _tasksSubscription;

  @override
  void initState() {
    super.initState();
    _loadTasks();
    _subscribeToTasks();
  }

  void _subscribeToTasks() {
    _tasksSubscription = Supabase.instance.client
    .channel('public:raw_material_tasks')  // изменили название таблицы
    .onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'raw_material_tasks',  // изменили название таблицы
      callback: (payload) {
        _handleRealtimeEvent(payload);
      },
    )
    .subscribe();
  }

  void _handleRealtimeEvent(PostgresChangePayload payload) {
    if (!mounted) return;

    final startDate = _getStartDate();
    final endDate = _getEndDate();
    
    Map<String, dynamic> record;
    if (payload.eventType == PostgresChangeEvent.delete) {
      record = payload.oldRecord;
    } else {
      record = payload.newRecord;
    }
    
    final taskDate = DateTime.parse(record['date'] as String);

    if (taskDate.isBefore(startDate) || taskDate.isAfter(endDate)) {
      return;
    }

    setState(() {
      switch (payload.eventType) {
        case PostgresChangeEvent.insert:
          final newTask = Task.fromJson(record);
          tasks.add(newTask);
          tasks.sort((a, b) => b.isImportant == a.isImportant ? 0 : b.isImportant ? 1 : -1);
          break;
        case PostgresChangeEvent.update:
          final updatedTask = Task.fromJson(record);
          final index = tasks.indexWhere((t) => t.id == updatedTask.id);
          if (index != -1) {
            tasks[index] = updatedTask;
          }
          break;
        case PostgresChangeEvent.delete:
          final deletedId = payload.oldRecord['id'];
          tasks.removeWhere((t) => t.id == deletedId);
          break;
        case PostgresChangeEvent.all:
          break;
      }
    });
  }

  @override
  void dispose() {
    _tasksSubscription.unsubscribe();
    super.dispose();
  }

  Future<void> _selectDate(BuildContext context) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(2024),
      lastDate: DateTime(2026),
    );
    if (picked != null && picked != selectedDate) {
      setState(() {
        selectedDate = picked;
      });
      _loadTasks();
    }
  }

  DateTime _getStartDate() {
    switch (viewMode) {
      case 'day':
        return DateTime(selectedDate.year, selectedDate.month, selectedDate.day);
      case 'week':
        return DateTime(selectedDate.year, selectedDate.month, selectedDate.day)
            .subtract(const Duration(days: 7));
      case 'month':
        return DateTime(selectedDate.year, selectedDate.month, 1);
      default:
        return DateTime(selectedDate.year, selectedDate.month, selectedDate.day);
    }
  }

  DateTime _getEndDate() {
    switch (viewMode) {
      case 'day':
        return DateTime(selectedDate.year, selectedDate.month, selectedDate.day)
            .add(const Duration(days: 1));
      case 'week':
        return DateTime(selectedDate.year, selectedDate.month, selectedDate.day);
      case 'month':
        return DateTime(selectedDate.year, selectedDate.month + 1, 0)
            .add(const Duration(days: 1));
      default:
        return DateTime(selectedDate.year, selectedDate.month, selectedDate.day)
            .add(const Duration(days: 1));
    }
  }

  Future<void> _loadTasks() async {
    try {
      setState(() {
        isLoading = true;
        error = null;
      });

      final startDate = _getStartDate();
      final endDate = _getEndDate();

      final response = await Supabase.instance.client
    .from('raw_material_tasks')  // изменили название таблицы
    .select()
    .gte('date', startDate.toIso8601String())
    .lt('date', endDate.toIso8601String())
    .order('is_important', ascending: false)
    .order('date', ascending: true);

      setState(() {
        tasks = (response as List)
            .map((json) => Task.fromJson(json))
            .toList();
        isLoading = false;
      });
    } catch (e) {
      setState(() {
        isLoading = false;
        error = 'Ошибка загрузки данных: $e';
      });
    }
  }

  Future<void> _toggleTaskCompletion(Task task) async {
    try {
      await Supabase.instance.client
    .from('raw_material_tasks')  // изменили название таблицы
    .update({'completed': !task.completed})
    .eq('id', task.id);

      setState(() {
        tasks = tasks.map((t) => t.id == task.id
            ? t.copyWith(completed: !t.completed)
            : t).toList();
      });
    } catch (e) {
      debugPrint('Ошибка обновления задачи: $e');
    }
  }

  Future<void> _updateTaskComment(Task task, String? newComment) async {
    try {
      await Supabase.instance.client
          .from('raw_materials_tasks')
          .update({'comment': newComment})
          .eq('id', task.id);

      setState(() {
        tasks = tasks.map((t) => t.id == task.id
            ? t.copyWith(comment: newComment)
            : t).toList();
      });
    } catch (e) {
      debugPrint('Ошибка обновления задачи: $e');
    }
  }

  Future<void> _showCommentDialog(Task task) async {
    final TextEditingController controller = TextEditingController(text: task.comment);
    
    return showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Комментарий'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'Введите комментарий',
          ),
          maxLines: 3,
        ),
                actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () {
              _updateTaskComment(task, controller.text);
              Navigator.pop(context);
            },
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Сырьё'),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_today),
            onPressed: () => _selectDate(context),
          ),
          IconButton(
            icon: Icon(_getModeIcon()),
            onPressed: () {
              setState(() {
                switch (viewMode) {
                  case 'day':
                    viewMode = 'week';
                    break;
                  case 'week':
                    viewMode = 'month';
                    break;
                  case 'month':
                    viewMode = 'day';
                    break;
                }
              });
              _loadTasks();
            },
          ),
        ],
      ),
      body: error != null
          ? Center(child: Text(error!))
          : RefreshIndicator(
              onRefresh: _loadTasks,
              child: ListView.builder(
                itemCount: tasks.length,
                itemBuilder: (context, index) {
                  final task = tasks[index];
                  return Card(
                    margin: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    child: ListTile(
                      onTap: () => _showCommentDialog(task),
                      title: Row(
                        children: [
                          Expanded(
                            child: Text(
                              task.productName,
                              style: TextStyle(
                                fontWeight: task.isImportant
                                    ? FontWeight.bold
                                    : FontWeight.normal,
                              ),
                            ),
                          ),
                          if (task.isImportant)
                            const Icon(
                              Icons.star,
                              color: Colors.amber,
                            ),
                        ],
                      ),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (viewMode != 'day')
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                dateFormat.format(task.date),
                                style: TextStyle(
                                  color: Colors.grey[600],
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          if (task.comment != null && task.comment!.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                task.comment!,
                                style: TextStyle(
                                  color: task.commentColor != null && task.commentColor!.isNotEmpty
                                      ? Color(int.parse(task.commentColor!.replaceFirst('#', '0xff')))
                                      : Colors.black,
                                ),
                              ),
                            ),
                          if (task.repeatType != 'none')
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Icon(
                                Icons.repeat,
                                size: 16,
                                color: Colors.grey[600],
                              ),
                            ),
                        ],
                      ),
                      leading: Checkbox(
                        value: task.completed,
                        onChanged: (bool? value) => _toggleTaskCompletion(task),
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }

  IconData _getModeIcon() {
    switch (viewMode) {
      case 'day':
        return Icons.calendar_today;
      case 'week':
        return Icons.calendar_view_week;
      case 'month':
        return Icons.calendar_view_month;
      default:
        return Icons.calendar_today;
    }
  }
}