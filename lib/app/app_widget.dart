import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'package:trackzyn/app/constants.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/ui/navigation/app_navigation_bar.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';
import 'package:trackzyn/ui/resources/theme_manager.dart';

class AppWidget extends StatefulWidget {
  const AppWidget({super.key});

  @override
  State<AppWidget> createState() => _AppWidgetState();
}

class _AppWidgetState extends State<AppWidget> {
  late final cubit = Provider.of<RecordCubit>(context, listen: false);

  void initDatabase() {
    final databaseService = Provider.of<LocalDatabaseService>(
      context,
      listen: false,
    );

    databaseService.init();
  }

  @override
  void initState() {
    super.initState();
    initDatabase();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: AppConstants.appName,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('en', 'US'), Locale('pt', 'BR')],
      theme: buildTheme(),
      home: BlocProvider(create: (context) => cubit, child: AppNavigationBar()),
    );
  }
}
