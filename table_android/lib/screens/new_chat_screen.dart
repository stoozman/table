import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../services/local_storage.dart' as chat_storage;

class NewChatScreen extends StatefulWidget {
  const NewChatScreen({super.key});

  @override
  State<NewChatScreen> createState() => _NewChatScreenState();
}

class _NewChatScreenState extends State<NewChatScreen> {
  final TextEditingController _chatNameController = TextEditingController();
  List<Map<String, dynamic>> _availableUsers = [];
  Set<String> _selectedUserIds = {};
  bool _isLoadingUsers = true;
  String? _currentUserId;
  String? _currentUserName;
  bool _isCreating = false;
  bool _useDefaultName = true; // Использовать дефолтное имя для 1:1 чата

  @override
  void initState() {
    super.initState();
    _loadCurrentUserAndUsers();
  }

  Future<void> _loadCurrentUserAndUsers() async {
    try {
      _currentUserId = await chat_storage.ChatUserStorage.getUserId();
      _currentUserName = await chat_storage.ChatUserStorage.getUserName();

      // Сначала убедимся, что текущий пользователь есть в chat_users
      // и что актуальное имя синхронизировано (без дублей)
      await Supabase.instance.client.from('chat_users').upsert(
        {
          'user_id': _currentUserId,
          'user_name': _currentUserName,
        },
        onConflict: 'user_id',
      );

      // Загружаем всех пользователей чата
      final response = await Supabase.instance.client
          .from('chat_users')
          .select()
          .order('user_name', ascending: true);

      setState(() {
        _availableUsers = List<Map<String, dynamic>>.from(response);
        _isLoadingUsers = false;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки пользователей: $e')),
        );
      }
      setState(() => _isLoadingUsers = false);
    }
  }

  Future<void> _createChat() async {
    var chatName = _chatNameController.text.trim();

    // Если выбран 1 участник и используется дефолтное имя, генерируем его автоматически
    if (_selectedUserIds.length == 1 && _useDefaultName && chatName.isEmpty) {
      final selectedUserId = _selectedUserIds.first;
      final selectedUser = _availableUsers.firstWhere(
        (u) => u['user_id'] == selectedUserId,
      );
      chatName = '💬 ${_currentUserName} & ${selectedUser['user_name']}';
    }

    if (chatName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Введите название чата')),
      );
      return;
    }

    if (_selectedUserIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Выберите хотя бы одного участника')),
      );
      return;
    }

    setState(() => _isCreating = true);

    try {
      // 1. Создаём комнату
      final roomResponse = await Supabase.instance.client
          .from('rooms')
          .insert({
            'name': chatName,
            'created_by': _currentUserId,
          })
          .select();

      final roomId = roomResponse[0]['id'] as String;

      // 2. Добавляем текущего пользователя как создателя
      await Supabase.instance.client.from('room_members').insert({
        'room_id': roomId,
        'user_id': _currentUserId,
        'user_name': _currentUserName,
      });

      // 3. Добавляем выбранных пользователей (исключая текущего, если он там есть)
      final membersToAdd = _selectedUserIds
          .where((userId) => userId != _currentUserId) // Исключаем текущего пользователя
          .map((userId) {
        final user = _availableUsers.firstWhere(
          (u) => u['user_id'] == userId,
          orElse: () => {'user_id': userId, 'user_name': 'Unknown'},
        );
        return {
          'room_id': roomId,
          'user_id': userId,
          'user_name': user['user_name'] ?? 'Unknown',
        };
      }).toList();

      if (membersToAdd.isNotEmpty) {
        await Supabase.instance.client
            .from('room_members')
            .insert(membersToAdd);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Чат успешно создан')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка создания чата: $e')),
        );
      }
      // Выводим полную ошибку в консоль для отладки
      debugPrint('=== ПОЛНАЯ ОШИБКА СОЗДАНИЯ ЧАТА ===');
      debugPrint('$e');
      debugPrint('$e');
      if (e is PostgrestException) {
        debugPrint('Код ошибки: ${e.code}');
        debugPrint('Сообщение: ${e.message}');
        debugPrint('Детали: ${e.details}');
      }
      debugPrint('=====================================');
    } finally {
      setState(() => _isCreating = false);
    }
  }

  @override
  void dispose() {
    _chatNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Создать чат'),
      ),
      body: _isLoadingUsers
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Поле для названия чата
                  TextField(
                    controller: _chatNameController,
                    decoration: InputDecoration(
                      labelText: 'Название чата',
                      hintText: _selectedUserIds.length == 1
                          ? '(или оставьте пусто для автоматического имени)'
                          : 'Например: "Проект X"',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      prefixIcon: const Icon(Icons.chat),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Выбор участников
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Выберите участников (${_selectedUserIds.length})',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (_selectedUserIds.length == 1)
                        Chip(
                          label: const Text('1:1 чат'),
                          backgroundColor: Colors.blue[100],
                          side: BorderSide(color: Colors.blue[300]!),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Список пользователей
                  if (_availableUsers.isEmpty)
                    Card(
                      color: Colors.orange[50],
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Нет других пользователей',
                          style: TextStyle(color: Colors.orange[700]),
                        ),
                      ),
                    )
                  else
                    ListView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _availableUsers.length,
                      itemBuilder: (context, index) {
                        final user = _availableUsers[index];
                        final userId = user['user_id'] as String;
                        final userName = user['user_name'] as String;
                        final isCurrentUser = userId == _currentUserId;
                        final isSelected = _selectedUserIds.contains(userId);

                        return CheckboxListTile(
                          title: Text(userName),
                          subtitle: isCurrentUser ? const Text('(вы)') : null,
                          value: isSelected,
                          enabled: true,
                          onChanged: (bool? value) {
                            setState(() {
                              if (value == true) {
                                _selectedUserIds.add(userId);
                                // Если выбран 1 пользователь, автоматически очистим поле названия для авто-генерации
                                if (_selectedUserIds.length == 1) {
                                  _useDefaultName = true;
                                }
                              } else {
                                _selectedUserIds.remove(userId);
                              }
                            });
                          },
                        );
                      },
                    ),
                  const SizedBox(height: 24),

                  // Кнопка создания
                  ElevatedButton(
                    onPressed: _isCreating ? null : _createChat,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: _isCreating
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Создать чат'),
                  ),
                ],
              ),
            ),
    );
  }
}
