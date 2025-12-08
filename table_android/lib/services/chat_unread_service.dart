import 'package:supabase_flutter/supabase_flutter.dart';
import 'main_unread_tracker.dart';

class ChatUnreadService {
  static final _client = Supabase.instance.client;
  static MainUnreadTracker? _mainTracker;

  static void setMainTracker(MainUnreadTracker tracker) {
    _mainTracker = tracker;
  }

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

    _notifyUnreadTracker();
    _mainTracker?.refresh();
    // ignore: avoid_print
    print('[CHAT_UNREAD] Main tracker notified');
  }

  static void _notifyUnreadTracker() {
    // Здесь можно вызывать глобальный трекер через Event Bus / Provider
    // В текущей реализации оставляем лог для отладки
    // Чтобы избежать прямой зависимости от UI-слоя.
    // ignore: avoid_print
    print('[CHAT_UNREAD] Notifying tracker to refresh');
  }
}
