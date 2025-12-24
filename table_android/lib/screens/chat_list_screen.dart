// chat_list_screen.dart - вернем как было (без RealtimeManager)
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import '../models/room.dart';
import '../services/session_service.dart';
import '../services/chat_unread_service.dart';
import '../main.dart';
import 'chat_screen.dart';
import 'new_chat_screen.dart';
import 'auth_wrapper.dart';

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
  RealtimeChannel? _roomsSubscription;
  Set<String> _currentRoomIds = {};

  static const Duration _supabaseTimeout = Duration(seconds: 30);

  bool _isHydrating = false;

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

  void _hydrateRooms(List<String> roomIds) {
    if (_currentUserId == null) return;
    if (_isHydrating) return;
    if (roomIds.isEmpty) return;

    _isHydrating = true;
    () async {
      try {
        final String userId = _currentUserId!;

        final unreadMapFuture = ChatUnreadService.fetchUnreadCounts(userId, roomIds)
            .timeout(_supabaseTimeout);

        final detailFutures = roomIds.map((roomId) async {
          int? memberCountValue;
          String? lastMessageText;
          DateTime? lastMessageTime;

          try {
            final memberCount = await Supabase.instance.client
                .from('room_members')
                .select('user_id')
                .eq('room_id', roomId)
                .count(CountOption.exact)
                .timeout(_supabaseTimeout);
            memberCountValue = memberCount.count;
          } catch (e) {
            debugPrint(
                'ChatListScreen: failed to load memberCount for room=$roomId: $e');
          }

          try {
            final messagesResponse = await Supabase.instance.client
                .from('messages')
                .select('text_content, created_at')
                .eq('room_id', roomId)
                .eq('deleted', false)
                .order('created_at', ascending: false)
                .limit(1)
                .timeout(_supabaseTimeout);

            if (messagesResponse.isNotEmpty) {
              lastMessageText = messagesResponse[0]['text_content'] as String?;
              lastMessageTime = DateTime.parse(
                messagesResponse[0]['created_at'] as String,
              );
            }
          } catch (e) {
            debugPrint(
                'ChatListScreen: failed to load lastMessage for room=$roomId: $e');
          }

          return <String, dynamic>{
            'room_id': roomId,
            'memberCount': memberCountValue,
            'lastMessageText': lastMessageText,
            'lastMessageTime': lastMessageTime,
          };
        }).toList();

        final results = await Future.wait<dynamic>([
          unreadMapFuture,
          Future.wait<Map<String, dynamic>>(detailFutures),
        ]);

        final unreadMap = results[0] as Map<String, int>;
        final details = results[1] as List<Map<String, dynamic>>;

        if (!mounted) return;
        setState(() {
          for (final d in details) {
            final roomId = d['room_id'] as String;
            rooms = rooms.map((room) {
              if (room.id != roomId) return room;
              return room.copyWith(
                memberCount: d['memberCount'] as int?,
                lastMessageText: d['lastMessageText'] as String?,
                lastMessageTime: d['lastMessageTime'] as DateTime?,
                unreadCount: unreadMap[roomId] ?? room.unreadCount,
              );
            }).toList();
          }
        });
      } catch (e) {
        debugPrint('ChatListScreen: hydrate failed: $e');
      } finally {
        _isHydrating = false;
      }
    }();
  }

  Future<void> _loadUserAndRooms() async {
    if (!mounted) return;
    try {
      _currentUserId = await SessionService.getCurrentUserId();
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

      // Получаем комнаты, в которых пользователь состоит.
      // Не используем PostgREST join (rooms!inner), т.к. он требует FK relationship.
      final membersResponse = await Supabase.instance.client
          .from('room_members')
          .select('room_id, joined_at')
          .eq('user_id', _currentUserId!)
          .order('joined_at', ascending: false)
          .timeout(_supabaseTimeout);

      final List<String> roomIds = membersResponse
          .map<String>((row) => row['room_id'] as String)
          .toList();

      if (roomIds.isEmpty) {
        if (!mounted) return;
        setState(() {
          rooms = [];
          isLoading = false;
          error = null;
          _currentRoomIds = {};
        });
        return;
      }

      final roomsResponse = await Supabase.instance.client
          .from('rooms')
          .select('id, name, created_by, created_at, updated_at, color')
          .inFilter('id', roomIds)
          .timeout(_supabaseTimeout);

      final roomsById = <String, Room>{
        for (final row in (roomsResponse as List))
          (row['id'] as String): Room.fromJson(row as Map<String, dynamic>),
      };

      final List<Room> loadedRooms = roomIds
          .map((roomId) => roomsById[roomId])
          .whereType<Room>()
          .toList();

      if (!mounted) return;
      setState(() {
        rooms = loadedRooms;
        isLoading = false;
        error = null;
        _currentRoomIds = loadedRooms.map((room) => room.id).toSet();
      });

      _hydrateRooms(roomIds);

      if (resubscribe && mounted) {
        _subscribeToMessages();
        _subscribeToRooms();
      }
    } catch (e) {
      if (e is TimeoutException) {
        if (!mounted) return;
        setState(() {
          isLoading = false;
          if (rooms.isEmpty) {
            error =
                'Таймаут при загрузке чатов. Проверь интернет и доступность Supabase.';
          } else {
            error = null;
          }
        });
        return;
      }
      final errorString = e.toString();
      if (errorString.contains('no rows') ||
          errorString.contains('Empty result') ||
          errorString.contains('PostgrestException')) {
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

  void _subscribeToMessages() {
    if (_currentUserId == null) return;

    print('[CHATLIST] Creating subscription');

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

      print('[CHATLIST] Subscription created');
    } catch (e) {
      print('[CHATLIST] Error: $e');
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) _subscribeToMessages();
      });
    }
  }

  void _subscribeToRooms() {
    if (_currentUserId == null) return;

    print('[CHATLIST] Creating rooms subscription');

    // Отписываемся от старой
    _roomsSubscription?.unsubscribe();

    try {
      _roomsSubscription = Supabase.instance.client
          .channel('public:rooms_updates')
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'rooms',
            callback: (payload) {
              if (!mounted) return;
              final rec = payload.newRecord;
              final roomId = rec['id'] as String?;
              if (roomId == null) return;
              if (!_currentRoomIds.contains(roomId)) return;

              print('[CHATLIST] Room updated: $roomId');

              // Update local room entry (color and name, etc.)
              setState(() {
                rooms = rooms.map((room) {
                  if (room.id != roomId) return room;
                  return room.copyWith(
                    name: rec['name'] as String? ?? room.name,
                    memberCount: rec['member_count'] as int? ?? room.memberCount,
                    color: rec['color'] as String? ?? room.color,
                  );
                }).toList();
              });
            },
          )
          .subscribe((status, err) {
            print('[CHATLIST] Rooms subscription status: $status');
            if (err != null) print('[CHATLIST] Error: ${err.toString()}');
          });

      print('[CHATLIST] Rooms subscription created');
    } catch (e) {
      print('[CHATLIST] Rooms subscription error: $e');
      Future.delayed(const Duration(seconds: 5), () {
        if (mounted) _subscribeToRooms();
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

    // Обновляем текущий набор ID комнат
    _currentRoomIds = rooms.map((room) => room.id).toSet();

    // Затем делаем полное обновление
    await _refreshRoom(roomId); // Добавим await чтобы дождаться завершения
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
    final unreadCount = unreadCountResponse.count ?? 0;

    // Добавим лог для отладки
    print('[REFRESH] Calculated unread count: $unreadCount for room $roomId');
    
    // Используем setState для обновления UI
    if (!mounted) return;
    setState(() {
      rooms = rooms.map((room) {
        if (room.id != roomId) return room;
        
        print('[REFRESH] Updating room $roomId with unread count: $unreadCount');
        print('[REFRESH] Previous unread count: ${room.unreadCount}');
        
        return room.copyWith(
          lastMessageText: (lastText != null && lastText.isNotEmpty)
              ? lastText
              : room.lastMessageText,
          lastMessageTime: createdAt ?? room.lastMessageTime,
          unreadCount: unreadCount, // Важно: используем вычисленное значение
        );
      }).toList();
      
      // После обновления выводим текущее состояние
      final updatedRoom = rooms.firstWhere(
        (r) => r.id == roomId,
        orElse: () => Room(id: '', name: '', createdBy: '', createdAt: DateTime.now())
      );
      print('[REFRESH] After update - room $roomId unread: ${updatedRoom.unreadCount}');
    });
    
  } catch (e) {
    print('Failed to refresh room $roomId: $e');
  }
}

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _realtimeSubscription?.unsubscribe();
    _roomsSubscription?.unsubscribe();
    super.dispose();
  }

  Color? _colorFromHex(String? hex) {
    if (hex == null || hex.isEmpty) return null;
    try {
      var cleaned = hex.replaceFirst('#', '');
      if (cleaned.length == 6) return Color(int.parse('0xff$cleaned'));
      if (cleaned.length == 8) return Color(int.parse('0x$cleaned'));
    } catch (_) {}
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Чаты'),
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await SessionService.logout();
              if (mounted) {
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const AuthWrapper()),
                  (route) => false,
                );
              }
            },
          ),
        ],
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
                              leading: CircleAvatar(
                                backgroundColor: _colorFromHex(room.color) ?? Colors.grey[300],
                                child: Text(
                                  room.name.isNotEmpty ? room.name[0].toUpperCase() : '?',
                                  style: TextStyle(
                                      color: _colorFromHex(room.color) != null ? Colors.white : Colors.black),
                                ),
                                radius: 18,
                              ),
                              onTap: () {
                                Navigator.push(
                                  context,
                                  MaterialPageRoute(
                                    builder: (context) => ChatScreen(room: room),
                                  ),
                                ).then((_) {
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
}