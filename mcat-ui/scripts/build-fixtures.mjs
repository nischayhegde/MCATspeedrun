// Copies a sample of REAL parsed questions (image + data.json fields) out of the
// questionbankparsing output into this prototype's fixtures so the UI runs on
// real MCAT content. Run: `npm run prep`.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", ".."); // MCATspeedrun/
const questionsDir = join(repo, "questionbankparsing", "output", "qbank", "questions");
const outImages = join(here, "..", "public", "fixtures");
const outJson = join(here, "..", "src", "fixtures", "questions.json");

const LIMIT = 14;

fs.mkdirSync(outImages, { recursive: true });
fs.mkdirSync(dirname(outJson), { recursive: true });

if (!fs.existsSync(questionsDir)) {
    console.error(`No parsed questions found at ${questionsDir}.`);
    console.error("Writing an empty fixture set; run the parser to populate real questions.");
    fs.writeFileSync(outJson, JSON.stringify([], null, 2));
    process.exit(0);
}

const ids = fs
    .readdirSync(questionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

const picked = [];
for (const id of ids) {
    if (picked.length >= LIMIT) { break; }
    const folder = join(questionsDir, id);
    const dataPath = join(folder, "data.json");
    const imgPath = join(folder, "image.png");
    if (!fs.existsSync(dataPath) || !fs.existsSync(imgPath)) { continue; }

    let rec;
    try {
        rec = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    } catch {
        continue;
    }
    if (rec?.validation?.status !== "pass") { continue; }

    fs.copyFileSync(imgPath, join(outImages, `${id}.png`));

    picked.push({
        id: rec.id,
        image: `/fixtures/${id}.png`,
        stem: rec.stem ?? "",
        choices: rec.choices ?? {},
        hasFigure: !!rec.flags?.has_figure,
        hasPassage: !!rec.flags?.has_passage,
        answer: {
            letter: rec.answer?.letter ?? null,
            explanation: rec.answer?.explanation ?? "",
        },
        tags: {
            section: rec.tags?.section ?? null,
            discipline: rec.tags?.discipline ?? null,
            foundationalConcept: rec.tags?.foundational_concept ?? null,
            contentCategory: rec.tags?.content_category ?? null,
            skills: rec.tags?.skills ?? [],
            subtopics: rec.tags?.subtopics ?? [],
        },
        difficulty: rec.difficulty?.overall ?? 3,
    });
}

fs.writeFileSync(outJson, JSON.stringify(picked, null, 2));
console.log(`Wrote ${picked.length} question fixtures -> ${outJson}`);
console.log(`Copied images -> ${outImages}`);
