import '../../core/api_client.dart';

/// Notificaciones push (2026-09-29) — ver PushNotificationsService para el
/// flujo completo (permiso, token de FCM, cuándo se llama esto).
class NotificationsRepository {
  NotificationsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<void> registerDeviceToken(String token, String platform) async {
    await _apiClient.dio.post(
      '/notifications/device-tokens',
      data: {'token': token, 'platform': platform},
    );
  }

  Future<void> unregisterDeviceToken(String token) async {
    await _apiClient.dio.delete('/notifications/device-tokens/$token');
  }
}
