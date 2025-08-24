import 'package:provider/single_child_widget.dart';

import 'package:trackzyn/app/dependencies/providers/activities_usecases_providers.dart';
import 'package:trackzyn/app/dependencies/providers/projects_usecases_providers.dart';
import 'package:trackzyn/app/dependencies/providers/services_providers.dart';
import 'package:trackzyn/app/dependencies/providers/tasks_usecases_providers.dart';
import 'package:trackzyn/app/dependencies/providers/viewmodels_providers.dart';

List<SingleChildWidget> get useCasesProviders {
  return [
    ...activitiesUseCasesProviders,
    ...projectsUseCasesProviders,
    ...tasksUseCasesProviders,
    ...viewModelsProviders,
  ];
}

List<SingleChildWidget> get providersLocal {
  return [...servicesProviders, ...useCasesProviders];
}
