import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Bug reportado por el usuario (2026-09-28): tras iniciar sesión o
/// registrarse, la app siempre mandaba a /events sin importar desde dónde
/// se había pedido el login (ej. la tab "Mis boletos" estando deslogueado).
/// Este query param `from` viaja entre /tickets|/profile -> /login/register
/// -> destino real, para poder volver adonde estaba el usuario.
String? currentFromParam(BuildContext context) =>
    GoRouterState.of(context).uri.queryParameters['from'];

String withFromParam(String path, String? from) {
  if (from == null || from.isEmpty) return path;
  return '$path?from=${Uri.encodeComponent(from)}';
}
