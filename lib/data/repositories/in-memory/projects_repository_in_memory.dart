// import 'dart:ffi';

// import 'package:trackzyn/data/repositories/projects_repository.dart';
// import 'package:trackzyn/domain/models/project.dart';

// class ProjectsRepositoryInMemory implements ProjectsRepository {
//   final List<Project> _projects = [];

//   @override
//   Future<List<Project>> fetchMany({
//     Int? projectId,
//     String? projectName,
//     DateTime? startDate,
//     DateTime? endDate,
//   }) async {
//     // Simulate fetching projects from memory
//     return _projects.where((project) {
//       if (projectName != null && !project.name.contains(projectName)) {
//         return false;
//       }
//       // if (startDate != null && project.date.isBefore(startDate)) return false;
//       // if (endDate != null && project.date.isAfter(endDate)) return false;
//       return true;
//     }).toList();
//   }

//   @override
//   Future<Project> getById(int projectId) async {
//     return _projects.firstWhere((project) => project.id == projectId);
//   }

//   @override
//   Future<int?> add(Project project) async {
//     _projects.add(project);
//     return project.id; // Assuming project.id is set when the project is created
//   }

//   @override
//   Future<void> update(Project project) async {
//     final index = _projects.indexWhere((p) => p.id == project.id);
//     if (index != -1) {
//       _projects[index] = project;
//     }
//   }

//   @override
//   Future<void> delete(int projectId) async {
//     _projects.removeWhere((project) => project.id == projectId);
//   }
// }
