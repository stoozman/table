// main.dart исправлен: только один блок кнопок, все виджеты внутри Column и build, нет дублирования
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'models/task.dart';
import 'package:intl/intl.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'screens/qr_scan_screen.dart';
import 'screens/raw_material_details_screen.dart';
import 'screens/photo_upload_screen.dart';
import 'screens/live_color_check_screen.dart';
import 'screens/auth_wrapper.dart';
import 'screens/chat_list_screen.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'services/chat_unread_service.dart';
import 'services/main_unread_tracker.dart';
import 'services/chat_push_token_service.dart';

void main() async {
  print('main: start');
  try {
    WidgetsFlutterBinding.ensureInitialized();
    await dotenv.load();
    await initializeDateFormatting('ru');
    await Supabase.initialize(
      url: dotenv.env['SUPABASE_URL']!,
      anonKey: dotenv.env['SUPABASE_ANON_KEY']!,
      realtimeClientOptions: const RealtimeClientOptions(
        logLevel: RealtimeLogLevel.info,
      ),
    );
    // Добавляем анонимную сессию для Realtime
    try {
      await Supabase.instance.client.auth.signInAnonymously();
      print('[MAIN] Anonymous session created');
    } catch (e) {
      print('[MAIN] Error creating anonymous session: $e');
    }

    try {
      await ChatPushTokenService.initAndRegister();
    } catch (e) {
      print('[MAIN] Error registering push token: $e');
    }

    // Инициализируем главный трекер и связываем с ChatUnreadService
    final mainTracker = MainUnreadTracker();
    ChatUnreadService.setMainTracker(mainTracker);
    print('main: Supabase initialized');
    runApp(const MyApp());
  } catch (e) {
    debugPrint('Error in initialization: $e');
    rethrow;
  }
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Table App',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('ru'),
        Locale('en'),
      ],
      home: const AuthWrapper(),
    );
  }
}

class StartScreen extends StatefulWidget {
  const StartScreen({super.key});

  @override
  State<StartScreen> createState() => _StartScreenState();
}

class _StartScreenState extends State<StartScreen> {
  final MainUnreadTracker _unreadTracker = MainUnreadTracker();
  StreamSubscription<int>? _unreadSubscription;
  int _totalUnread = 0;
  bool _isUnreadLoading = true;

  @override
  void initState() {
    super.initState();
    _initUnreadTracker();
  }

  Future<void> _initUnreadTracker() async {
    try {
      await _unreadTracker.initialize();

      _unreadSubscription = _unreadTracker.totalUnreadStream.listen((total) {
        if (mounted) {
          setState(() {
            _totalUnread = total;
            _isUnreadLoading = false;
          });
        }
      });

      if (mounted) {
        setState(() {
          _totalUnread = _unreadTracker.currentTotalUnread;
          _isUnreadLoading = false;
        });
      }
    } catch (e) {
      debugPrint('Failed to init unread tracker: $e');
      if (!mounted) return;
      setState(() {
        _isUnreadLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _unreadSubscription?.cancel();
    _unreadTracker.dispose();
    super.dispose();
  }

  Widget _buildMenuButton({
    required String label,
    required VoidCallback onPressed,
    Widget? badge,
  }) {
    final button = ElevatedButton(
      onPressed: onPressed,
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 15),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
      child: Text(label, style: const TextStyle(fontSize: 18)),
    );

    if (badge == null) return button;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        button,
        Positioned(
          right: -6,
          top: -6,
          child: badge,
        ),
      ],
    );
  }

  Widget _buildUnreadBadge() {
    if (_isUnreadLoading) {
      return const SizedBox(
        height: 20,
        width: 20,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }

    if (_totalUnread <= 0) {
      return const SizedBox.shrink();
    }

    final text = _totalUnread > 99 ? '99+' : '$_totalUnread';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.redAccent,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.redAccent.withOpacity(0.4),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'Выберите раздел',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 40),
              _buildMenuButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const TasksScreen()),
                  );
                },
                label: 'Продукты',
              ),
              const SizedBox(height: 20),
              _buildMenuButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const RawMaterialsScreen()),
                  );
                },
                label: 'Сырьё',
              ),
              const SizedBox(height: 20),
              _buildMenuButton(
                onPressed: () async {
                  final result = await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const QRScanScreen()),
                  );
                  if (result != null && context.mounted) {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => RawMaterialDetailsScreen(id: result as String),
                      ),
                    );
                  }
                },
                label: 'Сканировать QR-код',
              ),
              const SizedBox(height: 20),
              _buildMenuButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const PhotoUploadScreen()),
                  );
                },
                label: 'Загрузить фото (датасет)',
              ),
              const SizedBox(height: 20),
              _buildMenuButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const LiveColorCheckScreen()),
                  );
                },
                label: 'Проверка цвета (камера)',
              ),
              const SizedBox(height: 20),
              _buildMenuButton(
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (context) => const ChatListScreen()),
                  );
                  if (mounted) {
                    _unreadTracker.refresh();
                  }
                },
                label: 'Чат',
                badge: _buildUnreadBadge(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

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
        .channel('public:raw_material_tasks')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'raw_material_tasks',
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
          .from('raw_material_tasks')
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
          .from('raw_material_tasks')
          .update({'completed': !task.completed})
          .eq('id', task.id);

      setState(() {
        tasks = tasks.map((t) => t.id == task.id
            ? t.copyWith(completed: !t.completed)
            : t).toList();
      });
    } catch (e) {
      debugPrint('Error updating task: $e');
    }
  }

  Future<void> _updateTaskComment(Task task, String? newComment) async {
    try {
      await Supabase.instance.client
          .from('raw_material_tasks')
          .update({'comment': newComment})
          .eq('id', task.id);

      setState(() {
        tasks = tasks.map((t) => t.id == task.id
            ? t.copyWith(comment: newComment)
            : t).toList();
      });
    } catch (e) {
      debugPrint('Error updating task: $e');
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

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
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
        .channel('public:tasks')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'tasks',
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
          final newTask = Task.fromJson(payload.newRecord);
          tasks.add(newTask);
          tasks.sort((a, b) => b.isImportant == a.isImportant ? 0 : b.isImportant ? 1 : -1);
          break;
        case PostgresChangeEvent.update:
          final updatedTask = Task.fromJson(payload.newRecord);
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
      case 'week':
        return selectedDate.subtract(Duration(days: selectedDate.weekday - 1));
      case 'month':
        return DateTime(selectedDate.year, selectedDate.month, 1);
      default:
        return selectedDate;
    }
  }

  DateTime _getEndDate() {
    switch (viewMode) {
      case 'week':
        final startDate = _getStartDate();
        return startDate.add(const Duration(days: 6));
      case 'month':
        return DateTime(selectedDate.year, selectedDate.month + 1, 0);
      default:
        return selectedDate;
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
          .from('tasks')
          .select()
          .gte('date', DateFormat('yyyy-MM-dd').format(startDate))
          .lte('date', DateFormat('yyyy-MM-dd').format(endDate))
          .order('is_important', ascending: false); // Сортируем по важности

      setState(() {
        tasks = (response as List<dynamic>)
            .map((task) => Task.fromJson(task))
            .toList();
        isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading tasks: $e');
      setState(() {
        isLoading = false;
        error = e.toString();
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading tasks: $e')),
        );
      }
    }
  }

  Future<void> _toggleTaskCompletion(Task task) async {
    try {
      final newStatus = !task.completed;
      
      await Supabase.instance.client
          .from('tasks')
          .update({'completed': newStatus})
          .eq('id', task.id);

      setState(() {
        final taskIndex = tasks.indexWhere((t) => t.id == task.id);
        if (taskIndex != -1) {
          tasks[taskIndex].completed = newStatus;
        }
      });
    } catch (e) {
      debugPrint('Error updating task: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка обновления задачи: $e')),
        );
      }
    }
  }

  Future<void> _updateTaskComment(Task task, String? newComment, [String? newColor]) async {
    try {
      final updateData = {'comment': newComment};
      if (newColor != null) {
        updateData['comment_color'] = newColor;
      }
      await Supabase.instance.client
          .from('tasks')
          .update(updateData)
          .eq('id', task.id);

      setState(() {
        final taskIndex = tasks.indexWhere((t) => t.id == task.id);
        if (taskIndex != -1) {
          tasks[taskIndex] = task.copyWith(comment: newComment, commentColor: newColor ?? task.commentColor);
        }
      });
    } catch (e) {
      debugPrint('Error updating task comment: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка обновления комментария: $e')),
        );
      }
    }
  }

  Future<void> _showCommentDialog(Task task) async {
    final TextEditingController commentController = TextEditingController(text: task.comment);
    // Список популярных цветов
    final List<Color> colorOptions = [
      Color(0xFF775cc1), // Фиолетовый (по умолчанию)
      Color(0xFF2196F3), // Синий
      Color(0xFF4CAF50), // Зеленый
      Color(0xFFFFC107), // Желтый
      Color(0xFFFF5722), // Оранжевый
      Color(0xFFF44336), // Красный
      Color(0xFF9E9E9E), // Серый
    ];
    Color selectedColor = task.commentColor != null && task.commentColor!.isNotEmpty
        ? Color(int.parse(task.commentColor!.replaceFirst('#', '0xff')))
        : colorOptions[0];

    await showDialog(
      context: context,
      builder: (BuildContext context) {
        return StatefulBuilder(
          builder: (context, setState) {
            return AlertDialog(
              title: const Text('Комментарий к задаче'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: commentController,
                    decoration: const InputDecoration(
                      hintText: 'Введите комментарий',
                    ),
                    maxLines: null,
                    keyboardType: TextInputType.multiline,
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: colorOptions.map((color) {
                      return GestureDetector(
                        onTap: () {
                          setState(() {
                            selectedColor = color;
                          });
                        },
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: color,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: selectedColor == color ? Colors.black : Colors.transparent,
                              width: 2,
                            ),
                          ),
                          child: selectedColor == color
                              ? const Icon(Icons.check, color: Colors.white, size: 20)
                              : null,
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: const Text('Отмена'),
                ),
                TextButton(
                  onPressed: () {
                    _updateTaskComment(
                      task,
                      commentController.text.trim(),
                      '#${selectedColor.value.toRadixString(16).substring(2)}',
                    );
                    Navigator.of(context).pop();
                  },
                  child: const Text('Сохранить'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    String periodText;
    switch (viewMode) {
      case 'week':
        final startDate = _getStartDate();
        final endDate = _getEndDate();
        periodText = '${dateFormat.format(startDate)} - ${dateFormat.format(endDate)}';
        break;
      case 'month':
        periodText = DateFormat('MMMM yyyy', 'ru').format(selectedDate);
        break;
      default:
        periodText = dateFormat.format(selectedDate);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Задачи'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.calendar_view_day),
            onSelected: (String mode) {
              setState(() {
                viewMode = mode;
              });
              _loadTasks();
            },
            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
              const PopupMenuItem<String>(
                value: 'day',
                child: Text('День'),
              ),
              const PopupMenuItem<String>(
                value: 'week',
                child: Text('Неделя'),
              ),
              const PopupMenuItem<String>(
                value: 'month',
                child: Text('Месяц'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios),
                  onPressed: () {
                    setState(() {
                      switch (viewMode) {
                        case 'week':
                          selectedDate = selectedDate.subtract(const Duration(days: 7));
                          break;
                        case 'month':
                          selectedDate = DateTime(selectedDate.year, selectedDate.month - 1, 1);
                          break;
                        default:
                          selectedDate = selectedDate.subtract(const Duration(days: 1));
                      }
                    });
                    _loadTasks();
                  },
                ),
                Expanded(
                  child: GestureDetector(
                    onTap: () => _selectDate(context),
                    child: Text(
                      periodText,
                      style: const TextStyle(fontSize: 18),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.arrow_forward_ios),
                  onPressed: () {
                    setState(() {
                      switch (viewMode) {
                        case 'week':
                          selectedDate = selectedDate.add(const Duration(days: 7));
                          break;
                        case 'month':
                          selectedDate = DateTime(selectedDate.year, selectedDate.month + 1, 1);
                          break;
                        default:
                          selectedDate = selectedDate.add(const Duration(days: 1));
                      }
                    });
                    _loadTasks();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('Ошибка: $error'),
                            ElevatedButton(
                              onPressed: _loadTasks,
                              child: const Text('Повторить'),
                            ),
                          ],
                        ),
                      )
                    : tasks.isEmpty
                        ? Center(
                            child: Text(
                              viewMode == 'day'
                                  ? 'Нет задач на выбранную дату'
                                  : viewMode == 'week'
                                      ? 'Нет задач на выбранную неделю'
                                      : 'Нет задач на выбранный месяц',
                            ),
                          )
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
          ),
        ],
      ),
    );
  }
}
