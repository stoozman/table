import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import '../models/message.dart';
import '../models/room.dart';
import '../services/local_storage.dart' as chat_storage;
import '../services/chat_unread_service.dart';
import '../services/realtime_manager.dart';

class ChatScreen extends StatefulWidget {
  final Room room;

  const ChatScreen({super.key, required this.room});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _messageController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final ImagePicker _imagePicker = ImagePicker();

  List<Message> messages = [];
  bool isLoading = true;
  String? error;
  Function(PostgresChangePayload)? _roomListener;
  bool isUploading = false;
  String? _currentUserId;
  String? _currentUserName;
  final dateFormat = DateFormat('HH:mm');
  final dateFormatFull = DateFormat('dd.MM.yyyy HH:mm');
  
  // Polling fallback for realtime
  DateTime? _lastMessageTime;
  Timer? _pollTimer;
  bool _isPolling = false;
  
  // Variables for new message notifications
  int _unreadMessageCount = 0;
  bool _showNewMessageIndicator = false;
  bool _isUserAtBottom = true;
  String? _lastReadMessageId;

  @override
  void initState() {
    super.initState();
    debugPrint('=== CHAT SCREEN INIT ===');
    debugPrint('Room: ${widget.room.name} (ID: ${widget.room.id})');
    _loadCurrentUserAndMessages();
    _subscribeToMessages();
    
    // Add scroll listener to track user position
    _scrollController.addListener(_onScroll);
  }

  Future<void> _loadCurrentUserAndMessages() async {
    try {
      _currentUserId = await chat_storage.ChatUserStorage.getUserId();
      _currentUserName = await chat_storage.ChatUserStorage.getUserName();
      await _loadMessages();
    } catch (e) {
      setState(() {
        isLoading = false;
        error = 'Ошибка загрузки: $e';
      });
    }
  }

  Future<void> _markRoomAsRead() async {
    if (_currentUserId == null || messages.isEmpty) return;
    final latest = messages.lastWhere(
      (m) => !m.deleted,
      orElse: () => messages.last,
    );
    if (latest.id == _lastReadMessageId) return;
    try {
      await ChatUnreadService.markRoomAsRead(
        roomId: widget.room.id,
        userId: _currentUserId!,
        lastMessageAt: latest.createdAt,
        lastMessageId: latest.id,
      );
      _lastReadMessageId = latest.id;
    } catch (e) {
      debugPrint('Failed to mark room as read: $e');
    }
  }

  void _subscribeToMessages() {
    try {
      debugPrint('Subscribing to messages for room ${widget.room.id}');
      final listener = (PostgresChangePayload payload) {
        debugPrint('=== REALTIME EVENT VIA MANAGER ===');
        _handleRealtimeEvent(payload);
      };
      _roomListener = listener;
      RealtimeManager().addRoomListener(widget.room.id, listener);
      debugPrint('Subscription via RealtimeManager successful');
    } catch (e) {
      debugPrint('Exception in _subscribeToMessages: $e');
    }
    // Start polling as a fallback (will be idle if realtime works)
    _startPolling();
  }

  void _startPolling() {
    if (_isPolling) return;
    _isPolling = true;
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      _pollNewMessages();
    });
    debugPrint('Polling started');
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _isPolling = false;
    debugPrint('Polling stopped');
  }

  Future<void> _pollNewMessages() async {
    try {
      // Получаем ВСЕ сообщения в комнате (не только новые) - но только не удаленные
      final List<dynamic> resp = await Supabase.instance.client
          .from('messages')
          .select()
          .eq('room_id', widget.room.id)
          .eq('deleted', false)  // Исключаем удаленные сообщения
          .order('created_at', ascending: true);

      if (resp.isNotEmpty) {
        final fetchedMessages = resp.map((j) => Message.fromJson(j)).toList();
        
        // Проверяем, был ли пользователь в конце списка перед обновлением
        final wasAtBottom = _scrollController.hasClients &&
            _scrollController.position.pixels >=
                _scrollController.position.maxScrollExtent - 100;
        
        // Синхронизируем с локальным списком
        int newMessageCount = 0;
        setState(() {
          // Проходим по каждому загруженному сообщению
          for (final fetchedMsg in fetchedMessages) {
            final existingIndex = messages.indexWhere((m) => m.id == fetchedMsg.id);
            
            if (existingIndex != -1) {
              // Сообщение уже есть - обновляем если изменилось
              if (messages[existingIndex].textContent != fetchedMsg.textContent ||
                  messages[existingIndex].deleted != fetchedMsg.deleted ||
                  messages[existingIndex].editedAt != fetchedMsg.editedAt) {
                messages[existingIndex] = fetchedMsg;
                debugPrint('Polling: updated message ${fetchedMsg.id}');
              }
            } else {
              // Новое сообщение - добавляем
              messages.add(fetchedMsg);
              newMessageCount++;
              debugPrint('Polling: added new message ${fetchedMsg.id}');
            }
          }
          
          // Удаляем локальные сообщения которых больше нет в БД (или они помечены как удаленные)
          messages.removeWhere((localMsg) {
            final exists = fetchedMessages.any((m) => m.id == localMsg.id);
            if (!exists) {
              debugPrint('Polling: removed message ${localMsg.id} (not in DB or deleted)');
            }
            return !exists;
          });
          
          // Обновляем счетчик новых сообщений если пользователь не в конце
          if (newMessageCount > 0 && !_isUserAtBottom) {
            _unreadMessageCount += newMessageCount;
            _showNewMessageIndicator = true;
          }
        });
        
        // Скроллим вниз только если было новое сообщение И пользователь был внизу
        if (newMessageCount > 0 && wasAtBottom) {
          _scrollToBottom();
          _markRoomAsRead();
        }
        
        if (fetchedMessages.isNotEmpty) {
          _lastMessageTime = fetchedMessages.last.createdAt;
        }
      }
    } catch (e) {
      debugPrint('Polling error: $e');
    }
  }

  void _handleRealtimeEvent(PostgresChangePayload payload) {
    if (!mounted) {
      debugPrint('Widget not mounted, ignoring event');
      return;
    }

    final roomId = widget.room.id;
    
    // Для INSERT: используем newRecord
    // Для UPDATE и DELETE: используем oldRecord чтобы получить ID
    final record = payload.eventType == PostgresChangeEvent.delete 
        ? payload.oldRecord 
        : payload.newRecord;
    
    final eventRoomId = record['room_id'] as String?;
    final messageId = record['id'] as String?;

    debugPrint('Event type: ${payload.eventType}');
    debugPrint('Event room ID: $eventRoomId');
    debugPrint('Current room ID: $roomId');
    debugPrint('Message ID: $messageId');

    // Проверяем, что это сообщение из текущего чата
    if (eventRoomId != roomId) {
      debugPrint('✗ Message ignored: room mismatch');
      return;
    }

    if (payload.eventType == PostgresChangeEvent.insert) {
      try {
        final newMessage = Message.fromJson(payload.newRecord);
        debugPrint('Parsed message: ID=${newMessage.id}, Room=${newMessage.roomId}, Text=${newMessage.textContent}');

        if (!newMessage.deleted) {
          setState(() {
            final exists = messages.any((m) => m.id == newMessage.id);
            debugPrint('Message already in list: $exists');
            
            if (!exists) {
              messages.add(newMessage);
              debugPrint('✓ Message added! Total: ${messages.length}');
            }
          });
          
          // Скроллим вниз только если это наше сообщение
          if (newMessage.userId == _currentUserId || _isUserAtBottom) {
            _scrollToBottom();
            _markRoomAsRead();
          } else {
            setState(() {
              _unreadMessageCount += 1;
              _showNewMessageIndicator = true;
            });
          }
        } else {
          debugPrint('✗ Message ignored: deleted');
        }
      } catch (e) {
        debugPrint('Error parsing message: $e');
      }
    } else if (payload.eventType == PostgresChangeEvent.update) {
      // Обновление сообщения
      try {
        final updatedMessage = Message.fromJson(payload.newRecord);
        debugPrint('Message updated: ID=${updatedMessage.id}, deleted=${updatedMessage.deleted}');

        setState(() {
          final index = messages.indexWhere((m) => m.id == updatedMessage.id);
          if (index != -1) {
            if (updatedMessage.deleted) {
              // Если помечено как удаленное, удаляем из списка
              messages.removeAt(index);
              debugPrint('✓ Message removed (marked as deleted)');
            } else {
              // Обновляем содержимое
              messages[index] = updatedMessage;
              debugPrint('✓ Message updated at index $index');
            }
          } else {
            debugPrint('✗ Message not found in local list');
          }
        });
        if (_isUserAtBottom) {
          _markRoomAsRead();
        }
      } catch (e) {
        debugPrint('Error parsing updated message: $e');
      }
    } else if (payload.eventType == PostgresChangeEvent.delete) {
      // Удаление сообщения
      debugPrint('Message deleted: ID=$messageId');
      
      setState(() {
        messages.removeWhere((m) => m.id == messageId);
        debugPrint('✓ Message removed! Total: ${messages.length}');
      });
      if (_isUserAtBottom) {
        _markRoomAsRead();
      }
    }
  }

  Future<void> _loadMessages() async {
    try {
      setState(() {
        isLoading = true;
        error = null;
      });

      final response = await Supabase.instance.client
          .from('messages')
          .select()
          .eq('room_id', widget.room.id)
          .eq('deleted', false)
          .order('created_at', ascending: true);

      setState(() {
        messages = (response as List)
            .map((json) => Message.fromJson(json))
            .toList();
        isLoading = false;
      });
      
      if (messages.isNotEmpty) {
        _lastMessageTime = messages.last.createdAt;
        debugPrint('Loaded ${messages.length} messages. Last: $_lastMessageTime');
        _markRoomAsRead();
      }
      _scrollToBottom();
    } catch (e) {
      setState(() {
        isLoading = false;
        error = 'Ошибка загрузки сообщений: $e';
      });
    }
  }

  Future<void> _sendMessage(String text) async {
    if (text.isEmpty) return;

    try {
      final List<dynamic> resp = await Supabase.instance.client
          .from('messages')
          .insert({
            'room_id': widget.room.id,
            'user_id': _currentUserId,
            'user_name': _currentUserName,
            'text_content': text,
          })
          .select();

      _messageController.clear();

      if (resp.isNotEmpty) {
        try {
          final created = Message.fromJson(resp[0]);
          setState(() {
            // add locally so user sees it immediately
            messages.add(created);
          });
          _scrollToBottom();
          if (_currentUserId != null && messages.isNotEmpty) {
            final latest = messages.last;
            try {
              await ChatUnreadService.markRoomAsRead(
                roomId: widget.room.id,
                userId: _currentUserId!,
                lastMessageAt: latest.createdAt,
                lastMessageId: latest.id,
              );
              _lastReadMessageId = latest.id;
              debugPrint(
                  '[MARK_READ] Forced room as read after sending message: ${latest.id}');
            } catch (e) {
              debugPrint('[MARK_READ] Failed to mark room as read: $e');
            }
          }
        } catch (e) {
          debugPrint('Failed to parse created message: $e');
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка отправки: $e')),
        );
      }
    }
  }

  Future<void> _pickAndUploadMedia(String mediaType) async {
    try {
      XFile? file;

      if (mediaType == 'photo') {
        file = await _imagePicker.pickImage(source: ImageSource.gallery);
      } else if (mediaType == 'video') {
        file = await _imagePicker.pickVideo(source: ImageSource.gallery);
      }

      if (file == null) return;

      setState(() => isUploading = true);

      // Загружаем файл в Supabase Storage
      final fileName = '${DateTime.now().millisecondsSinceEpoch}_${file.name}';
      final storagePath = 'chat/${widget.room.id}/$_currentUserId/$fileName';

      final fileBytes = await file.readAsBytes();

      await Supabase.instance.client.storage
          .from('documents')
          .uploadBinary(
            storagePath,
            fileBytes,
            fileOptions: const FileOptions(cacheControl: '3600', upsert: false),
          );

      // Получаем публичный URL
      final publicUrl = Supabase.instance.client.storage
          .from('documents')
          .getPublicUrl(storagePath);

      // Сохраняем сообщение с медиа в БД
      final List<dynamic> resp = await Supabase.instance.client.from('messages').insert({
        'room_id': widget.room.id,
        'user_id': _currentUserId,
        'user_name': _currentUserName,
        'media_type': mediaType,
        'media_url': publicUrl,
        'file_name': file.name,
      }).select();

      if (resp.isNotEmpty) {
        try {
          final created = Message.fromJson(resp[0]);
          setState(() {
            messages.add(created);
          });
          _scrollToBottom();
        } catch (e) {
          debugPrint('Failed to parse created media message: $e');
        }
      }

      setState(() => isUploading = false);
    } catch (e) {
      setState(() => isUploading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка загрузки медиа: $e')),
        );
      }
    }
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        // Прокручиваем с небольшим отступом чтобы строка ввода не перекрывала сообщение
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent + 80,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    
    final isAtBottom = _scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 100;
    
    if (isAtBottom != _isUserAtBottom) {
      setState(() {
        _isUserAtBottom = isAtBottom;
        // If user scrolled to bottom, hide indicator and reset count
        if (isAtBottom) {
          _showNewMessageIndicator = false;
          _unreadMessageCount = 0;
        }
      });
      if (isAtBottom) {
        _markRoomAsRead();
      }
    }
  }

  Widget _buildNewMessageIndicator() {
    if (!_showNewMessageIndicator || _unreadMessageCount == 0) {
      return const SizedBox.shrink();
    }

    return Positioned(
      top: 8,
      right: 8,
      child: GestureDetector(
        onTap: () {
          _scrollToBottom();
          setState(() {
            _showNewMessageIndicator = false;
            _unreadMessageCount = 0;
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.blue,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.2),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.arrow_downward,
                color: Colors.white,
                size: 16,
              ),
              const SizedBox(width: 4),
              Text(
                _unreadMessageCount > 1 
                    ? '${_unreadMessageCount} новых' 
                    : 'Новое сообщение',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _deleteRoom() async {
    // Проверяем, что текущий пользователь - создатель чата
    if (_currentUserId != widget.room.createdBy) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Только создатель может удалить чат')),
        );
      }
      return;
    }

    // Подтверждение удаления
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Удалить чат?'),
        content: const Text(
          'Это действие нельзя отменить. Все сообщения будут удалены.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      // 1. Удаляем все сообщения в этом чате
      await Supabase.instance.client
          .from('messages')
          .delete()
          .eq('room_id', widget.room.id);

      // 2. Удаляем всех участников чата
      await Supabase.instance.client
          .from('room_members')
          .delete()
          .eq('room_id', widget.room.id);

      // 3. Удаляем сам чат
      await Supabase.instance.client
          .from('rooms')
          .delete()
          .eq('id', widget.room.id);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Чат удалён')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка удаления чата: $e')),
        );
      }
    }
  }

  Future<void> _deleteMessage(Message message) async {
    // Проверяем, что это наше сообщение
    if (message.userId != _currentUserId) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Можно удалять только свои сообщения')),
        );
      }
      return;
    }

    try {
      // Помечаем сообщение как удаленное в БД (для синхронизации между устройствами)
      await Supabase.instance.client
          .from('messages')
          .update({'deleted': true})
          .eq('id', message.id);

      // Удаляем из локального списка
      setState(() {
        messages.removeWhere((m) => m.id == message.id);
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Сообщение удалено')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка удаления: $e')),
        );
      }
    }
  }

  Future<void> _editMessage(Message message) async {
    // Проверяем, что это наше сообщение
    if (message.userId != _currentUserId) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Можно редактировать только свои сообщения')),
        );
      }
      return;
    }

    final controller = TextEditingController(text: message.textContent ?? '');

    final newText = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Редактировать сообщение'),
        content: TextField(
          controller: controller,
          maxLines: null,
          decoration: InputDecoration(
            hintText: 'Введите новый текст',
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Сохранить'),
          ),
        ],
      ),
    );

    if (newText == null || newText.isEmpty) return;

    try {
      // Обновляем в БД
      await Supabase.instance.client
          .from('messages')
          .update({
            'text_content': newText,
            'edited_at': DateTime.now().toIso8601String(),
          })
          .eq('id', message.id);

      // Обновляем в локальном списке
      setState(() {
        final index = messages.indexWhere((m) => m.id == message.id);
        if (index != -1) {
          messages[index] = messages[index].copyWith(
            textContent: newText,
            editedAt: DateTime.now(),
          );
        }
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Сообщение обновлено')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка редактирования: $e')),
        );
      }
    }
  }

  void _showMessageMenu(Message message) {
    final isMe = message.userId == _currentUserId;

    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.info),
              title: Text(
                'Отправлено: ${dateFormatFull.format(message.createdAt)}',
              ),
              enabled: false,
            ),
            if (message.editedAt != null)
              ListTile(
                leading: const Icon(Icons.edit),
                title: Text(
                  'Отредактировано: ${dateFormatFull.format(message.editedAt!)}',
                ),
                enabled: false,
              ),
            const Divider(),
            if (isMe)
              ListTile(
                leading: const Icon(Icons.edit, color: Colors.blue),
                title: const Text('Редактировать'),
                onTap: () {
                  Navigator.pop(context);
                  _editMessage(message);
                },
              ),
            if (isMe)
              ListTile(
                leading: const Icon(Icons.delete, color: Colors.red),
                title: const Text('Удалить'),
                onTap: () {
                  Navigator.pop(context);
                  _deleteMessage(message);
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    if (_roomListener != null) {
      RealtimeManager().removeRoomListener(widget.room.id, _roomListener!);
    }
    _stopPolling();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.room.name),
            Text(
              '${widget.room.memberCount} участник${widget.room.memberCount != 1 ? 'ов' : ''}',
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.normal),
            ),
          ],
        ),
        actions: [
          if (_currentUserId == widget.room.createdBy)
            IconButton(
              icon: const Icon(Icons.delete),
              onPressed: _deleteRoom,
              tooltip: 'Удалить чат',
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(error!),
                            const SizedBox(height: 16),
                            ElevatedButton(
                              onPressed: _loadMessages,
                              child: const Text('Повторить'),
                            ),
                          ],
                        ),
                      )
                    : messages.isEmpty
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
                                  'Нет сообщений',
                                  style: TextStyle(
                                    fontSize: 18,
                                    color: Colors.grey[600],
                                  ),
                                ),
                              ],
                            ),
                          )
                        : Stack(
                            children: [
                              ListView.builder(
                                controller: _scrollController,
                                itemCount: messages.length,
                                itemBuilder: (context, index) {
                                  final message = messages[index];
                                  final isMe = message.userId == _currentUserId;

                                  return Align(
                                    alignment: isMe
                                        ? Alignment.centerRight
                                        : Alignment.centerLeft,
                                    child: GestureDetector(
                                      onLongPress: () => _showMessageMenu(message),
                                      child: Container(
                                        margin: const EdgeInsets.all(8),
                                        padding: const EdgeInsets.all(12),
                                        constraints: BoxConstraints(
                                          maxWidth:
                                              MediaQuery.of(context).size.width * 0.75,
                                        ),
                                        decoration: BoxDecoration(
                                          color: isMe
                                              ? Colors.blue[300]
                                              : Colors.grey[300],
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: isMe
                                          ? CrossAxisAlignment.end
                                          : CrossAxisAlignment.start,
                                      children: [
                                        if (!isMe)
                                          Text(
                                            message.userName,
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              fontSize: 12,
                                            ),
                                          ),
                                        if (message.textContent != null &&
                                            message.textContent!.isNotEmpty)
                                          Padding(
                                            padding: !isMe
                                                ? EdgeInsets.zero
                                                : EdgeInsets.zero,
                                            child: Text(message.textContent!),
                                          ),
                                        if (message.mediaType == 'photo')
                                          GestureDetector(
                                            onTap: () => _showMediaPreview(
                                              message.mediaUrl!,
                                              message.fileName,
                                            ),
                                            child: Container(
                                              margin:
                                                  const EdgeInsets.only(top: 8),
                                              constraints:
                                                  const BoxConstraints(
                                                maxHeight: 300,
                                              ),
                                              child: ClipRRect(
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                                child: Image.network(
                                                  message.mediaUrl!,
                                                  fit: BoxFit.cover,
                                                ),
                                              ),
                                            ),
                                          ),
                                        if (message.mediaType == 'video')
                                          GestureDetector(
                                            onTap: () => _showMediaPreview(
                                              message.mediaUrl!,
                                              message.fileName,
                                            ),
                                            child: Container(
                                              margin:
                                                  const EdgeInsets.only(top: 8),
                                              padding: const EdgeInsets.all(16),
                                              decoration: BoxDecoration(
                                                color: Colors.black26,
                                                borderRadius:
                                                    BorderRadius.circular(8),
                                              ),
                                              child: Column(
                                                children: [
                                                  const Icon(
                                                    Icons.play_circle,
                                                    size: 40,
                                                    color: Colors.white,
                                                  ),
                                                  const SizedBox(height: 8),
                                                  Text(
                                                    message.fileName ??
                                                        'Видео',
                                                    maxLines: 1,
                                                    overflow:
                                                        TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                      fontSize: 12,
                                                      color: Colors.white,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          ),
                                        Padding(
                                          padding:
                                              const EdgeInsets.only(top: 4),
                                          child: Column(
                                            crossAxisAlignment: isMe
                                                ? CrossAxisAlignment.end
                                                : CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                dateFormat.format(message.createdAt),
                                                style: const TextStyle(
                                                  fontSize: 10,
                                                  color: Colors.grey,
                                                ),
                                              ),
                                              if (message.editedAt != null)
                                                Text(
                                                  '(отредактировано)',
                                                  style: const TextStyle(
                                                    fontSize: 8,
                                                    color: Colors.grey,
                                                  ),
                                                ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                              _buildNewMessageIndicator(),
                            ],
                          ),
          ),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              border:
                  Border(top: BorderSide(color: Colors.grey[300]!)),
            ),
            child: Column(
              children: [
                if (isUploading)
                  Container(
                    padding: const EdgeInsets.all(8),
                    child: const LinearProgressIndicator(),
                  ),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.image),
                      onPressed: isUploading
                          ? null
                          : () => _pickAndUploadMedia('photo'),
                    ),
                    IconButton(
                      icon: const Icon(Icons.videocam),
                      onPressed: isUploading
                          ? null
                          : () => _pickAndUploadMedia('video'),
                    ),
                    Expanded(
                      child: TextField(
                        controller: _messageController,
                        decoration: InputDecoration(
                          hintText: 'Напишите сообщение...',
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(20),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 8,
                          ),
                        ),
                        maxLines: null,
                        enabled: !isUploading,
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.send),
                      onPressed: isUploading
                          ? null
                          : () => _sendMessage(_messageController.text),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showMediaPreview(String url, String? fileName) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        child: GestureDetector(
          onTap: () => Navigator.pop(context),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.network(url, fit: BoxFit.contain),
              if (fileName != null)
                Padding(
                  padding: const EdgeInsets.all(8),
                  child: Text(fileName, textAlign: TextAlign.center),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
