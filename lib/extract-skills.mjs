/**
 * Pull the skills out of a job advertisement.
 *
 * The point of this over a fixed catalogue: no list can hold every skill in
 * every trade, and German adverts name things no English list contains
 * ("Zerspanungstechnik", "Bauleitung", "Kreditorenbuchhaltung"). Reading the
 * advert itself scales where a catalogue cannot.
 *
 * Runs in scripts/editor-server.mjs only, so the API key stays on your machine —
 * same rule as the certificate extraction next door.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { Anthropic, DEFAULT_MODEL } from "./extract-certificate.mjs";

export const AdSkillsSchema = z.object({
  skills: z
    .array(z.string())
    .describe(
      "The skills, tools, technologies, methods and qualifications the advert asks for. " +
        "Each one short enough to sit on a CV as a single item."
    ),
  language: z
    .string()
    .describe("The language the advert is written in, as an English word, e.g. German."),
  role: z.string().describe("The job title the advert is for, or an empty string if unclear."),
});

export const SKILLS_SYSTEM_PROMPT = `You read job and internship advertisements and list the skills they ask for, so a student can tick off the ones they have.

Rules:
- List only what the advert actually asks for. Never invent a plausible-sounding requirement.
- Keep each skill the way an employer would write it on a CV: "SolidWorks", "Bauleitung", "Financial Accounting", "SPS-Programmierung". Not sentences, not "experience with X".
- Keep the advert's own language. A German advert yields German skill names; do not translate them.
- Split bundles: "CAD (SolidWorks, CATIA)" becomes three entries.
- Include soft skills and languages only when the advert names them as requirements.
- Include the required language levels as skills when stated, e.g. "German C1".
- Drop duplicates and near-duplicates, keeping the more specific wording.
- 5 to 25 skills is normal. If the text is not a job advert, return an empty list.`;

export async function extractAdSkills({ client, model = DEFAULT_MODEL, text }) {
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: SKILLS_SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: zodOutputFormat(AdSkillsSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "List the skills this advertisement asks for.\n\n<advertisement>\n" +
              String(text).slice(0, 40000) +
              "\n</advertisement>",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to read this text. Nothing was added.");
  }
  if (!response.parsed_output) {
    throw new Error("The model's response did not match the expected schema. Nothing was added.");
  }

  const seen = new Set();
  const skills = [];
  for (const raw of response.parsed_output.skills) {
    const skill = String(raw).trim();
    const key = skill.toLowerCase();
    if (!skill || seen.has(key)) continue;
    seen.add(key);
    skills.push(skill);
  }

  return { ...response.parsed_output, skills };
}

export { Anthropic };
