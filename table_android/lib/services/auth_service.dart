import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService {
  static const int _saltLength = 16;
  
  // Генерация случайной соли
  static String _generateSalt() {
    final random = Random.secure();
    final saltBytes = List<int>.generate(_saltLength, (_) => random.nextInt(256));
    return base64.encode(saltBytes);
  }
  
  // Хеширование пароля с солью
  static String hashPassword(String password) {
    final salt = _generateSalt();
    final bytes = utf8.encode(password + salt);
    final hash = sha256.convert(bytes);
    return '$salt:$hash';
  }
  
  // Проверка пароля
  static bool verifyPassword(String password, String hashedPassword) {
    final parts = hashedPassword.split(':');
    if (parts.length != 2) return false;
    
    final salt = parts[0];
    final storedHash = parts[1];
    
    final bytes = utf8.encode(password + salt);
    final hash = sha256.convert(bytes);
    
    return hash.toString() == storedHash;
  }
  
  // Регистрация пользователя
  static Future<Map<String, dynamic>> registerUser({
    required String username,
    required String password,
  }) async {
    try {
      // Проверяем, существует ли пользователь
      final existingUser = await Supabase.instance.client
          .from('chat_users')
          .select('user_id')
          .eq('user_name', username)
          .maybeSingle();
      
      if (existingUser != null) {
        return {'success': false, 'error': 'Пользователь с таким именем уже существует'};
      }
      
      // Хешируем пароль
      final passwordHash = hashPassword(password);
      
      // Создаем пользователя
      final userId = username; // Временно используем username как ID
      
      await Supabase.instance.client
          .from('chat_users')
          .insert({
            'user_id': userId,
            'user_name': username,
            'password_hash': passwordHash,
            'is_approved': false,
            'created_at': DateTime.now().toIso8601String(),
            'updated_at': DateTime.now().toIso8601String(),
          });
      
      return {'success': true, 'user_id': userId};
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }
  
  // Вход пользователя
  static Future<Map<String, dynamic>> loginUser({
    required String username,
    required String password,
  }) async {
    try {
      final user = await Supabase.instance.client
          .from('chat_users')
          .select('user_id, user_name, password_hash, is_approved, is_admin')
          .eq('user_name', username)
          .maybeSingle();
      
      if (user == null) {
        return {'success': false, 'error': 'Пользователь не найден'};
      }
      
      if (!user['is_approved']) {
        return {'success': false, 'error': 'Пользователь еще не одобрен администратором'};
      }
      
      if (!verifyPassword(password, user['password_hash'])) {
        return {'success': false, 'error': 'Неверный пароль'};
      }
      
      return {
        'success': true,
        'user_id': user['user_id'],
        'user_name': user['user_name'],
        'is_admin': user['is_admin'] ?? false,
      };
    } catch (e) {
      return {'success': false, 'error': e.toString()};
    }
  }
  
  // Получение информации о пользователе
  static Future<Map<String, dynamic>?> getUserInfo(String userId) async {
    try {
      final user = await Supabase.instance.client
          .from('chat_users')
          .select('user_id, user_name, is_approved, is_admin')
          .eq('user_id', userId)
          .maybeSingle();
      
      return user;
    } catch (e) {
      return null;
    }
  }
}
