import 'package:flutter/material.dart';

getTimeStr(TimeOfDay time) {
  final hour = time.hourOfPeriod == 0 ? 12 : time.hourOfPeriod;
  final period = time.period == DayPeriod.am ? 'am' : 'pm';
  return '$hour:${time.minute.toString().padLeft(2, '0')} $period';
}
