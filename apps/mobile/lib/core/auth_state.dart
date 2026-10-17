import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';

import '../features/auth/auth_repository.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

/// Única fuente de verdad de si hay sesión — go_router la escucha para
/// redirigir (ver app_router.dart), y las pantallas la usan para saber si
/// mostrar el login o el contenido protegido.
class AuthState extends ChangeNotifier {
  AuthState(this._authRepository, [LocalAuthentication? localAuth])
    : _localAuth = localAuth ?? LocalAuthentication();

  final AuthRepository _authRepository;
  final LocalAuthentication _localAuth;
  AuthStatus status = AuthStatus.unknown;
  List<String> roles = [];
  String? email;

  /// Face ID/Touch ID como candado LOCAL sobre la sesión ya guardada
  /// (DESIGN.md #32) — no es un mecanismo de auth nuevo contra el backend,
  /// solo gatea la UI. Arranca en `false` incluso con sesión: se activa
  /// en `bootstrap()` solo si el dispositivo de verdad soporta biometría,
  /// para no bloquear a alguien en un simulador o teléfono sin Face ID.
  bool locked = false;

  void unlock() {
    locked = false;
    notifyListeners();
  }

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
    email = hasSession ? await _authRepository.currentEmail() : null;
    locked = hasSession && await _deviceSupportsBiometrics();
    notifyListeners();
  }

  /// `canCheckBiometrics` no alcanza solo — en un simulador o un teléfono
  /// sin ningún dedo/rostro enrolado puede dar `true` pero fallar al
  /// autenticar; `isDeviceSupported` es la señal real de "hay hardware
  /// biométrico usable". Cualquier excepción (plugin no disponible, etc.)
  /// se trata como "no bloquear" — mejor fallar abierto en una app de
  /// boletos que dejar a alguien afuera de una sesión que no puede
  /// desbloquear.
  Future<bool> _deviceSupportsBiometrics() async {
    try {
      final canCheck = await _localAuth.canCheckBiometrics;
      final supported = await _localAuth.isDeviceSupported();
      return canCheck && supported;
    } catch (_) {
      return false;
    }
  }

  /// Llamado desde `BiometricLockScreen` — no vive ahí para no repetir la
  /// instancia de `LocalAuthentication` ni la política de "fallar abierto".
  Future<bool> authenticateWithBiometrics() async {
    try {
      return await _localAuth.authenticate(
        localizedReason: 'Desbloqueá Event Hub para continuar',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }

  Future<void> login(String email, String password) async {
    await _authRepository.login(email, password);
    status = AuthStatus.authenticated;
    roles = await _authRepository.currentRoles();
    this.email = await _authRepository.currentEmail();
    notifyListeners();
  }

  Future<void> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required DateTime birthDate,
    required bool acceptedTerms,
  }) async {
    await _authRepository.register(
      email: email,
      password: password,
      firstName: firstName,
      lastName: lastName,
      birthDate: birthDate,
      acceptedTerms: acceptedTerms,
    );
    status = AuthStatus.authenticated;
    roles = await _authRepository.currentRoles();
    this.email = await _authRepository.currentEmail();
    notifyListeners();
  }

  /// No cambia `status`/`roles` — a diferencia de login/register, no se
  /// emite sesión acá. Pasa directo por AuthRepository solo porque es el
  /// único punto de acceso a auth que el árbol de providers expone hoy.
  Future<void> forgotPassword(String email) =>
      _authRepository.forgotPassword(email);

  Future<void> resetPassword({
    required String email,
    required String code,
    required String newPassword,
  }) {
    return _authRepository.resetPassword(
      email: email,
      code: code,
      newPassword: newPassword,
    );
  }

  Future<void> logout() async {
    await _authRepository.logout();
    status = AuthStatus.unauthenticated;
    roles = [];
    email = null;
    notifyListeners();
  }

  /// Llamado por ApiClient cuando el refresh token también falló — la
  /// sesión terminó de verdad (no solo un access token vencido).
  void forceLogout() {
    status = AuthStatus.unauthenticated;
    roles = [];
    email = null;
    notifyListeners();
  }
}
