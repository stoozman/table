import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:intl/intl.dart';
import 'package:image/image.dart' as img;
import 'dart:math';

class PhotoUploadScreen extends StatefulWidget {
  const PhotoUploadScreen({Key? key}) : super(key: key);

  @override
  State<PhotoUploadScreen> createState() => _PhotoUploadScreenState();
}

class _PhotoUploadScreenState extends State<PhotoUploadScreen> {
  File? _image;
  final picker = ImagePicker();
  bool _uploading = false;
  String? _status;
  final _formKey = GlobalKey<FormState>();
  int? _productId;
  String? _batchNumber;
  DateTime? _manufactureDate;
  final DateFormat _dateFormat = DateFormat('dd.MM.yyyy');
  String? _comment;
  String? _colorCheckResult;
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _filteredProducts = [];
  String _productSearch = '';
  String? _colorDescription;
  Color? _avgColor;
  List<Map<String, dynamic>> _colorsReference = [];
  String? _colorFrom;
  String? _colorTo;
  bool _colorsLoading = false;
  bool _productsLoading = true;
  String? _matchedColorName;
  Map<String, dynamic>? _selectedProduct;
  final TextEditingController _productController = TextEditingController();
  final TextEditingController _batchNumberController = TextEditingController();
  String? _loadError;

  @override
  void initState() {
    super.initState();
    print('PhotoUploadScreen: initState');
    _fetchProducts();
    _fetchColorsReference();
  }

  Future<void> _fetchProducts() async {
    print('PhotoUploadScreen: _fetchProducts called');
    setState(() { _productsLoading = true; });
    try {
      final res = await Supabase.instance.client.from('products_reference').select();
      setState(() {
        _products = List<Map<String, dynamic>>.from(res);
      });
      // После загрузки продуктов сортируем по алфавиту
      _products.sort((a, b) => (a['name'] as String).toLowerCase().compareTo((b['name'] as String).toLowerCase()));
      setState(() { _loadError = null; _productsLoading = false; });
    } catch (e) {
      print('Ошибка загрузки продуктов: $e');
      setState(() { _loadError = 'Ошибка загрузки продуктов: $e'; _productsLoading = false; });
    }
  }
  void _filterProducts(String query) {
    _productSearch = query;
    if (query.isEmpty) {
      _filteredProducts = List.from(_products);
    } else {
      _filteredProducts = _products.where((p) => (p['name'] as String).toLowerCase().startsWith(query.toLowerCase())).toList();
    }
    setState(() {});
  }

  Future<void> _fetchColorsReference() async {
    print('PhotoUploadScreen: _fetchColorsReference called');
    setState(() { _colorsLoading = true; });
    try {
      List<Map<String, dynamic>> allColors = [];
      int page = 0;
      int pageSize = 1000;
      while (true) {
        final res = await Supabase.instance.client
          .from('colors')
          .select()
          .range(page * pageSize, (page + 1) * pageSize - 1);
        print('DEBUG: loaded page \\${page}, count: \\${res.length}');
        if (res == null || res.isEmpty) break;
        allColors.addAll(List<Map<String, dynamic>>.from(res));
        if (res.length < pageSize) break;
        page++;
      }
      setState(() {
        _colorsReference = allColors;
        _colorsLoading = false;
        _loadError = null;
      });
      print('DEBUG: total colors loaded: \\${_colorsReference.length}');
    } catch (e) {
      print('Ошибка загрузки цветов: $e');
      setState(() { _colorsLoading = false; _loadError = 'Ошибка загрузки справочника цветов: $e'; });
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    final pickedFile = await picker.pickImage(
      source: source, 
      imageQuality: 80, // сжатие
      maxWidth: 1920,   // ограничение ширины
    );
    if (pickedFile != null) {
      setState(() {
        _image = File(pickedFile.path);
        _colorCheckResult = null;
        _avgColor = null;
      });
      await _analyzeColor();
    }
  }

  Future<void> _analyzeColor() async {
    if (_image == null) return;
    final bytes = await _image!.readAsBytes();
    final decoded = img.decodeImage(bytes);
    if (decoded == null) return;
    int r = 0, g = 0, b = 0, count = 0;
    for (int y = 0; y < decoded.height; y += 10) {
      for (int x = 0; x < decoded.width; x += 10) {
        final pixel = decoded.getPixel(x, y);
        r += pixel.r.toInt();
        g += pixel.g.toInt();
        b += pixel.b.toInt();
        count++;
      }
    }
    r ~/= count;
    g ~/= count;
    b ~/= count;
    setState(() {
      _avgColor = Color.fromARGB(255, r, g, b);
    });
    // Новый алгоритм: ищем ближайший цвет только по Supabase colors
    if (_colorsReference.isNotEmpty) {
      int minDist = 1000000;
      int? avgColorIndex;
      String? matchedName;
      List<double> avgHsv = rgbToHsv(r, g, b);
      double minHsvDist = 1000;
      int? minHsvIndex;
      for (int i = 0; i < _colorsReference.length; i++) {
        final c = _colorsReference[i];
        int? rr = c['r'] is int ? c['r'] : int.tryParse(c['r']?.toString() ?? '');
        int? gg = c['g'] is int ? c['g'] : int.tryParse(c['g']?.toString() ?? '');
        int? bb = c['b'] is int ? c['b'] : int.tryParse(c['b']?.toString() ?? '');
        if (rr == null || gg == null || bb == null) continue;
        final dr = r - rr;
        final dg = g - gg;
        final db = b - bb;
        final dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
          minDist = dist;
          avgColorIndex = i;
          matchedName = c['rus_name'] ?? c['name'];
        }
        // HSV distance
        final hsv = rgbToHsv(rr, gg, bb);
        final hsvDist = hsvDistance(avgHsv, hsv);
        if (hsvDist < minHsvDist) {
          minHsvDist = hsvDist;
          minHsvIndex = i;
        }
      }
      setState(() {
        _matchedColorName = matchedName ?? 'не определён';
      });
      // Сравнение с диапазоном по HSV
      String? normalize(String? s) => s?.toLowerCase().replaceAll(RegExp(r'\s+'), '');
      List<int> fromIndices = [];
      List<int> toIndices = [];
      String fromNorm = normalize(_colorFrom) ?? '';
      String toNorm = normalize(_colorTo) ?? '';
      for (int i = 0; i < _colorsReference.length; i++) {
        final nameNorm = normalize(_colorsReference[i]['rus_name'] ?? _colorsReference[i]['name']) ?? '';
        if (fromNorm.isNotEmpty && nameNorm.contains(fromNorm)) {
          fromIndices.add(i);
        }
        if (toNorm.isNotEmpty && nameNorm.contains(toNorm)) {
          toIndices.add(i);
        }
      }
      if (fromIndices.isEmpty) {
        setState(() {
          _colorCheckResult = 'Нет цветов с подстрокой: "$_colorFrom"';
        });
        return;
      }
      if (toIndices.isEmpty) {
        setState(() {
          _colorCheckResult = 'Нет цветов с подстрокой: "$_colorTo"';
        });
        return;
      }
      // avgLab должен быть определён выше
      List<double> avgLab = rgbToLab(r, g, b);
      int fromIndex = fromIndices.first;
      int toIndex = toIndices.last;
      // Сравниваем с 10 равномерно выбранными цветами диапазона
      int start = fromIndex < toIndex ? fromIndex : toIndex;
      int end = fromIndex > toIndex ? fromIndex : toIndex;
      int count = end - start + 1;
      int step = (count / 10).ceil();
      List<int> sampleIndices = [];
      for (int i = start; i <= end; i += step) {
        sampleIndices.add(i);
      }
      if (!sampleIndices.contains(end)) sampleIndices.add(end); // обязательно добавить последний
      double threshold = 12.0;
      bool foundSimilar = false;
      for (final idx in sampleIndices) {
        final c = _colorsReference[idx];
        int? rr = c['r'] is int ? c['r'] : int.tryParse(c['r']?.toString() ?? '');
        int? gg = c['g'] is int ? c['g'] : int.tryParse(c['g']?.toString() ?? '');
        int? bb = c['b'] is int ? c['b'] : int.tryParse(c['b']?.toString() ?? '');
        if (rr == null || gg == null || bb == null) continue;
        final lab = rgbToLab(rr, gg, bb);
        final labDist = deltaE(avgLab, lab);
        if (labDist < threshold) {
          foundSimilar = true;
          break;
        }
      }
      setState(() {
        _colorCheckResult = foundSimilar ? 'соответствует' : 'не соответствует';
      });
    } else {
      setState(() {
        _matchedColorName = 'не определён';
        _colorCheckResult = 'нет справочника цветов';
      });
    }
  }

  Future<void> _uploadToSupabase() async {
    if (_image == null || !_formKey.currentState!.validate() || _productId == null || _manufactureDate == null) return;
    setState(() { _uploading = true; _status = null; });
    _formKey.currentState!.save();
    final fileName =
        '${DateTime.now().millisecondsSinceEpoch}_${_productId}_${_batchNumber ?? "unknown"}.jpg';
    final path = 'pictures/$fileName';
    final storage = Supabase.instance.client.storage.from('documents');
    try {
      await storage.upload(path, _image!, fileOptions: const FileOptions(upsert: true));
      await Supabase.instance.client.from('product_checks').insert({
        'product_id': _productId,
        'batch_number': _batchNumber,
        'manufacture_date': _manufactureDate != null ? _manufactureDate!.toIso8601String().split('T').first : null,
        'photo_path': path,
        'color_check_result': _colorCheckResult,
        'comment': _comment,
        'avg_r': _avgColor?.red,
        'avg_g': _avgColor?.green,
        'avg_b': _avgColor?.blue,
        'avg_lab': _avgColor != null ? rgbToLab(_avgColor!.red, _avgColor!.green, _avgColor!.blue).toString() : null,
        'rus_color_name': _matchedColorName,
      });
      setState(() {
        _status = 'Фото и результат успешно сохранены!';
        _image = null;
        _colorCheckResult = null;
        _avgColor = null;
        _manufactureDate = null;
        _selectedProduct = null;
        _productId = null;
        _colorDescription = null;
        _colorFrom = null;
        _colorTo = null;
        _batchNumberController.clear();
      });
    } catch (e) {
      setState(() { _status = 'Ошибка загрузки: $e'; });
    }
    setState(() { _uploading = false; });
  }

  // --- HSV color distance helper ---
  List<double> rgbToHsv(int r, int g, int b) {
    double rf = r / 255.0, gf = g / 255.0, bf = b / 255.0;
    double max = [rf, gf, bf].reduce((a, b) => a > b ? a : b);
    double min = [rf, gf, bf].reduce((a, b) => a < b ? a : b);
    double h = 0, s = 0, v = max;
    double d = max - min;
    s = max == 0 ? 0 : d / max;
    if (d != 0) {
      if (max == rf) {
        h = (gf - bf) / d + (gf < bf ? 6 : 0);
      } else if (max == gf) {
        h = (bf - rf) / d + 2;
      } else {
        h = (rf - gf) / d + 4;
      }
      h /= 6;
    }
    return [h, s, v];
  }
  double hsvDistance(List<double> hsv1, List<double> hsv2) {
    double dh = (hsv1[0] - hsv2[0]).abs();
    if (dh > 0.5) dh = 1.0 - dh; // Hue wrap
    double ds = (hsv1[1] - hsv2[1]).abs();
    double dv = (hsv1[2] - hsv2[2]).abs();
    return dh * dh + ds * ds + dv * dv;
  }

  // --- LAB color distance helper ---
  List<double> rgbToXyz(int r, int g, int b) {
    double rf = r / 255.0, gf = g / 255.0, bf = b / 255.0;
    rf = rf > 0.04045 ? pow((rf + 0.055) / 1.055, 2.4).toDouble() : rf / 12.92;
    gf = gf > 0.04045 ? pow((gf + 0.055) / 1.055, 2.4).toDouble() : gf / 12.92;
    bf = bf > 0.04045 ? pow((bf + 0.055) / 1.055, 2.4).toDouble() : bf / 12.92;
    rf *= 100;
    gf *= 100;
    bf *= 100;
    double x = rf * 0.4124 + gf * 0.3576 + bf * 0.1805;
    double y = rf * 0.2126 + gf * 0.7152 + bf * 0.0722;
    double z = rf * 0.0193 + gf * 0.1192 + bf * 0.9505;
    return [x, y, z];
  }
  List<double> xyzToLab(double x, double y, double z) {
    double xr = x / 95.047;
    double yr = y / 100.0;
    double zr = z / 108.883;
    List<double> f = [xr, yr, zr].map((v) {
      return v > 0.008856 ? pow(v, 1/3).toDouble() : (7.787 * v) + 16/116;
    }).toList();
    double l = 116 * f[1] - 16;
    double a = 500 * (f[0] - f[1]);
    double b = 200 * (f[1] - f[2]);
    return [l, a, b];
  }
  List<double> rgbToLab(int r, int g, int b) {
    final xyz = rgbToXyz(r, g, b);
    return xyzToLab(xyz[0], xyz[1], xyz[2]);
  }
  double deltaE(List<double> lab1, List<double> lab2) {
    return sqrt(pow(lab1[0] - lab2[0], 2) + pow(lab1[1] - lab2[1], 2) + pow(lab1[2] - lab2[2], 2));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Проверка цвета продукта')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: SingleChildScrollView(
          child: Column(
            children: [
              if ((_productsLoading || _colorsLoading) && _loadError == null)
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(),
                ),
              if (_loadError != null)
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text(_loadError!, style: const TextStyle(color: Colors.red)),
                      SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: () {
                          _fetchProducts();
                          _fetchColorsReference();
                        },
                        child: const Text('Повторить попытку'),
                      ),
                    ],
                  ),
                ),
              if (!_colorsLoading)
                Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      Autocomplete<Map<String, dynamic>>(
                        optionsBuilder: (TextEditingValue textEditingValue) {
                          if (textEditingValue.text == '') {
                            // Показывать все продукты при пустом поле
                            return _products;
                          }
                          // Показывать только те, что начинаются на введённую букву
                          return _products.where((p) => (p['name'] as String).toLowerCase().startsWith(textEditingValue.text.toLowerCase()));
                        },
                        displayStringForOption: (p) => p['name'] as String,
                        fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
                          return TextFormField(
                            controller: controller,
                            focusNode: focusNode,
                            decoration: const InputDecoration(labelText: 'Продукт'),
                            validator: (v) => _selectedProduct == null ? 'Обязательное поле' : null,
                          );
                        },
                        onSelected: (p) {
                          setState(() {
                            _selectedProduct = p;
                            _productId = p['id'] as int;
                            _colorDescription = p['color_description'];
                            _colorFrom = p['color_from'];
                            _colorTo = p['color_to'];
                          });
                        },
                      ),
                      TextFormField(
                        controller: _batchNumberController,
                        decoration: const InputDecoration(labelText: 'Номер партии'),
                        validator: (v) => v == null || v.isEmpty ? 'Обязательное поле' : null,
                        onSaved: (v) => _batchNumber = v,
                      ),
                      Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              onTap: () async {
                                final picked = await showDatePicker(
                                  context: context,
                                  initialDate: _manufactureDate ?? DateTime.now(),
                                  firstDate: DateTime(2020),
                                  lastDate: DateTime(2100),
                                  locale: const Locale('ru', 'RU'),
                                );
                                if (picked != null) {
                                  setState(() {
                                    _manufactureDate = picked;
                                  });
                                }
                              },
                              child: InputDecorator(
                                decoration: const InputDecoration(labelText: 'Дата выработки'),
                                child: Text(_manufactureDate != null ? _dateFormat.format(_manufactureDate!) : 'Выберите дату'),
                              ),
                            ),
                          ),
                        ],
                      ),
                      TextFormField(
                        decoration: const InputDecoration(labelText: 'Комментарий'),
                        onSaved: (v) => _comment = v,
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 16),
              if (_image != null)
                Column(
                  children: [
                    Image.file(_image!, height: 200),
                    if (_colorDescription != null)
                      Text('Эталонный цвет: $_colorDescription', style: const TextStyle(fontSize: 14)),
                    if (_avgColor != null)
                      Text('Полученный цвет: ${_matchedColorName ?? "-"}', style: const TextStyle(fontSize: 14)),
                  ],
                ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  ElevatedButton.icon(
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Камера'),
                    onPressed: () => _pickImage(ImageSource.camera),
                  ),
                  const SizedBox(width: 16),
                  ElevatedButton.icon(
                    icon: const Icon(Icons.photo),
                    label: const Text('Галерея'),
                    onPressed: () => _pickImage(ImageSource.gallery),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_uploading) const CircularProgressIndicator(),
              if (_status != null) Text(_status!, style: const TextStyle(color: Colors.green)),
              ElevatedButton(
                onPressed: _uploading ? null : _uploadToSupabase,
                child: const Text('Сохранить результат'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
