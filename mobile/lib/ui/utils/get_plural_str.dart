getPluralStr(int? count, String singular, String plural, {String? none}) {
  if (count != null && count == 0 && none != null) {
    return none;
  }

  if (count == null) {
    return "";
  }

  String str = "$count ";

  return count == 1 ? str + singular : str + plural;
}
