import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import '../models/room.dart';
import '../services/local_storage.dart' as chat_storage;
import '../services/chat_unread_service.dart';
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
  RealtimeChannel? _realtimeSubscription;
  Set<String> _currentRoomIds = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    
    // Проверяем статус Supabase клиента при запуске
    print('[CHATLIST] Supabase client status: ${Supabase.instance.client.auth.currentSession}');
    print('[CHATLIST] Supabase realtime status: ${Supabase.instance.client.realtime.isConnected}');
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
    if (!mounted) return;
    try {
      _currentUserId = await chat_storage.ChatUserStorage.getUserId();
      await _loadRooms();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        isLoading = false;
        error = 'Ошибка загрузки: $e';
      });
    }
  }

  Future<void> _loadRooms({bool resubscribe = true}) async {
    if (!mounted) return;
    try {
      if (!mounted) return;
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
      final List<String> roomIds = [];

      for (var item in response) {
        final roomData = item['rooms'] as Map<String, dynamic>;
        final room = Room.fromJson(roomData);
        roomIds.add(room.id);

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

      if (roomIds.isNotEmpty) {
        final unreadMap =
            await ChatUnreadService.fetchUnreadCounts(_currentUserId!, roomIds);
        loadedRooms = loadedRooms
            .map(
              (room) => room.copyWith(
                unreadCount: unreadMap[room.id] ?? 0,
              ),
            )
            .toList();
      }

      if (!mounted) return;
      setState(() {
        rooms = loadedRooms;
        isLoading = false;
        error = null;
        _currentRoomIds = loadedRooms.map((room) => room.id).toSet();
      });
      print('[LOAD] Rooms loaded: ${rooms.length}');
      print('[LOAD] Current room ids: $_currentRoomIds');
      
      // ОДИН вызов подписки после загрузки комнат
      if (resubscribe && mounted) {
        _subscribeToMessages();
      }
    } catch (e) {
      // Если ошибка о том, что нет данных - это нормально (просто нет комнат)
      // Если реальная ошибка - покажем её
      final errorString = e.toString();
      if (errorString.contains('no rows') || 
          errorString.contains('Empty result') ||
          errorString.contains('PostgrestException')) {
        // Комнат нет - это нормально, показываем пустой список
        if (!mounted) return;
        setState(() {
          rooms = [];
          isLoading = false;
          error = null;
        });
      } else {
        if (!mounted) return;
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
    _realtimeSubscription?.unsubscribe();
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
                                  if (mounted) {
                                    _loadRooms();
                                  }
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
                              trailing: room.unreadCount > 0
                                  ? _buildUnreadBadge(room.unreadCount)
                                  : const Icon(Icons.chevron_right),
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
          ).then((_) {
            if (mounted) {
              _loadRooms();
            }
          });
        },
        tooltip: 'Создать чат',
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildUnreadBadge(int count) {
    final display = count > 99 ? '99+' : '$count';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.redAccent,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.redAccent.withOpacity(0.3),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        display,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  void _subscribeToMessages() {
    if (_currentUserId == null) return;

    print('[REALTIME] Creating subscription for ChatListScreen');

    // Если уже есть активная подписка - ничего не делаем
    if (_realtimeSubscription != null) {
      print('[REALTIME] Subscription already exists and is active');
      return;
    }

    // Отписываемся от старой
    _realtimeSubscription?.unsubscribe();

    try {
      _realtimeSubscription = Supabase.instance.client
          .channel('chat_list_${_currentUserId!}')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'messages',
            callback: (payload) {
              if (!mounted) return;
              print('[CHATLIST] ✅ INSERT event received');

              final record = payload.newRecord;

              final roomId = record['room_id'] as String?;
              final senderId = record['user_id'] as String?;
              if (roomId == null || senderId == _currentUserId) return;

              print('[CHATLIST] New message from other user in room $roomId');

              // Немедленно обновляем счетчик
              if (_currentRoomIds.contains(roomId)) {
                _refreshRoomImmediately(roomId);
              }
            },
          )
          .subscribe(
            (status, err) {
              print('[CHATLIST] Subscription status: $status');
              if (err != null) print('[CHATLIST] Error: ${err.toString()}');
            },
          );

      print('[REALTIME] Subscription created');
    } catch (e) {
      print('[REALTIME] Error: $e');
      // Попробовать переподписаться через 5 секунд
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) _subscribeToMessages();
      });
    }
  }

  Future<void> _refreshRoomImmediately(String roomId) async {
    if (_currentUserId == null) return;

    try {
      // Просто увеличиваем счетчик на 1 локально
      setState(() {
        rooms = rooms.map((room) {
          if (room.id == roomId) {
            final newCount = room.unreadCount + 1;
            print('[IMMEDIATE] Room $roomId: ${room.unreadCount} -> $newCount');
            return room.copyWith(unreadCount: newCount);
          }
          return room;
        }).toList();
      });

      // Затем делаем полное обновление (асинхронно)
      _refreshRoom(roomId);
    } catch (e) {
      print('[IMMEDIATE] Error: $e');
    }
  }

  Future<void> _refreshRoom(String roomId) async {
    if (_currentUserId == null) return;
    print('[REFRESH] Starting refresh for room $roomId');

    try {
      final latestMessageFuture = Supabase.instance.client
          .from('messages')
          .select('text_content, created_at')
          .eq('room_id', roomId)
          .eq('deleted', false)
          .order('created_at', ascending: false)
          .limit(1)
          .maybeSingle();

      final readStateFuture = Supabase.instance.client
          .from('room_read_states')
          .select('last_read_at')
          .eq('room_id', roomId)
          .eq('user_id', _currentUserId!)
          .maybeSingle();

      final results = await Future.wait<dynamic>([
        latestMessageFuture,
        readStateFuture,
      ]);

      final latestMessage = results[0] as Map<String, dynamic>?;
      final readState = results[1] as Map<String, dynamic>?;

      final lastText = latestMessage?['text_content'] as String?;
      final createdAtRaw = latestMessage?['created_at'] as String?;
      final DateTime? createdAt =
          createdAtRaw != null ? DateTime.parse(createdAtRaw) : null;

      final lastReadAtRaw = readState?['last_read_at'] as String?;
      final DateTime? lastReadAt =
          lastReadAtRaw != null ? DateTime.parse(lastReadAtRaw) : null;

      var unreadQuery = Supabase.instance.client
          .from('messages')
          .select('id')
          .eq('room_id', roomId)
          .eq('deleted', false)
          .neq('user_id', _currentUserId!);

      if (lastReadAt != null) {
        unreadQuery = unreadQuery.gt('created_at', lastReadAt.toIso8601String());
      }

      final unreadCountResponse = await unreadQuery.count(CountOption.exact);
      final unreadCount = unreadCountResponse.count;

      // Room is not active-aware now; use calculated unread count
      final int finalUnreadCount = unreadCount;
      print('[REFRESH] Room is not active-aware, using unread count: $unreadCount');
      print('[REFRESH] Latest message: $lastText at $createdAt');
      print('[REFRESH] Read state: $lastReadAt');
      print('[REFRESH] Unread count query result: $unreadCount');
      print('[REFRESH] Final unread count to set: $finalUnreadCount');
      final oldRoom =
          rooms.firstWhere((r) => r.id == roomId, orElse: () => Room(id: '', name: '', createdBy: '', createdAt: DateTime.now()));
      print('[REFRESH] Old unread count for this room: ${oldRoom.unreadCount}');
      print('[REFRESH] New unread count calculated: $unreadCount');
      print('[REFRESH] Will set unread to: $finalUnreadCount');

      if (!mounted) return;
      setState(() {
        rooms = rooms.map((room) {
          if (room.id != roomId) return room;
          return room.copyWith(
            lastMessageText: (lastText != null && lastText.isNotEmpty)
                ? lastText
                : room.lastMessageText,
            lastMessageTime: createdAt ?? room.lastMessageTime,
            unreadCount: finalUnreadCount,
          );
        }).toList();
      });
    } catch (e) {
      print('Failed to refresh room $roomId: $e');
    }
  }
}
