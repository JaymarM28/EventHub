import 'dart:convert';
import 'package:dio/dio.dart';
import '../../core/api_client.dart';
import '../../core/token_storage.dart';

class AuthException implements Exception {
  AuthException(this.message);
  final String message;
  @override
  String toString() => message;
}

class AuthRepository {
  AuthRepository(this._apiClient, this._tokenStorage);

  final ApiClient _apiClient;
  final TokenStorage _tokenStorage;

  Future<void> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required DateTime birthDate,
  }) async {
    await _authRequest('/auth/register', {
      'email': email,
      'password': password,
      'firstName': firstName,
      'lastName': lastName,
      // Solo la fecha (sin hora) alcanza — evita que el offset de huso
      // horario del dispositivo corra la fecha un día en el backend.
      'birthDate': birthDate.toIso8601String().split('T').first,
    });
  }

  Future<void> login(String email, String password) async {
    await _authRequest('/auth/login', {'email': email, 'password': password});
  }

  Future<void> _authRequest(String path, Map<String, dynamic> data) async {
    try {
      final response = await _apiClient.dio.post(path, data: data);
      await _tokenStorage.save(
        accessToken: response.data['accessToken'] as String,
        refreshToken: response.data['refreshToken'] as String,
      );
    } on DioException catch (e) {
      throw AuthException(_extractMessage(e));
    }
  }

  Future<void> logout() async {
    final refreshToken = await _tokenStorage.refreshToken;
    if (refreshToken != null) {
      // Best-effort — la sesión termina localmente aunque esta llamada
      // falle (sin red, servidor caído). No bloquear el logout por esto.
      try {
        await _apiClient.dio.post('/auth/logout', data: {'refreshToken': refreshToken});
      } on DioException {
        // ignorar
      }
    }
    await _tokenStorage.clear();
  }

  Future<bool> hasSession() async {
    return await _tokenStorage.accessToken != null;
  }

  /// No hay endpoint `/auth/me` — los roles ya viajan en el claim `roles`
  /// del access token (ver auth-service), así que se leen ahí en vez de
  /// pedirle un viaje de red extra al backend.
  Future<List<String>> currentRoles() async {
    final token = await _tokenStorage.accessToken;
    if (token == null) return [];
    try {
      final parts = token.split('.');
      if (parts.length != 3) return [];
      final normalized = base64Url.normalize(parts[1]);
      final payload = jsonDecode(utf8.decode(base64Url.decode(normalized))) as Map<String, dynamic>;
      return (payload['roles'] as List<dynamic>?)?.map((r) => r.toString()).toList() ?? [];
    } catch (_) {
      return [];
    }
  }

  String _extractMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
    return 'No se pudo conectar con el servidor';
  }
}
