import 'package:trackzyn/domain/models/project.dart';

abstract class ProjectsRepository {
  Future<List<Project>> fetchMany({
    String? projectName,
    DateTime? startDate,
    DateTime? endDate,
  });

  Future<Project> getById(String projectId);

  Future<void> add(Project project);

  Future<void> update(Project project);

  Future<void> delete(int projectId);
}
