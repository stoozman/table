import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:convert';

class RawMaterialDetailsScreen extends StatefulWidget {
  final String id;
  const RawMaterialDetailsScreen({Key? key, required this.id}) : super(key: key);

  @override
  State<RawMaterialDetailsScreen> createState() => _RawMaterialDetailsScreenState();
}

class _RawMaterialDetailsScreenState extends State<RawMaterialDetailsScreen> {
  Map<String, dynamic>? material;
  bool isLoading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    fetchMaterial();
  }

  Future<void> fetchMaterial() async {
    try {
      final response = await Supabase.instance.client
          .from('raw_materials')
          .select()
          .eq('id', widget.id)
          .single();
      setState(() {
        material = response;
        isLoading = false;
      });
    } catch (e) {
      setState(() {
        error = e.toString();
        isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Информация о сырье')),
      body: isLoading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text('Ошибка: $error'))
              : material == null
                  ? const Center(child: Text('Данные не найдены'))
                  : Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: ListView(
                        children: [
                          const SizedBox(height: 8),
                          for (final field in [
                            'name',
                            'supplier',
                            'manufacturer',
                            'batch_number',
                            'inspected_metrics',
                            'investigation_result',
                            'passport_standard',
                          ])
                            ListTile(
                              title: Text(
                                {
                                  'name': 'Наименование',
                                  'supplier': 'Поставщик',
                                  'manufacturer': 'Производитель',
                                  'batch_number': 'Номер партии',
                                  'inspected_metrics': 'Проверяемые показатели',
                                  'investigation_result': 'Результат исследования',
                                  'passport_standard': 'Норматив по паспорту',
                                }[field]!,
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              subtitle: Text('${material![field] ?? ''}'),
                            ),
                          const Divider(),
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8.0),
                            child: Text('Документы', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                          ),
                          ...((material!['documents'] as List<dynamic>? ?? [])
                              .map((item) {
                                String url;
                                String title;
                                if (item is String) {
                                  url = item;
                                  title = Uri.parse(url).pathSegments.last;
                                } else if (item is Map<String, dynamic>) {
                                  url = (item['url'] ?? item['link'] ?? '').toString();
                                  title = (item['name'] ?? Uri.parse(url).pathSegments.last).toString();
                                } else {
                                  return null;
                                }
                                if (url.isEmpty) return null;
                                return ListTile(
                                  title: Text(title),
                                  trailing: const Icon(Icons.open_in_new),
                                  onTap: () async {
                                    final uri = Uri.parse(url);
                                    if (await canLaunchUrl(uri)) {
                                      await launchUrl(uri, mode: LaunchMode.externalApplication);
                                    }
                                  },
                                );
                              })
                              .whereType<Widget>()
                              .toList()),
                        ],
                      ),
                    ),
    );
  }
}
