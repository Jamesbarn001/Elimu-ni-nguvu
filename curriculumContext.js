// curriculumContext.js — KICD CBE Curriculum Knowledge Base
// Grades 6–9 | Subjects: Mathematics, English, Kiswahili, Science & Technology, Social Studies
// Each entry: ~400-500 words of strands, sub-strands, key concepts, and Kenyan-specific misconceptions.
// This file is the STATIC part of every system prompt — cache it aggressively.

const CURRICULUM = {

  // ══════════════════════════════════════════════════════════════
  // MATHEMATICS
  // ══════════════════════════════════════════════════════════════
  Mathematics: {
    6: `KICD CBE GRADE 6 MATHEMATICS
STRAND 1 — NUMBERS: Whole numbers to millions (place value, rounding to 10/100/1000). Multiplication & long division with remainders. Fractions — adding/subtracting with different denominators, mixed numbers, percentages. Decimals — read/write/order to ten-thousandths, round off, convert fractions↔decimals, four operations with decimals.
STRAND 2 — MEASUREMENT: Length (km/m/cm/mm conversions, perimeter). Area (rectangles, squares, irregular shapes; tiling/fencing real life). Capacity (litres/ml, cooking, water storage). Mass (kg/g/mg, market weighing). Time (12-hr/24-hr format, durations, calendars). Money (shilling denominations, profit/loss, simple interest, M-Pesa charges, school fees).
STRAND 3 — GEOMETRY: Lines (horizontal, vertical, parallel, perpendicular, transversal). Angles (acute, obtuse, right, reflex, straight — measure with protractor, find missing angles). 3-D Objects (cubes, cuboids, cylinders, pyramids, spheres — faces, edges, vertices; relate to boxes, balls, tins).
STRAND 4 — DATA HANDLING: Bar graphs (frequency tables, construct/interpret, draw conclusions). Pie charts (degrees in 360°, percentages, interpret sectors).
STRAND 5 — ALGEBRA: Inequalities using >, <, = symbols; solve and plot on number line.
KEY MISCONCEPTIONS: (1) Children confuse perimeter (length around) with area (space inside). (2) When adding fractions, they add numerators AND denominators separately (½ + ⅓ = 2/5). (3) Decimals with more digits feel "bigger" (0.75 > 0.8 seems true to them). (4) They think "profit" means total money received, not money gained above cost.`,

    7: `KICD CBE GRADE 7 MATHEMATICS
STRAND 1 — NUMBERS: Natural numbers & integers — BODMAS/BEDMAS order of operations, directed numbers (negative/positive on a number line). Factors & multiples — LCM and HCF using prime factorisation. Fractions, ratios & proportions — operations on fractions, sharing in given ratios, direct and inverse proportion. Squares & square roots — perfect squares to 30², estimation, tables. Percentages — calculate, express as %, percentage increase/decrease.
STRAND 2 — MEASUREMENT: Area of triangles, parallelograms, composite shapes. Volume & capacity (cuboids, cm³↔litres↔ml). Surface area of cuboids and cylinders.
STRAND 3 — GEOMETRY: Angles — at a point (360°), on a straight line (180°), vertically opposite. Triangle properties (equilateral, isosceles, scalene, right-angled; angles sum to 180°). Quadrilateral properties. Circles — radius, diameter, chord, arc; circumference (C=πd or 2πr); area (A=πr²).
STRAND 4 — DATA HANDLING: Line graphs (draw, interpret, trends, predictions). Pie charts (construct from percentages). Statistics — mean, median, mode, range.
STRAND 5 — ALGEBRA: Simple linear equations (2x + 5 = 15). Substitution into formulas.
KEY MISCONCEPTIONS: (1) BODMAS — children do multiplication before division left-to-right, but treat them as strict order. (2) Negative numbers — subtracting a negative ("minus minus") confuses many. (3) Mean vs. median — children often confuse which is the "average". (4) Pie chart sectors — they guess angles instead of calculating (percentage × 360°).`,

    8: `KICD CBE GRADE 8 MATHEMATICS
STRAND 1 — NUMBERS: Integers (directed numbers), Fractions, Decimals. Squares and Square Roots using 4-figure mathematical tables. Rates, Ratios, Proportions (direct and inverse proportion), and Percentages (percentage increase/decrease, profit/loss).
STRAND 2 — MEASUREMENT: Financial Mathematics — Simple and Compound Interest, Hire Purchase, Currency Exchange Rates, Discounts, Commission, VAT. Pythagoras' Theorem — right-angled triangles, hypotenuse and leg calculations, real-life distance/height applications. Surface Area & Volume — prisms, cylinders, composite solids, capacity conversions.
STRAND 3 — GEOMETRY: Coordinates — plotting (x,y) on Cartesian plane, midpoints. Scale Drawing — map scales, bearings, real distances. Transformations — translation, reflection, rotation on coordinate grid.
STRAND 4 — DATA HANDLING: Data Presentation & Interpretation — frequency tables, bar graphs, pie charts. Basic Probability — theoretical and experimental probability of single events.
STRAND 5 — ALGEBRA: Linear Equations in One Unknown (variables on both sides). Linear Equations in Two Unknowns — forming and solving simultaneous linear equations using Substitution and Elimination methods.
KEY MISCONCEPTIONS: (1) Pythagoras — children apply a²+b²=c² without identifying which side is the hypotenuse. (2) Compound interest — they recalculate on original principal instead of new balance. (3) Simultaneous equations — adding equations when they should subtract to eliminate a variable. (4) Probability — confusing impossible (0) and certain (1) events.`,

    9: `KICD CBE GRADE 9 MATHEMATICS
STRAND 1 — NUMBERS: Cubes and Cube Roots (tables & prime factorisation). Indices & Laws of Indices (positive, zero, negative indices, scientific notation). Logarithms — common logarithms using 4-figure tables. Compound Proportions & Rates of Work.
STRAND 2 — MEASUREMENT: 3-D Measurement — surface area and volume of pyramids, cones, and spheres. Area of irregular polygons and composite shapes.
STRAND 3 — GEOMETRY: Trigonometry — Sine, Cosine, Tangent (SohCahToa), angles of elevation and depression, right-angled triangle applications. Coordinates & Straight Lines — gradient (m), y = mx + c, parallel and perpendicular lines. Similarity & Enlargement — scale factors, similar figures.
STRAND 4 — DATA HANDLING: Grouped Data — grouped frequency tables, mean, median, and mode for grouped data. Advanced Probability — tree diagrams, combined probability of independent events.
STRAND 5 — ALGEBRA: Matrices — intro to 2×2 matrices, matrix operations (addition, scalar/matrix multiplication), Determinant, Inverse of 2×2 matrix, solving equations using matrices. Linear Inequalities in Two Variables — graphing and shading regions on coordinate grid.
KEY MISCONCEPTIONS: (1) Trigonometry — applying SohCahToa without correctly labelling opposite and adjacent relative to target angle. (2) Matrices — multiplying corresponding elements instead of row-by-column dot product. (3) Gradient — calculating (x₂ - x₁)/(y₂ - y₁) instead of (y₂ - y₁)/(x₂ - x₁). (4) Logarithms — thinking log(a + b) = log(a) + log(b) instead of log(a × b).`,
  },

  // ══════════════════════════════════════════════════════════════
  // ENGLISH
  // ══════════════════════════════════════════════════════════════
  English: {
    6: `KICD CBE GRADE 6 ENGLISH
STRAND 1 — LISTENING & SPEAKING: Discuss familiar topics with clarity. Ask and answer questions. Express opinions. Deliver short oral presentations. Use appropriate stress, intonation, and pace.
STRAND 2 — READING: Read fluently with comprehension (fiction and non-fiction). Identify main ideas, supporting details, themes, and character motivation. Use context clues for unfamiliar words. Identify point of view. Read aloud with expression.
STRAND 3 — WRITING: Write compositions (narratives, descriptions, letters, reports). Use paragraphing, punctuation, and grammar accurately. Plan, draft, revise, and edit own writing. Write creatively using adjectives, adverbs, and varied sentence structures.
STRAND 4 — LANGUAGE USE (GRAMMAR): Parts of speech — nouns, pronouns, verbs, adjectives, adverbs, prepositions, conjunctions, interjections. Tenses — simple present, past, future; continuous and perfect forms. Punctuation — commas, apostrophes, quotation marks, colons. Direct and indirect speech.
KEY MISCONCEPTIONS: (1) Apostrophe confusion — used for plurals ("apple's") instead of possession or contraction. (2) Tense mixing — shifting between past and present in the same paragraph. (3) "Their/There/They're" and "its/it's" used interchangeably. (4) Run-on sentences — joining multiple ideas with "and...and...and" without punctuation.`,

    7: `KICD CBE GRADE 7 ENGLISH
STRAND 1 — LISTENING & SPEAKING: Debates and discussions. Giving and following instructions. Reporting information. Presenting arguments. Listening for specific details.
STRAND 2 — READING: Comprehension of longer and more complex texts. Inferencing and drawing conclusions. Comparing texts and points of view. Reading poetry — rhyme, rhythm, imagery, metaphor, simile. Newspapers, articles, advertisements (media literacy).
STRAND 3 — WRITING: Argumentative and persuasive writing. Formal and informal letters. Report writing. Summarising texts. Using evidence and examples to support points.
STRAND 4 — LANGUAGE USE: Complex sentence structures — subordinate clauses, relative clauses. Active and passive voice. Reported speech. Modal verbs (can, could, must, should, would). Prefixes and suffixes for vocabulary building.
KEY MISCONCEPTIONS: (1) Active vs passive voice — children often write passive incorrectly ("The ball was kicked by he" instead of "him"). (2) Argumentative writing — lists opinions without evidence or counter-arguments. (3) Formal letters — mixing formal and informal register. (4) Reported speech — forgetting to back-shift tenses ("He said he is coming" instead of "was coming").`,

    8: `KICD CBE GRADE 8 ENGLISH
STRAND 1 — LISTENING & SPEAKING: Oral literature — stories, proverbs, riddles, songs. Formal presentations and debates. Interpreting non-verbal cues. Group discussions with roles (chairperson, secretary).
STRAND 2 — READING: Literary texts — novels, plays, short stories, poems. Analysing literary devices (alliteration, personification, irony, symbolism). Critical reading of advertisements, editorials, and digital media. Research skills — skimming, scanning, note-taking.
STRAND 3 — WRITING: Essays — analytical, descriptive, narrative, expository. Review writing. Creative writing using figurative language. Research-based writing with citations.
STRAND 4 — LANGUAGE USE: Conditionals (zero, first, second). Participles and gerunds. Idiomatic expressions. Word formation. Punctuation of complex texts.
KEY MISCONCEPTIONS: (1) Conditional sentences — mixing "if + will" (should be "if + present, will + infinitive"). (2) Literary analysis — students retell the story instead of analysing themes and techniques. (3) Idioms taken literally. (4) Gerunds vs infinitives — "I enjoy to swim" instead of "I enjoy swimming."`,

    9: `KICD CBE GRADE 9 ENGLISH
STRAND 1 — LISTENING & SPEAKING: Oral presentations on academic topics. Negotiation and persuasion. Listening critically. Interpreting tone and bias in spoken language.
STRAND 2 — READING: Set texts — novels, drama (Shakespeare-level appreciation), poetry anthologies. Intertextuality. Critical reading of diverse global and Kenyan literature. Research for academic writing.
STRAND 3 — WRITING: Extended analytical essays. Formal reports and proposals. Investigative journalism-style writing. Revision, editing for style, register, and coherence.
STRAND 4 — LANGUAGE USE: Advanced grammar — subjunctive, complex conditionals, ellipsis, cleft sentences. Rhetoric — ethos, pathos, logos. Style and register differentiation. Preparing for national exams (KCSE-style comprehension and composition).
KEY MISCONCEPTIONS: (1) Subjunctive — "If I was you" instead of "If I were you." (2) Essay structure — students write "I think" and "In my opinion" too frequently in formal essays. (3) Thesis statements — too broad or too vague. (4) Quoting text — block quotes used without integration or analysis.`,
  },

  // ══════════════════════════════════════════════════════════════
  // KISWAHILI
  // ══════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════
  // KISWAHILI (Gredi 6: Kiswahili | Gredi 7-9: Kiswahili / Fasihi)
  // ══════════════════════════════════════════════════════════════
  Kiswahili: {
    6: `KICD CBE DARASA LA 6 KISWAHILI (Upper Primary)
MADA KUU 1 — KUSIKILIZA NA KUZUNGUMZA: Matamshi bora na ulinganuzi wa sauti tatanishi (/ch/ na /sh/, /r/ na /l/, /dh/ na /th/, /ng'/ na /ng/). Maamkuzi na adabu za mazungumzo (heshima kwa wakubwa na rika). Semi na tungo fupi — vitendawili, mafumbo, nahau na methali za kimsingi.
MADA KUU 2 — KUSOMA: Kusoma kwa ufahamu (hadithi, makala ya kuelimisha, matini za kidijitali). Kusoma kwa kina na mapana (hadithi fupi za watoto). Kutambua wazo kuu, maudhui, na mafunzo ya kimaadili.
MADA KUU 3 — KUANDIKA: Mwandiko nadhifu na tahajia sahihi. Uakifishaji (nukta, mkato/koma, alama ya kuuliza, alama ya hisi, herufi kubwa). Insha za kubuni — insha za masimulizi (narratives), insha za maelezo, na insha za wasifu. Barua za kirafiki (mialiko, shukrani) na barua rasmi za kuomba ruhusa.
MADA KUU 4 — SARUFI: Aina za maneno (Nomino, Vivumishi, Viwakilishi, Vitenzi, Vielezi). Ngeli za Nomino na Upatanisho wa Kisarufi (A-WA, KI-VI, LI-YA, U-I, I-ZI, YA-YA, U-U, I-I, PA-KU-MU). Nyakati na Hali — uliopo (-na-), uliopita (-li-), ujao (-ta-), timilifu (-me-), na masharti (-ki-, -nge-, -ngali-). Mnyambuliko wa vitenzi — kauli za kutenda, kutendwa, kutendea, kutendeka, kutendesha, kutendana. Ukanushaji wa nyakati na kauli.
MAKOSA YA KAWAIDA: (1) Upatanisho wa ngeli — watoto huweka wanyama na wadudu katika ngeli ya I-ZI badala ya A-WA ("mbuzi hii" badala ya "mbuzi huyu"). (2) Tahajia — kuchanganya /r/ na /l/ (chakura badala ya chakula) na /ch/ na /sh/ (chule badala ya shule). (3) Kushikanisha maneno visivyo ("kwasababu" badala ya "kwa sababu"). (4) Ukanushaji — kurudia viambishi ("sikukula" badala ya "sikula").`,

    7: `KICD CBE GREDI YA 7 KISWAHILI (Junior Secondary School)
MADA KUU 1 — KUSIKILIZA NA KUZUNGUMZA: Fonetiki — ulinganuzi wa fonimu na sauti ghuna/sighuna. Fasihi Simulizi — nyimbo za watoto, bembelezi, ngano za wanyama (hurafa) na hekaya za ujanja. Mahojiano na kutoa ripoti za mdomo.
MADA KUU 2 — KUSOMA: Kusoma kwa ufahamu matini za taarifa na makala za kimaadili. Fasihi Andishi (Novela/Riwaya Fupi k.m. Mshale wa Matumaini) — uchambuzi wa wahusika, sifa zao, dhamira, maudhui, ploti/mtiririko, na mbinu za lugha (tashbihi, sitiari, chuku, nahau).
MADA KUU 3 — KUANDIKA: Insha za masimulizi changamano na insha za maelekezo. Uandishi wa kijamii na kidijitali — barua pepe (e-mails), kadi za mialiko, na matangazo madogo.
MADA KUU 4 — SARUFI: Aina za Nomino — pekee, kawaida, makundi, dhahania, jumla/wingi, na vitenzi-jina. Ngeli na Upatanisho (A-WA, U-I, KI-VI, LI-YA, U-ZI, I-ZI). Vitenzi Vikuu (T), Visaidizi (Ts), na Vishirikishi (t - kamilifu na vipungufu: 'ni', 'si', 'kuwa'). Hali ya mazoea (hu-) na hali ya kuendelea (-ki-). Usemi Halisi na Usemi wa Taarifa (misingi ya ubadilishaji wa nafsi, viakifishi, na viashiria). Vihusishi na Viunganishi.
MAKOSA YA KAWAIDA: (1) Hali ya kutendwa — kusahau viambishi vya wakati katika kauli ya kutendwa. (2) Kuchanganya Kiswahili sanifu na Sheng au lahaja za kienyeji. (3) Methali — kutafsiri maana ya moja kwa moja ya maneno badala ya fumbo na mafunzo. (4) Usemi wa taarifa — kusahau kuondoa alama za nukuu au kutobadili nafsi.`,

    8: `KICD CBE GREDI YA 8 KISWAHILI (Junior Secondary School)
MADA KUU 1 — KUSIKILIZA NA KUZUNGUMZA: Fasihi Simulizi — Visasili (asili ya mambo/milima), Mighani ya mashujaa wa Kenya (Luanda Magere, Mekatilili wa Menza, Koitalel Arap Samoei, Fumo Liyongo), Tarihi na Visakale. Hotuba rasmi, midahalo (debates), na ufupisho wa mdomo.
MADA KUU 2 — KUSOMA: Ufahamu wa makala changamano na takwimu. Fasihi Andishi (Tamthilia k.m. Wema Hauozi) — uchambuzi wa mandhari, vitendo, maelekezo ya jukwaani (didascalia), migogoro ya wahusika, dayalojia na monolojia, majazi na jazanda.
MADA KUU 3 — KUANDIKA: Insha za Kazi (Functional Writing) — Kumbukumbu za Mikutano (Minutes), Ratiba, Ripoti rasmi fupi, na Wasifu binafsi (Curriculum Vitae). Insha za Methali na Insha za Mdokezo (zinazoanza au kumalizikia kwa maneno maalum). Uakifishaji — ritifaa, alama za nukuu, alama ya hisi, na mabano.
MADA KUU 4 — SARUFI: Viwakilishi na Vivumishi visisitizi; Vivumishi pekee (-enyewe, -enye, -ingine, -o-ote). Ukubwa na Udogo wa Nomino (ngeli ya LI-YA na KI-VI na viambishi ng-o, ji-, ki-, vi-). Muundo wa Sentensi — Sentensi Sahili na Sentensi Ambatano. Mnyambuliko wa Vitenzi — kutendewa, kutendeka, kutendesha, kutendeana, kutendatenda (marudio). Ngeli za Mahali (PA-KU-MU).
MAKOSA YA KAWAIDA: (1) Ukubwa na udogo — kuchanganya viambishi vya udogo na ukubwa. (2) Insha za methali — kusimulia hadithi isiyooana na funzo la methali. (3) Sentensi ambatano — kukosa viunganishi vifaavyo. (4) Upatanisho wa ngeli za mahali — "hapa kuna" badala ya "hapa pana."`,

    9: `KICD CBE GREDI YA 9 KISWAHILI (Junior Secondary School)
MADA KUU 1 — KUSIKILIZA NA KUZUNGUMZA: Fasihi Simulizi — Ushairi simulizi (Sifo/Tondozi, Nyimbo za kazi/Hodiya, Majigambo, Vichekesho). Uzungumzaji wa kitaaluma — kongamano, mahojiano ya kitaluma, na uchanganuzi wa toni/bias.
MADA KUU 2 — KUSOMA: Fasihi Andishi (Ushairi / Diwani) — kanuni za arudhi (vina vya ndani na nje, mizani, beti, mishororo: mwanzo, mloto, mleo, kituo/kibwagizo), bahari za ushairi (tarbia, tathlitha, mathnawi, sakarani), uhuru wa mshairi (inkisari, mazida, tabdila, kubadili mpangilio wa maneno). Hadithi Fupi — uchambuzi shirikishi wa maudhui na fani.
MADA KUU 3 — KUANDIKA: Insha Changamano za Kazi — Tahariri (Editorials), Hotuba rasmi za kitaifa, Barua kwa Mhariri, Mapitio ya Vitabu (Book Reviews). Insha za Hoja na Falsafa (Argumentative essays). Uakifishaji wa Juu — nukta pacha/koloni (:), nukta mkato/semikoloni (;).
MADA KUU 4 — SARUFI: Uchanganuzi wa Sentensi — Sentensi Sahili, Ambatano, na Changamano kwa kutumia jedwali, mistari, na mchoro wa matawi (Kiima [KN] na Kiarifu/Kiprediketi [KT]). Virai na Vishazi — KN, KT, KV, KE, KH; vishazi huru na tegemezi. Shamirisho na Chagizo — Shamirisho Kipozi/Yambwa Tendwa, Shamirisho Kitendewa/Yambwa Tendewa, Shamirisho Ala/Kitumizi, na Chagizo. Uundaji wa Maneno — utohozi, uambatanishaji, unyambulishaji. Hali mahususi na masharti changamano (-singe-, -singali-, -sipo-).
MAKOSA YA KAWAIDA: (1) Ushairi — kutofautisha bahari za ushairi kulingana na idadi ya mishororo au mpangilio wa vina. (2) Uchanganuzi wa sentensi — kutenganisha visivyo Kirai Nomino (KN) na Kirai Kitenzi (KT). (3) Shamirisho — kuchanganya yambwa tendwa na yambwa tendewa. (4) Insha za hoja — kutotoa hoja zenye mashiko au kuegemea upande mmoja bila kutambua upande pinzani.`,
  },

  // ══════════════════════════════════════════════════════════════
  // SCIENCE (Grade 6: Science & Technology | Grades 7-9: Integrated Science)
  // ══════════════════════════════════════════════════════════════
  'Science & Technology': {
    6: `KICD CBE GRADE 6 SCIENCE AND TECHNOLOGY (Upper Primary)
STRAND 1 — LIVING THINGS & THEIR ENVIRONMENT: Fungi — types (mushrooms, moulds, yeast), characteristics, uses and harmful effects. Invertebrates — classification (insects, arachnids, crustaceans, worms), body features, habitats. Human Circulatory System — the heart (chambers, valves), blood vessels (arteries, veins, capillaries), blood components, pulse rate.
STRAND 2 — MATTER: Change of State — melting, freezing, evaporation, condensation, sublimation; particle model explanation. Composition of Air — nitrogen (78%), oxygen (21%), carbon dioxide, water vapour, noble gases; experiments to show composition.
STRAND 3 — FORCE AND ENERGY: Light — sources (luminous/non-luminous), travels in straight lines, shadows, reflection (plane mirrors), refraction. Levers — first, second, third class levers; effort, load, fulcrum; examples (jembe, wheelbarrow, fishing rod). Slopes/Inclined Planes — reducing effort, real-life examples (ramps, staircases, roads on hills).
KEY MISCONCEPTIONS: (1) Seeds and eggs are not "living things" because they don't move — they are alive but dormant. (2) Boiling water is a chemical change — it is a physical change (reversible). (3) Air has no mass or weight — air has mass, shown by inflating a balloon. (4) Levers always make work easier — they change the direction or size of force, but total work stays the same.`,

    7: `KICD CBE GRADE 7 INTEGRATED SCIENCE (Junior Secondary School)
STRAND 1 — SCIENTIFIC INVESTIGATION: The scientific method — observation, hypothesis, experimentation, conclusion. Laboratory safety rules and first aid. Measurement — SI units (metres, kilograms, seconds), using rulers, beam balances, measuring cylinders. Scientific apparatus — Bunsen burner, test tubes, beakers, tripod stand.
STRAND 2 — MIXTURES, ELEMENTS & COMPOUNDS: Classification of matter — elements, compounds, mixtures. Types of mixtures — solutions, suspensions, colloids. Separation techniques — filtration, evaporation, distillation, chromatography, decanting, using a magnet. Solubility and saturated solutions.
STRAND 3 — LIVING THINGS & THEIR ENVIRONMENT: Human body systems — Digestive system (mouth to anus, enzymes, absorption in small intestine), Respiratory system (nasal cavity, trachea, bronchi, alveoli, gas exchange), Circulatory system (double circulation, heart structure).
STRAND 4 — FORCE AND ENERGY: Concepts of force — types (gravitational, magnetic, frictional, applied), effects of forces, measuring force (spring balance/Newton). Forms of energy — kinetic, potential, heat, light, sound, chemical, electrical. Energy transformations and conservation.
KEY MISCONCEPTIONS: (1) Atoms are visible under a school microscope — atoms are far too small. (2) All acids are dangerous — vinegar and citrus juice are safe, edible acids. (3) Heat and temperature are the same thing — heat is energy transferred, temperature is a measure of hotness. (4) Food is digested only in the stomach — digestion begins in the mouth and completes in the small intestine.`,

    8: `KICD CBE GRADE 8 INTEGRATED SCIENCE (Junior Secondary School)
STRAND 1 — SCIENTIFIC INVESTIGATION: Experimental design — identifying variables (independent, dependent, controlled). Data collection and recording. Drawing scientific diagrams and graphs. Writing lab reports.
STRAND 2 — MIXTURES, ELEMENTS & COMPOUNDS: The Periodic Table — groups, periods, metals vs non-metals, properties of common elements. Chemical reactions — reactants and products, word equations. Acids, Bases and Indicators — pH scale, litmus paper, universal indicator, neutralisation reactions. Rusting — conditions, prevention methods (painting, oiling, galvanising).
STRAND 3 — LIVING THINGS & THEIR ENVIRONMENT: Ecosystems — food chains, food webs, producers, consumers, decomposers. Energy flow — pyramids of numbers and biomass. Human impact on environment — deforestation (Mau Forest), water pollution (Lake Victoria, River Nairobi), soil erosion, conservation methods. Reproduction in plants — pollination, fertilisation, seed dispersal, germination.
STRAND 4 — FORCE AND ENERGY: Electricity — static electricity, current electricity, simple circuits (series and parallel), voltage, current, resistance, Ohm's Law basics. Magnetism — properties of magnets, magnetic fields, electromagnets, compass. Renewable vs non-renewable energy — solar panels in Kenya, wind farms at Lake Turkana, geothermal at Olkaria.
KEY MISCONCEPTIONS: (1) Current is "used up" by a bulb — current flows through the bulb; voltage drops, not current. (2) Removing one bulb in a parallel circuit breaks everything — only series circuits work that way. (3) Chemical formulas — subscript numbers confused with coefficients (2H₂O vs H₂O₂). (4) All bacteria are harmful — many bacteria are beneficial (gut bacteria, yoghurt fermentation).`,

    9: `KICD CBE GRADE 9 INTEGRATED SCIENCE (Junior Secondary School)
STRAND 1 — SCIENTIFIC INVESTIGATION: Advanced practical skills — designing experiments, controlling variables, analysing data, drawing conclusions. Preparing for KJSEA Paper 2 (Practical). Scientific ethics and integrity.
STRAND 2 — MIXTURES, ELEMENTS & COMPOUNDS: Organic chemistry basics — carbon compounds, hydrocarbons, fuels, plastics, environmental impact. Rates of reaction — effect of concentration, temperature, surface area, catalysts. Electrochemistry — electrolysis of water and brine, applications (electroplating, extraction of aluminium).
STRAND 3 — LIVING THINGS & THEIR ENVIRONMENT: Cell biology — cell structure (animal vs plant cells), organelles and their functions, cell division (mitosis basics). Nutrition — balanced diet (carbohydrates, proteins, fats, vitamins, minerals, water, fibre), deficiency diseases (kwashiorkor, marasmus, scurvy), local foods (ugali, sukuma wiki, omena, beans). Disease prevention — communicable vs non-communicable diseases, HIV/AIDS awareness, immunisation, hygiene and sanitation.
STRAND 4 — FORCE AND ENERGY: Waves — transverse and longitudinal waves, wavelength, frequency, amplitude, wave speed. Sound — production, transmission through media, echo, applications. Electromagnetic spectrum — radio, microwave, infrared, visible light, UV, X-ray, gamma. Basics of nuclear energy — atoms, radioactivity awareness.
KEY MISCONCEPTIONS: (1) GMOs are all harmful — many are rigorously tested and beneficial for food security. (2) Frequency and amplitude confusion — loudness ≠ pitch; amplitude = loudness, frequency = pitch. (3) Visible light is all electromagnetic radiation — X-rays, radio waves, microwaves are also EM. (4) Diseases are only caused by germs — non-communicable diseases (diabetes, cancer) have genetic/lifestyle causes.`,
  },

  // ══════════════════════════════════════════════════════════════
  // SOCIAL STUDIES
  // ══════════════════════════════════════════════════════════════
  'Social Studies': {
    6: `KICD CBE GRADE 6 SOCIAL STUDIES (Upper Primary)
STRAND 1 — MAP AND MAP READING: Map reading skills — the 8 points of a compass (N, NE, E, SE, S, SW, W, NW). Understanding map scale (representative fraction, statement scale, linear scale). Conventional map symbols and keys. Locating places using simple grid references. Drawing simple sketch maps of the school compound and local area.
STRAND 2 — PHYSICAL AND HUMAN ENVIRONMENT OF EASTERN AFRICA: Position and size of Eastern African countries (Kenya, Uganda, Tanzania, Rwanda, Burundi, South Sudan, Ethiopia, Somalia). Physical features — mountains (Mt. Kenya, Mt. Kilimanjaro, Mt. Elgon), rift valleys (Great Rift Valley, lakes: Victoria, Turkana, Tanganyika), rivers (Nile, Tana, Athi). Climate and vegetation zones of Kenya — tropical, arid/semi-arid, highland, coastal. Human activities — farming, fishing, pastoralism.
STRAND 3 — RESOURCES AND ECONOMIC ACTIVITIES: Natural resources of Eastern Africa — soil, forests, water, minerals (soda ash at Lake Magadi, fluorspar in Kerio Valley). Agriculture — tea and coffee in the Kenyan highlands, sugar cane in Western Kenya, horticultural farming (flowers for export). Tourism — wildlife (Maasai Mara, Amboseli, Tsavo), cultural tourism. Transport and communication networks.
STRAND 4 — HISTORY AND GOVERNMENT: Organization of traditional pre-colonial communities in Kenya — political, economic, and social structures (Kikuyu age-set system, Maasai age-grade system, Luo council of elders). Early resistance leaders — Mekatilili wa Menza, Koitalel Arap Samoei, Waiyaki wa Hinga. The coming of Europeans and the establishment of colonial rule.
STRAND 5 — CITIZENSHIP: Rights and responsibilities of Kenyan citizens. National values and principles (Article 10, Constitution of Kenya 2010) — patriotism, unity, democracy, rule of law, participation of the people. Symbols of national unity — flag, anthem, coat of arms, Nyayo monument.
KEY MISCONCEPTIONS: (1) "Weather" and "climate" are the same — weather is day-to-day conditions, climate is the long-term pattern over 30+ years. (2) The top of a map is always "up" — the top represents North by convention, not upward. (3) The Great Rift Valley is a canyon/gorge — it is a tectonic depression formed by faulting, not erosion. (4) Mekatilili wa Menza and Jomo Kenyatta are often confused by students — they resisted colonialism in different regions and eras.`,

    7: `KICD CBE GRADE 7 SOCIAL STUDIES (Junior Secondary School — Rationalized 2024)
STRAND 1 — SOCIAL STUDIES AND PERSONAL DEVELOPMENT: Self-exploration — identifying personal potential, strengths, and areas for growth. Social entrepreneurial opportunities — exploring community-based enterprises and innovation.
STRAND 2 — PEOPLE AND RELATIONSHIPS: Human origin — archaeological evidence from Koobi Fora (Lake Turkana), Olorgesailie, and Kariandusi; the Turkana Boy (Homo erectus) fossil. Early civilizations — Ancient Egypt (Nile Valley agriculture, pyramids), Mesopotamia. Slavery and servitude — Trans-Saharan slave trade, East African slave trade routes (Zanzibar, Kilwa), impact on communities. Developments in medium of trade — barter trade to currency. Diversity and interpersonal relationships — respecting cultural differences in Kenya's 44+ ethnic communities. Peaceful coexistence — conflict resolution and tolerance.
STRAND 3 — COMMUNITY SERVICE LEARNING (CSL): Identifying a local community problem — waste management, water access, tree planting. Designing and implementing a simple CSL intervention project.
STRAND 4 — NATURAL AND HISTORIC BUILT ENVIRONMENTS IN AFRICA: Sources and importance of historical information — oral traditions, artefacts, archives, museums (Nairobi National Museum). Historical development of agriculture — from hunting and gathering to subsistence and cash-crop farming. Maps and map work — measuring distances on maps, interpreting map symbols. Earth and the Solar System — planets, the sun, day/night cycle, seasons.
KEY MISCONCEPTIONS: (1) "Humans evolved from monkeys" — humans and modern apes share a common ancestor; they did not descend from each other. (2) Barter trade was abandoned because it was "bad" — it was replaced because it was inefficient for complex economies, not because it was wrong. (3) The solar system has a fixed number of "main" planets — Pluto was reclassified; the system has 8 major planets. (4) All historical sources are equally reliable — oral traditions can change over time; written and archaeological sources also have biases.`,

    8: `KICD CBE GRADE 8 SOCIAL STUDIES (Junior Secondary School — Rationalized 2024)
STRAND 1 — PEOPLE AND POPULATION: Swahili civilization — East African coast city-states (Mombasa, Malindi, Lamu, Kilwa), Swahili culture as a blend of Bantu, Arab, and Persian influences. Population growth — factors affecting population distribution in Kenya and Africa (climate, relief, soils, economic activities). Migration — causes and effects of rural-urban migration in Kenya (Nairobi, Mombasa growth).
STRAND 2 — PEOPLE AND RELATIONSHIPS: Self-esteem and emotional intelligence — understanding and managing emotions. Resilience — coping with challenges in school and community. Socio-cultural diversity — appreciating Kenya's ethnic, religious, and linguistic diversity. Peaceful conflict resolution — mediation, negotiation, dialogue.
STRAND 3 — COMMUNITY SERVICE LEARNING (CSL): Planning, implementing, and evaluating CSL projects — documenting outcomes, presenting findings to the school community.
STRAND 4 — NATURAL AND HISTORIC BUILT ENVIRONMENTS: Map reading — marginal information on topographical maps, measuring distances using scale, interpreting relief/contour features (contour lines, spot heights, trigonometrical stations). Identifying landforms from contour patterns — hills, valleys, ridges, saddles, plateaus, escarpments. African historic sites and monuments — Fort Jesus (Mombasa), Thimlich Ohinga (Migori), Gedi Ruins (Kilifi), Lamu Old Town (UNESCO World Heritage Site).
STRAND 5 — GOVERNMENT AND CITIZENSHIP: Arms of the Kenyan Government — Executive (President, Cabinet), Legislature (National Assembly, Senate), Judiciary (Supreme Court, High Court, Magistrates Courts). Guiding principles of the Constitution of Kenya 2010. Leadership and integrity (Chapter Six). Human rights — the Children's Act 2022, rights of children in Kenya.
KEY MISCONCEPTIONS: (1) The Executive makes the laws — the Legislature makes laws; the Executive implements them. (2) Contour lines that are close together mean flat land — close contour lines indicate steep slopes; widely spaced contours show gentle slopes or flat areas. (3) The Swahili people are "Arab" — Swahili culture is a blend of Bantu African, Arab, and Persian traditions, rooted in East Africa. (4) Fort Jesus was built by Kenyans — it was built by the Portuguese in 1593 to guard the Old Port of Mombasa.`,

    9: `KICD CBE GRADE 9 SOCIAL STUDIES (Junior Secondary School — Rationalized 2024)
STRAND 1 — SOCIAL STUDIES AND CAREER DEVELOPMENT: Pathway choices — preparing for Senior School pathways (Arts & Sports Science, Social Sciences, STEM). Pre-career support systems — mentorship, career guidance, entrepreneurship awareness.
STRAND 2 — COMMUNITY SERVICE-LEARNING PROJECT (CSL): Advanced CSL — planning, implementation, evaluation, and presentation of a sustained community project. Documenting impact and reflection.
STRAND 3 — PEOPLE, POPULATION AND RELATIONSHIPS: Socio-economic practices of early humans — tools, shelter, food production. Indigenous knowledge systems in Kenya — traditional medicine, weather prediction, soil conservation (terracing by Konso, ridging by Kamba). Poverty reduction strategies — government initiatives (Hustler Fund, NHIF, school feeding programs), community self-help (harambee). Population structure — population pyramids, dependency ratio, demographic transition. Peaceful conflict resolution — role of community elders, courts, and international bodies. Healthy relationships — peer pressure, substance abuse awareness, responsible decision-making.
STRAND 4 — NATURAL AND HISTORIC BUILT ENVIRONMENTS: Topographical maps — advanced interpretation (cross-sections, intervisibility, gradient calculation). Internal land-forming processes — folding, faulting (Great Rift Valley formation), vulcanicity (Mt. Kenya, Mt. Longonot). Multi-purpose river projects in Africa — Seven Forks Dam project along the Tana River (Masinga, Kamburu, Gitaru, Kindaruma, Kiambere) — hydro-electric power, irrigation, flood control, fishing, recreation. Management and conservation of the environment — Mau Forest conservation, Lake Nakuru flamingo ecosystem. World Heritage Sites in Africa — Lamu Old Town, Mount Kenya, Lake Turkana National Parks.
STRAND 5 — POLITICAL DEVELOPMENTS AND GOVERNANCE: The Constitution of Kenya 2010 — structure, supremacy, and amendment process. Chapter 4: The Bill of Rights — fundamental rights and freedoms, limitations of rights. Civic engagement in governance — voter registration, public participation in budget-making, community policing. Cultural globalisation — effects on Kenyan traditions, music, language, and lifestyle.
KEY MISCONCEPTIONS: (1) Civic engagement means only voting — it also includes public participation in budgeting, community policing, and advocacy. (2) The Constitution cannot be changed — it can be amended through parliamentary process or referendum (Article 255-257). (3) The Great Rift Valley was formed by a river — it was formed by tectonic faulting. (4) Hydro-electric dams only produce electricity — multi-purpose dams like Seven Forks also provide irrigation, flood control, fishing, and recreation.`,
  },
};

module.exports = CURRICULUM;
