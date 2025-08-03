import 'package:trackzyn/domain/models/project.dart';

abstract class ProjectsRepository {
  Future<List<Project>> fetchMany({
    String? projectName,
    DateTime? startDate,
    DateTime? endDate,
  });

  Future<Project> getById(String projectId);

  Future<int?> add(Project project);

  Future<void> update(Project project);

  Future<void> delete(int projectId);
}
