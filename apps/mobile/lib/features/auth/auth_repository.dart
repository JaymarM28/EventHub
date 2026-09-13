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

  Future<void> register(String email, String password) async {
    await _authRequest('/auth/register', email, password);
  }

  Future<void> login(String email, String password) async {
    await _authRequest('/auth/login', email, password);
  }

  Future<void> _authRequest(String path, String email, String password) async {
    try {
      final response = await _apiClient.dio.post(path, data: {
        'email': email,
        'password': password,
      });
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

  String _extractMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
    return 'No se pudo conectar con el servidor';
  }
}
