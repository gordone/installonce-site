export function rankActivities(activities, milestones, today) {
  const verified = new Set(milestones.filter(row => row.verified).map(row => row.step));
  const completed = new Set(activities.filter(row => row.status === 'Completed').map(row => row.id));
  const roiWeight = { High: 6, Medium: 3, Low: 0, Indirect: 2 };
  const costWeight = { Low: 0, Medium: 2, High: 4 };
  return activities.map(row => {
    const days = (Date.parse(row.due_on) - Date.parse(today)) / 86400000;
    const active = !['Completed', 'Paused'].includes(row.status);
    const overdue = active && days < 0;
    const blockers = [];
    if (row.milestone_step != null && !verified.has(row.milestone_step)) {
      const milestone = milestones.find(item => item.step === row.milestone_step);
      blockers.push(milestone?.title ?? 'Production milestone #' + row.milestone_step);
    }
    if (row.prerequisite_id != null && !completed.has(row.prerequisite_id)) {
      blockers.push(activities.find(item => item.id === row.prerequisite_id)?.title ?? 'Activity #' + row.prerequisite_id);
    }
    const deadline = days <= 1 ? 8 : days <= 7 ? 4 : 0;
    const score = 3 * row.urgency + 2 * row.impact + 2 * row.dependency_importance +
      row.confidence + roiWeight[row.expected_roi] - row.effort - costWeight[row.cost_band] + deadline;
    const priority = score >= 41 ? 'P0' : score >= 32 ? 'P1' : score >= 23 ? 'P2' : 'P3';
    return { ...row, active, blockers, overdue, score, priority };
  }).sort((a, b) => Number(b.active) - Number(a.active) ||
    Number(Boolean(a.blockers.length)) - Number(Boolean(b.blockers.length)) ||
    b.score - a.score || a.due_on.localeCompare(b.due_on) || a.id - b.id);
}
