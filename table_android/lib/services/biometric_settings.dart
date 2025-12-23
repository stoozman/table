import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class BiometricSettings {
  static const _storage = FlutterSecureStorage();
  static const _key = 'biometric_enabled';

  static Future<bool> isEnabled() async {
    final value = await _storage.read(key: _key);
    return value == 'true';
  }

  static Future<void> setEnabled(bool enabled) async {
    await _storage.write(key: _key, value: enabled.toString());
  }
}
