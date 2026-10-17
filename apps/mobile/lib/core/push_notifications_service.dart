import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../features/notifications/notifications_repository.dart';

/// Handler de mensajes en segundo plano/terminada — FCM exige que sea una
/// función de nivel superior (no un método de instancia) marcada con este
/// pragma, o el plugin no la encuentra al recibir un push con la app
/// cerrada. No hace nada más que dejar que el sistema operativo muestre la
/// notificación (el payload ya trae title/body — ver PushService del
/// backend) — no hay lógica propia que correr acá todavía.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {}

/// Notificaciones push (2026-09-29) — pide permiso, obtiene el token de
/// FCM y lo registra en notifications-service (ver PushService/
/// NotificationsController ahí). Wrapea TODO en try/catch a propósito: sin
/// los archivos de configuración de Firebase (`google-services.json` en
/// Android, `GoogleService-Info.plist` en iOS — ninguno existe todavía en
/// este repo), `Firebase.initializeApp()` falla, y el resto de la app
/// (comprar, ver boletos, escanear) tiene que seguir funcionando exacto
/// igual que hoy sin push, no crashear en el arranque.
///
/// Pasos manuales pendientes (fuera de este código, requieren cuentas
/// reales del usuario):
/// 1. Crear un proyecto en https://console.firebase.google.com
/// 2. Agregar una app iOS (bundle id `dev.eventhub.mobile`, ver
///    ios/Runner.xcodeproj) y otra Android (mismo applicationId) — descarga
///    `GoogleService-Info.plist` y `google-services.json`.
/// 3. iOS: arrastrar `GoogleService-Info.plist` a ios/Runner en Xcode
///    (Copy items if needed) + activar la capability "Push Notifications"
///    y "Background Modes > Remote notifications" en el target Runner.
/// 4. Android: poner `google-services.json` en android/app/, agregar el
///    plugin `com.google.gms.google-services` (classpath en
///    android/build.gradle, apply en android/app/build.gradle).
/// 5. Apple Developer: generar una "APNs Auth Key" (Certificates, IDs &
///    Profiles > Keys) y subirla en Firebase (Project Settings > Cloud
///    Messaging > Apple app configuration) — sin esto, FCM no puede
///    entregar el push en iOS aunque todo lo demás esté bien.
/// 6. Correr `flutter pub get` y reinstalar la app.
/// 7. Backend: generar una cuenta de servicio de Firebase (Project
///    Settings > Cuentas de servicio > Generar nueva clave privada) y
///    completar FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY en
///    notifications-service/.env — ver PushService ahí.
class PushNotificationsService {
  PushNotificationsService(this._notificationsRepository);

  final NotificationsRepository _notificationsRepository;
  String? _lastRegisteredToken;

  /// Llamado una vez al arrancar la app (main.dart) — configura el
  /// listener de refresh de token independientemente de si hay sesión
  /// todavía (así no se pierde un refresh que ocurra antes de loguearse).
  Future<void> initialize() async {
    try {
      await Firebase.initializeApp();
    } catch (err) {
      // Esperado en este repo hasta completar los pasos manuales de arriba
      // — no es un error real de la app, solo "push no configurado todavía".
      debugPrint('Firebase no inicializado (push deshabilitado): $err');
      return;
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      _lastRegisteredToken = token;
      _notificationsRepository
          .registerDeviceToken(token, _platform)
          .catchError((_) {});
    });
  }

  /// Llamado tras login/register exitoso y al arrancar con sesión ya
  /// activa (AuthState.bootstrap) — pide permiso (iOS lo requiere
  /// explícito; Android < 13 lo concede solo) y registra el token actual.
  /// Silencioso en cualquier falla: el usuario puede seguir usando la app
  /// sin push, no es un flujo crítico.
  Future<void> registerIfPermitted() async {
    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      final granted =
          settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      if (!granted) return;

      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      _lastRegisteredToken = token;
      await _notificationsRepository.registerDeviceToken(token, _platform);
    } catch (err) {
      debugPrint('No se pudo registrar el token de push: $err');
    }
  }

  /// Llamado al cerrar sesión — evita seguir mandándole push de OTRA
  /// cuenta a un dispositivo que ya deslogueó la suya.
  Future<void> unregister() async {
    final token = _lastRegisteredToken;
    if (token == null) return;
    try {
      await _notificationsRepository.unregisterDeviceToken(token);
    } catch (err) {
      debugPrint('No se pudo dar de baja el token de push: $err');
    } finally {
      _lastRegisteredToken = null;
    }
  }

  String get _platform => Platform.isIOS ? 'ios' : 'android';
}
