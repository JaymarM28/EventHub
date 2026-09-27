import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;

/// URL base del api-gateway (único servicio expuesto, ver DESIGN.md paso 3).
///
/// El emulador de Android no puede resolver "localhost" como la máquina
/// host — usa el alias especial 10.0.2.2. El simulador de iOS sí comparte
/// red con el host, así que "localhost" funciona directo ahí. Un
/// dispositivo físico (Android o iOS) no comparte red con el Mac de
/// ninguna forma — necesita la IP de LAN del Mac, pasada explícitamente:
///
/// ```
/// flutter run -d DEVICE_ID --dart-define=API_HOST=192.168.1.23
/// ```
String get gatewayBaseUrl {
  const apiHost = String.fromEnvironment('API_HOST');
  if (apiHost.isNotEmpty) return 'http://$apiHost:3010';
  if (kIsWeb) return 'http://localhost:3010';
  if (Platform.isAndroid) return 'http://10.0.2.2:3010';
  return 'http://localhost:3010';
}
