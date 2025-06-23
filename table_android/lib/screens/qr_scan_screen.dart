import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'dart:convert';

class QRScanScreen extends StatefulWidget {
  const QRScanScreen({Key? key}) : super(key: key);

  @override
  State<QRScanScreen> createState() => _QRScanScreenState();
}

class _QRScanScreenState extends State<QRScanScreen> {
  bool _scanned = false;
  String? _error;

  void _onDetect(BarcodeCapture capture) {
    if (_scanned) return;
    final barcode = capture.barcodes.first;
    final String? code = barcode.rawValue;
    if (code != null) {
      setState(() {
        _scanned = true;
      });
      // Попробуем декодировать JSON из QR-кода
      Map<String, dynamic>? decoded;
      try {
        decoded = json.decode(code);
      } catch (_) {}
      if (decoded != null) {
        // Оставляем только нужные поля
        final filtered = <String, dynamic>{
          'product_name': decoded['product_name'],
          'supplier': decoded['supplier'],
          'manufacturer': decoded['manufacturer'],
          'batch_number': decoded['batch_number'],
          'checked_indicators': decoded['checked_indicators'],
          'research_results': decoded['research_results'],
          'passport_standards': decoded['passport_standards'],
        };
        Navigator.of(context).pop(json.encode(filtered));
      } else {
        // Если не json, возвращаем как есть
        Navigator.of(context).pop(code);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Сканировать QR-код')),
      body: Stack(
        children: [
          MobileScanner(
            onDetect: _onDetect,
            errorBuilder: (context, error, child) => Center(child: Text('Ошибка камеры: \n$error')),
          ),
          if (_scanned)
            Container(
              color: Colors.black54,
              child: const Center(child: CircularProgressIndicator()),
            ),
        ],
      ),
    );
  }
}
