import 'package:flutter/cupertino.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/auth_state.dart';
import '../../core/config.dart';
import '../../core/nav_return.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/pressable_button.dart';
import 'auth_repository.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  DateTime? _birthDate;
  bool _loading = false;
  String? _error;
  // El selector de fecha no es un TextFormField (abre un picker, no es
  // texto libre) — no puede usar el `validator` del Form como los demás
  // campos, así que necesita su propio estado de error para mostrarse
  // igual de pegado al campo (feedback del usuario 2026-10-01: la fecha
  // "no se valida como los otros campos").
  String? _dateError;
  // Legal (2026-10-01) — obligatorio marcar antes de poder registrarse
  // (el backend igual lo rechaza si llega `false`, ver PublicRegisterDto;
  // esto evita el viaje de red para el caso más común de olvidarlo).
  bool _acceptedTerms = false;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  // Selector estilo iPhone (ruedas), no el calendario de grilla de
  // Material — pedido explícito del usuario. CupertinoDatePicker solo
  // avisa el cambio en vivo (onDateTimeChanged); se guarda en una variable
  // local y se aplica recién al tocar "Listo", para poder cancelar sin
  // perder la fecha ya elegida antes de abrir el selector.
  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    var tempDate = _birthDate ?? DateTime(now.year - 18, now.month, now.day);
    final picked = await showModalBottomSheet<DateTime>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: SizedBox(
            height: 300,
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    CupertinoButton(
                      onPressed: () => Navigator.of(sheetContext).pop(),
                      child: const Text('Cancelar'),
                    ),
                    CupertinoButton(
                      onPressed: () =>
                          Navigator.of(sheetContext).pop(tempDate),
                      child: const Text('Listo'),
                    ),
                  ],
                ),
                const Divider(height: 1, color: AppColors.border),
                Expanded(
                  child: CupertinoTheme(
                    data: const CupertinoThemeData(
                      brightness: Brightness.dark,
                      textTheme: CupertinoTextThemeData(
                        dateTimePickerTextStyle: TextStyle(
                          color: AppColors.ink,
                          fontSize: 20,
                        ),
                      ),
                    ),
                    child: CupertinoDatePicker(
                      mode: CupertinoDatePickerMode.date,
                      initialDateTime: tempDate,
                      minimumDate: DateTime(now.year - 120),
                      maximumDate: now,
                      onDateTimeChanged: (d) => tempDate = d,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
    if (picked != null) {
      setState(() {
        _birthDate = picked;
        _dateError = null;
      });
    }
  }

  Future<void> _openLegalPage(String path) async {
    await launchUrl(
      Uri.parse('$gatewayBaseUrl$path'),
      mode: LaunchMode.externalApplication,
    );
  }

  Future<void> _submit() async {
    setState(
      () => _dateError = _birthDate == null ? 'Seleccioná tu fecha de nacimiento' : null,
    );
    final formValid = _formKey.currentState!.validate();
    if (_birthDate == null || !formValid) return;
    if (!_acceptedTerms) {
      setState(
        () => _error = 'Tenés que aceptar los Términos y la Política de Privacidad',
      );
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthState>().register(
        email: _emailController.text.trim(),
        password: _passwordController.text,
        firstName: _firstNameController.text.trim(),
        lastName: _lastNameController.text.trim(),
        birthDate: _birthDate!,
        acceptedTerms: _acceptedTerms,
      );
      if (mounted) {
        final from = currentFromParam(context);
        context.go(from != null && from.isNotEmpty ? from : '/events');
      }
    } on AuthException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('d MMM yyyy', 'es');
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close_rounded),
          // Ver el comentario equivalente en login_screen.dart — /events
          // es el único destino siempre válido sin importar cómo se
          // llegó acá (push o go).
          onPressed: () => context.go('/events'),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 8),
                Text(
                  'Crear cuenta',
                  style: Theme.of(context).textTheme.displayLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'Regístrate para empezar a comprar boletos',
                  style: Theme.of(context).textTheme.bodyLarge
                      ?.copyWith(color: AppColors.inkSoft),
                ),
                const SizedBox(height: 32),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _firstNameController,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(labelText: 'Nombre'),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'Obligatorio'
                            : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _lastNameController,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Apellido',
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'Obligatorio'
                            : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                GestureDetector(
                  onTap: _pickBirthDate,
                  child: InputDecorator(
                    decoration: InputDecoration(
                      labelText: 'Fecha de nacimiento',
                      errorText: _dateError,
                    ),
                    child: Text(
                      _birthDate == null
                          ? 'Selecciona una fecha'
                          : dateFormat.format(_birthDate!),
                      style: TextStyle(
                        color: _birthDate == null
                            ? AppColors.inkSoft
                            : AppColors.ink,
                        fontSize: 16,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                  validator: (v) =>
                      (v == null || !v.contains('@')) ? 'Email inválido' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Contraseña (mínimo 8 caracteres)',
                  ),
                  validator: (v) => (v == null || v.length < 8)
                      ? 'Mínimo 8 caracteres'
                      : null,
                ),
                const SizedBox(height: 18),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Checkbox(
                      value: _acceptedTerms,
                      onChanged: (v) =>
                          setState(() => _acceptedTerms = v ?? false),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text.rich(
                          TextSpan(
                            style: Theme.of(context).textTheme.bodyMedium,
                            children: [
                              const TextSpan(text: 'Acepto los '),
                              TextSpan(
                                text: 'Términos y Condiciones',
                                style: const TextStyle(
                                  color: AppColors.accent,
                                  fontWeight: FontWeight.w600,
                                ),
                                recognizer: TapGestureRecognizer()
                                  ..onTap = () => _openLegalPage('/legal/terms'),
                              ),
                              const TextSpan(text: ' y la '),
                              TextSpan(
                                text: 'Política de Privacidad',
                                style: const TextStyle(
                                  color: AppColors.accent,
                                  fontWeight: FontWeight.w600,
                                ),
                                recognizer: TapGestureRecognizer()
                                  ..onTap = () => _openLegalPage('/legal/privacy'),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(_error!, style: const TextStyle(color: AppColors.error)),
                ],
                const SizedBox(height: 24),
                PressableButton(
                  onPressed: _submit,
                  loading: _loading,
                  child: const Text('Crear cuenta'),
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () => context.go(
                    withFromParam('/login', currentFromParam(context)),
                  ),
                  child: const Text('¿Ya tienes cuenta? Inicia sesión'),
                ),
                const SizedBox(height: 12),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
