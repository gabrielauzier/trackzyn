import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/repositories/in-memory/activities_repository_in_memory.dart';
import 'package:trackzyn/data/repositories/in-memory/projects_repository_in_memory.dart';
import 'package:trackzyn/data/repositories/in-memory/tasks_repository_in_memory.dart';
import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/domain/use_cases/add_activity_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_activities_usecase.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';

List<SingleChildWidget> get providersLocal {
  return [
    RepositoryProvider<ActivitiesRepository>(
      create: (context) => ActivitiesRepositoryInMemory(),
    ),
    RepositoryProvider<TasksRepository>(
      create: (context) => TasksRepositoryInMemory(),
    ),
    RepositoryProvider<ProjectsRepository>(
      create: (context) => ProjectsRepositoryInMemory(),
    ),
    RepositoryProvider<AddActivityUseCase>(
      create:
          (context) => AddActivityUseCase(
            context.read<ActivitiesRepository>(),
            context.read<TasksRepository>(),
          ),
    ),
    RepositoryProvider<GetActivitiesUseCase>(
      create:
          (context) =>
              GetActivitiesUseCase(context.read<ActivitiesRepository>()),
    ),
    BlocProvider<RecordCubit>(
      create:
          (context) => RecordCubit(
            context.read<AddActivityUseCase>(),
            context.read<GetActivitiesUseCase>(),
          ),
    ),
    Provider<LocalDatabaseService>(create: (context) => LocalDatabaseService()),
  ];
}
