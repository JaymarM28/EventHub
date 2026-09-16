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
  List<String> roles = [];

  /// El escaneo de acceso (paso 9c) es solo para STAFF/ORGANIZER. Esto es
  /// nada más una conveniencia de UX (ocultar el ícono a quien no lo va a
  /// poder usar) — el enforcement real vive en access-service
  /// (EventAccess, por evento) y rechaza con FORBIDDEN aunque alguien
  /// llegue a la pantalla sin tener ninguno de estos roles.
  bool get canScan => roles.contains('STAFF') || roles.contains('ORGANIZER');

  Future<void> bootstrap() async {
    final hasSession = await _authRepository.hasSession();
    status = hasSession ? AuthStatus.authenticated : AuthStatus.unauthenticated;
    roles = hasSession ? await _authRepository.currentRoles() : [];
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    await _authRepository.login(email, password);
    status = AuthStatus.authenticated;
    roles = await _authRepository.currentRoles();
    notifyListeners();
  }

  Future<void> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required DateTime birthDate,
  }) async {
    await _authRepository.register(
      email: email,
      password: password,
      firstName: firstName,
      lastName: lastName,
      birthDate: birthDate,
    );
    status = AuthStatus.authenticated;
    roles = await _authRepository.currentRoles();
    notifyListeners();
  }

  Future<void> logout() async {
    await _authRepository.logout();
    status = AuthStatus.unauthenticated;
    roles = [];
    notifyListeners();
  }

  /// Llamado por ApiClient cuando el refresh token también falló — la
  /// sesión terminó de verdad (no solo un access token vencido).
  void forceLogout() {
    status = AuthStatus.unauthenticated;
    roles = [];
    notifyListeners();
  }
}
