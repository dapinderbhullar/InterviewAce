// Version changes whenever scoring semantics change. Historical reports stay immutable.
const ALGORITHM_VERSION = 1;
const aliases = { 'node.js': 'node', nodejs: 'node', 'react.js': 'react', reactjs: 'react', js: 'javascript', ts: 'typescript', postgres: 'postgresql', 'amazon web services': 'aws', 'mongo db': 'mongodb' };
const normalize = value => { const key = value.toLowerCase().replace(/\s+/g, ' ').trim(); return aliases[key] || key; };
function mentions(text, name) {
  const keys = [name, ...Object.keys(aliases).filter(key => aliases[key] === name)];
  return keys.some(key => new RegExp(`(?:^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9+#])`, 'i').test(text));
}
function matchJob(profile, job) {
  const projects = profile.projects || [], experience = profile.experience || [], skills = profile.skills || [];
  const entryText = entry => [entry.name, entry.role, entry.description, ...(entry.technologies || []).map(t => t.name)].filter(Boolean).join(' ');
  const unique = values => [...new Map(values.map(name => [normalize(name), name])).values()];
  const required = unique(job.requiredSkills || []), requiredKeys = new Set(required.map(normalize));
  const preferred = unique(job.preferredSkills || []).filter(s => !requiredKeys.has(normalize(s)));
  const requirements = [...required, ...preferred];
  const classify = name => {
    const key = normalize(name), listed = skills.find(s => normalize(s.name) === key);
    const applied = [...projects, ...experience].filter(entry => mentions(entryText(entry), key));
    const status = applied.length || (listed && listed.proficiency !== 'Beginner') ? 'matched' : listed ? 'partial' : 'missing';
    return { name, status, credit: status === 'matched' ? 1 : status === 'partial' ? 0.5 : 0,
      reason: applied.length ? 'Named in saved project or experience details.' : listed ? status === 'partial' ? 'Listed at Beginner level; applied evidence is absent.' : 'Listed in the saved profile; proficiency is not independently verified.' : 'No explicit evidence in the saved profile.',
      evidence: applied.map(entry => ({ name: entry.name || entry.role, description: entry.description || '' })) };
  };
  const requiredSkills = required.map(classify), preferredSkills = preferred.map(classify);
  const relevant = entries => entries.map((entry, index) => ({ index, name: entry.name || entry.role || 'Untitled', company: entry.company || '',
    description: entry.description || '', skills: requirements.filter(name => mentions(entryText(entry), normalize(name))) })).filter(entry => entry.skills.length);
  const relevantProjects = relevant(projects), relevantExperience = relevant(experience);
  const coverage = entries => requirements.length ? unique(entries.flatMap(e => e.skills)).length / requirements.length : null;
  const average = list => list.length ? list.reduce((sum, item) => sum + item.credit, 0) / list.length : null;
  const factors = [
    { key: 'required', label: 'Required skills', weight: 60, value: average(requiredSkills), reason: 'Full match = 1; Beginner listing without application = 0.5; missing = 0.' },
    { key: 'preferred', label: 'Preferred skills', weight: 15, value: average(preferredSkills), reason: 'Same skill credits as required skills, with a lower weight.' },
    { key: 'projects', label: 'Project relevance', weight: 15, value: coverage(relevantProjects), reason: 'Fraction of distinct job skills explicitly named in saved project details.' },
    { key: 'experience', label: 'Experience relevance', weight: 10, value: coverage(relevantExperience), reason: 'Fraction of distinct job skills explicitly named in saved work details; does not infer tenure or seniority.' },
  ];
  const denominator = factors.reduce((sum, f) => sum + (f.value === null ? 0 : f.weight), 0);
  for (const factor of factors) { factor.effectiveWeight = denominator && factor.value !== null ? factor.weight / denominator * 100 : 0; factor.points = factor.value === null ? 0 : factor.value * factor.effectiveWeight; }
  const gaps = [...requiredSkills.map(s => ({ ...s, priority: 'required' })), ...preferredSkills.map(s => ({ ...s, priority: 'preferred' }))].filter(s => s.status !== 'matched');
  return { score: denominator ? Math.round(factors.reduce((sum, f) => sum + f.points, 0)) : null, factors, requiredSkills, preferredSkills, relevantProjects, relevantExperience,
    recommendations: gaps.map(s => `${s.priority === 'required' ? 'Prioritize' : 'Consider'} ${s.name}: ${s.status === 'partial' ? 'add truthful examples of applied use and strengthen proficiency' : 'develop this skill; add it only when supported by real experience'}.`)
      .concat(relevantProjects.map(p => `Highlight project “${p.name}” for ${p.skills.join(', ')}; describe your contribution and verified outcomes.`), relevantExperience.map(e => `Highlight “${e.name}”${e.company ? ` at ${e.company}` : ''} for ${e.skills.join(', ')}.`)),
    limitations: ['Evidence-based compatibility guidance; does not guarantee ATS success, interviews or selection.', 'No inferred skills, semantic equivalence, seniority, tenure or responsibility fit. Review the extracted requirements against the original job description.', ...(denominator ? [] : ['No explicit skill requirements were extracted; a score cannot be calculated.']), 'Absent requirement categories are excluded and remaining weights are normalized. Missing candidate evidence receives zero credit.'],
  };
}
module.exports = { matchJob, normalize, ALGORITHM_VERSION };
