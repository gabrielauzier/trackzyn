import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class SleekInput extends StatelessWidget {
  const SleekInput({
    super.key,
    required TextEditingController controller,
    this.hintText,
    this.prefixIcon,
    this.onSubmitted,
    this.autofocus = false,
  }) : _controller = controller;

  final TextEditingController _controller;
  final String? hintText;
  final Widget? prefixIcon;
  final void Function(String)? onSubmitted;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      autofocus: autofocus,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(color: ColorPalette.neutral400),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12.0)),
          borderSide: BorderSide(color: ColorPalette.neutral200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12.0)),
          borderSide: BorderSide(color: ColorPalette.neutral200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12.0)),
          borderSide: BorderSide(color: ColorPalette.neutral200),
        ),
        prefixIcon: prefixIcon,
      ),
    );
  }
}
