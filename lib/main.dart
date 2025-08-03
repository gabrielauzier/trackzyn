import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:trackzyn/app/app_widget.dart';
import 'package:trackzyn/app/dependencies/local.dart';

void main() {
  runApp(MultiProvider(providers: providersLocal, child: const AppWidget()));
}
