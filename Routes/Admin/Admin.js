
require('dotenv').config();
const express = require('express');
const app = express();
const fs = require('fs-extra');
const pdf = require('pdf-parse');
const User = require('../../Db_Schemas/User');
const multer = require('multer');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { writeFileSync } = require('fs');
const Test = require('../../Db_Schemas/Test');
const Question = require('../../Db_Schemas/Questions');

const { pdfToPng } = require('pdf-to-png-converter');
const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const OpenAI = require("openai");

const PdfStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'QAUploads/');
    },
    filename: function (req, file, cb) {
        const customFileName = `${Date.now().toString(36) + Math.random().toString(36).substr(2, 40) + Math.random().toString(36).substr(2, 20) + Math.random().toString(36).substr(2, 40)}.${(file.mimetype).split('/')[1]}`;
        cb(null, customFileName);
    }
});
const ImageStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'Images/');
    },
    filename: function (req, file, cb) {
        const customFileName = `${Date.now().toString(36) + Math.random().toString(36).substr(2, 40) + Math.random().toString(36).substr(2, 20) + Math.random().toString(36).substr(2, 40)}.${(file.mimetype).split('/')[1]}`;
        cb(null, customFileName);
    }
});
const upload = multer({ storage: PdfStorage });
const UploadImages = multer({ storage: ImageStorage });

app.get('/getAllUsers', async (req, res, next) => {
    User.find({})
        .then(result => {
            res.json(result);
            console.log(result);

        }).catch(error => {
            console.log(error);
        })
})
const openai = new OpenAI({
    apiKey: process.env.AiKey
});


app.post('/extractSnippingText', async (req, res) => {
    try {
        const base64Image = req.body.base64Image; // Expect the full data URL: "data:image/png;base64,...."
        console.log('url', base64Image)

        if (!base64Image || !base64Image.startsWith('data:image')) {
            return res.status(400).json({ error: 'Invalid or missing base64Image in request body' });
        }

        // Extract base64 string (remove "data:image/png;base64," prefix)
        const base64Data = base64Image.split(',')[1];

        // Send to OpenAI
        const result = await openai.chat.completions.create({
            model: 'gpt-4.1',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: `You are an expert OCR + document reconstruction engine for educational content.

Your task is to analyze the provided image carefully and extract ALL visible content with maximum accuracy.

The image may contain:
- English text
- Complex mathematical equations
- Fractions, roots, matrices, integrals, summations
- Tables
- Subscripts / superscripts
- Diagrams / figures / charts
- MCQ questions
- Paragraph passages
- Answers / explanations
- Mixed formatting

IMPORTANT GOALS:
1. Preserve original structure exactly.
2. Convert all mathematical expressions into VALID LaTeX.
3. Convert normal text into clean HTML formatting.
4. Detect images/figures and mention them using placeholders like:
   <img alt="diagram related to question" />
5. Return ONLY valid JSON array.
6. No markdown.
7. No extra commentary.
8. If multiple questions exist, return multiple JSON objects.
9. If one passage belongs to multiple questions, repeat same passage in related objects.
10. Fix OCR mistakes intelligently.

-----------------------------------
JSON FORMAT REQUIRED
-----------------------------------

[
 {
   "id":"unique-random-id",
   "title":"Suitable title for question",
   "passage":"<p>Passage text here with formatting and LaTeX like \\(x^2+y^2=1\\)</p>",
   "question":"<p>Question text here with formatting and LaTeX like \\(x^2+y^2=1\\)</p>",
   "options":[
      "A. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>",
      "B. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>",
      "C. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>",
      "D. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>"
   ],
   "answer":"A Or B Or C Or D if objective else the given answer in subjective",
   "explanation":"<p>Explanation text if visible otherwise empty string</p>",
   "type":"objective or subjective",
   "difficulty": "easy or medium or hard",
   "tags": ["tag1", "tag2", "tag3"]
 }
]

-----------------------------------
HTML RULES
-----------------------------------

Use HTML tags where needed:
<p>, <b>, <i>, <u>, <br>, <sup>, <sub>, <table>, <tr>, <td>, <ul>, <ol>, <li>, <span>

Examples:
- Fraction inline math: \\(\\frac{a+b}{c}\\)
- Equation block: \\[x^2+y^2=z^2\\]
- Chemical / powers: H<sub>2</sub>O
- Exponents: x<sup>2</sup>

-----------------------------------
LATEX RULES
-----------------------------------

All maths MUST be valid LaTeX.

Examples:
√(x+1) => \\sqrt{x+1}

(x^2 + y^2)/(a+b) => \\frac{x^2+y^2}{a+b}

Integral => \\int_0^1 x^2 dx

Matrix =>
\\begin{bmatrix}
1 & 2 \\\\
3 & 4
\\end{bmatrix}

Use:
\\theta \\alpha \\beta \\pi \\sin \\cos \\tan \\log \\lim \\sum \\prod etc.

Wrap inline math in:
\\(...\\)

Wrap block math in:
\\[...\\]

-----------------------------------
QUESTION TYPE RULES
-----------------------------------

If options exist:
"type":"objective"

If no options:
"type":"subjective"

-----------------------------------
ANSWER RULES
-----------------------------------

If correct option visible:
"answer":"A"

If not visible:
"answer":""

-----------------------------------
MULTIPLE QUESTIONS RULES
-----------------------------------

If image contains many questions, detect each separately and output all.

-----------------------------------
STRICT OUTPUT RULE
-----------------------------------

Return ONLY raw valid JSON array.
No explanation.
No markdown.
No text before or after JSON`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${base64Data}`
                            }
                        },
                        {
                            type: 'text',
                            text: 'Extract text and make sure mathematical expressions remain intact and return structured JSON.'
                        }
                    ]
                }
            ],
            max_tokens: 10000,
            store: true
        });

        // Parse JSON response
        const jsonResponse = JSON.parse(result.choices[0].message.content);

        res.json(jsonResponse);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to process image.' });
    }
});

app.post('/extractText', UploadImages.single('file'), async (req, res) => {
    try {
        const imagePath = path.join(__dirname, '..', '..', 'Images', req.file.filename);
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');

        const result = await openai.chat.completions.create({
            model: 'gpt-4.1',
            response_format: { "type": "json_object" },
            messages: [
                {
                    role: 'system',
                    content: `You are an expert OCR + document reconstruction engine for educational content.

Your task is to extract ALL visible content from the image and reconstruct it with maximum accuracy.

The image may contain:
- English text
- Mathematical equations
- Fractions, roots, integrals, matrices, summations
- Tables
- MCQs
- Paragraphs
- Diagrams

critical rules
. Preserve formatting logically using JSON structure
. Maintain readability and spacing like original image
. Keep bullet points and numbering if visible
. Preserve emphasis using markdown-like indicators in text ONLY if necessary:
   - bold → **text**
   - underline → __text__
. Convert all math into LaTeX ONLY
. DO NOT hallucinate or add extra content
. If something is unclear, keep it as plain text
----------------------------------------------------
STRICT OUTPUT RULE
----------------------------------------------------
Return ONLY valid JSON array.
No markdown.
No explanation.
No extra text.

----------------------------------------------------
CRITICAL LATEX RULES (MOST IMPORTANT)
----------------------------------------------------

✔ You MUST output CLEAN VALID LaTeX (not double escaped unless required by JSON)

✔ IMPORTANT ESCAPING RULE:
- Output LaTeX normally inside strings
- Use SINGLE backslash for LaTeX commands:
  Correct: $ \frac{a}{b} $
  Correct: $ \sqrt{x} $
  Correct: $ x^2 $

❌ DO NOT double escape like:
  \\frac or \\sqrt (WRONG unless required by a specific parser)

✔ Always wrap math:
- Inline math → $\( ... \)$
- Block math → $\[ ... \]$

✔ Standard symbols:
$ \theta $, $ \alpha $, $ \beta $, $ \pi $, $ \sum $, $ \int $, $ \lim $, $ \log $, $ \sin $, $ \cos $, $ \tan $

✔ Fractions:
$ \frac{a+b}{c} $

✔ Roots:
$ \sqrt{x+1} $

✔ Power:
$ x^2 $, $ x^{10} $

✔ Matrices:
$\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix} $

----------------------------------------------------
HTML RULES
----------------------------------------------------
Use ONLY inside "passage", "question", "explanation":

Allowed tags:
<p>, <b>, <i>, <u>, <br>, <sub>, <sup>, <table>, <tr>, <td>, <ul>, <li>, <span>

Do NOT break LaTeX inside HTML.

Example:
<p>The equation is $ \(x^2 + y^2 = 1\) $</p>

----------------------------------------------------
IMAGE / DIAGRAM RULE
----------------------------------------------------
If diagram exists or not:
always wmpty string


----------------------------------------------------
OUTPUT FORMAT
----------------------------------------------------

[
 {
   "id":"unique-random-id",
   "title":"Suitable title for question",
   "passage":"<p>Passage text here with formatting and LaTeX like \\(x^2+y^2=1\\)</p>",
   "question":"<p>Question text here with formatting and LaTeX like \\(x^2+y^2=1\\)</p>",
   "options":[
      "A. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>",
      "B. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>",
      "C. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>",
      "D. <span>Option text with formatting and LaTeX like \\(x^2+y^2=1\\)</span>"
   ],
   "answer":"A Or B Or C Or D if objective else the given answer in subjective",
   "explanation":"<p>Explanation text if visible otherwise empty string</p>",
   "type":"objective or subjective",
   "difficulty": "easy or medium or hard",
   "tags": ["tag1", "tag2", "tag3"]
 }
]

Passage Rules
-A passage exists ONLY IF the word "PASSAGE" appears in the image text.
- If passage exists, include it in the "passage" field with proper formatting and LaTeX.
- otherwise keep passage field empty string
-If the passage contains bullet points, numbered points, or list-style content:
   DO NOT convert into paragraph
   PRESERVE as list exactly using HTML <ul><li> structure
- Always add this css --> class="list-disc pl-5" inside the <ul> tag for proper formatting in frontend

 Questions
- Keep full question clean and structured
- Do NOT merge passage and question
- Preserve numbering if present

---

 Options
- Must always be array
- Prefix with A, B, C, D exactly as shown
- if latex is there , wrap it inside $ $


----------------------------------------------------
QUESTION HANDLING RULES
----------------------------------------------------
- If multiple questions exist → split into multiple JSON objects
- If passage is shared → repeat it in each object
- If no options → type = subjective
- If options exist → type = objective

----------------------------------------------------
LATEX QUALITY RULE
----------------------------------------------------
Ensure:
-every latex have one tab space in the starting and ending
-If any math/latex expression is not wrapped in $ $, the response is INVALID and must be corrected before output.
-No latex should be there which is not wrapped inside $ $
- No broken braces
- No missing backslashes
- No plain text math like sqrt(x) or frac(a,b)
- Everything must be valid LaTeX syntax .

`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${base64Image}`
                            }
                        },
                        {
                            type: 'text',
                            text: 'Extract text and make sure mathematical exprassions remain intact and return structured JSON.'
                        }
                    ]
                }
            ],
            max_tokens: 10000,
            store: true
        });

        // Clean up uploaded file
        fs.unlinkSync(imagePath);
        console.log('json data', JSON.parse(result.choices[0].message.content))

        const data = sanitizeQuestionObject(JSON.parse(result.choices[0].message.content))
        res.json(data)
        // res.json(JSON.parse(result.choices[0].message.content)
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to process image.' });
    }
});
app.post('/extractTextWithoutAi', UploadImages.single('file'), async (req, res) => {
    console.log('without ai working')
    const imagePath = path.join(__dirname, '..', '..', 'images', req.file.filename);
    const imageBuffer = fs.readFileSync(imagePath);
    // const base64Image = imageBuffer.toString('base64');
    const data = await extractTextFromImages([imagePath], res)
    return res.json(data[0])
});


function isMathExpression(str) {
    if (!str) return false;

    const s = str.trim();

    // Must contain at least ONE strong math indicator
    const hasMathStructure =
        /\\frac|\\sqrt|\\sum|\\int|\\lim|\\left|\\right/.test(s) ||
        /[a-zA-Z]\s*\^\s*[\w{]/.test(s) ||
        /[a-zA-Z]+\s*=\s*[a-zA-Z0-9\\]/.test(s) ||
        /\d\s*[+\-*/^]\s*\d/.test(s);

    // MUST NOT be a full sentence (important fix)
    const looksLikeSentence =
        s.length > 40 &&
        /[.?!]/.test(s) &&
        /[a-zA-Z]{4,}/.test(s);

    return hasMathStructure && !looksLikeSentence;
}


// ===============================
// 2. EXTRACT INLINE MATH ONLY (NO FULL TEXT WRAP)
// ===============================
function wrapMathInText(text) {
    if (!text) return text;

    // already clean multiple spaces
    text = text.replace(/\s+/g, " ");

    // STEP 1: protect existing math
    const mathBlocks = [];

    text = text.replace(/\$([^$]+)\$/g, (m, g) => {
        const key = `__MATH_${mathBlocks.length}__`;
        mathBlocks.push(g);
        return key;
    });

    // STEP 2: wrap ONLY real math fragments
    const candidates = [
        /\\frac\{[^}]+\}\{[^}]+\}/g,
        /\\sqrt\{[^}]+\}/g,
        /[a-zA-Z]\s*\^\s*[0-9a-zA-Z{}]+/g,
        /[a-zA-Z]+\s*=\s*[^\s,.)]+/g
    ];

    candidates.forEach((regex) => {
        text = text.replace(regex, (match) => {
            if (isMathExpression(match)) {
                return `__MATH_${mathBlocks.push(match) - 1}__`;
            }
            return match;
        });
    });

    // STEP 3: restore math with SINGLE WRAPPING ONLY
    mathBlocks.forEach((content, i) => {
        text = text.replace(`__MATH_${i}__`, ` $${content.trim()}$ `);
    });

    return text;
}


// ===============================
// 3. HTML SAFE WRAPPER
// ===============================
function formatMathText(input) {
    if (!input) return input;

    return input
        .split(/(<[^>]+>)/g)
        .map(part => {
            if (part.startsWith("<")) return part;
            return wrapMathInText(part);
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim();
}


// ===============================
// 4. OBJECT SANITIZER
// ===============================
function sanitizeQuestionObject(obj) {
    return {
        ...obj,
        passage: formatMathText(obj.passage || ""),
        question: formatMathText(obj.question || ""),
        explanation: formatMathText(obj.explanation || ""),
        options: (obj.options || []).map(opt => formatMathText(opt)),
    };
}




app.post("/uploadImagePdf", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const pdfFilePath = path.join(__dirname, '..', '..', 'QAUploads', req.file.filename);
    const outputFolder = path.resolve(__dirname, '..', '..', 'output_images');
    processPDF(pdfFilePath, outputFolder, res, req.file);

});


async function processPDF(pdfPath, outputFolder, res) {
    try {
        const imagePaths = await convertPDFToImages(pdfPath, outputFolder);
        const questions = await extractTextFromImages(imagePaths);
        console.log('Extracted Questions Array:', JSON.stringify(questions));
        return res.status(200).json(questions);
    } catch (error) {
        console.error('Error:', error);
    }
}


async function convertPDFToImages(pdfPath, outputFolder) {
    let imagesArray = [];
    const pngPages = await pdfToPng(pdfPath, {
        disableFontFace: false, // When `false`, fonts will be rendered using a built-in font renderer that constructs the glyphs with primitive path commands. Default value is true.
        useSystemFonts: false, // When `true`, fonts that aren't embedded in the PDF document will fallback to a system font. Default value is false.
        enableXfa: false, // Render Xfa forms if any. Default value is false.
        viewportScale: 2.0, // The desired scale of PNG viewport. Default value is 1.0 which means to display page on the existing canvas with 100% scale.
        outputFolder: outputFolder, // Folder to write output PNG files. If not specified, PNG output will be available only as a Buffer content, without saving to a file.
        outputFileMaskFunc: (pageNumber) => `page_${Math.random() * 1000000000000000000}.png`, // Output filename mask function. Example: (pageNumber) => `page_${pageNumber}.png`
        // pdfFilePassword: 'pa$$word', // Password for encrypted PDF.
        // pagesToProcess: [1, 3, 11], // Subset of pages to convert (first page = 1), other pages will be skipped if specified.
        strictPagesToProcess: false, // When `true`, will throw an error if specified page number in pagesToProcess is invalid, otherwise will skip invalid page. Default value is false.
        verbosityLevel: 0, // Verbosity level. ERRORS: 0, WARNINGS: 1, INFOS: 5. Default value is 0.
    });
    pngPages.map((page, index) => imagesArray.push(`${outputFolder}/${page.name}`))
    return imagesArray;

}

async function preprocessImage(imagePath) {
    const processedImagePath = imagePath.replace('.png', '_processed.png');

    await sharp(imagePath)
        .grayscale()
        .normalize()
        .resize(2400, 3600, {
            fit: 'inside',
        })
        .threshold(0)
        .sharpen({ sigma: 5 })
        .toFile(processedImagePath);

    return processedImagePath;
}

async function extractTextFromImages(imagePaths) {
    let completeText = ""
    for (const imagePath of imagePaths) {
        const preprocessedPath = await preprocessImage(imagePath);

        const { data: { text } } = await Tesseract.recognize(preprocessedPath, 'eng', {
            oem: 2,
            psm: 5,
            tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-=()[]{}.,/^*√∑∫π",
            logger: m => console.log(m)
        });
        completeText = completeText + ` ${text}`

    }
    let finalMCQ = parseQuestions(completeText);

    return finalMCQ;
}

const extractQuestions = (text) => {
    const questions = [];
    const passages = text.split(/\bPassage\b/);

    passages.forEach((section, index) => {
        let passageText = "";
        let content = section;

        if (index > 0) {
            const parts = section.split(/\bQuestion\b/, 2);
            if (parts.length < 2) return;
            passageText = parts[0].trim();
            content = "Question" + parts[1];
        }

        const questionParts = content.split(/\bQuestion\b/, 2);
        if (questionParts.length < 2) return;

        const questionTextParts = questionParts[1].split(/\bOptions\b/, 2);
        if (questionTextParts.length < 2) return;

        const questionText = questionTextParts[0].trim();
        const optionsParts = questionTextParts[1].split(/\bAnswer\b/, 2);

        const optionsText = optionsParts[0].trim();
        let options = optionsText.split('\n').map(opt => opt.trim()).filter(opt => opt);

        // Ensure only the first 4 options are taken
        const optionLabels = ["A.", "B.", "C.", "D."];
        options = options.map((opt, index) => {
            return optionLabels[index] + " " + opt.replace(/^\(\w\)\s*/, "").trim();
        });
        options = options.slice(0, 4);
        options = options.slice(0, 4);
        if (options.length !== 4) return;

        const answerParts = optionsParts.length > 1 ? optionsParts[1].split(/\bExplanation\b/, 2) : [];
        const answerText = answerParts.length > 0 ? answerParts[0].trim() : '';
        const explanationText = answerParts.length > 1 ? answerParts[1].trim() : '';

        questions.push({
            id: Math.floor(1000 + Math.random() * 9000),
            title: 'no title',
            passage: passageText,
            question: questionText,
            options: options,
            answer: answerText,
            tags: ["Literature", "Articles", "Tenses"],
            difficulty: 'easy',
            type: 'objective',
            explanation: explanationText,
            diagram: ""
        });
    });

    return questions;
};


const extractQuestionsMaths = (text) => {
    const questions = [];

    // Split text into individual questions using 'Question' keyword
    const questionSections = text.split(/\bQuestion\b/).filter(section => section.trim() !== "");

    questionSections.forEach((section) => {
        section = section.trim();

        // Find "Options" keyword and extract question + options
        const optionsIndex = section.indexOf("Options");
        if (optionsIndex === -1) return; // Skip if "Options" is missing

        const questionText = section.substring(0, optionsIndex).trim();
        let optionsText = section.substring(optionsIndex + 7).trim(); // 7 accounts for "Options"

        // Remove unwanted symbols (®, ©, etc.)
        // optionsText = optionsText.replace(/[^\w\s\(\)\-\≤\≥\=]/g, "").trim();

        // Split options by newlines, remove empty items, and trim whitespace
        let options = optionsText.split(/[\n\r]+/).map(opt => opt.trim()).filter(opt => opt);

        // Auto-fix missing option labels if necessary
        const optionLabels = ["A.", "B.", "C.", "D."];
        options = options.map((opt, index) => {
            return optionLabels[index] + " " + opt.replace(/^\(\w\)\s*/, "").trim();
        });
        options = options.slice(0, 4);

        // Ensure exactly 4 options (fill missing ones with empty strings)
        while (options.length < 4) {
            options.push(optionLabels[options.length] + " ");
        }

        questions.push({
            id: Math.floor(1000 + Math.random() * 9000),
            passage: "", // No passage in this case
            question: questionText,
            options: options,
            tags: ["quadratic", "radical", "geometry"],
            difficulty: 'easy',
            type: 'objective',
            answer: "", // No answer provided
            explanation: "", // No explanation provided
            diagram: ''
        });
    });

    return questions;
};

const getAiGeneratedJson = async (text) => {
    let jsonData;
    if (!text.includes('Passage')) {
        console.log(text, "from inside maths block")
        jsonData = extractQuestionsMaths(text)
        console.log(jsonData)
        return jsonData;

    }
    else {
        jsonData = extractQuestions(text)
        console.log(jsonData)
        return jsonData
    }
}

async function parseQuestions(text) {
    const McqData = await getAiGeneratedJson(text);
    return McqData
}




app.post('/uploadQAPdf', upload.single('file'), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const pdfFilePath = path.join(__dirname, '..', '..', 'QAUploads', req.file.filename);
    console.log(pdfFilePath)
    const data = [
        {
            "_id": "683864b7d91ad44301a3283a",
            "id": "4nf8kx0zv2",
            "adminId": "682a069dabdf121fa26d3e68",
            "title": "Solving a linear equation for x",
            "tags": ["algebra", "linear equations", "Heart of Algebra"],
            "passage": "",
            "question": "What value of $x$ is the solution to the given equation?\n\n$13x = 42 - x$",
            "explanation": "To solve $13x = 42 - x$, add $x$ to both sides: $$13x + x = 42$$ $$14x = 42$$ Divide both sides by $14$: $$x = 3$$",
            "answer": "D",
            "options": ["A. $100$", "B. $2$", "C. $3$", "D. $4$"],
            "difficulty": "easy",
            "type": "subjective",
            "diagram": ""
        },
        {
            "_id": "68386623d91ad44301a32843",
            "id": "a8f3k1z2q9",
            "adminId": "682a069dabdf121fa26d3e68",
            "title": "Savings Account Weekly Deposit Problem",
            "tags": ["Linear Equation word problem", "Heart of Algebra"],
            "passage": "",
            "question": "Javier deposits $45$ in a savings account at the end of each week. At the beginning of the 1st week of a year there was $700$ in that savings account. How much money, in dollars, will be in the account at the end of the 6th week of the year?",
            "explanation": "Javier starts with $700$. He deposits $45$ at the end of each week for 6 weeks. Total deposited: $45 × 6 = 270$. Therefore, the total amount is $700 + 270 = 970$.",
            "answer": "D",
            "options": ["A. 430", "B. 745", "C. 751", "D. 970"],
            "difficulty": "moderate",
            "type": "objective",
            "diagram": ""
        },
        {
            "_id": "6838b4bad91ad44301a32870",
            "id": "8hF7d5Kq2L",
            "adminId": "682a069dabdf121fa26d3e68",
            "title": "Population estimation 2 years after census",
            "tags": ["graphs", "population", "applied math"],
            "passage": "",
            "question": "In 2000, a census was taken to determine the population of a certain town. The graph gives the estimated population y, in thousands, x years after the 2000 census (0 ≤ x ≤ 5). Based on the graph, what is the closest population after 2 years?",
            "explanation": "From the graph, at x = 2, y ≈ 4.3 (thousand). So population ≈ 4,300.",
            "answer": "C",
            "options": ["A. 7,400", "B. 6,200", "C. 4,300", "D. 3,000"],
            "difficulty": "easy",
            "type": "objective",
            "diagram": "https://srv749425.hstgr.cloud:3008/images/mb9rot467gx6trf3gxx158yrs27lh5f9ck9gmk795.png"
        }

    ]
    return res.json(data)
    // handleExtractStart(pdfFilePath, res);
});


const handleExtractStart = async (file, res) => {
    try {
        const pdfPath = file;
        const dataBuffer = await fs.readFile(pdfPath);
        const pdfDoc = await PDFDocument.load(dataBuffer);
        const data = await pdf(dataBuffer);

        // Extract MCQs with math enhancement
        const extractedMCQs = await extractMCQs(data.text, pdfDoc);

        res.status(200).json(extractedMCQs);
    } catch (error) {
        console.error("Error processing PDF:", error);
        res.status(500).send("Error processing PDF");
    }
};

// Function to extract MCQs while preserving math formatting
async function extractMCQs(text, pdfDoc) {
    const mcqPattern = /(\d+\.\s+[\s\S]+?)(?=\n\d+\.\s|\n*$)/g;
    let mcqs = [];
    let match;

    while ((match = mcqPattern.exec(text)) !== null) {
        let questionBlock = match[1].trim();

        // Enhance the math formatting
        questionBlock = enhanceMathFormatting(questionBlock);

        const questionData = await processQuestionBlock(questionBlock, pdfDoc);
        mcqs.push(questionData);
    }

    return mcqs;
}

// Function to process individual MCQs and extract properly formatted math expressions

async function processQuestionBlockOld(block, pdfDoc) {
    const lines = block.split('\n' || '?').map(line => line.trim());
    let question = '';
    let passage = '';
    const options = [];
    let answer = '';
    let explanation = '';
    let explanationStart = false;
    let hasQuestionFinished = false;
    let passageStart = false;
    const optionPattern = /^[A-D]\.\s+/i;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        line = enhanceMathFormatting(line);
        if (line.startsWith('Answer:')) {
            // hasQuestionFinished = true;
            answer = line.split('Answer:')[1].trim();
        } else if (line.startsWith('Explanation:')) {
            explanationStart = true;
            // hasQuestionFinished = true;
            explanation += line.split('Explanation:')[1].trim() + ' ';
        } else if (explanationStart) {
            explanation += line + ' ';
        }
        else if (line.startsWith('A.')) {
            options.push(line);
        }
        else if (line.startsWith('B.')) {
            options.push(line);
        }
        else if (line.startsWith('C.')) {
            options.push(line);
        }
        else if (line.startsWith('D.')) {
            options.push(line);
        }
        else {
            if (!hasQuestionFinished) {
                question += line + ' ';
            }
        }
    }
    return {
        id: (Math.random() * 1000).toFixed(),
        passage: passage,
        question: question.trim(),
        options,
        answer,
        explanation: explanation.trim(),
        diagram: ''
    };
}


const extractQuestions2 = (text) => {
    const questions = [];
    const passages = text.split(/\bPassage\b/);

    passages.forEach((section, index) => {
        let passageText = "";
        let content = section;

        if (index > 0) {
            const parts = section.split(/\bQuestion\b/, 2);
            if (parts.length < 2) return;
            passageText = parts[0].trim();
            content = "Question" + parts[1];
        }

        const questionParts = content.split(/\bQuestion\b/, 2);
        if (questionParts.length < 2) return;

        const questionTextParts = questionParts[1].split(/\bOptions\b/, 2);
        if (questionTextParts.length < 2) return;

        const questionText = questionTextParts[0].trim();
        const optionsParts = questionTextParts[1].split(/\bAnswer\b/, 2);

        const optionsText = optionsParts[0].trim();
        let options = optionsText.split('\n').map(opt => opt.trim()).filter(opt => opt);

        // Ensure only the first 4 options are taken
        options = options.slice(0, 4);
        if (options.length !== 4) return;

        const answerParts = optionsParts.length > 1 ? optionsParts[1].split(/\bExplanation\b/, 2) : [];
        const answerText = answerParts.length > 0 ? answerParts[0].trim() : '';
        const explanationText = answerParts.length > 1 ? answerParts[1].trim() : '';

        questions.push({
            id: Math.floor(1000 + Math.random() * 9000),
            title: 'no title',
            passage: passageText,
            question: questionText,
            options: options,
            answer: answerText,
            explanation: explanationText,
            tags: [],
            difficulty: 'easy',
            type: 'objective',
            diagram: ""
        });
    });

    return questions[0];
};
const extractQuestionsMaths2 = (text) => {
    const questions = [];

    // Split text into individual questions using 'Question' keyword
    const questionSections = text.split(/\bQuestion\b/).filter(section => section.trim() !== "");

    questionSections.forEach((section) => {
        section = section.trim();

        // Find "Options" keyword and extract question + options
        const optionsIndex = section.indexOf("Options");
        if (optionsIndex === -1) return; // Skip if "Options" is missing

        const questionText = section.substring(0, optionsIndex).trim();
        let optionsText = section.substring(optionsIndex + 7).trim(); // 7 accounts for "Options"

        // Remove unwanted symbols (®, ©, etc.)
        optionsText = optionsText.replace(/[^\w\s\(\)\-\≤\≥\=]/g, "").trim();

        // Split options by newlines, remove empty items, and trim whitespace
        let options = optionsText.split(/[\n\r]+/).map(opt => opt.trim()).filter(opt => opt);

        // Auto-fix missing option labels if necessary
        const optionLabels = ["A.", "B.", "C.", "D."];
        options = options.map((opt, index) => {
            return optionLabels[index] + " " + opt.replace(/^\(\w\)\s*/, "").trim();
        });
        options = options.slice(0, 4);

        // Ensure exactly 4 options (fill missing ones with empty strings)
        while (options.length < 4) {
            options.push(optionLabels[options.length] + " ");
        }

        questions.push({
            id: Math.floor(1000 + Math.random() * 9000),
            passage: "", // No passage in this case
            question: questionText,
            options: options,
            answer: "", // No answer provided
            explanation: "" // No explanation provided
        });
    });

    return questions[0];
};

function processQuestionBlock(text, pdfDoc) {

    if (!text.includes('Passage')) {
        console.log(text, "from inside maths block")
        jsonData = extractQuestionsMaths2(text)
        console.log(jsonData)
        return jsonData;

    }
    else {
        jsonData = extractQuestions2(text)
        console.log(jsonData)
        return jsonData

    }
}



const enhanceMathFormatting = (text) => {
    const superscriptMap = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
        'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
        'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
        'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
        'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ'
    };
    const toSuperscript = (match, base, exponent) => {
        return base + [...exponent].map(digit => superscriptMap[digit] || digit).join('');
    };
    const mathPatterns = [
        { regex: /푎/g, replacement: 'a' },
        { regex: /푏/g, replacement: 'b' },
        { regex: /푐/g, replacement: 'c' },
        { regex: /푑/g, replacement: 'd' },
        { regex: /푒/g, replacement: 'e' },
        { regex: /푓/g, replacement: 'f' },
        { regex: /푔/g, replacement: 'g' },
        { regex: /푕/g, replacement: 'h' },
        { regex: /푖/g, replacement: 'i' },
        { regex: /푗/g, replacement: 'j' },
        { regex: /푘/g, replacement: 'k' },
        { regex: /푙/g, replacement: 'l' },
        { regex: /푚/g, replacement: 'm' },
        { regex: /푛/g, replacement: 'n' },
        { regex: /푂/g, replacement: 'o' },
        { regex: /푝/g, replacement: 'p' },
        { regex: /푞/g, replacement: 'q' },
        { regex: /푟/g, replacement: 'r' },
        { regex: /푠/g, replacement: 's' },
        { regex: /푡/g, replacement: 't' },
        { regex: /푢/g, replacement: 'u' },
        { regex: /푣/g, replacement: 'v' },
        { regex: /푤/g, replacement: 'w' },
        { regex: /푥/g, replacement: 'x' },
        { regex: /푦/g, replacement: 'y' },
        { regex: /푧/g, replacement: 'z' },
        { regex: /퐀/g, replacement: 'A' },
        { regex: /퐁/g, replacement: 'B' },
        { regex: /퐂/g, replacement: 'C' },
        { regex: /퐃/g, replacement: 'D' },
        { regex: /퐄/g, replacement: 'E' },
        { regex: /퐅/g, replacement: 'F' },
        { regex: /퐆/g, replacement: 'G' },
        { regex: /퐇/g, replacement: 'H' },
        { regex: /퐈/g, replacement: 'I' },
        { regex: /퐉/g, replacement: 'J' },
        { regex: /퐊/g, replacement: 'K' },
        { regex: /퐋/g, replacement: 'L' },
        { regex: /퐌/g, replacement: 'M' },
        { regex: /퐍/g, replacement: 'N' },
        { regex: /퐎/g, replacement: 'O' },
        { regex: /퐏/g, replacement: 'P' },
        { regex: /퐐/g, replacement: 'Q' },
        { regex: /퐑/g, replacement: 'R' },
        { regex: /퐒/g, replacement: 'S' },
        { regex: /퐓/g, replacement: 'T' },
        { regex: /퐔/g, replacement: 'U' },
        { regex: /퐕/g, replacement: 'V' },
        { regex: /퐖/g, replacement: 'W' },
        { regex: /퐗/g, replacement: 'X' },
        { regex: /퐘/g, replacement: 'Y' },
        { regex: /퐙/g, replacement: 'Z' },
        { regex: /(\d+)\s*\/\s*(\d+)([a-zA-Z])/g, replacement: '$1/$2$3' },
        { regex: /(\d+)\s*\n?\s*\/\s*\n?\s*(\d+)/g, replacement: '$1/$2' },
        { regex: /(\d+)\s*\/\s*(\d+)/g, replacement: '$1/$2' },
        { regex: /(\d+[a-zA-Z]*)\s*\/\s*(\d+)/g, replacement: '$1/$2' },
        { regex: /x\s*=\s*(-?\d+)\s*\/\s*(\d+)\s*±\s*√(\d+)\s*\/\s*(\d+)/g, replacement: 'x = $1/$2 ± √$3/$4' },
        { regex: /(\d*[a-zA-Z])\s*\/\s*(\d+)\s*\+\s*(\d+)\s*\/\s*(\d*[a-zA-Z])\s*=\s*(\d*[a-zA-Z])/g, replacement: '$1/$2 + $3/$4 = $5' },
        { regex: /(\d+[a-zA-Z])\s*\/\s*(\d+)\s*\+\s*(\d+)\s*\/\s*(\d+[a-zA-Z])\s*=\s*(\d+[a-zA-Z])/g, replacement: '$1/$2 + $3/$4 = $5' },
        { regex: /sqrt\((.*?)\)/g, replacement: '√($1)' },
        { regex: /<=/g, replacement: '≤' },
        { regex: />=/g, replacement: '≥' },
        { regex: /!=/g, replacement: '≠' },
        { regex: /\bsum\((.*?)\)/g, replacement: '∑$1' },
        { regex: /\bintegral\((.*?)\)/g, replacement: '∫$1 dx' },
        { regex: /\bIntegral\((.*?)\)/g, replacement: '∫$1 dx' },
        { regex: /\+-/g, replacement: '±' },
        { regex: /(\d+)\s*\*\s*(\d+)/g, replacement: '$1 × $2' },
        { regex: /(\d+)\s*degrees/g, replacement: '$1°' },
        { regex: /([a-zA-Z])\s*\^\s*(\d+)/g, replacement: toSuperscript },
        { regex: /(\d+)\s*\^\s*(\d+)/g, replacement: toSuperscript },
        { regex: /((\d+))\s*\^\s*(\d+)/g, replacement: toSuperscript },
        { regex: /(\w+)\^(\w+)/g, replacement: toSuperscript },
        { regex: /푥\s*\^2/g, replacement: 'x²' }, // Fix x ^2 → x²
        { regex: /sqrt\((.*?)\)/g, replacement: '√($1)' }, // sqrt(x) → √(x)
        { regex: /\((.*?)\)\s*=\s*0/g, replacement: '($1) = 0' }, // Ensure quadratic equations are preserved
        { regex: /([a-zA-Z])\s*\^\s*(\d+)/g, replacement: '$1^$2' }, // Fix exponent notation
        { regex: /±\s*√\s*(\d+)/g, replacement: '± √$1' }, // Fix ± sqrt notation
        { regex: /(\d+)\s*\/\s*(\d+)/g, replacement: '$1/$2' }, // Fix fractions
        { regex: /([a-zA-Z])\s*\^\s*(\d+)/g, replacement: '$1$2'.sup() },
        { regex: /(\d+)\s*\^\s*(\d+)/g, replacement: '$1$2'.sup() },
        { regex: /sqrt\((.*?)\)/g, replacement: '√$1' },
        { regex: /√\s*\(?(\d+)\)?/g, replacement: '√$1' }, // Handles cases like √ (9)
        { regex: /(\d+)\s*\/\s*(\d+)/g, replacement: '$1/$2' }, // Properly format fractions
        { regex: /<=/g, replacement: '≤' },
        { regex: />=/g, replacement: '≥' },
        { regex: /!=/g, replacement: '≠' },
        { regex: /\balpha\b/gi, replacement: 'α' },
        { regex: /\bbeta\b/gi, replacement: 'β' },
        { regex: /\bgamma\b/gi, replacement: 'γ' },
        { regex: /\btheta\b/gi, replacement: 'θ' },
        { regex: /\blambda\b/gi, replacement: 'λ' },
        { regex: /\bpi\b/gi, replacement: 'π' },
        { regex: /\bomega\b/gi, replacement: 'ω' },
        { regex: /\bsum\((.*?)\)/g, replacement: '∑$1' },
        { regex: /\bintegral\((.*?)\)/g, replacement: '∫$1 dx' },
        { regex: /\+-/g, replacement: '±' },
        { regex: /\//g, replacement: '/' },
        { regex: /(\d+)\s*\*\s*(\d+)/g, replacement: '$1 × $2' },
        { regex: /(\d+)\s*degrees/g, replacement: '$1°' },
        { regex: /(\d+)\s*\*\s*(\d+)/g, replacement: '$1 × $2' },
        { regex: /(\d+)\s*degrees/g, replacement: '$1°' },
        // { regex: /(\d+)\s*\/\s*(\d+)/g, replacement: "<sup>$1</sup>&frasl;<sub>$2</sub>" },



    ];

    mathPatterns.forEach(({ regex, replacement }) => {
        text = text.replace(regex, replacement);
    });

    return text;
};


app.post('/uploadImages', UploadImages.single('file'), async (req, res, next) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }
    const pdfFilePath = path.join(__dirname, '..', '..', 'Images', req.file.filename);
    console.log(pdfFilePath);
    res.status(200).json(req.file.filename);
});


app.post('/saveTest', async (req, res, next) => {
    const testData = req.body;
    const newTest = await new Test(testData);
    newTest.save()
        .then(result => {
            res.json(result);
            console.log(result);
        })
        .catch(error => {
            console.log(error);
        })
});

app.post('/saveEditedTest', async (req, res, next) => {
    try {
        const testData = { ...req.body };
        const testId = testData._id;
        delete testData._id;

        if (!testId) {
            return res.status(400).json({ error: 'Missing test _id' });
        }

        const updatedTest = await Test.findByIdAndUpdate(
            testId,
            { $set: testData },
            { new: true, runValidators: true }
        );

        if (!updatedTest) {
            return res.status(404).json({ error: 'Test not found' });
        }

        res.json(updatedTest);
        console.log('Test updated:', updatedTest);

    } catch (error) {
        console.error('Error updating test:', error);
        res.status(500).json({ error: 'Failed to update test' });
    }
});


// app.post('/saveQuestion', async (req, res, next) => {
const mongoose = require('mongoose');
//     const data = req.body;
//     console.log('question data', data)
//     const newQuestion = new Question(data);
//     newQuestion.save()
//         .then(result => {
//             res.json(data);
//             console.log(result);
//         })
//         .catch(error => {
//             console.log(error);
//         })
// });

app.post('/saveQuestion', async (req, res, next) => {
    try {
        const data = req.body;

        // Update the id key to a new ObjectId
        data.id = new mongoose.Types.ObjectId();

        console.log("Updated question data:", data);

        const newQuestion = new Question(data);
        const result = await newQuestion.save();

        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});
app.post('/EditQuestion', async (req, res, next) => {
    const data = req.body;
    const updatedQuestion = await Question.findByIdAndUpdate(
        data._id,
        data,
        { new: true, runValidators: true, overwrite: true })
    updatedQuestion.save()
        .then(result => {
            res.json(data);
            console.log(result);
        })
        .catch(error => {
            console.log(error);
        })
});

app.post('/terminateQuestion', async (req, res, next) => {
    const data = req.body;
    Question.deleteOne({ _id: data._id })
        .then(result => {
            console.log(result);
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
});
app.get('/getAllQuestions/:adminId', async (req, res, next) => {
    Question.find({})
        .sort({ _id: -1 })
        .limit(250)
        .then(result => {
            console.log(result);
            return res.json(result);

        })
        .catch(error => {
            console.log(error);
        })
})
app.get('/superAdmin_getAllQuestions', async (req, res, next) => {
    Question.find({})
        .then(result => {
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})
app.get('/allTests', async (req, res, next) => {
    Test.find({})
        .then(result => {
            res.json(result);
        })
        .catch(error => {
            console.log(result);
        })
})

app.post('/assignTest', async (req, res, next) => {
    const data = req.body;
    const newTests = data.assignedTests;
    const userId = data.userId;

    const user = await User.findOne({ _id: userId });
    const prevTests = user.assignedTests;
    user.assignedTests = [...prevTests, ...newTests];
    user.save()
        .then(result => {
            console.log(result);
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})
app.get('/getTest/:testId', async (req, res, next) => {
    const testId = req.params.testId;
    Test.findOne({ _id: testId })
        .then(result => {
            res.json(result);
            console.log(result);
        })
        .catch(error => {
            console.log(error);
        })
})
app.get('/refreshUser/:id', async (req, res, next) => {
    const id = req.params.id;
    User.findOne({ _id: id })
        .then(result => {
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})
app.post('/submitTest', async (req, res, next) => {
    try {
        const data = req.body;
        const user = await User.findOne({ _id: data.userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const assignedTests = user.assignedTests;
        const testIndex = assignedTests.findIndex((test) => test.testId === data.testId);
        if (testIndex === -1) {
            return res.status(404).json({ message: 'Test not found' });
        }
        user.assignedTests[testIndex].testStatus = 'Completed';
        user.assignedTests[testIndex].answers = data.answers;
        user.assignedTests[testIndex].startTime = data.startTime;
        user.assignedTests[testIndex].endTime = new Date();
        user.markModified('assignedTests');
        const result = await user.save();
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred', error });
    }
});

app.post('/changeStudentStatus', async (req, res, next) => {
    const data = req.body;
    const updatedStudent = await User.findByIdAndUpdate(
        data._id,
        { isApproved: !data.isApproved },
        { new: true, runValidators: true, overwrite: true })
    updatedStudent.save()
        .then(result => {
            res.json(data);
            console.log(result);
        })
        .catch(error => {
            console.log(error);
        })
})
app.post('/deleteStudent', async (req, res, next) => {
    const data = req.body
    User.deleteOne({ _id: data._id })
        .then(result => {
            console.log(result);
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})

app.get('/clear', async (req, res, next) => {
    User.deleteMany({})
        .then(result => {
            console.log(result);
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})
app.get('/clearTests', async (req, res, next) => {
    Test.deleteMany({})
        .then(result => {
            console.log(result);
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})
app.get('/clearQ', async (req, res, next) => {
    Question.deleteMany({})
        .then(result => {
            console.log(result);
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})

app.get('/getUsers', async (req, res, next) => {
    User.find({})
        .then(result => {
            res.json(result);
        })
        .catch(error => {
            console.log(error);
        })
})

module.exports = app;



// function processValidBlock(block, qIndex) {
//     const rowNumber = qIndex.toString().padStart(3, "0");
//     const qNumMatch = block.substring(0, 300).match(
//         /^\s*(?:#{1,6}\s*)?(?:(?:Question|Passage)\s*(\d{1,3})?|(\d{1,3})[\.\)\-:])/im
//     );

//     const displayNum =
//         qNumMatch?.[1] ||
//         qNumMatch?.[2] ||
//         qIndex;

//     const hasPassage = /^\s*(?:#{1,6}\s*)?Passage\b/im.test(block);

//     const topicMatch = block.match(
//         /^[ \t]*(?:#{1,6}\s*)?([A-Z][^.!?\n]{5,80}\s*-\s*[A-Z][^.!?\n]{3,140})/m
//     );

//     const detectedTopic = topicMatch ? topicMatch[1].trim() : "";

//     const type =
//         /\bA[\)\.]\s|\bB[\)\.]\s|\bC[\)\.]\s|\bD[\)\.]\s/.test(block)
//             ? "MultipleChoice"
//             : "ShortAnswer";

//     let correctAnswer = "";

//     if (type === "MultipleChoice") {
//         const ansMatch = block.match(/Answer:\s*([A-D])/i);
//         correctAnswer = ansMatch ? ansMatch[1].toUpperCase() : "A";
//     } else {
//         const sprMatch =
//             block.match(/response:\s*([\-\d\.\/]+)/i) ||
//             block.match(/Correct\s*\n?\s*response:\s*([\-\d\.\/]+)/i) ||
//             block.match(/Answer:\s*([\-\d\.\/]+)/i);

//         correctAnswer = sprMatch ? sprMatch[1] : "";
//     }

//     let passage = "";

//     if (hasPassage) {
//         const passageMatch = block.match(
//             /^\s*(?:#{1,6}\s*)?Passage\s*\d*\s*([\s\S]*?)(?=(?:Question|Passage|\d{1,3}[\.\)])\s|$)/im
//         );

//         passage = passageMatch ? passageMatch[1].trim() : "";
//     }

//     let questionText = block
//         .replace(
//             /^\s*(?:#{1,6}\s*)?(?:Question|Passage)?\s*\d*\s*[\.\)\-:]*/gim,
//             ""
//         )
//         .replace(
//             /^[ \t]*(?:#{1,6}\s*)?[A-Z][^.!?\n]{5,80}\s*-\s*[A-Z][^.!?\n]{3,140}/gm,
//             ""
//         )
//         .trim();
//     return {
//         rowNumber,
//         displayNum,
//         topic: detectedTopic,
//         type,
//         passage,
//         question: questionText,
//         correctAnswer
//     };
// }
