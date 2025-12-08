import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';

class RealtimeManager {
  static final RealtimeManager _instance = RealtimeManager._internal();
  factory RealtimeManager() => _instance;
  RealtimeManager._internal();

  final Map<String, List<Function(PostgresChangePayload)>> _listeners = {};
  RealtimeChannel? _mainChannel;
  String? _currentUserId;
  bool _isInitialized = false;

  String? get currentUserId => _currentUserId;

  Future<void> initialize(String userId) async {
    if (_isInitialized && _currentUserId == userId) return;
    _currentUserId = userId;
    await _setupMainChannel();
    _isInitialized = true;
  }

  Future<void> _setupMainChannel() async {
    await _mainChannel?.unsubscribe();

    try {
      _mainChannel = Supabase.instance.client
          .channel('app_${_currentUserId}_${DateTime.now().millisecondsSinceEpoch}')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'messages',
            callback: (payload) {
              _notifyListeners('messages_insert', payload);
            },
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'messages',
            callback: (payload) {
              _notifyListeners('messages_update', payload);
            },
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.delete,
            schema: 'public',
            table: 'messages',
            callback: (payload) {
              _notifyListeners('messages_delete', payload);
            },
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'room_read_states',
            callback: (payload) {
              _notifyListeners('room_read_states_update', payload);
            },
          );

      await _mainChannel?.subscribe(
        (status, err) {
          print('[REALTIME_MANAGER] Channel status: $status');
          if (err != null) {
            print('[REALTIME_MANAGER] Error: $err');
            Future.delayed(const Duration(seconds: 3), () {
              if (_currentUserId != null) {
                _setupMainChannel();
              }
            });
          }
        },
      );

      print('[REALTIME_MANAGER] Main channel initialized for user $_currentUserId');
    } catch (e) {
      print('[REALTIME_MANAGER] Error setting up channel: $e');
    }
  }

  void addListener(String eventType, Function(PostgresChangePayload) callback) {
    _listeners.putIfAbsent(eventType, () => []);
    _listeners[eventType]!.add(callback);
  }

  void removeListener(String eventType, Function(PostgresChangePayload) callback) {
    _listeners[eventType]?.remove(callback);
  }

  void _notifyListeners(String eventType, PostgresChangePayload payload) {
    final listeners = _listeners[eventType];
    if (listeners != null) {
      for (final listener in List<Function(PostgresChangePayload)>.from(listeners)) {
        try {
          listener(payload);
        } catch (e) {
          print('[REALTIME_MANAGER] Error in listener: $e');
        }
      }
    }
  }

  void addRoomListener(String roomId, Function(PostgresChangePayload) callback) {
    final wrapper = (PostgresChangePayload payload) {
      final roomIdFromPayload = payload.newRecord['room_id'] as String?;
      if (roomIdFromPayload == roomId) {
        callback(payload);
      }
    };
    addListener('messages_insert', wrapper);
  }

  void removeRoomListener(String roomId, Function(PostgresChangePayload) callback) {
    final insertListeners = _listeners['messages_insert'] ?? [];
    insertListeners.clear();
  }

  void dispose() {
    _mainChannel?.unsubscribe();
    _listeners.clear();
    _isInitialized = false;
  }
}

