import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

import 'package:trackzyn/data/repositories/activities_repository.dart';
import 'package:trackzyn/data/repositories/local/local_activities_repository.dart';
import 'package:trackzyn/data/repositories/local/local_projects_repository.dart';
import 'package:trackzyn/data/repositories/local/local_tasks_repository.dart';
import 'package:trackzyn/data/repositories/projects_repository.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/data/services/local_database_service.dart';
import 'package:trackzyn/domain/use_cases/add_activity_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_project_usecase.dart';
import 'package:trackzyn/domain/use_cases/add_task_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_activities_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_projects_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_tasks_usecase.dart';
import 'package:trackzyn/ui/record/record_cubit.dart';

List<SingleChildWidget> get providersLocal {
  return [
    Provider<LocalDatabaseService>(create: (context) => LocalDatabaseService()),
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
    RepositoryProvider<AddActivityUseCase>(
      create:
          (context) => AddActivityUseCase(
            context.read<ActivitiesRepository>(),
            context.read<TasksRepository>(),
          ),
    ),
    RepositoryProvider<AddProjectUseCase>(
      create:
          (context) => AddProjectUseCase(
            projectsRepository: context.read<ProjectsRepository>(),
          ),
    ),
    RepositoryProvider<GetActivitiesUseCase>(
      create:
          (context) =>
              GetActivitiesUseCase(context.read<ActivitiesRepository>()),
    ),
    RepositoryProvider<GetProjectsUseCase>(
      create:
          (context) => GetProjectsUseCase(context.read<ProjectsRepository>()),
    ),
    RepositoryProvider<GetTasksUseCase>(
      create: (context) => GetTasksUseCase(context.read<TasksRepository>()),
    ),
    RepositoryProvider<AddTaskUseCase>(
      create: (context) => AddTaskUseCase(context.read<TasksRepository>()),
    ),
    BlocProvider<RecordCubit>(
      create:
          (context) => RecordCubit(
            context.read<AddActivityUseCase>(),
            context.read<GetActivitiesUseCase>(),
            context.read<AddProjectUseCase>(),
            context.read<GetProjectsUseCase>(),
            context.read<GetTasksUseCase>(),
            context.read<AddTaskUseCase>(),
          ),
    ),
    Provider<LocalDatabaseService>(create: (context) => LocalDatabaseService()),
  ];
}
