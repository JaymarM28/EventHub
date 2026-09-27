import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/pressable_button.dart';

/// Candado local (DESIGN.md #32) — se muestra vía redirect de go_router
/// cuando `AuthState.locked` es true (ver app_router.dart). A propósito
/// NO dispara Face ID automáticamente al entrar (se probó y se cuelga en
/// arranque en frío — el plugin nativo de local_auth todavía no está
/// listo tan rápido) — espera un tap explícito del botón.
class BiometricLockScreen extends StatefulWidget {
  const BiometricLockScreen({super.key});

  @override
  State<BiometricLockScreen> createState() => _BiometricLockScreenState();
}

class _BiometricLockScreenState extends State<BiometricLockScreen> {
  bool _authenticating = false;
  bool _failed = false;

  Future<void> _authenticate() async {
    setState(() {
      _authenticating = true;
      _failed = false;
    });
    final success = await context
        .read<AuthState>()
        .authenticateWithBiometrics();
    if (!mounted) return;
    if (success) {
      context.read<AuthState>().unlock();
    } else {
      setState(() {
        _authenticating = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.accentSoft,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.lock_rounded,
                    color: AppColors.accent,
                    size: 30,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Event Hub bloqueado',
                  style: Theme.of(context).textTheme.displayLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  _failed
                      ? 'No se pudo verificar tu identidad'
                      : 'Desbloqueá para continuar',
                  style: Theme.of(context).textTheme.bodyLarge
                      ?.copyWith(color: AppColors.inkSoft),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                PressableButton(
                  onPressed: _authenticating ? null : _authenticate,
                  loading: _authenticating,
                  child: const Text('Desbloquear'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
