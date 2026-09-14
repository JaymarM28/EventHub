import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Paleta e identidad visual de Event Hub. Claro y cálido (nunca el
/// blanco/gris frío por defecto de Material), con un único acento vivo
/// (índigo) reservado para CTAs, precios y estados activos — todo lo demás
/// vive en tinta neutra para que el acento no compita consigo mismo.
class AppColors {
  AppColors._();

  static const ink = Color(0xFF16161D); // texto principal, casi negro
  static const inkSoft = Color(0xFF6B6B76); // texto secundario
  static const background = Color(0xFFFAF9F6); // fondo cálido, no blanco puro
  static const surface = Color(0xFFFFFFFF);
  static const border = Color(0xFFE7E4DD);
  static const accent = Color(0xFF5B4FE9); // índigo vivo — CTA, precio, activo
  static const accentSoft = Color(0xFFEEEBFC); // fondo del acento a baja opacidad
  static const error = Color(0xFFDC3D43);
  static const success = Color(0xFF1E9E5A);
  static const warning = Color(0xFFB5760A);
}

/// Tipografía por escala (DESIGN_SYSTEM.md §11): tracking negativo y
/// leading apretado en textos grandes, tracking neutro y leading suelto en
/// cuerpo — nunca un solo `letterSpacing` fijo para todos los tamaños.
class AppTheme {
  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: const ColorScheme.light(
        primary: AppColors.accent,
        onPrimary: Colors.white,
        secondary: AppColors.accent,
        surface: AppColors.surface,
        onSurface: AppColors.ink,
        error: AppColors.error,
        outline: AppColors.border,
      ),
    );

    final display = GoogleFonts.sora(color: AppColors.ink);
    final body = GoogleFonts.interTextTheme(base.textTheme);

    return base.copyWith(
      textTheme: body
          .copyWith(
            displayLarge: display.copyWith(fontSize: 34, height: 1.05, letterSpacing: -0.8, fontWeight: FontWeight.w700),
            headlineMedium: display.copyWith(fontSize: 24, height: 1.15, letterSpacing: -0.5, fontWeight: FontWeight.w600),
            titleLarge: display.copyWith(fontSize: 19, height: 1.25, letterSpacing: -0.3, fontWeight: FontWeight.w600),
            bodyLarge: body.bodyLarge?.copyWith(fontSize: 16, height: 1.5, letterSpacing: 0, color: AppColors.ink),
            bodyMedium: body.bodyMedium?.copyWith(fontSize: 14, height: 1.5, letterSpacing: 0, color: AppColors.inkSoft),
            labelLarge: body.labelLarge?.copyWith(fontSize: 15, height: 1.3, letterSpacing: 0.1, fontWeight: FontWeight.w600, color: AppColors.ink),
          )
          .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: AppColors.ink,
        centerTitle: false,
        titleTextStyle: display.copyWith(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.3),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: const TextStyle(color: AppColors.inkSoft),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.error),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.accent,
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
      iconTheme: const IconThemeData(color: AppColors.ink),
    );
  }
}
