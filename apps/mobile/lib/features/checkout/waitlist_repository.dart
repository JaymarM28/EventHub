import '../../core/api_client.dart';

class WaitlistStatus {
  WaitlistStatus({required this.waiting, required this.notified});

  final bool waiting;
  final bool notified;

  factory WaitlistStatus.fromJson(Map<String, dynamic> json) {
    return WaitlistStatus(
      waiting: json['waiting'] as bool,
      notified: json['notified'] as bool,
    );
  }
}

/// Lista de espera (#11, 2026-09-30) — ver WaitlistService en
/// tickets-service para el diseño completo.
class WaitlistRepository {
  WaitlistRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<void> join(String zoneId) async {
    await _apiClient.dio.post('/tickets/zones/$zoneId/waitlist');
  }

  Future<void> leave(String zoneId) async {
    await _apiClient.dio.delete('/tickets/zones/$zoneId/waitlist');
  }

  Future<WaitlistStatus> status(String zoneId) async {
    final response = await _apiClient.dio.get('/tickets/zones/$zoneId/waitlist/me');
    return WaitlistStatus.fromJson(response.data as Map<String, dynamic>);
  }
}
