import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'product_picker_page.dart';

class LiveColorCheckScreen extends StatefulWidget {
  const LiveColorCheckScreen({super.key});

  @override
  State<LiveColorCheckScreen> createState() => _LiveColorCheckScreenState();
}

class _LiveColorCheckScreenState extends State<LiveColorCheckScreen> {
  CameraController? _controller;
  Future<void>? _initFuture;
  bool _busy = false;
  Map<String, dynamic>? _closest; // больше не используем в UI
  List<Map<String, dynamic>> _top3 = []; // больше не используем в UI
  Map<String, double>? _lastLab; // последняя измеренная LAB
  Map<String, dynamic>? _selectedEtalon; // подтверждённый/выбранный эталон
  String? _error;
  List<Map<String, dynamic>> _etalons = [];
  bool _etalonsLoading = false;
  static const double threshold = 3.0; // default ΔE00 threshold

  @override
  void initState() {
    super.initState();
    _init();
    _loadEtalons();
  }

  void _resetMeasurement() {
    setState(() {
      _closest = null;
      _top3 = [];
      _lastLab = null;
      _selectedEtalon = null;
      _error = null;
    });
  }

  Future<void> _init() async {
    try {
      final cameras = await availableCameras();
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(back, ResolutionPreset.medium, enableAudio: false);
      _initFuture = controller.initialize();
      await _initFuture;
      setState(() {
        _controller = controller;
      });
    } catch (e) {
      setState(() => _error = 'Камера недоступна: $e');
    }
  }

  Future<void> _loadEtalons() async {
    try {
      setState(() { _etalonsLoading = true; });
      final data = await Supabase.instance.client.from('etalons').select();
      // Normalize keys in case Postgres lowered identifiers (l instead of L)
      double? _asDouble(dynamic v) {
        if (v == null) return null;
        if (v is num) return v.toDouble();
        return double.tryParse(v.toString());
      }
      String? _asString(dynamic v) => v?.toString();

      final List<Map<String, dynamic>> items = [];
      for (final raw in (data as List)) {
        final m = Map<String, dynamic>.from(raw as Map);
        final L = _asDouble(m['L'] ?? m['l']);
        final a = _asDouble(m['a'] ?? m['A']);
        final b = _asDouble(m['b'] ?? m['B']);
        final name = _asString(m['product_name'] ?? m['name']);
        final rus = _asString(m['rus_color_name'] ?? m['rus'] ?? m['color_name']);
        if (L != null && a != null && b != null) {
          items.add({
            'product_name': name,
            'L': L,
            'a': a,
            'b': b,
            'rus_color_name': rus,
          });
        }
      }
      setState(() {
        _etalons = items;
      });
    } catch (e) {
      setState(() => _error = 'Не удалось загрузить эталоны: $e');
    }
    finally {
      if (mounted) setState(() { _etalonsLoading = false; });
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _measure() async {
    if (_controller == null || _busy) return;
    if (_etalons.isEmpty) {
      setState(() => _error = 'Эталоны не загружены');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await _initFuture;
      final file = await _controller!.takePicture();
      final imageBytes = await File(file.path).readAsBytes();
      final decoded = img.decodeImage(imageBytes);
      if (decoded == null) {
        setState(() => _error = 'Не удалось декодировать изображение');
        return;
      }

      // Central ROI: 15% of min dimension
      final minSide = math.min(decoded.width, decoded.height);
      final roiSize = math.max(60, (minSide * 0.15).floor());
      final x0 = (decoded.width / 2 - roiSize / 2).floor();
      final y0 = (decoded.height / 2 - roiSize / 2).floor();
      final x1 = math.min(decoded.width, x0 + roiSize);
      final y1 = math.min(decoded.height, y0 + roiSize);

      double sumR = 0, sumG = 0, sumB = 0; int count = 0;
      for (int y = y0; y < y1; y++) {
        for (int x = x0; x < x1; x++) {
          final px = decoded.getPixel(x, y);
          final r = px.r.toDouble();
          final g = px.g.toDouble();
          final b = px.b.toDouble();
          sumR += r;
          sumG += g;
          sumB += b;
          count++;
        }
      }
      final avgR = sumR / count;
      final avgG = sumG / count;
      final avgB = sumB / count;

      final lab = _rgbToLab(avgR, avgG, avgB);
      _lastLab = lab;

      // Больше не предлагаем топ‑кандидатов автоматически. Просто запоминаем замер
      // и сразу открываем выбор продукта.
      setState(() {
        _closest = null;
        _top3 = [];
        _selectedEtalon = null; // каждый новый замер сбрасывает выбор
      });
      // Откроем выбор продукта сразу после замера.
      // Не await, чтобы не блокировать финализацию _busy во finally.
      _openProductPicker(context);
    } catch (e) {
      setState(() => _error = 'Ошибка замера: $e');
    } finally {
      setState(() => _busy = false);
    }
  }

  // ------- Color math (sRGB D65 -> Lab, ΔE00) -------
  double _srgbToLinear(double c) {
    c = c / 255.0;
    return c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
  }

  Map<String, double> _rgbToXyz(double r, double g, double b) {
    final R = _srgbToLinear(r);
    final G = _srgbToLinear(g);
    final B = _srgbToLinear(b);
    final X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    final Y = R * 0.2126729 + G * 0.7151522 + B * 0.0721750;
    final Z = R * 0.0193339 + G * 0.1191920 + B * 0.9503041;
    return {'X': X * 100.0, 'Y': Y * 100.0, 'Z': Z * 100.0};
  }

  Map<String, double> _xyzToLab(double X, double Y, double Z) {
    const Xn = 95.047, Yn = 100.0, Zn = 108.883;
    final x = X / Xn, y = Y / Yn, z = Z / Zn;
    const eps = 216.0 / 24389.0;
    const kappa = 24389.0 / 27.0;
    double f(double t) => t > eps ? math.pow(t, 1.0 / 3.0).toDouble() : (kappa * t + 16.0) / 116.0;
    final fx = f(x), fy = f(y), fz = f(z);
    final L = 116.0 * fy - 16.0;
    final a = 500.0 * (fx - fy);
    final b = 200.0 * (fy - fz);
    return {'L': L, 'a': a, 'b': b};
  }

  Map<String, double> _rgbToLab(double r, double g, double b) {
    final xyz = _rgbToXyz(r, g, b);
    final lab = _xyzToLab(xyz['X']!, xyz['Y']!, xyz['Z']!);
    return lab;
  }

  double _deg2rad(double d) => (d * math.pi) / 180.0;
  double _rad2deg(double r) => (r * 180.0) / math.pi;

  double _deltaE00(Map<String, double> lab1, Map<String, double> lab2) {
    final L1 = lab1['L']!, a1 = lab1['a']!, b1 = lab1['b']!;
    final L2 = lab2['L']!, a2 = lab2['a']!, b2 = lab2['b']!;
    final avgLp = (L1 + L2) / 2.0;
    final C1 = math.sqrt(a1 * a1 + b1 * b1);
    final C2 = math.sqrt(a2 * a2 + b2 * b2);
    final avgC = (C1 + C2) / 2.0;
    final G = 0.5 * (1 - math.sqrt(math.pow(avgC, 7) / (math.pow(avgC, 7) + math.pow(25.0, 7))));
    final a1p = (1 + G) * a1;
    final a2p = (1 + G) * a2;
    final C1p = math.sqrt(a1p * a1p + b1 * b1);
    final C2p = math.sqrt(a2p * a2p + b2 * b2);
    final avgCp = (C1p + C2p) / 2.0;
    double atan2p(double y, double x) {
      final v = math.atan2(y, x);
      return v >= 0 ? v : v + 2 * math.pi;
    }
    final h1p = atan2p(b1, a1p);
    final h2p = atan2p(b2, a2p);
    double avghp;
    if ((h1p - h2p).abs() > math.pi) {
      avghp = (h1p + h2p + 2 * math.pi) / 2.0;
    } else {
      avghp = (h1p + h2p) / 2.0;
    }
    final T = 1 - 0.17 * math.cos(avghp - _deg2rad(30))
        + 0.24 * math.cos(2 * avghp)
        + 0.32 * math.cos(3 * avghp + _deg2rad(6))
        - 0.20 * math.cos(4 * avghp - _deg2rad(63));
    double dhp = h2p - h1p;
    if (dhp.abs() > math.pi) {
      dhp -= 2 * math.pi * dhp.sign;
    }
    final dLp = L2 - L1;
    final dCp = C2p - C1p;
    final dHp = 2 * math.sqrt(C1p * C2p) * math.sin(dhp / 2.0);
    final SL = 1 + (0.015 * math.pow(avgLp - 50, 2)) / math.sqrt(20 + math.pow(avgLp - 50, 2));
    final SC = 1 + 0.045 * avgCp;
    final SH = 1 + 0.015 * avgCp * T;
    final delthetarad = _deg2rad(30) * math.exp(-math.pow((_rad2deg(avghp) - 275) / 25, 2));
    final RC = 2 * math.sqrt(math.pow(avgCp, 7) / (math.pow(avgCp, 7) + math.pow(25.0, 7)));
    final RT = -RC * math.sin(2 * delthetarad);
    const KL = 1.0, KC = 1.0, KH = 1.0;
    final dE = math.sqrt(
      math.pow(dLp / (SL * KL), 2) +
      math.pow(dCp / (SC * KC), 2) +
      math.pow(dHp / (SH * KH), 2) +
      RT * (dCp / (SC * KC)) * (dHp / (SH * KH))
    );
    return dE;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Проверка цвета')),
      body: Column(
        children: [
          if (_error != null)
            Container(
              width: double.infinity,
              color: Colors.red.shade50,
              padding: const EdgeInsets.all(8),
              child: Text(_error!, style: const TextStyle(color: Colors.red)),
            ),
          Expanded(
            child: FutureBuilder(
              future: _initFuture,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (_controller == null) {
                  return const Center(child: Text('Камера не инициализирована'));
                }
                return Stack(
                  alignment: Alignment.center,
                  children: [
                    CameraPreview(_controller!),
                    Container(
                      width: 180,
                      height: 180,
                      decoration: BoxDecoration(
                        border: Border.all(color: Colors.blueAccent, width: 2, style: BorderStyle.solid),
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: (_busy || _etalonsLoading || _etalons.isEmpty) ? null : _measure,
                    child: _busy
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(_etalons.isEmpty ? 'Эталоны не загружены' : 'Замер'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: (_closest != null || _selectedEtalon != null || _lastLab != null) ? _resetMeasurement : null,
                  child: const Text('Новый замер'),
                )
              ],
            ),
          ),
          // Убрали подсказку топ‑кандидатов. Пользователь сам выбирает продукт из списка.
          if (_selectedEtalon != null) _buildVerdictCard(),
        ],
      ),
    );
  }

  Widget _buildSuggestionCard(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.blueGrey.shade50,
        border: const Border(top: BorderSide(color: Colors.blueGrey)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Предложение: ${_closest!['product_name'] ?? _closest!['name'] ?? '(без названия)'} (ΔE00=${(_closest!['dE'] as double).toStringAsFixed(2)})',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          if (_closest!['rus_color_name'] != null && (_closest!['rus_color_name'] as String).isNotEmpty)
            Text('Цвет по эталону: ${_closest!['rus_color_name']}'),
          const SizedBox(height: 8),
          Row(
            children: [
              ElevatedButton(
                onPressed: () {
                  setState(() {
                    _selectedEtalon = _closest;
                  });
                },
                child: const Text('Подтвердить'),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => _openProductPicker(context),
                child: const Text('Выбрать другой'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const Text('Топ-3 кандидата:'),
          const SizedBox(height: 4),
          ..._top3.map((e) => Text('- ${(e['product_name'] ?? e['name'] ?? '(без названия)')} — ΔE00=${(e['dE'] as double).toStringAsFixed(2)}')),
        ],
      ),
    );
  }

  void _openProductPicker(BuildContext context) async {
    final chosen = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        builder: (_) => ProductPickerPage(etalons: _etalons),
        fullscreenDialog: true,
      ),
    );
    if (chosen != null) {
      if (_lastLab != null) {
        final dE = _deltaE00(_lastLab!, {
          'L': (chosen['L'] as num).toDouble(),
          'a': (chosen['a'] as num).toDouble(),
          'b': (chosen['b'] as num).toDouble(),
        });
        chosen['dE'] = dE;
      }
      setState(() {
        _selectedEtalon = chosen;
      });
    }
  }

  Widget _buildVerdictCard() {
    final et = _selectedEtalon!;
    final de = (et['dE'] as num?)?.toDouble();
    final ok = de != null ? de <= threshold : false;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ok ? Colors.green.shade50 : Colors.red.shade50,
        border: Border(top: BorderSide(color: ok ? Colors.green : Colors.red)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Выбранный продукт: ${(et['product_name'] ?? et['name'] ?? '(без названия)')}'),
          if (et['rus_color_name'] != null && (et['rus_color_name'] as String).isNotEmpty)
            Text('Цвет по эталону: ${et['rus_color_name']}'),
          if (_lastLab != null) Text('LAB: L=${_lastLab!['L']!.toStringAsFixed(2)} a=${_lastLab!['a']!.toStringAsFixed(2)} b=${_lastLab!['b']!.toStringAsFixed(2)}'),
          if (de != null) Text('ΔE00 = ${de.toStringAsFixed(2)} (порог $threshold)'),
          const SizedBox(height: 6),
          Text(ok ? 'Соответствует' : 'Не соответствует', style: TextStyle(fontWeight: FontWeight.bold, color: ok ? Colors.green : Colors.red)),
        ],
      ),
    );
  }
}
