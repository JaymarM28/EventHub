import 'package:flutter/foundation.dart';
import '../features/auth/auth_repository.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

/// Única fuente de verdad de si hay sesión — go_router la escucha para
/// redirigir (ver app_router.dart), y las pantallas la usan para saber si
/// mostrar el login o el contenido protegido.
class AuthState extends ChangeNotifier {
  AuthState(this._authRepository);

  final AuthRepository _authRepository;
  AuthStatus status = AuthStatus.unknown;

  Future<void> bootstrap() async {
    status = await _authRepository.hasSession() ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    await _authRepository.login(email, password);
    status = AuthStatus.authenticated;
    notifyListeners();
  }

  Future<void> register(String email, String password) async {
    await _authRepository.register(email, password);
    status = AuthStatus.authenticated;
    notifyListeners();
  }

  Future<void> logout() async {
    await _authRepository.logout();
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }

  /// Llamado por ApiClient cuando el refresh token también falló — la
  /// sesión terminó de verdad (no solo un access token vencido).
  void forceLogout() {
    status = AuthStatus.unauthenticated;
    notifyListeners();
  }
}
