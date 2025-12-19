import 'dart:async';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'chat_unread_service.dart';
import '../services/session_service.dart';

class MainUnreadTracker {
  static final MainUnreadTracker _instance = MainUnreadTracker._internal();
  factory MainUnreadTracker() => _instance;
  MainUnreadTracker._internal();

  final StreamController<int> _totalUnreadController =
      StreamController<int>.broadcast();
  Stream<int> get totalUnreadStream => _totalUnreadController.stream;

  RealtimeChannel? _realtimeSubscription;
  String? _currentUserId;
  int _totalUnread = 0;
  Timer? _pollingTimer;
  bool _isPolling = false;

  int get currentTotalUnread => _totalUnread;

  Future<void> initialize() async {
    try {
      _currentUserId = await SessionService.getCurrentUserId();
      if (_currentUserId == null) return;

      await _loadTotalUnread();
      _subscribeToRealtime();
      _startPolling();
    } catch (e) {
      print('[MAIN_TRACKER] Initialization error: $e');
    }
  }

  Future<void> _loadTotalUnread() async {
    try {
      if (_currentUserId == null) return;
      final total = await ChatUnreadService.fetchTotalUnread(_currentUserId!);
      _updateTotalUnread(total);
    } catch (e) {
      print('[MAIN_TRACKER] Error loading total unread: $e');
    }
  }

  void _updateTotalUnread(int total) {
    if (_totalUnread != total) {
      _totalUnread = total;
      _totalUnreadController.add(total);
      print('[MAIN_TRACKER] Total unread updated: $total');
    }
  }

  void _subscribeToRealtime() {
    if (_currentUserId == null) return;
    _realtimeSubscription?.unsubscribe();

    try {
      _realtimeSubscription = Supabase.instance.client
          .channel('main_unread_tracker_${_currentUserId!}')
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: 'public',
            table: 'messages',
            callback: (payload) {
              final record = payload.newRecord;
              final roomId = record['room_id'] as String?;
              final senderId = record['user_id'] as String?;
              final isDeleted = record['deleted'] as bool? ?? false;
              if (roomId != null && senderId != _currentUserId && !isDeleted) {
                print('[MAIN_TRACKER] New message from other user');
                _loadTotalUnread();
              }
            },
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: 'public',
            table: 'room_read_states',
            callback: (payload) {
              final record = payload.newRecord;
              final userId = record['user_id'] as String?;
              if (userId == _currentUserId) {
                print('[MAIN_TRACKER] Read state updated');
                _loadTotalUnread();
              }
            },
          )
          .subscribe(
            (status, err) {
              print('[MAIN_TRACKER] Subscription status: $status');
              if (err != null) {
                print('[MAIN_TRACKER] Error: ${err.toString()}');
                _increasePollingFrequency();
              } else if (status == RealtimeSubscribeStatus.subscribed) {
                _restoreNormalPolling();
              }
            },
          );

      print('[MAIN_TRACKER] Realtime subscription created');
    } catch (e) {
      print('[MAIN_TRACKER] Error creating subscription: $e');
      _increasePollingFrequency();
    }
  }

  void _startPolling() {
    if (_isPolling) return;
    _isPolling = true;
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _loadTotalUnread();
    });
    print('[MAIN_TRACKER] Polling started (5s interval)');
  }

  void _increasePollingFrequency() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      _loadTotalUnread();
    });
    print('[MAIN_TRACKER] Polling frequency increased to 2s');
  }

  void _restoreNormalPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _loadTotalUnread();
    });
    print('[MAIN_TRACKER] Polling restored to normal (5s)');
  }

  Future<void> refresh() async {
    await _loadTotalUnread();
  }

  void dispose() {
    _realtimeSubscription?.unsubscribe();
    _pollingTimer?.cancel();
    _totalUnreadController.close();
    print('[MAIN_TRACKER] Disposed');
  }
}

