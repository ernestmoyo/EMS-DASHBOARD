import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Light and dark themes mirroring the web dashboard's Bitlynx green design
/// system (EMS Green #0f8a50 / #34c07d, green-black dark surface, IBM Plex).
class AppTheme {
  const AppTheme._();

  static const _primary = Color(0xFF0F8A50); // EMS Green
  static const _primaryDark = Color(0xFF34C07D); // brighter green for dark mode
  static const _lightBg = Color(0xFFF3F7F4); // faint green paper (web --bg light)
  static const _darkBg = Color(0xFF0A130E); // green-black (web --bg dark)
  static const _darkSurface = Color(0xFF11211A);

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: _primary,
      brightness: Brightness.light,
    );
    return _base(scheme, _lightBg);
  }

  static ThemeData get dark {
    final scheme = ColorScheme.fromSeed(
      seedColor: _primary,
      brightness: Brightness.dark,
    ).copyWith(primary: _primaryDark, surface: _darkSurface);
    return _base(scheme, _darkBg);
  }

  static ThemeData _base(ColorScheme scheme, Color scaffold) {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffold,
    );
    // IBM Plex Sans for all UI text (matches the web font).
    final textTheme = GoogleFonts.ibmPlexSansTextTheme(base.textTheme);

    return base.copyWith(
      textTheme: textTheme,
      cardTheme: CardThemeData(
        elevation: 0,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10), // tighter, hairline web feel
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.6)),
        ),
      ),
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 1,
        titleTextStyle: GoogleFonts.ibmPlexSans(
          fontSize: 17,
          fontWeight: FontWeight.w600,
          color: scheme.onSurface,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 48),
          textStyle: GoogleFonts.ibmPlexSans(fontWeight: FontWeight.w600),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        filled: true,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: scheme.primary,
        indicatorColor: scheme.primary,
      ),
      snackBarTheme:
          const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }

  /// IBM Plex Mono style for numeric readouts (gauge values, metrics) —
  /// mirrors the web's tabular-mono treatment of numbers.
  static TextStyle mono({
    double? fontSize,
    FontWeight fontWeight = FontWeight.w700,
    Color? color,
  }) {
    return GoogleFonts.ibmPlexMono(
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
  }

  static ThemeMode themeModeFromString(String mode) {
    switch (mode) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }
}
