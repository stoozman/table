import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ChatMediaUpload {
  final ImagePicker _picker = ImagePicker();

  /// 📸 Выбор фото / видео
  Future<XFile?> pickMedia({required String mediaType}) async {
    try {
      if (mediaType == 'photo') {
        return await _picker.pickImage(
          source: ImageSource.gallery,
          imageQuality: 80,
          maxWidth: 1920,
        );
      } else if (mediaType == 'video') {
        return await _picker.pickVideo(
          source: ImageSource.gallery,
          maxDuration: const Duration(minutes: 2),
        );
      } else {
        throw Exception('Unsupported media type: $mediaType');
      }
    } catch (e) {
      debugPrint('❌ pickMedia error: $e');
      return null;
    }
  }

  /// ☁️ Загрузка в Supabase (уже выбранный файл)
  Future<String?> uploadMedia({
    required XFile file,
    required String roomId,
    required String userId,
    required String bucketName,
  }) async {
    try {
      final bytes = await file.readAsBytes();

      final fileName =
          '${DateTime.now().millisecondsSinceEpoch}_${file.name}';
      final path = 'chat/$roomId/$userId/$fileName';

      final contentType =
          file.mimeType ??
          (file.path.endsWith('.mp4')
              ? 'video/mp4'
              : 'image/jpeg');

      await Supabase.instance.client.storage
          .from(bucketName)
          .uploadBinary(
            path,
            bytes,
            fileOptions: FileOptions(
              contentType: contentType,
              upsert: false,
            ),
          );

      return Supabase.instance.client.storage
          .from(bucketName)
          .getPublicUrl(path);
    } catch (e, st) {
      debugPrint('❌ uploadMedia error: $e');
      debugPrint('$st');
      return null;
    }
  }

  /// 🔁 Старый полный цикл (оставляем!)
  Future<String?> pickAndUpload({
    required String mediaType,
    required String roomId,
    required String userId,
    required String bucketName,
  }) async {
    final file = await pickMedia(mediaType: mediaType);
    if (file == null) {
      debugPrint('⚠️ Media not selected');
      return null;
    }

    return await uploadMedia(
      file: file,
      roomId: roomId,
      userId: userId,
      bucketName: bucketName,
    );
  }
}
