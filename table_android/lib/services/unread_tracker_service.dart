import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'realtime_manager.dart';

class UnreadTrackerService {
  static final UnreadTrackerService _instance = UnreadTrackerService._internal();
  factory UnreadTrackerService() => _instance;
  UnreadTrackerService._internal();

  static final _client = Supabase.instance.client;
  static final RealtimeManager _realtimeManager = RealtimeManager();

  final StreamController<int> _totalUnreadController =
      StreamController<int>.broadcast();
  Stream<int> get totalUnreadStream => _totalUnreadController.stream;

  int _totalUnread = 0;
  Function(PostgresChangePayload)? _msgListener;
  Function(PostgresChangePayload)? _readListener;

  int get currentTotalUnread => _totalUnread;

  static Future<Map<String, DateTime?>> _fetchReadStates(String userId) async {
    final response = await _client
        .from('room_read_states')
        .select('room_id, last_read_at')
        .eq('user_id', userId);

    final Map<String, DateTime?> result = {};
    for (final row in response) {
      final roomId = row['room_id'] as String?;
      if (roomId == null) continue;
      final lastReadRaw = row['last_read_at'] as String?;
      result[roomId] =
          lastReadRaw != null ? DateTime.parse(lastReadRaw).toUtc() : null;
    }
    return result;
  }

  Future<void> initialize(String userId) async {
    await _realtimeManager.initialize(userId);
    await _loadTotalUnread();

    _msgListener = (payload) => _onNewMessage(payload);
    _readListener = (payload) => _onReadStateUpdated(payload);

    _realtimeManager.addListener('messages_insert', _msgListener!);
    _realtimeManager.addListener('room_read_states_update', _readListener!);
  }

  void _onNewMessage(PostgresChangePayload payload) {
    final record = payload.newRecord;
    final senderId = record['user_id'] as String?;
    final currentUserId = _realtimeManager.currentUserId;
    if (senderId != null && senderId != currentUserId) {
      debugPrint('[UNREAD_TRACKER] New message from other user, refreshing total');
      _loadTotalUnread();
    }
  }

  void _onReadStateUpdated(PostgresChangePayload payload) {
    final record = payload.newRecord;
    final userId = record['user_id'] as String?;
    if (userId == _realtimeManager.currentUserId) {
      debugPrint('[UNREAD_TRACKER] Read state updated, refreshing total');
      _loadTotalUnread();
    }
  }

  Future<void> _loadTotalUnread() async {
    try {
      final userId = _realtimeManager.currentUserId;
      if (userId == null) return;

      final roomsResponse = await _client
          .from('room_members')
          .select('room_id')
          .eq('user_id', userId);

      if (roomsResponse.isEmpty) {
        _updateTotalUnread(0);
        return;
      }

      final roomIds =
          roomsResponse.map<String>((row) => row['room_id'] as String).toList();

      int total = 0;
      for (final roomId in roomIds) {
        final readState = await _client
            .from('room_read_states')
            .select('last_read_at')
            .eq('room_id', roomId)
            .eq('user_id', userId)
            .maybeSingle();

        final lastReadAtRaw = readState?['last_read_at'] as String?;
        final DateTime? lastReadAt =
            lastReadAtRaw != null ? DateTime.parse(lastReadAtRaw).toUtc() : null;

        var query = _client
            .from('messages')
            .select('id')
            .eq('room_id', roomId)
            .eq('deleted', false)
            .neq('user_id', userId);

        if (lastReadAt != null) {
          query = query.gt('created_at', lastReadAt.toIso8601String());
        }

        final countResponse = await query.count(CountOption.exact);
        total += countResponse.count;
      }

      _updateTotalUnread(total);
    } catch (e) {
      debugPrint('[UNREAD_TRACKER] Error loading total unread: $e');
    }
  }

  void _updateTotalUnread(int total) {
    _totalUnread = total;
    _totalUnreadController.add(total);
    debugPrint('[UNREAD_TRACKER] Total unread updated: $total');
  }

  static Future<Map<String, int>> fetchUnreadCounts(
    String userId,
    List<String> roomIds,
  ) async {
    if (roomIds.isEmpty) return {};

    final readStates = await _fetchReadStates(userId);
    final futures = roomIds.map((roomId) async {
      final lastReadAt = readStates[roomId];
      var query = _client
          .from('messages')
          .select('id')
          .eq('room_id', roomId)
          .eq('deleted', false)
          .neq('user_id', userId);

      if (lastReadAt != null) {
        query = query.gt('created_at', lastReadAt.toIso8601String());
      }

      final countResponse = await query.count(CountOption.exact);
      final int count = countResponse.count;
      return MapEntry<String, int>(roomId, count);
    }).toList();

    final List<MapEntry<String, int>> entries =
        await Future.wait<MapEntry<String, int>>(futures);
    return Map<String, int>.fromEntries(entries);
  }

  static Future<int> fetchTotalUnread(String userId) async {
    final roomsResponse = await _client
        .from('room_members')
        .select('room_id')
        .eq('user_id', userId);

    final roomIds =
        roomsResponse.map<String>((row) => row['room_id'] as String).toList();

    if (roomIds.isEmpty) return 0;

    final unreadCounts = await fetchUnreadCounts(userId, roomIds);
    return unreadCounts.values.fold<int>(0, (sum, value) => sum + value);
  }

  static Future<void> ensureReadState({
    required String roomId,
    required String userId,
    DateTime? lastMessageAt,
  }) async {
    final existing = await _client
        .from('room_read_states')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();

    if (existing == null) {
      final initialTimestamp = lastMessageAt != null
          ? lastMessageAt.toUtc().subtract(const Duration(days: 1))
          : DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
      await _client.from('room_read_states').insert({
        'room_id': roomId,
        'user_id': userId,
        'last_read_at': initialTimestamp.toIso8601String(),
        'last_read_message_id': null,
      });
    }
  }

  static Future<void> markRoomAsRead({
    required String roomId,
    required String userId,
    required DateTime lastMessageAt,
    required String lastMessageId,
  }) async {
    await _client.from('room_read_states').upsert({
      'room_id': roomId,
      'user_id': userId,
      'last_read_at': lastMessageAt.toUtc().toIso8601String(),
      'last_read_message_id': lastMessageId,
    }, onConflict: 'room_id,user_id');

    _instance._loadTotalUnread();
  }

  Future<void> refresh() async {
    await _loadTotalUnread();
  }

  void dispose() {
    if (_msgListener != null) {
      _realtimeManager.removeListener('messages_insert', _msgListener!);
    }
    if (_readListener != null) {
      _realtimeManager.removeListener('room_read_states_update', _readListener!);
    }
    _totalUnreadController.close();
  }
}

