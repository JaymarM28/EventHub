import 'package:go_router/go_router.dart';

import 'core/auth_state.dart';
import 'features/access/scan_screen.dart';
import 'features/auth/biometric_lock_screen.dart';
import 'features/auth/forgot_password_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/events/event_detail_screen.dart';
import 'features/events/event_list_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/tickets/my_tickets_screen.dart';

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
      // Candado biométrico (DESIGN.md #32) — antes que cualquier otra
      // regla, así ninguna pantalla protegida se alcanza a pintar detrás
      // suyo mientras está bloqueado.
      if (authState.locked && state.matchedLocation != '/locked') {
        return '/locked';
      }
      if (!authState.locked && state.matchedLocation == '/locked') {
        return '/events';
      }
      final loggingIn =
          state.matchedLocation == '/login' ||
          state.matchedLocation == '/register';
      if (authState.status == AuthStatus.authenticated && loggingIn) {
        return '/events';
      }
      // El escaneo de acceso (9c) es solo para STAFF/ORGANIZER — el backend
      // no lo exige todavía (TODOS.md #4), así que esta es la única barrera
      // real por ahora. Cualquiera que llegue aquí sin el rol rebota a
      // /events, no ve ni un flash de la cámara.
      if (state.matchedLocation == '/scan' &&
          (authState.status != AuthStatus.authenticated ||
              !authState.canScan)) {
        return '/events';
      }
      // "Mis boletos" exige sesión — sin token, GET /tickets/mine
      // respondería 401 antes de que la pantalla llegue a pintar nada útil.
      if (state.matchedLocation == '/tickets' &&
          authState.status != AuthStatus.authenticated) {
        return '/login';
      }
      if (state.matchedLocation == '/profile' &&
          authState.status != AuthStatus.authenticated) {
        return '/login';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/locked',
        builder: (context, state) => const BiometricLockScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: '/events',
        builder: (context, state) => const EventListScreen(),
      ),
      GoRoute(
        path: '/events/:id',
        builder: (context, state) =>
            EventDetailScreen(eventId: state.pathParameters['id']!),
      ),
      GoRoute(path: '/scan', builder: (context, state) => const ScanScreen()),
      GoRoute(
        path: '/tickets',
        builder: (context, state) => const MyTicketsScreen(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfileScreen(),
      ),
    ],
  );
}
