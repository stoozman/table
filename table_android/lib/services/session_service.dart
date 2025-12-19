import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class SessionService {
  static const String _userIdKey = 'user_id';
  static const String _userNameKey = 'user_name';
  static const String _isAdminKey = 'is_admin';
  static const String _isLoggedInKey = 'is_logged_in';
  
  // Сохранение сессии
  static Future<void> saveSession({
    required String userId,
    required String userName,
    required bool isAdmin,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userIdKey, userId);
    await prefs.setString(_userNameKey, userName);
    await prefs.setBool(_isAdminKey, isAdmin);
    await prefs.setBool(_isLoggedInKey, true);
  }
  
  // Получение текущей сессии
  static Future<Map<String, dynamic>?> getCurrentSession() async {
    final prefs = await SharedPreferences.getInstance();
    
    final isLoggedIn = prefs.getBool(_isLoggedInKey) ?? false;
    if (!isLoggedIn) return null;
    
    final userId = prefs.getString(_userIdKey);
    final userName = prefs.getString(_userNameKey);
    final isAdmin = prefs.getBool(_isAdminKey) ?? false;
    
    if (userId == null || userName == null) return null;
    
    return {
      'user_id': userId,
      'user_name': userName,
      'is_admin': isAdmin,
    };
  }
  
  // Проверка, авторизован ли пользователь
  static Future<bool> isLoggedIn() async {
    final session = await getCurrentSession();
    return session != null;
  }
  
  // Получение ID текущего пользователя
  static Future<String?> getCurrentUserId() async {
    final session = await getCurrentSession();
    return session?['user_id'];
  }
  
  // Получение имени текущего пользователя
  static Future<String?> getCurrentUserName() async {
    final session = await getCurrentSession();
    return session?['user_name'];
  }
  
  // Проверка, является ли пользователь админом
  static Future<bool> isAdmin() async {
    final session = await getCurrentSession();
    return session?['is_admin'] ?? false;
  }
  
  // Выход из системы
  static Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userIdKey);
    await prefs.remove(_userNameKey);
    await prefs.remove(_isAdminKey);
    await prefs.remove(_isLoggedInKey);
  }
  
  // Обновление имени пользователя в сессии
  static Future<void> updateUserName(String newUserName) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userNameKey, newUserName);
  }
}
