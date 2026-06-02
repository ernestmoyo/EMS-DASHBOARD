import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// A 270° radial gauge mirroring the web dashboard's SVG arc gauges.
class RadialGauge extends StatelessWidget {
  const RadialGauge({
    super.key,
    required this.value,
    required this.min,
    required this.max,
    required this.label,
    this.unit = '',
    this.color,
    this.decimals = 1,
    this.size = 150,
  });

  final double? value;
  final double min;
  final double max;
  final String label;
  final String unit;
  final Color? color;
  final int decimals;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final v = value;
    final arcColor = color ?? scheme.primary;

    // Animate the arc + number: sweeps from 0 on first paint, and smoothly
    // transitions whenever the value updates (mirrors the web gauge motion).
    return SizedBox(
      width: size,
      height: size,
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: 0, end: v ?? 0),
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (context, animV, _) {
          final pct = (max <= min)
              ? 0.0
              : ((animV - min) / (max - min)).clamp(0.0, 1.0);
          return CustomPaint(
            painter: _GaugePainter(
              pct: pct,
              arcColor: arcColor,
              trackColor: scheme.surfaceContainerHighest,
            ),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    v == null ? '—' : animV.toStringAsFixed(decimals),
                    style: AppTheme.mono(
                      fontSize: size * 0.18,
                      color: scheme.onSurface,
                    ),
                  ),
                  if (unit.isNotEmpty)
                    Text(unit,
                        style: TextStyle(
                            fontSize: size * 0.09,
                            color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: size * 0.083,
                        color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({
    required this.pct,
    required this.arcColor,
    required this.trackColor,
  });

  final double pct;
  final Color arcColor;
  final Color trackColor;

  static const _startAngle = math.pi * 0.75; // 135°
  static const _sweep = math.pi * 1.5; // 270°

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.09;
    final rect = Rect.fromLTWH(
      stroke / 2,
      stroke / 2,
      size.width - stroke,
      size.height - stroke,
    );
    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = trackColor;
    final arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round
      ..color = arcColor;

    canvas.drawArc(rect, _startAngle, _sweep, false, track);
    canvas.drawArc(rect, _startAngle, _sweep * pct, false, arc);
  }

  @override
  bool shouldRepaint(_GaugePainter old) =>
      old.pct != pct || old.arcColor != arcColor;
}
