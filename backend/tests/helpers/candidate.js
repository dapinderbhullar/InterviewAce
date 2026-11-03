const TEXT = `Alice Example
alice@example.test
Example University BSc Computing 2020 2024
Acme Intern 2023 Built JavaScript dashboards for 10 teams with Node.js.
Interview Tool: Built a JavaScript interview tool with Node.js for 20 users and documented the complete implementation.
Skills: JavaScript, Node.js, SQL, Teamwork
Teamwork award 2024`;
function candidate(text = TEXT) {
  const name = text.includes("Bob Example") ? "Bob Example" : "Alice Example";
  const email = text.includes("bob@example.test") ? "bob@example.test" : "alice@example.test";
  const project = "Built a JavaScript interview tool with Node.js for 20 users and documented the complete implementation.";
  return {
    personal: { name, email, phone: "", location: "", links: [], evidence: [`${name}\n${email}`] },
    education: [{ institution: "Example University", qualification: "BSc", field: "Computing", startDate: "2020", endDate: "2024", details: "", evidence: ["Example University BSc Computing 2020 2024"] }],
    experience: [{ company: "Acme", role: "Intern", startDate: "2023", endDate: "", description: "Built JavaScript dashboards for 10 teams with Node.js.", evidence: ["Acme Intern 2023 Built JavaScript dashboards for 10 teams with Node.js."] }],
    projects: [{ name: "Interview Tool", description: project, technologies: [{ name: "Node.js", evidence: ["Interview Tool: " + project] }], evidence: ["Interview Tool: " + project] }],
    achievements: [{ title: "Teamwork award", description: "2024", evidence: ["Teamwork award 2024"] }],
    skills: [
      { name: "JavaScript", category: "Programming Languages", proficiency: "Advanced", evidence: ["Skills: JavaScript, Node.js, SQL, Teamwork"] },
      { name: "Node.js", category: "Frameworks", proficiency: "Intermediate", evidence: ["Skills: JavaScript, Node.js, SQL, Teamwork"] },
      { name: "SQL", category: "Databases", proficiency: "Advanced", evidence: ["Skills: JavaScript, Node.js, SQL, Teamwork"] },
      { name: "Teamwork", category: "Non-technical", proficiency: "Intermediate", evidence: ["Skills: JavaScript, Node.js, SQL, Teamwork"] },
    ],
  };
}
module.exports = { TEXT, candidate };
