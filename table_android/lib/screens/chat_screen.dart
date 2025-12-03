import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import '../models/message.dart';
import '../models/room.dart';
import '../services/local_storage.dart' as chat_storage;

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
  late RealtimeChannel _messagesSubscription;
  bool isUploading = false;
  String? _currentUserId;
  String? _currentUserName;
  final dateFormat = DateFormat('HH:mm');
  final dateFormatFull = DateFormat('dd.MM.yyyy HH:mm');
  
  // Polling fallback for realtime
  DateTime? _lastMessageTime;
  Timer? _pollTimer;
  bool _isPolling = false;

  @override
  void initState() {
    super.initState();
    debugPrint('=== CHAT SCREEN INIT ===');
    debugPrint('Room: ${widget.room.name} (ID: ${widget.room.id})');
    _loadCurrentUserAndMessages();
    _subscribeToMessages();
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

  void _subscribeToMessages() {
    try {
      debugPrint('Subscribing to messages for room ${widget.room.id}');
      
      // Используем простой канал без фильтра, фильтруем вручную в callback
      _messagesSubscription = Supabase.instance.client
          .channel('public:messages')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'messages',
            callback: (payload) {
              debugPrint('=== REALTIME EVENT FIRED ===');
              debugPrint('Full payload: $payload');
              debugPrint('New record: ${payload.newRecord}');
              _handleRealtimeEvent(payload);
            },
          )
          .subscribe();

      debugPrint('Subscription successful');
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
      if (_lastMessageTime == null) return;
      final resp = await Supabase.instance.client
          .from('messages')
          .select()
          .eq('room_id', widget.room.id)
          .eq('deleted', false)
          .gt('created_at', _lastMessageTime!.toIso8601String())
          .order('created_at', ascending: true);

      if (resp != null && resp is List && resp.isNotEmpty) {
        final newMessages = resp.map((j) => Message.fromJson(j)).toList();
        
        // Дедублируем: не добавляем сообщения которые уже есть локально
        final messagesToAdd = newMessages.where((msg) {
          return !messages.any((existing) => existing.id == msg.id);
        }).toList();
        
        if (messagesToAdd.isNotEmpty) {
          setState(() {
            messages.addAll(messagesToAdd);
          });
          _scrollToBottom();
          debugPrint('Polling: added ${messagesToAdd.length} new messages (skipped ${newMessages.length - messagesToAdd.length} duplicates)');
        }
        
        _lastMessageTime = newMessages.last.createdAt;
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
    final eventRoomId = payload.newRecord['room_id'] as String?;

    debugPrint('Event type: ${payload.eventType}');
    debugPrint('Event room ID: $eventRoomId');
    debugPrint('Current room ID: $roomId');
    debugPrint('Match: ${eventRoomId == roomId}');

    if (payload.eventType == PostgresChangeEvent.insert) {
      try {
        final newMessage = Message.fromJson(payload.newRecord);
        debugPrint('Parsed message: ID=${newMessage.id}, Room=${newMessage.roomId}, Text=${newMessage.textContent}');

        if (newMessage.roomId == roomId && !newMessage.deleted) {
          setState(() {
            final exists = messages.any((m) => m.id == newMessage.id);
            debugPrint('Message already in list: $exists');
            
            if (!exists) {
              messages.add(newMessage);
              debugPrint('✓ Message added! Total: ${messages.length}');
              _scrollToBottom();
            }
          });
        } else {
          debugPrint('✗ Message ignored: room mismatch or deleted');
        }
      } catch (e) {
        debugPrint('Error parsing message: $e');
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
      final resp = await Supabase.instance.client
          .from('messages')
          .insert({
            'room_id': widget.room.id,
            'user_id': _currentUserId,
            'user_name': _currentUserName,
            'text_content': text,
          })
          .select();

      _messageController.clear();

      if (resp != null && resp is List && resp.isNotEmpty) {
        try {
          final created = Message.fromJson(resp[0]);
          setState(() {
            // add locally so user sees it immediately
            messages.add(created);
          });
          _scrollToBottom();
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
      final resp = await Supabase.instance.client.from('messages').insert({
        'room_id': widget.room.id,
        'user_id': _currentUserId,
        'user_name': _currentUserName,
        'media_type': mediaType,
        'media_url': publicUrl,
        'file_name': file.name,
      }).select();

      if (resp != null && resp is List && resp.isNotEmpty) {
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
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _messagesSubscription.unsubscribe();
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
                        : ListView.builder(
                            controller: _scrollController,
                            itemCount: messages.length,
                            itemBuilder: (context, index) {
                              final message = messages[index];
                              final isMe = message.userId == _currentUserId;

                              return Align(
                                alignment: isMe
                                    ? Alignment.centerRight
                                    : Alignment.centerLeft,
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
                                        child: Text(
                                          dateFormat.format(message.createdAt),
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: Colors.grey,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
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
