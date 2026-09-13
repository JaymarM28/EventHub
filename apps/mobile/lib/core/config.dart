import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

/// URL base del api-gateway (único servicio expuesto, ver DESIGN.md paso 3).
///
/// El emulador de Android no puede resolver "localhost" como la máquina
/// host — usa el alias especial 10.0.2.2. El simulador de iOS sí comparte
/// red con el host, así que "localhost" funciona directo ahí.
String get gatewayBaseUrl {
  if (kIsWeb) return 'http://localhost:3010';
  if (Platform.isAndroid) return 'http://10.0.2.2:3010';
  return 'http://localhost:3010';
}
