import 'package:go_router/go_router.dart';
import 'core/auth_state.dart';
import 'features/access/scan_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/events/event_detail_screen.dart';
import 'features/events/event_list_screen.dart';

/// Listar/ver eventos es público (events-service authMode 'optional', ver
/// api-gateway/routes.ts) — no hay redirect que exigir ahí. El único
/// redirect por ahora evita que una sesión ya autenticada se quede
/// pegada en /login o /register. Los redirects hacia login por rutas
/// protegidas (checkout, mis boletos) se agregan en el paso 9b.
GoRouter buildRouter(AuthState authState) {
  return GoRouter(
    initialLocation: '/events',
    refreshListenable: authState,
    redirect: (context, state) {
      final loggingIn = state.matchedLocation == '/login' || state.matchedLocation == '/register';
      if (authState.status == AuthStatus.authenticated && loggingIn) {
        return '/events';
      }
      // El escaneo de acceso (9c) es solo para STAFF/ORGANIZER — el backend
      // no lo exige todavía (TODOS.md #4), así que esta es la única barrera
      // real por ahora. Cualquiera que llegue aquí sin el rol rebota a
      // /events, no ve ni un flash de la cámara.
      if (state.matchedLocation == '/scan' && (authState.status != AuthStatus.authenticated || !authState.canScan)) {
        return '/events';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(path: '/events', builder: (context, state) => const EventListScreen()),
      GoRoute(
        path: '/events/:id',
        builder: (context, state) => EventDetailScreen(eventId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/scan', builder: (context, state) => const ScanScreen()),
    ],
  );
}
