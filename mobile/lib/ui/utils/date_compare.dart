bool dateCompare(DateTime date1, DateTime date2) {
  // Compare only the date part (year, month, day)
  return date1.year == date2.year &&
      date1.month == date2.month &&
      date1.day == date2.day;
}
