import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/repositories/local/local_activities_repository.dart';
import 'package:trackzyn/data/repositories/local/local_projects_repository.dart';
import 'package:trackzyn/data/repositories/local/local_tasks_repository.dart';
import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/data/services/csv_service.dart';
import 'package:trackzyn/data/services/local_database_service.dart';

List<SingleChildWidget> get servicesProviders {
  return [
    Provider<LocalDatabaseService>(create: (context) => LocalDatabaseService()),
    Provider<CsvService>(create: (context) => CsvService()),
    RepositoryProvider<ActivitiesRepository>(
      create:
          (context) => LocalActivitiesRepository(
            localDatabaseService: context.read<LocalDatabaseService>(),
          ),
    ),
    RepositoryProvider<TasksRepository>(
      create:
          (context) => LocalTasksRepository(
            localDatabaseService: context.read<LocalDatabaseService>(),
          ),
    ),
    RepositoryProvider<ProjectsRepository>(
      create:
          (context) => LocalProjectsRepository(
            localDatabaseService: context.read<LocalDatabaseService>(),
          ),
    ),
  ];
}
