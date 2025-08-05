import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:provider/single_child_widget.dart';
import 'package:trackzyn/data/repositories/tasks_repository.dart';
import 'package:trackzyn/domain/use_cases/add_task_usecase.dart';
import 'package:trackzyn/domain/use_cases/get_tasks_usecase.dart';

List<SingleChildWidget> get tasksUseCasesProviders {
  return [
    RepositoryProvider<GetTasksUseCase>(
      create: (context) => GetTasksUseCase(context.read<TasksRepository>()),
    ),
    RepositoryProvider<AddTaskUseCase>(
      create: (context) => AddTaskUseCase(context.read<TasksRepository>()),
    ),
  ];
}
