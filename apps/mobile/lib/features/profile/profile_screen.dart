import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/theme/app_theme.dart';

const _roleLabels = {
  'SUPER_ADMIN': 'Administrador',
  'ORGANIZER': 'Organizador',
  'STAFF': 'Staff',
  'VENDOR': 'Vendedor',
  'ATTENDEE': 'Comprador',
};

/// Pantalla de perfil (pedido explícito del usuario, 2026-09-25: "no tengo
/// para organizar mi perfil") — antes la única forma de cerrar sesión era
/// un ícono suelto en la lista de eventos, sin ningún lugar que mostrara
/// quién sos. No hay edición de datos todavía (el backend no tiene un
/// endpoint para eso) — es un punto de partida: identidad + accesos +
/// cerrar sesión.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final authState = context.watch<AuthState>();
    final email = authState.email ?? '';
    final initial = email.isNotEmpty ? email[0].toUpperCase() : '?';
    final roleLabels = authState.roles.map((r) => _roleLabels[r] ?? r).toList();

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Perfil')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Center(
              child: Column(
                children: [
                  Container(
                    width: 84,
                    height: 84,
                    decoration: const BoxDecoration(
                      gradient: AppGradients.accent,
                      shape: BoxShape.circle,
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      initial,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 34,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(email, style: Theme.of(context).textTheme.titleLarge),
                  if (roleLabels.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      alignment: WrapAlignment.center,
                      children: roleLabels
                          .map(
                            (label) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.accentSoft,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                label,
                                style: const TextStyle(
                                  color: AppColors.accent,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 32),
            _ProfileTile(
              icon: Icons.confirmation_number_outlined,
              label: 'Mis boletos',
              onTap: () => context.push('/tickets'),
            ),
            if (authState.canScan) ...[
              const SizedBox(height: 10),
              _ProfileTile(
                icon: Icons.qr_code_scanner_rounded,
                label: 'Escanear boletos',
                onTap: () => context.push('/scan'),
              ),
            ],
            const SizedBox(height: 32),
            _ProfileTile(
              icon: Icons.logout_rounded,
              label: 'Cerrar sesión',
              danger: true,
              onTap: () async {
                await context.read<AuthState>().logout();
                if (context.mounted) context.go('/events');
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final color = danger ? AppColors.error : AppColors.ink;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                ),
              ),
            ),
            if (!danger)
              const Icon(
                Icons.chevron_right_rounded,
                color: AppColors.inkSoft,
                size: 20,
              ),
          ],
        ),
      ),
    );
  }
}
