import 'dart:io';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

class CameraService {
  static List<CameraDescription> _cameras = [];
  static CameraController? _controller;
  static bool _isInitialized = false;

  /// Инициализация камер
  static Future<void> initializeCameras() async {
    try {
      debugPrint('=== INITIALIZING CAMERAS ===');
      _cameras = await availableCameras();
      debugPrint('Available cameras: ${_cameras.length}');
      for (int i = 0; i < _cameras.length; i++) {
        debugPrint('Camera $i: ${_cameras[i].name}, ${_cameras[i].lensDirection}');
      }
    } catch (e) {
      debugPrint('Error initializing cameras: $e');
      debugPrint('Stack trace: ${StackTrace.current}');
    }
  }

  /// Получение списка камер
  static List<CameraDescription> get cameras => _cameras;

  /// Проверка разрешений на камеру
  static Future<bool> requestCameraPermission() async {
    final status = await Permission.camera.request();
    debugPrint('Camera permission status: $status');
    return status.isGranted;
  }

  /// Проверка разрешений на микрофон (для видео)
  static Future<bool> requestMicrophonePermission() async {
    final status = await Permission.microphone.request();
    debugPrint('Microphone permission status: $status');
    return status.isGranted;
  }

  /// Инициализация контроллера камеры
  static Future<bool> initializeCamera({
    CameraDescription? camera,
    ResolutionPreset resolution = ResolutionPreset.high,
  }) async {
    if (_cameras.isEmpty) {
      await initializeCameras();
    }

    if (_cameras.isEmpty) {
      debugPrint('No cameras available');
      return false;
    }

    try {
      // Выбираем камеру (заднюю по умолчанию)
      final selectedCamera = camera ?? 
          _cameras.firstWhere((c) => c.lensDirection == CameraLensDirection.back,
              orElse: () => _cameras.first);

      await _controller?.dispose();
      
      _controller = CameraController(
        selectedCamera,
        resolution,
        enableAudio: true,
      );

      await _controller!.initialize();
      _isInitialized = true;
      debugPrint('Camera initialized successfully');
      return true;
    } catch (e) {
      debugPrint('Error initializing camera: $e');
      _isInitialized = false;
      return false;
    }
  }

  /// Получение текущего контроллера
  static CameraController? get controller => _controller;

  /// Проверка инициализации
  static bool get isInitialized => _isInitialized;

  /// Переключение камеры (передняя/задняя)
  static Future<bool> switchCamera() async {
    if (!_isInitialized || _controller == null || _cameras.length < 2) {
      return false;
    }

    try {
      final currentCameraIndex = _cameras.indexOf(_controller!.description);
      final nextCameraIndex = (currentCameraIndex + 1) % _cameras.length;
      final nextCamera = _cameras[nextCameraIndex];

      await initializeCamera(camera: nextCamera);
      return true;
    } catch (e) {
      debugPrint('Error switching camera: $e');
      return false;
    }
  }

  /// Сделать фото
  static Future<String?> takePhoto() async {
    debugPrint('=== TAKE PHOTO STARTED ===');
    debugPrint('Camera initialized: $_isInitialized');
    debugPrint('Controller exists: ${_controller != null}');
    
    if (!_isInitialized || _controller == null) {
      debugPrint('Camera not initialized');
      return null;
    }

    try {
      debugPrint('Taking picture...');
      final XFile photo = await _controller!.takePicture();
      debugPrint('Photo taken successfully: ${photo.path}');
      
      // Проверяем что файл существует
      final file = File(photo.path);
      debugPrint('File exists: ${file.existsSync()}');
      debugPrint('File size: ${file.existsSync() ? file.lengthSync() : 0} bytes');
      
      return photo.path;
    } catch (e) {
      debugPrint('Error taking photo: $e');
      debugPrint('Stack trace: ${StackTrace.current}');
      return null;
    }
  }

  /// Начать запись видео
  static Future<bool> startVideoRecording() async {
    if (!_isInitialized || _controller == null) {
      debugPrint('Camera not initialized');
      return false;
    }

    try {
      await _controller!.startVideoRecording();
      debugPrint('Video recording started');
      return true;
    } catch (e) {
      debugPrint('Error starting video recording: $e');
      return false;
    }
  }

  /// Остановить запись видео
  static Future<String?> stopVideoRecording() async {
    if (!_isInitialized || _controller == null) {
      debugPrint('Camera not initialized');
      return null;
    }

    try {
      final XFile video = await _controller!.stopVideoRecording();
      debugPrint('Video recorded: ${video.path}');
      return video.path;
    } catch (e) {
      debugPrint('Error stopping video recording: $e');
      return null;
    }
  }

  /// Проверка, идет ли запись видео
  static bool get isRecordingVideo =>
      _controller?.value.isRecordingVideo ?? false;

  /// Освободить ресурсы
  static void dispose() {
    _controller?.dispose();
    _controller = null;
    _isInitialized = false;
    debugPrint('Camera disposed');
  }

  /// Быстрый выбор источника (камера или галерея)
  static Future<void> showSourceDialog({
    required BuildContext context,
    required Function(String) onMediaSelected,
    bool allowVideo = true,
    BuildContext? parentContext,
  }) async {
    debugPrint('=== SHOW SOURCE DIALOG STARTED ===');
    debugPrint('Allow video: $allowVideo');
    
    showDialog(
      context: context,
      builder: (context) {
        debugPrint('Building source dialog...');
        return AlertDialog(
          title: const Text('Выбрать источник'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.photo_library),
                title: const Text('Галерея'),
                onTap: () async {
                  debugPrint('Gallery option selected');
                  Navigator.pop(context);
                  final picker = ImagePicker();
                  final XFile? file = await picker.pickImage(
                    source: ImageSource.gallery,
                    imageQuality: 85,
                    maxWidth: 1920,
                  );
                  if (file != null) {
                    debugPrint('Image picked from gallery: ${file.path}');
                    onMediaSelected(file.path);
                  }
                },
              ),
              if (allowVideo)
                ListTile(
                  leading: const Icon(Icons.video_library),
                  title: const Text('Видео из галереи'),
                  onTap: () async {
                    debugPrint('Video gallery option selected');
                    Navigator.pop(context);
                    final picker = ImagePicker();
                    final XFile? file = await picker.pickVideo(
                      source: ImageSource.gallery,
                      maxDuration: const Duration(minutes: 2),
                    );
                    if (file != null) {
                      debugPrint('Video picked from gallery: ${file.path}');
                      onMediaSelected(file.path);
                    }
                  },
                ),
              ListTile(
                leading: const Icon(Icons.camera_alt),
                title: const Text('Камера'),
                onTap: () async {
                  debugPrint('Camera option selected');
                  Navigator.pop(context);
                  
                  // Используем parentContext для камеры
                  final cameraContext = parentContext ?? context;
                  await _showCameraDialog(
                    context: cameraContext,
                    onMediaSelected: onMediaSelected,
                    allowVideo: allowVideo,
                    isVideoMode: false, // Фото режим
                  );
                },
              ),
              if (allowVideo)
                ListTile(
                  leading: const Icon(Icons.videocam),
                  title: const Text('Видео камера'),
                  onTap: () async {
                    debugPrint('Video camera option selected');
                    Navigator.pop(context);
                    
                    // Используем parentContext для камеры
                    final cameraContext = parentContext ?? context;
                    await _showCameraDialog(
                      context: cameraContext,
                      onMediaSelected: onMediaSelected,
                      allowVideo: allowVideo,
                      isVideoMode: true, // Видео режим
                    );
                  },
                ),
            ],
          ),
        );
      },
    );
    
    debugPrint('=== SHOW SOURCE DIALOG COMPLETED ===');
  }

  /// Показать диалог с камерой
  static Future<void> _showCameraDialog({
    required BuildContext context,
    required Function(String) onMediaSelected,
    bool allowVideo = true,
    bool isVideoMode = false, // Добавляем параметр режима
  }) async {
    debugPrint('=== CAMERA DIALOG STARTED ===');
    debugPrint('Is video mode: $isVideoMode');
    
    // Проверяем разрешения
    final cameraPermission = await requestCameraPermission();
    debugPrint('Camera permission granted: $cameraPermission');
    
    if (!cameraPermission) {
      debugPrint('Camera permission denied');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Нужно разрешение на использование камеры')),
        );
      }
      return;
    }

    if (allowVideo) {
      final micPermission = await requestMicrophonePermission();
      debugPrint('Microphone permission granted: $micPermission');
      
      if (!micPermission) {
        debugPrint('Microphone permission denied');
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Нужно разрешение на использование микрофона')),
          );
        }
        return;
      }
    }

    // Инициализируем камеру
    debugPrint('Initializing camera...');
    final initialized = await initializeCamera();
    debugPrint('Camera initialized: $initialized');
    
    if (!initialized) {
      debugPrint('Camera initialization failed');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не удалось инициализировать камеру')),
        );
      }
      return;
    }

    debugPrint('Opening camera dialog...');
    
    // Проверяем, что контекст всё ещё действителен
    if (!context.mounted) {
      debugPrint('Context is no longer valid, cannot show dialog');
      return;
    }
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => _CameraDialog(
        onMediaSelected: onMediaSelected,
        allowVideo: allowVideo,
        isVideoMode: isVideoMode, // Передаем режим видео
      ),
    );
    
    debugPrint('=== CAMERA DIALOG OPENED ===');
  }
}

/// Диалог с камерой
class _CameraDialog extends StatefulWidget {
  final Function(String) onMediaSelected;
  final bool allowVideo;
  final bool isVideoMode; // Добавляем параметр режима

  const _CameraDialog({
    Key? key,
    required this.onMediaSelected,
    required this.allowVideo,
    this.isVideoMode = false,
  }) : super(key: key);

  @override
  State<_CameraDialog> createState() => _CameraDialogState();
}

class _CameraDialogState extends State<_CameraDialog> {
  bool _isRecording = false;
  bool _isVideoMode = false;
  String? _recordedVideoPath; // Добавляем переменную для пути записанного видео

  @override
  void initState() {
    super.initState();
    _isVideoMode = widget.isVideoMode; // Инициализируем режим из параметра
  }

  @override
  void dispose() {
    CameraService.dispose();
    super.dispose();
  }

  Future<void> _takePhoto() async {
    debugPrint('=== CAMERA DIALOG TAKE PHOTO CALLED ===');
    debugPrint('Video mode: $_isVideoMode');
    
    final path = await CameraService.takePhoto();
    debugPrint('Photo result: $path');
    
    if (path != null) {
      debugPrint('Calling onMediaSelected with path: $path');
      widget.onMediaSelected(path);
      // Закрываем диалог камеры после отправки фото
      Navigator.pop(context);
      debugPrint('Photo taken, camera dialog closed');
    } else {
      debugPrint('Photo failed - no path returned');
    }
  }

  Future<void> _toggleVideoRecording() async {
    if (!_isRecording) {
      // Начать запись
      final started = await CameraService.startVideoRecording();
      if (started) {
        setState(() {
          _isRecording = true;
        });
      }
    } else {
      // Остановить запись
      final path = await CameraService.stopVideoRecording();
      if (path != null) {
        setState(() {
          _isRecording = false;
          _recordedVideoPath = path; // Сохраняем путь видео
        });
        debugPrint('Video recorded: $path');
        // НЕ закрываем диалог сразу - даем пользователю возможность отправить видео
      } else {
        setState(() {
          _isRecording = false;
        });
      }
    }
  }

  Future<void> _switchCamera() async {
    await CameraService.switchCamera();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    if (!CameraService.isInitialized) {
      return const Dialog(
        child: Padding(
          padding: EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 16),
              Text('Инициализация камеры...'),
            ],
          ),
        ),
      );
    }

    final controller = CameraService.controller!;
    final size = MediaQuery.of(context).size;

    return Dialog(
      insetPadding: EdgeInsets.zero,
      child: Container(
        width: size.width,
        height: size.height * 0.8,
        child: Column(
          children: [
            // Заголовок
            Container(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _isVideoMode ? 'Запись видео' : 'Камера',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Row(
                    children: [
                      if (CameraService.cameras.length > 1)
                        IconButton(
                          onPressed: _switchCamera,
                          icon: const Icon(Icons.flip_camera_ios),
                        ),
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // Предпросмотр камеры
            Expanded(
              child: ClipRRect(
                child: SizedBox(
                  width: double.infinity,
                  child: FittedBox(
                    fit: BoxFit.cover,
                    child: SizedBox(
                      width: controller.value.previewSize!.height,
                      height: controller.value.previewSize!.width,
                      child: CameraPreview(controller),
                    ),
                  ),
                ),
              ),
            ),
            // Элементы управления
            Container(
              padding: const EdgeInsets.all(16),
              color: Colors.black,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  // Заголовок режима
                  Text(
                    _isVideoMode ? 'Запись видео' : 'Камера',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 48),
                  // Кнопка съемки/записи
                  GestureDetector(
                    onTap: _isVideoMode ? _toggleVideoRecording : _takePhoto,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: _isRecording ? Colors.red : Colors.white,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white,
                          width: 4,
                        ),
                      ),
                      child: Icon(
                        _isVideoMode 
                            ? (_isRecording ? Icons.stop : Icons.fiber_manual_record) 
                            : Icons.camera_alt,
                        color: _isRecording ? Colors.white : Colors.black,
                        size: 32,
                      ),
                    ),
                  ),
                  // Кнопка отправки видео (показывается после записи)
                  if (_isVideoMode && _recordedVideoPath != null)
                    GestureDetector(
                      onTap: () {
                        debugPrint('Send video pressed: $_recordedVideoPath');
                        widget.onMediaSelected(_recordedVideoPath!); // Вызываем onMediaSelected
                        Navigator.pop(context); // Закрываем диалог камеры
                      },
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.green,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.send,
                          color: Colors.white,
                          size: 24,
                        ),
                      ),
                    )
                  else
                    const SizedBox(width: 48),
                  // Кнопка закрытия
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.close,
                        color: Colors.white,
                        size: 24,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
