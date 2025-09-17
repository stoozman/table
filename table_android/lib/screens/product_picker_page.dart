import 'package:flutter/material.dart';

class ProductPickerPage extends StatefulWidget {
  final List<Map<String, dynamic>> etalons;
  const ProductPickerPage({super.key, required this.etalons});

  @override
  State<ProductPickerPage> createState() => _ProductPickerPageState();
}

class _ProductPickerPageState extends State<ProductPickerPage> {
  late TextEditingController _controller;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return widget.etalons;
    return widget.etalons.where((e) {
      final n = (e['product_name'] ?? e['name'] ?? '').toString().toLowerCase();
      return n.startsWith(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Выбор продукта')),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(12.0),
              child: TextField(
                controller: _controller,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Начните вводить название...',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            Expanded(
              child: ListView.builder(
                itemCount: _filtered.length,
                itemBuilder: (context, index) {
                  final e = _filtered[index];
                  final label = (e['product_name'] ?? e['name'] ?? '').toString();
                  return ListTile(
                    title: Text(label),
                    onTap: () => Navigator.pop(context, e),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
