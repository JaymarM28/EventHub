import 'package:flutter/material.dart';

/// Feedback en el frame del touch-down, no en `onTap` (DESIGN_SYSTEM.md
/// §1) — esperar a que el gesto termine para mostrar cualquier respuesta
/// visual se siente muerto. `onPressed: null` deshabilita sin quitar el
/// widget (evita que el layout salte).
///
/// Nota: NO envuelve un botón de Material (FilledButton/ElevatedButton) —
/// esos ya traen su propio detector de gestos, y anidarlo con
/// GestureDetector.onTap dispara `onPressed` dos veces. El estilo visual
/// se dibuja a mano con un Container.
class PressableButton extends StatefulWidget {
  const PressableButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.loading = false,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final bool loading;

  @override
  State<PressableButton> createState() => _PressableButtonState();
}

class _PressableButtonState extends State<PressableButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.loading;
    final colors = Theme.of(context).colorScheme;

    return GestureDetector(
      onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
      onTapUp: enabled ? (_) => setState(() => _pressed = false) : null,
      onTapCancel: enabled ? () => setState(() => _pressed = false) : null,
      onTap: enabled ? widget.onPressed : null,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: const Duration(milliseconds: 100),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(
            color: enabled ? colors.primary : colors.primary.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(14),
          ),
          alignment: Alignment.center,
          child: widget.loading
              ? SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: colors.onPrimary),
                )
              : DefaultTextStyle(
                  style: TextStyle(
                    color: colors.onPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
                  child: widget.child,
                ),
        ),
      ),
    );
  }
}
