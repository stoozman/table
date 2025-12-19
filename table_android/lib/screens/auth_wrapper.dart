import 'package:flutter/material.dart';
import '../services/session_service.dart';
import 'login_screen.dart';
import '../main.dart';

class AuthWrapper extends StatefulWidget {
  const AuthWrapper({super.key});

  @override
  State<AuthWrapper> createState() => _AuthWrapperState();
}

class _AuthWrapperState extends State<AuthWrapper> {
  bool _isLoading = true;
  bool _isAuthenticated = false;

  @override
  void initState() {
    super.initState();
    _checkAuthStatus();
  }

  Future<void> _checkAuthStatus() async {
    // Временно очищаем сессию для тестирования
    await SessionService.logout();
    
    final session = await SessionService.getCurrentSession();
    final isLoggedIn = session != null;
    
    print('[AUTH_WRAPPER] Session: $session');
    print('[AUTH_WRAPPER] Is logged in: $isLoggedIn');
    
    if (mounted) {
      setState(() {
        _isLoading = false;
        _isAuthenticated = isLoggedIn;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    return _isAuthenticated ? const StartScreen() : const LoginScreen();
  }
}
