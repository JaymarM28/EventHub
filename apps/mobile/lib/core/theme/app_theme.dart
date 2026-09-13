import 'package:flutter/material.dart';

/// Tipografía por escala (DESIGN_SYSTEM.md §11): tracking negativo y
/// leading apretado en textos grandes, tracking neutro y leading suelto en
/// cuerpo — nunca un solo `letterSpacing` fijo para todos los tamaños.
class AppTheme {
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4)),
      textTheme: const TextTheme(
        displayLarge: TextStyle(fontSize: 34, height: 1.05, letterSpacing: -0.5, fontWeight: FontWeight.w700),
        headlineMedium: TextStyle(fontSize: 24, height: 1.15, letterSpacing: -0.3, fontWeight: FontWeight.w600),
        titleLarge: TextStyle(fontSize: 20, height: 1.2, letterSpacing: -0.1, fontWeight: FontWeight.w600),
        bodyLarge: TextStyle(fontSize: 16, height: 1.5, letterSpacing: 0),
        bodyMedium: TextStyle(fontSize: 14, height: 1.5, letterSpacing: 0),
        labelLarge: TextStyle(fontSize: 14, height: 1.3, letterSpacing: 0.1, fontWeight: FontWeight.w600),
      ),
    );
  }
}
