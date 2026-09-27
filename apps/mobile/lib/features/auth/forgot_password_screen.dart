import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/auth_state.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/pressable_button.dart';
import 'auth_repository.dart';

/// Flujo en dos pasos dentro de la misma pantalla (sin navegar a otra
/// ruta para el segundo paso) — más simple que separar en dos screens
/// cuando el único dato que se lleva de un paso al otro es el email.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailFormKey = GlobalKey<FormState>();
  final _resetFormKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();
  final _newPasswordController = TextEditingController();

  bool _codeSent = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _newPasswordController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    if (!_emailFormKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthState>().forgotPassword(
        _emailController.text.trim(),
      );
      if (mounted) setState(() => _codeSent = true);
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resetPassword() async {
    if (!_resetFormKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthState>().resetPassword(
        email: _emailController.text.trim(),
        code: _codeController.text.trim(),
        newPassword: _newPasswordController.text,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Contraseña actualizada — ya podés ingresar'),
          ),
        );
        context.go('/login');
      }
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(backgroundColor: AppColors.background, elevation: 0),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: _codeSent
              ? _buildResetForm(context)
              : _buildEmailForm(context),
        ),
      ),
    );
  }

  Widget _buildEmailForm(BuildContext context) {
    return Form(
      key: _emailFormKey,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Recuperar contraseña',
            style: Theme.of(context).textTheme.displayLarge,
          ),
          const SizedBox(height: 8),
          Text(
            'Te enviamos un código a tu email para crear una nueva contraseña.',
            style: Theme.of(context).textTheme.bodyLarge
                ?.copyWith(color: AppColors.inkSoft),
          ),
          const SizedBox(height: 28),
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
            validator: (v) =>
                (v == null || !v.contains('@')) ? 'Email inválido' : null,
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!, style: const TextStyle(color: AppColors.error)),
          ],
          const SizedBox(height: 24),
          PressableButton(
            onPressed: _sendCode,
            loading: _loading,
            child: const Text('Enviar código'),
          ),
        ],
      ),
    );
  }

  Widget _buildResetForm(BuildContext context) {
    return Form(
      key: _resetFormKey,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Revisa tu email',
            style: Theme.of(context).textTheme.displayLarge,
          ),
          const SizedBox(height: 8),
          Text(
            'Ingresá el código de 6 dígitos que te enviamos a ${_emailController.text.trim()} y tu nueva contraseña.',
            style: Theme.of(context).textTheme.bodyLarge
                ?.copyWith(color: AppColors.inkSoft),
          ),
          const SizedBox(height: 28),
          TextFormField(
            controller: _codeController,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: const InputDecoration(labelText: 'Código de 6 dígitos'),
            validator: (v) => (v == null || v.trim().length != 6)
                ? 'El código debe tener 6 dígitos'
                : null,
          ),
          TextFormField(
            controller: _newPasswordController,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Nueva contraseña'),
            validator: (v) =>
                (v == null || v.length < 8) ? 'Mínimo 8 caracteres' : null,
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!, style: const TextStyle(color: AppColors.error)),
          ],
          const SizedBox(height: 24),
          PressableButton(
            onPressed: _resetPassword,
            loading: _loading,
            child: const Text('Cambiar contraseña'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => setState(() => _codeSent = false),
            child: const Text('Usar otro email'),
          ),
        ],
      ),
    );
  }
}
