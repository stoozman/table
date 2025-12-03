import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import '../models/room.dart';
import '../services/local_storage.dart' as chat_storage;
import 'chat_screen.dart';
import 'new_chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen>
    with WidgetsBindingObserver {
  List<Room> rooms = [];
  bool isLoading = true;
  String? error;
  String? _currentUserId;
  final dateFormat = DateFormat('dd.MM.yyyy HH:mm');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadUserAndRooms();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      debugPrint('ChatListScreen resumed - reloading rooms');
      _loadRooms();
    }
  }

  Future<void> _loadUserAndRooms() async {
    try {
      _currentUserId = await chat_storage.ChatUserStorage.getUserId();
      await _loadRooms();
    } catch (e) {
      setState(() {
        isLoading = false;
        error = 'Ошибка загрузки: $e';
      });
    }
  }

  Future<void> _loadRooms() async {
    try {
      setState(() {
        isLoading = true;
        error = null;
      });

      // Получаем комнаты, в которых пользователь состоит
      final response = await Supabase.instance.client
          .from('room_members')
          .select(
            '''
            room_id,
            rooms!inner(id, name, created_by, created_at, updated_at)
            '''
          )
          .eq('user_id', _currentUserId!)
          .order('joined_at', ascending: false);

      List<Room> loadedRooms = [];

      for (var item in response) {
        final roomData = item['rooms'] as Map<String, dynamic>;
        final room = Room.fromJson(roomData);

        // Получаем количество участников
        final memberCount = await Supabase.instance.client
            .from('room_members')
            .select('user_id')
            .eq('room_id', room.id)
            .count(CountOption.exact);

        // Получаем последнее сообщение
        final messagesResponse = await Supabase.instance.client
            .from('messages')
            .select('text_content, created_at')
            .eq('room_id', room.id)
            .eq('deleted', false)
            .order('created_at', ascending: false)
            .limit(1);

        String? lastMessageText;
        DateTime? lastMessageTime;

        if (messagesResponse.isNotEmpty) {
          lastMessageText = messagesResponse[0]['text_content'] as String?;
          lastMessageTime = DateTime.parse(
            messagesResponse[0]['created_at'] as String,
          );
        }

        loadedRooms.add(
          room.copyWith(
            memberCount: memberCount.count,
            lastMessageText: lastMessageText,
            lastMessageTime: lastMessageTime,
          ),
        );
      }

      setState(() {
        rooms = loadedRooms;
        isLoading = false;
        error = null;
      });
    } catch (e) {
      // Если ошибка о том, что нет данных - это нормально (просто нет комнат)
      // Если реальная ошибка - покажем её
      final errorString = e.toString();
      if (errorString.contains('no rows') || 
          errorString.contains('Empty result') ||
          errorString.contains('PostgrestException')) {
        // Комнат нет - это нормально, показываем пустой список
        setState(() {
          rooms = [];
          isLoading = false;
          error = null;
        });
      } else {
        setState(() {
          isLoading = false;
          error = 'Ошибка загрузки комнат: $e';
        });
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Чаты'),
        elevation: 0,
      ),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(error!),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _loadUserAndRooms,
                        child: const Text('Повторить'),
                      ),
                    ],
                  ),
                )
              : rooms.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.chat_bubble_outline,
                            size: 64,
                            color: Colors.grey[400],
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Нет чатов',
                            style: TextStyle(
                              fontSize: 18,
                              color: Colors.grey[600],
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Создайте новый чат, чтобы начать общение',
                            style: TextStyle(
                              fontSize: 14,
                              color: Colors.grey[500],
                            ),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadRooms,
                      child: ListView.builder(
                        itemCount: rooms.length,
                        itemBuilder: (context, index) {
                          final room = rooms[index];
                          return Card(
                            margin: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            child: ListTile(
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (context) => ChatScreen(room: room),
                                  ),
                                ).then((_) {
                                  // После возвращения со страницы чата перезагружаем комнаты
                                  _loadRooms();
                                });
                              },
                              title: Text(
                                room.name,
                                style:
                                    const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  if (room.lastMessageText != null)
                                    Text(
                                      room.lastMessageText!,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        color: Colors.grey[600],
                                        fontSize: 13,
                                      ),
                                    ),
                                  const SizedBox(height: 4),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        '${room.memberCount} участник${room.memberCount != 1 ? 'ов' : ''}',
                                        style: TextStyle(
                                          fontSize: 12,
                                          color: Colors.grey[500],
                                        ),
                                      ),
                                      if (room.lastMessageTime != null)
                                        Text(
                                          dateFormat.format(room.lastMessageTime!),
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.grey[500],
                                          ),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                              trailing: const Icon(Icons.chevron_right),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => const NewChatScreen()),
          ).then((_) => _loadRooms());
        },
        tooltip: 'Создать чат',
        child: const Icon(Icons.add),
      ),
    );
  }
}
