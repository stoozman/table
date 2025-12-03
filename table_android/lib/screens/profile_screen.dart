import 'package:flutter/material.dart';
import '../services/local_storage.dart' as chat_storage;

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late TextEditingController _userNameController;
  String _currentUserName = '';
  String _currentUserId = '';
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final userName = await chat_storage.ChatUserStorage.getUserName();
    final userId = await chat_storage.ChatUserStorage.getUserId();

    setState(() {
      _currentUserName = userName;
      _currentUserId = userId;
      _userNameController = TextEditingController(text: userName);
      _isLoading = false;
    });
  }

  Future<void> _saveUserName() async {
    final newName = _userNameController.text.trim();

    if (newName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Имя не может быть пустым')),
      );
      return;
    }

    try {
      await chat_storage.ChatUserStorage.setUserName(newName);

      setState(() {
        _currentUserName = newName;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Имя успешно сохранено')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ошибка сохранения: $e')),
        );
      }
    }
  }

  Future<void> _generateNewName() async {
    final newName = chat_storage.ChatUserStorage.generateRandomName();
    setState(() {
      _userNameController.text = newName;
    });
  }

  @override
  void dispose() {
    _userNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Профиль'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // ID пользователя (только для чтения)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'ID пользователя',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey,
                            ),
                          ),
                          const SizedBox(height: 8),
                          SelectableText(
                            _currentUserId,
                            style: const TextStyle(
                              fontSize: 14,
                              fontFamily: 'monospace',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Поле для ввода имени
                  TextField(
                    controller: _userNameController,
                    decoration: InputDecoration(
                      labelText: 'Ваше имя в чате',
                      hintText: 'Введите название',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      prefixIcon: const Icon(Icons.person),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Кнопка сохранить
                  ElevatedButton.icon(
                    onPressed: _saveUserName,
                    icon: const Icon(Icons.save),
                    label: const Text('Сохранить имя'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Кнопка сгенерировать рандомное имя
                  OutlinedButton.icon(
                    onPressed: _generateNewName,
                    icon: const Icon(Icons.shuffle),
                    label: const Text('Сгенерировать имя'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Информационный блок
                  Card(
                    color: Colors.blue[50],
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'ℹ️ Информация',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Ваше имя сохраняется локально на устройстве и используется во всех чатах. '
                            'Вы можете изменить его в любой момент.',
                            style: TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
