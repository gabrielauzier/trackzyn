import 'package:copy_with_extension/copy_with_extension.dart';
import 'package:trackzyn/domain/models/project.dart';

part 'home_state.g.dart';

@CopyWith()
class HomeState {
  final List<Project> projects;

  HomeState({this.projects = const []});
}
