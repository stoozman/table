import 'package:shared_preferences/shared_preferences.dart';
import 'dart:math';

class ChatUserStorage {
  static const String _userIdKey = 'chat_user_id';
  static const String _userNameKey = 'chat_user_name';

  static Future<Map<String, String>> getUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final userId = prefs.getString(_userIdKey);
    final userName = prefs.getString(_userNameKey);

    if (userId != null && userName != null) {
      return {'userId': userId, 'userName': userName};
    }

    // Генерируем новые данные
    final newUserId = _generateUUID();
    final newUserName = generateRandomName();

    await prefs.setString(_userIdKey, newUserId);
    await prefs.setString(_userNameKey, newUserName);

    return {'userId': newUserId, 'userName': newUserName};
  }

  static Future<void> setUserName(String newUserName) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userNameKey, newUserName);
  }

  static Future<String> getUserId() async {
    final data = await getUserData();
    return data['userId']!;
  }

  static Future<String> getUserName() async {
    final data = await getUserData();
    return data['userName']!;
  }

  static String _generateUUID() {
    const chars = '0123456789abcdef';
    final random = Random();
    final List<String> uuid = [];

    // Generate UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    for (int i = 0; i < 36; i++) {
      if (i == 8 || i == 13 || i == 18 || i == 23) {
        uuid.add('-');
      } else if (i == 14) {
        uuid.add('4');
      } else if (i == 19) {
        uuid.add(chars[random.nextInt(4) + 8]);
      } else {
        uuid.add(chars[random.nextInt(16)]);
      }
    }

    return uuid.join();
  }

  static String generateRandomName() {
    final colors = [
      'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Pink',
      'Cyan', 'Magenta', 'Lime', 'Indigo', 'Violet', 'Turquoise',
      'Gold', 'Silver', 'Coral', 'Navy', 'Olive'
    ];

    final animals = [
      'Tiger', 'Lion', 'Eagle', 'Dolphin', 'Penguin', 'Panda', 'Fox',
      'Wolf', 'Bear', 'Owl', 'Whale', 'Dragon', 'Phoenix', 'Unicorn',
      'Cheetah', 'Rabbit', 'Squirrel', 'Butterfly', 'Hawk', 'Raven'
    ];

    final random = Random();
    final color = colors[random.nextInt(colors.length)];
    final animal = animals[random.nextInt(animals.length)];
    final number = random.nextInt(10000);

    return '${color}_${animal}_$number';
  }
}
