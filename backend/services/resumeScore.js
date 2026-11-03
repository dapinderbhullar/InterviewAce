function scoreProfile(data) {
  const factors = [];
  function factor(name, checks) {
    const earned = checks.filter(check => check.met).length * 5;
    factors.push({ name, earned, maximum: 25, checks: checks.map(({ label, met, recommendation }) => ({ label, earned: met ? 5 : 0, maximum: 5, recommendation: met ? "" : recommendation })) });
  }
  const check = (label, met, recommendation) => ({ label, met: !!met, recommendation });
  factor("Completeness", [
    check("Name", data.personal.name, "Include your name."),
    check("Contact", data.personal.email || data.personal.phone, "Add a contact email or phone number."),
    check("Education", data.education.some(e => e.institution && e.qualification), "Describe your education or qualification."),
    check("Education dates", data.education.some(e => e.startDate || e.endDate), "Add education dates where appropriate."),
    check("Achievements", data.achievements.length, "Include a supported achievement, certification or award if applicable."),
  ]);
  const categories = new Set(data.skills.map(s => s.category));
  factor("Skill presentation", [
    check("Skills listed", data.skills.length, "List skills you can support with evidence."),
    check("Skill breadth", data.skills.length >= 3, "Make relevant skills explicit; do not add skills you do not possess."),
    check("Categories", categories.size >= 2, "Clarify the different types of skills you use."),
    check("Evidence", data.skills.length && data.skills.every(s => s.evidence.length), "Provide resume evidence for every listed skill."),
    check("Applied skills", data.skills.some(s => [...data.projects, ...data.experience].some(p => p.evidence.some(e => e.quote.toLowerCase().includes(s.name.toLowerCase())))), "Show how you used your skills in projects or experience."),
  ]);
  factor("Project descriptions", [
    check("Projects", data.projects.length, "Include a relevant project if applicable."),
    check("Project description", data.projects.some(p => p.description.length >= 30), "Explain what a project does."),
    check("Project technologies", data.projects.some(p => p.technologies.length), "Name technologies actually used in your projects."),
    check("Project detail", data.projects.some(p => p.description.length >= 80), "Describe your contribution and implementation details."),
    check("Project outcomes", data.projects.some(p => /\d/.test(p.description)), "Add a truthful measurable project outcome where possible."),
  ]);
  factor("Experience presentation", [
    check("Experience", data.experience.length, "Include relevant work, internship or volunteering experience if applicable."),
    check("Role and organization", data.experience.some(e => e.role && e.company), "Identify your role and organization."),
    check("Experience dates", data.experience.some(e => e.startDate || e.endDate), "Include experience dates."),
    check("Responsibilities", data.experience.some(e => e.description.length >= 40), "Describe your responsibilities and contributions."),
    check("Experience outcomes", data.experience.some(e => /\d/.test(e.description)), "Add a truthful measurable experience outcome where possible."),
  ]);
  return { version: 1, total: factors.reduce((sum, item) => sum + item.earned, 0), maximum: 100,
    label: "Resume Intelligence Score", disclaimer: "A profile-presentation heuristic, not an ATS score, hiring prediction, or verified proficiency assessment. Early-career resumes may have no experience. Profile edits do not change your PDF.", factors,
    strengths: factors.filter(f => f.earned >= 15).map(f => `${f.name}: ${f.earned}/${f.maximum}`),
    missingInformation: factors.flatMap(f => f.checks.filter(c => !c.earned).map(c => c.label)),
    recommendations: factors.flatMap(f => f.checks.filter(c => !c.earned).map(c => c.recommendation)) };
}
module.exports = { scoreProfile };
