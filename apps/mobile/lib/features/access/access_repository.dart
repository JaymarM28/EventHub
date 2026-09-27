import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import 'scan_result.dart';

class AccessRepository {
  AccessRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<ScanResult> scan(String qrToken) async {
    try {
      final response = await _apiClient.dio.post(
        '/access/scan',
        data: {'qrToken': qrToken},
      );
      return ScanResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException {
      return ScanResult.error();
    }
  }
}
