export const PROFILE_FIELDS = {
  personal: ["name", "email", "phone", "location", "links"],
  education: ["institution", "qualification", "field", "startDate", "endDate", "details"],
  experience: ["company", "role", "startDate", "endDate", "description"],
  projects: ["name", "description", "technologies"], achievements: ["title", "description"],
  skills: ["name", "category", "proficiency"],
};
export const SKILL_CATEGORIES = ["Programming Languages", "Frameworks", "Databases", "Tools", "Cloud & DevOps", "Technical Concepts", "Non-technical", "Other"];
export function editableEntry(section, entry) {
  return Object.fromEntries(PROFILE_FIELDS[section].map(key => [key, key === "technologies" ? entry.technologies.map(item => item.name) : structuredClone(entry[key])]));
}
export function entryDraft(section, entry) {
  const value = editableEntry(section, entry);
  for (const key of ["links", "technologies"]) if (Array.isArray(value[key])) value[key] = value[key].join(", ");
  return value;
}
export function draftPayload(section, draft) {
  const value = { ...draft };
  for (const key of PROFILE_FIELDS[section]) if (["links", "technologies"].includes(key)) value[key] = draft[key].split(",").map(item => item.trim()).filter(Boolean);
  return value;
}
export function createProfileClient(api) {
  return {
    async resumes(options) { return (await api.get("/resume", options)).data; },
    async get(resumeId, options) { return (await api.get(`/profiles/${resumeId}`, options)).data.profile; },
    async extract(resumeId, retry = false) {
      try { return (await api.post(`/profiles/${resumeId}/extract`, { retry })).data.profile; }
      catch (error) { if (error.response?.data?.profile) return error.response.data.profile; throw error; }
    },
    async edit(resumeId, profile, section, index, action, value) {
      return (await api.patch(`/profiles/${resumeId}`, { revision: profile.revision, section, ...(section === "personal" ? {} : { index }), action, ...(action === "update" ? { value } : {}) })).data.profile;
    },
  };
}
