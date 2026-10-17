import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';

/// Barra de navegación inferior (pedido explícito del usuario, 2026-09-28:
/// "Hagamos una barar inferior de navegacion") — antes Eventos/Mis
/// boletos/Perfil eran tres rutas sueltas (Mis boletos solo alcanzable
/// como sub-item dentro de Perfil). `StatefulShellRoute.indexedStack`
/// mantiene el estado de cada tab (scroll, filtros) al cambiar entre
/// ellas, a diferencia de simplemente navegar con `context.go`.
class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) => navigationShell.goBranch(
          index,
          // Volver a tocar la tab activa vuelve a su raíz (ej. si estabas
          // en medio de un scroll o de un filtro) — comportamiento
          // estándar esperado de una bottom nav bar.
          initialLocation: index == navigationShell.currentIndex,
        ),
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.accentSoft,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.event_outlined),
            selectedIcon: Icon(Icons.event_rounded),
            label: 'Eventos',
          ),
          NavigationDestination(
            icon: Icon(Icons.confirmation_number_outlined),
            selectedIcon: Icon(Icons.confirmation_number_rounded),
            label: 'Mis boletos',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Perfil',
          ),
        ],
      ),
    );
  }
}
