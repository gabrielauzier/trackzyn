import 'package:flutter/material.dart';
import 'package:trackzyn/ui/resources/color_palette.dart';

class SleekSelect extends StatefulWidget {
  final List<DropdownMenuItem<String>>? items;
  final String? selectedValue;
  final ValueChanged<String?>? onChanged;

  const SleekSelect({
    super.key,
    required this.items,
    this.selectedValue,
    this.onChanged,
  });

  @override
  State<SleekSelect> createState() => _SleekSelectState();
}

class _SleekSelectState extends State<SleekSelect> {
  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    var value = widget.selectedValue;

    bool valueExists =
        widget.items?.any((item) => item.value == value) ?? false;

    if (!valueExists) {
      // If the value does not exist in the items, reset to null
      value = null;
    }

    return DropdownButtonHideUnderline(
      child: ButtonTheme(
        alignedDropdown: true,
        child: Container(
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(color: ColorPalette.neutral300, width: 1.0),
              left: BorderSide(color: ColorPalette.neutral300, width: 1.0),
              right: BorderSide(color: ColorPalette.neutral300, width: 1.0),
            ),
            borderRadius: BorderRadius.vertical(top: Radius.circular(12.0)),
          ),

          child: DropdownButton(
            dropdownColor: Colors.white,
            borderRadius: BorderRadius.circular(12.0),
            padding: EdgeInsets.zero,
            value: value,
            items: widget.items,
            onChanged: (value) {
              // setState(() {
              //   _selectedValue = value;
              // });
              widget.onChanged?.call(value);
              debugPrint('Selected: $value');
            },
            isExpanded: true,
            menuMaxHeight: 200.0,
            itemHeight: 48.0,
          ),
        ),
      ),
    );
  }
}
