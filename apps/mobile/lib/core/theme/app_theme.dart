import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

/// Paleta e identidad visual de Event Hub — negro cálido + morado vivo
/// (decisión del usuario, 2026-09-25: "me gusta el morado, hay que meterle
/// un negro, que se vea más premium y profesional"). El fondo NO es negro
/// puro (#000) — un negro con un pelo de tibieza (#0D0D12) se ve cuidado,
/// no como un modo oscuro "apagado" genérico. Las superficies (cards) son
/// un tono más claras que el fondo para que floten sin necesitar sombra
/// (las sombras casi no se notan sobre fondos oscuros).
class AppColors {
  AppColors._();

  static const ink = Color(0xFFF5F4F2); // texto principal, blanco cálido
  static const inkSoft = Color(0xFF9A98A8); // texto secundario
  static const background = Color(0xFF0D0D12); // negro cálido, no negro puro
  static const surface = Color(0xFF1A1A22); // un tono más clara que el fondo
  static const border = Color(
    0xFF2A2A35,
  ); // casi imperceptible, separa sin competir
  static const accent = Color(0xFF7C6FF0); // morado más brillante que antes —
  // el #5B4FE9 original se ve apagado sobre negro, este mantiene el mismo
  // hue pero sube luminosidad para el contraste correcto en modo oscuro.
  static const accentBright = Color(
    0xFF9B90F5,
  ); // extremo claro del degradé de los CTAs
  static const accentSoft = Color(
    0xFF232030,
  ); // fondo del acento a baja opacidad, ya no lila claro
  static const error = Color(0xFFFF6B6B);
  static const success = Color(0xFF3DD68C);
  static const warning = Color(0xFFE8A94A);
}

/// Tipografía por escala (DESIGN_SYSTEM.md §11): tracking negativo y
/// leading apretado en textos grandes, tracking neutro y leading suelto en
/// cuerpo — nunca un solo `letterSpacing` fijo para todos los tamaños.
class AppTheme {
  static ThemeData dark() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: const ColorScheme.dark(
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
            displayLarge: display.copyWith(
              fontSize: 34,
              height: 1.05,
              letterSpacing: -0.8,
              fontWeight: FontWeight.w700,
            ),
            headlineMedium: display.copyWith(
              fontSize: 24,
              height: 1.15,
              letterSpacing: -0.5,
              fontWeight: FontWeight.w600,
            ),
            titleLarge: display.copyWith(
              fontSize: 19,
              height: 1.25,
              letterSpacing: -0.3,
              fontWeight: FontWeight.w600,
            ),
            bodyLarge: body.bodyLarge?.copyWith(
              fontSize: 16,
              height: 1.5,
              letterSpacing: 0,
              color: AppColors.ink,
            ),
            bodyMedium: body.bodyMedium?.copyWith(
              fontSize: 14,
              height: 1.5,
              letterSpacing: 0,
              color: AppColors.inkSoft,
            ),
            labelLarge: body.labelLarge?.copyWith(
              fontSize: 15,
              height: 1.3,
              letterSpacing: 0.1,
              fontWeight: FontWeight.w600,
              color: AppColors.ink,
            ),
          )
          .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        foregroundColor: AppColors.ink,
        centerTitle: false,
        titleTextStyle: display.copyWith(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
        // Iconos claros en la barra de estado del sistema — sobre fondo
        // oscuro, los iconos oscuros por defecto de iOS/Android
        // desaparecerían.
        systemOverlayStyle: SystemUiOverlayStyle.light,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        labelStyle: const TextStyle(color: AppColors.inkSoft),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
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
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surface,
        contentTextStyle: const TextStyle(color: AppColors.ink),
        actionTextColor: AppColors.accentBright,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }
}

/// Degradé de marca para CTAs principales (botón "Comprar", "Ingresar",
/// etc.) — el detalle "premium" que diferencia esto de un botón plano de
/// un solo color. Uso: `decoration: BoxDecoration(gradient: AppGradients.accent, borderRadius: ...)`.
class AppGradients {
  AppGradients._();

  static const accent = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.accent, AppColors.accentBright],
  );
}
