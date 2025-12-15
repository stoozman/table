import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:onesignal_flutter/onesignal_flutter.dart';

import '../services/local_storage.dart' as chat_storage;

class ChatPushTokenService {
  static Future<void> initAndRegister() async {
    final envAppId = dotenv.env['ONESIGNAL_APP_ID'] ?? dotenv.env['ONE_SIGNAL_APP_ID'];
    if (envAppId == null || envAppId.isEmpty) {
      debugPrint('[PUSH] ONESIGNAL_APP_ID is not provided. Skipping OneSignal init');
      return;
    }

    debugPrint('[PUSH] Initializing OneSignal');
    OneSignal.initialize(envAppId);
    await OneSignal.Notifications.requestPermission(true);

    final playerId = await _getPlayerIdWithRetry();
    if (playerId == null || playerId.isEmpty) {
      debugPrint('[PUSH] OneSignal player/subscription id is empty after retry. Skipping register');
      return;
    }

    final userId = await chat_storage.ChatUserStorage.getUserId();

    final deviceType = kIsWeb
        ? 'web'
        : Platform.isAndroid
            ? 'android'
            : Platform.isIOS
                ? 'ios'
                : 'web';

    try {
      await Supabase.instance.client.from('chat_device_tokens').upsert(
        {
          'user_id': userId,
          'device_type': deviceType,
          'token': playerId,
          'platform_details': {
            'os': kIsWeb ? 'web' : Platform.operatingSystem,
            'os_version': kIsWeb ? null : Platform.operatingSystemVersion,
          },
          'last_seen_at': DateTime.now().toUtc().toIso8601String(),
          'is_active': true,
        },
        onConflict: 'user_id,token',
      );

      debugPrint('[PUSH] Registered token for user_id=$userId device_type=$deviceType');
    } catch (e) {
      debugPrint('[PUSH] Failed to register token: $e');
    }
  }

  static Future<String?> _getPlayerIdWithRetry() async {
    for (int attempt = 1; attempt <= 10; attempt++) {
      final id = OneSignal.User.pushSubscription.id;
      if (id != null && id.isNotEmpty) {
        debugPrint('[PUSH] OneSignal player/subscription id acquired (attempt $attempt)');
        return id;
      }
      debugPrint('[PUSH] Waiting for OneSignal player/subscription id... (attempt $attempt)');
      await Future.delayed(const Duration(seconds: 1));
    }
    return OneSignal.User.pushSubscription.id;
  }
}
