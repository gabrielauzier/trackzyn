import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class SleekInput extends StatelessWidget {
  const SleekInput({
    super.key,
    required TextEditingController controller,
    this.hintText,
    this.prefixIcon,
    this.onSubmitted,
  }) : _controller = controller;

  final TextEditingController _controller;
  final String? hintText;
  final Icon? prefixIcon;
  final void Function(String)? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _controller,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(color: ColorPalette.neutral400),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12.0)),
          borderSide: BorderSide(color: ColorPalette.neutral300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12.0)),
          borderSide: BorderSide(color: ColorPalette.neutral300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12.0)),
          borderSide: BorderSide(color: ColorPalette.neutral300),
        ),
        prefixIcon: prefixIcon,
      ),
    );
  }
}
