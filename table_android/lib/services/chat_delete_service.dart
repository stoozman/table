import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/message.dart';

class ChatDeleteService {
  static final _supabase = Supabase.instance.client;

  /// 🔥 Удаление одного сообщения + его медиа
  static Future<void> deleteMessage({
    required Message message,
    required String currentUserId,
  }) async {
    if (message.userId != currentUserId) {
      throw Exception('Нет прав на удаление сообщения');
    }

    // 1️⃣ Удаляем файл (если есть)
    if (message.mediaUrl != null && message.mediaUrl!.isNotEmpty) {
      final file = _parseStoragePath(message.mediaUrl!);
      if (file != null) {
        await _supabase.storage
            .from(file.bucket)
            .remove([file.path]);
      }
    }

    // 2️⃣ Удаляем сообщение
    await _supabase
        .from('messages')
        .delete()
        .eq('id', message.id);
  }

  /// 🔥 Полное удаление чата (сообщения + файлы + участники)
  static Future<void> deleteRoom({
    required String roomId,
    required String currentUserId,
    required String roomCreatorId,
  }) async {
    if (currentUserId != roomCreatorId) {
      throw Exception('Только создатель может удалить чат');
    }

    // 1️⃣ Получаем все media_url
    final response = await _supabase
        .from('messages')
        .select('media_url')
        .eq('room_id', roomId);

    final files = <_StorageFile>[];

    for (final row in response) {
      final url = row['media_url'] as String?;
      if (url != null && url.isNotEmpty) {
        final parsed = _parseStoragePath(url);
        if (parsed != null) {
          files.add(parsed);
        }
      }
    }

    // 2️⃣ Удаляем файлы пачками (по bucket)
    final filesByBucket = <String, List<String>>{};

    for (final f in files) {
      filesByBucket.putIfAbsent(f.bucket, () => []).add(f.path);
    }

    for (final entry in filesByBucket.entries) {
      await _supabase.storage
          .from(entry.key)
          .remove(entry.value);
    }

    // 3️⃣ Удаляем сообщения
    await _supabase
        .from('messages')
        .delete()
        .eq('room_id', roomId);

    // 4️⃣ Удаляем участников
    await _supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomId);

    // 5️⃣ Удаляем чат
    await _supabase
        .from('rooms')
        .delete()
        .eq('id', roomId);
  }

  /// 🔍 Парсинг bucket + path из public URL
  static _StorageFile? _parseStoragePath(String publicUrl) {
    try {
      final uri = Uri.parse(publicUrl);
      final segments = uri.pathSegments;

      final publicIndex = segments.indexOf('public');
      if (publicIndex == -1 || publicIndex + 1 >= segments.length) {
        return null;
      }

      final bucket = segments[publicIndex + 1];
      final path = segments.sublist(publicIndex + 2).join('/');

      return _StorageFile(bucket: bucket, path: path);
    } catch (_) {
      return null;
    }
  }
}

/// Внутренняя модель
class _StorageFile {
  final String bucket;
  final String path;

  _StorageFile({
    required this.bucket,
    required this.path,
  });
}
