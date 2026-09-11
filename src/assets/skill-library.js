/**
 * The curated skill library: the suggestions the editor offers out of the box.
 *
 * Scope is every GJU school, not just IT — the German Year sends students to
 * mechanical engineering, architecture, logistics, accounting and translation
 * placements, and a list of web frameworks is no use to any of them.
 *
 * This is deliberately a few hundred entries, not thousands. It is the *seed*:
 * the editor ranks your own skills above it, remembers skills it has seen in
 * job adverts you paste, and can load the full ESCO taxonomy (~14,000 skills,
 * English and German) if you run `npm run skills:import`. So this file only has
 * to cover the common ground well.
 *
 * Keep the spelling the way an employer writes it in an advert: the internship
 * tracker's Fit % searches these strings in the advert text you paste. That is
 * why "Cascading Style Sheets (CSS)" and "CSS" both appear.
 *
 * A skill may sit in more than one group — browsing is per-field, and the flat
 * list below is deduplicated for the type-ahead.
 */

export const SKILL_LIBRARY = [
  {
    group: "Software engineering",
    skills: [
      "Object-Oriented Programming (OOP)", "Data Structures and Algorithms", "Software Testing",
      "Unit Testing", "Debugging", "Design Patterns", "Agile Methodologies", "Scrum",
      "Java", "Python", "C++", "C", "C#", "JavaScript", "TypeScript", "PHP", "Kotlin", "Swift",
      "Android Development", "Mobile Development", "Git", "GitHub", "Version Control",
      "Linux", "Bash", "Docker", "CI/CD", "Cloud Computing", "AWS", "Microsoft Azure",
      "Machine Learning", "Computer Vision", "Cybersecurity", "Computer Networks", "UML",
    ],
  },
  {
    group: ".NET and C#",
    skills: [
      "ASP.NET", "ASP.NET Core", "ASP.NET MVC", "ASP.NET Web API", "C#", ".NET",
      "Entity Framework Core", "LINQ", "Razor Pages", "Blazor", "Visual Studio",
    ],
  },
  {
    group: "Web development",
    skills: [
      "HTML", "HTML5", "Cascading Style Sheets (CSS)", "CSS", "JavaScript", "TypeScript",
      "Bootstrap5", "Bootstrap", "jQuery", "React", "Angular", "Vue.js", "Node.js", "Express.js",
      "REST APIs", "Full-Stack Development", "MVC Architecture", "JSON",
      "Authentication and Authorization", "Responsive Web Design", "Web Accessibility",
    ],
  },
  {
    group: "Databases and data",
    skills: [
      "SQL", "MySQL", "Microsoft SQL Server", "PostgreSQL", "SQLite", "Oracle Database",
      "MongoDB", "Database Design", "Stored Procedures", "Data Modelling", "ETL",
      "Microsoft Excel", "Advanced Excel", "Pivot Tables", "Power BI", "Tableau",
      "Data Analysis", "Data Visualization", "Statistics", "SPSS", "MATLAB", "R", "Reporting",
    ],
  },
  {
    group: "Mechanical and manufacturing",
    skills: [
      "AutoCAD", "SolidWorks", "CATIA", "Siemens NX", "Autodesk Inventor", "Fusion 360",
      "Technical Drawing", "Geometric Dimensioning and Tolerancing (GD&T)",
      "Finite Element Analysis (FEA)", "Computational Fluid Dynamics (CFD)", "ANSYS",
      "Machine Design", "Materials Science", "Thermodynamics", "Fluid Mechanics",
      "Heat Transfer", "Manufacturing Processes", "CNC Machining", "CAD/CAM",
      "Sheet Metal Design", "Welding", "3D Printing", "Additive Manufacturing",
      "Mechatronics", "Robotics", "Pneumatics", "Hydraulics", "HVAC",
      "Maintenance Planning", "Product Development", "Prototyping",
    ],
  },
  {
    group: "Electrical and electronics",
    skills: [
      "Circuit Design", "PCB Design", "Altium Designer", "KiCad", "EPLAN",
      "Embedded Systems", "Microcontrollers", "Arduino", "STM32", "Raspberry Pi",
      "VHDL", "Verilog", "FPGA", "Digital Electronics", "Analogue Electronics",
      "Power Electronics", "Electrical Machines", "Power Systems", "Control Systems",
      "Signal Processing", "MATLAB", "Simulink", "LabVIEW", "PLC Programming",
      "SCADA", "Instrumentation and Measurement", "Automation Technology",
      "Renewable Energy Systems", "Photovoltaics", "Battery Systems", "E-Mobility",
    ],
  },
  {
    group: "Civil and construction",
    skills: [
      "Structural Analysis", "Reinforced Concrete Design", "Steel Structure Design",
      "Geotechnical Engineering", "Soil Mechanics", "Surveying", "AutoCAD Civil 3D",
      "Revit", "Building Information Modelling (BIM)", "SAP2000", "ETABS", "STAAD.Pro",
      "Construction Management", "Site Supervision", "Quantity Surveying", "Cost Estimation",
      "Primavera P6", "Microsoft Project", "Road and Highway Design",
      "Water Supply and Drainage", "Building Codes and Standards", "Concrete Technology",
    ],
  },
  {
    group: "Architecture and design",
    skills: [
      "Architectural Design", "Revit", "ArchiCAD", "SketchUp", "Rhino", "Grasshopper",
      "AutoCAD", "Lumion", "V-Ray", "Enscape", "3ds Max", "Architectural Visualisation",
      "Urban Planning", "Interior Design", "Landscape Design", "Sustainable Design",
      "Model Making", "Technical Drawing", "Portfolio Design",
      "Adobe Photoshop", "Adobe Illustrator", "Adobe InDesign", "Adobe After Effects",
      "Figma", "UI/UX Design", "Typography", "Branding", "Graphic Design",
      "Motion Graphics", "Visual Communication", "Photography",
    ],
  },
  {
    group: "Chemical, energy and environment",
    skills: [
      "Process Engineering", "Chemical Process Design", "Aspen Plus", "Heat and Mass Transfer",
      "Reaction Engineering", "Separation Processes", "Process Simulation",
      "Water Treatment", "Wastewater Treatment", "Hydrology", "Environmental Impact Assessment",
      "Waste Management", "Air Quality Management", "Sustainability",
      "Renewable Energy", "Energy Efficiency", "Energy Management", "Solar Energy",
      "Geographic Information Systems (GIS)", "ArcGIS", "QGIS",
      "Health, Safety and Environment (HSE)", "ISO 14001",
    ],
  },
  {
    group: "Industrial engineering and logistics",
    skills: [
      "Supply Chain Management", "Logistics", "Warehouse Management", "Inventory Management",
      "Procurement", "Purchasing", "Demand Forecasting", "Production Planning",
      "Lean Manufacturing", "Six Sigma", "Kaizen", "5S", "Value Stream Mapping",
      "Operations Research", "Simulation Modelling", "Process Optimisation",
      "SAP ERP", "SAP MM", "SAP WM", "ERP Systems",
      "Quality Management", "Quality Control", "Quality Assurance", "ISO 9001",
      "Time and Motion Study", "Ergonomics", "Incoterms", "Freight Forwarding",
      "Customs Procedures", "Transport Management",
    ],
  },
  {
    group: "Business, finance and accounting",
    skills: [
      "Financial Accounting", "Managerial Accounting", "Cost Accounting", "Bookkeeping",
      "International Financial Reporting Standards (IFRS)", "Auditing", "Taxation",
      "DATEV", "SAP FI/CO", "Financial Analysis", "Financial Modelling", "Budgeting",
      "Controlling", "Banking Operations", "Investment Analysis", "Risk Management",
      "Business Administration", "Business Development", "Business Analysis",
      "Project Management", "Marketing", "Digital Marketing", "Social Media Marketing",
      "Market Research", "Sales", "Customer Relationship Management (CRM)",
      "Customer Service", "Human Resources", "Recruitment", "E-Commerce",
    ],
  },
  {
    group: "Laboratory, testing and quality",
    skills: [
      "Laboratory Techniques", "Sample Preparation", "Chemical Analysis", "Titration",
      "Chromatography", "Spectroscopy", "Microscopy", "Calibration", "Metrology",
      "Material Testing", "Non-Destructive Testing", "Testing and Inspection",
      "Standard Operating Procedures", "Good Laboratory Practice", "Documentation",
      "Biomedical Instrumentation", "Medical Device Standards",
    ],
  },
  {
    group: "Languages and communication",
    skills: [
      "German", "English", "Arabic", "French", "Spanish",
      "Translation", "Interpreting", "Localisation", "Proofreading", "Subtitling",
      "SDL Trados", "memoQ", "Terminology Management",
      "Technical Writing", "Technical Documentation", "Business Correspondence",
      "Report Writing", "Public Speaking", "Presentation Skills",
      "Intercultural Communication", "Editing",
    ],
  },
  {
    group: "Ways of working",
    skills: [
      "Microsoft Office", "Microsoft Word", "Microsoft PowerPoint", "Microsoft Project",
      "Jira", "Confluence", "Trello", "Kanban", "Teamwork", "Problem Solving",
      "Analytical Thinking", "Critical Thinking", "Attention to Detail", "Time Management",
      "Adaptability", "Self-Motivation", "Independent Work", "Reliability",
      "Leadership", "Mentoring", "Research", "Continuous Learning",
    ],
  },
];

/** Every library skill, deduplicated case-insensitively — for the type-ahead. */
export const ALL_LIBRARY_SKILLS = (() => {
  const seen = new Map();
  for (const group of SKILL_LIBRARY) {
    for (const skill of group.skills) {
      const key = skill.toLowerCase();
      if (!seen.has(key)) seen.set(key, skill);
    }
  }
  return [...seen.values()];
})();

/**
 * Optional: the full ESCO taxonomy, written by `npm run skills:import`.
 * Absent by default, fetched only when the picker is opened, and never fatal —
 * the curated library above is always there.
 */
export const TAXONOMY_URL = "data/skill-taxonomy.json";
