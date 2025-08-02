import 'package:flutter/material.dart';
import 'dart:math' as math;

import 'package:trackzyn/ui/resources/color_palette.dart';

class Arc extends StatelessWidget {
  final double diameter;
  final double progress; // Progress as a value between 0.0 and 1.0
  final Color color;
  final bool pointer;

  const Arc({
    super.key,
    this.diameter = 200,
    this.progress = 0.0,
    this.color = ColorPalette.violet500,
    this.pointer = false,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: ArcPainter(progress: progress, color: color, pointer: pointer),
      size: Size(diameter, diameter),
    );
  }
}

class ArcPainter extends CustomPainter {
  final double progress;
  final Color color;
  final bool pointer;

  ArcPainter({
    this.progress = 0.0,
    this.color = ColorPalette.violet500,
    this.pointer = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    Paint paint = Paint()..color = color;
    paint.style = PaintingStyle.stroke;
    paint.strokeCap = StrokeCap.round;
    paint.strokeWidth = 4;

    // Convert progress percentage to radians
    double sweepAngle = progress * 2 * math.pi;

    // Draw the arc
    canvas.drawArc(
      Rect.fromCenter(
        center: Offset(size.height / 2, size.width / 2),
        height: size.height,
        width: size.width,
      ),
      -math.pi / 2, // Start at the top of the circle (90 degrees)
      sweepAngle, // Draw the progress percentage converted to radians
      false,
      paint,
    );

    if (pointer && progress > 0 && progress < 1) {
      final double radius = 5; // Radius of the circle
      final Offset center = Offset(
        size.width / 2 + (size.width / 2) * math.cos(-math.pi / 2 + sweepAngle),
        size.height / 2 +
            (size.height / 2) * math.sin(-math.pi / 2 + sweepAngle),
      );

      // Draw the outer shadow
      Paint borderPaint =
          Paint()
            ..color = ColorPalette.neutral400
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1;

      borderPaint.maskFilter = MaskFilter.blur(BlurStyle.solid, 3);
      canvas.drawCircle(center, radius, borderPaint);

      // Draw the white border
      borderPaint =
          Paint()
            ..color = Colors.white
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1;

      // borderPaint.maskFilter = MaskFilter.blur(BlurStyle.solid, 3);
      canvas.drawCircle(center, radius, borderPaint);

      // Draw the inner circle
      Paint circlePaint = Paint()..color = color;
      circlePaint.style = PaintingStyle.fill;
      // circlePaint.maskFilter = MaskFilter.blur(BlurStyle.solid, 2);

      canvas.drawCircle(center, radius - 1, circlePaint);
    }
  }

  @override
  bool shouldRepaint(CustomPainter oldDelegate) =>
      oldDelegate is ArcPainter && oldDelegate.progress != progress;
}
