import 'package:dio/dio.dart';

import 'config.dart';
import 'token_storage.dart';

/// Cliente HTTP único hacia api-gateway. Dos responsabilidades que
/// justifican el interceptor en vez de repetir esto en cada repository:
/// 1. Adjuntar el JWT en cada request saliente.
/// 2. Ante un 401, intentar refrescar UNA vez (rotación de tokens, ver
///    auth-service paso 2) y reintentar el request original — si el
///    refresh también falla, la sesión terminó de verdad y se notifica.
class ApiClient {
  ApiClient(this._tokenStorage, {required this.onSessionExpired}) {
    dio = Dio(BaseOptions(baseUrl: gatewayBaseUrl));
    _refreshDio = Dio(BaseOptions(baseUrl: gatewayBaseUrl));

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _tokenStorage.accessToken;
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final isAuthEndpoint = error.requestOptions.path.startsWith('/auth/');
          final alreadyRetried = error.requestOptions.extra['retried'] == true;

          if (error.response?.statusCode == 401 &&
              !isAuthEndpoint &&
              !alreadyRetried) {
            final refreshed = await _tryRefresh();
            if (refreshed) {
              final newToken = await _tokenStorage.accessToken;
              final retryOptions = error.requestOptions
                ..headers['Authorization'] = 'Bearer $newToken'
                ..extra['retried'] = true;
              try {
                final response = await dio.fetch(retryOptions);
                handler.resolve(response);
                return;
              } on DioException catch (retryError) {
                handler.next(retryError);
                return;
              }
            }
            await _tokenStorage.clear();
            onSessionExpired();
          }
          handler.next(error);
        },
      ),
    );
  }

  late final Dio dio;
  late final Dio _refreshDio;
  final TokenStorage _tokenStorage;
  final void Function() onSessionExpired;

  Future<bool> _tryRefresh() async {
    final refreshToken = await _tokenStorage.refreshToken;
    if (refreshToken == null) return false;

    try {
      final response = await _refreshDio.post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      await _tokenStorage.save(
        accessToken: response.data['accessToken'] as String,
        refreshToken: response.data['refreshToken'] as String,
      );
      return true;
    } on DioException {
      return false;
    }
  }
}
